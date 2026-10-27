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
