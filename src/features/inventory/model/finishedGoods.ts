import type { CatalogItem } from '../../catalog/model/itemCatalog.js';
import type { WarehouseActor, WarehouseBalance, WarehouseLine } from './warehouse.js';
import { canPostWarehouse, canReadWarehouse, roundStock } from './warehouse.js';

export const GOODS_KINDS = {
  production_receipt: 'Nhập thành phẩm từ QC',
  purchase_receipt: 'Nhập hàng mua / gia công',
  dispatch: 'Xuất kho giao khách',
  supplier_dispatch: 'NCC giao thẳng khách',
  delivery: 'Khách xác nhận nhận',
  failed_return: 'Hoàn hàng giao thất bại',
  customer_return: 'Khách trả hàng',
  close_short: 'Đóng phần thiếu',
  reversal: 'Đảo phiếu'
} as const;
export type GoodsKind = keyof typeof GOODS_KINDS;
export type GoodsActionKind = Exclude<GoodsKind, 'reversal' | 'close_short'>;
export const canConfirmGoods = (actor: WarehouseActor) =>
  actor.active === true && (actor.role === 'admin' || actor.allowedPages?.includes('delivery') === true);
export const canReadGoods = (actor: WarehouseActor) => canReadWarehouse(actor) || canConfirmGoods(actor);
export const canPostGoods = canPostWarehouse;
export interface GoodsLine extends WarehouseLine {
  poItemId: string;
  poUnit: string;
  poFactor: number;
}
export interface GoodsVoucher {
  id: string;
  code: string;
  warehouseId: 'finished_main';
  kind: GoodsKind;
  originalKind?: GoodsKind;
  sourceId: string;
  sourceCode: string;
  sourceType: 'production' | 'purchase' | 'po' | 'dispatch';
  poId: string;
  poCode: string;
  tripId: string;
  dispatchId: string;
  purchaseId: string;
  lines: GoodsLine[];
  postedAt: string;
  postingDate: string;
  actorId: string;
  actorName: string;
  note: string;
  returnToSupplier: boolean;
  proof?: { receiverName: string; reference: string; signatureImage: string };
  customerConfirmation?: string;
  reversedBy?: string;
  reversalOf?: string;
}
export interface GoodsBalance extends WarehouseBalance {
  catalogItemId: string;
  warehouseId: 'finished_main';
}
export interface GoodsOrderLine {
  catalogItemId: string;
  code: string;
  name: string;
  unit: string;
  baseUnit: string;
  factor: number;
  required: number;
  sent: number;
  delivered: number;
  failedReturned: number;
  customerReturned: number;
  closedShort: number;
}
export interface GoodsOrderState {
  id: string;
  fingerprint: string;
  revision: number;
  lines: Record<string, GoodsOrderLine>;
}
export interface GoodsSourceLine {
  catalogItemId: string;
  poItemId: string;
  factor: number;
  received: number;
  directSent: number;
  directDelivered: number;
  directFailed: number;
  failedIntoCompany: number;
  directCustomerReturned: number;
}
export interface GoodsSourceState {
  id: string;
  fingerprint: string;
  revision: number;
  lines: Record<string, GoodsSourceLine>;
}
export interface GoodsDispatchLine {
  sent: number;
  delivered: number;
  failedReturned: number;
  customerReturned: number;
}
export interface GoodsDispatchState {
  id: string;
  tripId: string;
  poId: string;
  revision: number;
  lines: Record<string, GoodsDispatchLine>;
}
export interface GoodsPO {
  id: string;
  code: string;
  customerName: string;
  status: string;
  legacyDelivered: boolean;
  lines: { id: string; name: string; unit: string; quantity: number }[];
}
export interface GoodsSource {
  id: string;
  /** Order or purchase the voucher posts against; differs from `id` when a multi-PO order is split per PO. */
  documentId?: string;
  code: string;
  type: 'production' | 'purchase';
  poId: string;
  blocked: string;
  lines: { id: string; poItemId: string; name: string; unit: string; quantity: number; catalogItemId: string }[];
}
export interface GoodsTrip {
  id: string;
  code: string;
  status: string;
  poIds: string[];
  revision: number;
}
export interface GoodsData {
  items: CatalogItem[];
  balances: GoodsBalance[];
  vouchers: GoodsVoucher[];
  orderStates: GoodsOrderState[];
  sourceStates: GoodsSourceState[];
  dispatchStates: GoodsDispatchState[];
  orders: GoodsPO[];
  sources: GoodsSource[];
  trips: GoodsTrip[];
}
export const goodsTransit = (line: Pick<GoodsOrderLine, 'sent' | 'delivered' | 'failedReturned'>) =>
  roundStock(line.sent - line.delivered - line.failedReturned);
export const goodsOutstanding = (line: GoodsOrderLine) =>
  roundStock(line.required - line.sent + line.failedReturned + line.customerReturned - line.closedShort);
export function validateGoodsCounters(line: GoodsOrderLine) {
  if (
    [line.sent, line.delivered, line.failedReturned, line.customerReturned, line.closedShort].some(
      value => !Number.isFinite(value) || value < 0
    ) ||
    goodsTransit(line) < 0 ||
    line.customerReturned > line.delivered ||
    goodsOutstanding(line) < 0
  )
    throw new Error('Số lượng vượt phần còn lại hoặc có phiếu sau cần đảo trước.');
}
