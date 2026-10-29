import type { DebtDocument, LedgerEntry, MoneyFund } from './accountingLedger.js';
import { currentPartnerBalances } from './accountingReports.js';
import { safeStock, stockAlert, type GoodsReportRow, type StockReportRow } from './operationalReports.js';
import {
  GOODS_KINDS,
  type GoodsOrderState,
  type GoodsSourceState,
  type GoodsVoucher
} from '../../inventory/model/finishedGoods.js';
import {
  goodsSourceFingerprintInput,
  poFingerprintInput,
  rawSourceFingerprintInput
} from '../../inventory/model/sourceFingerprints.js';
import { roundStock, WAREHOUSE_KINDS, type WarehouseProgress } from '../../inventory/model/warehouse.js';
import { itemIdentity } from '../../production/model/productionOrder.js';

type Data = Record<string, unknown>;
const rows = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Báo cáo reads these collections; firestore.rules let Admin and Kế toán with the accounting page read them all. */
export const REPORT_COLLECTIONS = [
  ['documents', 'finance_documents'],
  ['funds', 'finance_funds'],
  ['entries', 'finance_entries'],
  ['invoices', 'invoices'],
  ['pos', 'pos'],
  ['purchases', 'purchase_orders'],
  ['customers', 'customers'],
  ['suppliers', 'suppliers'],
  ['goodsOrders', 'goods_order_state'],
  ['goodsSources', 'goods_source_state'],
  ['rawSources', 'warehouse_source_state'],
  ['balances', 'warehouse_balances'],
  ['vouchers', 'warehouse_vouchers'],
  ['items', 'item_catalog']
] as const;
export type ReportSnapshots = Record<(typeof REPORT_COLLECTIONS)[number][0], Data[]>;

/** Every order and purchase whose fingerprint a report compares with its recorded goods state. */
export const reportFingerprintInputs = (snapshots: ReportSnapshots): unknown[] => [
  ...snapshots.pos.map(poFingerprintInput),
  ...snapshots.purchases.flatMap(purchase => [
    rawSourceFingerprintInput('purchase', purchase),
    goodsSourceFingerprintInput(purchase, 'purchase')
  ])
];

/**
 * Period, ageing, goods-outstanding and stock figures. Read only: no migration or financial write happens here.
 * `fingerprint` hashes a source input the same way the servers did when they recorded goods state.
 */
export function buildAccountingReports(
  snapshots: ReportSnapshots,
  fingerprint: (input: unknown) => string,
  asOf: string,
  loadedAt: string
) {
  const documents = snapshots.documents as unknown as DebtDocument[],
    funds = snapshots.funds as unknown as MoneyFund[],
    entries = snapshots.entries as unknown as LedgerEntry[];
  const { pos, purchases, customers, suppliers } = snapshots;
  const orders = snapshots.goodsOrders as unknown as GoodsOrderState[],
    sources = snapshots.goodsSources as unknown as GoodsSourceState[],
    raw = snapshots.rawSources as unknown as WarehouseProgress[],
    vouchers = snapshots.vouchers as unknown as GoodsVoucher[];
  const goods: GoodsReportRow[] = [];
  const evidence = (orderId: string, lineId: string, purchase: boolean) =>
    vouchers
      .filter(v =>
        purchase
          ? v.purchaseId === orderId || (v.sourceType === 'purchase' && v.sourceId === orderId)
          : v.poId === orderId
      )
      .flatMap(v =>
        v.lines
          .filter(l => (purchase ? l.sourceLine === lineId : l.poItemId === lineId))
          .map(l => ({
            id: v.id,
            code: v.code,
            kind: v.kind,
            label:
              v.warehouseId === 'finished_main'
                ? GOODS_KINDS[v.kind]
                : WAREHOUSE_KINDS[v.kind as keyof typeof WAREHOUSE_KINDS],
            postingDate: v.postingDate,
            quantity: l.quantity,
            unit: l.unit,
            reversedBy: v.reversedBy || ''
          }))
      );
  for (const po of pos) {
    const state = orders.find(s => s.id === po.id),
      items = rows(po.items);
    if (!state && (po.deleted || ['cancelled', 'completed'].includes(str(po.status)))) continue;
    const legacy =
      !state && (items.some(l => num(l.qtyDelivered) > 0) || po.deliveryProgress === 'delivered_with_tolerance');
    const stale = !!state && state.fingerprint !== fingerprint(poFingerprintInput(po));
    for (const [i, l] of items.entries()) {
      const lineId = itemIdentity(l, i),
        p = state?.lines[lineId];
      const invalid =
        legacy || stale || (!!p && !(p.factor > 0)) || items.filter((x, j) => itemIdentity(x, j) === lineId).length > 1;
      const reconciliation = invalid
        ? 'Dữ liệu cũ / nguồn thay đổi; cần đối soát'
        : po.deleted || po.status === 'cancelled'
          ? 'Đơn đã xóa / hủy còn lịch sử hàng'
          : '';
      const factor = p?.factor || 1,
        received = invalid ? null : p ? safeStock(p.delivered - p.customerReturned, factor) : 0;
      const transit = invalid ? null : p ? safeStock(p.sent - p.delivered - p.failedReturned, factor) : 0;
      const closedShort = invalid ? null : p ? safeStock(p.closedShort, factor) : 0;
      const required = p ? (safeStock(p.required, factor) ?? num(l.quantity)) : num(l.quantity);
      goods.push({
        id: `ar:${po.id}:${lineId}`,
        side: 'ar',
        partnerId: str(po.customerId),
        partnerName: str(customers.find(c => c.id === po.customerId)?.companyName || po.customerName),
        orderId: str(po.id),
        orderCode: str(po.poCode || po.id),
        lineId,
        catalogItemId: p?.catalogItemId || '',
        code: p?.code || str(l.productCode),
        name: p?.name || str(l.productName),
        unit: p?.unit || str(l.unit),
        required,
        received,
        transit,
        returned: invalid ? null : p ? safeStock(p.customerReturned, factor) : 0,
        closedShort,
        remaining: received === null || closedShort === null ? null : roundStock(required - received - closedShort),
        toDispatch:
          received === null || closedShort === null || transit === null
            ? null
            : roundStock(required - received - closedShort - transit),
        dueDate: str(l.deliveryDate || po.expectedDeliveryDate),
        reconciliation,
        vouchers: evidence(str(po.id), lineId, false)
      });
    }
  }
  for (const purchase of purchases) {
    const isRaw = purchase.sourcingType === 'raw_material',
      state = sources.find(s => s.id === `purchase_${purchase.id}`),
      rawState = raw.find(s => s.id === `purchase_${purchase.id}`);
    if (!state && !rawState && (purchase.deleted || ['cancelled', 'draft'].includes(str(purchase.status)))) continue;
    const managed = isRaw ? rawState : state;
    const stale =
      !!managed &&
      managed.fingerprint !==
        fingerprint(
          isRaw ? rawSourceFingerprintInput('purchase', purchase) : goodsSourceFingerprintInput(purchase, 'purchase')
        );
    for (const [i, l] of rows(purchase.items).entries()) {
      const lineId = `line-${i}`,
        p = state?.lines[lineId],
        r = rawState?.lines[lineId],
        storedFactor = isRaw ? r?.factor : p?.factor,
        factor = storedFactor ?? 1;
      const invalid = stale || (!managed && purchase.status === 'received') || (!!(isRaw ? r : p) && !(factor > 0));
      const received = invalid
        ? null
        : isRaw
          ? r
            ? safeStock(r.quantity, factor)
            : 0
          : p
            ? safeStock(p.received + p.directDelivered + p.failedIntoCompany - (p.directCustomerReturned || 0), factor)
            : 0;
      const transit = invalid
        ? null
        : isRaw
          ? 0
          : p
            ? safeStock(p.directSent - p.directDelivered - p.directFailed, factor)
            : 0;
      const required = num(l.quantity),
        catalogItemId = (isRaw ? r?.catalogItemId : p?.catalogItemId) || '';
      goods.push({
        id: `ap:${purchase.id}:${lineId}`,
        side: 'ap',
        partnerId: str(purchase.supplierId),
        partnerName: str(suppliers.find(s => s.id === purchase.supplierId)?.supplierName || purchase.supplierName),
        orderId: str(purchase.id),
        orderCode: str(purchase.purCode || purchase.id),
        lineId,
        catalogItemId,
        code: str(snapshots.items.find(item => item.id === catalogItemId)?.code || l.productCode),
        name: str(l.materialName || l.productName),
        unit: str(l.unit),
        required,
        received,
        transit,
        returned: invalid ? null : p ? safeStock(p.directCustomerReturned || 0, factor) : 0,
        closedShort: 0,
        remaining: received === null ? null : roundStock(required - received),
        toDispatch: null,
        dueDate: str(purchase.expectedReceiveDate),
        reconciliation: invalid
          ? 'Dữ liệu cũ / nguồn thay đổi; cần đối soát'
          : purchase.deleted || purchase.status === 'cancelled'
            ? 'Đơn đã xóa / hủy còn lịch sử hàng'
            : '',
        vouchers: evidence(str(purchase.id), lineId, true)
      });
    }
  }
  // Keep orphaned ledger lines visible even when a source/row was removed outside the controlled workflow.
  const retainMissing = (side: 'ar' | 'ap', orderId: string, lineId: string, p: Data) => {
    if (goods.some(g => g.id === `${side}:${orderId}:${lineId}`)) return;
    const source = (side === 'ar' ? pos : purchases).find(o => o.id === orderId);
    goods.push({
      id: `${side}:${orderId}:${lineId}`,
      side,
      partnerId: str(source?.[side === 'ar' ? 'customerId' : 'supplierId']),
      partnerName: str(source?.[side === 'ar' ? 'customerName' : 'supplierName']),
      orderId,
      orderCode: str(source?.[side === 'ar' ? 'poCode' : 'purCode'] || orderId),
      lineId,
      catalogItemId: str(p.catalogItemId),
      code: str(p.code),
      name: str(p.name || 'Dòng nguồn không còn tồn tại'),
      unit: str(p.unit),
      required: null,
      received: null,
      transit: null,
      returned: null,
      closedShort: null,
      remaining: null,
      toDispatch: null,
      dueDate: '',
      reconciliation: 'Thiếu đơn / dòng nguồn; cần đối soát',
      vouchers: evidence(orderId, lineId, side === 'ap')
    });
  };
  for (const state of orders)
    for (const [lineId, p] of Object.entries(state.lines)) retainMissing('ar', state.id, lineId, p as unknown as Data);
  for (const state of [...sources, ...raw].filter(s => s.id.startsWith('purchase_')))
    for (const [lineId, p] of Object.entries(state.lines))
      retainMissing('ap', state.id.slice('purchase_'.length), lineId, p as unknown as Data);
  const balances = snapshots.balances,
    stock: StockReportRow[] = snapshots.items
      .filter(i => ['raw_material', 'finished_good', 'resale'].includes(str(i.kind)))
      .map(i => {
        const warehouseId = i.kind === 'raw_material' ? ('raw_main' as const) : ('finished_main' as const);
        const b = balances.find(
          b => (b.catalogItemId || b.id) === i.id && (b.warehouseId || 'raw_main') === warehouseId
        );
        const quantity = num(b?.quantity),
          minQuantity = b?.minQuantity == null ? null : num(b.minQuantity);
        return {
          id: str(b?.id || (warehouseId === 'finished_main' ? `fg_${i.id}` : i.id)),
          catalogItemId: str(i.id),
          warehouseId,
          code: str(i.code),
          name: str(i.name),
          unit: str(i.baseUnit),
          quantity,
          minQuantity,
          revision: num(b?.revision),
          updatedAt: str(b?.updatedAt),
          alert: stockAlert(quantity, minQuantity),
          vouchers: vouchers
            .filter(v => v.warehouseId === warehouseId && v.lines.some(l => l.catalogItemId === i.id))
            .map(v => ({
              id: v.id,
              code: v.code,
              postingDate: v.postingDate,
              delta: roundStock(v.lines.filter(l => l.catalogItemId === i.id).reduce((n, l) => n + l.delta, 0)),
              unit: str(i.baseUnit)
            }))
        };
      });
  return {
    asOf,
    loadedAt,
    documents,
    funds,
    entries,
    goods,
    stock,
    legacy: snapshots.invoices.filter(i => i.ledgerVersion !== 1),
    balances: currentPartnerBalances(documents, funds)
  };
}
