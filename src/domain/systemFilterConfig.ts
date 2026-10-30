import type { LeadFilterDefinition } from '@/features/crm/model/crmModels';
import type { CustomerFilterDefinition } from '@/features/crm/model/customerFilterConfig';
import { CUSTOMER_FILTER_IDS } from '@/features/crm/model/customerFilterConfig';
import { LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';

export type SystemFilterScope = 'lead_list' | 'customer_data' | 'crm_customers';
export type SystemFilterSourceType = 'manual_catalog' | 'system_data';
export type SystemFilterControlType = 'multi_select' | 'boolean';

export interface SystemFilterDefinition {
  id: string;
  name: string;
  description: string;
  active: boolean;
  scopes: SystemFilterScope[];
  availableScopes: SystemFilterScope[];
  sourceType: SystemFilterSourceType;
  controlType: SystemFilterControlType;
  optionsEditable: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const SYSTEM_FILTER_SCOPE_LABELS: Record<SystemFilterScope, string> = {
  lead_list: 'Danh sách KH tiềm năng',
  customer_data: 'Dữ liệu khách hàng',
  crm_customers: 'Khách hàng hợp tác'
};

const definition = (
  id: string,
  name: string,
  description: string,
  scopes: SystemFilterScope[],
  availableScopes: SystemFilterScope[],
  sourceType: SystemFilterSourceType,
  optionsEditable = false,
  controlType: SystemFilterControlType = 'multi_select'
): SystemFilterDefinition => ({
  id,
  name,
  description,
  active: true,
  scopes,
  availableScopes,
  sourceType,
  controlType,
  optionsEditable
});

export const DEFAULT_SYSTEM_FILTER_DEFINITIONS: SystemFilterDefinition[] = [
  definition(
    LEAD_FILTER_IDS.companySize,
    'Quy mô',
    'Phân loại quy mô doanh nghiệp.',
    ['lead_list'],
    ['lead_list'],
    'manual_catalog',
    true
  ),
  definition(
    LEAD_FILTER_IDS.progress,
    'Tiến độ',
    'Tiến độ tiếp cận và phát triển cơ hội.',
    ['lead_list'],
    ['lead_list'],
    'manual_catalog',
    true
  ),
  definition(
    LEAD_FILTER_IDS.productNeed,
    'Nhu cầu',
    'Nhóm sản phẩm hoặc dịch vụ khách hàng quan tâm.',
    ['lead_list'],
    ['lead_list'],
    'manual_catalog',
    true
  ),
  definition(
    LEAD_FILTER_IDS.province,
    'Tỉnh/thành',
    'Lọc riêng theo tỉnh/thành của doanh nghiệp.',
    ['lead_list', 'customer_data', 'crm_customers'],
    ['lead_list', 'customer_data', 'crm_customers'],
    'manual_catalog',
    false
  ),
  definition(
    LEAD_FILTER_IDS.industrialPark,
    'Khu công nghiệp',
    'Lọc theo KCN đã cấu hình cho từng tỉnh/thành.',
    ['lead_list', 'customer_data', 'crm_customers'],
    ['lead_list', 'customer_data', 'crm_customers'],
    'manual_catalog',
    true
  ),
  definition(
    LEAD_FILTER_IDS.source,
    'Nguồn',
    'Nguồn hình thành dữ liệu khách hàng.',
    ['lead_list', 'customer_data'],
    ['lead_list', 'customer_data'],
    'manual_catalog',
    true
  ),
  definition(
    CUSTOMER_FILTER_IDS.sale,
    'Sale phụ trách',
    'Tài khoản Sale đang được phân công.',
    ['customer_data', 'crm_customers'],
    ['customer_data', 'crm_customers'],
    'system_data'
  ),
  definition(
    'contact_result',
    'Trạng thái liên hệ',
    'Kết quả liên hệ gần nhất của dữ liệu khách hàng.',
    ['customer_data'],
    ['customer_data'],
    'system_data'
  ),
  definition(
    'potential_level',
    'Mức độ tiềm năng',
    'Đánh giá mức độ phù hợp và tiềm năng.',
    ['customer_data'],
    ['customer_data'],
    'system_data'
  ),
  definition(
    'pinned',
    'Dữ liệu đã ghim',
    'Chỉ hiển thị dữ liệu được đánh dấu ưu tiên.',
    ['customer_data'],
    ['customer_data'],
    'system_data',
    false,
    'boolean'
  ),
  definition(
    CUSTOMER_FILTER_IDS.rank,
    'Hạng khách hàng',
    'Hạng khách hàng đang lưu trong CRM.',
    ['crm_customers'],
    ['crm_customers'],
    'system_data'
  ),
  definition(
    CUSTOMER_FILTER_IDS.poTime,
    'Thời gian phát sinh đơn hàng',
    'Khoảng thời gian khách hàng phát sinh đơn hàng.',
    ['crm_customers'],
    ['crm_customers'],
    'system_data'
  ),
  definition(
    CUSTOMER_FILTER_IDS.product,
    'Sản phẩm đã mua',
    'Sản phẩm lấy từ hồ sơ khách hàng và đơn hàng.',
    ['crm_customers'],
    ['crm_customers'],
    'system_data'
  )
];

export const mergeSystemFilterDefinitions = (
  stored: SystemFilterDefinition[] = [],
  leadDefinitions: LeadFilterDefinition[] = [],
  customerDefinitions: CustomerFilterDefinition[] = []
): SystemFilterDefinition[] => {
  const storedById = new Map(stored.map(item => [item.id, item]));
  const leadById = new Map(leadDefinitions.map(item => [item.id, item]));
  const customerById = new Map(customerDefinitions.map(item => [item.id, item]));
  const defaults = DEFAULT_SYSTEM_FILTER_DEFINITIONS.map(defaultItem => {
    const leadItem = leadById.get(defaultItem.id);
    const customerItem = customerById.get(defaultItem.id);
    const sourceOverlay = leadItem
      ? { name: leadItem.name, active: leadItem.active }
      : customerItem
        ? { name: customerItem.name, description: customerItem.description, active: customerItem.active }
        : {};
    const storedItem = storedById.get(defaultItem.id);
    return {
      ...defaultItem,
      ...sourceOverlay,
      ...storedItem,
      id: defaultItem.id,
      availableScopes: defaultItem.availableScopes,
      scopes: (storedItem?.scopes || defaultItem.scopes).filter(scope => defaultItem.availableScopes.includes(scope))
    };
  });
  const defaultIds = new Set(defaults.map(item => item.id));
  const extraLeadDefinitions = leadDefinitions
    .filter(item => !defaultIds.has(item.id))
    .map(item => {
      const storedItem = storedById.get(item.id);
      return {
        id: item.id,
        name: storedItem?.name || item.name,
        description: storedItem?.description || 'Tiêu chí phân loại tùy chỉnh dành cho danh sách Lead.',
        active: storedItem?.active ?? item.active,
        scopes: storedItem?.scopes?.includes('lead_list') ? (['lead_list'] as SystemFilterScope[]) : [],
        availableScopes: ['lead_list'] as SystemFilterScope[],
        sourceType: 'manual_catalog' as const,
        controlType: item.type === 'checkbox' ? ('boolean' as const) : ('multi_select' as const),
        optionsEditable: true,
        updatedAt: storedItem?.updatedAt,
        updatedBy: storedItem?.updatedBy
      };
    });
  const knownIds = new Set([...defaultIds, ...extraLeadDefinitions.map(item => item.id)]);
  const archivedUnknown = stored.filter(item => !knownIds.has(item.id)).map(item => ({ ...item, active: false }));
  return [...defaults, ...extraLeadDefinitions, ...archivedUnknown];
};

export const isSystemFilterEnabled = (
  definitions: SystemFilterDefinition[],
  filterId: string,
  scope: SystemFilterScope
): boolean => {
  const definitionItem = definitions.find(item => item.id === filterId);
  return definitionItem ? definitionItem.active && definitionItem.scopes.includes(scope) : true;
};

export const getSystemFilterDefinition = (
  definitions: SystemFilterDefinition[],
  filterId: string
): SystemFilterDefinition | undefined => definitions.find(item => item.id === filterId);
