/** Shared, side-effect-free rules of the recycle bin; the admin API applies the same checks before writing. */
export const RECYCLE_COLLECTIONS = [
  'customers',
  'leads',
  'pos',
  'suppliers',
  'purchase_orders',
  'production_commands',
  'deliveries',
  'invoices'
] as const;
export type RecycleCollection = (typeof RECYCLE_COLLECTIONS)[number];
/** Customer product codes live inside their customer document, so they are addressed as `customerId::productId`. */
export const CUSTOMER_PRODUCTS = 'customer_products';
export type RecycleKind = RecycleCollection | typeof CUSTOMER_PRODUCTS;

export const RECYCLE_KIND_LABELS: Record<RecycleKind, string> = {
  customers: 'Khách hàng',
  leads: 'Khách hàng tiềm năng',
  pos: 'Đơn hàng',
  suppliers: 'Nhà cung cấp',
  purchase_orders: 'Đơn mua hàng NCC',
  production_commands: 'Lệnh sản xuất',
  deliveries: 'Phiếu giao hàng',
  invoices: 'Hóa đơn kế toán (cũ)',
  customer_products: 'Mã hàng của khách'
};

const CODE_FIELDS: Record<RecycleCollection, string[]> = {
  customers: ['customerCode', 'code'],
  leads: [],
  pos: ['poCode'],
  suppliers: ['supplierCode', 'code'],
  purchase_orders: ['purCode'],
  production_commands: ['lsxCode', 'cmdCode'],
  deliveries: ['deliveryCode'],
  invoices: ['invoiceCode', 'invoiceNo']
};
const NAME_FIELDS: Record<RecycleCollection, string[]> = {
  customers: ['companyName', 'name'],
  leads: ['companyName', 'name'],
  pos: ['customerName'],
  suppliers: ['supplierName', 'name'],
  purchase_orders: ['supplierName'],
  production_commands: ['productNameToBeCut', 'productName'],
  deliveries: ['customerName'],
  invoices: ['customerName']
};

export type RecycleRecord = Record<string, unknown> & { id: string };

export interface RecycleItem {
  /** Document id, or `customerId::productId` for a customer product. */
  key: string;
  kind: RecycleKind;
  code: string;
  name: string;
  /** Empty for items deleted before the bin recorded who and when (D-TR1). */
  deletedAt: string;
  deletedByName: string;
  restoreBlockReason: string;
  purgeBlockReason: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const firstText = (record: Record<string, unknown>, fields: string[]) =>
  fields.map(field => text(record[field])).find(Boolean) || '';

export const isRecycleCollection = (value: unknown): value is RecycleCollection =>
  typeof value === 'string' && (RECYCLE_COLLECTIONS as readonly string[]).includes(value);

/** Restoring writes the record back into live workflows, so documents now owned by newer flows stay where they are. */
export const restoreBlockReason = (kind: RecycleKind, record: Record<string, unknown>) => {
  if (kind === 'invoices') return 'Hóa đơn cũ chỉ đọc để đối soát tại Kế toán.';
  if (record.productionOrderVersion === 2) return 'Lệnh sản xuất mới được xóa và xem lại tại Lệnh sản xuất.';
  return '';
};

/** D-TR1 / B3: anything already posted to money or goods ledgers is kept for reconciliation and never purged. */
export const purgeBlockReason = (kind: RecycleKind, record: Record<string, unknown>) => {
  if (kind === 'invoices') return 'Hóa đơn cũ chỉ đọc để đối soát tại Kế toán.';
  if (record.financeLinked === true || record.accountingFlowVersion === 1)
    return 'Đã có chứng từ kế toán, cần giữ để đối soát.';
  if (record.goodsFlowVersion === 1) return 'Đã ghi sổ hàng hóa, cần giữ để đối soát.';
  if (record.productionOrderVersion === 2) return 'Lệnh sản xuất mới được xóa và xem lại tại Lệnh sản xuất.';
  return '';
};

const deletionStamp = (record: Record<string, unknown>) => ({
  deletedAt: text(record.deletedAt),
  deletedByName: text(record.deletedByName)
});

/** Deleted documents of one collection plus, for customers still in use, their deleted product codes. */
export const recycleItemsOf = (collection: RecycleCollection, records: RecycleRecord[]): RecycleItem[] =>
  records.flatMap(record => {
    const items: RecycleItem[] = [];
    if (record.deleted === true)
      items.push({
        key: record.id,
        kind: collection,
        code: firstText(record, CODE_FIELDS[collection]),
        name: firstText(record, NAME_FIELDS[collection]),
        ...deletionStamp(record),
        restoreBlockReason: restoreBlockReason(collection, record),
        purgeBlockReason: purgeBlockReason(collection, record)
      });
    if (collection === 'customers' && record.deleted !== true && Array.isArray(record.products)) {
      const customerName = firstText(record, NAME_FIELDS.customers);
      for (const product of record.products as Record<string, unknown>[]) {
        if (!product || product.deleted !== true || !text(product.id)) continue;
        items.push({
          key: `${record.id}::${text(product.id)}`,
          kind: CUSTOMER_PRODUCTS,
          code: text(product.productCode),
          name: [customerName, text(product.productName)].filter(Boolean).join(' – '),
          ...deletionStamp(product),
          restoreBlockReason: '',
          purgeBlockReason: ''
        });
      }
    }
    return items;
  });

/** Newest deletions first; items without a recorded time go last. */
export const sortRecycleItems = (items: RecycleItem[]) =>
  [...items].sort((left, right) => right.deletedAt.localeCompare(left.deletedAt));

/** Stamp written by every soft delete so the bin can show who deleted what and when. */
export const deletionFields = (actor: { uid: string; displayName: string }, now = new Date().toISOString()) => ({
  deleted: true,
  deletedAt: now,
  deletedById: actor.uid,
  deletedByName: actor.displayName
});

/** dd/mm/yyyy hh:mm in Vietnam time; older deletions have no recorded time. */
export const formatDeletedAt = (value: string) => {
  if (!value) return 'Chưa ghi nhận';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa ghi nhận';
  const options = { timeZone: 'Asia/Ho_Chi_Minh' } as const;
  const day = date.toLocaleDateString('vi-VN', { ...options, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('vi-VN', { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} ${time}`;
};
