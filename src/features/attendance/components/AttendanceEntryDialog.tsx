import { useEffect, useRef, useState, type FormEvent } from 'react';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  DAY_STATUS_LABELS,
  EMPLOYMENT_LABELS,
  validateTimesheetEntry,
  type DayInfo,
  type DayStatus,
  type EmploymentType,
  type HalfDayLeave,
  type TimesheetEntry,
  type TimesheetEntryInput
} from '../model/timesheet';

interface Props {
  date: string;
  dayInfo: DayInfo;
  employeeName: string;
  employmentType: EmploymentType;
  entry?: TimesheetEntry;
  onClose: () => void;
  onSave: (input: TimesheetEntryInput) => Promise<void>;
  onClear: () => Promise<void>;
}

const dayLabel = (date: string) => date.split('-').reverse().join('/');
const numberText = (value: number | undefined) => (value ? String(value) : '');

function statusOptions(type: EmploymentType, dayInfo: DayInfo): DayStatus[] {
  const options: DayStatus[] = type === 'part_time' ? ['present'] : ['present', 'half'];
  // On a day off only work is recorded; resting there is not leave.
  return dayInfo.off ? options : [...options, 'paid_leave', 'unpaid_leave'];
}

export function AttendanceEntryDialog({
  date,
  dayInfo,
  employeeName,
  employmentType,
  entry,
  onClose,
  onSave,
  onClear
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const options = statusOptions(employmentType, dayInfo);
  const initialStatus = entry && options.includes(entry.status) ? entry.status : 'present';
  const [status, setStatus] = useState<DayStatus>(initialStatus);
  const [halfLeave, setHalfLeave] = useState<HalfDayLeave>(entry?.halfLeave || 'paid');
  const [hours, setHours] = useState(numberText(entry?.hours));
  const [late, setLate] = useState(numberText(entry?.lateMinutes));
  const [overtime, setOvertime] = useState(numberText(entry?.overtimeHours));
  const [note, setNote] = useState(entry?.note || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const working = status === 'present' || status === 'half';
  const dirty =
    status !== initialStatus ||
    halfLeave !== (entry?.halfLeave || 'paid') ||
    hours !== numberText(entry?.hours) ||
    late !== numberText(entry?.lateMinutes) ||
    overtime !== numberText(entry?.overtimeHours) ||
    note !== (entry?.note || '');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const close = () => {
    if (!saving && (!dirty || window.confirm('Bỏ thay đổi chấm công chưa lưu?'))) onClose();
  };
  const run = async (operation: () => Promise<void>) => {
    setError('');
    setSaving(true);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu chấm công.');
    } finally {
      setSaving(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    void run(async () => {
      const input = validateTimesheetEntry(
        date,
        employmentType,
        {
          status,
          halfLeave: status === 'half' ? halfLeave : undefined,
          hours: employmentType === 'part_time' && working ? Number(hours || 0) : 0,
          lateMinutes: working ? Number(late || 0) : 0,
          overtimeHours: working && employmentType === 'full_time' ? Number(overtime || 0) : 0,
          note
        },
        dayInfo
      );
      await onSave(input);
    });
  };
  const clear = async () => {
    if (saving) return;
    const confirmed = await confirmDelete(`Xóa công ngày ${dayLabel(date)} của ${employeeName}?`, {
      title: 'Xóa công ngày',
      confirmLabel: 'Xóa công'
    });
    if (confirmed) void run(onClear);
  };

  return (
    <dialog
      ref={dialog}
      className="attendance-dialog"
      aria-labelledby="attendance-entry-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={saving}>
        <header>
          <h2 id="attendance-entry-title">
            {employeeName} · {dayLabel(date)}
          </h2>
        </header>
        <p className="attendance-dialog-meta">
          {EMPLOYMENT_LABELS[employmentType]}
          {dayInfo.off && <span className="attendance-tag attendance-tag--off">{dayInfo.name}</span>}
        </p>
        <fieldset className="attendance-status-options" disabled={saving}>
          <legend>Loại công</legend>
          {options.map(option => (
            <label key={option} className={status === option ? 'is-selected' : undefined}>
              <input
                type="checkbox"
                name="attendance-status"
                value={option}
                checked={status === option}
                onChange={() => setStatus(option)}
              />
              {option === 'present' && employmentType === 'part_time' ? 'Đi làm (theo giờ)' : DAY_STATUS_LABELS[option]}
            </label>
          ))}
        </fieldset>
        <div className="attendance-day-fields">
          {status === 'half' && (
            <label>
              Nửa buổi còn lại *
              <select
                value={halfLeave}
                disabled={saving}
                onChange={event => setHalfLeave(event.target.value as HalfDayLeave)}
              >
                <option value="paid">Nghỉ có phép</option>
                <option value="unpaid">Nghỉ không phép</option>
              </select>
            </label>
          )}
          {working && employmentType === 'part_time' && (
            <label>
              Giờ làm *
              <input
                type="number"
                min="0.01"
                max="24"
                step="0.01"
                required
                disabled={saving}
                value={hours}
                onChange={event => setHours(event.target.value)}
              />
            </label>
          )}
          {working && (
            <label>
              Đi trễ (phút)
              <input
                type="number"
                min="0"
                max="1440"
                step="1"
                disabled={saving}
                value={late}
                onChange={event => setLate(event.target.value)}
              />
            </label>
          )}
          {working && employmentType === 'full_time' && (
            <label>
              Làm thêm OT (giờ)
              <input
                type="number"
                min="0"
                max="24"
                step="0.01"
                disabled={saving}
                value={overtime}
                onChange={event => setOvertime(event.target.value)}
              />
            </label>
          )}
          <label className="attendance-field--wide">
            Ghi chú
            <textarea
              rows={2}
              maxLength={500}
              disabled={saving}
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="attendance-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          {entry && (
            <button type="button" className="btn btn-outline attendance-danger" disabled={saving} onClick={clear}>
              Xóa công
            </button>
          )}
          <span />
          <button type="button" className="btn btn-outline" disabled={saving} onClick={close}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
