import { assertPhysicalSourceUnbilled } from './financeSourceGuard.js';
import { createHash } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { conversionFactor, normalizeUnit, type CatalogItem } from '../src/features/catalog/model/itemCatalog.js';
import {
  canPostWarehouse,
  canReadWarehouse,
  roundStock,
  stockVoucherPrefix,
  warehouseDate,
  warehouseQuantity,
  WarehouseValidationError,
  type WarehouseActor,
  type WarehouseBalance,
  type WarehouseKind,
  type WarehouseLine,
  type WarehouseProgress,
  type WarehouseSource,
  type WarehouseVoucher
} from '../src/features/inventory/model/warehouse.js';
import { buildItemUsers } from '../src/features/inventory/model/itemUsers.js';
import { documentCodeIssuer } from './documentCounter.js';
import {
  rawSourceFingerprintInput,
  sourceLine,
  sourceRows
} from '../src/features/inventory/model/sourceFingerprints.js';

type Data = Record<string, unknown>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (status: number, message: string, code = 'warehouse/error'): never => {
  throw new AdminApiError(status, message, code);
};
const id = (value: unknown): string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value)
    ? value
    : fail(400, 'Định danh chứng từ không hợp lệ.');
const text = (value: unknown, max = 1000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const WAREHOUSE_NOTE: Record<WarehouseKind, string> = {
  purchase_receipt: 'nhận NVL',
  production_issue: 'cấp NVL',
  production_return: 'hoàn NVL',
  reversal: 'đảo phiếu'
};
export const sourceStamp = (type: 'purchase' | 'production', data: Data) => hash(rawSourceFingerprintInput(type, data));
function sourceView(type: 'purchase' | 'production', sourceId: string, data: Data, managed: boolean): WarehouseSource {
  return {
    id: sourceId,
    code: String(data.purCode || data.lsxCode || sourceId),
    type,
    status: String(data.status),
    legacyReceived: type === 'purchase' && data.status === 'received' && !managed,
    ...(type === 'production' && data.customerId ? { customerId: String(data.customerId) } : {}),
    ...(type === 'production' && data.customerName ? { customerName: String(data.customerName) } : {}),
    lines: sourceRows(type, data).map((row, index) => ({
      id: sourceLine(type, row, index),
      name: [
        String(row.materialName || row.productName || row.name || ''),
        type === 'production' && row.width ? `khổ ${row.width} mm` : String(row.size || '')
      ]
        .filter(Boolean)
        .join(' · '),
      unit: String(row.unit || ''),
      quantity: Number(row.quantity),
      catalogItemId:
        type === 'production' ? String(row.catalogItemId || (row.catalog as Data | undefined)?.id || '') : '',
      factor: type === 'production' ? Number((row.catalog as Data | undefined)?.factor || 0) : 0
    }))
  };
}

/** A single quantity writer for new NVL stock. Legacy balances are never inferred as opening stock. */
export async function manageWarehouse(actor: WarehouseActor, body: Data) {
  if (!canReadWarehouse(actor)) fail(403, 'Bạn không có quyền xem kho NVL.');
  if (JSON.stringify(body).length > 100_000) fail(400, 'Yêu cầu kho quá lớn. Tối đa 50 dòng mỗi phiếu.');
  const { firestore } = getFirebaseAdminServices();
  const action = String(body.action);
  if (action === 'load')
    return firestore.runTransaction(async tx => {
      const names = [
        'item_catalog',
        'warehouse_balances',
        'warehouse_vouchers',
        'warehouse_source_state',
        'purchase_orders',
        'production_commands',
        'inventory',
        'warehouse_exports',
        'customers',
        'catalog_links'
      ];
      const result = await Promise.all(names.map(name => tx.get(firestore.collection(name))));
      const rows = (index: number): (Data & { id: string })[] =>
        result[index].docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const progress = rows(3) as unknown as WarehouseProgress[];
      const sources = [
        ...rows(4)
          .filter(row => row.sourcingType === 'raw_material' && !row.deleted && row.status !== 'cancelled')
          .map(row =>
            sourceView(
              'purchase',
              row.id,
              row,
              progress.some(item => item.id === `purchase_${row.id}`)
            )
          ),
        ...rows(5)
          .filter(
            row =>
              row.productionOrderVersion === 2 &&
              !row.deleted &&
              ['released', 'producing', 'completed'].includes(String(row.status))
          )
          .map(row => sourceView('production', row.id, row, true))
      ];
      const itemUsers = buildItemUsers(rows(0), rows(2), rows(5), rows(8), rows(9));
      return {
        success: true,
        items: rows(0).filter(row => row.kind === 'raw_material'),
        balances: rows(1).filter(row => !row.warehouseId || row.warehouseId === 'raw_main'),
        vouchers: rows(2).filter(row => row.warehouseId === 'raw_main'),
        progress,
        sources,
        legacyInventory: rows(6),
        legacyExports: rows(7),
        itemUsers
      };
    });
  if (!canPostWarehouse(actor))
    fail(403, 'Chỉ Admin, Mua hàng có quyền Kho vật tư hoặc Kế toán có quyền Kế toán được ghi sổ.');
  if (!['post', 'reverse', 'threshold'].includes(action)) fail(400, 'Thao tác kho không hợp lệ.');
  if (action === 'reverse' && actor.role !== 'admin') fail(403, 'Chỉ Admin được đảo phiếu kho.');
  const now = new Date().toISOString(),
    today = warehouseDate(new Date(now));
  const requestId = id(body.requestId),
    digest = hash(body);
  const requestRef = firestore.collection('warehouse_requests').doc(requestId);
  return firestore.runTransaction(async tx => {
    const ack = await tx.get(requestRef);
    if (ack.exists) {
      if (ack.data()?.digest !== digest || ack.data()?.actorId !== actor.uid)
        fail(409, 'Mã yêu cầu đã dùng cho nội dung khác.');
      return ack.data()!.result;
    }
    if (body.postingDate !== undefined && body.postingDate !== today)
      fail(400, 'Không ghi lùi ngày hoặc ngày tương lai. Ngày hạch toán là ngày hiện tại tại Việt Nam.');
    for (const field of ['note', 'negativeReason'])
      if (body[field] !== undefined && (typeof body[field] !== 'string' || (body[field] as string).length > 1000))
        fail(400, 'Nội dung/lý do tối đa 1.000 ký tự.');
    if (action === 'threshold') {
      const catalogId = id(body.catalogItemId);
      const item = (await tx.get(firestore.collection('item_catalog').doc(catalogId))).data() as
        CatalogItem | undefined;
      const finished = body.warehouseId === 'finished_main';
      if (body.warehouseId !== undefined && !['raw_main', 'finished_main'].includes(String(body.warehouseId)))
        fail(400, 'Kho không hợp lệ.');
      if (!item?.active || (finished ? !['finished_good', 'resale'].includes(item.kind) : item.kind !== 'raw_material'))
        fail(400, 'Chọn mã hàng đang sử dụng thuộc đúng kho.');
      const balanceId = finished ? `fg_${catalogId}` : catalogId;
      const ref = firestore.collection('warehouse_balances').doc(balanceId),
        previous = (await tx.get(ref)).data() as WarehouseBalance | undefined;
      if (body.expectedRevision !== (previous?.revision || 0))
        fail(409, 'Tồn kho vừa thay đổi. Tải lại trước khi lưu.');
      if (
        typeof body.minQuantity !== 'number' ||
        !Number.isFinite(body.minQuantity) ||
        body.minQuantity < 0 ||
        body.minQuantity > 1e9
      )
        fail(400, 'Ngưỡng tồn tối thiểu không hợp lệ.');
      if (roundStock(body.minQuantity as number) !== body.minQuantity)
        fail(400, 'Ngưỡng tồn tối đa 6 chữ số thập phân.');
      const next = {
        id: balanceId,
        ...(finished ? { catalogItemId: catalogId, warehouseId: 'finished_main' } : {}),
        code: item!.code,
        name: item!.name,
        unit: item!.baseUnit,
        quantity: previous?.quantity || 0,
        minQuantity: body.minQuantity,
        revision: (previous?.revision || 0) + 1,
        updatedAt: now
      };
      const result = { success: true };
      tx.set(ref, next);
      tx.set(requestRef, { digest, actorId: actor.uid, result, createdAt: now });
      tx.set(firestore.collection('audit_events').doc(), {
        actorId: actor.uid,
        actorName: actor.displayName,
        actorRole: actor.role,
        category: 'business',
        module: 'inventory',
        action: 'warehouse_threshold',
        summary: `Ngưỡng tồn ${item!.code}`,
        before: previous || null,
        after: next,
        occurredAt: now,
        createdAt: now,
        sessionId: 'warehouse-api'
      });
      return result;
    }
    const originalRef =
      action === 'reverse' ? firestore.collection('warehouse_vouchers').doc(id(body.voucherId)) : null;
    const original = originalRef ? ((await tx.get(originalRef)).data() as WarehouseVoucher | undefined) : undefined;
    if (action === 'reverse' && (!original || original.kind === 'reversal' || original.reversedBy))
      fail(409, 'Phiếu không tồn tại, là phiếu đảo hoặc đã được đảo.');
    if (original) await assertPhysicalSourceUnbilled(tx, firestore, id(body.voucherId));
    const kind = action === 'reverse' ? 'reversal' : (String(body.kind) as WarehouseKind);
    if (action !== 'reverse' && !['purchase_receipt', 'production_issue', 'production_return'].includes(kind))
      fail(400, 'Loại phiếu không hợp lệ.');
    const effectiveKind = original?.kind || kind;
    const sourceType = original?.sourceType || (kind === 'purchase_receipt' ? 'purchase' : 'production');
    const sourceId = original?.sourceId || id(body.sourceId);
    const sourceRef = firestore
      .collection(sourceType === 'purchase' ? 'purchase_orders' : 'production_commands')
      .doc(sourceId);
    const sourceDoc = await tx.get(sourceRef);
    const source: Data = sourceDoc.data() || fail(404, 'Chứng từ nguồn không tồn tại.');
    if (source.deleted && action !== 'reverse') fail(404, 'Chứng từ nguồn không tồn tại.');
    const stateRef = firestore.collection('warehouse_source_state').doc(`${sourceType}_${sourceId}`);
    const oldState = (await tx.get(stateRef)).data() as WarehouseProgress | undefined;
    if (
      sourceType === 'purchase' &&
      (source.sourcingType !== 'raw_material' || (!oldState && source.status === 'received'))
    )
      fail(409, 'Đơn mua đã nhận theo luồng cũ hoặc không phải NVL. Cần đối soát trước khi ghi kho.');
    if (
      action !== 'reverse' &&
      (source.status === 'cancelled' ||
        (sourceType === 'production' &&
          (source.productionOrderVersion !== 2 ||
            !(
              kind === 'production_return' ? ['released', 'producing', 'completed'] : ['released', 'producing']
            ).includes(String(source.status)))))
    )
      fail(400, 'LSX phải được phát hành/đang sản xuất để cấp NVL; lệnh hoàn thành chỉ nhận hoàn NVL.');
    const fingerprint = sourceStamp(sourceType, source);
    if (action !== 'reverse' && oldState && oldState.fingerprint !== fingerprint)
      fail(409, 'Chứng từ nguồn đã thay đổi sau ghi kho. Cần đối soát, không tự ghép lại.');
    const nextState: WarehouseProgress = oldState
      ? structuredClone(oldState)
      : { id: stateRef.id, fingerprint, lines: {}, revision: 0 };
    const rows = sourceRows(sourceType, source);
    const input =
      action === 'reverse'
        ? original!.lines.map(line => ({
            sourceLine: line.sourceLine,
            catalogItemId: line.catalogItemId,
            quantity: line.quantity
          }))
        : body.lines;
    if (
      !Array.isArray(input) ||
      !input.length ||
      input.length > 50 ||
      input.some(line => !line || typeof line !== 'object')
    )
      fail(400, 'Phiếu cần 1–50 dòng hợp lệ.');
    const inputs = input as {
      sourceLine: string;
      catalogItemId: string;
      quantity: number;
      rollCode?: unknown;
      remainingMeters?: unknown;
    }[];
    if (new Set(inputs.map(line => line.sourceLine)).size !== inputs.length)
      fail(400, 'Dòng nguồn bị trùng trong phiếu.');
    const items = new Map<string, CatalogItem>();
    for (const catalogId of new Set(inputs.map(line => id(line.catalogItemId)))) {
      const doc = await tx.get(firestore.collection('item_catalog').doc(catalogId));
      if (action !== 'reverse' && (!doc.data()?.active || doc.data()?.kind !== 'raw_material'))
        fail(400, 'Chọn mã NVL đang sử dụng.');
      if (doc.exists) items.set(catalogId, { ...doc.data(), id: catalogId } as CatalogItem);
    }
    const lines: WarehouseLine[] = inputs.map(inputLine => {
      if (action === 'reverse')
        return {
          ...original!.lines.find(line => line.sourceLine === inputLine.sourceLine)!,
          delta: -original!.lines.find(line => line.sourceLine === inputLine.sourceLine)!.delta
        };
      const row = rows.find((row, index) => sourceLine(sourceType, row, index) === inputLine.sourceLine);
      if (!row || rows.filter((row, index) => sourceLine(sourceType, row, index) === inputLine.sourceLine).length !== 1)
        fail(400, 'Dòng nguồn không hợp lệ hoặc thiếu định danh.');
      const item = items.get(inputLine.catalogItemId)!;
      // Purchase orders are client-created: their embedded catalog fields are not authoritative snapshots.
      const frozen = sourceType === 'production' ? (row!.catalog as Data | undefined) : undefined;
      const stored = oldState?.lines[inputLine.sourceLine];
      if (sourceType === 'production' && row!.catalogItemId && !frozen?.id)
        fail(409, 'Dòng LSX thiếu snapshot mã nội bộ. Cần đối soát trước ghi kho.');
      if (
        (sourceType === 'production' && frozen?.id && frozen.id !== item.id) ||
        (stored && stored.catalogItemId !== item.id)
      )
        fail(409, 'Mã NVL khác mã đã xác nhận trên nguồn hoặc phiếu trước.');
      if (!frozen?.id && !stored && body.confirmMapping !== true)
        fail(400, 'Cần xác nhận mã nội bộ cho dòng nguồn chưa liên kết.');
      let factor: number;
      try {
        factor = conversionFactor(item, String(row!.unit || ''));
      } catch (error) {
        throw new WarehouseValidationError(error instanceof Error ? error.message : 'Đơn vị chưa có quy đổi.');
      }
      if (
        (stored && stored.factor !== factor) ||
        (frozen?.id && (frozen.factor !== factor || frozen.baseUnit !== item.baseUnit))
      )
        fail(409, 'Quy đổi đã thay đổi; cần đối soát trước khi ghi kho.');
      const quantity = warehouseQuantity(inputLine.quantity),
        baseQuantity = warehouseQuantity(roundStock(quantity * factor));
      const sign = kind === 'production_issue' ? -1 : 1;
      const rollCode = inputLine.rollCode !== undefined ? text(inputLine.rollCode, 100) : '';
      const remainingMeters =
        inputLine.remainingMeters !== undefined && inputLine.remainingMeters !== ''
          ? warehouseQuantity(Number(inputLine.remainingMeters))
          : undefined;
      return {
        sourceLine: inputLine.sourceLine,
        catalogItemId: item.id,
        code: frozen?.id ? String(frozen.code) : item.code,
        name: frozen?.id ? String(frozen.name) : item.name,
        unit: normalizeUnit(String(row!.unit)),
        quantity,
        factor,
        baseUnit: item.baseUnit,
        baseQuantity,
        delta: sign * baseQuantity,
        catalogRevision: frozen?.id ? Number(frozen.revision) : item.revision,
        ...(rollCode ? { rollCode } : {}),
        ...(remainingMeters !== undefined ? { remainingMeters } : {})
      };
    });
    for (const line of lines) {
      const entry = nextState.lines[line.sourceLine] || {
        catalogItemId: line.catalogItemId,
        factor: line.factor,
        quantity: 0,
        unit: line.unit
      };
      const effect =
        (effectiveKind === 'purchase_receipt' || effectiveKind === 'production_issue' ? 1 : -1) *
        (action === 'reverse' ? -1 : 1) *
        line.baseQuantity;
      entry.quantity = roundStock(entry.quantity + effect);
      if (entry.quantity < 0)
        fail(409, 'Không hoàn vượt lượng đã cấp; muốn đảo phiếu cấp phải đảo phiếu hoàn liên quan trước.');
      if (sourceType === 'purchase' && action !== 'reverse') {
        const index = rows.findIndex((row, index) => sourceLine(sourceType, row, index) === line.sourceLine);
        if (entry.quantity > roundStock(warehouseQuantity(Number(rows[index].quantity)) * line.factor))
          fail(409, 'Số lượng nhận vượt lượng đặt còn lại.');
      }
      nextState.lines[line.sourceLine] = entry;
    }
    const balances = new Map<string, WarehouseBalance>();
    const expected =
      body.expectedBalances && typeof body.expectedBalances === 'object' ? (body.expectedBalances as Data) : {};
    for (const catalogId of new Set(lines.map(line => line.catalogItemId))) {
      const previous = (await tx.get(firestore.collection('warehouse_balances').doc(catalogId))).data() as
        WarehouseBalance | undefined;
      if (expected[catalogId] !== (previous?.revision || 0))
        fail(409, 'Tồn kho vừa thay đổi. Tải lại số tồn trước khi ghi sổ.');
      const line = lines.find(line => line.catalogItemId === catalogId)!;
      const delta = roundStock(
        lines.filter(line => line.catalogItemId === catalogId).reduce((sum, line) => sum + line.delta, 0)
      );
      const quantity = roundStock((previous?.quantity || 0) + delta);
      if (delta < 0 && quantity < 0 && (body.allowNegative !== true || !text(body.negativeReason)))
        fail(
          409,
          `${line.code}: xuất vượt tồn, số dư sau ghi ${quantity} ${line.baseUnit}. Cần xác nhận xuất âm và lý do.`,
          'warehouse/negative-confirmation'
        );
      balances.set(catalogId, {
        id: catalogId,
        code: line.code,
        name: line.name,
        unit: line.baseUnit,
        quantity,
        minQuantity: previous?.minQuantity ?? null,
        revision: (previous?.revision || 0) + 1,
        updatedAt: now
      });
    }
    const note = text(body.note);
    if (!note) fail(400, 'Nhập nội dung/lý do ghi sổ.');
    // D-MA1: PN/PX-YYMM-NNNN shared with the finished-goods store; older vouchers keep their KHO- codes.
    const codes = await documentCodeIssuer(tx, firestore, stockVoucherPrefix(kind, original?.kind), new Date(now));
    const requestSourceRef =
      sourceType === 'purchase' && source.procurementRequestId
        ? firestore.collection('procurement_requests').doc(id(source.procurementRequestId))
        : null;
    const requestSource = requestSourceRef ? (await tx.get(requestSourceRef)).data() : undefined;
    const poRef =
      sourceType === 'purchase' && source.linkedPoId ? firestore.collection('pos').doc(id(source.linkedPoId)) : null;
    const po = poRef ? (await tx.get(poRef)).data() : undefined;
    const relatedRequests = poRef
      ? (await tx.get(firestore.collection('procurement_requests').where('poId', '==', poRef.id))).docs
      : [];
    // All source/progress/stock reads precede all writes; one transaction serializes competing receipts/returns.
    const voucher: WarehouseVoucher = {
      id: requestId,
      code: codes.next(),
      warehouseId: 'raw_main',
      kind,
      sourceId,
      sourceCode: original?.sourceCode || String(source.purCode || source.lsxCode || sourceId),
      sourceType,
      ...(sourceType === 'production' && (original?.customerId || source.customerId)
        ? { customerId: String(original?.customerId || source.customerId) }
        : {}),
      ...(sourceType === 'production' && (original?.customerName || source.customerName)
        ? { customerName: String(original?.customerName || source.customerName) }
        : {}),
      lines,
      postedAt: now,
      postingDate: today,
      actorId: actor.uid,
      actorName: actor.displayName,
      note,
      negativeReason: text(body.negativeReason),
      ...(original ? { reversalOf: original.id } : {})
    };
    nextState.revision += 1;
    const complete =
      sourceType === 'purchase' &&
      rows.every((row, index) => {
        const entry = nextState.lines[sourceLine(sourceType, row, index)];
        return entry && entry.quantity >= roundStock(Number(row.quantity) * entry.factor);
      });
    const purchaseStatus = complete
      ? 'received'
      : Object.values(nextState.lines).some(line => line.quantity > 0)
        ? 'partially_received'
        : 'ordered';
    const result = { success: true, id: voucher.id, code: voucher.code };
    for (const [catalogId, balance] of balances)
      tx.set(firestore.collection('warehouse_balances').doc(catalogId), balance);
    tx.set(stateRef, nextState);
    tx.set(firestore.collection('warehouse_vouchers').doc(requestId), voucher);
    if (originalRef) tx.update(originalRef, { reversedBy: requestId });
    if (sourceType === 'purchase')
      tx.update(sourceRef, {
        status: purchaseStatus,
        warehouseReceiptRevision: nextState.revision,
        warehouseReceivedComplete: complete,
        actualReceiveDate: complete ? now : '',
        updatedAt: now,
        updatedBy: actor.displayName
      });
    if (requestSource && requestSourceRef && requestSource.purchaseOrderId === sourceId)
      tx.update(requestSourceRef, {
        status: purchaseStatus,
        warehouseReceiptRevision: nextState.revision,
        updatedAt: now,
        updatedBy: actor.displayName
      });
    if (po && poRef && requestSource && requestSource.purchaseOrderId === sourceId) {
      const allReceived =
        complete &&
        relatedRequests.every(
          doc =>
            doc.id === requestSourceRef!.id || doc.data().status === 'received' || doc.data().status === 'cancelled'
        );
      const logs = Array.isArray(po.historyLogs) ? po.historyLogs : [];
      tx.update(poRef, {
        purchaseProgress: allReceived ? 'materials_received' : 'supplier_ordered',
        historyLogs: [
          ...logs,
          {
            status: po.status || '',
            updatedBy: actor.displayName,
            updatedAt: now,
            note: `${voucher.code}: ${WAREHOUSE_NOTE[kind]} ${voucher.sourceCode}.`
          }
        ]
      });
    }
    codes.commit();
    tx.set(requestRef, { digest, actorId: actor.uid, result, createdAt: now });
    tx.set(firestore.collection('audit_events').doc(), {
      actorId: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      category: 'business',
      module: 'inventory',
      action: `warehouse_${kind}`,
      summary: `${voucher.code} · ${voucher.sourceCode}`,
      targetId: voucher.id,
      lines,
      note,
      negativeReason: voucher.negativeReason,
      sourceFingerprint: fingerprint,
      occurredAt: now,
      createdAt: now,
      sessionId: 'warehouse-api'
    });
    return result;
  });
}
