import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { deletionFields } from '@/features/administration/model/recycleBin';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import React, { useState, useEffect } from 'react';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { FloatingChat } from '@/components/FloatingChat';
import POFormFullScreen from '@/features/sales/components/POFormFullScreen';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { customerCallHistoryKeys, customerCallSubjectKey } from '@/features/crm/model/callHistory';
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
import { syncDesignRequestsForPO } from '@/features/design/api/designRequestService';
import { synchronizeProcurementRequestsForPO } from '@/features/procurement/api/procurementService';
import { DesignRecord, DesignVersion } from '@/features/design/model/designWorkflow';
import { withCalculatedPOFinancials } from '@/domain/poFinancials';
import { OrderDetailView } from '@/features/sales/components/orderDetail/OrderDetailView';
import { getPOQueueLabel, getPOQueueStatus, PO_QUEUE_STATES, POQueueStatus } from '@/features/sales/model/poWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { formatDate, formatDateTime, parseValidDate } from '@/shared/utils/dateFormatting';
import { DOCUMENT_CODE_PREFIXES } from '@/shared/utils/documentCodes';
import { normalizeCustomerProduct, type CustomerRecord, type LeadRecord } from '@/features/crm/model/crmModels';
import { synchronizeCustomerProductOrderItems } from '@/features/crm/model/customerProductCatalog';
import '@/components/CustomerHistory.css';
import { PrintPreviewDialog } from '@/components/PrintPreviewDialog';
import { orderSheetHtml, type PrintableOrder } from '@/features/sales/model/orderSheet';
import { Check, FileText, Settings2 } from 'lucide-react';

interface SalesProps {
  pos: any[];
  customers: CustomerRecord[];
  leads: LeadRecord[];
  currentUser: UserProfile;
  onRefresh: () => void;
  initialSelectedPoId?: string;
  initialRepeatPoId?: string;
  initialPreparedCustomerId?: string;
  onRepeatOrderOpened?: () => void;
  onPreparedOrderOpened?: () => void;
  onOpenCustomerDetails?: (customerId: string) => void;
  messages: any[];
  users: UserProfile[];
}

type SalesListView = 'orders' | 'waiting-customers';

const SALES_CUSTOMER_COLUMNS: TableColumnOption[] = [
  { id: 'customer', label: 'Khách hàng', required: true, group: 'Thông tin khách hàng' },
  { id: 'code', label: 'Mã KH', defaultVisible: true, group: 'Thông tin khách hàng' },
  { id: 'contact', label: 'Người liên hệ', defaultVisible: true, group: 'Thông tin khách hàng' },
  { id: 'phone', label: 'Số điện thoại', defaultVisible: false, group: 'Thông tin khách hàng' },
  { id: 'email', label: 'Email', defaultVisible: false, group: 'Thông tin khách hàng' },
  { id: 'sale', label: 'Sale phụ trách', defaultVisible: true, group: 'Phụ trách' },
  { id: 'count', label: 'Số đơn hàng', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'latest', label: 'Đơn hàng gần nhất', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'value', label: 'Tổng giá trị', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'status', label: 'Trạng thái gần nhất', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];

const getCustomerCode = (customer: any) => customer.customerCode || customer.code || customer.id || '';

const normalizeCustomerIdentity = (value: unknown) =>
  String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN');

const getCustomerIdentityKey = (customer: CustomerRecord) => {
  const companyName = normalizeCustomerIdentity(customer.companyName);
  if (companyName) return `company:${companyName}`;
  const taxCode = normalizeCustomerIdentity(customer.taxCode);
  return taxCode ? `tax:${taxCode}` : `id:${customer.id}`;
};

const getCustomerProfileScore = (customer: CustomerRecord) =>
  [
    customer.customerCode,
    customer.taxCode,
    customer.contactPerson,
    customer.phone,
    customer.email,
    customer.assignedSaleId,
    customer.address
  ].filter(Boolean).length;

const getWaitingDays = (createdAt: unknown) => {
  if (typeof createdAt !== 'string') return null;
  const createdTime = Date.parse(createdAt);
  if (Number.isNaN(createdTime)) return null;
  return Math.max(0, Math.floor((Date.now() - createdTime) / (24 * 60 * 60 * 1000)));
};

export const Sales: React.FC<SalesProps> = ({
  pos,
  customers,
  leads,
  currentUser,
  onRefresh,
  initialSelectedPoId,
  initialRepeatPoId,
  initialPreparedCustomerId,
  onRepeatOrderOpened,
  onPreparedOrderOpened,
  onOpenCustomerDetails,
  messages,
  users
}) => {
  const isFull = currentUser.role === 'admin' || currentUser.role === 'accountant';
  const isSaleOnly = currentUser.role === 'sale' || currentUser.role === 'designer';
  // Only admins move orders to the recycle bin (formerly enforced by a shared confirmation password).
  const canDeletePO = currentUser.role === 'admin';
  const canViewSaleFinancials = isFull || isSaleOnly;
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const [printPO, setPrintPO] = useState<PrintableOrder | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [repeatSourcePO, setRepeatSourcePO] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeListView, setActiveListView] = useState<SalesListView>('orders');
  const [initialCustomerId, setInitialCustomerId] = useState('');
  const [selectedOrderCustomerId, setSelectedOrderCustomerId] = useState('');
  const [salesStatusFilters, setSalesStatusFilters] = useState<string[]>([]);
  const [salesOwnerFilters, setSalesOwnerFilters] = useState<string[]>([]);
  const [showSalesFilters, setShowSalesFilters] = useState(false);
  const [showSalesColumnCustomizer, setShowSalesColumnCustomizer] = useState(false);

  const {
    selectedIds: sharedSalesColumns,
    setSelectedIds: setSalesVisibleColumns,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'sales-customer-orders',
    legacySelectionKey: `sunflower:sales-customer-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:sales-customer-column-widths:v3:${currentUser.uid}`
  });
  const salesVisibleColumns = Array.from(
    new Set([
      'customer',
      'actions',
      ...(sharedSalesColumns ||
        SALES_CUSTOMER_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id))
    ])
  );
  const salesVisibleColumnSet = new Set(salesVisibleColumns);
  const salesVisibleColumnCount = SALES_CUSTOMER_COLUMNS.filter(column => salesVisibleColumnSet.has(column.id)).length;
  const salesActiveFilterCount = salesStatusFilters.length + salesOwnerFilters.length;
  const saveSalesVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const next = Array.from(new Set(['customer', 'actions', ...selectedIds]));
    setSalesVisibleColumns(next);
    setShowSalesColumnCustomizer(false);
  };
  const { orderedColumnIds: orderedSalesColumnIds, getHeaderProps: getSalesHeaderProps } = useReorderableTableColumns({
    columns: SALES_CUSTOMER_COLUMNS,
    selectedIds: salesVisibleColumns,
    onOrderChange: saveSalesVisibleColumns,
    layoutId: 'sales-customer-orders',
    lockedStartIds: ['customer'],
    lockedEndIds: ['actions']
  });
  const salesColumnLabels = Object.fromEntries(SALES_CUSTOMER_COLUMNS.map(column => [column.id, column.label]));

  // Auto-select PO when initialSelectedPoId changes
  useEffect(() => {
    if (initialSelectedPoId) {
      const po = pos.find(p => p.id === initialSelectedPoId);
      if (po) {
        setSelectedPO(po);
      }
    }
  }, [initialSelectedPoId, pos]);

  useEffect(() => {
    if (!initialRepeatPoId) return;
    const sourcePO = pos.find(po => po.id === initialRepeatPoId);
    if (!sourcePO) return;
    setSelectedPO(null);
    setRepeatSourcePO(sourcePO);
    setInitialCustomerId('');
    setShowEditModal(false);
    setShowAddModal(true);
    onRepeatOrderOpened?.();
  }, [initialRepeatPoId, onRepeatOrderOpened, pos]);

  useEffect(() => {
    if (!initialPreparedCustomerId) return;
    if (!customers.some(customer => customer.id === initialPreparedCustomerId)) return;
    const openPreparedOrderTimer = window.setTimeout(() => {
      setSelectedPO(null);
      setRepeatSourcePO(null);
      setInitialCustomerId(initialPreparedCustomerId);
      setShowEditModal(false);
      setShowAddModal(true);
      onPreparedOrderOpened?.();
    }, 0);
    return () => window.clearTimeout(openPreparedOrderTimer);
  }, [customers, initialPreparedCustomerId, onPreparedOrderOpened]);

  // Load suppliers locally
  const [suppliers, setSuppliers] = useState<any[]>([]);
  useEffect(() => {
    const fetchSuppliers = async () => {
      const data = await dbService.getCollection('suppliers');
      setSuppliers(data);
    };
    fetchSuppliers();
  }, []);

  // Modal lightbox preview image
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [newChecklistText, setNewChecklistText] = useState('');

  const handleUpdateItemNotes = async (itemIdx: number, fieldName: 'saleNotes' | 'designNotes', value: string) => {
    return runMutationAction(
      'SalesPage.tsx:handleUpdateItemNotes',
      async () => {
        if (!selectedPO) return;

        const updatedItems = selectedPO.items.map((item: any, idx: number) => {
          if (idx === itemIdx) {
            return { ...item, [fieldName]: value };
          }
          return item;
        });

        const updatedPO = {
          ...selectedPO,
          items: updatedItems,
          updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
          updatedAt: new Date().toISOString()
        };

        await requireConfirmedMutation(
          dbService.updateDocument('pos', selectedPO.id, {
            items: updatedItems,
            updatedBy: updatedPO.updatedBy,
            updatedAt: updatedPO.updatedAt
          })
        );

        setSelectedPO(updatedPO);

        showSuccessToast('Đã lưu thành công');
      },
      itemIdx,
      { busy: false }
    );
  };

  const handleUploadItemFiles = async (
    itemIdx: number,
    fieldName: 'saleLayouts' | 'designLayouts',
    files: FileList | null
  ) => {
    return runMutationAction(
      'SalesPage.tsx:handleUploadItemFiles',
      async () => {
        if (!selectedPO || !files) return;

        const base64Promises = Array.from(files).map(file => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
          });
        });

        try {
          const base64Files = await Promise.all(base64Promises);

          const updatedItems = selectedPO.items.map((item: any, idx: number) => {
            if (idx === itemIdx) {
              const currentFiles = item[fieldName] || [];
              return { ...item, [fieldName]: [...currentFiles, ...base64Files] };
            }
            return item;
          });

          const updatedPO = {
            ...selectedPO,
            items: updatedItems,
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            updatedAt: new Date().toISOString()
          };

          await requireConfirmedMutation(
            dbService.updateDocument('pos', selectedPO.id, {
              items: updatedItems,
              updatedBy: updatedPO.updatedBy,
              updatedAt: updatedPO.updatedAt
            })
          );

          setSelectedPO(updatedPO);

          showSuccessToast('Đã lưu thành công');
        } catch (err) {
          showErrorToast();
          console.error(err);
          alert('Lỗi khi tải file lên.');
        }
      },
      itemIdx,
      { busy: false }
    );
  };

  const handleRemoveItemFile = async (itemIdx: number, fieldName: 'saleLayouts' | 'designLayouts', fileIdx: number) => {
    return runMutationAction(
      'SalesPage.tsx:handleRemoveItemFile',
      async () => {
        if (!selectedPO) return;
        if (!(await confirmDelete('Bạn có chắc chắn muốn xóa tệp này khỏi đơn hàng?'))) return;

        const updatedItems = selectedPO.items.map((item: any, idx: number) => {
          if (idx === itemIdx) {
            const currentFiles = item[fieldName] || [];
            return { ...item, [fieldName]: currentFiles.filter((_: any, i: number) => i !== fileIdx) };
          }
          return item;
        });

        const updatedPO = {
          ...selectedPO,
          items: updatedItems,
          updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
          updatedAt: new Date().toISOString()
        };

        await requireConfirmedMutation(
          dbService.updateDocument('pos', selectedPO.id, {
            items: updatedItems,
            updatedBy: updatedPO.updatedBy,
            updatedAt: updatedPO.updatedAt
          })
        );

        setSelectedPO(updatedPO);

        showSuccessToast('Đã xóa thành công');
      },
      itemIdx,
      { busy: false }
    );
  };

  const handleAddChecklistItem = async () => {
    return runMutationAction(
      'SalesPage.tsx:handleAddChecklistItem',
      async () => {
        if (!selectedPO || !newChecklistText.trim()) return;

        const newItem = {
          id: `task-${Math.random().toString(36).substr(2, 9)}`,
          content: newChecklistText.trim(),
          completed: false,
          updatedAt: new Date().toISOString(),
          updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
        };

        const updatedChecklist = [...(selectedPO.internalChecklist || []), newItem];

        const updatedPO = {
          ...selectedPO,
          internalChecklist: updatedChecklist
        };

        await requireConfirmedMutation(
          dbService.updateDocument('pos', selectedPO.id, {
            internalChecklist: updatedChecklist
          })
        );

        setSelectedPO(updatedPO);
        setNewChecklistText('');
        onRefresh();

        showSuccessToast('Đã thêm thành công');
      },
      undefined
    );
  };

  const handleToggleChecklistItem = async (taskId: string) => {
    return runMutationAction(
      'SalesPage.tsx:handleToggleChecklistItem',
      async () => {
        if (!selectedPO) return;

        const updatedChecklist = (selectedPO.internalChecklist || []).map((item: any) => {
          if (item.id === taskId) {
            return {
              ...item,
              completed: !item.completed,
              updatedAt: new Date().toISOString(),
              updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
            };
          }
          return item;
        });

        const updatedPO = {
          ...selectedPO,
          internalChecklist: updatedChecklist
        };

        await requireConfirmedMutation(
          dbService.updateDocument('pos', selectedPO.id, {
            internalChecklist: updatedChecklist
          })
        );

        setSelectedPO(updatedPO);
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      taskId,
      { busy: false }
    );
  };

  const handleRemoveChecklistItem = async (taskId: string) => {
    return runMutationAction(
      'SalesPage.tsx:handleRemoveChecklistItem',
      async () => {
        if (!selectedPO) return;
        if (!(await confirmDelete('Bạn có chắc chắn muốn xóa mục công việc này?'))) return;

        const updatedChecklist = (selectedPO.internalChecklist || []).filter((item: any) => item.id !== taskId);

        const updatedPO = {
          ...selectedPO,
          internalChecklist: updatedChecklist
        };

        await requireConfirmedMutation(
          dbService.updateDocument('pos', selectedPO.id, {
            internalChecklist: updatedChecklist
          })
        );

        setSelectedPO(updatedPO);
        onRefresh();

        showSuccessToast('Đã xóa thành công');
      },
      taskId
    );
  };

  const handleOpenEditModal = (po: any) => {
    if (po.productionPlanFrozen) {
      showErrorToast(
        'Đơn hàng đã có phân bổ sản xuất. Không sửa mặt hàng khi còn LSX; hủy các lệnh nháp / chưa chạy trước, hoặc xử lý điều chỉnh qua bộ phận sản xuất.'
      );
      return;
    }
    setSelectedPO(po);
    setShowEditModal(true);
  };

  const handleOpenRepeatOrder = (po: any) => {
    setRepeatSourcePO(po);
    setInitialCustomerId('');
    setSelectedPO(null);
    setShowEditModal(false);
    setShowAddModal(true);
  };

  const handleOpenCreatePO = (customerId = '') => {
    setSelectedPO(null);
    setRepeatSourcePO(null);
    setInitialCustomerId(customerId);
    setShowEditModal(false);
    setShowAddModal(true);
  };

  const handleDeletePO = async (poId: string) => {
    return runMutationAction(
      'SalesPage.tsx:handleDeletePO',
      async () => {
        if (!canDeletePO) return;
        if (!(await confirmDelete('Đưa đơn hàng này vào Thùng rác?'))) return;
        await requireConfirmedMutation(
          dbService.updateDocument('pos', poId, {
            ...deletionFields(currentUser),
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            updatedAt: new Date().toISOString()
          })
        );
        setSelectedPO(null);
        onRefresh();
        showSuccessToast('Đã xóa thành công');
      },
      poId
    );
  };

  const handleSavePO = async (poData: any) => {
    return runMutationAction(
      'SalesPage.tsx:handleSavePO',
      async () => {
        if (poData.id) {
          // Editing existing PO
          const subtotal = poData.totalAmount;
          const discountAmount = poData.discountAmount;
          const netAmount = poData.netAmount;

          const updatedLogs = [
            ...(selectedPO.historyLogs || []),
            {
              status: selectedPO.status,
              updatedBy: currentUser.displayName,
              updatedAt: new Date().toISOString(),
              note: `Chỉnh sửa thông số đơn hàng (Tổng trị giá: ${subtotal.toLocaleString()} đ)`
            }
          ];

          await requireConfirmedMutation(
            dbService.updateDocument('pos', poData.id, {
              expectedDeliveryDate: poData.expectedDeliveryDate,
              notes: poData.notes,
              customerPoCode: poData.customerPoCode,
              customerRank: poData.customerRank,
              customerSnapshot: poData.customerSnapshot || selectedPO.customerSnapshot,
              items: poData.items,
              assignments: poData.assignments || [],
              totalAmount: subtotal,
              discountAmount,
              netAmount,
              links: poData.links,
              updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
              updatedAt: new Date().toISOString(),
              historyLogs: updatedLogs
            })
          );
          await syncDesignRequestsForPO(
            {
              ...selectedPO,
              ...poData,
              id: poData.id,
              items: poData.items,
              assignments: poData.assignments || []
            },
            currentUser
          );
          await synchronizeProcurementRequestsForPO(
            {
              ...selectedPO,
              ...poData,
              id: poData.id,
              items: poData.items
            },
            currentUser
          );

          setShowEditModal(false);
          setSelectedPO(null);
        } else {
          // Creating new PO
          const latestCustomer = (await dbService.getDocument('customers', poData.customerId)) as CustomerRecord | null;
          if (!latestCustomer) throw new Error('Không tìm thấy khách hàng. Vui lòng chọn lại.');
          const catalogCustomer = {
            ...latestCustomer,
            products: (latestCustomer.products || []).map(normalizeCustomerProduct)
          };
          poData = {
            ...poData,
            items: synchronizeCustomerProductOrderItems(poData.items, catalogCustomer).map(withCalculatedPOFinancials)
          };
          // D-MA1: DH-YYMM-NNNN from a monthly counter issued in a transaction, so concurrent orders never collide.
          const poCode = await dbService.issueDocumentCode(DOCUMENT_CODE_PREFIXES.order);

          const reusableDesignByItemIndex = new Map<number, { design: DesignRecord; version: DesignVersion }>();
          if (poData.repeatSourcePoId && poData.designReuseRequested) {
            const sourcePO = pos.find(candidate => candidate.id === poData.repeatSourcePoId);
            const designList = (await dbService.getCollection('designs')) as DesignRecord[];
            const approvedSourceDesigns = designList.filter(
              design => design.poId === poData.repeatSourcePoId && design.status === 'approved'
            );

            poData.items.forEach((item: any, itemIndex: number) => {
              if (item.designReuseRequested !== true) return;
              const matchedSourceItemIndex = (sourcePO?.items || []).findIndex(
                (sourceItem: any) => item.sourceItemId && sourceItem.itemId === item.sourceItemId
              );
              const sourceItemIndex = matchedSourceItemIndex >= 0 ? matchedSourceItemIndex : itemIndex;
              const sourceItemId = item.sourceItemId || sourcePO?.items?.[sourceItemIndex]?.itemId;
              const design = approvedSourceDesigns.find(
                candidate =>
                  (sourceItemId && candidate.itemId === sourceItemId) ||
                  candidate.itemIndex === sourceItemIndex ||
                  (!candidate.itemId && candidate.itemIndex === undefined && sourceItemIndex === 0)
              );
              if (!design) return;
              const version =
                design.versions?.find(candidate => candidate.versionNumber === design.currentVersion) ||
                design.versions?.[design.versions.length - 1] ||
                (design.fileUrl
                  ? {
                      versionNumber: design.currentVersion || 1,
                      previewImage: design.fileUrl,
                      aiLink: design.aiLink || '',
                      corelLink: design.corelLink || '',
                      comment: design.notes || '',
                      createdAt: design.updatedAt || design.createdAt || ''
                    }
                  : null);
              if (version?.previewImage) reusableDesignByItemIndex.set(itemIndex, { design, version });
            });
          }

          const initialStatus: POQueueStatus = 'waiting_design';
          const newItems = poData.items.map((item: any, index: number) => {
            const reusable = reusableDesignByItemIndex.get(index);
            return reusable
              ? {
                  ...item,
                  previewImage: reusable.version.previewImage || item.previewImage || '',
                  previewImages: reusable.version.previewImage
                    ? Array.from(new Set([reusable.version.previewImage, ...(item.previewImages || [])]))
                    : item.previewImages || [],
                  designReuseStatus: 'pending_verification'
                }
              : { ...item, designReuseStatus: '' };
          });
          const reusedItemCount = reusableDesignByItemIndex.size;
          const allItemsReused = newItems.length > 0 && reusedItemCount === newItems.length;

          const newPO = {
            poCode,
            // The customer's own PO number is a separate reference; it never defaults to our order code.
            customerPoCode: poData.customerPoCode || '',
            customerId: poData.customerId,
            customerName: poData.customerName,
            customerRank: poData.customerRank,
            customerSnapshot: poData.customerSnapshot,
            saleId: currentUser.uid,
            orderDate: new Date().toISOString(),
            expectedDeliveryDate: poData.expectedDeliveryDate,
            status: initialStatus,
            workflowVersion: 2,
            designProgress: allItemsReused
              ? 'customer_approval_pending'
              : reusedItemCount > 0
                ? 'in_progress'
                : 'request_pending',
            items: newItems,
            assignments: poData.assignments || [],
            totalAmount: poData.totalAmount,
            discountAmount: poData.discountAmount,
            netAmount: poData.netAmount,
            links: poData.links,
            notes: poData.notes,
            orderType: poData.orderType || 'new',
            repeatSourcePoId: poData.repeatSourcePoId || '',
            repeatSourcePoCode: poData.repeatSourcePoCode || '',
            designReuseRequested: Boolean(poData.designReuseRequested),
            designReuseStatus: allItemsReused
              ? 'pending_verification'
              : reusedItemCount > 0
                ? 'partially_reused'
                : poData.designReuseRequested
                  ? 'source_not_approved'
                  : '',
            createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            createdAt: new Date().toISOString(),
            updatedBy: '',
            updatedAt: '',
            historyLogs: [
              {
                status: initialStatus,
                updatedBy: currentUser.displayName,
                updatedAt: new Date().toISOString(),
                note:
                  reusedItemCount > 0
                    ? `Tạo đơn đặt lại từ ${poData.repeatSourcePoCode}. Đã kế thừa ${reusedItemCount}/${newItems.length} mẫu thiết kế đã duyệt; từng mặt hàng được chuyển sang bước phù hợp.`
                    : poData.repeatSourcePoCode
                      ? `Tạo đơn đặt lại từ ${poData.repeatSourcePoCode}. Đã kế thừa thông số; chưa tìm thấy mẫu thiết kế đã duyệt để tự động sử dụng.`
                      : 'Khởi tạo đơn hàng mới trên ERP'
              }
            ]
          };

          const createdPO = await dbService.addDocument('pos', newPO);
          await synchronizeProcurementRequestsForPO({ ...newPO, id: createdPO.id }, currentUser);
          const createdDesignRequests = await syncDesignRequestsForPO(
            {
              ...newPO,
              id: createdPO.id
            },
            currentUser
          );
          for (const [itemIndex, reusable] of reusableDesignByItemIndex.entries()) {
            const request = createdDesignRequests.find(candidate => candidate.itemIndex === itemIndex);
            if (!request) continue;
            const reusedVersion = {
              ...reusable.version,
              versionNumber: 1,
              comment:
                `Tái sử dụng từ ${poData.repeatSourcePoCode} - mẫu v${reusable.version.versionNumber}. ${reusable.version.comment || ''}`.trim(),
              feedbackFromClient: '',
              feedbackAt: '',
              createdAt: new Date().toISOString(),
              createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
              reusedFromDesignId: reusable.design.id,
              reusedFromPoId: poData.repeatSourcePoId,
              reusedFromVersion: reusable.version.versionNumber
            };
            await dbService.addDocument('designs', {
              id: `design-${request.id}`,
              poId: createdPO.id,
              poCode,
              designRequestId: request.id,
              itemId: request.itemId,
              itemIndex,
              customerReferenceCode: newPO.customerPoCode || poCode,
              designerId: currentUser.role === 'designer' ? currentUser.uid : 'u-designer',
              status: 'client_pending',
              currentVersion: 1,
              versions: [reusedVersion],
              reusedFromDesignId: reusable.design.id,
              reusedFromPoId: poData.repeatSourcePoId,
              createdAt: new Date().toISOString()
            });
          }
          await requireConfirmedMutation(
            dbService.updateDocument('customers', poData.customerId, {
              lastOrderAt: new Date().toISOString(),
              customerRank: poData.customerRank,
              pendingOrderDraft: null
            })
          );

          setShowAddModal(false);
          setRepeatSourcePO(null);
          setInitialCustomerId('');
          setActiveListView('orders');
        }

        if (poData.id) {
          await requireConfirmedMutation(
            dbService.updateDocument('customers', poData.customerId, {
              customerRank: poData.customerRank
            })
          );
        }

        onRefresh();

        showSuccessToast(poData.id ? 'Đã lưu thành công' : 'Đã thêm thành công');
      },
      poData
    );
  };

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase('vi-VN');
  const activePOs = pos.filter(po => po.deleted !== true);

  const visiblePOs = activePOs.filter(po => {
    // Filter by sale role: only show POs where saleId matches or assignedSaleId matches or created by self
    if (currentUser.role === 'sale') {
      const createdBySelf = po.createdBy && po.createdBy.includes(currentUser.displayName);
      const isOwner = po.saleId === currentUser.uid;
      const isAssigned = po.assignedSaleId === currentUser.uid;
      if (!isOwner && !isAssigned && !createdBySelf) {
        return false;
      }
    }
    return true;
  });

  const accessibleCustomers = customers.filter(customer => {
    if (customer.deleted === true) return false;
    return currentUser.role !== 'sale' || !customer.assignedSaleId || customer.assignedSaleId === currentUser.uid;
  });

  const customerById = new Map(customers.map(customer => [customer.id, customer]));
  const representativeCustomerByKey = new Map<string, CustomerRecord>();
  accessibleCustomers.forEach(customer => {
    const key = getCustomerIdentityKey(customer);
    const current = representativeCustomerByKey.get(key);
    if (!current || getCustomerProfileScore(customer) > getCustomerProfileScore(current)) {
      representativeCustomerByKey.set(key, customer);
    }
  });

  const customerOrdersByKey = new Map<string, any[]>();
  visiblePOs.forEach(po => {
    const matchedCustomer = customerById.get(po.customerId);
    const companyName = normalizeCustomerIdentity(matchedCustomer?.companyName || po.customerName);
    const key = matchedCustomer ? getCustomerIdentityKey(matchedCustomer) : companyName ? `company:${companyName}` : '';
    if (!key || !representativeCustomerByKey.has(key)) return;
    const current = customerOrdersByKey.get(key) || [];
    current.push(po);
    customerOrdersByKey.set(key, current);
  });

  const getCustomerPOs = (customer: CustomerRecord) =>
    sortNewestFirst(customerOrdersByKey.get(getCustomerIdentityKey(customer)) || [], po => [
      po.createdAt,
      po.orderDate
    ]);
  const customersWithOrders = Array.from(representativeCustomerByKey.values()).filter(
    customer => getCustomerPOs(customer).length > 0
  );
  const selectedOrderCustomer = customersWithOrders.find(customer => customer.id === selectedOrderCustomerId) || null;
  const customerPOs = selectedOrderCustomer ? getCustomerPOs(selectedOrderCustomer) : [];
  const filteredPOs = customerPOs.filter(
    po =>
      !normalizedSearchTerm ||
      String(po.poCode || '')
        .toLocaleLowerCase('vi-VN')
        .includes(normalizedSearchTerm) ||
      String(po.customerPoCode || '')
        .toLocaleLowerCase('vi-VN')
        .includes(normalizedSearchTerm) ||
      String(po.createdBy || '')
        .toLocaleLowerCase('vi-VN')
        .includes(normalizedSearchTerm) ||
      (Array.isArray(po.items) &&
        po.items.some((item: any) =>
          String(item.productName || '')
            .toLocaleLowerCase('vi-VN')
            .includes(normalizedSearchTerm)
        ))
  );
  const orderCustomers = customersWithOrders
    .filter(customer => {
      const latestPO = getCustomerPOs(customer)[0];
      if (salesOwnerFilters.length > 0 && !salesOwnerFilters.includes(customer.assignedSaleId || 'unassigned'))
        return false;
      if (salesStatusFilters.length > 0) {
        const latestStatus = getPOQueueStatus(latestPO);
        if (!salesStatusFilters.includes(latestStatus)) return false;
      }
      if (!normalizedSearchTerm) return true;
      return [
        getCustomerCode(customer),
        customer.companyName,
        customer.contactPerson,
        customer.phone,
        customer.email,
        users.find(user => user.uid === customer.assignedSaleId)?.displayName
      ].some(value =>
        String(value || '')
          .toLocaleLowerCase('vi-VN')
          .includes(normalizedSearchTerm)
      );
    })
    .sort((left, right) => {
      const leftLatest = getCustomerPOs(left)[0];
      const rightLatest = getCustomerPOs(right)[0];
      const leftTime = parseValidDate(leftLatest?.createdAt || leftLatest?.orderDate)?.getTime() || 0;
      const rightTime = parseValidDate(rightLatest?.createdAt || rightLatest?.orderDate)?.getTime() || 0;
      return rightTime - leftTime || left.companyName.localeCompare(right.companyName, 'vi-VN');
    });

  const customerIdsWithOrders = new Set(activePOs.map(po => po.customerId).filter(Boolean));
  const waitingCustomers = sortNewestFirst(
    customers
      .filter(customer => {
        if (customer.deleted === true || customerIdsWithOrders.has(customer.id)) return false;
        if (currentUser.role === 'sale' && customer.assignedSaleId && customer.assignedSaleId !== currentUser.uid) {
          return false;
        }
        return true;
      })
      .filter(customer => {
        if (!normalizedSearchTerm) return true;
        return [
          getCustomerCode(customer),
          customer.companyName,
          customer.contactPerson,
          customer.phone,
          customer.email
        ].some(value =>
          String(value || '')
            .toLocaleLowerCase('vi-VN')
            .includes(normalizedSearchTerm)
        );
      }),
    customer => [customer.createdAt]
  );

  const customerPoPagination = useDataTablePagination(filteredPOs);
  const orderCustomerPagination = useDataTablePagination(orderCustomers);
  const waitingCustomerPagination = useDataTablePagination(waitingCustomers);

  const selectedPOCustomer = selectedPO ? customers.find(customer => customer.id === selectedPO.customerId) : undefined;
  // The order keeps the customer's assigned sale as captured when it was created.
  const selectedPOSaleId = selectedPO?.customerSnapshot?.assignedSaleId || selectedPOCustomer?.assignedSaleId || '';
  const selectedPOSaleName = users.find(user => user.uid === selectedPOSaleId)?.displayName || '';
  const supplierNames = Object.fromEntries(
    suppliers.map(supplier => [String(supplier.id), String(supplier.supplierName || '')])
  );

  return (
    <div className="sales-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageContextHeader
        section="Đơn hàng"
        current={
          !selectedPO
            ? selectedOrderCustomer?.companyName ||
              (activeListView === 'waiting-customers' ? 'Khách hàng chờ lên đơn' : 'Khách hàng có đơn hàng')
            : undefined
        }
      />

      {!selectedPO && (
        <>
          <div className="sales-list-tabs content-tabs" role="tablist" aria-label="Chọn danh sách đơn hàng">
            <button
              type="button"
              className={`sales-list-tab ${activeListView === 'orders' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveListView('orders');
                setSelectedOrderCustomerId('');
                setSearchTerm('');
              }}
              role="tab"
              aria-selected={activeListView === 'orders'}
            >
              <FileText size={16} />
              <span>Khách hàng có đơn hàng</span>
            </button>
            <button
              type="button"
              className={`sales-list-tab ${activeListView === 'waiting-customers' ? 'is-active' : ''}`}
              onClick={() => {
                setActiveListView('waiting-customers');
                setSelectedOrderCustomerId('');
                setSearchTerm('');
              }}
              role="tab"
              aria-selected={activeListView === 'waiting-customers'}
            >
              <Check size={16} />
              <span>Khách hàng chờ lên đơn</span>
            </button>
          </div>

          <div className="card sales-list-card">
            {activeListView === 'orders' && selectedOrderCustomer && (
              <div className="sales-customer-po-header">
                <div className="sales-customer-po-header__identity">
                  <PageBackButton
                    onClick={() => {
                      setSelectedOrderCustomerId('');
                      setSearchTerm('');
                    }}
                  />
                  <div className="sales-customer-po-header__heading">
                    <h1 title={selectedOrderCustomer.companyName}>{selectedOrderCustomer.companyName}</h1>
                    <span className="sales-customer-po-header__count">{customerPOs.length} đơn hàng</span>
                  </div>
                </div>
                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                  <button className="btn btn-primary" onClick={() => handleOpenCreatePO(selectedOrderCustomer.id)}>
                    Tạo đơn hàng mới
                  </button>
                )}
              </div>
            )}

            <div className="sales-list-toolbar">
              <input
                type="text"
                placeholder={
                  activeListView === 'orders'
                    ? selectedOrderCustomer
                      ? 'Nhập mã đơn hàng, số PO khách, tên sản phẩm hoặc người tạo...'
                      : 'Tìm mã khách hàng, công ty, người liên hệ...'
                    : 'Tìm mã khách hàng, công ty, người liên hệ...'
                }
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1 }}
              />
              {!selectedOrderCustomer && (
                <>
                  {activeListView === 'orders' && (
                    <DataFilterButton
                      activeCount={salesActiveFilterCount}
                      open={showSalesFilters}
                      onClick={() => setShowSalesFilters(true)}
                    />
                  )}
                  {canEditColumns && activeListView === 'orders' && (
                    <button
                      type="button"
                      className="data-filter-button"
                      onClick={() => setShowSalesColumnCustomizer(true)}
                      title="Tùy chỉnh cột"
                      aria-label="Tùy chỉnh cột"
                    >
                      <Settings2 size={16} />
                    </button>
                  )}
                </>
              )}
            </div>

            {activeListView === 'orders' && !selectedOrderCustomer && (
              <DataFilterChipBar
                chips={[
                  ...salesStatusFilters.map(value => ({
                    id: `status:${value}`,
                    label: PO_QUEUE_STATES.find(status => status.value === value)?.label || value,
                    onRemove: () => setSalesStatusFilters(current => current.filter(item => item !== value))
                  })),
                  ...salesOwnerFilters.map(value => ({
                    id: `owner:${value}`,
                    label:
                      value === 'unassigned'
                        ? 'Chưa phân công'
                        : users.find(user => user.uid === value)?.displayName || value,
                    onRemove: () => setSalesOwnerFilters(current => current.filter(item => item !== value))
                  }))
                ]}
                onClear={() => {
                  setSalesStatusFilters([]);
                  setSalesOwnerFilters([]);
                }}
              />
            )}

            {activeListView === 'orders' ? (
              selectedOrderCustomer ? (
                <div className="table-container customer-po-list-table erp-primary-data-table">
                  <table data-resize-key="sales-po-list">
                    <thead>
                      <tr>
                        <th>Mã đơn hàng</th>
                        <th>Ngày tạo</th>
                        <th>Sản phẩm</th>
                        <th>Tổng số lượng</th>
                        <th>Thành tiền</th>
                        <th>Ngày giao dự kiến</th>
                        <th>Trạng thái</th>
                        <th>Người tạo</th>
                        <th>Cập nhật gần nhất</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerPoPagination.rows.map(po => {
                        const items = Array.isArray(po.items) ? po.items : [];
                        const firstItem = items[0] || {};
                        const productSummary = firstItem.productName
                          ? `${firstItem.productName}${items.length > 1 ? ` +${items.length - 1} sản phẩm` : ''}`
                          : '—';
                        const totalQuantity = items.reduce(
                          (total: number, item: any) => total + Number(item.quantity || 0),
                          0
                        );
                        return (
                          <tr key={po.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedPO(po)}>
                            <td style={{ fontWeight: 600 }}>
                              {po.poCode}
                              {po.customerPoCode && po.customerPoCode !== po.poCode && (
                                <span className="sales-table-secondary">({po.customerPoCode})</span>
                              )}
                            </td>
                            <td>{formatDate(po.orderDate || po.createdAt, 'vi-VN')}</td>
                            <td
                              title={items
                                .map((item: any) => item.productName)
                                .filter(Boolean)
                                .join(', ')}
                            >
                              {productSummary}
                            </td>
                            <td>{totalQuantity.toLocaleString('vi-VN')}</td>
                            <td>{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                            <td>{formatDate(po.expectedDeliveryDate, 'vi-VN')}</td>
                            <td>
                              <span className={`sales-status-label sales-status-label--${getPOQueueStatus(po)}`}>
                                {getPOQueueLabel(po)}
                              </span>
                            </td>
                            <td>{po.createdBy || '—'}</td>
                            <td>{formatDateTime(po.updatedAt || po.createdAt, 'vi-VN', '—')}</td>
                            <td>
                              <RowActionMenu
                                label={`Thao tác ${po.poCode}`}
                                actions={[
                                  { label: 'Chi tiết', onSelect: () => setSelectedPO(po) },
                                  { label: 'Xuất đơn hàng', onSelect: () => setPrintPO(po) },
                                  ...(currentUser.role === 'admin' || currentUser.role === 'sale'
                                    ? [{ label: 'Đặt lại', onSelect: () => handleOpenRepeatOrder(po) }]
                                    : [])
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-container sales-order-customer-table erp-primary-data-table">
                  <table
                    className="has-dynamic-columns"
                    data-resize-key="sales-customer-orders"
                    style={{ minWidth: `${Math.max(1680, salesVisibleColumnCount * 180 + 280)}px` }}
                  >
                    <thead>
                      <tr>
                        <ReorderableTableCells
                          order={orderedSalesColumnIds}
                          getHeaderProps={getSalesHeaderProps}
                          labels={salesColumnLabels}
                        >
                          <th key="customer" data-system-field="companyName">
                            Khách hàng
                          </th>
                          {salesVisibleColumnSet.has('code') && <th key="code">Mã KH</th>}
                          {salesVisibleColumnSet.has('contact') && <th key="contact">Người liên hệ</th>}
                          {salesVisibleColumnSet.has('phone') && <th key="phone">Số điện thoại</th>}
                          {salesVisibleColumnSet.has('email') && <th key="email">Email</th>}
                          {salesVisibleColumnSet.has('sale') && <th key="sale">Sale phụ trách</th>}
                          {salesVisibleColumnSet.has('count') && <th key="count">Số đơn hàng</th>}
                          {salesVisibleColumnSet.has('latest') && <th key="latest">Đơn hàng gần nhất</th>}
                          {salesVisibleColumnSet.has('value') && <th key="value">Tổng giá trị</th>}
                          {salesVisibleColumnSet.has('status') && <th key="status">Trạng thái gần nhất</th>}
                          <th key="actions">Thao tác</th>
                        </ReorderableTableCells>
                      </tr>
                    </thead>
                    <tbody>
                      {orderCustomerPagination.rows.map(customer => {
                        const customerOrders = getCustomerPOs(customer);
                        const latestPO = customerOrders[0];
                        const totalValue = customerOrders.reduce(
                          (total, po) => total + Number(po.netAmount || po.totalAmount || 0),
                          0
                        );
                        const assignedSale = users.find(
                          user => user.uid === customer.assignedSaleId || (user as any).id === customer.assignedSaleId
                        );
                        return (
                          <tr
                            key={customer.id}
                            className="sales-customer-row"
                            onClick={() => {
                              setSelectedOrderCustomerId(customer.id);
                              setSearchTerm('');
                            }}
                          >
                            <ReorderableTableCells order={orderedSalesColumnIds} expandOverflowText={false}>
                              <td key="customer">
                                <strong className="erp-company-name" title={customer.companyName}>
                                  {customer.companyName}
                                </strong>
                              </td>
                              {salesVisibleColumnSet.has('code') && (
                                <td key="code">
                                  <span className="customer-code-badge">{getCustomerCode(customer)}</span>
                                </td>
                              )}
                              {salesVisibleColumnSet.has('contact') && (
                                <td key="contact">
                                  <strong>{customer.contactPerson || 'Chưa cập nhật'}</strong>
                                </td>
                              )}
                              {salesVisibleColumnSet.has('phone') && (
                                <td key="phone">
                                  <PhoneCallCell
                                    phone={customer.phone}
                                    companyName={customer.companyName}
                                    subjectKey={customerCallSubjectKey(customer)}
                                    historyKeys={customerCallHistoryKeys(customer, leads)}
                                    context={{
                                      contactPerson: customer.contactPerson,
                                      contactPosition: customer.contactPosition,
                                      province: customer.province,
                                      businessSector: customer.businessSector,
                                      expectedProducts: customer.expectedProducts,
                                      assignedSaleName: assignedSale?.displayName || customer.createdBy
                                    }}
                                    auditModule="crm"
                                    targetType="customer"
                                    targetId={customer.id}
                                    currentUser={currentUser}
                                    canRecord={
                                      currentUser.role === 'admin' ||
                                      (currentUser.role === 'sale' &&
                                        (!customer.assignedSaleId || customer.assignedSaleId === currentUser.uid))
                                    }
                                    onOpenDetails={() => onOpenCustomerDetails?.(customer.id)}
                                  />
                                </td>
                              )}
                              {salesVisibleColumnSet.has('email') && (
                                <td key="email">{customer.email || 'Chưa cập nhật'}</td>
                              )}
                              {salesVisibleColumnSet.has('sale') && (
                                <td key="sale">
                                  {assignedSale?.displayName || customer.createdBy || 'Chưa phân công'}
                                </td>
                              )}
                              {salesVisibleColumnSet.has('count') && (
                                <td key="count">{customerOrders.length.toLocaleString('vi-VN')}</td>
                              )}
                              {salesVisibleColumnSet.has('latest') && (
                                <td key="latest">
                                  {latestPO ? formatDate(latestPO.orderDate || latestPO.createdAt, 'vi-VN') : '—'}
                                </td>
                              )}
                              {salesVisibleColumnSet.has('value') && (
                                <td key="value">{totalValue.toLocaleString('vi-VN')} đ</td>
                              )}
                              {salesVisibleColumnSet.has('status') && (
                                <td key="status">
                                  {latestPO ? (
                                    <span
                                      className={`sales-status-label sales-status-label--${getPOQueueStatus(latestPO)}`}
                                    >
                                      {getPOQueueLabel(latestPO)}
                                    </span>
                                  ) : (
                                    'Chưa có đơn hàng'
                                  )}
                                </td>
                              )}
                              <td key="actions">
                                <RowActionMenu
                                  label={`Thao tác ${customer.companyName}`}
                                  actions={[
                                    {
                                      label: 'Xem đơn hàng',
                                      onSelect: () => {
                                        setSelectedOrderCustomerId(customer.id);
                                        setSearchTerm('');
                                      }
                                    }
                                  ]}
                                />
                              </td>
                            </ReorderableTableCells>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="table-container waiting-customer-table erp-primary-data-table">
                <table data-resize-key="sales-waiting-customers-v2">
                  <thead>
                    <tr>
                      <th>Mã khách hàng</th>
                      <th>Công ty</th>
                      <th>Người liên hệ</th>
                      <th>Số điện thoại</th>
                      <th>Sale phụ trách</th>
                      <th>Ngày tạo</th>
                      <th>Số ngày chờ</th>
                      <th>Hạng khách hàng</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingCustomerPagination.rows.map(customer => {
                      const assignedSale = users.find(
                        user => user.uid === customer.assignedSaleId || (user as any).id === customer.assignedSaleId
                      );
                      const waitingDays = getWaitingDays(customer.createdAt);
                      const createdDate = parseValidDate(customer.createdAt);
                      const hasValidCreatedDate = Boolean(createdDate);

                      return (
                        <tr key={customer.id}>
                          <td>
                            <span className="waiting-customer-code">{getCustomerCode(customer)}</span>
                          </td>
                          <td>
                            <strong className="waiting-customer-name">{customer.companyName || 'Chưa cung cấp'}</strong>
                            {customer.pendingOrderDraft && (
                              <span className="prepared-order-badge">Đã chuẩn bị thông tin đơn</span>
                            )}
                          </td>
                          <td>
                            <span>{customer.contactPerson || 'Chưa cung cấp'}</span>
                            {customer.email && <span className="waiting-customer-secondary">{customer.email}</span>}
                          </td>
                          <td>
                            <PhoneCallCell
                              phone={customer.phone}
                              companyName={customer.companyName}
                              subjectKey={customerCallSubjectKey(customer)}
                              historyKeys={customerCallHistoryKeys(customer, leads)}
                              context={{
                                contactPerson: customer.contactPerson,
                                contactPosition: customer.contactPosition,
                                province: customer.province,
                                businessSector: customer.businessSector,
                                expectedProducts: customer.expectedProducts
                              }}
                              auditModule="crm"
                              targetType="customer"
                              targetId={customer.id}
                              currentUser={currentUser}
                              canRecord={
                                currentUser.role === 'admin' ||
                                (currentUser.role === 'sale' &&
                                  (!customer.assignedSaleId || customer.assignedSaleId === currentUser.uid))
                              }
                              onOpenDetails={() => onOpenCustomerDetails?.(customer.id)}
                            />
                          </td>
                          <td>{assignedSale?.displayName || customer.createdBy || 'Chưa phân công'}</td>
                          <td>{hasValidCreatedDate ? formatDate(createdDate, 'vi-VN') : '—'}</td>
                          <td>
                            {waitingDays === null ? (
                              '—'
                            ) : (
                              <span className={`waiting-days-text ${waitingDays >= 7 ? 'is-overdue' : ''}`}>
                                {waitingDays} ngày
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`customer-rank-badge ${customer.customerRank ? 'has-rank' : ''}`}>
                              {customer.customerRank ? `Hạng ${customer.customerRank}` : 'Chưa xếp hạng'}
                            </span>
                          </td>
                          <td>
                            {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                              <RowActionMenu
                                label={`Thao tác ${customer.companyName}`}
                                actions={[
                                  {
                                    label: customer.pendingOrderDraft
                                      ? 'Phân công & phát hành đơn hàng'
                                      : 'Tạo đơn hàng',
                                    onSelect: () => handleOpenCreatePO(customer.id)
                                  }
                                ]}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <DataTablePagination
              {...(activeListView === 'waiting-customers'
                ? waitingCustomerPagination.paginationProps
                : selectedOrderCustomer
                  ? customerPoPagination.paginationProps
                  : orderCustomerPagination.paginationProps)}
            />
          </div>
        </>
      )}

      {/* PO DETAIL PANEL WITH QUEUE-BASED WORKFLOW */}
      {selectedPO && (
        <OrderDetailView
          po={selectedPO}
          customer={selectedPOCustomer}
          saleName={selectedPOSaleName}
          supplierNames={supplierNames}
          canViewFinancials={canViewSaleFinancials}
          canViewCosts={isFull}
          canManage={currentUser.role === 'admin' || currentUser.role === 'sale'}
          canDelete={canDeletePO}
          canEditSaleBrief={currentUser.role === 'admin' || currentUser.role === 'sale'}
          canEditDesignReply={currentUser.role === 'admin' || currentUser.role === 'designer'}
          checklistDraft={newChecklistText}
          onBack={() => setSelectedPO(null)}
          onPrint={() => setPrintPO(selectedPO)}
          onRepeat={() => handleOpenRepeatOrder(selectedPO)}
          onEdit={() => handleOpenEditModal(selectedPO)}
          onDelete={() => void handleDeletePO(selectedPO.id)}
          onOpenCustomer={
            onOpenCustomerDetails && selectedPO.customerId
              ? () => onOpenCustomerDetails(selectedPO.customerId)
              : undefined
          }
          onPreviewImage={setPreviewImage}
          onUpdateLineNotes={(itemIndex, field, value) => void handleUpdateItemNotes(itemIndex, field, value)}
          onUploadLineFiles={(itemIndex, field, files) => void handleUploadItemFiles(itemIndex, field, files)}
          onRemoveLineFile={(itemIndex, field, fileIndex) => void handleRemoveItemFile(itemIndex, field, fileIndex)}
          onChecklistDraftChange={setNewChecklistText}
          onAddChecklistItem={() => void handleAddChecklistItem()}
          onToggleChecklistItem={taskId => void handleToggleChecklistItem(taskId)}
          onRemoveChecklistItem={taskId => void handleRemoveChecklistItem(taskId)}
        />
      )}

      {/* FULLSCREEN PO FORM (CREATE & EDIT) */}
      {(showAddModal || showEditModal) && (
        <POFormFullScreen
          isOpen={showAddModal || showEditModal}
          onClose={() => {
            setShowAddModal(false);
            setShowEditModal(false);
            setRepeatSourcePO(null);
            setInitialCustomerId('');
            setSelectedPO(null);
          }}
          po={showEditModal ? selectedPO : null}
          templatePo={showAddModal ? repeatSourcePO : null}
          initialCustomerId={showAddModal ? initialCustomerId : ''}
          onSave={handleSavePO}
          customers={customers}
          suppliers={suppliers}
          users={users}
          currentUser={currentUser}
          onOpenCustomerDetails={onOpenCustomerDetails}
        />
      )}

      {selectedPO && !showEditModal && (
        <FloatingChat
          currentUser={currentUser}
          type="po"
          targetId={selectedPO.id}
          targetCode={selectedPO.poCode}
          messages={messages}
          users={users}
        />
      )}

      <TableColumnCustomizer
        open={showSalesColumnCustomizer}
        columns={SALES_CUSTOMER_COLUMNS}
        selectedIds={salesVisibleColumns}
        onClose={() => setShowSalesColumnCustomizer(false)}
        onSave={saveSalesVisibleColumns}
      />
      <DataFilterPanel
        open={showSalesFilters && activeListView === 'orders'}
        title="Lọc danh sách tạo đơn hàng"
        description="Lọc khách hàng theo trạng thái đơn hàng gần nhất và Sale phụ trách."
        activeCount={salesActiveFilterCount}
        onClose={() => setShowSalesFilters(false)}
        onReset={() => {
          setSalesStatusFilters([]);
          setSalesOwnerFilters([]);
        }}
      >
        <>
          <DataFilterSection
            title="Trạng thái đơn hàng gần nhất"
            selectedCount={salesStatusFilters.length}
            defaultExpanded
          >
            <DataFilterCheckboxGroup
              options={PO_QUEUE_STATES.map(status => ({ value: status.value, label: status.label }))}
              selectedValues={salesStatusFilters}
              onChange={setSalesStatusFilters}
            />
          </DataFilterSection>
          <DataFilterSection title="Sale phụ trách" selectedCount={salesOwnerFilters.length}>
            <DataFilterCheckboxGroup
              options={[
                { value: 'unassigned', label: 'Chưa phân công' },
                ...users
                  .filter(user => user.role === 'sale')
                  .map(user => ({ value: user.uid, label: user.displayName }))
              ]}
              selectedValues={salesOwnerFilters}
              onChange={setSalesOwnerFilters}
              searchable
            />
          </DataFilterSection>
        </>
      </DataFilterPanel>

      {/* Image Preview Zoom Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 1200 }}>
          <div
            className="modal-content"
            style={{ maxWidth: '90%', maxHeight: '90%', padding: '10px', position: 'relative' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '1.2rem', zIndex: 10 }}
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            <img
              src={previewImage}
              alt="Preview Zoom"
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
            />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <a
                href={previewImage}
                download
                onClick={event => {
                  event.currentTarget.download = `Preview_${Date.now()}.jpg`;
                }}
                className="btn btn-primary"
              >
                Tải Ảnh Về
              </a>
            </div>
          </div>
        </div>
      )}
      {printPO && (
        <PrintPreviewDialog
          title={`Xem bản in đơn hàng — ${String(printPO.poCode || '')}`}
          frameTitle="Đơn đặt hàng"
          html={orderSheetHtml(printPO)}
          onClose={() => setPrintPO(null)}
        />
      )}
    </div>
  );
};
