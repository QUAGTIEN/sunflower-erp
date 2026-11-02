import type { CatalogItem } from '../../catalog/model/itemCatalog.js';
export type WarehouseKind = 'purchase_receipt' | 'production_issue' | 'production_return' | 'reversal';
export interface WarehouseActor {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
  allowedPages?: string[];
}
export const canReadWarehouse = (a: WarehouseActor) =>
  a.active === true &&
  (a.role === 'admin' ||
    (a.role === 'accountant' && a.allowedPages?.some(page => ['accounting', 'inventory'].includes(page))) ||
    (a.role === 'producer' && a.allowedPages?.some(page => ['inventory', 'production'].includes(page)))) === true;
export const canPostWarehouse = (a: WarehouseActor) =>
  a.active === true &&
  (a.role === 'admin' ||
    (a.role === 'accountant' && a.allowedPages?.some(page => ['accounting', 'inventory'].includes(page)))) === true;
export class WarehouseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarehouseValidationError';
  }
}
export const WAREHOUSE_KINDS: Record<WarehouseKind, string> = {
  purchase_receipt: 'Nhập mua NVL',
  production_issue: 'Cấp NVL cho LSX',
  production_return: 'Hoàn NVL từ LSX',
  reversal: 'Đảo phiếu'
};
/**
 * D-MA1 stock vouchers: receipts and returns into a store are PN (phiếu nhập), everything that sends goods out or
 * closes them on an order is PX (phiếu xuất). A reversal takes the opposite prefix of the voucher it reverses.
 */
const STOCK_IN_KINDS = [
  'purchase_receipt',
  'production_return',
  'production_receipt',
  'production_surplus_receipt',
  'failed_return',
  'customer_return'
];
export function stockVoucherPrefix(kind: string, reversedKind = ''): 'PN' | 'PX' {
  const inbound = STOCK_IN_KINDS.includes(kind === 'reversal' ? reversedKind : kind);
  return (kind === 'reversal' ? !inbound : inbound) ? 'PN' : 'PX';
}
export const stockNumber = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 6 });
export interface WarehouseBalance {
  id: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  revision: number;
  minQuantity: number | null;
  updatedAt: string;
}
export interface WarehouseLine {
  sourceLine: string;
  catalogItemId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  factor: number;
  baseUnit: string;
  baseQuantity: number;
  delta: number;
  catalogRevision: number;
  rollCode?: string;
  remainingMeters?: number;
}
export interface WarehouseCustomerUsage {
  customerId: string;
  customerName: string;
  sources: string[];
}
export interface WarehouseVoucher {
  id: string;
  code: string;
  warehouseId: 'raw_main';
  kind: WarehouseKind;
  sourceId: string;
  sourceCode: string;
  sourceType: 'purchase' | 'production';
  customerId?: string;
  customerName?: string;
  lines: WarehouseLine[];
  postedAt: string;
  postingDate: string;
  actorId: string;
  actorName: string;
  note: string;
  negativeReason: string;
  reversedBy?: string;
  reversalOf?: string;
}
export interface WarehouseSource {
  id: string;
  code: string;
  type: 'purchase' | 'production';
  status: string;
  legacyReceived: boolean;
  customerId?: string;
  customerName?: string;
  lines: { id: string; name: string; unit: string; quantity: number; catalogItemId: string; factor?: number }[];
}
export interface WarehouseProgress {
  /** quantity is received/net-issued BASE quantity; unit is the source unit, converted by factor. */
  id: string;
  fingerprint: string;
  lines: Record<string, { catalogItemId: string; factor: number; quantity: number; unit: string }>;
  revision: number;
}
export interface WarehouseData {
  items: CatalogItem[];
  balances: WarehouseBalance[];
  vouchers: WarehouseVoucher[];
  sources: WarehouseSource[];
  progress: WarehouseProgress[];
  legacyInventory: Record<string, unknown>[];
  legacyExports: Record<string, unknown>[];
  itemUsers?: Record<string, WarehouseCustomerUsage[]>;
}
export function warehouseDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  return ['year', 'month', 'day'].map(name => parts.find(part => part.type === name)!.value).join('-');
}
export function warehouseQuantity(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1e12 ||
    !Number.isSafeInteger(Math.round(value * 1e6)) ||
    Math.abs(value * 1e6 - Math.round(value * 1e6)) > 1e-4
  )
    throw new WarehouseValidationError(
      'Số lượng phải dương, tối đa 6 chữ số thập phân và nằm trong giới hạn tính toán an toàn.'
    );
  return value;
}
export function roundStock(value: number) {
  if (!Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 1e6)))
    throw new WarehouseValidationError('Số lượng vượt giới hạn tính toán an toàn.');
  return Math.round(value * 1e6) / 1e6;
}
export function warehouseSummary(
  vouchers: { postingDate: string; lines: WarehouseLine[] }[],
  from: string,
  to: string
) {
  const result = new Map<
    string,
    { code: string; name: string; unit: string; opening: number; incoming: number; outgoing: number; closing: number }
  >();
  for (const voucher of vouchers) {
    if (voucher.postingDate > to) continue;
    for (const line of voucher.lines) {
      const row = result.get(line.catalogItemId) || {
        code: line.code,
        name: line.name,
        unit: line.baseUnit,
        opening: 0,
        incoming: 0,
        outgoing: 0,
        closing: 0
      };
      if (voucher.postingDate < from) row.opening = roundStock(row.opening + line.delta);
      else if (line.delta >= 0) row.incoming = roundStock(row.incoming + line.delta);
      else row.outgoing = roundStock(row.outgoing - line.delta);
      row.closing = roundStock(row.opening + row.incoming - row.outgoing);
      result.set(line.catalogItemId, row);
    }
  }
  return [...result.values()];
}
