import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ENTITY_FIELD_ROLES,
  ENTITY_FIELD_TYPE_LABELS,
  normalizeEntityFieldDefinition,
  slugifyEntityFieldKey,
  type EntityCustomFieldType,
  type EntityFieldDefinition,
  type EntityFieldRole,
  type EntityFieldSection,
  type EntityFieldTable
} from '@/features/crm/model/entityFieldConfig';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { manageFieldConfiguration } from '@/services/fieldConfigurationService';
import './InlineEntityFieldManager.css';

interface FieldDraft {
  id: string;
  expectedUpdatedAt: string;
  name: string;
  description: string;
  type: EntityCustomFieldType;
  optionText: string;
  required: boolean;
  active: boolean;
  defaultVisible: boolean;
  searchable: boolean;
  filterable: boolean;
  viewRoles: EntityFieldRole[];
  editRoles: EntityFieldRole[];
}

const SELECT_TYPES: EntityCustomFieldType[] = ['single_select', 'multi_select'];
const ALL_ROLES = ENTITY_FIELD_ROLES.map(role => role.id);

const createEmptyDraft = (): FieldDraft => ({
  id: '', expectedUpdatedAt: '', name: '', description: '', type: 'text', optionText: '', required: false,
  active: true, defaultVisible: false, searchable: false, filterable: false,
  viewRoles: [...ALL_ROLES], editRoles: ['admin', 'sale']
});

const toDraft = (definition: EntityFieldDefinition): FieldDraft => ({
  id: definition.id,
  expectedUpdatedAt: definition.updatedAt,
  name: definition.name,
  description: definition.description,
  type: definition.type,
  optionText: definition.options.filter(option => option.active).map(option => option.label).join('\n'),
  required: definition.required,
  active: definition.active,
  defaultVisible: definition.defaultVisible,
  searchable: definition.searchable,
  filterable: definition.filterable,
  viewRoles: [...definition.viewRoles],
  editRoles: [...definition.editRoles]
});

const parseOptions = (text: string, existing: EntityFieldDefinition['options'] = []) => {
  const activeOptions = text.split('\n').map(label => label.trim()).filter(Boolean).map((label, index) => {
    const previous = existing.find(option => option.label.toLocaleLowerCase('vi-VN') === label.toLocaleLowerCase('vi-VN'));
    return { id: previous?.id || `${slugifyEntityFieldKey(label) || 'option'}_${index + 1}`, label, active: true };
  });
  const activeIds = new Set(activeOptions.map(option => option.id));
  return [...activeOptions, ...existing.filter(option => !activeIds.has(option.id)).map(option => ({ ...option, active: false }))];
};

export const InlineEntityFieldManager: React.FC<{
  table: EntityFieldTable;
  section: EntityFieldSection;
  sectionLabel: string;
  definitions: EntityFieldDefinition[];
  currentUser: UserProfile;
}> = ({ table, section, sectionLabel, definitions, currentUser }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const sectionDefinitions = useMemo(
    () => definitions.filter(definition => definition.section === section && !definition.removed),
    [definitions, section]
  );

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuOpen]);

  useEffect(() => {
    if (!draft) return;
    modalRef.current?.querySelector<HTMLElement>('input:not(:disabled)')?.focus();
  }, [draft]);

  useEffect(() => {
    if (!manageOpen && !draft) return;
    const closeDialog = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return;
      setDraft(null);
      setManageOpen(false);
      setError('');
    };
    document.addEventListener('keydown', closeDialog);
    return () => document.removeEventListener('keydown', closeDialog);
  }, [draft, manageOpen, saving]);

  if (currentUser.role !== 'admin') return null;

  const openCreate = () => {
    setMenuOpen(false);
    setManageOpen(false);
    setError('');
    setDraft(createEmptyDraft());
  };

  const openManage = () => {
    setMenuOpen(false);
    setError('');
    setManageOpen(true);
  };

  const saveDefinition = async () => {
    if (!draft?.name.trim()) { setError('Tên trường không được để trống.'); return; }
    const existing = sectionDefinitions.find(definition => definition.id === draft.id);
    const options = SELECT_TYPES.includes(draft.type) ? parseOptions(draft.optionText, existing?.options) : [];
    if (SELECT_TYPES.includes(draft.type) && options.filter(option => option.active).length === 0) {
      setError('Trường dạng danh sách cần ít nhất một lựa chọn.');
      return;
    }
    const labels = options.filter(option => option.active).map(option => option.label.toLocaleLowerCase('vi-VN'));
    if (new Set(labels).size !== labels.length) { setError('Các lựa chọn không được trùng tên.'); return; }

    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const id = draft.id || `custom_${slugifyEntityFieldKey(draft.name) || 'field'}_${Date.now().toString(36)}`;
    const definition = normalizeEntityFieldDefinition({
      ...existing,
      id,
      fieldKey: existing?.fieldKey || slugifyEntityFieldKey(draft.name) || id,
      table,
      section,
      name: draft.name.trim(),
      description: draft.description.trim(),
      type: draft.type,
      options,
      required: draft.required,
      active: draft.active,
      defaultVisible: draft.defaultVisible,
      searchable: draft.searchable,
      filterable: draft.filterable,
      viewRoles: draft.viewRoles,
      editRoles: draft.editRoles.filter(role => draft.viewRoles.includes(role)),
      order: existing?.order ?? Math.max(0, ...definitions.filter(item => item.table === table).map(item => item.order)) + 10,
      createdAt: existing?.createdAt || now,
      createdById: existing?.createdById || currentUser.uid,
      createdByName: existing?.createdByName || currentUser.displayName,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.displayName
    });
    try {
      await manageFieldConfiguration(currentUser, {
        action: 'save', table, definition, expectedUpdatedAt: draft.expectedUpdatedAt
      });
      setDraft(null);
      setManageOpen(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể lưu trường tùy chỉnh.');
    } finally {
      setSaving(false);
    }
  };

  return <>
    <div className="inline-field-manager" ref={menuRef}>
      <button
        type="button"
        className="inline-field-manager__trigger"
        aria-label={`Tùy chỉnh trường ${sectionLabel}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(open => !open)}
      >⋯</button>
      {menuOpen && <div className="inline-field-manager__menu" role="menu">
        <button type="button" role="menuitem" onClick={openCreate}>Thêm trường</button>
        <button type="button" role="menuitem" onClick={openManage}>Chỉnh sửa trường</button>
      </div>}
    </div>

    {manageOpen && !draft && <div className="inline-field-modal-backdrop" role="presentation">
      <section className="inline-field-list-modal" role="dialog" aria-modal="true" aria-label={`Chỉnh sửa trường ${sectionLabel}`}>
        <header><div><h3>Chỉnh sửa trường</h3><p>{sectionLabel} · Chỉ áp dụng cho phân hệ hiện tại</p></div><button type="button" onClick={() => setManageOpen(false)}>Đóng</button></header>
        <div className="inline-field-list-modal__body">
          {sectionDefinitions.length === 0
            ? <p className="inline-field-manager__empty">Khung này chưa có trường tùy chỉnh.</p>
            : sectionDefinitions.map(definition => <div className="inline-field-manager__field" key={definition.id}>
              <div><strong>{definition.name}</strong><span>{ENTITY_FIELD_TYPE_LABELS[definition.type]} · {definition.active ? 'Đang sử dụng' : 'Ngừng sử dụng'}</span></div>
              <button type="button" onClick={() => { setDraft(toDraft(definition)); setError(''); }}>Chỉnh sửa</button>
            </div>)}
        </div>
        <footer><button type="button" className="btn btn-primary" onClick={openCreate}>Thêm trường</button></footer>
      </section>
    </div>}

    {draft && <div className="inline-field-modal-backdrop" role="presentation">
      <div ref={modalRef} className="inline-field-editor" role="dialog" aria-modal="true" aria-label={draft.id ? 'Chỉnh sửa trường' : 'Thêm trường'}>
        <header><div><h3>{draft.id ? 'Chỉnh sửa trường' : 'Thêm trường'}</h3><p>{sectionLabel} · Chỉ áp dụng cho phân hệ hiện tại</p></div><button type="button" disabled={saving} onClick={() => setDraft(null)}>Đóng</button></header>
        <div className="inline-field-editor__body">
          <div className="inline-field-editor__row">
            <label><span>Tên trường *</span><input required maxLength={100} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label><span>Kiểu dữ liệu *</span><select value={draft.type} disabled={Boolean(draft.id)} onChange={event => setDraft({ ...draft, type: event.target.value as EntityCustomFieldType, optionText: '' })}>{Object.entries(ENTITY_FIELD_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
          </div>
          <label><span>Mô tả / hướng dẫn</span><textarea rows={2} maxLength={500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
          {SELECT_TYPES.includes(draft.type) && <label><span>Các lựa chọn * (mỗi dòng một lựa chọn)</span><textarea rows={5} value={draft.optionText} onChange={event => setDraft({ ...draft, optionText: event.target.value })} /></label>}
          <fieldset><legend>Thiết lập trường</legend><div className="inline-field-editor__checks">
            <label><input type="checkbox" checked={draft.required} onChange={event => setDraft({ ...draft, required: event.target.checked })} /> Bắt buộc nhập</label>
            <label><input type="checkbox" checked={draft.defaultVisible} onChange={event => setDraft({ ...draft, defaultVisible: event.target.checked })} /> Hiện thành cột mặc định</label>
            <label><input type="checkbox" checked={draft.searchable} onChange={event => setDraft({ ...draft, searchable: event.target.checked })} /> Cho phép tìm kiếm</label>
            <label><input type="checkbox" checked={draft.filterable} onChange={event => setDraft({ ...draft, filterable: event.target.checked })} /> Cho phép lọc</label>
            <label><input type="checkbox" checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Đang sử dụng</label>
          </div></fieldset>
          {error && <p className="inline-field-editor__error" role="alert">{error}</p>}
        </div>
        <footer><button type="button" className="btn btn-outline" disabled={saving} onClick={() => setDraft(null)}>Hủy</button><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void saveDefinition()}>{saving ? 'Đang lưu…' : 'Lưu trường'}</button></footer>
      </div>
    </div>}
  </>;
};
