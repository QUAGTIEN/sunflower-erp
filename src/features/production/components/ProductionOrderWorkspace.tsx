import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { RowActionMenu } from '@/components/RowActionMenu';
import { ProductionMaterialLedger } from '@/features/inventory/components/ProductionMaterialLedger';
import { ProductionGoodsLedger } from '@/features/inventory/components/ProductionGoodsLedger';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { formatDate } from '@/shared/utils/dateFormatting';
import { getCustomerProductSpecSummary } from '@/features/crm/model/customerProductCatalog';
import type { ProductionMachine } from '../api/machineService';
import { mutateProductionOrder, loadProductionDraftCatalog, type ProductionDraftCatalog } from '../api/productionOrderService';
import { allocatedQuantities, canManageProduction, canDraftProduction, canEditProductionDraft, hasProductionAccess, itemIdentity, PRODUCTION_PRINT_TEMPLATES, PRODUCTION_STATUSES, type CommandRecord, type PlannedMaterial, type ProductionOrder, type ProductionPO, type ProductionPrintTemplate } from '../model/productionOrder';
import { productionPrintHtml } from '../model/productionPrint';
import './ProductionOrders.css';

interface Props {
  pos: ProductionPO[]; commands: CommandRecord[]; currentUser: UserProfile; users: UserProfile[];
  onRefresh: () => void; initialSelectedId?: string; onOpenLegacy?: (id: string) => void;
}
interface Draft {
  id: string; poId: string; revision?: number; quantities: Record<string, string>; requiredItemIds: string[];
  materials: PlannedMaterial[]; machineId: string; operatorId: string; shift: string; deliveryDeadline: string; priority: string; notes: string;
  printTemplate: ProductionPrintTemplate;
  printDetails: Record<string, { materialWidth: string; priority: string }>;
}
const emptyDraft = (): Draft => ({ id: crypto.randomUUID(), poId: '', quantities: {}, requiredItemIds: [], materials: [], machineId: '', operatorId: '', shift: '', deliveryDeadline: '', priority: 'normal', notes: '', printTemplate: { id: 'standard', version: 1 }, printDetails: {} });
const actionNames: Record<string, string> = { create: 'Đã tạo LSX thành công', save: 'Đã lưu thành công', submit: 'Đã gửi duyệt LSX', return: 'Đã trả về nháp', release: 'Đã phát hành LSX', start: 'Đã bắt đầu sản xuất', complete: 'Đã nghiệm thu LSX', cancel: 'Đã hủy LSX' };
const historyNames: Record<string, string> = { create: 'Lập lệnh', save: 'Lưu nháp', submit: 'Gửi duyệt', return: 'Trả về nháp', release: 'Duyệt và phát hành', start: 'Bắt đầu chạy máy', complete: 'Hoàn thành', cancel: 'Hủy lệnh', qc: 'Nghiệm thu QC' };
const LIST_STATUSES: Record<string, string> = { ...PRODUCTION_STATUSES, transfer_pending: 'Chờ duyệt bàn giao' };
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');

export function ProductionOrderWorkspace({ pos, commands, currentUser, users, onRefresh, initialSelectedId, onOpenLegacy }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [orderType, setOrderType] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [machines, setMachines] = useState<ProductionMachine[]>([]);
  const [printOrder, setPrintOrder] = useState<ProductionOrder | null>(null);
  const [printReady, setPrintReady] = useState(false);
  const [qc, setQc] = useState<Record<string, { goodQuantity: string; rejectQuantity: string }>>({});
  const [qcNote, setQcNote] = useState('');
  const [catalog, setCatalog] = useState<ProductionDraftCatalog>({ materials: [], lines: {} });
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReload, setCatalogReload] = useState(0);
  const printFrame = useRef<HTMLIFrameElement>(null);
  const printDialog = useRef<HTMLDialogElement>(null);
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  useEffect(() => {
    if (!hasProductionAccess(currentUser, 'production')) return;
    return dbService.subscribeCollection('machines', data => setMachines(data as ProductionMachine[]));
  }, [currentUser]);
  useEffect(() => {
    if (printOrder && printDialog.current && !printDialog.current.open) printDialog.current.showModal();
  }, [printOrder]);
  useEffect(() => {
    if (!draft?.poId) return;
    let cancelled = false;
    void loadProductionDraftCatalog(draft.poId).then(data => { if (!cancelled) { setCatalog(data); setCatalogError(''); } })
      .catch(cause => { if (!cancelled) { setCatalog({ materials: [], lines: {} }); setCatalogError(cause instanceof Error ? cause.message : 'Không tải được danh mục.'); } })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, [draft?.poId, catalogReload]);
  useEffect(() => {
    if (!draft && !busy) return;
    const unregister = registerNavigationGuard(() => !busy && window.confirm('LSX đang có dữ liệu chưa lưu. Bạn có muốn rời trang?'));
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => { unregister(); window.removeEventListener('beforeunload', beforeUnload); };
  }, [draft, busy]);
  const manager = canManageProduction(currentUser);
  const canCreate = canDraftProduction(currentUser);
  const visiblePOs = pos.filter(po => !po.deleted);
  const accessibleCommands = commands.filter(command => !command.deleted);
  const legacyCount = accessibleCommands.filter(command => command.productionOrderVersion !== 2).length;
  const visible = accessibleCommands
    .filter(command => orderType === 'all' || (orderType === 'managed' ? command.productionOrderVersion === 2 : command.productionOrderVersion !== 2))
    .filter(command => !status || command.status === status)
    .filter(command => `${command.lsxCode} ${command.poCode} ${command.customerName} ${command.operatorName} ${command.productNameToBeCut || command.productName || ''} ${(command.lines || []).map(line => `${line.productCode} ${line.productName}`).join(' ')}`.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const pagination = useDataTablePagination(visible);
  const selected = commands.find(command => command.productionOrderVersion === 2 && command.id === selectedId && !command.deleted) as ProductionOrder | undefined;
  const editingPO = visiblePOs.find(po => po.id === draft?.poId);
  let allocationError = '';
  let allocations = new Map<string, number>();
  if (editingPO) {
    try { allocations = allocatedQuantities(commands.filter(command => command.poId === editingPO.id), draft?.id); }
    catch (error) { allocationError = error instanceof Error ? error.message : 'Không thể tính số lượng còn lại.'; }
  }
  const updateDraft = (patch: Partial<Draft>) => setDraft(current => current ? { ...current, ...patch } : current);
  const choosePO = (poId: string) => {
    setCatalog({ materials: [], lines: {} }); setCatalogError(''); setCatalogLoading(!!poId);
    const po = visiblePOs.find(po => po.id === poId);
    updateDraft({ poId, quantities: {}, printDetails: {}, requiredItemIds: po?.productionPlanRequiredItemIds?.length ? po.productionPlanRequiredItemIds
      : (po?.items || []).filter(item => !['mua_nvl', 'mua_hang', 'dich_vu'].includes(String(item.workType)) && !['giay', 'may_in', 'may_quet', 'muc_in'].includes(String(item.productType))).map(item => itemIdentity(item, (po?.items || []).indexOf(item))),
      deliveryDeadline: String(po?.expectedDeliveryDate || '').slice(0, 10) });
  };
  const edit = (order: ProductionOrder) => {
    setError(''); setSelectedId(''); setCatalog({ materials: [], lines: {} }); setCatalogError(''); setCatalogLoading(true);
    setDraft({ id: order.id, revision: order.revision, poId: order.poId,
      quantities: Object.fromEntries(order.lines.map(line => [line.itemId, String(line.quantity)])),
      requiredItemIds: pos.find(po => po.id === order.poId)?.productionPlanRequiredItemIds || order.lines.map(line => line.itemId),
      materials: structuredClone(order.materials), machineId: order.machineId, operatorId: order.operatorId,
      shift: order.shift, deliveryDeadline: order.deliveryDeadline, priority: order.priority, notes: order.notes,
      printTemplate: order.printTemplate || { id: 'standard', version: 1 },
      printDetails: Object.fromEntries(order.lines.map(line => [line.itemId, line.printDetails || { materialWidth: '', priority: '' }])) });
  };
  const mutate = async (body: Record<string, unknown>, after?: () => void) => {
    if (pending.current) return;
    const payload = JSON.stringify(body);
    if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError('');
    try {
      await mutateProductionOrder({ ...body, requestId: request.current.id });
      request.current = { payload: '', id: '' };
      after?.(); onRefresh(); showSuccessToast(actionNames[String(body.action)] || 'Đã lưu thành công');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.';
      setError(message); showErrorToast(message);
    } finally { pending.current = false; setBusy(false); }
  };
  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !editingPO || allocationError) return;
    void mutate({ action: draft.revision ? 'save' : 'create', id: draft.id, poId: draft.poId, expectedRevision: draft.revision,
      requiredItemIds: draft.requiredItemIds,
      lines: Object.entries(draft.quantities).filter(([, quantity]) => quantity !== '' && Number(quantity) !== 0).map(([itemId, quantity]) => ({ itemId, quantity: Number(quantity), ...(draft.printDetails[itemId] ? { printDetails: draft.printDetails[itemId] } : {}) })),
      materials: draft.materials, machineId: draft.machineId, operatorId: draft.operatorId, shift: draft.shift,
      deliveryDeadline: draft.deliveryDeadline, priority: draft.priority, notes: draft.notes, printTemplate: draft.printTemplate
    }, () => { setSelectedId(draft.id); setDraft(null); });
  };
  const transition = async (action: string) => {
    if (!selected) return;
    if (action === 'cancel' && !await confirmDelete(`Hủy lệnh ${selected.lsxCode}? Số lượng đã giữ chỗ sẽ được giải phóng; lịch sử vẫn được giữ lại.`, { title: 'Xác nhận hủy lệnh', confirmLabel: 'Hủy lệnh' })) return;
    void mutate({ action, id: selected.id, poId: selected.poId, expectedRevision: selected.revision,
      ...(action === 'complete' ? { results: selected.lines.map(line => ({ itemId: line.itemId, goodQuantity: Number(qc[line.itemId]?.goodQuantity || 0), rejectQuantity: Number(qc[line.itemId]?.rejectQuantity || 0) })), qcNote } : {}) });
  };
  const open = (order: CommandRecord) => {
    if (order.productionOrderVersion !== 2) { onOpenLegacy?.(String(order.id)); return; }
    setError(''); setSelectedId(String(order.id)); setQc({}); setQcNote('');
  };
  const materialField = (index: number, key: keyof PlannedMaterial, value: string) => updateDraft({ materials: draft!.materials.map((material, position) => position === index ? { ...material, [key]: ['quantity', 'allowancePercent'].includes(key) ? Number(value) : value } : material) });

  if (!hasProductionAccess(currentUser, 'production')) return <div role="alert">Bạn không có quyền truy cập Sản xuất.</div>;

  return <section className="lsx-workspace" data-erp-table-text="single-line" data-erp-table-layout={draft || selected ? 'content' : undefined} aria-label="Lệnh sản xuất" aria-busy={busy}>
    {error && <div className="lsx-error" role="alert">{error}</div>}
    {draft ? <form onSubmit={saveDraft} className="lsx-editor">
      <header className="lsx-heading"><div><h2>{draft.revision ? 'Chỉnh sửa LSX nháp' : 'Lập lệnh sản xuất'}</h2><span>Một PO có thể chia thành nhiều lệnh; vật tư bên dưới là số lượng dự kiến.</span></div><div className="lsx-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={() => { if (window.confirm('LSX chưa lưu. Bạn có muốn bỏ thay đổi?')) { setDraft(null); setError(''); } }}>Quay lại</button><button className="btn btn-primary" disabled={busy || !editingPO || !!allocationError}>{busy ? 'Đang lưu…' : 'Lưu nháp'}</button></div></header>
      <fieldset disabled={busy}><section className="lsx-section"><h3>Thông tin lệnh</h3><div className="lsx-fields">
        <label className="lsx-wide">Đơn hàng PO *<select required value={draft.poId} disabled={!!draft.revision} onChange={event => choosePO(event.target.value)}><option value="">Chọn PO</option>{visiblePOs.filter(po => ['waiting_design', 'receive_po', 'bom_extracted', 'design_sent', 'layout_pending', 'waiting_production', 'production_pending', 'producing', 'supplier_confirmed'].includes(String(po.status))).map(po => <option key={po.id} value={po.id}>{po.poCode} — {po.customerName}</option>)}</select></label>
        <label>Ngày cần *<input type="date" value={draft.deliveryDeadline} onChange={event => updateDraft({ deliveryDeadline: event.target.value })} /></label>
        <label>Ưu tiên<select value={draft.priority} onChange={event => updateDraft({ priority: event.target.value })}><option value="normal">Bình thường</option><option value="high">Hơi gấp</option><option value="urgent">Gấp</option></select></label>
        <label>Máy sản xuất<select value={draft.machineId} onChange={event => updateDraft({ machineId: event.target.value })}><option value="">Chọn máy (bắt buộc khi phát hành)</option>{machines.filter(machine => machine.status === 'available').map(machine => <option key={machine.id} value={machine.id}>{machine.code} — {machine.name}</option>)}</select></label>
        <label>Người chạy máy<select value={draft.operatorId} onChange={event => updateDraft({ operatorId: event.target.value })}><option value="">Chọn nhân sự</option>{users.filter(user => user.active && ['producer', 'admin'].includes(user.role)).map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></label>
        <label className="lsx-wide">Ca / tổ sản xuất<input value={draft.shift} maxLength={100} onChange={event => updateDraft({ shift: event.target.value })} placeholder="Ví dụ: Ca sáng / Tổ in 01" /></label>
        <label className="lsx-wide">Mẫu in<select value={draft.printTemplate.id} onChange={event => updateDraft({ printTemplate: { id: event.target.value as ProductionPrintTemplate['id'], version: 1 } })}>{Object.entries(PRODUCTION_PRINT_TEMPLATES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div></section>
      <section className="lsx-section"><h3>Mặt hàng cần sản xuất</h3><p className="lsx-hint">Xác định cột “Cần SX” cho toàn PO trước lệnh đầu tiên; bỏ hàng mua bán lại / dịch vụ. Nhập số lượng vào các dòng muốn đưa vào lệnh này. Các dòng còn lại có thể lập lệnh sau.</p>
        {allocationError && <p className="lsx-error">{allocationError}</p>}
        <div className="table-container"><table className="lsx-lines"><thead><tr><th>Cần SX</th><th>Mã / tên sản phẩm</th><th>Quy cách / chất liệu</th><th>ĐVT</th><th>SL PO</th><th>Đã phân bổ</th><th>SL lệnh này</th></tr></thead><tbody>
          {(editingPO?.items || []).map((item, index) => { const id = itemIdentity(item, index); const allocated = allocations.get(id) || 0; const remaining = Math.max(0, Number(item.quantity) - allocated); return <tr key={id}>
            <td><input aria-label={`Cần sản xuất ${item.productName}`} type="checkbox" checked={draft.requiredItemIds.includes(id)} disabled={!!editingPO?.productionPlanRequiredItemIds?.length} onChange={event => updateDraft({ requiredItemIds: event.target.checked ? [...draft.requiredItemIds, id] : draft.requiredItemIds.filter(key => key !== id), quantities: { ...draft.quantities, [id]: '' } })} /></td>
            <td title={`${item.productCode || 'Nhập tay'} — ${item.productName}`}><strong>{String(item.productCode || 'Nhập tay')}</strong> {String(item.productName || '')}</td><td title={String(item.size || item.material || '')}>{String(item.size || item.material || '—')}</td><td>{String(item.unit || '—')}</td><td>{number(item.quantity)}</td><td>{number(allocated)}</td><td><input aria-label={`Số lượng ${item.productName}`} type="number" min="0" step="any" max={remaining} disabled={!draft.requiredItemIds.includes(id) || !!allocationError} placeholder={`Còn ${number(remaining)}`} value={draft.quantities[id] || ''} onChange={event => updateDraft({ quantities: { ...draft.quantities, [id]: event.target.value } })} /></td></tr>; })}
          {!editingPO && <tr><td colSpan={7}>Chọn PO để hiển thị danh mục mặt hàng.</td></tr>}
        </tbody></table></div>
      </section>
      {editingPO && <section className="lsx-section"><h3>Mã nội bộ và thông tin bổ sung trên phiếu</h3>
        {catalogLoading && <p role="status" className="lsx-hint">Đang tải mã nội bộ và danh mục NVL…</p>}
        {catalogError && <div role="alert" className="lsx-hint">{catalogError} Không tự ghép mã theo tên; thông tin được máy chủ kiểm tra lại khi lưu. <button type="button" className="btn btn-outline" disabled={catalogLoading} onClick={() => { setCatalogLoading(true); setCatalogReload(value => value + 1); }}>Tải lại danh mục</button></div>}
        <div className="table-container"><table><thead><tr><th>Dòng PO</th><th>Mã nội bộ đã liên kết</th><th>Khổ NVL (mm)</th><th>Ưu tiên dòng</th></tr></thead><tbody>{(editingPO.items || []).filter((item, index) => draft.requiredItemIds.includes(itemIdentity(item, index))).map(item => {
          const index = editingPO.items!.indexOf(item), id = itemIdentity(item, index), mapped = catalog.lines[id];
          const details = draft.printDetails[id] || { materialWidth: '', priority: '' };
          return <tr key={id}><td>{String(item.productCode || 'Nhập tay')} — {String(item.productName || '')}</td><td title={mapped?.error}>{mapped?.error || mapped?.catalog?.code || 'Chưa có liên kết đã xác nhận'}</td>
            <td><input aria-label={`Khổ NVL ${item.productName}`} type="number" min="0.001" step="any" value={details.materialWidth} onChange={event => updateDraft({ printDetails: { ...draft.printDetails, [id]: { ...details, materialWidth: event.target.value } } })} /></td>
            <td><select aria-label={`Ưu tiên ${item.productName}`} value={details.priority} onChange={event => updateDraft({ printDetails: { ...draft.printDetails, [id]: { ...details, priority: event.target.value } } })}><option value="">Theo ưu tiên lệnh</option><option value="urgent">Gấp</option><option value="high">Hơi gấp</option><option value="normal">Bình thường</option></select></td></tr>;
        })}</tbody></table></div><p className="lsx-hint">Không sửa thông số PO đã chốt. Khổ NVL là khổ vật liệu đầu vào, không lấy từ chiều rộng con tem. Mã chưa liên kết vẫn được lưu theo luồng cũ và cần đối soát trước khi hạch toán kho.</p>
      </section>}
      <section className="lsx-section"><div className="lsx-heading"><h3>Vật tư dự kiến sử dụng</h3><button type="button" className="btn btn-outline" onClick={() => updateDraft({ materials: [...draft.materials, { id: crypto.randomUUID(), code: '', name: '', width: '', unit: '', quantity: 0, allowancePercent: 0 }] })}>Thêm vật tư</button></div>
        {draft.materials.map((material, index) => <label key={material.id}>Chọn mã NVL cho dòng {index + 1}<select value={material.catalogItemId || ''} onChange={event => {
          const item = catalog.materials.find(item => item.id === event.target.value);
          updateDraft({ materials: draft.materials.map((row, position) => position !== index ? row : { ...row, catalogItemId: item?.id || '', code: item?.code || row.code, name: item?.name || row.name, unit: item?.baseUnit || row.unit }) });
        }}><option value="">Nhập tay theo luồng cũ (chưa liên kết)</option>{material.catalogItemId && !catalog.materials.some(item => item.id === material.catalogItemId) && <option value={material.catalogItemId}>{material.code} — cần tải/đối chiếu danh mục</option>}{catalog.materials.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name} ({item.baseUnit})</option>)}</select></label>)}
        <div className="table-container"><table className="lsx-materials"><thead><tr><th>Mã NVL</th><th>Tên vật tư</th><th>Khổ (mm)</th><th>ĐVT</th><th>Số lượng</th><th>Hao hụt (%)</th><th>Thao tác</th></tr></thead><tbody>{draft.materials.map((material, index) => <tr key={material.id}>{(['code', 'name', 'width', 'unit', 'quantity', 'allowancePercent'] as const).map(key => <td key={key}><input aria-label={`${key} vật tư ${index + 1}`} required={key !== 'width'} readOnly={!!material.catalogItemId && ['code', 'name'].includes(key)} type={['quantity', 'allowancePercent'].includes(key) ? 'number' : 'text'} min={key === 'quantity' ? '0.000001' : 0} max={key === 'allowancePercent' ? 100 : undefined} step="any" value={material[key]} onChange={event => materialField(index, key, event.target.value)} /></td>)}<td><button className="btn btn-outline" type="button" onClick={() => updateDraft({ materials: draft.materials.filter((_, position) => position !== index) })}>Bỏ dòng</button></td></tr>)}{!draft.materials.length && <tr><td colSpan={7}>Chưa khai báo vật tư. Có thể bổ sung khi lưu nháp; bắt buộc trước khi phát hành.</td></tr>}</tbody></table></div>
      </section><section className="lsx-section"><label>Ghi chú kỹ thuật / yêu cầu sản xuất<textarea rows={2} maxLength={3000} value={draft.notes} onChange={event => updateDraft({ notes: event.target.value })} /></label></section></fieldset>
    </form> : selected ? <>
      <header className="lsx-heading"><div><h2>{selected.lsxCode} <span className={`lsx-status lsx-status--${selected.status}`}>{PRODUCTION_STATUSES[selected.status]}</span></h2><span>{selected.poCode} · {selected.customerName}</span></div><div className="lsx-actions"><button className="btn btn-outline" disabled={busy} onClick={() => { setSelectedId(''); setError(''); }}>Quay lại</button><button className="btn btn-outline" onClick={() => { setPrintReady(false); setPrintOrder(selected); }}>In phiếu</button>
        {canEditProductionDraft(currentUser, selected) && <><button className="btn btn-outline" disabled={busy} onClick={() => edit(selected)}>Sửa nháp</button><button className="btn btn-primary" disabled={busy} onClick={() => void transition('submit')}>Gửi duyệt</button></>}
        {selected.status === 'pending_approval' && manager && <><button className="btn btn-outline" disabled={busy} onClick={() => void transition('return')}>Trả về nháp</button><button className="btn btn-primary" disabled={busy} onClick={() => void transition('release')}>Duyệt & phát hành</button></>}
        {selected.status === 'released' && manager && <button className="btn btn-primary" disabled={busy} onClick={() => void transition('start')}>Bắt đầu sản xuất</button>}
        {['draft', 'pending_approval', 'released'].includes(selected.status) && manager && <button className="btn btn-outline" disabled={busy} onClick={() => void transition('cancel')}>Hủy lệnh</button>}
      </div></header>
      <p className="lsx-hint">Mẫu in: {PRODUCTION_PRINT_TEMPLATES[selected.printTemplate?.id || 'standard']} · phiên bản mẫu {selected.printTemplate?.version || 1}. Mã nội bộ: {selected.lines.map(line => line.catalog?.code || `${line.productCode || line.productName}: chưa liên kết`).join('; ')}</p>
      <section className="lsx-section"><div className="lsx-meta"><span>Ngày cần: <strong>{formatDate(selected.deliveryDeadline)}</strong></span><span>Máy: <strong>{selected.machineName || machines.find(machine => machine.id === selected.machineId)?.name || 'Chưa chọn'}</strong></span><span>Người chạy: <strong>{selected.operatorName || users.find(user => user.uid === selected.operatorId)?.displayName || 'Chưa chọn'}</strong></span><span>Ca: <strong>{selected.shift || '—'}</strong></span><span>Người lập: <strong>{selected.createdBy}</strong></span><span>Ưu tiên: <strong>{{ urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' }[selected.priority]}</strong></span></div></section>
      <section className="lsx-section"><h3>Thông tin sản xuất đã chốt theo PO</h3><div className="table-container"><table className="lsx-detail-lines"><thead><tr><th>Mã / tên sản phẩm</th><th>Quy cách / vật liệu</th><th>SL lệnh / ĐVT</th><th>Góc / răng cưa</th><th>Lõi / NVL</th><th>Đạt QC / hỏng</th></tr></thead><tbody>{selected.lines.map(line => <tr key={line.itemId}><td title={`${line.productCode} — ${line.productName}`}>{line.productCode || 'Nhập tay'} — {line.productName}</td><td title={`${line.specification} · ${line.material}`}>{line.specification} · {line.material}</td><td>{number(line.quantity)} {line.unit}</td><td title={String(line.specifications.perforated || '')}>{String(line.specifications.dieCut || line.specifications.corner || '—')} / {String(line.specifications.perforated || '—')}</td><td title={String(line.specifications.paperCode || '')}>{String(line.specifications.core || '—')} / {String(line.specifications.coreType || '—')} / {String(line.specifications.paperCode || '—')}</td><td>{selected.status === 'completed' ? `${number(line.goodQuantity)} / ${number(line.rejectQuantity)}` : 'Chưa nghiệm thu'}</td></tr>)}</tbody></table></div>
        <details><summary>Xem toàn bộ thông số kỹ thuật và ảnh</summary><div className="lsx-specifications">{selected.lines.map(line => <article key={line.itemId}><h3>{line.productCode || 'Nhập tay'} — {line.productName}</h3><dl>{getCustomerProductSpecSummary(line.specifications, line.productType).map(field => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>{line.image && <img src={line.image} alt={`Mẫu ${line.productName}`} />}</article>)}</div></details>
      </section>
      <section className="lsx-section"><h3>Vật tư dự kiến</h3><div className="table-container"><table><thead><tr><th>Mã NVL</th><th>Tên NVL</th><th>Khổ (mm)</th><th>SL / ĐVT</th><th>Hao hụt (%)</th></tr></thead><tbody>{selected.materials.map(material => <tr key={material.id}><td>{material.code}</td><td title={material.name}>{material.name}</td><td>{material.width || '—'}</td><td>{number(material.quantity)} {material.unit}</td><td>{number(material.allowancePercent)}</td></tr>)}{!selected.materials.length && <tr><td colSpan={5}>Chưa khai báo vật tư dự kiến.</td></tr>}</tbody></table></div><p className="lsx-hint">Lưu, phát hành, in và nghiệm thu lệnh không tự trừ tồn kho. Cấp/hoàn thực tế theo phiếu kho riêng.</p><p className="lsx-note">{selected.notes || 'Không có ghi chú.'}</p></section>
      <ProductionMaterialLedger key={selected.id} orderId={selected.id} status={selected.status} currentUser={currentUser} onRefresh={onRefresh} />
      <ProductionGoodsLedger key={`goods-${selected.id}`} orderId={selected.id} status={selected.status} currentUser={currentUser} onRefresh={onRefresh} />
      {selected.status === 'producing' && manager && <form className="lsx-section" onSubmit={event => { event.preventDefault(); void transition('complete'); }}><h3>Nghiệm thu sản lượng / QC</h3><fieldset disabled={busy}><div className="table-container"><table><thead><tr><th>Sản phẩm</th><th>SL lệnh / ĐVT</th><th>SL đạt QC</th><th>SL hỏng</th></tr></thead><tbody>{selected.lines.map(line => <tr key={line.itemId}><td>{line.productCode} — {line.productName}</td><td>{number(line.quantity)} {line.unit}</td><td><input aria-label={`Đạt QC ${line.productName}`} type="number" required min="0" step="any" max={line.quantity} value={qc[line.itemId]?.goodQuantity ?? ''} onChange={event => setQc({ ...qc, [line.itemId]: { goodQuantity: event.target.value, rejectQuantity: qc[line.itemId]?.rejectQuantity || '0' } })} /></td><td><input aria-label={`Hỏng ${line.productName}`} type="number" required min="0" step="any" max={line.quantity} value={qc[line.itemId]?.rejectQuantity ?? '0'} onChange={event => setQc({ ...qc, [line.itemId]: { goodQuantity: qc[line.itemId]?.goodQuantity || '0', rejectQuantity: event.target.value } })} /></td></tr>)}</tbody></table></div><label>Ghi chú nghiệm thu *<textarea required rows={2} maxLength={2000} value={qcNote} onChange={event => setQcNote(event.target.value)} /></label><p className="lsx-hint">Chỉ sản lượng đạt QC được tính cho PO. Phần thiếu có thể lập lệnh bổ sung; PO chỉ chuyển chờ giao khi đủ tất cả dòng cần SX.</p><button className="btn btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận nghiệm thu'}</button></fieldset></form>}
      <details className="lsx-section"><summary>Lịch sử thao tác</summary><ol className="lsx-history">{selected.history.map((entry, index) => <li key={index}>{new Date(entry.at).toLocaleString('vi-VN')} · {entry.actorName} · {historyNames[entry.action] || entry.action}{entry.action === 'qc' ? `: ${entry.note}` : ''}</li>)}</ol></details>
    </> : <>
      <header className="lsx-heading"><div><h2>Lệnh sản xuất</h2><span>{accessibleCommands.length} lệnh{legacyCount > 0 ? ` (${legacyCount} lệnh cũ)` : ''}</span></div>{canCreate && <button className="btn btn-primary" onClick={() => { setDraft(emptyDraft()); setError(''); }}>Lập lệnh sản xuất</button>}</header>
      <div className="lsx-toolbar">
        <label>Tìm kiếm<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Mã LSX, PO, khách hàng, sản phẩm…" /></label>
        <label>Trạng thái<select value={status} onChange={event => setStatus(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(LIST_STATUSES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Loại lệnh<select value={orderType} onChange={event => setOrderType(event.target.value)}><option value="all">Tất cả lệnh</option><option value="managed">Lệnh mới</option><option value="legacy">Lệnh cũ</option></select></label>
      </div>
      <div className="lsx-list-frame">
        <div className="table-container erp-primary-data-table"><table className="lsx-list" data-resize-key="production-orders"><thead><tr><th>Mã LSX</th><th>PO / khách hàng</th><th>Mặt hàng</th><th>Máy / nhân sự</th><th>Ngày cần</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{pagination.rows.map(command => <tr key={String(command.id)}><td>{String(command.lsxCode || '')}</td><td title={`${command.poCode} — ${command.customerName || ''}`}>{String(command.poCode)} — {String(command.customerName || '')}</td><td title={(command.lines || []).map(line => line.productName).join(', ')}>{command.productionOrderVersion === 2 ? `${command.lines?.length || 0} mặt hàng` : String(command.productName || 'Lệnh cũ')}</td><td title={`${command.machineName || command.machineId || ''} / ${command.operatorName || ''}`}>{String(command.machineName || command.machineId || 'Chưa phân công')} / {String(command.operatorName || '')}</td><td>{formatDate(command.deliveryDeadline)}</td><td><span className={`lsx-status lsx-status--${command.status}`}>{command.productionOrderVersion !== 2 && LIST_STATUSES[String(command.status)] ? 'Lệnh cũ · ' : ''}{LIST_STATUSES[String(command.status)] || 'Lệnh cũ'}</span></td><td title={command.productionOrderVersion !== 2 && !onOpenLegacy ? 'Lệnh cũ' : undefined}>{command.productionOrderVersion === 2 || onOpenLegacy ? <RowActionMenu label={`Thao tác ${command.lsxCode || 'lệnh sản xuất'}`} actions={[{ label: 'Chi tiết', onSelect: () => open(command) }]} /> : 'Lệnh cũ'}</td></tr>)}{!visible.length && <tr><td colSpan={7}>Chưa có lệnh phù hợp. Chọn “Lập lệnh sản xuất” để phân bổ mặt hàng từ PO.</td></tr>}</tbody></table></div>
        <DataTablePagination {...pagination.paginationProps} />
      </div>
    </>}
    {printOrder && <dialog ref={printDialog} className="lsx-print-dialog" aria-labelledby="lsx-print-title" onCancel={event => { event.preventDefault(); setPrintOrder(null); }}><header className="lsx-heading"><h2 id="lsx-print-title">Xem phiếu in — {printOrder.lsxCode}</h2><div className="lsx-actions"><button className="btn btn-outline" onClick={() => setPrintOrder(null)}>Đóng</button><button className="btn btn-primary" disabled={!printReady} onClick={() => { printFrame.current?.contentWindow?.focus(); printFrame.current?.contentWindow?.print(); }}>In / lưu PDF</button></div></header><iframe ref={printFrame} title="Phiếu lệnh sản xuất" sandbox="allow-same-origin allow-modals" srcDoc={productionPrintHtml(printOrder)} onLoad={event => { const fonts = event.currentTarget.contentDocument?.fonts; if (fonts) void fonts.ready.then(() => setPrintReady(true)); else setPrintReady(true); }} /></dialog>}
  </section>;
}
