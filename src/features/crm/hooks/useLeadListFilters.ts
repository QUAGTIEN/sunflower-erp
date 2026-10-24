import type { SystemFilterDefinition } from '@/domain/systemFilterConfig';
import type { LeadOverviewSelection } from '@/features/crm/pages/leadsPage/leadsPageConfig';
import type { UserProfile } from '@/shared/types/user';
import type { LeadProfileFieldDefinition } from '@/features/crm/model/crmModels';
import type { LeadFilterDefinition } from '@/features/crm/model/crmModels';
import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { useState, useMemo } from 'react';
import {
  type AdvancedFilterState,
  type AdvancedFilterField,
  getAdvancedFilterKindForFieldType,
  toAdvancedFilterValues,
  countAdvancedFilters,
  getAdvancedFilterSummaries,
  matchesAdvancedFilters
} from '@/components/advancedDataFilterModel';
import {
  getEntityCustomFieldFilterTokens,
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldSearchValues
} from '@/features/crm/model/entityFieldConfig';
import {
  LEAD_FILTER_IDS,
  getLeadFilterValues,
  flattenLeadFilterOptions,
  findLeadFilterOption
} from '@/features/crm/model/leadFilterConfig';
import { type LeadRecord } from '@/features/crm/model/crmModels';
import {
  COMPANY_SIZE_LABELS,
  LEAD_STAGES,
  LEAD_OVERVIEW_LABELS,
  getLeadScheduleTime,
  matchesEverySearchTerm,
  getStageLabel,
  matchesLeadOverviewSelection
} from '../pages/leadsPage/leadsPageConfig';
import { getSystemFilterDefinition } from '@/domain/systemFilterConfig';
import { CUSTOMER_INSIGHT_ITEM_BY_ID, matchesCustomerInsightValues } from '@/features/crm/model/customerInsightCatalog';

export interface LeadListFilterInputs {
  customFieldDefinitions: EntityFieldDefinition[];
  accessibleLeads: LeadRecord[];
  filterDefinitions: LeadFilterDefinition[];
  visibleFilterDefinitions: LeadFilterDefinition[];
  t: (key: string) => string;
  inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
  customProfileDefinitions: LeadProfileFieldDefinition[];
  users: UserProfile[];
  overviewSelection: LeadOverviewSelection | null;
  overviewDrilldown: { label: string; ids: string[] } | null;
  systemFilterDefinitions: SystemFilterDefinition[];
  setOverviewSelection: React.Dispatch<React.SetStateAction<LeadOverviewSelection | null>>;
  setOverviewDrilldown: React.Dispatch<React.SetStateAction<{ label: string; ids: string[] } | null>>;
  leadListPrepared: boolean;
  workspaceTab: 'overview' | 'list';
  overviewDrilldownIds: Set<string> | null;
}

/** Filter options, chips and the filtered, sorted and paged lead list. */
export const useLeadListFilters = ({
  customFieldDefinitions,
  accessibleLeads,
  filterDefinitions,
  visibleFilterDefinitions,
  t,
  inlineSystemFieldConfiguration,
  customProfileDefinitions,
  users,
  overviewSelection,
  overviewDrilldown,
  systemFilterDefinitions,
  setOverviewSelection,
  setOverviewDrilldown,
  leadListPrepared,
  workspaceTab,
  overviewDrilldownIds
}: LeadListFilterInputs) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [leadPageSize, setLeadPageSize] = useState(25);
  const [leadCurrentPage, setLeadCurrentPage] = useState(1);

  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string[]>>({});
  const [insightFilters, setInsightFilters] = useState<string[]>([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [showLeadFilters, setShowLeadFilters] = useState(false);

  const customFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        customFieldDefinitions
          .filter(definition => definition.active)
          .map(definition => [
            definition.id,
            Array.from(
              new Set(
                accessibleLeads.flatMap(lead =>
                  getEntityCustomFieldFilterTokens(definition, lead.customFieldValues?.[definition.id])
                )
              )
            )
              .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
              .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
          ])
      ),
    [accessibleLeads, customFieldDefinitions]
  );

  const quickFilterOptionsByField = useMemo(() => {
    const valuesWithDataByField = new Map<string, Set<string>>(
      [LEAD_FILTER_IDS.province, LEAD_FILTER_IDS.industrialPark].map(fieldId => [
        fieldId,
        new Set(accessibleLeads.flatMap(lead => getLeadFilterValues(lead, filterDefinitions)[fieldId] || []))
      ])
    );

    return Object.fromEntries(
      filterDefinitions.map(field => {
        const activeOptions = field.options.filter(option => option.active);
        if (field.id === LEAD_FILTER_IDS.province) {
          const valuesWithData = valuesWithDataByField.get(field.id) || new Set<string>();
          return [field.id, activeOptions.filter(option => valuesWithData.has(option.id))];
        }
        if (field.id !== LEAD_FILTER_IDS.industrialPark) return [field.id, activeOptions];

        const pruneOptionsWithData = (options: typeof activeOptions): typeof activeOptions =>
          options.flatMap(option => {
            const activeChildren = (option.children || []).filter(child => child.active);
            const childrenWithData = pruneOptionsWithData(activeChildren);
            const valuesWithData = valuesWithDataByField.get(field.id) || new Set<string>();
            return valuesWithData.has(option.id) || childrenWithData.length > 0
              ? [{ ...option, children: childrenWithData }]
              : [];
          });
        return [field.id, pruneOptionsWithData(activeOptions)];
      })
    );
  }, [accessibleLeads, filterDefinitions]);

  const visibleFilterIds = useMemo(
    () => new Set(visibleFilterDefinitions.map(field => field.id)),
    [visibleFilterDefinitions]
  );

  const advancedFilterFields = useMemo<AdvancedFilterField<LeadRecord>[]>(() => {
    const groups = {
      company: t('Thông tin doanh nghiệp'),
      contact: t('Liên hệ và nguồn dữ liệu'),
      needs: t('Nhu cầu sơ bộ'),
      assignment: t('Phụ trách và lịch hẹn'),
      additional: t('Thông tin bổ sung')
    };
    const systemField = (
      id: string,
      fallbackLabel: string,
      group: string,
      kind: AdvancedFilterField<LeadRecord>['kind'],
      getValues: AdvancedFilterField<LeadRecord>['getValues'],
      options?: AdvancedFilterField<LeadRecord>['options']
    ): AdvancedFilterField<LeadRecord> | null => {
      const configuration = inlineSystemFieldConfiguration.fields.find(field => field.key === id);
      return configuration?.removed
        ? null
        : { id: `system:${id}`, label: configuration?.label || t(fallbackLabel), group, kind, getValues, options };
    };
    const configuredClassificationFields: AdvancedFilterField<LeadRecord>[] = filterDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `classification:${definition.id}`,
        label: definition.name,
        group: definition.group || groups.needs,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        options: flattenLeadFilterOptions(definition.options)
          .filter(option => option.active)
          .map(option => ({ value: option.id, label: option.label })),
        getValues: lead => getLeadFilterValues(lead, filterDefinitions)[definition.id] || []
      }));
    const profileFields: AdvancedFilterField<LeadRecord>[] = customProfileDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `profile:${definition.id}`,
        label: definition.name,
        group: groups.additional,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        options:
          definition.type === 'checkbox'
            ? [
                { value: 'true', label: 'Có' },
                { value: 'false', label: 'Không' }
              ]
            : definition.options
                .filter(option => option.active)
                .map(option => ({ value: option.id, label: option.label })),
        getValues: lead => lead.profileValues?.[definition.id] || []
      }));
    const customFields: AdvancedFilterField<LeadRecord>[] = customFieldDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `custom:${definition.id}`,
        label: definition.name,
        group: groups[definition.section as keyof typeof groups] || groups.additional,
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
        getValues: lead => toAdvancedFilterValues(lead.customFieldValues?.[definition.id])
      }));
    return [
      systemField('companyName', 'Tên doanh nghiệp', groups.company, 'text', lead => [lead.companyName]),
      systemField('taxCode', 'Mã số thuế', groups.company, 'text', lead => [lead.taxCode]),
      systemField('website', 'Website', groups.company, 'text', lead => [lead.website]),
      systemField('businessSector', 'Lĩnh vực hoạt động', groups.company, 'text', lead => [lead.businessSector]),
      systemField('address', 'Địa chỉ doanh nghiệp', groups.company, 'text', lead => [lead.address]),
      systemField(
        'companySize',
        'Quy mô',
        groups.company,
        'select',
        lead => [lead.companySize],
        Object.entries(COMPANY_SIZE_LABELS).map(([value, label]) => ({ value, label }))
      ),
      systemField('contactPerson', 'Người liên hệ', groups.contact, 'text', lead => [lead.contactPerson]),
      systemField('contactPosition', 'Chức vụ', groups.contact, 'text', lead => [lead.contactPosition]),
      systemField('phone', 'Điện thoại', groups.contact, 'text', lead => [lead.phone]),
      systemField('email', 'Email', groups.contact, 'text', lead => [lead.email]),
      systemField('source', 'Nguồn tìm kiếm', groups.contact, 'text', lead => [lead.source]),
      systemField('province', 'Tỉnh / thành', groups.contact, 'text', lead => [lead.province]),
      systemField('ward', 'Phường / xã', groups.contact, 'text', lead => [lead.ward]),
      systemField('industrialPark', 'Khu công nghiệp', groups.contact, 'text', lead => [lead.industrialPark]),
      systemField('expectedProducts', 'Sản phẩm / nhu cầu quan tâm', groups.needs, 'text', lead => [
        lead.expectedProducts
      ]),
      systemField('potentialValue', 'Giá trị tiềm năng', groups.needs, 'number', lead => [lead.potentialValue]),
      systemField(
        'stage',
        'Giai đoạn xử lý',
        groups.needs,
        'select',
        lead => [lead.stage],
        LEAD_STAGES.map(stage => ({ value: stage.id, label: stage.label }))
      ),
      systemField('note', 'Ghi chú', groups.needs, 'text', lead => [lead.note]),
      systemField(
        'assignedSaleId',
        'Sale phụ trách',
        groups.assignment,
        'select',
        lead => [lead.assignedSaleId],
        users.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField(
        'discoveredById',
        'Sale tìm được Lead',
        groups.assignment,
        'select',
        lead => [lead.discoveredById],
        users.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField('nextFollowUpAt', 'Lịch chăm sóc tiếp theo', groups.assignment, 'date', lead => [
        lead.nextFollowUpAt
      ]),
      systemField('updatedAt', 'Cập nhật gần nhất', groups.assignment, 'date', lead => [lead.updatedAt]),
      ...configuredClassificationFields,
      ...profileFields,
      ...customFields
    ].filter((field): field is AdvancedFilterField<LeadRecord> => Boolean(field));
  }, [
    customFieldDefinitions,
    customProfileDefinitions,
    filterDefinitions,
    inlineSystemFieldConfiguration.fields,
    t,
    users
  ]);

  const leadQuickFilterCount =
    Object.entries(dynamicFilters)
      .filter(([fieldId]) => visibleFilterIds.has(fieldId))
      .reduce((total, [, values]) => total + values.length, 0) +
    Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0) +
    insightFilters.length;
  const leadAdvancedFilterCount = countAdvancedFilters(advancedFilters);
  const leadActiveFilterCount =
    leadQuickFilterCount + leadAdvancedFilterCount + (overviewSelection || overviewDrilldown ? 1 : 0);
  const leadFilterChips = Object.entries(dynamicFilters)
    .flatMap(([fieldId, values]) => {
      if (!visibleFilterIds.has(fieldId)) return [];
      const field = filterDefinitions.find(definition => definition.id === fieldId);
      if (!field) return [];
      const configuredField = getSystemFilterDefinition(systemFilterDefinitions, fieldId);
      return values.map(value => ({
        id: `${fieldId}-${value}`,
        label: `${configuredField?.name || field.name}: ${findLeadFilterOption(filterDefinitions, fieldId, value)?.label || value}`,
        onRemove: () =>
          setDynamicFilters(previous => ({
            ...previous,
            [fieldId]: (previous[fieldId] || []).filter(item => item !== value)
          }))
      }));
    })
    .concat(
      customFieldDefinitions
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
        )
    )
    .concat(
      insightFilters.map(value => ({
        id: `insight-${value}`,
        label: CUSTOMER_INSIGHT_ITEM_BY_ID.get(value)?.label || value,
        onRemove: () => setInsightFilters(previous => previous.filter(item => item !== value))
      }))
    )
    .concat(
      getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
        id: `advanced-${summary.id}`,
        label: summary.label,
        onRemove: () =>
          setAdvancedFilters(previous => {
            const next = { ...previous };
            delete next[summary.id];
            setLeadCurrentPage(1);
            return next;
          })
      }))
    )
    .concat(
      overviewSelection
        ? [
            {
              id: `overview-${overviewSelection}`,
              label: LEAD_OVERVIEW_LABELS[overviewSelection],
              onRemove: () => setOverviewSelection(null)
            }
          ]
        : []
    )
    .concat(
      overviewDrilldown
        ? [
            {
              id: 'overview-drilldown',
              label: overviewDrilldown.label,
              onRemove: () => setOverviewDrilldown(null)
            }
          ]
        : []
    );

  const listReady = leadListPrepared || workspaceTab === 'list';
  const orderedLeads = useMemo(() => {
    if (!listReady) return [];
    return [...accessibleLeads].sort((left, right) => {
      const leftSchedule = getLeadScheduleTime(left);
      const rightSchedule = getLeadScheduleTime(right);
      if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
      return String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt));
    });
  }, [accessibleLeads, listReady]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const activeClassificationFilters = Object.entries(dynamicFilters).filter(
      ([fieldId, values]) => visibleFilterIds.has(fieldId) && values.length > 0
    );
    const activeCustomFilters = customFieldDefinitions.filter(
      definition => definition.active && (customFieldFilters[definition.id] || []).length > 0
    );
    const hasAdvancedFilters = countAdvancedFilters(advancedFilters) > 0;
    if (
      !normalizedSearch &&
      !overviewSelection &&
      !overviewDrilldownIds &&
      activeClassificationFilters.length === 0 &&
      insightFilters.length === 0 &&
      activeCustomFilters.length === 0 &&
      !hasAdvancedFilters
    )
      return orderedLeads;

    return orderedLeads.filter(lead => {
      const leadFilterValues: Record<string, string[]> =
        normalizedSearch || activeClassificationFilters.length > 0 ? getLeadFilterValues(lead, filterDefinitions) : {};
      const matchesSearch =
        !normalizedSearch ||
        matchesEverySearchTerm(normalizedSearch, [
          lead.companyName,
          lead.contactPerson,
          lead.contactPosition,
          lead.phone,
          lead.email,
          lead.website,
          lead.businessSector,
          lead.taxCode,
          lead.address,
          lead.province,
          lead.ward,
          lead.industrialPark,
          lead.source,
          lead.expectedProducts,
          lead.note,
          lead.assignedSaleName,
          users.find(user => user.uid === lead.assignedSaleId)?.displayName,
          getStageLabel(lead.stage),
          COMPANY_SIZE_LABELS[lead.companySize],
          Object.entries(leadFilterValues).flatMap(([fieldId, optionIds]) => {
            return optionIds.map(
              optionId => findLeadFilterOption(filterDefinitions, fieldId, optionId)?.label || optionId
            );
          }),
          (lead.activities || []).map(activity => activity.note),
          Object.entries(lead.profileValues || {}).flatMap(([fieldId, fieldValues]) => {
            const definition = customProfileDefinitions.find(field => field.id === fieldId);
            return fieldValues.map(value => definition?.options.find(option => option.id === value)?.label || value);
          }),
          ...getEntityCustomFieldSearchValues(customFieldDefinitions, lead.customFieldValues)
        ]);
      const matchesClassifications = activeClassificationFilters.every(([fieldId, selectedValues]) => {
        const currentValues = leadFilterValues[fieldId] || [];
        return selectedValues.some(value => currentValues.includes(value));
      });
      const matchesCustomFields = activeCustomFilters.every(definition => {
        const selected = customFieldFilters[definition.id] || [];
        const tokens = getEntityCustomFieldFilterTokens(definition, lead.customFieldValues?.[definition.id]);
        return selected.some(value => tokens.includes(value));
      });
      return (
        matchesSearch &&
        (!overviewSelection || matchesLeadOverviewSelection(lead, overviewSelection, filterDefinitions)) &&
        (!overviewDrilldownIds || overviewDrilldownIds.has(lead.id)) &&
        matchesClassifications &&
        matchesCustomerInsightValues(lead.customerInsightValues || [], insightFilters) &&
        matchesCustomFields &&
        (!hasAdvancedFilters || matchesAdvancedFilters(lead, advancedFilterFields, advancedFilters))
      );
    });
  }, [
    orderedLeads,
    advancedFilterFields,
    advancedFilters,
    dynamicFilters,
    insightFilters,
    filterDefinitions,
    overviewSelection,
    overviewDrilldownIds,
    searchTerm,
    users,
    customProfileDefinitions,
    customFieldDefinitions,
    customFieldFilters,
    visibleFilterIds
  ]);

  const leadTotalPages = Math.max(1, Math.ceil(filteredLeads.length / leadPageSize));
  const safeLeadCurrentPage = Math.min(leadCurrentPage, leadTotalPages);
  const displayedLeads = filteredLeads.slice(
    (safeLeadCurrentPage - 1) * leadPageSize,
    safeLeadCurrentPage * leadPageSize
  );

  return {
    searchTerm,
    setSearchTerm,
    leadPageSize,
    setLeadPageSize,
    setLeadCurrentPage,
    dynamicFilters,
    setDynamicFilters,
    insightFilters,
    setInsightFilters,
    customFieldFilters,
    setCustomFieldFilters,
    advancedFilters,
    setAdvancedFilters,
    showLeadFilters,
    setShowLeadFilters,
    customFilterOptions,
    quickFilterOptionsByField,
    leadQuickFilterCount,
    leadActiveFilterCount,
    leadFilterChips,
    filteredLeads,
    leadTotalPages,
    safeLeadCurrentPage,
    displayedLeads
  };
};
