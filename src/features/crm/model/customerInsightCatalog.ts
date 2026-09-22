export type CustomerInsightModule = 'customer_data' | 'leads' | 'crm' | 'sales';

export interface CustomerInsightItem {
  id: string;
  label: string;
  module: CustomerInsightModule;
  derived?: 'pending_order_draft';
}

export interface CustomerInsightGroup {
  id: string;
  label: string;
  items: CustomerInsightItem[];
}

const item = (id: string, label: string, module: CustomerInsightModule, derived?: CustomerInsightItem['derived']): CustomerInsightItem => ({ id, label, module, derived });

export const CUSTOMER_INSIGHT_GROUPS: CustomerInsightGroup[] = [
  { id: 'order_progress', label: 'Tiến độ mẫu / đơn hàng / PO', items: [
    item('po_promised', 'Khách hẹn lên PO', 'leads', 'pending_order_draft'),
    item('sample_reviewing', 'Khách đang duyệt mẫu', 'leads'),
    item('sample_test_ok', 'Khách test mẫu OK', 'leads'),
    item('sample_test_not_ok', 'Khách test mẫu chưa OK', 'leads'),
    item('sample_planning', 'Khách đang làm mẫu hoặc đang kế hoạch làm mẫu', 'leads'),
    item('sample_promised_not_received', 'Khách hẹn cho mẫu nhưng chưa cho', 'leads'),
    item('sample_sent', 'Khách đã gửi mẫu', 'leads'),
    item('product_info_provided', 'Khách đã cho thông tin sản phẩm', 'leads')
  ]},
  { id: 'commercial_price', label: 'Giá / điều kiện thương mại', items: [
    item('target_price_provided', 'Khách cho giá target', 'leads'),
    item('target_price_promised', 'Khách hứa cho giá target', 'leads'),
    item('price_low', 'Khách giá thấp', 'leads'),
    item('price_high', 'Khách giá cao', 'leads'),
    item('price_surveying', 'Khách đi khảo giá', 'leads')
  ]},
  { id: 'contact_interaction', label: 'Liên hệ / tương tác với khách', items: [
    item('no_information', 'Khách chưa khai thác được thông tin gì', 'customer_data'),
    item('no_buyer_contact', 'Khách không cho contact người mua', 'customer_data'),
    item('asks_email', 'Khách báo gửi Gmail', 'customer_data'),
    item('zalo_connected_no_interaction', 'Khách đã kết bạn Zalo nhưng không tương tác', 'leads'),
    item('zalo_unconfirmed', 'Khách chưa xác nhận Zalo', 'customer_data'),
    item('zalo_interacting', 'Khách đã kết bạn Zalo và có tương tác', 'leads'),
    item('enthusiastic', 'Khách nhiệt tình', 'leads'),
    item('indifferent', 'Khách hời hợt', 'leads'),
    item('contact_later', 'Khách hẹn dịp sau liên hệ', 'leads'),
    item('meeting_agreed', 'Khách cho hẹn gặp', 'leads'),
    item('onsite_required', 'Khách cần qua trực tiếp làm việc', 'leads'),
    item('remote_possible', 'Khách có thể xử lý từ xa', 'leads'),
    item('contact_left_company', 'Khách nghỉ công ty', 'customer_data')
  ]},
  { id: 'usage_scale', label: 'Quy mô / mức sử dụng', items: [
    item('usage_low', 'Khách dùng ít', 'leads'), item('usage_5_10m', 'Khách dùng 5 tới 10 triệu', 'leads'),
    item('usage_10_20m', 'Khách dùng 10 tới 20 triệu', 'leads'), item('usage_tens_millions', 'Khách dùng vài chục triệu', 'leads'),
    item('usage_near_100m', 'Khách dùng gần trăm tới hơn trăm triệu', 'leads'), item('usage_100m_plus', 'Khách từ 100 triệu trở lên', 'leads')
  ]},
  { id: 'supplier_competition', label: 'Quan hệ NCC / tình trạng cạnh tranh', items: [
    item('supplier_designated', 'Khách báo bị chỉ định', 'leads'), item('supplier_change_refused', 'Khách không muốn đổi NCC', 'leads'),
    item('uses_company_products', 'Khách có sử dụng sản phẩm của công ty', 'leads'), item('sold_by_company', 'Khách công ty đã bán', 'leads'),
    item('sold_by_close_partner', 'Khách đối tác thân cận đã bán', 'leads'), item('handled_by_other_sale', 'Khách sale khác đang chăm sóc', 'leads')
  ]},
  { id: 'special_requirements', label: 'Yêu cầu / điều kiện đặc biệt', items: [
    item('hard_to_source_material', 'Khách khó tìm nguyên vật liệu', 'leads'), item('certificate_required', 'Khách yêu cầu chứng chỉ', 'leads'),
    item('schedule_required', 'Khách yêu cầu về tiến độ', 'leads'), item('strict_quality_required', 'Khách yêu cầu kỹ về chất lượng', 'leads'),
    item('nearby_supplier_required', 'Khách yêu cầu khoảng cách gần', 'leads'), item('industry_reference_required', 'Khách yêu cầu đã từng bán cho khách cùng nhóm ngành', 'leads'),
    item('factory_audit_required', 'Khách cần audit nhà xưởng', 'leads')
  ]},
  { id: 'product_needs', label: 'Sản phẩm / nhu cầu', items: [
    item('buys_machinery', 'Khách mua máy móc', 'leads'), item('buys_labels', 'Khách mua tem nhãn', 'leads'), item('buys_ink', 'Khách mua mực in', 'leads')
  ]},
  { id: 'industry', label: 'Ngành nghề khách hàng', items: [
    item('industry_garment', 'Khách may mặc', 'customer_data'), item('industry_electronics', 'Khách điện tử', 'customer_data'),
    item('industry_food_beverage', 'Khách thực phẩm và đồ uống', 'customer_data'), item('industry_packaging', 'Khách bao bì', 'customer_data'),
    item('industry_medical', 'Khách y tế', 'customer_data'), item('industry_logistics', 'Khách logistics / vận tải', 'customer_data'),
    item('industry_pharma_cosmetics', 'Khách dược phẩm / mỹ phẩm', 'customer_data'), item('industry_agriculture', 'Khách nông nghiệp và chăn nuôi', 'customer_data'),
    item('industry_household_metal', 'Khách gia dụng và kim khí', 'customer_data'), item('industry_automotive', 'Khách ô tô và xe máy', 'customer_data'),
    item('industry_chemicals_paint', 'Khách hóa chất / sơn', 'customer_data')
  ]}
];

export const CUSTOMER_INSIGHT_ITEMS = CUSTOMER_INSIGHT_GROUPS.flatMap(group => group.items);
export const CUSTOMER_INSIGHT_ITEM_BY_ID = new Map(CUSTOMER_INSIGHT_ITEMS.map(entry => [entry.id, entry]));

export const getCustomerInsightGroupsForModule = (module: CustomerInsightModule) => (
  module === 'customer_data' || module === 'leads'
    ? CUSTOMER_INSIGHT_GROUPS
    : []
);

export const normalizeCustomerInsightValues = (value: unknown): string[] => Array.from(new Set(
  (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === 'string' && CUSTOMER_INSIGHT_ITEM_BY_ID.has(entry))
));

export const matchesCustomerInsightValues = (values: string[], selected: string[]) => {
  if (selected.length === 0) return true;
  return CUSTOMER_INSIGHT_GROUPS
    .map(group => group.items.map(entry => entry.id).filter(id => selected.includes(id)))
    .filter(groupValues => groupValues.length > 0)
    .every(groupValues => groupValues.some(value => values.includes(value)));
};

export const replaceCustomerInsightGroupValues = (current: string[], groupItemIds: string[], nextGroupValues: string[]) => {
  const groupItemIdSet = new Set(groupItemIds);
  return Array.from(new Set([
    ...current.filter(value => !groupItemIdSet.has(value)),
    ...nextGroupValues
  ]));
};

export const getCustomerInsightNavigation = (itemId: string) => {
  const entry = CUSTOMER_INSIGHT_ITEM_BY_ID.get(itemId);
  return entry ? { pageId: entry.module, insightItemId: entry.id } : null;
};
