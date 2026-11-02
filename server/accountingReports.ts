import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { canUseLedger, type DebtDocument, type MoneyFund } from '../src/features/accounting/model/accountingLedger.js';
import { currentPartnerBalances } from '../src/features/accounting/model/accountingReports.js';
import { legacyPartnerDebt, type LegacyDebtInvoice } from '../src/features/accounting/model/partnerDebt.js';
import { canReadPartnerSummary } from '../src/features/accounting/model/reportAccess.js';
import { warehouseDate, type WarehouseActor } from '../src/features/inventory/model/warehouse.js';

type Data = Record<string, unknown>;

/** Sale and Mua hàng see debt only for their own partners, so this summary stays on the server. */
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
          (actor.role === 'accountant' && r.side === 'ap' && suppliers.some(s => s.id === r.partnerId && !s.deleted))
      )
    };
  });
}
