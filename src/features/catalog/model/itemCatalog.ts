/** Internal identities are independent of customer codes and historical PO snapshots. */
export const CATALOG_KINDS = {
  raw_material: 'Nguyên vật liệu',
  finished_good: 'Thành phẩm',
  resale: 'Hàng mua bán lại'
} as const;
export type CatalogKind = keyof typeof CATALOG_KINDS;
export interface CatalogActor {
  active: boolean;
  role: string;
  allowedPages?: string[];
}
export interface UnitConversion {
  unit: string;
  factor: number;
}
export interface CatalogInput {
  code: string;
  name: string;
  kind: CatalogKind;
  baseUnit: string;
  conversions: UnitConversion[];
  notes: string;
}
export interface CatalogItem extends CatalogInput {
  id: string;
  normalizedCode: string;
  active: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface CatalogSourceRef {
  type: 'inventory' | 'customer_product' | 'po_item';
  documentId: string;
  rowKey: string;
}
export interface CatalogSource {
  ref: CatalogSourceRef;
  key: string;
  label: string;
  code: string;
  name: string;
  unit: string;
  fingerprint: string;
  problem: string;
}
export interface CatalogLink {
  id: string;
  source: CatalogSourceRef;
  sourceKey: string;
  sourceFingerprint: string;
  catalogItemId: string;
  sourceUnit: string;
  baseUnit: string;
  factor: number;
  revision: number;
  updatedAt: string;
}
export const canManageItemCatalog = (actor: CatalogActor) =>
  actor.active === true &&
  (actor.role === 'admin' ||
    (actor.role === 'purchaser' &&
      actor.allowedPages?.some(page => ['inventory', 'purchase'].includes(page)) === true) ||
    (actor.role === 'accountant' && actor.allowedPages?.includes('accounting') === true));
export const normalizeCatalogCode = (value: string) => value.normalize('NFKC').trim().toLocaleUpperCase('vi-VN');
export const normalizeUnit = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi-VN')
    .replace(/^m2$/, 'm²')
    .replace(/^m3$/, 'm³');
export const sourceKey = (ref: CatalogSourceRef) => JSON.stringify([ref.type, ref.documentId, ref.rowKey]);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const fail = (message: string): never => {
  throw new Error(message);
};
const requiredText = (value: unknown, label: string, max: number) => {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    Array.from(value).some(char => char.charCodeAt(0) < 32)
  )
    fail(`${label} bắt buộc, tối đa ${max} ký tự và không chứa ký tự điều khiển.`);
  return (value as string).trim();
};
/**
 * D-MA1 item codes, issued by the server: customer-specific finished goods `TP-<short code>-NNN`, standard goods
 * `TC-NNNN`, resale `HM-NNNN`, materials `NVL-<group>-NNN`. Groups are fixed; adding one needs the user's approval.
 */
export const MATERIAL_GROUPS = {
  DCG: 'Decal giấy',
  DCN: 'Decal nhiệt',
  PP: 'Màng PP',
  PET: 'Màng PET',
  MUC: 'Mực',
  RIB: 'Ribbon',
  KEO: 'Keo',
  LOI: 'Lõi giấy'
} as const;
export type MaterialGroup = keyof typeof MATERIAL_GROUPS;
export type CatalogCodeRequest =
  | { scheme: 'customer'; customerId: string; shortCode?: string }
  | { scheme: 'standard' }
  | { scheme: 'resale' }
  | { scheme: 'material'; group: MaterialGroup };
/** What the user picked in the form to have a new item's code issued; the server issues the number. */
export interface CatalogCodeChoice {
  scheme: 'customer' | 'standard';
  customerId: string;
  shortCode: string;
  group: string;
}
export const EMPTY_CODE_CHOICE: CatalogCodeChoice = { scheme: 'customer', customerId: '', shortCode: '', group: '' };
/** A customer's short code: 3–5 capital letters or digits, starting with a letter, without accents. */
export const CUSTOMER_SHORT_CODE = /^[A-Z][A-Z0-9]{2,4}$/;

export function validateCatalogCodeRequest(kind: CatalogKind, raw: unknown): CatalogCodeRequest {
  const value = record(raw);
  if (kind === 'resale') return { scheme: 'resale' };
  if (kind === 'raw_material') {
    if (!Object.hasOwn(MATERIAL_GROUPS, String(value.group))) fail('Chọn nhóm NVL để cấp mã.');
    return { scheme: 'material', group: value.group as MaterialGroup };
  }
  if (value.scheme === 'standard') return { scheme: 'standard' };
  if (value.scheme !== 'customer' || typeof value.customerId !== 'string' || !value.customerId.trim())
    fail('Chọn khách hàng của thành phẩm, hoặc chọn hàng chuẩn dùng chung.');
  const shortCode = text(value.shortCode).toUpperCase();
  if (shortCode && !CUSTOMER_SHORT_CODE.test(shortCode))
    fail('Mã khách viết tắt gồm 3–5 chữ in hoa hoặc số, bắt đầu bằng chữ, không dấu.');
  return { scheme: 'customer', customerId: (value.customerId as string).trim(), ...(shortCode ? { shortCode } : {}) };
}
/** The counter an item code is numbered from, e.g. `TP-AQUA` with 3 digits or `TC` with 4. */
export function catalogCodeSeries(request: CatalogCodeRequest, customerShortCode = '') {
  if (request.scheme === 'customer') return { key: `TP-${customerShortCode}`, width: 3 };
  if (request.scheme === 'material') return { key: `NVL-${request.group}`, width: 3 };
  return { key: request.scheme === 'standard' ? 'TC' : 'HM', width: 4 };
}
export const formatCatalogCode = (series: { key: string; width: number }, sequence: number) =>
  `${series.key}-${String(sequence).padStart(series.width, '0')}`;

/** With `codeIssued` the code is left empty for the server to issue under D-MA1; it is checked again there. */
export function validateCatalogInput(
  raw: Record<string, unknown>,
  options: { codeIssued?: boolean } = {}
): CatalogInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Dữ liệu mã hàng không hợp lệ.');
  const code = options.codeIssued ? '' : requiredText(raw.code, 'Mã nội bộ', 100);
  const name = requiredText(raw.name, 'Tên hàng', 250);
  if (!Object.hasOwn(CATALOG_KINDS, String(raw.kind))) fail('Chọn nhóm hàng hợp lệ.');
  const baseUnit = normalizeUnit(requiredText(raw.baseUnit, 'ĐVT cơ sở', 40));
  if (!Array.isArray(raw.conversions) || raw.conversions.length > 12) fail('Tối đa 12 đơn vị quy đổi cho một mã hàng.');
  const seen = new Set([baseUnit]);
  const conversions = (raw.conversions as unknown[]).map(entry => {
    const value = record(entry);
    const unit = normalizeUnit(requiredText(value.unit, 'Đơn vị quy đổi', 40));
    if (seen.has(unit)) fail('Đơn vị quy đổi bị trùng hoặc trùng ĐVT cơ sở.');
    seen.add(unit);
    if (typeof value.factor !== 'number' || !Number.isFinite(value.factor) || value.factor <= 0 || value.factor > 1e12)
      fail('Hệ số quy đổi phải là số dương, không quá 1.000 tỷ.');
    return { unit, factor: value.factor as number };
  });
  if (raw.notes !== undefined && (typeof raw.notes !== 'string' || raw.notes.length > 2000))
    fail('Ghi chú tối đa 2.000 ký tự.');
  return { code, name, kind: raw.kind as CatalogKind, baseUnit, conversions, notes: text(raw.notes) };
}
export function validateCatalogUpdate(previous: CatalogItem, input: CatalogInput) {
  if (previous.code !== input.code || previous.baseUnit !== input.baseUnit || previous.kind !== input.kind)
    fail('Không đổi mã, nhóm hoặc ĐVT cơ sở đã tạo. Hãy tạo mã mới nếu hàng khác quy cách.');
  for (const conversion of previous.conversions) {
    if (!input.conversions.some(next => next.unit === conversion.unit && next.factor === conversion.factor))
      fail('Không xóa hoặc đổi hệ số quy đổi đã lưu; có thể bổ sung đơn vị mới.');
  }
}
export function conversionFactor(item: CatalogItem, sourceUnit: string) {
  const unit = normalizeUnit(sourceUnit);
  const factor = unit === item.baseUnit ? 1 : item.conversions.find(entry => entry.unit === unit)?.factor;
  if (!unit || factor === undefined)
    fail(`ĐVT ${sourceUnit || '(trống)'} chưa có quy đổi được xác nhận sang ${item.baseUnit}.`);
  return factor as number;
}
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, val]) => [key, stable(val)])
        )
      : value;
/** A change stamp for stale-source detection, never an authorization or security token. */
function stamp(value: unknown) {
  const source = JSON.stringify(stable(value));
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < source.length; i++) {
    a = Math.imul(a ^ source.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ source.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`;
}
export function catalogSources(type: CatalogSourceRef['type'], documents: Record<string, unknown>[]): CatalogSource[] {
  return documents
    .filter(doc => !doc.deleted)
    .flatMap(doc => {
      const documentId = text(doc.id);
      if (!documentId) return [];
      const rows =
        type === 'inventory'
          ? [doc]
          : Array.isArray(doc[type === 'customer_product' ? 'products' : 'items'])
            ? (doc[type === 'customer_product' ? 'products' : 'items'] as unknown[])
            : [];
      const ids = rows.map(row => text(record(row)[type === 'customer_product' ? 'id' : 'itemId']));
      return rows.flatMap((value, index) => {
        const row = record(value);
        if (row.deleted) return [];
        const ref: CatalogSourceRef = {
          type,
          documentId,
          rowKey: type === 'inventory' ? '' : ids[index] ? `id:${ids[index]}` : `index:${index}`
        };
        const code = text(type === 'inventory' ? row.materialCode || row.code : row.productCode);
        const name = text(type === 'inventory' ? row.materialName : row.productName);
        const unit = text(row.unit);
        const problem =
          !name || !unit
            ? 'Thiếu tên hoặc ĐVT gốc; cần bổ sung ở hồ sơ nguồn.'
            : type !== 'inventory' && ids[index] && ids.filter(id => id === ids[index]).length > 1
              ? 'Mã dòng nguồn bị trùng; cần xử lý ở hồ sơ nguồn.'
              : '';
        return [
          {
            ref,
            key: sourceKey(ref),
            label:
              text(
                type === 'customer_product'
                  ? doc.companyName || doc.customerName || doc.name
                  : type === 'po_item'
                    ? doc.poCode
                    : row.materialName
              ) || documentId,
            code,
            name,
            unit,
            problem,
            fingerprint: stamp({
              code,
              name,
              unit,
              productType: row.productType,
              material: row.material,
              size: row.size,
              specifications: row.specifications,
              customerId: doc.customerId,
              ...(type === 'po_item' ? { orderedQuantity: row.quantity, customerProductId: row.customerProductId } : {})
            })
          }
        ];
      });
    });
}
/** No name/code inference: a source must have an explicitly confirmed and still-current link. */
export function resolveCatalogSource(source: CatalogSource, links: CatalogLink[], items: CatalogItem[]) {
  const link = links.find(entry => entry.sourceKey === source.key);
  if (!link) return { status: 'unlinked' as const };
  const item = items.find(item => item.id === link.catalogItemId);
  if (source.problem || link.sourceFingerprint !== source.fingerprint || normalizeUnit(source.unit) !== link.sourceUnit)
    return { status: 'stale' as const, link, item };
  if (!item || !item.active) return { status: 'inactive' as const, link, item };
  return { status: 'linked' as const, link, item };
}

export const CATALOG_CSV_HEADERS = ['code', 'name', 'kind', 'baseUnit', 'conversions', 'notes'];
export const catalogCsvTemplate =
  '\uFEFFcode,name,kind,baseUnit,conversions,notes\r\nNVL001,Giấy mẫu,raw_material,m²,,\r\nTP001,Tem mẫu,finished_good,cái,cuộn:1000,1 cuộn bằng 1000 cái cho riêng mã này\r\n';
export function parseCatalogCsv(csv: string): CatalogInput[] {
  if (new TextEncoder().encode(csv).length > 1_000_000) fail('Tệp CSV tối đa 1 MB.');
  const input = csv.replace(/^\uFEFF/, '');
  const firstLine = input.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };
  const endRow = () => {
    endCell();
    if (row.some(value => value.trim())) rows.push(row);
    row = [];
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) fail('CSV có dấu nháy không hợp lệ.');
      quoted = true;
    } else if (char === delimiter) endCell();
    else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && input[i + 1] === '\n') i++;
    } else if (closed) {
      if (!/\s/.test(char)) fail('CSV có ký tự sau dấu nháy đóng.');
    } else cell += char;
  }
  if (quoted) fail('CSV thiếu dấu nháy đóng.');
  if (cell || row.length || closed) endRow();
  if (
    !rows.length ||
    rows[0].length !== CATALOG_CSV_HEADERS.length ||
    rows[0].some((value, index) => value.trim() !== CATALOG_CSV_HEADERS[index])
  )
    fail('Cột CSV phải đúng thứ tự: code, name, kind, baseUnit, conversions, notes. Hãy tải tệp mẫu.');
  if (rows.length < 2 || rows.length > 51) fail('Mỗi đợt nhập cần từ 1 đến 50 dòng hàng.');
  // Keep malformed values visible in the preview; validation reports each row before any write.
  return rows.slice(1).map((values, index) => {
    if (values.length !== CATALOG_CSV_HEADERS.length) fail(`Dòng ${index + 2}: số cột không đúng mẫu.`);
    const [code, name, kind, baseUnit, conversionText, notes] = values;
    return {
      code,
      name,
      kind: kind as CatalogKind,
      baseUnit,
      notes,
      conversions: conversionText.trim()
        ? conversionText.split('|').map(entry => {
            const [unit, factor, ...extra] = entry.split(':');
            return { unit, factor: extra.length || !factor?.trim() ? NaN : Number(factor) };
          })
        : []
    };
  });
}
export function previewCatalogImport(inputs: CatalogInput[], existing: CatalogItem[]) {
  const counts = new Map<string, number>();
  for (const row of inputs) {
    const code = normalizeCatalogCode(row.code);
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  return inputs.map((input, index) => {
    let error = '';
    try {
      validateCatalogInput(input as unknown as Record<string, unknown>);
      if ((counts.get(normalizeCatalogCode(input.code)) || 0) > 1) fail('Mã nội bộ trùng trong tệp.');
      if (existing.some(item => item.normalizedCode === normalizeCatalogCode(input.code)))
        fail('Mã đã có trong danh mục, kể cả mã ngừng sử dụng. Không ghi đè.');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Dữ liệu không hợp lệ.';
    }
    return { row: index + 2, input, error };
  });
}
