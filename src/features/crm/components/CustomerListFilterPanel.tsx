import React from 'react';
import { DataFilterCheckboxGroup, DataFilterPanel, DataFilterSection } from '@/components/DataWorkspaceFilters';
import type { useCustomerListFilters } from '@/features/crm/hooks/useCustomerListFilters';
import type { CustomerListFilterInputs } from '@/features/crm/hooks/useCustomerListFilters';
import type { CrmTimeFilter } from '@/features/crm/model/customerWorkspace';

interface CustomerListFilterPanelProps {
  filters: ReturnType<typeof useCustomerListFilters>;
  customFieldDefinitions: CustomerListFilterInputs['customFieldDefinitions'];
}

/** Quick filter side panel of the customer list. State lives in useCustomerListFilters. */
export const CustomerListFilterPanel: React.FC<CustomerListFilterPanelProps> = ({
  filters,
  customFieldDefinitions
}) => {
  const {
    customFieldFilters,
    customFilterOptions,
    industrialParkFilterCopy,
    industrialParkFilterEnabled,
    industrialParkFilterOptions,
    industrialParkFilters,
    poTimeFilterCopy,
    poTimeFilterEnabled,
    productFilterCopy,
    productFilterEnabled,
    productFilterOptions,
    productFilters,
    provinceFilterCopy,
    provinceFilterEnabled,
    provinceFilterOptions,
    provinceFilters,
    quickFilterCount,
    rankFilterCopy,
    rankFilterEnabled,
    rankFilterOptions,
    rankFilters,
    resetCrmListFilters,
    saleFilterCopy,
    saleFilterEnabled,
    saleFilterOptions,
    saleFilters,
    setCustomFieldFilters,
    setCustomerPage,
    setIndustrialParkFilters,
    setProductFilters,
    setProvinceFilters,
    setRankFilters,
    setSaleFilters,
    setShowListFilters,
    setTimeFilters,
    showListFilters,
    timeFilterOptions,
    timeFilters
  } = filters;

  return (
    <DataFilterPanel
      open={showListFilters}
      title="Lọc danh sách khách hàng"
      description="Kết hợp nhiều tiêu chí để tạo đúng danh sách cần theo dõi."
      activeCount={quickFilterCount}
      onClose={() => setShowListFilters(false)}
      onReset={resetCrmListFilters}
    >
      {saleFilterEnabled && (
        <DataFilterSection
          title={saleFilterCopy.name}
          description={saleFilterCopy.description}
          selectedCount={saleFilters.length}
        >
          <DataFilterCheckboxGroup
            options={saleFilterOptions}
            selectedValues={saleFilters}
            onChange={values => {
              setSaleFilters(values);
              setCustomerPage(1);
            }}
            searchable
          />
        </DataFilterSection>
      )}
      {rankFilterEnabled && (
        <DataFilterSection
          title={rankFilterCopy.name}
          description={rankFilterCopy.description}
          selectedCount={rankFilters.length}
        >
          <DataFilterCheckboxGroup
            options={rankFilterOptions}
            selectedValues={rankFilters}
            onChange={values => {
              setRankFilters(values);
              setCustomerPage(1);
            }}
          />
        </DataFilterSection>
      )}
      {provinceFilterEnabled && (
        <DataFilterSection
          title={provinceFilterCopy.name}
          description={provinceFilterCopy.description}
          selectedCount={provinceFilters.length}
        >
          <DataFilterCheckboxGroup
            options={provinceFilterOptions}
            selectedValues={provinceFilters}
            onChange={values => {
              setProvinceFilters(values);
              setCustomerPage(1);
            }}
            searchable
          />
        </DataFilterSection>
      )}
      {industrialParkFilterEnabled && (
        <DataFilterSection
          title={industrialParkFilterCopy.name}
          description={industrialParkFilterCopy.description}
          selectedCount={industrialParkFilters.length}
        >
          <DataFilterCheckboxGroup
            options={industrialParkFilterOptions}
            selectedValues={industrialParkFilters}
            onChange={values => {
              setIndustrialParkFilters(values);
              setCustomerPage(1);
            }}
            searchable
          />
        </DataFilterSection>
      )}
      {poTimeFilterEnabled && (
        <DataFilterSection
          title={poTimeFilterCopy.name}
          description={poTimeFilterCopy.description}
          selectedCount={timeFilters.length}
        >
          <DataFilterCheckboxGroup
            options={timeFilterOptions}
            selectedValues={timeFilters}
            onChange={values => {
              setTimeFilters(values as CrmTimeFilter[]);
              setCustomerPage(1);
            }}
          />
        </DataFilterSection>
      )}
      {productFilterEnabled && (
        <DataFilterSection
          title={productFilterCopy.name}
          description={productFilterCopy.description}
          selectedCount={productFilters.length}
        >
          <DataFilterCheckboxGroup
            options={productFilterOptions}
            selectedValues={productFilters}
            onChange={values => {
              setProductFilters(values);
              setCustomerPage(1);
            }}
            searchable
          />
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
                setCustomerPage(1);
              }}
              searchable={(customFilterOptions[definition.id] || []).length > 8}
            />
          </DataFilterSection>
        ))}
    </DataFilterPanel>
  );
};
