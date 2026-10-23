import { AdminApiError } from './adminUsers.js';
import { isDeepStrictEqual } from 'node:util';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  assertPOAccess, assertTransition, canManageProduction, canDraftProduction, validateProductionDraft, completedProduction, lineSnapshot,
  type ProductionActor, type ProductionOrder, type ProductionPO, type CommandRecord
} from '../src/features/production/model/productionOrder.js';
import { getPOQueueUpdate, getPOQueueStatus } from '../src/features/sales/model/poWorkflow.js';
import { productionCatalogReader } from './productionCatalog.js';

export { requireActiveErpCaller as requireProductionCaller } from './erpCaller.js';

const identifier = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(value)) throw new AdminApiError(400, 'Mã bản ghi không hợp lệ.');
  return value;
};

/** The PO write serializes concurrent allocations, including creates with different IDs. */
export async function manageProductionOrder(actor: ProductionActor, body: Record<string, unknown>) {
  if (!canDraftProduction(actor)) throw new AdminApiError(403, 'Bạn không có quyền lập lệnh sản xuất.');
  const { firestore } = getFirebaseAdminServices();
  const action = String(body.action), poId = identifier(body.poId);
  if (action === 'catalog') return firestore.runTransaction(async tx => {
    const doc = await tx.get(firestore.collection('pos').doc(poId));
    if (!doc.exists) throw new AdminApiError(404, 'Không tìm thấy PO.');
    const po = { ...doc.data(), id: poId } as ProductionPO;
    assertPOAccess(actor, po);
    return { success: true, ...(await productionCatalogReader(tx, firestore, po).options()) };
  });
  if (!canManageProduction(actor) && !['create', 'save', 'submit'].includes(action)) throw new AdminApiError(403, 'Kế toán chỉ được lập, sửa nháp và gửi duyệt LSX của mình.');
  const id = identifier(body.id);
  const commandRef = firestore.collection('production_commands').doc(id);
  const poRef = firestore.collection('pos').doc(poId);
  const eventRef = firestore.collection('audit_events').doc();
  const now = new Date().toISOString();
  const businessDate = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  return firestore.runTransaction(async transaction => {
    // All reads precede all writes. Never trust client quantities, labels, actors or snapshots.
    const poSnapshot = await transaction.get(poRef);
    if (!poSnapshot.exists) throw new AdminApiError(404, 'Không tìm thấy PO.');
    const po = { ...poSnapshot.data(), id: poId } as ProductionPO;
    const targetSnapshot = await transaction.get(commandRef);
    if (targetSnapshot.exists && targetSnapshot.data()?.poId !== poId) throw new AdminApiError(409, 'Mã LSX đã được sử dụng cho PO khác.');
    const snapshots = await transaction.get(firestore.collection('production_commands').where('poId', '==', poId));
    const commands = snapshots.docs.map(doc => ({ ...doc.data(), id: doc.id })) as CommandRecord[];
    const previous = commands.find(command => command.id === id) as ProductionOrder | undefined;
    if (previous && !canManageProduction(actor) && previous.createdById !== actor.uid) throw new AdminApiError(403, 'Bạn chỉ được sửa/gửi duyệt LSX do mình lập.');
    const requestId = identifier(body.requestId);
    assertPOAccess(actor, { ...po, status: 'waiting_production' });
    // Retrying an acknowledged mutation is a no-op, even after another status change.
    if (previous?.history?.some(entry => entry.note === `request:${requestId}`)) return { success: true, id, revision: previous.revision };
    if (action === 'create' && previous) throw new AdminApiError(409, 'Mã yêu cầu đã tồn tại. Mở lại lệnh trước khi sửa.');
    if (action !== 'create' && (!previous || previous.productionOrderVersion !== 2)) throw new AdminApiError(404, 'Lệnh không tồn tại hoặc thuộc luồng cũ.');
    if (action !== 'create' && previous!.revision !== body.expectedRevision) throw new AdminApiError(409, 'LSX vừa được cập nhật. Đóng và mở lại để lấy dữ liệu mới.');
    // Read access is checked even when cancelling after the PO has advanced.
    const accessPO = ['cancel', 'complete', 'start', 'return'].includes(action) ? { ...po, status: 'waiting_production' } : po;
    assertPOAccess(actor, accessPO);
    if (action !== 'create') assertTransition(actor, previous!, action);
    const counterRef = firestore.collection('production_counters').doc(businessDate);
    const counter = action === 'create' ? await transaction.get(counterRef) : null;
    const sequence = Number(counter?.data()?.sequence || 0) + 1;
    let next: ProductionOrder;
    let required = po.productionPlanRequiredItemIds || [];
    if (action === 'create' || action === 'save') {
      const draft = validateProductionDraft(po, commands, body, id);
      const { requiredItemIds, ...fields } = draft;
      const catalog = productionCatalogReader(transaction, firestore, po);
      fields.lines = await Promise.all(fields.lines.map(line => catalog.line(line)));
      fields.materials = await Promise.all(fields.materials.map(material => catalog.material(material)));
      required = requiredItemIds;
      const customer = po.customerId ? (await transaction.get(firestore.collection('customers').doc(identifier(po.customerId)))).data() : undefined;
      const customerSnapshot = po.customerSnapshot && typeof po.customerSnapshot === 'object' ? po.customerSnapshot as Record<string, unknown> : {};
      next = {
        ...(previous || {}), ...fields, id, productionOrderVersion: 2, revision: (previous?.revision || 0) + 1,
        lsxCode: previous?.lsxCode || `LSX-${businessDate.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`,
        poId, poCode: String(po.poCode || poId), customerId: String(po.customerId || ''), customerName: String(po.customerName || ''),
        machineName: '', operatorName: '', status: 'draft', inventoryPostingMode: 'actual_issue',
        customerCode: String(previous?.customerCode || customerSnapshot.customerCode || po.customerCode || customer?.customerCode || ''),
        createdAt: previous?.createdAt || now, createdById: previous?.createdById || actor.uid,
        createdBy: previous?.createdBy || actor.displayName, updatedAt: now, history: previous?.history || []
      };
    } else {
      next = structuredClone(previous!);
      next.revision += 1; next.updatedAt = now;
      if (action === 'submit') next.status = 'pending_approval';
      if (action === 'return') next.status = 'draft';
      if (action === 'release') {
        if (getPOQueueStatus(po) !== 'waiting_production') throw new AdminApiError(400, 'PO phải hoàn tất thiết kế / sẵn sàng sản xuất trước khi phát hành.');
        validateProductionDraft(po, commands, next as unknown as Record<string, unknown>, id);
        for (const line of next.lines) {
          const index = (po.items || []).findIndex((item, index) => String(item.itemId || `legacy-line-${index + 1}`) === line.itemId);
          if (index < 0 || lineSnapshot(po.items![index], index, line.quantity).sourceFingerprint !== line.sourceFingerprint) throw new AdminApiError(409, 'Thông tin PO đã thay đổi. Trả về nháp và lưu lại trước khi phát hành.');
        }
        const catalog = productionCatalogReader(transaction, firestore, po);
        for (const line of next.lines) {
          const current = await catalog.line(line);
          if (!isDeepStrictEqual(current.catalog || null, line.catalog || null)) throw new AdminApiError(409, 'Danh mục/liên kết mã đã đổi. Trả về nháp và lưu lại trước khi phát hành.');
        }
        for (const material of next.materials) {
          const current = await catalog.material(material);
          if (!isDeepStrictEqual(current.catalog || null, material.catalog || null)) throw new AdminApiError(409, 'Danh mục NVL đã đổi. Trả về nháp và lưu lại trước khi phát hành.');
        }
        const machine = next.machineId ? (await transaction.get(firestore.collection('machines').doc(identifier(next.machineId)))).data() : null;
        const operator = next.operatorId ? (await transaction.get(firestore.collection('users').doc(identifier(next.operatorId)))).data() : null;
        if (!machine || machine.status !== 'available') throw new AdminApiError(400, 'Chọn máy đang hoạt động trong Danh mục máy.');
        if (!operator?.active || !['producer', 'admin'].includes(operator.role) || operator.role !== 'admin' && !operator.allowedPages?.includes('production')) throw new AdminApiError(400, 'Chọn nhân sự đang hoạt động và có quyền Sản xuất.');
        if (!next.deliveryDeadline || !next.materials.length) throw new AdminApiError(400, 'Cần ngày yêu cầu và ít nhất một dòng vật tư dự kiến trước khi phát hành.');
        const colors = Math.max(0, ...next.lines.map(line => Number(line.specifications.colorCount || 0)).filter(Number.isFinite));
        if (colors > Number(machine.colorCount || 0)) throw new AdminApiError(400, 'Máy không đủ số màu theo thông số sản phẩm.');
        next.machineName = String(machine.name); next.operatorName = String(operator.displayName);
        next.status = 'released'; next.releasedAt = now;
      }
      if (action === 'start') {
        const machineRef = firestore.collection('machines').doc(identifier(next.machineId));
        const machineSnapshot = await transaction.get(machineRef);
        const machine = machineSnapshot.data();
        if (!machine || machine.status !== 'available') throw new AdminApiError(400, 'Máy đang bảo trì / ngừng hoạt động, không thể bắt đầu.');
        const queue = await transaction.get(firestore.collection('production_commands').where('machineId', 'in', [...new Set([next.machineId, String(machine.name), String(machine.code)])]));
        if (queue.docs.some(doc => doc.id !== id && !doc.data().deleted && ['producing', 'transfer_pending'].includes(doc.data().status))) throw new AdminApiError(409, 'Máy đang chạy một LSX khác. Hoàn thành lệnh đó trước khi bắt đầu lệnh mới.');
        // This write also serializes starts for different POs on the same machine.
        transaction.update(machineRef, { runtimeRevision: Number(machine.runtimeRevision || 0) + 1 });
        next.status = 'producing'; next.startedAt = now;
      }
      if (action === 'cancel') {
        const stockState = (await transaction.get(firestore.collection('warehouse_source_state').doc(`production_${id}`))).data();
        if (stockState && Object.values(stockState.lines || {}).some(line => Number((line as Record<string, unknown>).quantity) > 0)) throw new AdminApiError(409, 'LSX còn NVL đã cấp. Hoàn hết NVL hoặc đảo phiếu cấp trước khi hủy.');
        next.status = 'cancelled';
      }
      if (action === 'complete') {
        if (!Array.isArray(body.results) || body.results.length !== next.lines.length) throw new AdminApiError(400, 'Nhập kết quả QC của tất cả mặt hàng.');
        const results = body.results as Record<string, unknown>[];
        if (results.some(result => !result || typeof result !== 'object' || typeof result.goodQuantity !== 'number' || typeof result.rejectQuantity !== 'number')) throw new AdminApiError(400, 'Kết quả QC phải có số lượng đạt / hỏng hợp lệ.');
        if (new Set(results.map(result => result.itemId)).size !== results.length) throw new AdminApiError(400, 'Kết quả QC bị trùng dòng.');
        next.lines = next.lines.map(line => {
          const result = results.find(result => result.itemId === line.itemId);
          const goodQuantity = Number(result?.goodQuantity), rejectQuantity = Number(result?.rejectQuantity);
          if (!result || !Number.isFinite(goodQuantity) || !Number.isFinite(rejectQuantity) || goodQuantity < 0 || rejectQuantity < 0 || goodQuantity + rejectQuantity > line.quantity + 1e-8) throw new AdminApiError(400, 'Số lượng đạt + hỏng không được vượt số lượng lệnh.');
          return { ...line, goodQuantity, rejectQuantity };
        });
        if (!String(body.qcNote || '').trim()) throw new AdminApiError(400, 'Nhập ghi chú nghiệm thu QC.');
        next.status = 'completed'; next.completedAt = now;
        next.history.push({ at: now, actorId: actor.uid, actorName: actor.displayName, action: 'qc', note: String(body.qcNote).slice(0, 2000) });
      }
    }
    // Legacy dashboards, machine schedules and chat use this display-only alias.
    next.productName = next.lines.map(line => line.productName).join(', ');
    next.history.push({ at: now, actorId: actor.uid, actorName: actor.displayName, action, note: `request:${requestId}` });
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > 700_000) throw new AdminApiError(400, 'LSX quá lớn. Giảm số mặt hàng hoặc ảnh đính kèm.');
    const after = [...commands.filter(command => command.id !== id), next];
    const complete = completedProduction({ ...po, productionPlanRequiredItemIds: required }, after);
    const locked = after.some(command => !command.deleted && command.status !== 'cancelled');
    if (action === 'create') transaction.set(counterRef, { sequence });
    transaction.set(commandRef, next);
    transaction.update(poRef, {
      productionPlanRequiredItemIds: locked ? required : [], productionPlanLocked: locked,
      productionPlanFrozen: after.some(command => !command.deleted && command.status !== 'cancelled' && command.releasedAt),
      productionRevision: Number(po.productionRevision || 0) + 1,
      ...(action === 'start' ? { productionProgress: 'producing' } : {}),
      ...(action === 'complete' ? { productionProgress: complete ? 'completed' : 'partial' } : {}),
      ...(complete && getPOQueueStatus(po) === 'waiting_production' ? getPOQueueUpdate('waiting_delivery', { deliveryStage: 'customer_outbound', deliveryProgress: po.goodsFlowVersion === 1 ? String(po.deliveryProgress || 'pending') : 'pending' }) : {}),
      historyLogs: [...(Array.isArray(po.historyLogs) ? po.historyLogs : []), { status: String(po.status), updatedBy: actor.displayName, updatedAt: now, note: `${next.lsxCode}: ${action}${complete ? ' — đủ sản lượng đạt QC, chuyển chờ giao.' : ''}` }]
    });
    transaction.set(eventRef, { actorId: actor.uid, actorName: actor.displayName, actorRole: actor.role,
      category: 'production', module: 'production', action: `production_${action}`, summary: `${next.lsxCode}: ${action}`,
      targetType: 'production_command', targetId: id, targetLabel: next.lsxCode, createdAt: now, occurredAt: now, sessionId: 'production-api' });
    return { success: true, id, revision: next.revision };
  });
}
