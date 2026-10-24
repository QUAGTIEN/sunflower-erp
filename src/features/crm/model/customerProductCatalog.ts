import type { CustomerProductRecord, CustomerRecord } from './crmModels';
import type { UserProfile } from '@/shared/types';

export const CUSTOMER_PRODUCT_TYPES = [
  ['tem_trang_cuon', 'Tem trắng cuộn'],
  ['tem_mau_cuon', 'Tem màu cuộn'],
  ['tem_trang_to', 'Tem trắng tờ'],
  ['tem_mau_to', 'Tem màu tờ'],
  ['giay', 'Giấy'],
  ['muc_in', 'Mực in mã vạch'],
  ['may_in', 'Máy in mã vạch'],
  ['may_quet', 'Máy quét mã vạch'],
  ['hop', 'Hộp'],
  ['the_bai', 'Thẻ bài'],
  ['tem_det', 'Tem dệt'],
  ['tem_vai', 'Tem vải nylon / satin'],
  ['bang_dinh', 'Băng dính']
].map(([id, name]) => ({ id, name }));

export interface ProductSpecField {
  id: string;
  label: string;
  group: string;
  type: 'number' | 'text' | 'select' | 'checkboxes';
  required?: boolean;
  options?: string[];
  value: string | string[];
}
export interface ProductAttachment {
  id: string;
  name: string;
  url: string;
  kind: 'design' | 'direction';
  mimeType?: string;
}
export interface CustomerProductInput {
  productCode: string;
  productName: string;
  productType: string;
  unit: string;
  material: string;
  currentPrice: number;
  vatRate: number;
  purchasePrice: number;
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  note: string;
  fields: ProductSpecField[];
  files: ProductAttachment[];
}

export const normalizeProductCode = (code: unknown) =>
  String(code || '')
    .normalize('NFKC')
    .trim()
    .toLocaleUpperCase('vi-VN');
export const getActiveCustomerProducts = (customer?: Pick<CustomerRecord, 'products'> | null) =>
  (customer?.products || []).filter(product => product.deleted !== true);
export const getCustomerProductCodes = (product: CustomerProductRecord) =>
  [
    product.productCode,
    ...(Array.isArray(product.previousProductCodes)
      ? product.previousProductCodes.filter((code): code is string => typeof code === 'string')
      : [])
  ].map(normalizeProductCode);
export const hasCustomerProductCode = (products: CustomerProductRecord[], code: string, excludedId = '') =>
  products.some(
    product => product.id !== excludedId && getCustomerProductCodes(product).includes(normalizeProductCode(code))
  );
export const getCustomerProductVersion = (product: CustomerProductRecord) =>
  String(product.catalogRevision || product.updatedAt || product.createdAt || '0');

export function getCustomerProductOrderHistory(product: CustomerProductRecord, orders: Array<Record<string, unknown>>) {
  const codes = getCustomerProductCodes(product);
  let orderCount = 0;
  let totalQuantity = 0;
  let lastPoId = '';
  let lastPoCode = '';
  let latest = -1;
  for (const order of orders) {
    if (order.deleted === true) continue;
    const items = Array.isArray(order.items) ? (order.items as Array<Record<string, unknown>>) : [];
    const matching = items.filter(
      item =>
        item.customerProductId !== '' &&
        (item.customerProductId
          ? item.customerProductId === product.id
          : codes.includes(normalizeProductCode(item.productCode)))
    );
    if (!matching.length) continue;
    orderCount += 1;
    totalQuantity += matching.reduce(
      (sum, item) => sum + (Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0),
      0
    );
    const timestamp = Date.parse(String(order.orderDate || order.createdAt || '')) || 0;
    if (timestamp >= latest) {
      latest = timestamp;
      lastPoId = String(order.id || '');
      lastPoCode = String(order.poCode || '');
    }
  }
  return { orderCount, totalQuantity, lastPoId, lastPoCode };
}
export const canManageCustomerProducts = (
  user: Pick<UserProfile, 'uid' | 'role' | 'active'>,
  customer: Pick<CustomerRecord, 'assignedSaleId' | 'deleted'>
) =>
  user.active === true &&
  customer.deleted !== true &&
  (user.role === 'admin' || (user.role === 'sale' && customer.assignedSaleId === user.uid));

export const openCustomerProductAsset = (source: string) => {
  if (/^https?:\/\//i.test(source)) {
    window.open(source, '_blank', 'noopener,noreferrer');
    return;
  }
  const match = source.match(/^data:((?:image\/(?:jpeg|png|webp|gif)|application\/pdf));base64,(.+)$/i);
  if (!match) return;
  try {
    const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    /* Ignore corrupt legacy assets rather than navigating to an unsafe URL. */
  }
};

export function getProductSpecFields(type: string): ProductSpecField[] {
  const fields: ProductSpecField[] = [];
  const add = (
    id: string,
    label: string,
    group: string,
    kind: ProductSpecField['type'] = 'text',
    options?: string[],
    required = false
  ) => fields.push({ id, label, group, type: kind, options, required, value: kind === 'checkboxes' ? [] : '' });
  const roll = type === 'tem_trang_cuon' || type === 'tem_mau_cuon';
  const sheet = type === 'tem_trang_to' || type === 'tem_mau_to';
  if (roll || sheet || ['tem_det', 'tem_vai', 'the_bai', 'hop'].includes(type)) {
    add('width', 'Chiều rộng (mm)', 'Kích thước', 'number', undefined, true);
    add('height', 'Chiều dài (mm)', 'Kích thước', 'number', undefined, true);
  } else {
    add('size', type === 'muc_in' ? 'Khổ mực' : 'Quy cách / kích thước', 'Quy cách');
  }
  if (roll || sheet) {
    add(roll ? 'dieCut' : 'corner', 'Bo góc / kiểu góc', 'Gia công', 'select', [
      'R0.5',
      'R1',
      'R1.5',
      'R2',
      'R2.5',
      'R3',
      'R3.5',
      'Vuông góc'
    ]);
    add('perforated', 'Răng cưa', 'Gia công', 'select', ['Không răng cưa', 'Có răng cưa xé']);
    add('paperCode', 'Mã giấy / nguyên vật liệu', 'Vật liệu và keo');
    add('paperType', 'Loại giấy', 'Vật liệu và keo', 'select', [
      'Giấy thường',
      'PP',
      'PET',
      'Xi bạc',
      'Giấy đế đông',
      'Giấy nhám',
      'Giấy nhiệt',
      'PP nhiệt'
    ]);
    add('adhesive', 'Loại keo', 'Vật liệu và keo', 'select', [
      'Keo nước',
      'Keo remove',
      'Keo nóng',
      'Keo gốc dầu',
      'Khử keo',
      'Keo siêu dính'
    ]);
  }
  if (roll) {
    add('qtyPerRoll', 'Số tem / cuộn', 'Quy cách cuộn', 'number');
    add('metersPerRoll', 'Số mét / cuộn', 'Quy cách cuộn', 'number');
    add('coreType', 'Loại lõi', 'Quy cách cuộn', 'select', ['Lõi giấy', 'Lõi nhựa']);
    add('core', 'Kích thước lõi', 'Quy cách cuộn', 'select', ['25mm', '30mm', '42mm', '76mm']);
    add('gap', 'Khoảng cách tem (mm)', 'Quy cách cuộn', 'number');
    add('windDirection', 'Chiều tem ra', 'Quy cách cuộn', 'select', [
      'Ra đầu trước',
      'Ra đầu sau',
      'Chữ quay trái',
      'Chữ quay phải'
    ]);
  }
  if (sheet) {
    add('sheetType', 'Khổ tờ', 'Quy cách tờ', 'select', ['A4', 'A3', '310 × 450 mm', '330 × 480 mm', 'Khác']);
    add('qtyPerSheet', 'Số tem / tờ', 'Quy cách tờ', 'number');
    add('qtyPerPack', 'Số tem / bó', 'Quy cách tờ', 'number');
  }
  if (type === 'tem_mau_cuon' || type === 'tem_mau_to') {
    add('colors', 'Màu in', 'In và hoàn thiện');
    add('processing', 'Gia công sau in', 'In và hoàn thiện', 'checkboxes', [
      'Cán bóng',
      'Cán mờ',
      'Phủ UV',
      'Ép kim',
      'Bế demi',
      'Bế đứt'
    ]);
  }
  if (type === 'muc_in') {
    add('ribbonType', 'Loại mực', 'Quy cách', 'select', ['WAX', 'WAX PREMIUM', 'WAX RESIN', 'RESIN']);
    add('direction', 'Chiều quấn', 'Quy cách', 'select', ['Out side', 'In side']);
    add('color', 'Màu mực', 'Quy cách');
  }
  if (!roll && !sheet && type !== 'muc_in') add('description', 'Thông số kỹ thuật', 'Quy cách');
  return fields;
}

export const getCustomerProductSize = (product: Pick<CustomerProductRecord, 'size' | 'specifications'>) => {
  const specs = product.specifications || {};
  return specs.width && specs.height ? `${specs.width} × ${specs.height} mm` : String(specs.size || product.size || '');
};

export function findCustomerProductForOrderItem(item: Record<string, unknown>, products: CustomerProductRecord[]) {
  // An explicit empty ID identifies a manually entered row, even if its code matches the catalog.
  if (item.customerProductId === '') return undefined;
  if (item.customerProductId) return products.find(product => product.id === item.customerProductId);
  const code = normalizeProductCode(item.productCode);
  return code ? products.find(product => getCustomerProductCodes(product).includes(code)) : undefined;
}

export function getCustomerProductSpecSummary(specifications: Record<string, unknown>, productType: string) {
  const fields = Array.isArray(specifications.fields)
    ? (specifications.fields as ProductSpecField[])
    : getProductSpecFields(productType);
  return fields.flatMap(field => {
    if (!field || !field.id || (field.type as string) === 'file') return [];
    const value = specifications[field.id] ?? field.value;
    const text = Array.isArray(value)
      ? value.filter(item => typeof item === 'string' || typeof item === 'number').join(', ')
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
    return text.trim() ? [{ id: field.id, label: field.label, value: text }] : [];
  });
}

export function buildCustomerProduct(input: CustomerProductInput, id: string, now: string): CustomerProductRecord {
  if (!input.productCode.trim() || !input.productName.trim() || !input.productType || !input.unit.trim()) {
    throw new Error('Vui lòng nhập mã, tên, loại sản phẩm và đơn vị tính.');
  }
  if (input.productCode.trim().length > 100 || input.productName.trim().length > 250)
    throw new Error('Mã hoặc tên sản phẩm quá dài.');
  for (const value of [input.currentPrice, input.purchasePrice, input.vatRate, input.leadTimeDays]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Giá và các giá trị số phải hợp lệ, không được âm.');
  }
  if (input.vatRate > 100) throw new Error('VAT không được vượt quá 100%.');
  for (const field of getProductSpecFields(input.productType).filter(field => field.required)) {
    const value = input.fields.find(candidate => candidate.id === field.id)?.value;
    if (!value || !Number.isFinite(Number(value)) || Number(value) <= 0)
      throw new Error(`${field.label} phải lớn hơn 0.`);
  }
  const specifications: Record<string, unknown> = {
    fields: input.fields.map(field => ({ ...field, options: field.options || [] }))
  };
  for (const field of input.fields) {
    if (field.type === 'number') {
      if (field.required && (!field.value || Number(field.value) <= 0))
        throw new Error(`${field.label} phải lớn hơn 0.`);
      if (field.value && (!Number.isFinite(Number(field.value)) || Number(field.value) < 0))
        throw new Error(`${field.label} không hợp lệ.`);
      specifications[field.id] = field.value === '' ? '' : Number(field.value);
    } else specifications[field.id] = field.value;
  }
  specifications.windingCore = specifications.core || '';
  specifications.windDirectionFiles = input.files.filter(file => file.kind === 'direction');
  const layoutUrl =
    input.files.find(file => file.kind === 'design' && (file.mimeType || '').startsWith('image/'))?.url || '';
  return {
    id,
    productCode: input.productCode.trim(),
    productName: input.productName.trim(),
    productType: input.productType,
    size: getCustomerProductSize({ size: '', specifications }),
    material: input.material.trim(),
    unit: input.unit.trim(),
    currentPrice: input.currentPrice,
    salePrice: input.currentPrice,
    vatRate: input.vatRate,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    purchasePrice: input.purchasePrice,
    discountType: 'percent',
    discountRate: 0,
    discountAmount: 0,
    leadTimeDays: input.leadTimeDays,
    note: input.note.trim(),
    layoutUrl,
    specifications,
    files: input.files,
    designLayouts: [],
    priceHistory: input.currentPrice > 0 ? [{ date: now.slice(0, 10), price: input.currentPrice }] : [],
    createdAt: now,
    catalogRevision: 1
  };
}

export function appendCustomerProduct(customer: CustomerRecord, product: CustomerProductRecord, user: UserProfile) {
  if (!canManageCustomerProducts(user, customer))
    throw new Error('Bạn không có quyền tạo sản phẩm cho khách hàng này.');
  // Retired codes remain reserved so their historical POs never point at a different product.
  if (hasCustomerProductCode(customer.products || [], product.productCode)) {
    throw new Error(`Mã sản phẩm ${product.productCode} đã tồn tại trong hồ sơ khách hàng.`);
  }
  const products = [...(customer.products || []), product];
  validateCatalogSize(customer, products);
  return products;
}

function validateCatalogSize(customer: CustomerRecord, products: CustomerProductRecord[]) {
  if (new TextEncoder().encode(JSON.stringify({ ...customer, products })).length > 900_000) {
    throw new Error('Hồ sơ vượt dung lượng lưu trữ. Vui lòng dùng đường dẫn Drive/OneDrive cho tệp thiết kế.');
  }
}

export function replaceCustomerProduct(
  customer: CustomerRecord,
  product: CustomerProductRecord,
  user: UserProfile,
  expectedVersion = ''
) {
  if (user.role !== 'admin' || !canManageCustomerProducts(user, customer))
    throw new Error('Chỉ Admin được duyệt chỉnh sửa sản phẩm.');
  const existing = customer.products.find(record => record.id === product.id && !record.deleted);
  if (!existing) throw new Error('Không tìm thấy mã sản phẩm đang sử dụng.');
  if (expectedVersion && getCustomerProductVersion(existing) !== expectedVersion) {
    throw new Error('Sản phẩm đã được thay đổi bởi người khác. Vui lòng mở lại hồ sơ trước khi lưu.');
  }
  if (hasCustomerProductCode(customer.products, product.productCode, product.id))
    throw new Error('Mã sản phẩm đã tồn tại trong hồ sơ khách hàng.');
  const specifications = { ...product.specifications };
  if (Array.isArray(specifications.fields))
    specifications.fields = specifications.fields.map(field => {
      if (!field || typeof field !== 'object') return field;
      const record = field as Record<string, unknown>;
      return typeof record.id === 'string' && specifications[record.id] !== undefined
        ? { ...record, value: specifications[record.id] }
        : record;
    });
  const next = {
    ...existing,
    ...product,
    specifications,
    size: getCustomerProductSize({ ...product, specifications }),
    catalogRevision: Number(existing.catalogRevision || 0) + 1,
    previousProductCodes: Array.from(
      new Set([
        ...(Array.isArray(existing.previousProductCodes) ? existing.previousProductCodes : []),
        ...(Array.isArray(product.previousProductCodes) ? product.previousProductCodes : []),
        ...(normalizeProductCode(existing.productCode) !== normalizeProductCode(product.productCode)
          ? [existing.productCode]
          : [])
      ])
    )
  };
  const products = customer.products.map(record => (record.id === next.id ? next : record));
  validateCatalogSize(customer, products);
  return products;
}

/** Snapshot technical data into a PO; later catalog edits cannot mutate that order. */
export function applyCustomerProductToOrderItem(item: Record<string, unknown>, product: CustomerProductRecord) {
  return {
    ...item,
    customerProductId: product.id,
    productCode: product.productCode,
    productName: product.productName,
    customerProductVersion: getCustomerProductVersion(product),
    productType: product.productType,
    size: getCustomerProductSize(product),
    material: product.material || '',
    unit: product.unit || 'cái',
    price: Number(product.currentPrice || 0),
    vatRate: Number(product.vatRate ?? 8),
    supplierId: product.supplierId || '',
    supplierName: product.supplierName || '',
    purchasePrice: Number(product.purchasePrice || 0),
    workType:
      product.workType ||
      (['muc_in', 'giay', 'may_in', 'may_quet'].includes(product.productType) ? 'mua_nvl' : 'gia_cong'),
    previewImages: structuredClone(
      product.previewImages ||
        (product.layoutUrl ? [product.layoutUrl] : product.previewImage ? [product.previewImage] : [])
    ),
    specifications: structuredClone(product.specifications || {}),
    productFiles: structuredClone(product.files || []),
    productNote: product.note || '',
    leadTimeDays: Number(product.leadTimeDays || 0)
  };
}

/** Refresh catalog-owned fields without overwriting this order's commercial inputs. */
export function refreshCustomerProductOrderItem(item: Record<string, unknown>, product: CustomerProductRecord) {
  const snapshot = applyCustomerProductToOrderItem(item, product);
  return {
    ...snapshot,
    price: item.price ?? snapshot.price,
    vatRate: item.vatRate ?? snapshot.vatRate,
    previewImages: [
      ...new Set(
        [
          ...(Array.isArray(snapshot.previewImages) ? snapshot.previewImages : []),
          ...(Array.isArray(item.previewImages) ? item.previewImages : [])
        ].filter((value): value is string => typeof value === 'string' && Boolean(value))
      )
    ]
  };
}

export function normalizeManualOrderItem(item: Record<string, unknown>, index: number) {
  const productName = String(item.productName || '').trim();
  const unit = String(item.unit || '').trim();
  const quantity = Number(item.quantity);
  const price = Number(item.price ?? item.unitPrice ?? 0);
  const vatRate = Number(item.vatRate ?? 8);
  if (!productName) throw new Error(`Dòng ${index + 1}: Vui lòng nhập tên hàng.`);
  if (!unit) throw new Error(`Dòng ${index + 1}: Vui lòng nhập đơn vị tính.`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Dòng ${index + 1}: Số lượng phải lớn hơn 0.`);
  if (!Number.isFinite(price) || price < 0) throw new Error(`Dòng ${index + 1}: Đơn giá không hợp lệ.`);
  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100)
    throw new Error(`Dòng ${index + 1}: Thuế phải từ 0 đến 100%.`);
  return {
    ...item,
    customerProductId: '',
    customerProductVersion: '',
    productCode: String(item.productCode || '').trim(),
    productName,
    unit,
    quantity,
    price,
    vatRate
  };
}

export function synchronizeCustomerProductOrderItems(items: Record<string, unknown>[], customer: CustomerRecord) {
  if (customer.deleted === true) throw new Error('Khách hàng không còn hoạt động.');
  const products = getActiveCustomerProducts(customer);
  if (!items.length) throw new Error('Vui lòng thêm ít nhất một mặt hàng.');
  return items.map((item, index) => {
    const product = findCustomerProductForOrderItem(item, products);
    if (product) return refreshCustomerProductOrderItem(item, product);
    if (item.customerProductId)
      throw new Error(`Dòng ${index + 1}: Mã sản phẩm không còn hợp lệ trong danh mục khách hàng. Vui lòng chọn lại.`);
    return normalizeManualOrderItem(item, index);
  });
}
