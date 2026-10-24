import type { SystemFilterDefinition } from '@/domain/systemFilterConfig';
import type { LeadFilterOption } from '@/features/crm/model/crmModels';
import type { EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';
import React from 'react';
import { DataFilterPanel, DataFilterSection, DataFilterCheckboxGroup } from '@/components/DataWorkspaceFilters';
import { getSystemFilterDefinition } from '@/domain/systemFilterConfig';
import {
  LEAD_FILTER_IDS,
  flattenLeadFilterOptions,
  findLeadFilterOptionPathInOptions
} from '@/features/crm/model/leadFilterConfig';
import {
  getCustomerInsightGroupsForModule,
  replaceCustomerInsightGroupValues
} from '@/features/crm/model/customerInsightCatalog';
import type { LeadFilterDefinition } from '@/features/crm/model/crmModels';

interface LeadFilterPanelProps {
  customFieldDefinitions: EntityFieldDefinition[];
  filters: {
    showLeadFilters: boolean;
    leadQuickFilterCount: number;
    setShowLeadFilters: React.Dispatch<React.SetStateAction<boolean>>;
    clearFilters: () => void;
    visibleFilterDefinitions: LeadFilterDefinition[];
    quickFilterOptionsByField: { [k: string]: LeadFilterOption[] };
    systemFilterDefinitions: SystemFilterDefinition[];
    dynamicFilters: Record<string, string[]>;
    setDynamicFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    insightFilters: string[];
    setInsightFilters: React.Dispatch<React.SetStateAction<string[]>>;
    customFieldFilters: Record<string, string[]>;
    customFilterOptions: { [k: string]: { value: string; label: string }[] };
    setCustomFieldFilters: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  };
}

/** Funnel filter panel for the lead list: quick, classification and advanced filters. */
export const LeadFilterPanel: React.FC<LeadFilterPanelProps> = ({
  customFieldDefinitions,
  filters: {
    showLeadFilters,
    leadQuickFilterCount,
    setShowLeadFilters,
    clearFilters,
    visibleFilterDefinitions,
    quickFilterOptionsByField,
    systemFilterDefinitions,
    dynamicFilters,
    setDynamicFilters,
    insightFilters,
    setInsightFilters,
    customFieldFilters,
    customFilterOptions,
    setCustomFieldFilters
  }
}) => (
  <DataFilterPanel
    open={showLeadFilters}
    title="Lọc danh sách KH tiềm năng"
    description="Chọn nhiều tiêu chí để thu hẹp danh sách khách hàng tiềm năng."
    activeCount={leadQuickFilterCount}
    onClose={() => setShowLeadFilters(false)}
    onReset={clearFilters}
  >
    {visibleFilterDefinitions.map(field => {
      const fieldOptions = quickFilterOptionsByField[field.id] || [];
      const configuredField = getSystemFilterDefinition(systemFilterDefinitions, field.id);
      const options =
        field.id === LEAD_FILTER_IDS.industrialPark
          ? fieldOptions.flatMap(province =>
              flattenLeadFilterOptions([province])
                .filter(option => option.kind === 'region')
                .map(option => {
                  const path = findLeadFilterOptionPathInOptions([province], option.id);
                  return {
                    value: option.id,
                    label: option.label,
                    description: path
                      .slice(0, -1)
                      .map(parent => parent.label)
                      .join(' · ')
                  };
                })
            )
          : fieldOptions.map(option => ({ value: option.id, label: option.label }));
      return (
        <DataFilterSection
          key={field.id}
          title={configuredField?.name || field.name}
          selectedCount={(dynamicFilters[field.id] || []).length}
          description={
            configuredField?.description ||
            (field.id === LEAD_FILTER_IDS.province
              ? 'Lọc riêng theo tỉnh/thành.'
              : field.id === LEAD_FILTER_IDS.industrialPark
                ? 'Lọc theo khu công nghiệp đã cấu hình cho từng tỉnh/thành.'
                : 'Có thể chọn đồng thời nhiều giá trị.')
          }
        >
          <DataFilterCheckboxGroup
            options={options}
            selectedValues={dynamicFilters[field.id] || []}
            onChange={values =>
              setDynamicFilters(previous => ({
                ...previous,
                [field.id]: values
              }))
            }
            searchable={options.length > 8}
          />
        </DataFilterSection>
      );
    })}
    {getCustomerInsightGroupsForModule('leads').map(group => (
      <DataFilterSection
        key={`insight-${group.id}`}
        title={group.label}
        description="Lọc theo phân loại nghiệp vụ thuộc phân hệ Tiềm năng."
        selectedCount={group.items.filter(item => insightFilters.includes(item.id)).length}
      >
        <DataFilterCheckboxGroup
          options={group.items.map(item => ({ value: item.id, label: item.label }))}
          selectedValues={insightFilters.filter(value => group.items.some(item => item.id === value))}
          onChange={values =>
            setInsightFilters(current =>
              replaceCustomerInsightGroupValues(
                current,
                group.items.map(item => item.id),
                values
              )
            )
          }
          searchable={group.items.length > 8}
        />
      </DataFilterSection>
    ))}
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
            onChange={values => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: values }))}
            searchable={(customFilterOptions[definition.id] || []).length > 8}
          />
        </DataFilterSection>
      ))}
  </DataFilterPanel>
);
