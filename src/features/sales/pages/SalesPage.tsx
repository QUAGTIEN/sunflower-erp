import React, { useState, useEffect } from 'react';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { useLanguage } from '@/context/LanguageContext';
import { FloatingChat } from '@/components/FloatingChat';
import POFormFullScreen from '@/features/sales/components/POFormFullScreen';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { ensureReceivableInvoice } from '@/features/sales/api/poWorkflowService';
import { syncDesignRequestsForPO } from '@/features/design/api/designRequestService';
import { synchronizeProcurementRequestsForPO } from '@/features/procurement/api/procurementService';
import { DesignRecord, DesignVersion } from '@/features/design/model/designWorkflow';
import {
  calculatePOItemFinancials,
  PODiscountType,
  withCalculatedPOFinancials
} from '@/domain/poFinancials';
import {
  getPOBadgeClass,
  getPOHistoryStatusLabel,
  getPOQueueLabel,
  getPOQueueStatus,
  getPOQueueUpdate,
  PO_QUEUE_STATES,
  POQueueStatus
} from '@/features/sales/model/poWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { formatDate, formatDateTime, parseValidDate } from '@/shared/utils/dateFormatting';
import type { CustomerRecord } from '@/features/crm/model/crmModels';
import '@/components/CustomerHistory.css';
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  Copy,
  Folder,
  FileText,
  Settings2,
} from 'lucide-react';

interface SalesProps {
  pos: any[];
  customers: CustomerRecord[];
  currentUser: UserProfile;
  onRefresh: () => void;
  initialSelectedPoId?: string;
  initialRepeatPoId?: string;
  initialPreparedCustomerId?: string;
  onRepeatOrderOpened?: () => void;
  onPreparedOrderOpened?: () => void;
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
  { id: 'count', label: 'Số PO', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'latest', label: 'PO gần nhất', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'value', label: 'Tổng giá trị', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'status', label: 'Trạng thái gần nhất', defaultVisible: true, group: 'Kết quả đơn hàng' },
  { id: 'actions', label: 'Thao tác', required: true, group: 'Điều khiển bảng' }
];

const getCustomerCode = (customer: any) => (
  customer.customerCode || customer.code || customer.id || ''
);

const getWaitingDays = (createdAt: unknown) => {
  if (typeof createdAt !== 'string') return null;
  const createdTime = Date.parse(createdAt);
  if (Number.isNaN(createdTime)) return null;
  return Math.max(0, Math.floor((Date.now() - createdTime) / (24 * 60 * 60 * 1000)));
};

export const Sales: React.FC<SalesProps> = ({ pos, customers, currentUser, onRefresh, initialSelectedPoId, initialRepeatPoId, initialPreparedCustomerId, onRepeatOrderOpened, onPreparedOrderOpened, messages, users }) => {
  const { t } = useLanguage();
  const isFull = currentUser.role === 'admin' || currentUser.role === 'accountant';
  const isSaleOnly = currentUser.role === 'sale' || currentUser.role === 'designer';
  const isPurchaseOnly = currentUser.role === 'purchaser';
  const canViewSaleFinancials = isFull || isSaleOnly;
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
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
  const [salesVisibleColumns, setSalesVisibleColumns] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(`sunflower:sales-customer-columns:${currentUser.uid}`);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed)) return Array.from(new Set(['customer', 'actions', ...parsed.filter((id): id is string => typeof id === 'string')]));
    } catch { /* Keep defaults when storage is unavailable. */ }
    return SALES_CUSTOMER_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id);
  });
  const salesVisibleColumnSet = new Set(salesVisibleColumns);
  const salesVisibleColumnCount = SALES_CUSTOMER_COLUMNS.filter(column => salesVisibleColumnSet.has(column.id)).length;
  const salesActiveFilterCount = salesStatusFilters.length + salesOwnerFilters.length;
  const saveSalesVisibleColumns = (selectedIds: string[]) => {
    const next = Array.from(new Set(['customer', 'actions', ...selectedIds]));
    setSalesVisibleColumns(next);
    try { window.localStorage.setItem(`sunflower:sales-customer-columns:${currentUser.uid}`, JSON.stringify(next)); } catch { /* State remains active. */ }
    setShowSalesColumnCustomizer(false);
  };

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

  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  const handleUpdateItemDiscount = async (
    itemIdx: number,
    update: { discountType?: PODiscountType; discountRate?: number; discountAmount?: number }
  ) => {
    if (!selectedPO) return;

    const updatedItems = selectedPO.items.map((item: any, idx: number) => {
      if (idx === itemIdx) {
        return withCalculatedPOFinancials({ ...item, ...update });
      }
      return item;
    });

    let totalBeforeVat = 0;
    let totalAfterVat = 0;
    let discountAmount = 0;

    updatedItems.forEach((item: any) => {
      const financials = calculatePOItemFinancials(item);
      totalBeforeVat += financials.amountBeforeVat;
      totalAfterVat += financials.amountWithVat;
      discountAmount += financials.discountAmount;
    });

    const updatedPO = {
      ...selectedPO,
      items: updatedItems,
      totalAmount: Math.round(totalBeforeVat),
      discountAmount: Math.round(discountAmount),
      netAmount: Math.round(totalAfterVat),
      updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
      updatedAt: new Date().toISOString()
    };

    await dbService.updateDocument('pos', selectedPO.id, {
      items: updatedItems,
      totalAmount: updatedPO.totalAmount,
      discountAmount: updatedPO.discountAmount,
      netAmount: updatedPO.netAmount,
      updatedBy: updatedPO.updatedBy,
      updatedAt: updatedPO.updatedAt
    });

    setSelectedPO(updatedPO);
    onRefresh();
  };

  const handleUpdateItemNotes = async (itemIdx: number, fieldName: 'saleNotes' | 'designNotes', value: string) => {
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

    await dbService.updateDocument('pos', selectedPO.id, {
      items: updatedItems,
      updatedBy: updatedPO.updatedBy,
      updatedAt: updatedPO.updatedAt
    });

    setSelectedPO(updatedPO);
  };

  const handleUploadItemFiles = async (itemIdx: number, fieldName: 'saleLayouts' | 'designLayouts', files: FileList | null) => {
    if (!selectedPO || !files) return;

    const base64Promises = Array.from(files).map((file) => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
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

      await dbService.updateDocument('pos', selectedPO.id, {
        items: updatedItems,
        updatedBy: updatedPO.updatedBy,
        updatedAt: updatedPO.updatedAt
      });

      setSelectedPO(updatedPO);
    } catch (err) {
      console.error(err);
      alert(t('Lỗi khi tải file lên.'));
    }
  };

  const handleRemoveItemFile = async (itemIdx: number, fieldName: 'saleLayouts' | 'designLayouts', fileIdx: number) => {
    if (!selectedPO) return;

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

    await dbService.updateDocument('pos', selectedPO.id, {
      items: updatedItems,
      updatedBy: updatedPO.updatedBy,
      updatedAt: updatedPO.updatedAt
    });

    setSelectedPO(updatedPO);
  };

  const handleAddChecklistItem = async () => {
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

    await dbService.updateDocument('pos', selectedPO.id, {
      internalChecklist: updatedChecklist
    });

    setSelectedPO(updatedPO);
    setNewChecklistText('');
    onRefresh();
  };

  const handleToggleChecklistItem = async (taskId: string) => {
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

    await dbService.updateDocument('pos', selectedPO.id, {
      internalChecklist: updatedChecklist
    });

    setSelectedPO(updatedPO);
    onRefresh();
  };

  const handleRemoveChecklistItem = async (taskId: string) => {
    if (!selectedPO) return;

    const updatedChecklist = (selectedPO.internalChecklist || []).filter((item: any) => item.id !== taskId);

    const updatedPO = {
      ...selectedPO,
      internalChecklist: updatedChecklist
    };

    await dbService.updateDocument('pos', selectedPO.id, {
      internalChecklist: updatedChecklist
    });

    setSelectedPO(updatedPO);
    onRefresh();
  };

  const handleOpenEditModal = (po: any) => {
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
    const password = window.prompt(t('Nhập mật khẩu xác nhận xóa (Giám Đốc/Admin):'));
    if (password === 'admin123' || password === '123456') {
      await dbService.updateDocument('pos', poId, {
        deleted: true,
        updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
        updatedAt: new Date().toISOString()
      });
      setSelectedPO(null);
      onRefresh();
      alert(t('Đã chuyển đơn hàng PO vào Kho Rác.'));
    } else if (password !== null) {
      alert(t('Mật khẩu không chính xác. Xóa thất bại.'));
    }
  };

  const handleSavePO = async (poData: any) => {
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
          note: `${t('Chỉnh sửa thông số đơn hàng PO')} (Tổng trị giá: ${subtotal.toLocaleString()} đ)`
        }
      ];

      await dbService.updateDocument('pos', poData.id, {
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
      });
      await syncDesignRequestsForPO({
        ...selectedPO,
        ...poData,
        id: poData.id,
        items: poData.items,
        assignments: poData.assignments || []
      }, currentUser);
      await synchronizeProcurementRequestsForPO({
        ...selectedPO,
        ...poData,
        id: poData.id,
        items: poData.items
      }, currentUser);

      setShowEditModal(false);
      setSelectedPO(null);
    } else {
      // Creating new PO
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = `PO-${yyyy}${mm}-`;

      const monthPOs = pos.filter(p => p.poCode && p.poCode.startsWith(prefix));
      let maxSeq = 0;
      monthPOs.forEach(p => {
        const parts = p.poCode.split('-');
        if (parts.length === 3) {
          const seq = parseInt(parts[2], 10);
          if (!isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      });
      const nextSeq = String(maxSeq + 1).padStart(4, '0');
      const poCode = `${prefix}${nextSeq}`;

      const reusableDesignByItemIndex = new Map<number, { design: DesignRecord; version: DesignVersion }>();
      if (poData.repeatSourcePoId && poData.designReuseRequested) {
        const sourcePO = pos.find(candidate => candidate.id === poData.repeatSourcePoId);
        const designList = (await dbService.getCollection('designs')) as DesignRecord[];
        const approvedSourceDesigns = designList.filter(design => (
          design.poId === poData.repeatSourcePoId && design.status === 'approved'
        ));

        poData.items.forEach((item: any, itemIndex: number) => {
          const matchedSourceItemIndex = (sourcePO?.items || []).findIndex((sourceItem: any) => (
            item.sourceItemId && sourceItem.itemId === item.sourceItemId
          ));
          const sourceItemIndex = matchedSourceItemIndex >= 0 ? matchedSourceItemIndex : itemIndex;
          const sourceItemId = item.sourceItemId || sourcePO?.items?.[sourceItemIndex]?.itemId;
          const design = approvedSourceDesigns.find(candidate => (
            (sourceItemId && candidate.itemId === sourceItemId)
            || candidate.itemIndex === sourceItemIndex
            || (!candidate.itemId && candidate.itemIndex === undefined && sourceItemIndex === 0)
          ));
          if (!design) return;
          const version = design.versions?.find(candidate => candidate.versionNumber === design.currentVersion)
            || design.versions?.[design.versions.length - 1]
            || (design.fileUrl ? {
              versionNumber: design.currentVersion || 1,
              previewImage: design.fileUrl,
              aiLink: design.aiLink || '',
              corelLink: design.corelLink || '',
              comment: design.notes || '',
              createdAt: design.updatedAt || design.createdAt || ''
            } : null);
          if (version?.previewImage) reusableDesignByItemIndex.set(itemIndex, { design, version });
        });
      }

      const initialStatus: POQueueStatus = 'waiting_design';
      const newItems = poData.items.map((item: any, index: number) => {
        const reusable = reusableDesignByItemIndex.get(index);
        return reusable ? {
            ...item,
            previewImage: reusable.version.previewImage || item.previewImage || '',
            previewImages: reusable.version.previewImage
              ? Array.from(new Set([reusable.version.previewImage, ...(item.previewImages || [])]))
              : (item.previewImages || []),
            designReuseStatus: 'pending_verification'
          }
          : { ...item, designReuseStatus: '' };
      });
      const reusedItemCount = reusableDesignByItemIndex.size;
      const allItemsReused = newItems.length > 0 && reusedItemCount === newItems.length;

      const newPO = {
        poCode,
        customerPoCode: poData.customerPoCode || poCode,
        customerId: poData.customerId,
        customerName: poData.customerName,
        customerRank: poData.customerRank,
        customerSnapshot: poData.customerSnapshot,
        saleId: currentUser.uid,
        orderDate: new Date().toISOString(),
        expectedDeliveryDate: poData.expectedDeliveryDate,
        status: initialStatus,
        workflowVersion: 2,
        designProgress: allItemsReused ? 'customer_approval_pending' : reusedItemCount > 0 ? 'in_progress' : 'request_pending',
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
        designReuseStatus: allItemsReused ? 'pending_verification' : reusedItemCount > 0 ? 'partially_reused' : (poData.designReuseRequested ? 'source_not_approved' : ''),
        createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
        createdAt: new Date().toISOString(),
        updatedBy: '',
        updatedAt: '',
        historyLogs: [
          {
            status: initialStatus,
            updatedBy: currentUser.displayName,
            updatedAt: new Date().toISOString(),
            note: reusedItemCount > 0
              ? `Tạo đơn đặt lại từ ${poData.repeatSourcePoCode}. Đã kế thừa ${reusedItemCount}/${newItems.length} mẫu thiết kế đã duyệt; từng mặt hàng được chuyển sang bước phù hợp.`
              : poData.repeatSourcePoCode
                ? `Tạo đơn đặt lại từ ${poData.repeatSourcePoCode}. Đã kế thừa thông số; chưa tìm thấy mẫu thiết kế đã duyệt để tự động sử dụng.`
                : 'Khởi tạo đơn hàng mới trên ERP'
          }
        ]
      };

      const createdPO = await dbService.addDocument('pos', newPO);
      await synchronizeProcurementRequestsForPO({ ...newPO, id: createdPO.id }, currentUser);
      const createdDesignRequests = await syncDesignRequestsForPO({
        ...newPO,
        id: createdPO.id
      }, currentUser);
      for (const [itemIndex, reusable] of reusableDesignByItemIndex.entries()) {
        const request = createdDesignRequests.find(candidate => candidate.itemIndex === itemIndex);
        if (!request) continue;
        const reusedVersion = {
          ...reusable.version,
          versionNumber: 1,
          comment: `Tái sử dụng từ ${poData.repeatSourcePoCode} - mẫu v${reusable.version.versionNumber}. ${reusable.version.comment || ''}`.trim(),
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
      await dbService.updateDocument('customers', poData.customerId, {
        lastOrderAt: new Date().toISOString(),
        customerRank: poData.customerRank,
        pendingOrderDraft: null
      });

      setShowAddModal(false);
      setRepeatSourcePO(null);
      setInitialCustomerId('');
      setActiveListView('orders');
    }

    if (poData.id) {
      await dbService.updateDocument('customers', poData.customerId, {
        customerRank: poData.customerRank
      });
    }

    onRefresh();
  };

  const updatePOStatus = async (poId: string, newStatus: POQueueStatus) => {
    const po = pos.find(p => p.id === poId);
    if (!po) return;

    const updatedLogs = [
      ...(po.historyLogs || []),
      {
        status: newStatus,
        updatedBy: currentUser.displayName,
        updatedAt: new Date().toISOString(),
        note: `Cập nhật hàng đợi đơn hàng sang: ${getPOQueueLabel(newStatus)}`
      }
    ];

    const queueExtras = newStatus === 'waiting_delivery'
      ? { deliveryStage: po.deliveryStage || 'customer_outbound' }
      : {};

    await dbService.updateDocument('pos', poId, {
      ...getPOQueueUpdate(newStatus, queueExtras),
      historyLogs: updatedLogs
    });

    // Entering the receivable queue means the sales invoice has been issued.
    // Create a receivable only when none exists, preventing duplicate invoices.
    if (newStatus === 'waiting_receivable') {
      await ensureReceivableInvoice(po, `${currentUser.displayName} (${currentUser.role.toUpperCase()})`);
    }

    setSelectedPO((prev: any) => prev ? {
      ...prev,
      ...getPOQueueUpdate(newStatus, queueExtras),
      historyLogs: updatedLogs
    } : null);
    onRefresh();
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
  const getCustomerPOs = (customer: CustomerRecord) => sortNewestFirst(
    visiblePOs.filter(po => (
      po.customerId === customer.id
      || (!po.customerId && po.customerName === customer.companyName)
    )),
    po => [po.createdAt, po.orderDate]
  );
  const selectedOrderCustomer = accessibleCustomers.find(customer => customer.id === selectedOrderCustomerId) || null;
  const customerPOs = selectedOrderCustomer ? getCustomerPOs(selectedOrderCustomer) : [];
  const filteredPOs = customerPOs.filter(po => (
    !normalizedSearchTerm
    || String(po.poCode || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm)
    || String(po.customerPoCode || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm)
    || String(po.createdBy || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm)
    || (Array.isArray(po.items) && po.items.some((item: any) => (
      String(item.productName || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm)
    )))
  ));
  const orderCustomers = accessibleCustomers
    .filter(customer => {
      const latestPO = getCustomerPOs(customer)[0];
      if (salesOwnerFilters.length > 0 && !salesOwnerFilters.includes(customer.assignedSaleId || 'unassigned')) return false;
      if (salesStatusFilters.length > 0) {
        const latestStatus = latestPO ? getPOQueueStatus(latestPO) : 'without_po';
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
      ].some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm));
    })
    .sort((left, right) => {
      const leftLatest = getCustomerPOs(left)[0];
      const rightLatest = getCustomerPOs(right)[0];
      const leftTime = parseValidDate(leftLatest?.createdAt || leftLatest?.orderDate)?.getTime() || 0;
      const rightTime = parseValidDate(rightLatest?.createdAt || rightLatest?.orderDate)?.getTime() || 0;
      return rightTime - leftTime || left.companyName.localeCompare(right.companyName, 'vi-VN');
    });

  const customerIdsWithOrders = new Set(
    activePOs.map(po => po.customerId).filter(Boolean)
  );
  const waitingCustomers = sortNewestFirst(customers
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
      ].some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(normalizedSearchTerm));
    }), customer => [customer.createdAt]);

  const waitingCustomerCount = customers.filter(customer => {
    if (customer.deleted === true || customerIdsWithOrders.has(customer.id)) return false;
    return currentUser.role !== 'sale' || !customer.assignedSaleId || customer.assignedSaleId === currentUser.uid;
  }).length;

  const selectedPOTotalWithVat = selectedPO?.items?.length
    ? selectedPO.items.reduce((total: number, item: any) => (
        total + calculatePOItemFinancials(item).amountWithVat
      ), 0)
    : Number(selectedPO?.netAmount || 0);

  return (
    <div className="sales-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageContextHeader section={t('Tạo đơn hàng')} current={!selectedPO ? (selectedOrderCustomer?.companyName || (activeListView === 'waiting-customers' ? t('Khách hàng chờ lên đơn') : t('Danh sách PO'))) : undefined} />

      {!selectedPO && (
        <>
          <div className="sales-list-tabs content-tabs" role="tablist" aria-label={t('Chọn danh sách Sale PO')}>
            <button
              type="button"
              className={`sales-list-tab ${activeListView === 'orders' ? 'is-active' : ''}`}
              onClick={() => { setActiveListView('orders'); setSelectedOrderCustomerId(''); setSearchTerm(''); }}
              role="tab"
              aria-selected={activeListView === 'orders'}
            >
              <FileText size={16} />
              <span>{t('Danh sách PO')}</span>
              <span className="sales-list-tab__count">{accessibleCustomers.length}</span>
            </button>
            <button
              type="button"
              className={`sales-list-tab ${activeListView === 'waiting-customers' ? 'is-active' : ''}`}
              onClick={() => { setActiveListView('waiting-customers'); setSelectedOrderCustomerId(''); setSearchTerm(''); }}
              role="tab"
              aria-selected={activeListView === 'waiting-customers'}
            >
              <Check size={16} />
              <span>{t('Khách hàng chờ lên đơn')}</span>
              <span className="sales-list-tab__count">{waitingCustomerCount}</span>
            </button>
          </div>

        <div className="card">

          {activeListView === 'waiting-customers' && (
            <div className="waiting-customer-intro">
              <div>
                <strong>{t('Khách hàng đã có hồ sơ nhưng chưa có PO')}</strong>
                <span>{t('Danh sách được tự động đối chiếu từ CRM và các PO hiện có. Khi lưu PO đầu tiên, khách hàng sẽ tự rời khỏi danh sách này.')}</span>
              </div>
              <span className="waiting-customer-intro__total">{waitingCustomerCount} {t('khách hàng')}</span>
            </div>
          )}

          {activeListView === 'orders' && selectedOrderCustomer && (
            <div className="sales-customer-po-header">
              <div>
                <PageBackButton onClick={() => { setSelectedOrderCustomerId(''); setSearchTerm(''); }} />
                <div>
                  <strong>{selectedOrderCustomer.companyName}</strong>
                  <span>{getCustomerCode(selectedOrderCustomer)} · {customerPOs.length} PO</span>
                </div>
              </div>
              {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                <button className="btn btn-primary" onClick={() => handleOpenCreatePO(selectedOrderCustomer.id)}>{t('Tạo PO mới')}</button>
              )}
            </div>
          )}

          <div className="sales-list-toolbar">
            <input
              type="text"
              placeholder={activeListView === 'orders'
                ? selectedOrderCustomer
                  ? t('Nhập mã PO, tên sản phẩm hoặc người tạo...')
                  : t('Tìm mã khách hàng, công ty, người liên hệ...')
                : t('Tìm mã khách hàng, công ty, người liên hệ...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1 }}
            />
            {activeListView === 'orders' && !selectedOrderCustomer && <>
              <DataFilterButton activeCount={salesActiveFilterCount} open={showSalesFilters} onClick={() => setShowSalesFilters(true)} />
              <button type="button" className="data-filter-button" onClick={() => setShowSalesColumnCustomizer(true)} title={t('Tùy chỉnh cột')} aria-label={t('Tùy chỉnh cột')}><Settings2 size={16} /></button>
            </>}
          </div>

          {activeListView === 'orders' && !selectedOrderCustomer && <DataFilterChipBar
            chips={[
              ...salesStatusFilters.map(value => ({ id: `status:${value}`, label: t(value === 'without_po' ? 'Chưa có PO' : PO_QUEUE_STATES.find(status => status.value === value)?.label || value), onRemove: () => setSalesStatusFilters(current => current.filter(item => item !== value)) })),
              ...salesOwnerFilters.map(value => ({ id: `owner:${value}`, label: value === 'unassigned' ? t('Chưa phân công') : users.find(user => user.uid === value)?.displayName || value, onRemove: () => setSalesOwnerFilters(current => current.filter(item => item !== value)) }))
            ]}
            onClear={() => { setSalesStatusFilters([]); setSalesOwnerFilters([]); }}
          />}

          {activeListView === 'orders' ? (
            selectedOrderCustomer ? (
              <div className="table-container customer-po-list-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Mã PO')}</th>
                      <th>{t('Ngày tạo')}</th>
                      <th>{t('Sản phẩm')}</th>
                      <th>{t('Tổng số lượng')}</th>
                      <th>{t('Thành tiền')}</th>
                      <th>{t('Ngày giao dự kiến')}</th>
                      <th>{t('Trạng thái')}</th>
                      <th>{t('Người tạo')}</th>
                      <th>{t('Cập nhật gần nhất')}</th>
                      <th>{t('Thao tác')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map(po => {
                      const items = Array.isArray(po.items) ? po.items : [];
                      const firstItem = items[0] || {};
                      const productSummary = firstItem.productName
                        ? `${firstItem.productName}${items.length > 1 ? ` +${items.length - 1} sản phẩm` : ''}`
                        : '—';
                      const totalQuantity = items.reduce((total: number, item: any) => total + Number(item.quantity || 0), 0);
                      return (
                        <tr key={po.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedPO(po)}>
                          <td style={{ fontWeight: 600 }}>
                            {po.poCode}
                            {po.customerPoCode && po.customerPoCode !== po.poCode && (
                              <span className="sales-table-secondary">({po.customerPoCode})</span>
                            )}
                          </td>
                          <td>{formatDate(po.orderDate || po.createdAt, t('vi-VN'))}</td>
                          <td title={items.map((item: any) => item.productName).filter(Boolean).join(', ')}>{productSummary}</td>
                          <td>{totalQuantity.toLocaleString('vi-VN')}</td>
                          <td>{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                          <td>{formatDate(po.expectedDeliveryDate, t('vi-VN'))}</td>
                          <td><span className={`badge ${getPOBadgeClass(po)}`}>{t(getPOQueueLabel(po))}</span></td>
                          <td>{po.createdBy || '—'}</td>
                          <td>{formatDateTime(po.updatedAt || po.createdAt, t('vi-VN'), '—')}</td>
                          <td>
                            <div className="customer-po-row-actions">
                              <button className="btn btn-sm btn-outline" onClick={(event) => { event.stopPropagation(); setSelectedPO(po); }}>{t('Chi tiết')}</button>
                              {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                                <button className="btn btn-sm btn-outline" onClick={(event) => { event.stopPropagation(); handleOpenRepeatOrder(po); }}>{t('Đặt lại')}</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPOs.length === 0 && (
                      <tr>
                        <td colSpan={10} className="sales-table-empty">
                          {normalizedSearchTerm ? t('Không tìm thấy PO phù hợp.') : t('Khách hàng chưa có PO. Bạn có thể tạo PO mới ngay tại đây.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="table-container sales-order-customer-table">
                <table className="has-dynamic-columns">
                  <thead>
                    <tr>
                      <th data-system-field="companyName">{t('Khách hàng')}</th>
                      {salesVisibleColumnSet.has('code') && <th>{t('Mã KH')}</th>}
                      {salesVisibleColumnSet.has('contact') && <th>{t('Người liên hệ')}</th>}
                      {salesVisibleColumnSet.has('phone') && <th>{t('Số điện thoại')}</th>}
                      {salesVisibleColumnSet.has('email') && <th>{t('Email')}</th>}
                      {salesVisibleColumnSet.has('sale') && <th>{t('Sale phụ trách')}</th>}
                      {salesVisibleColumnSet.has('count') && <th>{t('Số PO')}</th>}
                      {salesVisibleColumnSet.has('latest') && <th>{t('PO gần nhất')}</th>}
                      {salesVisibleColumnSet.has('value') && <th>{t('Tổng giá trị')}</th>}
                      {salesVisibleColumnSet.has('status') && <th>{t('Trạng thái gần nhất')}</th>}
                      <th>{t('Thao tác')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderCustomers.map(customer => {
                      const customerOrders = getCustomerPOs(customer);
                      const latestPO = customerOrders[0];
                      const totalValue = customerOrders.reduce((total, po) => total + Number(po.netAmount || po.totalAmount || 0), 0);
                      const assignedSale = users.find(user => user.uid === customer.assignedSaleId || (user as any).id === customer.assignedSaleId);
                      return (
                        <tr key={customer.id} className="sales-customer-row" onClick={() => { setSelectedOrderCustomerId(customer.id); setSearchTerm(''); }}>
                          <td><strong className="erp-company-name" title={customer.companyName}>{customer.companyName}</strong></td>
                          {salesVisibleColumnSet.has('code') && <td><span className="customer-code-badge">{getCustomerCode(customer)}</span></td>}
                          {salesVisibleColumnSet.has('contact') && <td><strong>{customer.contactPerson || t('Chưa cập nhật')}</strong></td>}
                          {salesVisibleColumnSet.has('phone') && <td>{customer.phone || t('Chưa cập nhật')}</td>}
                          {salesVisibleColumnSet.has('email') && <td>{customer.email || t('Chưa cập nhật')}</td>}
                          {salesVisibleColumnSet.has('sale') && <td>{assignedSale?.displayName || customer.createdBy || t('Chưa phân công')}</td>}
                          {salesVisibleColumnSet.has('count') && <td>{customerOrders.length.toLocaleString('vi-VN')}</td>}
                          {salesVisibleColumnSet.has('latest') && <td>{latestPO ? formatDate(latestPO.orderDate || latestPO.createdAt, t('vi-VN')) : '—'}</td>}
                          {salesVisibleColumnSet.has('value') && <td>{totalValue.toLocaleString('vi-VN')} đ</td>}
                          {salesVisibleColumnSet.has('status') && <td>{latestPO ? <span className={`sales-status-label sales-status-label--${getPOQueueStatus(latestPO)}`}>{t(getPOQueueLabel(latestPO))}</span> : t('Chưa có PO')}</td>}
                          <td><button className="btn btn-sm btn-outline" onClick={(event) => { event.stopPropagation(); setSelectedOrderCustomerId(customer.id); setSearchTerm(''); }}>{t('Xem PO')}</button></td>
                        </tr>
                      );
                    })}
                    {orderCustomers.length === 0 && (
                      <tr><td colSpan={salesVisibleColumnCount} className="sales-table-empty">{t('Không tìm thấy khách hàng phù hợp.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="table-container waiting-customer-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('Mã khách hàng')}</th>
                    <th>{t('Tên Công Ty')}</th>
                    <th>{t('Người Liên Hệ')}</th>
                    <th>{t('Sale phụ trách')}</th>
                    <th>{t('Ngày tạo')}</th>
                    <th>{t('Số ngày chờ')}</th>
                    <th>{t('Hạng Khách Hàng')}</th>
                    <th>{t('Thao Tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {waitingCustomers.map(customer => {
                    const assignedSale = users.find(user => (
                      user.uid === customer.assignedSaleId || (user as any).id === customer.assignedSaleId
                    ));
                    const waitingDays = getWaitingDays(customer.createdAt);
                    const createdDate = parseValidDate(customer.createdAt);
                    const hasValidCreatedDate = Boolean(createdDate);

                    return (
                      <tr key={customer.id}>
                        <td><span className="customer-code-badge">{getCustomerCode(customer)}</span></td>
                        <td>
                          <strong className="waiting-customer-name">{customer.companyName || t('Chưa cung cấp')}</strong>
                          {customer.phone && <span className="waiting-customer-secondary">{customer.phone}</span>}
                          {customer.pendingOrderDraft && (
                            <span className="prepared-order-badge">Đã chuẩn bị thông tin đơn</span>
                          )}
                        </td>
                        <td>
                          <span>{customer.contactPerson || t('Chưa cung cấp')}</span>
                          {customer.email && <span className="waiting-customer-secondary">{customer.email}</span>}
                        </td>
                        <td>{assignedSale?.displayName || customer.createdBy || t('Chưa phân công')}</td>
                        <td>{hasValidCreatedDate ? formatDate(createdDate, t('vi-VN')) : '—'}</td>
                        <td>
                          {waitingDays === null
                            ? '—'
                            : <span className={`waiting-days-badge ${waitingDays >= 7 ? 'is-overdue' : ''}`}>{waitingDays} {t('ngày')}</span>}
                        </td>
                        <td>
                          <span className={`customer-rank-badge ${customer.customerRank ? 'has-rank' : ''}`}>
                            {customer.customerRank ? `${t('Hạng')} ${customer.customerRank}` : t('Chưa xếp hạng')}
                          </span>
                        </td>
                        <td>
                          {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                            <button className="btn btn-sm btn-primary waiting-customer-action" onClick={() => handleOpenCreatePO(customer.id)}>
                              <Plus size={14} />
                              <span>{customer.pendingOrderDraft ? 'Phân công & phát hành PO' : t('Tạo PO')}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {waitingCustomers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="waiting-customer-empty">
                        {normalizedSearchTerm
                          ? t('Không tìm thấy khách hàng chờ lên đơn phù hợp.')
                          : t('Không có khách hàng nào đang chờ lên đơn.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
      )}

      {/* PO DETAIL PANEL WITH QUEUE-BASED WORKFLOW */}
      {selectedPO && (
        <div className="details-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <div className="card-header app-detail-header">
              <PageBackButton onClick={() => setSelectedPO(null)} />
              <span className="card-title" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>
                {t('CHI TIẾT TIẾN ĐỘ PO')}: {selectedPO.poCode} - {selectedPO.customerName}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                  <>
                    <button className="btn btn-sm btn-outline repeat-order-button" onClick={() => handleOpenRepeatOrder(selectedPO)} title="Tạo PO mới từ đơn này">
                      <Copy size={14} />
                      <span>Đặt lại từ PO này</span>
                    </button>
                    <button className="btn btn-sm btn-primary btn-symbol-sm" onClick={() => handleOpenEditModal(selectedPO)} title={t('Sửa')}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn btn-sm btn-danger btn-symbol-sm" onClick={() => handleDeletePO(selectedPO.id)} title={t('Xóa')}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="po-detail-meta-bar">
              <span>{t('Hạng Khách Hàng')}</span>
              <strong className="po-customer-rank-badge">
                {selectedPO.customerRank || customers.find(customer => customer.id === selectedPO.customerId)?.customerRank || t('Chưa xếp hạng')}
              </strong>
              <span className="po-kpi-definition">{t('KPI PO là tỷ lệ giá trị còn lại sau chiết khấu.')}</span>
            </div>

            {/* Status changer for authorized roles */}
            {(currentUser.role === 'admin' || currentUser.role === 'sale' || currentUser.role === 'producer') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                <span style={{ fontWeight: 600 }}>{t('Cập nhật nhanh tiến độ PO:')}</span>
                <select
                  value={getPOQueueStatus(selectedPO)}
                  onChange={(e) => updatePOStatus(selectedPO.id, e.target.value as POQueueStatus)}
                  style={{ width: '220px' }}
                >
                  {PO_QUEUE_STATES.map(state => (
                    <option key={state.value} value={state.value}>{t(state.label)}</option>
                  ))}
                </select>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{t('* Sẽ tự động ghi lại nhật ký xử lý đơn')}</span>
              </div>
            )}

            {/* HORIZONTAL TIMELINE DISPLAY (QUEUE STATES) */}
            <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
              <div className="order-progress-timeline" style={{ minWidth: '760px' }}>
                {PO_QUEUE_STATES.map((state, idx) => {
                  const currentIdx = PO_QUEUE_STATES.findIndex(s => s.value === getPOQueueStatus(selectedPO));
                  const isCompleted = idx < currentIdx;
                  const isActive = idx === currentIdx;

                  return (
                    <div
                      key={state.value}
                      className={`timeline-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}
                    >
                      <div className="step-bubble">
                        {isCompleted ? <Check size={12} strokeWidth={3} /> : idx + 1}
                      </div>
                      <span className="step-label">{t(state.label)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="details-grid po-sale-detail-layout" style={{ gridTemplateColumns: '1fr' }}>
              {/* Product specifications and mock preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="po-sale-items-card" style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--color-primary)' }}>{t('Chi Tiết Các Mặt Hàng Trong PO:')}</h3>
                  <div className="po-inline-grid-container">
                    <table className="po-inline-grid po-items-overview-table po-sale-items-table">
                      <thead>
                        <tr>
                          <th>STT</th>
                          <th>{t('Mã hàng')}</th>
                          <th>{t('Tên hàng')}</th>
                          <th>{t('Quy cách / Chất liệu')}</th>
                          <th>{t('ĐVT')}</th>
                          <th>{t('Số lượng')}</th>
                          <th>{t('Đơn giá')}</th>
                          <th>{t('Nhà cung cấp')}</th>
                          <th>{t('Thuế (%)')}</th>
                          <th>{t('Chiết khấu')}</th>
                          <th>{t('Thành tiền (gồm VAT)')}</th>
                          <th>{t('KPI PO')}</th>
                          <th>{t('File liên quan')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPO.items?.map((item: any, idx: number) => {
                          const financials = calculatePOItemFinancials(item);
                          const buyingTotal = financials.quantity * (Number(item.purchasePrice) || 0);
                          const profit = financials.amountBeforeVat - buyingTotal;
                          const supplierLabel = item.supplierName
                            || suppliers.find(supplier => supplier.id === item.supplierId)?.supplierName
                            || t('Chưa chọn');
                          const itemId = item.itemId || `${idx}`;
                          const layoutImages = Array.from(new Set([
                            ...(Array.isArray(item.previewImages) ? item.previewImages : []),
                            ...(item.previewImage ? [item.previewImage] : []),
                            ...(Array.isArray(item.designLayouts) ? item.designLayouts : []),
                            ...(Array.isArray(item.saleLayouts) ? item.saleLayouts : [])
                          ].filter((image): image is string => typeof image === 'string' && image.length > 0)));

                          return (
                            <React.Fragment key={itemId}>
                              <tr>
                                <td className="po-readonly-index">
                                  <strong>{idx + 1}</strong>
                                  <button
                                    type="button"
                                    className={`po-detail-toggle ${expandedItemIds.includes(itemId) ? 'is-active' : ''}`}
                                    onClick={() => {
                                      if (expandedItemIds.includes(itemId)) {
                                        setExpandedItemIds(expandedItemIds.filter(id => id !== itemId));
                                      } else {
                                        setExpandedItemIds([...expandedItemIds, itemId]);
                                      }
                                    }}
                                    title={expandedItemIds.includes(itemId) ? t('Ẩn chi tiết') : t('Mở chi tiết')}
                                    aria-expanded={expandedItemIds.includes(itemId)}
                                  >
                                    {expandedItemIds.includes(itemId) ? t('Ẩn') : t('Xem')}
                                  </button>
                                </td>
                                <td style={{ fontWeight: 600 }}>{item.productCode || 'N/A'}</td>
                                <td>{item.productName}</td>
                                <td>
                                  <div className="po-item-spec-readonly">
                                    <span>{item.size || '—'}</span>
                                    <small>{item.material || '—'}</small>
                                  </div>
                                </td>
                                <td>{item.unit || 'cái'}</td>
                                <td style={{ textAlign: 'right' }}>{financials.quantity.toLocaleString()}</td>
                                <td style={{ textAlign: 'right' }}>{canViewSaleFinancials ? `${financials.unitPrice.toLocaleString()} đ` : '—'}</td>
                                <td><span className="po-supplier-name" title={supplierLabel}>{supplierLabel}</span></td>
                                <td style={{ textAlign: 'right' }}>{canViewSaleFinancials ? `${financials.vatRate}%` : '—'}</td>
                                <td>
                                  {(currentUser.role === 'admin' || currentUser.role === 'sale') ? (
                                    <div className="po-discount-editor po-discount-editor-readonly">
                                      <select
                                        value={financials.discountType}
                                        title={financials.discountType === 'amount' ? t('Tiền chênh (VNĐ)') : t('Theo phần trăm')}
                                        aria-label={t('Hình thức chiết khấu')}
                                        onChange={(e) => handleUpdateItemDiscount(idx, {
                                          discountType: e.target.value === 'amount' ? 'amount' : 'percent'
                                        })}
                                        className="po-discount-mode"
                                      >
                                        <option value="percent">%</option>
                                        <option value="amount">{t('Tiền chênh')}</option>
                                      </select>
                                      <input
                                        type="number"
                                        min="0"
                                        max={financials.discountType === 'percent' ? 100 : (financials.grossAmount || undefined)}
                                        value={financials.discountType === 'amount' ? financials.discountAmount : financials.discountRate}
                                        onChange={(e) => handleUpdateItemDiscount(idx, financials.discountType === 'amount'
                                          ? { discountAmount: Number(e.target.value) }
                                          : { discountRate: Number(e.target.value) }
                                        )}
                                        className="po-discount-input"
                                      />
                                    </div>
                                  ) : canViewSaleFinancials ? (
                                    financials.discountType === 'amount'
                                      ? `${Math.round(financials.discountAmount).toLocaleString()} đ`
                                      : `${financials.discountRate}%`
                                  ) : '—'}
                                </td>
                                <td className="po-money-cell">
                                  {canViewSaleFinancials ? `${Math.round(financials.amountWithVat).toLocaleString()} đ` : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span className="po-kpi-badge" title={t('Tỷ lệ giá trị còn lại sau chiết khấu')}>
                                    {canViewSaleFinancials ? `${financials.kpiPo.toFixed(1)}%` : '—'}
                                  </span>
                                </td>
                                <td>
                                  <div className="po-layout-thumbnails">
                                    {layoutImages.slice(0, 5).map((image, imageIndex) => (
                                      <img
                                        key={`${imageIndex}-${image.slice(0, 24)}`}
                                        src={image}
                                        alt={`${t('Layout')} ${imageIndex + 1}`}
                                        onClick={() => setPreviewImage(image)}
                                      />
                                    ))}
                                    {layoutImages.length === 0 && <span className="po-empty-value">{t('Chưa có')}</span>}
                                  </div>
                                </td>
                              </tr>
                              {expandedItemIds.includes(itemId) && (
                                <tr style={{ backgroundColor: '#f8fafc' }}>
                                  <td colSpan={13} style={{ padding: '16px', borderBottom: '1px solid var(--color-border-light)' }}>
                                    {(isFull || isPurchaseOnly) && (
                                      <div className="po-commercial-summary">
                                        <div><span>{t('Nhà Cung Cấp')}</span><strong>{item.supplierName || t('Chưa phân bổ')}</strong></div>
                                        <div><span>{t('Đơn Giá Mua')}</span><strong>{(Number(item.purchasePrice) || 0).toLocaleString()} đ</strong></div>
                                        <div><span>{t('Thành Tiền Mua')}</span><strong>{Math.round(buyingTotal).toLocaleString()} đ</strong></div>
                                        {isFull && (
                                          <div><span>{t('Lợi Nhuận Gộp')}</span><strong className={profit >= 0 ? 'is-positive' : 'is-negative'}>{Math.round(profit).toLocaleString()} đ</strong></div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                      {/* SALE PANEL */}
                                      <div style={{ borderRight: '1px solid var(--color-border-light)', paddingRight: '20px' }}>
                                        <h4 style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>
                                          <span>📝</span> {t('Yêu Cầu & Tài Liệu Của Sale')}
                                        </h4>
                                        <div className="form-group" style={{ marginBottom: '12px' }}>
                                          <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px', fontSize: '12.5px' }}>{t('Yêu cầu thiết kế / Ghi chú:')}</label>
                                          {(currentUser.role === 'admin' || currentUser.role === 'sale') ? (
                                            <textarea
                                              className="form-control"
                                              style={{ width: '100%', minHeight: '60px', padding: '6px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                                              value={item.saleNotes || ''}
                                              onChange={(e) => handleUpdateItemNotes(idx, 'saleNotes', e.target.value)}
                                              placeholder={t('Nhập ghi chú yêu cầu thiết kế...')}
                                            />
                                          ) : (
                                            <div style={{ padding: '8px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '40px', fontSize: '13px' }}>
                                              {item.saleNotes || t('Không có ghi chú')}
                                            </div>
                                          )}
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '12px' }}>
                                          <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px', fontSize: '12.5px' }}>{t('Layout Sale Tải Lên (Hình ảnh/File):')}</label>
                                          {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                                            <input
                                              type="file"
                                              multiple
                                              accept="image/*"
                                              onChange={(e) => handleUploadItemFiles(idx, 'saleLayouts', e.target.files)}
                                              style={{ fontSize: '12px', marginBottom: '8px' }}
                                            />
                                          )}
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {(item.saleLayouts || []).map((fileUrl: string, fidx: number) => (
                                              <div key={fidx} style={{ position: 'relative', display: 'inline-block' }}>
                                                <img
                                                  src={fileUrl}
                                                  alt="Sale Layout"
                                                  style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'zoom-in' }}
                                                  onClick={() => setPreviewImage(fileUrl)}
                                                />
                                                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRemoveItemFile(idx, 'saleLayouts', fidx)}
                                                    style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                  >
                                                    ×
                                                  </button>
                                                )}
                                              </div>
                                            ))}
                                            {(!item.saleLayouts || item.saleLayouts.length === 0) && (
                                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{t('Chưa tải lên file/hình ảnh')}</span>
                                            )}
                                          </div>
                                        </div>

                                        {item.previewImage && (
                                          <div style={{ marginTop: '12px' }}>
                                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '4px', fontSize: '12.5px' }}>{t('Hình ảnh Layout Thiết kế cũ:')}</label>
                                            <img
                                              src={item.previewImage}
                                              alt="Old Layout"
                                              style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'zoom-in' }}
                                              onClick={() => setPreviewImage(item.previewImage)}
                                            />
                                          </div>
                                        )}
                                      </div>

                                      {/* DESIGNER PANEL */}
                                      <div>
                                        <h4 style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>
                                          <span>🎨</span> {t('Phản Hồi & File Thiết Kế Hoàn Thiện')}
                                        </h4>
                                        <div className="form-group" style={{ marginBottom: '12px' }}>
                                          <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px', fontSize: '12.5px' }}>{t('Trả yêu cầu TK / Ghi chú Thiết kế:')}</label>
                                          {(currentUser.role === 'admin' || currentUser.role === 'designer') ? (
                                            <textarea
                                              className="form-control"
                                              style={{ width: '100%', minHeight: '60px', padding: '6px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                                              value={item.designNotes || ''}
                                              onChange={(e) => handleUpdateItemNotes(idx, 'designNotes', e.target.value)}
                                              placeholder={t('Nhập phản hồi từ bộ phận thiết kế...')}
                                            />
                                          ) : (
                                            <div style={{ padding: '8px', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '40px', fontSize: '13px' }}>
                                              {item.designNotes || t('Chưa có phản hồi thiết kế')}
                                            </div>
                                          )}
                                        </div>

                                        <div className="form-group" style={{ marginBottom: '12px' }}>
                                          <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px', fontSize: '12.5px' }}>{t('File Thiết Kế Up (Hoàn thiện):')}</label>
                                          {(currentUser.role === 'admin' || currentUser.role === 'designer') && (
                                            <input
                                              type="file"
                                              multiple
                                              accept="image/*"
                                              onChange={(e) => handleUploadItemFiles(idx, 'designLayouts', e.target.files)}
                                              style={{ fontSize: '12px', marginBottom: '8px' }}
                                            />
                                          )}
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {(item.designLayouts || []).map((fileUrl: string, fidx: number) => (
                                              <div key={fidx} style={{ position: 'relative', display: 'inline-block' }}>
                                                <img
                                                  src={fileUrl}
                                                  alt="Design Layout"
                                                  style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'zoom-in' }}
                                                  onClick={() => setPreviewImage(fileUrl)}
                                                />
                                                {(currentUser.role === 'admin' || currentUser.role === 'designer') && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleRemoveItemFile(idx, 'designLayouts', fidx)}
                                                    style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'red', color: 'white', border: 'none', borderRadius: '50%', width: '16px', height: '16px', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                  >
                                                    ×
                                                  </button>
                                                )}
                                              </div>
                                            ))}
                                            {(!item.designLayouts || item.designLayouts.length === 0) && (
                                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>{t('Chưa có file thiết kế hoàn chỉnh')}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '12px', padding: '12px 0 0 0', borderTop: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>{t('Tổng giá trị đơn hàng (gồm VAT):')}</span>
                    <span className="po-order-total-value">{Math.round(selectedPOTotalWithVat).toLocaleString()} đ</span>
                  </div>
                </div>

                {/* File link manager */}
                <div style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--color-primary)' }}>{t('Tài Liệu Đính Kèm Đơn Hàng:')}</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {Object.entries(selectedPO.links || {}).map(([key, value]) => {
                      if (!value || typeof value !== 'string') return null;
                      const isImage = value.startsWith('data:image/');

                      const labels: { [key: string]: string } = {
                        pdfLink: t('PDF Đơn Hàng'),
                        excelLink: t('Excel Báo Giá'),
                        aiLink: t('Thiết Kế Gốc AI'),
                        corelLink: t('Thiết Kế Corel (.cdr)'),
                        contractLink: t('Hợp Đồng'),
                        quoteLink: t('Bản Báo Giá')
                      };
                      const label = labels[key] || key;

                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', border: '1px solid var(--color-border)', borderRadius: '4px', backgroundColor: 'var(--color-bg-light)' }}>
                          {isImage ? (
                            <img
                              src={value}
                              alt={label}
                              style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--color-border)' }}
                              onClick={() => setPreviewImage(value)}
                              title={t('Click để phóng to')}
                            />
                          ) : (
                            <span style={{ padding: '6px 8px', backgroundColor: '#e2e8f0', borderRadius: '4px', fontSize: '10px', fontWeight: 700, color: '#475569', border: '1px solid #cbd5e1' }}>DOC</span>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {isImage ? t('Hình ảnh (Base64)') : t('Tài liệu đính kèm')}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {isImage && (
                              <button type="button" className="btn btn-sm btn-outline" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => setPreviewImage(value)}>
                                {t('Xem')}
                              </button>
                            )}
                            <a href={value} download={`${label}_${selectedPO.poCode}`} className="btn btn-sm btn-primary" style={{ padding: '2px 8px', fontSize: '10px', textDecoration: 'none', textAlign: 'center' }}>
                              {t('Tải về')}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                    {!Object.values(selectedPO.links || {}).some(Boolean) && (
                      <span className="text-muted" style={{ gridColumn: 'span 2' }}>{t('Chưa có tài liệu đính kèm nào được tải lên.')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Design Preview and Activity Log */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px', textAlign: 'center' }}>
                  <h3 style={{ marginBottom: '12px', textAlign: 'left', color: 'var(--color-primary)' }}>{t('Hình Ảnh Nhãn Mẫu')}</h3>
                  {selectedPO.items[0]?.previewImage ? (
                    <img
                      src={selectedPO.items[0].previewImage}
                      alt="Ảnh mẫu tem nhãn"
                      style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                    />
                  ) : (
                    <div style={{ padding: '40px 0', color: 'var(--color-text-muted)', backgroundColor: '#f8fafc', border: '1px dashed var(--color-border)' }}>
                      {t('Không có ảnh mẫu Base64 nào được upload.')}
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--color-primary)' }}>✅ {t('MỤC PHẢN HỒI & TIẾN ĐỘ NỘI BỘ')}</h3>

                  {/* Add checklist item */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      type="text"
                      className="form-control"
                      style={{ flex: 1, padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      placeholder={t('Thêm phản hồi/tiến độ...')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddChecklistItem();
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={handleAddChecklistItem}
                    >
                      {t('Thêm')}
                    </button>
                  </div>

                  {/* Checklist List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                    {(selectedPO.internalChecklist || []).map((task: any) => (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          border: '1px solid var(--color-border-light)',
                          borderRadius: '4px',
                          backgroundColor: task.completed ? '#f0fdf4' : '#fff'
                        }}
                      >
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 'normal', fontSize: '13px', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={() => handleToggleChecklistItem(task.id)}
                          />
                          <span style={{ textDecoration: task.completed ? 'line-through' : 'none', color: task.completed ? '#16a34a' : 'inherit' }}>
                            {task.content}
                          </span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            {task.updatedBy?.split(' (')[0]}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveChecklistItem(task.id)}
                            style={{ background: 'transparent', border: 'none', color: 'red', cursor: 'pointer', fontSize: '12px' }}
                            title={t('Xóa')}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!selectedPO.internalChecklist || selectedPO.internalChecklist.length === 0) && (
                      <span style={{ fontSize: '12.5px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                        {t('Chưa có phản hồi/tiến độ công việc nào.')}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--color-primary)' }}>{t('LỊCH SỬ TRẠNG THÁI')}</h3>
                  <div className="timeline" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {(selectedPO.historyLogs || []).map((log: any, idx: number) => (
                      <div key={idx} className="timeline-item">
                        <div className="timeline-marker"></div>
                        <div className="timeline-content">
                          <span className="timeline-title">{t(getPOHistoryStatusLabel(log.status))}</span>
                          <span className="timeline-date">{formatDateTime(log.updatedAt, t('vi-VN'))} - {t('Nhân Sự Thực Hiện')}: {log.updatedBy}</span>
                          <span style={{ fontSize: '12px' }}>{log.note}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ border: '1px solid var(--color-border-light)', padding: '16px', borderRadius: '4px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>{t('Tạo bởi:')}</strong> {selectedPO.createdBy || t('Không xác định')} {selectedPO.createdAt && `(${formatDateTime(selectedPO.createdAt, t('vi-VN'))})`}</div>
                  <div><strong>{t('Cập nhật bởi:')}</strong> {selectedPO.updatedBy || t('Chưa cập nhật')} {selectedPO.updatedAt && `(${formatDateTime(selectedPO.updatedAt, t('vi-VN'))})`}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
          t={t}
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
        open={showSalesFilters}
        title={t('Lọc danh sách tạo đơn hàng')}
        description={t('Lọc khách hàng theo trạng thái PO gần nhất và Sale phụ trách.')}
        activeCount={salesActiveFilterCount}
        onClose={() => setShowSalesFilters(false)}
        onReset={() => { setSalesStatusFilters([]); setSalesOwnerFilters([]); }}
      >
        <DataFilterSection title={t('Trạng thái PO gần nhất')} selectedCount={salesStatusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={[{ value: 'without_po', label: t('Chưa có PO') }, ...PO_QUEUE_STATES.map(status => ({ value: status.value, label: t(status.label) }))]}
            selectedValues={salesStatusFilters}
            onChange={setSalesStatusFilters}
          />
        </DataFilterSection>
        <DataFilterSection title={t('Sale phụ trách')} selectedCount={salesOwnerFilters.length}>
          <DataFilterCheckboxGroup
            options={[{ value: 'unassigned', label: t('Chưa phân công') }, ...users.filter(user => user.role === 'sale').map(user => ({ value: user.uid, label: user.displayName }))]}
            selectedValues={salesOwnerFilters}
            onChange={setSalesOwnerFilters}
            searchable
          />
        </DataFilterSection>
      </DataFilterPanel>

      {/* Image Preview Zoom Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '90%', maxHeight: '90%', padding: '10px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button type="button" className="btn btn-sm btn-outline" style={{ position: 'absolute', top: '10px', right: '10px', fontSize: '1.2rem', zIndex: 10 }} onClick={() => setPreviewImage(null)}>×</button>
            <img src={previewImage} alt="Preview Zoom" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <a href={previewImage} download={`Preview_${Date.now()}.jpg`} className="btn btn-primary">{t('Tải Ảnh Về')}</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
