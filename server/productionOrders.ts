import { AdminApiError } from './adminUsers.js';
import { isDeepStrictEqual } from 'node:util';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  assertPOAccess,
  assertTransition,
  canManageProduction,
  canDraftProduction,
  commandPoIds,
  completedProduction,
  lineKey,
  linePoId,
  lineSnapshot,
  productionItemIds,
  validateProductionOrderDraft,
  type ProductionActor,
  type ProductionOrder,
  type ProductionPO,
  type CommandRecord
} from '../src/features/production/model/productionOrder.js';
import { getPOQueueUpdate, getPOQueueStatus } from '../src/features/sales/model/poWorkflow.js';
import { productionCatalogReader } from './productionCatalog.js';

export { requireActiveErpCaller as requireProductionCaller } from './erpCaller.js';

const MAX_POS_PER_ORDER = 20;
const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value))
    throw new AdminApiError(400, 'Mã bản ghi không hợp lệ.');
  return value;
};
const unique = (values: string[]) => [...new Set(values)];

/** PO IDs named by the lines of a create/save request; lines without a PO use the request's `poId`. */
function requestedPoIds(body: Record<string, unknown>) {
  const lines = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const ids = unique(
    lines.map(line => String((line && typeof line === 'object' && line.poId) || body.poId || '')).filter(Boolean)
  );
  if (!ids.length && body.poId) ids.push(String(body.poId));
  if (ids.length > MAX_POS_PER_ORDER) throw new AdminApiError(400, 'Một lệnh gồm tối đa 20 đơn hàng.');
  return ids.map(identifier);
}

async function readPOs(transaction: Transaction, firestore: Firestore, poIds: string[]) {
  const snapshots = await Promise.all(poIds.map(poId => transaction.get(firestore.collection('pos').doc(poId))));
  return snapshots.map((snapshot, index) => {
    if (!snapshot.exists) throw new AdminApiError(404, 'Không tìm thấy đơn hàng.');
    return { ...snapshot.data(), id: poIds[index] } as ProductionPO;
  });
}

/** Every order touching these POs: older orders by `poId`, multi-PO orders through `poIds`. */
async function readCommands(transaction: Transaction, firestore: Firestore, poIds: string[]) {
  const commands = firestore.collection('production_commands');
  const snapshots = await Promise.all(
    poIds.flatMap(poId => [
      transaction.get(commands.where('poId', '==', poId)),
      transaction.get(commands.where('poIds', 'array-contains', poId))
    ])
  );
  const byId = new Map<string, CommandRecord>();
  for (const snapshot of snapshots)
    for (const doc of snapshot.docs) byId.set(doc.id, { ...doc.data(), id: doc.id } as CommandRecord);
  return [...byId.values()];
}

/** Production orders draw lines from one or more POs of one customer; every PO write serializes allocations. */
export async function manageProductionOrder(actor: ProductionActor, body: Record<string, unknown>) {
  if (!canDraftProduction(actor)) throw new AdminApiError(403, 'Bạn không có quyền lập lệnh sản xuất.');
  const { firestore } = getFirebaseAdminServices();
  const action = String(body.action);
  if (action === 'catalog') return loadCatalog(firestore, actor, body);
  if (!canManageProduction(actor) && !['create', 'save', 'submit', 'request_materials'].includes(action))
    throw new AdminApiError(403, 'Kế toán chỉ được lập, sửa nháp và gửi duyệt LSX của mình.');
  const id = identifier(body.id);
  const drafting = action === 'create' || action === 'save';
  const commandRef = firestore.collection('production_commands').doc(id);
  const eventRef = firestore.collection('audit_events').doc();
  const now = new Date().toISOString();
  const businessDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return firestore.runTransaction(async transaction => {
    // All reads precede all writes. Never trust client quantities, labels, actors or snapshots.
    const targetSnapshot = await transaction.get(commandRef);
    const stored = targetSnapshot.exists ? ({ ...targetSnapshot.data(), id } as CommandRecord) : undefined;
    const linePoIds = drafting ? requestedPoIds(body) : commandPoIds(stored || {});
    if (!linePoIds.length) throw new AdminApiError(404, 'Lệnh không tồn tại hoặc thuộc luồng cũ.');
    // Editing may drop a PO from the order; that PO's plan flags are refreshed too.
    const touchedPoIds = unique([...linePoIds, ...(stored ? commandPoIds(stored) : [])]);
    const pos = await readPOs(transaction, firestore, touchedPoIds);
    const commands = await readCommands(transaction, firestore, touchedPoIds);
    const previous = commands.find(command => command.id === id) as ProductionOrder | undefined;
    if (previous && !canManageProduction(actor) && action !== 'request_materials' && previous.createdById !== actor.uid)
      throw new AdminApiError(403, 'Bạn chỉ được sửa/gửi duyệt LSX do mình lập.');
    const requestId = identifier(body.requestId);
    const linePOs = pos.filter(po => linePoIds.includes(po.id));
    for (const po of linePOs) assertPOAccess(actor, { ...po, status: 'waiting_production' });
    // Retrying an acknowledged mutation is a no-op, even after another status change.
    if (previous?.history?.some(entry => entry.note === `request:${requestId}`))
      return { success: true, id, revision: previous.revision };
    if (action === 'create' && stored)
      throw new AdminApiError(409, 'Mã yêu cầu đã tồn tại. Mở lại lệnh trước khi sửa.');
    if (action !== 'create' && (!previous || previous.productionOrderVersion !== 2))
      throw new AdminApiError(404, 'Lệnh không tồn tại hoặc thuộc luồng cũ.');
    if (action !== 'create' && previous!.revision !== body.expectedRevision)
      throw new AdminApiError(409, 'LSX vừa được cập nhật. Đóng và mở lại để lấy dữ liệu mới.');
    // Read access is checked even when cancelling after the PO has advanced.
    const advancedAllowed = ['cancel', 'complete', 'start', 'return', 'request_materials'].includes(action);
    for (const po of linePOs) assertPOAccess(actor, advancedAllowed ? { ...po, status: 'waiting_production' } : po);
    if (action !== 'create') assertTransition(actor, previous!, action);
    const counterRef = firestore.collection('production_counters').doc(businessDate);
    const counter = action === 'create' ? await transaction.get(counterRef) : null;
    const sequence = Number(counter?.data()?.sequence || 0) + 1;
    const readers = new Map(linePOs.map(po => [po.id, productionCatalogReader(transaction, firestore, po)]));
    let next: ProductionOrder;
    if (drafting) {
      const fields = validateProductionOrderDraft(linePOs, commands, body, id);
      fields.lines = await Promise.all(fields.lines.map(line => readers.get(line.poId!)!.line(line)));
      const materialReader = readers.get(linePOs[0].id)!;
      fields.materials = await Promise.all(fields.materials.map(material => materialReader.material(material)));
      const orderPoIds = unique(fields.lines.map(line => line.poId!));
      const orderPOs = orderPoIds.map(poId => linePOs.find(po => po.id === poId)!);
      const firstPO = orderPOs[0];
      const customer = firstPO.customerId
        ? (await transaction.get(firestore.collection('customers').doc(identifier(firstPO.customerId)))).data()
        : undefined;
      const customerSnapshot =
        firstPO.customerSnapshot && typeof firstPO.customerSnapshot === 'object'
          ? (firstPO.customerSnapshot as Record<string, unknown>)
          : {};
      const poCodes = orderPOs.map(po => String(po.poCode || po.id));
      next = {
        ...(previous || {}),
        ...fields,
        id,
        productionOrderVersion: 2,
        revision: (previous?.revision || 0) + 1,
        lsxCode: previous?.lsxCode || `LSX-${businessDate.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`,
        poId: firstPO.id,
        poIds: orderPoIds,
        poCode: poCodes.join(', '),
        poCodes,
        customerId: String(firstPO.customerId || ''),
        customerName: String(firstPO.customerName || ''),
        machineName: '',
        operatorName: '',
        status: 'draft',
        inventoryPostingMode: 'actual_issue',
        customerCode: String(
          previous?.customerCode ||
            customerSnapshot.customerCode ||
            firstPO.customerCode ||
            customer?.customerCode ||
            ''
        ),
        createdAt: previous?.createdAt || now,
        createdById: previous?.createdById || actor.uid,
        createdBy: previous?.createdBy || actor.displayName,
        updatedAt: now,
        history: previous?.history || []
      };
    } else {
      next = structuredClone(previous!);
      next.revision += 1;
      next.updatedAt = now;
      if (action === 'submit') next.status = 'pending_approval';
      if (action === 'return') next.status = 'draft';
      if (action === 'release') {
        for (const po of linePOs)
          if (getPOQueueStatus(po) !== 'waiting_production')
            throw new AdminApiError(
              400,
              `Đơn hàng ${po.poCode || po.id} phải hoàn tất thiết kế / sẵn sàng sản xuất trước khi phát hành.`
            );
        validateProductionOrderDraft(linePOs, commands, releaseInput(next), id);
        for (const line of next.lines) {
          const po = linePOs.find(po => po.id === linePoId(line, next))!;
          const index = (po.items || []).findIndex(
            (item, index) => String(item.itemId || `legacy-line-${index + 1}`) === line.itemId
          );
          if (
            index < 0 ||
            lineSnapshot(po.items![index], index, line.quantity).sourceFingerprint !== line.sourceFingerprint
          )
            throw new AdminApiError(409, 'Thông tin đơn hàng đã thay đổi. Trả về nháp và lưu lại trước khi phát hành.');
          const current = await readers.get(po.id)!.line(line);
          if (!isDeepStrictEqual(current.catalog || null, line.catalog || null))
            throw new AdminApiError(409, 'Danh mục/liên kết mã đã đổi. Trả về nháp và lưu lại trước khi phát hành.');
        }
        const materialReader = readers.get(linePOs[0].id)!;
        for (const material of next.materials) {
          const current = await materialReader.material(material);
          if (!isDeepStrictEqual(current.catalog || null, material.catalog || null))
            throw new AdminApiError(409, 'Danh mục NVL đã đổi. Trả về nháp và lưu lại trước khi phát hành.');
        }
        const machine = next.machineId
          ? (await transaction.get(firestore.collection('machines').doc(identifier(next.machineId)))).data()
          : null;
        const operator = next.operatorId
          ? (await transaction.get(firestore.collection('users').doc(identifier(next.operatorId)))).data()
          : null;
        if (!machine || machine.status !== 'available')
          throw new AdminApiError(400, 'Chọn máy đang hoạt động trong Danh mục máy.');
        if (
          !operator?.active ||
          !['producer', 'admin'].includes(operator.role) ||
          (operator.role !== 'admin' && !operator.allowedPages?.includes('production'))
        )
          throw new AdminApiError(400, 'Chọn nhân sự đang hoạt động và có quyền Sản xuất.');
        if (!next.deliveryDeadline || !next.materials.length)
          throw new AdminApiError(400, 'Cần ngày yêu cầu và ít nhất một dòng vật tư dự kiến trước khi phát hành.');
        const colors = Math.max(
          0,
          ...next.lines.map(line => Number(line.specifications.colorCount || 0)).filter(Number.isFinite)
        );
        if (colors > Number(machine.colorCount || 0))
          throw new AdminApiError(400, 'Máy không đủ số màu theo thông số sản phẩm.');
        next.machineName = String(machine.name);
        next.operatorName = String(operator.displayName);
        next.status = 'released';
        next.releasedAt = now;
      }
      if (action === 'start') {
        const machineRef = firestore.collection('machines').doc(identifier(next.machineId));
        const machineSnapshot = await transaction.get(machineRef);
        const machine = machineSnapshot.data();
        if (!machine || machine.status !== 'available')
          throw new AdminApiError(400, 'Máy đang bảo trì / ngừng hoạt động, không thể bắt đầu.');
        const queue = await transaction.get(
          firestore
            .collection('production_commands')
            .where('machineId', 'in', [...new Set([next.machineId, String(machine.name), String(machine.code)])])
        );
        if (
          queue.docs.some(
            doc => doc.id !== id && !doc.data().deleted && ['producing', 'transfer_pending'].includes(doc.data().status)
          )
        )
          throw new AdminApiError(409, 'Máy đang chạy một LSX khác. Hoàn thành lệnh đó trước khi bắt đầu lệnh mới.');
        // This write also serializes starts for different POs on the same machine.
        transaction.update(machineRef, { runtimeRevision: Number(machine.runtimeRevision || 0) + 1 });
        next.status = 'producing';
        next.startedAt = now;
      }
      if (action === 'cancel') {
        const stockState = (
          await transaction.get(firestore.collection('warehouse_source_state').doc(`production_${id}`))
        ).data();
        if (
          stockState &&
          Object.values(stockState.lines || {}).some(line => Number((line as Record<string, unknown>).quantity) > 0)
        )
          throw new AdminApiError(409, 'LSX còn NVL đã cấp. Hoàn hết NVL hoặc đảo phiếu cấp trước khi hủy.');
        next.status = 'cancelled';
      }
      if (action === 'complete') completeOrder(next, body, actor, now);
      if (action === 'request_materials') {
        if (!next.lines.some(line => line.quantity - (line.goodQuantity ?? 0) > 1e-8))
          throw new AdminApiError(400, 'LSX đã đủ sản lượng, không có phần thiếu để mua thêm NVL.');
        if (!next.materials.length)
          throw new AdminApiError(400, 'LSX chưa khai báo vật tư dự kiến để đề nghị mua thêm.');
      }
    }
    // Legacy dashboards, machine schedules and chat use this display-only alias.
    next.productName = next.lines.map(line => line.productName).join(', ');
    next.history.push({
      at: now,
      actorId: actor.uid,
      actorName: actor.displayName,
      action,
      note: `request:${requestId}`
    });
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 700_000)
      throw new AdminApiError(400, 'LSX quá lớn. Giảm số mặt hàng hoặc ảnh đính kèm.');
    const after = [...commands.filter(command => command.id !== id), next];
    if (action === 'create') transaction.set(counterRef, { sequence });
    if (action === 'request_materials') {
      next.materials.forEach((material, index) => {
        const reqDocId = `pr_${requestId}_${index + 1}`;
        transaction.set(firestore.collection('procurement_requests').doc(reqDocId), {
          id: reqDocId,
          requestCode: `PR-${next.lsxCode}-${String(index + 1).padStart(2, '0')}`,
          poId: next.poId,
          poCode: next.poCode,
          poItemId: material.id,
          poItemIndex: index,
          lsxId: next.id,
          lsxCode: next.lsxCode,
          customerId: next.customerId,
          customerName: next.customerName,
          saleId: '',
          productCode: material.code,
          productName: material.name,
          material: material.name,
          size: material.width ? `Khổ ${material.width} mm` : '',
          specifications: {
            width: material.width || '',
            allowancePercent: material.allowancePercent || 0,
            catalogItemId: material.catalogItemId || ''
          },
          quantity: material.quantity,
          unit: material.unit,
          requiredDate: next.deliveryDeadline || businessDate,
          sourcingType: 'raw_material',
          status: 'new',
          assignedPurchaserId: '',
          assignedPurchaserName: '',
          selectedSupplierId: '',
          selectedSupplierName: '',
          selectedUnitPrice: 0,
          purchaseOrderId: '',
          purchaseOrderCode: '',
          createdAt: now,
          createdById: actor.uid,
          createdByName: actor.displayName,
          updatedAt: now,
          updatedBy: actor.displayName,
          deleted: false
        });
      });
    }
    transaction.set(commandRef, next);
    for (const po of pos) updatePO(transaction, firestore, po, after, next, action, actor, now);
    transaction.set(eventRef, {
      actorId: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      category: 'production',
      module: 'production',
      action: `production_${action}`,
      summary: `${next.lsxCode}: ${action}`,
      targetType: 'production_command',
      targetId: id,
      targetLabel: next.lsxCode,
      createdAt: now,
      occurredAt: now,
      sessionId: 'production-api'
    });
    return { success: true, id, revision: next.revision };
  });
}

/** Release re-validates the stored lines exactly as a save would. */
const releaseInput = (order: ProductionOrder) => ({
  ...order,
  lines: order.lines.map(line => ({ ...line, poId: linePoId(line, order) }))
});

function completeOrder(next: ProductionOrder, body: Record<string, unknown>, actor: ProductionActor, now: string) {
  if (!Array.isArray(body.results) || body.results.length !== next.lines.length)
    throw new AdminApiError(400, 'Nhập kết quả QC của tất cả mặt hàng.');
  const results = body.results as Record<string, unknown>[];
  if (
    results.some(
      result =>
        !result ||
        typeof result !== 'object' ||
        typeof result.goodQuantity !== 'number' ||
        typeof result.rejectQuantity !== 'number'
    )
  )
    throw new AdminApiError(400, 'Kết quả QC phải có số lượng đạt / hỏng hợp lệ.');
  // Lines of different POs can share an item ID: a result names its line key, or its PO and item ID.
  const matches = (result: Record<string, unknown>, line: ProductionOrder['lines'][number]) =>
    result.lineId
      ? result.lineId === lineKey(line)
      : result.itemId === line.itemId && (!result.poId || result.poId === linePoId(line, next));
  if (next.lines.some(line => results.filter(result => matches(result, line)).length !== 1))
    throw new AdminApiError(400, 'Kết quả QC bị trùng dòng.');
  next.lines = next.lines.map(line => {
    const result = results.find(result => matches(result, line));
    const goodQuantity = Number(result?.goodQuantity),
      rejectQuantity = Number(result?.rejectQuantity),
      surplusQuantity = result?.surplusQuantity === undefined ? 0 : Number(result.surplusQuantity);
    if (
      !result ||
      !Number.isFinite(goodQuantity) ||
      !Number.isFinite(rejectQuantity) ||
      !Number.isFinite(surplusQuantity) ||
      goodQuantity < 0 ||
      rejectQuantity < 0 ||
      surplusQuantity < 0 ||
      surplusQuantity > 1e9 ||
      goodQuantity + rejectQuantity > line.quantity + 1e-8
    )
      throw new AdminApiError(400, 'Số lượng đạt + hỏng không được vượt số lượng lệnh và SL dư phải >= 0.');
    return {
      ...line,
      goodQuantity,
      rejectQuantity,
      ...(surplusQuantity > 0 ? { surplusQuantity } : {})
    };
  });
  if (!String(body.qcNote || '').trim()) throw new AdminApiError(400, 'Nhập ghi chú nghiệm thu QC.');
  next.status = 'completed';
  next.completedAt = now;
  next.history.push({
    at: now,
    actorId: actor.uid,
    actorName: actor.displayName,
    action: 'qc',
    note: String(body.qcNote).slice(0, 2000)
  });
}

/** Refresh one PO's production plan flags and queue after the order changed. */
function updatePO(
  transaction: Transaction,
  firestore: Firestore,
  po: ProductionPO,
  after: CommandRecord[],
  next: ProductionOrder,
  action: string,
  actor: ProductionActor,
  now: string
) {
  const orders = after.filter(command => commandPoIds(command).includes(po.id));
  const active = orders.filter(command => !command.deleted && command.status !== 'cancelled');
  const inOrder = commandPoIds(next).includes(po.id);
  const complete = completedProduction(po, orders);
  transaction.update(firestore.collection('pos').doc(po.id), {
    productionPlanRequiredItemIds: active.length ? productionItemIds(po) : [],
    productionPlanLocked: active.length > 0,
    productionPlanFrozen: active.some(command => command.releasedAt),
    productionRevision: Number(po.productionRevision || 0) + 1,
    ...(action === 'start' && inOrder ? { productionProgress: 'producing' } : {}),
    ...(action === 'complete' && inOrder ? { productionProgress: complete ? 'completed' : 'partial' } : {}),
    ...(complete && getPOQueueStatus(po) === 'waiting_production'
      ? getPOQueueUpdate('waiting_delivery', {
          deliveryStage: 'customer_outbound',
          deliveryProgress: po.goodsFlowVersion === 1 ? String(po.deliveryProgress || 'pending') : 'pending'
        })
      : {}),
    historyLogs: [
      ...(Array.isArray(po.historyLogs) ? po.historyLogs : []),
      {
        status: String(po.status),
        updatedBy: actor.displayName,
        updatedAt: now,
        note: `${next.lsxCode}: ${action}${complete ? ' — đủ sản lượng đạt QC, chuyển chờ giao.' : ''}`
      }
    ]
  });
}

/** Internal codes and NVL options for the POs the editor has picked lines from. */
async function loadCatalog(firestore: Firestore, actor: ProductionActor, body: Record<string, unknown>) {
  const poIds = unique(
    (Array.isArray(body.poIds) ? (body.poIds as unknown[]) : [body.poId]).map(value => identifier(value))
  );
  if (!poIds.length || poIds.length > MAX_POS_PER_ORDER) throw new AdminApiError(400, 'Chọn từ 1 đến 20 đơn hàng.');
  return firestore.runTransaction(async transaction => {
    const pos = await readPOs(transaction, firestore, poIds);
    for (const po of pos) assertPOAccess(actor, po);
    const options = await Promise.all(pos.map(po => productionCatalogReader(transaction, firestore, po).options()));
    const mappedLines = Object.fromEntries(
      options.flatMap((option, index) =>
        Object.entries(option.lines).map(([itemId, value]) => [`${pos[index].id}::${itemId}`, value])
      )
    );
    const catalogIds = unique(
      Object.values(mappedLines)
        .map(entry => entry.catalog?.id || '')
        .filter(Boolean)
    );
    const balanceSnapshots = await Promise.all(
      catalogIds.map(id => transaction.get(firestore.collection('warehouse_balances').doc(`fg_${id}`)))
    );
    const stockBalances = Object.fromEntries(
      catalogIds.map((id, index) => [id, Number(balanceSnapshots[index].data()?.quantity || 0)])
    );
    return {
      success: true,
      materials: options[0].materials,
      // Keyed by PO and line so two POs with the same item ID never overwrite each other.
      lines: mappedLines,
      stockBalances
    };
  });
}
