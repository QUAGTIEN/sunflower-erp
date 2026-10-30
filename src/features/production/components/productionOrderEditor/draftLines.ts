import {
  allocatedQuantities,
  allocationKey,
  commandPoIds,
  itemIdentity,
  productionItemIds,
  PLANNABLE_PO_STATUSES,
  type CommandRecord,
  type ProductionPO
} from '../../model/productionOrder';

export interface LinePrintDetails {
  materialWidth: string;
  priority: string;
}
/** One line of the order being drafted: a PO line and the quantity this order takes from it. */
export interface DraftLine {
  poId: string;
  itemId: string;
  quantity: string;
  printDetails: LinePrintDetails;
}
/** A PO line that can still be put into an order. */
export interface PlannableLine {
  key: string;
  po: ProductionPO;
  item: Record<string, unknown>;
  itemId: string;
  remaining: number;
}

export const EMPTY_PRINT_DETAILS: LinePrintDetails = { materialWidth: '', priority: '' };
export const draftLineKey = (line: Pick<DraftLine, 'poId' | 'itemId'>) => allocationKey(line.poId, line.itemId);

/** Quantities already taken from each line of one PO by other orders, or null while old orders block it. */
export function poAllocations(commands: CommandRecord[], poId: string, excludedId: string) {
  try {
    return allocatedQuantities(
      commands.filter(command => commandPoIds(command).includes(poId)),
      excludedId
    );
  } catch {
    return null;
  }
}

export const remainingQuantity = (item: Record<string, unknown>, allocated: number) =>
  Math.max(0, Number(item.quantity) - allocated);

/**
 * Production lines of open POs that still have quantity to plan. POs with unreconciled old orders are listed
 * separately because their allocation cannot be computed per line.
 */
export function plannableLines(pos: ProductionPO[], commands: CommandRecord[], excludedId: string) {
  const lines: PlannableLine[] = [];
  const blockedPoCodes: string[] = [];
  for (const po of pos) {
    if (po.deleted || !PLANNABLE_PO_STATUSES.includes(String(po.status))) continue;
    const allocations = poAllocations(commands, po.id, excludedId);
    if (!allocations) {
      blockedPoCodes.push(String(po.poCode || po.id));
      continue;
    }
    const productionIds = productionItemIds(po);
    (po.items || []).forEach((item, index) => {
      const itemId = itemIdentity(item, index);
      const key = allocationKey(po.id, itemId);
      const remaining = remainingQuantity(item, allocations.get(key) || 0);
      if (productionIds.includes(itemId) && remaining > 0) lines.push({ key, po, item, itemId, remaining });
    });
  }
  return { lines, blockedPoCodes };
}

/** Why an order or one of its lines cannot go into a production order; empty when it can. */
export const PICKER_BLOCKS = {
  pastProduction: 'Đơn đã qua giai đoạn sản xuất',
  legacyOrders: 'Có LSX cũ chưa đối soát theo dòng',
  noItems: 'Đơn chưa có mặt hàng',
  notProduction: 'Hàng mua / dịch vụ, không cần sản xuất',
  invalidQuantity: 'Số lượng trên đơn không hợp lệ',
  fullyPlanned: 'Đã lập lệnh đủ số lượng',
  inOrder: 'Đã có trong lệnh này'
} as const;
export interface PickerLine {
  key: string;
  po: ProductionPO;
  item: Record<string, unknown>;
  itemId: string;
  remaining: number;
  blockedReason: string;
}
export interface PickerOrder {
  po: ProductionPO;
  lines: PickerLine[];
  blockedReason: string;
}
export interface PickerCustomer {
  key: string;
  label: string;
  orders: PickerOrder[];
}
export const selectableLines = (order: PickerOrder) => order.lines.filter(line => !line.blockedReason);

function orderBlock(po: ProductionPO, allocations: Map<string, number> | null) {
  if (!PLANNABLE_PO_STATUSES.includes(String(po.status))) return PICKER_BLOCKS.pastProduction;
  if (!allocations) return PICKER_BLOCKS.legacyOrders;
  if (!(po.items || []).length) return PICKER_BLOCKS.noItems;
  return '';
}

function lineBlock(item: Record<string, unknown>, isProduction: boolean, remaining: number, taken: boolean) {
  if (taken) return PICKER_BLOCKS.inOrder;
  if (!isProduction) return PICKER_BLOCKS.notProduction;
  const ordered = Number(item.quantity);
  if (!Number.isFinite(ordered) || ordered <= 0) return PICKER_BLOCKS.invalidQuantity;
  return remaining > 0 ? '' : PICKER_BLOCKS.fullyPlanned;
}

/**
 * Every customer with an order, each order and its product lines. Orders and lines that cannot be planned stay
 * listed with the reason, so a customer never silently disappears from the picker.
 */
export function pickerCustomers(
  pos: ProductionPO[],
  commands: CommandRecord[],
  excludedId: string,
  takenKeys: Set<string>
): PickerCustomer[] {
  const customers = new Map<string, PickerCustomer>();
  for (const po of pos) {
    if (po.deleted) continue;
    const allocations = poAllocations(commands, po.id, excludedId);
    const blockedReason = orderBlock(po, allocations);
    const productionIds = productionItemIds(po);
    const lines = (po.items || []).map((item, index): PickerLine => {
      const itemId = itemIdentity(item, index);
      const key = allocationKey(po.id, itemId);
      const remaining = allocations ? remainingQuantity(item, allocations.get(key) || 0) : 0;
      const reason = lineBlock(item, productionIds.includes(itemId), remaining, takenKeys.has(key));
      return { key, po, item, itemId, remaining, blockedReason: blockedReason || reason };
    });
    const key = customerKeyOf(po);
    const customer = customers.get(key) || { key, label: customerLabelOf(po), orders: [] };
    customer.orders.push({ po, lines, blockedReason });
    customers.set(key, customer);
  }
  // Orders that still have lines to plan come first; otherwise the incoming (newest first) order is kept.
  for (const customer of customers.values())
    customer.orders.sort((a, b) => Number(!selectableLines(a).length) - Number(!selectableLines(b).length));
  return [...customers.values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

/** Key of the customer an order belongs to; a PO without a customer stands alone, as no shared customer is proven. */
export const customerKeyOf = (po: ProductionPO) => (po.customerId ? String(po.customerId) : `po:${po.id}`);
export const customerLabelOf = (po: ProductionPO) =>
  po.customerId
    ? String(po.customerName || po.customerId)
    : `${String(po.customerName || 'Chưa có khách')} (${String(po.poCode || po.id)})`;
