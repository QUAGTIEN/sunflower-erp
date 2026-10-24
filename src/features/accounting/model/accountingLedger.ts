import type { WarehouseActor } from '../../inventory/model/warehouse.js';
export const canUseLedger = (actor: WarehouseActor) =>
  actor.active === true &&
  (actor.role === 'admin' || (actor.role === 'accountant' && actor.allowedPages?.includes('accounting') === true));
export type DebtSide = 'ar' | 'ap';
export const FINANCE_KINDS = {
  charge: 'Ghi nhận công nợ',
  opening: 'Dư đầu kỳ',
  opening_advance: 'Ứng trước đầu kỳ',
  payment: 'Thu / chi tiền',
  allocation: 'Phân bổ tiền',
  refund: 'Hoàn tiền',
  adjustment: 'Điều chỉnh công nợ',
  reversal: 'Đảo phiếu'
} as const;
export class LedgerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerValidationError';
  }
}
export function money(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0) || value > 1e12)
    throw new LedgerValidationError('Số tiền phải là số nguyên VND, tối đa 1.000 tỷ đồng.');
  return value;
}
function fixed(value: unknown, scale: number, label: string): bigint {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e12 ||
    !Number.isSafeInteger(Math.round(value * scale)) ||
    Math.abs(value * scale - Math.round(value * scale)) > 0.0001
  )
    throw new LedgerValidationError(`${label} không hợp lệ hoặc quá số lẻ cho phép.`);
  return BigInt(Math.round(value * scale));
}
export function lineAmounts(quantity: unknown, unitPrice: unknown, discount: unknown, taxRate: unknown) {
  const q = fixed(quantity, 1e6, 'Số lượng'),
    price = fixed(unitPrice, 1e6, 'Đơn giá'),
    rate = fixed(taxRate, 100, 'Thuế suất');
  if (q <= 0n || rate > 10000n) throw new LedgerValidationError('Số lượng phải dương, thuế suất từ 0 đến 100%.');
  const grossBeforeDiscount = money(Number((q * price + 500000000000n) / 1000000000000n));
  const reduction = money(discount);
  if (reduction > grossBeforeDiscount) throw new LedgerValidationError('Chiết khấu vượt tiền hàng.');
  const net = grossBeforeDiscount - reduction,
    tax = money(Number((BigInt(net) * rate + 5000n) / 10000n));
  return { net, tax, gross: money(net + tax) };
}
export const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} đ`;
export interface DebtLine {
  id: string;
  sourceVoucherId: string;
  sourceCode: string;
  orderCode: string;
  sourceLine: string;
  poId: string;
  purchaseId: string;
  poItemId: string;
  catalogItemId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  net: number;
  tax: number;
  gross: number;
  adjustment: number;
  adjustmentCount: number;
  settled: number;
  returnedQuantity: number;
}
export interface DebtDocument {
  id: string;
  code: string;
  kind: 'charge' | 'opening';
  side: DebtSide;
  partnerId: string;
  partnerName: string;
  reference: string;
  dueDate: string;
  openingAsOf: string;
  postingDate: string;
  lines: DebtLine[];
  poIds: string[];
  voided: boolean;
}
export interface MoneyFund {
  id: string;
  side: DebtSide;
  partnerId: string;
  partnerName: string;
  amount: number;
  used: number;
  refunded: number;
  openingAsOf: string;
  method: 'cash' | 'bank_transfer';
  reference: string;
  postingDate: string;
  voided: boolean;
}
export interface LedgerAllocation {
  documentId: string;
  lineId: string;
  amount: number;
}
export interface LedgerAdjustment {
  documentId: string;
  lineId: string;
  amount: number;
  returnVoucherId: string;
  returnLine: string;
  quantity: number;
}
export interface LedgerEntry {
  id: string;
  code: string;
  kind: keyof typeof FINANCE_KINDS;
  originalKind?: keyof typeof FINANCE_KINDS;
  side: DebtSide;
  partnerId: string;
  partnerName: string;
  postingDate: string;
  createdAt: string;
  actorName: string;
  note: string;
  reference: string;
  amount: number;
  cashDelta: number;
  fundId: string;
  allocations: LedgerAllocation[];
  adjustments: LedgerAdjustment[];
  documentId: string;
  reversalOf?: string;
  reversedBy?: string;
}
export interface FinanceSourceState {
  id: string;
  lines: Record<string, { used: number }>;
}
export interface FinanceSource {
  id: string;
  code: string;
  side: DebtSide;
  partnerId: string;
  partnerName: string;
  poId: string;
  purchaseId: string;
  lines: {
    id: string;
    catalogItemId: string;
    code: string;
    name: string;
    unit: string;
    quantity: number;
    poItemId: string;
    suggestedPrice: number;
  }[];
}
export interface LedgerData {
  revision: number;
  documents: DebtDocument[];
  funds: MoneyFund[];
  entries: LedgerEntry[];
  sources: FinanceSource[];
  sourceStates: FinanceSourceState[];
  partners: { id: string; name: string; side: DebtSide }[];
  returns: {
    id: string;
    code: string;
    side: DebtSide;
    dispatchId: string;
    lines: { sourceLine: string; quantity: number; catalogItemId: string }[];
  }[];
  openingOrders: { id: string; code: string; side: DebtSide; partnerId: string; poId: string; purchaseId: string }[];
  periods: { id: string; locked: boolean }[];
  legacy: Record<string, unknown>[];
  items: { id: string; code: string; name: string; baseUnit: string }[];
}
export const lineDue = (line: DebtLine) => line.gross + line.adjustment - line.settled;
export const fundAvailable = (fund: MoneyFund) => (fund.voided ? 0 : fund.amount - fund.used - fund.refunded);
