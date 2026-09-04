import React, { useEffect, useMemo, useState } from 'react';
import type { LeadFilterDefinition, LeadFilterOption } from '@/features/crm/model/crmModels';
import { LEAD_FILTER_IDS, mergeLeadFilterDefinitions } from '@/features/crm/model/leadFilterConfig';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
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

  useEffect(() => dbService.subscribeCollection('lead_filter_definitions', data => {
    setStoredDefinitions(data as LeadFilterDefinition[]);
  }), []);

  const provinceOptions = useMemo(() => (
    mergeLeadFilterDefinitions(storedDefinitions)
      .find(definition => definition.id === LEAD_FILTER_IDS.province)
      ?.options.filter(option => option.active !== false) || []
  ), [storedDefinitions]);
  const selectedProvince = provinceOptions.find(option => option.label === province);
  const wardOptions = activeChildren(selectedProvince).filter(option => option.kind === 'ward');
  const selectedWard = wardOptions.find(option => option.label === ward);
  const industrialParkOptions = activeChildren(selectedWard).filter(option => option.kind === 'region');

  return (
    <div className={`business-location-fields ${className}`.trim()}>
      <label className="form-group">
        <span>Tỉnh / thành</span>
        <select
          value={province}
          onChange={event => onChange({ province: event.target.value, ward: '', industrialPark: '' })}
        >
          <option value="">Chọn tỉnh/thành</option>
          {provinceOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      </label>
      <label className="form-group">
        <span>Phường / xã</span>
        <select
          value={ward}
          disabled={!selectedProvince}
          onChange={event => onChange({ province, ward: event.target.value, industrialPark: '' })}
        >
          <option value="">{selectedProvince ? 'Chọn phường/xã' : 'Chọn tỉnh/thành trước'}</option>
          {wardOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      </label>
      <label className="form-group">
        <span>Khu công nghiệp</span>
        <select
          value={industrialPark}
          disabled={!selectedWard || industrialParkOptions.length === 0}
          onChange={event => onChange({ province, ward, industrialPark: event.target.value })}
        >
          <option value="">{!selectedWard ? 'Chọn phường/xã trước' : industrialParkOptions.length > 0 ? 'Chọn KCN' : 'Chưa cấu hình KCN'}</option>
          {industrialParkOptions.map(option => <option key={option.id} value={option.label}>{option.label}</option>)}
        </select>
      </label>
    </div>
  );
};
