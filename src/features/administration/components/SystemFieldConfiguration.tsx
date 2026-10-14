import { useState } from 'react';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import type { EntityFieldTable } from '@/features/crm/model/entityFieldConfig';
import { SYSTEM_FIELD_CATALOG, type SystemFieldOverride } from '@/features/crm/model/systemFieldConfig';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { manageFieldConfiguration } from '@/services/fieldConfigurationService';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

export function SystemFieldConfiguration({ table, currentUser, searchTerm = '', onEditingChange }: { table: EntityFieldTable; currentUser: UserProfile; searchTerm?: string; onEditingChange: (editing: boolean) => void }) {
  const { fields, loading, error, retry, updatedAt } = useSystemFieldConfiguration(table);
  const [draft, setDraft] = useState<SystemFieldOverride | null>(null);
  const [revision, setRevision] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const spec = SYSTEM_FIELD_CATALOG[table].find(field => field.key === draft?.key);
  const filteredFields = fields.filter(field => !field.removed && `${field.label} ${field.key}`.toLocaleLowerCase('vi').includes(searchTerm.trim().toLocaleLowerCase('vi')));
  const cancel = () => {
    if (saving) return;
    const original = fields.find(field => field.key === draft?.key);
    if (draft && JSON.stringify(original) !== JSON.stringify(draft) && !window.confirm('Bỏ thay đổi chưa lưu?')) return;
    setDraft(null); setSaveError(''); onEditingChange(false);
  };
  async function save() {
    if (!draft) return;
    setSaving(true); setSaveError(''); setSuccess('');
    try {
      await manageFieldConfiguration(currentUser, { action: 'system', table,
        expectedUpdatedAt: revision,
        fields: Object.fromEntries(fields.map(field => [field.key, field.key === draft.key ? draft : field]))
      });
      setSuccess('Đã lưu cấu hình. Tên và cột hiển thị được cập nhật trên bảng tương ứng.'); setDraft(null); onEditingChange(false);
      showSuccessToast();
    } catch (error) { showErrorToast(); setSaveError(error instanceof Error ? error.message : 'Không thể lưu.'); }
    finally { setSaving(false); }
  }
  if (loading) return <p className="field-config-notice" role="status">Đang tải trường hệ thống…</p>;
  if (error) return <div className="field-config-notice" role="alert">{error} <button type="button" onClick={retry}>Thử lại</button></div>;
  return <>
    <p className="field-config-notice">Ẩn cột không xóa dữ liệu hoặc bỏ trường nhập trên biểu mẫu. Trường nhận diện hồ sơ luôn được hiển thị; kiểu dữ liệu, liên kết, tính toán và quyền nghiệp vụ được bảo vệ.</p>
    {success && <p className="field-config-notice" role="status">{success}</p>}
    <div className="system-field-layout">
      <div className="custom-field-config__table-wrap"><table><thead><tr><th>Thứ tự</th><th>Trường hệ thống</th><th>Tính chất</th><th>Hiện cột</th><th>Thao tác</th></tr></thead><tbody>
        {[...filteredFields].sort((a, b) => a.order - b.order).map(field => {
          const definition = SYSTEM_FIELD_CATALOG[table].find(item => item.key === field.key)!;
          return <tr key={field.key}><td>{definition.formOnly ? '—' : field.order}</td><td><strong>{field.label}</strong><small>{definition.label} · {field.key}</small></td><td>{definition.kind === 'computed' ? 'Tính toán' : definition.kind === 'linked' ? 'Liên kết' : 'Nhập liệu'}</td><td>{definition.formOnly ? 'Chỉ biểu mẫu' : field.visible ? 'Có' : 'Không'}{definition.protected && ' · Cố định'}</td><td><button type="button" className="btn btn-outline" disabled={saving} onClick={() => {
            if (draft && JSON.stringify(fields.find(item => item.key === draft.key)) !== JSON.stringify(draft) && !window.confirm('Bỏ thay đổi chưa lưu?')) return;
            setDraft({ ...field }); setRevision(updatedAt); setSaveError(''); setSuccess(''); onEditingChange(true);
          }}>Thiết lập</button></td></tr>;
        })}
      </tbody></table></div>
      {draft && spec && <form className="system-field-editor" onSubmit={event => { event.preventDefault(); void save(); }}>
        <h3>Thiết lập {spec.label}</h3>
        <label>Tên hiển thị<input autoFocus required maxLength={100} value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} /></label>
        <label>Hướng dẫn / chú thích<textarea rows={3} maxLength={500} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
        {!spec.formOnly && <label>Thứ tự cột<input type="number" min={0} step={1} required value={draft.order} onChange={event => setDraft({ ...draft, order: Number(event.target.value) })} /></label>}
        {!spec.formOnly && <label className="field-config-check"><input type="checkbox" disabled={spec.protected} checked={draft.visible} onChange={event => setDraft({ ...draft, visible: event.target.checked })} />Hiển thị trên bảng</label>}
        <p>{spec.reason}</p><p>Không đổi quy tắc bắt buộc, quyền sửa dữ liệu hoặc xóa trường hệ thống tại đây.</p>
        {saveError && <p role="alert" className="custom-field-modal__error">{saveError}</p>}
        <footer><button type="button" className="btn btn-outline" disabled={saving} onClick={cancel}>Hủy</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu thiết lập'}</button></footer>
      </form>}
    </div>
  </>;
}
