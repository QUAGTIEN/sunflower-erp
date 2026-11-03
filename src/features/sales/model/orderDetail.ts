import { calculatePOItemFinancials } from '@/domain/poFinancials';
import { USER_ROLE_LABELS, isUserRole } from '@/shared/types';

/** One order line as stored on the PO; only the fields the order view reads are named. */
export interface OrderLine extends Record<string, unknown> {
  itemId?: string;
  productCode?: string;
  productName?: string;
  supplierName?: string;
  purchasePrice?: number | string;
  saleNotes?: string;
  designNotes?: string;
  saleLayouts?: string[];
  designLayouts?: string[];
}

/** One internal note of the order ("Trao đổi nội bộ"), kept on the PO as `internalChecklist`. */
export interface ChecklistTask {
  id: string;
  content: string;
  completed: boolean;
  updatedBy?: string;
}

export interface OrderHistoryLog {
  status?: string;
  updatedAt?: string;
  updatedBy?: string;
  note?: string;
}

/** Buying cost and gross profit of a line: selling amount before VAT minus quantity times the buying price. */
export const lineCost = (item: OrderLine) => {
  const financials = calculatePOItemFinancials(item);
  const buyingTotal = financials.quantity * (Number(item.purchasePrice) || 0);
  return {
    purchasePrice: Number(item.purchasePrice) || 0,
    buyingTotal,
    profit: financials.amountBeforeVat - buyingTotal
  };
};

/** Older records store the actor as "Name (ROLE)"; show the Vietnamese role name instead of the code. */
export const actorLabel = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^(.*)\s\(([A-Z_]+)\)$/);
  if (!match) return text;
  const role = match[2].toLowerCase();
  return isUserRole(role) ? `${match[1]} (${USER_ROLE_LABELS[role]})` : text;
};
