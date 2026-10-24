export interface PartnerDebt {
  side: 'ar' | 'ap';
  partnerId: string;
  debt: number;
  advance: number;
  legacyDebt: number;
  legacyCount: number;
}
export interface LegacyDebtInvoice {
  customerId?: string;
  supplierId?: string;
  deleted?: boolean;
  ledgerVersion?: number;
  type?: string;
  amount?: number;
  paidAmount?: number;
}
export function legacyPartnerDebt(invoices: LegacyDebtInvoice[]) {
  const result = new Map<string, { side: 'ar' | 'ap'; partnerId: string; debt: number; count: number }>();
  for (const inv of invoices) {
    if (inv.deleted || inv.ledgerVersion === 1 || !['receivable', 'payable'].includes(inv.type || '')) continue;
    const side = inv.type === 'receivable' ? ('ar' as const) : ('ap' as const),
      partnerId = (side === 'ap' ? inv.supplierId || inv.customerId : inv.customerId) || '';
    if (!partnerId) continue;
    const key = `${side}:${partnerId}`,
      row = result.get(key) || { side, partnerId, debt: 0, count: 0 };
    const amount = Number(inv.amount),
      paid = Number(inv.paidAmount || 0);
    if (!Number.isFinite(amount) || !Number.isFinite(paid)) continue;
    row.debt += Math.max(0, amount - paid);
    row.count++;
    result.set(key, row);
  }
  return [...result.values()];
}
