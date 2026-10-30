import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { RowActionMenu } from '@/components/RowActionMenu';
import { PageBackButton } from '@/components/PageBackButton';
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
import {
  mutateProductionOrder,
  loadProductionDraftCatalog,
  type ProductionDraftCatalog
} from '../api/productionOrderService';
import {
  canManageProduction,
  canDraftProduction,
  canEditProductionDraft,
  DEFAULT_PRINT_TEMPLATE,
  hasProductionAccess,
  lineKey,
  linePoId,
  PRODUCTION_PRINT_TEMPLATES,
  PRODUCTION_PRINT_VERSIONS,
  PRODUCTION_STATUSES,
  type CommandRecord,
  type PlannedMaterial,
  type ProductionOrder,
  type ProductionPO,
  type ProductionPrintTemplate
} from '../model/productionOrder';
import { productionPrintHtml } from '../model/productionPrint';
import { LsxItemsTable } from './productionOrderEditor/LsxItemsTable';
import { LsxPoPickerDialog } from './productionOrderEditor/LsxPoPickerDialog';
import {
  EMPTY_PRINT_DETAILS,
  customerKeyOf,
  customerLabelOf,
  type DraftLine
} from './productionOrderEditor/draftLines';
import { LsxMaterialsTable } from './productionOrderEditor/LsxMaterialsTable';
import './ProductionOrders.css';

interface Props {
  pos: ProductionPO[];
  commands: CommandRecord[];
  currentUser: UserProfile;
  users: UserProfile[];
  onRefresh: () => void;
  initialSelectedId?: string;
  onOpenLegacy?: (id: string) => void;
}
interface Draft {
  id: string;
  revision?: number;
  lines: DraftLine[];
  materials: PlannedMaterial[];
  machineId: string;
  operatorId: string;
  shift: string;
  deliveryDeadline: string;
  priority: string;
  notes: string;
  printTemplate: ProductionPrintTemplate;
}
const emptyDraft = (): Draft => ({
  id: crypto.randomUUID(),
  lines: [],
  materials: [],
  machineId: '',
  operatorId: '',
  shift: '',
  deliveryDeadline: '',
  priority: 'normal',
  notes: '',
  printTemplate: DEFAULT_PRINT_TEMPLATE
});
/** The template chosen in the editor; picking a template uses its latest layout version. */
const latestTemplate = (id: ProductionPrintTemplate['id']): ProductionPrintTemplate => ({
  id,
  version: Math.max(...PRODUCTION_PRINT_VERSIONS[id]) as ProductionPrintTemplate['version']
});
const actionNames: Record<string, string> = {
  create: 'Đã tạo LSX thành công',
  save: 'Đã lưu thành công',
  submit: 'Đã gửi duyệt LSX',
  return: 'Đã trả về nháp',
  release: 'Đã phát hành LSX',
  start: 'Đã bắt đầu sản xuất',
  complete: 'Đã nghiệm thu LSX',
  cancel: 'Đã hủy LSX',
  request_materials: 'Đã tạo đề nghị mua thêm NVL'
};
const historyNames: Record<string, string> = {
  create: 'Lập lệnh',
  save: 'Lưu nháp',
  submit: 'Gửi duyệt',
  return: 'Trả về nháp',
  release: 'Duyệt và phát hành',
  start: 'Bắt đầu chạy máy',
  complete: 'Hoàn thành',
  cancel: 'Hủy lệnh',
  qc: 'Nghiệm thu QC',
  request_materials: 'Đề nghị mua thêm NVL'
};
const LIST_STATUSES: Record<string, string> = { ...PRODUCTION_STATUSES, transfer_pending: 'Chờ duyệt bàn giao' };
const PRIORITY_LABELS: Record<string, string> = { urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' };
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');

export function ProductionOrderWorkspace({
  pos,
  commands,
  currentUser,
  users,
  onRefresh,
  initialSelectedId,
  onOpenLegacy
}: Props) {
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
  const [qc, setQc] = useState<
    Record<string, { goodQuantity: string; rejectQuantity: string; surplusQuantity: string }>
  >({});
  const [qcNote, setQcNote] = useState('');
  const [catalog, setCatalog] = useState<ProductionDraftCatalog>({ materials: [], lines: {} });
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReload, setCatalogReload] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const draftPoIds = [...new Set((draft?.lines || []).map(line => line.poId))].sort().join(',');
  useEffect(() => {
    if (!draftPoIds) return;
    let cancelled = false;
    void loadProductionDraftCatalog(draftPoIds.split(','))
      .then(data => {
        if (!cancelled) {
          setCatalog(data);
          setCatalogError('');
        }
      })
      .catch(cause => {
        if (!cancelled) {
          setCatalog({ materials: [], lines: {} });
          setCatalogError(cause instanceof Error ? cause.message : 'Không tải được danh mục.');
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draftPoIds, catalogReload]);
  useEffect(() => {
    if (!draft && !busy) return;
    const unregister = registerNavigationGuard(
      () => !busy && window.confirm('LSX đang có dữ liệu chưa lưu. Bạn có muốn rời trang?')
    );
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [draft, busy]);
  const manager = canManageProduction(currentUser);
  const canCreate = canDraftProduction(currentUser);
  const visiblePOs = pos.filter(po => !po.deleted);
  const accessibleCommands = commands.filter(command => !command.deleted);
  const legacyCount = accessibleCommands.filter(command => command.productionOrderVersion !== 2).length;
  const visible = accessibleCommands
    .filter(
      command =>
        orderType === 'all' ||
        (orderType === 'managed' ? command.productionOrderVersion === 2 : command.productionOrderVersion !== 2)
    )
    .filter(command => !status || command.status === status)
    .filter(command =>
      `${command.lsxCode} ${command.poCode} ${command.customerName} ${command.operatorName} ${command.productNameToBeCut || command.productName || ''} ${(command.lines || []).map(line => `${line.productCode} ${line.productName}`).join(' ')}`
        .toLocaleLowerCase('vi')
        .includes(search.trim().toLocaleLowerCase('vi'))
    )
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const pagination = useDataTablePagination(visible);
  const selected = commands.find(
    command => command.productionOrderVersion === 2 && command.id === selectedId && !command.deleted
  ) as ProductionOrder | undefined;
  const selectedPoCodes = selected ? (selected.poCodes?.length ? selected.poCodes.join(', ') : selected.poCode) : '';
  // An order may mix customers (D-LSX2); the header lists those of the lines chosen so far.
  const draftCustomers = draft
    ? [
        ...new Map(
          draft.lines
            .map(line => visiblePOs.find(po => po.id === line.poId))
            .filter((po): po is ProductionPO => Boolean(po))
            .map(po => [customerKeyOf(po), customerLabelOf(po)] as [string, string])
        ).values()
      ]
    : [];
  const updateDraft = (patch: Partial<Draft>) => setDraft(current => (current ? { ...current, ...patch } : current));
  const addLines = (lines: DraftLine[]) => {
    if (!draft) return;
    setCatalogLoading(true);
    // The order is needed by the earliest requested date among its POs unless the user already set one.
    const deadlines = lines
      .map(line => String(visiblePOs.find(po => po.id === line.poId)?.expectedDeliveryDate || '').slice(0, 10))
      .filter(Boolean)
      .sort();
    updateDraft({
      lines: [...draft.lines, ...lines],
      deliveryDeadline: draft.deliveryDeadline || deadlines[0] || ''
    });
  };
  const edit = (order: ProductionOrder) => {
    setError('');
    setSelectedId('');
    setCatalog({ materials: [], lines: {} });
    setCatalogError('');
    setCatalogLoading(true);
    setDraft({
      id: order.id,
      revision: order.revision,
      lines: order.lines.map(line => ({
        poId: linePoId(line, order),
        itemId: line.itemId,
        quantity: String(line.quantity),
        printDetails: line.printDetails || EMPTY_PRINT_DETAILS
      })),
      materials: structuredClone(order.materials),
      machineId: order.machineId,
      operatorId: order.operatorId,
      shift: order.shift,
      deliveryDeadline: order.deliveryDeadline,
      priority: order.priority,
      notes: order.notes,
      printTemplate: order.printTemplate || { id: 'standard', version: 1 }
    });
  };
  const supplement = (order: ProductionOrder) => {
    const shortLines = order.lines.filter(line => line.quantity - (line.goodQuantity ?? 0) > 1e-8);
    if (!shortLines.length) return;
    setError('');
    setSelectedId('');
    setCatalog({ materials: [], lines: {} });
    setCatalogError('');
    setCatalogLoading(true);
    setDraft({
      id: crypto.randomUUID(),
      lines: shortLines.map(line => ({
        poId: linePoId(line, order),
        itemId: line.itemId,
        quantity: String(Math.round((line.quantity - (line.goodQuantity ?? 0)) * 1_000_000) / 1_000_000),
        printDetails: line.printDetails || EMPTY_PRINT_DETAILS
      })),
      materials: structuredClone(order.materials),
      machineId: order.machineId,
      operatorId: order.operatorId,
      shift: order.shift,
      deliveryDeadline: order.deliveryDeadline,
      priority: order.priority,
      notes: `Bổ sung phần thiếu của ${order.lsxCode}`,
      printTemplate: order.printTemplate || DEFAULT_PRINT_TEMPLATE
    });
  };
  const mutate = async (body: Record<string, unknown>, after?: () => void) => {
    if (pending.current) return;
    const payload = JSON.stringify(body);
    if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await mutateProductionOrder({ ...body, requestId: request.current.id });
      request.current = { payload: '', id: '' };
      after?.();
      onRefresh();
      showSuccessToast(actionNames[String(body.action)] || 'Đã lưu thành công');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể hoàn tất thao tác.';
      setError(message);
      showErrorToast(message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const saveDraft = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !draft.lines.length) return;
    void mutate(
      {
        action: draft.revision ? 'save' : 'create',
        id: draft.id,
        expectedRevision: draft.revision,
        lines: draft.lines.map(line => ({
          poId: line.poId,
          itemId: line.itemId,
          quantity: Number(line.quantity),
          printDetails: line.printDetails
        })),
        materials: draft.materials,
        machineId: draft.machineId,
        operatorId: draft.operatorId,
        shift: draft.shift,
        deliveryDeadline: draft.deliveryDeadline,
        priority: draft.priority,
        notes: draft.notes,
        printTemplate: draft.printTemplate
      },
      () => {
        setSelectedId(draft.id);
        setDraft(null);
      }
    );
  };
  const transition = async (action: string) => {
    if (!selected) return;
    if (
      action === 'cancel' &&
      !(await confirmDelete(
        `Hủy lệnh ${selected.lsxCode}? Số lượng đã giữ chỗ sẽ được giải phóng; lịch sử vẫn được giữ lại.`,
        { title: 'Xác nhận hủy lệnh', confirmLabel: 'Hủy lệnh' }
      ))
    )
      return;
    void mutate({
      action,
      id: selected.id,
      expectedRevision: selected.revision,
      ...(action === 'complete'
        ? {
            results: selected.lines.map(line => ({
              lineId: lineKey(line),
              goodQuantity: Number(qc[lineKey(line)]?.goodQuantity || 0),
              rejectQuantity: Number(qc[lineKey(line)]?.rejectQuantity || 0),
              surplusQuantity: Number(qc[lineKey(line)]?.surplusQuantity || 0)
            })),
            qcNote
          }
        : {})
    });
  };
  const open = (order: CommandRecord) => {
    if (order.productionOrderVersion !== 2) {
      onOpenLegacy?.(String(order.id));
      return;
    }
    setError('');
    setSelectedId(String(order.id));
    setQc({});
    setQcNote('');
  };

  if (!hasProductionAccess(currentUser, 'production'))
    return <div role="alert">Bạn không có quyền truy cập Sản xuất.</div>;

  return (
    <section
      className="lsx-workspace"
      data-erp-table-text="single-line"
      data-erp-table-layout={draft || selected ? 'content' : undefined}
      aria-label="Lệnh sản xuất"
      aria-busy={busy}
    >
      {error && (
        <div className="lsx-error" role="alert">
          {error}
        </div>
      )}
      {draft ? (
        <form onSubmit={saveDraft} className="lsx-editor">
          <header className="lsx-heading">
            <div className="app-heading-with-back">
              <PageBackButton
                title="Quay lại danh sách LSX"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('LSX chưa lưu. Bạn có muốn bỏ thay đổi?')) {
                    setDraft(null);
                    setError('');
                  }
                }}
              />
              <h2>{draft.revision ? 'Chỉnh sửa LSX nháp' : 'Lập lệnh sản xuất'}</h2>
            </div>
            <div className="lsx-actions">
              <button className="btn btn-primary" disabled={busy || !draft.lines.length}>
                {busy ? 'Đang lưu…' : 'Lưu nháp'}
              </button>
            </div>
          </header>
          <fieldset disabled={busy}>
            <section className="lsx-section">
              <h3>Thông tin chung</h3>
              <div className="lsx-fields">
                <div className="lsx-field-wide">
                  <span>Khách hàng (theo hàng đã chọn)</span>
                  <output className="lsx-readonly" title={draftCustomers.join('; ')}>
                    {draftCustomers.length
                      ? `${draftCustomers.length} khách · ${draftCustomers.join(', ')}`
                      : 'Chưa chọn hàng'}
                  </output>
                </div>
                <label>
                  Ngày cần *
                  <input
                    type="date"
                    value={draft.deliveryDeadline}
                    onChange={event => updateDraft({ deliveryDeadline: event.target.value })}
                  />
                </label>
                <label>
                  Ưu tiên
                  <select value={draft.priority} onChange={event => updateDraft({ priority: event.target.value })}>
                    <option value="normal">Bình thường</option>
                    <option value="high">Hơi gấp</option>
                    <option value="urgent">Gấp</option>
                  </select>
                </label>
                <label>
                  Mẫu phiếu
                  <select
                    value={draft.printTemplate.id}
                    onChange={event =>
                      updateDraft({
                        printTemplate: latestTemplate(event.target.value as ProductionPrintTemplate['id'])
                      })
                    }
                  >
                    {Object.entries(PRODUCTION_PRINT_TEMPLATES).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Máy sản xuất
                  <select value={draft.machineId} onChange={event => updateDraft({ machineId: event.target.value })}>
                    <option value="">Chọn máy (bắt buộc khi phát hành)</option>
                    {machines
                      .filter(machine => machine.status === 'available')
                      .map(machine => (
                        <option key={machine.id} value={machine.id}>
                          {machine.code} — {machine.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Người chạy máy
                  <select value={draft.operatorId} onChange={event => updateDraft({ operatorId: event.target.value })}>
                    <option value="">Chọn nhân sự</option>
                    {users
                      .filter(user => user.active && ['producer', 'admin'].includes(user.role))
                      .map(user => (
                        <option key={user.uid} value={user.uid}>
                          {user.displayName}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Ca / tổ sản xuất
                  <input
                    value={draft.shift}
                    maxLength={100}
                    onChange={event => updateDraft({ shift: event.target.value })}
                    placeholder="Ca sáng / Tổ in 01"
                  />
                </label>
                <label>
                  Ghi chú chung
                  <input
                    value={draft.notes}
                    maxLength={3000}
                    title={draft.notes}
                    onChange={event => updateDraft({ notes: event.target.value })}
                    placeholder="Yêu cầu kỹ thuật, lưu ý QA…"
                  />
                </label>
              </div>
            </section>
            <LsxItemsTable
              lines={draft.lines}
              pos={visiblePOs}
              commands={commands}
              draftId={draft.id}
              catalogLines={catalog.lines}
              stockBalances={catalog.stockBalances}
              catalogLoading={catalogLoading}
              catalogError={catalogError}
              onPick={() => setPickerOpen(true)}
              onReloadCatalog={() => {
                setCatalogLoading(true);
                setCatalogReload(value => value + 1);
              }}
              onChange={lines => updateDraft({ lines })}
            />
            <LsxMaterialsTable
              materials={draft.materials}
              catalogMaterials={catalog.materials}
              onChange={materials => updateDraft({ materials })}
            />
          </fieldset>
          {pickerOpen && (
            <LsxPoPickerDialog
              pos={visiblePOs}
              commands={commands}
              draftId={draft.id}
              draftLines={draft.lines}
              onClose={() => setPickerOpen(false)}
              onConfirm={lines => {
                addLines(lines);
                setPickerOpen(false);
              }}
            />
          )}
        </form>
      ) : selected ? (
        <>
          <header className="lsx-heading">
            <div className="app-heading-with-back">
              <PageBackButton
                title="Quay lại danh sách LSX"
                disabled={busy}
                onClick={() => {
                  setSelectedId('');
                  setError('');
                }}
              />
              <div>
                <h2>
                  {selected.lsxCode}{' '}
                  <span className={`lsx-status lsx-status--${selected.status}`}>
                    {PRODUCTION_STATUSES[selected.status]}
                  </span>
                </h2>
                <span>
                  {selected.customerName} · {selectedPoCodes}
                </span>
              </div>
            </div>
            <div className="lsx-actions">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setPrintReady(false);
                  setPrintOrder(selected);
                }}
              >
                Xuất lệnh sản xuất
              </button>
              {canEditProductionDraft(currentUser, selected) && (
                <>
                  <button className="btn btn-outline" disabled={busy} onClick={() => edit(selected)}>
                    Sửa nháp
                  </button>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void transition('submit')}>
                    Gửi duyệt
                  </button>
                </>
              )}
              {selected.status === 'pending_approval' && manager && (
                <>
                  <button className="btn btn-outline" disabled={busy} onClick={() => void transition('return')}>
                    Trả về nháp
                  </button>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void transition('release')}>
                    Duyệt & phát hành
                  </button>
                </>
              )}
              {selected.status === 'released' && manager && (
                <button className="btn btn-primary" disabled={busy} onClick={() => void transition('start')}>
                  Bắt đầu sản xuất
                </button>
              )}
              {['draft', 'pending_approval', 'released'].includes(selected.status) && manager && (
                <button className="btn btn-outline" disabled={busy} onClick={() => void transition('cancel')}>
                  Hủy lệnh
                </button>
              )}
              {selected.status === 'completed' &&
                canCreate &&
                selected.lines.some(line => line.quantity - (line.goodQuantity ?? 0) > 1e-8) && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || !selected.materials.length}
                      title={!selected.materials.length ? 'LSX chưa khai báo vật tư dự kiến' : undefined}
                      onClick={() => void transition('request_materials')}
                    >
                      Đề nghị mua thêm NVL
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => supplement(selected)}
                    >
                      Lập lệnh bổ sung
                    </button>
                  </>
                )}
            </div>
          </header>
          <dl className="lsx-summary" aria-label="Thông tin chung">
            <div>
              <dt>Khách hàng</dt>
              <dd title={selected.customerName}>{selected.customerName || '—'}</dd>
            </div>
            <div>
              <dt>Đơn hàng</dt>
              <dd title={selectedPoCodes}>{selectedPoCodes}</dd>
            </div>
            <div>
              <dt>Ngày cần</dt>
              <dd>{formatDate(selected.deliveryDeadline)}</dd>
            </div>
            <div>
              <dt>Ưu tiên</dt>
              <dd>{PRIORITY_LABELS[selected.priority] || '—'}</dd>
            </div>
            <div>
              <dt>Máy</dt>
              <dd>
                {selected.machineName ||
                  machines.find(machine => machine.id === selected.machineId)?.name ||
                  'Chưa chọn'}
              </dd>
            </div>
            <div>
              <dt>Người chạy máy</dt>
              <dd>
                {selected.operatorName ||
                  users.find(user => user.uid === selected.operatorId)?.displayName ||
                  'Chưa chọn'}
              </dd>
            </div>
            <div>
              <dt>Ca / tổ</dt>
              <dd>{selected.shift || '—'}</dd>
            </div>
            <div>
              <dt>Người lập</dt>
              <dd>{selected.createdBy}</dd>
            </div>
            <div className="lsx-summary-wide">
              <dt>Ghi chú chung</dt>
              <dd title={selected.notes}>{selected.notes || '—'}</dd>
            </div>
            <div>
              <dt>Mẫu phiếu</dt>
              <dd>
                {PRODUCTION_PRINT_TEMPLATES[selected.printTemplate?.id || 'standard']} v
                {selected.printTemplate?.version || 1}
              </dd>
            </div>
          </dl>
          <section className="lsx-section">
            <h3>Mặt hàng</h3>
            <div className="table-container">
              <table className="lsx-detail-lines">
                <thead>
                  <tr>
                    <th className="lsx-number">#</th>
                    <th>Mã SP</th>
                    <th>Tên sản phẩm</th>
                    <th>Đơn hàng</th>
                    <th>Quy cách</th>
                    <th className="lsx-number">SL lệnh</th>
                    <th>ĐVT</th>
                    <th>Góc / răng cưa</th>
                    <th>Lõi</th>
                    <th>Mã NVL</th>
                    <th>Mã nội bộ</th>
                    <th className="lsx-number">Đạt / hỏng</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line, position) => {
                    const spec = line.specifications;
                    const corner = [spec.dieCut || spec.corner, spec.perforated]
                      .filter(Boolean)
                      .map(String)
                      .join(' / ');
                    const core = [spec.coreType, spec.core].filter(Boolean).map(String).join(' ');
                    return (
                      <tr key={lineKey(line)}>
                        <td className="lsx-number">{position + 1}</td>
                        <td title={line.productCode}>{line.productCode || 'Nhập tay'}</td>
                        <td title={line.productName}>{line.productName}</td>
                        <td>{line.poCode || selected.poCode}</td>
                        <td title={`${line.specification} · ${line.material}`}>
                          {[line.specification, line.material].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="lsx-number">{number(line.quantity)}</td>
                        <td>{line.unit}</td>
                        <td title={corner}>{corner || '—'}</td>
                        <td>{core || '—'}</td>
                        <td title={String(spec.paperCode || '')}>{String(spec.paperCode || '—')}</td>
                        <td>{line.catalog?.code || 'Chưa liên kết'}</td>
                        <td className="lsx-number">
                          {selected.status === 'completed'
                            ? `${number(line.goodQuantity)} / ${number(line.rejectQuantity)}${Number(line.surplusQuantity) > 0 ? ` · Dư ${number(line.surplusQuantity)}` : ''}${line.quantity - (line.goodQuantity ?? 0) > 0 ? ` · Thiếu ${number(line.quantity - (line.goodQuantity ?? 0))} ${line.unit}` : ''}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Xem toàn bộ thông số kỹ thuật và ảnh</summary>
              <div className="lsx-specifications">
                {selected.lines.map(line => (
                  <article key={lineKey(line)}>
                    <h3>
                      {line.productCode || 'Nhập tay'} — {line.productName}
                    </h3>
                    <dl>
                      {getCustomerProductSpecSummary(line.specifications, line.productType).map(field => (
                        <div key={field.id}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {line.image && <img src={line.image} alt={`Mẫu ${line.productName}`} />}
                  </article>
                ))}
              </div>
            </details>
          </section>
          <section className="lsx-section">
            <h3>Vật tư dự kiến</h3>
            <div className="table-container">
              <table className="lsx-detail-materials">
                <thead>
                  <tr>
                    <th>Mã NVL</th>
                    <th>Tên NVL</th>
                    <th className="lsx-number">Khổ (mm)</th>
                    <th className="lsx-number">Số lượng</th>
                    <th>ĐVT</th>
                    <th className="lsx-number">Hao hụt (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.materials.map(material => (
                    <tr key={material.id}>
                      <td>{material.code}</td>
                      <td title={material.name}>{material.name}</td>
                      <td className="lsx-number">{material.width || '—'}</td>
                      <td className="lsx-number">{number(material.quantity)}</td>
                      <td>{material.unit}</td>
                      <td className="lsx-number">{number(material.allowancePercent)}</td>
                    </tr>
                  ))}
                  {!selected.materials.length && (
                    <tr>
                      <td colSpan={6}>Chưa khai báo vật tư dự kiến.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <ProductionMaterialLedger
            key={selected.id}
            orderId={selected.id}
            status={selected.status}
            currentUser={currentUser}
            onRefresh={onRefresh}
          />
          <ProductionGoodsLedger
            key={`goods-${selected.id}`}
            orderId={selected.id}
            status={selected.status}
            currentUser={currentUser}
            onRefresh={onRefresh}
          />
          {selected.status === 'producing' && manager && (
            <form
              className="lsx-section"
              onSubmit={event => {
                event.preventDefault();
                void transition('complete');
              }}
            >
              <h3>Nghiệm thu sản lượng / QC</h3>
              <fieldset disabled={busy}>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th>SL lệnh / ĐVT</th>
                        <th>SL đạt QC</th>
                        <th>SL hỏng</th>
                        <th>SL dư</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.map(line => (
                        <tr key={lineKey(line)}>
                          <td>
                            {line.productCode} — {line.productName}
                          </td>
                          <td>
                            {number(line.quantity)} {line.unit}
                          </td>
                          <td>
                            <input
                              aria-label={`Đạt QC ${line.productName}`}
                              type="number"
                              required
                              min="0"
                              step="any"
                              max={line.quantity}
                              value={qc[lineKey(line)]?.goodQuantity ?? ''}
                              onChange={event =>
                                setQc({
                                  ...qc,
                                  [lineKey(line)]: {
                                    goodQuantity: event.target.value,
                                    rejectQuantity: qc[lineKey(line)]?.rejectQuantity || '0',
                                    surplusQuantity: qc[lineKey(line)]?.surplusQuantity || '0'
                                  }
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Hỏng ${line.productName}`}
                              type="number"
                              required
                              min="0"
                              step="any"
                              max={line.quantity}
                              value={qc[lineKey(line)]?.rejectQuantity ?? '0'}
                              onChange={event =>
                                setQc({
                                  ...qc,
                                  [lineKey(line)]: {
                                    goodQuantity: qc[lineKey(line)]?.goodQuantity || '0',
                                    rejectQuantity: event.target.value,
                                    surplusQuantity: qc[lineKey(line)]?.surplusQuantity || '0'
                                  }
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`SL dư ${line.productName}`}
                              type="number"
                              min="0"
                              step="any"
                              value={qc[lineKey(line)]?.surplusQuantity ?? '0'}
                              onChange={event =>
                                setQc({
                                  ...qc,
                                  [lineKey(line)]: {
                                    goodQuantity: qc[lineKey(line)]?.goodQuantity || '0',
                                    rejectQuantity: qc[lineKey(line)]?.rejectQuantity || '0',
                                    surplusQuantity: event.target.value
                                  }
                                })
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label>
                  Ghi chú nghiệm thu *
                  <textarea
                    required
                    rows={2}
                    maxLength={2000}
                    value={qcNote}
                    onChange={event => setQcNote(event.target.value)}
                  />
                </label>
                <p className="lsx-hint">
                  Chỉ sản lượng đạt QC được tính cho đơn hàng. Phần thiếu có thể lập lệnh bổ sung; đơn hàng chỉ chuyển
                  chờ giao khi đủ tất cả dòng cần SX.
                </p>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? 'Đang lưu…' : 'Xác nhận nghiệm thu'}
                </button>
              </fieldset>
            </form>
          )}
          <details className="lsx-section">
            <summary>Lịch sử thao tác</summary>
            <ol className="lsx-history">
              {selected.history.map((entry, index) => (
                <li key={index}>
                  {new Date(entry.at).toLocaleString('vi-VN')} · {entry.actorName} ·{' '}
                  {historyNames[entry.action] || entry.action}
                  {entry.action === 'qc' ? `: ${entry.note}` : ''}
                </li>
              ))}
            </ol>
          </details>
        </>
      ) : (
        <>
          <div className="lsx-list-toolbar">
            <input
              type="search"
              aria-label="Tìm lệnh sản xuất"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Tìm số LSX, khách hàng, đơn hàng, sản phẩm…"
            />
            <select aria-label="Trạng thái" value={status} onChange={event => setStatus(event.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(LIST_STATUSES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select aria-label="Loại lệnh" value={orderType} onChange={event => setOrderType(event.target.value)}>
              <option value="all">Tất cả lệnh</option>
              <option value="managed">Lệnh mới</option>
              <option value="legacy">Lệnh cũ{legacyCount ? ` (${legacyCount})` : ''}</option>
            </select>
            {canCreate && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDraft(emptyDraft());
                  setError('');
                }}
              >
                Lập lệnh sản xuất
              </button>
            )}
          </div>
          <div className="lsx-list-frame">
            <div className="table-container erp-primary-data-table">
              <table className="lsx-list" data-resize-key="production-orders">
                <thead>
                  <tr>
                    <th>Số LSX</th>
                    <th>Khách hàng</th>
                    <th>Đơn hàng</th>
                    <th className="lsx-number">Số dòng</th>
                    <th>Ngày cần</th>
                    <th>Trạng thái</th>
                    <th aria-label="Thao tác" />
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map(command => {
                    const openable = command.productionOrderVersion === 2 || !!onOpenLegacy;
                    const poCodes = command.poCodes?.length ? command.poCodes.join(', ') : String(command.poCode || '');
                    return (
                      <tr
                        key={String(command.id)}
                        className={openable ? 'lsx-list-row' : undefined}
                        onClick={openable ? () => open(command) : undefined}
                      >
                        <td>{String(command.lsxCode || '')}</td>
                        <td title={String(command.customerName || '')}>{String(command.customerName || '—')}</td>
                        <td title={poCodes}>{poCodes || '—'}</td>
                        <td
                          className="lsx-number"
                          title={(command.lines || []).map(line => line.productName).join(', ') || undefined}
                        >
                          {command.productionOrderVersion === 2 ? command.lines?.length || 0 : '—'}
                        </td>
                        <td>{formatDate(command.deliveryDeadline)}</td>
                        <td>
                          <span className={`lsx-status lsx-status--${command.status}`}>
                            {command.productionOrderVersion !== 2 ? 'Lệnh cũ · ' : ''}
                            {LIST_STATUSES[String(command.status)] || 'Chưa rõ'}
                          </span>
                        </td>
                        <td onClick={event => event.stopPropagation()}>
                          {openable && (
                            <RowActionMenu
                              label={`Thao tác ${command.lsxCode || 'lệnh sản xuất'}`}
                              actions={[{ label: 'Chi tiết', onSelect: () => open(command) }]}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!visible.length && (
                    <tr>
                      <td colSpan={7}>
                        Chưa có lệnh phù hợp. Bấm “Lập lệnh sản xuất” để lấy hàng từ đơn hàng của khách.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...pagination.paginationProps} />
          </div>
        </>
      )}
      {printOrder && (
        <dialog
          ref={printDialog}
          className="lsx-print-dialog"
          aria-labelledby="lsx-print-title"
          onCancel={event => {
            event.preventDefault();
            setPrintOrder(null);
          }}
        >
          <header className="lsx-heading">
            <h2 id="lsx-print-title">Xem phiếu in — {printOrder.lsxCode}</h2>
            <div className="lsx-actions">
              <button className="btn btn-outline" onClick={() => setPrintOrder(null)}>
                Đóng
              </button>
              <button
                className="btn btn-primary"
                disabled={!printReady}
                onClick={() => {
                  printFrame.current?.contentWindow?.focus();
                  printFrame.current?.contentWindow?.print();
                }}
              >
                In / lưu PDF
              </button>
            </div>
          </header>
          <iframe
            ref={printFrame}
            title="Phiếu lệnh sản xuất"
            sandbox="allow-same-origin allow-modals"
            srcDoc={productionPrintHtml(printOrder)}
            onLoad={event => {
              const fonts = event.currentTarget.contentDocument?.fonts;
              const frame = event.currentTarget;
              const markReady = () => {
                setPrintReady(true);
                // Export opens the browser print dialog once the sheet is ready, where the user picks "Save as PDF".
                frame.contentWindow?.focus();
                frame.contentWindow?.print();
              };
              if (fonts) void fonts.ready.then(markReady);
              else markReady();
            }}
          />
        </dialog>
      )}
    </section>
  );
}
