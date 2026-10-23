import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { ItemCatalogWorkspace } from '@/features/catalog/components/ItemCatalogWorkspace';
import { canManageItemCatalog } from '@/features/catalog/model/itemCatalog';
import { confirmAppNavigation, registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { loadWarehouse, mutateWarehouse } from '../api/warehouseService';
import { canPostWarehouse, canReadWarehouse, stockNumber, warehouseSummary, warehouseDate, WAREHOUSE_KINDS, type WarehouseBalance, type WarehouseData, type WarehouseVoucher } from '../model/warehouse';
import { WarehouseVoucherDialog } from '../components/WarehouseVoucherDialog';
import '../components/Warehouse.css';

const empty: WarehouseData = { items: [], balances: [], vouchers: [], sources: [], progress: [], legacyInventory: [], legacyExports: [] };
const tabNames = { inventory: 'Tồn kho NVL', vouchers: 'Phiếu kho', report: 'Nhập xuất tồn', catalog: 'Danh mục hàng', legacy: 'Dữ liệu cũ' };
export function Inventory({ currentUser, onRefresh }: { currentUser: UserProfile; onRefresh: () => void }) {
  const [data, setData] = useState(empty);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<keyof typeof tabNames>('inventory');
  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(warehouseDate());
  const [legacyKind, setLegacyKind] = useState('inventory');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<WarehouseVoucher | null>(null);
  const [reversal, setReversal] = useState<WarehouseVoucher | null>(null);
  const [stock, setStock] = useState<WarehouseBalance | null>(null);
  const permitted = canReadWarehouse(currentUser);
  const canWrite = canPostWarehouse(currentUser) && loaded && !loading;
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void loadWarehouse().then(next => { if (!cancelled) { setData(next); setLoaded(true); setError(''); } })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được sổ kho.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [permitted, refresh]);
  const reload = () => { setLoaded(false); setLoading(true); setRefresh(value => value + 1); };
  const saved = () => { setCreating(false); setReversal(null); reload(); onRefresh(); };
  const needle = search.trim().toLocaleLowerCase('vi');
  const matches = (...values: unknown[]) => values.join(' ').toLocaleLowerCase('vi').includes(needle);
  const balances: WarehouseBalance[] = data.items.map(item => data.balances.find(balance => balance.id === item.id) || {
    id: item.id, code: item.code, name: item.name, unit: item.baseUnit, quantity: 0, minQuantity: null, revision: 0, updatedAt: ''
  }).sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  const balancePages = useDataTablePagination(balances.filter(row => matches(row.code, row.name) && (!onlyLow || row.quantity < 0 || row.minQuantity !== null && row.quantity < row.minQuantity)));
  const voucherPages = useDataTablePagination(data.vouchers.filter(row => (!kind || row.kind === kind) && matches(row.code, row.sourceCode, row.actorName, row.lines.map(line => line.code).join(' '))).sort((a, b) => b.postedAt.localeCompare(a.postedAt)));
  const reportPages = useDataTablePagination(from && to && from <= to ? warehouseSummary(data.vouchers, from, to).filter(row => matches(row.code, row.name)) : []);
  const legacyPages = useDataTablePagination((legacyKind === 'inventory' ? data.legacyInventory : data.legacyExports).filter(row => matches(row.materialName, row.exportCode, row.receiverName)));
  const pagination = tab === 'inventory' ? balancePages : tab === 'vouchers' ? voucherPages : tab === 'report' ? reportPages : legacyPages;
  if (!permitted) return <p role="alert">Bạn không có quyền xem kho NVL.</p>;
  return <div className="inventory-view warehouse-workspace" data-erp-table-text="single-line">
    <PageContextHeader section="Vật liệu" current={tabNames[tab]} />
    <nav className="content-tabs" aria-label="Kho NVL" role="tablist">{Object.entries(tabNames).filter(([key]) => key !== 'catalog' || canManageItemCatalog(currentUser)).map(([key, name]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { if (tab !== 'catalog' || confirmAppNavigation()) { setTab(key as typeof tab); setSearch(''); } }}>{name}</button>)}</nav>
    {tab === 'catalog' ? <ItemCatalogWorkspace currentUser={currentUser} /> : <>
      <div className="warehouse-toolbar"><input aria-label="Tìm kiếm kho" type="search" placeholder="Tìm mã, tên NVL hoặc chứng từ…" value={search} onChange={event => setSearch(event.target.value)} />
        {tab === 'inventory' && <label className="warehouse-check"><input type="checkbox" checked={onlyLow} onChange={event => setOnlyLow(event.target.checked)} />Tồn âm / dưới ngưỡng</label>}
        {tab === 'vouchers' && <select aria-label="Loại phiếu" value={kind} onChange={event => setKind(event.target.value)}><option value="">Tất cả loại phiếu</option>{Object.entries(WAREHOUSE_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
        {tab === 'report' && <><label>Từ ngày<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>Đến ngày<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></>}
        {tab === 'legacy' && <select aria-label="Dữ liệu cũ" value={legacyKind} onChange={event => setLegacyKind(event.target.value)}><option value="inventory">Tồn kho cũ</option><option value="exports">Phiếu xuất cũ</option></select>}
        <button className="btn btn-outline" disabled={loading} onClick={reload}>Tải lại</button>{canPostWarehouse(currentUser) && tab !== 'legacy' && <button className="btn btn-primary" disabled={!canWrite} onClick={() => setCreating(true)}>Lập phiếu kho</button>}
      </div>
      {error && <p className="warehouse-error" role="alert">{error}</p>}
      {loading && <p role="status">Đang tải sổ kho…</p>}
      {tab === 'legacy' ? <p className="warehouse-note">Dữ liệu cũ chỉ để đối soát, chưa chuyển thành tồn đầu kỳ của sổ mới.</p> : <p className="warehouse-note">Kho NVL chung · Số lượng từ phiếu thực tế; chưa bao gồm tồn cũ chưa đối soát. Không tính giữ chỗ từ LSX dự kiến.</p>}
      {tab === 'report' && (!from || !to || from > to) && <p role="alert" className="warehouse-error">Chọn khoảng ngày hợp lệ.</p>}
      <div className="warehouse-list-frame"><div className="table-container erp-primary-data-table"><table data-resize-key={`warehouse-${tab}-${legacyKind}`} className="warehouse-list"><thead><tr>
        {tab === 'inventory' ? <><th>Mã NVL</th><th>Tên NVL</th><th>Tồn theo sổ</th><th>ĐVT cơ sở</th><th>Ngưỡng tối thiểu</th><th>Trạng thái</th><th>Thao tác</th></> : tab === 'vouchers' ? <><th>Mã phiếu</th><th>Loại phiếu</th><th>Nguồn</th><th>Ngày hạch toán</th><th>Người ghi sổ</th><th>Trạng thái</th><th>Thao tác</th></> : tab === 'report' ? <><th>Mã NVL</th><th>Tên NVL</th><th>ĐVT</th><th>Đầu kỳ</th><th>Nhập</th><th>Xuất</th><th>Cuối kỳ</th></> : legacyKind === 'inventory' ? <><th>Tên vật tư cũ</th><th>ĐVT cũ</th><th>Tồn cũ</th><th>Giữ chỗ cũ</th><th>Ngưỡng cũ</th><th>Trạng thái cũ</th></> : <><th>Mã phiếu cũ</th><th>Ngày xuất</th><th>Người nhận</th><th>Lý do</th><th>Số dòng</th><th>Chi tiết</th></>}
      </tr></thead><tbody>
        {!loading && !error && tab === 'inventory' && balancePages.rows.map(row => <tr key={row.id}><td>{row.code}</td><td title={row.name}>{row.name}</td><td className="warehouse-number">{stockNumber(row.quantity)}</td><td>{row.unit}</td><td className="warehouse-number">{row.minQuantity === null ? 'Chưa thiết lập' : stockNumber(row.minQuantity)}</td><td className={row.quantity < 0 || row.minQuantity !== null && row.quantity < row.minQuantity ? 'warehouse-danger' : ''}>{row.quantity < 0 ? 'Tồn âm' : row.minQuantity !== null && row.quantity < row.minQuantity ? 'Cần nhập hàng' : row.revision ? 'Trong ngưỡng' : 'Chưa có phiếu'}</td><td><RowActionMenu label={`Thao tác ${row.code}`} actions={[{ label: canWrite ? 'Chi tiết / ngưỡng tồn' : 'Chi tiết', onSelect: () => setStock(row) }]} /></td></tr>)}
        {!loading && !error && tab === 'vouchers' && voucherPages.rows.map(row => <tr key={row.id}><td>{row.code}</td><td>{WAREHOUSE_KINDS[row.kind]}</td><td title={row.sourceCode}>{row.sourceCode}</td><td>{row.postingDate}</td><td>{row.actorName}</td><td>{row.reversedBy ? 'Đã đảo' : row.kind === 'reversal' ? 'Phiếu đảo' : 'Đã ghi sổ'}</td><td><RowActionMenu label={`Thao tác ${row.code}`} actions={[{ label: 'Chi tiết', onSelect: () => setSelected(row) }, ...(currentUser.role === 'admin' && !row.reversedBy && row.kind !== 'reversal' ? [{ label: 'Đảo phiếu', onSelect: () => setReversal(row), disabled: !canWrite }] : [])]} /></td></tr>)}
        {!loading && !error && tab === 'report' && reportPages.rows.map(row => <tr key={row.code}><td>{row.code}</td><td title={row.name}>{row.name}</td><td>{row.unit}</td>{[row.opening, row.incoming, row.outgoing, row.closing].map((value, index) => <td className="warehouse-number" key={index}>{stockNumber(value)}</td>)}</tr>)}
        {!loading && !error && tab === 'legacy' && legacyPages.rows.map(row => <tr key={String(row.id)}>{legacyKind === 'inventory' ? <><td title={String(row.materialName || '')}>{String(row.materialName || '')}</td><td>{String(row.unit || '')}</td><td>{String(row.qtyInStock ?? '')}</td><td>{String(row.qtyReserved ?? '')}</td><td>{String(row.minQtyAlert ?? '')}</td><td>{row.deleted ? 'Đã xóa cũ' : 'Dữ liệu cũ'}</td></> : <><td>{String(row.exportCode || row.id)}</td><td>{formatDateTime(String(row.createdAt || row.exportDate || ''))}</td><td>{String(row.receiverName || '')}</td><td title={String(row.reason || '')}>{String(row.reason || '')}</td><td>{Array.isArray(row.items) ? row.items.length : 0}</td><td title={JSON.stringify(row.items || [])}>{JSON.stringify(row.items || [])}</td></>}</tr>)}
        {!loading && !error && pagination.paginationProps.totalItems === 0 && <tr><td colSpan={7}>{search ? 'Không có kết quả phù hợp.' : 'Chưa có dữ liệu.'}</td></tr>}
      </tbody></table></div><DataTablePagination {...pagination.paginationProps} /></div>
    </>}
    {(creating || reversal) && <WarehouseVoucherDialog currentUser={currentUser} reversal={reversal || undefined} onClose={() => { setCreating(false); setReversal(null); }} onSaved={saved} />}
    {selected && <VoucherDetails voucher={selected} vouchers={data.vouchers} onClose={() => setSelected(null)} />}
    {stock && <StockDetails stock={stock} currentUser={currentUser} vouchers={data.vouchers.filter(voucher => voucher.lines.some(line => line.catalogItemId === stock.id))} onClose={() => setStock(null)} onSaved={() => { setStock(null); reload(); }} />}
  </div>;
}

function VoucherDetails({ voucher, vouchers, onClose }: { voucher: WarehouseVoucher; vouchers: WarehouseVoucher[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const related = vouchers.find(row => row.id === (voucher.reversalOf || voucher.reversedBy));
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="warehouse-detail-title" onCancel={event => { event.preventDefault(); onClose(); }}><header><h2 id="warehouse-detail-title">{voucher.code}</h2><button className="btn btn-outline" onClick={onClose}>Đóng</button></header>
    <p>{WAREHOUSE_KINDS[voucher.kind]} · {voucher.sourceCode} · Kho NVL chung</p><p>{formatDateTime(voucher.postedAt)} · {voucher.actorName}</p><p>{voucher.note}</p>{voucher.negativeReason && <p className="warehouse-danger">Xuất âm: {voucher.negativeReason}</p>}{related && <p>Phiếu liên quan: {related.code}</p>}
    <div className="warehouse-grid-scroll"><table><thead><tr><th>Mã NVL</th><th>Tên NVL</th><th>SL nguồn</th><th>ĐVT nguồn</th><th>Hệ số</th><th>Tăng / giảm</th><th>ĐVT cơ sở</th></tr></thead><tbody>{voucher.lines.map(line => <tr key={line.sourceLine}><td>{line.code}</td><td title={line.name}>{line.name}</td><td className="warehouse-number">{stockNumber(line.quantity)}</td><td>{line.unit}</td><td className="warehouse-number">{stockNumber(line.factor)}</td><td className="warehouse-number">{stockNumber(line.delta)}</td><td>{line.baseUnit}</td></tr>)}</tbody></table></div>
  </dialog>;
}
function StockDetails({ stock, currentUser, vouchers, onClose, onSaved }: { stock: WarehouseBalance; currentUser: UserProfile; vouchers: WarehouseVoucher[]; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), pending = useRef(false), request = useRef({ payload: '', id: '' });
  const [threshold, setThreshold] = useState(stock.minQuantity?.toString() || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const dirty = threshold !== (stock.minQuantity?.toString() || '');
  const close = () => { if (!pending.current && (!dirty || window.confirm('Bỏ thay đổi ngưỡng tồn?'))) onClose(); };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { if (!dirty && !busy) return; const unregister = registerNavigationGuard(() => !busy && window.confirm('Bỏ thay đổi ngưỡng tồn?')); const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener('beforeunload', beforeUnload); return () => { unregister(); window.removeEventListener('beforeunload', beforeUnload); }; }, [dirty, busy]);
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="warehouse-stock-title" onCancel={event => { event.preventDefault(); close(); }}><form onSubmit={async event => {
    event.preventDefault(); if (pending.current || !canPostWarehouse(currentUser)) return;
    const body = { action: 'threshold', catalogItemId: stock.id, expectedRevision: stock.revision, minQuantity: Number(threshold) };
    const payload = JSON.stringify(body); if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError('');
    try { await mutateWarehouse({ ...body, requestId: request.current.id }); showSuccessToast('Đã lưu ngưỡng tồn'); onSaved(); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Không lưu được ngưỡng tồn.'; setError(message); showErrorToast(message); }
    finally { pending.current = false; setBusy(false); }
  }}><header><h2 id="warehouse-stock-title">{stock.code} — {stock.name}</h2><button type="button" className="btn btn-outline" disabled={busy} onClick={close}>Đóng</button></header>
    <p>Tồn theo sổ mới: {stockNumber(stock.quantity)} {stock.unit}</p>{error && <p className="warehouse-error" role="alert">{error}</p>}
    {canPostWarehouse(currentUser) && <div className="warehouse-toolbar"><label>Ngưỡng tối thiểu ({stock.unit}) *<input required type="number" min="0" max="1000000000" step="0.000001" value={threshold} disabled={busy} onChange={event => setThreshold(event.target.value)} /></label><button className="btn btn-primary" disabled={busy || !dirty}>{busy ? 'Đang lưu…' : 'Lưu ngưỡng tồn'}</button></div>}
    <div className="warehouse-grid-scroll"><table><thead><tr><th>Mã phiếu</th><th>Nguồn</th><th>Ngày</th><th>Tăng / giảm</th></tr></thead><tbody>{vouchers.sort((a, b) => b.postedAt.localeCompare(a.postedAt)).map(voucher => <tr key={voucher.id}><td>{voucher.code}</td><td>{voucher.sourceCode}</td><td>{voucher.postingDate}</td><td className="warehouse-number">{stockNumber(voucher.lines.filter(line => line.catalogItemId === stock.id).reduce((sum, line) => sum + line.delta, 0))}</td></tr>)}{!vouchers.length && <tr><td colSpan={4}>Chưa có phiếu.</td></tr>}</tbody></table></div>
  </form></dialog>;
}
