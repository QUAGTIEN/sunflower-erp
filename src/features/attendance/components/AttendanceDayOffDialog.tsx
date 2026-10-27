import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DayInfo, DayOverride } from '../model/timesheet';

interface Props {
  date: string;
  dayInfo: DayInfo;
  override?: DayOverride;
  onClose: () => void;
  /** `off: null` returns the date to its default (holiday, Sunday or workday). */
  onSave: (change: { off: boolean | null; name: string }) => Promise<void>;
}

const dayLabel = (date: string) => date.split('-').reverse().join('/');

/** Admin/Kế toán decide whether a date is a company day off, so nobody is counted absent on it. */
export function AttendanceDayOffDialog({ date, dayInfo, override, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(dayInfo.off ? dayInfo.name : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const run = async (change: { off: boolean | null; name: string }) => {
    setError('');
    setSaving(true);
    try {
      await onSave(change);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật ngày nghỉ.');
    } finally {
      setSaving(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!saving) void run({ off: true, name: name.trim() });
  };

  return (
    <dialog
      ref={dialog}
      className="attendance-dialog"
      aria-labelledby="attendance-day-off-title"
      onCancel={event => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form onSubmit={submit} aria-busy={saving}>
        <header>
          <h2 id="attendance-day-off-title">Ngày nghỉ · {dayLabel(date)}</h2>
        </header>
        <p className="attendance-dialog-meta">
          Hiện tại: {dayInfo.off ? `Ngày nghỉ (${dayInfo.name})` : 'Ngày làm việc'}
          {override && <span className="attendance-tag">Đã chỉnh trên lịch</span>}
        </p>
        <div className="attendance-day-fields">
          <label className="attendance-field--wide">
            Tên ngày nghỉ *
            <input
              required
              maxLength={100}
              placeholder="Nghỉ bù, Công ty nghỉ…"
              disabled={saving}
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="attendance-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          {override && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={saving}
              onClick={() => void run({ off: null, name: '' })}
            >
              Về mặc định
            </button>
          )}
          {dayInfo.off && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={saving}
              onClick={() => void run({ off: false, name: '' })}
            >
              Đặt là ngày làm việc
            </button>
          )}
          <span />
          <button type="button" className="btn btn-outline" disabled={saving} onClick={onClose}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu ngày nghỉ'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
