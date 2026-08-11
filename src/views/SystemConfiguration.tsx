import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpenCheck,
  Database,
  Filter,
  LockKeyhole,
  MapPinned,
  Plus,
  Save,
  Settings2,
  SlidersHorizontal
} from 'lucide-react';
import { LeadFilterAdminModal } from '../components/LeadFilterSystem';
import {
  mergeCustomerFilterDefinitions,
  type CustomerFilterDefinition
} from '../domain/customerFilterConfig';
import type { LeadFilterDefinition } from '../domain/crmModels';
import {
  compactLeadFilterDefinitionForStorage,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions
} from '../domain/leadFilterConfig';
import {
  mergeSystemFilterDefinitions,
  SYSTEM_FILTER_SCOPE_LABELS,
  type SystemFilterDefinition,
  type SystemFilterScope
} from '../domain/systemFilterConfig';
import { dbService, type UserProfile } from '../services/firebaseService';
import './SystemConfiguration.css';

type ConfigurationSection = 'catalogs' | 'automatic' | 'scope';

interface SystemConfigurationProps {
  currentUser: UserProfile;
}

export const SystemConfiguration: React.FC<SystemConfigurationProps> = ({ currentUser }) => {
  const [section, setSection] = useState<ConfigurationSection>('catalogs');
  const [storedLeadDefinitions, setStoredLeadDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [storedCustomerDefinitions, setStoredCustomerDefinitions] = useState<CustomerFilterDefinition[]>([]);
  const [storedSystemDefinitions, setStoredSystemDefinitions] = useState<SystemFilterDefinition[]>([]);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('');
  const [draft, setDraft] = useState<SystemFilterDefinition | null>(null);
  const [showLeadConfiguration, setShowLeadConfiguration] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    const unsubscribeLeadDefinitions = dbService.subscribeCollection('lead_filter_definitions', data => {
      setStoredLeadDefinitions(data as LeadFilterDefinition[]);
    });
    const unsubscribeCustomerDefinitions = dbService.subscribeCollection('customer_filter_definitions', data => {
      setStoredCustomerDefinitions(data as CustomerFilterDefinition[]);
    });
    const unsubscribeSystemDefinitions = dbService.subscribeCollection('system_filter_definitions', data => {
      setStoredSystemDefinitions(data as SystemFilterDefinition[]);
    });
    return () => {
      unsubscribeLeadDefinitions();
      unsubscribeCustomerDefinitions();
      unsubscribeSystemDefinitions();
    };
  }, []);

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
  const activeDefinitions = systemDefinitions.filter(item => item.active);
  const automaticDefinitions = systemDefinitions.filter(item => item.sourceType === 'system_data');
  const provinceDefinition = leadDefinitions.find(item => item.id === LEAD_FILTER_IDS.province);
  const configuredRegionCount = (provinceDefinition?.options || []).reduce((provinceTotal, province) => (
    provinceTotal + (province.children || []).reduce((wardTotal, ward) => (
      wardTotal + (ward.children || []).filter(region => region.active).length
    ), 0)
  ), 0);

  const saveLeadDefinition = async (
    definition: LeadFilterDefinition,
    ensureSystemDefinition = true
  ) => {
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
    const hasSystemDefinition = storedSystemDefinitions.some(item => item.id === definition.id);
    if (ensureSystemDefinition && !hasSystemDefinition) {
      const systemDefinition = mergeSystemFilterDefinitions([], [definition], [])
        .find(item => item.id === definition.id);
      if (systemDefinition) {
        const savedSystemDefinition = {
          ...systemDefinition,
          updatedBy: currentUser.displayName,
          updatedAt: new Date().toISOString()
        };
        await dbService.addDocument('system_filter_definitions', savedSystemDefinition);
        setStoredSystemDefinitions(previous => [
          ...previous.filter(item => item.id !== savedSystemDefinition.id),
          savedSystemDefinition
        ]);
      }
    }
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
    setSelectedDefinitionId(definition.id);
    setDraft({ ...definition, scopes: [...definition.scopes] });
    setSaveError('');
  };

  const saveSystemDefinition = async () => {
    if (!draft?.name.trim()) return;
    setSaving(true);
    setSaveError('');
    const savedDefinition: SystemFilterDefinition = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      scopes: draft.scopes.filter(scope => draft.availableScopes.includes(scope)),
      updatedBy: currentUser.displayName,
      updatedAt: new Date().toISOString()
    };
    try {
      await dbService.addDocument('system_filter_definitions', savedDefinition);
      const leadDefinition = leadDefinitions.find(item => item.id === savedDefinition.id);
      if (leadDefinition) {
        await saveLeadDefinition(
          { ...leadDefinition, name: savedDefinition.name, active: savedDefinition.active },
          false
        );
      }
      const customerDefinition = customerDefinitions.find(item => item.id === savedDefinition.id);
      if (customerDefinition) {
        await saveCustomerDefinition({
          ...customerDefinition,
          name: savedDefinition.name,
          description: savedDefinition.description,
          active: savedDefinition.active
        });
      }
      setStoredSystemDefinitions(previous => [
        ...previous.filter(item => item.id !== savedDefinition.id),
        savedDefinition
      ]);
      setDraft(savedDefinition);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      setSaveError(code.includes('permission-denied')
        ? 'Firebase chưa cấp quyền quản trị cấu hình hệ thống. Hãy xuất bản Firestore Rules mới nhất.'
        : 'Không thể lưu cấu hình lúc này. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const updateScope = (scope: SystemFilterScope, checked: boolean) => {
    setDraft(previous => previous ? {
      ...previous,
      scopes: checked
        ? Array.from(new Set([...previous.scopes, scope]))
        : previous.scopes.filter(item => item !== scope)
    } : previous);
  };

  return (
    <div className="system-config-view">
      <div className="page-header system-config-header">
        <div>
          <h1 className="page-title">CẤU HÌNH HỆ THỐNG</h1>
          <p>Thêm, sửa, ngừng sử dụng và quy định nơi xuất hiện của các tiêu chí lọc trên Sunflower ERP.</p>
        </div>
        <span className="system-config-admin-badge"><LockKeyhole size={14} /> Chỉ Giám đốc/Admin</span>
      </div>

      <div className="system-config-summary" aria-label="Tổng quan cấu hình">
        <article><Filter size={18} /><div><strong>{activeDefinitions.length}</strong><span>Tiêu chí đang sử dụng</span></div></article>
        <article><SlidersHorizontal size={18} /><div><strong>{systemDefinitions.length - activeDefinitions.length}</strong><span>Tiêu chí đã ngừng</span></div></article>
        <article><MapPinned size={18} /><div><strong>{configuredRegionCount}</strong><span>Vùng/KCN đã cấu hình</span></div></article>
        <article><Database size={18} /><div><strong>{automaticDefinitions.length}</strong><span>Nguồn đồng bộ tự động</span></div></article>
      </div>

      <div className="system-config-workspace">
        <nav className="system-config-nav" aria-label="Nhóm cấu hình hệ thống">
          <button type="button" className={section === 'catalogs' ? 'is-active' : ''} onClick={() => setSection('catalogs')}><Settings2 size={16} /><span><strong>Tiêu chí bộ lọc</strong><small>Thêm, sửa và gán phạm vi</small></span></button>
          <button type="button" className={section === 'automatic' ? 'is-active' : ''} onClick={() => setSection('automatic')}><Database size={16} /><span><strong>Nguồn dữ liệu tự động</strong><small>Tiêu chí do nghiệp vụ cung cấp</small></span></button>
          <button type="button" className={section === 'scope' ? 'is-active' : ''} onClick={() => setSection('scope')}><BookOpenCheck size={16} /><span><strong>Phạm vi sử dụng</strong><small>Tiêu chí tại từng danh mục</small></span></button>
        </nav>

        <main className="system-config-content">
          {section === 'catalogs' && (
            <>
              <div className="system-config-section-heading">
                <div><h2>Tiêu chí bộ lọc</h2><p>Mỗi nút Bộ lọc chỉ hiển thị các tiêu chí đang hoạt động và được gán cho danh mục đó.</p></div>
                <button type="button" className="btn btn-primary" onClick={() => setShowLeadConfiguration(true)}><Plus size={14} /> Thêm tiêu chí thủ công</button>
              </div>
              <div className="system-filter-manager">
                <div className="system-filter-manager__list">
                  {systemDefinitions.map(definition => (
                    <button type="button" key={definition.id} className={`${selectedDefinitionId === definition.id ? 'is-selected' : ''} ${!definition.active ? 'is-inactive' : ''}`} onClick={() => selectDefinition(definition)}>
                      <div><strong>{definition.name}</strong><span>{definition.sourceType === 'manual_catalog' ? 'Danh mục Admin quản lý' : 'Dữ liệu hệ thống'}</span></div>
                      <small>{definition.scopes.length} nơi sử dụng</small>
                    </button>
                  ))}
                </div>
                <div className="system-filter-manager__editor">
                  {draft ? (
                    <>
                      <h3>Chỉnh sửa tiêu chí</h3>
                      <label><span>Tên tiêu chí *</span><input value={draft.name} onChange={event => setDraft(previous => previous ? { ...previous, name: event.target.value } : previous)} /></label>
                      <label><span>Mô tả hướng dẫn</span><textarea rows={3} value={draft.description} onChange={event => setDraft(previous => previous ? { ...previous, description: event.target.value } : previous)} /></label>
                      <fieldset className="system-filter-scope-picker">
                        <legend>Hiển thị tại nút Bộ lọc của</legend>
                        {(Object.entries(SYSTEM_FILTER_SCOPE_LABELS) as Array<[SystemFilterScope, string]>).map(([scope, label]) => {
                          const supported = draft.availableScopes.includes(scope);
                          return <label key={scope} className={!supported ? 'is-disabled' : ''}><input type="checkbox" disabled={!supported} checked={draft.scopes.includes(scope)} onChange={event => updateScope(scope, event.target.checked)} /><span><strong>{label}</strong><small>{supported ? 'Có thể sử dụng tiêu chí này' : 'Nguồn dữ liệu không tương thích'}</small></span></label>;
                        })}
                      </fieldset>
                      <label className="system-filter-active-toggle"><input type="checkbox" checked={draft.active} onChange={event => setDraft(previous => previous ? { ...previous, active: event.target.checked } : previous)} /><span><strong>Đang sử dụng</strong><small>Tắt để ẩn khỏi tất cả nút Bộ lọc nhưng vẫn giữ dữ liệu cũ.</small></span></label>
                      {draft.optionsEditable && <button type="button" className="btn btn-outline" onClick={() => setShowLeadConfiguration(true)}><Settings2 size={14} /> Quản lý danh sách lựa chọn</button>}
                      <div className="system-filter-manager__actions"><button type="button" className="btn btn-primary" disabled={saving || !draft.name.trim()} onClick={saveSystemDefinition}><Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
                      {saveError && <p className="lead-config-error" role="alert">{saveError}</p>}
                    </>
                  ) : <div className="system-filter-manager__empty"><Settings2 size={30} /><strong>Chọn một tiêu chí để chỉnh sửa</strong><span>Bạn có thể đổi tên, mô tả, phạm vi hoặc ngừng sử dụng.</span></div>}
                </div>
              </div>
            </>
          )}

          {section === 'automatic' && (
            <>
              <div className="system-config-section-heading"><div><h2>Nguồn dữ liệu tự động</h2><p>Admin được đổi tên, bật/tắt và gán phạm vi nhưng không sửa logic hoặc tạo lựa chọn không có dữ liệu.</p></div></div>
              <div className="system-config-source-list">{automaticDefinitions.map(definition => <article key={definition.id}><Database size={17} /><div><strong>{definition.name}</strong><span>{definition.description}</span></div><span className="system-config-source-tag is-system"><LockKeyhole size={11} /> Đồng bộ tự động</span></article>)}</div>
            </>
          )}

          {section === 'scope' && (
            <>
              <div className="system-config-section-heading"><div><h2>Phạm vi sử dụng hiện tại</h2><p>Ma trận này được tạo trực tiếp từ cấu hình và thay đổi ngay sau khi Admin lưu.</p></div></div>
              <div className="system-config-scope-table"><table><thead><tr><th>Tiêu chí</th>{(Object.values(SYSTEM_FILTER_SCOPE_LABELS)).map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{systemDefinitions.map(definition => <tr key={definition.id}><td>{definition.name}</td>{(Object.keys(SYSTEM_FILTER_SCOPE_LABELS) as SystemFilterScope[]).map(scope => <td key={scope}><span className={definition.active && definition.scopes.includes(scope) ? 'is-enabled' : 'is-disabled'}>{definition.active && definition.scopes.includes(scope) ? 'Đang dùng' : 'Không dùng'}</span></td>)}</tr>)}</tbody></table></div>
            </>
          )}
        </main>
      </div>

      {showLeadConfiguration && <LeadFilterAdminModal definitions={leadDefinitions} onClose={() => setShowLeadConfiguration(false)} onSaveDefinition={saveLeadDefinition} />}
    </div>
  );
};
