import { calculatePOItemFinancials } from '@/domain/poFinancials';
import { USER_ROLE_LABELS, isUserRole } from '@/shared/types';
import { PO_QUEUE_STATES, getPOQueueStatus, type POQueueStatus } from './poWorkflow';

export interface OrderTotals {
  grossAmount: number;
  discountAmount: number;
  amountBeforeVat: number;
  vatAmount: number;
  amountWithVat: number;
  /** Share of the order value kept after discounts (100% = no discount). */
  kpi: number;
}

export const orderTotals = (items: Record<string, unknown>[] = []): OrderTotals => {
  const totals = items.map(calculatePOItemFinancials).reduce(
    (sum, line) => ({
      grossAmount: sum.grossAmount + line.grossAmount,
      discountAmount: sum.discountAmount + line.discountAmount,
      amountBeforeVat: sum.amountBeforeVat + line.amountBeforeVat,
      vatAmount: sum.vatAmount + line.vatAmount,
      amountWithVat: sum.amountWithVat + line.amountWithVat
    }),
    { grossAmount: 0, discountAmount: 0, amountBeforeVat: 0, vatAmount: 0, amountWithVat: 0 }
  );
  return { ...totals, kpi: totals.grossAmount > 0 ? (totals.amountBeforeVat / totals.grossAmount) * 100 : 0 };
};

/** What moves an order into each queue step; the detail page never changes the step by hand (D-PO1). */
export const ORDER_STEP_TRIGGERS: Record<POQueueStatus, string> = {
  waiting_design: 'Khi tạo đơn hàng',
  waiting_production: 'Khi khách duyệt mẫu thiết kế',
  waiting_delivery: 'Khi lệnh sản xuất hoàn thành',
  waiting_invoice: 'Khi giao đủ hàng (POD)',
  waiting_receivable: 'Khi Kế toán ghi hóa đơn',
  waiting_discount: 'Khi thu đủ công nợ',
  completed: 'Khi xử lý xong chiết khấu'
};

export interface OrderHistoryLog {
  status?: string;
  updatedAt?: string;
  updatedBy?: string;
  note?: string;
}

export interface OrderStep {
  value: POQueueStatus;
  label: string;
  state: 'done' | 'current' | 'pending';
  /** First time the order reached this step, from its history; empty when unknown. */
  reachedAt: string;
  reachedBy: string;
}

export const orderSteps = (po: { status?: string; historyLogs?: OrderHistoryLog[] }): OrderStep[] => {
  const currentIndex = PO_QUEUE_STATES.findIndex(state => state.value === getPOQueueStatus(po));
  const logs = Array.isArray(po.historyLogs) ? po.historyLogs : [];
  return PO_QUEUE_STATES.map((state, index) => {
    const reached = logs.find(log => getPOQueueStatus(log.status) === state.value);
    return {
      value: state.value,
      label: state.label,
      state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
      reachedAt: index <= currentIndex ? reached?.updatedAt || '' : '',
      reachedBy: index <= currentIndex ? reached?.updatedBy || '' : ''
    };
  });
};

/** Older records store the actor as "Name (ROLE)"; show the Vietnamese role name instead of the code. */
export const actorLabel = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^(.*)\s\(([A-Z_]+)\)$/);
  if (!match) return text;
  const role = match[2].toLowerCase();
  return isUserRole(role) ? `${match[1]} (${USER_ROLE_LABELS[role]})` : text;
};

export const ORDER_ATTACHMENT_LABELS: Record<string, string> = {
  pdfLink: 'PDF đơn hàng',
  excelLink: 'Excel báo giá',
  aiLink: 'Thiết kế gốc (AI)',
  corelLink: 'Thiết kế Corel (.cdr)',
  contractLink: 'Hợp đồng',
  quoteLink: 'Bản báo giá'
};

const imageList = (value: unknown) =>
  Array.isArray(value) ? value.filter((image): image is string => typeof image === 'string' && image !== '') : [];

/** Every label picture of one order line: previews, the sale's layouts and the designer's files, without repeats. */
export const lineImages = (item: Record<string, unknown>) =>
  Array.from(
    new Set([
      ...imageList(item.previewImages),
      ...imageList([item.previewImage]),
      ...imageList(item.saleLayouts),
      ...imageList(item.designLayouts)
    ])
  );
