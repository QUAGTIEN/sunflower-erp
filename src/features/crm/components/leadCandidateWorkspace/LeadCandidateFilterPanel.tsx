import React from 'react';
import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import { DataFilterPanel, DataFilterSection, DataFilterCheckboxGroup } from '@/components/DataWorkspaceFilters';
import { LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import {
  CANDIDATE_SOURCES,
  CONTACT_STATUS_LABELS,
  POTENTIAL_LEVEL_LABELS,
  type CandidateWorkspaceView
} from './leadCandidateWorkspaceConfig';
import type { LeadCandidateContactResult, LeadCandidatePotentialLevel } from '@/features/crm/model/leadCandidateModels';
import {
  getCustomerInsightGroupsForModule,
  replaceCustomerInsightGroupValues
} from '@/features/crm/model/customerInsightCatalog';
import { CUSTOMER_FILTER_IDS } from '@/features/crm/model/customerFilterConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

interface LeadCandidateFilterPanelProps {
  workspaceView: CandidateWorkspaceView;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  currentUser: UserProfile;
  candidateOwners: UserProfile[];
  customFieldDefinitions: EntityFieldDefinition[];
  filters: {
    showDataFilters: boolean;
    quickFilterCount: number;
    setShowDataFilters: React.Dispatch<React.SetStateAction<boolean>>;
    clearDataFilters: () => void;
    provinceFilterEnabled: boolean;
    configuredFilterName: (filterId: string, fallback: string) => string;
    configuredFilterDescription: (filterId: string, fallback?: string) => string;
    provinceFilters: string[];
    provinceOptions: string[];
    setProvinceFilters: React.Dispatch<React.SetStateAction<string[]>>;
    industrialParkFilterEnabled: boolean;
    industrialParkFilters: string[];
    industrialParkOptions: string[];
    setIndustrialParkFilters: React.Dispatch<React.SetStateAction<string[]>>;
    sourceFilterEnabled: boolean;
    sourceFilters: string[];
    setSourceFilters: React.Dispatch<React.SetStateAction<string[]>>;
    contactResultFilterEnabled: boolean;
    contactResultFilters: LeadCandidateContactResult[];
    setContactResultFilters: React.Dispatch<React.SetStateAction<LeadCandidateContactResult[]>>;
    potentialFilterEnabled: boolean;
    potentialFilters: LeadCandidatePotentialLevel[];
    setPotentialFilters: React.Dispatch<React.SetStateAction<LeadCandidatePotentialLevel[]>>;
    insightFilters: string[];
    setInsightFilters: React.Dispatch<React.SetStateAction<string[]>>;
    saleFilterEnabled: boolean;
    saleFilters: string[];
    setSaleFilters: React.Dispatch<React.SetStateAction<string[]>>;
    pinnedFilterEnabled: boolean;
    pinnedOnly: boolean;
    setPinnedOnly: React.Dispatch<React.SetStateAction<boolean>>;
    customFieldFilters: Record<string, string[]>;
    customFilterOptions: { [k: string]: { value: string; label: string }[] };
    setCustomFieldFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  };
}

/** Funnel filter panel for the raw-data list: quick, classification and advanced filters. */
export const LeadCandidateFilterPanel: React.FC<LeadCandidateFilterPanelProps> = ({
  workspaceView,
  setCurrentPage,
  currentUser,
  candidateOwners,
  customFieldDefinitions,
  filters: {
    showDataFilters,
    quickFilterCount,
    setShowDataFilters,
    clearDataFilters,
    provinceFilterEnabled,
    configuredFilterName,
    configuredFilterDescription,
    provinceFilters,
    provinceOptions,
    setProvinceFilters,
    industrialParkFilterEnabled,
    industrialParkFilters,
    industrialParkOptions,
    setIndustrialParkFilters,
    sourceFilterEnabled,
    sourceFilters,
    setSourceFilters,
    contactResultFilterEnabled,
    contactResultFilters,
    setContactResultFilters,
    potentialFilterEnabled,
    potentialFilters,
    setPotentialFilters,
    insightFilters,
    setInsightFilters,
    saleFilterEnabled,
    saleFilters,
    setSaleFilters,
    pinnedFilterEnabled,
    pinnedOnly,
    setPinnedOnly,
    customFieldFilters,
    customFilterOptions,
    setCustomFieldFilters
  }
}) => (
  <DataFilterPanel
    open={workspaceView !== 'management' && showDataFilters}
    title={workspaceView === 'tasks' ? 'Lọc công việc cần xử lý' : 'Lọc dữ liệu khách hàng'}
    description={
      workspaceView === 'tasks'
        ? 'Tập trung vào đúng nhóm công việc, lịch hẹn và Sale cần giám sát.'
        : 'Kết hợp khu vực, nguồn, trạng thái và người phụ trách.'
    }
    activeCount={quickFilterCount}
    onClose={() => setShowDataFilters(false)}
    onReset={clearDataFilters}
  >
    {provinceFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')}
        description={configuredFilterDescription(LEAD_FILTER_IDS.province, 'Có thể chọn đồng thời nhiều tỉnh/thành.')}
        selectedCount={provinceFilters.length}
      >
        <DataFilterCheckboxGroup
          options={provinceOptions.map(province => ({ value: province, label: province }))}
          selectedValues={provinceFilters}
          onChange={values => {
            setProvinceFilters(values);
            setCurrentPage(1);
          }}
          searchable
        />
      </DataFilterSection>
    )}
    {industrialParkFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName(LEAD_FILTER_IDS.industrialPark, 'Khu công nghiệp')}
        description={configuredFilterDescription(
          LEAD_FILTER_IDS.industrialPark,
          'Lọc riêng theo khu công nghiệp của doanh nghiệp.'
        )}
        selectedCount={industrialParkFilters.length}
      >
        <DataFilterCheckboxGroup
          options={industrialParkOptions.map(industrialPark => ({
            value: industrialPark,
            label: industrialPark
          }))}
          selectedValues={industrialParkFilters}
          onChange={values => {
            setIndustrialParkFilters(values);
            setCurrentPage(1);
          }}
          searchable
        />
      </DataFilterSection>
    )}
    {sourceFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName(LEAD_FILTER_IDS.source, 'Nguồn tìm kiếm')}
        description={configuredFilterDescription(
          LEAD_FILTER_IDS.source,
          'Kết hợp nhiều nguồn dữ liệu trong một lần lọc.'
        )}
        selectedCount={sourceFilters.length}
      >
        <DataFilterCheckboxGroup
          options={CANDIDATE_SOURCES.map(source => ({ value: source, label: source }))}
          selectedValues={sourceFilters}
          onChange={values => {
            setSourceFilters(values);
            setCurrentPage(1);
          }}
        />
      </DataFilterSection>
    )}
    {contactResultFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName('contact_result', 'Trạng thái liên hệ')}
        description={configuredFilterDescription('contact_result', 'Có thể theo dõi nhiều trạng thái cùng lúc.')}
        selectedCount={contactResultFilters.length}
      >
        <DataFilterCheckboxGroup
          options={(Object.entries(CONTACT_STATUS_LABELS) as Array<[LeadCandidateContactResult, string]>).map(
            ([value, label]) => ({ value, label })
          )}
          selectedValues={contactResultFilters}
          onChange={values => {
            setContactResultFilters(values as LeadCandidateContactResult[]);
            setCurrentPage(1);
          }}
        />
      </DataFilterSection>
    )}
    {potentialFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName('potential_level', 'Mức độ tiềm năng')}
        description={configuredFilterDescription('potential_level')}
        selectedCount={potentialFilters.length}
      >
        <DataFilterCheckboxGroup
          options={(Object.entries(POTENTIAL_LEVEL_LABELS) as Array<[LeadCandidatePotentialLevel, string]>).map(
            ([value, label]) => ({ value, label })
          )}
          selectedValues={potentialFilters}
          onChange={values => {
            setPotentialFilters(values as LeadCandidatePotentialLevel[]);
            setCurrentPage(1);
          }}
        />
      </DataFilterSection>
    )}
    {getCustomerInsightGroupsForModule('customer_data').map(group => (
      <DataFilterSection
        key={group.id}
        title={group.label}
        description="Lọc theo phân loại dữ liệu thô."
        selectedCount={group.items.filter(item => insightFilters.includes(item.id)).length}
      >
        <DataFilterCheckboxGroup
          options={group.items.map(item => ({ value: item.id, label: item.label }))}
          selectedValues={insightFilters.filter(value => group.items.some(item => item.id === value))}
          onChange={values => {
            setInsightFilters(current =>
              replaceCustomerInsightGroupValues(
                current,
                group.items.map(item => item.id),
                values
              )
            );
            setCurrentPage(1);
          }}
          searchable={group.items.length > 8}
        />
      </DataFilterSection>
    ))}
    {saleFilterEnabled && (workspaceView === 'all' || currentUser.role === 'admin') && (
      <DataFilterSection
        title={configuredFilterName(CUSTOMER_FILTER_IDS.sale, 'Sale phụ trách')}
        description={configuredFilterDescription(
          CUSTOMER_FILTER_IDS.sale,
          'Admin có thể chọn nhiều Sale để đối chiếu dữ liệu.'
        )}
        selectedCount={saleFilters.length}
      >
        <DataFilterCheckboxGroup
          options={candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))}
          selectedValues={saleFilters}
          onChange={values => {
            setSaleFilters(values);
            setCurrentPage(1);
          }}
          searchable
        />
      </DataFilterSection>
    )}
    {pinnedFilterEnabled && (
      <DataFilterSection
        title={configuredFilterName('pinned', 'Dữ liệu đã ghim')}
        description={configuredFilterDescription('pinned')}
        selectedCount={pinnedOnly ? 1 : 0}
      >
        <button
          type="button"
          className={`lead-candidate-pinned-filter ${pinnedOnly ? 'is-active' : ''}`}
          onClick={() => {
            setPinnedOnly(previous => !previous);
            setCurrentPage(1);
          }}
        >
          Chỉ hiển thị dữ liệu ưu tiên
        </button>
      </DataFilterSection>
    )}
    {customFieldDefinitions
      .filter(definition => definition.active)
      .map(definition => (
        <DataFilterSection
          key={definition.id}
          title={definition.name}
          description={definition.description || 'Lọc theo trường tùy chỉnh.'}
          selectedCount={(customFieldFilters[definition.id] || []).length}
        >
          <DataFilterCheckboxGroup
            options={customFilterOptions[definition.id] || []}
            selectedValues={customFieldFilters[definition.id] || []}
            onChange={values => {
              setCustomFieldFilters(previous => ({ ...previous, [definition.id]: values }));
              setCurrentPage(1);
            }}
            searchable={(customFilterOptions[definition.id] || []).length > 8}
          />
        </DataFilterSection>
      ))}
  </DataFilterPanel>
);
