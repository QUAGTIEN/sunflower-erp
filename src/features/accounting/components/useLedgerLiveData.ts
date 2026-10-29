import { useMemo } from 'react';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import type { LedgerData } from '../model/accountingLedger';
import { buildLedgerView, type LedgerSnapshots } from '../model/ledgerView';

type LedgerQueryName = Exclude<keyof LedgerSnapshots, 'revision'> | 'control';

/** firestore.rules let Admin and Kế toán with the accounting page read every collection listed here. */
export const LEDGER_LIVE_QUERIES: LiveQuery<LedgerQueryName>[] = [
  { name: 'control', collection: 'finance_control' },
  { name: 'documents', collection: 'finance_documents' },
  { name: 'funds', collection: 'finance_funds' },
  { name: 'entries', collection: 'finance_entries' },
  { name: 'sourceStates', collection: 'finance_source_state' },
  { name: 'periods', collection: 'finance_periods' },
  { name: 'invoices', collection: 'invoices' },
  { name: 'vouchers', collection: 'warehouse_vouchers' },
  { name: 'pos', collection: 'pos' },
  { name: 'purchases', collection: 'purchase_orders' },
  { name: 'customers', collection: 'customers' },
  { name: 'suppliers', collection: 'suppliers' },
  { name: 'items', collection: 'item_catalog' }
];
const NO_QUERIES: LiveQuery<LedgerQueryName>[] = [];
const MESSAGES = {
  readError: 'Không tải được sổ kế toán. Kiểm tra kết nối và thử lại.',
  unavailable: 'Sổ kế toán cần kết nối Firebase; chế độ dữ liệu local không hỗ trợ sổ tiền.'
};

/** Reads Sổ công nợ straight from Firestore; every posting still goes through the accounting API. */
export function useLedgerLiveData(allowed: boolean) {
  const live = useLiveCollections(allowed ? LEDGER_LIVE_QUERIES : NO_QUERIES, MESSAGES);
  const data = useMemo(() => {
    if (!live.snapshots || !allowed) return null;
    const { control, ...collections } = live.snapshots;
    // The control revision is the optimistic lock every posting sends back as expectedRevision.
    const revision = Number(control.find(row => row.id === 'main')?.revision || 0);
    return buildLedgerView({ ...collections, revision }) as unknown as LedgerData;
  }, [live.snapshots, allowed]);
  return { data, loading: live.loading, error: live.error, reload: live.reload };
}
