import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Printer } from 'lucide-react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { PageBackButton } from '@/components/PageBackButton';
import { IconButton } from '@/components/IconButton';
import { ProductionMaterialLedger } from '@/features/inventory/components/ProductionMaterialLedger';
import { ProductionGoodsLedger } from '@/features/inventory/components/ProductionGoodsLedger';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { getMachineForAssignment, type ProductionMachine } from '../api/machineService';
import {
  mutateProductionOrder,
  loadProductionDraftCatalog,
  type ProductionDraftCatalog
} from '../api/productionOrderService';
import {
  canDraftProduction,
  canRunProduction,
  canEditProductionOrder,
  DEFAULT_PRINT_TEMPLATE,
  hasProductionAccess,
  lineKey,
  linePoId,
  MATERIAL_SHORTAGE_STATUSES,
  OPEN_PRODUCTION_STATUSES,
  PRODUCTION_PRIORITIES,
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
import { LsxDetailLinesTable, LsxDetailMaterialsTable } from './LsxDetailTables';
import { ProductionOrderList } from './ProductionOrderList';
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
const actionNames: Record<string, string> = {
  create: 'Đã lập lệnh sản xuất',
  save: 'Đã lưu lệnh sản xuất',
  start: 'Đã bắt đầu sản xuất',
  complete: 'Đã nghiệm thu LSX',
  cancel: 'Đã xóa lệnh sản xuất',
  request_materials: 'Đã tạo đề nghị mua thêm NVL',
  request_material_shortage: 'Đã gửi đề nghị mua NVL thiếu'
};
const historyNames: Record<string, string> = {
  create: 'Lập lệnh',
  save: 'Lưu lệnh',
  submit: 'Gửi duyệt',
  return: 'Trả về nháp',
  release: 'Duyệt và phát hành',
  start: 'Bắt đầu chạy máy',
  complete: 'Hoàn thành',
  cancel: 'Xóa lệnh',
  qc: 'Nghiệm thu QC',
  request_materials: 'Đề nghị mua thêm NVL',
  request_material_shortage: 'Đề nghị mua NVL thiếu'
};
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

export function ProductionOrderWorkspace({
  pos,
  commands,
  currentUser,
  users,
  onRefresh,
  initialSelectedId,
  onOpenLegacy
}: Props) {
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
  const canCreate = canDraftProduction(currentUser);
  const canRun = canRunProduction(currentUser);
  const visiblePOs = pos.filter(po => !po.deleted);
  const accessibleCommands = commands.filter(command => !command.deleted);
  const canChange = (command: CommandRecord) =>
    command.productionOrderVersion === 2 && canEditProductionOrder(currentUser, command as ProductionOrder);
  const selected = commands.find(
    command => command.productionOrderVersion === 2 && command.id === selectedId && !command.deleted
  ) as ProductionOrder | undefined;
  const selectedPoCodes = selected ? (selected.poCodes?.length ? selected.poCodes.join(', ') : selected.poCode) : '';
  // Opening another order starts on its item list instead of the tab left open on the previous one.
  const activeDetailTab: DetailTab = selected && detailTab.orderId === selected.id ? detailTab.tab : 'items';
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
  /** Deleting cancels the order: it leaves the list, frees the reserved quantities and keeps its history. */
  const remove = async (order: CommandRecord) => {
    const confirmed = await confirmDelete(
      `Xóa lệnh ${order.lsxCode}? Số lượng đã giữ chỗ được giải phóng; lệnh vẫn xem lại được ở bộ lọc “Đã xóa”.`,
      { title: 'Xác nhận xóa lệnh', confirmLabel: 'Xóa lệnh' }
    );
    if (!confirmed) return;
    void mutate({ action: 'cancel', id: order.id, expectedRevision: order.revision }, () => setSelectedId(''));
  };
  const transition = (action: string) => {
    if (!selected) return;
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
      <div className="lsx-list-view" hidden={!!draft || !!selected}>
        <ProductionOrderList
          commands={accessibleCommands}
          canCreate={canCreate}
          canChange={canChange}
          canOpenLegacy={!!onOpenLegacy}
          onCreate={() => {
            setDraft(emptyDraft());
            setError('');
          }}
          onOpen={open}
          onPrint={command => setPrintOrder(command as ProductionOrder)}
          onEdit={command => edit(command as ProductionOrder)}
          onDelete={command => void remove(command)}
        />
      </div>
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
              <h2>{draft.revision ? 'Chỉnh sửa lệnh sản xuất' : 'Lập lệnh sản xuất'}</h2>
            </div>
            <div className="lsx-actions">
              {draft.revision && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    const order = commands.find(command => command.id === draft.id);
                    if (order) void remove(order).then(() => setDraft(null));
                  }}
                >
                  Xóa
                </button>
              )}
              <button
                className="btn btn-primary"
                disabled={busy || !draft.lines.length}
                title={draft.lines.length ? undefined : 'Chọn hàng trước khi lưu'}
              >
                {busy ? 'Đang lưu…' : 'Lưu'}
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
              onPickLines={() => setPickerOpen(true)}
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
              {canChange(selected) && (
                <>
                  <button className="btn btn-outline" disabled={busy} onClick={() => edit(selected)}>
                    Chỉnh sửa
                  </button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => void remove(selected)}>
                    Xóa
                  </button>
                </>
              )}
              {canRun && OPEN_PRODUCTION_STATUSES.includes(selected.status) && (
                <button className="btn btn-primary" disabled={busy} onClick={() => transition('start')}>
                  Bắt đầu sản xuất
                </button>
              )}
              {selected.status === 'completed' &&
                canRun &&
                selected.lines.some(line => line.quantity - (line.goodQuantity ?? 0) > 1e-8) && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || !selected.materials.length}
                      title={!selected.materials.length ? 'LSX chưa khai báo vật tư dự kiến' : undefined}
                      onClick={() => transition('request_materials')}
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
              <SummaryValue value={PRODUCTION_PRIORITIES[selected.priority]} empty="Chưa chọn" />
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
          {selected.machineId &&
            OPEN_PRODUCTION_STATUSES.includes(selected.status) &&
            !getMachineForAssignment(machines, selected.machineId) && (
              <p className="lsx-hint" role="status">
                Máy của lệnh không còn trong danh mục máy. Chỉnh sửa lệnh và chọn lại máy trước khi bắt đầu sản xuất.
              </p>
            )}
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
              <LsxDetailLinesTable order={selected} />
            </section>
            <section role="tabpanel" aria-label="Vật tư" hidden={activeDetailTab !== 'materials'}>
              <LsxDetailMaterialsTable
                order={selected}
                actions={
                  MATERIAL_SHORTAGE_STATUSES.includes(selected.status) &&
                  canRun && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || !selected.materials.some(material => material.catalogItemId)}
                      title="Máy chủ đối chiếu tồn kho NVL hiện tại và chỉ đề nghị mua phần còn thiếu của vật tư đã có mã"
                      onClick={() => transition('request_material_shortage')}
                    >
                      Đề nghị mua NVL thiếu
                    </button>
                  )
                }
              />
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
              {selected.status === 'producing' && canRun && (
                <form
                  className="lsx-section"
                  onSubmit={event => {
                    event.preventDefault();
                    transition('complete');
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
      ) : null}
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
