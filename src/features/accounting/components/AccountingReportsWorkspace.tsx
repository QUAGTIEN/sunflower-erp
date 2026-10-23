import { StockThresholdDialog } from '@/features/inventory/components/StockThresholdDialog';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WarehouseActor } from '@/features/inventory/model/warehouse';
import { warehouseDate } from '@/features/inventory/model/warehouse';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { canUseLedger, FINANCE_KINDS, type LedgerEntry } from '../model/accountingLedger';
import { AGE_BUCKETS, buildDebtReport } from '../model/accountingReports';
import { reportCsv } from '../model/accountingReports';
import { deadlineAlert, goodsReportAlert, type GoodsReportRow, type StockReportRow } from '../model/operationalReports';
import { loadAccountingReports, type AccountingReportData } from '../api/accountingReportsService';
import { LedgerDetails } from './AccountingLedgerWorkspace';
import './Ledger.css';
import '@/features/inventory/components/Warehouse.css';

type Cell = string | number | null;
type ReportRow = { key: string; cells: Cell[]; open?: () => void; goods?: () => void };
const names = { partners: 'Công nợ theo kỳ', lines: 'Chi tiết đơn / mã', aging: 'Tuổi nợ', cash: 'Dòng tiền', goods: 'Hàng còn giao / nhận', stock: 'Cảnh báo kho', legacy: 'Dữ liệu chưa chuyển đổi' };
export function AccountingReportsWorkspace({ actor }: { actor: WarehouseActor }) {
  const [data, setData] = useState<AccountingReportData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [view, setView] = useState<keyof typeof names>('partners'), [side, setSide] = useState('ar'), [partnerId, setPartnerId] = useState('');
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`), [to, setTo] = useState(warehouseDate());
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [age, setAge] = useState(''), [leadDays, setLeadDays] = useState(3), [warehouse, setWarehouse] = useState('');
  const [entry, setEntry] = useState<LedgerEntry | null>(null), [goodsDetail, setGoodsDetail] = useState<GoodsReportRow | null>(null);
  const [stockDetail,setStockDetail] = useState<StockReportRow|null>(null), [threshold,setThreshold] = useState<StockReportRow|null>(null);
  const allowed = canUseLedger(actor);
  useEffect(() => { if (!allowed) return; let cancelled = false; void loadAccountingReports().then(next => { if (!cancelled) { setData(next); setError(''); } }).catch(cause => { if (!cancelled) { setData(null); setError(cause instanceof Error ? cause.message : 'Không tải được báo cáo.'); } }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [allowed, refresh]);
  const report = useMemo(() => {
    if (!data) return { lines: [], partners: [], error: '' };
    try { if (to > data.asOf) throw new Error('Ngày cuối không được vượt ngày hiện tại của dữ liệu đã tải.'); return { ...buildDebtReport(data.documents, data.funds, data.entries, from, to), error: '' }; }
    catch (cause) { return { lines: [], partners: [], error: cause instanceof Error ? cause.message : 'Không lập được báo cáo.' }; }
  }, [data, from, to]);
  const matches = (...values: unknown[]) => values.join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
  const financial = ['partners', 'lines', 'cash', 'aging'].includes(view), reportError = financial ? report.error : '';
  const partners = [...new Map([...(data?.documents || []), ...(data?.funds || [])].filter(d => d.side === side).map(d => [d.partnerId, d.partnerName])).entries()];
  const entryFor = (id: string) => setEntry(data?.entries.find(e => e.id === id) || null);
  const partnerLines = report.lines.filter(r => r.document.side === side && (!partnerId || r.document.partnerId === partnerId));
  const filteredLines = partnerLines.filter(r => matches(r.document.partnerName, r.document.reference, r.line.orderCode, r.line.code, r.line.name) && (!age || r.age === age) && (!status || deadlineAlert(r.document.dueDate, to, leadDays, r.closing) === status));
  const debtLines = filteredLines.filter(r => r.opening || r.increase || r.decrease || r.allocated || r.closing);
  let headers: string[], numeric: number[], rows: ReportRow[];
  if (view === 'partners') {
    headers = ['Đối tác', 'Dư đầu', 'Tăng nợ', 'Giảm nợ', 'Phân bổ ròng', 'Dư cuối', 'Ứng trước đầu', 'Ứng trước cuối', 'Tiền vào', 'Tiền ra']; numeric = [1,2,3,4,5,6,7,8,9];
    rows = report.partners.filter(p => p.side === side && (!partnerId || p.partnerId === partnerId) && matches(p.partnerName)).map(p => ({ key: `${p.side}:${p.partnerId}`, cells: [p.partnerName, p.opening, p.increase, p.decrease, p.allocated, p.closing, p.advanceOpening, p.advanceClosing, p.cashIn, p.cashOut], open: () => { setPartnerId(p.partnerId); setView('lines'); setAge(''); setStatus(''); setSearch(''); } }));
  } else if (view === 'aging') {
    headers=['Đối tác',...AGE_BUCKETS,'Tổng còn nợ'];numeric=[1,2,3,4,5,6,7,8];
    rows=report.partners.filter(p=>p.side===side && (!partnerId || p.partnerId===partnerId) && matches(p.partnerName)).map(p=>{const ls=report.lines.filter(l=>l.document.side===side && l.document.partnerId===p.partnerId && l.closing>0);return {key:`${side}:${p.partnerId}`,cells:[p.partnerName,...AGE_BUCKETS.map(age=>ls.filter(l=>l.age===age).reduce((n,l)=>n+l.closing,0)),ls.reduce((n,l)=>n+l.closing,0)],open:()=>{setView('lines');setPartnerId(p.partnerId);setSearch('');setAge('');setStatus('');}};});
  } else if (view === 'lines') {
    headers = ['Đối tác', 'Chứng từ', 'Đơn', 'Mã / tên hàng', 'Dư đầu', 'Tăng', 'Giảm', 'Phân bổ ròng', 'Dư cuối', 'Hạn nợ', 'Tuổi nợ', 'Cảnh báo', 'Hàng còn thực hiện hiện tại']; numeric = [4,5,6,7,8];
    rows = debtLines.map(r => {
      const g=data?.goods.find(g=>g.side===r.document.side && g.orderId===(g.side==='ar' ? r.line.poId : r.line.purchaseId) && g.lineId===(g.side==='ar' ? r.line.poItemId : r.line.sourceLine));
      return { key: `${r.document.id}:${r.line.id}`, cells: [r.document.partnerName, r.document.reference, r.line.orderCode || 'Chưa xác định', `${r.line.code} ${r.line.name}`, r.opening, r.increase, r.decrease, r.allocated, r.closing, r.document.dueDate, r.closing > 0 ? r.age : 'Hết nợ', deadlineAlert(r.document.dueDate, to, leadDays, r.closing), g ? `${g.remaining ?? 'Chưa xác định'} ${g.unit}` : 'Chưa liên kết dòng hàng'], open: () => entryFor(r.document.id), goods:g ? () => setGoodsDetail(g) : undefined };
    });
  } else if (view === 'cash') {
    headers = ['Phiếu', 'Đối tác', 'Ngày', 'Nghiệp vụ', 'Tham chiếu', 'Phương thức', 'Tiền vào', 'Tiền ra']; numeric = [6,7];
    rows = (data?.entries || []).filter(e => e.side === side && (!partnerId || e.partnerId === partnerId) && e.postingDate >= from && e.postingDate <= to && e.cashDelta !== 0 && matches(e.code, e.reference, e.partnerName)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(e => ({ key: e.id, cells: [e.code, e.partnerName, e.postingDate, FINANCE_KINDS[e.kind], e.reference, data?.funds.find(f => f.id === e.fundId)?.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản', Math.max(0,e.cashDelta), Math.max(0,-e.cashDelta)], open: () => setEntry(e) }));
  } else if (view === 'goods') {
    headers = ['Đối tác', 'Đơn', 'Mã / tên hàng', 'ĐVT', 'SL đặt', 'Nhận ròng', 'Đang giao', 'Khách trả', 'Đóng thiếu', 'Còn thực hiện', 'Cần xuất thêm', 'Ngày cần', 'Cảnh báo / đối soát']; numeric = [4,5,6,7,8,9,10];
    rows = (data?.goods || []).filter(r => r.side === side && (!partnerId || r.partnerId === partnerId) && matches(r.partnerName, r.orderCode, r.code, r.name) && (!status || goodsReportAlert(r, data!.asOf, leadDays) === status)).map(r => ({ key: r.id, cells: [r.partnerName, r.orderCode, `${r.code || 'Chưa liên kết'} ${r.name}`, r.unit, r.required, r.received, r.transit, r.returned, r.closedShort, r.remaining, r.toDispatch, r.dueDate || 'Chưa có hạn', r.reconciliation || goodsReportAlert(r, data!.asOf, leadDays)], open: () => setGoodsDetail(r) }));
  } else if (view === 'stock') {
    headers = ['Kho', 'Mã hàng', 'Tên hàng', 'Tồn theo sổ', 'Ngưỡng tối thiểu', 'ĐVT cơ sở', 'Cảnh báo']; numeric = [3,4];
    rows = (data?.stock || []).filter(r => (!warehouse || r.warehouseId === warehouse) && (!status || r.alert === status) && matches(r.code,r.name)).map(r => ({ key: r.id, cells: [r.warehouseId === 'raw_main' ? 'NVL' : 'Thành phẩm / hàng mua', r.code,r.name,r.quantity,r.minQuantity,r.unit,r.alert],open:() => setStockDetail(r) }));
  } else {
    headers = ['Hóa đơn cũ', 'Đối tác', 'Đơn', 'Giá trị cũ', 'Đã trả cũ', 'Trạng thái']; numeric = [3,4];
    rows = (data?.legacy || []).filter(r => matches(r.invoiceCode,r.companyName,r.customerName,r.poCode)).map(r => ({key:String(r.id), cells:[String(r.invoiceCode || r.id), String(r.companyName || r.customerName || ''),String(r.poCode || ''),Number(r.amount || 0),Number(r.paidAmount || 0),r.deleted ? 'Đã xóa cũ · chưa đối soát' : 'Chưa chuyển đổi']}));
  }
  const pages = useDataTablePagination(rows);
  const totals = numeric.map(i => ({ i, value: rows.reduce((sum,r) => sum + (typeof r.cells[i] === 'number' ? r.cells[i] as number : 0),0) }));
  const exportRows = () => {
    const csv = reportCsv(headers, rows.map(r => r.cells)); const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); a.href=url; a.download=`ke-toan-${view}-${side}-${financial ? `${from}-${to}` : data?.asOf}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (!allowed) return <p role="alert">Bạn không có quyền xem báo cáo kế toán.</p>;
  return <section className="ledger-workspace" aria-label="Báo cáo và cảnh báo kế toán" data-erp-table-text="single-line">
    <div className="warehouse-toolbar"><select aria-label="Báo cáo" value={view} onChange={e => {setView(e.target.value as typeof view);setStatus('');setAge('');setSearch('');}}>{Object.entries(names).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>
      {!['stock','legacy'].includes(view) && <><select aria-label="Loại đối tác" value={side} onChange={e => {setSide(e.target.value);setPartnerId('');}}><option value="ar">Khách hàng</option><option value="ap">Nhà cung cấp</option></select><select aria-label="Đối tác" value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Tất cả đối tác</option>{partners.map(([id,name]) => <option key={id} value={id}>{name}</option>)}{view === 'goods' && [...new Map((data?.goods || []).filter(g => g.side === side && !partners.some(([id]) => id === g.partnerId)).map(g => [g.partnerId,g.partnerName])).entries()].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></>}
      <input type="search" aria-label="Tìm báo cáo" placeholder="Đối tác, đơn, mã, chứng từ…" value={search} onChange={e => setSearch(e.target.value)}/>
      <button className="btn btn-outline" disabled={loading} onClick={() => {setLoading(true);setRefresh(v => v+1);}}>Tải lại</button><button className="btn btn-outline" disabled={loading || !!error || !!reportError || !data || !rows.length} onClick={exportRows}>Xuất CSV</button>
    </div>
    <div className="warehouse-toolbar">
      {financial && <><label>Tháng<input type="month" value={from.slice(0,7)} max={(data?.asOf || warehouseDate()).slice(0,7)} onChange={e=>{const month=e.target.value;if (!/^\d{4}-\d{2}$/.test(month)) return;const last=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();setFrom(`${month}-01`);setTo([`${month}-${last}`,data?.asOf || warehouseDate()].sort()[0]);}}/></label><label>Từ ngày<input type="date" value={from} max={data?.asOf || warehouseDate()} onChange={e => setFrom(e.target.value)}/></label><label>Đến ngày<input type="date" value={to} max={data?.asOf || warehouseDate()} onChange={e => setTo(e.target.value)}/></label><button className="btn btn-outline" onClick={() => {setFrom(`${warehouseDate().slice(0,7)}-01`);setTo(warehouseDate());}}>Tháng hiện tại</button></>}
      {['lines','goods'].includes(view) && <><label>Báo trước (ngày)<input type="number" min="0" max="365" value={leadDays} onChange={e => setLeadDays(Math.max(0,Math.min(365,Math.floor(Number(e.target.value)||0))))}/></label><select aria-label="Cảnh báo hạn" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả cảnh báo</option>{['Quá hạn','Đến hạn hôm nay','Sắp đến hạn','Chưa đến hạn','Chưa có hạn','Hoàn tất',...(view === 'goods' ? ['Cần đối soát'] : [])].map(v => <option key={v}>{v}</option>)}</select></>}
      {view === 'lines' && <select aria-label="Tuổi nợ" value={age} onChange={e => setAge(e.target.value)}><option value="">Tất cả tuổi nợ</option>{AGE_BUCKETS.map(v => <option key={v}>{v}</option>)}</select>}
      {view === 'stock' && <><select aria-label="Kho" value={warehouse} onChange={e => setWarehouse(e.target.value)}><option value="">Tất cả kho</option><option value="raw_main">NVL</option><option value="finished_main">Thành phẩm / hàng mua</option></select><select aria-label="Cảnh báo tồn" value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{['Tồn âm','Cần nhập hàng','Chưa thiết lập ngưỡng','Trong ngưỡng'].map(v => <option key={v}>{v}</option>)}</select></>}
    </div>
    {loading && <p role="status">Đang tải báo cáo…</p>}{(error || reportError) && <p className="warehouse-error" role="alert">{error || reportError}</p>}
    {!loading && !error && !reportError && data && <><p className="warehouse-note">{financial ? `VND · Theo ngày ghi sổ ${from} – ${to} · Ứng trước tách riêng · Chưa gồm dữ liệu cũ chưa chuyển đổi.` : `Số liệu hiện tại ${data.asOf} · Không áp dụng kỳ tiền. Không cộng số lượng khác ĐVT.`} Tải lúc {new Date(data.loadedAt).toLocaleTimeString('vi-VN')}.</p>
      <div className="warehouse-list-frame"><div className="table-container erp-primary-data-table"><table className="ledger-report-table" data-resize-key={`accounting-reports-${view}`}><thead><tr>{headers.map((h,i) => <th key={h} className={numeric.includes(i) ? 'ledger-number' : ''}>{h}</th>)}{view !== 'legacy' && <th>Thao tác</th>}</tr></thead><tbody>{pages.rows.map(r => <tr key={r.key}>{r.cells.map((c,i) => <td key={i} className={numeric.includes(i) ? 'ledger-number' : ''} title={c === null ? 'Chưa xác định' : String(c)}>{c === null ? '—' : typeof c === 'number' ? c.toLocaleString('vi-VN',{maximumFractionDigits:6}) : c}</td>)}{view !== 'legacy' && <td><RowActionMenu label={`Chi tiết ${r.cells[0]}`} actions={[{label: ['partners','aging'].includes(view) ? 'Xem chứng từ / đơn / mã' : 'Chi tiết / nguồn',onSelect:() => r.open?.()},...(r.goods ? [{label:'Xem hàng của đơn hiện tại',onSelect:r.goods}] : [])]}/></td>}</tr>)}{!rows.length && <tr><td colSpan={headers.length+1}>Không có dữ liệu phù hợp.</td></tr>}</tbody>{financial && !!rows.length && <tfoot><tr>{headers.map((h,i) => <td key={h} className="ledger-number">{i === 0 ? 'Tổng theo bộ lọc' : totals.find(t => t.i === i)?.value.toLocaleString('vi-VN') || ''}</td>)}<td/></tr></tfoot>}</table></div><DataTablePagination {...pages.paginationProps}/></div>
    </>}
    {entry && data && <LedgerDetails entry={entry} data={{documents:data.documents,entries:data.entries,returns:[]}} onOpenEntry={setEntry} onClose={() => setEntry(null)}/>}
    {stockDetail && <StockReportDetails row={stockDetail} onClose={() => setStockDetail(null)} onThreshold={() => {setThreshold(stockDetail);setStockDetail(null);}}/>}
    {threshold && <StockThresholdDialog stock={threshold} onClose={() => setThreshold(null)} onSaved={() => {setThreshold(null);setLoading(true);setRefresh(v=>v+1);}}/>}
    {goodsDetail && <GoodsReportDetails row={goodsDetail} onClose={() => setGoodsDetail(null)}/>}
  </section>;
}
function GoodsReportDetails({row,onClose}:{row:GoodsReportRow;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(() => {const el=dialog.current;el?.showModal();return () => el?.close();},[]);
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="report-goods-title" onCancel={e => {e.preventDefault();onClose();}}><header><h2 id="report-goods-title">{row.orderCode} · {row.code || row.name}</h2><button className="btn btn-outline" onClick={onClose}>Đóng</button></header><p>{row.partnerName} · {row.reconciliation || 'Số lượng theo sổ hàng hiện tại'}</p><div className="warehouse-grid-scroll"><table><thead><tr><th>Phiếu</th><th>Nghiệp vụ</th><th>Ngày</th><th>SL nguồn</th><th>ĐVT nguồn</th><th>Trạng thái</th></tr></thead><tbody>{row.vouchers.map((v,i) => <tr key={`${v.id}-${i}`}><td>{v.code}</td><td>{v.label || 'Chứng từ kho'}</td><td>{v.postingDate}</td><td>{v.quantity}</td><td>{v.unit}</td><td>{v.reversedBy ? 'Đã đảo' : v.kind === 'reversal' ? 'Phiếu đảo' : 'Đã ghi'}</td></tr>)}{!row.vouchers.length && <tr><td colSpan={6}>Chưa có phiếu theo sổ mới.</td></tr>}</tbody></table></div></dialog>;
}

function StockReportDetails({row,onClose,onThreshold}:{row:StockReportRow;onClose:()=>void;onThreshold:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(() => {const el=dialog.current;el?.showModal();return () => el?.close();},[]);
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="report-stock-title" onCancel={e=>{e.preventDefault();onClose();}}><header><h2 id="report-stock-title">{row.code} · {row.name}</h2><button className="btn btn-outline" onClick={onClose}>Đóng</button></header><p>Tồn {row.quantity} {row.unit} · {row.alert}</p><button className="btn btn-outline" onClick={onThreshold}>Thiết lập ngưỡng tồn</button><div className="warehouse-grid-scroll"><table><thead><tr><th>Phiếu</th><th>Ngày</th><th>Tăng / giảm</th><th>ĐVT cơ sở</th></tr></thead><tbody>{row.vouchers?.map(v=><tr key={v.id}><td>{v.code}</td><td>{v.postingDate}</td><td>{v.delta}</td><td>{v.unit}</td></tr>)}{!row.vouchers?.length && <tr><td colSpan={4}>Chưa có phiếu theo sổ mới.</td></tr>}</tbody></table></div></dialog>;
}
