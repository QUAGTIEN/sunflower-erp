import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, Folder, CheckSquare, History, Paperclip } from 'lucide-react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { calculatePOItemFinancials, withCalculatedPOFinancials } from '@/domain/poFinancials';
import {
  createCustomerSnapshot,
  type CustomerRank,
  type CustomerRecord,
  type CustomerSnapshot
} from '@/features/crm/model/crmModels';
import '@/components/CustomerHistory.css';
import { formatDate, toDateInputValue } from '@/shared/utils/dateFormatting';
import {
  applyCustomerProductToOrderItem,
  findCustomerProductForOrderItem,
  getActiveCustomerProducts,
  normalizeProductCode,
  refreshCustomerProductOrderItem
} from '@/features/crm/model/customerProductCatalog';
import { CustomerProductPicker } from './CustomerProductPicker';
import { POItemsGrid } from './poForm/POItemsGrid';
import { POLegacyProductSearchDialog } from './poForm/POLegacyProductSearchDialog';
import { POFileRepositoryDialog } from './poForm/POFileRepositoryDialog';
import { POImagePreviewDialog } from './poForm/POImagePreviewDialog';
import './POFormCatalog.css';

const PO_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PO_GRID_DEFAULT_ZOOM = 100;
const PO_GRID_MIN_ZOOM = 75;
const PO_GRID_MAX_ZOOM = 125;
const PO_GRID_ZOOM_STEP = 5;

const getDraftSafeLink = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.startsWith('data:') ? '' : value;
};

const getDraftSafeValue = (value: unknown): unknown => {
  if (typeof value === 'string') return getDraftSafeLink(value);
  if (Array.isArray(value)) return value.map(getDraftSafeValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, getDraftSafeValue(item)]));
  return value;
};
const getDraftSafeItems = (items: any[]) =>
  items.map(item => ({
    ...item,
    previewImage: getDraftSafeLink(item.previewImage),
    previewImages: (item.previewImages || []).map(getDraftSafeLink).filter(Boolean),
    productFiles: getDraftSafeValue(item.productFiles || []),
    specifications: getDraftSafeValue(item.specifications || {})
  }));

interface POFormFullScreenProps {
  isOpen: boolean;
  onClose: () => void;
  po: any | null; // null if creating new PO
  templatePo?: any | null; // source PO when creating a repeat order
  initialCustomerId?: string; // preselected CRM customer for a first PO
  onSave: (poData: any) => Promise<void>;
  customers: CustomerRecord[];
  suppliers: any[];
  users: any[];
  currentUser: any;
  t: (key: string) => string;
  workflowMode?: 'standard' | 'customer_onboarding';
  onOpenCustomerDetails?: (customerId: string) => void;
}

export default function POFormFullScreen({
  isOpen,
  onClose,
  po,
  templatePo,
  initialCustomerId = '',
  onSave,
  customers,
  suppliers,
  users,
  currentUser,
  t,
  workflowMode = 'standard',
  onOpenCustomerDetails
}: POFormFullScreenProps) {
  const [customerId, setCustomerId] = useState('');
  const [customerRank, setCustomerRank] = useState('');
  const [customerPoCode, setCustomerPoCode] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');

  // File attachments (Base64 strings)
  const [pdfFile, setPdfFile] = useState('');
  const [excelFile, setExcelFile] = useState('');
  const [aiFile, setAiFile] = useState('');
  const [corelFile, setCorelFile] = useState('');
  const [contractFile, setContractFile] = useState('');
  const [quoteFile, setQuoteFile] = useState('');

  // PO Items state
  const [poItems, setPoItems] = useState<any[]>([]);

  // Department Assignments state
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showAssignments, setShowAssignments] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showOrderInfo, setShowOrderInfo] = useState(true);
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [isTableFocusMode, setIsTableFocusMode] = useState(false);
  const [tableZoom, setTableZoom] = useState(PO_GRID_DEFAULT_ZOOM);

  // Search popup state for history/catalog
  const [searchPopupOpen, setSearchPopupOpen] = useState(false);
  const [searchRowIndex, setSearchRowIndex] = useState<number | null>(null);
  const [pastProducts, setPastProducts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const usesCatalogProducts = workflowMode === 'standard';
  const refreshCatalogProducts = !po && usesCatalogProducts;
  const closeCatalogPicker = useCallback(() => setSearchPopupOpen(false), []);

  // Modal customer document repository state
  const [showRepoModal, setShowRepoModal] = useState(false);

  // Lightbox for image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Form lifecycle and local draft state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftResetRevision, setDraftResetRevision] = useState(0);
  const initializedFormKeyRef = useRef('');
  const draftKey =
    !po && workflowMode === 'standard' && currentUser?.uid
      ? `sunflower:po-draft:${currentUser.uid}:${templatePo?.id || initialCustomerId || 'new'}`
      : '';
  const orderItems = useMemo(() => {
    if (!refreshCatalogProducts) return poItems;
    const products = getActiveCustomerProducts(customers.find(customer => customer.id === customerId));
    return poItems.map(item => {
      const product = findCustomerProductForOrderItem(item, products);
      return product ? refreshCustomerProductOrderItem(item, product) : item;
    });
  }, [refreshCatalogProducts, poItems, customerId, customers]);

  // Load initial data
  useEffect(() => {
    if (!isOpen) {
      initializedFormKeyRef.current = '';
      return;
    }

    // Wait until customer data is available before initializing a new form.
    if (!po && customers.length === 0) return;

    const formKey = `${po ? `edit:${po.id}` : templatePo ? `repeat:${templatePo.id}` : initialCustomerId ? `customer:${initialCustomerId}` : 'new'}:${draftResetRevision}`;
    if (initializedFormKeyRef.current === formKey) return;

    initializedFormKeyRef.current = formKey;
    setDraftReady(false);
    setDraftRestored(false);
    setSaveError('');
    setIsSaving(false);
    setTableZoom(PO_GRID_DEFAULT_ZOOM);
    setShowOrderInfo(true);
    setShowAttachments(false);
    setShowAssignments(false);

    if (po) {
      setCustomerId(po.customerId || '');
      setCustomerRank(po.customerRank || customers.find(customer => customer.id === po.customerId)?.customerRank || '');
      setCustomerPoCode(po.customerPoCode || '');
      setExpectedDeliveryDate(toDateInputValue(po.expectedDeliveryDate));
      setNotes(po.notes || '');

      // Load files
      setPdfFile(po.links?.pdfLink || '');
      setExcelFile(po.links?.excelLink || '');
      setAiFile(po.links?.aiLink || '');
      setCorelFile(po.links?.corelLink || '');
      setContractFile(po.links?.contractLink || '');
      setQuoteFile(po.links?.quoteLink || '');

      // Load items with backward compat for previewImage
      const items = (po.items || []).map((item: any) => ({
        ...item,
        itemId: item.itemId || `item-${Math.random().toString(36).substr(2, 9)}`,
        price: item.price !== undefined ? item.price : item.unitPrice || 0,
        discountType: item.discountType === 'amount' ? 'amount' : 'percent',
        discountRate: item.discountRate !== undefined ? item.discountRate : 0,
        discountAmount: item.discountAmount !== undefined ? item.discountAmount : 0,
        vatRate: item.vatRate !== undefined ? item.vatRate : 8,
        deliveryDate: toDateInputValue(item.deliveryDate),
        previewImages: item.previewImages || (item.previewImage ? [item.previewImage] : []),
        unit: item.unit || 'cái',
        material: item.material || 'Decal Giấy Fasson AW0339F',
        size: item.size || ''
      }));
      setPoItems(items);

      // Load assignments
      setAssignments(po.assignments || []);
    } else if (templatePo) {
      const sourceCustomer = customers.find(customer => customer.id === templatePo.customerId);
      const catalogProducts = getActiveCustomerProducts(sourceCustomer);
      const defaultDeliveryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      setCustomerId(templatePo.customerId || '');
      setCustomerRank(templatePo.customerRank || sourceCustomer?.customerRank || '');
      setCustomerPoCode('');
      setExpectedDeliveryDate(defaultDeliveryDate);
      setNotes(`Đơn đặt lại từ ${templatePo.poCode || 'PO cũ'}. ${templatePo.notes || ''}`.trim());

      // Reuse approved design sources only. Old quotes, contracts and order
      // documents are intentionally not copied into the new commercial order.
      setPdfFile('');
      setExcelFile('');
      setAiFile(templatePo.links?.aiLink || '');
      setCorelFile(templatePo.links?.corelLink || '');
      setContractFile('');
      setQuoteFile('');

      const repeatItems = (templatePo.items || []).map((item: any) => {
        const catalogProduct = findCustomerProductForOrderItem(item, catalogProducts);
        const previewImages = item.previewImages || (item.previewImage ? [item.previewImage] : []);

        return {
          ...(catalogProduct ? applyCustomerProductToOrderItem(item, catalogProduct) : item),
          ...(catalogProduct ? { customerProductId: catalogProduct.id } : {}),
          itemId: `item-${Math.random().toString(36).substr(2, 9)}`,
          price: Number(catalogProduct?.currentPrice || 0),
          purchasePrice: Number(catalogProduct?.purchasePrice || 0),
          discountType: item.discountType === 'amount' ? 'amount' : 'percent',
          discountRate: Number(sourceCustomer?.discountRate ?? item.discountRate ?? 0),
          discountAmount: item.discountType === 'amount' ? Number(item.discountAmount || 0) : 0,
          vatRate: catalogProduct?.vatRate ?? item.vatRate ?? 8,
          deliveryDate: defaultDeliveryDate,
          previewImages,
          unit: catalogProduct?.unit || item.unit || 'cái',
          material: catalogProduct ? catalogProduct.material : item.material || '',
          size: catalogProduct ? applyCustomerProductToOrderItem({}, catalogProduct).size : item.size || '',
          sourcePoId: templatePo.id,
          sourcePoCode: templatePo.poCode,
          sourceItemId: item.itemId,
          designReuseRequested:
            (!catalogProduct ||
              (applyCustomerProductToOrderItem({}, catalogProduct).size === (item.size || '') &&
                (catalogProduct.material || '') === (item.material || ''))) &&
            (previewImages.length > 0 ||
              !!item.designLayouts?.length ||
              !!templatePo.links?.aiLink ||
              !!templatePo.links?.corelLink),
          pricingNeedsReview: true,
          purchaseNeedsReview: true
        };
      });
      setPoItems(repeatItems);

      // Old personnel assignments and deadlines must not leak into a new PO.
      setAssignments([]);
    } else {
      // Defaults for creation
      const initialCustomer = customers.find(customer => customer.id === initialCustomerId);
      const preparedOrder = initialCustomer?.pendingOrderDraft;
      setCustomerId(initialCustomer?.id || '');
      setCustomerRank(initialCustomer?.customerRank || '');
      setCustomerPoCode(preparedOrder?.customerPoCode || '');
      setExpectedDeliveryDate(
        toDateInputValue(preparedOrder?.expectedDeliveryDate) ||
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      );
      setNotes(preparedOrder?.notes || '');
      setPdfFile(getDraftSafeLink(preparedOrder?.links?.pdfLink));
      setExcelFile(getDraftSafeLink(preparedOrder?.links?.excelLink));
      setAiFile(getDraftSafeLink(preparedOrder?.links?.aiLink));
      setCorelFile(getDraftSafeLink(preparedOrder?.links?.corelLink));
      setContractFile(getDraftSafeLink(preparedOrder?.links?.contractLink));
      setQuoteFile(getDraftSafeLink(preparedOrder?.links?.quoteLink));
      setPoItems(
        (preparedOrder?.items || []).map((item: any) => ({
          ...item,
          itemId: item.itemId || `item-${Math.random().toString(36).slice(2, 11)}`,
          discountType: item.discountType === 'amount' ? 'amount' : 'percent',
          discountRate: Number(item.discountRate) || 0,
          discountAmount: Number(item.discountAmount) || 0,
          vatRate: item.vatRate === undefined ? 8 : Number(item.vatRate),
          deliveryDate: toDateInputValue(item.deliveryDate || preparedOrder?.expectedDeliveryDate),
          previewImages: item.previewImages || (item.previewImage ? [item.previewImage] : []),
          unit: item.unit || 'cái',
          material: item.material || '',
          size: item.size || ''
        }))
      );
      setAssignments([]);
      setShowAssignments(Boolean(preparedOrder) && workflowMode === 'standard');
    }

    // Restore an unfinished create/repeat order. File data URLs are not stored
    // because they can exceed the browser storage quota; repository URLs remain.
    if (!po && draftKey) {
      try {
        const rawDraft = window.localStorage.getItem(draftKey);
        if (rawDraft) {
          const draft = JSON.parse(rawDraft);
          const isCurrentDraft = Number(draft.savedAt) > Date.now() - PO_DRAFT_MAX_AGE_MS;

          if (!isCurrentDraft) {
            window.localStorage.removeItem(draftKey);
          } else {
            const restoredCustomerId = templatePo?.customerId || initialCustomerId || draft.customerId;
            if (customers.some(customer => customer.id === restoredCustomerId)) {
              setCustomerId(restoredCustomerId);
            }
            const restoredCustomer = customers.find(customer => customer.id === restoredCustomerId);
            setCustomerRank(
              initialCustomerId
                ? restoredCustomer?.customerRank || ''
                : typeof draft.customerRank === 'string'
                  ? draft.customerRank
                  : ''
            );
            setCustomerPoCode(typeof draft.customerPoCode === 'string' ? draft.customerPoCode : '');
            if (typeof draft.expectedDeliveryDate === 'string' && draft.expectedDeliveryDate) {
              setExpectedDeliveryDate(draft.expectedDeliveryDate);
            }
            setNotes(typeof draft.notes === 'string' ? draft.notes : '');
            setPoItems(Array.isArray(draft.poItems) ? draft.poItems : []);
            setAssignments(Array.isArray(draft.assignments) ? draft.assignments : []);
            setPdfFile(getDraftSafeLink(draft.links?.pdfLink));
            setExcelFile(getDraftSafeLink(draft.links?.excelLink));
            setAiFile(getDraftSafeLink(draft.links?.aiLink));
            setCorelFile(getDraftSafeLink(draft.links?.corelLink));
            setContractFile(getDraftSafeLink(draft.links?.contractLink));
            setQuoteFile(getDraftSafeLink(draft.links?.quoteLink));
            setDraftRestored(true);
          }
        }
      } catch (error) {
        console.warn('Unable to restore PO draft:', error);
        window.localStorage.removeItem(draftKey);
      }
    }

    setDraftReady(true);
  }, [po, templatePo, initialCustomerId, isOpen, customers, draftKey, draftResetRevision, workflowMode]);

  // Keep text, items and assignments safe when the modal is closed or the page
  // is refreshed. Large local file data is intentionally excluded.
  useEffect(() => {
    if (!draftReady || !draftKey || po) return;

    const hasMeaningfulDraft = Boolean(
      templatePo ||
      customerPoCode.trim() ||
      customerRank ||
      notes.trim() ||
      poItems.length > 0 ||
      assignments.length > 0 ||
      pdfFile ||
      excelFile ||
      aiFile ||
      corelFile ||
      contractFile ||
      quoteFile
    );

    const timer = window.setTimeout(() => {
      if (!hasMeaningfulDraft) {
        window.localStorage.removeItem(draftKey);
        return;
      }

      try {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({
            savedAt: Date.now(),
            customerId,
            customerRank,
            customerPoCode,
            expectedDeliveryDate,
            notes,
            poItems: getDraftSafeItems(poItems),
            assignments,
            links: {
              pdfLink: getDraftSafeLink(pdfFile),
              excelLink: getDraftSafeLink(excelFile),
              aiLink: getDraftSafeLink(aiFile),
              corelLink: getDraftSafeLink(corelFile),
              contractLink: getDraftSafeLink(contractFile),
              quoteLink: getDraftSafeLink(quoteFile)
            }
          })
        );
      } catch (error) {
        console.warn('Unable to save PO draft:', error);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    draftKey,
    po,
    templatePo,
    customerId,
    customerRank,
    customerPoCode,
    expectedDeliveryDate,
    notes,
    poItems,
    assignments,
    pdfFile,
    excelFile,
    aiFile,
    corelFile,
    contractFile,
    quoteFile
  ]);

  useEffect(() => {
    if (!isOpen || !isTableFocusMode) return undefined;
    const handleFocusModeEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setIsTableFocusMode(false);
    };
    window.addEventListener('keydown', handleFocusModeEscape);
    return () => window.removeEventListener('keydown', handleFocusModeEscape);
  }, [isOpen, isTableFocusMode]);

  // Load repeat order products history for selected customer
  useEffect(() => {
    if (!customerId || usesCatalogProducts) return;
    let cancelled = false;
    const fetchPastProducts = async () => {
      try {
        const allPOs = await dbService.getCollection('pos');
        const customerPOs = allPOs.filter((p: any) => p.customerId === customerId && !p.deleted);
        const items: any[] = [];
        customerPOs.forEach((p: any) => {
          if (p.items) {
            p.items.forEach((item: any) => {
              items.push({
                ...item,
                poCode: p.poCode,
                orderDate: p.orderDate
              });
            });
          }
        });

        // Deduplicate by productCode
        const uniqueItems: any[] = [];
        const codes = new Set();
        items.forEach(item => {
          if (item.productCode && !codes.has(item.productCode)) {
            codes.add(item.productCode);
            uniqueItems.push(item);
          }
        });
        if (!cancelled) setPastProducts(uniqueItems);
      } catch (err) {
        console.error('Error fetching past products:', err);
      }
    };
    fetchPastProducts();
    return () => {
      cancelled = true;
    };
  }, [customerId, usesCatalogProducts]);

  if (!isOpen) return null;

  // Image compression helper
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = event => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        };
        img.onerror = err => reject(err);
      };
      reader.onerror = err => reject(err);
    });
  };

  const handleLinkFileChange = (e: React.ChangeEvent<HTMLInputElement>, setBase64: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      setBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRowFileChange = async (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentItem = poItems[rowIndex];
    const currentImages = [...(currentItem.previewImages || [])];

    if (currentImages.length + files.length > 5) {
      alert(t('Chỉ được tải lên tối đa 5 ảnh layout cho mỗi mặt hàng!'));
      return;
    }

    try {
      const compressedB64s = await Promise.all(Array.from(files).map(file => compressImage(file)));

      const updated = [...poItems];
      updated[rowIndex] = {
        ...currentItem,
        previewImages: [...currentImages, ...compressedB64s]
      };
      setPoItems(updated);
    } catch (error) {
      console.error('Failed to compress uploaded files:', error);
      alert(t('Lỗi khi nén ảnh layout. Vui lòng thử lại.'));
    }

    // Clear input
    e.target.value = '';
  };

  const deleteRowImage = (rowIndex: number, imgIndex: number) => {
    const updated = [...poItems];
    const images = [...(updated[rowIndex].previewImages || [])];
    images.splice(imgIndex, 1);
    updated[rowIndex].previewImages = images;
    setPoItems(updated);
  };

  // Add blank row
  const handleAddRow = () => {
    if (usesCatalogProducts && !customerId) return;
    const currentCustomer = customers.find(c => c.id === customerId);
    const discountRate = currentCustomer ? currentCustomer.discountRate : 0;

    setPoItems(previous => [
      ...previous,
      {
        itemId: `item-${Math.random().toString(36).substr(2, 9)}`,
        ...(usesCatalogProducts ? { customerProductId: '' } : {}),
        productCode: '',
        productName: '',
        size: '',
        material: usesCatalogProducts ? '' : 'Decal Giấy Fasson AW0339F',
        unit: 'cái',
        quantity: 1000,
        price: 0,
        discountType: 'percent',
        discountRate: discountRate,
        discountAmount: 0,
        vatRate: 8,
        deliveryDate: expectedDeliveryDate || '',
        note: '',
        previewImages: [],
        supplierId: '',
        supplierName: '',
        purchasePrice: 0,
        workType: 'gia_cong',
        specifications: {}
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index));
  };

  const toggleItemDetails = (itemId: string) => {
    setExpandedItemIds(current =>
      current.includes(itemId) ? current.filter(id => id !== itemId) : [...current, itemId]
    );
  };

  const getProductSize = (prod: any) => {
    if (!prod) return '';
    if (prod.size) return prod.size;
    if (!prod.specifications) return '';

    const specs = prod.specifications;
    if (prod.productType === 'muc_in') {
      return specs.size || '';
    }
    if (specs.width && specs.height) {
      return `R${specs.width} X D${specs.height} MM`;
    }
    return specs.size || '';
  };

  const handleUpdateRowField = (index: number, field: string, value: any) => {
    if (
      usesCatalogProducts &&
      poItems[index]?.customerProductId &&
      ['productCode', 'productName', 'size', 'material', 'unit'].includes(field)
    )
      return;
    const updated = [...poItems];
    updated[index] = { ...updated[index], [field]: value };

    if (field === 'supplierId') {
      const sup = suppliers.find(s => s.id === value);
      updated[index].supplierName = sup ? sup.supplierName : '';
    }

    // Auto-populate all other fields when code or name matches CRM catalog product
    if (!usesCatalogProducts && (field === 'productCode' || field === 'productName')) {
      const currentCustomer = customers.find(c => c.id === customerId);
      const catalogProducts = getActiveCustomerProducts(currentCustomer);
      const matchedProd = catalogProducts.find((p: any) =>
        field === 'productCode'
          ? normalizeProductCode(p.productCode) === normalizeProductCode(value)
          : p.productName === value
      );
      if (matchedProd) {
        updated[index] = applyCustomerProductToOrderItem(updated[index], matchedProd);
      } else if (field === 'productCode') {
        updated[index].customerProductId = '';
        if (value.includes('5.07.006') || value === 'MUC_IN') {
          updated[index].workType = 'mua_nvl';
        } else {
          updated[index].workType = 'gia_cong';
        }
      }
    }

    setPoItems(updated);
  };

  // Select item from Catalog or History search popup
  const handleSelectSearchedProduct = (product: any) => {
    if (searchRowIndex === null) return;

    const catalogProduct = getActiveCustomerProducts(customers.find(customer => customer.id === customerId)).find(
      candidate => normalizeProductCode(candidate.productCode) === normalizeProductCode(product.productCode)
    );
    const updated = [...poItems];
    updated[searchRowIndex] =
      catalogProduct && !product.poCode
        ? applyCustomerProductToOrderItem(updated[searchRowIndex], catalogProduct)
        : {
            ...updated[searchRowIndex],
            customerProductId: '',
            productCode: product.productCode || product.code || 'MANUAL',
            productName: product.productName || product.name || '',
            size: getProductSize(product),
            material:
              product.material ||
              product.specifications?.material ||
              (product.productType === 'tem_trang_cuon' ? 'Decal Giấy Fasson AW0339F' : 'Decal nhựa PVC'),
            unit: product.unit || 'cái',
            price: product.currentPrice || product.price || 0,
            supplierId: product.supplierId || '',
            supplierName: product.supplierName || '',
            purchasePrice: product.purchasePrice || 0,
            workType: product.workType || (product.productType === 'muc_in' ? 'mua_nvl' : 'gia_cong'),
            previewImages:
              product.previewImages ||
              (product.layoutUrl ? [product.layoutUrl] : product.previewImage ? [product.previewImage] : []),
            specifications: product.specifications || {}
          };

    setPoItems(updated);
    setSearchPopupOpen(false);
    setSearchRowIndex(null);
  };

  // Open product selector popup
  const openSearchPopup = (rowIndex: number) => {
    setSearchRowIndex(rowIndex);
    setSearchQuery('');
    setSearchPopupOpen(true);
  };

  const addCatalogProducts = (ids: string[]) => {
    const products = getActiveCustomerProducts(customers.find(customer => customer.id === customerId));
    const selected = ids.map(id => products.find(product => product.id === id)).filter(product => Boolean(product));
    if (!selected.length) return;
    if (searchRowIndex !== null && searchRowIndex >= 0) {
      setPoItems(previous =>
        previous.map((item, index) =>
          index === searchRowIndex ? applyCustomerProductToOrderItem(item, selected[0]!) : item
        )
      );
    } else {
      const customer = customers.find(record => record.id === customerId);
      const rows = selected.map(product =>
        applyCustomerProductToOrderItem(
          {
            itemId: crypto.randomUUID(),
            quantity: 1,
            deliveryDate: expectedDeliveryDate,
            note: '',
            discountType: customer?.discountType || 'percent',
            discountRate: Number(customer?.discountRate || 0),
            discountAmount: Number(customer?.discountAmount || 0)
          },
          product!
        )
      );
      setPoItems(previous => [...previous, ...rows]);
    }
    setSearchPopupOpen(false);
    setSearchRowIndex(null);
  };

  // Assignments helpers
  const handleAddAssignment = () => {
    setAssignments([
      ...assignments,
      {
        id: `assign-${Math.random().toString(36).substr(2, 9)}`,
        department: 'designer',
        userIds: [],
        description: '',
        dueDate: expectedDeliveryDate || '',
        priority: 'Bình thường'
      }
    ]);
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleUpdateAssignment = (index: number, field: string, value: any) => {
    const updated = [...assignments];
    updated[index] = { ...updated[index], [field]: value };

    // Clear userIds if department changes so they select new ones matching the role
    if (field === 'department') {
      updated[index].userIds = [];
    }

    setAssignments(updated);
  };

  const handleToggleUserInAssignment = (index: number, userId: string) => {
    const updated = [...assignments];
    const currentUsers = [...(updated[index].userIds || [])];

    if (currentUsers.includes(userId)) {
      updated[index].userIds = currentUsers.filter(uid => uid !== userId);
    } else {
      updated[index].userIds = [...currentUsers, userId];
    }

    setAssignments(updated);
  };

  const hasUnsavedCreateData = Boolean(
    !po &&
    (templatePo ||
      customerPoCode.trim() ||
      notes.trim() ||
      poItems.length > 0 ||
      assignments.length > 0 ||
      pdfFile ||
      excelFile ||
      aiFile ||
      corelFile ||
      contractFile ||
      quoteFile)
  );

  const handleClose = () => {
    if (isSaving) return;
    if (hasUnsavedCreateData) {
      const shouldClose = window.confirm(
        'Đơn hàng chưa được lưu chính thức. Hệ thống đã giữ bản nháp để bạn có thể tiếp tục sau. Bạn có muốn đóng form?'
      );
      if (!shouldClose) return;
    }
    setIsTableFocusMode(false);
    onClose();
  };

  const handleDiscardDraft = async () => {
    if (!draftKey) return;
    const shouldDiscard = await confirmDelete('Bạn có chắc muốn xóa bản nháp và bắt đầu lại?');
    if (!shouldDiscard) return;
    window.localStorage.removeItem(draftKey);
    setDraftRestored(false);
    setDraftResetRevision(revision => revision + 1);
  };

  // Form submit
  const handleSubmit = async (e: React.FormEvent) => {
    return runMutationAction(
      'POFormFullScreen.tsx:handleSubmit',
      async () => {
        e.preventDefault();
        if (isSaving) return;
        if (!customerId) {
          setShowOrderInfo(true);
          alert(t('Vui lòng chọn khách hàng!'));
          return;
        }
        if (!expectedDeliveryDate || Number.isNaN(Date.parse(expectedDeliveryDate))) {
          setShowOrderInfo(true);
          alert(t('Vui lòng chọn ngày giao hàng dự kiến hợp lệ!'));
          return;
        }
        if (!['A', 'B', 'C', 'D'].includes(customerRank)) {
          setShowOrderInfo(true);
          alert(t('Vui lòng chọn hạng khách hàng A, B, C hoặc D!'));
          return;
        }
        if (poItems.length === 0) {
          alert(t('Vui lòng thêm ít nhất 1 mặt hàng vào PO!'));
          return;
        }

        // Validate that all items have a name and quantity
        const customerCatalog = getActiveCustomerProducts(customers.find(customer => customer.id === customerId));
        const preparedProductCodes = new Set<string>();
        for (let i = 0; i < orderItems.length; i++) {
          const productCode = String(orderItems[i].productCode || '').trim();
          if (
            refreshCatalogProducts &&
            orderItems[i].customerProductId &&
            !findCustomerProductForOrderItem(orderItems[i], customerCatalog)
          ) {
            alert(t(`Dòng ${i + 1}: Hãy chọn mã sản phẩm đã đăng ký trong hồ sơ khách hàng.`));
            return;
          }
          if (workflowMode === 'customer_onboarding' && !productCode) {
            alert(t(`Dòng ${i + 1}: Vui lòng nhập mã hàng để lưu vào hồ sơ khách hàng!`));
            return;
          }
          const normalizedProductCode = productCode.toLocaleUpperCase('vi-VN');
          if (workflowMode === 'customer_onboarding' && preparedProductCodes.has(normalizedProductCode)) {
            alert(t(`Dòng ${i + 1}: Mã hàng ${productCode} đang bị trùng trong danh sách!`));
            return;
          }
          if (normalizedProductCode) preparedProductCodes.add(normalizedProductCode);
          if (!String(orderItems[i].productName || '').trim()) {
            alert(t(`Dòng ${i + 1}: Vui lòng nhập tên hàng!`));
            return;
          }
          if (!String(orderItems[i].unit || '').trim()) {
            alert(t(`Dòng ${i + 1}: Vui lòng nhập đơn vị tính!`));
            return;
          }
          if (!Number.isFinite(Number(orderItems[i].quantity)) || Number(orderItems[i].quantity) <= 0) {
            alert(t(`Dòng ${i + 1}: Số lượng phải lớn hơn 0!`));
            return;
          }
          if (templatePo && (!orderItems[i].price || Number(orderItems[i].price) <= 0)) {
            alert(`Dòng ${i + 1}: Vui lòng kiểm tra và nhập đơn giá hiện hành trước khi lưu đơn đặt lại.`);
            return;
          }
        }

        const normalizedItems = orderItems.map(item => {
          const catalogProduct = findCustomerProductForOrderItem(item, customerCatalog);
          return withCalculatedPOFinancials(
            refreshCatalogProducts && catalogProduct ? refreshCustomerProductOrderItem(item, catalogProduct) : item
          );
        });

        // Calculate totals
        let totalBeforeVat = 0;
        let totalAfterVat = 0;

        normalizedItems.forEach(item => {
          const financials = calculatePOItemFinancials(item);
          totalBeforeVat += financials.amountBeforeVat;
          totalAfterVat += financials.amountWithVat;
        });

        const customerObj = customers.find(c => c.id === customerId);
        if (!customerObj) {
          alert(t('Không tìm thấy hồ sơ khách hàng. Vui lòng tải lại trang và chọn lại khách hàng.'));
          return;
        }

        const normalizedCustomerRank = customerRank as CustomerRank;
        const existingSnapshot =
          po?.customerId === customerId ? (po.customerSnapshot as CustomerSnapshot | undefined) : undefined;
        const customerSnapshot: CustomerSnapshot = existingSnapshot
          ? { ...existingSnapshot, customerRank: normalizedCustomerRank }
          : createCustomerSnapshot(customerObj, normalizedCustomerRank);

        const poData = {
          id: po?.id || undefined,
          customerId,
          customerName: customerSnapshot.companyName,
          customerRank: normalizedCustomerRank,
          customerSnapshot,
          customerPoCode,
          expectedDeliveryDate: new Date(expectedDeliveryDate).toISOString(),
          notes,
          items: normalizedItems,
          assignments,
          totalAmount: totalBeforeVat, // For consistency, totalAmount is subtotal
          discountAmount: normalizedItems.reduce(
            (acc, item) => acc + Math.round(calculatePOItemFinancials(item).discountAmount),
            0
          ),
          netAmount: totalAfterVat, // Store final VAT-included total here or match DB convention
          links: {
            pdfLink: pdfFile,
            excelLink: excelFile,
            aiLink: aiFile,
            corelLink: corelFile,
            contractLink: contractFile,
            quoteLink: quoteFile
          },
          orderType: templatePo ? 'repeat' : po?.orderType || 'new',
          repeatSourcePoId: templatePo?.id || po?.repeatSourcePoId || '',
          repeatSourcePoCode: templatePo?.poCode || po?.repeatSourcePoCode || '',
          designReuseRequested: templatePo
            ? poItems.some(item => item.designReuseRequested)
            : Boolean(po?.designReuseRequested)
        };

        setIsSaving(true);
        setSaveError('');
        try {
          await onSave(poData);
          if (draftKey) window.localStorage.removeItem(draftKey);
          setIsTableFocusMode(false);
        } catch (error) {
          console.error('Error saving PO:', error);
          setSaveError('Không thể lưu đơn hàng. Vui lòng kiểm tra kết nối và thử lại.');
          alert('Không thể lưu đơn hàng. Dữ liệu vẫn được giữ trong bản nháp để bạn thử lại.');
        } finally {
          setIsSaving(false);
        }
      },
      e
    );
  };

  // Calculations for totals footer
  const calculateFooter = () => {
    let totalQty = 0;
    let totalBeforeVat = 0;
    let totalVat = 0;
    let totalAfterVat = 0;

    orderItems.forEach(item => {
      const financials = calculatePOItemFinancials(item);
      totalQty += financials.quantity;
      totalBeforeVat += financials.amountBeforeVat;
      totalVat += financials.vatAmount;
      totalAfterVat += financials.amountWithVat;
    });

    return { totalQty, totalBeforeVat, totalVat, totalAfterVat };
  };

  const footerTotals = calculateFooter();
  const quantitiesByUnit = new Map<string, number>();
  orderItems.forEach(item => {
    const unit = String(item.unit || t('Chưa có ĐVT'));
    quantitiesByUnit.set(unit, (quantitiesByUnit.get(unit) || 0) + (Number(item.quantity) || 0));
  });
  const attachmentCount = [pdfFile, excelFile, aiFile, corelFile, contractFile, quoteFile].filter(Boolean).length;

  // Catalog products + past history filter
  const currentCustomer = customers.find(c => c.id === customerId);
  const isCustomerOnboarding = workflowMode === 'customer_onboarding';
  const isPreparedAssignment =
    !po && !templatePo && !isCustomerOnboarding && Boolean(currentCustomer?.pendingOrderDraft);
  const catalogProducts = getActiveCustomerProducts(currentCustomer);

  const filteredCatalog = catalogProducts.filter(
    (p: any) =>
      (p.productCode && p.productCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.productName && p.productName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredHistory = pastProducts.filter(
    (p: any) =>
      (p.productCode && p.productCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.productName && p.productName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Departments for tasks mapping
  const departments = [
    { value: 'designer', label: t('Thiết Kế (DESIGN)') },
    { value: 'producer', label: t('Sản Xuất (FACTORY)') },
    { value: 'purchaser', label: t('Mua Hàng (PURCHASE)') },
    { value: 'accountant', label: t('Kế Toán (ACCOUNTING)') },
    { value: 'sale', label: t('Kinh Doanh (SALES)') },
    { value: 'admin', label: t('Ban Giám Đốc (ADMIN)') }
  ];

  const orderAttachments = (
    <>
      {/* Document upload / repository repo link */}
      <div className="po-attachments-card">
        <button
          type="button"
          className="po-collapse-trigger"
          onClick={() => setShowAttachments(current => !current)}
          aria-expanded={showAttachments}
          aria-controls="po-attachment-content"
        >
          <span>
            <Paperclip size={15} />
            {t('Tệp đơn hàng & thiết kế')}
            {attachmentCount > 0 && <small>{attachmentCount}</small>}
          </span>
          <span className="po-section-action">{showAttachments ? t('Thu gọn') : t('Mở rộng')}</span>
        </button>

        {showAttachments && (
          <div id="po-attachment-content" className="po-attachment-content">
            {customerId && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => setShowRepoModal(true)}
                style={{
                  marginBottom: '12px',
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)'
                }}
              >
                <Folder size={14} />
                <span>{t('Chọn từ kho tệp khách hàng')}</span>
              </button>
            )}

            <div className="po-attachment-fields">
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('File PDF Đơn Hàng')}
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={e => handleLinkFileChange(e, setPdfFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {pdfFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('Bản Báo Giá Excel')}
                </label>
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={e => handleLinkFileChange(e, setExcelFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {excelFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('File Thiết kế AI')}
                </label>
                <input
                  type="file"
                  accept="*/*"
                  onChange={e => handleLinkFileChange(e, setAiFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {aiFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('File Thiết kế Corel (.cdr)')}
                </label>
                <input
                  type="file"
                  accept="*/*"
                  onChange={e => handleLinkFileChange(e, setCorelFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {corelFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('File Hợp Đồng')}
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={e => handleLinkFileChange(e, setContractFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {contractFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, marginBottom: '2px', display: 'block' }}>
                  {t('Bản Báo Giá PDF')}
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={e => handleLinkFileChange(e, setQuoteFile)}
                  style={{ fontSize: '11px', width: '100%' }}
                />
                {quoteFile && (
                  <span style={{ fontSize: '10px', color: 'var(--color-success)', display: 'block', marginTop: '2px' }}>
                    ✓ {t('Đã tải lên')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const orderAssignments = (
    <div
      className="po-assignment-card"
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        backgroundColor: 'white',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        overflow: 'hidden',
        display: isCustomerOnboarding ? 'none' : undefined
      }}
    >
      <button
        type="button"
        className="po-collapse-trigger po-assignment-header"
        onClick={() => setShowAssignments(current => !current)}
        aria-expanded={showAssignments}
        aria-controls="po-assignment-content"
      >
        <span>
          {t('Phân công công việc')} <small>{assignments.length}</small>
        </span>
        <span className="po-section-action">{showAssignments ? t('Thu gọn') : t('Mở rộng')}</span>
      </button>

      {showAssignments && (
        <div id="po-assignment-content" className="po-assignment-content" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
            {assignments.map((assign, index) => {
              // Users that match the role of the department
              const deptUsers = users.filter(u => u.role === assign.department && u.active);

              return (
                <div
                  key={assign.id}
                  className="po-assignment-entry"
                  style={{
                    border: '1px solid var(--color-border-light)',
                    borderRadius: '6px',
                    padding: '12px',
                    backgroundColor: '#fafbfc',
                    display: 'grid',
                    gridTemplateColumns: '200px 1.5fr 150px 120px 30px',
                    gap: '12px',
                    alignItems: 'start'
                  }}
                >
                  {/* Department Selector */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>{t('Bộ phận chịu trách nhiệm')}</label>
                    <select
                      value={assign.department}
                      onChange={e => handleUpdateAssignment(index, 'department', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '12.5px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      {departments.map(d => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>

                    {/* Personnel check list */}
                    <div style={{ marginTop: '8px' }}>
                      <label
                        style={{
                          fontSize: '10.5px',
                          color: 'var(--color-text-muted)',
                          display: 'block',
                          marginBottom: '4px'
                        }}
                      >
                        {t('Chọn Nhân Sự Phụ Trách')}
                      </label>
                      <div
                        style={{
                          maxHeight: '100px',
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px'
                        }}
                      >
                        {deptUsers.map(u => (
                          <label
                            key={u.uid}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              margin: 0
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={(assign.userIds || []).includes(u.uid)}
                              onChange={() => handleToggleUserInAssignment(index, u.uid)}
                            />
                            <span>{u.displayName}</span>
                          </label>
                        ))}
                        {deptUsers.length === 0 && (
                          <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            {t('Không có nhân sự cho bộ phận này')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Task Description */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>{t('Nội dung công việc bàn giao')}</label>
                    <textarea
                      value={assign.description}
                      onChange={e => handleUpdateAssignment(index, 'description', e.target.value)}
                      placeholder={t('Ví dụ: Bế tem trắng, gửi mẫu layout duyệt, đặt mua mực màu đen...')}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '12.5px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    />
                  </div>

                  {/* Due date */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>{t('Hạn hoàn thành')}</label>
                    <input
                      type="date"
                      value={assign.dueDate}
                      onChange={e => handleUpdateAssignment(index, 'dueDate', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '12.5px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    />
                  </div>

                  {/* Priority Selector */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600 }}>{t('Độ ưu tiên')}</label>
                    <select
                      value={assign.priority}
                      onChange={e => handleUpdateAssignment(index, 'priority', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px',
                        fontSize: '12.5px',
                        borderRadius: '4px',
                        border: '1px solid var(--color-border)'
                      }}
                    >
                      <option value="Cực gấp">{t('Cực gấp')}</option>
                      <option value="Gấp">{t('Gấp')}</option>
                      <option value="Bình thường">{t('Bình thường')}</option>
                      <option value="Thong thả">{t('Thong thả')}</option>
                    </select>
                  </div>

                  {/* Delete Assignment Row */}
                  <div style={{ alignSelf: 'center', textAlign: 'center' }}>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      onClick={() => handleRemoveAssignment(index)}
                      title={t('Xóa phân công')}
                    >
                      {t('Xóa phân công')}
                    </button>
                  </div>
                </div>
              );
            })}

            {assignments.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  color: 'var(--color-text-muted)',
                  fontStyle: 'italic',
                  fontSize: '12.5px'
                }}
              >
                {t('Chưa phân công công việc phòng ban nào cho PO này.')}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={handleAddAssignment}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}
          >
            <Plus size={14} />
            <span>{t('Thêm phân công phòng ban')}</span>
          </button>
        </div>
      )}
    </div>
  );

  const orderInfo = (
    <section className="po-order-info">
      <button
        type="button"
        className="po-collapse-trigger"
        onClick={() => setShowOrderInfo(current => !current)}
        aria-expanded={showOrderInfo}
        aria-controls="po-order-info-content"
      >
        <span>{t('Thông tin đơn hàng')}</span>
        <span className="po-section-action">{showOrderInfo ? t('Thu gọn') : t('Mở rộng')}</span>
      </button>
      {!showOrderInfo && (
        <div className="po-order-info-summary">
          <strong title={currentCustomer?.companyName}>
            {currentCustomer?.companyName || t('Chưa chọn khách hàng')}
          </strong>
          <span>
            {t('Ngày giao')}: {expectedDeliveryDate ? formatDate(expectedDeliveryDate, 'vi-VN') : '—'}
          </span>
        </div>
      )}
      <div id="po-order-info-content" className="po-order-info-fields" hidden={!showOrderInfo}>
        <div className="form-group">
          <label style={{ fontWeight: 600, fontSize: '12px' }}>{t('Khách hàng *')}</label>
          <select
            value={customerId}
            onChange={e => {
              const nextCustomerId = e.target.value;
              if (
                nextCustomerId !== customerId &&
                poItems.length &&
                !window.confirm(t('Đổi khách hàng sẽ bỏ các sản phẩm đang chọn trong PO. Bạn có muốn tiếp tục?'))
              )
                return;
              const nextCustomer = customers.find(customer => customer.id === nextCustomerId);
              setCustomerId(nextCustomerId);
              setCustomerRank(nextCustomer?.customerRank || '');
              setPoItems([]); // Reset items on customer change
              setPastProducts([]);
              setSearchPopupOpen(false);
              setSearchRowIndex(null);
            }}
            disabled={!!po || !!templatePo || Boolean(initialCustomerId)} // Linked onboarding/repeat orders must stay with the original customer
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
          >
            <option value="">{t('Chọn khách hàng')}</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({t('CK')}: {c.discountRate}%)
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600, fontSize: '12px' }}>{t('Hạng khách hàng *')}</label>
          <select
            value={customerRank}
            onChange={e => setCustomerRank(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
          >
            <option value="">{t('-- Chọn hạng khách hàng --')}</option>
            {['A', 'B', 'C', 'D'].map(rank => (
              <option key={rank} value={rank}>
                {t('Hạng')} {rank}
              </option>
            ))}
          </select>
          <span className="po-customer-rank-help">{t('Hạng được lưu vào hồ sơ khách hàng sau khi lưu PO.')}</span>
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600, fontSize: '12px' }}>{t('Số PO khách hàng')}</label>
          <input
            type="text"
            value={customerPoCode}
            onChange={e => setCustomerPoCode(e.target.value)}
            placeholder={t('Ví dụ: VFT26-553...')}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
          />
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600, fontSize: '12px' }}>{t('Ngày giao dự kiến *')}</label>
          <input
            type="date"
            value={expectedDeliveryDate}
            onChange={e => setExpectedDeliveryDate(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--color-border)' }}
          />
        </div>

        <div className="form-group">
          <label style={{ fontWeight: 600, fontSize: '12px' }}>{t('Ghi chú đơn hàng')}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('Chi tiết giao hàng, yêu cầu riêng...')}
            rows={3}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--color-border)',
              fontSize: '13px'
            }}
          />
        </div>

        {draftRestored && (
          <button type="button" className="po-discard-draft" onClick={handleDiscardDraft}>
            {t('Bỏ bản nháp')}
          </button>
        )}
      </div>
    </section>
  );

  const statusNotices = (
    <>
      {saveError && (
        <div className="po-save-error" role="alert">
          {saveError}
        </div>
      )}
      {templatePo && (
        <div className="repeat-order-banner">
          <History size={18} />
          <div>
            <strong>Đang tạo đơn đặt lại từ {templatePo.poCode}</strong>
            <span>
              Hệ thống đã lấy lại mã hàng, quy cách và mẫu thiết kế. Đơn giá hiện hành, số lượng, ngày giao và người phụ
              trách phải được xác nhận lại trước khi lưu.
            </span>
          </div>
        </div>
      )}
      {isPreparedAssignment && (
        <div className="prepared-order-banner" role="status">
          <CheckSquare size={18} />
          <div>
            <strong>{t('Thông tin đơn đầu tiên đã được chuẩn bị từ CRM')}</strong>
            <span>
              {t(
                'Mặt hàng, giá, ngày giao và tệp liên quan đã được điền sẵn. Hãy bổ sung phân công phòng ban rồi lưu để phát hành PO.'
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="modal-overlay-fullscreen">
      <div
        className={`modal-content-fullscreen po-form-workspace ${usesCatalogProducts ? 'po-form-workspace--catalog' : ''}`}
      >
        {/* HEADER */}
        <div className="po-form-header">
          <div className="po-form-heading">
            <div>
              <h2>
                {isCustomerOnboarding
                  ? t('Chuẩn bị đơn hàng đầu tiên')
                  : po
                    ? `${t('Chỉnh sửa đơn hàng PO')}: ${po.poCode}`
                    : templatePo
                      ? `Tạo đơn đặt lại từ ${templatePo.poCode}`
                      : t('Tạo đơn hàng khách hàng (PO)')}
              </h2>
              <p>
                {isCustomerOnboarding
                  ? t('Nhập thông tin thương mại và mặt hàng; phân công sẽ thực hiện tại Sale PO.')
                  : po
                    ? `${t('Mã PO nội bộ:')} ${po.poCode}`
                    : templatePo
                      ? 'Kế thừa thông số và mẫu đã duyệt; giá, ngày giao và phân công cần kiểm tra lại.'
                      : t('Khởi tạo tệp thông tin đơn hàng mới và phân công sản xuất')}
              </p>
            </div>
          </div>
          <div className="po-form-header-actions">
            <button type="button" className="btn btn-outline" onClick={handleClose} disabled={isSaving}>
              {t('Quay lại')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isSaving}
              aria-busy={isSaving}
            >
              <span>
                {isSaving
                  ? t('Đang lưu...')
                  : isCustomerOnboarding
                    ? t('Lưu khách hàng & chuẩn bị PO')
                    : t('Lưu Đơn Hàng PO')}
              </span>
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '300px minmax(0, 1fr)',
            overflowY: 'auto'
          }}
          className="po-form-body-container"
        >
          <aside className="po-order-sidebar">
            {orderInfo}
            {orderAttachments}
            {usesCatalogProducts && orderAssignments}
          </aside>

          {/* RIGHT GRID PANEL: Items Grid & Assignments */}
          <div
            className="po-order-main"
            style={{
              padding: '20px 24px',
              overflowY: 'visible',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            {statusNotices}
            {/* INLINE EDITING EXCEL-LIKE GRID */}
            <div className={`po-items-card ${isTableFocusMode ? 'is-focus-mode' : ''}`}>
              <div className="po-items-card-header">
                <div>
                  <h3>
                    {usesCatalogProducts ? t('Sản phẩm trong đơn hàng') : t('Danh sách mã hàng cần in và sản xuất')}
                  </h3>
                  <span>
                    {poItems.length} {t('mã hàng')} · {currentCustomer?.companyName || t('Chưa chọn khách hàng')}
                  </span>
                </div>
                <div className="po-items-card-actions">
                  <div className="po-grid-zoom-control" role="group" aria-label={t('Thu phóng bảng mã hàng')}>
                    <label htmlFor="po-grid-zoom">{t('Thu phóng')}</label>
                    <input
                      id="po-grid-zoom"
                      type="range"
                      min={PO_GRID_MIN_ZOOM}
                      max={PO_GRID_MAX_ZOOM}
                      step={PO_GRID_ZOOM_STEP}
                      value={tableZoom}
                      onChange={event => setTableZoom(Number(event.target.value))}
                      aria-label={t('Tỷ lệ hiển thị bảng')}
                    />
                    <output htmlFor="po-grid-zoom">{tableZoom}%</output>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setIsTableFocusMode(current => !current)}
                    aria-pressed={isTableFocusMode}
                  >
                    {isTableFocusMode ? t('Thu gọn') : t('Mở toàn màn hình')}
                  </button>
                  {usesCatalogProducts && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => openSearchPopup(-1)}
                      disabled={!customerId || !catalogProducts.length || isSaving}
                    >
                      {t('Chọn sản phẩm')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleAddRow}
                    disabled={isSaving || (usesCatalogProducts && !customerId)}
                  >
                    {usesCatalogProducts ? t('Thêm dòng nhập tay') : t('Thêm mã hàng')}
                  </button>
                </div>
              </div>

              {isTableFocusMode && (
                <div className="po-order-context-summary" aria-label={t('Tóm tắt đơn hàng')}>
                  <span>
                    <strong>{t('Khách hàng')}:</strong> {currentCustomer?.companyName || t('Chưa chọn')}
                  </span>
                  <span>
                    <strong>{t('Hạng')}:</strong> {customerRank || '—'}
                  </span>
                  <span>
                    <strong>{t('Số PO')}:</strong> {customerPoCode || '—'}
                  </span>
                  <span>
                    <strong>{t('Ngày giao')}:</strong>{' '}
                    {expectedDeliveryDate ? formatDate(expectedDeliveryDate, 'vi-VN') : '—'}
                  </span>
                </div>
              )}

              {isTableFocusMode && saveError && (
                <div className="po-save-error" role="alert">
                  {saveError}
                </div>
              )}

              {usesCatalogProducts && customerId && catalogProducts.length === 0 && (
                <div className="po-catalog-empty" role="status">
                  <span>{t('Khách hàng chưa có mã sản phẩm. Bạn có thể thêm dòng nhập tay để lập đơn hàng.')}</span>
                  {onOpenCustomerDetails && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={!customerId}
                      onClick={() => {
                        onClose();
                        onOpenCustomerDetails(customerId);
                      }}
                    >
                      {t('Mở hồ sơ khách hàng')}
                    </button>
                  )}
                </div>
              )}
              <POItemsGrid
                tableZoom={tableZoom}
                t={t}
                usesCatalogProducts={usesCatalogProducts}
                orderItems={orderItems}
                expandedItemIds={expandedItemIds}
                setPreviewImage={setPreviewImage}
                deleteRowImage={deleteRowImage}
                handleRowFileChange={handleRowFileChange}
                toggleItemDetails={toggleItemDetails}
                handleRemoveRow={handleRemoveRow}
                handleUpdateRowField={handleUpdateRowField}
                catalogProducts={catalogProducts}
                openSearchPopup={openSearchPopup}
                isSaving={isSaving}
              />

              {/* FOOTER ACTIONS */}
              <div className="po-items-footer">
                {/* TOTAL SUMMARY CARD */}
                <div
                  className="po-total-summary-card"
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    minWidth: '340px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('Số lượng theo ĐVT:')}</span>
                    <strong style={{ fontSize: '14px' }}>
                      {[...quantitiesByUnit]
                        .map(([unit, quantity]) => `${quantity.toLocaleString('vi-VN')} ${unit}`)
                        .join(' · ') || '—'}
                    </strong>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #cbd5e1',
                      paddingBottom: '6px'
                    }}
                  >
                    <span>{t('Tổng tiền chưa VAT:')}</span>
                    <span style={{ fontWeight: 600 }}>
                      {Math.round(footerTotals.totalBeforeVat).toLocaleString()} đ
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-muted)' }}>
                    <span>{t('Thuế GTGT (VAT):')}</span>
                    <span>{Math.round(footerTotals.totalVat).toLocaleString()} đ</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: 'var(--color-primary-dark)',
                      fontSize: '15px',
                      fontWeight: 'bold',
                      paddingTop: '4px'
                    }}
                  >
                    <span>{t('TỔNG CỘNG (GỒM VAT):')}</span>
                    <span>{Math.round(footerTotals.totalAfterVat).toLocaleString()} đ</span>
                  </div>
                </div>
              </div>
            </div>

            {!usesCatalogProducts && orderAssignments}
          </div>
        </div>

        {/* SEARCH MÃ HÀNG POPUP (Catalog & Past History) */}
        {searchPopupOpen && usesCatalogProducts && (
          <CustomerProductPicker
            companyName={currentCustomer?.companyName || ''}
            products={catalogProducts}
            single={searchRowIndex !== null && searchRowIndex >= 0}
            initialIds={
              searchRowIndex !== null && searchRowIndex >= 0
                ? [findCustomerProductForOrderItem(poItems[searchRowIndex], catalogProducts)?.id || ''].filter(Boolean)
                : []
            }
            t={t}
            onClose={closeCatalogPicker}
            onConfirm={addCatalogProducts}
          />
        )}
        {searchPopupOpen && !usesCatalogProducts && searchRowIndex !== null && (
          <POLegacyProductSearchDialog
            setSearchPopupOpen={setSearchPopupOpen}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredCatalog={filteredCatalog}
            handleSelectSearchedProduct={handleSelectSearchedProduct}
            getProductSize={getProductSize}
            filteredHistory={filteredHistory}
          />
        )}

        {/* CUSTOMER REPOSITORY FILE PICKER MODAL */}
        {showRepoModal && (
          <POFileRepositoryDialog
            currentCustomer={currentCustomer}
            setShowRepoModal={setShowRepoModal}
            setPdfFile={setPdfFile}
            setExcelFile={setExcelFile}
            setAiFile={setAiFile}
            setCorelFile={setCorelFile}
            setContractFile={setContractFile}
            setQuoteFile={setQuoteFile}
          />
        )}

        {/* IMAGE ZOOM LIGHTBOX */}
        {previewImage && <POImagePreviewDialog setPreviewImage={setPreviewImage} previewImage={previewImage} />}
      </div>
    </div>
  );
}
