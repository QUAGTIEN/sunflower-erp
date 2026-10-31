import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight, Printer } from 'lucide-react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { RowActionMenu } from '@/components/RowActionMenu';
import { PageBackButton } from '@/components/PageBackButton';
import { IconButton } from '@/components/IconButton';
import { ProductionMaterialLedger } from '@/features/inventory/components/ProductionMaterialLedger';
import { ProductionGoodsLedger } from '@/features/inventory/components/ProductionGoodsLedger';
import { DataTablePagination } from '@/components/DataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
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
  MATERIAL_SHORTAGE_STATUSES,
  PRODUCTION_STATUSES,
  type CommandRecord,
  type PlannedMaterial,
  type ProductionOrder,
  type ProductionPO,
  type ProductionPrintTemplate
} from '../model/productionOrder';
import { productionPrintHtml } from '../model/productionPrint';
import { PrintPreviewDialog } from '@/components/PrintPreviewDialog';
import { LsxItemsTable } from './productionOrderEditor/LsxItemsTable';
import { LsxPoPickerDialog } from './productionOrderEditor/LsxPoPickerDialog';
import {
  EMPTY_PRINT_DETAILS,
  customerKeyOf,
  customerLabelOf,
  type DraftLine
} from './productionOrderEditor/draftLines';
import { LsxGeneralInfo } from './productionOrderEditor/LsxGeneralInfo';
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
  plannedStartDate: string;
  plannedEndDate: string;
  technicalNotes: string;
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
  plannedStartDate: '',
  plannedEndDate: '',
  technicalNotes: '',
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
  request_materials: 'Đã tạo đề nghị mua thêm NVL',
  request_material_shortage: 'Đã gửi đề nghị mua NVL thiếu'
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
  request_materials: 'Đề nghị mua thêm NVL',
  request_material_shortage: 'Đề nghị mua NVL thiếu'
};
const LIST_STATUSES: Record<string, string> = { ...PRODUCTION_STATUSES, transfer_pending: 'Chờ duyệt bàn giao' };
const PRIORITY_LABELS: Record<string, string> = { urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' };
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const DETAIL_TABS = [
  { id: 'items', label: 'Mặt hàng' },
  { id: 'materials', label: 'Vật tư' },
  { id: 'goods', label: 'Thành phẩm' },
  { id: 'history', label: 'Lịch sử' }
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]['id'];

function SummaryValue({ value, empty, strong = false }: { value?: string; empty: string; strong?: boolean }) {
  if (!value) return <dd className="lsx-summary-empty">{empty}</dd>;
  return (
    <dd className={strong ? 'lsx-summary-strong' : undefined} title={value}>
      {value}
    </dd>
  );
}

/** Thông số đầy đủ của một dòng, mở từ bảng mặt hàng; phần dư / thiếu chỉ có sau nghiệm thu. */
function LineSpecification({ line, completed }: { line: ProductionOrder['lines'][number]; completed: boolean }) {
  const shortage = line.quantity - (line.goodQuantity ?? 0);
  return (
    <div className="lsx-line-spec">
      <dl>
        <div>
          <dt>Mã nội bộ</dt>
          <dd>{line.catalog?.code || 'Chưa liên kết'}</dd>
        </div>
        {getCustomerProductSpecSummary(line.specifications, line.productType).map(field => (
          <div key={field.id}>
            <dt>{field.label}</dt>
            <dd>{field.value}</dd>
          </div>
        ))}
        {completed && Number(line.surplusQuantity) > 0 && (
          <div>
            <dt>SL dư</dt>
            <dd>{number(line.surplusQuantity)}</dd>
          </div>
        )}
        {completed && shortage > 1e-8 && (
          <div>
            <dt>SL thiếu</dt>
            <dd>
              {number(shortage)} {line.unit}
            </dd>
          </div>
        )}
      </dl>
      {line.image && <img src={line.image} alt={`Mẫu ${line.productName}`} />}
    </div>
  );
}

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
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [orderTypeFilters, setOrderTypeFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState(initialSelectedId || '');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [machines, setMachines] = useState<ProductionMachine[]>([]);
  const [printOrder, setPrintOrder] = useState<ProductionOrder | null>(null);
  const [qc, setQc] = useState<
    Record<string, { goodQuantity: string; rejectQuantity: string; surplusQuantity: string }>
  >({});
  const [qcNote, setQcNote] = useState('');
  const [catalog, setCatalog] = useState<ProductionDraftCatalog>({ materials: [], lines: {} });
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogReload, setCatalogReload] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<{ orderId: string; tab: DetailTab }>({ orderId: '', tab: 'items' });
  const [expandedLines, setExpandedLines] = useState<string[]>([]);
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  useEffect(() => {
    if (!hasProductionAccess(currentUser, 'production')) return;
    return dbService.subscribeCollection('machines', data => setMachines(data as ProductionMachine[]));
  }, [currentUser]);
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
      () => !busy && window.confirm('LSX đang có dữ liệu chưa lưu. Bạn có muốn rời trang?'),
      () => {
        setPickerOpen(false);
        setDraft(null);
        setError('');
      }
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
  const statusOptions = Object.entries(LIST_STATUSES).map(([value, label]) => ({ value, label }));
  const orderTypeOptions = [
    { value: 'managed', label: 'Lệnh mới' },
    { value: 'legacy', label: `Lệnh cũ${legacyCount ? ` (${legacyCount})` : ''}` }
  ];
  const activeFilterCount = statusFilters.length + orderTypeFilters.length;
  const visible = accessibleCommands
    .filter(
      command =>
        !orderTypeFilters.length ||
        orderTypeFilters.includes(command.productionOrderVersion === 2 ? 'managed' : 'legacy')
    )
    .filter(command => !statusFilters.length || statusFilters.includes(String(command.status)))
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
  // Opening another order starts on its item list instead of the tab left open on the previous one.
  const activeDetailTab: DetailTab = selected && detailTab.orderId === selected.id ? detailTab.tab : 'items';
  const toggleLineSpecification = (specId: string) =>
    setExpandedLines(current =>
      current.includes(specId) ? current.filter(item => item !== specId) : [...current, specId]
    );
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
      plannedStartDate: order.plannedStartDate || '',
      plannedEndDate: order.plannedEndDate || '',
      technicalNotes: order.technicalNotes || '',
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
      plannedStartDate: '',
      plannedEndDate: '',
      technicalNotes: order.technicalNotes || '',
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
        plannedStartDate: draft.plannedStartDate,
        plannedEndDate: draft.plannedEndDate,
        technicalNotes: draft.technicalNotes,
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
              {/* Choosing lines is the first step of an order, so it sits with the page actions. */}
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setPickerOpen(true)}>
                Chọn hàng
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !draft.lines.length}
                title={draft.lines.length ? undefined : 'Chọn hàng trước khi lưu nháp'}
              >
                {busy ? 'Đang lưu…' : 'Lưu nháp'}
              </button>
            </div>
          </header>
          <fieldset disabled={busy}>
            <LsxGeneralInfo
              values={draft}
              customers={draftCustomers}
              machines={machines.filter(machine => machine.status === 'available')}
              operators={users.filter(user => user.active && ['producer', 'admin'].includes(user.role))}
              onChange={updateDraft}
              onTemplateChange={id => updateDraft({ printTemplate: latestTemplate(id) })}
            />
            <LsxItemsTable
              lines={draft.lines}
              pos={visiblePOs}
              commands={commands}
              draftId={draft.id}
              catalogLines={catalog.lines}
              stockBalances={catalog.stockBalances}
              catalogLoading={catalogLoading}
              catalogError={catalogError}
              onReloadCatalog={() => {
                setCatalogLoading(true);
                setCatalogReload(value => value + 1);
              }}
              onChange={lines => updateDraft({ lines })}
            />
            <LsxMaterialsTable
              materials={draft.materials}
              catalogMaterials={catalog.materials}
              materialBalances={catalog.materialBalances}
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
              <h2>{selected.lsxCode}</h2>
            </div>
            <div className="lsx-actions">
              <IconButton label="Xuất lệnh sản xuất" icon={<Printer />} onClick={() => setPrintOrder(selected)} />
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
                <button className="btn btn-danger" disabled={busy} onClick={() => void transition('cancel')}>
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
            <div className="lsx-summary-span-2">
              <dt>Khách hàng</dt>
              <SummaryValue value={selected.customerName} empty="Chưa có" strong />
            </div>
            <div>
              <dt>Đơn hàng</dt>
              <SummaryValue value={selectedPoCodes} empty="Chưa có" />
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd className={`lsx-status lsx-status--${selected.status}`}>{PRODUCTION_STATUSES[selected.status]}</dd>
            </div>
            <div>
              <dt>Ưu tiên</dt>
              <SummaryValue value={PRIORITY_LABELS[selected.priority]} empty="Chưa chọn" />
            </div>
            <div>
              <dt>Ngày cần</dt>
              <SummaryValue
                value={selected.deliveryDeadline && formatDate(selected.deliveryDeadline)}
                empty="Chưa có"
                strong
              />
            </div>
            <div>
              <dt>Dự kiến sản xuất</dt>
              <SummaryValue
                value={
                  selected.plannedStartDate || selected.plannedEndDate
                    ? `${formatDate(selected.plannedStartDate || '')} – ${formatDate(selected.plannedEndDate || '')}`
                    : ''
                }
                empty="Chưa lên lịch"
              />
            </div>
            <div>
              <dt>Máy</dt>
              <SummaryValue
                value={selected.machineName || machines.find(machine => machine.id === selected.machineId)?.name}
                empty="Chưa chọn"
              />
            </div>
            <div>
              <dt>Người chạy máy</dt>
              <SummaryValue
                value={selected.operatorName || users.find(user => user.uid === selected.operatorId)?.displayName}
                empty="Chưa chọn"
              />
            </div>
            <div>
              <dt>Ca / tổ</dt>
              <SummaryValue value={selected.shift} empty="Chưa chọn" />
            </div>
            <div>
              <dt>Mẫu phiếu</dt>
              <SummaryValue
                value={`${PRODUCTION_PRINT_TEMPLATES[selected.printTemplate?.id || 'standard']} v${selected.printTemplate?.version || 1}`}
                empty="Chưa chọn"
              />
            </div>
            <div>
              <dt>Người lập</dt>
              <SummaryValue value={selected.createdBy} empty="Chưa có" />
            </div>
            <div>
              <dt>Ngày lập</dt>
              <SummaryValue value={selected.createdAt && formatDateTime(selected.createdAt)} empty="Chưa có" />
            </div>
            <div className="lsx-summary-span-3">
              <dt>Yêu cầu kỹ thuật chung</dt>
              <SummaryValue value={selected.technicalNotes} empty="Không có" />
            </div>
            <div className="lsx-summary-span-2">
              <dt>Ghi chú chung</dt>
              <SummaryValue value={selected.notes} empty="Không có" />
            </div>
          </dl>
          <div className="content-tabs content-tabs--segmented" role="tablist" aria-label="Nội dung lệnh sản xuất">
            {DETAIL_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeDetailTab === tab.id}
                onClick={() => setDetailTab({ orderId: selected.id, tab: tab.id })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Panels stay mounted so ledger data and QC input survive a tab switch. */}
          <div className="lsx-detail-panels" data-erp-table-layout="content">
            <section role="tabpanel" aria-label="Mặt hàng" hidden={activeDetailTab !== 'items'}>
              <div className="table-container">
                <table className="lsx-detail-lines">
                  <thead>
                    <tr>
                      <th className="lsx-expand-cell" aria-label="Thông số" />
                      <th className="lsx-number">STT</th>
                      <th>Mã SP</th>
                      <th>Tên sản phẩm</th>
                      <th>Đơn hàng</th>
                      <th>Quy cách</th>
                      <th>ĐVT</th>
                      <th className="lsx-number">SL lệnh</th>
                      <th className="lsx-number">Đạt</th>
                      <th className="lsx-number">Hỏng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line, position) => {
                      const specId = `${selected.id}:${lineKey(line)}`;
                      const expanded = expandedLines.includes(specId);
                      const completed = selected.status === 'completed';
                      const specification = [line.specification, line.material].filter(Boolean).join(' · ');
                      return (
                        <Fragment key={lineKey(line)}>
                          <tr>
                            <td className="lsx-expand-cell">
                              <IconButton
                                label={expanded ? 'Ẩn thông số kỹ thuật' : 'Xem thông số kỹ thuật'}
                                icon={expanded ? <ChevronDown /> : <ChevronRight />}
                                aria-expanded={expanded}
                                onClick={() => toggleLineSpecification(specId)}
                              />
                            </td>
                            <td className="lsx-number">{position + 1}</td>
                            <td title={line.productCode}>{line.productCode || 'Nhập tay'}</td>
                            <td title={line.productName}>{line.productName}</td>
                            <td title={line.poCode || selected.poCode}>{line.poCode || selected.poCode}</td>
                            <td title={specification}>{specification || '—'}</td>
                            <td>{line.unit}</td>
                            <td className="lsx-number">{number(line.quantity)}</td>
                            <td className="lsx-number">{completed ? number(line.goodQuantity) : '—'}</td>
                            <td className="lsx-number">{completed ? number(line.rejectQuantity) : '—'}</td>
                          </tr>
                          {expanded && (
                            <tr className="lsx-line-spec-row">
                              <td />
                              <td colSpan={9}>
                                <LineSpecification line={line} completed={completed} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {new Set(selected.lines.map(line => line.unit)).size === 1 && (
                    <tfoot>
                      <tr>
                        <td colSpan={7} className="lsx-number">
                          Tổng cộng
                        </td>
                        <td className="lsx-number">
                          {number(selected.lines.reduce((sum, line) => sum + line.quantity, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>
            <section role="tabpanel" aria-label="Vật tư" hidden={activeDetailTab !== 'materials'}>
              <div className="lsx-heading">
                <h3>Vật tư dự kiến</h3>
                {MATERIAL_SHORTAGE_STATUSES.includes(selected.status) && canCreate && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={busy || !selected.materials.some(material => material.catalogItemId)}
                    title="Máy chủ đối chiếu tồn kho NVL hiện tại và chỉ đề nghị mua phần còn thiếu của vật tư đã có mã"
                    onClick={() => void transition('request_material_shortage')}
                  >
                    Đề nghị mua NVL thiếu
                  </button>
                )}
              </div>
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
              <ProductionMaterialLedger
                key={selected.id}
                orderId={selected.id}
                status={selected.status}
                currentUser={currentUser}
                onRefresh={onRefresh}
              />
            </section>
            <section role="tabpanel" aria-label="Thành phẩm" hidden={activeDetailTab !== 'goods'}>
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
                      Chỉ sản lượng đạt QC được tính cho đơn hàng. Phần thiếu có thể lập lệnh bổ sung; đơn hàng chỉ
                      chuyển chờ giao khi đủ tất cả dòng cần SX.
                    </p>
                    <button className="btn btn-primary" disabled={busy}>
                      {busy ? 'Đang lưu…' : 'Xác nhận nghiệm thu'}
                    </button>
                  </fieldset>
                </form>
              )}
            </section>
            <section role="tabpanel" aria-label="Lịch sử" hidden={activeDetailTab !== 'history'}>
              <div className="table-container">
                <table className="lsx-history">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Người thực hiện</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...selected.history].reverse().map((entry, index) => {
                      const action = historyNames[entry.action] || entry.action;
                      const description = entry.action === 'qc' ? `${action}: ${entry.note}` : action;
                      return (
                        <tr key={index}>
                          <td>{formatDateTime(entry.at)}</td>
                          <td title={entry.actorName}>{entry.actorName}</td>
                          <td title={description}>{description}</td>
                        </tr>
                      );
                    })}
                    {!selected.history.length && (
                      <tr>
                        <td colSpan={3}>Chưa có thao tác.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
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
            <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
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
          <DataFilterChipBar
            chips={[
              ...statusFilters.map(value => ({
                id: `status:${value}`,
                label: LIST_STATUSES[value] || value,
                onRemove: () => setStatusFilters(current => current.filter(item => item !== value))
              })),
              ...orderTypeFilters.map(value => ({
                id: `type:${value}`,
                label: orderTypeOptions.find(option => option.value === value)?.label || value,
                onRemove: () => setOrderTypeFilters(current => current.filter(item => item !== value))
              }))
            ]}
            onClear={() => {
              setStatusFilters([]);
              setOrderTypeFilters([]);
            }}
          />
          <DataFilterPanel
            open={showFilters}
            title="Lọc lệnh sản xuất"
            description="Lọc theo trạng thái và loại lệnh."
            activeCount={activeFilterCount}
            onClose={() => setShowFilters(false)}
            onReset={() => {
              setStatusFilters([]);
              setOrderTypeFilters([]);
            }}
          >
            <DataFilterSection title="Trạng thái" selectedCount={statusFilters.length} defaultExpanded>
              <DataFilterCheckboxGroup
                options={statusOptions}
                selectedValues={statusFilters}
                onChange={setStatusFilters}
              />
            </DataFilterSection>
            <DataFilterSection title="Loại lệnh" selectedCount={orderTypeFilters.length} defaultExpanded>
              <DataFilterCheckboxGroup
                options={orderTypeOptions}
                selectedValues={orderTypeFilters}
                onChange={setOrderTypeFilters}
              />
            </DataFilterSection>
          </DataFilterPanel>
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
        <PrintPreviewDialog
          title={`Xem phiếu in — ${printOrder.lsxCode}`}
          frameTitle="Phiếu lệnh sản xuất"
          html={productionPrintHtml(printOrder)}
          onClose={() => setPrintOrder(null)}
        />
      )}
    </section>
  );
}
