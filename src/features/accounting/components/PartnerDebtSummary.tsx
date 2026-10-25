import '@/features/inventory/components/Warehouse.css';
import './Ledger.css';
import type { PartnerDebt } from '../model/partnerDebt';
import { formatMoney } from '../model/accountingLedger';
export function PartnerDebtValue({ row }: { row?: PartnerDebt }) {
  return (
    <span
      title={
        row
          ? `Nợ sổ mới: ${formatMoney(row.debt)}; ứng trước: ${formatMoney(row.advance)}; nợ cũ chưa đối soát: ${formatMoney(row.legacyDebt)}`
          : 'Chưa tải được số dư sổ mới'
      }
    >
      {row
        ? `${formatMoney(row.debt)}${row.legacyCount ? ` · Cũ: ${formatMoney(row.legacyDebt)}` : ''}${row.advance ? ` · Ứng: ${formatMoney(row.advance)}` : ''}`
        : '—'}
    </span>
  );
}
