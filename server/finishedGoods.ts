import { assertPhysicalSourceUnbilled } from './financeSourceGuard.js';
import { createHash } from 'node:crypto';
import { getPOQueueStatus } from '../src/features/sales/model/poWorkflow.js';
import type { CatalogItem } from '../src/features/catalog/model/itemCatalog.js';
import { conversionFactor, normalizeUnit } from '../src/features/catalog/model/itemCatalog.js';
import { itemIdentity, lineSnapshot, type ProductionPO } from '../src/features/production/model/productionOrder.js';
import {
  roundStock,
  warehouseDate,
  warehouseQuantity,
  type WarehouseActor
} from '../src/features/inventory/model/warehouse.js';
import {
  canConfirmGoods,
  canPostGoods,
  canReadGoods,
  GOODS_KINDS,
  goodsOutstanding,
  goodsTransit,
  validateGoodsCounters,
  type GoodsBalance,
  type GoodsDispatchState,
  type GoodsKind,
  type GoodsLine,
  type GoodsOrderState,
  type GoodsSourceState,
  type GoodsVoucher
} from '../src/features/inventory/model/finishedGoods.js';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { productionCatalogReader } from './productionCatalog.js';
import { goodsSourceFingerprintInput, poFingerprintInput } from '../src/features/inventory/model/sourceFingerprints.js';

type Data = Record<string, unknown>;
const fail = (status: number, message: string): never => {
  throw new AdminApiError(status, message, 'goods/error');
};
const id = (value: unknown): string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value)
    ? value
    : fail(400, 'Định danh chứng từ không hợp lệ.');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value: unknown, max = 1000) =>
  typeof value === 'string' && value.trim().length <= max
    ? value.trim()
    : fail(400, `Nội dung không hợp lệ, tối đa ${max} ký tự.`);
const rows = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);
export const poStamp = (po: Data) => hash(poFingerprintInput(po));
export const sourceStamp = (source: Data, type: 'production' | 'purchase') =>
  hash(goodsSourceFingerprintInput(source, type));
const sourceUsed = (line: GoodsSourceState['lines'][string]) =>
  roundStock(
    line.received + line.directSent - line.directFailed + line.failedIntoCompany - (line.directCustomerReturned || 0)
  );
const sourceReceived = (line: GoodsSourceState['lines'][string]) =>
  roundStock(line.received + line.directDelivered + line.failedIntoCompany - (line.directCustomerReturned || 0));

/**
 * Receipt sources of a completed order. A multi-PO order is split per PO (`<orderId>--<poId>`) because a
 * receipt voucher always belongs to one PO; `documentId` keeps the order the voucher is posted against.
 */
function productionReceiptSources(source: Data & { id: string }) {
  const lines = rows(source.lines);
  const poIds = [...new Set(lines.map(row => String(row.poId || source.poId)))];
  return poIds.map(poId => ({
    id: poIds.length > 1 ? `${source.id}--${poId}` : source.id,
    documentId: source.id,
    code:
      poIds.length > 1
        ? `${source.lsxCode || source.id} · ${lines.find(row => row.poId === poId)?.poCode || poId}`
        : source.lsxCode || source.id,
    type: 'production',
    poId,
    // Each receipt belongs to one PO, so it carries that PO's customer even when the order mixes customers.
    customerId: String(lines.find(row => row.poId === poId)?.customerId || source.customerId || ''),
    customerName: String(lines.find(row => row.poId === poId)?.customerName || source.customerName || ''),
    blocked: '',
    lines: lines
      .filter(row => String(row.poId || source.poId) === poId)
      .map(row => ({
        id: String(row.lineId || row.itemId),
        poItemId: row.itemId,
        name: row.productName || '',
        unit: row.unit || '',
        quantity: Number(row.goodQuantity || 0),
        ...(Number(row.surplusQuantity) > 0 ? { surplusQuantity: Number(row.surplusQuantity) } : {}),
        catalogItemId: (row.catalog as Data | undefined)?.id || ''
      }))
  }));
}

/** Quantity-only finished goods and delivery events. All writes are deferred until every read/validation finishes. */
export async function manageFinishedGoods(actor: WarehouseActor, body: Data) {
  if (!canReadGoods(actor)) fail(403, 'Bạn không có quyền xem kho thành phẩm / hàng giao.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 450_000)
    fail(400, 'Phiếu quá lớn. Tối đa 50 dòng và ảnh POD 250 KB.');
  const { firestore } = getFirebaseAdminServices();
  if (body.action === 'load')
    return firestore.runTransaction(async tx => {
      const names = [
        'item_catalog',
        'warehouse_balances',
        'warehouse_vouchers',
        'goods_order_state',
        'goods_source_state',
        'goods_dispatch_state',
        'pos',
        'production_commands',
        'purchase_orders',
        'deliveries'
      ];
      const snapshots = await Promise.all(names.map(name => tx.get(firestore.collection(name))));
      const list = (index: number): (Data & { id: string })[] =>
        snapshots[index].docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const sourceStates = list(4),
        orderStates = list(3);
      return {
        success: true,
        items: list(0).filter(item => ['finished_good', 'resale'].includes(String(item.kind))),
        balances: list(1).filter(row => row.warehouseId === 'finished_main'),
        vouchers: list(2).filter(row => row.warehouseId === 'finished_main'),
        orderStates,
        sourceStates,
        dispatchStates: list(5),
        orders: list(6)
          .filter(po => !po.deleted)
          .map(po => ({
            id: po.id,
            code: po.poCode || po.id,
            customerName: po.customerName || '',
            status: po.status,
            legacyDelivered:
              !orderStates.some(state => state.id === po.id) &&
              (rows(po.items).some(row => Number(row.qtyDelivered) > 0) ||
                po.deliveryProgress === 'delivered_with_tolerance'),
            lines: rows(po.items).map((row, index) => ({
              id: itemIdentity(row, index),
              name: `${row.productCode || ''} ${row.productName || ''}`.trim(),
              unit: row.unit || '',
              quantity: Number(row.quantity)
            }))
          })),
        sources: [
          ...list(7)
            .filter(row => row.productionOrderVersion === 2 && row.status === 'completed' && !row.deleted)
            .flatMap(productionReceiptSources),
          ...list(8)
            .filter(
              row =>
                ['finished_good', 'subcontract'].includes(String(row.sourcingType)) &&
                !row.deleted &&
                row.status !== 'cancelled'
            )
            .map(source => ({
              id: source.id,
              code: source.purCode || source.id,
              type: 'purchase',
              poId: source.linkedPoId || '',
              blocked:
                source.status === 'received' && !sourceStates.some(state => state.id === `purchase_${source.id}`)
                  ? 'Đã nhận theo luồng cũ; cần đối soát'
                  : '',
              lines: rows(source.items).map((row, index) => ({
                id: `line-${index}`,
                poItemId: row.poItemId || '',
                name: row.productName || row.materialName || '',
                unit: row.unit || '',
                quantity: Number(row.quantity),
                catalogItemId: ''
              }))
            }))
        ],
        trips: list(9)
          .filter(trip => !trip.deleted && !['completed', 'cancelled'].includes(String(trip.status)))
          .map(trip => ({
            id: trip.id,
            code: trip.delCode || trip.id,
            status: trip.status,
            poIds: rows(trip.orders).map(row => String(row.poId)),
            revision: Number(trip.goodsRevision || 0)
          }))
      };
    });
  const action = String(body.action),
    reversing = action === 'reverse';
  if (!['post', 'reverse', 'close_short', 'trip_status'].includes(action)) fail(400, 'Thao tác hàng hóa không hợp lệ.');
  if ((reversing || action === 'close_short') && actor.role !== 'admin')
    fail(403, 'Chỉ Admin được đảo phiếu hoặc đóng thiếu.');
  if (
    action === 'trip_status'
      ? !canConfirmGoods(actor)
      : !reversing && action !== 'close_short' && body.kind === 'delivery'
        ? !canConfirmGoods(actor)
        : !canPostGoods(actor)
  )
    fail(403, 'Bạn không có quyền ghi nghiệp vụ này.');
  const requestId = id(body.requestId),
    digest = hash(body),
    now = new Date().toISOString(),
    today = warehouseDate(new Date(now));
  return firestore.runTransaction(async tx => {
    const writes: (() => void)[] = [];
    const set = (collection: string, key: string, value: Data) =>
      writes.push(() => tx.set(firestore.collection(collection).doc(key), value));
    const update = (collection: string, key: string, value: Data) =>
      writes.push(() => tx.update(firestore.collection(collection).doc(key), value));
    const read = async (collection: string, key: string) =>
      (await tx.get(firestore.collection(collection).doc(key))).data();
    const ack = await read('goods_requests', requestId);
    if (ack) {
      if (ack.digest !== digest || ack.actorId !== actor.uid) fail(409, 'Mã yêu cầu đã dùng cho nội dung/người khác.');
      return ack.result;
    }
    if (body.postingDate !== undefined && body.postingDate !== today)
      fail(400, 'Ngày ghi sổ phải là ngày hiện tại tại Việt Nam.');
    const note = text(body.note);
    if (!note) fail(400, 'Nhập nội dung / lý do.');
    const finish = (result: Data, detail: Data) => {
      set('goods_requests', requestId, { digest, actorId: actor.uid, result, createdAt: now });
      const auditRef = firestore.collection('audit_events').doc();
      writes.push(() =>
        tx.set(auditRef, {
          actorId: actor.uid,
          actorName: actor.displayName,
          actorRole: actor.role,
          module: 'inventory',
          category: 'business',
          action: `goods_${action}`,
          summary: note,
          ...detail,
          occurredAt: now,
          createdAt: now,
          sessionId: 'goods-api'
        })
      );
      writes.forEach(write => write());
      return result;
    };
    if (action === 'trip_status') {
      const tripId = id(body.tripId),
        trip = await read('deliveries', tripId);
      if (!trip || trip.deleted) fail(404, 'Không tìm thấy chuyến.');
      if (body.expectedTripRevision !== Number(trip!.goodsRevision || 0)) fail(409, 'Chuyến vừa thay đổi. Tải lại.');
      const tripPoIds = rows(trip!.orders).map(row => row.poId);
      if (
        !tripPoIds.length ||
        tripPoIds.some(value => typeof value !== 'string' || !value) ||
        new Set(tripPoIds).size !== tripPoIds.length
      )
        fail(400, 'Chuyến cần các đơn hàng hợp lệ, không trùng dòng.');
      const nextStatus = String(body.status),
        transitions: Record<string, string[]> = {
          planning: ['approved'],
          approved: ['loading'],
          loading: ['delivering', 'postponed'],
          delivering: ['postponed'],
          postponed: ['planning']
        };
      if (!transitions[String(trip!.status)]?.includes(nextStatus)) fail(400, 'Không thể chuyển trạng thái chuyến.');
      const dispatches = (
        await tx.get(firestore.collection('goods_dispatch_state').where('tripId', '==', tripId))
      ).docs.map(doc => doc.data() as GoodsDispatchState);
      if (
        nextStatus === 'delivering' &&
        rows(trip!.orders).some(
          order =>
            !dispatches.some(
              state => state.poId === order.poId && Object.values(state.lines).some(line => goodsTransit(line) > 0)
            )
        )
      )
        fail(400, 'Ghi phiếu xuất cho từng đơn hàng trong chuyến trước khi xuất phát.');
      const vehicleId = id(trip!.vehicleId),
        vehicle = await read('delivery_vehicles', vehicleId);
      if (
        !vehicle ||
        vehicle.status === 'maintenance' ||
        vehicle.status === 'inactive' ||
        (vehicle.activeGoodsTripId && vehicle.activeGoodsTripId !== tripId) ||
        (vehicle.status === 'running' && vehicle.activeGoodsTripId !== tripId)
      )
        fail(409, 'Xe không sẵn sàng hoặc đang chạy chuyến khác.');
      const running = ['loading', 'delivering'].includes(nextStatus);
      update('deliveries', tripId, {
        status: nextStatus,
        goodsFlowVersion: 1,
        goodsRevision: Number(trip!.goodsRevision || 0) + 1,
        updatedAt: now,
        updatedBy: actor.displayName,
        ...(nextStatus === 'delivering' ? { departedAt: now } : {})
      });
      update('delivery_vehicles', vehicleId, {
        status: running ? 'running' : 'ready',
        activeGoodsTripId: running ? tripId : '',
        updatedAt: now
      });
      return finish({ success: true }, { tripId, from: trip!.status, to: nextStatus, note });
    }
    const original = reversing
      ? ((await read('warehouse_vouchers', id(body.voucherId))) as GoodsVoucher | undefined)
      : undefined;
    if (
      reversing &&
      (!original || original.warehouseId !== 'finished_main' || original.kind === 'reversal' || original.reversedBy)
    )
      fail(409, 'Phiếu không tồn tại hoặc đã được đảo.');
    if (original) await assertPhysicalSourceUnbilled(tx, firestore, id(body.voucherId));
    const kind = (original?.kind || (action === 'close_short' ? 'close_short' : body.kind)) as GoodsKind;
    if (!Object.hasOwn(GOODS_KINDS, kind) || kind === 'reversal') fail(400, 'Loại phiếu không hợp lệ.');
    const surplusReceipt = kind === 'production_surplus_receipt';
    const receipt = kind === 'production_receipt' || surplusReceipt || kind === 'purchase_receipt';
    const newDispatch = kind === 'dispatch' || kind === 'supplier_dispatch';
    const direct = kind === 'supplier_dispatch';
    const dispatchId =
      original?.dispatchId || (!receipt && !newDispatch && kind !== 'close_short' ? id(body.dispatchId) : '');
    const dispatch = dispatchId
      ? ((await read('warehouse_vouchers', dispatchId)) as GoodsVoucher | undefined)
      : undefined;
    if (
      dispatchId &&
      (!dispatch ||
        !['dispatch', 'supplier_dispatch'].includes(dispatch.kind) ||
        dispatch.reversedBy ||
        dispatch.warehouseId !== 'finished_main')
    )
      fail(409, 'Phiếu xuất gốc không hợp lệ hoặc đã đảo.');
    const sourceType =
      kind === 'production_receipt' || surplusReceipt
        ? 'production'
        : kind === 'purchase_receipt' || direct
          ? 'purchase'
          : dispatch
            ? 'dispatch'
            : 'po';
    const sourceId =
      original?.sourceId ||
      (dispatch ? dispatch.id : kind === 'close_short' || kind === 'dispatch' ? id(body.poId) : id(body.sourceId));
    const source =
      sourceType === 'production'
        ? await read('production_commands', sourceId)
        : sourceType === 'purchase'
          ? await read('purchase_orders', sourceId)
          : undefined;
    if (['production', 'purchase'].includes(sourceType) && !source) fail(404, 'Không tìm thấy chứng từ nguồn.');
    const productionPoIds =
      sourceType === 'production' && source
        ? [...new Set(rows(source.lines).map(row => String(row.poId || source.poId)))]
        : [];
    const poId =
      original?.poId ||
      dispatch?.poId ||
      (sourceType === 'production' && productionPoIds.length > 1
        ? productionPoIds.includes(id(body.poId))
          ? String(body.poId)
          : fail(400, 'Chọn đơn hàng thuộc lệnh sản xuất này.')
        : source
          ? String(sourceType === 'production' ? source.poId : source.linkedPoId || '')
          : id(body.poId));
    id(poId);
    const po: Data = (await read('pos', poId)) || fail(404, 'Không tìm thấy đơn hàng nguồn.');
    if (po.deleted && !reversing) fail(400, 'Đơn hàng đã xóa.');
    if (
      !reversing &&
      ['cancelled', 'completed'].includes(String(po.status)) &&
      (receipt || newDispatch || kind === 'close_short')
    )
      fail(400, 'Đơn hàng đã hoàn tất/hủy; chỉ xử lý phiếu giao/hoàn đang có.');
    const poRows = rows(po.items),
      identities = poRows.map(itemIdentity);
    if (new Set(identities).size !== identities.length) fail(400, 'Đơn hàng trùng ID dòng, cần đối soát.');
    const oldOrder = (await read('goods_order_state', poId)) as GoodsOrderState | undefined;
    if (
      (!oldOrder && poRows.some(row => Number(row.qtyDelivered) > 0)) ||
      (!oldOrder && po.deliveryProgress === 'delivered_with_tolerance')
    )
      fail(409, 'Đơn hàng có giao/đóng thiếu theo luồng cũ. Cần đối soát trước khi dùng sổ mới.');
    const order: GoodsOrderState = oldOrder
      ? structuredClone(oldOrder)
      : { id: poId, fingerprint: poStamp(po), revision: 0, lines: {} };
    if (!reversing && order.fingerprint !== poStamp(po))
      fail(409, 'Đơn hàng đã đổi nội dung sau ghi sổ. Cần đối soát.');
    if (body.expectedOrderRevision !== order.revision) fail(409, 'Tiến độ đơn hàng vừa thay đổi. Tải lại.');
    const purchaseId = original?.purchaseId || (sourceType === 'purchase' ? sourceId : dispatch?.purchaseId || '');
    const sourceStateId =
      sourceType === 'production' || sourceType === 'purchase'
        ? `${sourceType}_${sourceId}`
        : purchaseId
          ? `purchase_${purchaseId}`
          : '';
    const sourceData = source || (purchaseId ? await read('purchase_orders', purchaseId) : undefined);
    const oldSource = sourceStateId
      ? ((await read('goods_source_state', sourceStateId)) as GoodsSourceState | undefined)
      : undefined;
    const sourceState: GoodsSourceState | undefined = sourceStateId
      ? oldSource
        ? structuredClone(oldSource)
        : {
            id: sourceStateId,
            fingerprint: sourceStamp(sourceData || {}, sourceType === 'production' ? 'production' : 'purchase'),
            revision: 0,
            lines: {}
          }
      : undefined;
    if (sourceData && !reversing) {
      if (sourceData.deleted || sourceData.status === 'cancelled') fail(400, 'Chứng từ nguồn đã hủy/xóa.');
      if (sourceType === 'production' && (sourceData.productionOrderVersion !== 2 || sourceData.status !== 'completed'))
        fail(400, 'Chỉ nhập sản lượng LSX v2 đã đạt QC.');
      if (
        purchaseId &&
        (!['finished_good', 'subcontract'].includes(String(sourceData.sourcingType)) ||
          (!oldSource && sourceData.status === 'received'))
      )
        fail(409, 'Đơn mua không hợp lệ hoặc đã nhận theo luồng cũ.');
      if (sourceState!.fingerprint !== sourceStamp(sourceData, sourceType === 'production' ? 'production' : 'purchase'))
        fail(409, 'Chứng từ nguồn đã đổi sau ghi sổ.');
    }
    const tripId = original?.tripId || dispatch?.tripId || (kind === 'dispatch' ? id(body.tripId) : '');
    const trip = tripId ? await read('deliveries', tripId) : undefined;
    if (tripId && (!trip || trip.deleted || !rows(trip.orders).some(row => row.poId === poId)))
      fail(400, 'Chuyến không chứa đơn hàng này.');
    if (!reversing && kind === 'dispatch' && !['planning', 'approved', 'loading'].includes(String(trip!.status)))
      fail(400, 'Chỉ xuất kho trước khi chuyến xuất phát.');
    if (!reversing && kind === 'delivery' && trip && trip.status !== 'delivering') fail(400, 'Chuyến chưa xuất phát.');
    const currentDispatchId = newDispatch ? (reversing ? original!.id : requestId) : dispatchId;
    const oldDispatch = currentDispatchId
      ? ((await read('goods_dispatch_state', currentDispatchId)) as GoodsDispatchState | undefined)
      : undefined;
    const dispatchState: GoodsDispatchState | undefined = currentDispatchId
      ? oldDispatch
        ? structuredClone(oldDispatch)
        : { id: currentDispatchId, tripId, poId, revision: 0, lines: {} }
      : undefined;
    const sourceRows = sourceData ? rows(sourceData[sourceType === 'production' ? 'lines' : 'items']) : [];
    const input = reversing ? original!.lines : body.lines;
    if (
      !Array.isArray(input) ||
      !input.length ||
      input.length > 50 ||
      input.some(row => !row || typeof row !== 'object')
    )
      fail(400, 'Phiếu cần 1–50 dòng hợp lệ.');
    const inputs = input as Data[];
    if (new Set(inputs.map(row => row.sourceLine)).size !== inputs.length) fail(400, 'Phiếu bị trùng dòng.');
    const lines: GoodsLine[] = [];
    const catalogReader = productionCatalogReader(tx, firestore, { ...po, id: poId } as ProductionPO);
    for (const entry of inputs) {
      if (reversing) {
        const line = entry as unknown as GoodsLine;
        lines.push({ ...line, delta: -line.delta });
        continue;
      }
      const sourceLine = id(entry.sourceLine),
        frozenLine = dispatch?.lines.find(line => line.sourceLine === sourceLine);
      if (sourceType === 'purchase' && !/^line-(0|[1-9]\d*)$/.test(sourceLine)) fail(400, 'ID dòng mua không hợp lệ.');
      const row =
        sourceType === 'production'
          ? sourceRows.find(
              row => (row.lineId || row.itemId) === sourceLine && String(row.poId || sourceData!.poId) === poId
            )
          : sourceType === 'purchase'
            ? sourceRows[Number(sourceLine.replace(/^line-/, ''))]
            : undefined;
      if ((receipt || direct) && !row) fail(400, 'Dòng chứng từ nguồn không tồn tại.');
      const storedSource = sourceState?.lines[sourceLine];
      const sourcePoItemId = String(row?.poItemId || '');
      if (
        sourceType === 'purchase' &&
        identities.includes(sourcePoItemId) &&
        entry.poItemId &&
        entry.poItemId !== sourcePoItemId
      )
        fail(409, 'Không được đổi dòng đơn hàng đã có trên đơn mua.');
      const poItemId =
        frozenLine?.poItemId ||
        storedSource?.poItemId ||
        (sourceType === 'production'
          ? String(row?.itemId || sourceLine)
          : sourceType === 'purchase'
            ? identities.includes(sourcePoItemId)
              ? sourcePoItemId
              : String(entry.poItemId || '')
            : sourceLine);
      const poIndex = identities.indexOf(poItemId),
        poRow = poRows[poIndex];
      if (poIndex < 0) fail(400, 'Chọn đúng dòng đơn hàng cho hàng mua, không ghép theo mã/tên.');
      const catalogItemId = frozenLine?.catalogItemId || id(entry.catalogItemId);
      const item = (await read('item_catalog', catalogItemId)) as CatalogItem | undefined;
      if (
        !item?.active ||
        !['finished_good', 'resale'].includes(item.kind) ||
        (sourceType === 'production' && item.kind !== 'finished_good')
      )
        fail(400, 'Chọn mã thành phẩm/hàng mua đang hoạt động.');
      const frozen = sourceType === 'production' ? (row!.catalog as Data | undefined) : undefined;
      const previous = order.lines[poItemId];
      const resolved =
        !previous && !frozen
          ? (await catalogReader.line(lineSnapshot(poRow, poIndex, Number(poRow.quantity)))).catalog
          : undefined;
      const requiredId = previous?.catalogItemId || frozen?.id || resolved?.id || storedSource?.catalogItemId;
      if (requiredId && requiredId !== catalogItemId) fail(409, 'Mã nội bộ khác ánh xạ đã xác nhận.');
      if (!requiredId && body.confirmMapping !== true) fail(400, 'Xác nhận mã nội bộ và dòng đơn hàng đã chọn.');
      if (sourceType === 'purchase' && !storedSource && body.confirmMapping !== true)
        fail(400, 'Xác nhận mã nội bộ và dòng đơn hàng cho hàng mua.');
      const unit = frozenLine?.unit || String(row?.unit || poRow.unit || ''),
        factor = conversionFactor(item!, unit),
        poFactor = conversionFactor(item!, String(poRow.unit || ''));
      if (
        (frozen &&
          (frozen.factor !== factor ||
            frozen.baseUnit !== item!.baseUnit ||
            frozen.sourceUnit !== normalizeUnit(unit))) ||
        (previous && (previous.factor !== poFactor || previous.baseUnit !== item!.baseUnit)) ||
        (storedSource &&
          (storedSource.factor !== factor ||
            storedSource.catalogItemId !== catalogItemId ||
            storedSource.poItemId !== poItemId))
      )
        fail(409, 'Quy đổi/ánh xạ đã đổi. Cần đối soát.');
      const quantity = warehouseQuantity(
          kind === 'close_short'
            ? previous
              ? goodsOutstanding(previous) / poFactor
              : Number(poRow.quantity)
            : entry.quantity
        ),
        baseQuantity = warehouseQuantity(roundStock(quantity * factor));
      const delta =
        kind === 'dispatch'
          ? -baseQuantity
          : receipt ||
              (['customer_return', 'failed_return'].includes(kind) &&
                !(body.returnToSupplier === true && dispatch?.kind === 'supplier_dispatch'))
            ? baseQuantity
            : 0;
      if (
        body.returnToSupplier === true &&
        (!['customer_return', 'failed_return'].includes(kind) || dispatch?.kind !== 'supplier_dispatch')
      )
        fail(400, 'Chỉ hàng NCC giao thẳng mới được hoàn về NCC.');
      const name = String(frozen?.name || item!.name),
        code = String(frozen?.code || item!.code);
      order.lines[poItemId] ||= {
        catalogItemId,
        code,
        name,
        unit: normalizeUnit(String(poRow.unit)),
        baseUnit: item!.baseUnit,
        factor: poFactor,
        required: roundStock(warehouseQuantity(Number(poRow.quantity)) * poFactor),
        sent: 0,
        delivered: 0,
        failedReturned: 0,
        customerReturned: 0,
        closedShort: 0
      };
      if (sourceState && (receipt || direct))
        sourceState.lines[sourceLine] ||= {
          catalogItemId,
          poItemId,
          factor,
          received: 0,
          directSent: 0,
          directDelivered: 0,
          directFailed: 0,
          failedIntoCompany: 0,
          directCustomerReturned: 0
        };
      const rollCode = entry.rollCode !== undefined ? text(entry.rollCode, 100) : '';
      const remainingMeters =
        entry.remainingMeters !== undefined && entry.remainingMeters !== ''
          ? warehouseQuantity(Number(entry.remainingMeters))
          : undefined;
      lines.push({
        sourceLine,
        poItemId,
        catalogItemId,
        code,
        name,
        unit: normalizeUnit(unit),
        poUnit: normalizeUnit(String(poRow.unit)),
        poFactor,
        factor,
        quantity,
        baseQuantity,
        baseUnit: item!.baseUnit,
        delta,
        catalogRevision: Number(frozen?.revision || item!.revision),
        ...(rollCode ? { rollCode } : {}),
        ...(remainingMeters !== undefined ? { remainingMeters } : {})
      });
    }
    if (kind === 'close_short' && !reversing) {
      const confirmation = text(body.customerConfirmation, 1000);
      if (!confirmation) fail(400, 'Nhập xác nhận khách chấp nhận phần thiếu.');
      if (Object.values(order.lines).some(line => goodsTransit(line) > 0))
        fail(400, 'Còn hàng đang giao, chưa được đóng thiếu.');
      if (poRows.some((_, index) => !order.lines[identities[index]] && Number(poRows[index].quantity) > 0))
        fail(400, 'Cần đối soát mã của toàn bộ dòng đơn hàng trước khi đóng thiếu.');
    }
    const sign = reversing ? -1 : 1;
    for (const line of lines) {
      const orderLine = order.lines[line.poItemId];
      if (!orderLine || orderLine.catalogItemId !== line.catalogItemId) fail(409, 'Ánh xạ đơn hàng cần đối soát.');
      const amount = sign * line.baseQuantity;
      if (newDispatch) orderLine.sent = roundStock(orderLine.sent + amount);
      if (kind === 'delivery') orderLine.delivered = roundStock(orderLine.delivered + amount);
      if (kind === 'failed_return') orderLine.failedReturned = roundStock(orderLine.failedReturned + amount);
      if (kind === 'customer_return') orderLine.customerReturned = roundStock(orderLine.customerReturned + amount);
      if (kind === 'close_short') orderLine.closedShort = roundStock(orderLine.closedShort + amount);
      validateGoodsCounters(orderLine);
      if (dispatchState) {
        const state = (dispatchState.lines[line.sourceLine] ||= {
          sent: 0,
          delivered: 0,
          failedReturned: 0,
          customerReturned: 0
        });
        if (newDispatch) state.sent = roundStock(state.sent + amount);
        if (kind === 'delivery') state.delivered = roundStock(state.delivered + amount);
        if (kind === 'failed_return') state.failedReturned = roundStock(state.failedReturned + amount);
        if (kind === 'customer_return') state.customerReturned = roundStock(state.customerReturned + amount);
        if (
          [state.sent, state.delivered, state.failedReturned, state.customerReturned].some(value => value < 0) ||
          goodsTransit(state) < 0 ||
          state.customerReturned > state.delivered
        )
          fail(409, 'Vượt lượng phiếu xuất gốc hoặc cần đảo phiếu sau trước.');
      }
      if (sourceState) {
        const sourceKey = dispatch
          ? dispatch.lines.find(row => row.sourceLine === line.sourceLine)!.sourceLine
          : line.sourceLine;
        const state = sourceState.lines[sourceKey];
        if (!state) fail(409, 'Thiếu trạng thái nguồn. Cần đối soát.');
        if (surplusReceipt) state!.surplusReceived = roundStock((state!.surplusReceived || 0) + amount);
        else if (receipt) state!.received = roundStock(state!.received + amount);
        if (direct) state!.directSent = roundStock(state!.directSent + amount);
        if (dispatch?.kind === 'supplier_dispatch') {
          if (kind === 'delivery') state!.directDelivered = roundStock(state!.directDelivered + amount);
          if (kind === 'failed_return') {
            state!.directFailed = roundStock(state!.directFailed + amount);
            if (!(original?.returnToSupplier ?? body.returnToSupplier === true))
              state!.failedIntoCompany = roundStock(state!.failedIntoCompany + amount);
          }
          if (kind === 'customer_return' && (original?.returnToSupplier ?? body.returnToSupplier === true))
            state!.directCustomerReturned = roundStock((state!.directCustomerReturned || 0) + amount);
        }
        const sourceRow =
          sourceType === 'production'
            ? sourceRows.find(row => (row.lineId || row.itemId) === sourceKey)
            : sourceRows[Number(sourceKey.replace(/^line-/, ''))];
        if (surplusReceipt) {
          const surplusCap = Number(sourceRow?.surplusQuantity || 0);
          if (!(surplusCap > 0)) fail(409, 'Dòng LSX không có SL dư được nghiệm thu.');
          const validSurplusCap = warehouseQuantity(surplusCap);
          if (
            (state!.surplusReceived || 0) < 0 ||
            (state!.surplusReceived || 0) > roundStock(validSurplusCap * state!.factor)
          )
            fail(409, 'Vượt SL dư đã nghiệm thu hoặc cần đảo phiếu sau trước.');
        } else {
          const cap = warehouseQuantity(
            Number(sourceType === 'production' ? sourceRow?.goodQuantity : sourceRow?.quantity)
          );
          if (
            Object.entries(state!).some(
              ([key, value]) =>
                [
                  'received',
                  'directSent',
                  'directDelivered',
                  'directFailed',
                  'failedIntoCompany',
                  'directCustomerReturned'
                ].includes(key) && Number(value) < 0
            ) ||
            state!.directDelivered + state!.directFailed > state!.directSent ||
            state!.failedIntoCompany > state!.directFailed ||
            (state!.directCustomerReturned || 0) > state!.directDelivered ||
            sourceUsed(state!) > roundStock(cap * state!.factor)
          )
            fail(409, 'Vượt sản lượng QC/lượng đặt còn lại hoặc cần đảo phiếu sau trước.');
        }
      }
    }
    let proof: GoodsVoucher['proof'];
    if (kind === 'delivery' && !reversing) {
      const raw = body.proof as Data | undefined;
      if (!raw || typeof raw !== 'object') fail(400, 'Cần thông tin người nhận và POD.');
      const receiverName = text(raw!.receiverName, 200),
        reference = text(raw!.reference || '', 1000),
        signatureImage = text(raw!.signatureImage || '', 250_000);
      if (
        !receiverName ||
        (!reference && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(signatureImage)) ||
        (signatureImage && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(signatureImage))
      )
        fail(400, 'Nhập người nhận và mã/link POD hoặc ảnh JPEG hợp lệ.');
      proof = { receiverName, reference, signatureImage };
    }
    const balances = new Map<string, GoodsBalance>();
    for (const catalogItemId of new Set(lines.filter(line => line.delta !== 0).map(line => line.catalogItemId))) {
      const balanceId = `fg_${catalogItemId}`,
        previous = (await read('warehouse_balances', balanceId)) as GoodsBalance | undefined;
      if ((body.expectedBalances as Data | undefined)?.[catalogItemId] !== (previous?.revision || 0))
        fail(409, 'Tồn thành phẩm vừa thay đổi. Tải lại.');
      const line = lines.find(line => line.catalogItemId === catalogItemId)!;
      const quantity = roundStock(
        (previous?.quantity || 0) +
          lines.filter(row => row.catalogItemId === catalogItemId).reduce((sum, row) => sum + row.delta, 0)
      );
      if (quantity < 0) fail(409, `${line.code}: không cho xuất âm thành phẩm.`);
      balances.set(balanceId, {
        id: balanceId,
        catalogItemId,
        warehouseId: 'finished_main',
        code: line.code,
        name: line.name,
        unit: line.baseUnit,
        quantity,
        minQuantity: previous?.minQuantity ?? null,
        revision: (previous?.revision || 0) + 1,
        updatedAt: now
      });
    }
    const allTripDispatches = tripId
      ? (await tx.get(firestore.collection('goods_dispatch_state').where('tripId', '==', tripId))).docs.map(
          doc => doc.data() as GoodsDispatchState
        )
      : [];
    const vehicleId = trip?.vehicleId ? id(trip.vehicleId) : '';
    const vehicle = vehicleId ? await read('delivery_vehicles', vehicleId) : undefined;
    const counter = await read('goods_counters', today),
      sequence = Number(counter?.sequence || 0) + 1;
    const requestSource =
      purchaseId && sourceData?.procurementRequestId
        ? await read('procurement_requests', id(sourceData.procurementRequestId))
        : undefined;
    const relatedRequests = purchaseId
      ? (await tx.get(firestore.collection('procurement_requests').where('poId', '==', poId))).docs
      : [];
    const voucher: GoodsVoucher = {
      id: requestId,
      code: `TP-${today.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`,
      warehouseId: 'finished_main',
      kind: reversing ? 'reversal' : kind,
      ...(reversing ? { originalKind: kind, reversalOf: original!.id } : {}),
      sourceType,
      sourceId,
      sourceCode:
        original?.sourceCode || String(source?.lsxCode || source?.purCode || dispatch?.code || po.poCode || poId),
      poId,
      poCode: String(po.poCode || poId),
      ...(po.customerId || source?.customerId ? { customerId: String(po.customerId || source?.customerId) } : {}),
      ...(po.customerName || source?.customerName
        ? { customerName: String(po.customerName || source?.customerName) }
        : {}),
      tripId,
      dispatchId,
      purchaseId,
      lines,
      postedAt: now,
      postingDate: today,
      actorId: actor.uid,
      actorName: actor.displayName,
      note,
      returnToSupplier: original?.returnToSupplier ?? body.returnToSupplier === true,
      ...(proof ? { proof } : {}),
      ...(kind === 'close_short' && !reversing ? { customerConfirmation: text(body.customerConfirmation) } : {})
    };
    order.revision++;
    set('goods_order_state', poId, order as unknown as Data);
    let purchaseProgress = '';
    if (sourceState) {
      sourceState.revision++;
      set('goods_source_state', sourceState.id, sourceState as unknown as Data);
      if (purchaseId && sourceData) {
        const complete = sourceRows.every((row, index) => {
          const state = sourceState.lines[`line-${index}`];
          return state && sourceReceived(state) >= roundStock(Number(row.quantity) * state.factor);
        });
        const anyReceived = Object.values(sourceState.lines).some(line => sourceReceived(line) > 0);
        const status = complete ? 'received' : anyReceived ? 'partially_received' : 'ordered';
        update('purchase_orders', purchaseId, {
          status,
          goodsReceiptRevision: sourceState.revision,
          goodsFlowVersion: 1,
          actualReceiveDate: complete ? now : '',
          updatedAt: now
        });
        if (requestSource?.purchaseOrderId === purchaseId)
          update('procurement_requests', String(sourceData.procurementRequestId), {
            status,
            goodsReceiptRevision: sourceState.revision,
            updatedAt: now
          });
        if (requestSource?.purchaseOrderId === purchaseId)
          purchaseProgress =
            complete &&
            relatedRequests.every(
              doc =>
                doc.id === sourceData.procurementRequestId ||
                ['received', 'cancelled'].includes(String(doc.data().status))
            )
              ? 'materials_received'
              : 'supplier_ordered';
      }
    }
    if (dispatchState) {
      dispatchState.revision++;
      set('goods_dispatch_state', dispatchState.id, dispatchState as unknown as Data);
    }
    const nextItems = poRows.map((row, index) => {
      const state = order.lines[identities[index]];
      return state
        ? { ...row, qtyDelivered: roundStock((state.delivered - state.customerReturned) / state.factor) }
        : row;
    });
    const allDelivered = identities.every(key => {
      const state = order.lines[key];
      return state && roundStock(state.delivered - state.customerReturned + state.closedShort) >= state.required;
    });
    const hasShort = Object.values(order.lines).some(line => line.closedShort > 0);
    const hasDelivered = Object.values(order.lines).some(line => line.delivered - line.customerReturned > 0);
    const hasTransit = Object.values(order.lines).some(line => goodsTransit(line) > 0);
    const onlyReceipt = receipt;
    const needsDispatch = identities.some((key, index) =>
      order.lines[key] ? goodsOutstanding(order.lines[key]) > 0 : Number(poRows[index].quantity) > 0
    );
    update('pos', poId, {
      goodsFlowVersion: 1,
      goodsRevision: order.revision,
      goodsReady: needsDispatch,
      goodsDeliveryClosed: allDelivered,
      items: nextItems,
      ...(purchaseProgress ? { purchaseProgress } : {}),
      ...(!onlyReceipt
        ? {
            workflowVersion: 2,
            status: allDelivered
              ? 'waiting_invoice'
              : getPOQueueStatus(String(po.status)) === 'waiting_production'
                ? 'waiting_production'
                : 'waiting_delivery',
            deliveryStage: 'customer_outbound',
            deliveryProgress: allDelivered
              ? hasShort
                ? 'delivered_with_tolerance'
                : 'delivered'
              : hasDelivered
                ? 'partial'
                : hasTransit
                  ? 'delivering'
                  : 'pending'
          }
        : {}),
      historyLogs: [
        ...rows(po.historyLogs),
        {
          status: String(po.status || ''),
          updatedBy: actor.displayName,
          updatedAt: now,
          note: `${voucher.code}: ${GOODS_KINDS[voucher.kind]} · ${note}`
        }
      ]
    });
    if (trip && tripId && dispatchState) {
      const states = [...allTripDispatches.filter(state => state.id !== dispatchState.id), dispatchState];
      const tripOrders = rows(trip.orders).map(row => {
        const relevant = states.filter(state => state.poId === row.poId),
          entries = relevant.flatMap(state => Object.values(state.lines));
        const total = entries.reduce((sum, entry) => sum + entry.sent, 0),
          transit = entries.reduce((sum, entry) => sum + goodsTransit(entry), 0);
        const received = entries.some(entry => entry.delivered - entry.customerReturned > 0),
          returned = entries.some(entry => entry.failedReturned + entry.customerReturned > 0);
        return {
          ...row,
          status: total > 0 && transit === 0 ? 'success' : 'pending',
          goodsResult: received ? (returned ? 'mixed' : 'received') : returned ? 'returned' : 'pending',
          ...(row.poId === poId && proof
            ? {
                signatureImage: proof.signatureImage,
                podReference: proof.reference,
                receiverName: proof.receiverName,
                podVoucherId: requestId
              }
            : {}),
          ...(reversing && kind === 'delivery' && row.poId === poId && row.podVoucherId === original!.id
            ? { signatureImage: '', podReference: '', receiverName: '', podVoucherId: '' }
            : {})
        };
      });
      const complete = tripOrders.length > 0 && tripOrders.every(row => row.status === 'success');
      update('deliveries', tripId, {
        goodsFlowVersion: 1,
        goodsRevision: Number(trip.goodsRevision || 0) + 1,
        orders: tripOrders,
        ...(complete
          ? { status: 'completed', completedAt: now }
          : trip.status === 'completed'
            ? { status: 'postponed', completedAt: '' }
            : {}),
        updatedAt: now
      });
      if (complete && vehicle?.activeGoodsTripId === tripId)
        update('delivery_vehicles', vehicleId, { status: 'ready', activeGoodsTripId: '', updatedAt: now });
    }
    for (const [key, balance] of balances) set('warehouse_balances', key, balance as unknown as Data);
    set('warehouse_vouchers', requestId, voucher as unknown as Data);
    if (original) update('warehouse_vouchers', original.id, { reversedBy: requestId });
    set('goods_counters', today, { sequence });
    return finish(
      { success: true, id: requestId, code: voucher.code },
      { voucherId: requestId, kind: voucher.kind, poId, sourceId, lines, note, reversalOf: original?.id || '' }
    );
  });
}
