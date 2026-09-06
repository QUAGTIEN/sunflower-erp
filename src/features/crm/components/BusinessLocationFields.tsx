import React, { useContext, useEffect, useMemo, useState } from 'react';
import { SystemFieldContext } from '@/components/systemFieldContext';
import type { LeadFilterDefinition, LeadFilterOption } from '@/features/crm/model/crmModels';
import { LEAD_FILTER_IDS, mergeLeadFilterDefinitions } from '@/features/crm/model/leadFilterConfig';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { SearchableProvinceSelect } from '@/components/SearchableProvinceSelect';
import { resolveVietnamProvince } from '@/data/vietnamProvinceCatalog';
import './BusinessLocationFields.css';

interface BusinessLocationValue {
  province: string;
  ward: string;
  industrialPark: string;
}

interface BusinessLocationFieldsProps extends BusinessLocationValue {
  onChange: (value: BusinessLocationValue) => void;
  className?: string;
}

const activeChildren = (option?: LeadFilterOption): LeadFilterOption[] => (
  (option?.children || []).filter(child => child.active !== false)
);

export const BusinessLocationFields: React.FC<BusinessLocationFieldsProps> = ({
  province,
  ward,
  industrialPark,
  onChange,
  className = ''
}) => {
  const [storedDefinitions, setStoredDefinitions] = useState<LeadFilterDefinition[]>([]);
  const systemFields = useContext(SystemFieldContext);
  const label = (key: string, fallback: string) => systemFields.find(field => field.key === key)?.label || fallback;
  const isVisible = (key: string) => !systemFields.find(field => field.key === key)?.removed;

  useEffect(() => dbService.subscribeCollection('lead_filter_definitions', data => {
    setStoredDefinitions(data as LeadFilterDefinition[]);
  }), []);

  const definitions = useMemo(() => mergeLeadFilterDefinitions(storedDefinitions), [storedDefinitions]);
  const provinceOptions = definitions
    .find(definition => definition.id === LEAD_FILTER_IDS.province)
    ?.options.filter(option => option.active !== false) || [];
  const industrialParkProvinceOptions = definitions
    .find(definition => definition.id === LEAD_FILTER_IDS.industrialPark)
    ?.options.filter(option => option.active !== false) || [];
  const canonicalProvince = resolveVietnamProvince(province);
  const selectedProvince = provinceOptions.find(option => option.id === canonicalProvince?.id);
  const wardOptions = activeChildren(selectedProvince).filter(option => option.kind === 'ward');
  const selectedIndustrialParkProvince = industrialParkProvinceOptions.find(option => option.id === canonicalProvince?.id);
  const industrialParkOptions = activeChildren(selectedIndustrialParkProvince).filter(option => option.kind === 'region');

  return (
    <div className={`business-location-fields ${className}`.trim()}>
      {isVisible('province') && <div className="form-group">
        <label htmlFor="business-province">{label('province', 'Tỉnh / thành')}</label>
        <SearchableProvinceSelect
          inputId="business-province"
          value={province}
          onChange={provinceName => onChange({ province: provinceName, ward: '', industrialPark: '' })}
        />
      </div>}
      {isVisible('ward') && <label className="form-group">
        <span>{label('ward', 'Phường / xã')}</span>
        <select
          value={ward}
          disabled={!selectedProvince}
          onChange={event => onChange({ province, ward: event.target.value, industrialPark: '' })}
        >
          <option value="">{selectedProvince ? 'Chọn phường/xã' : 'Chọn tỉnh/thành trước'}</option>
          {wardOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      </label>}
      {isVisible('industrialPark') && <label className="form-group">
        <span>{label('industrialPark', 'Khu công nghiệp')}</span>
        <select
          value={industrialPark}
          disabled={!selectedProvince || industrialParkOptions.length === 0}
          onChange={event => onChange({ province, ward, industrialPark: event.target.value })}
        >
          <option value="">{!selectedProvince ? 'Chọn tỉnh/thành trước' : industrialParkOptions.length > 0 ? 'Chọn KCN' : 'Chưa cấu hình KCN cho tỉnh/thành này'}</option>
          {industrialParkOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      </label>}
    </div>
  );
};
