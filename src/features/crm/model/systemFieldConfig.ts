import type { EntityFieldTable } from './entityFieldConfig.js';

export interface SystemFieldSpec {
  key: string;
  label: string;
  kind: 'input' | 'linked' | 'computed';
  /** Non-hideable columns identify the record or drive the workflow. */
  protected?: boolean;
  reason: string;
  aliases?: string[];
  formOnly?: boolean;
}

const input = (key: string, label: string, aliases: string[] = [], protectedField = false): SystemFieldSpec => ({
  key, label, aliases, kind: 'input', protected: protectedField,
  reason: 'Có thể đổi tên hiển thị; mã trường, kiểu dữ liệu và kiểm tra nhập liệu được giữ nguyên.'
});
const linked = (key: string, label: string, aliases: string[] = []): SystemFieldSpec => ({
  key, label, aliases, kind: 'linked',
  reason: 'Giá trị liên kết với hồ sơ hoặc danh mục khác. Không đổi mã trường, kiểu dữ liệu hoặc quy tắc phân quyền.'
});
const computed = (key: string, label: string, aliases: string[] = []): SystemFieldSpec => ({
  key, label, aliases, kind: 'computed',
  reason: 'Hệ thống tổng hợp từ nghiệp vụ. Chỉ chỉnh cách hiển thị, không nhập tay hoặc thay công thức.'
});

const formFields = (fields: Array<[string, string, string[]?]>): SystemFieldSpec[] => fields.map(([key, label, aliases]) => ({ ...input(key, label, aliases), formOnly: true }));
const commonFormFields = formFields([
  ['taxCode', 'Mã số thuế'], ['contactPerson', 'Người liên hệ'], ['contactPosition', 'Chức vụ'],
  ['phone', 'Điện thoại'], ['email', 'Email'], ['website', 'Website'],
  ['businessSector', 'Lĩnh vực hoạt động'], ['address', 'Địa chỉ doanh nghiệp', ['Địa chỉ']],
  ['expectedProducts', 'Sản phẩm / nhu cầu quan tâm'], ['note', 'Ghi chú']
]);

export const SYSTEM_FIELD_CATALOG: Record<EntityFieldTable, SystemFieldSpec[]> = {
  lead_candidates: [
    input('companyName', 'Doanh nghiệp', ['Tên doanh nghiệp'], true),
    linked('province', 'Tỉnh/thành', ['Tỉnh / thành']),
    input('contact', 'Thông tin liên hệ', ['Liên hệ']),
    { ...linked('assignedSaleId', 'Sale phụ trách', ['Người phụ trách']), protected: true },
    computed('processing', 'Sale đang xử lý'),
    linked('contactResult', 'Trạng thái liên hệ', ['Trạng thái']),
    linked('potentialLevel', 'Mức độ tiềm năng'),
    linked('nextContactAt', 'Lịch tiếp theo', ['Lịch hẹn', 'Lịch hẹn xử lý']),
    computed('latest', 'Cập nhật gần nhất'), ...commonFormFields,
    ...formFields([['source', 'Nguồn tìm kiếm'], ['sourceUrl', 'Đường dẫn nguồn']]),
    { ...linked('ward', 'Phường / xã'), formOnly: true },
    { ...linked('industrialPark', 'Khu công nghiệp'), formOnly: true }
  ],
  leads: [
    input('companyName', 'Doanh nghiệp', ['Tên doanh nghiệp'], true),
    input('contact', 'Liên hệ'),
    linked('source', 'Nguồn / khu vực'),
    input('potentialValue', 'Giá trị tiềm năng', ['Giá trị tiềm năng (đ)']),
    linked('assignedSaleId', 'Sale phụ trách'),
    linked('nextFollowUpAt', 'Chăm sóc tiếp', ['Lịch chăm sóc tiếp theo']), ...commonFormFields.map(field => field.key === 'taxCode' ? { ...field, protected: true } : field),
    { ...linked('discoveredById', 'Sale tìm được Lead'), formOnly: true },
    { ...linked('stage', 'Giai đoạn xử lý'), formOnly: true }
  ],
  customers: [
    input('companyName', 'Khách hàng', ['Tên công ty'], true),
    input('customerCode', 'Mã khách hàng', ['Mã KH'], true),
    linked('customerRank', 'Phân loại', ['Hạng khách hàng']),
    input('taxCode', 'Mã số thuế'),
    input('phone', 'Số điện thoại', ['SĐT']),
    input('email', 'Email', ['Mail', 'Email:']),
    linked('assignedSaleId', 'Sale phụ trách'),
    computed('businessResult', 'Kết quả kinh doanh'),
    linked('materials', 'Nguyên vật liệu gốc', ['NVL gốc']),
    { ...linked('province', 'Tỉnh / thành'), formOnly: true },
    { ...linked('ward', 'Phường / xã'), formOnly: true },
    { ...linked('industrialPark', 'Khu công nghiệp'), formOnly: true },
    ...formFields([
      ['contactPerson', 'Người liên hệ'], ['procurementPhone', 'SĐT thu mua'],
      ['warehousePhone', 'SĐT nhận hàng / kho'], ['bankAccount', 'Tài khoản ngân hàng'],
      ['address', 'Địa chỉ giao hàng', ['Địa chỉ chi tiết / giao hàng']],
      ['discountType', 'Hình thức chiết khấu'], ['debtLimit', 'Hạn mức công nợ (đ)'],
      ['paymentTerms', 'Điều khoản thanh toán'], ['note', 'Ghi chú yêu cầu riêng']
    ])
  ]
};

export interface SystemFieldOverride {
  key: string;
  label: string;
  description: string;
  visible: boolean;
  removed: boolean;
  order: number;
}
export type SystemFieldOverrides = Record<string, SystemFieldOverride>;

export function resolveSystemFields(table: EntityFieldTable, raw: unknown): SystemFieldOverride[] {
  const overrides = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return SYSTEM_FIELD_CATALOG[table].map((field, index) => {
    const value = overrides[field.key];
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      key: field.key,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 100) : field.label,
      description: typeof item.description === 'string' ? item.description.trim().slice(0, 500) : '',
      visible: item.removed === true ? false : !field.formOnly && (field.protected || item.visible !== false),
      removed: item.removed === true && !field.protected,
      order: typeof item.order === 'number' && Number.isFinite(item.order) ? Math.max(0, item.order) : index * 10
    };
  });
}

/** Server and UI share this allowlist; callers cannot alter storage keys/types. */
export function validateSystemFieldOverrides(table: EntityFieldTable, raw: unknown): SystemFieldOverrides {
  if (!Object.hasOwn(SYSTEM_FIELD_CATALOG, table)) throw new Error('Bảng không được hỗ trợ.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Cấu hình trường không hợp lệ.');
  const source = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(source)) {
    const spec = SYSTEM_FIELD_CATALOG[table].find(field => field.key === key);
    if (!spec || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Trường hệ thống không hợp lệ.');
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some(property => !['key', 'label', 'description', 'visible', 'removed', 'order'].includes(property))) throw new Error('Không được thay đổi cấu trúc trường hệ thống.');
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 100) throw new Error('Tên trường cần từ 1 đến 100 ký tự.');
    if (typeof item.description !== 'string' || item.description.length > 500) throw new Error('Mô tả tối đa 500 ký tự.');
    if (typeof item.visible !== 'boolean' || (spec.protected && !spec.formOnly && !item.visible)) throw new Error('Không thể ẩn trường nhận diện hồ sơ.');
    if (typeof item.removed !== 'boolean' || (spec.protected && item.removed)) throw new Error('Không thể xóa trường bắt buộc hoặc trường nhận diện hồ sơ.');
    if (typeof item.order !== 'number' || !Number.isFinite(item.order) || item.order < 0) throw new Error('Thứ tự không hợp lệ.');
  }
  const result = resolveSystemFields(table, source);
  if (new Set(result.map(field => field.label.toLocaleLowerCase('vi'))).size !== result.length) throw new Error('Tên hiển thị của các trường không được trùng nhau.');
  return Object.fromEntries(result.map(field => [field.key, field]));
}
