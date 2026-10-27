import { useEffect, useRef, useState } from 'react';
import {
  EMPLOYMENT_LABELS,
  type AttendanceEmployee,
  type EmployeeProfile,
  type EmploymentType
} from '../model/timesheet';

interface Props {
  employees: AttendanceEmployee[];
  profiles: EmployeeProfile[];
  onClose: () => void;
  onSave: (changes: { userId: string; employmentType: EmploymentType; expectedRevision: number }[]) => Promise<void>;
}

/** Full-time / Part-time per employee. An employee without a profile is treated as Full-time. */
export function AttendanceProfilesDialog({ employees, profiles, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [changes, setChanges] = useState<Record<string, EmploymentType>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(changes).length > 0;
  const profileOf = (userId: string) => profiles.find(profile => profile.userId === userId);
  const typeOf = (userId: string): EmploymentType =>
    changes[userId] || (profileOf(userId)?.employmentType === 'part_time' ? 'part_time' : 'full_time');
  const visible = employees.filter(
    person =>
      person.active && person.displayName.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))
  );

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const close = () => {
    if (!saving && (!dirty || window.confirm('Bỏ thiết lập chưa lưu?'))) onClose();
  };
  const change = (userId: string, employmentType: EmploymentType) => {
    const saved = profileOf(userId)?.employmentType === 'part_time' ? 'part_time' : 'full_time';
    setChanges(current => {
      const next = { ...current };
      if (employmentType === saved) delete next[userId];
      else next[userId] = employmentType;
      return next;
    });
  };
  const save = async () => {
    if (saving || !dirty) return;
    setError('');
    setSaving(true);
    try {
      await onSave(
        Object.entries(changes).map(([userId, employmentType]) => ({
          userId,
          employmentType,
          expectedRevision: profileOf(userId)?.revision || 0
        }))
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu thiết lập.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="attendance-dialog attendance-dialog--wide"
      aria-labelledby="attendance-profiles-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="attendance-profiles-title">Thiết lập hình thức làm việc</h2>
      </header>
      <input
        type="search"
        aria-label="Tìm nhân viên"
        placeholder="Tìm nhân viên"
        value={search}
        onChange={event => setSearch(event.target.value)}
      />
      <div className="attendance-table-scroll">
        <table className="attendance-profiles-table">
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Hình thức làm việc</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(person => (
              <tr key={person.uid} className={changes[person.uid] ? 'is-changed' : undefined}>
                <td title={person.displayName}>{person.displayName}</td>
                <td>
                  <select
                    aria-label={`Hình thức làm việc của ${person.displayName}`}
                    disabled={saving}
                    value={typeOf(person.uid)}
                    onChange={event => change(person.uid, event.target.value as EmploymentType)}
                  >
                    {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map(type => (
                      <option key={type} value={type}>
                        {EMPLOYMENT_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={2}>Không có nhân viên phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="attendance-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <span>{dirty ? `Đã đổi ${Object.keys(changes).length} nhân viên` : ''}</span>
        <button type="button" className="btn btn-outline" disabled={saving} onClick={close}>
          Hủy
        </button>
        <button type="button" className="btn btn-primary" disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? 'Đang lưu…' : 'Lưu thiết lập'}
        </button>
      </footer>
    </dialog>
  );
}
