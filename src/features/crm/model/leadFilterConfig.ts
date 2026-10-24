import type { LeadFilterDefinition, LeadFilterOption, LeadRecord, LeadStage } from './crmModels';
import { VIETNAM_ADMINISTRATIVE_UNITS } from '@/data/vietnamAdministrativeUnits';
import { resolveVietnamProvince } from '@/data/vietnamProvinceCatalog';

const OPTION_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#4f46e5', '#64748b'];

const option = (id: string, label: string, colorIndex = 0): LeadFilterOption => ({
  id,
  label,
  color: OPTION_COLORS[colorIndex % OPTION_COLORS.length],
  active: true
});

export function slugifyLeadFilterId(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const VIETNAM_PROVINCES_64 = VIETNAM_ADMINISTRATIVE_UNITS.map(province => province.label);
// Giữ tên export cũ để các màn hình hiện tại không bị gián đoạn khi nâng cấp dữ liệu.
export const VIETNAM_PROVINCES_2026 = VIETNAM_PROVINCES_64;

const SYSTEM_PROVINCE_OPTIONS: LeadFilterOption[] = VIETNAM_ADMINISTRATIVE_UNITS.map((province, provinceIndex) => ({
  ...option(province.id, province.label, provinceIndex),
  kind: 'province',
  system: true,
  children: province.wards.map((ward, wardIndex) => ({
    ...option(ward.id, ward.label, wardIndex),
    kind: 'ward',
    system: true,
    children: []
  }))
}));

const SYSTEM_INDUSTRIAL_PARK_OPTIONS: LeadFilterOption[] = VIETNAM_ADMINISTRATIVE_UNITS.map(
  (province, provinceIndex) => ({
    ...option(province.id, province.label, provinceIndex),
    kind: 'province',
    system: true,
    children: []
  })
);

export const LEAD_FILTER_IDS = {
  companySize: 'company_size',
  province: 'province',
  industrialPark: 'industrial_park',
  productNeed: 'product_need',
  source: 'lead_source',
  progress: 'lead_progress'
} as const;

export const DEFAULT_LEAD_FILTER_DEFINITIONS: LeadFilterDefinition[] = [
  {
    id: LEAD_FILTER_IDS.companySize,
    name: 'Quy mô',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'single_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 10,
    options: [
      option('large', 'Doanh nghiệp lớn'),
      option('medium', 'Doanh nghiệp vừa', 1),
      option('small', 'Doanh nghiệp nhỏ', 2)
    ]
  },
  {
    id: LEAD_FILTER_IDS.province,
    name: 'Tỉnh/thành',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'single_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 40,
    options: SYSTEM_PROVINCE_OPTIONS
  },
  {
    id: LEAD_FILTER_IDS.industrialPark,
    name: 'Khu công nghiệp',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'single_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 45,
    options: SYSTEM_INDUSTRIAL_PARK_OPTIONS
  },
  {
    id: LEAD_FILTER_IDS.productNeed,
    name: 'Nhu cầu',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'multi_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 30,
    options: [
      option('roll_label', 'Tem cuộn'),
      option('sheet_label', 'Tem tờ', 1),
      option('paper_decal', 'Decal giấy', 2),
      option('plastic_decal', 'Decal nhựa', 3),
      option('barcode_label', 'Tem barcode', 4),
      option('color_label', 'Tem màu', 5),
      option('ribbon', 'Ribbon / mực in', 6),
      option('design_service', 'Dịch vụ thiết kế', 7),
      option('other_product', 'Nhu cầu khác', 3)
    ]
  },
  {
    id: LEAD_FILTER_IDS.source,
    name: 'Nguồn',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'single_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 50,
    options: [
      option('director_referral', 'Giám đốc giới thiệu'),
      option('sale_search', 'Sale tự tìm kiếm', 1),
      option('customer_referral', 'Khách hàng giới thiệu', 2),
      option('website', 'Website', 3),
      option('social_media', 'Mạng xã hội', 4),
      option('event', 'Hội chợ / sự kiện', 5),
      option('other_source', 'Khác', 7)
    ]
  },
  {
    id: LEAD_FILTER_IDS.progress,
    name: 'Tiến độ',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'multi_select',
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 20,
    options: [
      option('contacted', 'Đã liên hệ'),
      option('discussing', 'Đang trao đổi', 2),
      option('sample_in_progress', 'Đang làm mẫu', 3),
      option('preparing_quote', 'Đang báo giá', 1),
      option('quote_sent', 'Đã gửi báo giá', 4),
      option('negotiating', 'Đang đàm phán', 3),
      option('waiting_feedback', 'Chờ khách phản hồi', 7)
    ]
  }
];

export const findLeadFilterOptionPathInOptions = (
  options: LeadFilterOption[],
  optionId: string,
  parentPath: LeadFilterOption[] = []
): LeadFilterOption[] => {
  for (const currentOption of options) {
    const currentPath = [...parentPath, currentOption];
    if (currentOption.id === optionId) return currentPath;
    const childPath = findLeadFilterOptionPathInOptions(currentOption.children || [], optionId, currentPath);
    if (childPath.length > 0) return childPath;
  }
  return [];
};

export const flattenLeadFilterOptions = (options: LeadFilterOption[]): LeadFilterOption[] =>
  options.flatMap(currentOption => [currentOption, ...flattenLeadFilterOptions(currentOption.children || [])]);

export const findLeadFilterOptionPath = (
  definitions: LeadFilterDefinition[],
  fieldId: string,
  optionId: string
): LeadFilterOption[] => {
  const field = definitions.find(definition => definition.id === fieldId);
  if (!field || !optionId) return [];
  return findLeadFilterOptionPathInOptions(field.options, optionId) || [];
};

export const findLeadFilterOption = (definitions: LeadFilterDefinition[], fieldId: string, optionId: string) => {
  const path = findLeadFilterOptionPath(definitions, fieldId, optionId);
  return path.at(-1);
};

export const findLeadFilterParentOption = (definitions: LeadFilterDefinition[], fieldId: string, optionId: string) => {
  return findLeadFilterOptionPath(definitions, fieldId, optionId)[0];
};

export const findLeadFilterOptionId = (definitions: LeadFilterDefinition[], fieldId: string, labelOrId: string) => {
  if (!labelOrId) return '';
  const normalizedValue = slugifyLeadFilterId(labelOrId);
  const field = definitions.find(definition => definition.id === fieldId);
  const options = flattenLeadFilterOptions(field?.options || []);
  return (
    options.find(
      item =>
        item.id === labelOrId ||
        slugifyLeadFilterId(item.id) === normalizedValue ||
        slugifyLeadFilterId(item.label) === normalizedValue
    )?.id || ''
  );
};

const getLegacyProgressValues = (stage: LeadStage, existingValues: Record<string, string[]>) => {
  const values = [
    ...(existingValues[LEAD_FILTER_IDS.progress] || []),
    ...(existingValues.contact_progress || [])
      .filter(value => ['called', 'emailed', 'zalo_connected', 'met_customer'].includes(value))
      .map(() => 'contacted'),
    ...((existingValues.sample_progress || []).length > 0 ? ['sample_in_progress'] : []),
    ...(existingValues.quotation_progress || [])
      .filter(value => value === 'preparing_quote')
      .map(() => 'preparing_quote'),
    ...(existingValues.quotation_progress || [])
      .filter(value => ['quote_sent', 'quote_received'].includes(value))
      .map(() => 'quote_sent'),
    ...(existingValues.negotiation_progress || [])
      .filter(value =>
        [
          'negotiating',
          'price_negotiation',
          'quantity_negotiation',
          'payment_negotiation',
          'delivery_negotiation'
        ].includes(value)
      )
      .map(() => 'negotiating'),
    ...(existingValues.negotiation_progress || [])
      .filter(value =>
        ['waiting_feedback', 'waiting_procurement', 'waiting_accounting', 'waiting_management'].includes(value)
      )
      .map(() => 'waiting_feedback')
  ];

  if (values.length > 0) return Array.from(new Set(values));
  if (stage === 'contacted') return ['contacted'];
  if (stage === 'quoted') return ['contacted', 'quote_sent'];
  if (stage === 'negotiating') return ['contacted', 'quote_sent', 'negotiating'];
  return [];
};

export const getLeadFilterValues = (
  lead: LeadRecord,
  definitions: LeadFilterDefinition[] = DEFAULT_LEAD_FILTER_DEFINITIONS
): Record<string, string[]> => {
  const existingValues = lead.filterValues || {};
  const companySizeValues = existingValues[LEAD_FILTER_IDS.companySize] || (lead.companySize ? [lead.companySize] : []);
  const rawProvinceValues =
    existingValues[LEAD_FILTER_IDS.province] ||
    [lead.provinceId || findLeadFilterOptionId(definitions, LEAD_FILTER_IDS.province, lead.province)].filter(Boolean);
  const deepestProvinceValue = [...rawProvinceValues]
    .reverse()
    .find(value => findLeadFilterOptionPath(definitions, LEAD_FILTER_IDS.province, value).length > 0);
  const resolvedProvincePath = deepestProvinceValue
    ? findLeadFilterOptionPath(definitions, LEAD_FILTER_IDS.province, deepestProvinceValue)
    : [];
  const provinceValues = [
    resolvedProvincePath[0]?.id ||
      lead.provinceId ||
      findLeadFilterOptionId(definitions, LEAD_FILTER_IDS.province, lead.province)
  ].filter(Boolean);
  const industrialParkValues =
    existingValues[LEAD_FILTER_IDS.industrialPark] ||
    [findLeadFilterOptionId(definitions, LEAD_FILTER_IDS.industrialPark, lead.industrialPark)].filter(Boolean);
  const productNeedValues = existingValues[LEAD_FILTER_IDS.productNeed] || existingValues.product_interest || [];
  const sourceValues =
    existingValues[LEAD_FILTER_IDS.source] ||
    [findLeadFilterOptionId(definitions, LEAD_FILTER_IDS.source, lead.source)].filter(Boolean);

  return {
    ...existingValues,
    [LEAD_FILTER_IDS.companySize]: companySizeValues,
    [LEAD_FILTER_IDS.province]: provinceValues,
    [LEAD_FILTER_IDS.industrialPark]: industrialParkValues,
    [LEAD_FILTER_IDS.productNeed]: productNeedValues,
    [LEAD_FILTER_IDS.source]: sourceValues,
    [LEAD_FILTER_IDS.progress]: getLegacyProgressValues(lead.stage, existingValues)
  };
};

export const mergeLeadFilterDefinitions = (stored: LeadFilterDefinition[] = []): LeadFilterDefinition[] => {
  const storedById = new Map(stored.map(field => [field.id, field]));
  const defaultIds = new Set(DEFAULT_LEAD_FILTER_DEFINITIONS.map(field => field.id));
  const defaultDefinitions = DEFAULT_LEAD_FILTER_DEFINITIONS.map(defaultField => {
    const savedField = storedById.get(defaultField.id);
    if (!savedField) {
      return defaultField.id === LEAD_FILTER_IDS.industrialPark
        ? {
            ...defaultField,
            options: mergeIndustrialParkFilterOptions([], storedById.get(LEAD_FILTER_IDS.province)?.options || [])
          }
        : defaultField;
    }
    return {
      ...defaultField,
      ...savedField,
      id: defaultField.id,
      showInQuickFilter: true,
      options:
        defaultField.id === LEAD_FILTER_IDS.province
          ? mergeProvinceFilterOptions(Array.isArray(savedField.options) ? savedField.options : [])
          : defaultField.id === LEAD_FILTER_IDS.industrialPark
            ? mergeIndustrialParkFilterOptions(
                Array.isArray(savedField.options) ? savedField.options : [],
                storedById.get(LEAD_FILTER_IDS.province)?.options || []
              )
            : Array.isArray(savedField.options)
              ? savedField.options
              : defaultField.options
    };
  });
  const customDefinitions = stored
    .filter(field => !defaultIds.has(field.id))
    .map(field => ({
      ...field,
      showInQuickFilter: true,
      options: Array.isArray(field.options) ? field.options : []
    }));

  return [...defaultDefinitions, ...customDefinitions].sort((a, b) => a.order - b.order);
};

const mergeProvinceFilterOptions = (storedOptions: LeadFilterOption[]): LeadFilterOption[] => {
  const matchedStoredProvinceIds = new Set<string>();
  const mergedSystemProvinces = SYSTEM_PROVINCE_OPTIONS.map(systemProvince => {
    const storedProvince = storedOptions.find(
      candidate =>
        candidate.id === systemProvince.id ||
        slugifyLeadFilterId(candidate.label) === slugifyLeadFilterId(systemProvince.label)
    );
    if (!storedProvince) return systemProvince;
    matchedStoredProvinceIds.add(storedProvince.id);

    const storedChildren = storedProvince.children || [];
    const matchedStoredWardIds = new Set<string>();
    const mergedSystemWards = (systemProvince.children || []).map(systemWard => {
      const storedWard = storedChildren.find(
        candidate =>
          candidate.kind === 'ward' &&
          (candidate.id === systemWard.id ||
            slugifyLeadFilterId(candidate.label) === slugifyLeadFilterId(systemWard.label))
      );
      if (!storedWard) return systemWard;
      matchedStoredWardIds.add(storedWard.id);
      return {
        ...systemWard,
        ...storedWard,
        id: systemWard.id,
        label: systemWard.label,
        kind: 'ward' as const,
        system: true,
        active: true,
        children: []
      };
    });

    const unmatchedStoredWards = storedChildren
      .filter(child => child.kind === 'ward' && !matchedStoredWardIds.has(child.id))
      .map(ward => ({ ...ward, kind: 'ward' as const, children: [] }));

    return {
      ...systemProvince,
      ...storedProvince,
      id: systemProvince.id,
      label: systemProvince.label,
      kind: 'province' as const,
      system: true,
      active: true,
      children: [...unmatchedStoredWards, ...mergedSystemWards]
    };
  });

  const unmatchedStoredProvinces = storedOptions
    .filter(province => !matchedStoredProvinceIds.has(province.id))
    .map(province => ({ ...province, active: false }));
  return [...mergedSystemProvinces, ...unmatchedStoredProvinces];
};

const mergeIndustrialParkFilterOptions = (
  storedOptions: LeadFilterOption[],
  legacyProvinceOptions: LeadFilterOption[]
): LeadFilterOption[] =>
  SYSTEM_INDUSTRIAL_PARK_OPTIONS.map(systemProvince => {
    const belongsToSystemProvince = (candidate: LeadFilterOption) =>
      candidate.id === systemProvince.id ||
      resolveVietnamProvince(candidate.label, candidate.id)?.id === systemProvince.id;
    const matchingStoredProvinces = storedOptions.filter(belongsToSystemProvince);
    const matchingLegacyProvinces = legacyProvinceOptions.filter(belongsToSystemProvince);
    const storedParks = matchingStoredProvinces
      .flatMap(province => province.children || [])
      .flatMap(child => (child.kind === 'ward' ? child.children || [] : [child]));
    const legacyParks = matchingLegacyProvinces
      .flatMap(province => province.children || [])
      .flatMap(child => (child.kind === 'ward' ? child.children || [] : child.kind === 'region' ? [child] : []));
    const parksByLabel = new Map<string, LeadFilterOption>();
    [...legacyParks, ...storedParks].forEach(park => {
      const normalizedLabel = slugifyLeadFilterId(park.label);
      if (!normalizedLabel) return;
      parksByLabel.set(normalizedLabel, {
        ...park,
        kind: 'region',
        system: false
      });
    });
    return {
      ...systemProvince,
      ...matchingStoredProvinces.find(province => province.id === systemProvince.id),
      id: systemProvince.id,
      label: systemProvince.label,
      kind: 'province',
      system: true,
      active: true,
      children: Array.from(parksByLabel.values())
    };
  });

export const compactLeadFilterDefinitionForStorage = (definition: LeadFilterDefinition): LeadFilterDefinition => {
  if (definition.id === LEAD_FILTER_IDS.province) {
    const configuredOptions = definition.options.flatMap(province => {
      const configuredWards = (province.children || []).flatMap(ward => {
        const regions = (ward.children || []).filter(region => region.kind === 'region');
        return regions.length > 0 ? [{ ...ward, children: regions }] : [];
      });
      const directRegions = (province.children || []).filter(child => child.kind === 'region');
      const children = [...directRegions, ...configuredWards];
      return children.length > 0 ? [{ ...province, children }] : [];
    });
    return { ...definition, options: configuredOptions };
  }
  if (definition.id !== LEAD_FILTER_IDS.industrialPark) return definition;
  return {
    ...definition,
    options: definition.options.flatMap(province => {
      const configuredParks = (province.children || []).filter(park => park.kind === 'region');
      return configuredParks.length > 0 ? [{ ...province, children: configuredParks }] : [];
    })
  };
};
