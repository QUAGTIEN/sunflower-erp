/**
 * Danh mục dao (decision D-DAO1): cutting dies with their layout. Dies are tools, not stock: no quantity, no ledger.
 * Codes are `DAO-NNNN`, issued by the server like other catalog codes (D-MA1).
 */
export const DIE_CYLINDER_TYPES = { R: 'Dao tròn (R)', D: 'Dao phẳng (D)' } as const;
export type DieCylinderType = keyof typeof DIE_CYLINDER_TYPES;
export const DIE_CORNERS = { rounded: 'Bo góc', square: 'Vuông góc' } as const;
export type DieCorner = keyof typeof DIE_CORNERS;

export interface DieInput {
  name: string;
  cylinderType: DieCylinderType;
  /** The number after R or D on the die, e.g. 100 for R100. */
  cylinderSize: number;
  labelWidth: number;
  labelHeight: number;
  corner: DieCorner;
  /** Corner radius in mm, only for rounded corners. */
  cornerRadius: number;
  perforated: boolean;
  labelsAcross: number;
  labelsAround: number;
  gapAcross: number;
  gapAround: number;
  storageLocation: string;
  notes: string;
}
export interface DieRecord extends DieInput {
  id: string;
  code: string;
  active: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export const EMPTY_DIE: DieInput = {
  name: '',
  cylinderType: 'R',
  cylinderSize: 0,
  labelWidth: 0,
  labelHeight: 0,
  corner: 'rounded',
  cornerRadius: 0,
  perforated: false,
  labelsAcross: 1,
  labelsAround: 1,
  gapAcross: 0,
  gapAround: 0,
  storageLocation: '',
  notes: ''
};
export const DIE_CODE_SERIES = { key: 'DAO', width: 4 };

const fail = (message: string): never => {
  throw new Error(message);
};
const text = (value: unknown, label: string, max: number, required = false) => {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max)
    fail(`${label}${required ? ' bắt buộc,' : ''} tối đa ${max} ký tự.`);
  return result;
};
const measure = (value: unknown, label: string, { min = 0, max = 10_000, integer = false } = {}) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result)))
    fail(`${label} phải là ${integer ? 'số nguyên' : 'số'} từ ${min} đến ${max}.`);
  return result;
};

/** Checks a die the user entered; measures are in millimetres and counts are whole numbers. */
export function validateDieInput(raw: Record<string, unknown>): DieInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Dữ liệu dao không hợp lệ.');
  if (!Object.hasOwn(DIE_CYLINDER_TYPES, String(raw.cylinderType))) fail('Chọn loại dao tròn (R) hoặc phẳng (D).');
  if (!Object.hasOwn(DIE_CORNERS, String(raw.corner))) fail('Chọn bo góc hoặc vuông góc.');
  if (typeof raw.perforated !== 'boolean') fail('Chọn có hoặc không răng cưa.');
  const corner = raw.corner as DieCorner;
  return {
    name: text(raw.name, 'Tên dao', 200, true),
    cylinderType: raw.cylinderType as DieCylinderType,
    cylinderSize: measure(raw.cylinderSize, 'Cỡ trục dao', { min: 1, max: 2000 }),
    labelWidth: measure(raw.labelWidth, 'Chiều rộng tem', { min: 0.1 }),
    labelHeight: measure(raw.labelHeight, 'Chiều cao tem', { min: 0.1 }),
    corner,
    cornerRadius: corner === 'rounded' ? measure(raw.cornerRadius, 'Bán kính bo góc', { min: 0.1, max: 100 }) : 0,
    perforated: raw.perforated as boolean,
    labelsAcross: measure(raw.labelsAcross, 'Số tem trên một hàng ngang', { min: 1, max: 100, integer: true }),
    labelsAround: measure(raw.labelsAround, 'Số tem trên một hàng dọc', { min: 1, max: 100, integer: true }),
    gapAcross: measure(raw.gapAcross, 'Khoảng cách giữa các tem ngang', { max: 1000 }),
    gapAround: measure(raw.gapAround, 'Khoảng cách giữa các tem dọc', { max: 1000 }),
    storageLocation: text(raw.storageLocation, 'Vị trí cất dao', 200),
    notes: text(raw.notes, 'Mô tả đặc thù', 2000)
  };
}

const mm = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** Short readings of a die for tables and LSX: `R100`, `40 × 30 mm`, `Bo góc R2`, `4 × 2 tem`. */
export const dieCylinderLabel = (die: Pick<DieInput, 'cylinderType' | 'cylinderSize'>) =>
  die.cylinderType === 'R' ? `R${mm(die.cylinderSize)}` : `${mm(die.cylinderSize)}D`;
export const dieLabelSize = (die: Pick<DieInput, 'labelWidth' | 'labelHeight'>) =>
  `${mm(die.labelWidth)} × ${mm(die.labelHeight)} mm`;
export const dieCornerLabel = (die: Pick<DieInput, 'corner' | 'cornerRadius'>) =>
  die.corner === 'rounded' ? `Bo góc R${mm(die.cornerRadius)}` : 'Vuông góc';
export const dieLayoutLabel = (die: Pick<DieInput, 'labelsAcross' | 'labelsAround'>) =>
  `${die.labelsAcross} ngang × ${die.labelsAround} dọc`;
export const dieGapLabel = (die: Pick<DieInput, 'gapAcross' | 'gapAround'>) =>
  `${mm(die.gapAcross)} / ${mm(die.gapAround)} mm`;
