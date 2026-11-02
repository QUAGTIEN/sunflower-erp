import { usePartnerDebt } from '@/features/accounting/components/usePartnerDebt';
import { PartnerDebtValue } from '@/features/accounting/components/PartnerDebtSummary';
import { requireConfirmedMutation, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
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
import {
  Building2,
  CalendarDays,
  FileText,
  Mail,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Settings2,
  Star,
  X
} from 'lucide-react';
import { PageBackButton } from '@/components/PageBackButton';
import {
  getSourcingTypeLabel,
  normalizeSupplierRecords,
  type SourcingType,
  type SupplierContactRecord,
  type SupplierDocumentRecord,
  type SupplierRecord
} from '@/features/procurement/model/purchaseModels';
import { SearchableProvinceSelect } from '@/components/SearchableProvinceSelect';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import './Purchase.css';

type UnknownRecord = Record<string, unknown>;

interface SuppliersProps {
  purchaseOrders: UnknownRecord[];
  currentUser: UserProfile;
  users: UserProfile[];
}

interface SupplierFormState {
  supplierName: string;
  supplierCode: string;
  taxCode: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  province: string;
  categoriesText: string;
  serviceTypes: SourcingType[];
  paymentTerms: string;
  bankName: string;
  bankAccount: string;
  assignedPurchaserId: string;
  rating: number;
  note: string;
}

const EMPTY_FORM: SupplierFormState = {
  supplierName: '',
  supplierCode: '',
  taxCode: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  province: '',
  categoriesText: '',
  serviceTypes: [],
  paymentTerms: '',
  bankName: '',
  bankAccount: '',
  assignedPurchaserId: '',
  rating: 0,
  note: ''
};

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

const parseCategories = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,;\n]+/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  );

const SUPPLIER_LIST_COLUMNS: TableColumnOption[] = [
  { id: 'supplier', label: 'Nhà cung cấp', required: true, group: 'Thông tin nhà cung cấp' },
  { id: 'contact', label: 'Liên hệ', defaultVisible: true, group: 'Thông tin nhà cung cấp' },
  { id: 'categories', label: 'Nhóm hàng', defaultVisible: true, group: 'Năng lực cung ứng' },
  { id: 'orderCount', label: 'Số đơn', defaultVisible: true, group: 'Lịch sử mua hàng' },
  { id: 'totalSpend', label: 'Tổng mua', defaultVisible: true, group: 'Lịch sử mua hàng' },
  { id: 'latestOrder', label: 'Lần mua gần nhất', defaultVisible: true, group: 'Lịch sử mua hàng' },
  { id: 'debt', label: 'Công nợ', defaultVisible: true, group: 'Tài chính' },
  { id: 'rating', label: 'Đánh giá', defaultVisible: true, group: 'Đánh giá' }
];

export const Suppliers: React.FC<SuppliersProps> = ({ purchaseOrders, currentUser, users }) => {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const finance = usePartnerDebt(currentUser);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [monthFilters, setMonthFilters] = useState<string[]>([]);
  const [showSupplierFilters, setShowSupplierFilters] = useState(false);
  const [showSupplierColumnCustomizer, setShowSupplierColumnCustomizer] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState('');
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [activityNote, setActivityNote] = useState('');
  const [contactDraft, setContactDraft] = useState({ name: '', role: '', phone: '', email: '' });
  const [historyMonth, setHistoryMonth] = useState('all');
  const {
    selectedIds: sharedSupplierColumns,
    setSelectedIds: setSupplierVisibleColumns,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: 'suppliers',
    legacySelectionKey: `sunflower:supplier-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:supplier-column-widths:v3:${currentUser.uid}`
  });
  const supplierVisibleColumns = Array.from(
    new Set([
      'supplier',
      ...(sharedSupplierColumns ||
        SUPPLIER_LIST_COLUMNS.filter(column => column.required || column.defaultVisible).map(column => column.id))
    ])
  );
  const supplierVisibleColumnSet = new Set(supplierVisibleColumns);
  const saveSupplierVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const next = Array.from(new Set(['supplier', ...selectedIds]));
    setSupplierVisibleColumns(next);
    setShowSupplierColumnCustomizer(false);
  };
  const { orderedColumnIds: orderedSupplierColumnIds, getHeaderProps: getSupplierHeaderProps } =
    useReorderableTableColumns({
      columns: SUPPLIER_LIST_COLUMNS,
      selectedIds: supplierVisibleColumns,
      onOrderChange: saveSupplierVisibleColumns,
      layoutId: 'suppliers',
      lockedStartIds: ['supplier']
    });
  const supplierColumnLabels = Object.fromEntries(SUPPLIER_LIST_COLUMNS.map(column => [column.id, column.label]));
  const supplierActiveFilterCount = categoryFilters.length + monthFilters.length;

  useEffect(() => {
    const unsubscribeSuppliers = dbService.subscribeCollection('suppliers', data => {
      setSuppliers(normalizeSupplierRecords(data).filter(supplier => !supplier.deleted));
    });
    return () => {
      unsubscribeSuppliers();
    };
  }, []);

  const purchasers = useMemo(() => users.filter(user => user.role === 'accountant'), [users]);
  const selectedSupplier = suppliers.find(supplier => supplier.id === selectedSupplierId) || null;
  const categories = useMemo(
    () => Array.from(new Set(suppliers.flatMap(supplier => supplier.categories))).sort(),
    [suppliers]
  );
  const months = useMemo(
    () =>
      Array.from(new Set(purchaseOrders.map(order => asText(order.createdAt).slice(0, 7)).filter(Boolean)))
        .sort()
        .reverse(),
    [purchaseOrders]
  );

  const getSupplierOrders = useCallback(
    (supplierId: string): UnknownRecord[] =>
      purchaseOrders
        .filter(order => asText(order.supplierId) === supplierId && order.deleted !== true)
        .sort((a, b) => Date.parse(asText(b.createdAt)) - Date.parse(asText(a.createdAt))),
    [purchaseOrders]
  );

  const getSupplierDebt = (supplierId: string): number | undefined => finance.get('ap', supplierId)?.debt;

  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(supplier => {
        const orders = getSupplierOrders(supplier.id);
        const matchesSearch = matchesEveryTerm(searchTerm, [
          supplier.supplierCode,
          supplier.supplierName,
          supplier.taxCode,
          supplier.contactPerson,
          supplier.phone,
          supplier.email,
          supplier.address,
          supplier.province,
          supplier.categories,
          supplier.note,
          orders.map(order => [order.purCode, order.linkedPoCode, asArray(order.items).map(item => item.materialName)])
        ]);
        const matchesCategory =
          categoryFilters.length === 0 || categoryFilters.some(category => supplier.categories.includes(category));
        const matchesMonth =
          monthFilters.length === 0 ||
          monthFilters.some(month => orders.some(order => asText(order.createdAt).startsWith(month)));
        return matchesSearch && matchesCategory && matchesMonth;
      }),
    [categoryFilters, getSupplierOrders, monthFilters, searchTerm, suppliers]
  );
  const supplierPagination = useDataTablePagination(filteredSuppliers);

  const openCreateForm = () => {
    setEditingSupplierId('');
    setForm({
      ...EMPTY_FORM,
      assignedPurchaserId: currentUser.role === 'accountant' ? currentUser.uid : ''
    });
    setShowForm(true);
  };

  const openEditForm = (supplier: SupplierRecord) => {
    setEditingSupplierId(supplier.id);
    setForm({
      supplierName: supplier.supplierName,
      supplierCode: supplier.supplierCode,
      taxCode: supplier.taxCode,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      province: supplier.province,
      categoriesText: supplier.categories.join(', '),
      serviceTypes: supplier.serviceTypes,
      paymentTerms: supplier.paymentTerms,
      bankName: supplier.bankName,
      bankAccount: supplier.bankAccount,
      assignedPurchaserId: supplier.assignedPurchaserId,
      rating: supplier.rating,
      note: supplier.note
    });
    setShowForm(true);
  };

  const updateForm = <K extends keyof SupplierFormState>(field: K, value: SupplierFormState[K]) => {
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const toggleServiceType = (value: SourcingType) => {
    updateForm(
      'serviceTypes',
      form.serviceTypes.includes(value)
        ? form.serviceTypes.filter(item => item !== value)
        : [...form.serviceTypes, value]
    );
  };

  const handleSaveSupplier = async (event: React.FormEvent) => {
    return runMutationAction(
      'SuppliersPage.tsx:handleSaveSupplier',
      async () => {
        event.preventDefault();
        if (!form.supplierName.trim()) return;
        const assignedPurchaser = purchasers.find(user => user.uid === form.assignedPurchaserId);
        const current = suppliers.find(supplier => supplier.id === editingSupplierId);
        const primaryContact: SupplierContactRecord = {
          id: current?.contacts.find(contact => contact.primary)?.id || `supplier-contact-${Date.now()}`,
          name: form.contactPerson.trim(),
          role: 'Liên hệ chính',
          phone: form.phone.trim(),
          email: form.email.trim(),
          primary: true
        };
        const payload = {
          supplierCode: form.supplierCode.trim() || `NCC-${String(suppliers.length + 1).padStart(4, '0')}`,
          supplierName: form.supplierName.trim(),
          taxCode: form.taxCode.trim(),
          contactPerson: form.contactPerson.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          province: form.province.trim(),
          categories: parseCategories(form.categoriesText),
          serviceTypes: form.serviceTypes,
          paymentTerms: form.paymentTerms.trim(),
          bankName: form.bankName.trim(),
          bankAccount: form.bankAccount.trim(),
          assignedPurchaserId: form.assignedPurchaserId,
          assignedPurchaserName: assignedPurchaser?.displayName || '',
          status: current?.status || 'active',
          rating: Number(form.rating),
          note: form.note.trim(),
          contacts: [primaryContact, ...(current?.contacts || []).filter(contact => !contact.primary)],
          updatedBy: currentUser.displayName
        };

        if (editingSupplierId) {
          await requireConfirmedMutation(dbService.updateDocument('suppliers', editingSupplierId, payload));
        } else {
          const created = await dbService.addDocument('suppliers', {
            ...payload,
            contracts: [],
            documents: [],
            activities: [],
            createdAt: new Date().toISOString(),
            createdBy: currentUser.displayName,
            deleted: false
          });
          setSelectedSupplierId(created.id);
        }
        setShowForm(false);

        showSuccessToast(editingSupplierId ? 'Đã lưu thành công' : 'Đã thêm thành công');
      },
      event
    );
  };

  const handleAddActivity = async (event: React.FormEvent) => {
    return runMutationAction(
      'SuppliersPage.tsx:handleAddActivity',
      async () => {
        event.preventDefault();
        if (!selectedSupplier || !activityNote.trim()) return;
        const now = new Date().toISOString();
        const activity = {
          id: `supplier-activity-${now}`,
          type: 'note',
          note: activityNote.trim(),
          occurredAt: now,
          createdById: currentUser.uid,
          createdByName: currentUser.displayName
        };
        await requireConfirmedMutation(
          dbService.updateDocument('suppliers', selectedSupplier.id, {
            activities: [activity, ...selectedSupplier.activities],
            updatedBy: currentUser.displayName
          })
        );
        setActivityNote('');

        showSuccessToast('Đã thêm thành công');
      },
      event
    );
  };

  const handleAddContact = async (event: React.FormEvent) => {
    return runMutationAction(
      'SuppliersPage.tsx:handleAddContact',
      async () => {
        event.preventDefault();
        if (!selectedSupplier || !contactDraft.name.trim()) return;
        const now = new Date().toISOString();
        const contact: SupplierContactRecord = {
          id: `supplier-contact-${now}`,
          name: contactDraft.name.trim(),
          role: contactDraft.role.trim(),
          phone: contactDraft.phone.trim(),
          email: contactDraft.email.trim(),
          primary: false
        };
        await requireConfirmedMutation(
          dbService.updateDocument('suppliers', selectedSupplier.id, {
            contacts: [...selectedSupplier.contacts, contact],
            updatedBy: currentUser.displayName
          })
        );
        setContactDraft({ name: '', role: '', phone: '', email: '' });

        showSuccessToast('Đã thêm thành công');
      },
      event
    );
  };

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    return runMutationAction(
      'SuppliersPage.tsx:handleUploadDocument',
      async () => {
        if (!selectedSupplier) return;
        const file = event.target.files?.[0];
        if (!file) return;
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const now = new Date().toISOString();
        const document: SupplierDocumentRecord = {
          id: `supplier-document-${now}`,
          name: file.name,
          category: 'other',
          data,
          uploadedAt: now,
          uploadedBy: currentUser.displayName
        };
        await requireConfirmedMutation(
          dbService.updateDocument('suppliers', selectedSupplier.id, {
            documents: [document, ...selectedSupplier.documents],
            updatedBy: currentUser.displayName
          })
        );
        event.target.value = '';

        showSuccessToast('Đã lưu thành công');
      },
      event
    );
  };

  if (selectedSupplier) {
    const supplierOrders = getSupplierOrders(selectedSupplier.id);
    const visibleOrders =
      historyMonth === 'all'
        ? supplierOrders
        : supplierOrders.filter(order => asText(order.createdAt).startsWith(historyMonth));
    const supplierSpend = supplierOrders.reduce((sum, order) => sum + asNumber(order.totalPrice), 0);
    const supplierDebt = getSupplierDebt(selectedSupplier.id);
    return (
      <div className="suppliers-page">
        <div className="supplier-detail-header">
          <PageBackButton onClick={() => setSelectedSupplierId('')} />
          <div>
            <h1>{selectedSupplier.supplierName}</h1>
            <p>
              {selectedSupplier.supplierCode || selectedSupplier.id} ·{' '}
              {selectedSupplier.categories.join(', ') || 'Chưa phân loại'}
            </p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openEditForm(selectedSupplier)}>
            <Pencil size={15} /> Chỉnh sửa
          </button>
        </div>

        <div className="supplier-kpi-grid">
          <div>
            <ReceiptText size={18} />
            <strong>{supplierOrders.length}</strong>
            <span>Đơn mua</span>
          </div>
          <div>
            <Building2 size={18} />
            <strong>{supplierSpend.toLocaleString('vi-VN')} đ</strong>
            <span>Tổng giá trị mua</span>
          </div>
          <div>
            <CalendarDays size={18} />
            <strong>{formatDate(asText(supplierOrders[0]?.createdAt), 'vi-VN', '—')}</strong>
            <span>Lần mua gần nhất</span>
          </div>
          <div>
            <Star size={18} />
            <strong>{selectedSupplier.rating || '—'}/5</strong>
            <span>Đánh giá</span>
          </div>
          <div>
            <FileText size={18} />
            <strong>{supplierDebt?.toLocaleString('vi-VN') ?? '—'} đ</strong>
            <span>Công nợ sổ mới</span>
          </div>
        </div>

        <div className="supplier-detail-grid">
          <section className="purchase-panel">
            <h2>Thông tin doanh nghiệp</h2>
            <div className="supplier-info-grid">
              <div>
                <Building2 size={15} />
                <span>Mã số thuế</span>
                <strong>{selectedSupplier.taxCode || '—'}</strong>
              </div>
              <div>
                <MapPin size={15} />
                <span>Địa chỉ</span>
                <strong>{selectedSupplier.address || '—'}</strong>
              </div>
              <div>
                <Phone size={15} />
                <span>Điện thoại</span>
                <strong>{selectedSupplier.phone || '—'}</strong>
              </div>
              <div>
                <Mail size={15} />
                <span>Email</span>
                <strong>{selectedSupplier.email || '—'}</strong>
              </div>
              <div>
                <ReceiptText size={15} />
                <span>Điều khoản thanh toán</span>
                <strong>{selectedSupplier.paymentTerms || '—'}</strong>
              </div>
              <div>
                <Building2 size={15} />
                <span>Tài khoản ngân hàng</span>
                <strong>
                  {[selectedSupplier.bankName, selectedSupplier.bankAccount].filter(Boolean).join(' · ') || '—'}
                </strong>
              </div>
            </div>
            {selectedSupplier.note && (
              <div className="supplier-note">
                <strong>Ghi chú</strong>
                <p>{selectedSupplier.note}</p>
              </div>
            )}
          </section>

          <section className="purchase-panel">
            <h2>Người liên hệ</h2>
            <div className="supplier-contact-list">
              {selectedSupplier.contacts.map(contact => (
                <div key={contact.id}>
                  <strong>
                    {contact.name || '—'} {contact.primary && <span>Chính</span>}
                  </strong>
                  <small>{contact.role || 'Chưa có chức danh'}</small>
                  <small>{[contact.phone, contact.email].filter(Boolean).join(' · ') || '—'}</small>
                </div>
              ))}
            </div>
            <form className="supplier-inline-form" onSubmit={handleAddContact}>
              <input
                value={contactDraft.name}
                onChange={event => setContactDraft(previous => ({ ...previous, name: event.target.value }))}
                placeholder="Tên liên hệ"
                required
              />
              <input
                value={contactDraft.role}
                onChange={event => setContactDraft(previous => ({ ...previous, role: event.target.value }))}
                placeholder="Chức vụ"
              />
              <input
                value={contactDraft.phone}
                onChange={event => setContactDraft(previous => ({ ...previous, phone: event.target.value }))}
                placeholder="Số điện thoại"
              />
              <input
                value={contactDraft.email}
                onChange={event => setContactDraft(previous => ({ ...previous, email: event.target.value }))}
                placeholder="Email"
              />
              <button className="btn btn-outline" type="submit">
                <Plus size={14} /> Thêm liên hệ
              </button>
            </form>
          </section>
        </div>

        <section className="purchase-panel">
          <div className="panel-heading-row">
            <h2>Lịch sử đơn mua</h2>
            <select value={historyMonth} onChange={event => setHistoryMonth(event.target.value)}>
              <option value="all">Tất cả tháng</option>
              {months.map(month => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </div>
          <div className="table-container">
            <table className="purchase-table">
              <thead>
                <tr>
                  <th>Mã đơn mua</th>
                  <th>Đơn hàng khách hàng</th>
                  <th>Mặt hàng</th>
                  <th>Giá trị</th>
                  <th>Ngày đặt</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map(order => (
                  <tr key={asText(order.id)}>
                    <td>
                      <strong>{asText(order.purCode)}</strong>
                    </td>
                    <td>{asText(order.linkedPoCode) || '—'}</td>
                    <td>
                      {asArray(order.items)
                        .map(item => asText(item.materialName ?? item.productName))
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                    <td>{asNumber(order.totalPrice).toLocaleString('vi-VN')} đ</td>
                    <td>{formatDate(asText(order.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="supplier-detail-grid">
          <section className="purchase-panel">
            <div className="panel-heading-row">
              <h2>Hợp đồng và tài liệu</h2>
              <label className="btn btn-outline supplier-upload">
                <Paperclip size={14} /> Tải tài liệu
                <input type="file" onChange={handleUploadDocument} />
              </label>
            </div>
            <div className="supplier-document-list">
              {selectedSupplier.documents.map(document => (
                <a key={document.id} href={document.data} download={document.name}>
                  <FileText size={15} />
                  <span>{document.name}</span>
                  <small>{formatDateTime(document.uploadedAt)}</small>
                </a>
              ))}
              {selectedSupplier.contracts.map((contract, index) => (
                <div key={asText(contract.id) || String(index)}>
                  <FileText size={15} />
                  <span>{asText(contract.contractNo) || `Hợp đồng ${index + 1}`}</span>
                  <small>{formatDate(asText(contract.signDate))}</small>
                </div>
              ))}
              {selectedSupplier.documents.length === 0 && selectedSupplier.contracts.length === 0 && (
                <p className="purchase-empty">Chưa có tài liệu.</p>
              )}
            </div>
          </section>

          <section className="purchase-panel">
            <h2>Nhật ký làm việc</h2>
            <form className="supplier-activity-form" onSubmit={handleAddActivity}>
              <textarea
                rows={3}
                value={activityNote}
                onChange={event => setActivityNote(event.target.value)}
                placeholder="Ghi lại cuộc gọi, báo giá, đánh giá chất lượng..."
              />
              <button className="btn btn-primary" type="submit">
                <MessageSquarePlus size={14} /> Lưu nhật ký
              </button>
            </form>
            <div className="supplier-activity-list">
              {selectedSupplier.activities.map(activity => (
                <div key={activity.id}>
                  <strong>{activity.createdByName || 'Hệ thống'}</strong>
                  <small>{formatDateTime(activity.occurredAt)}</small>
                  <p>{activity.note}</p>
                </div>
              ))}
              {selectedSupplier.activities.length === 0 && <p className="purchase-empty">Chưa có nhật ký làm việc.</p>}
            </div>
          </section>
        </div>

        {showForm && renderSupplierForm()}
      </div>
    );
  }

  function renderSupplierForm() {
    return (
      <div className="modal-overlay">
        <div className="modal-content supplier-form-modal">
          <div className="modal-header">
            <strong>{editingSupplierId ? 'CHỈNH SỬA NHÀ CUNG CẤP' : 'THÊM NHÀ CUNG CẤP'}</strong>
            <button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => setShowForm(false)}>
              <X size={15} />
            </button>
          </div>
          <form onSubmit={handleSaveSupplier}>
            <div className="modal-body supplier-form-grid">
              <div className="form-group supplier-form-wide">
                <label>Tên nhà cung cấp *</label>
                <input
                  value={form.supplierName}
                  onChange={event => updateForm('supplierName', event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Mã NCC</label>
                <input
                  value={form.supplierCode}
                  onChange={event => updateForm('supplierCode', event.target.value)}
                  placeholder="Tự động nếu để trống"
                />
              </div>
              <div className="form-group">
                <label>Mã số thuế</label>
                <input value={form.taxCode} onChange={event => updateForm('taxCode', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Người liên hệ chính</label>
                <input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Điện thoại</label>
                <input value={form.phone} onChange={event => updateForm('phone', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="supplier-province">Tỉnh / thành</label>
                <SearchableProvinceSelect
                  inputId="supplier-province"
                  value={form.province}
                  onChange={value => updateForm('province', value)}
                />
              </div>
              <div className="form-group supplier-form-wide">
                <label>Địa chỉ</label>
                <input value={form.address} onChange={event => updateForm('address', event.target.value)} />
              </div>
              <div className="form-group supplier-form-wide">
                <label>Nhóm hàng / năng lực cung cấp</label>
                <input
                  value={form.categoriesText}
                  onChange={event => updateForm('categoriesText', event.target.value)}
                  placeholder="Ví dụ: decal giấy, mực in, gia công flexo"
                />
              </div>
              <div className="form-group supplier-form-wide">
                <label>Loại hình cung ứng</label>
                <div className="supplier-checkboxes">
                  {(['finished_good', 'raw_material', 'subcontract'] as SourcingType[]).map(type => (
                    <label key={type}>
                      <input
                        type="checkbox"
                        checked={form.serviceTypes.includes(type)}
                        onChange={() => toggleServiceType(type)}
                      />{' '}
                      {getSourcingTypeLabel(type)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Điều khoản thanh toán</label>
                <input value={form.paymentTerms} onChange={event => updateForm('paymentTerms', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Ngân hàng</label>
                <input value={form.bankName} onChange={event => updateForm('bankName', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Số tài khoản</label>
                <input value={form.bankAccount} onChange={event => updateForm('bankAccount', event.target.value)} />
              </div>
              <div className="form-group">
                <label>Mua hàng phụ trách</label>
                <select
                  value={form.assignedPurchaserId}
                  onChange={event => updateForm('assignedPurchaserId', event.target.value)}
                >
                  <option value="">Chưa phân công</option>
                  {purchasers.map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Đánh giá (0-5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.5"
                  value={form.rating}
                  onChange={event => updateForm('rating', Number(event.target.value))}
                />
              </div>
              <div className="form-group supplier-form-wide">
                <label>Ghi chú nội bộ</label>
                <textarea rows={3} value={form.note} onChange={event => updateForm('note', event.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary">
                Lưu nhà cung cấp
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="suppliers-page">
      <PageContextHeader section="Nhà cung cấp" current="Danh sách nhà cung cấp" />

      <section className="supplier-toolbar">
        <div className="purchase-search">
          <Search size={16} />
          <input
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Tìm NCC, MST, liên hệ, mặt hàng, mã đơn hàng hoặc đơn mua..."
          />
        </div>
        <DataFilterButton
          activeCount={supplierActiveFilterCount}
          open={showSupplierFilters}
          onClick={() => setShowSupplierFilters(true)}
        />
        {canEditColumns && (
          <button
            type="button"
            className="data-filter-button"
            onClick={() => setShowSupplierColumnCustomizer(true)}
            title="Tùy chỉnh cột"
            aria-label="Tùy chỉnh cột"
          >
            <Settings2 size={16} />
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={openCreateForm}>
          <Plus size={16} /> Thêm NCC
        </button>
      </section>

      <DataFilterChipBar
        chips={[
          ...categoryFilters.map(value => ({
            id: `category:${value}`,
            label: value,
            onRemove: () => setCategoryFilters(current => current.filter(item => item !== value))
          })),
          ...monthFilters.map(value => ({
            id: `month:${value}`,
            label: value,
            onRemove: () => setMonthFilters(current => current.filter(item => item !== value))
          }))
        ]}
        onClear={() => {
          setCategoryFilters([]);
          setMonthFilters([]);
        }}
      />

      <section className="purchase-panel supplier-list-panel">
        <div className="table-container erp-primary-data-table">
          <table className="supplier-table" data-resize-key="suppliers">
            <thead>
              <tr>
                <ReorderableTableCells
                  order={orderedSupplierColumnIds}
                  getHeaderProps={getSupplierHeaderProps}
                  labels={supplierColumnLabels}
                >
                  <th key="supplier">Nhà cung cấp</th>
                  {supplierVisibleColumnSet.has('contact') && <th key="contact">Liên hệ</th>}
                  {supplierVisibleColumnSet.has('categories') && <th key="categories">Nhóm hàng</th>}
                  {supplierVisibleColumnSet.has('orderCount') && <th key="orderCount">Số đơn</th>}
                  {supplierVisibleColumnSet.has('totalSpend') && <th key="totalSpend">Tổng mua</th>}
                  {supplierVisibleColumnSet.has('latestOrder') && <th key="latestOrder">Lần mua gần nhất</th>}
                  {supplierVisibleColumnSet.has('debt') && <th key="debt">Công nợ</th>}
                  {supplierVisibleColumnSet.has('rating') && <th key="rating">Đánh giá</th>}
                </ReorderableTableCells>
              </tr>
            </thead>
            <tbody>
              {supplierPagination.rows.map(supplier => {
                const orders = getSupplierOrders(supplier.id);
                const spend = orders.reduce((sum, order) => sum + asNumber(order.totalPrice), 0);
                return (
                  <tr key={supplier.id} onClick={() => setSelectedSupplierId(supplier.id)}>
                    <ReorderableTableCells order={orderedSupplierColumnIds} expandOverflowText={false}>
                      <td key="supplier">
                        <strong className="erp-company-name" title={supplier.supplierName}>
                          {supplier.supplierName}
                        </strong>
                        <span>{supplier.supplierCode || supplier.id}</span>
                      </td>
                      {supplierVisibleColumnSet.has('contact') && (
                        <td key="contact">
                          <strong>{supplier.contactPerson || '—'}</strong>
                          <span>{supplier.phone || supplier.email || '—'}</span>
                        </td>
                      )}
                      {supplierVisibleColumnSet.has('categories') && (
                        <td key="categories">{supplier.categories.join(', ') || '—'}</td>
                      )}
                      {supplierVisibleColumnSet.has('orderCount') && (
                        <td key="orderCount">
                          <strong>{orders.length}</strong>
                        </td>
                      )}
                      {supplierVisibleColumnSet.has('totalSpend') && (
                        <td key="totalSpend">
                          <strong>{spend.toLocaleString('vi-VN')} đ</strong>
                        </td>
                      )}
                      {supplierVisibleColumnSet.has('latestOrder') && (
                        <td key="latestOrder">{formatDate(asText(orders[0]?.createdAt), 'vi-VN', '—')}</td>
                      )}
                      {supplierVisibleColumnSet.has('debt') && (
                        <td key="debt">
                          <PartnerDebtValue row={finance.get('ap', supplier.id)} />
                        </td>
                      )}
                      {supplierVisibleColumnSet.has('rating') && (
                        <td key="rating">{supplier.rating ? `${supplier.rating}/5` : '—'}</td>
                      )}
                    </ReorderableTableCells>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DataTablePagination {...supplierPagination.paginationProps} />
      </section>
      <TableColumnCustomizer
        open={showSupplierColumnCustomizer}
        columns={SUPPLIER_LIST_COLUMNS}
        selectedIds={supplierVisibleColumns}
        onClose={() => setShowSupplierColumnCustomizer(false)}
        onSave={saveSupplierVisibleColumns}
      />
      <DataFilterPanel
        open={showSupplierFilters}
        title="Lọc danh sách nhà cung cấp"
        description="Lọc theo nhóm hàng và tháng phát sinh đơn mua."
        activeCount={supplierActiveFilterCount}
        onClose={() => setShowSupplierFilters(false)}
        onReset={() => {
          setCategoryFilters([]);
          setMonthFilters([]);
        }}
      >
        <DataFilterSection title="Nhóm hàng" selectedCount={categoryFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={categories.map(category => ({ value: category, label: category }))}
            selectedValues={categoryFilters}
            onChange={setCategoryFilters}
            searchable
          />
        </DataFilterSection>
        <DataFilterSection title="Tháng phát sinh đơn mua" selectedCount={monthFilters.length}>
          <DataFilterCheckboxGroup
            options={months.map(month => ({ value: month, label: month }))}
            selectedValues={monthFilters}
            onChange={setMonthFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>
      {showForm && renderSupplierForm()}
    </div>
  );
};
