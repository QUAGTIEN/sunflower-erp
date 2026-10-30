/** Shared, side-effect-free rules used by the UI and the authenticated server. */
export type ProductionStatus = 'draft' | 'pending_approval' | 'released' | 'producing' | 'completed' | 'cancelled';
export const PRODUCTION_STATUSES: Record<ProductionStatus, string> = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  released: 'Đã phát hành',
  producing: 'Đang sản xuất',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy'
};
export interface ProductionActor {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
  allowedPages?: string[];
}
export interface ProductionPO extends Record<string, unknown> {
  id: string;
  poCode?: string;
  customerName?: string;
  customerId?: string;
  status?: string;
  items?: Record<string, unknown>[];
  productionPlanRequiredItemIds?: string[];
}
export interface ProductionLine {
  itemId: string;
  /** PO of this line. Orders made before multi-PO orders leave it empty and use the order's `poId`. */
  poId?: string;
  poCode?: string;
  /** Customer of the line's PO; one order may hold lines of several customers (D-LSX2). */
  customerId?: string;
  customerName?: string;
  /** Unique key of the line inside the order: `poId__itemId`; older lines are keyed by `itemId` alone. */
  lineId?: string;
  productCode: string;
  productName: string;
  productType: string;
  unit: string;
  quantity: number;
  specification: string;
  material: string;
  specifications: Record<string, unknown>;
  sourceFingerprint: string;
  image: string;
  goodQuantity?: number;
  rejectQuantity?: number;
  surplusQuantity?: number;
  catalog?: ProductionCatalogSnapshot;
  printDetails?: { materialWidth: string; priority: string };
}
export interface ProductionCatalogSnapshot {
  id: string;
  code: string;
  name: string;
  baseUnit: string;
  sourceUnit: string;
  factor: number;
  revision: number;
  linkId?: string;
  linkRevision?: number;
}
export const PRODUCTION_PRINT_TEMPLATES = {
  standard: 'Phiếu chung hiện có',
  white_label: 'Tem trắng — mẫu công ty',
  production_order: 'Lệnh sản xuất — mẫu A4 chuẩn'
} as const;
export interface ProductionPrintTemplate {
  id: keyof typeof PRODUCTION_PRINT_TEMPLATES;
  version: 1 | 2;
}
/** Print layouts are versioned so a reprint of an older order keeps the layout it was issued with. */
export const PRODUCTION_PRINT_VERSIONS: Record<ProductionPrintTemplate['id'], number[]> = {
  standard: [1],
  white_label: [1, 2],
  production_order: [1]
};
export const DEFAULT_PRINT_TEMPLATE: ProductionPrintTemplate = { id: 'white_label', version: 2 };
export interface PlannedMaterial {
  id: string;
  code: string;
  name: string;
  width: string;
  unit: string;
  quantity: number;
  allowancePercent: number;
  catalogItemId?: string;
  catalog?: ProductionCatalogSnapshot;
}
export interface ProductionOrder extends Record<string, unknown> {
  id: string;
  productionOrderVersion: 2;
  revision: number;
  lsxCode: string;
  /** First PO of the order, kept for older readers; `poIds` lists every PO the lines come from. */
  poId: string;
  poCode: string;
  poIds?: string[];
  poCodes?: string[];
  /** Every customer's name joined; `customerId` is set only when the order holds one customer. */
  customerName: string;
  customerId: string;
  customerIds?: string[];
  customerNames?: string[];
  status: ProductionStatus;
  lines: ProductionLine[];
  materials: PlannedMaterial[];
  machineId: string;
  machineName: string;
  operatorId: string;
  operatorName: string;
  shift: string;
  deliveryDeadline: string;
  /** Planned production window; optional, and orders made before it simply leave it empty. */
  plannedStartDate?: string;
  plannedEndDate?: string;
  /** Technical requirements for the whole order, kept apart from the general note. */
  technicalNotes?: string;
  priority: string;
  notes: string;
  createdAt: string;
  createdById: string;
  createdBy: string;
  updatedAt: string;
  deleted?: boolean;
  releasedAt?: string;
  startedAt?: string;
  completedAt?: string;
  inventoryPostingMode: 'actual_issue';
  printTemplate?: ProductionPrintTemplate;
  customerCode?: string;
  history: { at: string; actorId: string; actorName: string; action: string; note: string }[];
}
export type CommandRecord = Partial<ProductionOrder> & { deleted?: boolean; [key: string]: unknown };
export const itemIdentity = (item: Record<string, unknown>, index: number) =>
  String(item.itemId || `legacy-line-${index + 1}`);
const NON_PRODUCTION_WORK_TYPES = ['mua_nvl', 'mua_hang', 'dich_vu'];
const NON_PRODUCTION_PRODUCT_TYPES = ['giay', 'may_in', 'may_quet', 'muc_in'];
/**
 * PO lines that need production: everything except resale, purchase and service lines. A PO whose plan was
 * locked under the old per-PO flow keeps that list.
 */
export function productionItemIds(po: ProductionPO): string[] {
  if (po.productionPlanRequiredItemIds?.length) return po.productionPlanRequiredItemIds;
  return (po.items || [])
    .map((item, index) => ({ item, id: itemIdentity(item, index) }))
    .filter(
      ({ item }) =>
        !NON_PRODUCTION_WORK_TYPES.includes(String(item.workType)) &&
        !NON_PRODUCTION_PRODUCT_TYPES.includes(String(item.productType))
    )
    .map(({ id }) => id);
}
export const linePoId = (line: Pick<ProductionLine, 'poId'>, command: Pick<CommandRecord, 'poId'>) =>
  String(line.poId || command.poId || '');
export const lineKey = (line: Pick<ProductionLine, 'lineId' | 'itemId'>) => line.lineId || line.itemId;
export const allocationKey = (poId: string, itemId: string) => `${poId}::${itemId}`;
/** Every PO an order draws lines from; older orders only carry `poId`. */
export const commandPoIds = (command: CommandRecord): string[] =>
  Array.isArray(command.poIds) && command.poIds.length ? command.poIds : command.poId ? [command.poId] : [];
const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown, max = 500) =>
  String(value ?? '')
    .trim()
    .slice(0, max);
const numeric = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, entry]) => [key, stable(entry)])
        )
      : value;
export function lineSnapshot(item: Record<string, unknown>, index: number, quantity: number): ProductionLine {
  const specs =
    item.specifications && typeof item.specifications === 'object' && !Array.isArray(item.specifications)
      ? (item.specifications as Record<string, unknown>)
      : {};
  const image = text(item.previewImage || (Array.isArray(item.previewImages) ? item.previewImages[0] : ''), 200_000);
  const data = {
    itemId: itemIdentity(item, index),
    productCode: text(item.productCode, 100),
    productName: text(item.productName, 300),
    productType: text(item.productType, 80),
    unit: text(item.unit, 40),
    specification: text(
      item.specification ||
        item.description ||
        item.size ||
        (specs.width && specs.height ? `${specs.width} × ${specs.height} mm` : specs.size)
    ),
    material: text(item.material),
    specifications: JSON.parse(JSON.stringify(specs)) as Record<string, unknown>,
    image: /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(image) ? image : ''
  };
  return {
    ...data,
    quantity,
    sourceFingerprint: JSON.stringify(stable({ ...data, orderedQuantity: numeric(item.quantity) }))
  };
}
export const hasProductionAccess = (actor: ProductionActor, page: 'sales' | 'production') =>
  actor.active &&
  (page !== 'production' || actor.role !== 'sale') &&
  (actor.role === 'admin' ||
    actor.allowedPages?.includes(page) === true ||
    (page === 'production' && actor.role === 'accountant' && actor.allowedPages?.includes('accounting') === true));
export function productionQuantityLabel(command: CommandRecord) {
  if (command.productionOrderVersion !== 2) {
    const value = Number(command.qtyToProduce ?? command.quantity ?? 0);
    return `${(Number.isFinite(value) ? value : 0).toLocaleString('vi-VN')} tem`;
  }
  const totals = new Map<string, number>();
  for (const line of command.lines || []) totals.set(line.unit, (totals.get(line.unit) || 0) + line.quantity);
  return [...totals].map(([unit, value]) => `${value.toLocaleString('vi-VN')} ${unit}`).join(' · ');
}
export const canManageProduction = (actor: ProductionActor) =>
  hasProductionAccess(actor, 'production') && ['admin', 'producer'].includes(actor.role);
export const canDraftProduction = (actor: ProductionActor) =>
  canManageProduction(actor) || (hasProductionAccess(actor, 'production') && actor.role === 'accountant');
export const canEditProductionDraft = (
  actor: ProductionActor,
  order: Pick<ProductionOrder, 'status' | 'createdById'>
) =>
  order.status === 'draft' &&
  (canManageProduction(actor) || (canDraftProduction(actor) && order.createdById === actor.uid));
/** PO statuses that still accept new or changed production orders. */
export const PLANNABLE_PO_STATUSES = [
  'waiting_design',
  'receive_po',
  'bom_extracted',
  'design_sent',
  'layout_pending',
  'waiting_production',
  'production_pending',
  'producing',
  'supplier_confirmed'
];
export function assertPOAccess(actor: ProductionActor, po: ProductionPO) {
  if (!canDraftProduction(actor)) fail('Bạn không có quyền lập lệnh sản xuất.');
  if (po.deleted || !Array.isArray(po.items) || !po.items.length) fail('Đơn hàng không tồn tại hoặc chưa có mặt hàng.');
  if (!PLANNABLE_PO_STATUSES.includes(String(po.status)))
    fail('Đơn hàng đã chuyển giai đoạn, không thể lập / phát hành thêm LSX.');
}
export function allocatedQuantities(commands: CommandRecord[], excludedId = '') {
  const allocations = new Map<string, number>();
  for (const command of commands) {
    if (command.deleted || command.id === excludedId || command.status === 'cancelled') continue;
    if (command.productionOrderVersion !== 2)
      fail(
        'Đơn hàng đang có LSX cũ chưa phân bổ theo từng dòng. Cần đối soát lệnh cũ trước khi lập thêm để tránh trùng số lượng.'
      );
    for (const line of command.lines || []) {
      const qty = command.status === 'completed' ? (line.goodQuantity ?? 0) : line.quantity;
      const key = allocationKey(linePoId(line, command), line.itemId);
      allocations.set(key, (allocations.get(key) || 0) + qty);
    }
  }
  return allocations;
}
/** Before production finishes, purchasing can be asked for the NVL the stock cannot cover. */
export const MATERIAL_SHORTAGE_STATUSES: ProductionStatus[] = ['draft', 'pending_approval', 'released', 'producing'];
const roundQuantity = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
/**
 * A planned material's need with its allowance, and the NVL stock and shortage in the material's own unit.
 * Stock is kept in the catalog's base unit; without a declared conversion factor no stock or shortage is shown.
 */
export function materialShortage(
  material: Pick<PlannedMaterial, 'quantity' | 'allowancePercent'>,
  factor: number | null,
  stockInBaseUnit: number
) {
  const needed = roundQuantity(Number(material.quantity || 0) * (1 + Number(material.allowancePercent || 0) / 100));
  if (!factor || factor <= 0) return { needed, stock: null, shortage: null };
  const stock = roundQuantity(stockInBaseUnit / factor);
  return { needed, stock, shortage: roundQuantity(Math.max(0, needed - stock)) };
}
/** An optional calendar date of the draft (YYYY-MM-DD); anything else is rejected with the field's name. */
function draftDate(value: unknown, label: string) {
  const date = text(value, 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date))
    fail(`${label} không hợp lệ.`);
  return date;
}
/** Validate one order whose lines may come from several POs, of one or several customers (D-LSX2). */
export function validateProductionOrderDraft(
  pos: ProductionPO[],
  commands: CommandRecord[],
  raw: Record<string, unknown>,
  excludedId = ''
) {
  if (!pos.length) fail('Chọn ít nhất một đơn hàng để lập lệnh.');
  for (const po of pos) {
    const ids = (po.items || []).map(itemIdentity);
    if (new Set(ids).size !== ids.length)
      fail(`Đơn hàng ${po.poCode || po.id} có mã dòng bị trùng. Cần sửa dữ liệu đơn hàng trước.`);
  }
  const allocations = allocatedQuantities(commands, excludedId);
  if (!Array.isArray(raw.lines) || !raw.lines.length || raw.lines.length > 200)
    fail('Chọn ít nhất một mặt hàng để lập lệnh (tối đa 200 dòng).');
  const defaultPoId = pos.length === 1 ? pos[0].id : '';
  const seen = new Set<string>();
  const lines = (raw.lines as unknown[]).map((entry: unknown): ProductionLine => {
    const line = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const poId = text(line.poId, 160) || defaultPoId;
    const po = pos.find(candidate => candidate.id === poId);
    const items = po?.items || [];
    const id = text(line.itemId, 160),
      index = items.map(itemIdentity).indexOf(id),
      quantity = numeric(line.quantity),
      key = allocationKey(poId, id);
    if (!po || index < 0 || !productionItemIds(po).includes(id) || seen.has(key))
      fail('Dòng sản phẩm không hợp lệ hoặc bị trùng.');
    seen.add(key);
    const ordered = numeric(items[index].quantity);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(ordered) ||
      ordered <= 0 ||
      quantity + (allocations.get(key) || 0) > ordered + 1e-8
    )
      fail(`Số lượng ${text(items[index].productName)} vượt phần còn lại hoặc không hợp lệ.`);
    const snapshot = lineSnapshot(items[index], index, quantity);
    if (!snapshot.productName || !snapshot.unit) fail('Mặt hàng cần có tên sản phẩm và đơn vị tính trong đơn hàng.');
    const details =
      line.printDetails && typeof line.printDetails === 'object' && !Array.isArray(line.printDetails)
        ? (line.printDetails as Record<string, unknown>)
        : {};
    const materialWidth = text(details.materialWidth, 40);
    if (materialWidth && (!Number.isFinite(Number(materialWidth)) || Number(materialWidth) <= 0))
      fail('Khổ NVL của dòng tem phải là số dương (mm).');
    if (details.priority && !['normal', 'high', 'urgent'].includes(String(details.priority)))
      fail('Ưu tiên của dòng hàng không hợp lệ.');
    return {
      ...snapshot,
      poId,
      poCode: String(po!.poCode || poId),
      customerId: String(po!.customerId || ''),
      customerName: String(po!.customerName || ''),
      lineId: `${poId}__${id}`,
      printDetails: { materialWidth, priority: text(details.priority, 20) }
    };
  });
  if (Array.isArray(raw.materials) && raw.materials.length > 100) fail('Tối đa 100 dòng vật tư dự kiến.');
  const materials: PlannedMaterial[] = (Array.isArray(raw.materials) ? raw.materials : []).map(
    (entry: Record<string, unknown>, index: number) => {
      if (!entry || typeof entry !== 'object') return fail('Vật tư không hợp lệ.');
      const material = {
        id: `material-${index + 1}`,
        code: text(entry.code, 100),
        name: text(entry.name, 200),
        width: text(entry.width, 40),
        unit: text(entry.unit, 40),
        quantity: numeric(entry.quantity),
        allowancePercent: numeric(entry.allowancePercent ?? 0)
      };
      if (
        !material.name ||
        !material.code ||
        !material.unit ||
        !Number.isFinite(material.quantity) ||
        material.quantity <= 0 ||
        !Number.isFinite(material.allowancePercent) ||
        material.allowancePercent < 0 ||
        material.allowancePercent > 100
      )
        fail('Vật tư cần mã, tên, ĐVT, số lượng dương; hao hụt từ 0–100%.');
      return { ...material, ...(entry.catalogItemId ? { catalogItemId: text(entry.catalogItemId, 180) } : {}) };
    }
  );
  const deadline = draftDate(raw.deliveryDeadline, 'Ngày cần');
  const plannedStartDate = draftDate(raw.plannedStartDate, 'Ngày bắt đầu dự kiến');
  const plannedEndDate = draftDate(raw.plannedEndDate, 'Ngày hoàn thành dự kiến');
  if (plannedStartDate && plannedEndDate && plannedEndDate < plannedStartDate)
    fail('Ngày hoàn thành dự kiến phải từ ngày bắt đầu dự kiến trở đi.');
  const template = raw.printTemplate as Partial<ProductionPrintTemplate> | undefined;
  if (
    template &&
    (!Object.hasOwn(PRODUCTION_PRINT_VERSIONS, String(template.id)) ||
      !PRODUCTION_PRINT_VERSIONS[template.id as ProductionPrintTemplate['id']].includes(Number(template.version)))
  )
    fail('Mẫu in hoặc phiên bản mẫu chưa được hỗ trợ.');
  return {
    lines,
    materials,
    printTemplate: (template?.id
      ? { id: template.id, version: template.version }
      : { id: 'standard', version: 1 }) as ProductionPrintTemplate,
    machineId: text(raw.machineId, 160),
    operatorId: text(raw.operatorId, 160),
    shift: text(raw.shift, 100),
    deliveryDeadline: deadline,
    plannedStartDate,
    plannedEndDate,
    technicalNotes: text(raw.technicalNotes, 3000),
    priority: ['urgent', 'high', 'normal'].includes(String(raw.priority)) ? String(raw.priority) : 'normal',
    notes: text(raw.notes, 3000)
  };
}
/** Single-PO form of `validateProductionOrderDraft`; lines without `poId` belong to this PO. */
export const validateProductionDraft = (
  po: ProductionPO,
  commands: CommandRecord[],
  raw: Record<string, unknown>,
  excludedId = ''
) => validateProductionOrderDraft([po], commands, raw, excludedId);
export function assertTransition(actor: ProductionActor, order: ProductionOrder, action: string) {
  const manager = canManageProduction(actor);
  if (!canDraftProduction(actor)) fail('Bạn không có quyền lập lệnh sản xuất.');
  const operator =
    hasProductionAccess(actor, 'production') && actor.role === 'producer' && order.operatorId === actor.uid;
  const permitted =
    action === 'save'
      ? canEditProductionDraft(actor, order)
      : action === 'submit'
        ? canEditProductionDraft(actor, order)
        : action === 'return'
          ? order.status === 'pending_approval' && manager
          : action === 'release'
            ? order.status === 'pending_approval' && manager
            : action === 'start'
              ? order.status === 'released' && (manager || operator)
              : action === 'complete'
                ? order.status === 'producing' && manager
                : action === 'cancel'
                  ? ['draft', 'pending_approval', 'released'].includes(order.status) && manager
                  : action === 'request_materials'
                    ? order.status === 'completed' && canDraftProduction(actor)
                    : action === 'request_material_shortage'
                      ? MATERIAL_SHORTAGE_STATUSES.includes(order.status) && canDraftProduction(actor)
                      : false;
  if (!permitted) fail('Không có quyền hoặc lệnh đã đổi trạng thái. Hãy tải lại danh sách.');
}
export function completedProduction(po: ProductionPO, commands: CommandRecord[]) {
  const required = productionItemIds(po);
  if (
    !required.length ||
    commands.some(command => !command.deleted && command.status !== 'cancelled' && command.productionOrderVersion !== 2)
  )
    return false;
  const completed = commands.filter(command => command.status === 'completed' && !command.deleted);
  return required.every(id => {
    const item = (po.items || []).find((item, index) => itemIdentity(item, index) === id);
    const quantity = numeric(item?.quantity);
    const actual = completed
      .flatMap(command => (command.lines || []).filter(line => linePoId(line, command) === po.id))
      .filter(line => line.itemId === id)
      .reduce((sum, line) => sum + (line.goodQuantity || 0), 0);
    return Number.isFinite(quantity) && quantity > 0 && actual + 1e-8 >= quantity;
  });
}
