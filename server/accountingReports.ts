import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  canUseLedger,
  type DebtDocument,
  type MoneyFund,
  type LedgerEntry
} from '../src/features/accounting/model/accountingLedger.js';
import { currentPartnerBalances } from '../src/features/accounting/model/accountingReports.js';
import { legacyPartnerDebt, type LegacyDebtInvoice } from '../src/features/accounting/model/partnerDebt.js';
import { canReadPartnerSummary } from '../src/features/accounting/model/reportAccess.js';
import {
  stockAlert,
  safeStock,
  type GoodsReportRow,
  type StockReportRow
} from '../src/features/accounting/model/operationalReports.js';
import {
  warehouseDate,
  roundStock,
  WAREHOUSE_KINDS,
  type WarehouseActor,
  type WarehouseProgress
} from '../src/features/inventory/model/warehouse.js';
import {
  GOODS_KINDS,
  type GoodsOrderState,
  type GoodsSourceState,
  type GoodsVoucher
} from '../src/features/inventory/model/finishedGoods.js';
import { itemIdentity } from '../src/features/production/model/productionOrder.js';
import { poStamp, sourceStamp } from './finishedGoods.js';
import { sourceStamp as rawStamp } from './warehouse.js';

type Data = Record<string, unknown>;
const rows = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** Snapshot-only reporting. No migration or financial write is performed by any report action. */
export async function loadAccountingReports(actor: WarehouseActor) {
  if (!canUseLedger(actor))
    throw new AdminApiError(403, 'Chỉ Admin và Kế toán có quyền Kế toán được xem báo cáo tổng hợp.');
  const { firestore } = getFirebaseAdminServices();
  return firestore.runTransaction(async tx => {
    const names = [
      'finance_documents',
      'finance_funds',
      'finance_entries',
      'invoices',
      'pos',
      'purchase_orders',
      'customers',
      'suppliers',
      'goods_order_state',
      'goods_source_state',
      'warehouse_source_state',
      'warehouse_balances',
      'warehouse_vouchers',
      'item_catalog'
    ];
    const snapshots = await Promise.all(names.map(n => tx.get(firestore.collection(n))));
    const list = (i: number) => snapshots[i].docs.map(d => ({ ...d.data(), id: d.id }) as Data);
    const documents = list(0) as unknown as DebtDocument[],
      funds = list(1) as unknown as MoneyFund[],
      entries = list(2) as unknown as LedgerEntry[];
    const pos = list(4),
      purchases = list(5),
      customers = list(6),
      suppliers = list(7);
    const orders = list(8) as unknown as GoodsOrderState[],
      sources = list(9) as unknown as GoodsSourceState[],
      raw = list(10) as unknown as WarehouseProgress[],
      vouchers = list(12) as unknown as GoodsVoucher[];
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
      const stale = !!state && state.fingerprint !== poStamp(po);
      for (const [i, l] of items.entries()) {
        const lineId = itemIdentity(l, i),
          p = state?.lines[lineId];
        const invalid =
          legacy ||
          stale ||
          (!!p && !(p.factor > 0)) ||
          items.filter((x, j) => itemIdentity(x, j) === lineId).length > 1;
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
        managed.fingerprint !== (isRaw ? rawStamp('purchase', purchase) : sourceStamp(purchase, 'purchase'));
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
              ? safeStock(
                  p.received + p.directDelivered + p.failedIntoCompany - (p.directCustomerReturned || 0),
                  factor
                )
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
          code: str(list(13).find(item => item.id === catalogItemId)?.code || l.productCode),
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
      for (const [lineId, p] of Object.entries(state.lines))
        retainMissing('ar', state.id, lineId, p as unknown as Data);
    for (const state of [...sources, ...raw].filter(s => s.id.startsWith('purchase_')))
      for (const [lineId, p] of Object.entries(state.lines))
        retainMissing('ap', state.id.slice('purchase_'.length), lineId, p as unknown as Data);
    const balances = list(11),
      stock: StockReportRow[] = list(13)
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
      success: true,
      asOf: warehouseDate(),
      loadedAt: new Date().toISOString(),
      documents,
      funds,
      entries,
      goods,
      stock,
      legacy: list(3).filter(i => i.ledgerVersion !== 1),
      balances: currentPartnerBalances(documents, funds)
    };
  });
}

export async function loadPartnerSummary(actor: WarehouseActor) {
  if (!canReadPartnerSummary(actor))
    throw new AdminApiError(403, 'Bạn không có quyền xem tóm tắt công nợ tại phân hệ này.');
  const { firestore } = getFirebaseAdminServices();
  return firestore.runTransaction(async tx => {
    const names = ['finance_documents', 'finance_funds', 'invoices', 'customers', 'suppliers'];
    const snapshots = await Promise.all(names.map(n => tx.get(firestore.collection(n))));
    const list = (i: number) => snapshots[i].docs.map(d => ({ ...d.data(), id: d.id }) as Data);
    const balances = currentPartnerBalances(list(0) as unknown as DebtDocument[], list(1) as unknown as MoneyFund[]);
    const legacy = legacyPartnerDebt(list(2) as LegacyDebtInvoice[]),
      result = new Map(balances.map(r => [`${r.side}:${r.partnerId}`, { ...r, legacyDebt: 0, legacyCount: 0 }]));
    for (const l of legacy) {
      const key = `${l.side}:${l.partnerId}`;
      const r = result.get(key) || { ...l, debt: 0, advance: 0, legacyDebt: 0, legacyCount: 0 };
      r.legacyDebt = l.debt;
      r.legacyCount = l.count;
      result.set(key, r);
    }
    const all = canUseLedger(actor),
      customers = list(3),
      suppliers = list(4);
    return {
      success: true,
      asOf: warehouseDate(),
      partners: [...result.values()].filter(
        r =>
          all ||
          (actor.role === 'sale' &&
            r.side === 'ar' &&
            customers.some(
              c => c.id === r.partnerId && !c.deleted && (!c.assignedSaleId || c.assignedSaleId === actor.uid)
            )) ||
          (actor.role === 'purchaser' && r.side === 'ap' && suppliers.some(s => s.id === r.partnerId && !s.deleted))
      )
    };
  });
}
