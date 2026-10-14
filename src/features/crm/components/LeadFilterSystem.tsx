import { showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Pencil, Plus, Save, Search, Settings2, UserRoundSearch, X } from 'lucide-react';
import {
  isActiveLeadRecord,
  type LeadCustomFieldType,
  type LeadFilterDefinition,
  type LeadRecord
} from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import {
  findLeadFilterOption,
  getLeadFilterValues,
  LEAD_FILTER_IDS,
  slugifyLeadFilterId
} from '@/features/crm/model/leadFilterConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { RowActionMenu } from '@/components/RowActionMenu';
import { SearchableLocationSelect as SearchableValueSelect } from '@/components/SearchableProvinceSelect';

const FIELD_TYPE_LABELS: Record<LeadCustomFieldType, string> = {
  multi_select: 'Chọn nhiều',
  single_select: 'Chọn một',
  checkbox: 'Có / Không',
  text: 'Văn bản',
  number: 'Số',
  date: 'Ngày'
};

const DEFAULT_OPTION_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];

const normalizeLocationSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi-VN')
  .replace(/đ/g, 'd')
  .trim();

type SearchableLocationOption = {
  id: string;
  label: string;
  meta?: string;
};

const SearchableLocationSelect: React.FC<{
  value: string;
  options: SearchableLocationOption[];
  ariaLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  onChange: (value: string) => void;
}> = ({ value, options, ariaLabel, searchPlaceholder, emptyMessage, onChange }) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find(option => option.id === value);
  const normalizedSearch = normalizeLocationSearch(searchTerm);
  const visibleOptions = normalizedSearch
    ? options.filter(option => normalizeLocationSearch(option.label).includes(normalizedSearch))
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
    <div className={`lead-location-combobox ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="lead-location-combobox__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(previous => !previous)}
      >
        <span>{selectedOption?.label || 'Chọn địa bàn'}{selectedOption?.meta ? ` · ${selectedOption.meta}` : ''}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="lead-location-combobox__dropdown">
          <div className="lead-location-combobox__search">
            <Search size={14} />
            <input
              autoFocus
              type="search"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
          <div className="lead-location-combobox__options" role="listbox" aria-label={ariaLabel}>
            {visibleOptions.map(option => (
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={option.id === value ? 'is-selected' : ''}
                key={option.id}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setSearchTerm('');
                }}
              >
                <span>{option.label}</span>
                <small>{option.meta}</small>
                {option.id === value && <Check size={14} />}
              </button>
            ))}
            {visibleOptions.length === 0 && <p>{emptyMessage}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export const LeadDynamicFields: React.FC<{
  lead?: LeadRecord;
  values?: Record<string, string[]>;
  definitions: LeadFilterDefinition[];
  canEditAll: boolean;
  onChange: (field: LeadFilterDefinition, value: string, checked?: boolean) => void;
}> = ({ lead, values: controlledValues, definitions, canEditAll, onChange }) => {
  const values = controlledValues || (lead ? getLeadFilterValues(lead, definitions) : {});
  const fieldKeyPrefix = lead?.id || 'lead-draft';
  const [openFieldId, setOpenFieldId] = useState('');

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !target.closest('[data-lead-dynamic-filter]')) {
        setOpenFieldId('');
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFieldId('');
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className="lead-compact-filters">
      {definitions.filter(field => field.active).map(field => {
        const fieldValues = values[field.id] || [];
        const disabled = !canEditAll && !field.saleEditable;
        const activeOptions = field.options.filter(item => item.active);

        if (field.id === LEAD_FILTER_IDS.province) {
          const selectedProvince = activeOptions.find(option => fieldValues.includes(option.id));
          const activeWards = (selectedProvince?.children || []).filter(ward => ward.active);
          const selectedWard = activeWards.find(ward => fieldValues.includes(ward.id));

          return (
            <div key={field.id} className="lead-compact-filter-row lead-compact-filter-row--province">
              <span>{field.name}</span>
              <div className="lead-province-selects">
                <div className="lead-compact-filter-field">
                  <span>Tỉnh/Thành phố</span>
                  <SearchableValueSelect value={selectedProvince?.id || ''} valueKey="id" options={activeOptions} disabled={disabled} ariaLabel="Tỉnh/Thành phố" placeholder="Chọn hoặc gõ để tìm tỉnh/thành" emptyMessage="Không tìm thấy tỉnh/thành phù hợp." onChange={value => onChange(field, value)} />
                </div>
                <div className="lead-compact-filter-field">
                  <span>Phường/Xã</span>
                  <SearchableValueSelect value={selectedWard?.id || ''} valueKey="id" options={activeWards} disabled={disabled || !selectedProvince} ariaLabel="Phường/Xã" placeholder={selectedProvince ? 'Chọn hoặc gõ để tìm phường/xã' : 'Chọn tỉnh/thành trước'} emptyMessage="Không tìm thấy phường/xã phù hợp." onChange={value => onChange(field, value || selectedProvince?.id || '')} />
                </div>
              </div>
            </div>
          );
        }

        if (field.id === LEAD_FILTER_IDS.industrialPark) {
          const provinceId = values[LEAD_FILTER_IDS.province]?.[0] || '';
          const selectedProvince = activeOptions.find(option => option.id === provinceId);
          const activeIndustrialParks = (selectedProvince?.children || []).filter(park => park.active);
          const selectedIndustrialPark = activeIndustrialParks.find(park => fieldValues.includes(park.id));

          return (
            <div key={field.id} className="lead-compact-filter-row">
              <span>{field.name}</span>
              <SearchableValueSelect
                value={selectedIndustrialPark?.id || ''}
                valueKey="id"
                options={activeIndustrialParks}
                disabled={disabled || !selectedProvince || activeIndustrialParks.length === 0}
                ariaLabel={field.name}
                placeholder={!selectedProvince ? 'Chọn tỉnh/thành trước' : activeIndustrialParks.length > 0 ? 'Chọn hoặc gõ để tìm KCN' : 'Chưa cấu hình KCN cho tỉnh/thành này'}
                emptyMessage="Không tìm thấy KCN phù hợp."
                onChange={value => onChange(field, value)}
              />
            </div>
          );
        }

        if (field.type === 'multi_select') {
          const selectedLabels = activeOptions
            .filter(item => fieldValues.includes(item.id))
            .map(item => item.label);
          const summary = selectedLabels.length === 0
            ? 'Chưa chọn'
            : selectedLabels.length <= 2 ? selectedLabels.join(', ') : `${selectedLabels.length} lựa chọn`;

          return (
            <div key={field.id} className="lead-compact-filter-row" data-lead-dynamic-filter>
              <span>{field.name}</span>
              <div className="lead-compact-filter-menu">
                <button type="button" className={`lead-compact-filter-trigger ${selectedLabels.length > 0 ? 'has-value' : ''}`} aria-expanded={openFieldId === field.id} onClick={() => setOpenFieldId(current => current === field.id ? '' : field.id)}>{summary}</button>
                {openFieldId === field.id && <div className="lead-compact-filter-options">
                  {activeOptions.map(item => (
                    <label key={item.id} className={fieldValues.includes(item.id) ? 'is-checked' : ''}>
                      <input
                        type="checkbox"
                        checked={fieldValues.includes(item.id)}
                        disabled={disabled}
                        onChange={event => onChange(field, item.id, event.target.checked)}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>}
              </div>
            </div>
          );
        }

        if (field.type === 'single_select') {
          return (
            <label key={field.id} className="lead-compact-filter-row">
              <span>{field.name}</span>
              <select value={fieldValues[0] || ''} disabled={disabled} onChange={event => onChange(field, event.target.value)}>
                <option value="">Chưa chọn</option>
                {activeOptions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
          );
        }

        if (field.type === 'checkbox') {
          return (
            <label key={field.id} className="lead-compact-filter-row lead-compact-filter-row--checkbox">
              <span>{field.name}</span>
              <input type="checkbox" checked={fieldValues[0] === 'true'} disabled={disabled} onChange={event => onChange(field, 'true', event.target.checked)} />
            </label>
          );
        }

        return (
          <label key={`${fieldKeyPrefix}-${field.id}-${fieldValues[0] || ''}`} className="lead-compact-filter-row">
            <span>{field.name}</span>
            <input
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              defaultValue={fieldValues[0] || ''}
              disabled={disabled}
              onBlur={event => onChange(field, event.target.value)}
            />
          </label>
        );
      })}
    </div>
  );
};

export const LeadFilterAdminModal: React.FC<{
  definitions: LeadFilterDefinition[];
  onClose: () => void;
  onSaveDefinition: (definition: LeadFilterDefinition) => Promise<void>;
}> = ({ definitions, onClose, onSaveDefinition }) => {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<LeadFilterDefinition>(() => definitions[0] || {
    id: '',
    name: '',
    group: 'Phân loại khách hàng tiềm năng',
    type: 'single_select',
    options: [],
    active: true,
    showInQuickFilter: true,
    reportable: true,
    saleEditable: true,
    order: 10
  });
  const [optionLines, setOptionLines] = useState('');
  const [wardRegionLines, setWardRegionLines] = useState<Record<string, string>>({});
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [selectedWardId, setSelectedWardId] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const getSaveErrorMessage = (error: unknown) => {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    if (code === 'permission-denied' || code === 'firestore/permission-denied') {
      return 'Firebase chưa cấp quyền quản trị bộ lọc. Hãy kiểm tra và xuất bản Firestore Rules mới nhất.';
    }
    if (code === 'auth/session-expired' || code === 'unauthenticated' || code === 'firestore/unauthenticated') {
      return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.';
    }
    return 'Không thể lưu bộ lọc lúc này. Vui lòng thử lại hoặc kiểm tra kết nối Firebase.';
  };

  const persistDefinition = async (definition: LeadFilterDefinition) => {
    return runMutationAction("LeadFilterSystem.tsx:persistDefinition", async () => {
      setSaveError('');
      setSaving(true);
      try {
        await onSaveDefinition(definition);

        showSuccessToast("Đã lưu thành công");
        return true;
      } catch (error) {
        showErrorToast();
        setSaveError(getSaveErrorMessage(error));
        return false;
      } finally {
        setSaving(false);
      }
    }, definition);
  };

  const startCreate = () => {
    setSaveError('');
    const id = `lead_filter_${Date.now().toString(36)}`;
    setEditingId(id);
    setDraft({
      id,
      name: '',
      group: 'Phân loại khách hàng tiềm năng',
      type: 'single_select',
      options: [],
      active: true,
      showInQuickFilter: true,
      reportable: true,
      saleEditable: true,
      order: Math.max(0, ...definitions.map(item => item.order || 0)) + 10
    });
    setOptionLines('');
    setWardRegionLines({});
    setSelectedProvinceId('');
    setSelectedWardId('');
  };

  const startEdit = (definition: LeadFilterDefinition) => {
    setSaveError('');
    setEditingId(definition.id);
    setDraft({
      ...definition,
      options: definition.options.map(item => ({
        ...item,
        children: (item.children || []).map(child => ({ ...child }))
      }))
    });
    setOptionLines(definition.options.filter(item => item.active).map(item => item.label).join('\n'));
    setWardRegionLines(Object.fromEntries(definition.options.flatMap(province => (
      (province.children || []).map(ward => [
        ward.id,
        (ward.children || []).filter(region => region.active).map(region => region.label).join('\n')
      ])
    ))));
    const initialProvince = definition.id === LEAD_FILTER_IDS.province
      ? definition.options.find(province => province.active && (province.children || []).some(ward => (
        ward.active && (ward.children || []).some(region => region.active)
      ))) || definition.options.find(province => province.active)
      : undefined;
    const initialWard = (initialProvince?.children || []).find(ward => (
      ward.active && (ward.children || []).some(region => region.active)
    )) || (initialProvince?.children || []).find(ward => ward.active);
    setSelectedProvinceId(initialProvince?.id || '');
    setSelectedWardId(initialWard?.id || '');
  };

  const updateOptionLines = (value: string) => {
    setOptionLines(value);
    const labels = value.split('\n').map(line => line.trim()).filter(Boolean);
    setDraft(previous => {
      const previousByLabel = new Map(previous.options.map(item => [item.label.toLocaleLowerCase('vi-VN'), item]));
      const previousActiveOptions = previous.options.filter(item => item.active);
      const usedIds = new Set<string>();
      const activeOptions = labels.map((label, index) => {
        const sameLabel = previousByLabel.get(label.toLocaleLowerCase('vi-VN'));
        const samePosition = previousActiveOptions[index];
        const existing = sameLabel && !usedIds.has(sameLabel.id)
          ? sameLabel
          : samePosition && !usedIds.has(samePosition.id) ? samePosition : null;
        const nextOption = existing || {
          id: `${slugifyLeadFilterId(label) || 'option'}_${Date.now().toString(36)}_${index + 1}`,
          label,
          color: DEFAULT_OPTION_COLORS[index % DEFAULT_OPTION_COLORS.length],
          active: true
        };
        usedIds.add(nextOption.id);
        return { ...nextOption, label, active: true };
      });
      const activeIds = new Set(activeOptions.map(item => item.id));
      const archived = previous.options.filter(item => !activeIds.has(item.id)).map(item => ({ ...item, active: false }));
      return { ...previous, options: [...activeOptions, ...archived] };
    });
  };

  const saveDraft = async () => {
    return runMutationAction("LeadFilterSystem.tsx:saveDraft", async () => {
      if (!draft.name.trim()) return;
      const optionLabels = optionLines.split('\n').map(line => line.trim()).filter(Boolean);
      if (draft.id !== LEAD_FILTER_IDS.province && optionLabels.length === 0) return;
      const saved = await persistDefinition({
        ...draft,
        name: draft.name.trim(),
        group: draft.group || 'Phân loại khách hàng tiềm năng',
        type: draft.id === LEAD_FILTER_IDS.province ? 'single_select' : draft.type,
        showInQuickFilter: true
      });
      if (saved) setEditingId('');
    }, undefined);
  };

  const updateWardRegionLines = (provinceId: string, wardId: string, value: string) => {
    setWardRegionLines(previous => ({ ...previous, [wardId]: value }));
    const labels = value.split('\n').map(line => line.trim()).filter(Boolean);
    setDraft(previous => ({
      ...previous,
      options: previous.options.map(province => {
        if (province.id !== provinceId) return province;
        return {
          ...province,
          children: (province.children || []).map(ward => {
            if (ward.id !== wardId) return ward;
            const previousRegions = ward.children || [];
            const previousByLabel = new Map(previousRegions.map(item => [item.label.toLocaleLowerCase('vi-VN'), item]));
            const previousActiveRegions = previousRegions.filter(item => item.active);
            const usedIds = new Set<string>();
            const activeRegions = labels.map((label, index) => {
              const sameLabel = previousByLabel.get(label.toLocaleLowerCase('vi-VN'));
              const samePosition = previousActiveRegions[index];
              const existing = sameLabel && !usedIds.has(sameLabel.id)
                ? sameLabel
                : samePosition && !usedIds.has(samePosition.id) ? samePosition : null;
              const region = existing || {
                id: `${ward.id}__region_${slugifyLeadFilterId(label) || 'kcn'}_${Date.now().toString(36)}_${index + 1}`,
                label,
                color: ward.color,
                active: true,
                kind: 'region' as const,
                system: false
              };
              usedIds.add(region.id);
              return { ...region, label, color: ward.color, active: true, kind: 'region' as const, system: false };
            });
            const activeIds = new Set(activeRegions.map(item => item.id));
            const archivedRegions = previousRegions
              .filter(item => !activeIds.has(item.id))
              .map(item => ({ ...item, active: false }));
            return { ...ward, children: [...activeRegions, ...archivedRegions] };
          })
        };
      })
    }));
  };

  const toggleDefinitionActive = async (definition: LeadFilterDefinition) => {
    return runMutationAction("LeadFilterSystem.tsx:toggleDefinitionActive", async () => {
      const saved = await persistDefinition({ ...definition, active: !definition.active });
      if (saved && editingId === definition.id) setEditingId('');
    }, definition);
  };

  const activeProvinceOptions = draft.id === LEAD_FILTER_IDS.province
    ? draft.options.filter(optionItem => optionItem.active)
    : [];
  const selectedProvince = activeProvinceOptions.find(province => province.id === selectedProvinceId)
    || activeProvinceOptions[0];
  const activeWardOptions = (selectedProvince?.children || []).filter(ward => ward.active);
  const selectedWard = activeWardOptions.find(ward => ward.id === selectedWardId)
    || activeWardOptions[0];
  const configuredProvinceCount = activeProvinceOptions.filter(province => (
    (province.children || []).some(ward => (
      ward.active && (ward.children || []).some(region => region.active)
    ))
  )).length;
  const configuredRegionCount = activeProvinceOptions.reduce((provinceTotal, province) => (
    provinceTotal + (province.children || []).reduce((wardTotal, ward) => (
      wardTotal + (ward.children || []).filter(region => region.active).length
    ), 0)
  ), 0);

  return (
    <div className="modal-overlay">
      <div className="modal-content lead-config-modal">
        <div className="modal-header">
          <div><strong>CẤU HÌNH BỘ LỌC LEAD</strong><span>Admin có thể tạo, chỉnh sửa và ngừng sử dụng bộ lọc mà không làm mất dữ liệu cũ.</span></div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}><X size={15} /> Đóng</button>
        </div>
        <div className="modal-body">
            <div className="lead-config-layout">
              <div className="lead-config-list">
                <div className="lead-config-list__header">
                  <strong>{definitions.length} bộ lọc</strong>
                  <button type="button" className="btn btn-sm btn-primary" onClick={startCreate}><Plus size={13} /> Thêm bộ lọc</button>
                </div>
                {definitions.map(definition => (
                  <div key={definition.id} className={`lead-config-item ${!definition.active ? 'is-inactive' : ''} ${editingId === definition.id ? 'is-editing' : ''}`}>
                    <div>
                      <strong>{definition.name}</strong>
                      <span>{definition.id === LEAD_FILTER_IDS.province
                        ? `${definition.options.filter(item => item.active).length} tỉnh/thành · ${definition.options.flatMap(item => item.children || []).filter(item => item.active).length.toLocaleString('vi-VN')} phường/xã · ${definition.options.flatMap(item => item.children || []).flatMap(item => item.children || []).filter(item => item.active).length} KCN`
                        : `${FIELD_TYPE_LABELS[definition.type]} · ${definition.options.filter(item => item.active).length} lựa chọn`}</span>
                    </div>
                    <div>
                      <button type="button" className="btn btn-sm btn-outline btn-symbol-sm" title={definition.active ? 'Ngừng sử dụng' : 'Sử dụng lại'} disabled={saving} onClick={() => toggleDefinitionActive(definition)}>{definition.active ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                      <button type="button" className="btn btn-sm btn-outline btn-symbol-sm" title="Chỉnh sửa" onClick={() => startEdit(definition)}><Pencil size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="lead-config-editor">
                {editingId ? (
                  <>
                    <h3>{definitions.some(item => item.id === editingId) ? 'Chỉnh sửa bộ lọc' : 'Tạo bộ lọc mới'}</h3>
                    <label><span>Tên bộ lọc *</span><input value={draft.name} onChange={event => setDraft(previous => ({ ...previous, name: event.target.value }))} /></label>
                    {draft.id !== LEAD_FILTER_IDS.province && <label><span>Cách lựa chọn</span><select value={draft.type} onChange={event => setDraft(previous => ({ ...previous, type: event.target.value as LeadCustomFieldType }))}><option value="single_select">Chọn một</option><option value="multi_select">Chọn nhiều</option></select></label>}
                      <>
                        {draft.id !== LEAD_FILTER_IDS.province && <label><span>Các lựa chọn (mỗi dòng một lựa chọn)</span><textarea rows={8} value={optionLines} onChange={event => updateOptionLines(event.target.value)} /></label>}
                        {draft.id === LEAD_FILTER_IDS.province && (
                          <div className="lead-province-area-editor">
                            <div className="lead-province-area-editor__heading">
                              <div><strong>Danh mục Vùng/KCN</strong><span>Tỉnh/thành và phường/xã là danh mục hệ thống cố định. Chọn địa bàn rồi bổ sung các Vùng/KCN cần sử dụng.</span></div>
                              <small>{configuredRegionCount} Vùng/KCN</small>
                            </div>
                            <div className="lead-province-area-editor__selectors">
                              <div className="lead-province-area-editor__picker">
                                <span>Tỉnh/Thành phố</span>
                                <SearchableLocationSelect
                                  value={selectedProvince?.id || ''}
                                  ariaLabel="Chọn tỉnh hoặc thành phố"
                                  searchPlaceholder="Tìm nhanh tỉnh/thành..."
                                  emptyMessage="Không tìm thấy tỉnh/thành phù hợp."
                                  options={activeProvinceOptions.map(province => ({
                                    id: province.id,
                                    label: province.label,
                                    meta: `${(province.children || []).flatMap(ward => ward.children || []).filter(region => region.active).length} KCN`
                                  }))}
                                  onChange={provinceId => {
                                    const province = activeProvinceOptions.find(optionItem => optionItem.id === provinceId);
                                    setSelectedProvinceId(provinceId);
                                    setSelectedWardId((province?.children || []).find(ward => ward.active)?.id || '');
                                  }}
                                />
                              </div>
                              <div className="lead-province-area-editor__picker">
                                <span>Phường/Xã</span>
                                <SearchableLocationSelect
                                  key={selectedProvince?.id || 'no-province'}
                                  value={selectedWard?.id || ''}
                                  ariaLabel="Chọn phường hoặc xã"
                                  searchPlaceholder="Tìm nhanh phường/xã..."
                                  emptyMessage="Không tìm thấy phường/xã phù hợp."
                                  options={activeWardOptions.map(ward => ({
                                    id: ward.id,
                                    label: ward.label,
                                    meta: `${(ward.children || []).filter(region => region.active).length} KCN`
                                  }))}
                                  onChange={setSelectedWardId}
                                />
                              </div>
                            </div>
                            {selectedProvince && selectedWard && (
                              <div className="lead-province-area-editor__workspace">
                                <div><strong>{selectedWard.label}</strong><span>{(selectedWard.children || []).filter(region => region.active).length} Vùng/KCN</span></div>
                                <label>
                                  <span>Vùng/KCN thuộc {selectedWard.label}, {selectedProvince.label} (mỗi dòng một mục)</span>
                                  <textarea
                                    rows={5}
                                    value={wardRegionLines[selectedWard.id] ?? (selectedWard.children || []).filter(region => region.active).map(region => region.label).join('\n')}
                                    onChange={event => updateWardRegionLines(selectedProvince.id, selectedWard.id, event.target.value)}
                                    placeholder={`Ví dụ:\nKCN A\nKCN B\nKhu vực C`}
                                  />
                                </label>
                              </div>
                            )}
                            <div className="lead-province-area-editor__summary">Đã cấu hình KCN tại <strong>{configuredProvinceCount}/{activeProvinceOptions.length}</strong> tỉnh/thành.</div>
                          </div>
                        )}
                      </>
                    <label className="lead-config-permission"><input type="checkbox" checked={draft.saleEditable} onChange={event => setDraft(previous => ({ ...previous, saleEditable: event.target.checked }))} /><span><strong>Cho phép Sale cập nhật</strong><small>Tắt tùy chọn này nếu tiêu chí chỉ do Admin quản lý.</small></span></label>
                    <div className="lead-config-editor__actions">
                      <button type="button" className="btn btn-outline" onClick={() => setEditingId('')}>Hủy</button>
                      <button type="button" className="btn btn-primary" disabled={saving} onClick={saveDraft}><Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu bộ lọc'}</button>
                    </div>
                    {saveError && <p className="lead-config-error" role="alert">{saveError}</p>}
                  </>
                ) : (
                  <div className="lead-config-placeholder"><Settings2 size={34} /><strong>Chọn một bộ lọc để chỉnh sửa</strong><span>Có thể đổi tên, kiểu lựa chọn và danh sách giá trị sử dụng.</span></div>
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const LEAD_STAGE_LABELS: Record<string, string> = {
  new: 'Mới tiếp nhận',
  contacted: 'Đã liên hệ',
  quoted: 'Đã báo giá',
  negotiating: 'Đang đàm phán',
  won: 'Thành công',
  lost: 'Không thành công',
  converted: 'Đã chuyển đổi'
};

export const LeadSalesWorkspace = React.memo(function LeadSalesWorkspace({ leads, candidates, saleUsers, definitions, onOpenLead }: {
  leads: LeadRecord[];
  candidates: LeadCandidateRecord[];
  saleUsers: UserProfile[];
  definitions: LeadFilterDefinition[];
  onOpenLead: (leadId: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [selectedSaleId, setSelectedSaleId] = useState(saleUsers[0]?.uid || '');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState('all');
  const years = Array.from(new Set([
    currentYear,
    ...leads.filter(isActiveLeadRecord).map(lead => new Date(lead.createdAt).getFullYear()).filter(Number.isFinite),
    ...candidates.map(candidate => new Date(candidate.createdAt).getFullYear()).filter(Number.isFinite)
  ])).sort((a, b) => b - a);
  const periodLeads = leads.filter(lead => {
    const createdAt = new Date(lead.createdAt);
    return isActiveLeadRecord(lead)
      && createdAt.getFullYear() === year
      && (month === 'all' || createdAt.getMonth() + 1 === Number(month));
  });
  const periodCandidates = candidates.filter(candidate => {
    const createdAt = new Date(candidate.createdAt);
    return createdAt.getFullYear() === year && (month === 'all' || createdAt.getMonth() + 1 === Number(month));
  });
  const selectedSale = saleUsers.find(sale => sale.uid === selectedSaleId) || saleUsers[0];
  const saleLeads = selectedSale
    ? periodLeads.filter(lead => (
      (lead.discoveredById || lead.createdById) === selectedSale.uid
      || lead.assignedSaleId === selectedSale.uid
    ))
    : [];
  const discoveredLeads = selectedSale
    ? saleLeads.filter(lead => (lead.discoveredById || lead.createdById) === selectedSale.uid)
    : [];
  const convertedLeads = discoveredLeads.filter(lead => lead.stage === 'converted');
  const conversionRate = discoveredLeads.length > 0
    ? convertedLeads.length / discoveredLeads.length * 100
    : 0;
  const saleCandidates = selectedSale
    ? periodCandidates.filter(candidate => (
      (candidate.discoveredById || candidate.createdById) === selectedSale.uid
      || candidate.assignedSaleId === selectedSale.uid
    ))
    : [];
  const promotedCandidates = saleCandidates.filter(candidate => candidate.status === 'converted');
  const candidateConversionRate = saleCandidates.length > 0
    ? promotedCandidates.length / saleCandidates.length * 100
    : 0;

  const getRelationshipLabel = (lead: LeadRecord) => {
    const discovered = (lead.discoveredById || lead.createdById) === selectedSale?.uid;
    const assigned = lead.assignedSaleId === selectedSale?.uid;
    if (discovered && assigned) return 'Sale tìm & phụ trách';
    return discovered ? 'Sale tìm được' : 'Được phân công';
  };

  const getProgressLabel = (lead: LeadRecord) => {
    const optionId = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.progress]?.at(-1);
    return (optionId && findLeadFilterOption(definitions, LEAD_FILTER_IDS.progress, optionId)?.label)
      || LEAD_STAGE_LABELS[lead.stage]
      || 'Chưa cập nhật';
  };

  const getNeedLabel = (lead: LeadRecord) => {
    const optionIds = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.productNeed] || [];
    const labels = optionIds
      .map(optionId => findLeadFilterOption(definitions, LEAD_FILTER_IDS.productNeed, optionId)?.label)
      .filter(Boolean);
    return labels.join(', ') || 'Chưa xác định';
  };

  return (
    <section className="lead-sales-workspace">
      <div className="lead-sales-workspace__header">
        <div>
          <UserRoundSearch size={20} />
          <div><strong>Khách hàng của Sale</strong><span>Theo dõi từ dữ liệu doanh nghiệp tìm được đến Lead và khách hàng CRM.</span></div>
        </div>
        <div className="lead-sales-workspace__selectors">
          <label>Nhân viên Sale<select value={selectedSale?.uid || ''} onChange={event => setSelectedSaleId(event.target.value)} disabled={saleUsers.length === 0}>{saleUsers.length === 0 && <option value="">Chưa có tài khoản Sale</option>}{saleUsers.map(sale => <option key={sale.uid} value={sale.uid}>{sale.displayName}</option>)}</select></label>
          <label>Năm<select value={year} onChange={event => setYear(Number(event.target.value))}>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Tháng<select value={month} onChange={event => setMonth(event.target.value)}><option value="all">Tất cả</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label>
        </div>
      </div>
      <div className="lead-sales-metrics">
        <div><span>Dữ liệu tìm được</span><strong>{saleCandidates.length}</strong></div>
        <div><span>Đã thành Lead</span><strong>{promotedCandidates.length}</strong></div>
        <div><span>Tỷ lệ tiếp cận → Lead</span><strong>{candidateConversionRate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong></div>
        <div><span>Tổng Lead liên quan</span><strong>{saleLeads.length}</strong></div>
        <div><span>Đã thành khách hàng</span><strong>{convertedLeads.length}</strong></div>
        <div><span>Tỷ lệ Lead → CRM</span><strong>{conversionRate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong></div>
      </div>
      <div className="table-container">
        <table className="lead-sales-table">
          <thead><tr><th>Doanh nghiệp</th><th>Liên hệ</th><th>Quan hệ với Sale</th><th>Tiến độ</th><th>Nhu cầu</th><th>Giá trị tiềm năng</th><th></th></tr></thead>
          <tbody>
            {saleLeads.map(lead => (
              <tr key={lead.id}>
                <td><strong>{lead.companyName}</strong></td>
                <td>{lead.contactPerson || '—'}<span>{lead.phone || lead.email || 'Chưa có liên hệ'}</span></td>
                <td><span className="lead-sale-relation">{getRelationshipLabel(lead)}</span></td>
                <td>{getProgressLabel(lead)}</td>
                <td>{getNeedLabel(lead)}</td>
                <td><strong>{Number(lead.potentialValue || 0).toLocaleString('vi-VN')} đ</strong></td>
                <td>
                  <RowActionMenu
                    label={`Thao tác ${lead.companyName}`}
                    actions={[{ label: 'Chi tiết', icon: <Eye size={14} />, onSelect: () => onOpenLead(lead.id) }]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});
