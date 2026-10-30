import { Settings2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { requireConfirmedMutation, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useEffect, useMemo, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { WarehouseVoucherDialog } from '@/features/inventory/components/WarehouseVoucherDialog';
import { canPostWarehouse } from '@/features/inventory/model/warehouse';
import { GoodsVoucherDialog, type GoodsDialogOptions } from '@/features/inventory/components/GoodsVoucherDialog';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { useLanguage } from '@/context/LanguageContext';
import { formatDate } from '@/shared/utils/dateFormatting';
import {
  buildSupplierRecommendations,
  getSourcingTypeLabel,
  normalizeSupplierRecords,
  type ProcurementRequestRecord,
  type ProcurementStatus,
  type SourcingType,
  type SupplierRecord
} from '@/features/procurement/model/purchaseModels';
import { backfillProcurementRequests } from '@/features/procurement/api/procurementService';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './Purchase.css';

type UnknownRecord = Record<string, unknown>;

interface PurchaseProps {
  pos: UnknownRecord[];
  purchaseOrders: UnknownRecord[];
  procurementRequests: ProcurementRequestRecord[];
  currentUser: UserProfile;
  onRefresh: () => void;
  users: UserProfile[];
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);
const asArray = (value: unknown): UnknownRecord[] => (Array.isArray(value) ? (value as UnknownRecord[]) : []);

const normalizeSearchText = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd');

const matchesEveryTerm = (search: string, values: unknown[]): boolean => {
  const terms = normalizeSearchText(search).trim().split(/\s+/).filter(Boolean);
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
};

const ACTIVE_STATUSES: ProcurementStatus[] = ['new', 'reviewing', 'quoting', 'supplier_selected'];
const PURCHASE_PAGE_REFERENCE_TIME = Date.now();
const SOURCING_TYPES: SourcingType[] = ['finished_good', 'raw_material', 'subcontract'];

const PURCHASE_REQUEST_COLUMNS: TableColumnOption[] = [
  { id: 'request', label: 'Yêu cầu / đơn hàng', required: true, group: 'Thông tin yêu cầu' },
  { id: 'customer', label: 'Khách hàng', defaultVisible: true, group: 'Thông tin yêu cầu' },
  { id: 'product', label: 'Mặt hàng', defaultVisible: true, group: 'Thông tin hàng hóa' },
  { id: 'sourcing', label: 'Phương án cung ứng', defaultVisible: true, group: 'Thông tin hàng hóa' },
  { id: 'quantity', label: 'Số lượng', defaultVisible: true, group: 'Thông tin hàng hóa' },
  { id: 'requiredDate', label: 'Ngày cần', defaultVisible: true, group: 'Tiến độ' },
  { id: 'purchaser', label: 'Mua hàng phụ trách', defaultVisible: true, group: 'Phân công' },
  { id: 'supplier', label: 'NCC', defaultVisible: true, group: 'Phân công' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];

const PURCHASE_ORDER_COLUMNS: TableColumnOption[] = [
  { id: 'order', label: 'Mã đơn mua', required: true, group: 'Thông tin đơn mua' },
  { id: 'supplier', label: 'Nhà cung cấp', defaultVisible: true, group: 'Thông tin đơn mua' },
  { id: 'po', label: 'Đơn hàng khách hàng', defaultVisible: true, group: 'Thông tin đơn mua' },
  { id: 'product', label: 'Mặt hàng', defaultVisible: true, group: 'Thông tin hàng hóa' },
  { id: 'value', label: 'Giá trị', defaultVisible: true, group: 'Thông tin hàng hóa' },
  { id: 'expectedDate', label: 'Ngày nhận dự kiến', defaultVisible: true, group: 'Tiến độ' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];

export const Purchase: React.FC<PurchaseProps> = ({
  pos,
  purchaseOrders,
  procurementRequests,
  currentUser,
  onRefresh,
  users
}) => {
  const { t } = useLanguage();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourcingFilters, setSourcingFilters] = useState<SourcingType[]>([]);
  const [monthFilters, setMonthFilters] = useState<string[]>([]);
  const [showPurchaseFilters, setShowPurchaseFilters] = useState(false);
  const [showPurchaseColumnCustomizer, setShowPurchaseColumnCustomizer] = useState(false);
  const [activeListView, setActiveListView] = useState<'requests' | 'orders'>('requests');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [unitPrice, setUnitPrice] = useState(0);
  const [expectedReceiveDate, setExpectedReceiveDate] = useState('');
  const [assignedPurchaserId, setAssignedPurchaserId] = useState('');
  const [sourcingType, setSourcingType] = useState<SourcingType>('subcontract');
  const [isSaving, setIsSaving] = useState(false);
  const [warehouseOrderId, setWarehouseOrderId] = useState('');
  const [goodsOptions, setGoodsOptions] = useState<GoodsDialogOptions | null>(null);
  const {
    selectedIds: sharedRequestColumns,
    setSelectedIds: setRequestVisibleColumns,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'purchase-requests',
    legacySelectionKey: `sunflower:purchase-request-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:purchase-request-column-widths:v3:${currentUser.uid}`
  });
  const { selectedIds: sharedOrderColumns, setSelectedIds: setOrderVisibleColumns } = useSharedTableColumns({
    layoutId: 'purchase-orders',
    legacySelectionKey: `sunflower:purchase-order-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:purchase-order-column-widths:v3:${currentUser.uid}`
  });
  const requestVisibleColumns = Array.from(
    new Set([
      'request',
      'actions',
      ...(sharedRequestColumns ||
        PURCHASE_REQUEST_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id))
    ])
  );
  const orderVisibleColumns = Array.from(
    new Set([
      'order',
      'actions',
      ...(sharedOrderColumns ||
        PURCHASE_ORDER_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id))
    ])
  );

  const saveRequestVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const next = Array.from(new Set(['request', 'actions', ...selectedIds]));
    setRequestVisibleColumns(next);
    setShowPurchaseColumnCustomizer(false);
  };
  const saveOrderVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const next = Array.from(new Set(['order', 'actions', ...selectedIds]));
    setOrderVisibleColumns(next);
    setShowPurchaseColumnCustomizer(false);
  };
  const requestVisibleColumnSet = new Set(requestVisibleColumns);
  const orderVisibleColumnSet = new Set(orderVisibleColumns);
  const { orderedColumnIds: orderedRequestColumnIds, getHeaderProps: getRequestHeaderProps } =
    useReorderableTableColumns({
      columns: PURCHASE_REQUEST_COLUMNS,
      selectedIds: requestVisibleColumns,
      onOrderChange: saveRequestVisibleColumns,
      layoutId: 'purchase-requests',
      lockedStartIds: ['request'],
      lockedEndIds: ['actions']
    });
  const { orderedColumnIds: orderedOrderColumnIds, getHeaderProps: getOrderHeaderProps } = useReorderableTableColumns({
    columns: PURCHASE_ORDER_COLUMNS,
    selectedIds: orderVisibleColumns,
    onOrderChange: saveOrderVisibleColumns,
    layoutId: 'purchase-orders',
    lockedStartIds: ['order'],
    lockedEndIds: ['actions']
  });
  const requestColumnLabels = Object.fromEntries(PURCHASE_REQUEST_COLUMNS.map(column => [column.id, t(column.label)]));
  const orderColumnLabels = Object.fromEntries(PURCHASE_ORDER_COLUMNS.map(column => [column.id, t(column.label)]));
  const purchaseActiveFilterCount = sourcingFilters.length + monthFilters.length;

  useEffect(() => {
    const unsubscribeSuppliers = dbService.subscribeCollection('suppliers', data => {
      setSuppliers(normalizeSupplierRecords(data).filter(supplier => !supplier.deleted));
    });
    return () => {
      unsubscribeSuppliers();
    };
  }, []);

  useEffect(() => {
    if (pos.length === 0) return;
    void backfillProcurementRequests(pos, currentUser).catch(error => {
      console.error('Unable to synchronize procurement requests:', error);
    });
  }, [currentUser, pos]);

  const purchasers = useMemo(() => users.filter(user => user.role === 'purchaser'), [users]);
  const months = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...procurementRequests.map(request => request.createdAt.slice(0, 7)),
            ...purchaseOrders.map(order => asText(order.createdAt).slice(0, 7))
          ].filter(Boolean)
        )
      )
        .sort()
        .reverse(),
    [procurementRequests, purchaseOrders]
  );

  const accessibleRequests = useMemo(
    () =>
      procurementRequests.filter(request => {
        if (request.deleted) return false;
        if (currentUser.role === 'admin' || currentUser.role === 'accountant') return true;
        return !request.assignedPurchaserId || request.assignedPurchaserId === currentUser.uid;
      }),
    [currentUser.role, currentUser.uid, procurementRequests]
  );

  const filteredRequests = useMemo(
    () =>
      accessibleRequests.filter(request => {
        const matchesSourcing = sourcingFilters.length === 0 || sourcingFilters.includes(request.sourcingType);
        const matchesMonth =
          monthFilters.length === 0 || monthFilters.some(month => request.createdAt.startsWith(month));
        const matchesSearch = matchesEveryTerm(searchTerm, [
          request.requestCode,
          request.poCode,
          request.customerName,
          request.productCode,
          request.productName,
          request.material,
          request.size,
          request.selectedSupplierName,
          request.assignedPurchaserName,
          getSourcingTypeLabel(request.sourcingType)
        ]);
        return ACTIVE_STATUSES.includes(request.status) && matchesSourcing && matchesMonth && matchesSearch;
      }),
    [accessibleRequests, monthFilters, searchTerm, sourcingFilters]
  );

  const filteredPurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter(order => {
        if (order.deleted === true) return false;
        const matchesSourcing =
          sourcingFilters.length === 0 || sourcingFilters.includes(asText(order.sourcingType) as SourcingType);
        const matchesMonth =
          monthFilters.length === 0 || monthFilters.some(month => asText(order.createdAt).startsWith(month));
        const matchesSearch = matchesEveryTerm(searchTerm, [
          order.purCode,
          order.supplierName,
          order.linkedPoCode,
          order.assignedPurchaserName,
          asArray(order.items).map(item => [item.productCode, item.productName, item.materialName, item.size])
        ]);
        return matchesSourcing && matchesMonth && matchesSearch;
      }),
    [monthFilters, purchaseOrders, searchTerm, sourcingFilters]
  );
  const requestPagination = useDataTablePagination(filteredRequests);
  const orderPagination = useDataTablePagination(filteredPurchaseOrders);

  const selectedRequest = accessibleRequests.find(request => request.id === selectedRequestId) || null;
  const recommendations = useMemo(
    () => (selectedRequest ? buildSupplierRecommendations(selectedRequest, suppliers, purchaseOrders) : []),
    [purchaseOrders, selectedRequest, suppliers]
  );

  const selectedSupplierHistory = useMemo(
    () =>
      purchaseOrders
        .filter(order => order.deleted !== true && asText(order.supplierId) === supplierId)
        .sort((a, b) => Date.parse(asText(b.createdAt)) - Date.parse(asText(a.createdAt)))
        .flatMap(order => {
          const items = asArray(order.items);
          return (items.length > 0 ? items : [{}]).map((item, itemIndex) => ({
            key: `${asText(order.id) || asText(order.purCode)}-${asText(item.poItemId) || itemIndex}`,
            orderCode: asText(order.purCode),
            orderedAt: asText(order.createdAt),
            receivedAt: asText(order.actualReceiveDate),
            productName: asText(item.materialName ?? item.productName) || '—',
            quantity: asNumber(item.quantity),
            unit: asText(item.unit),
            unitPrice: asNumber(item.unitPrice),
            totalPrice: asNumber(item.totalPrice) || asNumber(item.quantity) * asNumber(item.unitPrice)
          }));
        }),
    [purchaseOrders, supplierId]
  );

  const selectedSupplierName = suppliers.find(supplier => supplier.id === supplierId)?.supplierName || '';

  const openRequest = (request: ProcurementRequestRecord) => {
    const recommended = buildSupplierRecommendations(request, suppliers, purchaseOrders)[0];
    setSelectedRequestId(request.id);
    setSupplierId(request.selectedSupplierId || recommended?.supplier.id || '');
    setUnitPrice(request.selectedUnitPrice || recommended?.lastUnitPrice || 0);
    setExpectedReceiveDate(request.requiredDate?.slice(0, 10) || '');
    setAssignedPurchaserId(
      request.assignedPurchaserId || (currentUser.role === 'purchaser' ? currentUser.uid : purchasers[0]?.uid || '')
    );
    setSourcingType(request.sourcingType);
  };

  const handleUpdateRequestStatus = async (request: ProcurementRequestRecord, status: ProcurementStatus) => {
    return runMutationAction(
      'PurchasePage.tsx:handleUpdateRequestStatus',
      async () => {
        const purchaser = purchasers.find(user => user.uid === (request.assignedPurchaserId || assignedPurchaserId));
        await requireConfirmedMutation(
          dbService.updateDocument('procurement_requests', request.id, {
            status,
            assignedPurchaserId: request.assignedPurchaserId || assignedPurchaserId,
            assignedPurchaserName: request.assignedPurchaserName || purchaser?.displayName || '',
            updatedBy: currentUser.displayName
          })
        );

        showSuccessToast('Đã lưu thành công');
      },
      request
    );
  };

  const handleCreatePurchaseOrder = async (event: React.FormEvent) => {
    return runMutationAction(
      'PurchasePage.tsx:handleCreatePurchaseOrder',
      async () => {
        event.preventDefault();
        if (!selectedRequest || !supplierId || unitPrice <= 0 || !expectedReceiveDate) return;
        const supplier = suppliers.find(candidate => candidate.id === supplierId);
        if (!supplier) return;
        setIsSaving(true);
        try {
          const now = new Date().toISOString();
          const purchaser = purchasers.find(user => user.uid === assignedPurchaserId);
          const purCode = `PUR-${now.slice(2, 7).replace('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
          const totalPrice = selectedRequest.quantity * unitPrice;
          const createdOrder = await dbService.addDocument('purchase_orders', {
            purCode,
            procurementRequestId: selectedRequest.id,
            supplierId: supplier.id,
            supplierName: supplier.supplierName,
            linkedPoId: selectedRequest.poId,
            linkedPoCode: selectedRequest.poCode,
            sourcingType,
            items: [
              {
                poItemId: selectedRequest.poItemId,
                productCode: selectedRequest.productCode,
                productName: selectedRequest.productName,
                materialName: selectedRequest.material || selectedRequest.productName,
                size: selectedRequest.size,
                quantity: selectedRequest.quantity,
                unit: selectedRequest.unit,
                unitPrice,
                totalPrice
              }
            ],
            totalPrice,
            status: 'ordered',
            expectedReceiveDate: new Date(`${expectedReceiveDate}T00:00:00`).toISOString(),
            actualReceiveDate: '',
            assignedPurchaserId,
            assignedPurchaserName: purchaser?.displayName || '',
            createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            createdAt: now
          });

          await requireConfirmedMutation(
            dbService.updateDocument('procurement_requests', selectedRequest.id, {
              sourcingType,
              status: 'ordered',
              selectedSupplierId: supplier.id,
              selectedSupplierName: supplier.supplierName,
              selectedUnitPrice: unitPrice,
              assignedPurchaserId,
              assignedPurchaserName: purchaser?.displayName || '',
              purchaseOrderId: createdOrder.id,
              purchaseOrderCode: purCode,
              updatedBy: currentUser.displayName
            })
          );

          const po = pos.find(candidate => asText(candidate.id) === selectedRequest.poId);
          if (po) {
            const updatedItems = asArray(po.items).map((item, index) =>
              asText(item.itemId) === selectedRequest.poItemId || index === selectedRequest.poItemIndex
                ? {
                    ...item,
                    sourcingType,
                    supplierId: supplier.id,
                    supplierName: supplier.supplierName,
                    purchasePrice: unitPrice,
                    purchaseNeedsReview: false
                  }
                : item
            );
            await requireConfirmedMutation(
              dbService.updateDocument('pos', selectedRequest.poId, {
                ...(po.goodsFlowVersion !== 1 && po.accountingFlowVersion !== 1 ? { items: updatedItems } : {}),
                purchaseProgress: 'supplier_ordered',
                historyLogs: [
                  ...asArray(po.historyLogs),
                  {
                    status: asText(po.status),
                    updatedBy: currentUser.displayName,
                    updatedAt: now,
                    note: `Mua hàng đã chọn ${supplier.supplierName} cho ${selectedRequest.productName}; đơn mua ${purCode}, giá ${unitPrice.toLocaleString('vi-VN')} đ/${selectedRequest.unit}.`
                  }
                ]
              })
            );
          }

          setSelectedRequestId('');
          onRefresh();

          showSuccessToast('Đã thêm thành công');
        } finally {
          setIsSaving(false);
        }
      },
      event
    );
  };

  const handleReceiveOrder = async (order: UnknownRecord) => {
    if (!canPostWarehouse(currentUser)) return;
    if (asText(order.sourcingType) === 'raw_material') setWarehouseOrderId(asText(order.id));
    else setGoodsOptions({ kind: 'purchase_receipt', sourceId: asText(order.id) });
  };

  return (
    <div className="purchase-page" data-erp-table-text="single-line">
      <PageContextHeader
        section={t('Mua hàng')}
        current={activeListView === 'orders' ? t('Đơn mua đã phát hành') : t('Yêu cầu từ đơn hàng')}
      />

      <div className="purchase-list-tabs content-tabs" role="tablist" aria-label={t('Chọn danh sách mua hàng')}>
        <button
          type="button"
          className={`purchase-list-tab ${activeListView === 'requests' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveListView('requests');
            setSearchTerm('');
          }}
          role="tab"
          aria-selected={activeListView === 'requests'}
        >
          <span>{t('Yêu cầu từ đơn hàng')}</span>
        </button>
        <button
          type="button"
          className={`purchase-list-tab ${activeListView === 'orders' ? 'is-active' : ''}`}
          onClick={() => {
            setActiveListView('orders');
            setSearchTerm('');
          }}
          role="tab"
          aria-selected={activeListView === 'orders'}
        >
          <span>{t('Đơn mua đã phát hành')}</span>
        </button>
      </div>

      <section className="purchase-panel purchase-list-card">
        <div className="purchase-toolbar">
          <div className="purchase-search">
            <input
              aria-label={t('Tìm kiếm mua hàng')}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder={
                activeListView === 'requests'
                  ? t('Tìm mã đơn hàng, khách hàng, mã hàng, vật liệu hoặc NCC...')
                  : t('Tìm mã đơn mua, NCC, đơn hàng khách hàng hoặc mặt hàng...')
              }
            />
          </div>
          <DataFilterButton
            activeCount={purchaseActiveFilterCount}
            open={showPurchaseFilters}
            onClick={() => setShowPurchaseFilters(true)}
          />
          {canEditColumns && (
            <IconButton
              label={t('Tùy chỉnh cột')}
              icon={<Settings2 />}
              onClick={() => setShowPurchaseColumnCustomizer(true)}
            />
          )}
        </div>

        <DataFilterChipBar
          chips={[
            ...sourcingFilters.map(value => ({
              id: `sourcing:${value}`,
              label: getSourcingTypeLabel(value),
              onRemove: () => setSourcingFilters(current => current.filter(item => item !== value))
            })),
            ...monthFilters.map(value => ({
              id: `month:${value}`,
              label: value,
              onRemove: () => setMonthFilters(current => current.filter(item => item !== value))
            }))
          ]}
          onClear={() => {
            setSourcingFilters([]);
            setMonthFilters([]);
          }}
        />

        {activeListView === 'requests' ? (
          <div className="table-container erp-primary-data-table">
            <table className="purchase-request-table" data-resize-key="purchase-requests">
              <thead>
                <tr>
                  <ReorderableTableCells
                    order={orderedRequestColumnIds}
                    getHeaderProps={getRequestHeaderProps}
                    labels={requestColumnLabels}
                  >
                    <th key="request">{t('Yêu cầu / đơn hàng')}</th>
                    {requestVisibleColumnSet.has('customer') && <th key="customer">{t('Khách hàng')}</th>}
                    {requestVisibleColumnSet.has('product') && <th key="product">{t('Mặt hàng')}</th>}
                    {requestVisibleColumnSet.has('sourcing') && <th key="sourcing">{t('Phương án cung ứng')}</th>}
                    {requestVisibleColumnSet.has('quantity') && (
                      <th key="quantity" className="erp-number-cell">
                        {t('Số lượng')}
                      </th>
                    )}
                    {requestVisibleColumnSet.has('requiredDate') && <th key="requiredDate">{t('Ngày cần')}</th>}
                    {requestVisibleColumnSet.has('purchaser') && <th key="purchaser">{t('Mua hàng phụ trách')}</th>}
                    {requestVisibleColumnSet.has('supplier') && <th key="supplier">{t('NCC')}</th>}
                    <th key="actions">{t('Thao tác')}</th>
                  </ReorderableTableCells>
                </tr>
              </thead>
              <tbody>
                {requestPagination.rows.map(request => (
                  <tr key={request.id}>
                    <ReorderableTableCells order={orderedRequestColumnIds} expandOverflowText={false}>
                      <td
                        key="request"
                        title={[request.requestCode, request.poCode, request.status === 'new' ? 'NEW' : '']
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        <strong className="purchase-request-code">
                          {request.requestCode} · {request.poCode}
                          {request.status === 'new' && <span className="purchase-new-text">NEW</span>}
                        </strong>
                      </td>
                      {requestVisibleColumnSet.has('customer') && (
                        <td key="customer">
                          <strong>{request.customerName || '—'}</strong>
                        </td>
                      )}
                      {requestVisibleColumnSet.has('product') && (
                        <td key="product">
                          <strong>{request.productName}</strong>
                          <span>
                            {[request.productCode, request.material, request.size].filter(Boolean).join(' · ')}
                          </span>
                        </td>
                      )}
                      {requestVisibleColumnSet.has('sourcing') && (
                        <td key="sourcing">
                          <span className={`sourcing-text sourcing-text--${request.sourcingType}`}>
                            {getSourcingTypeLabel(request.sourcingType)}
                          </span>
                        </td>
                      )}
                      {requestVisibleColumnSet.has('quantity') && (
                        <td key="quantity" className="erp-number-cell">
                          <strong>
                            {request.quantity.toLocaleString('vi-VN')} {request.unit}
                          </strong>
                        </td>
                      )}
                      {requestVisibleColumnSet.has('requiredDate') && (
                        <td key="requiredDate">
                          <span
                            className={
                              request.requiredDate &&
                              Date.parse(request.requiredDate) < PURCHASE_PAGE_REFERENCE_TIME &&
                              request.status !== 'received'
                                ? 'purchase-date-overdue'
                                : ''
                            }
                          >
                            {formatDate(request.requiredDate, 'vi-VN', '—')}
                          </span>
                        </td>
                      )}
                      {requestVisibleColumnSet.has('purchaser') && (
                        <td key="purchaser">{request.assignedPurchaserName || t('Chưa phân công')}</td>
                      )}
                      {requestVisibleColumnSet.has('supplier') && (
                        <td key="supplier">{request.selectedSupplierName || '—'}</td>
                      )}
                      <td key="actions">
                        <RowActionMenu
                          label={`${t('Thao tác')} ${request.requestCode}`}
                          actions={[
                            ...(request.status === 'new'
                              ? [
                                  {
                                    label: t('Tiếp nhận'),
                                    onSelect: () => handleUpdateRequestStatus(request, 'reviewing')
                                  }
                                ]
                              : []),
                            ...(ACTIVE_STATUSES.includes(request.status)
                              ? [{ label: t('Chọn NCC'), onSelect: () => openRequest(request) }]
                              : [])
                          ]}
                        />
                      </td>
                    </ReorderableTableCells>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-container erp-primary-data-table">
            <table className="purchase-table" data-resize-key="purchase-orders">
              <thead>
                <tr>
                  <ReorderableTableCells
                    order={orderedOrderColumnIds}
                    getHeaderProps={getOrderHeaderProps}
                    labels={orderColumnLabels}
                  >
                    <th key="order">{t('Mã đơn mua')}</th>
                    {orderVisibleColumnSet.has('supplier') && <th key="supplier">{t('Nhà cung cấp')}</th>}
                    {orderVisibleColumnSet.has('po') && <th key="po">{t('Đơn hàng khách hàng')}</th>}
                    {orderVisibleColumnSet.has('product') && <th key="product">{t('Mặt hàng')}</th>}
                    {orderVisibleColumnSet.has('value') && (
                      <th key="value" className="erp-number-cell">
                        {t('Giá trị')}
                      </th>
                    )}
                    {orderVisibleColumnSet.has('expectedDate') && <th key="expectedDate">{t('Ngày nhận dự kiến')}</th>}
                    <th key="actions">{t('Thao tác')}</th>
                  </ReorderableTableCells>
                </tr>
              </thead>
              <tbody>
                {orderPagination.rows.map(order => (
                  <tr key={asText(order.id)}>
                    <ReorderableTableCells order={orderedOrderColumnIds} expandOverflowText={false}>
                      <td key="order">
                        <strong>{asText(order.purCode)}</strong>
                      </td>
                      {orderVisibleColumnSet.has('supplier') && <td key="supplier">{asText(order.supplierName)}</td>}
                      {orderVisibleColumnSet.has('po') && <td key="po">{asText(order.linkedPoCode) || '—'}</td>}
                      {orderVisibleColumnSet.has('product') && (
                        <td key="product">
                          {asArray(order.items)
                            .map(
                              item =>
                                `${asText(item.materialName ?? item.productName)} (${asNumber(item.quantity).toLocaleString('vi-VN')} ${asText(item.unit)})`
                            )
                            .join(', ')}
                        </td>
                      )}
                      {orderVisibleColumnSet.has('value') && (
                        <td key="value" className="erp-number-cell">
                          <strong>{asNumber(order.totalPrice).toLocaleString('vi-VN')} đ</strong>
                        </td>
                      )}
                      {orderVisibleColumnSet.has('expectedDate') && (
                        <td key="expectedDate">{formatDate(asText(order.expectedReceiveDate), 'vi-VN', '—')}</td>
                      )}
                      <td key="actions">
                        {asText(order.status) !== 'received' ? (
                          <RowActionMenu
                            label={`${t('Thao tác')} ${asText(order.purCode)}`}
                            actions={[
                              {
                                label: t(
                                  asText(order.sourcingType) === 'raw_material'
                                    ? 'Nhập kho NVL'
                                    : 'Nhập kho hàng mua / gia công'
                                ),
                                disabled: asText(order.status) === 'cancelled' || !canPostWarehouse(currentUser),
                                onSelect: () => handleReceiveOrder(order)
                              },
                              ...(asText(order.sourcingType) !== 'raw_material'
                                ? [
                                    {
                                      label: t('NCC giao thẳng khách'),
                                      disabled: !canPostWarehouse(currentUser) || asText(order.status) === 'cancelled',
                                      onSelect: () =>
                                        setGoodsOptions({ kind: 'supplier_dispatch', sourceId: asText(order.id) })
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                    </ReorderableTableCells>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DataTablePagination
          {...(activeListView === 'requests' ? requestPagination.paginationProps : orderPagination.paginationProps)}
        />
      </section>

      <TableColumnCustomizer
        open={showPurchaseColumnCustomizer}
        columns={activeListView === 'requests' ? PURCHASE_REQUEST_COLUMNS : PURCHASE_ORDER_COLUMNS}
        selectedIds={activeListView === 'requests' ? requestVisibleColumns : orderVisibleColumns}
        onClose={() => setShowPurchaseColumnCustomizer(false)}
        onSave={activeListView === 'requests' ? saveRequestVisibleColumns : saveOrderVisibleColumns}
      />
      <DataFilterPanel
        open={showPurchaseFilters}
        title={t('Lọc danh sách mua hàng')}
        description={t('Lọc theo phương án cung ứng và tháng phát sinh.')}
        activeCount={purchaseActiveFilterCount}
        onClose={() => setShowPurchaseFilters(false)}
        onReset={() => {
          setSourcingFilters([]);
          setMonthFilters([]);
        }}
      >
        <DataFilterSection title={t('Phương án cung ứng')} selectedCount={sourcingFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={SOURCING_TYPES.map(type => ({ value: type, label: getSourcingTypeLabel(type) }))}
            selectedValues={sourcingFilters}
            onChange={values => setSourcingFilters(values as SourcingType[])}
          />
        </DataFilterSection>
        <DataFilterSection title={t('Tháng phát sinh')} selectedCount={monthFilters.length}>
          <DataFilterCheckboxGroup
            options={months.map(month => ({ value: month, label: month }))}
            selectedValues={monthFilters}
            onChange={setMonthFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>

      {selectedRequest && (
        <div className="modal-overlay">
          <div className="modal-content procurement-modal">
            <div className="modal-header">
              <div>
                <strong>{t('CHỌN NHÀ CUNG CẤP')}</strong>
                <span>
                  {selectedRequest.requestCode} · {selectedRequest.poCode}
                </span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setSelectedRequestId('')}>
                {t('Đóng')}
              </button>
            </div>
            <form onSubmit={handleCreatePurchaseOrder}>
              <div className="modal-body">
                <div className="procurement-context">
                  <div>
                    <span>{t('Khách hàng')}</span>
                    <strong>{selectedRequest.customerName}</strong>
                  </div>
                  <div>
                    <span>{t('Mặt hàng')}</span>
                    <strong>{selectedRequest.productName}</strong>
                  </div>
                  <div>
                    <span>{t('Quy cách')}</span>
                    <strong>
                      {[selectedRequest.material, selectedRequest.size].filter(Boolean).join(' · ') || '—'}
                    </strong>
                  </div>
                  <div>
                    <span>{t('Số lượng')}</span>
                    <strong>
                      {selectedRequest.quantity.toLocaleString('vi-VN')} {selectedRequest.unit}
                    </strong>
                  </div>
                </div>

                <section className="recommendation-section">
                  <div className="panel-heading-row">
                    <h3>{t('NCC được đề xuất từ lịch sử mua')}</h3>
                    <small>{t('Điểm dựa trên mặt hàng tương tự, giá, số lần mua, giao đúng hạn và đánh giá.')}</small>
                  </div>
                  <div className="recommendation-grid">
                    {recommendations.map((recommendation, index) => (
                      <button
                        type="button"
                        key={recommendation.supplier.id}
                        className={`recommendation-card ${supplierId === recommendation.supplier.id ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSupplierId(recommendation.supplier.id);
                          if (recommendation.lastUnitPrice) setUnitPrice(recommendation.lastUnitPrice);
                        }}
                      >
                        <div>
                          <span>#{index + 1}</span>
                          <strong>
                            {recommendation.score} {t('điểm')}
                          </strong>
                        </div>
                        <h4>{recommendation.supplier.supplierName}</h4>
                        {recommendation.reasons.slice(0, 3).map(reason => (
                          <p key={reason}>• {reason}</p>
                        ))}
                      </button>
                    ))}
                    {recommendations.length === 0 && (
                      <div className="purchase-empty">
                        {t('Chưa có NCC hoạt động. Hãy thêm NCC trong Danh sách nhà cung cấp.')}
                      </div>
                    )}
                  </div>

                  {supplierId && (
                    <div className="supplier-supply-history">
                      <div className="supplier-supply-history__header">
                        <div>
                          <strong>{t('Lịch sử cung ứng')}</strong>
                          <span>{selectedSupplierName}</span>
                        </div>
                        <span>
                          {selectedSupplierHistory.length} {t('lần cung ứng')}
                        </span>
                      </div>
                      {selectedSupplierHistory.length > 0 ? (
                        <div className="table-container supplier-supply-history__table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>{t('Đơn mua')}</th>
                                <th>{t('Ngày đặt')}</th>
                                <th>{t('Mặt hàng')}</th>
                                <th>{t('Số lượng')}</th>
                                <th>{t('Đơn giá')}</th>
                                <th>{t('Thành tiền')}</th>
                                <th>{t('Ngày nhận')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedSupplierHistory.map(history => (
                                <tr key={history.key}>
                                  <td>
                                    <strong>{history.orderCode || '—'}</strong>
                                  </td>
                                  <td>{formatDate(history.orderedAt, 'vi-VN', '—')}</td>
                                  <td>{history.productName}</td>
                                  <td>
                                    {history.quantity.toLocaleString('vi-VN')} {history.unit}
                                  </td>
                                  <td>{history.unitPrice.toLocaleString('vi-VN')} đ</td>
                                  <td>
                                    <strong>{history.totalPrice.toLocaleString('vi-VN')} đ</strong>
                                  </td>
                                  <td>{formatDate(history.receivedAt, 'vi-VN', '—')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="purchase-empty">{t('Nhà cung cấp này chưa có lần cung ứng nào trước đây.')}</p>
                      )}
                    </div>
                  )}
                </section>

                <div className="procurement-form-grid">
                  <div className="form-group">
                    <label>{t('Phương án cung ứng')}</label>
                    <select
                      value={sourcingType}
                      onChange={event => setSourcingType(event.target.value as SourcingType)}
                    >
                      {(['finished_good', 'raw_material', 'subcontract'] as SourcingType[]).map(type => (
                        <option key={type} value={type}>
                          {getSourcingTypeLabel(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('Nhà cung cấp *')}</label>
                    <select value={supplierId} onChange={event => setSupplierId(event.target.value)} required>
                      <option value="">{t('Chọn nhà cung cấp')}</option>
                      {suppliers.map(supplier => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.supplierName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{t('Đơn giá mua *')}</label>
                    <input
                      type="number"
                      min="1"
                      value={unitPrice}
                      onChange={event => setUnitPrice(Number(event.target.value))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Ngày nhận dự kiến *')}</label>
                    <input
                      type="date"
                      value={expectedReceiveDate}
                      onChange={event => setExpectedReceiveDate(event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Nhân viên mua hàng')}</label>
                    <select value={assignedPurchaserId} onChange={event => setAssignedPurchaserId(event.target.value)}>
                      <option value="">{t('Chưa phân công')}</option>
                      {purchasers.map(user => (
                        <option key={user.uid} value={user.uid}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="procurement-total">
                    <span>{t('Tổng tiền dự kiến')}</span>
                    <strong>{(selectedRequest.quantity * unitPrice).toLocaleString('vi-VN')} đ</strong>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setSelectedRequestId('')}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving || !supplierId}>
                  {isSaving ? t('Đang lưu...') : t('Chọn NCC & tạo đơn mua')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {goodsOptions && (
        <GoodsVoucherDialog
          currentUser={currentUser}
          options={goodsOptions}
          onClose={() => setGoodsOptions(null)}
          onSaved={() => {
            setGoodsOptions(null);
            onRefresh();
          }}
        />
      )}
      {warehouseOrderId && (
        <WarehouseVoucherDialog
          currentUser={currentUser}
          initialSourceId={warehouseOrderId}
          initialKind="purchase_receipt"
          onClose={() => setWarehouseOrderId('')}
          onSaved={() => {
            setWarehouseOrderId('');
            onRefresh();
          }}
        />
      )}
    </div>
  );
};
