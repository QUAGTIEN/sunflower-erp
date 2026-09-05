import { ConfiguredSystemTable, SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import React, { useEffect, useMemo, useState } from 'react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/context/LanguageContext';
import { HorizontalBarChart } from '@/components/VisualCharts';
import { CustomerOnboardingItems } from '@/features/crm/components/CustomerOnboardingItems';
import { BusinessLocationFields } from '@/features/crm/components/BusinessLocationFields';
import { CustomerNoteEditor } from '@/features/crm/components/CustomerNoteEditor';
import {
  customerNoteHtmlToText,
  plainTextToNoteHtml,
  sanitizeCustomerNoteHtml
} from '@/features/crm/model/customerNote';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { RowActionMenu } from '@/components/RowActionMenu';
import { EntityCustomFieldsReadOnly, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import {
  formatEntityCustomFieldValue,
  getMissingRequiredEntityFields,
  getEntityCustomFieldSearchValues,
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldFilterTokens,
  type EntityCustomFieldValues
} from '@/features/crm/model/entityFieldConfig';
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
  type CustomerContactRole,
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
import {
  calculatePOItemFinancials,
  withCalculatedPOFinancials,
  type PODiscountType
} from '@/domain/poFinancials';
import { VIETNAM_PROVINCES_2026 } from '@/features/crm/model/leadFilterConfig';
import {
  CUSTOMER_FILTER_IDS,
  mergeCustomerFilterDefinitions,
  type CustomerFilterDefinition
} from '@/features/crm/model/customerFilterConfig';
import {
  getSystemFilterDefinition,
  isSystemFilterEnabled
} from '@/domain/systemFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import '@/components/CustomerHistory.css';
import {
  Plus,
  Trash2,
  Pencil,
  X,
  Folder,
  FileText,
  Download,
  Upload,
  Eye,
  AlertCircle,
  Copy,
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardPlus,
  Search,
  ShoppingBag,
  Users,
  ChevronLeft,
  ChevronRight,
  MapPinned,
  Settings2
} from 'lucide-react';

const CONTACT_ROLE_LABELS: Record<CustomerContactRole, string> = {
  primary: 'Liên hệ chính',
  procurement: 'Mua hàng',
  warehouse: 'Kho / nhận hàng',
  accounting: 'Kế toán',
  other: 'Khác'
};

const DOCUMENT_REPOSITORY_FOLDER_IDS: Record<string, string> = {
  contract: 'contracts',
  acceptance: 'minutes',
  qc: 'technical',
  qa: 'technical',
  artwork: 'technical',
  other: 'other'
};

type CrmListFilter = 'all' | 'has_debt' | 'analytics';
type CrmTimeFilter = 'last_30_days' | 'last_90_days' | 'this_year' | 'no_orders';

interface CrmFilterOption {
  value: string;
  label: string;
}

const UNASSIGNED_FILTER_VALUE = '__unassigned__';

const normalizeFilterValue = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .trim()
  .toLocaleLowerCase('vi-VN');

const getProductAssetSource = (asset: unknown): string => {
  if (typeof asset === 'string') return asset;
  if (!asset || typeof asset !== 'object') return '';
  const record = asset as Record<string, unknown>;
  return String(record.base64 || record.data || record.url || '');
};

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
};

const createCopyableProfile = (title: string, rows: Array<[string, unknown]>) => [
  title,
  ...rows.map(([label, value]) => `${label}\t${String(value || '—')}`)
].join('\n');

const createNextCustomerCode = (customers: CustomerRecord[]) => {
  const usedCodes = new Set(customers.map(customer => customer.customerCode).filter(Boolean));
  let sequence = customers.length + 1;
  let candidate = `KH-${String(sequence).padStart(4, '0')}`;
  while (usedCodes.has(candidate)) {
    sequence += 1;
    candidate = `KH-${String(sequence).padStart(4, '0')}`;
  }
  return candidate;
};

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
  onNavigateToSystemConfiguration: () => void;
}

const loadSpecsToFields = (productType: string, specifications: any = {}) => {
  const specs = specifications || {};
  if (specs.fields && Array.isArray(specs.fields)) {
    return specs.fields;
  }

  const fields = [];
  if (productType === 'muc_in') {
    fields.push({ id: 'ribbonType', label: 'Loại mực', value: specs.ribbonType || 'WAX PREMIUM', type: 'select', options: ['WAX PREMIUM', 'WAX RESIN', 'RESIN'] });
    fields.push({ id: 'direction', label: 'Chiều quấn', value: specs.direction || 'Out side', type: 'select', options: ['Out side', 'In side'] });
    fields.push({ id: 'size', label: 'Khổ mực', value: specs.size || '110mm x 300m', type: 'text' });
    fields.push({ id: 'color', label: 'Màu mực', value: specs.color || 'Đen', type: 'text' });
  } else if (productType === 'tem_trang_cuon' || productType === 'tem_mau_cuon') {
    fields.push({ id: 'width', label: 'Rộng tem (mm)', value: specs.width || 80, type: 'number' });
    fields.push({ id: 'height', label: 'Cao tem (mm)', value: specs.height || 55, type: 'number' });
    fields.push({ id: 'gap', label: 'Bước răng/Gap', value: specs.gap || 3, type: 'number' });
    fields.push({ id: 'qtyPerRoll', label: 'Số tem/cuộn', value: specs.qtyPerRoll || 1000, type: 'number' });
    fields.push({ id: 'core', label: 'Cỡ lõi cuộn', value: specs.core || specs.windingCore || '76mm', type: 'select', options: ['76mm', '42mm', '29mm', '40mm', '25mm'] });
    fields.push({ id: 'dieCut', label: 'Kiểu bế góc', value: specs.dieCut || 'Bo góc R2', type: 'select', options: ['Bo góc R2', 'Bo góc R3', 'Bo góc R5', 'Vuông góc'] });
    fields.push({ id: 'perforated', label: 'Răng cưa xé', value: specs.perforated || 'Không răng cưa', type: 'select', options: ['Không răng cưa', 'Có răng cưa xé'] });
    fields.push({ id: 'windDirection', label: 'Hướng tem ra', value: specs.windDirection || 'Ra đầu trước', type: 'select', options: ['Ra đầu trước', 'Ra đầu sau', 'Chữ quay trái', 'Chữ quay phải', 'Head First', 'Tail First', 'Left First', 'Right First'] });
    fields.push({ id: 'windDirectionFiles', label: 'Tải Lên Ảnh/File Hướng Tem Ra', value: specs.windDirectionFiles || [], type: 'file' });

    if (productType === 'tem_mau_cuon') {
      fields.push({ id: 'colors', label: 'Số màu in / Diễn giải màu', value: specs.colors || '4 màu', type: 'text' });
      fields.push({ id: 'processing', label: 'Quy cách gia công', value: specs.processing || [], type: 'checkboxes', options: ['Cán bóng', 'Cán mờ', 'Phủ UV', 'Ép kim', 'Bế demi', 'Bế đứt'] });
    }
  } else if (productType === 'tem_mau_to') {
    fields.push({ id: 'width', label: 'Chiều Rộng (mm)', value: specs.width || 80, type: 'number' });
    fields.push({ id: 'height', label: 'Chiều Cao/Dài (mm)', value: specs.height || 55, type: 'number' });
    fields.push({ id: 'corner', label: 'Góc tem tờ', value: specs.corner || 'Bo góc R2', type: 'select', options: ['Bo góc R2', 'Bo góc R3', 'Bo góc R5', 'Vuông góc'] });
    fields.push({ id: 'lamination', label: 'Cán màng bảo vệ', value: specs.lamination || 'Không cán', type: 'select', options: ['Không cán', 'Cán bóng', 'Cán mờ'] });
    fields.push({ id: 'finished', label: 'Thành phẩm sau in', value: specs.finished || 'Bế demi', type: 'select', options: ['Bế demi', 'Bế đứt', 'Xén thành phẩm', 'Giao nguyên tờ'] });
    fields.push({ id: 'sheetType', label: 'Quy cách khổ tờ', value: specs.sheetType || 'A4', type: 'select', options: ['A4', 'A3', '310 x 450', '330 x 480'] });
  }

  if (specs.custom && Array.isArray(specs.custom)) {
    specs.custom.forEach((c: any, index: number) => {
      fields.push({ id: `custom_${index}_${Date.now()}`, label: c.key, value: c.value, type: 'text' });
    });
  }

  return fields;
};

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
  onNavigateToSystemConfiguration
}) => {
  const { t } = useLanguage();
  const { definitions: customFieldDefinitions } = useEntityFieldDefinitions('customers', currentUser.role);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<CrmListFilter>('all');
  const [saleFilters, setSaleFilters] = useState<string[]>([]);
  const [rankFilters, setRankFilters] = useState<string[]>([]);
  const [timeFilters, setTimeFilters] = useState<CrmTimeFilter[]>([]);
  const [provinceFilters, setProvinceFilters] = useState<string[]>([]);
  const [industrialParkFilters, setIndustrialParkFilters] = useState<string[]>([]);
  const [productFilters, setProductFilters] = useState<string[]>([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [showListFilters, setShowListFilters] = useState(false);
  const [customerPageSize, setCustomerPageSize] = useState(25);
  const [customerPage, setCustomerPage] = useState(1);
  const [storedCustomerFilterDefinitions, setStoredCustomerFilterDefinitions] = useState<CustomerFilterDefinition[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerHistoryTab, setCustomerHistoryTab] = useState<'po' | 'products'>('po');
  const [isCompanyInfoExpanded, setIsCompanyInfoExpanded] = useState(false);
  const [customerNoteDraft, setCustomerNoteDraft] = useState('');
  const [isSavingCustomerNote, setIsSavingCustomerNote] = useState(false);
  const [customerNoteFeedback, setCustomerNoteFeedback] = useState('');

  const [chartMonth, setChartMonth] = useState<string>('all');
  const [chartYear, setChartYear] = useState<string>(() => String(new Date().getFullYear()));
  const [showTop15, setShowTop15] = useState<boolean>(false);

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
  const [windDirections, setWindDirections] = useState<any[]>([]);
  const [editRequests, setEditRequests] = useState<any[]>([]);

  const [priceHistoryProduct, setPriceHistoryProduct] = useState<any | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedEditRequest, setSelectedEditRequest] = useState<any | null>(null);
  const [windDirectionFiles, setWindDirectionFiles] = useState<any[]>([]);

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

  const handleWindDirectionFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const base64Promises = Array.from(files).map((file) => {
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, url: reader.result as string });
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    });
    try {
      const base64Files = await Promise.all(base64Promises);
      setWindDirectionFiles(prev => [...prev, ...base64Files]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateFieldValue = (fieldId: string, value: any) => {
    setSpecFields(prev => prev.map(f => f.id === fieldId ? { ...f, value } : f));
  };

  const handleDeleteField = (fieldId: string) => {
    if (window.confirm(t('Bạn có chắc chắn muốn xóa thông số này?'))) {
      setSpecFields(prev => prev.filter(f => f.id !== fieldId));
    }
  };

  const handleStartEditLabel = (fieldId: string, currentLabel: string) => {
    setEditingLabelId(fieldId);
    setTempLabelText(currentLabel);
  };

  const handleSaveLabel = (fieldId: string) => {
    if (tempLabelText.trim()) {
      setSpecFields(prev => prev.map(f => f.id === fieldId ? { ...f, label: tempLabelText.trim() } : f));
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
    const newOptsStr = prompt(
      t('Nhập danh sách lựa chọn (phân cách bằng dấu phẩy):'),
      currentOpts.join(', ')
    );
    if (newOptsStr !== null) {
      const newOpts = newOptsStr
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);

      if (newOpts.length === 0) {
        alert(t('Danh sách lựa chọn không được trống.'));
        return;
      }

      setSpecFields(prev => prev.map(f => {
        if (f.id === fieldId) {
          const newValue = newOpts.includes(f.value) ? f.value : newOpts[0];
          return { ...f, options: newOpts, value: newValue };
        }
        return f;
      }));
    }
  };

  const handleWindDirectionFilesChangeForField = async (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const base64Promises = Array.from(files).map((file) => {
      return new Promise<any>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, data: reader.result as string, url: reader.result as string });
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
    });
    try {
      const base64Files = await Promise.all(base64Promises);
      setSpecFields(prev => prev.map(f => {
        if (f.id === fieldId) {
          const currentFiles = Array.isArray(f.value) ? f.value : [];
          return { ...f, value: [...currentFiles, ...base64Files] };
        }
        return f;
      }));
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
  const [customerCode, setCustomerCode] = useState(() => (
    initialLead ? createNextCustomerCode(customers) : ''
  ));
  const [customerRank, setCustomerRank] = useState<CustomerRank>('');
  const [companyName, setCompanyName] = useState(initialLead?.companyName || '');
  const [contactPerson, setContactPerson] = useState(initialLead?.contactPerson || '');
  const [phone, setPhone] = useState(initialLead?.phone || '');
  const [email, setEmail] = useState(initialLead?.email || '');
  const [address, setAddress] = useState(initialLead?.address || '');
  const [province, setProvince] = useState(initialLead?.province || '');
  const [ward, setWard] = useState(initialLead?.ward || '');
  const [industrialPark, setIndustrialPark] = useState(initialLead?.industrialPark || '');
  const [taxCode, setTaxCode] = useState(initialLead?.taxCode || '');
  const [assignedSaleId, setAssignedSaleId] = useState(initialLead?.assignedSaleId || '');
  const [discountType, setDiscountType] = useState<PODiscountType>('percent');
  const [discountRate, setDiscountRate] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [debtLimit, setDebtLimit] = useState(50000000);
  const [paymentTerms, setPaymentTerms] = useState('30 ngày');
  const [note, setNote] = useState(() => [
    initialLead?.note,
    initialLead?.expectedProducts ? `Nhu cầu dự kiến: ${initialLead.expectedProducts}` : ''
  ].filter(Boolean).join('\n'));
  const [additionalContacts, setAdditionalContacts] = useState<CustomerContactRecord[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});

  const [procurementPhone, setProcurementPhone] = useState('');
  const [warehousePhone, setWarehousePhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');

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
    return [primaryContact, ...additionalContacts].filter(contact => (
      contact.name.trim() || contact.phone.trim() || contact.email.trim()
    ));
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

  const updateContactRow = (
    contactId: string,
    field: keyof CustomerContactRecord,
    value: string
  ) => {
    setAdditionalContacts(previous => previous.map(contact => (
      contact.id === contactId ? { ...contact, [field]: value } : contact
    )));
  };

  // Product List states
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // General product form fields
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productType, setProductType] = useState<'muc_in' | 'tem_trang_cuon' | 'tem_mau_cuon' | 'tem_mau_to'>('tem_trang_cuon');
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

  // Specs - Ribbon
  const [specRibbonType, setSpecRibbonType] = useState('WAX PREMIUM');
  const [specRibbonDirection, setSpecRibbonDirection] = useState('Out side');
  const [specRibbonSize, setSpecRibbonSize] = useState('110mm x 300m');
  const [specRibbonColor, setSpecRibbonColor] = useState('Đen');

  // Specs - White roll
  const [specWidth, setSpecWidth] = useState(80);
  const [specHeight, setSpecHeight] = useState(55);
  const [specGap, setSpecGap] = useState(3);
  const [specPitch, setSpecPitch] = useState(58);
  const [specQtyPerRoll, setSpecQtyPerRoll] = useState(1000);
  const [specCore, setSpecCore] = useState('76mm');
  const [specDieCut, setSpecDieCut] = useState('Bo góc R2');
  const [specPerforated, setSpecPerforated] = useState('Không');
  const [specWindDirection, setSpecWindDirection] = useState('Ra đầu trước');

  // Specs - Color roll
  const [specColorColors, setSpecColorColors] = useState('4 màu');
  const [specColorForm, setSpecColorForm] = useState('Cuộn');
  const [specColorWindingCore, setSpecColorWindingCore] = useState('76mm');
  const [specColorProcessing, setSpecColorProcessing] = useState<string[]>([]);

  // Specs - Color sheet
  const [specSheetCorner, setSpecSheetCorner] = useState('Bo góc R2');
  const [specSheetLamination, setSpecSheetLamination] = useState('Cán bóng');
  const [specSheetFinished, setSpecSheetFinished] = useState('Xén thành phẩm');
  const [specSheetType, setSpecSheetType] = useState('A4');
  const [productMaterial, setProductMaterial] = useState('');
  const [specCustomRows, setSpecCustomRows] = useState<{ key: string; value: string }[]>([]);
  const [specFields, setSpecFields] = useState<any[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [tempLabelText, setTempLabelText] = useState('');
  const [requoteNote, setRequoteNote] = useState('');

  // Re-quote price dialog state
  const [showRequoteModal, setShowRequoteModal] = useState(false);
  const [requotePrice, setRequotePrice] = useState(0);

  // Contract list modals & states
  const [showAddContractModal, setShowAddContractModal] = useState(false);
  const [contractNo, setContractNo] = useState('');
  const [contractSignDate, setContractSignDate] = useState('');
  const [contractExpiryDate, setContractExpiryDate] = useState('');
  const [contractValue, setContractValue] = useState(0);
  const [contractFile, setContractFile] = useState('');

  // Handle opening create modal
  const openAddModal = () => {
    setOnboardingSourceLead(null);
    setCustomerCode(generateCustomerCode());
    setCustomerRank('');
    setCompanyName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setProvince('');
    setWard('');
    setIndustrialPark('');
    setTaxCode('');
    setAssignedSaleId(currentUser.role === 'sale' ? currentUser.uid : (saleUsers[0]?.uid || ''));
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
    setOnboardingItems([
      createCustomerOnboardingItem(0, '', 'percent', 0, 0)
    ]);
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
    setContactPerson(cust.contactPerson);
    setPhone(cust.phone);
    setEmail(cust.email);
    setAddress(cust.address);
    setProvince(cust.province || '');
    setWard(cust.ward || '');
    setIndustrialPark(cust.industrialPark || '');
    setTaxCode(cust.taxCode);
    setAssignedSaleId(cust.assignedSaleId);
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
    return ({
      customerCode: customerCode.trim() || generateCustomerCode(),
      customerRank,
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      province: province.trim(),
      ward: ward.trim(),
      industrialPark: industrialPark.trim(),
      taxCode: taxCode.trim(),
      assignedSaleId,
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
      fileFolders: [
        ...DEFAULT_CUSTOMER_REPOSITORY_FOLDERS.map(folder => ({
          ...folder,
          createdAt: now,
          createdById: currentUser.uid
        })),
        ...((onboardingSourceLead?.files || []).length > 0 ? [{
          id: 'lead-documents',
          name: 'Tài liệu từ Lead',
          parentId: null,
          order: 80,
          active: true,
          createdAt: now,
          createdById: currentUser.uid,
          updatedAt: '',
          updatedById: ''
        }] : [])
      ],
      files: (onboardingSourceLead?.files || []).map(file => ({
        ...file,
        folderId: 'lead-documents',
        folder: 'Tài liệu từ Lead',
        createdAt: now,
        createdById: currentUser.uid
      })),
      pendingOrderDraft,
      lastOrderAt: null,
      createdById: currentUser.uid,
      createdBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
      createdAt: now,
      updatedBy: '',
      updatedAt: ''
    });
  };

  const closeCustomerOnboarding = () => {
    setShowAddModal(false);
    if (onboardingSourceLead) onLeadOnboardingClosed?.();
    setOnboardingSourceLead(null);
  };

  const mapPreparedItemsToProducts = (
    items: CustomerPendingOrderItem[]
  ): CustomerProductRecord[] => items.map((item, index) => ({
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
    supplierName: item.supplierName || suppliers.find(supplier => supplier.id === item.supplierId)?.supplierName || '',
    purchasePrice: Number(item.purchasePrice) || 0,
    discountType: item.discountType === 'amount' ? 'amount' : 'percent',
    discountRate: Number(item.discountRate) || 0,
    discountAmount: Number(item.discountAmount) || 0,
    leadTimeDays: Number(item.leadTimeDays) || 0,
    layoutUrl: typeof item.previewImages?.[0] === 'string'
      ? item.previewImages[0]
      : typeof item.previewImage === 'string' ? item.previewImage : '',
    specifications: item.specifications || {},
    files: item.files || [],
    designLayouts: item.previewImages || []
  }));

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !customerRank) return;
    const missingCustomFields = getMissingRequiredEntityFields(customFieldDefinitions, customFieldValues, currentUser.role);
    if (missingCustomFields.length > 0) {
      alert(t(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`));
      return;
    }

    const taxCodeConflict = findTaxCodeConflict(
      taxCode,
      leads,
      customers,
      onboardingSourceLead?.id || ''
    );
    if (taxCodeConflict) {
      alert(t(`Mã số thuế đã thuộc về ${taxCodeConflict.companyName}. Không thể tạo khách hàng trùng.`));
      return;
    }

    const normalizedItems = onboardingItems.map((item, index) => (
      normalizePendingOrderItem(withCalculatedPOFinancials(item), index)
    ));
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
    const pendingOrderDraft: CustomerPendingOrderDraft | null = normalizedItems.length > 0 ? {
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
    } : null;

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
      const latestLead = await dbService.getDocument('leads', onboardingSourceLead.id) as LeadRecord | null;
      await dbService.updateDocument('leads', onboardingSourceLead.id, {
        stage: 'converted',
        convertedCustomerId: createdCustomer.id,
        convertedAt: now,
        activities: [{
          id: `activity-${now}`,
          type: 'converted',
          note: `Đã chuyển thành khách hàng ${customerCode.trim() || createdCustomer.id}`,
          occurredAt: now,
          createdById: currentUser.uid,
          createdByName: currentUser.displayName
        }, ...(latestLead?.activities || onboardingSourceLead.activities || [])],
        updatedAt: now,
        updatedBy: currentUser.displayName
      });
    }

    closeCustomerOnboarding();
    onRefresh();
    if (pendingOrderDraft) onPreparedOrderCreated?.(createdCustomer.id);
  };

  // Edit customer
  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const missingCustomFields = getMissingRequiredEntityFields(customFieldDefinitions, customFieldValues, currentUser.role);
    if (missingCustomFields.length > 0) {
      alert(t(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`));
      return;
    }

    await dbService.updateDocument('customers', selectedCustomer.id, {
      customerCode: customerCode.trim() || selectedCustomer.customerCode,
      customerRank,
      companyName,
      contactPerson,
      phone,
      email,
      address,
      province,
      ward,
      industrialPark,
      taxCode,
      assignedSaleId,
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
    });

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
  };

  const handleSaveCustomerNote = async () => {
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
      await dbService.updateDocument('customers', selectedCustomer.id, {
        note: nextNote,
        noteHtml: nextNoteHtml,
        updatedBy,
        updatedAt
      });
      setSelectedCustomer((previous: any) => previous ? ({ ...previous, note: nextNote, noteHtml: nextNoteHtml, updatedBy, updatedAt }) : previous);
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
    } catch {
      setCustomerNoteFeedback(t('Không thể lưu ghi chú. Vui lòng thử lại.'));
    } finally {
      setIsSavingCustomerNote(false);
    }
  };

  // Delete customer
  const handleDeleteCustomer = async (id: string) => {
    if (currentUser.role === 'admin') {
      const password = window.prompt(t('Nhập mật khẩu xác nhận xóa (Giám Đốc/Admin):'));
      if (password === 'admin123' || password === '123456') {
        await dbService.updateDocument('customers', id, {
          deleted: true,
          deleteRequested: false,
          deleteRequestedAt: '',
          updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
          updatedAt: new Date().toISOString()
        });
        setSelectedCustomer(null);
        onRefresh();
        alert(t('Đã chuyển khách hàng vào Kho Rác.'));
      } else if (password !== null) {
        alert(t('Mật khẩu không chính xác. Xóa thất bại.'));
      }
    } else {
      if (window.confirm(t('Bạn có muốn gửi yêu cầu xóa khách hàng này tới Admin phê duyệt?'))) {
        await dbService.updateDocument('customers', id, {
          deleteRequested: true,
          deleteRequestedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`,
          deleteRequestedAt: new Date().toISOString()
        });
        alert(t('Đã gửi yêu cầu xóa khách hàng tới Admin.'));
        onRefresh();
      }
    }
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
    setWindDirectionFiles(prod.specifications?.windDirectionFiles || []);
    setSpecFields(loadSpecsToFields(prod.productType, prod.specifications));
    setShowEditProductModal(true);
  };

  const handleEditProductSubmit = async (e: React.FormEvent) => {
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
      priceHistory: newPriceHistory,
      updatedAt: new Date().toISOString()
    };

    if (currentUser.role === 'admin') {
      const updatedProducts = (selectedCustomer.products || []).map((p: any) =>
        p.id === selectedProduct.id ? updatedProduct : p
      );

      await dbService.updateDocument('customers', selectedCustomer.id, {
        products: updatedProducts
      });

      setSelectedCustomer((prev: any) => ({
        ...prev,
        products: updatedProducts
      }));
      alert(t('Cập nhật sản phẩm thành công.'));
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
      alert(t('Yêu cầu chỉnh sửa sản phẩm đã được gửi tới Admin duyệt.'));
    }

    setShowEditProductModal(false);
    setSelectedProduct(null);
    onRefresh();
  };

  const triggerAddClassification = async () => {
    const name = prompt(t('Nhập tên phân loại sản phẩm mới:'));
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const id = `class-${Math.random().toString(36).substr(2, 9)}`;
    const newClass = { id, name: cleanName };
    await dbService.addDocument('product_classifications', newClass);
    alert(t('Đã thêm phân loại sản phẩm mới.'));
  };

  const triggerAddWindDirection = async () => {
    const name = prompt(t('Nhập tên hướng tem ra mới:'));
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const id = `wind-${Math.random().toString(36).substr(2, 9)}`;
    const newWind = { id, name: cleanName };
    await dbService.addDocument('wind_directions', newWind);
    alert(t('Đã thêm hướng tem ra mới.'));
  };

  const handleEditClassification = async (id: string, newName: string) => {
    const origClass = productClassifications.find(c => c.id === id);
    if (!origClass) return;
    if (currentUser.role === 'admin') {
      await dbService.updateDocument('product_classifications', id, { name: newName });
      alert(t('Đã cập nhật phân loại sản phẩm.'));
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
      alert(t('Yêu cầu sửa phân loại sản phẩm đã gửi tới Admin duyệt.'));
    }
    onRefresh();
  };

  const handleEditWindDirection = async (id: string, newName: string) => {
    const origWind = windDirections.find(w => w.id === id);
    if (!origWind) return;
    if (currentUser.role === 'admin') {
      await dbService.updateDocument('wind_directions', id, { name: newName });
      alert(t('Đã cập nhật hướng tem ra.'));
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
      alert(t('Yêu cầu sửa hướng tem ra đã gửi tới Admin duyệt.'));
    }
    onRefresh();
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
    try {
      if (req.type === 'customer_profile') {
        await dbService.updateDocument('customers', req.targetId, {
          ...req.updatedData,
          updatedBy: req.requestedBy,
          updatedAt: new Date().toISOString()
        });
        alert(t('Đã duyệt chỉnh sửa hồ sơ khách hàng.'));
      } else if (req.type === 'product_details') {
        const cust = customers.find(c => c.id === req.targetId);
        if (cust) {
          const updatedProducts = (cust.products || []).map((p: any) =>
            p.id === req.productId ? req.updatedData : p
          );
          await dbService.updateDocument('customers', req.targetId, {
            products: updatedProducts
          });
          alert(t('Đã duyệt chỉnh sửa thông tin sản phẩm.'));
        } else {
          alert(t('Không tìm thấy thông tin khách hàng tương ứng.'));
        }
      } else if (req.type === 'product_classification') {
        await dbService.updateDocument('product_classifications', req.targetId, {
          name: req.updatedData.name
        });
        alert(t('Đã duyệt chỉnh sửa phân loại sản phẩm.'));
      } else if (req.type === 'wind_direction') {
        await dbService.updateDocument('wind_directions', req.targetId, {
          name: req.updatedData.name
        });
        alert(t('Đã duyệt chỉnh sửa hướng tem ra.'));
      }

      await dbService.deleteDocument('edit_requests', req.id);
      setShowCompareModal(false);
      setSelectedEditRequest(null);
      onRefresh();
    } catch (error) {
      console.error(error);
      alert(t('Có lỗi xảy ra khi phê duyệt.'));
    }
  };

  const handleRejectRequest = async (req: any) => {
    if (window.confirm(t('Bạn có chắc chắn muốn từ chối yêu cầu này?'))) {
      await dbService.deleteDocument('edit_requests', req.id);
      setShowCompareModal(false);
      setSelectedEditRequest(null);
      alert(t('Đã từ chối và xóa yêu cầu.'));
      onRefresh();
    }
  };

  const handleApproveDeleteCustomer = async (cust: any) => {
    if (window.confirm(t('Bạn có chắc muốn phê duyệt xóa khách hàng này?'))) {
      await dbService.updateDocument('customers', cust.id, {
        deleted: true,
        deleteRequested: false,
        deleteRequestedAt: ''
      });
      alert(t('Đã xóa khách hàng.'));
      onRefresh();
    }
  };

  const handleRejectDeleteCustomer = async (cust: any) => {
    if (window.confirm(t('Từ chối yêu cầu xóa khách hàng này?'))) {
      await dbService.updateDocument('customers', cust.id, {
        deleteRequested: false,
        deleteRequestedBy: '',
        deleteRequestedAt: ''
      });
      alert(t('Đã từ chối yêu cầu xóa.'));
      onRefresh();
    }
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
    reader.onload = (event) => {
      setRepoUploadFile(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Add folder
  const handleAddFolder = async () => {
    if (!selectedCustomer || currentUser.role !== 'admin') return;
    const folderNameTrim = newFolderName.trim();
    if (!folderNameTrim) return;

    const folders = getCustomerRepositoryFolders(selectedCustomer);
    const folderExists = folders.some(folder => folder.name.trim().toLocaleLowerCase('vi-VN') === folderNameTrim.toLocaleLowerCase('vi-VN'));
    if (folderExists) {
      alert(t('Thư mục này đã tồn tại.'));
      return;
    }

    const now = new Date().toISOString();
    const newFolder: CustomerRepositoryFolder = {
      id: createCustomerFolderId(folderNameTrim, folders.map(folder => folder.id)),
      name: folderNameTrim,
      parentId: null,
      order: (Math.max(0, ...folders.map(folder => Number(folder.order) || 0)) + 10),
      active: true,
      createdAt: now,
      createdById: currentUser.uid,
      updatedAt: '',
      updatedById: ''
    };
    const nextFolders = [...folders, newFolder];
    await dbService.updateDocument('customers', selectedCustomer.id, {
      fileFolders: nextFolders,
      updatedAt: now,
      updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
    });

    setNewFolderName('');
    setActiveRepositoryFolderId(newFolder.id);
    setSelectedFolderForUpload(newFolder.id);
    setSelectedCustomer((prev: any) => ({ ...prev, fileFolders: nextFolders }));
    onRefresh();
  };

  const handleRenameRepoFolder = async (folderId: string) => {
    if (!selectedCustomer || currentUser.role !== 'admin') return;
    const nextName = folderNameDraft.trim();
    if (!nextName) return;
    const folders = getCustomerRepositoryFolders(selectedCustomer);
    if (folders.some(folder => folder.id !== folderId && folder.name.trim().toLocaleLowerCase('vi-VN') === nextName.toLocaleLowerCase('vi-VN'))) {
      alert(t('Tên thư mục này đã tồn tại.'));
      return;
    }
    const now = new Date().toISOString();
    const nextFolders = folders.map(folder => folder.id === folderId ? ({
      ...folder,
      name: nextName,
      updatedAt: now,
      updatedById: currentUser.uid
    }) : folder);
    await dbService.updateDocument('customers', selectedCustomer.id, {
      fileFolders: nextFolders,
      updatedAt: now,
      updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
    });
    setSelectedCustomer((previous: any) => previous ? ({ ...previous, fileFolders: nextFolders }) : previous);
    setRenamingFolderId('');
    setFolderNameDraft('');
    onRefresh();
  };

  // Upload file to customer repo
  const handleUploadRepoFile = async (e: React.FormEvent) => {
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
    await dbService.updateDocument('customers', selectedCustomer.id, {
      files: newFiles,
      fileFolders: folders
    });

    setRepoUploadFile('');
    setRepoUploadFileName('');
    setRepoUploadLink('');
    setSelectedCustomer((prev: any) => ({ ...prev, files: newFiles }));
    onRefresh();
  };

  // Delete file/folder from customer repo
  const handleDeleteRepoFile = async (fileId: string) => {
    if (!selectedCustomer) return;
    if (!window.confirm(t('Bạn có chắc chắn muốn xóa tệp này khỏi kho lưu trữ?'))) {
      return;
    }
    const updatedFiles = selectedCustomer.files || [];
    const newFiles = updatedFiles.filter((file: any) => file.id !== fileId);

    await dbService.updateDocument('customers', selectedCustomer.id, {
      files: newFiles
    });

    setSelectedCustomer((prev: any) => ({ ...prev, files: newFiles }));
    onRefresh();
  };

  const handleDeleteRepoFolder = async (folderId: string) => {
    if (!selectedCustomer || currentUser.role !== 'admin') return;
    const folders = getCustomerRepositoryFolders(selectedCustomer);
    const folder = folders.find(item => item.id === folderId);
    if (!folder) return;
    const containsFiles = (selectedCustomer.files || []).some((file: any) => file.name !== '.placeholder' && resolveCustomerFileFolderId(file, folders) === folderId);
    const containsContracts = folderId === 'contracts' && (selectedCustomer.contracts || []).length > 0;
    if (containsFiles || containsContracts) {
      alert(t('Không thể xóa thư mục đang có tài liệu. Hãy chuyển hoặc xóa tài liệu bên trong trước.'));
      return;
    }
    if (folders.length === 1) {
      alert(t('Kho lưu trữ phải có ít nhất một thư mục.'));
      return;
    }
    if (!window.confirm(`${t('Xóa thư mục')} “${folder.name}”?`)) return;
    const nextFolders = folders.filter(item => item.id !== folderId);

    await dbService.updateDocument('customers', selectedCustomer.id, {
      fileFolders: nextFolders
    });

    const nextActiveId = nextFolders[0]?.id || '';
    setActiveRepositoryFolderId(nextActiveId);
    setSelectedFolderForUpload(nextActiveId);
    setSelectedCustomer((prev: any) => ({ ...prev, fileFolders: nextFolders }));
    onRefresh();
  };

  // Product Helpers
  function hasDuplicateProductCode(code: string, excludedProductId = '') {
    const normalizedCode = code.trim().toLocaleUpperCase('vi-VN');
    if (!normalizedCode || !selectedCustomer) return false;
    return (selectedCustomer.products || []).some((product: CustomerProductRecord) => (
      !product.deleted
      && product.id !== excludedProductId
      && product.productCode.trim().toLocaleUpperCase('vi-VN') === normalizedCode
    ));
  }

  const handleOpenAddProduct = () => {
    setProductCode('');
    setProductName('');
    setProductType('tem_trang_cuon');
    setCurrentPrice(0);
    setProductMaterial('');
    setProductUnit('cái');
    setProductVatRate(8);
    setProductSupplierId('');
    setProductPurchasePrice(0);
    setProductDiscountType('percent');
    setProductDiscountRate(0);
    setProductDiscountAmount(0);
    setProductLeadTimeDays(0);
    setSpecCustomRows([]);
    setProductLayoutBase64('');
    setSpecFields(loadSpecsToFields('tem_trang_cuon'));
    setShowAddProductModal(true);
  };

  const handleAddProductTypeChange = (type: any) => {
    setProductType(type);
    setSpecFields(loadSpecsToFields(type));
  };

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
    reader.onload = (event) => {
      setProductLayoutBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !productCode || !productName || !currentPrice) return;
    if (hasDuplicateProductCode(productCode)) {
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

    const newProduct = {
      id: `prod-${Math.random().toString(36).substr(2, 9)}`,
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
      priceHistory: [
        { date: new Date().toISOString().split('T')[0], price: Number(currentPrice) }
      ],
      createdAt: new Date().toISOString()
    };

    const updatedProducts = [...(selectedCustomer.products || []), newProduct];

    await dbService.updateDocument('customers', selectedCustomer.id, {
      products: updatedProducts
    });

    setSelectedCustomer((prev: any) => ({
      ...prev,
      products: updatedProducts
    }));

    setShowAddProductModal(false);
    onRefresh();
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!selectedCustomer) return;
    if (window.confirm(t('Bạn có chắc chắn muốn xóa mã sản phẩm này?'))) {
      const updatedProducts = (selectedCustomer.products || []).map((p: any) => {
        if (p.id === productId) {
          return { ...p, deleted: true, deletedAt: new Date().toISOString() };
        }
        return p;
      });

      await dbService.updateDocument('customers', selectedCustomer.id, {
        products: updatedProducts
      });

      setSelectedCustomer((prev: any) => ({
        ...prev,
        products: updatedProducts
      }));

      onRefresh();
    }
  };

  const handleOpenRequote = (prod: any) => {
    setSelectedProduct(prod);
    setRequotePrice(prod.currentPrice);
    setRequoteNote('');
    setShowRequoteModal(true);
  };

  const handleRequoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedProduct) return;

    const updatedProducts = (selectedCustomer.products || []).map((p: any) => {
      if (p.id === selectedProduct.id) {
        return {
          ...p,
          currentPrice: Number(requotePrice),
          priceHistory: [
            ...(p.priceHistory || []),
            {
              date: new Date().toISOString().split('T')[0],
              price: Number(requotePrice),
              note: requoteNote,
              updatedBy: `${currentUser.displayName} (${currentUser.role.toUpperCase()})`
            }
          ]
        };
      }
      return p;
    });

    await dbService.updateDocument('customers', selectedCustomer.id, {
      products: updatedProducts
    });

    setSelectedCustomer((prev: any) => ({
      ...prev,
      products: updatedProducts
    }));

    setShowRequoteModal(false);
    setSelectedProduct(null);
    onRefresh();
  };

  // Contract Helpers
  const handleContractFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      alert(t('Tệp lớn hơn 900 KB. Vui lòng lưu hợp đồng trên Drive/OneDrive và thêm dưới dạng đường dẫn trong kho tài liệu.'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setContractFile(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAddContractSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !contractNo) return;

    const newContract = {
      id: `contr-${Math.random().toString(36).substr(2, 9)}`,
      contractNo,
      signDate: contractSignDate,
      expiryDate: contractExpiryDate,
      value: Number(contractValue),
      fileUrl: contractFile,
      status: new Date(contractExpiryDate).getTime() > Date.now() ? 'active' : 'expired',
      createdAt: new Date().toISOString(),
      createdById: currentUser.uid,
      createdBy: currentUser.displayName
    };

    const updatedContracts = [...(selectedCustomer.contracts || []), newContract];

    await dbService.updateDocument('customers', selectedCustomer.id, {
      contracts: updatedContracts
    });

    setSelectedCustomer((prev: any) => ({
      ...prev,
      contracts: updatedContracts
    }));

    setShowAddContractModal(false);
    setContractNo('');
    setContractFile('');
    onRefresh();
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!selectedCustomer) return;
    if (window.confirm(t('Bạn có chắc chắn muốn xóa hợp đồng này?'))) {
      const updatedContracts = (selectedCustomer.contracts || []).filter((c: any) => c.id !== contractId);

      await dbService.updateDocument('customers', selectedCustomer.id, {
        contracts: updatedContracts
      });

      setSelectedCustomer((prev: any) => ({
        ...prev,
        contracts: updatedContracts
      }));

      onRefresh();
    }
  };

  // Order history helper for selected customer
  const getCustomerOrders = (custId: string) => {
    return pos
      .filter(po => po.customerId === custId && !po.deleted)
      .sort((a, b) => (
        (parseValidDate(b.orderDate || b.createdAt)?.getTime() || 0)
        - (parseValidDate(a.orderDate || a.createdAt)?.getTime() || 0)
      ));
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
    const diffMonths = Math.max(1, (now.getFullYear() - minDate.getFullYear()) * 12 + (now.getMonth() - minDate.getMonth()));

    return `${(orders.length / diffMonths).toFixed(1)} ${t('đơn/tháng')}`;
  };

  // Customer overview metrics and filters
  const today = new Date();
  const accessibleCustomers = customers.filter(customer => (
    customer.deleted !== true
    && (currentUser.role !== 'sale' || !customer.assignedSaleId || customer.assignedSaleId === currentUser.uid)
  ));
  const accessibleCustomerIds = new Set(accessibleCustomers.map(customer => customer.id));
  const customFilterOptions = Object.fromEntries(
    customFieldDefinitions.filter(definition => definition.active && definition.filterable).map(definition => [
      definition.id,
      Array.from(new Set(accessibleCustomers.flatMap(customer => getEntityCustomFieldFilterTokens(definition, customer.customFieldValues?.[definition.id]))))
        .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
    ])
  );
  const customerMaterialsById = useMemo(() => buildCustomerMaterialHistory(pos), [pos]);
  const customerSamplesById = useMemo(() => buildCustomerOrderedSampleHistory(pos), [pos]);

  const openCustomerDetail = (customer: CustomerRecord) => {
    setCustomerHistoryTab('po');
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

  const closeCustomerDetail = () => {
    const savedNoteHtml = selectedCustomer
      ? sanitizeCustomerNoteHtml(selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))).trim()
      : '';
    const hasUnsavedNote = selectedCustomer
      && sanitizeCustomerNoteHtml(customerNoteDraft).trim() !== savedNoteHtml;
    if (hasUnsavedNote && !window.confirm(t('Ghi chú chưa được lưu. Bạn có muốn rời khỏi trang?'))) return;
    setSelectedCustomer(null);
    setCustomerNoteFeedback('');
  };

  const customerRepositoryFolders = selectedCustomer
    ? getCustomerRepositoryFolders(selectedCustomer).filter(folder => folder.active !== false)
    : [];
  const activeRepositoryFolder = customerRepositoryFolders.find(folder => folder.id === activeRepositoryFolderId)
    || customerRepositoryFolders[0];
  const activeRepositoryFiles = selectedCustomer && activeRepositoryFolder
    ? (selectedCustomer.files || []).filter((file: any) => (
      file.name !== '.placeholder'
      && resolveCustomerFileFolderId(file, customerRepositoryFolders) === activeRepositoryFolder.id
    ))
    : [];
  const activeRepositoryContracts = selectedCustomer && activeRepositoryFolder?.id === 'contracts'
    ? (selectedCustomer.contracts || [])
    : [];
  const activeRepositoryDocuments = selectedCustomer && activeRepositoryFolder
    ? (selectedCustomer.documents || []).filter((documentRecord: any) => (
      (DOCUMENT_REPOSITORY_FOLDER_IDS[documentRecord.category] || 'other') === activeRepositoryFolder.id
    ))
    : [];

  const getCustomerOrderValue = (customerId: string) => getCustomerOrders(customerId)
    .reduce((total, order) => total + Number(order.netAmount || order.totalAmount || 0), 0);

  const getCustomerOutstandingDebt = (customerId: string) => invoices
    .filter(invoice => invoice.deleted !== true && invoice.type === 'receivable' && invoice.customerId === customerId)
    .reduce((total, invoice) => total + Math.max(0, Number(invoice.amount || 0) - Number(invoice.paidAmount || 0)), 0);

  const isNewCustomer = (customer: CustomerRecord): boolean => {
    const createdDate = parseValidDate(customer.createdAt || customer.convertedAt);
    if (!createdDate) return false;
    const ageInMilliseconds = today.getTime() - createdDate.getTime();
    return ageInMilliseconds >= 0 && ageInMilliseconds < 7 * 86_400_000;
  };

  const customersWithDebt = accessibleCustomers.filter(customer => getCustomerOutstandingDebt(customer.id) > 0);
  const currentYear = String(today.getFullYear());

  const leadById = new Map(leads.map(lead => [lead.id, lead] as const));
  const provinceByCustomerId = new Map<string, string>(accessibleCustomers.map(customer => {
    const customerProvince = customer.province?.trim();
    if (customerProvince) return [customer.id, customerProvince] as const;
    const linkedProvince = leadById.get(customer.sourceLeadId)?.province?.trim();
    if (linkedProvince) return [customer.id, linkedProvince] as const;
    const normalizedAddress = normalizeFilterValue(customer.address);
    const matchedProvince = VIETNAM_PROVINCES_2026.find(province => (
      normalizedAddress.includes(normalizeFilterValue(province))
    ));
    return [customer.id, matchedProvince || ''] as const;
  }));
  const provinceFilterOptions: CrmFilterOption[] = Array.from(new Set(provinceByCustomerId.values()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'vi-VN'))
    .map(province => ({ value: province, label: province }));
  if (Array.from(provinceByCustomerId.values()).some(value => !value)) {
    provinceFilterOptions.push({ value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xác định tỉnh/thành' });
  }
  const industrialParkByCustomerId = new Map<string, string>(accessibleCustomers.map(customer => {
    const customerIndustrialPark = customer.industrialPark?.trim();
    if (customerIndustrialPark) return [customer.id, customerIndustrialPark] as const;
    return [customer.id, leadById.get(customer.sourceLeadId)?.industrialPark?.trim() || ''] as const;
  }));
  const industrialParkFilterOptions: CrmFilterOption[] = Array.from(new Set(industrialParkByCustomerId.values()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'vi-VN'))
    .map(industrialPark => ({ value: industrialPark, label: industrialPark }));
  if (Array.from(industrialParkByCustomerId.values()).some(value => !value)) {
    industrialParkFilterOptions.push({ value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xác định KCN' });
  }

  const productLabels = new Map<string, string>();
  const productKeysByCustomerId = new Map(accessibleCustomers.map(customer => [customer.id, new Set<string>()] as const));
  const registerCustomerProduct = (customerId: string, product: Record<string, unknown>) => {
    const productCode = String(product?.productCode || '').trim();
    const productName = String(product?.productName || '').trim();
    if (!productCode && !productName) return;
    const productKey = `${normalizeFilterValue(productCode)}::${normalizeFilterValue(productName)}`;
    productLabels.set(productKey, [productCode, productName].filter(Boolean).join(' · '));
    productKeysByCustomerId.get(customerId)?.add(productKey);
  };
  accessibleCustomers.forEach(customer => {
    (customer.products || []).forEach(product => registerCustomerProduct(customer.id, product));
  });
  pos.forEach(order => {
    if (order.deleted === true || !accessibleCustomerIds.has(order.customerId)) return;
    (Array.isArray(order.items) ? order.items : []).forEach((product: Record<string, unknown>) => registerCustomerProduct(order.customerId, product));
  });
  const productFilterOptions: CrmFilterOption[] = Array.from(productLabels.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'));
  const saleFilterOptions: CrmFilterOption[] = [
    ...users.filter(user => user.role === 'sale').map(user => ({ value: user.uid, label: user.displayName })),
    { value: UNASSIGNED_FILTER_VALUE, label: 'Chưa phân công' }
  ];
  const rankFilterOptions: CrmFilterOption[] = [
    ...(['A', 'B', 'C', 'D'] as CustomerRank[]).map(rank => ({ value: rank, label: `Hạng ${rank}` })),
    { value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xếp hạng' }
  ];
  const timeFilterOptions: CrmFilterOption[] = [
    { value: 'last_30_days', label: 'Có PO trong 30 ngày' },
    { value: 'last_90_days', label: 'Có PO trong 90 ngày' },
    { value: 'this_year', label: `Có PO trong năm ${currentYear}` },
    { value: 'no_orders', label: 'Chưa có PO' }
  ];
  const saleFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.sale)!;
  const rankFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.rank)!;
  const provinceFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.province)!;
  const industrialParkFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.industrialPark)!;
  const poTimeFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.poTime)!;
  const productFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.product)!;
  const saleFilterEnabled = saleFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.sale, 'crm_customers');
  const rankFilterEnabled = rankFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.rank, 'crm_customers');
  const provinceFilterEnabled = provinceFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.province, 'crm_customers');
  const industrialParkFilterEnabled = industrialParkFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.industrialPark, 'crm_customers');
  const poTimeFilterEnabled = poTimeFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.poTime, 'crm_customers');
  const productFilterEnabled = productFilterDefinition.active
    && isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.product, 'crm_customers');
  const configuredCustomerFilter = (filterId: string, fallback: CustomerFilterDefinition) => {
    const configured = getSystemFilterDefinition(systemFilterDefinitions, filterId);
    return {
      name: configured?.name || fallback.name,
      description: configured?.description || fallback.description
    };
  };
  const saleFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.sale, saleFilterDefinition);
  const rankFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.rank, rankFilterDefinition);
  const provinceFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.province, provinceFilterDefinition);
  const industrialParkFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.industrialPark, industrialParkFilterDefinition);
  const poTimeFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.poTime, poTimeFilterDefinition);
  const productFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.product, productFilterDefinition);
  const activeFilterCount = (saleFilterEnabled ? saleFilters.length : 0)
    + (rankFilterEnabled ? rankFilters.length : 0)
    + (poTimeFilterEnabled ? timeFilters.length : 0)
    + (provinceFilterEnabled ? provinceFilters.length : 0)
    + (industrialParkFilterEnabled ? industrialParkFilters.length : 0)
    + (productFilterEnabled ? productFilters.length : 0)
    + Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const resetCrmListFilters = () => {
    setSearchTerm('');
    setSaleFilters([]);
    setRankFilters([]);
    setTimeFilters([]);
    setProvinceFilters([]);
    setIndustrialParkFilters([]);
    setProductFilters([]);
    setCustomFieldFilters({});
    setCustomerPage(1);
  };
  const crmFilterChips = [
    ...(saleFilterEnabled ? saleFilters.map(value => ({
      id: `sale-${value}`,
      label: `${saleFilterCopy.name}: ${saleFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setSaleFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(rankFilterEnabled ? rankFilters.map(value => ({
      id: `rank-${value}`,
      label: `${rankFilterCopy.name}: ${rankFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setRankFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(poTimeFilterEnabled ? timeFilters.map(value => ({
      id: `time-${value}`,
      label: `${poTimeFilterCopy.name}: ${timeFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setTimeFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(provinceFilterEnabled ? provinceFilters.map(value => ({
      id: `province-${value}`,
      label: `${provinceFilterCopy.name}: ${provinceFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(industrialParkFilterEnabled ? industrialParkFilters.map(value => ({
      id: `industrial-park-${value}`,
      label: `${industrialParkFilterCopy.name}: ${industrialParkFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setIndustrialParkFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(productFilterEnabled ? productFilters.map(value => ({
      id: `product-${value}`,
      label: `${productFilterCopy.name}: ${productFilterOptions.find(option => option.value === value)?.label || value}`,
      onRemove: () => setProductFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...customFieldDefinitions.filter(definition => definition.active && definition.filterable).flatMap(definition => (customFieldFilters[definition.id] || []).map(value => ({
      id: `custom-${definition.id}-${value}`,
      label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
      onRemove: () => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: (previous[definition.id] || []).filter(item => item !== value) }))
    })))
  ];

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi-VN');
  const filteredCustomers = sortNewestFirst(accessibleCustomers.filter(customer => {
    const customerOrders = getCustomerOrders(customer.id);
    const customerMaterials = customerMaterialsById[customer.id] || [];
    const matchesSearch = !normalizedSearch || [
      customer.customerCode,
      customer.companyName,
      customer.contactPerson,
      customer.phone,
      customer.email,
      customer.taxCode,
      customer.province,
      customer.industrialPark,
      ...getEntityCustomFieldSearchValues(customFieldDefinitions, customer.customFieldValues),
      ...customerMaterials.flatMap(material => [
        material.materialName,
        ...material.productCodes,
        ...material.specifications
      ])
    ].some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(normalizedSearch));
    const matchesSale = !saleFilterEnabled || saleFilters.length === 0 || saleFilters.some(value => (
      value === UNASSIGNED_FILTER_VALUE ? !customer.assignedSaleId : customer.assignedSaleId === value
    ));
    const matchesRank = !rankFilterEnabled || rankFilters.length === 0 || rankFilters.some(value => (
      value === UNASSIGNED_FILTER_VALUE ? !customer.customerRank : customer.customerRank === value
    ));
    const customerProvince = provinceByCustomerId.get(customer.id) || '';
    const matchesProvince = !provinceFilterEnabled || provinceFilters.length === 0 || provinceFilters.some(value => (
      value === UNASSIGNED_FILTER_VALUE ? !customerProvince : customerProvince === value
    ));
    const customerIndustrialPark = industrialParkByCustomerId.get(customer.id) || '';
    const matchesIndustrialPark = !industrialParkFilterEnabled || industrialParkFilters.length === 0 || industrialParkFilters.some(value => (
      value === UNASSIGNED_FILTER_VALUE ? !customerIndustrialPark : customerIndustrialPark === value
    ));
    const customerProductKeys = productKeysByCustomerId.get(customer.id) || new Set<string>();
    const matchesProduct = !productFilterEnabled || productFilters.length === 0 || productFilters.some(value => customerProductKeys.has(value));
    const matchesCustomFields = customFieldDefinitions.filter(definition => definition.active && definition.filterable).every(definition => {
      const selected = customFieldFilters[definition.id] || [];
      if (selected.length === 0) return true;
      const tokens = getEntityCustomFieldFilterTokens(definition, customer.customFieldValues?.[definition.id]);
      return selected.some(value => tokens.includes(value));
    });
    const matchesTime = !poTimeFilterEnabled || timeFilters.length === 0 || timeFilters.some(value => {
      if (value === 'no_orders') return customerOrders.length === 0;
      return customerOrders.some(order => {
        const orderDate = parseValidDate(order.orderDate || order.createdAt);
        if (!orderDate) return false;
        if (value === 'this_year') return orderDate.getFullYear() === today.getFullYear();
        const elapsedDays = Math.floor((today.getTime() - orderDate.getTime()) / 86_400_000);
        return elapsedDays >= 0 && elapsedDays <= (value === 'last_30_days' ? 30 : 90);
      });
    });
    if (!matchesSearch || !matchesSale || !matchesRank || !matchesProvince || !matchesIndustrialPark || !matchesProduct || !matchesTime || !matchesCustomFields) return false;

    if (filterType === 'has_debt') return getCustomerOutstandingDebt(customer.id) > 0;
    return true;
  }), customer => [customer.createdAt, customer.updatedAt, customer.customerCode]);
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / customerPageSize));
  const safeCustomerPage = Math.min(customerPage, customerTotalPages);
  const displayedCustomers = filteredCustomers.slice(
    (safeCustomerPage - 1) * customerPageSize,
    safeCustomerPage * customerPageSize
  );
  const selectedCustomerSamples = selectedCustomer
    ? customerSamplesById[selectedCustomer.id] || []
    : [];
  const storedCustomerProducts = selectedCustomer
    ? ((selectedCustomer.products || []) as CustomerProductRecord[]).filter(product => !product.deleted)
    : [];
  const matchedSampleKeys = new Set<string>();
  const selectedCustomerProducts = [
    ...storedCustomerProducts.map(product => {
      const matchingSample = selectedCustomerSamples.find(sample => (
        (product.productCode && sample.productCode === product.productCode)
        || (!product.productCode && normalizeFilterValue(sample.productName) === normalizeFilterValue(product.productName))
      ));
      if (matchingSample) matchedSampleKeys.add(matchingSample.key);
      const assets = [product.layoutUrl, ...(product.designLayouts || []), ...(product.files || [])]
        .map(getProductAssetSource)
        .filter(Boolean);
      return {
        key: product.id,
        record: product,
        productCode: product.productCode,
        productName: product.productName,
        material: product.material || matchingSample?.material || '',
        specification: product.size || matchingSample?.specification || '',
        unit: product.unit || matchingSample?.unit || 'cái',
        orderCount: matchingSample?.orderCount || 0,
        totalQuantity: matchingSample?.totalQuantity || 0,
        lastPoId: matchingSample?.lastPoId || '',
        lastPoCode: matchingSample?.lastPoCode || '',
        lastOrderedAt: matchingSample?.lastOrderedAt || '',
        previewImage: assets[0] || matchingSample?.previewImage || '',
        assetCount: assets.length || (matchingSample?.previewImage ? 1 : 0)
      };
    }),
    ...selectedCustomerSamples.filter(sample => !matchedSampleKeys.has(sample.key)).map(sample => ({
      ...sample,
      record: null,
      assetCount: sample.previewImage ? 1 : 0
    }))
  ];

  // Top 5/15 customers by sales volume with time filters
  const topCustomerSales = accessibleCustomers
    .map(c => {
      const customerPOs = pos.filter(po => {
        if (po.deleted === true) return false;
        if (po.customerId !== c.id) return false;

        // Month and Year filter
        if (po.orderDate) {
          const poDate = parseValidDate(po.orderDate);
          if (!poDate) return false;
          const y = String(poDate.getFullYear());
          const m = String(poDate.getMonth() + 1);

          if (chartYear !== 'all' && y !== chartYear) return false;
          if (chartMonth !== 'all' && m !== chartMonth) return false;
        } else {
          if (chartYear !== 'all' || chartMonth !== 'all') return false;
        }
        return true;
      });

      return {
        label: c.companyName,
        value: customerPOs.length
      };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const chartData = topCustomerSales.slice(0, showTop15 ? 15 : 5);

  const renderProductCommercialFields = () => (
    <div className="product-commercial-fields">
      <div className="form-group">
        <label>{t('Đơn Vị Tính')}</label>
        <input value={productUnit} onChange={event => setProductUnit(event.target.value)} placeholder={t('cái, cuộn, tờ...')} />
      </div>
      <div className="form-group">
        <label>{t('Thuế VAT (%)')}</label>
        <input type="number" min="0" max="100" value={productVatRate} onChange={event => setProductVatRate(Number(event.target.value))} />
      </div>
      <div className="form-group">
        <label>{t('Nhà Cung Cấp Thường Dùng')}</label>
        <select value={productSupplierId} onChange={event => setProductSupplierId(event.target.value)}>
          <option value="">{t('-- Chọn nhà cung cấp --')}</option>
          {suppliers.filter(supplier => !supplier.deleted).map(supplier => (
            <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>{t('Giá Mua Tham Khảo (đ)')}</label>
        <input type="number" min="0" value={productPurchasePrice} onChange={event => setProductPurchasePrice(Number(event.target.value))} />
      </div>
      <div className="form-group">
        <label>{t('Chiết Khấu Sản Phẩm')}</label>
        <select value={productDiscountType} onChange={event => setProductDiscountType(event.target.value as PODiscountType)}>
          <option value="percent">{t('Theo phần trăm (%)')}</option>
          <option value="amount">{t('Theo tiền chênh (đ)')}</option>
        </select>
      </div>
      <div className="form-group">
        <label>{productDiscountType === 'amount' ? t('Tiền Chênh (đ)') : t('Tỷ Lệ Chiết Khấu (%)')}</label>
        {productDiscountType === 'amount' ? (
          <input type="number" min="0" value={productDiscountAmount} onChange={event => setProductDiscountAmount(Number(event.target.value))} />
        ) : (
          <input type="number" min="0" max="100" value={productDiscountRate} onChange={event => setProductDiscountRate(Number(event.target.value))} />
        )}
      </div>
      <div className="form-group">
        <label>{t('Thời Gian Chuẩn Bị (ngày)')}</label>
        <input type="number" min="0" value={productLeadTimeDays} onChange={event => setProductLeadTimeDays(Number(event.target.value))} />
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
      ['Sale phụ trách', assignedSaleName]
    ]);
    try {
      await copyTextToClipboard(profile);
      window.alert('Đã sao chép hồ sơ doanh nghiệp.');
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
      ['Địa chỉ giao hàng', customer.address],
      ['Người liên hệ', customer.contactPerson],
      ['Số điện thoại', customer.phone],
      ['Email', customer.email],
      ['Sale phụ trách', assignedSaleName],
      ['Hạn mức công nợ', `${Number(customer.debtLimit || 0).toLocaleString('vi-VN')} đ`],
      ['Điều khoản thanh toán', customer.paymentTerms],
      ['Ghi chú', customer.note]
    ]);
    try {
      await copyTextToClipboard(profile);
      window.alert('Đã sao chép thông tin doanh nghiệp.');
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
            {Object.entries(CONTACT_ROLE_LABELS).filter(([role]) => role !== 'primary').map(([role, label]) => (
              <option key={role} value={role}>{t(label)}</option>
            ))}
          </select>
          <input value={contact.name} onChange={event => updateContactRow(contact.id, 'name', event.target.value)} placeholder={t('Họ tên')} />
          <input value={contact.phone} onChange={event => updateContactRow(contact.id, 'phone', event.target.value)} placeholder={t('Số điện thoại')} />
          <input value={contact.email} onChange={event => updateContactRow(contact.id, 'email', event.target.value)} placeholder="Email" />
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

  const renderCustomerOnboardingTables = () => (
    <div className="customer-onboarding-tables">
      <div className="customer-onboarding-profile-grid">
        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading customer-data-section__heading--actions">
            <div><Building2 size={16} /><span>Hồ sơ doanh nghiệp</span></div>
            <button type="button" className="customer-profile-copy-button" onClick={() => void handleCopyOnboardingProfile()} title="Sao chép hồ sơ doanh nghiệp">
              <Copy size={13} /> Sao chép
            </button>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="companyName">Tên công ty *</span>
              <input type="text" value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Nhập tên doanh nghiệp..." required />
            </label>
            <label className="form-group">
              <span data-system-label="customerCode">Mã khách hàng *</span>
              <input type="text" value={customerCode} onChange={event => setCustomerCode(event.target.value)} required />
            </label>
            <label className="form-group">
              <span data-system-label="taxCode">Mã số thuế</span>
              <input type="text" value={taxCode} onChange={event => setTaxCode(event.target.value)} />
            </label>
            <label className="form-group">
              <span data-system-label="customerRank">Hạng khách hàng *</span>
              <select value={customerRank} onChange={event => setCustomerRank(event.target.value as CustomerRank)} required>
                <option value="">Chọn hạng</option>
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </label>
            <label className="form-group">
              <span data-system-label="assignedSaleId">Sale phụ trách</span>
              <select value={assignedSaleId} onChange={event => setAssignedSaleId(event.target.value)} disabled={currentUser.role === 'sale'}>
                {saleUsers.map(sale => <option key={sale.uid} value={sale.uid}>{sale.displayName}</option>)}
              </select>
            </label>
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
              <input value={address} onChange={event => setAddress(event.target.value)} placeholder="Số nhà, đường, lô đất..." />
            </label>
            <div className="customer-location-preview">
              <span>Địa chỉ đang chọn</span>
              <strong>{[address, industrialPark, ward, province].filter(Boolean).join(', ') || 'Chưa chọn địa bàn doanh nghiệp'}</strong>
            </div>
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
        </section>

        <section className="customer-data-section customer-profile-card">
          <div className="customer-data-section__heading">
            <ShoppingBag size={16} />
            <span>Điều khoản thương mại</span>
          </div>
          <div className="customer-profile-card__body customer-profile-fields">
            <label className="form-group">
              <span data-system-label="discountType">Hình thức chiết khấu</span>
              <select value={discountType} onChange={event => setDiscountType(event.target.value as PODiscountType)}>
                <option value="percent">Theo phần trăm (%)</option>
                <option value="amount">Theo tiền chênh (đ)</option>
              </select>
            </label>
            <label className="form-group">
              <span>{discountType === 'amount' ? 'Tiền chênh mặc định (đ)' : 'Chiết khấu mặc định (%)'}</span>
              {discountType === 'amount' ? (
                <input type="number" min="0" value={discountAmount} onChange={event => setDiscountAmount(Number(event.target.value))} />
              ) : (
                <input type="number" min="0" max="100" value={discountRate} onChange={event => setDiscountRate(Number(event.target.value))} />
              )}
            </label>
            <label className="form-group">
              <span data-system-label="debtLimit">Hạn mức công nợ (đ)</span>
              <input type="number" min="0" value={debtLimit} onChange={event => setDebtLimit(Number(event.target.value))} />
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
              <input value={bankAccount} onChange={event => setBankAccount(event.target.value)} placeholder="Số tài khoản, ngân hàng, chi nhánh..." />
            </label>
            <label className="form-group customer-profile-field--wide">
              <span data-system-label="note">Ghi chú yêu cầu riêng</span>
              <input value={note} onChange={event => setNote(event.target.value)} />
            </label>
          </div>
        </section>

        {renderAdditionalContactsEditor()}
      </div>

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
    </div>
  );

  return (
    <SystemFieldSurface table="customers" className={`crm-view ${selectedCustomer ? 'crm-view--detail' : ''}`}>
      <PageContextHeader section={t('Khách hàng')} current={filterType === 'has_debt' ? t('Có công nợ') : filterType === 'analytics' ? t('Phân tích') : t('Tất cả')} />

      {currentUser.role === 'admin' && (editRequests.some(r => r.status === 'pending') || customers.some(c => c.deleteRequested && !c.deleted)) && (
        <div className="card" style={{ border: '2px solid var(--color-primary-light)', backgroundColor: '#f0fdf4', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div className="card-header" style={{ paddingBottom: '8px', borderBottom: '1px solid var(--color-border-light)' }}>
            <span className="card-title" style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
              <AlertCircle size={20} />
              {t('BẢNG ĐIỀU HÀNH PHÊ DUYỆT (ADMIN APPROVALS)')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {sortNewestFirst(
              customers.filter(c => c.deleteRequested && !c.deleted),
              customer => [customer.deleteRequestedAt, customer.updatedAt, customer.createdAt]
            ).map(cust => (
              <div key={cust.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #fed7d7', borderRadius: '4px', backgroundColor: '#fff5f5' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>[${t('YÊU CẦU XÓA KHÁCH HÀNG')}] </span>
                  <strong>{cust.companyName}</strong> - {t('Yêu cầu bởi:')} {cust.deleteRequestedBy || 'Sale'}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => handleApproveDeleteCustomer(cust)}>{t('Duyệt Xóa')}</button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => handleRejectDeleteCustomer(cust)}>{t('Hủy Yêu Cầu')}</button>
                </div>
              </div>
            ))}

            {sortNewestFirst(
              editRequests.filter(r => r.status === 'pending'),
              request => [request.requestedAt, request.createdAt]
            ).map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '4px', backgroundColor: '#ffffff' }}>
                <div>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-warning)' }}>[${t('YÊU CẦU CHỈNH SỬA')}] </span>
                  <strong>{req.fieldName}</strong> - {t('Yêu cầu bởi:')} {req.requestedBy} ({formatDateTime(req.requestedAt, 'vi-VN', '')})
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => {
                    setSelectedEditRequest(req);
                    setShowCompareModal(true);
                  }}>{t('Xem So Sánh (Diff)')}</button>
                  <button type="button" className="btn btn-sm btn-success" onClick={() => handleApproveRequest(req)}>{t('Duyệt')}</button>
                  <button type="button" className="btn btn-sm btn-outline" style={{ color: 'red', borderColor: 'red' }} onClick={() => handleRejectRequest(req)}>{t('Từ Chối')}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        <>
          <div className="crm-command-center crm-data-workspace">
            <div className="crm-list-commandbar">
              <div className="crm-list-tabs content-tabs content-tabs--commandbar" role="tablist" aria-label={t('Chọn nhóm khách hàng')}>
                <button type="button" className={`crm-list-tab ${filterType === 'all' ? 'is-active' : ''}`} onClick={() => { setFilterType('all'); setCustomerPage(1); }} role="tab" aria-selected={filterType === 'all'}>
                  <Building2 size={15} /><span>{t('Tất cả')}</span><span className="crm-list-tab__count">{accessibleCustomers.length}</span>
                </button>
                <button type="button" className={`crm-list-tab ${filterType === 'has_debt' ? 'is-active' : ''}`} onClick={() => { setFilterType('has_debt'); setCustomerPage(1); }} role="tab" aria-selected={filterType === 'has_debt'}>
                  <CircleDollarSign size={15} /><span>{t('Có công nợ')}</span><span className="crm-list-tab__count">{customersWithDebt.length}</span>
                </button>
                <button type="button" className={`crm-list-tab ${filterType === 'analytics' ? 'is-active' : ''}`} onClick={() => { setFilterType('analytics'); setCustomerPage(1); }} role="tab" aria-selected={filterType === 'analytics'}>
                  <BarChart3 size={15} /><span>{t('Phân tích')}</span>
                </button>
              </div>
              <div className="crm-list-toolbar">
                {filterType !== 'analytics' && (
                  <>
                    <div className="crm-list-search"><Search size={16} /><input type="text" placeholder={t('Tìm công ty, mã KH, liên hệ, SĐT, MST...')} value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setCustomerPage(1); }} /></div>
                    <DataFilterButton activeCount={activeFilterCount} open={showListFilters} onClick={() => setShowListFilters(true)} />
                    {(searchTerm || activeFilterCount > 0) && (
                      <button type="button" className="btn btn-outline crm-reset-filters" onClick={resetCrmListFilters}><X size={14} /> {t('Đặt lại')}</button>
                    )}
                  </>
                )}
                {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                  <button className="btn btn-primary crm-add-customer" onClick={() => openAddModal()} title={t('Thêm Khách Hàng Mới')}>
                    <Plus size={18} />
                    <span>{t('Thêm khách hàng')}</span>
                  </button>
                )}
              </div>
            </div>

            {filterType === 'analytics' ? (
              <div className="crm-analytics-panel">
                <div className="crm-analytics-header">
                  <div><strong>{t('Sản lượng đơn hàng theo khách hàng')}</strong><span>{t('So sánh số PO đã phát sinh theo khoảng thời gian.')}</span></div>
                  <div>
                    <select value={chartYear} onChange={(event) => setChartYear(event.target.value)}>
                      <option value="all">{t('Tất cả năm')}</option>
                      {[currentYear, String(Number(currentYear) - 1)].map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select value={chartMonth} onChange={(event) => setChartMonth(event.target.value)}>
                      <option value="all">{t('Tất cả tháng')}</option>
                      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map(month => <option key={month} value={month}>{t('Tháng')} {month}</option>)}
                    </select>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setShowTop15(!showTop15)}>{showTop15 ? t('Thu gọn Top 5') : t('Xem Top 15')}</button>
                  </div>
                </div>
                {chartData.length > 0 ? <HorizontalBarChart data={chartData} valueSuffix={` ${t('đơn')}`} /> : <div className="crm-empty-state">{t('Chưa có đơn hàng trong khoảng thời gian đã chọn.')}</div>}
              </div>
            ) : (
              <>
                <DataFilterChipBar chips={crmFilterChips} onClear={resetCrmListFilters} />

                <DataFilterPanel
                  open={showListFilters}
                  title="Lọc danh sách khách hàng"
                  description="Kết hợp nhiều tiêu chí để tạo đúng danh sách cần theo dõi."
                  activeCount={activeFilterCount}
                  onClose={() => setShowListFilters(false)}
                  onReset={resetCrmListFilters}
                  headerAction={currentUser.role === 'admin' ? (
                    <button type="button" className="btn btn-outline" onClick={() => { setShowListFilters(false); onNavigateToSystemConfiguration(); }}>
                      <Settings2 size={14} /> Mở cấu hình hệ thống
                    </button>
                  ) : undefined}
                >
                  {saleFilterEnabled && (
                    <DataFilterSection title={saleFilterCopy.name} description={saleFilterCopy.description} selectedCount={saleFilters.length}>
                      <DataFilterCheckboxGroup options={saleFilterOptions} selectedValues={saleFilters} onChange={values => { setSaleFilters(values); setCustomerPage(1); }} searchable />
                    </DataFilterSection>
                  )}
                  {rankFilterEnabled && (
                    <DataFilterSection title={rankFilterCopy.name} description={rankFilterCopy.description} selectedCount={rankFilters.length}>
                      <DataFilterCheckboxGroup options={rankFilterOptions} selectedValues={rankFilters} onChange={values => { setRankFilters(values); setCustomerPage(1); }} />
                    </DataFilterSection>
                  )}
                  {provinceFilterEnabled && (
                    <DataFilterSection title={provinceFilterCopy.name} description={provinceFilterCopy.description} selectedCount={provinceFilters.length}>
                      <DataFilterCheckboxGroup options={provinceFilterOptions} selectedValues={provinceFilters} onChange={values => { setProvinceFilters(values); setCustomerPage(1); }} searchable />
                    </DataFilterSection>
                  )}
                  {industrialParkFilterEnabled && (
                    <DataFilterSection title={industrialParkFilterCopy.name} description={industrialParkFilterCopy.description} selectedCount={industrialParkFilters.length}>
                      <DataFilterCheckboxGroup options={industrialParkFilterOptions} selectedValues={industrialParkFilters} onChange={values => { setIndustrialParkFilters(values); setCustomerPage(1); }} searchable />
                    </DataFilterSection>
                  )}
                  {poTimeFilterEnabled && (
                    <DataFilterSection title={poTimeFilterCopy.name} description={poTimeFilterCopy.description} selectedCount={timeFilters.length}>
                      <DataFilterCheckboxGroup options={timeFilterOptions} selectedValues={timeFilters} onChange={values => { setTimeFilters(values as CrmTimeFilter[]); setCustomerPage(1); }} />
                    </DataFilterSection>
                  )}
                  {productFilterEnabled && (
                    <DataFilterSection title={productFilterCopy.name} description={productFilterCopy.description} selectedCount={productFilters.length}>
                      <DataFilterCheckboxGroup options={productFilterOptions} selectedValues={productFilters} onChange={values => { setProductFilters(values); setCustomerPage(1); }} searchable />
                    </DataFilterSection>
                  )}
                  {customFieldDefinitions.filter(definition => definition.active && definition.filterable).map(definition => (
                    <DataFilterSection key={definition.id} title={definition.name} description={definition.description || 'Lọc theo trường tùy chỉnh.'} selectedCount={(customFieldFilters[definition.id] || []).length}>
                      <DataFilterCheckboxGroup
                        options={customFilterOptions[definition.id] || []}
                        selectedValues={customFieldFilters[definition.id] || []}
                        onChange={values => { setCustomFieldFilters(previous => ({ ...previous, [definition.id]: values })); setCustomerPage(1); }}
                        searchable={(customFilterOptions[definition.id] || []).length > 8}
                      />
                    </DataFilterSection>
                  ))}
                </DataFilterPanel>

                <div className="crm-customer-grid">
                  <div className="table-container crm-customer-table-wrap">
                  <ConfiguredSystemTable table="customers" className="crm-customer-table is-compact">
                    <thead><tr><th data-system-field="companyName">{t('Khách hàng')}</th><th data-system-field="customerCode">{t('Mã KH')}</th><th data-system-field="customerRank">{t('Phân loại')}</th><th data-system-field="taxCode">{t('Mã số thuế')}</th><th data-system-field="phone">{t('SĐT')}</th><th data-system-field="email">{t('Mail')}</th><th data-system-field="assignedSaleId">{t('Sale phụ trách')}</th><th data-system-field="businessResult">{t('Kết quả kinh doanh')}</th>{customFieldDefinitions.filter(definition => definition.active && definition.defaultVisible).map(definition => <th key={definition.id}>{definition.name}</th>)}<th>{t('Thao tác')}</th></tr></thead>
                    <tbody>
                      {displayedCustomers.map(customer => {
                        const customerOrders = getCustomerOrders(customer.id);
                        const orderValue = getCustomerOrderValue(customer.id);
                        const isNew = isNewCustomer(customer);
                        const saleName = users.find(user => user.uid === customer.assignedSaleId)?.displayName || t('Chưa phân công');
                        return (
                          <React.Fragment key={customer.id}>
                            <tr onClick={() => openCustomerDetail(customer)}>
                              <td><div className="crm-customer-identity" title={`${customer.companyName} · ${customer.contactPerson || t('Chưa có người liên hệ')}`}><strong className="erp-company-name">{customer.companyName}</strong>{isNew && <span className="crm-new-customer-badge" title={t('Khách hàng mới trong 7 ngày đầu')}><span aria-hidden="true" />NEW</span>}</div></td>
                              <td><span className="customer-code-badge">{customer.customerCode || customer.id}</span></td>
                              <td><div className="crm-customer-segment" title={customer.discountType === 'amount' ? `${t('CK')} ${Number(customer.discountAmount || 0).toLocaleString('vi-VN')} đ` : `${t('Chiết khấu')} ${Number(customer.discountRate || 0)}%`}><span className={`customer-rank-badge ${customer.customerRank ? 'has-rank' : ''}`}>{customer.customerRank ? `${t('Hạng')} ${customer.customerRank}` : t('Chưa xếp hạng')}</span></div></td>
                              <td><span className={customer.taxCode ? 'crm-tax-code' : 'crm-text-muted'}>{customer.taxCode || t('Chưa cập nhật')}</span></td>
                              <td><span className={customer.phone ? 'crm-contact-value' : 'crm-text-muted'}>{customer.phone || t('Chưa cập nhật')}</span></td>
                              <td><span className={customer.email ? 'crm-contact-value crm-email-value' : 'crm-text-muted'} title={customer.email || undefined}>{customer.email || t('Chưa cập nhật')}</span></td>
                              <td><strong className={customer.assignedSaleId ? '' : 'crm-text-muted'}>{saleName}</strong></td>
                              <td><div className="crm-business-result" title={`${customerOrders.length} ${t('đơn')} · ${orderValue.toLocaleString('vi-VN')} đ`}><strong>{customerOrders.length} {t('đơn')} · {orderValue.toLocaleString('vi-VN')} đ</strong></div></td>
                              {customFieldDefinitions.filter(definition => definition.active && definition.defaultVisible).map(definition => <td key={definition.id}>{formatEntityCustomFieldValue(definition, customer.customFieldValues?.[definition.id])}</td>)}
                              <td>
                                <RowActionMenu
                                  label={`${t('Thao tác')} ${customer.companyName}`}
                                  actions={[
                                    ...((currentUser.role === 'admin' || currentUser.role === 'sale') ? [{ label: t('Tạo PO'), icon: <ClipboardPlus size={14} />, onSelect: () => onPreparedOrderCreated?.(customer.id) }] : []),
                                    { label: t('Chi tiết'), icon: <Eye size={14} />, onSelect: () => openCustomerDetail(customer) },
                                    ...((currentUser.role === 'admin' || currentUser.role === 'sale') ? [
                                      { label: t('Chỉnh sửa'), icon: <Pencil size={14} />, onSelect: () => openEditModal(customer) },
                                      {
                                        label: currentUser.role !== 'admin' && customer.deleteRequested ? 'Đã gửi yêu cầu xóa' : 'Xóa khách hàng',
                                        icon: <Trash2 size={14} />,
                                        onSelect: () => handleDeleteCustomer(customer.id),
                                        disabled: currentUser.role !== 'admin' && customer.deleteRequested,
                                        danger: true
                                      }
                                    ] : [])
                                  ]}
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                      {filteredCustomers.length === 0 && <tr><td colSpan={10 + customFieldDefinitions.filter(definition => definition.active && definition.defaultVisible).length} className="crm-empty-state">{t('Không tìm thấy khách hàng phù hợp với bộ lọc.')}</td></tr>}
                    </tbody>
                  </ConfiguredSystemTable>
                  </div>
                  {filteredCustomers.length > 0 && <footer className="crm-customer-pagination">
                    <label>{t('Hiển thị')} <select value={customerPageSize} onChange={event => { setCustomerPageSize(Number(event.target.value)); setCustomerPage(1); }}><option value={25}>25 {t('dòng')}</option><option value={50}>50 {t('dòng')}</option><option value={100}>100 {t('dòng')}</option></select></label>
                    <span>{(safeCustomerPage - 1) * customerPageSize + 1}–{Math.min(safeCustomerPage * customerPageSize, filteredCustomers.length)} / {filteredCustomers.length}</span>
                    <div><button type="button" onClick={() => setCustomerPage(page => Math.max(1, page - 1))} disabled={safeCustomerPage === 1} aria-label={t('Trang trước')}><ChevronLeft size={15} /></button><strong>{safeCustomerPage} / {customerTotalPages}</strong><button type="button" onClick={() => setCustomerPage(page => Math.min(customerTotalPages, page + 1))} disabled={safeCustomerPage === customerTotalPages} aria-label={t('Trang sau')}><ChevronRight size={15} /></button></div>
                  </footer>}
                </div>
              </>
            )}
          </div>

      {/* SELECTED CUSTOMER DETAIL */}
       {selectedCustomer && (
        <div className="customer-details-grid">
          <div className="customer-detail-header">
            <PageBackButton onClick={closeCustomerDetail} />
            <div className="customer-detail-heading">
              <div className="customer-detail-heading__title">
                <span className="customer-code-badge">{selectedCustomer.customerCode || selectedCustomer.id}</span>
                <h1>{selectedCustomer.companyName}</h1>
                <span className={`customer-rank-badge ${selectedCustomer.customerRank ? 'has-rank' : ''}`}>
                  {selectedCustomer.customerRank ? `Hạng ${selectedCustomer.customerRank}` : t('Chưa xếp hạng')}
                </span>
              </div>
              <p>{t('Hồ sơ khách hàng, lịch sử PO, các mẫu đã đặt và tài liệu liên quan.')}</p>
            </div>
            {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
              <div className="crm-detail-actions">
                <button type="button" className="btn btn-primary" onClick={() => openEditModal(selectedCustomer)}><Pencil size={15} /><span>{t('Chỉnh sửa hồ sơ')}</span></button>
                <button type="button" className="btn btn-outline btn-symbol-sm crm-detail-delete" onClick={() => handleDeleteCustomer(selectedCustomer.id)} title={t('Xóa khách hàng')}><Trash2 size={15} /></button>
              </div>
            )}
          </div>

          <div className="customer-profile-column">
            <section className="card customer-company-card">
              <div className="crm-company-accordion-row">
                <button
                  type="button"
                  className="crm-company-accordion-trigger"
                  aria-expanded={isCompanyInfoExpanded}
                  onClick={() => setIsCompanyInfoExpanded(value => !value)}
                >
                  <span className="card-title">{t('Thông tin doanh nghiệp')}</span>
                  <span className="customer-company-summary-inline" title={[selectedCustomer.contactPerson, selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(' · ')}>
                    {selectedCustomer.contactPerson || t('Chưa có liên hệ')} · {selectedCustomer.phone || t('Chưa có điện thoại')} · {users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}
                  </span>
                  <span className="crm-company-accordion-action">{isCompanyInfoExpanded ? t('Thu gọn') : t('Xem đầy đủ')}</span>
                </button>
                {isCompanyInfoExpanded && (
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => void handleCopyCustomerInformation(selectedCustomer)} title={t('Sao chép thông tin doanh nghiệp')}>
                    {t('Sao chép')}
                  </button>
                )}
              </div>

              {isCompanyInfoExpanded && (
                <div className="customer-company-expanded">
                  <div className="customer-company-detail-grid">
                    <span>{t('Liên hệ chính')}</span>
                    <strong>{selectedCustomer.contactPerson || t('Chưa cập nhật')}</strong>
                    <span>{t('Điện thoại')}</span>
                    <strong>{selectedCustomer.phone || t('Chưa cập nhật')}</strong>
                    <span>{t('Email')}</span>
                    <strong>{selectedCustomer.email || t('Chưa cập nhật')}</strong>
                    <span>{t('Sale phụ trách')}</span>
                    <strong>{users.find(u => u.uid === selectedCustomer.assignedSaleId)?.displayName || t('Chưa phân công')}</strong>
                    <span>{t('Mã số thuế')}</span>
                    <strong>{selectedCustomer.taxCode || t('Chưa cung cấp')}</strong>
                    <span>{t('Địa chỉ giao hàng')}</span>
                    <strong>{selectedCustomer.address || t('Chưa cập nhật')}</strong>
                    {(selectedCustomer.customFields || [
                      {
                        id: 'discount',
                        name: t('Chiết khấu mặc định'),
                        value: selectedCustomer.discountType === 'amount'
                          ? `${Number(selectedCustomer.discountAmount || 0).toLocaleString('vi-VN')} đ`
                          : `${Number(selectedCustomer.discountRate || 0)}%`
                      },
                      { id: 'debtLimit', name: t('Hạn mức công nợ (đ)'), value: selectedCustomer.debtLimit },
                      { id: 'paymentTerms', name: t('Điều khoản thanh toán'), value: selectedCustomer.paymentTerms }
                    ]).filter((field: any) => field.id !== 'note').map((field: any) => (
                      <React.Fragment key={field.id}>
                        <span>{field.name}</span>
                        <strong>{field.id === 'debtLimit' ? `${Number(field.value || 0).toLocaleString('vi-VN')} đ` : (field.value || t('Không có'))}</strong>
                      </React.Fragment>
                    ))}
                    <span>{t('Tần suất đặt hàng')}</span>
                    <strong>{calculateFrequency(selectedCustomer.id)}</strong>
                    <span>{t('Tạo bởi')}</span>
                    <strong>{selectedCustomer.createdBy || t('Không xác định')} {selectedCustomer.createdAt && `(${formatDateTime(selectedCustomer.createdAt, t('vi-VN'))})`}</strong>
                    <span>{t('Cập nhật bởi')}</span>
                    <strong>{selectedCustomer.updatedBy || t('Chưa cập nhật')} {selectedCustomer.updatedAt && `(${formatDateTime(selectedCustomer.updatedAt, t('vi-VN'))})`}</strong>
                  </div>

                  <EntityCustomFieldsReadOnly definitions={customFieldDefinitions} values={selectedCustomer.customFieldValues} />

                  <div className="customer-contact-panel">
                    <div className="customer-contact-panel__heading"><strong>{t('Đầu mối liên hệ')}</strong></div>
                    <div className="customer-contact-list">
                      {(selectedCustomer.contacts || []).map((contact: CustomerContactRecord) => (
                        <div key={contact.id} className="customer-contact-item">
                          <span className="customer-contact-item__role">{CONTACT_ROLE_LABELS[contact.role]}</span>
                          <strong>{contact.name || t('Chưa cập nhật tên')}</strong>
                          <span>{[contact.phone, contact.email].filter(Boolean).join(' · ') || t('Chưa có thông tin liên hệ')}</span>
                        </div>
                      ))}
                      {(selectedCustomer.contacts || []).length === 0 && <span className="text-muted">{t('Chưa có đầu mối liên hệ.')}</span>}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card customer-note-card">
              <div className="card-header customer-note-card__header">
                <div>
                  <span className="card-title">{t('Ghi chú khách hàng')}</span>
                  <small>{t('Thông tin cần nhớ khi trao đổi và xử lý đơn hàng')}</small>
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
                    disabled={isSavingCustomerNote || sanitizeCustomerNoteHtml(customerNoteDraft).trim() === sanitizeCustomerNoteHtml(selectedCustomer.noteHtml || plainTextToNoteHtml(String(selectedCustomer.note || ''))).trim()}
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

          <div className="card customer-order-history-card">
            <div className="customer-order-history-tabs content-tabs" role="tablist" aria-label={t('Lịch sử giao dịch khách hàng')}>
              <button
                type="button"
                role="tab"
                aria-selected={customerHistoryTab === 'po'}
                className={customerHistoryTab === 'po' ? 'is-active' : ''}
                onClick={() => setCustomerHistoryTab('po')}
              >
                {t('PO')} <span>{getCustomerOrders(selectedCustomer.id).length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerHistoryTab === 'products'}
                className={customerHistoryTab === 'products' ? 'is-active' : ''}
                onClick={() => setCustomerHistoryTab('products')}
              >
                {t('Danh sách sản phẩm')} <span>{selectedCustomerProducts.length}</span>
              </button>
            </div>

            {customerHistoryTab === 'po' ? (
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
                    {getCustomerOrders(selectedCustomer.id).map(po => (
                      <tr
                        key={po.id}
                        className="customer-po-history-row"
                        onClick={() => onOpenPO?.(po.id)}
                        onKeyDown={event => {
                          if ((event.key === 'Enter' || event.key === ' ') && onOpenPO) onOpenPO(po.id);
                        }}
                        tabIndex={onOpenPO ? 0 : undefined}
                      >
                        <td><button type="button" className="customer-po-link" onClick={event => { event.stopPropagation(); onOpenPO?.(po.id); }}>{po.poCode}</button></td>
                        <td>{formatDate(po.orderDate)}</td>
                        <td>{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                        <td><span className={`badge ${getPOBadgeClass(po)}`}>{t(getPOQueueLabel(po))}</span></td>
                        <td onClick={event => event.stopPropagation()}>
                          {(currentUser.role === 'admin' || currentUser.role === 'sale') && onRepeatOrder ? (
                            <button type="button" className="btn btn-sm btn-outline repeat-order-button" onClick={() => onRepeatOrder(po.id)} title={t('Tạo PO mới từ đơn cũ')}>
                              <Copy size={13} /> {t('Đặt lại')}
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {getCustomerOrders(selectedCustomer.id).length === 0 && (
                      <tr><td colSpan={5} className="customer-history-empty">{t('Chưa phát sinh đơn hàng nào.')}</td></tr>
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
                            {product.previewImage ? <img src={product.previewImage} alt={product.productName} /> : <span>{t('Chưa có ảnh')}</span>}
                            <div><strong title={product.productName}>{product.productName}</strong><small>{product.productCode || t('Chưa có mã hàng')}</small></div>
                          </div>
                        </td>
                        <td><div className="customer-sample-spec"><strong title={product.material}>{product.material || t('Chưa có NVL')}</strong><span title={product.specification}>{product.specification || t('Chưa có quy cách')}</span></div></td>
                        <td>
                          <div className="customer-sample-spec">
                            <strong>{product.orderCount > 0 ? `${product.orderCount} ${t('đơn')} · ${product.totalQuantity.toLocaleString('vi-VN')} ${product.unit}` : t('Chưa phát sinh PO')}</strong>
                            <button type="button" className="customer-po-link" onClick={() => product.lastPoId && onOpenPO?.(product.lastPoId)} disabled={!product.lastPoId || !onOpenPO}>
                              {product.lastPoCode || t('Chưa có mã PO')}
                            </button>
                          </div>
                        </td>
                        <td>
                          {product.previewImage ? (
                            <button type="button" className="customer-product-asset-button" onClick={() => setPreviewImage(product.previewImage)}>
                              {t('Xem ảnh')} · {product.assetCount} {t('tệp')}
                            </button>
                          ) : <span className="crm-text-muted">{t('Chưa có tệp')}</span>}
                        </td>
                        <td>
                          {product.record && (currentUser.role === 'admin' || currentUser.role === 'sale') ? (
                            <button type="button" className="btn btn-sm btn-outline" onClick={() => handleOpenEditProduct(product.record)}>{t('Chỉnh sửa')}</button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {selectedCustomerProducts.length === 0 && (
                      <tr><td colSpan={5} className="customer-history-empty">{t('Chưa có sản phẩm nào trong lịch sử đặt hàng.')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <section className="card customer-file-repository-card">
            <div className="card-header customer-file-repository-header">
              <div>
                <span className="card-title">{t('Kho lưu trữ khách hàng')}</span>
                <small>{t('Hợp đồng, biên bản, báo giá và các tài liệu liên quan của khách hàng.')}</small>
              </div>
              {(currentUser.role === 'admin' || currentUser.role === 'sale') && activeRepositoryFolder?.id === 'contracts' && (
                <button type="button" className="btn btn-outline" onClick={() => setShowAddContractModal(true)}>{t('Thêm hợp đồng')}</button>
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
                    <button type="button" className="btn btn-primary" onClick={() => void handleAddFolder()} disabled={!newFolderName.trim()}>{t('Tạo thư mục')}</button>
                  </div>
                )}

                <div className="customer-drive-folder-list">
                  {customerRepositoryFolders.map(folder => {
                    const fileCount = (selectedCustomer.files || []).filter((file: any) => file.name !== '.placeholder' && resolveCustomerFileFolderId(file, customerRepositoryFolders) === folder.id).length;
                    const contractCount = folder.id === 'contracts' ? (selectedCustomer.contracts || []).length : 0;
                    const documentCount = (selectedCustomer.documents || []).filter((documentRecord: any) => (DOCUMENT_REPOSITORY_FOLDER_IDS[documentRecord.category] || 'other') === folder.id).length;
                    const totalCount = fileCount + contractCount + documentCount;
                    return (
                      <div key={folder.id} className={`customer-drive-folder ${activeRepositoryFolder?.id === folder.id ? 'is-active' : ''}`}>
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
                            <button type="button" onClick={() => void handleRenameRepoFolder(folder.id)}>{t('Lưu')}</button>
                            <button type="button" onClick={() => setRenamingFolderId('')}>{t('Hủy')}</button>
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
                                <button type="button" onClick={() => { setRenamingFolderId(folder.id); setFolderNameDraft(folder.name); }}>{t('Đổi tên')}</button>
                                <button type="button" onClick={() => void handleDeleteRepoFolder(folder.id)}>{t('Xóa')}</button>
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
                  <details className="customer-drive-upload-panel">
                    <summary>{t('Thêm tài liệu vào thư mục này')}</summary>
                    <form onSubmit={handleUploadRepoFile}>
                      <label>
                        <span>{t('Tên tài liệu')} *</span>
                        <input value={repoUploadFileName} onChange={event => setRepoUploadFileName(event.target.value)} required placeholder={t('Ví dụ: Biên bản nghiệm thu tháng 8')} />
                      </label>
                      <label>
                        <span>{t('Chọn tệp dưới 900 KB')}</span>
                        <input type="file" onChange={handleRepoFileChange} />
                      </label>
                      <label>
                        <span>{t('Hoặc đường dẫn Drive/OneDrive')}</span>
                        <input type="url" value={repoUploadLink} onChange={event => setRepoUploadLink(event.target.value)} placeholder="https://..." />
                      </label>
                      <button type="submit" className="btn btn-primary">{t('Lưu tài liệu')}</button>
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
                          <td><strong>{contract.contractNo || t('Hợp đồng chưa có số')}</strong><small>{contract.expiryDate ? `${t('Hạn hiệu lực')}: ${formatDate(contract.expiryDate)}` : ''}</small></td>
                          <td>{t('Hợp đồng')}</td>
                          <td>{formatDate(contract.signDate || contract.createdAt)}</td>
                          <td>{contract.createdBy || selectedCustomer.createdBy || '—'}</td>
                          <td>
                            <div className="customer-drive-file-actions">
                              {contract.fileUrl && <a href={contract.fileUrl} download={`HopDong_${contract.contractNo || contract.id}`}>{t('Tải xuống')}</a>}
                              {(currentUser.role === 'admin' || currentUser.role === 'sale') && <button type="button" onClick={() => void handleDeleteContract(contract.id)}>{t('Xóa')}</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {activeRepositoryDocuments.map((documentRecord: any) => (
                        <tr key={`document-${documentRecord.id}`}>
                          <td><strong>{documentRecord.name || t('Tài liệu chưa đặt tên')}</strong></td>
                          <td>{t('Văn bản')}</td>
                          <td>{formatDate(documentRecord.createdAt)}</td>
                          <td>{documentRecord.createdBy || documentRecord.createdById || '—'}</td>
                          <td>{documentRecord.url ? <a href={documentRecord.url} target="_blank" rel="noreferrer">{t('Mở tài liệu')}</a> : '—'}</td>
                        </tr>
                      ))}
                      {activeRepositoryFiles.map((file: any) => {
                        const source = file.base64 || file.data || file.url;
                        const isImage = String(source || '').startsWith('data:image/');
                        return (
                          <tr key={file.id}>
                            <td><strong title={file.name}>{file.name}</strong></td>
                            <td>{isImage ? t('Hình ảnh') : file.url ? t('Đường dẫn') : t('Tệp tài liệu')}</td>
                            <td>{formatDateTime(file.createdAt, 'vi-VN', '—')}</td>
                            <td>{file.createdBy || users.find(user => user.uid === file.createdById)?.displayName || '—'}</td>
                            <td>
                              <div className="customer-drive-file-actions">
                                {isImage && <button type="button" onClick={() => setPreviewImage(source)}>{t('Xem')}</button>}
                                {file.url
                                  ? <a href={file.url} target="_blank" rel="noreferrer">{t('Mở liên kết')}</a>
                                  : source && <a href={source} download={file.name}>{t('Tải xuống')}</a>}
                                {(currentUser.role === 'admin' || currentUser.role === 'sale') && <button type="button" onClick={() => void handleDeleteRepoFile(file.id)}>{t('Xóa')}</button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {activeRepositoryFiles.length === 0 && activeRepositoryContracts.length === 0 && activeRepositoryDocuments.length === 0 && (
                        <tr><td colSpan={5} className="customer-history-empty">{t('Thư mục chưa có tài liệu.')}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <div className="card customer-legacy-contract-card" hidden style={{ gridColumn: '1 / -1', marginTop: '24px' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">{t('HỢP ĐỒNG & VĂN BẢN KÝ KẾT')}</span>
              {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                 <button className="btn btn-primary btn-symbol" onClick={() => setShowAddContractModal(true)} title={t('Thêm Hợp Đồng Mới')}>
                   <Plus size={18} />
                 </button>
              )}
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('Số Hợp Đồng')}</th>
                    <th>{t('Ngày Ký')}</th>
                    <th>{t('Hạn Hiệu Lực')}</th>
                    <th>{t('Giá Trị')}</th>
                    <th>{t('Tài Liệu')}</th>
                    <th>{t('Trạng Thái')}</th>
                    <th>{t('Thao Tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedCustomer.contracts || []).map((contr: any) => (
                    <tr key={contr.id}>
                      <td style={{ fontWeight: 600 }}>{contr.contractNo}</td>
                      <td>{formatDate(contr.signDate)}</td>
                      <td>{formatDate(contr.expiryDate)}</td>
                      <td>{contr.value?.toLocaleString()} đ</td>
                      <td>
                        {contr.fileUrl ? (
                          <a href={contr.fileUrl} download={`HopDong_${contr.contractNo}`} className="btn btn-sm btn-outline">
                            Tải file bản cứng
                          </a>
                        ) : (
                          <span style={{ fontSize: '11px', fontStyle: 'italic' }}>{t('Không có file')}</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${
                          contr.status === 'active' ? 'badge-success' : 'badge-warning'
                        }`}>{t(contr.status)}</span>
                      </td>
                      <td>
                         {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                           <button className="btn btn-sm btn-danger btn-symbol-sm" onClick={() => handleDeleteContract(contr.id)} title={t('Xóa')}>
                             <Trash2 size={14} />
                           </button>
                         )}
                      </td>
                    </tr>
                  ))}
                  {(selectedCustomer.contracts || []).length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '16px' }}>{t('Chưa có hợp đồng nào được lưu trữ.')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CUSTOMER FILE REPOSITORY CARD */}
          <div className="card customer-legacy-file-repository" hidden style={{ gridColumn: '1 / -1', marginTop: '24px' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Folder size={18} />
                <span>{t('KHO LƯU TRỮ TỆP KHÁCH HÀNG')}</span>
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder={t('Tên thư mục mới...')}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  style={{ width: '180px', padding: '4px 8px', fontSize: '12.5px' }}
                />
                <button type="button" className="btn btn-sm btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={handleAddFolder}>
                  <Plus size={14} />
                  <span>{t('Tạo Thư Mục')}</span>
                </button>
              </div>
            </div>

            <div className="customer-file-storage-layout">
              <div>
                {!selectedCustomer.files || selectedCustomer.files.length === 0 ? (
                  <p className="text-muted text-center" style={{ padding: '30px' }}>{t('Kho lưu trữ hiện tại trống. Vui lòng tạo thư mục và tải lên tệp tin.')}</p>
                ) : (
                  <div>
                    {Object.entries(
                      (selectedCustomer.files || []).reduce((acc: any, file: any) => {
                        const f = file.folder || t('Chưa phân mục');
                        if (!acc[f]) acc[f] = [];
                        acc[f].push(file);
                        return acc;
                      }, {})
                    ).map(([folderName, folderFiles]: any) => (
                      <div key={folderName} style={{ marginBottom: '20px', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '6px', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Folder size={16} />
                            <span>{folderName}</span>
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => handleDeleteRepoFolder(folderName)}
                          >
                            <Trash2 size={12} />
                            <span>{t('Xóa thư mục')}</span>
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {folderFiles.map((file: any, fIdx: number) => {
                            if (file.name === '.placeholder') return null;
                            const isImage = file.base64?.startsWith('data:image/');
                            return (
                              <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', backgroundColor: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '4px' }}>
                                {isImage ? (
                                  <img
                                    src={file.base64}
                                    alt={file.name}
                                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)', cursor: 'pointer' }}
                                    onClick={() => setPreviewImage(file.base64)}
                                    title={t('Click để xem lớn')}
                                  />
                                ) : (
                                  <FileText size={28} style={{ color: 'var(--color-primary)' }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                    {t('Tải lên lúc')}: {formatDateTime(file.createdAt, 'vi-VN', 'N/A')}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  {isImage && (
                                    <button type="button" className="btn btn-sm btn-outline" style={{ padding: '2px 6px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => setPreviewImage(file.base64)}>
                                      <Eye size={12} />
                                      <span>{t('Xem')}</span>
                                    </button>
                                  )}
                                  <a href={file.base64} download={file.name} className="btn btn-sm btn-primary" style={{ padding: '2px 6px', fontSize: '11px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Download size={12} />
                                    <span>{t('Tải')}</span>
                                  </a>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-danger btn-symbol-sm"
                                    onClick={() => handleDeleteRepoFile(file.id)}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {folderFiles.filter((f: any) => f.name !== '.placeholder').length === 0 && (
                            <p className="text-muted" style={{ fontStyle: 'italic', fontSize: '12px', paddingLeft: '8px' }}>{t('Thư mục trống.')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderLeft: '1px solid var(--color-border-light)', paddingLeft: '20px' }}>
                <h4 style={{ marginBottom: '12px', color: 'var(--color-primary)' }}>{t('Tải Lên Tệp Tin')}</h4>
                <form onSubmit={handleUploadRepoFile} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Thư mục lưu trữ *')}</label>
                    <input
                      type="text"
                      value={selectedFolderForUpload}
                      onChange={e => setSelectedFolderForUpload(e.target.value)}
                      required
                      placeholder={t('Chọn hoặc nhập thư mục mới...')}
                      list="customer-folders-list"
                      style={{ fontSize: '12.5px' }}
                    />
                    <datalist id="customer-folders-list">
                      {customerRepositoryFolders.map(folder => (
                        <option key={`default-${folder.id}`} value={folder.id}>{folder.name}</option>
                      ))}
                      {Array.from(new Set((selectedCustomer.files || []).map((f: any) => f.folder))).map((folder: any) => (
                        <option key={folder} value={folder} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>{t('Chọn Tệp Tin *')}</label>
                    <input
                      type="file"
                      onChange={handleRepoFileChange}
                      required
                      style={{ fontSize: '11px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>{t('Tên Tệp Trên Hệ Thống *')}</label>
                    <input
                      type="text"
                      value={repoUploadFileName}
                      onChange={e => setRepoUploadFileName(e.target.value)}
                      required
                      placeholder={t('Tên file đính kèm...')}
                      style={{ fontSize: '12.5px' }}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Upload size={14} />
                    <span>{t('Tải Lên Kho Tệp')}</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
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
                <h2>{onboardingSourceLead ? `TẠO KHÁCH HÀNG: ${onboardingSourceLead.companyName}` : 'THÊM KHÁCH HÀNG MỚI'}</h2>
                <p>
                  {onboardingSourceLead
                    ? 'Thông tin từ Lead đã được điền sẵn. Hoàn thiện cùng bộ dữ liệu như khách hàng đặt trực tiếp.'
                    : 'Nhập hồ sơ, mã hàng và thông tin đơn đầu tiên ngay trên cùng một biểu mẫu.'}
                </p>
              </div>
              <button type="button" className="btn btn-outline" onClick={closeCustomerOnboarding}>Đóng / Hủy</button>
            </div>
            <form className="customer-onboarding-form" onSubmit={handleAddCustomer}>
              <div className="modal-body customer-onboarding-body">
                {renderCustomerOnboardingTables()}
                <EntityCustomFieldsSection
                  definitions={customFieldDefinitions}
                  values={customFieldValues}
                  role={currentUser.role}
                  onChange={setCustomFieldValues}
                />
              </div>
              <div className="modal-footer customer-onboarding-footer">
                <div className="customer-onboarding-footer-note">
                  {onboardingItems.length > 0
                    ? `${onboardingItems.length} mã hàng sẽ được lưu vào hồ sơ và chuyển sẵn sang Sale PO.`
                    : 'Bạn có thể lưu hồ sơ trước và bổ sung mã hàng sau.'}
                </div>
                <button type="button" className="btn btn-outline" onClick={closeCustomerOnboarding}>Hủy</button>
                <button type="submit" className="btn btn-primary">
                  {onboardingItems.length > 0
                    ? 'Lưu khách hàng & chuẩn bị Sale PO'
                    : 'Lưu hồ sơ khách hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '920px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('CHỈNH SỬA HỒ SƠ KHÁCH HÀNG')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowEditModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleEditCustomer}>
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="customerCode">{t('Mã Khách Hàng *')}</label>
                    <input type="text" value={customerCode} onChange={e => setCustomerCode(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label data-system-label="customerRank">{t('Hạng Khách Hàng')}</label>
                    <select value={customerRank} onChange={e => setCustomerRank(e.target.value as CustomerRank)}>
                      <option value="">{t('Chưa xếp hạng')}</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label data-system-label="companyName">{t('Tên Công Ty *')}</label>
                  <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} required />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="contactPerson">{t('Người Liên Hệ')}</label>
                    <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label data-system-label="phone">{t('Số Điện Thoại')}</label>
                    <input type="text" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="procurementPhone">{t('SĐT Thu Mua')}</label>
                    <input type="text" value={procurementPhone} onChange={e => setProcurementPhone(e.target.value)} placeholder={t('SĐT người làm việc mua hàng...')} />
                  </div>
                  <div className="form-group">
                    <label data-system-label="warehousePhone">{t('SĐT Nhận Hàng / Kho')}</label>
                    <input type="text" value={warehousePhone} onChange={e => setWarehousePhone(e.target.value)} placeholder={t('SĐT liên hệ kho hàng...')} />
                  </div>
                </div>
                <div className="form-group">
                  <label data-system-label="bankAccount">{t('Tài Khoản Ngân Hàng')}</label>
                  <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder={t('Số tài khoản, tên ngân hàng, chi nhánh...')} />
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="taxCode">{t('Mã Số Thuế')}</label>
                    <input type="text" value={taxCode} onChange={e => setTaxCode(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label data-system-label="email">{t('Email:')}</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label data-system-label="address">{t('Địa Chỉ Giao Hàng')}</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)} />
                </div>
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
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="discountType">{t('Hình Thức Chiết Khấu')}</label>
                    <select value={discountType} onChange={e => setDiscountType(e.target.value as PODiscountType)}>
                      <option value="percent">{t('Theo phần trăm (%)')}</option>
                      <option value="amount">{t('Theo tiền chênh (đ)')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{discountType === 'amount' ? t('Tiền Chênh Mặc Định (đ)') : t('Chiết Khấu Mặc Định (%)')}</label>
                    {discountType === 'amount' ? (
                      <input type="number" min="0" value={discountAmount} onChange={e => setDiscountAmount(Number(e.target.value))} />
                    ) : (
                      <input type="number" min="0" max="100" value={discountRate} onChange={e => setDiscountRate(Number(e.target.value))} />
                    )}
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="debtLimit">{t('Hạn Mức Công Nợ (đ)')}</label>
                    <input type="number" min="0" value={debtLimit} onChange={e => setDebtLimit(Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-grid">
                  <div className="form-group">
                    <label data-system-label="paymentTerms">{t('Điều Khoản Thanh Toán')}</label>
                    <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                      <option value="Thanh toán trước">{t('Thanh toán trước')}</option>
                      <option value="Thanh toán khi nhận hàng">{t('Thanh toán khi nhận hàng')}</option>
                      <option value="30 ngày">{t('30 ngày kể từ khi giao hàng')}</option>
                      <option value="45 ngày">{t('45 ngày kể từ khi giao hàng')}</option>
                      <option value="60 ngày">{t('60 ngày kể từ khi giao hàng')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label data-system-label="assignedSaleId">{t('Sale Phụ Trách')}</label>
                    <select value={assignedSaleId} onChange={e => setAssignedSaleId(e.target.value)} disabled={currentUser.role === 'sale'}>
                      {saleUsers.map(s => (
                        <option key={s.uid} value={s.uid}>{s.displayName}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label data-system-label="note">{t('Ghi Chú Yêu Cầu Riêng')}</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} />
                </div>
                <EntityCustomFieldsSection
                  definitions={customFieldDefinitions}
                  values={customFieldValues}
                  role={currentUser.role}
                  onChange={setCustomFieldValues}
                />
                {renderAdditionalContactsEditor()}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEditModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Cập Nhật')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ADD PRODUCT MODAL */}
      {showAddProductModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('THÊM MÃ SẢN PHẨM KHÁCH HÀNG MỚI')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddProductModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleAddProductSubmit}>
              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Mã Sản Phẩm')} *</label>
                    <input type="text" value={productCode} onChange={e => setProductCode(e.target.value)} required placeholder="VD: 5.07.016" />
                  </div>
                  <div className="form-group">
                    <label>{t('Tên Hàng Hóa')} *</label>
                    <input type="text" value={productName} onChange={e => setProductName(e.target.value)} required placeholder="VD: Tem dán dạng cuộn" />
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Phân Loại Sản Phẩm')} *</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={productType} onChange={e => handleAddProductTypeChange(e.target.value as any)} style={{ flex: 1 }}>
                        {productClassifications.map(c => (
                          <option key={c.id} value={c.id}>{t(c.name)}</option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-sm btn-outline" onClick={triggerAddClassification} title={t('Thêm')}>
                        {t('+')}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => triggerEditClassification(productType)} title={t('Sửa')}>
                        {t('Sửa')}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('Đơn Giá Bán Hiện Tại (đ)')} *</label>
                    <input type="number" min="0" value={currentPrice} onChange={e => setCurrentPrice(Number(e.target.value))} required />
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Chất Liệu')}</label>
                    <input
                      type="text"
                      value={productMaterial}
                      onChange={e => setProductMaterial(e.target.value)}
                      placeholder={t('VD: Decal Giấy Fasson AW0339F')}
                      list="materials-suggest-crm"
                    />
                    <datalist id="materials-suggest-crm">
                      <option value="Decal Giấy Fasson AW0339F" />
                      <option value="Decal Nhựa PVC Avery Dennison" />
                      <option value="Màng BOPP bóng 12mic" />
                      <option value="Giấy Ford" />
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>{t('Tải Ảnh Layout Thiết Kế Mẫu')}</label>
                    <input type="file" accept="image/*" onChange={handleProductLayoutChange} style={{ fontSize: '12px' }} />
                    {productLayoutBase64 && (
                      <img src={productLayoutBase64} alt="Preview" style={{ maxHeight: '80px', marginTop: '8px', borderRadius: '4px', display: 'block' }} />
                    )}
                  </div>
                </div>

                {renderProductCommercialFields()}

                <span style={{ display: 'block', borderBottom: '1px solid var(--color-border-light)', margin: '16px 0' }}></span>
                <h4 style={{ color: 'var(--color-primary)', marginBottom: '10px' }}>{t('MÔ TẢ THÔNG SỐ KỸ THUẬT')}</h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
                  {specFields.map((field) => {
                    const isEditingLabel = editingLabelId === field.id;

                    return (
                      <div key={field.id} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              width: '100%'
                            }}
                            onDoubleClick={() => handleStartEditLabel(field.id, field.label)}
                            title={t('Nhấp đúp chuột để sửa tên')}
                          >
                            {isEditingLabel ? (
                              <input
                                type="text"
                                value={tempLabelText}
                                onChange={e => setTempLabelText(e.target.value)}
                                onBlur={() => handleSaveLabel(field.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveLabel(field.id);
                                  else if (e.key === 'Escape') setEditingLabelId(null);
                                }}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                style={{
                                  fontSize: '12.5px',
                                  padding: '2px 6px',
                                  border: '1px solid var(--color-primary)',
                                  borderRadius: '4px',
                                  width: '100%'
                                }}
                              />
                            ) : (
                              <>
                                <span style={{ textDecoration: 'underline dotted var(--color-primary)' }}>{field.label}</span>
                                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>({t('nhấn đúp để sửa')})</span>
                              </>
                            )}
                          </label>

                          {/* Delete field button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--color-danger, #ef4444)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '12px'
                            }}
                            title={t('Xóa thông số này')}
                          >
                            ❌
                          </button>
                        </div>

                        {/* Render input based on field type */}
                        {field.type === 'number' && (
                          <input
                            type="number"
                            value={field.value}
                            onChange={e => handleUpdateFieldValue(field.id, Number(e.target.value))}
                          />
                        )}

                        {field.type === 'text' && (
                          <input
                            type="text"
                            value={field.value}
                            onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                          />
                        )}

                        {field.type === 'select' && field.id === 'windDirection' && (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              value={field.value}
                              onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                              style={{ flex: 1 }}
                            >
                              {windDirections.map(w => (
                                <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={triggerAddWindDirection}
                              title={t('Thêm')}
                            >
                              {t('+')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                const matched = windDirections.find(w => w.name === field.value);
                                if (matched) triggerEditWindDirection(matched.id);
                              }}
                              title={t('Sửa')}
                            >
                              {t('Sửa')}
                            </button>
                          </div>
                        )}

                        {field.type === 'select' && field.id !== 'windDirection' && (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              value={field.value}
                              onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                              style={{ flex: 1 }}
                            >
                              {field.options?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            {field.id.startsWith('custom_') && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => handleEditDropdownOptions(field.id)}
                                title={t('Sửa danh sách lựa chọn')}
                              >
                                {t('Sửa mục')}
                              </button>
                            )}
                          </div>
                        )}

                        {field.type === 'checkboxes' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '12.5px', marginTop: '6px' }}>
                            {field.options?.map((proc: string) => {
                              const checked = Array.isArray(field.value) ? field.value.includes(proc) : false;
                              return (
                                <label key={proc} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const currentList = Array.isArray(field.value) ? field.value : [];
                                      if (e.target.checked) {
                                        handleUpdateFieldValue(field.id, [...currentList, proc]);
                                      } else {
                                        handleUpdateFieldValue(field.id, currentList.filter((p: any) => p !== proc));
                                      }
                                    }}
                                  />
                                  <span>{proc}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {field.type === 'file' && (
                          <div style={{ marginTop: '4px' }}>
                            <input
                              type="file"
                              multiple
                              onChange={e => handleWindDirectionFilesChangeForField(field.id, e)}
                              style={{ fontSize: '12px' }}
                            />
                            {Array.isArray(field.value) && field.value.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {field.value.map((f: any, idx: number) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', border: '1px solid var(--color-border-light)', borderRadius: '4px', backgroundColor: 'var(--color-bg-light)' }}>
                                    <span style={{ fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    <button
                                      type="button"
                                      style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer' }}
                                      onClick={() => {
                                        const updatedFiles = field.value.filter((_: any, i: number) => i !== idx);
                                        handleUpdateFieldValue(field.id, updatedFiles);
                                      }}
                                    >
                                      X
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={handleAddField}
                  >
                    + {t('Thêm Nhập Liệu')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={handleAddSelectField}
                  >
                    + {t('Thêm Dropdown')}
                  </button>
                </div>

                {/* Custom Specifications / Choices Section */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h5 style={{ color: 'var(--color-primary)', margin: 0, fontSize: '13.5px', fontWeight: 600 }}>
                      {t('LỰA CHỌN & THÔNG SỐ BỔ SUNG')}
                    </h5>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setSpecCustomRows([...specCustomRows, { key: '', value: '' }])}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      + {t('Thêm Dòng')}
                    </button>
                  </div>
                  {specCustomRows.length === 0 ? (
                    <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
                      {t('Chưa có thông số bổ sung nào.')}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {specCustomRows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={row.key}
                            onChange={e => {
                              const updated = [...specCustomRows];
                              updated[idx].key = e.target.value;
                              setSpecCustomRows(updated);
                            }}
                            placeholder={t('Tên thông số (VD: Độ bám dính)')}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                            required
                          />
                          <input
                            type="text"
                            value={row.value}
                            onChange={e => {
                              const updated = [...specCustomRows];
                              updated[idx].value = e.target.value;
                              setSpecCustomRows(updated);
                            }}
                            placeholder={t('Giá trị (VD: Cao)')}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setSpecCustomRows(specCustomRows.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer', padding: '0 4px', fontSize: '14px', fontWeight: 'bold' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddProductModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Lưu Sản Phẩm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REQUOTE PRODUCT PRICE MODAL */}
      {showRequoteModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>{t('BÁO GIÁ LẠI SẢN PHẨM')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowRequoteModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleRequoteSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '13px', marginBottom: '10px' }}>
                  {t('Cập nhật giá mới cho mã hàng')}: <strong>{selectedProduct.productCode}</strong> ({selectedProduct.productName})
                </p>
                <div className="form-group">
                  <label>{t('Đơn Giá Mới (đ)')} *</label>
                  <input
                    type="number"
                    value={requotePrice}
                    onChange={e => setRequotePrice(Number(e.target.value))}
                    required
                    min="0"
                  />
                </div>
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>{t('Ghi Chú Thay Đổi Giá')}</label>
                  <input
                    type="text"
                    value={requoteNote}
                    onChange={e => setRequoteNote(e.target.value)}
                    placeholder="VD: Số lượng 10K pcs thì giá 522đ"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowRequoteModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Cập Nhật Giá')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CONTRACT MODAL */}
      {showAddContractModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('THÊM HỢP ĐỒNG KHÁCH HÀNG MỚI')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setShowAddContractModal(false)}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleAddContractSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>{t('Số Hợp Đồng / Ký Hiệu')} *</label>
                  <input type="text" value={contractNo} onChange={e => setContractNo(e.target.value)} required placeholder="VD: HĐ-2026-001/SF" />
                </div>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Ngày Ký Kết')}</label>
                    <input type="date" value={contractSignDate} onChange={e => setContractSignDate(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>{t('Hạn Hiệu Lực')}</label>
                    <input type="date" value={contractExpiryDate} onChange={e => setContractExpiryDate(e.target.value)} required />
                  </div>
                </div>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Giá Trị Hợp Đồng (đ)')}</label>
                    <input type="number" min="0" value={contractValue} onChange={e => setContractValue(Number(e.target.value))} required />
                  </div>
                  <div className="form-group">
                    <label>{t('Tải File Bản Cứng Hợp Đồng (.pdf, .jpg)')}</label>
                    <input type="file" accept="application/pdf,image/*" onChange={handleContractFileChange} style={{ fontSize: '12px' }} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAddContractModal(false)}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Lưu Hợp Đồng')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT MODAL */}
      {showEditProductModal && selectedProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('CHỈNH SỬA MÃ SẢN PHẨM KHÁCH HÀNG')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => { setShowEditProductModal(false); setSelectedProduct(null); }}>{t('Đóng')}</button>
            </div>
            <form onSubmit={handleEditProductSubmit}>
              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>{t('Mã Sản Phẩm')} *</label>
                    <input type="text" value={productCode} onChange={e => setProductCode(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label>{t('Tên Hàng Hóa')} *</label>
                    <input type="text" value={productName} onChange={e => setProductName(e.target.value)} required />
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Phân Loại Sản Phẩm')} *</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <select value={productType} onChange={e => handleEditProductTypeChange(e.target.value as any)} style={{ flex: 1 }}>
                        {productClassifications.map(c => (
                          <option key={c.id} value={c.id}>{t(c.name)}</option>
                        ))}
                      </select>
                      <button type="button" className="btn btn-sm btn-outline" onClick={triggerAddClassification} title={t('Thêm')}>
                        {t('+')}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => triggerEditClassification(productType)} title={t('Sửa')}>
                        {t('Sửa')}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>{t('Đơn Giá Bán Hiện Tại (đ)')} *</label>
                    <input type="number" min="0" value={currentPrice} onChange={e => setCurrentPrice(Number(e.target.value))} required />
                  </div>
                </div>

                <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label>{t('Chất Liệu')}</label>
                    <input
                      type="text"
                      value={productMaterial}
                      onChange={e => setProductMaterial(e.target.value)}
                      placeholder={t('VD: Decal Giấy Fasson AW0339F')}
                      list="materials-suggest-crm-edit"
                    />
                    <datalist id="materials-suggest-crm-edit">
                      <option value="Decal Giấy Fasson AW0339F" />
                      <option value="Decal Nhựa PVC Avery Dennison" />
                      <option value="Màng BOPP bóng 12mic" />
                      <option value="Giấy Ford" />
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>{t('Tải Ảnh Layout Thiết Kế Mẫu')}</label>
                    <input type="file" accept="image/*" onChange={handleProductLayoutChange} style={{ fontSize: '12px' }} />
                    {productLayoutBase64 && (
                      <img src={productLayoutBase64} alt="Preview" style={{ maxHeight: '80px', marginTop: '8px', borderRadius: '4px', display: 'block' }} />
                    )}
                  </div>
                </div>

                {renderProductCommercialFields()}

                <span style={{ display: 'block', borderBottom: '1px solid var(--color-border-light)', margin: '16px 0' }}></span>
                <h4 style={{ color: 'var(--color-primary)', marginBottom: '10px' }}>{t('MÔ TẢ THÔNG SỐ KỸ THUẬT')}</h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
                  {specFields.map((field) => {
                    const isEditingLabel = editingLabelId === field.id;

                    return (
                      <div key={field.id} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              width: '100%'
                            }}
                            onDoubleClick={() => handleStartEditLabel(field.id, field.label)}
                            title={t('Nhấp đúp chuột để sửa tên')}
                          >
                            {isEditingLabel ? (
                              <input
                                type="text"
                                value={tempLabelText}
                                onChange={e => setTempLabelText(e.target.value)}
                                onBlur={() => handleSaveLabel(field.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveLabel(field.id);
                                  else if (e.key === 'Escape') setEditingLabelId(null);
                                }}
                                autoFocus
                                onClick={e => e.stopPropagation()}
                                style={{
                                  fontSize: '12.5px',
                                  padding: '2px 6px',
                                  border: '1px solid var(--color-primary)',
                                  borderRadius: '4px',
                                  width: '100%'
                                }}
                              />
                            ) : (
                              <>
                                <span style={{ textDecoration: 'underline dotted var(--color-primary)' }}>{field.label}</span>
                                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>({t('nhấn đúp để sửa')})</span>
                              </>
                            )}
                          </label>

                          {/* Delete field button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteField(field.id)}
                            style={{
                              border: 'none',
                              background: 'none',
                              color: 'var(--color-danger, #ef4444)',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '12px'
                            }}
                            title={t('Xóa thông số này')}
                          >
                            ❌
                          </button>
                        </div>

                        {/* Render input based on field type */}
                        {field.type === 'number' && (
                          <input
                            type="number"
                            value={field.value}
                            onChange={e => handleUpdateFieldValue(field.id, Number(e.target.value))}
                          />
                        )}

                        {field.type === 'text' && (
                          <input
                            type="text"
                            value={field.value}
                            onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                          />
                        )}

                        {field.type === 'select' && field.id === 'windDirection' && (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              value={field.value}
                              onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                              style={{ flex: 1 }}
                            >
                              {windDirections.map(w => (
                                <option key={w.id} value={w.name}>{w.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={triggerAddWindDirection}
                              title={t('Thêm')}
                            >
                              {t('+')}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => {
                                const matched = windDirections.find(w => w.name === field.value);
                                if (matched) triggerEditWindDirection(matched.id);
                              }}
                              title={t('Sửa')}
                            >
                              {t('Sửa')}
                            </button>
                          </div>
                        )}

                        {field.type === 'select' && field.id !== 'windDirection' && (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select
                              value={field.value}
                              onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                              style={{ flex: 1 }}
                            >
                              {field.options?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            {field.id.startsWith('custom_') && (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline"
                                onClick={() => handleEditDropdownOptions(field.id)}
                                title={t('Sửa danh sách lựa chọn')}
                              >
                                {t('Sửa mục')}
                              </button>
                            )}
                          </div>
                        )}

                        {field.type === 'checkboxes' && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '12.5px', marginTop: '6px' }}>
                            {field.options?.map((proc: string) => {
                              const checked = Array.isArray(field.value) ? field.value.includes(proc) : false;
                              return (
                                <label key={proc} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'normal', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const currentList = Array.isArray(field.value) ? field.value : [];
                                      if (e.target.checked) {
                                        handleUpdateFieldValue(field.id, [...currentList, proc]);
                                      } else {
                                        handleUpdateFieldValue(field.id, currentList.filter((p: any) => p !== proc));
                                      }
                                    }}
                                  />
                                  <span>{proc}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {field.type === 'file' && (
                          <div style={{ marginTop: '4px' }}>
                            <input
                              type="file"
                              multiple
                              onChange={e => handleWindDirectionFilesChangeForField(field.id, e)}
                              style={{ fontSize: '12px' }}
                            />
                            {Array.isArray(field.value) && field.value.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {field.value.map((f: any, idx: number) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', border: '1px solid var(--color-border-light)', borderRadius: '4px', backgroundColor: 'var(--color-bg-light)' }}>
                                    <span style={{ fontSize: '12px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    <button
                                      type="button"
                                      style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer' }}
                                      onClick={() => {
                                        const updatedFiles = field.value.filter((_: any, i: number) => i !== idx);
                                        handleUpdateFieldValue(field.id, updatedFiles);
                                      }}
                                    >
                                      X
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={handleAddField}
                  >
                    + {t('Thêm Nhập Liệu')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={handleAddSelectField}
                  >
                    + {t('Thêm Dropdown')}
                  </button>
                </div>

                {/* Custom Specifications / Choices Section */}
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h5 style={{ color: 'var(--color-primary)', margin: 0, fontSize: '13.5px', fontWeight: 600 }}>
                      {t('LỰA CHỌN & THÔNG SỐ BỔ SUNG')}
                    </h5>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setSpecCustomRows([...specCustomRows, { key: '', value: '' }])}
                      style={{ fontSize: '11px', padding: '2px 8px' }}
                    >
                      + {t('Thêm Dòng')}
                    </button>
                  </div>
                  {specCustomRows.length === 0 ? (
                    <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
                      {t('Chưa có thông số bổ sung nào.')}
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {specCustomRows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            value={row.key}
                            onChange={e => {
                              const updated = [...specCustomRows];
                              updated[idx].key = e.target.value;
                              setSpecCustomRows(updated);
                            }}
                            placeholder={t('Tên thông số (VD: Độ bám dính)')}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                            required
                          />
                          <input
                            type="text"
                            value={row.value}
                            onChange={e => {
                              const updated = [...specCustomRows];
                              updated[idx].value = e.target.value;
                              setSpecCustomRows(updated);
                            }}
                            placeholder={t('Giá trị (VD: Cao)')}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px' }}
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setSpecCustomRows(specCustomRows.filter((_, i) => i !== idx))}
                            style={{ border: 'none', background: 'transparent', color: 'red', cursor: 'pointer', padding: '0 4px', fontSize: '14px', fontWeight: 'bold' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => { setShowEditProductModal(false); setSelectedProduct(null); }}>{t('Hủy')}</button>
                <button type="submit" className="btn btn-primary">{t('Lưu Thay Đổi')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRICE HISTORY MODAL */}
      {priceHistoryProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700 }}>{t('LỊCH SỬ THAY ĐỔI ĐƠN GIÁ BÁN')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setPriceHistoryProduct(null)}>{t('Đóng')}</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', marginBottom: '12px' }}>
                {t('Mã sản phẩm:')} <strong>{priceHistoryProduct.productCode}</strong> ({priceHistoryProduct.productName})
              </p>
              <div className="table-container">
                <table style={{ fontSize: '12.5px' }}>
                  <thead>
                    <tr>
                      <th>{t('Ngày')}</th>
                      <th>{t('Đơn Giá')}</th>
                      <th>{t('Ghi Chú')}</th>
                      <th>{t('Người Sửa')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(priceHistoryProduct.priceHistory || []).map((history: any, hidx: number) => (
                      <tr key={hidx}>
                        <td>{history.date}</td>
                        <td style={{ fontWeight: 'bold' }}>{history.price?.toLocaleString()} đ</td>
                        <td style={{ color: 'var(--color-primary-dark)', fontStyle: history.note ? 'normal' : 'italic' }}>
                          {history.note || '-'}
                        </td>
                        <td>{history.updatedBy || t('Hệ thống')}</td>
                      </tr>
                    ))}
                    {(!priceHistoryProduct.priceHistory || priceHistoryProduct.priceHistory.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center' }}>{t('Chưa có lịch sử thay đổi giá.')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPARE EDIT REQUEST MODAL */}
      {showCompareModal && selectedEditRequest && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '100%' }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: '16px' }}>{t('SO SÁNH THAY ĐỔI CHI TIẾT')}</span>
              <button className="btn btn-sm btn-outline" onClick={() => {
                setShowCompareModal(false);
                setSelectedEditRequest(null);
              }}>{t('Đóng')}</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ padding: '12px', border: '1px solid #fed7d7', borderRadius: '4px', backgroundColor: '#fff5f5' }}>
                  <h4 style={{ color: '#c53030', borderBottom: '1px solid #feb2b2', paddingBottom: '6px', marginBottom: '10px' }}>{t('DỮ LIỆU CŨ')}</h4>
                  <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(selectedEditRequest.originalData, null, 2)}
                  </pre>
                </div>
                <div style={{ padding: '12px', border: '1px solid #c6f6d5', borderRadius: '4px', backgroundColor: '#f0fff4' }}>
                  <h4 style={{ color: '#22543d', borderBottom: '1px solid #9ae6b4', paddingBottom: '6px', marginBottom: '10px' }}>{t('ĐỀ XUẤT MỚI')}</h4>
                  <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(selectedEditRequest.updatedData, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={() => {
                setShowCompareModal(false);
                setSelectedEditRequest(null);
              }}>{t('Hủy')}</button>
              <button type="button" className="btn btn-danger" onClick={() => handleRejectRequest(selectedEditRequest)}>{t('Từ Chối')}</button>
              <button type="button" className="btn btn-success" onClick={() => handleApproveRequest(selectedEditRequest)}>{t('Duyệt & Áp Dụng')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Zoom Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 1200 }}>
          <div className="modal-content" style={{ maxWidth: '90%', maxHeight: '90%', padding: '10px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button type="button" className="btn btn-sm btn-outline btn-symbol-sm" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }} onClick={() => setPreviewImage(null)}>
              <X size={20} />
            </button>
            <img src={previewImage} alt="Preview Zoom" style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <a href={previewImage} download={`Preview_${Date.now()}.jpg`} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                <Download size={14} />
                <span>{t('Tải Ảnh Về')}</span>
              </a>
            </div>
          </div>
        </div>
      )}

    </SystemFieldSurface>
  );
};
