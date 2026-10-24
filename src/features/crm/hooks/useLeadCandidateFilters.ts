import { useMemo, useState } from 'react';
import type { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import { isSystemFilterEnabled, getSystemFilterDefinition } from '@/domain/systemFilterConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import { CUSTOMER_FILTER_IDS } from '@/features/crm/model/customerFilterConfig';
import {
  type LeadCandidateContactResult,
  type LeadCandidatePotentialLevel,
  type LeadCandidateRecord
} from '@/features/crm/model/leadCandidateModels';
import {
  type AdvancedFilterState,
  type AdvancedFilterField,
  getAdvancedFilterKindForFieldType,
  toAdvancedFilterValues,
  countAdvancedFilters,
  matchesAdvancedFilters,
  getAdvancedFilterSummaries
} from '@/components/advancedDataFilterModel';
import {
  type CandidateSort,
  type CandidateWorkspaceView,
  CANDIDATE_SOURCES,
  CONTACT_STATUS_LABELS,
  POTENTIAL_LEVEL_LABELS,
  matchesSearch
} from '../components/leadCandidateWorkspace/leadCandidateWorkspaceConfig';
import {
  getEntityCustomFieldFilterTokens,
  getEntityCustomFieldFilterLabel,
  type EntityFieldDefinition
} from '@/features/crm/model/entityFieldConfig';
import { matchesCustomerInsightValues, CUSTOMER_INSIGHT_ITEM_BY_ID } from '@/features/crm/model/customerInsightCatalog';

export interface LeadCandidateFilterInputs {
  accessibleCandidates: LeadCandidateRecord[];
  customFieldDefinitions: EntityFieldDefinition[];
  inlineSystemFieldConfiguration: ReturnType<typeof useSystemFieldConfiguration>;
  candidateOwners: UserProfile[];
  workspaceView: CandidateWorkspaceView;
  taskCandidates: LeadCandidateRecord[];
}

/** Search, quick, classification and advanced filters plus sorting and pagination for the raw-data list. */
export const useLeadCandidateFilters = ({
  accessibleCandidates,
  customFieldDefinitions,
  inlineSystemFieldConfiguration,
  candidateOwners,
  workspaceView,
  taskCandidates
}: LeadCandidateFilterInputs) => {
  const systemFilterDefinitions = useSystemFilterConfiguration();
  const provinceFilterEnabled = isSystemFilterEnabled(
    systemFilterDefinitions,
    LEAD_FILTER_IDS.province,
    'customer_data'
  );
  const industrialParkFilterEnabled = isSystemFilterEnabled(
    systemFilterDefinitions,
    LEAD_FILTER_IDS.industrialPark,
    'customer_data'
  );
  const sourceFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.source, 'customer_data');
  const contactResultFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'contact_result', 'customer_data');
  const potentialFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'potential_level', 'customer_data');
  const saleFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.sale, 'customer_data');
  const pinnedFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'pinned', 'customer_data');
  const configuredFilterName = (filterId: string, fallback: string) =>
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.name || fallback;
  const configuredFilterDescription = (filterId: string, fallback = '') =>
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.description || fallback;

  const [searchTerm, setSearchTerm] = useState('');

  const [saleFilters, setSaleFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [provinceFilters, setProvinceFilters] = useState<string[]>([]);
  const [industrialParkFilters, setIndustrialParkFilters] = useState<string[]>([]);
  const [contactResultFilters, setContactResultFilters] = useState<LeadCandidateContactResult[]>([]);
  const [potentialFilters, setPotentialFilters] = useState<LeadCandidatePotentialLevel[]>([]);
  const [insightFilters, setInsightFilters] = useState<string[]>([]);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('priority');

  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const provinceOptions = useMemo(
    () =>
      Array.from(new Set(accessibleCandidates.map(candidate => candidate.province.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, 'vi-VN')
      ),
    [accessibleCandidates]
  );
  const industrialParkOptions = useMemo(
    () =>
      Array.from(new Set(accessibleCandidates.map(candidate => candidate.industrialPark.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, 'vi-VN')
      ),
    [accessibleCandidates]
  );

  const customFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        customFieldDefinitions
          .filter(definition => definition.active)
          .map(definition => [
            definition.id,
            Array.from(
              new Set(
                accessibleCandidates.flatMap(candidate =>
                  getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id])
                )
              )
            )
              .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
              .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
          ])
      ),
    [accessibleCandidates, customFieldDefinitions]
  );

  const advancedFilterFields = useMemo<AdvancedFilterField<LeadCandidateRecord>[]>(() => {
    const groups = {
      company: 'Thông tin doanh nghiệp',
      contact: 'Liên hệ và nguồn dữ liệu',
      needs: 'Nhu cầu sơ bộ',
      assignment: 'Phụ trách và lịch hẹn',
      additional: 'Thông tin bổ sung'
    };
    const systemField = (
      id: string,
      fallbackLabel: string,
      group: string,
      kind: AdvancedFilterField<LeadCandidateRecord>['kind'],
      getValues: AdvancedFilterField<LeadCandidateRecord>['getValues'],
      options?: AdvancedFilterField<LeadCandidateRecord>['options']
    ): AdvancedFilterField<LeadCandidateRecord> | null => {
      const configuration = inlineSystemFieldConfiguration.fields.find(field => field.key === id);
      return configuration?.removed
        ? null
        : { id: `system:${id}`, label: configuration?.label || fallbackLabel, group, kind, getValues, options };
    };
    const customFields: AdvancedFilterField<LeadCandidateRecord>[] = customFieldDefinitions
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
        getValues: candidate => toAdvancedFilterValues(candidate.customFieldValues?.[definition.id])
      }));
    return [
      systemField('companyName', 'Tên doanh nghiệp', groups.company, 'text', candidate => [candidate.companyName]),
      systemField('taxCode', 'Mã số thuế', groups.company, 'text', candidate => [candidate.taxCode]),
      systemField('website', 'Website', groups.company, 'text', candidate => [candidate.website]),
      systemField('businessSector', 'Lĩnh vực hoạt động', groups.company, 'text', candidate => [
        candidate.businessSector
      ]),
      systemField('province', 'Tỉnh / thành', groups.company, 'text', candidate => [candidate.province]),
      systemField('ward', 'Phường / xã', groups.company, 'text', candidate => [candidate.ward]),
      systemField('industrialPark', 'Khu công nghiệp', groups.company, 'text', candidate => [candidate.industrialPark]),
      systemField('address', 'Địa chỉ doanh nghiệp', groups.company, 'text', candidate => [candidate.address]),
      systemField('contactPerson', 'Người liên hệ', groups.contact, 'text', candidate => [candidate.contactPerson]),
      systemField('contactPosition', 'Chức vụ', groups.contact, 'text', candidate => [candidate.contactPosition]),
      systemField('phone', 'Điện thoại', groups.contact, 'text', candidate => [candidate.phone]),
      systemField('email', 'Email', groups.contact, 'text', candidate => [candidate.email]),
      systemField(
        'source',
        'Nguồn tìm kiếm',
        groups.contact,
        'select',
        candidate => [candidate.source],
        CANDIDATE_SOURCES.map(source => ({ value: source, label: source }))
      ),
      systemField('sourceUrl', 'Đường dẫn nguồn', groups.contact, 'text', candidate => [candidate.sourceUrl]),
      systemField('expectedProducts', 'Sản phẩm / nhu cầu quan tâm', groups.needs, 'text', candidate => [
        candidate.expectedProducts
      ]),
      systemField('note', 'Ghi chú', groups.needs, 'text', candidate => [candidate.note]),
      systemField(
        'assignedSaleId',
        'Sale phụ trách',
        groups.assignment,
        'select',
        candidate => [candidate.assignedSaleId],
        candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField(
        'discoveredById',
        'Sale tìm được dữ liệu',
        groups.assignment,
        'select',
        candidate => [candidate.discoveredById],
        candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField(
        'contactResult',
        'Trạng thái liên hệ',
        groups.assignment,
        'select',
        candidate => [candidate.contactResult],
        Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
      ),
      systemField(
        'potentialLevel',
        'Mức độ tiềm năng',
        groups.assignment,
        'select',
        candidate => [candidate.potentialLevel],
        Object.entries(POTENTIAL_LEVEL_LABELS).map(([value, label]) => ({ value, label }))
      ),
      systemField('nextContactAt', 'Lịch hẹn xử lý', groups.assignment, 'date', candidate => [candidate.nextContactAt]),
      systemField('updatedAt', 'Cập nhật gần nhất', groups.assignment, 'date', candidate => [candidate.updatedAt]),
      ...customFields
    ].filter((field): field is AdvancedFilterField<LeadCandidateRecord> => Boolean(field));
  }, [candidateOwners, customFieldDefinitions, inlineSystemFieldConfiguration.fields]);

  const advancedFilterCount = countAdvancedFilters(advancedFilters);

  const filteredCandidates = useMemo(() => {
    const sourceCandidates = workspaceView === 'tasks' ? taskCandidates : accessibleCandidates;
    return sourceCandidates
      .filter(candidate => {
        const matchesSale =
          !saleFilterEnabled || saleFilters.length === 0 || saleFilters.includes(candidate.assignedSaleId);
        const matchesSource =
          !sourceFilterEnabled || sourceFilters.length === 0 || sourceFilters.includes(candidate.source);
        const matchesProvince =
          !provinceFilterEnabled || provinceFilters.length === 0 || provinceFilters.includes(candidate.province);
        const matchesIndustrialPark =
          !industrialParkFilterEnabled ||
          industrialParkFilters.length === 0 ||
          industrialParkFilters.includes(candidate.industrialPark);
        const matchesContactResult =
          !contactResultFilterEnabled ||
          contactResultFilters.length === 0 ||
          contactResultFilters.includes(candidate.contactResult);
        const matchesPotential =
          !potentialFilterEnabled ||
          potentialFilters.length === 0 ||
          potentialFilters.includes(candidate.potentialLevel);
        const matchesCustomFields = customFieldDefinitions
          .filter(definition => definition.active)
          .every(definition => {
            const selected = customFieldFilters[definition.id] || [];
            if (selected.length === 0) return true;
            const tokens = getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]);
            return selected.some(value => tokens.includes(value));
          });
        return (
          matchesSale &&
          matchesSource &&
          matchesProvince &&
          matchesIndustrialPark &&
          matchesContactResult &&
          matchesPotential &&
          matchesCustomerInsightValues(candidate.customerInsightValues || [], insightFilters) &&
          matchesCustomFields &&
          matchesAdvancedFilters(candidate, advancedFilterFields, advancedFilters) &&
          (!pinnedFilterEnabled || !pinnedOnly || candidate.pinned) &&
          matchesSearch(candidate, searchTerm, customFieldDefinitions)
        );
      })
      .sort((left, right) => {
        if (workspaceView === 'tasks') {
          if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
          if (candidateSort === 'updated_desc') {
            return (
              new Date(right.updatedAt || right.createdAt).getTime() -
              new Date(left.updatedAt || left.createdAt).getTime()
            );
          }
          if (candidateSort === 'priority') {
            const leftAdminPriority = left.taskSource === 'admin_assigned';
            const rightAdminPriority = right.taskSource === 'admin_assigned';
            if (leftAdminPriority !== rightAdminPriority) return leftAdminPriority ? -1 : 1;
          }
          const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
          return (
            new Date(right.updatedAt || right.createdAt).getTime() -
            new Date(left.updatedAt || left.createdAt).getTime()
          );
        }
        if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
        if (candidateSort === 'next_contact_asc') {
          const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          return leftSchedule - rightSchedule;
        }
        if (candidateSort === 'updated_desc') {
          return (
            new Date(right.updatedAt || right.createdAt).getTime() -
            new Date(left.updatedAt || left.createdAt).getTime()
          );
        }
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
        return (
          new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
        );
      });
  }, [
    accessibleCandidates,
    advancedFilterFields,
    advancedFilters,
    candidateSort,
    contactResultFilterEnabled,
    contactResultFilters,
    customFieldDefinitions,
    customFieldFilters,
    industrialParkFilterEnabled,
    industrialParkFilters,
    insightFilters,
    pinnedFilterEnabled,
    pinnedOnly,
    potentialFilterEnabled,
    potentialFilters,
    provinceFilterEnabled,
    provinceFilters,
    saleFilterEnabled,
    saleFilters,
    searchTerm,
    sourceFilterEnabled,
    sourceFilters,
    taskCandidates,
    workspaceView
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedCandidates = filteredCandidates.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const quickFilterCount =
    (provinceFilterEnabled ? provinceFilters.length : 0) +
    (industrialParkFilterEnabled ? industrialParkFilters.length : 0) +
    (sourceFilterEnabled ? sourceFilters.length : 0) +
    (contactResultFilterEnabled ? contactResultFilters.length : 0) +
    (potentialFilterEnabled ? potentialFilters.length : 0) +
    (saleFilterEnabled ? saleFilters.length : 0) +
    insightFilters.length +
    (pinnedFilterEnabled && pinnedOnly ? 1 : 0) +
    Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const activeFilterCount = quickFilterCount + advancedFilterCount;

  const candidateFilterChips = [
    ...(provinceFilterEnabled
      ? provinceFilters.map(value => ({
          id: `province-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')}: ${value}`,
          onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(industrialParkFilterEnabled
      ? industrialParkFilters.map(value => ({
          id: `industrial-park-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.industrialPark, 'Khu công nghiệp')}: ${value}`,
          onRemove: () => setIndustrialParkFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(sourceFilterEnabled
      ? sourceFilters.map(value => ({
          id: `source-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.source, 'Nguồn')}: ${value}`,
          onRemove: () => setSourceFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(contactResultFilterEnabled
      ? contactResultFilters.map(value => ({
          id: `contact-result-${value}`,
          label: `${configuredFilterName('contact_result', 'Trạng thái liên hệ')}: ${CONTACT_STATUS_LABELS[value]}`,
          onRemove: () => setContactResultFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(potentialFilterEnabled
      ? potentialFilters.map(value => ({
          id: `potential-${value}`,
          label: `${configuredFilterName('potential_level', 'Mức độ tiềm năng')}: ${POTENTIAL_LEVEL_LABELS[value]}`,
          onRemove: () => setPotentialFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(saleFilterEnabled
      ? saleFilters.map(value => ({
          id: `sale-${value}`,
          label: `${configuredFilterName(CUSTOMER_FILTER_IDS.sale, 'Sale phụ trách')}: ${candidateOwners.find(user => user.uid === value)?.displayName || value}`,
          onRemove: () => setSaleFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(pinnedFilterEnabled && pinnedOnly
      ? [{ id: 'pinned', label: configuredFilterName('pinned', 'Đã ghim'), onRemove: () => setPinnedOnly(false) }]
      : []),
    ...insightFilters.map(value => ({
      id: `insight-${value}`,
      label: CUSTOMER_INSIGHT_ITEM_BY_ID.get(value)?.label || value,
      onRemove: () => setInsightFilters(previous => previous.filter(item => item !== value))
    })),
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
          setCurrentPage(1);
          return next;
        })
    }))
  ];

  const clearDataFilters = () => {
    setSearchTerm('');
    setProvinceFilters([]);
    setIndustrialParkFilters([]);
    setSourceFilters([]);
    setContactResultFilters([]);
    setPotentialFilters([]);
    setInsightFilters([]);
    setSaleFilters([]);
    setPinnedOnly(false);
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setCurrentPage(1);
  };

  return {
    provinceFilterEnabled,
    industrialParkFilterEnabled,
    sourceFilterEnabled,
    contactResultFilterEnabled,
    potentialFilterEnabled,
    saleFilterEnabled,
    pinnedFilterEnabled,
    configuredFilterName,
    configuredFilterDescription,
    searchTerm,
    setSearchTerm,
    saleFilters,
    setSaleFilters,
    sourceFilters,
    setSourceFilters,
    provinceFilters,
    setProvinceFilters,
    industrialParkFilters,
    setIndustrialParkFilters,
    contactResultFilters,
    setContactResultFilters,
    potentialFilters,
    setPotentialFilters,
    insightFilters,
    setInsightFilters,
    pinnedOnly,
    setPinnedOnly,
    customFieldFilters,
    setCustomFieldFilters,
    candidateSort,
    setCandidateSort,
    pageSize,
    setPageSize,
    setCurrentPage,
    provinceOptions,
    industrialParkOptions,
    customFilterOptions,
    filteredCandidates,
    totalPages,
    safeCurrentPage,
    displayedCandidates,
    quickFilterCount,
    activeFilterCount,
    candidateFilterChips,
    clearDataFilters
  };
};
