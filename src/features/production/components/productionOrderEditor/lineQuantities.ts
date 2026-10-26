import { itemIdentity, type ProductionPO } from '../../model/productionOrder';

/** Remaining quantity of a PO line after the other orders' allocations, never negative. */
export const remainingQuantity = (item: Record<string, unknown>, allocated: number) =>
  Math.max(0, Number(item.quantity) - allocated);

/** Fill every production line with its remaining quantity, the default when an order takes the whole PO. */
export function fillRemainingQuantities(
  po: ProductionPO,
  requiredItemIds: string[],
  allocations: Map<string, number>
): Record<string, string> {
  const quantities: Record<string, string> = {};
  (po.items || []).forEach((item, index) => {
    const id = itemIdentity(item, index);
    const remaining = remainingQuantity(item, allocations.get(id) || 0);
    if (requiredItemIds.includes(id) && remaining > 0) quantities[id] = String(remaining);
  });
  return quantities;
}
