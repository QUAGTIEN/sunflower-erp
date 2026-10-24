import { showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useState } from 'react';
import { Eye, EyeOff, Pencil, Save, Settings2, X } from 'lucide-react';
import type { CustomerFilterDefinition } from '@/features/crm/model/customerFilterConfig';

export const CustomerFilterAdminModal: React.FC<{
  definitions: CustomerFilterDefinition[];
  onClose: () => void;
  onSaveDefinition: (definition: CustomerFilterDefinition) => Promise<void>;
}> = ({ definitions, onClose, onSaveDefinition }) => {
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<CustomerFilterDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const persistDefinition = async (definition: CustomerFilterDefinition) => {
    return runMutationAction(
      'CustomerFilterAdminModal.tsx:persistDefinition',
      async () => {
        setSaveError('');
        setSaving(true);
        try {
          await onSaveDefinition(definition);

          showSuccessToast('Đã lưu thành công');
          return true;
        } catch (error) {
          showErrorToast();
          const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
          setSaveError(
            code.includes('permission-denied')
              ? 'Firebase chưa cấp quyền quản trị bộ lọc khách hàng. Hãy kiểm tra và xuất bản Firestore Rules mới nhất.'
              : 'Không thể lưu cấu hình lúc này. Vui lòng thử lại hoặc kiểm tra kết nối Firebase.'
          );
          return false;
        } finally {
          setSaving(false);
        }
      },
      definition
    );
  };

  const startEdit = (definition: CustomerFilterDefinition) => {
    setSaveError('');
    setEditingId(definition.id);
    setDraft({ ...definition });
  };

  const toggleDefinitionActive = async (definition: CustomerFilterDefinition) => {
    return runMutationAction(
      'CustomerFilterAdminModal.tsx:toggleDefinitionActive',
      async () => {
        const saved = await persistDefinition({ ...definition, active: !definition.active });
        if (saved && editingId === definition.id) {
          setDraft(previous => (previous ? { ...previous, active: !definition.active } : previous));
        }
      },
      definition
    );
  };

  const saveDraft = async () => {
    return runMutationAction(
      'CustomerFilterAdminModal.tsx:saveDraft',
      async () => {
        if (!draft?.name.trim()) return;
        const saved = await persistDefinition({
          ...draft,
          name: draft.name.trim(),
          description: draft.description.trim()
        });
        if (saved) {
          setEditingId('');
          setDraft(null);
        }
      },
      undefined
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content lead-config-modal customer-filter-config-modal">
        <div className="modal-header">
          <div>
            <strong>CẤU HÌNH BỘ LỌC KHÁCH HÀNG</strong>
            <span>Đổi tên, mô tả hoặc ngừng sử dụng tiêu chí lọc mà không ảnh hưởng dữ liệu khách hàng.</span>
          </div>
          <button type="button" className="btn btn-sm btn-outline" onClick={onClose}>
            <X size={15} /> Đóng
          </button>
        </div>
        <div className="modal-body">
          <div className="lead-config-layout">
            <div className="lead-config-list">
              <div className="lead-config-list__header">
                <div>
                  <strong>{definitions.filter(definition => definition.active).length} tiêu chí đang sử dụng</strong>
                  <span>Các tiêu chí bám theo dữ liệu hiện có trong CRM.</span>
                </div>
              </div>
              {definitions.map(definition => (
                <div
                  key={definition.id}
                  className={`lead-config-item ${!definition.active ? 'is-inactive' : ''} ${editingId === definition.id ? 'is-editing' : ''}`}
                >
                  <div>
                    <strong>{definition.name}</strong>
                    <span>{definition.active ? 'Đang hiển thị trong bộ lọc' : 'Đã ngừng sử dụng'}</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-symbol-sm"
                      title={definition.active ? 'Ngừng sử dụng' : 'Sử dụng lại'}
                      disabled={saving}
                      onClick={() => toggleDefinitionActive(definition)}
                    >
                      {definition.active ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline btn-symbol-sm"
                      title="Chỉnh sửa"
                      onClick={() => startEdit(definition)}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="lead-config-editor">
              {draft ? (
                <>
                  <h3>Chỉnh sửa tiêu chí</h3>
                  <label>
                    <span>Tên tiêu chí *</span>
                    <input
                      value={draft.name}
                      onChange={event =>
                        setDraft(previous => (previous ? { ...previous, name: event.target.value } : previous))
                      }
                    />
                  </label>
                  <label>
                    <span>Mô tả hướng dẫn</span>
                    <textarea
                      rows={5}
                      value={draft.description}
                      onChange={event =>
                        setDraft(previous => (previous ? { ...previous, description: event.target.value } : previous))
                      }
                      placeholder="Giải thích ngắn gọn cách sử dụng tiêu chí này."
                    />
                  </label>
                  <div className="customer-filter-config-note">
                    Danh sách lựa chọn được đồng bộ tự động từ dữ liệu CRM để tránh cấu hình sai hoặc tạo lựa chọn không
                    có dữ liệu.
                  </div>
                  <div className="lead-config-editor__actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setEditingId('');
                        setDraft(null);
                      }}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={saving || !draft.name.trim()}
                      onClick={saveDraft}
                    >
                      <Save size={14} /> {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                  {saveError && (
                    <p className="lead-config-error" role="alert">
                      {saveError}
                    </p>
                  )}
                </>
              ) : (
                <div className="lead-config-placeholder">
                  <Settings2 size={34} />
                  <strong>Chọn một tiêu chí để chỉnh sửa</strong>
                  <span>Bạn có thể đổi tên và mô tả; trạng thái sử dụng được điều khiển ngay trong danh sách.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
