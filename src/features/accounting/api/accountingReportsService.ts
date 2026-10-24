import { warehouseRequest } from '@/features/inventory/api/warehouseService';
import type { DebtDocument, MoneyFund, LedgerEntry } from '../model/accountingLedger';
import type { GoodsReportRow, StockReportRow } from '../model/operationalReports';
export interface AccountingReportData {
  asOf: string;
  loadedAt: string;
  documents: DebtDocument[];
  funds: MoneyFund[];
  entries: LedgerEntry[];
  goods: GoodsReportRow[];
  stock: StockReportRow[];
  legacy: Record<string, unknown>[];
}
export const loadAccountingReports = (): Promise<AccountingReportData> =>
  warehouseRequest({}, '/api/accounting/reports');
