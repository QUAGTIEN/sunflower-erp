import type { CustomerContactRole, CustomerRecord } from './crmModels';

export const CONTACT_ROLE_LABELS: Record<CustomerContactRole, string> = {
  primary: 'Liên hệ chính',
  procurement: 'Mua hàng',
  warehouse: 'Kho / nhận hàng',
  accounting: 'Kế toán',
  other: 'Khác'
};

/** Maps a contract document type to the repository folder that stores it. */
export const DOCUMENT_REPOSITORY_FOLDER_IDS: Record<string, string> = {
  contract: 'contracts',
  acceptance: 'minutes',
  qc: 'technical',
  qa: 'technical',
  artwork: 'technical',
  other: 'other'
};

export type CrmListFilter = 'overview' | 'all';
export type CrmTimeFilter = 'last_30_days' | 'last_90_days' | 'this_year' | 'no_orders';

export interface CrmFilterOption {
  value: string;
  label: string;
}

export const UNASSIGNED_FILTER_VALUE = '__unassigned__';

/** Accent- and case-insensitive key for comparing Vietnamese filter values. */
export const normalizeFilterValue = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLocaleLowerCase('vi-VN');

/** Product assets were stored as plain strings or as objects with base64/data/url. */
export const getProductAssetSource = (asset: unknown): string => {
  if (typeof asset === 'string') return asset;
  if (!asset || typeof asset !== 'object') return '';
  const record = asset as Record<string, unknown>;
  return String(record.base64 || record.data || record.url || '');
};

/** Tab-separated profile text that pastes cleanly into spreadsheets and chat. */
export const createCopyableProfile = (title: string, rows: Array<[string, unknown]>) =>
  [title, ...rows.map(([label, value]) => `${label}\t${String(value || '—')}`)].join('\n');

export const createNextCustomerCode = (customers: CustomerRecord[]) => {
  const usedCodes = new Set(customers.map(customer => customer.customerCode).filter(Boolean));
  let sequence = customers.length + 1;
  let candidate = `KH-${String(sequence).padStart(4, '0')}`;
  while (usedCodes.has(candidate)) {
    sequence += 1;
    candidate = `KH-${String(sequence).padStart(4, '0')}`;
  }
  return candidate;
};

export type ProductSpecFieldType = 'text' | 'number' | 'select' | 'checkboxes' | 'file';

export interface ProductSpecField {
  id: string;
  label: string;
  value: unknown;
  type: ProductSpecFieldType;
  options?: string[];
}

interface StoredProductSpecifications {
  fields?: ProductSpecField[];
  custom?: Array<{ key: string; value: unknown }>;
  [key: string]: unknown;
}

const selectField = (id: string, label: string, value: unknown, options: string[]): ProductSpecField => ({
  id,
  label,
  value,
  type: 'select',
  options
});

const CORNER_OPTIONS = ['Bo góc R2', 'Bo góc R3', 'Bo góc R5', 'Vuông góc'];

/**
 * Builds the editable spec fields for a product. Products saved with `fields` keep them as is;
 * older products only stored flat values per product type, so defaults are filled in here.
 */
export const loadSpecsToFields = (
  productType: string,
  specifications: StoredProductSpecifications | null | undefined = {}
): ProductSpecField[] => {
  const specs = specifications || {};
  if (specs.fields && Array.isArray(specs.fields)) {
    return specs.fields;
  }

  const fields: ProductSpecField[] = [];
  if (productType === 'muc_in') {
    fields.push(
      selectField('ribbonType', 'Loại mực', specs.ribbonType || 'WAX PREMIUM', ['WAX PREMIUM', 'WAX RESIN', 'RESIN'])
    );
    fields.push(selectField('direction', 'Chiều quấn', specs.direction || 'Out side', ['Out side', 'In side']));
    fields.push({ id: 'size', label: 'Khổ mực', value: specs.size || '110mm x 300m', type: 'text' });
    fields.push({ id: 'color', label: 'Màu mực', value: specs.color || 'Đen', type: 'text' });
  } else if (productType === 'tem_trang_cuon' || productType === 'tem_mau_cuon') {
    fields.push({ id: 'width', label: 'Rộng tem (mm)', value: specs.width || 80, type: 'number' });
    fields.push({ id: 'height', label: 'Cao tem (mm)', value: specs.height || 55, type: 'number' });
    fields.push({ id: 'gap', label: 'Bước răng/Gap', value: specs.gap || 3, type: 'number' });
    fields.push({ id: 'qtyPerRoll', label: 'Số tem/cuộn', value: specs.qtyPerRoll || 1000, type: 'number' });
    fields.push(
      selectField('core', 'Cỡ lõi cuộn', specs.core || specs.windingCore || '76mm', [
        '76mm',
        '42mm',
        '29mm',
        '40mm',
        '25mm'
      ])
    );
    fields.push(selectField('dieCut', 'Kiểu bế góc', specs.dieCut || 'Bo góc R2', CORNER_OPTIONS));
    fields.push(
      selectField('perforated', 'Răng cưa xé', specs.perforated || 'Không răng cưa', [
        'Không răng cưa',
        'Có răng cưa xé'
      ])
    );
    fields.push(
      selectField('windDirection', 'Hướng tem ra', specs.windDirection || 'Ra đầu trước', [
        'Ra đầu trước',
        'Ra đầu sau',
        'Chữ quay trái',
        'Chữ quay phải',
        'Head First',
        'Tail First',
        'Left First',
        'Right First'
      ])
    );
    fields.push({
      id: 'windDirectionFiles',
      label: 'Tải Lên Ảnh/File Hướng Tem Ra',
      value: specs.windDirectionFiles || [],
      type: 'file'
    });

    if (productType === 'tem_mau_cuon') {
      fields.push({ id: 'colors', label: 'Số màu in / Diễn giải màu', value: specs.colors || '4 màu', type: 'text' });
      fields.push({
        id: 'processing',
        label: 'Quy cách gia công',
        value: specs.processing || [],
        type: 'checkboxes',
        options: ['Cán bóng', 'Cán mờ', 'Phủ UV', 'Ép kim', 'Bế demi', 'Bế đứt']
      });
    }
  } else if (productType === 'tem_mau_to') {
    fields.push({ id: 'width', label: 'Chiều Rộng (mm)', value: specs.width || 80, type: 'number' });
    fields.push({ id: 'height', label: 'Chiều Cao/Dài (mm)', value: specs.height || 55, type: 'number' });
    fields.push(selectField('corner', 'Góc tem tờ', specs.corner || 'Bo góc R2', CORNER_OPTIONS));
    fields.push(
      selectField('lamination', 'Cán màng bảo vệ', specs.lamination || 'Không cán', ['Không cán', 'Cán bóng', 'Cán mờ'])
    );
    fields.push(
      selectField('finished', 'Thành phẩm sau in', specs.finished || 'Bế demi', [
        'Bế demi',
        'Bế đứt',
        'Xén thành phẩm',
        'Giao nguyên tờ'
      ])
    );
    fields.push(
      selectField('sheetType', 'Quy cách khổ tờ', specs.sheetType || 'A4', ['A4', 'A3', '310 x 450', '330 x 480'])
    );
  }

  if (specs.custom && Array.isArray(specs.custom)) {
    specs.custom.forEach((customRow, index) => {
      fields.push({ id: `custom_${index}_${Date.now()}`, label: customRow.key, value: customRow.value, type: 'text' });
    });
  }

  return fields;
};

/** Form values for adding a contract to a customer. */
export interface CustomerContractDraft {
  contractNo: string;
  signDate: string;
  expiryDate: string;
  value: number;
  fileUrl: string;
}

export const EMPTY_CONTRACT_DRAFT: CustomerContractDraft = {
  contractNo: '',
  signDate: '',
  expiryDate: '',
  value: 0,
  fileUrl: ''
};

/** Tabs of the customer detail workspace. */
export type CustomerHistoryTab = 'overview' | 'po' | 'products' | 'notes' | 'files';

/** One file, contract or document shown in the repository preview of the overview tab. */
export interface RepositoryPreviewItem {
  id: string;
  name: string;
  folderId: string;
  date: string;
  source: string;
}
