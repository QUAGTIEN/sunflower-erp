import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  X
} from 'lucide-react';
import {
  ENTITY_FIELD_ROLES,
  ENTITY_SYSTEM_FIELD_LABELS,
  ENTITY_FIELD_TABLE_LABELS,
  ENTITY_FIELD_TYPE_LABELS,
  normalizeEntityFieldDefinition,
  slugifyEntityFieldKey,
  type EntityCustomFieldType,
  type EntityFieldDefinition,
  type EntityFieldRole,
  type EntityFieldTable
} from '../domain/entityFieldConfig';
import { auditService } from '../services/auditService';
import { dbService, type UserProfile } from '../services/firebaseService';
import { useEntityFieldDefinitions } from '../hooks/useEntityFieldDefinitions';
import './CustomFieldConfiguration.css';

interface CustomFieldConfigurationProps { currentUser: UserProfile; }

interface FieldDraft {
  id: string;
  table: EntityFieldTable;
  name: string;
  description: string;
  type: EntityCustomFieldType;
  optionText: string;
  required: boolean;
  active: boolean;
  defaultVisible: boolean;
  searchable: boolean;
  filterable: boolean;
  exportable: boolean;
  viewRoles: EntityFieldRole[];
  editRoles: EntityFieldRole[];
}

const TABLES = Object.keys(ENTITY_FIELD_TABLE_LABELS) as EntityFieldTable[];
const ALL_ROLES = ENTITY_FIELD_ROLES.map(role => role.id);
const SELECT_TYPES: EntityCustomFieldType[] = ['single_select', 'multi_select'];

const createEmptyDraft = (table: EntityFieldTable): FieldDraft => ({
  id: '', table, name: '', description: '', type: 'text', optionText: '', required: false,
  active: true, defaultVisible: false, searchable: false, filterable: false, exportable: true,
  viewRoles: [...ALL_ROLES], editRoles: ['admin', 'sale']
});

const createId = (name: string) => `custom_${slugifyEntityFieldKey(name) || 'field'}_${Date.now().toString(36)}`;

const toDraft = (definition: EntityFieldDefinition): FieldDraft => ({
  id: definition.id,
  table: definition.table,
  name: definition.name,
  description: definition.description,
  type: definition.type,
  optionText: definition.options.filter(option => option.active).map(option => option.label).join('\n'),
  required: definition.required,
  active: definition.active,
  defaultVisible: definition.defaultVisible,
  searchable: definition.searchable,
  filterable: definition.filterable,
  exportable: definition.exportable,
  viewRoles: [...definition.viewRoles],
  editRoles: [...definition.editRoles]
});

const parseOptions = (text: string, existing: EntityFieldDefinition['options'] = []) => {
  const activeOptions = text.split('\n').map(label => label.trim()).filter(Boolean).map((label, index) => {
    const normalizedLabel = label.toLocaleLowerCase('vi-VN');
    const previous = existing.find(option => option.label.toLocaleLowerCase('vi-VN') === normalizedLabel);
    return { id: previous?.id || `${slugifyEntityFieldKey(label) || 'option'}_${index + 1}`, label, active: true };
  });
  const activeIds = new Set(activeOptions.map(option => option.id));
  return [...activeOptions, ...existing.filter(option => !activeIds.has(option.id)).map(option => ({ ...option, active: false }))];
};

export const CustomFieldConfiguration: React.FC<CustomFieldConfigurationProps> = ({ currentUser }) => {
  const { allDefinitions } = useEntityFieldDefinitions();
  const [selectedTable, setSelectedTable] = useState<EntityFieldTable>('lead_candidates');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tableDefinitions = useMemo(() => allDefinitions.filter(definition => {
    if (definition.table !== selectedTable) return false;
    if (statusFilter === 'active' && !definition.active) return false;
    if (statusFilter === 'inactive' && definition.active) return false;
    const normalized = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return !normalized || `${definition.name} ${definition.description}`.toLocaleLowerCase('vi-VN').includes(normalized);
  }), [allDefinitions, searchTerm, selectedTable, statusFilter]);

  const saveDefinition = async () => {
    if (!draft?.name.trim()) { setError('Tên trường không được để trống.'); return; }
    const existing = allDefinitions.find(definition => definition.id === draft.id);
    const options = SELECT_TYPES.includes(draft.type) ? parseOptions(draft.optionText, existing?.options) : [];
    if (SELECT_TYPES.includes(draft.type) && options.length === 0) { setError('Trường dạng danh sách cần ít nhất một lựa chọn.'); return; }
    const activeOptionLabels = options.filter(option => option.active).map(option => option.label.toLocaleLowerCase('vi-VN'));
    if (new Set(activeOptionLabels).size !== activeOptionLabels.length) { setError('Các lựa chọn trong danh sách không được trùng tên.'); return; }
    if (!draft.viewRoles.includes('admin') || !draft.editRoles.includes('admin')) { setError('Giám đốc/Admin luôn phải có quyền xem và sửa.'); return; }
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const id = draft.id || createId(draft.name);
    const definition = normalizeEntityFieldDefinition({
      ...existing,
      id,
      fieldKey: existing?.fieldKey || slugifyEntityFieldKey(draft.name) || id,
      table: draft.table,
      name: draft.name.trim(),
      description: draft.description.trim(),
      type: draft.type,
      options,
      required: draft.required,
      active: draft.active,
      defaultVisible: draft.defaultVisible,
      searchable: draft.searchable,
      filterable: draft.filterable,
      exportable: draft.exportable,
      viewRoles: draft.viewRoles,
      editRoles: draft.editRoles.filter(role => draft.viewRoles.includes(role)),
      order: existing?.order ?? Math.max(0, ...allDefinitions.filter(item => item.table === draft.table).map(item => item.order)) + 10,
      createdAt: existing?.createdAt || now,
      createdById: existing?.createdById || currentUser.uid,
      createdByName: existing?.createdByName || currentUser.displayName,
      updatedAt: now,
      updatedById: currentUser.uid,
      updatedByName: currentUser.displayName
    });
    try {
      await dbService.addDocument('entity_field_definitions', definition);
      auditService.recordSafely(currentUser, {
        category: 'administration', module: 'system',
        action: existing ? 'custom_field_updated' : 'custom_field_created',
        summary: `${existing ? 'Cập nhật' : 'Tạo'} trường tùy chỉnh ${definition.name} cho ${ENTITY_FIELD_TABLE_LABELS[definition.table]}`,
        targetType: 'entity_field_definition', targetId: definition.id, targetLabel: definition.name
      });
      setDraft(null);
    } catch (saveError) {
      console.error(saveError);
      setError('Không thể lưu trường tùy chỉnh. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally { setSaving(false); }
  };

  const toggleActive = async (definition: EntityFieldDefinition) => {
    const now = new Date().toISOString();
    await dbService.updateDocument('entity_field_definitions', definition.id, {
      active: !definition.active, updatedAt: now, updatedById: currentUser.uid, updatedByName: currentUser.displayName
    });
    auditService.recordSafely(currentUser, {
      category: 'administration', module: 'system', action: definition.active ? 'custom_field_archived' : 'custom_field_restored',
      summary: `${definition.active ? 'Ngừng sử dụng' : 'Khôi phục'} trường ${definition.name}`,
      targetType: 'entity_field_definition', targetId: definition.id, targetLabel: definition.name
    });
  };

  const duplicateDefinition = (definition: EntityFieldDefinition) => {
    setDraft({ ...toDraft(definition), id: '', name: `${definition.name} (bản sao)`, active: true });
    setError('');
  };

  const moveDefinition = async (definition: EntityFieldDefinition, direction: -1 | 1) => {
    const ordered = allDefinitions.filter(item => item.table === definition.table).sort((a, b) => a.order - b.order);
    const index = ordered.findIndex(item => item.id === definition.id);
    const target = ordered[index + direction];
    if (!target) return;
    await Promise.all([
      dbService.updateDocument('entity_field_definitions', definition.id, { order: target.order, updatedAt: new Date().toISOString() }),
      dbService.updateDocument('entity_field_definitions', target.id, { order: definition.order, updatedAt: new Date().toISOString() })
    ]);
  };

  const updateRole = (kind: 'viewRoles' | 'editRoles', role: EntityFieldRole, checked: boolean) => setDraft(previous => {
    if (!previous || role === 'admin') return previous;
    const nextRoles = checked ? Array.from(new Set([...previous[kind], role])) : previous[kind].filter(item => item !== role);
    if (kind === 'viewRoles' && !checked) return { ...previous, viewRoles: nextRoles, editRoles: previous.editRoles.filter(item => item !== role) };
    if (kind === 'editRoles' && checked) return { ...previous, editRoles: nextRoles, viewRoles: Array.from(new Set([...previous.viewRoles, role])) };
    return { ...previous, [kind]: nextRoles };
  });

  return <section className="custom-field-config">
    <header className="custom-field-config__header">
      <div><h2>Trường tùy chỉnh</h2><p>Mỗi trường chỉ thuộc một bảng. Dữ liệu không tự động ánh xạ khi chuyển đổi.</p></div>
      <button type="button" className="btn btn-primary" onClick={() => { setDraft(createEmptyDraft(selectedTable)); setError(''); }}><Plus size={15} /> Thêm trường</button>
    </header>

    <div className="custom-field-config__toolbar">
      <div className="custom-field-config__tables">{TABLES.map(table => <button type="button" key={table} className={selectedTable === table ? 'is-active' : ''} onClick={() => setSelectedTable(table)}>{ENTITY_FIELD_TABLE_LABELS[table]} <span>{allDefinitions.filter(item => item.table === table && item.active).length}</span></button>)}</div>
      <div className="custom-field-config__filters"><label><Search size={14} /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm tên trường..." /></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">Tất cả trạng thái</option><option value="active">Đang sử dụng</option><option value="inactive">Ngừng sử dụng</option></select></div>
    </div>

    <div className="custom-field-system-fields">
      <div><strong>Trường hệ thống cố định</strong><span>Không thể xóa, đổi kiểu hoặc thay đổi ý nghĩa vì đang được nghiệp vụ sử dụng.</span></div>
      <div>{ENTITY_SYSTEM_FIELD_LABELS[selectedTable].map(field => <span key={field}>{field}</span>)}</div>
    </div>

    <div className="custom-field-config__table-wrap"><table><thead><tr><th>Thứ tự</th><th>Tên trường</th><th>Kiểu dữ liệu</th><th>Hiển thị cột</th><th>Tìm kiếm</th><th>Trạng thái</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>
      {tableDefinitions.map((definition, index) => <tr key={definition.id} className={!definition.active ? 'is-inactive' : ''}>
        <td><div className="custom-field-order"><button type="button" disabled={index === 0} onClick={() => void moveDefinition(definition, -1)}><ArrowUp size={13} /></button><button type="button" disabled={index === tableDefinitions.length - 1} onClick={() => void moveDefinition(definition, 1)}><ArrowDown size={13} /></button></div></td>
        <td><strong>{definition.name}{definition.required && <em>*</em>}</strong><small>{definition.description || definition.fieldKey}</small></td>
        <td>{ENTITY_FIELD_TYPE_LABELS[definition.type]}</td><td>{definition.defaultVisible ? 'Có' : 'Không'}</td><td>{definition.searchable ? 'Có' : 'Không'}</td><td><span className={`custom-field-status ${definition.active ? 'is-active' : ''}`}>{definition.active ? 'Đang sử dụng' : 'Ngừng sử dụng'}</span></td><td><small>{definition.updatedByName || definition.createdByName || '—'}</small></td>
        <td><div className="custom-field-actions"><button type="button" title="Chỉnh sửa" onClick={() => { setDraft(toDraft(definition)); setError(''); }}><Pencil size={14} /></button><button type="button" title="Nhân bản" onClick={() => duplicateDefinition(definition)}><Copy size={14} /></button><button type="button" title={definition.active ? 'Ngừng sử dụng' : 'Khôi phục'} onClick={() => void toggleActive(definition)}>{definition.active ? <Archive size={14} /> : <RotateCcw size={14} />}</button></div></td>
      </tr>)}
      {tableDefinitions.length === 0 && <tr><td colSpan={8} className="custom-field-empty">Chưa có trường tùy chỉnh phù hợp.</td></tr>}
    </tbody></table></div>

    {draft && <div className="custom-field-modal-backdrop" role="presentation"><form className="custom-field-modal" onSubmit={event => { event.preventDefault(); void saveDefinition(); }}>
      <header><div><h3>{draft.id ? 'Chỉnh sửa trường tùy chỉnh' : 'Thêm trường tùy chỉnh'}</h3><p>Trường này chỉ được sử dụng trong bảng đã chọn.</p></div><button type="button" onClick={() => setDraft(null)}><X size={20} /></button></header>
      <div className="custom-field-modal__body">
        <div className="custom-field-modal__row"><label><span>Bảng áp dụng *</span><select value={draft.table} disabled={Boolean(draft.id)} onChange={event => setDraft({ ...draft, table: event.target.value as EntityFieldTable })}>{TABLES.map(table => <option key={table} value={table}>{ENTITY_FIELD_TABLE_LABELS[table]}</option>)}</select></label><label><span>Kiểu dữ liệu *</span><select value={draft.type} disabled={Boolean(draft.id)} onChange={event => setDraft({ ...draft, type: event.target.value as EntityCustomFieldType, optionText: '' })}>{Object.entries(ENTITY_FIELD_TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label></div>
        <label><span>Tên trường *</span><input autoFocus value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} placeholder="Ví dụ: Các doanh nghiệp đối thủ" /></label>
        <label><span>Mô tả / hướng dẫn</span><textarea rows={2} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} placeholder="Giải thích ngắn để người nhập hiểu đúng dữ liệu..." /></label>
        {SELECT_TYPES.includes(draft.type) && <label><span>Các lựa chọn * <small>(mỗi dòng một lựa chọn)</small></span><textarea rows={5} value={draft.optionText} onChange={event => setDraft({ ...draft, optionText: event.target.value })} placeholder={'Đối thủ A\nĐối thủ B\nChưa xác định'} /></label>}
        <fieldset><legend>Quy tắc sử dụng</legend><div className="custom-field-modal__checks"><label><input type="checkbox" checked={draft.required} onChange={event => setDraft({ ...draft, required: event.target.checked })} /> Bắt buộc nhập</label><label><input type="checkbox" checked={draft.defaultVisible} onChange={event => setDraft({ ...draft, defaultVisible: event.target.checked })} /> Hiện thành cột mặc định</label><label><input type="checkbox" checked={draft.searchable} onChange={event => setDraft({ ...draft, searchable: event.target.checked })} /> Cho phép tìm kiếm</label><label><input type="checkbox" checked={draft.filterable} onChange={event => setDraft({ ...draft, filterable: event.target.checked })} /> Cho phép lọc</label><label><input type="checkbox" checked={draft.exportable} onChange={event => setDraft({ ...draft, exportable: event.target.checked })} /> Cho phép xuất dữ liệu</label></div></fieldset>
        <fieldset><legend>Quyền xem và chỉnh sửa</legend><div className="custom-field-role-grid"><strong>Vai trò</strong><strong>Được xem</strong><strong>Được sửa</strong>{ENTITY_FIELD_ROLES.map(role => <React.Fragment key={role.id}><span>{role.label}</span><input type="checkbox" checked={draft.viewRoles.includes(role.id)} disabled={role.id === 'admin'} onChange={event => updateRole('viewRoles', role.id, event.target.checked)} /><input type="checkbox" checked={draft.editRoles.includes(role.id)} disabled={role.id === 'admin'} onChange={event => updateRole('editRoles', role.id, event.target.checked)} /></React.Fragment>)}</div></fieldset>
        {error && <p className="custom-field-modal__error">{error}</p>}
      </div>
      <footer><button type="button" className="btn btn-outline" onClick={() => setDraft(null)}>Hủy</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu trường'}</button></footer>
    </form></div>}
  </section>;
};
