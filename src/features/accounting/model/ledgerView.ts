import { itemIdentity } from '../../production/model/productionOrder.js';
import type { DebtSide, FinanceSource } from './accountingLedger.js';

type Data = Record<string, unknown>;
const rows = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);

export interface LedgerSnapshots {
  revision: number;
  documents: Data[];
  funds: Data[];
  entries: Data[];
  sourceStates: Data[];
  periods: Data[];
  invoices: Data[];
  vouchers: Data[];
  pos: Data[];
  purchases: Data[];
  customers: Data[];
  suppliers: Data[];
  items: Data[];
}

/** Physical deliveries and receipts that may be charged to a customer (ar) or a supplier (ap). */
export function sourceKind(v: Data, side: DebtSide) {
  if (v.reversedBy || v.kind === 'reversal') return false;
  if (side === 'ar') return v.warehouseId === 'finished_main' && v.kind === 'delivery';
  return (
    v.kind === 'purchase_receipt' ||
    (v.warehouseId === 'finished_main' &&
      !!v.purchaseId &&
      (v.kind === 'delivery' || (v.kind === 'failed_return' && v.returnToSupplier !== true)))
  );
}
function sourceView(v: Data, side: DebtSide, po: Data, purchase: Data, partner: Data): FinanceSource {
  return {
    id: String(v.id),
    code: String(v.code),
    side,
    partnerId: String(side === 'ar' ? po.customerId || '' : purchase.supplierId || ''),
    partnerName: String(
      side === 'ar' ? partner.companyName || po.customerName || '' : partner.supplierName || purchase.supplierName || ''
    ),
    poId: String(side === 'ar' ? v.poId || '' : purchase.linkedPoId || ''),
    purchaseId: side === 'ap' ? String(purchase.id || '') : '',
    lines: rows(v.lines).map(line => {
      const original =
        side === 'ar'
          ? rows(po.items).find((row, index) => itemIdentity(row, index) === line.poItemId)
          : rows(purchase.items)[Number(String(line.sourceLine).replace('line-', ''))];
      return {
        id: String(line.sourceLine),
        catalogItemId: String(line.catalogItemId),
        code: String(line.code),
        name: String(line.name),
        unit: String(line.unit),
        quantity: Number(line.quantity),
        poItemId: String(line.poItemId || original?.poItemId || ''),
        suggestedPrice: Number(original?.unitPrice || 0)
      };
    })
  };
}

/**
 * The Sổ công nợ view: ledger documents plus the sources still waiting to be charged, partners and opening
 * orders. Shared by the server load and the live page so both apply one rule.
 */
export function buildLedgerView({
  revision,
  documents,
  funds,
  entries,
  sourceStates,
  periods,
  invoices,
  vouchers,
  pos,
  purchases,
  customers,
  suppliers,
  items
}: LedgerSnapshots) {
  const sources: FinanceSource[] = [];
  for (const v of vouchers)
    for (const side of ['ar', 'ap'] as const) {
      if (!sourceKind(v, side)) continue;
      const purchase =
        purchases.find(p => p.id === (v.purchaseId || (v.sourceType === 'purchase' ? v.sourceId : ''))) || {};
      const po = pos.find(p => p.id === v.poId) || {};
      const partner = (side === 'ar' ? customers : suppliers).find(
        p => p.id === (side === 'ar' ? po.customerId : purchase.supplierId)
      );
      if (!partner || partner.deleted || po.deleted || purchase.deleted) continue;
      const legacy = invoices.some(
        inv =>
          inv.ledgerVersion !== 1 &&
          !inv.deleted &&
          inv.type === (side === 'ar' ? 'receivable' : 'payable') &&
          (side === 'ar' ? inv.poId === po.id : inv.poId === purchase.id || inv.purchaseOrderId === purchase.id)
      );
      if (!legacy) sources.push(sourceView(v, side, po, purchase, partner));
    }
  return {
    revision,
    documents,
    funds,
    entries,
    sourceStates,
    periods,
    sources,
    partners: [
      ...customers
        .filter(
          p =>
            !p.deleted ||
            documents.some(d => d.side === 'ar' && d.partnerId === p.id && !d.voided) ||
            funds.some(d => d.side === 'ar' && d.partnerId === p.id && !d.voided)
        )
        .map(p => ({
          id: p.id,
          name: `${p.companyName || p.id}${p.deleted ? ' (ngừng sử dụng)' : ''}`,
          side: 'ar'
        })),
      ...suppliers
        .filter(
          p =>
            !p.deleted ||
            documents.some(d => d.side === 'ap' && d.partnerId === p.id && !d.voided) ||
            funds.some(d => d.side === 'ap' && d.partnerId === p.id && !d.voided)
        )
        .map(p => ({
          id: p.id,
          name: `${p.supplierName || p.id}${p.deleted ? ' (ngừng sử dụng)' : ''}`,
          side: 'ap'
        }))
    ],
    legacy: invoices.filter(inv => inv.ledgerVersion !== 1),
    items: items.filter(i => i.active).map(i => ({ id: i.id, code: i.code, name: i.name, baseUnit: i.baseUnit })),
    openingOrders: [
      ...pos
        .filter(p => !p.deleted)
        .map(p => ({
          id: p.id,
          code: p.poCode,
          side: 'ar',
          partnerId: p.customerId,
          poId: p.id,
          purchaseId: '',
          lines: rows(p.items).map((r, i) => ({ id: itemIdentity(r, i), name: r.productName || '' }))
        })),
      ...purchases
        .filter(p => !p.deleted)
        .map(p => ({
          id: p.id,
          code: p.purCode,
          side: 'ap',
          partnerId: p.supplierId,
          poId: p.linkedPoId || '',
          purchaseId: p.id,
          lines: rows(p.items).map((r, i) => ({ id: `line-${i}`, name: r.productName || r.materialName || '' }))
        }))
    ],
    returns: vouchers
      .filter(v => !v.reversedBy && v.kind === 'customer_return')
      .flatMap(v => [
        {
          id: v.id,
          code: v.code,
          side: 'ar',
          dispatchId: v.dispatchId,
          lines: rows(v.lines).map(l => ({
            sourceLine: l.sourceLine,
            quantity: l.quantity,
            catalogItemId: l.catalogItemId
          }))
        },
        ...(v.returnToSupplier === true
          ? [
              {
                id: v.id,
                code: v.code,
                side: 'ap',
                dispatchId: v.dispatchId,
                lines: rows(v.lines).map(l => ({
                  sourceLine: l.sourceLine,
                  quantity: l.quantity,
                  catalogItemId: l.catalogItemId
                }))
              }
            ]
          : [])
      ])
  };
}
