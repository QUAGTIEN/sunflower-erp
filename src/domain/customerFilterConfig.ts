export const CUSTOMER_FILTER_IDS = {
  sale: 'assigned_sale',
  rank: 'customer_rank',
  province: 'province',
  poTime: 'po_time',
  product: 'purchased_product'
} as const;

export interface CustomerFilterDefinition {
  id: string;
  name: string;
  description: string;
  active: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_CUSTOMER_FILTER_DEFINITIONS: CustomerFilterDefinition[] = [
  {
    id: CUSTOMER_FILTER_IDS.sale,
    name: 'Sale phụ trách',
    description: 'Có thể chọn đồng thời nhiều Sale.',
    active: true
  },
  {
    id: CUSTOMER_FILTER_IDS.rank,
    name: 'Hạng khách hàng',
    description: 'Kết hợp nhiều hạng trong cùng một danh sách.',
    active: true
  },
  {
    id: CUSTOMER_FILTER_IDS.province,
    name: 'Tỉnh/thành',
    description: 'Tỉnh/thành được lấy từ hồ sơ Lead hoặc địa chỉ khách hàng.',
    active: true
  },
  {
    id: CUSTOMER_FILTER_IDS.poTime,
    name: 'Thời gian phát sinh PO',
    description: 'Theo dõi khách đã mua gần đây hoặc chưa phát sinh PO.',
    active: true
  },
  {
    id: CUSTOMER_FILTER_IDS.product,
    name: 'Sản phẩm đã mua',
    description: 'Có thể chọn đồng thời nhiều mã hoặc tên sản phẩm.',
    active: true
  }
];

export const mergeCustomerFilterDefinitions = (
  stored: CustomerFilterDefinition[] = []
): CustomerFilterDefinition[] => {
  const storedById = new Map(stored.map(definition => [definition.id, definition]));
  return DEFAULT_CUSTOMER_FILTER_DEFINITIONS.map(defaultDefinition => ({
    ...defaultDefinition,
    ...storedById.get(defaultDefinition.id),
    id: defaultDefinition.id
  }));
};
