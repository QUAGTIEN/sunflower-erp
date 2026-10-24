import { usePartnerDebt } from '@/features/accounting/components/usePartnerDebt';
import { PartnerDebtNotice, PartnerDebtValue } from '@/features/accounting/components/PartnerDebtSummary';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import { SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/context/LanguageContext';
import { CustomerOverview } from '@/features/crm/components/CustomerOverview';
import { CustomerOnboardingItems } from '@/features/crm/components/CustomerOnboardingItems';
import { BusinessLocationFields } from '@/features/crm/components/BusinessLocationFields';
import { CustomerNoteEditor } from '@/features/crm/components/CustomerNoteEditor';
import { CustomerProductEditor } from '@/features/crm/components/CustomerProductEditor';
import { useCustomerListFilters } from '@/features/crm/hooks/useCustomerListFilters';
import { CustomerListFilterPanel } from '@/features/crm/components/CustomerListFilterPanel';
import { CustomerListTable } from '@/features/crm/components/CustomerListTable';
import { CustomerProductEditDialog } from '@/features/crm/components/CustomerProductEditDialog';
import { EditRequestCompareDialog } from '@/features/crm/components/EditRequestCompareDialog';
import { ImagePreviewDialog } from '@/components/ImagePreviewDialog';
import { CustomerContractDialog } from '@/features/crm/components/CustomerContractDialog';
import { updateCustomerProduct } from '@/features/crm/api/customerProductService';
import {
  canManageCustomerProducts,
  getCustomerProductCodes,
  getCustomerProductOrderHistory,
  getCustomerProductSize,
  getCustomerProductVersion,
  hasCustomerProductCode,
  normalizeProductCode,
  openCustomerProductAsset,
  CUSTOMER_PRODUCT_TYPES
} from '@/features/crm/model/customerProductCatalog';
import {
  customerNoteHtmlToText,
  plainTextToNoteHtml,
  sanitizeCustomerNoteHtml
} from '@/features/crm/model/customerNote';
import { DataFilterButton, DataFilterChipBar } from '@/components/DataWorkspaceFilters';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { RowActionMenu } from '@/components/RowActionMenu';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { customerCallHistoryKeys, customerCallSubjectKey } from '@/features/crm/model/callHistory';
import { SupportRequestDialog, type SupportRequestTarget } from '@/components/SupportRequestDialog';
import { WorkAssignmentDialog, type WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import { EntityCustomFieldsGrid, EntityCustomFieldsReadOnly } from '@/components/EntityCustomFields';
import { InlineEntityFieldManager } from '@/components/InlineEntityFieldManager';
import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { getMissingRequiredEntityFields, type EntityCustomFieldValues } from '@/features/crm/model/entityFieldConfig';
import { createCustomerOnboardingItem } from '@/features/crm/model/customerOnboardingItem';
import { getPOBadgeClass, getPOQueueLabel } from '@/features/sales/model/poWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { formatDate, formatDateTime, parseValidDate } from '@/shared/utils/dateFormatting';
import {
  normalizePendingOrderItem,
  type CustomerPendingOrderItem,
  type CustomerPendingOrderDraft,
  type CustomerProductRecord,
  type CustomerContactRecord,
  type CustomerRepositoryFolder,
  type CustomerRank,
  type CustomerRecord,
  type LeadRecord
} from '@/features/crm/model/crmModels';
import {
  createCustomerFolderId,
  DEFAULT_CUSTOMER_REPOSITORY_FOLDERS,
  getCustomerRepositoryFolders,
  resolveCustomerFileFolderId
} from '@/features/crm/model/customerRepository';
import { findTaxCodeConflict } from '@/features/crm/model/taxCodeUniqueness';
import {
  buildCustomerMaterialHistory,
  buildCustomerOrderedSampleHistory
} from '@/features/crm/model/customerMaterialHistory';
import { calculatePOItemFinancials, withCalculatedPOFinancials, type PODiscountType } from '@/domain/poFinancials';
import {
  mergeCustomerFilterDefinitions,
  type CustomerFilterDefinition
} from '@/features/crm/model/customerFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import '@/components/CustomerHistory.css';
import './CustomerDetailWorkspace.css';
import {
  CONTACT_ROLE_LABELS,
  DOCUMENT_REPOSITORY_FOLDER_IDS,
  createCopyableProfile,
  createNextCustomerCode,
  getProductAssetSource,
  loadSpecsToFields,
  normalizeFilterValue,
  type CrmListFilter,
  EMPTY_CONTRACT_DRAFT,
  type CustomerContractDraft
} from '@/features/crm/model/customerWorkspace';
import { copyTextToClipboard } from '@/shared/utils/clipboard';
import {
  Plus,
  Trash2,
  X,
  FileText,
  AlertCircle,
  Copy,
  Building2,
  Search,
  ShoppingBag,
  Users,
  MapPinned,
  Settings2
} from 'lucide-react';

interface CrmProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  pos: any[];
  invoices: any[];
  users: any[];
  currentUser: any;
  onRefresh: () => void;
  onRepeatOrder?: (poId: string) => void;
  onOpenPO?: (poId: string) => void;
  onPreparedOrderCreated?: (customerId: string) => void;
  initialLead?: LeadRecord | null;
  onLeadOnboardingClosed?: () => void;
  initialCustomerId?: string;
  onInitialCustomerOpened?: () => void;
}

export const Crm: React.FC<CrmProps> = ({
  customers,
  leads,
  pos,
  invoices,
  users,
  currentUser,
  onRefresh,
  onRepeatOrder,
  onOpenPO,
  onPreparedOrderCreated,
  initialLead = null,
  onLeadOnboardingClosed,
  initialCustomerId = '',
  onInitialCustomerOpened
}) => {
  const { t } = useLanguage();
  const finance = usePartnerDebt(currentUser);
  const { definitions: customFieldDefinitions } = useEntityFieldDefinitions('customers', currentUser.role);
  const inlineSystemFieldConfiguration = useSystemFieldConfiguration('customers');
  const [filterType, setFilterType] = useState<CrmListFilter>('overview');

  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [storedCustomerFilterDefinitions, setStoredCustomerFilterDefinitions] = useState<CustomerFilterDefinition[]>(
    []
  );
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [detailCallPhone, setDetailCallPhone] = useState('');
  const [supportTarget, setSupportTarget] = useState<SupportRequestTarget | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<WorkAssignmentTarget | null>(null);
  const [customerHistoryTab, setCustomerHistoryTab] = useState<'overview' | 'po' | 'products' | 'notes' | 'files'>(
    'overview'
  );
  const [repositoryPreviewFolder, setRepositoryPreviewFolder] = useState('');
  const [repositoryUploadOpen, setRepositoryUploadOpen] = useState(false);
  const [showProductEditor, setShowProductEditor] = useState(false);
  const [isCompanyInfoExpanded, setIsCompanyInfoExpanded] = useState(false);
  const [customerNoteDraft, setCustomerNoteDraft] = useState('');
  const [isSavingCustomerNote, setIsSavingCustomerNote] = useState(false);
  const [customerNoteFeedback, setCustomerNoteFeedback] = useState('');
  const {
    selectedIds: storedVisibleColumnIds,
    setSelectedIds: setStoredVisibleColumnIds,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'customers',
    legacySelectionKey: `sunflower:customer-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:customer-column-widths:${currentUser.uid}`
  });

  // File Repository states
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderForUpload, setSelectedFolderForUpload] = useState('contracts');
  const [activeRepositoryFolderId, setActiveRepositoryFolderId] = useState('contracts');
  const [renamingFolderId, setRenamingFolderId] = useState('');
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [repoUploadFile, setRepoUploadFile] = useState('');
  const [repoUploadFileName, setRepoUploadFileName] = useState('');
  const [repoUploadLink, setRepoUploadLink] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Dynamic categories and admin approvals states
  const [productClassifications, setProductClassifications] = useState<any[]>([]);
  const availableProductClassifications = [
    ...new Map([...CUSTOMER_PRODUCT_TYPES, ...productClassifications].map(type => [type.id, type])).values()
  ];
  const [windDirections, setWindDirections] = useState<any[]>([]);
  const [editRequests, setEditRequests] = useState<any[]>([]);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedEditRequest, setSelectedEditRequest] = useState<any | null>(null);

  const customerColumnOptions = useMemo<TableColumnOption[]>(() => {
    const sectionLabels: Record<string, string> = {
      company: t('Hồ sơ doanh nghiệp'),
      classification: t('Địa bàn doanh nghiệp'),
      contact: t('Liên hệ và giao nhận'),
      additional: t('Điều khoản thương mại'),
      assignment: t('Phụ trách'),
      needs: t('Nguồn và nhu cầu')
    };
    const configuredField = (key: string, fallback: string) => {
      const field = inlineSystemFieldConfiguration.fields.find(item => item.key === key);
      return field?.removed ? null : field?.label || t(fallback);
    };
    const systemColumn = (
      id: string,
      key: string,
      fallback: string,
      group: string,
      defaultVisible = false
    ): TableColumnOption | null => {
      const label = configuredField(key, fallback);
      return label ? { id, label, group, defaultVisible } : null;
    };
    return [
      { id: 'index', label: 'STT', group: t('Điều khiển bảng'), required: true },
      {
        id: 'company',
        label: configuredField('companyName', 'Khách hàng') || t('Khách hàng'),
        group: sectionLabels.company,
        required: true
      },
      systemColumn('customerCode', 'customerCode', 'Mã KH', sectionLabels.company, true),
      systemColumn('rank', 'customerRank', 'Phân loại', sectionLabels.company, true),
      systemColumn('taxCode', 'taxCode', 'Mã số thuế', sectionLabels.company, true),
      systemColumn('assignedSale', 'assignedSaleId', 'Sale phụ trách', sectionLabels.company, true),
      systemColumn('province', 'province', 'Tỉnh / thành', sectionLabels.classification),
      systemColumn('ward', 'ward', 'Phường / xã', sectionLabels.classification),
      systemColumn('industrialPark', 'industrialPark', 'Khu công nghiệp', sectionLabels.classification),
      systemColumn('address', 'address', 'Địa chỉ chi tiết / giao hàng', sectionLabels.classification),
      systemColumn('contactPerson', 'contactPerson', 'Người liên hệ', sectionLabels.contact),
      systemColumn('phone', 'phone', 'SĐT', sectionLabels.contact, true),
      systemColumn('procurementPhone', 'procurementPhone', 'SĐT thu mua', sectionLabels.contact),
      systemColumn('warehousePhone', 'warehousePhone', 'SĐT nhận hàng / kho', sectionLabels.contact),
      systemColumn('email', 'email', 'Mail', sectionLabels.contact, true),
      systemColumn('discountType', 'discountType', 'Hình thức chiết khấu', sectionLabels.additional),
      { id: 'discountValue', label: t('Chiết khấu mặc định'), group: sectionLabels.additional, defaultVisible: false },
      systemColumn('debtLimit', 'debtLimit', 'Hạn mức công nợ', sectionLabels.additional),
      systemColumn('paymentTerms', 'paymentTerms', 'Điều khoản thanh toán', sectionLabels.additional),
      systemColumn('bankAccount', 'bankAccount', 'Tài khoản ngân hàng', sectionLabels.additional),
      systemColumn('note', 'note', 'Ghi chú yêu cầu riêng', sectionLabels.additional),
      { id: 'businessResult', label: t('Kết quả kinh doanh'), group: t('Kết quả kinh doanh') },
      ...customFieldDefinitions
        .filter(definition => definition.active)
        .map(definition => ({
          id: `custom:${definition.id}`,
          label: definition.name,
          group: sectionLabels[definition.section] || t('Trường thông tin bổ sung'),
          defaultVisible: definition.defaultVisible
        })),
      { id: 'actions', label: t('Thao tác'), group: t('Điều khiển bảng'), required: true }
    ].filter((column): column is TableColumnOption => Boolean(column));
  }, [customFieldDefinitions, inlineSystemFieldConfiguration.fields, t]);
  const visibleCustomerColumnIds = useMemo(() => {
    const availableIds = new Set(customerColumnOptions.map(column => column.id));
    const requiredIds = customerColumnOptions.filter(column => column.required).map(column => column.id);
    const selectedIds = storedVisibleColumnIds?.filter(id => availableIds.has(id));
    const defaultIds = customerColumnOptions
      .filter(column => column.required || column.defaultVisible !== false)
      .map(column => column.id);
    return new Set([...requiredIds, ...(selectedIds?.length ? selectedIds : defaultIds)]);
  }, [customerColumnOptions, storedVisibleColumnIds]);
  const visibleCustomerColumnCount = customerColumnOptions.filter(column =>
    visibleCustomerColumnIds.has(column.id)
  ).length;
  const visibleCustomerCustomFields = useMemo(
    () =>
      customFieldDefinitions.filter(
        definition => definition.active && visibleCustomerColumnIds.has(`custom:${definition.id}`)
      ),
    [customFieldDefinitions, visibleCustomerColumnIds]
  );

  const saveVisibleCustomerColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const availableIds = new Set(customerColumnOptions.map(column => column.id));
    const requiredIds = customerColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([...requiredIds, ...selectedIds.filter(id => availableIds.has(id))]));
    setStoredVisibleColumnIds(nextIds);
    setShowColumnCustomizer(false);
  };
  const { orderedColumnIds: orderedCustomerColumnIds, getHeaderProps: getCustomerHeaderProps } =
    useReorderableTableColumns({
      columns: customerColumnOptions,
      selectedIds: storedVisibleColumnIds || Array.from(visibleCustomerColumnIds),
      onOrderChange: saveVisibleCustomerColumns,
      layoutId: 'customers',
      lockedStartIds: ['index', 'company'],
      lockedEndIds: ['actions']
    });
  const customerColumnLabels = Object.fromEntries(customerColumnOptions.map(column => [column.id, column.label]));

  useEffect(() => {
    const unsubClass = dbService.subscribeCollection('product_classifications', setProductClassifications);
    const unsubWind = dbService.subscribeCollection('wind_directions', setWindDirections);
    const unsubReqs = dbService.subscribeCollection('edit_requests', setEditRequests);
    return () => {
      unsubClass();
      unsubWind();
      unsubReqs();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection('customer_filter_definitions', data => {
      setStoredCustomerFilterDefinitions(data as CustomerFilterDefinition[]);
    });
    return unsubscribe;
  }, []);

  const customerFilterDefinitions = useMemo(
    () => mergeCustomerFilterDefinitions(storedCustomerFilterDefinitions),
    [storedCustomerFilterDefinitions]
  );
  const customerFilterById = useMemo(
    () => new Map(customerFilterDefinitions.map(definition => [definition.id, definition])),
    [customerFilterDefinitions]
  );
  const systemFilterDefinitions = useSystemFilterConfiguration([], customerFilterDefinitions);

  const handleUpdateFieldValue = (fieldId: string, value: any) => {
    setSpecFields(prev => prev.map(f => (f.id === fieldId ? { ...f, value } : f)));
  };

  const handleDeleteField = async (fieldId: string) => {
    if (await confirmDelete(t('Bạn có chắc chắn muốn xóa thông số này?'))) {
      setSpecFields(prev => prev.filter(f => f.id !== fieldId));
    }
  };

  const handleStartEditLabel = (fieldId: string, currentLabel: string) => {
    setEditingLabelId(fieldId);
    setTempLabelText(currentLabel);
  };

  const handleSaveLabel = (fieldId: string) => {
    if (tempLabelText.trim()) {
      setSpecFields(prev => prev.map(f => (f.id === fieldId ? { ...f, label: tempLabelText.trim() } : f)));
    }
    setEditingLabelId(null);
  };

  const handleAddField = () => {
    const newFieldId = `custom_${Date.now()}`;
    const newField = {
      id: newFieldId,
      label: t('Thông số mới'),
      value: '',
      type: 'text'
    };
    setSpecFields(prev => [...prev, newField]);
    setEditingLabelId(newFieldId);
    setTempLabelText(t('Thông số mới'));
  };

  const handleAddSelectField = () => {
    const newFieldId = `custom_${Date.now()}`;
    const newField = {
      id: newFieldId,
      label: t('Thông số mới'),
      value: t('Lựa chọn 1'),
      type: 'select',
      options: [t('Lựa chọn 1'), t('Lựa chọn 2')]
    };
    setSpecFields(prev => [...prev, newField]);
    setEditingLabelId(newFieldId);
    setTempLabelText(t('Thông số mới'));
  };

  const handleEditDropdownOptions = (fieldId: string) => {
    const field = specFields.find(f => f.id === fieldId);
    if (!field) return;
    const currentOpts = field.options || [];
    const newOptsStr = prompt(t('Nhập danh sách lựa chọn (phân cách bằng dấu phẩy):'), currentOpts.join(', '));
    if (newOptsStr !== null) {
      const newOpts = newOptsStr
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);

      if (newOpts.length === 0) {
        alert(t('Danh sách lựa chọn không được trống.'));
        return;
      }

      setSpecFields(prev =>
        prev.map(f => {
          if (f.id === fieldId) {
            const newValue = newOpts.includes(f.value) ? f.value : newOpts[0];
            return { ...f, options: newOpts, value: newValue };
          }
          return f;
        })
      );
    }
  };

  const handleWindDirectionFilesChangeForField = async (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const base64Promises = Array.from(files).map(file => {
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, data: reader.result as string, url: reader.result as string });
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
      });
    });
    try {
      const base64Files = await Promise.all(base64Promises);
      setSpecFields(prev =>
        prev.map(f => {
          if (f.id === fieldId) {
            const currentFiles = Array.isArray(f.value) ? f.value : [];
            return { ...f, value: [...currentFiles, ...base64Files] };
          }
          return f;
        })
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Modals state
  const [showAddModal, setShowAddModal] = useState(Boolean(initialLead));
  const [showEditModal, setShowEditModal] = useState(false);
  const [onboardingSourceLead, setOnboardingSourceLead] = useState<LeadRecord | null>(initialLead);
  const [onboardingItems, setOnboardingItems] = useState<CustomerPendingOrderItem[]>([
    createCustomerOnboardingItem(0, '', 'percent', 0, 0)
  ]);
  const [onboardingCustomerPoCode, setOnboardingCustomerPoCode] = useState('');
  const [onboardingExpectedDeliveryDate, setOnboardingExpectedDeliveryDate] = useState('');
  const [onboardingOrderNotes, setOnboardingOrderNotes] = useState('');

  // Form fields
  const [customerCode, setCustomerCode] = useState(() => (initialLead ? createNextCustomerCode(customers) : ''));
  const [customerRank, setCustomerRank] = useState<CustomerRank>('');
  const [companyName, setCompanyName] = useState(initialLead?.companyName || '');
  const [website, setWebsite] = useState(initialLead?.website || '');
  const [businessSector, setBusinessSector] = useState(initialLead?.businessSector || '');
  const [contactPerson, setContactPerson] = useState(initialLead?.contactPerson || '');
  const [contactPosition, setContactPosition] = useState(initialLead?.contactPosition || '');
  const [phone, setPhone] = useState(initialLead?.phone || '');
  const [email, setEmail] = useState(initialLead?.email || '');
  const [address, setAddress] = useState(initialLead?.address || '');
  const [province, setProvince] = useState(initialLead?.province || '');
  const [ward, setWard] = useState(initialLead?.ward || '');
  const [industrialPark, setIndustrialPark] = useState(initialLead?.industrialPark || '');
  const [taxCode, setTaxCode] = useState(initialLead?.taxCode || '');
  const [assignedSaleId, setAssignedSaleId] = useState(initialLead?.assignedSaleId || '');
  const [discoveredById, setDiscoveredById] = useState(initialLead?.discoveredById || '');
  const [source, setSource] = useState(initialLead?.source || '');
  const [sourceUrl, setSourceUrl] = useState(initialLead?.sourceUrl || '');
  const [expectedProducts, setExpectedProducts] = useState(initialLead?.expectedProducts || '');
  const [customerInsightValues, setCustomerInsightValues] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<PODiscountType>('percent');
  const [discountRate, setDiscountRate] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [debtLimit, setDebtLimit] = useState(50000000);
  const [paymentTerms, setPaymentTerms] = useState('30 ngày');
  const [note, setNote] = useState(initialLead?.note || '');
  const [additionalContacts, setAdditionalContacts] = useState<CustomerContactRecord[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});

  const [procurementPhone, setProcurementPhone] = useState('');
  const [warehousePhone, setWarehousePhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  const clearPurgedCustomField = (fieldId: string) => {
    setCustomFieldValues(previous => {
      const next = { ...previous };
      delete next[fieldId];
      return next;
    });
  };

  const clearPurgedSystemField = (fieldKey: string) => {
    const clearTextField = (setter: React.Dispatch<React.SetStateAction<string>>) => setter('');
    const textSetters: Record<string, React.Dispatch<React.SetStateAction<string>>> = {
      taxCode: setTaxCode,
      assignedSaleId: setAssignedSaleId,
      website: setWebsite,
      businessSector: setBusinessSector,
      contactPosition: setContactPosition,
      discoveredById: setDiscoveredById,
      source: setSource,
      sourceUrl: setSourceUrl,
      expectedProducts: setExpectedProducts,
      province: setProvince,
      ward: setWard,
      industrialPark: setIndustrialPark,
      address: setAddress,
      contactPerson: setContactPerson,
      phone: setPhone,
      procurementPhone: setProcurementPhone,
      warehousePhone: setWarehousePhone,
      email: setEmail,
      bankAccount: setBankAccount,
      paymentTerms: setPaymentTerms,
      note: setNote
    };
    if (textSetters[fieldKey]) clearTextField(textSetters[fieldKey]);
    if (fieldKey === 'discountType') {
      setDiscountType('percent');
      setDiscountRate(0);
      setDiscountAmount(0);
    }
    if (fieldKey === 'debtLimit') setDebtLimit(0);
  };

  const saleUsers = users.filter(u => u.role === 'sale');
  const [suppliers, setSuppliers] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection('suppliers', setSuppliers);
    return unsubscribe;
  }, []);

  const generateCustomerCode = () => {
    return createNextCustomerCode(customers);
  };

  const buildCustomerContacts = (): CustomerContactRecord[] => {
    const primaryContact: CustomerContactRecord = {
      id: 'primary',
      name: contactPerson.trim(),
      role: 'primary',
      phone: phone.trim(),
      email: email.trim(),
      note: ''
    };
    return [primaryContact, ...additionalContacts].filter(
      contact => contact.name.trim() || contact.phone.trim() || contact.email.trim()
    );
  };

  const addContactRow = () => {
    setAdditionalContacts(previous => [
      ...previous,
      {
        id: `contact-${Date.now()}`,
        name: '',
        role: 'procurement',
        phone: '',
        email: '',
        note: ''
      }
    ]);
  };

  const updateContactRow = (contactId: string, field: keyof CustomerContactRecord, value: string) => {
    setAdditionalContacts(previous =>
      previous.map(contact => (contact.id === contactId ? { ...contact, [field]: value } : contact))
    );
  };

  // Product List states
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // General product form fields
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState<'muc_in' | 'tem_trang_cuon' | 'tem_mau_cuon' | 'tem_mau_to'>(
    'tem_trang_cuon'
  );
  const [currentPrice, setCurrentPrice] = useState(0);
  const [productLayoutBase64, setProductLayoutBase64] = useState('');
  const [productUnit, setProductUnit] = useState('cái');
  const [productVatRate, setProductVatRate] = useState(8);
  const [productSupplierId, setProductSupplierId] = useState('');
  const [productPurchasePrice, setProductPurchasePrice] = useState(0);
  const [productDiscountType, setProductDiscountType] = useState<PODiscountType>('percent');
  const [productDiscountRate, setProductDiscountRate] = useState(0);
  const [productDiscountAmount, setProductDiscountAmount] = useState(0);
  const [productLeadTimeDays, setProductLeadTimeDays] = useState(0);
  const [productMaterial, setProductMaterial] = useState('');
  const [specCustomRows, setSpecCustomRows] = useState<{ key: string; value: string }[]>([]);
  const [specFields, setSpecFields] = useState<any[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [tempLabelText, setTempLabelText] = useState('');

  // Re-quote price dialog state

  // Contract list modals & states
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  // Dates and value intentionally persist between openings; only number and file reset after saving.
  const [contractDraft, setContractDraft] = useState<CustomerContractDraft>(EMPTY_CONTRACT_DRAFT);

  // Handle opening create modal
  const openAddModal = () => {
    setOnboardingSourceLead(null);
    setCustomerCode(generateCustomerCode());
    setCustomerRank('');
    setCompanyName('');
    setWebsite('');
    setBusinessSector('');
    setContactPerson('');
    setContactPosition('');
    setPhone('');
    setEmail('');
    setAddress('');
    setProvince('');
    setWard('');
    setIndustrialPark('');
    setTaxCode('');
    setAssignedSaleId(currentUser.role === 'sale' ? currentUser.uid : saleUsers[0]?.uid || '');
    setDiscoveredById(currentUser.role === 'sale' ? currentUser.uid : '');
    setSource('');
    setSourceUrl('');
    setExpectedProducts('');
    setCustomerInsightValues([]);
    setDiscountType('percent');
    setDiscountRate(0);
    setDiscountAmount(0);
    setDebtLimit(50000000);
    setPaymentTerms('30 ngày');
    setNote('');
    setProcurementPhone('');
    setWarehousePhone('');
    setBankAccount('');
    setAdditionalContacts([]);
    setCustomFieldValues({});
    setOnboardingItems([createCustomerOnboardingItem(0, '', 'percent', 0, 0)]);
    setOnboardingCustomerPoCode('');
    setOnboardingExpectedDeliveryDate('');
    setOnboardingOrderNotes('');
    setShowAddModal(true);
  };

  // Handle opening edit modal
  const openEditModal = (cust: CustomerRecord) => {
    setCustomerCode(cust.customerCode);
    setCustomerRank(cust.customerRank);
    setCompanyName(cust.companyName);
    setWebsite(cust.website || '');
    setBusinessSector(cust.businessSector || '');
    setContactPerson(cust.contactPerson);
    setContactPosition(cust.contactPosition || '');
    setPhone(cust.phone);
    setEmail(cust.email);
    setAddress(cust.address);
    setProvince(cust.province || '');
    setWard(cust.ward || '');
    setIndustrialPark(cust.industrialPark || '');
    setTaxCode(cust.taxCode);
    setAssignedSaleId(cust.assignedSaleId);
    setDiscoveredById(cust.discoveredById || '');
    setSource(cust.source || '');
    setSourceUrl(cust.sourceUrl || '');
    setExpectedProducts(cust.expectedProducts || '');
    setCustomerInsightValues(cust.customerInsightValues || []);
    setDiscountType(cust.discountType);
    setDiscountRate(cust.discountRate);
    setDiscountAmount(cust.discountAmount);
    setDebtLimit(cust.debtLimit);
    setPaymentTerms(cust.paymentTerms);
    setNote(cust.note);
    setProcurementPhone(cust.procurementPhone || '');
    setWarehousePhone(cust.warehousePhone || '');
    setBankAccount(cust.bankAccount || '');
    setAdditionalContacts(
      (cust.contacts || []).filter(contact => contact.role !== 'primary' && contact.id !== 'primary')
    );
    setCustomFieldValues(cust.customFieldValues || {});
    setSelectedCustomer(cust);
    setShowEditModal(true);
  };

  const buildNewCustomerPayload = (
    pendingOrderDraft: CustomerPendingOrderDraft | null = null,
    products: CustomerProductRecord[] = []
  ) => {
    const now = new Date().toISOString();
    const sourceLeadFolders = onboardingSourceLead
      ? getCustomerRepositoryFolders(onboardingSourceLead)
      : DEFAULT_CUSTOMER_REPOSITORY_FOLDERS.map(folder => ({ ...folder }));
    const customerFolders = sourceLeadFolders.map(folder => ({
      ...folder,
      createdAt: folder.createdAt || now,
      createdById: folder.createdById || currentUser.uid
    }));
    return {
      customerCode: customerCode.trim() || generateCustomerCode(),
      customerRank,
      companyName: companyName.trim(),
      website: website.trim(),
      businessSector: businessSector.trim(),
      contactPerson: contactPerson.trim(),
      contactPosition: contactPosition.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      province: province.trim(),
      ward: ward.trim(),
      industrialPark: industrialPark.trim(),
      taxCode: taxCode.trim(),
      assignedSaleId,
      discoveredById,
      discoveredByName:
        users.find(user => user.uid === discoveredById)?.displayName || onboardingSourceLead?.discoveredByName || '',
      source: source.trim(),
      sourceUrl: sourceUrl.trim(),
      expectedProducts: expectedProducts.trim(),
      customerInsightValues,
      filterValues: onboardingSourceLead?.filterValues || {},
      sourceLeadId: onboardingSourceLead?.id || '',
      convertedAt: onboardingSourceLead ? now : '',
      discountType,
      discountRate: Number(discountRate),
      discountAmount: Number(discountAmount),
      debtLimit: Number(debtLimit),
      paymentTerms,
      note,
      noteHtml: plainTextToNoteHtml(note),
      customFieldValues,
      procurementPhone,
      warehousePhone,
      bankAccount,
      contacts: buildCustomerContacts(),
      products,
      documents: [],
      contracts: [],
      fileFolders: customerFolders,
      files: (onboardingSourceLead?.files || []).map(file => ({
        ...file,
        folderId: resolveCustomerFileFolderId(file, customerFolders),
        folder:
          customerFolders.find(folder => folder.id === resolveCustomerFileFolderId(file, customerFolders))?.name ||
          'Tài liệu khác',
        createdAt: file.createdAt || now,
        createdById: file.createdById || currentUser.uid,
        createdBy: file.createdBy || currentUser.displayName
      })),
      pendingOrderDraft,
      lastOrderAt: null,
      createdById: currentUser.uid,
      createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
      createdAt: now,
      updatedBy: '',
      updatedAt: ''
    };
  };

  const closeCustomerOnboarding = () => {
    setShowAddModal(false);
    if (onboardingSourceLead) onLeadOnboardingClosed?.();
    setOnboardingSourceLead(null);
  };

  const mapPreparedItemsToProducts = (items: CustomerPendingOrderItem[]): CustomerProductRecord[] =>
    items.map((item, index) => ({
      id: item.itemId || `product-${Date.now()}-${index}`,
      productCode: item.productCode.trim(),
      productName: item.productName.trim(),
      productType: item.productType || 'tem_mau_cuon',
      size: item.size || '',
      material: item.material || '',
      unit: item.unit || 'cái',
      currentPrice: Number(item.price) || 0,
      salePrice: Number(item.price) || 0,
      vatRate: Number(item.vatRate) || 0,
      supplierId: item.supplierId || '',
      supplierName:
        item.supplierName || suppliers.find(supplier => supplier.id === item.supplierId)?.supplierName || '',
      purchasePrice: Number(item.purchasePrice) || 0,
      discountType: item.discountType === 'amount' ? 'amount' : 'percent',
      discountRate: Number(item.discountRate) || 0,
      discountAmount: Number(item.discountAmount) || 0,
      leadTimeDays: Number(item.leadTimeDays) || 0,
      layoutUrl:
        typeof item.previewImages?.[0] === 'string'
          ? item.previewImages[0]
          : typeof item.previewImage === 'string'
            ? item.previewImage
            : '',
      specifications: item.specifications || {},
      files: item.files || [],
      designLayouts: item.previewImages || []
    }));

  const handleAddCustomer = async (e: React.FormEvent) => {
    return runMutationAction(
      'CrmPage.tsx:handleAddCustomer',
      async () => {
        e.preventDefault();
        if (!companyName.trim() || !customerRank) return;
        const missingCustomFields = getMissingRequiredEntityFields(
          customFieldDefinitions,
          customFieldValues,
          currentUser.role
        );
        if (missingCustomFields.length > 0) {
          alert(t(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`));
          return;
        }

        const taxCodeConflict = findTaxCodeConflict(taxCode, leads, customers, onboardingSourceLead?.id || '');
        if (taxCodeConflict) {
          alert(t(`Mã số thuế đã thuộc về ${taxCodeConflict.companyName}. Không thể tạo khách hàng trùng.`));
          return;
        }

        const normalizedItems = onboardingItems.map((item, index) =>
          normalizePendingOrderItem(withCalculatedPOFinancials(item), index)
        );
        const duplicateCodes = normalizedItems
          .map(item => item.productCode.trim().toLocaleLowerCase('vi-VN'))
          .filter((code, index, codes) => code && codes.indexOf(code) !== index);

        if (normalizedItems.some(item => !item.productCode.trim() || !item.productName.trim() || item.quantity <= 0)) {
          alert(t('Vui lòng nhập đủ mã hàng, tên hàng và số lượng lớn hơn 0.'));
          return;
        }
        if (duplicateCodes.length > 0) {
          alert(t(`Mã hàng bị trùng: ${Array.from(new Set(duplicateCodes)).join(', ')}`));
          return;
        }

        const itemFinancials = normalizedItems.map(item => calculatePOItemFinancials(item));
        const pendingOrderDraft: CustomerPendingOrderDraft | null =
          normalizedItems.length > 0
            ? {
                customerPoCode: onboardingCustomerPoCode.trim(),
                expectedDeliveryDate: onboardingExpectedDeliveryDate,
                notes: onboardingOrderNotes.trim(),
                items: normalizedItems,
                links: {},
                totalAmount: itemFinancials.reduce((total, item) => total + item.amountBeforeVat, 0),
                discountAmount: itemFinancials.reduce((total, item) => total + item.discountAmount, 0),
                netAmount: itemFinancials.reduce((total, item) => total + item.amountWithVat, 0),
                preparedAt: new Date().toISOString(),
                preparedById: currentUser.uid,
                preparedBy: currentUser.displayName
              }
            : null;

        const createdCustomer = await dbService.addDocument(
          'customers',
          buildNewCustomerPayload(pendingOrderDraft, mapPreparedItemsToProducts(normalizedItems))
        );

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'crm',
          action: 'customer_created',
          summary: `Tạo khách hàng ${companyName.trim()}`,
          targetType: 'customer',
          targetId: createdCustomer.id,
          targetLabel: companyName.trim()
        });

        if (onboardingSourceLead) {
          const now = new Date().toISOString();
          const latestLead = (await dbService.getDocument('leads', onboardingSourceLead.id)) as LeadRecord | null;
          await requireConfirmedMutation(
            dbService.updateDocument('leads', onboardingSourceLead.id, {
              stage: 'converted',
              convertedCustomerId: createdCustomer.id,
              convertedAt: now,
              activities: [
                {
                  id: `activity-${now}`,
                  type: 'converted',
                  note: `Đã chuyển thành khách hàng ${customerCode.trim() || createdCustomer.id}`,
                  occurredAt: now,
                  createdById: currentUser.uid,
                  createdByName: currentUser.displayName
                },
                ...(latestLead?.activities || onboardingSourceLead.activities || [])
              ],
              updatedAt: now,
              updatedBy: currentUser.displayName
            })
          );
        }

        closeCustomerOnboarding();
        onRefresh();
        if (pendingOrderDraft) onPreparedOrderCreated?.(createdCustomer.id);

        showSuccessToast('Đã thêm thành công');
      },
      e
    );
  };

  // Edit customer
  const handleEditCustomer = async (e: React.FormEvent) => {
    return runMutationAction(
      'CrmPage.tsx:handleEditCustomer',
      async () => {
        e.preventDefault();
        if (!selectedCustomer) return;
        const missingCustomFields = getMissingRequiredEntityFields(
          customFieldDefinitions,
          customFieldValues,
          currentUser.role
        );
        if (missingCustomFields.length > 0) {
          alert(t(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`));
          return;
        }

        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            customerCode: customerCode.trim() || selectedCustomer.customerCode,
            customerRank,
            companyName,
            website,
            businessSector,
            contactPerson,
            contactPosition,
            phone,
            email,
            address,
            province,
            ward,
            industrialPark,
            taxCode,
            assignedSaleId,
            discoveredById,
            discoveredByName:
              users.find(user => user.uid === discoveredById)?.displayName || selectedCustomer.discoveredByName || '',
            source,
            sourceUrl,
            expectedProducts,
            customerInsightValues,
            discountType,
            discountRate: Number(discountRate),
            discountAmount: Number(discountAmount),
            debtLimit: Number(debtLimit),
            paymentTerms,
            note,
            noteHtml: plainTextToNoteHtml(note),
            customFieldValues,
            procurementPhone,
            warehousePhone,
            bankAccount,
            contacts: buildCustomerContacts(),
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            updatedAt: new Date().toISOString()
          })
        );

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'crm',
          action: 'customer_updated',
          summary: `Cập nhật khách hàng ${companyName.trim() || selectedCustomer.companyName}`,
          targetType: 'customer',
          targetId: selectedCustomer.id,
          targetLabel: companyName.trim() || selectedCustomer.companyName
        });

        setShowEditModal(false);
        setSelectedCustomer(null);
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  const handleSaveCustomerNote = async () => {
    return runMutationAction(
      'CrmPage.tsx:handleSaveCustomerNote',
      async () => {
        if (!selectedCustomer || (currentUser.role !== 'admin' && currentUser.role !== 'sale')) return;
        const nextNoteHtml = sanitizeCustomerNoteHtml(customerNoteDraft).trim();
        const nextNote = customerNoteHtmlToText(nextNoteHtml);
        const previousNoteHtml = sanitizeCustomerNoteHtml(
          selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))
        ).trim();
        if (nextNoteHtml === previousNoteHtml) return;

        setIsSavingCustomerNote(true);
        setCustomerNoteFeedback('');
        try {
          const updatedAt = new Date().toISOString();
          const updatedBy = `${currentUser.displayName} (${currentUser.role.toUpperCase()})`;
          await requireConfirmedMutation(
            dbService.updateDocument('customers', selectedCustomer.id, {
              note: nextNote,
              noteHtml: nextNoteHtml,
              updatedBy,
              updatedAt
            })
          );
          setSelectedCustomer((previous: any) =>
            previous ? { ...previous, note: nextNote, noteHtml: nextNoteHtml, updatedBy, updatedAt } : previous
          );
          setCustomerNoteDraft(nextNoteHtml);
          setCustomerNoteFeedback(t('Đã lưu ghi chú.'));
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'crm',
            action: 'customer_note_updated',
            summary: `Cập nhật ghi chú khách hàng ${selectedCustomer.companyName}`,
            targetType: 'customer',
            targetId: selectedCustomer.id,
            targetLabel: selectedCustomer.companyName
          });
          onRefresh();

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setCustomerNoteFeedback(t('Không thể lưu ghi chú. Vui lòng thử lại.'));
        } finally {
          setIsSavingCustomerNote(false);
        }
      },
      undefined
    );
  };

  // Delete customer
  const handleDeleteCustomer = async (id: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleDeleteCustomer',
      async () => {
        if (currentUser.role === 'admin') {
          if (!(await confirmDelete(t('Đưa khách hàng này vào Thùng rác?')))) return;
          const password = window.prompt(t('Nhập mật khẩu xác nhận xóa (Giám Đốc/Admin):'));
          if (password === 'admin123' || password === '123456') {
            await requireConfirmedMutation(
              dbService.updateDocument('customers', id, {
                deleted: true,
                deleteRequested: false,
                deleteRequestedAt: '',
                updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
                updatedAt: new Date().toISOString()
              })
            );
            setSelectedCustomer(null);
            onRefresh();
            showSuccessToast('Đã xóa thành công');
          } else if (password !== null) {
            alert(t('Mật khẩu không chính xác. Xóa thất bại.'));
          }
        } else {
          if (
            await confirmDelete(t('Bạn có muốn gửi yêu cầu xóa khách hàng này tới Admin phê duyệt?'), {
              title: 'Xác nhận yêu cầu xóa',
              confirmLabel: 'Gửi yêu cầu'
            })
          ) {
            await requireConfirmedMutation(
              dbService.updateDocument('customers', id, {
                deleteRequested: true,
                deleteRequestedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
                deleteRequestedAt: new Date().toISOString()
              })
            );
            showSuccessToast('Đã gửi yêu cầu');
            onRefresh();
          }
        }
      },
      id
    );
  };

  const handleOpenEditProduct = (prod: any) => {
    setSelectedProduct(prod);
    setProductCode(prod.productCode);
    setProductName(prod.productName);
    setProductType(prod.productType);
    setCurrentPrice(prod.currentPrice);
    setProductMaterial(prod.material || '');
    setProductUnit(prod.unit || 'cái');
    setProductVatRate(Number(prod.vatRate ?? 8));
    setProductSupplierId(prod.supplierId || '');
    setProductPurchasePrice(Number(prod.purchasePrice || 0));
    setProductDiscountType(prod.discountType === 'amount' ? 'amount' : 'percent');
    setProductDiscountRate(Number(prod.discountRate || 0));
    setProductDiscountAmount(Number(prod.discountAmount || 0));
    setProductLeadTimeDays(Number(prod.leadTimeDays || 0));
    setSpecCustomRows(prod.specifications?.custom || []);
    setProductLayoutBase64(prod.layoutUrl || '');
    setSpecFields(loadSpecsToFields(prod.productType, prod.specifications));
    setShowEditProductModal(true);
  };

  const closeEditProductModal = () => {
    setShowEditProductModal(false);
    setSelectedProduct(null);
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'CrmPage.tsx:handleEditProductSubmit',
      async () => {
        e.preventDefault();
        if (!selectedCustomer || !selectedProduct) return;
        if (!productCode.trim() || !productName.trim()) {
          alert(t('Vui lòng nhập đầy đủ mã hàng và tên hàng.'));
          return;
        }
        if (hasDuplicateProductCode(productCode, selectedProduct.id)) {
          alert(t(`Mã hàng ${productCode.trim()} đã tồn tại trong hồ sơ khách hàng.`));
          return;
        }

        const specs: any = { fields: specFields };
        // Flatten fields for backwards compatibility
        specFields.forEach(f => {
          let val = f.value;
          if (f.type === 'number') {
            val = Number(val);
          }
          specs[f.id] = val;

          // Keep support for both core/windingCore for color rolls
          if (f.id === 'core') {
            specs.windingCore = val;
          }
          if (f.id === 'windingCore') {
            specs.core = val;
          }

          // Map other special fields for legacy compatibility
          if (f.id === 'colors') {
            specs.colors = val;
          }
          if (f.id === 'processing') {
            specs.processing = val;
          }
          if (f.id === 'ribbonType') {
            specs.ribbonType = val;
          }
          if (f.id === 'direction') {
            specs.direction = val;
          }
          if (f.id === 'size') {
            specs.size = val;
          }
          if (f.id === 'color') {
            specs.color = val;
          }
          if (f.id === 'corner') {
            specs.corner = val;
          }
          if (f.id === 'lamination') {
            specs.lamination = val;
          }
          if (f.id === 'finished') {
            specs.finished = val;
          }
          if (f.id === 'sheetType') {
            specs.sheetType = val;
          }
          if (f.id === 'dieCut') {
            specs.dieCut = val;
          }
          if (f.id === 'perforated') {
            specs.perforated = val;
          }
          if (f.id === 'windDirection') {
            specs.windDirection = val;
          }
          if (f.id === 'windDirectionFiles') {
            specs.windDirectionFiles = val;
          }
        });

        specs.custom = specFields.filter(f => f.id.startsWith('custom_')).map(f => ({ key: f.label, value: f.value }));

        const priceChanged = Number(currentPrice) !== selectedProduct.currentPrice;
        const newPriceHistory = [...(selectedProduct.priceHistory || [])];
        if (priceChanged) {
          newPriceHistory.push({
            date: new Date().toISOString().split('T')[0],
            price: Number(currentPrice),
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
          });
        }

        const updatedProduct = {
          ...selectedProduct,
          previousProductCodes: Array.from(
            new Set([
              ...(Array.isArray(selectedProduct.previousProductCodes) ? selectedProduct.previousProductCodes : []),
              ...(normalizeProductCode(productCode) !== normalizeProductCode(selectedProduct.productCode)
                ? [selectedProduct.productCode]
                : [])
            ])
          ),
          productCode: productCode.trim(),
          productName: productName.trim(),
          productType,
          currentPrice: Number(currentPrice),
          salePrice: Number(currentPrice),
          material: productMaterial,
          unit: productUnit,
          vatRate: Number(productVatRate),
          supplierId: productSupplierId,
          supplierName: suppliers.find(supplier => supplier.id === productSupplierId)?.supplierName || '',
          purchasePrice: Number(productPurchasePrice),
          discountType: productDiscountType,
          discountRate: Number(productDiscountRate),
          discountAmount: Number(productDiscountAmount),
          leadTimeDays: Number(productLeadTimeDays),
          layoutUrl: productLayoutBase64,
          specifications: specs,
          size: getCustomerProductSize({ size: '', specifications: specs }),
          priceHistory: newPriceHistory,
          updatedAt: new Date().toISOString()
        };

        if (currentUser.role === 'admin') {
          try {
            const products = await updateCustomerProduct(
              selectedCustomer.id,
              updatedProduct,
              currentUser,
              getCustomerProductVersion(selectedProduct)
            );
            setSelectedCustomer((previous: CustomerRecord | null) => (previous ? { ...previous, products } : previous));
          } catch (error) {
            alert(
              error instanceof Error && !('code' in error)
                ? error.message
                : t('Không thể lưu sản phẩm. Vui lòng thử lại.')
            );
            return;
          }
          showSuccessToast('Đã lưu thành công');
        } else {
          await dbService.addDocument('edit_requests', {
            type: 'product_details',
            targetId: selectedCustomer.id,
            productId: selectedProduct.id,
            fieldName: `${t('Sửa Sản phẩm')}: ${selectedProduct.productCode} - ${selectedProduct.productName}`,
            originalData: selectedProduct,
            updatedData: updatedProduct,
            requestedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            requestedAt: new Date().toISOString(),
            status: 'pending'
          });
          showSuccessToast('Đã gửi yêu cầu');
        }

        setShowEditProductModal(false);
        setSelectedProduct(null);
        onRefresh();
      },
      e
    );
  };

  const triggerAddClassification = async () => {
    return runMutationAction(
      'CrmPage.tsx:triggerAddClassification',
      async () => {
        const name = prompt(t('Nhập tên phân loại sản phẩm mới:'));
        if (!name || !name.trim()) return;
        const cleanName = name.trim();
        const id = `class-${Math.random().toString(36).substr(2, 9)}`;
        const newClass = { id, name: cleanName };
        await dbService.addDocument('product_classifications', newClass);
        showSuccessToast('Đã thêm thành công');
      },
      undefined
    );
  };

  const triggerAddWindDirection = async () => {
    return runMutationAction(
      'CrmPage.tsx:triggerAddWindDirection',
      async () => {
        const name = prompt(t('Nhập tên hướng tem ra mới:'));
        if (!name || !name.trim()) return;
        const cleanName = name.trim();
        const id = `wind-${Math.random().toString(36).substr(2, 9)}`;
        const newWind = { id, name: cleanName };
        await dbService.addDocument('wind_directions', newWind);
        showSuccessToast('Đã thêm thành công');
      },
      undefined
    );
  };

  const handleEditClassification = async (id: string, newName: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleEditClassification',
      async () => {
        const origClass = productClassifications.find(c => c.id === id);
        if (!origClass) return;
        if (currentUser.role === 'admin') {
          await requireConfirmedMutation(dbService.updateDocument('product_classifications', id, { name: newName }));
          showSuccessToast('Đã lưu thành công');
        } else {
          await dbService.addDocument('edit_requests', {
            type: 'product_classification',
            targetId: id,
            fieldName: `${t('Sửa Phân loại sản phẩm')}: ${origClass.name}`,
            originalData: { name: origClass.name },
            updatedData: { name: newName },
            requestedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            requestedAt: new Date().toISOString(),
            status: 'pending'
          });
          showSuccessToast('Đã gửi yêu cầu');
        }
        onRefresh();
      },
      id
    );
  };

  const handleEditWindDirection = async (id: string, newName: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleEditWindDirection',
      async () => {
        const origWind = windDirections.find(w => w.id === id);
        if (!origWind) return;
        if (currentUser.role === 'admin') {
          await requireConfirmedMutation(dbService.updateDocument('wind_directions', id, { name: newName }));
          showSuccessToast('Đã lưu thành công');
        } else {
          await dbService.addDocument('edit_requests', {
            type: 'wind_direction',
            targetId: id,
            fieldName: `${t('Sửa Hướng tem ra')}: ${origWind.name}`,
            originalData: { name: origWind.name },
            updatedData: { name: newName },
            requestedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
            requestedAt: new Date().toISOString(),
            status: 'pending'
          });
          showSuccessToast('Đã gửi yêu cầu');
        }
        onRefresh();
      },
      id
    );
  };

  const triggerEditClassification = async (id: string) => {
    const origClass = productClassifications.find(c => c.id === id);
    if (!origClass) return;
    const name = prompt(t('Sửa tên phân loại sản phẩm:'), origClass.name);
    if (!name || !name.trim()) return;
    await handleEditClassification(id, name.trim());
  };

  const triggerEditWindDirection = async (id: string) => {
    const origWind = windDirections.find(w => w.id === id);
    if (!origWind) return;
    const name = prompt(t('Sửa tên hướng tem ra:'), origWind.name);
    if (!name || !name.trim()) return;
    await handleEditWindDirection(id, name.trim());
  };

  const handleApproveRequest = async (req: any) => {
    return runMutationAction(
      'CrmPage.tsx:handleApproveRequest',
      async () => {
        try {
          let approved = false;
          if (req.type === 'customer_profile') {
            await requireConfirmedMutation(
              dbService.updateDocument('customers', req.targetId, {
                ...req.updatedData,
                updatedBy: req.requestedBy,
                updatedAt: new Date().toISOString()
              })
            );
            approved = true;
          } else if (req.type === 'product_details') {
            const cust = customers.find(c => c.id === req.targetId);
            if (cust) {
              await updateCustomerProduct(
                req.targetId,
                { ...req.updatedData, id: req.productId },
                currentUser,
                req.originalData ? getCustomerProductVersion(req.originalData) : ''
              );
              approved = true;
            } else {
              alert(t('Không tìm thấy thông tin khách hàng tương ứng.'));
            }
          } else if (req.type === 'product_classification') {
            await requireConfirmedMutation(
              dbService.updateDocument('product_classifications', req.targetId, {
                name: req.updatedData.name
              })
            );
            approved = true;
          } else if (req.type === 'wind_direction') {
            await requireConfirmedMutation(
              dbService.updateDocument('wind_directions', req.targetId, {
                name: req.updatedData.name
              })
            );
            approved = true;
          }

          await requireConfirmedMutation(dbService.deleteDocument('edit_requests', req.id));
          setShowCompareModal(false);
          setSelectedEditRequest(null);
          onRefresh();
          if (approved) showSuccessToast('Đã duyệt thành công');
        } catch (error) {
          showErrorToast();
          console.error(error);
          alert(t('Có lỗi xảy ra khi phê duyệt.'));
        }
      },
      req
    );
  };

  const handleRejectRequest = async (req: any) => {
    return runMutationAction(
      'CrmPage.tsx:handleRejectRequest',
      async () => {
        if (window.confirm(t('Bạn có chắc chắn muốn từ chối yêu cầu này?'))) {
          await requireConfirmedMutation(dbService.deleteDocument('edit_requests', req.id));
          setShowCompareModal(false);
          setSelectedEditRequest(null);
          showSuccessToast('Đã từ chối yêu cầu');
          onRefresh();
        }
      },
      req
    );
  };

  const handleApproveDeleteCustomer = async (cust: any) => {
    return runMutationAction(
      'CrmPage.tsx:handleApproveDeleteCustomer',
      async () => {
        if (
          await confirmDelete(t('Bạn có chắc muốn phê duyệt xóa khách hàng này?'), {
            title: 'Xác nhận phê duyệt xóa',
            confirmLabel: 'Duyệt xóa'
          })
        ) {
          await requireConfirmedMutation(
            dbService.updateDocument('customers', cust.id, {
              deleted: true,
              deleteRequested: false,
              deleteRequestedAt: ''
            })
          );
          showSuccessToast('Đã xóa thành công');
          onRefresh();
        }
      },
      cust
    );
  };

  const handleRejectDeleteCustomer = async (cust: any) => {
    return runMutationAction(
      'CrmPage.tsx:handleRejectDeleteCustomer',
      async () => {
        if (window.confirm(t('Từ chối yêu cầu xóa khách hàng này?'))) {
          await requireConfirmedMutation(
            dbService.updateDocument('customers', cust.id, {
              deleteRequested: false,
              deleteRequestedBy: '',
              deleteRequestedAt: ''
            })
          );
          showSuccessToast('Đã từ chối yêu cầu');
          onRefresh();
        }
      },
      cust
    );
  };

  const handleRepoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      alert(t('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.'));
      e.target.value = '';
      return;
    }
    setRepoUploadFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      setRepoUploadFile(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Add folder
  const handleAddFolder = async () => {
    return runMutationAction(
      'CrmPage.tsx:handleAddFolder',
      async () => {
        if (!selectedCustomer || currentUser.role !== 'admin') return;
        const folderNameTrim = newFolderName.trim();
        if (!folderNameTrim) return;

        const folders = getCustomerRepositoryFolders(selectedCustomer);
        const folderExists = folders.some(
          folder => folder.name.trim().toLocaleLowerCase('vi-VN') === folderNameTrim.toLocaleLowerCase('vi-VN')
        );
        if (folderExists) {
          alert(t('Thư mục này đã tồn tại.'));
          return;
        }

        const now = new Date().toISOString();
        const newFolder: CustomerRepositoryFolder = {
          id: createCustomerFolderId(
            folderNameTrim,
            folders.map(folder => folder.id)
          ),
          name: folderNameTrim,
          parentId: null,
          order: Math.max(0, ...folders.map(folder => Number(folder.order) || 0)) + 10,
          active: true,
          createdAt: now,
          createdById: currentUser.uid,
          updatedAt: '',
          updatedById: ''
        };
        const nextFolders = [...folders, newFolder];
        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            fileFolders: nextFolders,
            updatedAt: now,
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
          })
        );

        setNewFolderName('');
        setActiveRepositoryFolderId(newFolder.id);
        setSelectedFolderForUpload(newFolder.id);
        setSelectedCustomer((prev: any) => ({ ...prev, fileFolders: nextFolders }));
        onRefresh();

        showSuccessToast('Đã thêm thành công');
      },
      undefined
    );
  };

  const handleRenameRepoFolder = async (folderId: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleRenameRepoFolder',
      async () => {
        if (!selectedCustomer || currentUser.role !== 'admin') return;
        const nextName = folderNameDraft.trim();
        if (!nextName) return;
        const folders = getCustomerRepositoryFolders(selectedCustomer);
        if (
          folders.some(
            folder =>
              folder.id !== folderId &&
              folder.name.trim().toLocaleLowerCase('vi-VN') === nextName.toLocaleLowerCase('vi-VN')
          )
        ) {
          alert(t('Tên thư mục này đã tồn tại.'));
          return;
        }
        const now = new Date().toISOString();
        const nextFolders = folders.map(folder =>
          folder.id === folderId
            ? {
                ...folder,
                name: nextName,
                updatedAt: now,
                updatedById: currentUser.uid
              }
            : folder
        );
        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            fileFolders: nextFolders,
            updatedAt: now,
            updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
          })
        );
        setSelectedCustomer((previous: any) => (previous ? { ...previous, fileFolders: nextFolders } : previous));
        setRenamingFolderId('');
        setFolderNameDraft('');
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      folderId
    );
  };

  // Upload file to customer repo
  const handleUploadRepoFile = async (e: React.FormEvent) => {
    return runMutationAction(
      'CrmPage.tsx:handleUploadRepoFile',
      async () => {
        e.preventDefault();
        if (!selectedCustomer) return;
        const normalizedLink = repoUploadLink.trim();
        if (!selectedFolderForUpload || (!repoUploadFile && !normalizedLink) || !repoUploadFileName) {
          alert(t('Vui lòng chọn thư mục, nhập tên và chọn tệp hoặc đường dẫn chia sẻ.'));
          return;
        }
        if (normalizedLink && !/^https?:\/\//i.test(normalizedLink)) {
          alert(t('Đường dẫn chia sẻ phải bắt đầu bằng http:// hoặc https://.'));
          return;
        }

        const folders = getCustomerRepositoryFolders(selectedCustomer);
        const selectedFolder = folders.find(folder => folder.id === selectedFolderForUpload && folder.active !== false);
        if (!selectedFolder) {
          alert(t('Thư mục lưu trữ không còn tồn tại.'));
          return;
        }
        const updatedFiles = (selectedCustomer.files || []).filter((file: any) => file.name !== '.placeholder');

        const newFileObj = {
          id: `customer-file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          folderId: selectedFolder.id,
          folder: selectedFolder.name,
          name: repoUploadFileName,
          base64: repoUploadFile,
          data: repoUploadFile,
          url: normalizedLink,
          createdAt: new Date().toISOString(),
          createdById: currentUser.uid,
          createdBy: currentUser.displayName
        };

        const newFiles = [...updatedFiles, newFileObj];
        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            files: newFiles,
            fileFolders: folders
          })
        );

        setRepoUploadFile('');
        setRepoUploadFileName('');
        setRepoUploadLink('');
        setSelectedCustomer((prev: any) => ({ ...prev, files: newFiles }));
        onRefresh();

        showSuccessToast('Đã lưu thành công');
      },
      e
    );
  };

  // Delete file/folder from customer repo
  const handleDeleteRepoFile = async (fileId: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleDeleteRepoFile',
      async () => {
        if (!selectedCustomer) return;
        if (!(await confirmDelete(t('Bạn có chắc chắn muốn xóa tệp này khỏi kho lưu trữ?')))) {
          return;
        }
        const updatedFiles = selectedCustomer.files || [];
        const newFiles = updatedFiles.filter((file: any) => file.id !== fileId);

        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            files: newFiles
          })
        );

        setSelectedCustomer((prev: any) => ({ ...prev, files: newFiles }));
        onRefresh();

        showSuccessToast('Đã xóa thành công');
      },
      fileId
    );
  };

  const handleDeleteRepoFolder = async (folderId: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleDeleteRepoFolder',
      async () => {
        if (!selectedCustomer || currentUser.role !== 'admin') return;
        const folders = getCustomerRepositoryFolders(selectedCustomer);
        const folder = folders.find(item => item.id === folderId);
        if (!folder) return;
        const containsFiles = (selectedCustomer.files || []).some(
          (file: any) => file.name !== '.placeholder' && resolveCustomerFileFolderId(file, folders) === folderId
        );
        const containsContracts = folderId === 'contracts' && (selectedCustomer.contracts || []).length > 0;
        if (containsFiles || containsContracts) {
          alert(t('Không thể xóa thư mục đang có tài liệu. Hãy chuyển hoặc xóa tài liệu bên trong trước.'));
          return;
        }
        if (folders.length === 1) {
          alert(t('Kho lưu trữ phải có ít nhất một thư mục.'));
          return;
        }
        if (!(await confirmDelete(`${t('Xóa thư mục')} “${folder.name}”?`))) return;
        const nextFolders = folders.filter(item => item.id !== folderId);

        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            fileFolders: nextFolders
          })
        );

        const nextActiveId = nextFolders[0]?.id || '';
        setActiveRepositoryFolderId(nextActiveId);
        setSelectedFolderForUpload(nextActiveId);
        setSelectedCustomer((prev: any) => ({ ...prev, fileFolders: nextFolders }));
        onRefresh();

        showSuccessToast('Đã xóa thành công');
      },
      folderId
    );
  };

  // Product Helpers
  function hasDuplicateProductCode(code: string, excludedProductId = '') {
    return Boolean(
      code.trim() &&
      selectedCustomer &&
      hasCustomerProductCode(selectedCustomer.products || [], code, excludedProductId)
    );
  }

  const handleEditProductTypeChange = (type: any) => {
    if (window.confirm(t('Thay đổi loại sản phẩm sẽ reset các thông số kỹ thuật về mặc định. Bạn có muốn tiếp tục?'))) {
      setProductType(type);
      setSpecFields(loadSpecsToFields(type));
    }
  };

  const handleProductLayoutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      setProductLayoutBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddContractSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'CrmPage.tsx:handleAddContractSubmit',
      async () => {
        e.preventDefault();
        if (!selectedCustomer || !contractDraft.contractNo) return;

        const newContract = {
          id: `contr-${Math.random().toString(36).substr(2, 9)}`,
          contractNo: contractDraft.contractNo,
          signDate: contractDraft.signDate,
          expiryDate: contractDraft.expiryDate,
          value: Number(contractDraft.value),
          fileUrl: contractDraft.fileUrl,
          status: new Date(contractDraft.expiryDate).getTime() > Date.now() ? 'active' : 'expired',
          createdAt: new Date().toISOString(),
          createdById: currentUser.uid,
          createdBy: currentUser.displayName
        };

        const updatedContracts = [...(selectedCustomer.contracts || []), newContract];

        await requireConfirmedMutation(
          dbService.updateDocument('customers', selectedCustomer.id, {
            contracts: updatedContracts
          })
        );

        setSelectedCustomer((prev: any) => ({
          ...prev,
          contracts: updatedContracts
        }));

        setShowAddContractModal(false);
        setContractDraft(previous => ({ ...previous, contractNo: '', fileUrl: '' }));
        onRefresh();

        showSuccessToast('Đã thêm thành công');
      },
      e
    );
  };

  const handleDeleteContract = async (contractId: string) => {
    return runMutationAction(
      'CrmPage.tsx:handleDeleteContract',
      async () => {
        if (!selectedCustomer) return;
        if (await confirmDelete(t('Bạn có chắc chắn muốn xóa hợp đồng này?'))) {
          const updatedContracts = (selectedCustomer.contracts || []).filter((c: any) => c.id !== contractId);

          await requireConfirmedMutation(
            dbService.updateDocument('customers', selectedCustomer.id, {
              contracts: updatedContracts
            })
          );

          setSelectedCustomer((prev: any) => ({
            ...prev,
            contracts: updatedContracts
          }));

          onRefresh();

          showSuccessToast('Đã xóa thành công');
        }
      },
      contractId
    );
  };

  // Order history helper for selected customer
  const getCustomerOrders = (custId: string) => {
    return pos
      .filter(po => po.customerId === custId && !po.deleted)
      .sort(
        (a, b) =>
          (parseValidDate(b.orderDate || b.createdAt)?.getTime() || 0) -
          (parseValidDate(a.orderDate || a.createdAt)?.getTime() || 0)
      );
  };

  // Order frequency (orders per month)
  const calculateFrequency = (custId: string) => {
    const orders = getCustomerOrders(custId);
    if (orders.length === 0) return `0 ${t('đơn/tháng')}`;

    // Calculate months between first order and now
    const dates = orders
      .map(order => parseValidDate(order.orderDate || order.createdAt)?.getTime())
      .filter((timestamp): timestamp is number => typeof timestamp === 'number');
    if (dates.length === 0) return `0 ${t('đơn/tháng')}`;
    const minDate = new Date(Math.min(...dates));
    const now = new Date();
    const diffMonths = Math.max(
      1,
      (now.getFullYear() - minDate.getFullYear()) * 12 + (now.getMonth() - minDate.getMonth())
    );

    return `${(orders.length / diffMonths).toFixed(1)} ${t('đơn/tháng')}`;
  };

  // Customer overview metrics and filters
  const today = new Date();
  const accessibleCustomers = customers.filter(
    customer =>
      customer.deleted !== true &&
      (currentUser.role !== 'sale' || !customer.assignedSaleId || customer.assignedSaleId === currentUser.uid)
  );
  const accessibleCustomerIds = new Set(accessibleCustomers.map(customer => customer.id));
  const customerMaterialsById = useMemo(() => buildCustomerMaterialHistory(pos), [pos]);
  const customerSamplesById = useMemo(() => buildCustomerOrderedSampleHistory(pos), [pos]);

  const openCustomerDetail = (customer: CustomerRecord, callPhone = customer.phone) => {
    setDetailCallPhone(callPhone);
    setCustomerHistoryTab('overview');
    setRepositoryPreviewFolder('');
    setRepositoryUploadOpen(false);
    setIsCompanyInfoExpanded(false);
    setCustomerNoteDraft(sanitizeCustomerNoteHtml(customer.noteHtml || plainTextToNoteHtml(customer.note || '')));
    setCustomerNoteFeedback('');
    const initialFolders = getCustomerRepositoryFolders(customer);
    const initialFolderId = initialFolders.find(folder => folder.id === 'contracts')?.id || initialFolders[0]?.id || '';
    setActiveRepositoryFolderId(initialFolderId);
    setSelectedFolderForUpload(initialFolderId);
    setRenamingFolderId('');
    setSelectedCustomer(customer);
  };

  useEffect(() => {
    if (!initialCustomerId) return;
    const customer = customers.find(item => item.id === initialCustomerId);
    if (!customer) return;
    const timer = window.setTimeout(() => {
      openCustomerDetail(customer);
      onInitialCustomerOpened?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customers, initialCustomerId, onInitialCustomerOpened]);

  const closeCustomerDetail = () => {
    const savedNoteHtml = selectedCustomer
      ? sanitizeCustomerNoteHtml(
          selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))
        ).trim()
      : '';
    const hasUnsavedNote = selectedCustomer && sanitizeCustomerNoteHtml(customerNoteDraft).trim() !== savedNoteHtml;
    if (hasUnsavedNote && !window.confirm(t('Ghi chú chưa được lưu. Bạn có muốn rời khỏi trang?'))) return;
    setSelectedCustomer(null);
    setCustomerNoteFeedback('');
  };

  const customerRepositoryFolders = selectedCustomer
    ? getCustomerRepositoryFolders(selectedCustomer).filter(folder => folder.active !== false)
    : [];
  const activeRepositoryFolder =
    customerRepositoryFolders.find(folder => folder.id === activeRepositoryFolderId) || customerRepositoryFolders[0];
  const activeRepositoryFiles =
    selectedCustomer && activeRepositoryFolder
      ? (selectedCustomer.files || []).filter(
          (file: any) =>
            file.name !== '.placeholder' &&
            resolveCustomerFileFolderId(file, customerRepositoryFolders) === activeRepositoryFolder.id
        )
      : [];
  const activeRepositoryContracts =
    selectedCustomer && activeRepositoryFolder?.id === 'contracts' ? selectedCustomer.contracts || [] : [];
  const activeRepositoryDocuments =
    selectedCustomer && activeRepositoryFolder
      ? (selectedCustomer.documents || []).filter(
          (documentRecord: any) =>
            (DOCUMENT_REPOSITORY_FOLDER_IDS[documentRecord.category] || 'other') === activeRepositoryFolder.id
        )
      : [];

  const repositoryPreviewItems = selectedCustomer
    ? ([
        ...(selectedCustomer.files || [])
          .filter((file: Record<string, unknown>) => file.name !== '.placeholder')
          .map((file: Record<string, unknown>) => ({
            id: `file-${file.id}`,
            name: String(file.name || t('Tệp tài liệu')),
            folderId: resolveCustomerFileFolderId(file, customerRepositoryFolders),
            date: String(file.createdAt || ''),
            source: String(file.base64 || file.data || file.url || '')
          })),
        ...(selectedCustomer.contracts || []).map((contract: Record<string, unknown>) => ({
          id: `contract-${contract.id}`,
          name: String(contract.contractNo || t('Hợp đồng chưa có số')),
          folderId: 'contracts',
          date: String(contract.signDate || contract.createdAt || ''),
          source: String(contract.fileUrl || '')
        })),
        ...(selectedCustomer.documents || []).map((documentRecord: Record<string, unknown>) => ({
          id: `document-${documentRecord.id}`,
          name: String(documentRecord.name || t('Tài liệu chưa đặt tên')),
          folderId: DOCUMENT_REPOSITORY_FOLDER_IDS[String(documentRecord.category)] || 'other',
          date: String(documentRecord.createdAt || ''),
          source: String(documentRecord.url || '')
        }))
      ] as Array<{ id: string; name: string; folderId: string; date: string; source: string }>)
    : [];
  const visibleRepositoryPreview = repositoryPreviewItems.filter(
    item => !repositoryPreviewFolder || item.folderId === repositoryPreviewFolder
  );

  const getCustomerOrderValue = (customerId: string) =>
    getCustomerOrders(customerId).reduce(
      (total, order) => total + Number(order.netAmount || order.totalAmount || 0),
      0
    );

  const getCustomerOutstandingDebt = (customerId: string) => finance.get('ar', customerId)?.debt;

  const isNewCustomer = (customer: CustomerRecord): boolean => {
    const createdDate = parseValidDate(customer.createdAt || customer.convertedAt);
    if (!createdDate) return false;
    const ageInMilliseconds = today.getTime() - createdDate.getTime();
    return ageInMilliseconds >= 0 && ageInMilliseconds < 7 * 86_400_000;
  };

  const customerListFilters = useCustomerListFilters({
    accessibleCustomers,
    accessibleCustomerIds,
    leads,
    pos,
    users,
    customFieldDefinitions,
    customerFilterById,
    systemFilterDefinitions,
    inlineSystemFieldConfiguration,
    customerMaterialsById,
    getCustomerOrders,
    getCustomerOrderValue,
    getCustomerOutstandingDebt,
    today,
    t
  });
  const {
    searchTerm,
    setSearchTerm,
    showListFilters,
    setShowListFilters,
    setCustomerPage,
    customerPageSize,
    setCustomerPageSize,
    provinceByCustomerId,
    activeFilterCount,
    resetCrmListFilters,
    crmFilterChips,
    filteredCustomers,
    customerTotalPages,
    safeCustomerPage,
    displayedCustomers
  } = customerListFilters;
  const selectedCustomerSamples = selectedCustomer ? customerSamplesById[selectedCustomer.id] || [] : [];
  const storedCustomerProducts = selectedCustomer
    ? ((selectedCustomer.products || []) as CustomerProductRecord[]).filter(product => !product.deleted)
    : [];
  const matchedSampleKeys = new Set<string>();
  const selectedCustomerProducts = [
    ...storedCustomerProducts.map(product => {
      const productCodes = getCustomerProductCodes(product);
      const matchingSample = selectedCustomerSamples.find(
        sample =>
          (product.productCode && productCodes.includes(normalizeProductCode(sample.productCode))) ||
          (!product.productCode &&
            normalizeFilterValue(sample.productName) === normalizeFilterValue(product.productName))
      );
      selectedCustomerSamples
        .filter(sample => productCodes.includes(normalizeProductCode(sample.productCode)))
        .forEach(sample => matchedSampleKeys.add(sample.key));
      if (matchingSample) matchedSampleKeys.add(matchingSample.key);
      const orderHistory = getCustomerProductOrderHistory(
        product,
        selectedCustomer ? getCustomerOrders(selectedCustomer.id) : []
      );
      const assets = Array.from(
        new Set(
          [product.layoutUrl, ...(product.designLayouts || []), ...(product.files || [])]
            .map(getProductAssetSource)
            .filter(Boolean)
        )
      );
      return {
        key: product.id,
        record: product,
        productCode: product.productCode,
        productName: product.productName,
        material: product.material || matchingSample?.material || '',
        specification: getCustomerProductSize(product) || matchingSample?.specification || '',
        unit: product.unit || matchingSample?.unit || 'cái',
        ...orderHistory,
        lastOrderedAt: matchingSample?.lastOrderedAt || '',
        previewImage:
          product.layoutUrl ||
          assets.find(asset => asset.startsWith('data:image/')) ||
          matchingSample?.previewImage ||
          '',
        assetCount: assets.length || (matchingSample?.previewImage ? 1 : 0)
      };
    }),
    ...selectedCustomerSamples
      .filter(sample => !matchedSampleKeys.has(sample.key))
      .map(sample => ({
        ...sample,
        record: null,
        assetCount: sample.previewImage ? 1 : 0
      }))
  ];

  const renderProductCommercialFields = () => (
    <div className="product-commercial-fields">
      <div className="form-group">
        <label>{t('Đơn Vị Tính')}</label>
        <input
          value={productUnit}
          onChange={event => setProductUnit(event.target.value)}
          placeholder={t('cái, cuộn, tờ...')}
        />
      </div>
      <div className="form-group">
        <label>{t('Thuế VAT (%)')}</label>
        <input
          type="number"
          min="0"
          max="100"
          value={productVatRate}
          onChange={event => setProductVatRate(Number(event.target.value))}
        />
      </div>
      <div className="form-group">
        <label>{t('Nhà Cung Cấp Thường Dùng')}</label>
        <select value={productSupplierId} onChange={event => setProductSupplierId(event.target.value)}>
          <option value="">{t('-- Chọn nhà cung cấp --')}</option>
          {suppliers
            .filter(supplier => !supplier.deleted)
            .map(supplier => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.supplierName}
              </option>
            ))}
        </select>
      </div>
      <div className="form-group">
        <label>{t('Giá Mua Tham Khảo (đ)')}</label>
        <input
          type="number"
          min="0"
          value={productPurchasePrice}
          onChange={event => setProductPurchasePrice(Number(event.target.value))}
        />
      </div>
      <div className="form-group">
        <label>{t('Chiết Khấu Sản Phẩm')}</label>
        <select
          value={productDiscountType}
          onChange={event => setProductDiscountType(event.target.value as PODiscountType)}
        >
          <option value="percent">{t('Theo phần trăm (%)')}</option>
          <option value="amount">{t('Theo tiền chênh (đ)')}</option>
        </select>
      </div>
      <div className="form-group">
        <label>{productDiscountType === 'amount' ? t('Tiền Chênh (đ)') : t('Tỷ Lệ Chiết Khấu (%)')}</label>
        {productDiscountType === 'amount' ? (
          <input
            type="number"
            min="0"
            value={productDiscountAmount}
            onChange={event => setProductDiscountAmount(Number(event.target.value))}
          />
        ) : (
          <input
            type="number"
            min="0"
            max="100"
            value={productDiscountRate}
            onChange={event => setProductDiscountRate(Number(event.target.value))}
          />
        )}
      </div>
      <div className="form-group">
        <label>{t('Thời Gian Chuẩn Bị (ngày)')}</label>
        <input
          type="number"
          min="0"
          value={productLeadTimeDays}
          onChange={event => setProductLeadTimeDays(Number(event.target.value))}
        />
      </div>
    </div>
  );

  const handleCopyOnboardingProfile = async () => {
    const assignedSaleName = users.find(user => user.uid === assignedSaleId)?.displayName || 'Chưa phân công';
    const profile = createCopyableProfile('HỒ SƠ DOANH NGHIỆP', [
      ['Mã khách hàng', customerCode],
      ['Hạng khách hàng', customerRank ? `Hạng ${customerRank}` : 'Chưa xếp hạng'],
      ['Tên công ty', companyName],
      ['Mã số thuế', taxCode],
      ['Website', website],
      ['Lĩnh vực hoạt động', businessSector],
      ['Sale phụ trách', assignedSaleName],
      ['Nguồn dữ liệu', source],
      ['Đường dẫn nguồn', sourceUrl],
      ['Sản phẩm / nhu cầu quan tâm', expectedProducts]
    ]);
    try {
      await copyTextToClipboard(profile);
      showSuccessToast('Đã sao chép thành công');
    } catch {
      window.alert('Không thể sao chép. Vui lòng thử lại.');
    }
  };

  const handleCopyCustomerInformation = async (customer: CustomerRecord) => {
    const assignedSaleName = users.find(user => user.uid === customer.assignedSaleId)?.displayName || 'Chưa phân công';
    const profile = createCopyableProfile('THÔNG TIN DOANH NGHIỆP', [
      ['Mã khách hàng', customer.customerCode || customer.id],
      ['Tên công ty', customer.companyName],
      ['Hạng khách hàng', customer.customerRank ? `Hạng ${customer.customerRank}` : 'Chưa xếp hạng'],
      ['Mã số thuế', customer.taxCode],
      ['Website', customer.website],
      ['Lĩnh vực hoạt động', customer.businessSector],
      ['Địa chỉ giao hàng', customer.address],
      ['Người liên hệ', customer.contactPerson],
      ['Chức vụ', customer.contactPosition],
      ['Số điện thoại', customer.phone],
      ['Email', customer.email],
      ['Sale phụ trách', assignedSaleName],
      ['Nguồn dữ liệu', customer.source],
      ['Đường dẫn nguồn', customer.sourceUrl],
      ['Sản phẩm / nhu cầu quan tâm', customer.expectedProducts],
      ['Hạn mức công nợ', `${Number(customer.debtLimit || 0).toLocaleString('vi-VN')} đ`],
      ['Điều khoản thanh toán', customer.paymentTerms],
      ['Ghi chú', customer.note]
    ]);
    try {
      await copyTextToClipboard(profile);
      showSuccessToast('Đã sao chép thành công');
    } catch {
      window.alert('Không thể sao chép. Vui lòng thử lại.');
    }
  };

  const renderAdditionalContactsEditor = () => (
    <div className="customer-contact-editor">
      <div className="customer-contact-editor__header">
        <div>
          <strong>{t('Đầu mối liên hệ bổ sung')}</strong>
          <span>{t('Lưu riêng người phụ trách mua hàng, kho, kế toán hoặc đầu mối khác.')}</span>
        </div>
        <button type="button" className="btn btn-sm btn-outline" onClick={addContactRow}>
          <Plus size={14} /> {t('Thêm liên hệ')}
        </button>
      </div>
      {additionalContacts.map(contact => (
        <div key={contact.id} className="customer-contact-editor__row">
          <select value={contact.role} onChange={event => updateContactRow(contact.id, 'role', event.target.value)}>
            {Object.entries(CONTACT_ROLE_LABELS)
              .filter(([role]) => role !== 'primary')
              .map(([role, label]) => (
                <option key={role} value={role}>
                  {t(label)}
                </option>
              ))}
          </select>
          <input
            value={contact.name}
            onChange={event => updateContactRow(contact.id, 'name', event.target.value)}
            placeholder={t('Họ tên')}
          />
          <input
            value={contact.phone}
            onChange={event => updateContactRow(contact.id, 'phone', event.target.value)}
            placeholder={t('Số điện thoại')}
          />
          <input
            value={contact.email}
            onChange={event => updateContactRow(contact.id, 'email', event.target.value)}
            placeholder="Email"
          />
          <button
            type="button"
            className="btn btn-sm btn-danger btn-symbol-sm"
            onClick={() => setAdditionalContacts(previous => previous.filter(item => item.id !== contact.id))}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );

  const renderCustomerOnboardingTables = (includeOrderItems = true) => (
    <div className="customer-onboarding-tables">
      <div className="customer-onboarding-profile-grid">
        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading customer-data-section__heading--actions">
            <div>
              <Building2 size={16} />
              <span>Hồ sơ doanh nghiệp</span>
            </div>
            <button
              type="button"
              className="customer-profile-copy-button"
              onClick={() => void handleCopyOnboardingProfile()}
              title="Sao chép hồ sơ doanh nghiệp"
            >
              <Copy size={13} /> Sao chép
            </button>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="companyName">Tên công ty *</span>
              <input
                type="text"
                value={companyName}
                onChange={event => setCompanyName(event.target.value)}
                placeholder="Nhập tên doanh nghiệp..."
                required
              />
            </label>
            <label className="form-group">
              <span data-system-label="customerCode">Mã khách hàng *</span>
              <input
                type="text"
                value={customerCode}
                onChange={event => setCustomerCode(event.target.value)}
                required
              />
            </label>
            <label className="form-group">
              <span data-system-label="taxCode">Mã số thuế</span>
              <input type="text" value={taxCode} onChange={event => setTaxCode(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="customerRank">Hạng khách hàng *</span>
              <select
                value={customerRank}
                onChange={event => setCustomerRank(event.target.value as CustomerRank)}
                required
              >
                <option value="">Chọn hạng</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </label>
            <label className="form-group">
              <span data-system-label="assignedSaleId">Sale phụ trách</span>
              <select
                value={assignedSaleId}
                onChange={event => setAssignedSaleId(event.target.value)}
                disabled={currentUser.role === 'sale'}
              >
                {saleUsers.map(sale => (
                  <option key={sale.uid} value={sale.uid}>
                    {sale.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group">
              <span data-system-label="website">Website</span>
              <input
                type="url"
                value={website}
                onChange={event => setWebsite(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="form-group">
              <span data-system-label="businessSector">Lĩnh vực hoạt động</span>
              <input
                value={businessSector}
                onChange={event => setBusinessSector(event.target.value)}
                placeholder="Ví dụ: Bao bì, thực phẩm, điện tử..."
              />
            </label>
          </div>
          <EntityCustomFieldsGrid
            definitions={customFieldDefinitions.filter(definition => definition.section === 'company')}
            values={customFieldValues}
            role={currentUser.role}
            onChange={setCustomFieldValues}
          />
          <div className="customer-profile-card__field-manager">
            <InlineEntityFieldManager
              table="customers"
              section="company"
              sectionLabel="Hồ sơ doanh nghiệp"
              definitions={customFieldDefinitions}
              currentUser={currentUser}
              systemConfiguration={inlineSystemFieldConfiguration}
              onCustomFieldPurged={clearPurgedCustomField}
              onSystemFieldPurged={clearPurgedSystemField}
              systemFields={[
                { key: 'taxCode', label: 'Mã số thuế' },
                { key: 'assignedSaleId', label: 'Sale phụ trách' },
                { key: 'website', label: 'Website' },
                { key: 'businessSector', label: 'Lĩnh vực hoạt động' }
              ]}
            />
          </div>
        </section>

        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading">
            <MapPinned size={16} />
            <span>Địa bàn doanh nghiệp</span>
          </div>
          <div className="customer-profile-card__body customer-location-section">
            <BusinessLocationFields
              province={province}
              ward={ward}
              industrialPark={industrialPark}
              onChange={location => {
                setProvince(location.province);
                setWard(location.ward);
                setIndustrialPark(location.industrialPark);
              }}
            />
            <label className="form-group customer-location-address">
              <span data-system-label="address">Địa chỉ chi tiết / giao hàng</span>
              <input
                value={address}
                onChange={event => setAddress(event.target.value)}
                placeholder="Số nhà, đường, lô đất..."
              />
            </label>
            <div className="customer-location-preview">
              <span>Địa chỉ đang chọn</span>
              <strong>
                {[address, industrialPark, ward, province].filter(Boolean).join(', ') ||
                  'Chưa chọn địa bàn doanh nghiệp'}
              </strong>
            </div>
          </div>
          <EntityCustomFieldsGrid
            definitions={customFieldDefinitions.filter(definition => definition.section === 'classification')}
            values={customFieldValues}
            role={currentUser.role}
            onChange={setCustomFieldValues}
          />
          <div className="customer-profile-card__field-manager">
            <InlineEntityFieldManager
              table="customers"
              section="classification"
              sectionLabel="Địa bàn doanh nghiệp"
              definitions={customFieldDefinitions}
              currentUser={currentUser}
              systemConfiguration={inlineSystemFieldConfiguration}
              onCustomFieldPurged={clearPurgedCustomField}
              onSystemFieldPurged={clearPurgedSystemField}
              systemFields={[
                { key: 'province', label: 'Tỉnh / thành' },
                { key: 'ward', label: 'Phường / xã' },
                { key: 'industrialPark', label: 'Khu công nghiệp' },
                { key: 'address', label: 'Địa chỉ chi tiết / giao hàng' }
              ]}
            />
          </div>
        </section>

        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading">
            <Users size={16} />
            <span>Liên hệ và giao nhận</span>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            <label className="form-group">
              <span data-system-label="contactPerson">Người liên hệ</span>
              <input value={contactPerson} onChange={event => setContactPerson(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="contactPosition">Chức vụ</span>
              <input value={contactPosition} onChange={event => setContactPosition(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="phone">Số điện thoại</span>
              <input value={phone} onChange={event => setPhone(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="procurementPhone">SĐT thu mua</span>
              <input value={procurementPhone} onChange={event => setProcurementPhone(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="warehousePhone">SĐT nhận hàng / kho</span>
              <input value={warehousePhone} onChange={event => setWarehousePhone(event.target.value)} />
            </label>
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="email">Email</span>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} />
            </label>
          </div>
          <EntityCustomFieldsGrid
            definitions={customFieldDefinitions.filter(definition => definition.section === 'contact')}
            values={customFieldValues}
            role={currentUser.role}
            onChange={setCustomFieldValues}
          />
          <div className="customer-profile-card__field-manager">
            <InlineEntityFieldManager
              table="customers"
              section="contact"
              sectionLabel="Liên hệ và giao nhận"
              definitions={customFieldDefinitions}
              currentUser={currentUser}
              systemConfiguration={inlineSystemFieldConfiguration}
              onCustomFieldPurged={clearPurgedCustomField}
              onSystemFieldPurged={clearPurgedSystemField}
              systemFields={[
                { key: 'contactPerson', label: 'Người liên hệ' },
                { key: 'contactPosition', label: 'Chức vụ' },
                { key: 'phone', label: 'Số điện thoại' },
                { key: 'procurementPhone', label: 'SĐT thu mua' },
                { key: 'warehousePhone', label: 'SĐT nhận hàng / kho' },
                { key: 'email', label: 'Email' }
              ]}
            />
          </div>
        </section>

        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading">
            <ShoppingBag size={16} />
            <span>Điều khoản thương mại</span>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            {!inlineSystemFieldConfiguration.fields.find(field => field.key === 'discountType')?.removed && (
              <>
                <label className="form-group">
                  <span data-system-label="discountType">Hình thức chiết khấu</span>
                  <select
                    value={discountType}
                    onChange={event => setDiscountType(event.target.value as PODiscountType)}
                  >
                    <option value="percent">Theo phần trăm (%)</option>
                    <option value="amount">Theo tiền chênh (đ)</option>
                  </select>
                </label>
                <label className="form-group">
                  <span>{discountType === 'amount' ? 'Tiền chênh mặc định (đ)' : 'Chiết khấu mặc định (%)'}</span>
                  {discountType === 'amount' ? (
                    <input
                      type="number"
                      min="0"
                      value={discountAmount}
                      onChange={event => setDiscountAmount(Number(event.target.value))}
                    />
                  ) : (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountRate}
                      onChange={event => setDiscountRate(Number(event.target.value))}
                    />
                  )}
                </label>
              </>
            )}
            <label className="form-group">
              <span data-system-label="debtLimit">Hạn mức công nợ (đ)</span>
              <input
                type="number"
                min="0"
                value={debtLimit}
                onChange={event => setDebtLimit(Number(event.target.value))}
              />
            </label>
            <label className="form-group">
              <span data-system-label="paymentTerms">Điều khoản thanh toán</span>
              <select value={paymentTerms} onChange={event => setPaymentTerms(event.target.value)}>
                <option value="Thanh toán trước">Thanh toán trước</option>
                <option value="Thanh toán khi nhận hàng">Thanh toán khi nhận hàng</option>
                <option value="30 ngày">30 ngày kể từ khi giao hàng</option>
                <option value="45 ngày">45 ngày kể từ khi giao hàng</option>
                <option value="60 ngày">60 ngày kể từ khi giao hàng</option>
              </select>
            </label>
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="bankAccount">Tài khoản ngân hàng</span>
              <input
                value={bankAccount}
                onChange={event => setBankAccount(event.target.value)}
                placeholder="Số tài khoản, ngân hàng, chi nhánh..."
              />
            </label>
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="note">Ghi chú yêu cầu riêng</span>
              <input value={note} onChange={event => setNote(event.target.value)} />
            </label>
          </div>
          <EntityCustomFieldsGrid
            definitions={customFieldDefinitions.filter(definition => definition.section === 'additional')}
            values={customFieldValues}
            role={currentUser.role}
            onChange={setCustomFieldValues}
          />
          <div className="customer-profile-card__field-manager">
            <InlineEntityFieldManager
              table="customers"
              section="additional"
              sectionLabel="Điều khoản thương mại"
              definitions={customFieldDefinitions}
              currentUser={currentUser}
              systemConfiguration={inlineSystemFieldConfiguration}
              onCustomFieldPurged={clearPurgedCustomField}
              onSystemFieldPurged={clearPurgedSystemField}
              systemFields={[
                { key: 'discountType', label: 'Hình thức chiết khấu' },
                { key: 'debtLimit', label: 'Hạn mức công nợ (đ)' },
                { key: 'paymentTerms', label: 'Điều khoản thanh toán' },
                { key: 'bankAccount', label: 'Tài khoản ngân hàng' },
                { key: 'note', label: 'Ghi chú yêu cầu riêng' }
              ]}
            />
          </div>
        </section>

        <section className="customer-data-section customer-profile-card customer-profile-card--wide">
          <div className="customer-data-section__heading">
            <span>Nguồn và nhu cầu kế thừa</span>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            <label className="form-group">
              <span data-system-label="source">Nguồn dữ liệu</span>
              <input
                value={source}
                onChange={event => setSource(event.target.value)}
                placeholder="Google Maps, giới thiệu, dữ liệu nội bộ..."
              />
            </label>
            <label className="form-group">
              <span data-system-label="sourceUrl">Đường dẫn nguồn</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={event => setSourceUrl(event.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="form-group">
              <span data-system-label="discoveredById">Sale tìm được khách hàng</span>
              <select
                value={discoveredById}
                onChange={event => setDiscoveredById(event.target.value)}
                disabled={currentUser.role === 'sale'}
              >
                <option value="">Chưa xác định</option>
                {saleUsers.map(sale => (
                  <option key={sale.uid} value={sale.uid}>
                    {sale.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="expectedProducts">Sản phẩm / nhu cầu quan tâm</span>
              <textarea
                rows={3}
                value={expectedProducts}
                onChange={event => setExpectedProducts(event.target.value)}
                placeholder="Nhu cầu được kế thừa từ Dữ liệu thô và Tiềm năng..."
              />
            </label>
          </div>
          <EntityCustomFieldsGrid
            definitions={customFieldDefinitions.filter(definition => definition.section === 'needs')}
            values={customFieldValues}
            role={currentUser.role}
            onChange={setCustomFieldValues}
          />
          <div className="customer-profile-card__field-manager">
            <InlineEntityFieldManager
              table="customers"
              section="needs"
              sectionLabel="Nguồn và nhu cầu kế thừa"
              definitions={customFieldDefinitions}
              currentUser={currentUser}
              systemConfiguration={inlineSystemFieldConfiguration}
              onCustomFieldPurged={clearPurgedCustomField}
              onSystemFieldPurged={clearPurgedSystemField}
              systemFields={[
                { key: 'source', label: 'Nguồn dữ liệu' },
                { key: 'sourceUrl', label: 'Đường dẫn nguồn' },
                { key: 'discoveredById', label: 'Sale tìm được khách hàng' },
                { key: 'expectedProducts', label: 'Sản phẩm / nhu cầu quan tâm' }
              ]}
            />
          </div>
        </section>

        {renderAdditionalContactsEditor()}
      </div>

      {includeOrderItems && (
        <CustomerOnboardingItems
          items={onboardingItems}
          customerPoCode={onboardingCustomerPoCode}
          expectedDeliveryDate={onboardingExpectedDeliveryDate}
          notes={onboardingOrderNotes}
          suppliers={suppliers}
          defaultDiscountType={discountType}
          defaultDiscountRate={discountRate}
          defaultDiscountAmount={discountAmount}
          onItemsChange={setOnboardingItems}
          onCustomerPoCodeChange={setOnboardingCustomerPoCode}
          onExpectedDeliveryDateChange={setOnboardingExpectedDeliveryDate}
          onNotesChange={setOnboardingOrderNotes}
        />
      )}
    </div>
  );

  if (showProductEditor && selectedCustomer)
    return (
      <CustomerProductEditor
        key={selectedCustomer.id}
        customer={selectedCustomer}
        currentUser={currentUser}
        classifications={productClassifications}
        suppliers={suppliers}
        onClose={() => setShowProductEditor(false)}
        onCreated={(products, product) => {
          setSelectedCustomer((previous: CustomerRecord | null) => (previous ? { ...previous, products } : previous));
          setCustomerHistoryTab('products');
          setShowProductEditor(false);
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'crm',
            action: 'customer_product_created',
            summary: `Tạo mã sản phẩm ${product.productCode} cho ${selectedCustomer.companyName}`,
            targetType: 'customer',
            targetId: selectedCustomer.id,
            targetLabel: selectedCustomer.companyName
          });
          onRefresh();
        }}
      />
    );

  return (
    <SystemFieldSurface table="customers" className={`crm-view ${selectedCustomer ? 'crm-view--detail' : ''}`}>
      <PageContextHeader
        section={t('Khách hàng')}
        current={selectedCustomer ? t('Chi tiết khách hàng') : filterType === 'overview' ? 'Tổng quan' : t('Tất cả')}
      />

      {currentUser.role === 'admin' &&
        (editRequests.some(r => r.status === 'pending') || customers.some(c => c.deleteRequested && !c.deleted)) && (
          <div
            className="card"
            style={{
              border: '2px solid var(--color-primary-light)',
              backgroundColor: '#f0fdf4',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              marginBottom: '20px'
            }}
          >
            <div
              className="card-header"
              style={{ paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}
            >
              <span
                className="card-title"
                style={{
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 'bold'
                }}
              >
                <AlertCircle size={20} />
                {t('BẢNG ĐIỀU HÀNH PHÊ DUYỆT (ADMIN APPROVALS)')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sortNewestFirst(
                customers.filter(c => c.deleteRequested && !c.deleted),
                customer => [customer.deleteRequestedAt, customer.updatedAt, customer.createdAt]
              ).map(cust => (
                <div
                  key={cust.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px',
                    border: '1px solid #fed7d7',
                    borderRadius: '4px',
                    backgroundColor: '#fff5f5'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>
                      [${t('YÊU CẦU XÓA KHÁCH HÀNG')}]{' '}
                    </span>
                    <strong>{cust.companyName}</strong> - {t('Yêu cầu bởi:')} {cust.deleteRequestedBy || 'Sale'}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => handleApproveDeleteCustomer(cust)}
                    >
                      {t('Duyệt Xóa')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => handleRejectDeleteCustomer(cust)}
                    >
                      {t('Hủy Yêu Cầu')}
                    </button>
                  </div>
                </div>
              ))}

              {sortNewestFirst(
                editRequests.filter(r => r.status === 'pending'),
                request => [request.requestedAt, request.createdAt]
              ).map(req => (
                <div
                  key={req.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'bold', color: 'var(--color-warning)' }}>
                      [${t('YÊU CẦU CHỈNH SỬA')}]{' '}
                    </span>
                    <strong>{req.fieldName}</strong> - {t('Yêu cầu bởi:')} {req.requestedBy} (
                    {formatDateTime(req.requestedAt, 'vi-VN', '')})
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setSelectedEditRequest(req);
                        setShowCompareModal(true);
                      }}
                    >
                      {t('Xem So Sánh (Diff)')}
                    </button>
                    <button type="button" className="btn btn-sm btn-success" onClick={() => handleApproveRequest(req)}>
                      {t('Duyệt')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ color: 'red', borderColor: 'red' }}
                      onClick={() => handleRejectRequest(req)}
                    >
                      {t('Từ Chối')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      <>
        <div className="crm-command-center crm-data-workspace">
          <div className="crm-list-commandbar">
            <div
              className="crm-list-tabs content-tabs content-tabs--commandbar"
              role="tablist"
              aria-label={t('Chọn nhóm khách hàng')}
            >
              <button
                type="button"
                className={`crm-list-tab ${filterType === 'overview' ? 'is-active' : ''}`}
                onClick={() => setFilterType('overview')}
                role="tab"
                aria-selected={filterType === 'overview'}
              >
                Tổng quan
              </button>
              <button
                type="button"
                className={`crm-list-tab ${filterType === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setFilterType('all');
                  setCustomerPage(1);
                }}
                role="tab"
                aria-selected={filterType === 'all'}
              >
                <span>{t('Tất cả')}</span>
              </button>
            </div>
            <div className="crm-list-toolbar">
              {filterType === 'all' && (
                <>
                  <div className="crm-list-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder={t('Tìm công ty, mã KH, liên hệ, SĐT, MST...')}
                      value={searchTerm}
                      onChange={event => {
                        setSearchTerm(event.target.value);
                        setCustomerPage(1);
                      }}
                    />
                  </div>
                  <DataFilterButton
                    activeCount={activeFilterCount}
                    open={showListFilters}
                    onClick={() => setShowListFilters(true)}
                  />
                  {canEditColumns && (
                    <button
                      type="button"
                      className="lead-candidate-column-button"
                      aria-label={t('Tùy chỉnh cột')}
                      title={t('Tùy chỉnh cột')}
                      onClick={() => setShowColumnCustomizer(true)}
                    >
                      <Settings2 size={16} />
                    </button>
                  )}
                  {(searchTerm || activeFilterCount > 0) && (
                    <button type="button" className="btn btn-outline crm-reset-filters" onClick={resetCrmListFilters}>
                      <X size={14} /> {t('Đặt lại')}
                    </button>
                  )}
                </>
              )}
              {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                <button
                  className="btn btn-primary crm-add-customer"
                  onClick={() => openAddModal()}
                  title={t('Thêm Khách Hàng Mới')}
                >
                  <Plus size={18} />
                  <span>{t('Thêm khách hàng')}</span>
                </button>
              )}
            </div>
          </div>

          <PartnerDebtNotice loaded={finance.loaded} error={finance.error} reload={finance.reload} />
          {filterType === 'overview' ? (
            <CustomerOverview
              debtByCustomerId={new Map(finance.rows.filter(r => r.side === 'ar').map(r => [r.partnerId, r.debt]))}
              debtReady={finance.loaded}
              customers={accessibleCustomers}
              orders={pos}
              invoices={invoices}
              provinceByCustomerId={provinceByCustomerId}
              onOpenCustomer={openCustomerDetail}
            />
          ) : (
            <>
              <DataFilterChipBar chips={crmFilterChips} onClear={resetCrmListFilters} />

              <CustomerListFilterPanel filters={customerListFilters} customFieldDefinitions={customFieldDefinitions} />

              <CustomerListTable
                leads={leads}
                users={users}
                currentUser={currentUser}
                filteredCustomers={filteredCustomers}
                displayedCustomers={displayedCustomers}
                page={safeCustomerPage}
                totalPages={customerTotalPages}
                pageSize={customerPageSize}
                onPageChange={setCustomerPage}
                onPageSizeChange={setCustomerPageSize}
                columnLabels={customerColumnLabels}
                visibleColumnIds={visibleCustomerColumnIds}
                visibleColumnCount={visibleCustomerColumnCount}
                orderedColumnIds={orderedCustomerColumnIds}
                getHeaderProps={getCustomerHeaderProps}
                visibleCustomFields={visibleCustomerCustomFields}
                getCustomerOrders={getCustomerOrders}
                getCustomerOrderValue={getCustomerOrderValue}
                isNewCustomer={isNewCustomer}
                onOpenCustomer={openCustomerDetail}
                onEditCustomer={openEditModal}
                onDeleteCustomer={handleDeleteCustomer}
                onPreparedOrderCreated={onPreparedOrderCreated}
                onAssignWork={setAssignmentTarget}
                onRequestSupport={setSupportTarget}
                onShowProductEditor={setShowProductEditor}
              />
            </>
          )}
        </div>

        <TableColumnCustomizer
          open={showColumnCustomizer}
          columns={customerColumnOptions}
          selectedIds={Array.from(visibleCustomerColumnIds)}
          onClose={() => setShowColumnCustomizer(false)}
          onSave={saveVisibleCustomerColumns}
        />

        {/* SELECTED CUSTOMER DETAIL */}
        {selectedCustomer && (
          <div
            className={`customer-details-grid customer-detail-workspace customer-detail-workspace--${customerHistoryTab}`}
          >
            <div className="partner-debt-summary">
              <PartnerDebtNotice loaded={finance.loaded} error={finance.error} reload={finance.reload} />
              <p>
                Nợ sổ mới: <PartnerDebtValue row={finance.get('ar', selectedCustomer.id)} />
              </p>
            </div>
            <div className="customer-detail-header">
              <PageBackButton
                onClick={() => {
                  if (customerHistoryTab !== 'overview') {
                    setCustomerHistoryTab('overview');
                    return;
                  }
                  closeCustomerDetail();
                }}
              />
              <div className="customer-detail-heading">
                <div className="customer-detail-heading__title">
                  <h1 title={selectedCustomer.companyName}>{selectedCustomer.companyName}</h1>
                </div>
              </div>
              <div className="crm-detail-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  aria-expanded={isCompanyInfoExpanded}
                  aria-controls="customer-company-information"
                  onClick={() => setIsCompanyInfoExpanded(value => !value)}
                >
                  {t('Thông tin doanh nghiệp')}
                </button>
                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                  <>
                    <PhoneCallCell
                      toolbar
                      phone={detailCallPhone || selectedCustomer.phone}
                      companyName={selectedCustomer.companyName}
                      subjectKey={customerCallSubjectKey(selectedCustomer)}
                      historyKeys={customerCallHistoryKeys(selectedCustomer, leads)}
                      auditModule="crm"
                      targetType="customer"
                      targetId={selectedCustomer.id}
                      currentUser={currentUser}
                      canRecord={
                        currentUser.role === 'admin' ||
                        (currentUser.role === 'sale' &&
                          (!selectedCustomer.assignedSaleId || selectedCustomer.assignedSaleId === currentUser.uid))
                      }
                    />
                    <button type="button" className="btn btn-primary" onClick={() => openEditModal(selectedCustomer)}>
                      {t('Chỉnh sửa hồ sơ')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-symbol-sm crm-detail-delete"
                      onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                      title={t('Xóa khách hàng')}
                      aria-label={t('Xóa khách hàng')}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="customer-profile-column">
              <section
                id="customer-company-information"
                className="card customer-company-card"
                hidden={!isCompanyInfoExpanded}
              >
                <div className="crm-company-accordion-row">
                  <button
                    type="button"
                    className="crm-company-accordion-trigger"
                    aria-expanded={isCompanyInfoExpanded}
                    onClick={() => setIsCompanyInfoExpanded(value => !value)}
                  >
                    <span className="card-title">{t('Thông tin doanh nghiệp')}</span>
                    <span
                      className="customer-company-summary-inline"
                      title={[selectedCustomer.contactPerson, selectedCustomer.phone, selectedCustomer.email]
                        .filter(Boolean)
                        .join(' · ')}
                    >
                      {selectedCustomer.contactPerson || t('Chưa có liên hệ')} ·{' '}
                      {selectedCustomer.phone || t('Chưa có điện thoại')} ·{' '}
                      {users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}
                    </span>
                    <span className="crm-company-accordion-action">
                      {isCompanyInfoExpanded ? t('Thu gọn') : t('Xem đầy đủ')}
                    </span>
                  </button>
                  {isCompanyInfoExpanded && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => void handleCopyCustomerInformation(selectedCustomer)}
                      title={t('Sao chép thông tin doanh nghiệp')}
                    >
                      {t('Sao chép')}
                    </button>
                  )}
                </div>

                {isCompanyInfoExpanded && (
                  <div className="customer-company-expanded">
                    <div className="customer-company-detail-grid">
                      <span>{t('Liên hệ chính')}</span>
                      <strong>{selectedCustomer.contactPerson || t('Chưa cập nhật')}</strong>
                      <span>{t('Chức vụ')}</span>
                      <strong>{selectedCustomer.contactPosition || t('Chưa cập nhật')}</strong>
                      <span>{t('Điện thoại')}</span>
                      <strong>{selectedCustomer.phone || t('Chưa cập nhật')}</strong>
                      <span>{t('Email')}</span>
                      <strong>{selectedCustomer.email || t('Chưa cập nhật')}</strong>
                      <span>{t('Sale phụ trách')}</span>
                      <strong>
                        {users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}
                      </strong>
                      <span>{t('Mã số thuế')}</span>
                      <strong>{selectedCustomer.taxCode || t('Chưa cung cấp')}</strong>
                      <span>{t('Website')}</span>
                      <strong>{selectedCustomer.website || t('Chưa cập nhật')}</strong>
                      <span>{t('Lĩnh vực hoạt động')}</span>
                      <strong>{selectedCustomer.businessSector || t('Chưa cập nhật')}</strong>
                      <span>{t('Địa chỉ giao hàng')}</span>
                      <strong>{selectedCustomer.address || t('Chưa cập nhật')}</strong>
                      <span>{t('Nguồn dữ liệu')}</span>
                      <strong>{selectedCustomer.source || t('Chưa cập nhật')}</strong>
                      <span>{t('Đường dẫn nguồn')}</span>
                      <strong>{selectedCustomer.sourceUrl || t('Chưa cập nhật')}</strong>
                      <span>{t('Sale tìm được khách hàng')}</span>
                      <strong>
                        {users.find(u => u.uid === selectedCustomer.discoveredById)?.displayName ||
                          selectedCustomer.discoveredByName ||
                          t('Chưa xác định')}
                      </strong>
                      <span>{t('Sản phẩm / nhu cầu quan tâm')}</span>
                      <strong>{selectedCustomer.expectedProducts || t('Chưa cập nhật')}</strong>
                      {(
                        selectedCustomer.customFields || [
                          {
                            id: 'discount',
                            name: t('Chiết khấu mặc định'),
                            value:
                              selectedCustomer.discountType === 'amount'
                                ? `${Number(selectedCustomer.discountAmount || 0).toLocaleString('vi-VN')} đ`
                                : `${Number(selectedCustomer.discountRate || 0)}%`
                          },
                          { id: 'debtLimit', name: t('Hạn mức công nợ (đ)'), value: selectedCustomer.debtLimit },
                          { id: 'paymentTerms', name: t('Điều khoản thanh toán'), value: selectedCustomer.paymentTerms }
                        ]
                      )
                        .filter((field: any) => field.id !== 'note')
                        .map((field: any) => (
                          <React.Fragment key={field.id}>
                            <span>{field.name}</span>
                            <strong>
                              {field.id === 'debtLimit'
                                ? `${Number(field.value || 0).toLocaleString('vi-VN')} đ`
                                : field.value || t('Không có')}
                            </strong>
                          </React.Fragment>
                        ))}
                      <span>{t('Tần suất đặt hàng')}</span>
                      <strong>{calculateFrequency(selectedCustomer.id)}</strong>
                      <span>{t('Tạo bởi')}</span>
                      <strong>
                        {selectedCustomer.createdBy || t('Không xác định')}{' '}
                        {selectedCustomer.createdAt && `(${formatDateTime(selectedCustomer.createdAt, t('vi-VN'))})`}
                      </strong>
                      <span>{t('Cập nhật bởi')}</span>
                      <strong>
                        {selectedCustomer.updatedBy || t('Chưa cập nhật')}{' '}
                        {selectedCustomer.updatedAt && `(${formatDateTime(selectedCustomer.updatedAt, t('vi-VN'))})`}
                      </strong>
                    </div>

                    <EntityCustomFieldsReadOnly
                      definitions={customFieldDefinitions}
                      values={selectedCustomer.customFieldValues}
                    />

                    <div className="customer-contact-panel">
                      <div className="customer-contact-panel__heading">
                        <strong>{t('Đầu mối liên hệ')}</strong>
                      </div>
                      <div className="customer-contact-list">
                        {(selectedCustomer.contacts || []).map((contact: CustomerContactRecord) => (
                          <div key={contact.id} className="customer-contact-item">
                            <span className="customer-contact-item__role">{CONTACT_ROLE_LABELS[contact.role]}</span>
                            <strong>{contact.name || t('Chưa cập nhật tên')}</strong>
                            <span>
                              {[contact.phone, contact.email].filter(Boolean).join(' · ') ||
                                t('Chưa có thông tin liên hệ')}
                            </span>
                          </div>
                        ))}
                        {(selectedCustomer.contacts || []).length === 0 && (
                          <span className="text-muted">{t('Chưa có đầu mối liên hệ.')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section
                className="card customer-note-card"
                hidden={customerHistoryTab !== 'overview' && customerHistoryTab !== 'notes'}
              >
                <div className="card-header customer-note-card__header">
                  <div>
                    <span className="card-title">{t('Ghi chú khách hàng')}</span>
                  </div>
                </div>
                <CustomerNoteEditor
                  value={customerNoteDraft}
                  disabled={currentUser.role !== 'admin' && currentUser.role !== 'sale'}
                  placeholder={t('Nhập ghi chú về nhu cầu, thỏa thuận hoặc lưu ý khi làm việc với khách hàng...')}
                  onChange={value => {
                    setCustomerNoteDraft(value);
                    setCustomerNoteFeedback('');
                  }}
                />
                <div className="customer-note-card__footer">
                  <span role="status">{customerNoteFeedback}</span>
                  {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleSaveCustomerNote()}
                      disabled={
                        isSavingCustomerNote ||
                        sanitizeCustomerNoteHtml(customerNoteDraft).trim() ===
                          sanitizeCustomerNoteHtml(
                            selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))
                          ).trim()
                      }
                    >
                      {isSavingCustomerNote ? t('Đang lưu...') : t('Lưu ghi chú')}
                    </button>
                  )}
                </div>
                <small className="customer-note-card__meta">
                  {selectedCustomer.updatedAt
                    ? `${t('Cập nhật gần nhất')}: ${formatDateTime(selectedCustomer.updatedAt, t('vi-VN'))}${selectedCustomer.updatedBy ? ` · ${selectedCustomer.updatedBy}` : ''}`
                    : t('Chưa có lịch sử cập nhật')}
                </small>
              </section>
            </div>

            {customerHistoryTab === 'overview' && (
              <>
                <section className="card customer-catalog-preview">
                  <div className="customer-detail-card-heading">
                    <h2>{t('Sản phẩm của khách hàng')}</h2>
                    {canManageCustomerProducts(currentUser, selectedCustomer) && (
                      <button type="button" className="btn btn-primary" onClick={() => setShowProductEditor(true)}>
                        {t('Tạo mã sản phẩm')}
                      </button>
                    )}
                  </div>
                  <div
                    className="customer-catalog-preview__table"
                    role="table"
                    aria-label={t('Sản phẩm của khách hàng')}
                  >
                    <div className="customer-catalog-preview__row customer-catalog-preview__head" role="row">
                      <span role="columnheader">{t('Mã sản phẩm')}</span>
                      <span role="columnheader">{t('Tên sản phẩm')}</span>
                    </div>
                    {selectedCustomerProducts.slice(0, 4).map(product => (
                      <div key={product.key} className="customer-catalog-preview__row" role="row">
                        <span role="cell" title={product.productCode}>
                          {product.productCode || '—'}
                        </span>
                        <span role="cell" title={product.productName}>
                          {product.productName || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {selectedCustomerProducts.length === 0 && (
                    <p className="customer-detail-empty">{t('Chưa có mã sản phẩm.')}</p>
                  )}
                  <button
                    type="button"
                    className="customer-detail-text-button customer-detail-card-link"
                    aria-label={t('Xem chi tiết toàn bộ sản phẩm của khách hàng')}
                    onClick={() => setCustomerHistoryTab('products')}
                  >
                    {t('Xem chi tiết')} ({selectedCustomerProducts.length})
                  </button>
                </section>
                <section className="card customer-repository-preview">
                  <div className="customer-detail-card-heading">
                    <h2>{t('Kho lưu trữ khách hàng')}</h2>
                    {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setRepositoryUploadOpen(true);
                          setCustomerHistoryTab('files');
                        }}
                      >
                        {t('Thêm tệp')}
                      </button>
                    )}
                  </div>
                  <div className="content-tabs customer-repository-preview__tabs" aria-label={t('Thư mục tài liệu')}>
                    <button
                      type="button"
                      className={!repositoryPreviewFolder ? 'is-active' : ''}
                      aria-pressed={!repositoryPreviewFolder}
                      onClick={() => setRepositoryPreviewFolder('')}
                    >
                      {t('Tất cả')}
                    </button>
                    {customerRepositoryFolders.map(folder => (
                      <button
                        key={folder.id}
                        type="button"
                        className={repositoryPreviewFolder === folder.id ? 'is-active' : ''}
                        aria-pressed={repositoryPreviewFolder === folder.id}
                        onClick={() => setRepositoryPreviewFolder(folder.id)}
                      >
                        {folder.name}
                      </button>
                    ))}
                  </div>
                  <div className="customer-repository-preview__files">
                    {visibleRepositoryPreview.slice(0, 4).map(file => (
                      <div key={file.id} className="customer-repository-preview__file">
                        <FileText size={24} aria-hidden="true" />
                        <div>
                          {file.source ? (
                            <a
                              href={file.source}
                              target="_blank"
                              rel="noreferrer"
                              download={file.source.startsWith('data:') ? file.name : undefined}
                              title={file.name}
                            >
                              {file.name}
                            </a>
                          ) : (
                            <strong title={file.name}>{file.name}</strong>
                          )}
                          <small>
                            {customerRepositoryFolders.find(folder => folder.id === file.folderId)?.name ||
                              t('Tài liệu')}{' '}
                            · {formatDate(file.date)}
                          </small>
                        </div>
                        <RowActionMenu
                          actions={[
                            {
                              label: t('Quản lý tài liệu'),
                              onSelect: () => {
                                setActiveRepositoryFolderId(file.folderId);
                                setSelectedFolderForUpload(file.folderId);
                                setCustomerHistoryTab('files');
                              }
                            }
                          ]}
                        />
                      </div>
                    ))}
                    {visibleRepositoryPreview.length === 0 && (
                      <p className="customer-detail-empty">{t('Chưa có tài liệu.')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="customer-detail-text-button customer-detail-card-link"
                    onClick={() => setCustomerHistoryTab('files')}
                  >
                    {t('Xem tất cả tệp')} ({repositoryPreviewItems.length})
                  </button>
                </section>
              </>
            )}

            <div
              className="card customer-order-history-card"
              hidden={!['overview', 'po', 'products'].includes(customerHistoryTab)}
            >
              <div className="customer-product-catalog-toolbar">
                <h2>
                  {customerHistoryTab === 'products' ? t('Sản phẩm của khách hàng') : t('Danh sách đơn hàng (PO)')}
                </h2>
                {customerHistoryTab === 'overview' && (
                  <button type="button" className="btn btn-outline" onClick={() => setCustomerHistoryTab('po')}>
                    {t('Xem tất cả')} ({getCustomerOrders(selectedCustomer.id).length})
                  </button>
                )}
                {customerHistoryTab === 'products' && canManageCustomerProducts(currentUser, selectedCustomer) && (
                  <button type="button" className="btn btn-primary" onClick={() => setShowProductEditor(true)}>
                    {t('Tạo mã sản phẩm')}
                  </button>
                )}
              </div>

              {customerHistoryTab !== 'products' ? (
                <div className="table-container customer-order-history-table">
                  <table>
                    <thead>
                      <tr>
                        <th>{t('Mã PO')}</th>
                        <th>{t('Ngày đặt')}</th>
                        <th>{t('Trị giá (Net)')}</th>
                        <th>{t('Tiến độ')}</th>
                        <th>{t('Thao tác')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getCustomerOrders(selectedCustomer.id)
                        .slice(0, customerHistoryTab === 'overview' ? 5 : undefined)
                        .map(po => (
                          <tr
                            key={po.id}
                            className="customer-po-history-row"
                            onClick={() => onOpenPO?.(po.id)}
                            onKeyDown={event => {
                              if ((event.key === 'Enter' || event.key === ' ') && onOpenPO) onOpenPO(po.id);
                            }}
                            tabIndex={onOpenPO ? 0 : undefined}
                          >
                            <td>
                              <button
                                type="button"
                                className="customer-po-link"
                                onClick={event => {
                                  event.stopPropagation();
                                  onOpenPO?.(po.id);
                                }}
                              >
                                {po.poCode}
                              </button>
                            </td>
                            <td>{formatDate(po.orderDate)}</td>
                            <td>{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                            <td>
                              <span className={`badge ${getPOBadgeClass(po)}`}>{t(getPOQueueLabel(po))}</span>
                            </td>
                            <td onClick={event => event.stopPropagation()}>
                              {(currentUser.role === 'admin' || currentUser.role === 'sale') && onRepeatOrder ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline repeat-order-button"
                                  onClick={() => onRepeatOrder(po.id)}
                                  title={t('Tạo PO mới từ đơn cũ')}
                                >
                                  <Copy size={13} /> {t('Đặt lại')}
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                      {getCustomerOrders(selectedCustomer.id).length === 0 && (
                        <tr>
                          <td colSpan={5}>{t('Chưa phát sinh đơn hàng.')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="table-container customer-order-history-table">
                  <table className="customer-sample-history-table customer-product-history-table">
                    <thead>
                      <tr>
                        <th>{t('Sản phẩm / mã hàng')}</th>
                        <th>{t('Loại sản phẩm')}</th>
                        <th>{t('Quy cách & NVL')}</th>
                        <th>{t('Lịch sử đặt')}</th>
                        <th>{t('Hình ảnh / tệp')}</th>
                        <th>{t('Thao tác')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCustomerProducts.map(product => (
                        <tr key={product.key}>
                          <td>
                            <div className="customer-sample-identity">
                              {product.previewImage ? (
                                <img src={product.previewImage} alt={product.productName} />
                              ) : (
                                <span>{t('Chưa có ảnh')}</span>
                              )}
                              <div>
                                <strong title={product.productName}>{product.productName}</strong>
                                <small>{product.productCode || t('Chưa có mã hàng')}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            {product.record
                              ? productClassifications.find(type => type.id === product.record?.productType)?.name ||
                                CUSTOMER_PRODUCT_TYPES.find(type => type.id === product.record?.productType)?.name ||
                                product.record.productType ||
                                '—'
                              : '—'}
                          </td>
                          <td>
                            <div className="customer-sample-spec">
                              <strong title={product.material}>{product.material || t('Chưa có NVL')}</strong>
                              <span title={product.specification}>
                                {product.specification || t('Chưa có quy cách')}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="customer-sample-spec">
                              <strong>
                                {product.orderCount > 0
                                  ? `${product.orderCount} ${t('đơn')} · ${product.totalQuantity.toLocaleString('vi-VN')} ${product.unit}`
                                  : t('Chưa phát sinh PO')}
                              </strong>
                              <button
                                type="button"
                                className="customer-po-link"
                                onClick={() => product.lastPoId && onOpenPO?.(product.lastPoId)}
                                disabled={!product.lastPoId || !onOpenPO}
                              >
                                {product.lastPoCode || t('Chưa có mã PO')}
                              </button>
                            </div>
                          </td>
                          <td>
                            {product.record &&
                            Array.isArray(product.record.files) &&
                            product.record.files.length > 0 ? (
                              <RowActionMenu
                                label={t('Tệp sản phẩm')}
                                actions={product.record.files.map((file, index) => {
                                  const asset =
                                    typeof file === 'object' && file ? (file as Record<string, unknown>) : {};
                                  const url = getProductAssetSource(file);
                                  return {
                                    label: String(asset.name || asset.fileName || `Tệp ${index + 1}`),
                                    onSelect: () => openCustomerProductAsset(url)
                                  };
                                })}
                              />
                            ) : product.previewImage ? (
                              <button
                                type="button"
                                className="customer-product-asset-button"
                                onClick={() => setPreviewImage(product.previewImage)}
                              >
                                {t('Xem ảnh')} · {product.assetCount} {t('tệp')}
                              </button>
                            ) : (
                              <span className="crm-text-muted">{t('Chưa có tệp')}</span>
                            )}
                          </td>
                          <td>
                            {product.record && (currentUser.role === 'admin' || currentUser.role === 'sale') ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => handleOpenEditProduct(product.record)}
                              >
                                {t('Chỉnh sửa')}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                      {selectedCustomerProducts.length === 0 && (
                        <tr>
                          <td colSpan={6}>{t('Chưa có mã sản phẩm.')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <section className="card customer-file-repository-card" hidden={customerHistoryTab !== 'files'}>
              <div className="card-header customer-file-repository-header">
                <div>
                  <span className="card-title">{t('Kho lưu trữ khách hàng')}</span>
                </div>
                {(currentUser.role === 'admin' || currentUser.role === 'sale') &&
                  activeRepositoryFolder?.id === 'contracts' && (
                    <button type="button" className="btn btn-outline" onClick={() => setShowAddContractModal(true)}>
                      {t('Thêm hợp đồng')}
                    </button>
                  )}
              </div>

              <div className="customer-drive-layout">
                <aside className="customer-drive-sidebar" aria-label={t('Danh sách thư mục')}>
                  {currentUser.role === 'admin' && (
                    <div className="customer-drive-new-folder">
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={event => setNewFolderName(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleAddFolder();
                          }
                        }}
                        placeholder={t('Tên thư mục mới')}
                        aria-label={t('Tên thư mục mới')}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => void handleAddFolder()}
                        disabled={!newFolderName.trim()}
                      >
                        {t('Tạo thư mục')}
                      </button>
                    </div>
                  )}

                  <div className="customer-drive-folder-list">
                    {customerRepositoryFolders.map(folder => {
                      const fileCount = (selectedCustomer.files || []).filter(
                        (file: any) =>
                          file.name !== '.placeholder' &&
                          resolveCustomerFileFolderId(file, customerRepositoryFolders) === folder.id
                      ).length;
                      const contractCount = folder.id === 'contracts' ? (selectedCustomer.contracts || []).length : 0;
                      const documentCount = (selectedCustomer.documents || []).filter(
                        (documentRecord: any) =>
                          (DOCUMENT_REPOSITORY_FOLDER_IDS[documentRecord.category] || 'other') === folder.id
                      ).length;
                      const totalCount = fileCount + contractCount + documentCount;
                      return (
                        <div
                          key={folder.id}
                          className={`customer-drive-folder ${activeRepositoryFolder?.id === folder.id ? 'is-active' : ''}`}
                        >
                          {renamingFolderId === folder.id ? (
                            <div className="customer-drive-folder-rename">
                              <input
                                autoFocus
                                value={folderNameDraft}
                                onChange={event => setFolderNameDraft(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') void handleRenameRepoFolder(folder.id);
                                  if (event.key === 'Escape') setRenamingFolderId('');
                                }}
                                aria-label={t('Tên thư mục')}
                              />
                              <button type="button" onClick={() => void handleRenameRepoFolder(folder.id)}>
                                {t('Lưu')}
                              </button>
                              <button type="button" onClick={() => setRenamingFolderId('')}>
                                {t('Hủy')}
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="customer-drive-folder-select"
                                onClick={() => {
                                  setActiveRepositoryFolderId(folder.id);
                                  setSelectedFolderForUpload(folder.id);
                                }}
                              >
                                <span title={folder.name}>{folder.name}</span>
                                <small>{totalCount}</small>
                              </button>
                              {currentUser.role === 'admin' && (
                                <div className="customer-drive-folder-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRenamingFolderId(folder.id);
                                      setFolderNameDraft(folder.name);
                                    }}
                                  >
                                    {t('Đổi tên')}
                                  </button>
                                  <button type="button" onClick={() => void handleDeleteRepoFolder(folder.id)}>
                                    {t('Xóa')}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </aside>

                <div className="customer-drive-content">
                  <div className="customer-drive-path">
                    <span>{t('Kho lưu trữ khách hàng')}</span>
                    <strong>/ {activeRepositoryFolder?.name || t('Chưa chọn thư mục')}</strong>
                  </div>

                  {(currentUser.role === 'admin' || currentUser.role === 'sale') && activeRepositoryFolder && (
                    <details
                      className="customer-drive-upload-panel"
                      open={repositoryUploadOpen}
                      onToggle={event => setRepositoryUploadOpen(event.currentTarget.open)}
                    >
                      <summary>{t('Thêm tài liệu vào thư mục này')}</summary>
                      <form onSubmit={handleUploadRepoFile}>
                        <label>
                          <span>{t('Tên tài liệu')} *</span>
                          <input
                            value={repoUploadFileName}
                            onChange={event => setRepoUploadFileName(event.target.value)}
                            required
                            placeholder={t('Ví dụ: Biên bản nghiệm thu tháng 8')}
                          />
                        </label>
                        <label>
                          <span>{t('Chọn tệp dưới 900 KB')}</span>
                          <input type="file" onChange={handleRepoFileChange} />
                        </label>
                        <label>
                          <span>{t('Hoặc đường dẫn Drive/OneDrive')}</span>
                          <input
                            type="url"
                            value={repoUploadLink}
                            onChange={event => setRepoUploadLink(event.target.value)}
                            placeholder="https://..."
                          />
                        </label>
                        <button type="submit" className="btn btn-primary">
                          {t('Lưu tài liệu')}
                        </button>
                      </form>
                    </details>
                  )}

                  <div className="table-container customer-drive-table">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('Tên tài liệu')}</th>
                          <th>{t('Loại')}</th>
                          <th>{t('Ngày cập nhật')}</th>
                          <th>{t('Người cập nhật')}</th>
                          <th>{t('Thao tác')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRepositoryContracts.map((contract: any) => (
                          <tr key={`contract-${contract.id}`}>
                            <td>
                              <strong>{contract.contractNo || t('Hợp đồng chưa có số')}</strong>
                              <small>
                                {contract.expiryDate ? `${t('Hạn hiệu lực')}: ${formatDate(contract.expiryDate)}` : ''}
                              </small>
                            </td>
                            <td>{t('Hợp đồng')}</td>
                            <td>{formatDate(contract.signDate || contract.createdAt)}</td>
                            <td>{contract.createdBy || selectedCustomer.createdBy || '—'}</td>
                            <td>
                              <div className="customer-drive-file-actions">
                                {contract.fileUrl && (
                                  <a href={contract.fileUrl} download={`HopDong_${contract.contractNo || contract.id}`}>
                                    {t('Tải xuống')}
                                  </a>
                                )}
                                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                                  <button type="button" onClick={() => void handleDeleteContract(contract.id)}>
                                    {t('Xóa')}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {activeRepositoryDocuments.map((documentRecord: any) => (
                          <tr key={`document-${documentRecord.id}`}>
                            <td>
                              <strong>{documentRecord.name || t('Tài liệu chưa đặt tên')}</strong>
                            </td>
                            <td>{t('Văn bản')}</td>
                            <td>{formatDate(documentRecord.createdAt)}</td>
                            <td>{documentRecord.createdBy || documentRecord.createdById || '—'}</td>
                            <td>
                              {documentRecord.url ? (
                                <a href={documentRecord.url} target="_blank" rel="noreferrer">
                                  {t('Mở tài liệu')}
                                </a>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        ))}
                        {activeRepositoryFiles.map((file: any) => {
                          const source = file.base64 || file.data || file.url;
                          const isImage = String(source || '').startsWith('data:image/');
                          return (
                            <tr key={file.id}>
                              <td>
                                <strong title={file.name}>{file.name}</strong>
                              </td>
                              <td>{isImage ? t('Hình ảnh') : file.url ? t('Đường dẫn') : t('Tệp tài liệu')}</td>
                              <td>{formatDateTime(file.createdAt, 'vi-VN', '—')}</td>
                              <td>
                                {file.createdBy ||
                                  users.find(user => user.uid === file.createdById)?.displayName ||
                                  '—'}
                              </td>
                              <td>
                                <div className="customer-drive-file-actions">
                                  {isImage && (
                                    <button type="button" onClick={() => setPreviewImage(source)}>
                                      {t('Xem')}
                                    </button>
                                  )}
                                  {file.url ? (
                                    <a href={file.url} target="_blank" rel="noreferrer">
                                      {t('Mở liên kết')}
                                    </a>
                                  ) : (
                                    source && (
                                      <a href={source} download={file.name}>
                                        {t('Tải xuống')}
                                      </a>
                                    )
                                  )}
                                  {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                                    <button type="button" onClick={() => void handleDeleteRepoFile(file.id)}>
                                      {t('Xóa')}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </>
      {/* CREATE MODAL */}
      {showAddModal && (
        <div className="modal-overlay-fullscreen">
          <div className="modal-content-fullscreen customer-onboarding-screen">
            <div className="customer-onboarding-header">
              <div>
                <span className="customer-onboarding-step">
                  {onboardingSourceLead ? 'CHUYỂN ĐỔI LEAD · HỒ SƠ & ĐƠN ĐẦU TIÊN' : 'HỒ SƠ KHÁCH HÀNG & MÃ HÀNG'}
                </span>
                <h2>
                  {onboardingSourceLead ? `TẠO KHÁCH HÀNG: ${onboardingSourceLead.companyName}` : 'THÊM KHÁCH HÀNG MỚI'}
                </h2>
                <p>
                  {onboardingSourceLead
                    ? 'Thông tin từ Lead đã được điền sẵn. Hoàn thiện cùng bộ dữ liệu như khách hàng đặt trực tiếp.'
                    : 'Nhập hồ sơ, mã hàng và thông tin đơn đầu tiên ngay trên cùng một biểu mẫu.'}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={closeCustomerOnboarding}>
                Đóng / Hủy
              </button>
            </div>
            <form className="customer-onboarding-form" onSubmit={handleAddCustomer}>
              <div className="modal-body customer-onboarding-body">{renderCustomerOnboardingTables()}</div>
              <div className="modal-footer customer-onboarding-footer">
                <div className="customer-onboarding-footer-note">
                  {onboardingItems.length > 0
                    ? `${onboardingItems.length} mã hàng sẽ được lưu vào hồ sơ và chuyển sẵn sang Sale PO.`
                    : 'Bạn có thể lưu hồ sơ trước và bổ sung mã hàng sau.'}
                </div>
                <button type="button" className="btn btn-outline" onClick={closeCustomerOnboarding}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary">
                  {onboardingItems.length > 0 ? 'Lưu khách hàng & chuẩn bị Sale PO' : 'Lưu hồ sơ khách hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="modal-overlay-fullscreen">
          <div className="modal-content-fullscreen customer-onboarding-screen">
            <div className="customer-onboarding-header">
              <div>
                <span className="customer-onboarding-step">HỒ SƠ KHÁCH HÀNG</span>
                <h2>{t('CHỈNH SỬA HỒ SƠ KHÁCH HÀNG')}</h2>
                <p>{t('Cập nhật hồ sơ trên cùng cấu trúc với màn hình thêm khách hàng.')}</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>
                {t('Đóng / Hủy')}
              </button>
            </div>
            <form className="customer-onboarding-form" onSubmit={handleEditCustomer}>
              <div className="modal-body customer-onboarding-body">{renderCustomerOnboardingTables(false)}</div>
              <div className="modal-footer customer-onboarding-footer">
                <div className="customer-onboarding-footer-note">
                  {t('Các thay đổi chỉ được ghi nhận khi bấm Lưu thay đổi.')}
                </div>
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>
                  {t('Hủy')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('Lưu thay đổi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAddContractModal && (
        <CustomerContractDialog
          draft={contractDraft}
          onDraftChange={patch => setContractDraft(previous => ({ ...previous, ...patch }))}
          onSubmit={handleAddContractSubmit}
          onClose={() => setShowAddContractModal(false)}
        />
      )}

      {/* EDIT PRODUCT MODAL */}
      {showEditProductModal && selectedProduct && (
        <CustomerProductEditDialog
          form={{
            productType,
            productLayoutBase64,
            productName,
            setProductName,
            productCode,
            setProductCode,
            productMaterial,
            setProductMaterial,
            currentPrice,
            setCurrentPrice,
            specFields,
            specCustomRows,
            setSpecCustomRows,
            editingLabelId,
            setEditingLabelId,
            tempLabelText,
            setTempLabelText
          }}
          fieldActions={{
            handleUpdateFieldValue,
            handleDeleteField,
            handleStartEditLabel,
            handleSaveLabel,
            handleAddField,
            handleAddSelectField,
            handleEditDropdownOptions,
            handleWindDirectionFilesChangeForField,
            handleEditProductTypeChange,
            handleProductLayoutChange
          }}
          catalog={{
            availableProductClassifications,
            windDirections,
            triggerAddClassification,
            triggerEditClassification,
            triggerAddWindDirection,
            triggerEditWindDirection
          }}
          renderProductCommercialFields={renderProductCommercialFields}
          onSubmit={handleEditProductSubmit}
          onClose={closeEditProductModal}
        />
      )}

      {showCompareModal && selectedEditRequest && (
        <EditRequestCompareDialog
          originalData={selectedEditRequest.originalData}
          updatedData={selectedEditRequest.updatedData}
          onClose={() => {
            setShowCompareModal(false);
            setSelectedEditRequest(null);
          }}
          onReject={() => handleRejectRequest(selectedEditRequest)}
          onApprove={() => handleApproveRequest(selectedEditRequest)}
        />
      )}

      {previewImage && <ImagePreviewDialog src={previewImage} onClose={() => setPreviewImage(null)} />}

      {supportTarget && (
        <SupportRequestDialog
          currentUser={currentUser}
          users={users}
          target={supportTarget}
          onClose={() => setSupportTarget(null)}
        />
      )}
      {assignmentTarget && (
        <WorkAssignmentDialog
          currentUser={currentUser}
          users={users}
          target={assignmentTarget}
          onClose={() => setAssignmentTarget(null)}
        />
      )}
    </SystemFieldSurface>
  );
};
