import '@/features/inventory/components/Warehouse.css';
import './Ledger.css';
import type { PartnerDebt } from '../model/partnerDebt';
import { formatMoney } from '../model/accountingLedger';
export function PartnerDebtValue({row}:{row?:PartnerDebt}) {
  return <span title={row ? `Nợ sổ mới: ${formatMoney(row.debt)}; ứng trước: ${formatMoney(row.advance)}; nợ cũ chưa đối soát: ${formatMoney(row.legacyDebt)}` : 'Chưa tải được số dư sổ mới'}>{row ? `${formatMoney(row.debt)}${row.legacyCount ? ` · Cũ: ${formatMoney(row.legacyDebt)}` : ''}${row.advance ? ` · Ứng: ${formatMoney(row.advance)}` : ''}` : '—'}</span>;
}
export function PartnerDebtNotice({loaded,error,reload}:{loaded:boolean;error:string;reload:()=>void}) {
  return <div className="warehouse-toolbar"><span role={error ? 'alert' : 'status'}>{error || (loaded ? 'Công nợ theo sổ mới · Nợ cũ chưa đối soát và ứng trước hiển thị riêng.' : 'Đang tải công nợ theo sổ mới…')}</span><button className="btn btn-outline" onClick={reload}>Tải lại công nợ</button></div>;
}
