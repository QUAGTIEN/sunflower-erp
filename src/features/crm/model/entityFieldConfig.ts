export type EntityFieldTable = 'lead_candidates' | 'leads' | 'customers';

export type EntityCustomFieldType =
  | 'text'
  | 'textarea'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'phone'
  | 'email'
  | 'url';

export type EntityFieldRole = 'admin' | 'sale' | 'designer' | 'purchaser' | 'producer' | 'accountant';
export type EntityCustomFieldValue = string | number | boolean | string[] | null;
export type EntityCustomFieldValues = Record<string, EntityCustomFieldValue>;

export interface EntityCustomFieldOption {
  id: string;
  label: string;
  active: boolean;
}

export interface EntityFieldDefinition extends Record<string, unknown> {
  id: string;
  fieldKey: string;
  table: EntityFieldTable;
  name: string;
  description: string;
  type: EntityCustomFieldType;
  options: EntityCustomFieldOption[];
  required: boolean;
  active: boolean;
  defaultVisible: boolean;
  searchable: boolean;
  filterable: boolean;
  viewRoles: EntityFieldRole[];
  editRoles: EntityFieldRole[];
  order: number;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
}

export const ENTITY_FIELD_TABLE_LABELS: Record<EntityFieldTable, string> = {
  lead_candidates: 'Tất cả Dữ liệu thô',
  leads: 'Danh sách Lead',
  customers: 'Tất cả Khách hàng'
};

export const ENTITY_SYSTEM_FIELD_LABELS: Record<EntityFieldTable, string[]> = {
  lead_candidates: ['Doanh nghiệp', 'Mã số thuế', 'Tỉnh/thành', 'Thông tin liên hệ', 'Sale phụ trách', 'Trạng thái liên hệ', 'Mức độ tiềm năng', 'Lịch tiếp theo', 'Cập nhật gần nhất'],
  leads: ['Doanh nghiệp', 'Mã số thuế', 'Liên hệ', 'Nguồn / khu vực', 'Giá trị tiềm năng', 'Sale phụ trách', 'Chăm sóc tiếp', 'Giai đoạn xử lý'],
  customers: ['Khách hàng', 'Mã khách hàng', 'Phân loại', 'Mã số thuế', 'Số điện thoại', 'Email', 'Sale phụ trách', 'Kết quả kinh doanh', 'Nguyên vật liệu gốc']
};

export const ENTITY_FIELD_TYPE_LABELS: Record<EntityCustomFieldType, string> = {
  text: 'Văn bản ngắn',
  textarea: 'Văn bản dài',
  integer: 'Số nguyên',
  decimal: 'Số thập phân',
  currency: 'Tiền tệ',
  percent: 'Phần trăm',
  date: 'Ngày',
  datetime: 'Ngày và giờ',
  single_select: 'Danh sách chọn một',
  multi_select: 'Danh sách chọn nhiều',
  boolean: 'Có / Không',
  phone: 'Số điện thoại',
  email: 'Email',
  url: 'Đường dẫn'
};

export const ENTITY_FIELD_ROLES: Array<{ id: EntityFieldRole; label: string }> = [
  { id: 'admin', label: 'Giám đốc/Admin' },
  { id: 'sale', label: 'Sale' },
  { id: 'designer', label: 'Thiết kế' },
  { id: 'purchaser', label: 'Mua hàng' },
  { id: 'producer', label: 'Sản xuất' },
  { id: 'accountant', label: 'Kế toán' }
];

const ALL_ROLES = ENTITY_FIELD_ROLES.map(role => role.id);
const TABLES: EntityFieldTable[] = ['lead_candidates', 'leads', 'customers'];
const TYPES = Object.keys(ENTITY_FIELD_TYPE_LABELS) as EntityCustomFieldType[];

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const asText = (value: unknown): string => typeof value === 'string' ? value : '';

const normalizeRoles = (value: unknown): EntityFieldRole[] => {
  if (!Array.isArray(value)) return [...ALL_ROLES];
  const roles = value.filter((role): role is EntityFieldRole => ALL_ROLES.includes(role as EntityFieldRole));
  return Array.from(new Set(['admin' as EntityFieldRole, ...roles]));
};

export const slugifyEntityFieldKey = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 48);

export const normalizeEntityCustomFieldValues = (value: unknown): EntityCustomFieldValues => {
  const source = asRecord(value);
  return Object.entries(source).reduce<EntityCustomFieldValues>((result, [key, fieldValue]) => {
    if (Array.isArray(fieldValue)) {
      result[key] = fieldValue.map(item => String(item)).filter(Boolean);
      return result;
    }
    if (typeof fieldValue === 'string' || typeof fieldValue === 'number' || typeof fieldValue === 'boolean' || fieldValue === null) {
      result[key] = fieldValue;
    }
    return result;
  }, {});
};

export const normalizeEntityFieldDefinition = (value: unknown): EntityFieldDefinition => {
  const source = asRecord(value);
  const table = TABLES.includes(source.table as EntityFieldTable) ? source.table as EntityFieldTable : 'lead_candidates';
  const type = TYPES.includes(source.type as EntityCustomFieldType) ? source.type as EntityCustomFieldType : 'text';
  const options = Array.isArray(source.options) ? source.options.map((item, index) => {
    const option = asRecord(item);
    return {
      id: asText(option.id) || `option_${index + 1}`,
      label: asText(option.label),
      active: option.active !== false
    };
  }).filter(option => option.label) : [];
  const id = asText(source.id);
  const name = asText(source.name);
  return {
    ...source,
    id,
    fieldKey: asText(source.fieldKey) || slugifyEntityFieldKey(name) || id,
    table,
    name,
    description: asText(source.description),
    type,
    options,
    required: source.required === true,
    active: source.active !== false,
    defaultVisible: source.defaultVisible === true,
    searchable: source.searchable === true,
    filterable: source.filterable === true,
    viewRoles: normalizeRoles(source.viewRoles),
    editRoles: normalizeRoles(source.editRoles),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    createdAt: asText(source.createdAt),
    createdById: asText(source.createdById),
    createdByName: asText(source.createdByName),
    updatedAt: asText(source.updatedAt),
    updatedById: asText(source.updatedById),
    updatedByName: asText(source.updatedByName)
  };
};

export const normalizeEntityFieldDefinitions = (value: unknown): EntityFieldDefinition[] => (
  Array.isArray(value)
    ? value.map(normalizeEntityFieldDefinition).filter(definition => definition.id && definition.name)
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'vi'))
    : []
);

export const canViewEntityField = (definition: EntityFieldDefinition, role: EntityFieldRole): boolean => (
  role === 'admin' || definition.viewRoles.includes(role)
);

export const canEditEntityField = (definition: EntityFieldDefinition, role: EntityFieldRole): boolean => (
  role === 'admin' || definition.editRoles.includes(role)
);

export const coerceEntityCustomFieldValue = (
  definition: EntityFieldDefinition,
  value: EntityCustomFieldValue | undefined
): EntityCustomFieldValue => {
  if (definition.type === 'multi_select') {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  }
  if (definition.type === 'boolean') return value === true;
  if (['integer', 'decimal', 'currency', 'percent'].includes(definition.type)) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return definition.type === 'integer' ? Math.round(parsed) : parsed;
  }
  return value === null || value === undefined ? '' : String(value);
};

export const formatEntityCustomFieldValue = (
  definition: EntityFieldDefinition,
  value: EntityCustomFieldValue | undefined
): string => {
  if (value === null || value === undefined || value === '') return 'Chưa cập nhật';
  if (definition.type === 'boolean') return value === true ? 'Có' : 'Không';
  if (Array.isArray(value)) {
    return value.map(optionId => definition.options.find(option => option.id === optionId)?.label || optionId).join(', ') || 'Chưa cập nhật';
  }
  if (definition.type === 'single_select') {
    return definition.options.find(option => option.id === String(value))?.label || String(value);
  }
  if (definition.type === 'currency') {
    return `${Number(value || 0).toLocaleString('vi-VN')} đ`;
  }
  if (definition.type === 'percent') return `${Number(value || 0).toLocaleString('vi-VN')}%`;
  if (definition.type === 'date' || definition.type === 'datetime') {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) {
      return definition.type === 'date' ? parsed.toLocaleDateString('vi-VN') : parsed.toLocaleString('vi-VN');
    }
  }
  return String(value);
};

export const getEntityCustomFieldSearchValues = (
  definitions: EntityFieldDefinition[],
  values: EntityCustomFieldValues | undefined
): string[] => definitions.filter(definition => definition.active && definition.searchable)
  .map(definition => formatEntityCustomFieldValue(definition, values?.[definition.id]));

export const getEntityCustomFieldFilterTokens = (
  definition: EntityFieldDefinition,
  value: EntityCustomFieldValue | undefined
): string[] => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return [String(value)];
};

export const getEntityCustomFieldFilterLabel = (definition: EntityFieldDefinition, token: string): string => {
  if (definition.type === 'single_select' || definition.type === 'multi_select') {
    return definition.options.find(option => option.id === token)?.label || token;
  }
  if (definition.type === 'boolean') return token === 'true' ? 'Có' : 'Không';
  return formatEntityCustomFieldValue(definition, token);
};

export const isEntityCustomFieldValueEmpty = (value: EntityCustomFieldValue | undefined): boolean => (
  value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
);

export const getMissingRequiredEntityFields = (
  definitions: EntityFieldDefinition[],
  values: EntityCustomFieldValues,
  role?: EntityFieldRole
): EntityFieldDefinition[] => definitions.filter(definition => (
  definition.active
  && definition.required
  && (!role || canEditEntityField(definition, role))
  && isEntityCustomFieldValueEmpty(values[definition.id])
));
