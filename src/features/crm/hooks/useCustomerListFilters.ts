import { useState } from 'react';
import {
  countAdvancedFilters,
  getAdvancedFilterKindForFieldType,
  getAdvancedFilterSummaries,
  matchesAdvancedFilters,
  toAdvancedFilterValues,
  type AdvancedFilterField,
  type AdvancedFilterState
} from '@/components/advancedDataFilterModel';
import { getSystemFilterDefinition, isSystemFilterEnabled } from '@/domain/systemFilterConfig';
import type { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import type { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import type { ErpDocument } from '@/shared/types';
import { parseValidDate } from '@/shared/utils/dateFormatting';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import type { CustomerRank, CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { CustomerMaterialUsage } from '@/features/crm/model/customerMaterialHistory';
import { CUSTOMER_FILTER_IDS, type CustomerFilterDefinition } from '@/features/crm/model/customerFilterConfig';
import {
  UNASSIGNED_FILTER_VALUE,
  normalizeFilterValue,
  type CrmFilterOption,
  type CrmTimeFilter
} from '@/features/crm/model/customerWorkspace';
import {
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldFilterTokens,
  getEntityCustomFieldSearchValues
} from '@/features/crm/model/entityFieldConfig';
import { VIETNAM_PROVINCES_2026 } from '@/features/crm/model/leadFilterConfig';

export interface CustomerListFilterInputs {
  /** Customers the current user may see (sales only see their own or unassigned ones). */
  accessibleCustomers: CustomerRecord[];
  accessibleCustomerIds: Set<string>;
  leads: LeadRecord[];
  pos: ErpDocument[];
  users: ErpDocument[];
  customFieldDefinitions: ReturnType<typeof useEntityFieldDefinitions>['definitions'];
  customerFilterById: Map<string, CustomerFilterDefinition>;
  systemFilterDefinitions: ReturnType<typeof useSystemFilterConfiguration>;
  inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
  customerMaterialsById: Record<string, CustomerMaterialUsage[]>;
  getCustomerOrders: (customerId: string) => ErpDocument[];
  getCustomerOrderValue: (customerId: string) => number;
  getCustomerOutstandingDebt: (customerId: string) => number | undefined;
  today: Date;
}

/**
 * Search, quick filters, advanced filters and pagination for the customer list.
 * Filter options and chips follow the admin filter configuration for `crm_customers`.
 */
export function useCustomerListFilters({
  accessibleCustomers,
  accessibleCustomerIds,
  leads,
  pos,
  users,
  customFieldDefinitions,
  customerFilterById,
  systemFilterDefinitions,
  inlineSystemFieldConfiguration,
  customerMaterialsById,
  getCustomerOrders,
  getCustomerOrderValue,
  getCustomerOutstandingDebt,
  today
}: CustomerListFilterInputs) {
  const [searchTerm, setSearchTerm] = useState('');
  const [saleFilters, setSaleFilters] = useState<string[]>([]);
  const [rankFilters, setRankFilters] = useState<string[]>([]);
  const [timeFilters, setTimeFilters] = useState<CrmTimeFilter[]>([]);
  const [provinceFilters, setProvinceFilters] = useState<string[]>([]);
  const [industrialParkFilters, setIndustrialParkFilters] = useState<string[]>([]);
  const [productFilters, setProductFilters] = useState<string[]>([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [showListFilters, setShowListFilters] = useState(false);
  const [customerPageSize, setCustomerPageSize] = useState(25);
  const [customerPage, setCustomerPage] = useState(1);

  const customFilterOptions = Object.fromEntries(
    customFieldDefinitions
      .filter(definition => definition.active)
      .map(definition => [
        definition.id,
        Array.from(
          new Set(
            accessibleCustomers.flatMap(customer =>
              getEntityCustomFieldFilterTokens(definition, customer.customFieldValues?.[definition.id])
            )
          )
        )
          .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
          .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
      ])
  );

  const currentYear = String(today.getFullYear());

  const leadById = new Map(leads.map(lead => [lead.id, lead] as const));
  const provinceByCustomerId = new Map<string, string>(
    accessibleCustomers.map(customer => {
      const customerProvince = customer.province?.trim();
      if (customerProvince) return [customer.id, customerProvince] as const;
      const linkedProvince = leadById.get(customer.sourceLeadId)?.province?.trim();
      if (linkedProvince) return [customer.id, linkedProvince] as const;
      const normalizedAddress = normalizeFilterValue(customer.address);
      const matchedProvince = VIETNAM_PROVINCES_2026.find(province =>
        normalizedAddress.includes(normalizeFilterValue(province))
      );
      return [customer.id, matchedProvince || ''] as const;
    })
  );
  const provinceFilterOptions: CrmFilterOption[] = Array.from(new Set(provinceByCustomerId.values()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'vi-VN'))
    .map(province => ({ value: province, label: province }));
  if (Array.from(provinceByCustomerId.values()).some(value => !value)) {
    provinceFilterOptions.push({ value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xác định tỉnh/thành' });
  }
  const industrialParkByCustomerId = new Map<string, string>(
    accessibleCustomers.map(customer => {
      const customerIndustrialPark = customer.industrialPark?.trim();
      if (customerIndustrialPark) return [customer.id, customerIndustrialPark] as const;
      return [customer.id, leadById.get(customer.sourceLeadId)?.industrialPark?.trim() || ''] as const;
    })
  );
  const industrialParkFilterOptions: CrmFilterOption[] = Array.from(new Set(industrialParkByCustomerId.values()))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'vi-VN'))
    .map(industrialPark => ({ value: industrialPark, label: industrialPark }));
  if (Array.from(industrialParkByCustomerId.values()).some(value => !value)) {
    industrialParkFilterOptions.push({ value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xác định KCN' });
  }

  const productLabels = new Map<string, string>();
  const productKeysByCustomerId = new Map(
    accessibleCustomers.map(customer => [customer.id, new Set<string>()] as const)
  );
  const registerCustomerProduct = (customerId: string, product: Record<string, unknown>) => {
    const productCode = String(product?.productCode || '').trim();
    const productName = String(product?.productName || '').trim();
    if (!productCode && !productName) return;
    const productKey = `${normalizeFilterValue(productCode)}::${normalizeFilterValue(productName)}`;
    productLabels.set(productKey, [productCode, productName].filter(Boolean).join(' · '));
    productKeysByCustomerId.get(customerId)?.add(productKey);
  };
  accessibleCustomers.forEach(customer => {
    (customer.products || []).forEach(product => registerCustomerProduct(customer.id, product));
  });
  pos.forEach(order => {
    if (order.deleted === true || !accessibleCustomerIds.has(order.customerId)) return;
    (Array.isArray(order.items) ? order.items : []).forEach((product: Record<string, unknown>) =>
      registerCustomerProduct(order.customerId, product)
    );
  });
  const productFilterOptions: CrmFilterOption[] = Array.from(productLabels.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'));
  const saleFilterOptions: CrmFilterOption[] = [
    ...users.filter(user => user.role === 'sale').map(user => ({ value: user.uid, label: user.displayName })),
    { value: UNASSIGNED_FILTER_VALUE, label: 'Chưa phân công' }
  ];
  const rankFilterOptions: CrmFilterOption[] = [
    ...(['A', 'B', 'C', 'D'] as CustomerRank[]).map(rank => ({ value: rank, label: `Hạng ${rank}` })),
    { value: UNASSIGNED_FILTER_VALUE, label: 'Chưa xếp hạng' }
  ];
  const timeFilterOptions: CrmFilterOption[] = [
    { value: 'last_30_days', label: 'Có đơn hàng trong 30 ngày' },
    { value: 'last_90_days', label: 'Có đơn hàng trong 90 ngày' },
    { value: 'this_year', label: `Có đơn hàng trong năm ${currentYear}` },
    { value: 'no_orders', label: 'Chưa có đơn hàng' }
  ];
  const saleFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.sale)!;
  const rankFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.rank)!;
  const provinceFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.province)!;
  const industrialParkFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.industrialPark)!;
  const poTimeFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.poTime)!;
  const productFilterDefinition = customerFilterById.get(CUSTOMER_FILTER_IDS.product)!;
  const saleFilterEnabled =
    saleFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.sale, 'crm_customers');
  const rankFilterEnabled =
    rankFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.rank, 'crm_customers');
  const provinceFilterEnabled =
    provinceFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.province, 'crm_customers');
  const industrialParkFilterEnabled =
    industrialParkFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.industrialPark, 'crm_customers');
  const poTimeFilterEnabled =
    poTimeFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.poTime, 'crm_customers');
  const productFilterEnabled =
    productFilterDefinition.active &&
    isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.product, 'crm_customers');
  const configuredCustomerFilter = (filterId: string, fallback: CustomerFilterDefinition) => {
    const configured = getSystemFilterDefinition(systemFilterDefinitions, filterId);
    return {
      name: configured?.name || fallback.name,
      description: configured?.description || fallback.description
    };
  };
  const saleFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.sale, saleFilterDefinition);
  const rankFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.rank, rankFilterDefinition);
  const provinceFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.province, provinceFilterDefinition);
  const industrialParkFilterCopy = configuredCustomerFilter(
    CUSTOMER_FILTER_IDS.industrialPark,
    industrialParkFilterDefinition
  );
  const poTimeFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.poTime, poTimeFilterDefinition);
  const productFilterCopy = configuredCustomerFilter(CUSTOMER_FILTER_IDS.product, productFilterDefinition);
  const advancedFilterGroups = {
    company: 'Hồ sơ doanh nghiệp',
    classification: 'Địa bàn doanh nghiệp',
    contact: 'Liên hệ và nguồn dữ liệu',
    needs: 'Nhu cầu và sản phẩm',
    assignment: 'Phụ trách và lịch hẹn',
    additional: 'Điều khoản thương mại',
    result: 'Kết quả kinh doanh'
  };
  const customerSystemAdvancedField = (
    id: string,
    fallbackLabel: string,
    group: string,
    kind: AdvancedFilterField<CustomerRecord>['kind'],
    getValues: AdvancedFilterField<CustomerRecord>['getValues'],
    options?: AdvancedFilterField<CustomerRecord>['options']
  ): AdvancedFilterField<CustomerRecord> | null => {
    const configuration = inlineSystemFieldConfiguration.fields.find(field => field.key === id);
    return configuration?.removed
      ? null
      : { id: `system:${id}`, label: configuration?.label || fallbackLabel, group, kind, getValues, options };
  };
  const advancedFilterFields: AdvancedFilterField<CustomerRecord>[] = [
    customerSystemAdvancedField('companyName', 'Tên khách hàng', advancedFilterGroups.company, 'text', customer => [
      customer.companyName
    ]),
    customerSystemAdvancedField('customerCode', 'Mã khách hàng', advancedFilterGroups.company, 'text', customer => [
      customer.customerCode
    ]),
    customerSystemAdvancedField(
      'customerRank',
      'Phân loại',
      advancedFilterGroups.company,
      'select',
      customer => [customer.customerRank],
      (['A', 'B', 'C', 'D'] as CustomerRank[]).map(rank => ({ value: rank, label: `Hạng ${rank}` }))
    ),
    customerSystemAdvancedField('taxCode', 'Mã số thuế', advancedFilterGroups.company, 'text', customer => [
      customer.taxCode
    ]),
    customerSystemAdvancedField(
      'assignedSaleId',
      'Sale phụ trách',
      advancedFilterGroups.company,
      'select',
      customer => [customer.assignedSaleId],
      users.map(user => ({ value: user.uid, label: user.displayName }))
    ),
    customerSystemAdvancedField('province', 'Tỉnh / thành', advancedFilterGroups.classification, 'text', customer => [
      customer.province
    ]),
    customerSystemAdvancedField('ward', 'Phường / xã', advancedFilterGroups.classification, 'text', customer => [
      customer.ward
    ]),
    customerSystemAdvancedField(
      'industrialPark',
      'Khu công nghiệp',
      advancedFilterGroups.classification,
      'text',
      customer => [customer.industrialPark]
    ),
    customerSystemAdvancedField(
      'address',
      'Địa chỉ chi tiết / giao hàng',
      advancedFilterGroups.classification,
      'text',
      customer => [customer.address]
    ),
    customerSystemAdvancedField('contactPerson', 'Người liên hệ', advancedFilterGroups.contact, 'text', customer => [
      customer.contactPerson,
      ...(customer.contacts || []).map(contact => contact.name)
    ]),
    customerSystemAdvancedField('phone', 'Số điện thoại', advancedFilterGroups.contact, 'text', customer => [
      customer.phone,
      ...(customer.contacts || []).map(contact => contact.phone)
    ]),
    customerSystemAdvancedField('procurementPhone', 'SĐT thu mua', advancedFilterGroups.contact, 'text', customer => [
      customer.procurementPhone
    ]),
    customerSystemAdvancedField(
      'warehousePhone',
      'SĐT nhận hàng / kho',
      advancedFilterGroups.contact,
      'text',
      customer => [customer.warehousePhone]
    ),
    customerSystemAdvancedField('email', 'Email', advancedFilterGroups.contact, 'text', customer => [
      customer.email,
      ...(customer.contacts || []).map(contact => contact.email)
    ]),
    customerSystemAdvancedField(
      'discountType',
      'Hình thức chiết khấu',
      advancedFilterGroups.additional,
      'select',
      customer => [customer.discountType],
      [
        { value: 'percent', label: 'Theo phần trăm' },
        { value: 'amount', label: 'Theo tiền chênh' }
      ]
    ),
    customerSystemAdvancedField(
      'discountRate',
      'Chiết khấu mặc định (%)',
      advancedFilterGroups.additional,
      'number',
      customer => [customer.discountRate]
    ),
    customerSystemAdvancedField(
      'discountAmount',
      'Tiền chênh mặc định (đ)',
      advancedFilterGroups.additional,
      'number',
      customer => [customer.discountAmount]
    ),
    customerSystemAdvancedField(
      'debtLimit',
      'Hạn mức công nợ (đ)',
      advancedFilterGroups.additional,
      'number',
      customer => [customer.debtLimit]
    ),
    customerSystemAdvancedField(
      'paymentTerms',
      'Điều khoản thanh toán',
      advancedFilterGroups.additional,
      'text',
      customer => [customer.paymentTerms]
    ),
    customerSystemAdvancedField(
      'bankAccount',
      'Tài khoản ngân hàng',
      advancedFilterGroups.additional,
      'text',
      customer => [customer.bankAccount]
    ),
    customerSystemAdvancedField('note', 'Ghi chú yêu cầu riêng', advancedFilterGroups.additional, 'text', customer => [
      customer.note
    ]),
    customerSystemAdvancedField('orderCount', 'Số đơn hàng', advancedFilterGroups.result, 'number', customer => [
      getCustomerOrders(customer.id).length
    ]),
    customerSystemAdvancedField(
      'orderValue',
      'Tổng giá trị đơn hàng',
      advancedFilterGroups.result,
      'number',
      customer => [getCustomerOrderValue(customer.id)]
    ),
    customerSystemAdvancedField(
      'outstandingDebt',
      'Công nợ sổ mới',
      advancedFilterGroups.result,
      'number',
      customer => [getCustomerOutstandingDebt(customer.id)]
    ),
    customerSystemAdvancedField('lastOrderAt', 'Lần mua gần nhất', advancedFilterGroups.result, 'date', customer => [
      customer.lastOrderAt
    ]),
    customerSystemAdvancedField('updatedAt', 'Cập nhật gần nhất', advancedFilterGroups.result, 'date', customer => [
      customer.updatedAt
    ]),
    ...customFieldDefinitions
      .filter(definition => definition.active)
      .map(
        definition =>
          ({
            id: `custom:${definition.id}`,
            label: definition.name,
            group:
              advancedFilterGroups[definition.section as keyof typeof advancedFilterGroups] ||
              advancedFilterGroups.needs,
            kind: getAdvancedFilterKindForFieldType(definition.type),
            description: definition.description,
            options:
              definition.type === 'boolean'
                ? [
                    { value: 'true', label: 'Có' },
                    { value: 'false', label: 'Không' }
                  ]
                : definition.options
                    .filter(option => option.active)
                    .map(option => ({ value: option.id, label: option.label })),
            getValues: customer => toAdvancedFilterValues(customer.customFieldValues?.[definition.id])
          }) as AdvancedFilterField<CustomerRecord>
      )
  ].filter((field): field is AdvancedFilterField<CustomerRecord> => Boolean(field));
  const advancedFilterCount = countAdvancedFilters(advancedFilters);
  const quickFilterCount =
    (saleFilterEnabled ? saleFilters.length : 0) +
    (rankFilterEnabled ? rankFilters.length : 0) +
    (poTimeFilterEnabled ? timeFilters.length : 0) +
    (provinceFilterEnabled ? provinceFilters.length : 0) +
    (industrialParkFilterEnabled ? industrialParkFilters.length : 0) +
    (productFilterEnabled ? productFilters.length : 0) +
    Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const activeFilterCount = quickFilterCount + advancedFilterCount;
  const resetCrmListFilters = () => {
    setSearchTerm('');
    setSaleFilters([]);
    setRankFilters([]);
    setTimeFilters([]);
    setProvinceFilters([]);
    setIndustrialParkFilters([]);
    setProductFilters([]);
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setCustomerPage(1);
  };
  const crmFilterChips = [
    ...(saleFilterEnabled
      ? saleFilters.map(value => ({
          id: `sale-${value}`,
          label: `${saleFilterCopy.name}: ${saleFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setSaleFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(rankFilterEnabled
      ? rankFilters.map(value => ({
          id: `rank-${value}`,
          label: `${rankFilterCopy.name}: ${rankFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setRankFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(poTimeFilterEnabled
      ? timeFilters.map(value => ({
          id: `time-${value}`,
          label: `${poTimeFilterCopy.name}: ${timeFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setTimeFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(provinceFilterEnabled
      ? provinceFilters.map(value => ({
          id: `province-${value}`,
          label: `${provinceFilterCopy.name}: ${provinceFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(industrialParkFilterEnabled
      ? industrialParkFilters.map(value => ({
          id: `industrial-park-${value}`,
          label: `${industrialParkFilterCopy.name}: ${industrialParkFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setIndustrialParkFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(productFilterEnabled
      ? productFilters.map(value => ({
          id: `product-${value}`,
          label: `${productFilterCopy.name}: ${productFilterOptions.find(option => option.value === value)?.label || value}`,
          onRemove: () => setProductFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...customFieldDefinitions
      .filter(definition => definition.active)
      .flatMap(definition =>
        (customFieldFilters[definition.id] || []).map(value => ({
          id: `custom-${definition.id}-${value}`,
          label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
          onRemove: () =>
            setCustomFieldFilters(previous => ({
              ...previous,
              [definition.id]: (previous[definition.id] || []).filter(item => item !== value)
            }))
        }))
      ),
    ...getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
      id: `advanced-${summary.id}`,
      label: summary.label,
      onRemove: () =>
        setAdvancedFilters(previous => {
          const next = { ...previous };
          delete next[summary.id];
          setCustomerPage(1);
          return next;
        })
    }))
  ];

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('vi-VN');
  const filteredCustomers = sortNewestFirst(
    accessibleCustomers.filter(customer => {
      const customerOrders = getCustomerOrders(customer.id);
      const customerMaterials = customerMaterialsById[customer.id] || [];
      const matchesSearch =
        !normalizedSearch ||
        [
          customer.customerCode,
          customer.companyName,
          customer.contactPerson,
          customer.phone,
          customer.email,
          customer.taxCode,
          customer.province,
          customer.industrialPark,
          ...getEntityCustomFieldSearchValues(customFieldDefinitions, customer.customFieldValues),
          ...customerMaterials.flatMap(material => [
            material.materialName,
            ...material.productCodes,
            ...material.specifications
          ])
        ].some(value =>
          String(value || '')
            .toLocaleLowerCase('vi-VN')
            .includes(normalizedSearch)
        );
      const matchesSale =
        !saleFilterEnabled ||
        saleFilters.length === 0 ||
        saleFilters.some(value =>
          value === UNASSIGNED_FILTER_VALUE ? !customer.assignedSaleId : customer.assignedSaleId === value
        );
      const matchesRank =
        !rankFilterEnabled ||
        rankFilters.length === 0 ||
        rankFilters.some(value =>
          value === UNASSIGNED_FILTER_VALUE ? !customer.customerRank : customer.customerRank === value
        );
      const customerProvince = provinceByCustomerId.get(customer.id) || '';
      const matchesProvince =
        !provinceFilterEnabled ||
        provinceFilters.length === 0 ||
        provinceFilters.some(value =>
          value === UNASSIGNED_FILTER_VALUE ? !customerProvince : customerProvince === value
        );
      const customerIndustrialPark = industrialParkByCustomerId.get(customer.id) || '';
      const matchesIndustrialPark =
        !industrialParkFilterEnabled ||
        industrialParkFilters.length === 0 ||
        industrialParkFilters.some(value =>
          value === UNASSIGNED_FILTER_VALUE ? !customerIndustrialPark : customerIndustrialPark === value
        );
      const customerProductKeys = productKeysByCustomerId.get(customer.id) || new Set<string>();
      const matchesProduct =
        !productFilterEnabled ||
        productFilters.length === 0 ||
        productFilters.some(value => customerProductKeys.has(value));
      const matchesCustomFields = customFieldDefinitions
        .filter(definition => definition.active)
        .every(definition => {
          const selected = customFieldFilters[definition.id] || [];
          if (selected.length === 0) return true;
          const tokens = getEntityCustomFieldFilterTokens(definition, customer.customFieldValues?.[definition.id]);
          return selected.some(value => tokens.includes(value));
        });
      const matchesTime =
        !poTimeFilterEnabled ||
        timeFilters.length === 0 ||
        timeFilters.some(value => {
          if (value === 'no_orders') return customerOrders.length === 0;
          return customerOrders.some(order => {
            const orderDate = parseValidDate(order.orderDate || order.createdAt);
            if (!orderDate) return false;
            if (value === 'this_year') return orderDate.getFullYear() === today.getFullYear();
            const elapsedDays = Math.floor((today.getTime() - orderDate.getTime()) / 86_400_000);
            return elapsedDays >= 0 && elapsedDays <= (value === 'last_30_days' ? 30 : 90);
          });
        });
      if (
        !matchesSearch ||
        !matchesSale ||
        !matchesRank ||
        !matchesProvince ||
        !matchesIndustrialPark ||
        !matchesProduct ||
        !matchesTime ||
        !matchesCustomFields ||
        !matchesAdvancedFilters(customer, advancedFilterFields, advancedFilters)
      )
        return false;

      return true;
    }),
    customer => [customer.createdAt, customer.updatedAt, customer.customerCode]
  );
  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomers.length / customerPageSize));
  const safeCustomerPage = Math.min(customerPage, customerTotalPages);
  const displayedCustomers = filteredCustomers.slice(
    (safeCustomerPage - 1) * customerPageSize,
    safeCustomerPage * customerPageSize
  );

  return {
    searchTerm,
    setSearchTerm,
    saleFilters,
    setSaleFilters,
    rankFilters,
    setRankFilters,
    timeFilters,
    setTimeFilters,
    provinceFilters,
    setProvinceFilters,
    industrialParkFilters,
    setIndustrialParkFilters,
    productFilters,
    setProductFilters,
    customFieldFilters,
    setCustomFieldFilters,
    showListFilters,
    setShowListFilters,
    setCustomerPage,
    customerPageSize,
    setCustomerPageSize,
    customFilterOptions,
    provinceByCustomerId,
    provinceFilterOptions,
    industrialParkFilterOptions,
    productFilterOptions,
    saleFilterOptions,
    rankFilterOptions,
    timeFilterOptions,
    saleFilterEnabled,
    rankFilterEnabled,
    provinceFilterEnabled,
    industrialParkFilterEnabled,
    poTimeFilterEnabled,
    productFilterEnabled,
    saleFilterCopy,
    rankFilterCopy,
    provinceFilterCopy,
    industrialParkFilterCopy,
    poTimeFilterCopy,
    productFilterCopy,
    quickFilterCount,
    activeFilterCount,
    resetCrmListFilters,
    crmFilterChips,
    filteredCustomers,
    customerTotalPages,
    safeCustomerPage,
    displayedCustomers
  };
}
