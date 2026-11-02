import { showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CircleDot,
  Droplets,
  FileText,
  Layers,
  Paperclip,
  Ruler,
  Save,
  Settings2,
  Square,
  Upload,
  type LucideIcon
} from 'lucide-react';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import type { UserProfile } from '@/shared/types';
import type { CustomerProductRecord, CustomerRecord } from '../model/crmModels';
import {
  canManageCustomerProducts,
  CUSTOMER_PRODUCT_TYPES,
  getProductSpecFields,
  openCustomerProductAsset,
  type CustomerProductInput,
  type ProductAttachment,
  type ProductSpecField
} from '../model/customerProductCatalog';
import { createCustomerProduct } from '../api/customerProductService';
import './CustomerProductEditor.css';

interface Props {
  customer: CustomerRecord;
  currentUser: UserProfile;
  classifications: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; supplierName: string; deleted?: boolean }>;
  onClose: () => void;
  onCreated: (products: CustomerProductRecord[], product: CustomerProductRecord) => void;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  size: Ruler,
  corner: Square,
  format: Layers,
  core: CircleDot,
  processing: Settings2,
  paper: Layers,
  adhesive: Droplets,
  printing: FileText
};

const readFileData = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không thể đọc tệp.'));
    reader.readAsDataURL(file);
  });
const readProductAsset = async (file: File) => {
  if (file.size > 900_000) throw new Error('Tệp lớn hơn 900 KB. Vui lòng dùng đường dẫn Drive/OneDrive.');
  const data = await readFileData(file);
  if (!file.type.startsWith('image/')) return data;
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, 800 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Không thể xử lý ảnh.'));
          return;
        }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        reject(new Error('Không thể xử lý ảnh.'));
      }
    };
    image.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
    image.src = data;
  });
};

export function CustomerProductEditor({
  customer,
  currentUser,
  classifications,
  suppliers,
  onClose,
  onCreated
}: Props) {
  const [draft, setDraft] = useState<CustomerProductInput>({
    productCode: '',
    productName: '',
    productType: 'tem_trang_cuon',
    unit: 'cái',
    material: '',
    currentPrice: 0,
    vatRate: 8,
    purchasePrice: 0,
    supplierId: '',
    supplierName: '',
    leadTimeDays: 0,
    note: '',
    fields: getProductSpecFields('tem_trang_cuon'),
    files: []
  });
  const [initialDraft] = useState(() => JSON.stringify(draft));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const dirty = JSON.stringify(draft) !== initialDraft || Boolean(linkName || linkUrl);
  const types = [
    ...new Map(
      [...CUSTOMER_PRODUCT_TYPES, ...classifications.filter(type => type.id && type.name)].map(type => [type.id, type])
    ).values()
  ];
  const isRoll = draft.productType === 'tem_trang_cuon' || draft.productType === 'tem_mau_cuon';
  const isLabel = isRoll || draft.productType === 'tem_trang_to' || draft.productType === 'tem_mau_to';
  // Presentation groups retain the field IDs, options and values used by existing POs.
  const labelGroups = [
    { key: 'size', title: 'Kích thước', ids: ['width', 'height', 'gap'] },
    { key: 'corner', title: 'Bo góc / kiểu góc', ids: ['dieCut', 'corner'] },
    {
      key: 'format',
      title: isRoll ? 'Quy cách cuộn' : 'Quy cách tờ',
      ids: ['qtyPerRoll', 'metersPerRoll', 'windDirection', 'sheetType', 'qtyPerSheet', 'qtyPerPack']
    },
    { key: 'core', title: 'Lõi cuộn', ids: ['coreType', 'core'] },
    { key: 'processing', title: 'Gia công', ids: ['perforated'] },
    { key: 'paper', title: 'Giấy / nguyên vật liệu', ids: ['paperCode', 'paperType'] },
    { key: 'adhesive', title: 'Loại keo', ids: ['adhesive'] },
    { key: 'printing', title: 'In và hoàn thiện', ids: ['colors', 'processing'] }
  ];
  const groups = isLabel
    ? labelGroups
        .map(group => ({ ...group, fields: draft.fields.filter(field => group.ids.includes(field.id)) }))
        .filter(group => group.fields.length)
    : [...new Set(draft.fields.map(field => field.group))].map((group, index) => ({
        key: `general-${index}`,
        title: group,
        fields: draft.fields.filter(field => field.group === group)
      }));
  const permitted = canManageCustomerProducts(currentUser, customer);

  useEffect(() => {
    const handleLeave = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleLeave);
    return () => window.removeEventListener('beforeunload', handleLeave);
  }, [dirty]);

  const patch = (values: Partial<CustomerProductInput>) => {
    setDraft(previous => ({ ...previous, ...values }));
    setError('');
  };
  const close = () => {
    if (isSaving || isUploading) return;
    if (!dirty || window.confirm('Thông tin sản phẩm chưa được lưu. Bạn có muốn rời trang?')) onClose();
  };
  const updateSpec = (id: string, value: ProductSpecField['value']) =>
    setDraft(previous => ({
      ...previous,
      fields: previous.fields.map(field => (field.id === id ? { ...field, value } : field))
    }));
  const upload = async (event: ChangeEvent<HTMLInputElement>, kind: ProductAttachment['kind']) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setIsUploading(true);
    setError('');
    try {
      const attachments = await Promise.all(
        files.map(async file => ({
          id: crypto.randomUUID(),
          name: file.name,
          url: await readProductAsset(file),
          kind,
          mimeType: file.type.startsWith('image/') ? 'image/jpeg' : file.type
        }))
      );
      setDraft(previous => ({ ...previous, files: [...previous.files, ...attachments] }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không thể đọc tệp.');
    } finally {
      setIsUploading(false);
    }
  };
  const addLink = () => {
    try {
      const url = new URL(linkUrl.trim());
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      patch({
        files: [
          ...draft.files,
          { id: crypto.randomUUID(), name: linkName.trim() || url.hostname, url: url.href, kind: 'design' }
        ]
      });
      setLinkName('');
      setLinkUrl('');
    } catch {
      setError('Vui lòng nhập đường dẫn http/https hợp lệ.');
    }
  };
  const submit = async (event: FormEvent) => {
    return runMutationAction(
      'CustomerProductEditor.tsx:submit',
      async () => {
        event.preventDefault();
        if (isSaving || isUploading || !permitted) return;
        if (linkName || linkUrl) {
          setError('Hãy thêm hoặc xóa đường dẫn đang nhập trước khi lưu.');
          return;
        }
        setIsSaving(true);
        setError('');
        try {
          const result = await createCustomerProduct(customer.id, draft, currentUser);
          onCreated(result.products, result.product);

          showSuccessToast('Đã thêm thành công');
        } catch (failure) {
          showErrorToast();
          setError(
            failure instanceof Error && !('code' in failure)
              ? failure.message
              : 'Không thể lưu mã sản phẩm. Vui lòng kiểm tra quyền truy cập và kết nối rồi thử lại.'
          );
        } finally {
          setIsSaving(false);
        }
      },
      event
    );
  };

  const renderSpec = (field: ProductSpecField) => {
    const value = typeof field.value === 'string' ? field.value : '';
    if (field.type === 'select')
      return (
        <fieldset
          className={`customer-product-editor__field customer-product-editor__option-field customer-product-editor__option-field--${field.id}`}
          key={field.id}
        >
          <legend>
            {field.label}
            {field.required ? ' *' : ''}
          </legend>
          <div className="customer-product-editor__choices">
            {field.options?.map(option => (
              <label key={option} className={value === option ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name={`product-spec-${field.id}`}
                  value={option}
                  checked={value === option}
                  required={field.required}
                  onChange={() => updateSpec(field.id, option)}
                />
                <span>{option}</span>
              </label>
            ))}
            {value && !field.required && (
              <button
                type="button"
                className="customer-product-editor__clear"
                onClick={() => updateSpec(field.id, '')}
                aria-label={`Bỏ chọn: ${field.label}`}
              >
                Bỏ chọn
              </button>
            )}
          </div>
        </fieldset>
      );
    if (field.type === 'checkboxes')
      return (
        <div className={`customer-product-editor__field customer-product-editor__field--${field.id}`} key={field.id}>
          <span>{field.label}</span>
          <div className="customer-product-editor__choices">
            {field.options?.map(option => (
              <label
                key={option}
                className={Array.isArray(field.value) && field.value.includes(option) ? 'is-selected' : ''}
              >
                <input
                  type="checkbox"
                  checked={Array.isArray(field.value) && field.value.includes(option)}
                  onChange={event => {
                    const values = Array.isArray(field.value) ? field.value : [];
                    updateSpec(
                      field.id,
                      event.target.checked ? [...values, option] : values.filter(item => item !== option)
                    );
                  }}
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      );
    return (
      <label className={`customer-product-editor__field customer-product-editor__field--${field.id}`} key={field.id}>
        <span>
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        <input
          type={field.type}
          value={value}
          min={field.required ? 0.01 : 0}
          step="any"
          required={field.required}
          onChange={event => updateSpec(field.id, event.target.value)}
        />
      </label>
    );
  };

  return (
    <div className="customer-product-editor">
      <PageContextHeader section="Khách hàng" current="Tạo mã sản phẩm" />
      <header className="card customer-product-editor__header">
        <PageBackButton onClick={close} />
        <div>
          <h1>Tạo mã sản phẩm</h1>
          <span>
            {customer.companyName} · {customer.customerCode}
          </span>
        </div>
      </header>
      {!permitted ? (
        <div role="alert">Bạn không có quyền tạo sản phẩm cho khách hàng này.</div>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={isSaving || isUploading} className="customer-product-editor__body">
            <section className="card customer-product-editor__section customer-product-editor__general-section">
              <h2>
                <FileText aria-hidden="true" />
                Thông tin chung
              </h2>
              <div className="customer-product-editor__grid customer-product-editor__general">
                <label>
                  <span>Mã sản phẩm *</span>
                  <input
                    autoFocus
                    maxLength={100}
                    required
                    value={draft.productCode}
                    onChange={event => patch({ productCode: event.target.value })}
                  />
                </label>
                <label>
                  <span>Tên sản phẩm *</span>
                  <input
                    maxLength={250}
                    required
                    value={draft.productName}
                    onChange={event => patch({ productName: event.target.value })}
                  />
                </label>
                <label>
                  <span>Loại sản phẩm *</span>
                  <select
                    value={draft.productType}
                    onChange={event => {
                      const next = event.target.value;
                      if (
                        draft.fields.some(field =>
                          Array.isArray(field.value) ? field.value.length > 0 : Boolean(field.value)
                        ) &&
                        !window.confirm('Đổi loại sản phẩm sẽ xóa các thông số đang nhập. Bạn có muốn tiếp tục?')
                      )
                        return;
                      patch({ productType: next, fields: getProductSpecFields(next) });
                    }}
                  >
                    {types.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Đơn vị tính *</span>
                  <input
                    required
                    maxLength={40}
                    value={draft.unit}
                    onChange={event => patch({ unit: event.target.value })}
                  />
                </label>
                {!isLabel && (
                  <label className="customer-product-editor__wide">
                    <span>Chất liệu</span>
                    <input
                      maxLength={250}
                      value={draft.material}
                      onChange={event => patch({ material: event.target.value })}
                    />
                  </label>
                )}
              </div>
            </section>
            <div
              aria-label="Thông số kỹ thuật"
              className={`customer-product-editor__spec-groups ${isLabel ? (isRoll ? 'is-label is-roll' : 'is-label is-sheet') : ''}`}
            >
              {groups.map((group, index) => {
                const Icon = GROUP_ICONS[group.key] || FileText;
                return (
                  <section
                    key={group.key}
                    className={`customer-product-editor__spec-group customer-product-editor__spec-group--${group.key}`}
                  >
                    <h3>
                      <Icon aria-hidden="true" />
                      <span>
                        {index + 1}. {group.title}
                      </span>
                    </h3>
                    <div className="customer-product-editor__grid">
                      {group.key === 'paper' ? (
                        <>
                          {group.fields.filter(field => field.id !== 'paperType').map(renderSpec)}
                          <label>
                            <span>Chất liệu</span>
                            <input
                              maxLength={250}
                              value={draft.material}
                              onChange={event => patch({ material: event.target.value })}
                            />
                          </label>
                          {group.fields.filter(field => field.id === 'paperType').map(renderSpec)}
                        </>
                      ) : (
                        group.fields.map(renderSpec)
                      )}
                    </div>
                  </section>
                );
              })}
              <section className="customer-product-editor__spec-group customer-product-editor__spec-group--attachments">
                <h3>
                  <Paperclip aria-hidden="true" />
                  <span>{groups.length + 1}. Tệp đính kèm và ghi chú</span>
                </h3>
                <div className="customer-product-editor__grid customer-product-editor__attachments">
                  <label>
                    <span>File thiết kế</span>
                    <span className="customer-product-editor__upload">
                      <input
                        aria-label="Chọn tệp thiết kế"
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        onChange={event => void upload(event, 'design')}
                      />
                      <Upload aria-hidden="true" />
                      <span>Chọn tệp</span>
                    </span>
                  </label>
                  <label>
                    <span>Ảnh chiều tem ra</span>
                    <span className="customer-product-editor__upload">
                      <input
                        aria-label="Chọn ảnh chiều tem ra"
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={event => void upload(event, 'direction')}
                      />
                      <Upload aria-hidden="true" />
                      <span>Chọn ảnh</span>
                    </span>
                  </label>
                  <label className="customer-product-editor__wide">
                    <span>Ghi chú</span>
                    <textarea
                      maxLength={2000}
                      rows={2}
                      value={draft.note}
                      onChange={event => patch({ note: event.target.value })}
                    />
                  </label>
                  <details className="customer-product-editor__links customer-product-editor__wide">
                    <summary>Thêm đường dẫn</summary>
                    <div className="customer-product-editor__grid">
                      <label>
                        <span>Tên tệp liên kết</span>
                        <input value={linkName} onChange={event => setLinkName(event.target.value)} />
                      </label>
                      <label>
                        <span>Đường dẫn Drive / OneDrive</span>
                        <input type="url" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} />
                      </label>
                      <button type="button" className="btn btn-outline" onClick={addLink} disabled={!linkUrl.trim()}>
                        Thêm đường dẫn
                      </button>
                    </div>
                  </details>
                  {draft.files.length > 0 && (
                    <ul className="customer-product-editor__assets customer-product-editor__wide">
                      {draft.files.map(file => (
                        <li key={file.id}>
                          {file.mimeType?.startsWith('image/') && <img src={file.url} alt={file.name} />}
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={file.name}
                            onClick={event => {
                              event.preventDefault();
                              openCustomerProductAsset(file.url);
                            }}
                          >
                            {file.name}
                          </a>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => patch({ files: draft.files.filter(item => item.id !== file.id) })}
                          >
                            Xóa
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
            <details className="card customer-product-editor__section">
              <summary>Giá và nhà cung cấp</summary>
              <div className="customer-product-editor__grid">
                <label>
                  <span>Giá bán tham khảo (đ)</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.currentPrice || ''}
                    onChange={event => patch({ currentPrice: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>VAT (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={draft.vatRate}
                    onChange={event => patch({ vatRate: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Nhà cung cấp</span>
                  <select
                    value={draft.supplierId}
                    onChange={event =>
                      patch({
                        supplierId: event.target.value,
                        supplierName: suppliers.find(supplier => supplier.id === event.target.value)?.supplierName || ''
                      })
                    }
                  >
                    <option value="">Chưa chọn</option>
                    {suppliers
                      .filter(supplier => !supplier.deleted)
                      .map(supplier => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.supplierName}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Giá mua tham khảo (đ)</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.purchasePrice || ''}
                    onChange={event => patch({ purchasePrice: Number(event.target.value) })}
                  />
                </label>
                <label>
                  <span>Thời gian chuẩn bị (ngày)</span>
                  <input
                    type="number"
                    min={0}
                    value={draft.leadTimeDays || ''}
                    onChange={event => patch({ leadTimeDays: Number(event.target.value) })}
                  />
                </label>
              </div>
            </details>
          </fieldset>
          <footer className="customer-product-editor__footer">
            <span role={error ? 'alert' : 'status'} className={error ? 'customer-product-editor__error' : ''}>
              {error || (isUploading ? 'Đang xử lý tệp...' : '')}
            </span>
            <button type="button" className="btn btn-outline" disabled={isSaving || isUploading} onClick={close}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving || isUploading}>
              <Save aria-hidden="true" />
              {isSaving ? 'Đang lưu...' : 'Lưu mã sản phẩm'}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}
