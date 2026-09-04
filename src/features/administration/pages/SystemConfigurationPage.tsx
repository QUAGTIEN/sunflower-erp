import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  LockKeyhole,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2
} from 'lucide-react';
import {
  mergeCustomerFilterDefinitions,
  type CustomerFilterDefinition
} from '@/features/crm/model/customerFilterConfig';
import type {
  LeadCustomFieldType,
  LeadFilterDefinition,
  LeadFilterOption
} from '@/features/crm/model/crmModels';
import {
  compactLeadFilterDefinitionForStorage,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions,
  slugifyLeadFilterId
} from '@/features/crm/model/leadFilterConfig';
import {
  mergeSystemFilterDefinitions,
  SYSTEM_FILTER_SCOPE_LABELS,
  type SystemFilterDefinition,
  type SystemFilterScope
} from '@/domain/systemFilterConfig';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { CustomFieldConfiguration } from '@/features/administration/components/CustomFieldConfiguration';
import { PageContextHeader } from '@/components/PageContextHeader';
import './SystemConfiguration.css';

interface SystemConfigurationProps {
  currentUser: UserProfile;
}

interface LocationChoice {
  id: string;
  label: string;
  meta?: string;
}

const OPTION_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];

const createUniqueId = (baseId: string, existingIds: Set<string>) => {
  let candidate = baseId;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  return candidate;
};

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN')
  .trim();

const cloneOptions = (options: LeadFilterOption[]): LeadFilterOption[] => options.map(option => ({
  ...option,
  children: cloneOptions(option.children || [])
}));

const SearchableLocationSelect: React.FC<{
  value: string;
  options: LocationChoice[];
  placeholder: string;
  searchPlaceholder: string;
  onChange: (value: string) => void;
}> = ({ value, options, placeholder, searchPlaceholder, onChange }) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(option => option.id === value);
  const normalizedSearch = normalizeSearch(searchTerm);
  const visibleOptions = normalizedSearch
    ? options.filter(option => normalizeSearch(option.label).includes(normalizedSearch))
    : options;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setSearchTerm('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`system-location-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button type="button" className="system-location-select__trigger" onClick={() => setOpen(previous => !previous)}>
        <span>{selectedOption?.label || placeholder}</span>
        {selectedOption?.meta && <small>{selectedOption.meta}</small>}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="system-location-select__dropdown">
          <div className="system-location-select__search">
            <Search size={14} />
            <input autoFocus type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder={searchPlaceholder} />
          </div>
          <div className="system-location-select__options" role="listbox">
            {visibleOptions.map(option => (
              <button type="button" role="option" aria-selected={option.id === value} className={option.id === value ? 'is-selected' : ''} key={option.id} onClick={() => { onChange(option.id); setOpen(false); setSearchTerm(''); }}>
                <span>{option.label}</span><small>{option.meta}</small>{option.id === value && <Check size={14} />}
              </button>
            ))}
            {visibleOptions.length === 0 && <p>Không tìm thấy địa bàn phù hợp.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export const SystemConfiguration: React.FC<SystemConfigurationProps> = ({ currentUser }) => {
  const [configurationTab, setConfigurationTab] = useState<'filters' | 'custom_fields'>('filters');
  const [storedLeadDefinitions, setStoredLeadDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [storedCustomerDefinitions, setStoredCustomerDefinitions] = useState<CustomerFilterDefinition[]>([]);
  const [storedSystemDefinitions, setStoredSystemDefinitions] = useState<SystemFilterDefinition[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const [systemDraft, setSystemDraft] = useState<SystemFilterDefinition | null>(null);
  const [leadDraft, setLeadDraft] = useState<LeadFilterDefinition | null>(null);
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [newOptionName, setNewOptionName] = useState('');
  const [newRegionName, setNewRegionName] = useState('');
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');
  const scopeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribeLead = dbService.subscribeCollection('lead_filter_definitions', data => {
      setStoredLeadDefinitions(data as LeadFilterDefinition[]);
    });
    const unsubscribeCustomer = dbService.subscribeCollection('customer_filter_definitions', data => {
      setStoredCustomerDefinitions(data as CustomerFilterDefinition[]);
    });
    const unsubscribeSystem = dbService.subscribeCollection('system_filter_definitions', data => {
      setStoredSystemDefinitions(data as SystemFilterDefinition[]);
    });
    return () => {
      unsubscribeLead();
      unsubscribeCustomer();
      unsubscribeSystem();
    };
  }, []);

  useEffect(() => {
    if (!showScopeMenu) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !scopeMenuRef.current?.contains(event.target)) {
        setShowScopeMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowScopeMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showScopeMenu]);

  const leadDefinitions = useMemo(
    () => mergeLeadFilterDefinitions(storedLeadDefinitions),
    [storedLeadDefinitions]
  );
  const customerDefinitions = useMemo(
    () => mergeCustomerFilterDefinitions(storedCustomerDefinitions),
    [storedCustomerDefinitions]
  );
  const systemDefinitions = useMemo(
    () => mergeSystemFilterDefinitions(storedSystemDefinitions, leadDefinitions, customerDefinitions),
    [customerDefinitions, leadDefinitions, storedSystemDefinitions]
  );

  const saveLeadDefinition = async (definition: LeadFilterDefinition) => {
    const savedDefinition = {
      ...compactLeadFilterDefinitionForStorage(definition),
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    await dbService.addDocument('lead_filter_definitions', savedDefinition);
    setStoredLeadDefinitions(previous => [
      ...previous.filter(item => item.id !== definition.id),
      savedDefinition
    ]);
  };

  const saveCustomerDefinition = async (definition: CustomerFilterDefinition) => {
    const savedDefinition = {
      ...definition,
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    await dbService.addDocument('customer_filter_definitions', savedDefinition);
    setStoredCustomerDefinitions(previous => [
      ...previous.filter(item => item.id !== definition.id),
      savedDefinition
    ]);
  };

  const selectDefinition = (definition: SystemFilterDefinition) => {
    const matchingLeadDefinition = leadDefinitions.find(item => item.id === definition.id);
    const nextLeadDraft = matchingLeadDefinition
      ? { ...matchingLeadDefinition, options: cloneOptions(matchingLeadDefinition.options) }
      : null;
    const initialProvince = nextLeadDraft?.id === LEAD_FILTER_IDS.province
      ? nextLeadDraft.options.find(province => province.active && (province.children || []).some(ward => ward.active && (ward.children || []).some(region => region.active)))
        || nextLeadDraft.options.find(province => province.active)
      : undefined;
    const initialWard = (initialProvince?.children || []).find(ward => ward.active && (ward.children || []).some(region => region.active))
      || (initialProvince?.children || []).find(ward => ward.active);
    setSelectedDefinitionId(definition.id);
    setSystemDraft({ ...definition, scopes: [...definition.scopes] });
    setLeadDraft(nextLeadDraft);
    setSelectedProvinceId(initialProvince?.id || '');
    setSelectedWardId(initialWard?.id || '');
    setNewOptionName('');
    setNewRegionName('');
    setShowScopeMenu(false);
    setSaveError('');
    setSaveSuccess('');
  };

  const startCreateDefinition = () => {
    const id = createUniqueId(
      'lead_filter_moi',
      new Set([...systemDefinitions.map(item => item.id), ...leadDefinitions.map(item => item.id)])
    );
    const newLeadDefinition: LeadFilterDefinition = {
      id,
      name: 'Tiêu chí mới',
      group: 'Phân loại khách hàng tiềm năng',
      type: 'multi_select',
      options: [],
      active: true,
      showInQuickFilter: true,
      reportable: true,
      saleEditable: true,
      order: Math.max(0, ...leadDefinitions.map(item => item.order || 0)) + 10
    };
    const newSystemDefinition: SystemFilterDefinition = {
      id,
      name: newLeadDefinition.name,
      description: 'Tiêu chí phân loại tùy chỉnh dành cho danh sách Lead.',
      active: true,
      scopes: ['lead_list'],
      availableScopes: ['lead_list'],
      sourceType: 'manual_catalog',
      controlType: 'multi_select',
      optionsEditable: true
    };
    setSelectedDefinitionId(id);
    setSystemDraft(newSystemDefinition);
    setLeadDraft(newLeadDefinition);
    setSelectedProvinceId('');
    setSelectedWardId('');
    setNewOptionName('');
    setNewRegionName('');
    setShowScopeMenu(false);
    setSaveError('');
    setSaveSuccess('');
  };

  const updateScope = (scope: SystemFilterScope, checked: boolean) => {
    setSystemDraft(previous => previous ? {
      ...previous,
      scopes: checked
        ? Array.from(new Set([...previous.scopes, scope]))
        : previous.scopes.filter(item => item !== scope)
    } : previous);
  };

  const updateOption = (optionId: string, label: string) => {
    setLeadDraft(previous => previous ? {
      ...previous,
      options: previous.options.map(option => option.id === optionId ? { ...option, label } : option)
    } : previous);
  };

  const archiveOption = (optionId: string) => {
    setLeadDraft(previous => previous ? {
      ...previous,
      options: previous.options.map(option => option.id === optionId ? { ...option, active: false } : option)
    } : previous);
  };

  const addOption = () => {
    const label = newOptionName.trim();
    if (!label || !leadDraft) return;
    const duplicate = leadDraft.options.some(option => option.active && normalizeSearch(option.label) === normalizeSearch(label));
    if (duplicate) {
      setSaveError('Mục con này đã tồn tại trong tiêu chí.');
      return;
    }
    const baseId = slugifyLeadFilterId(label) || 'option';
    const option: LeadFilterOption = {
      id: createUniqueId(baseId, new Set(leadDraft.options.map(item => item.id))),
      label,
      color: OPTION_COLORS[leadDraft.options.length % OPTION_COLORS.length],
      active: true
    };
    setLeadDraft(previous => previous ? { ...previous, options: [...previous.options, option] } : previous);
    setNewOptionName('');
    setSaveError('');
  };

  const activeProvinceOptions = leadDraft?.id === LEAD_FILTER_IDS.province
    ? leadDraft.options.filter(option => option.active)
    : [];
  const selectedProvince = activeProvinceOptions.find(province => province.id === selectedProvinceId)
    || activeProvinceOptions[0];
  const activeWardOptions = (selectedProvince?.children || []).filter(ward => ward.active);
  const selectedWard = activeWardOptions.find(ward => ward.id === selectedWardId)
    || activeWardOptions[0];
  const activeRegions = (selectedWard?.children || []).filter(region => region.active);

  const updateRegion = (regionId: string, label: string) => {
    if (!selectedProvince || !selectedWard) return;
    setLeadDraft(previous => previous ? {
      ...previous,
      options: previous.options.map(province => province.id !== selectedProvince.id ? province : {
        ...province,
        children: (province.children || []).map(ward => ward.id !== selectedWard.id ? ward : {
          ...ward,
          children: (ward.children || []).map(region => region.id === regionId ? { ...region, label } : region)
        })
      })
    } : previous);
  };

  const archiveRegion = (regionId: string) => {
    if (!selectedProvince || !selectedWard) return;
    setLeadDraft(previous => previous ? {
      ...previous,
      options: previous.options.map(province => province.id !== selectedProvince.id ? province : {
        ...province,
        children: (province.children || []).map(ward => ward.id !== selectedWard.id ? ward : {
          ...ward,
          children: (ward.children || []).map(region => region.id === regionId ? { ...region, active: false } : region)
        })
      })
    } : previous);
  };

  const addRegion = () => {
    const label = newRegionName.trim();
    if (!label || !selectedProvince || !selectedWard) return;
    if (activeRegions.some(region => normalizeSearch(region.label) === normalizeSearch(label))) {
      setSaveError('Vùng/KCN này đã tồn tại tại địa bàn đã chọn.');
      return;
    }
    const baseId = `${selectedWard.id}__region_${slugifyLeadFilterId(label) || 'kcn'}`;
    const region: LeadFilterOption = {
      id: createUniqueId(baseId, new Set((selectedWard.children || []).map(item => item.id))),
      label,
      color: selectedWard.color,
      active: true,
      kind: 'region',
      system: false
    };
    setLeadDraft(previous => previous ? {
      ...previous,
      options: previous.options.map(province => province.id !== selectedProvince.id ? province : {
        ...province,
        children: (province.children || []).map(ward => ward.id !== selectedWard.id ? ward : {
          ...ward,
          children: [...(ward.children || []), region]
        })
      })
    } : previous);
    setNewRegionName('');
    setSaveError('');
  };

  const saveSelectedDefinition = async () => {
    if (!systemDraft?.name.trim()) return;
    const invalidOption = leadDraft?.id !== LEAD_FILTER_IDS.province
      && leadDraft?.options.some(option => option.active && !option.label.trim());
    const hasNoOption = leadDraft?.id !== LEAD_FILTER_IDS.province
      && leadDraft?.options.every(option => !option.active);
    const invalidRegion = leadDraft?.id === LEAD_FILTER_IDS.province
      && leadDraft.options.some(province => (province.children || []).some(ward => (
        (ward.children || []).some(region => region.active && !region.label.trim())
      )));
    if (invalidOption || invalidRegion || hasNoOption) {
      setSaveError(hasNoOption ? 'Tiêu chí mới cần có ít nhất một mục con.' : 'Tên mục con không được để trống.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    const savedSystemDefinition: SystemFilterDefinition = {
      ...systemDraft,
      name: systemDraft.name.trim(),
      description: systemDraft.description.trim(),
      scopes: systemDraft.scopes.filter(scope => systemDraft.availableScopes.includes(scope)),
      controlType: leadDraft?.type === 'checkbox' ? 'boolean' : systemDraft.controlType,
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    try {
      await dbService.addDocument('system_filter_definitions', savedSystemDefinition);
      if (leadDraft) {
        await saveLeadDefinition({
          ...leadDraft,
          name: savedSystemDefinition.name,
          active: savedSystemDefinition.active,
          options: cloneOptions(leadDraft.options)
        });
      }
      const customerDefinition = customerDefinitions.find(item => item.id === savedSystemDefinition.id);
      if (customerDefinition) {
        await saveCustomerDefinition({
          ...customerDefinition,
          name: savedSystemDefinition.name,
          description: savedSystemDefinition.description,
          active: savedSystemDefinition.active
        });
      }
      setStoredSystemDefinitions(previous => [
        ...previous.filter(item => item.id !== savedSystemDefinition.id),
        savedSystemDefinition
      ]);
      setSystemDraft(savedSystemDefinition);
      setSaveSuccess('Đã lưu tiêu chí và toàn bộ mục con.');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      setSaveError(code.includes('permission-denied')
        ? 'Firebase chưa cấp quyền quản trị cấu hình hệ thống. Hãy xuất bản Firestore Rules mới nhất.'
        : 'Không thể lưu cấu hình lúc này. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const selectedChildCount = leadDraft
    ? leadDraft.id === LEAD_FILTER_IDS.province
      ? leadDraft.options.flatMap(province => province.children || []).flatMap(ward => ward.children || []).filter(region => region.active).length
      : leadDraft.options.filter(option => option.active).length
    : 0;

  return (
    <div className="system-config-view">
      <PageContextHeader section="Cấu hình" current={configurationTab === 'custom_fields' ? 'Trường thông tin' : 'Tiêu chí bộ lọc'} className="system-config-header">
        <span className="system-config-admin-badge"><LockKeyhole size={14} /> Chỉ Giám đốc/Admin</span>
      </PageContextHeader>

      <nav className="system-config-tabs content-tabs" role="tablist" aria-label="Nhóm cấu hình">
        <button type="button" role="tab" aria-selected={configurationTab === 'filters'} className={configurationTab === 'filters' ? 'is-active' : ''} onClick={() => setConfigurationTab('filters')}>Tiêu chí bộ lọc</button>
        <button type="button" role="tab" aria-selected={configurationTab === 'custom_fields'} className={configurationTab === 'custom_fields' ? 'is-active' : ''} onClick={() => setConfigurationTab('custom_fields')}>Trường thông tin</button>
      </nav>

      {configurationTab === 'custom_fields' ? <CustomFieldConfiguration currentUser={currentUser} /> : <section className="system-filter-catalog">
        <header className="system-filter-catalog__header">
          <div><h2>Tiêu chí bộ lọc</h2><p>Chọn một tiêu chí để chỉnh sửa tên, mục con và nơi sử dụng.</p></div>
          <button type="button" className="btn btn-primary" onClick={startCreateDefinition}><Plus size={14} /> Thêm tiêu chí</button>
        </header>

        <div className="system-filter-catalog__body">
          <aside className="system-filter-list" aria-label="Danh sách tiêu chí bộ lọc">
            <div className="system-filter-list__count"><strong>{systemDefinitions.length} tiêu chí</strong><span>{systemDefinitions.filter(item => item.active).length} đang sử dụng</span></div>
            {systemDefinitions.map((definition, index) => {
              const matchingLead = leadDefinitions.find(item => item.id === definition.id);
              const childCount = matchingLead
                ? definition.id === LEAD_FILTER_IDS.province
                  ? matchingLead.options.flatMap(province => province.children || []).flatMap(ward => ward.children || []).filter(region => region.active).length
                  : matchingLead.options.filter(option => option.active).length
                : null;
              return (
                <button type="button" key={definition.id} className={`${selectedDefinitionId === definition.id ? 'is-selected' : ''} ${!definition.active ? 'is-inactive' : ''}`} onClick={() => selectDefinition(definition)}>
                  <span className="system-filter-list__number">{index + 1}</span>
                  <div><strong>{definition.name}</strong><span>{childCount === null ? 'Danh sách tự động từ hệ thống' : definition.id === LEAD_FILTER_IDS.province ? `${childCount} Vùng/KCN` : `${childCount} mục con`}</span></div>
                  <ChevronDown size={15} />
                </button>
              );
            })}
          </aside>

          <main className="system-filter-editor">
            {systemDraft ? (
              <>
                <div className="system-filter-editor__heading">
                  <div><h3>{systemDraft.name}</h3><p>{leadDraft ? `${selectedChildCount} mục con đang sử dụng` : 'Danh sách mục con được đồng bộ tự động'}</p></div>
                  <label className="system-filter-status"><input type="checkbox" checked={systemDraft.active} onChange={event => setSystemDraft(previous => previous ? { ...previous, active: event.target.checked } : previous)} /><span>Đang sử dụng</span></label>
                </div>

                <div className="system-filter-basic-fields">
                  <label><span>Tên tiêu chí *</span><input value={systemDraft.name} onChange={event => setSystemDraft(previous => previous ? { ...previous, name: event.target.value } : previous)} /></label>
                  <label><span>Mô tả hướng dẫn</span><input value={systemDraft.description} onChange={event => setSystemDraft(previous => previous ? { ...previous, description: event.target.value } : previous)} /></label>
                </div>

                {leadDraft && leadDraft.id !== LEAD_FILTER_IDS.province && (
                  <section className="system-child-editor">
                    <div className="system-child-editor__title">
                      <div><h4>Các mục con</h4><p>Chỉnh sửa trực tiếp từng lựa chọn. Mục bị xóa sẽ được lưu trữ để không làm mất dữ liệu cũ.</p></div>
                      <label><span>Cách lựa chọn</span><select value={leadDraft.type} onChange={event => setLeadDraft(previous => previous ? { ...previous, type: event.target.value as LeadCustomFieldType } : previous)}><option value="single_select">Chọn một</option><option value="multi_select">Chọn nhiều</option></select></label>
                    </div>
                    <div className="system-child-list">
                      {leadDraft.options.filter(option => option.active).map((option, index) => (
                        <div className="system-child-row" key={option.id}>
                          <span>{index + 1}</span>
                          <input value={option.label} onChange={event => updateOption(option.id, event.target.value)} />
                          <button type="button" title="Ngừng sử dụng mục này" onClick={() => archiveOption(option.id)}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="system-child-add">
                      <input value={newOptionName} onChange={event => setNewOptionName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addOption(); } }} placeholder="Nhập tên mục con mới..." />
                      <button type="button" className="btn btn-outline" onClick={addOption}><Plus size={14} /> Thêm mục con</button>
                    </div>
                  </section>
                )}

                {leadDraft?.id === LEAD_FILTER_IDS.province && (
                  <section className="system-child-editor system-location-editor">
                    <div className="system-child-editor__title"><div><h4>Tỉnh/thành – Phường/xã – Vùng/KCN</h4><p>Tỉnh/thành và phường/xã là danh mục cố định. Admin chỉ bổ sung Vùng/KCN vào địa bàn phù hợp.</p></div><span className="system-fixed-badge"><LockKeyhole size={12} /> Địa giới cố định</span></div>
                    <div className="system-location-grid">
                      <label><span>Tỉnh/Thành phố</span><SearchableLocationSelect value={selectedProvince?.id || ''} placeholder="Chọn tỉnh/thành" searchPlaceholder="Tìm nhanh tỉnh/thành..." options={activeProvinceOptions.map(province => ({ id: province.id, label: province.label, meta: `${(province.children || []).flatMap(ward => ward.children || []).filter(region => region.active).length} KCN` }))} onChange={provinceId => { const province = activeProvinceOptions.find(item => item.id === provinceId); setSelectedProvinceId(provinceId); setSelectedWardId((province?.children || []).find(ward => ward.active)?.id || ''); setNewRegionName(''); }} /></label>
                      <label><span>Phường/Xã</span><SearchableLocationSelect key={selectedProvince?.id || 'no-province'} value={selectedWard?.id || ''} placeholder="Chọn phường/xã" searchPlaceholder="Tìm nhanh phường/xã..." options={activeWardOptions.map(ward => ({ id: ward.id, label: ward.label, meta: `${(ward.children || []).filter(region => region.active).length} KCN` }))} onChange={wardId => { setSelectedWardId(wardId); setNewRegionName(''); }} /></label>
                    </div>
                    {selectedProvince && selectedWard && (
                      <div className="system-region-workspace">
                        <div className="system-region-workspace__heading"><strong>Vùng/KCN tại {selectedWard.label}, {selectedProvince.label}</strong><span>{activeRegions.length} mục</span></div>
                        <div className="system-child-list">
                          {activeRegions.map((region, index) => (
                            <div className="system-child-row" key={region.id}>
                              <span>{index + 1}</span>
                              <input value={region.label} onChange={event => updateRegion(region.id, event.target.value)} />
                              <button type="button" title="Ngừng sử dụng Vùng/KCN này" onClick={() => archiveRegion(region.id)}><Trash2 size={14} /></button>
                            </div>
                          ))}
                          {activeRegions.length === 0 && <div className="system-child-empty">Địa bàn này chưa có Vùng/KCN.</div>}
                        </div>
                        <div className="system-child-add">
                          <input value={newRegionName} onChange={event => setNewRegionName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addRegion(); } }} placeholder="Nhập tên Vùng/KCN cần bổ sung..." />
                          <button type="button" className="btn btn-outline" onClick={addRegion}><Plus size={14} /> Thêm Vùng/KCN</button>
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {!leadDraft && (
                  <section className="system-child-editor system-child-editor--automatic">
                    <LockKeyhole size={21} />
                    <div><h4>Mục con được đồng bộ tự động</h4><p>Tiêu chí này lấy lựa chọn từ dữ liệu nghiệp vụ thực tế như tài khoản Sale, khách hàng hoặc đơn hàng. Không thể nhập thủ công để tránh tạo lựa chọn không có dữ liệu.</p></div>
                  </section>
                )}

                <section className="system-filter-scope-section">
                  <div><h4>Nơi hiển thị</h4><p>Chọn các màn hình sẽ có tiêu chí này trong nút Bộ lọc.</p></div>
                  <div className={`system-scope-picker ${showScopeMenu ? 'is-open' : ''}`} ref={scopeMenuRef}>
                    <button type="button" className="system-scope-picker__trigger" aria-haspopup="true" aria-expanded={showScopeMenu} onClick={() => setShowScopeMenu(previous => !previous)}>
                      <span>{systemDraft.scopes.length > 0 ? `${systemDraft.scopes.length} nơi đã chọn` : 'Chọn nơi hiển thị'}</span>
                      <ChevronDown size={15} />
                    </button>
                    {showScopeMenu && (
                      <div className="system-scope-picker__menu">
                        <strong>Hiển thị trong nút Bộ lọc tại</strong>
                        {(Object.entries(SYSTEM_FILTER_SCOPE_LABELS) as Array<[SystemFilterScope, string]>).map(([scope, label]) => {
                          const supported = systemDraft.availableScopes.includes(scope);
                          return <label key={scope} className={!supported ? 'is-disabled' : ''}><input type="checkbox" disabled={!supported} checked={systemDraft.scopes.includes(scope)} onChange={event => updateScope(scope, event.target.checked)} /><span><b>{label}</b>{!supported && <small>Tiêu chí không hỗ trợ màn hình này</small>}</span></label>;
                        })}
                      </div>
                    )}
                  </div>
                </section>

                <div className="system-filter-editor__footer">
                  <div>{saveError && <p className="is-error" role="alert">{saveError}</p>}{saveSuccess && <p className="is-success">{saveSuccess}</p>}</div>
                  <button type="button" className="btn btn-primary" disabled={saving || !systemDraft.name.trim()} onClick={saveSelectedDefinition}><Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu tiêu chí'}</button>
                </div>
              </>
            ) : (
              <div className="system-filter-editor__empty"><Settings2 size={34} /><strong>Chọn một tiêu chí để chỉnh sửa</strong><span>Các mục con sẽ hiển thị trực tiếp tại đây.</span></div>
            )}
          </main>
        </div>
      </section>}
    </div>
  );
};
