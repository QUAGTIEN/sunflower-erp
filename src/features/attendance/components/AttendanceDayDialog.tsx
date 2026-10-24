import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  validateAttendanceDay,
  EMPLOYMENT_LABELS,
  CHANGE_STATUS_LABELS,
  type AttendanceDay,
  type AttendanceChangeRequest,
  type EmploymentType
} from '../model/attendance';

interface Props {
  date: string;
  employeeName: string;
  employmentType: EmploymentType;
  day?: AttendanceDay;
  lastRequest?: AttendanceChangeRequest;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (day: AttendanceDay) => Promise<void>;
  onRequest: (kind: 'edit' | 'delete', day: AttendanceDay | null, reason: string) => Promise<void>;
}
export function AttendanceDayDialog({
  date,
  employeeName,
  employmentType,
  day,
  lastRequest,
  readOnly,
  onClose,
  onSave,
  onRequest
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [worked, setWorked] = useState(day?.worked ?? true);
  const [hours, setHours] = useState(String(day?.hours || ''));
  const [late, setLate] = useState(String(day?.lateMinutes || 0));
  const [ot, setOt] = useState(String(day?.overtimeHours || 0));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>(day ? 'view' : 'edit');
  const [reason, setReason] = useState('');
  const pending = lastRequest?.status === 'pending';
  const fieldsDisabled = saving || readOnly || mode !== 'edit' || pending;
  const dirty =
    !!reason ||
    worked !== (day?.worked ?? true) ||
    hours !== String(day?.hours || '') ||
    late !== String(day?.lateMinutes || 0) ||
    ot !== String(day?.overtimeHours || 0);
  const close = () => {
    if (!saving && (!dirty || window.confirm('Bỏ thay đổi chấm công chưa lưu?'))) onClose();
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || readOnly || pending || mode === 'view') return;
    setError('');
    try {
      if (day && !reason.trim()) throw new Error('Nhập lý do yêu cầu.');
      if (mode === 'delete') {
        setSaving(true);
        await onRequest('delete', null, reason.trim());
        return;
      }
      if (late.trim() === '' || (employmentType === 'full_time' ? ot.trim() === '' : hours.trim() === ''))
        throw new Error('Vui lòng nhập đủ các trường số.');
      const value = validateAttendanceDay(date, date.slice(0, 7), employmentType, {
        worked,
        hours: employmentType === 'part_time' ? Number(hours) : 0,
        lateMinutes: Number(late),
        overtimeHours: employmentType === 'full_time' ? Number(ot) : 0
      });
      if (
        day &&
        value.worked === day.worked &&
        value.hours === day.hours &&
        value.lateMinutes === day.lateMinutes &&
        value.overtimeHours === day.overtimeHours
      )
        throw new Error('Nội dung đề nghị chưa thay đổi.');
      setSaving(true);
      if (day) await onRequest('edit', value, reason.trim());
      else await onSave(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu chấm công.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="attendance-dialog"
      aria-labelledby="attendance-day-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={saving}>
        <header>
          <h2 id="attendance-day-title">
            {day && mode !== 'view' ? (mode === 'delete' ? 'Yêu cầu xóa' : 'Yêu cầu sửa') : 'Chấm công'} ·{' '}
            {date.split('-').reverse().join('/')}
          </h2>
          <button type="button" className="btn btn-outline" onClick={close} disabled={saving}>
            Đóng
          </button>
        </header>
        <p>
          {employeeName} · {EMPLOYMENT_LABELS[employmentType]}
        </p>
        <div className="attendance-day-fields">
          {employmentType === 'full_time' && (
            <label className="attendance-checkbox">
              <input
                type="checkbox"
                checked={worked}
                onChange={event => setWorked(event.target.checked)}
                disabled={fieldsDisabled}
              />
              Đi làm
            </label>
          )}
          {employmentType === 'part_time' && (
            <label>
              Giờ làm *
              <input
                autoFocus={!day}
                type="number"
                required
                min="0.01"
                max="24"
                step="0.01"
                value={hours}
                onChange={event => setHours(event.target.value)}
                disabled={fieldsDisabled}
              />
            </label>
          )}
          <label>
            Trễ (phút)
            <input
              autoFocus={!day && employmentType === 'full_time'}
              type="number"
              required
              min="0"
              max="1440"
              step="1"
              value={late}
              onChange={event => setLate(event.target.value)}
              disabled={fieldsDisabled}
            />
          </label>
          {employmentType === 'full_time' && (
            <label>
              OT (giờ)
              <input
                type="number"
                required
                min="0"
                max="24"
                step="0.01"
                value={ot}
                onChange={event => setOt(event.target.value)}
                disabled={fieldsDisabled}
              />
            </label>
          )}
        </div>
        {lastRequest && (
          <p className={`attendance-status--${lastRequest.status}`} role="status">
            {CHANGE_STATUS_LABELS[lastRequest.status]} {lastRequest.kind === 'delete' ? 'yêu cầu xóa' : 'yêu cầu sửa'}
            {lastRequest.responseReason ? ` · ${lastRequest.responseReason}` : ''}
          </p>
        )}
        {day && mode !== 'view' && (
          <label>
            Lý do *
            <textarea
              autoFocus
              required
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={event => setReason(event.target.value)}
              disabled={saving}
            />
          </label>
        )}
        {error && (
          <p className="attendance-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span />
          {day && mode === 'view'
            ? !readOnly &&
              !pending && (
                <>
                  <button type="button" className="btn btn-outline attendance-danger" onClick={() => setMode('delete')}>
                    Yêu cầu xóa
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setMode('edit')}>
                    Yêu cầu sửa
                  </button>
                </>
              )
            : !readOnly && (
                <>
                  <button type="button" className="btn btn-outline" onClick={close} disabled={saving}>
                    Hủy
                  </button>
                  <button className="btn btn-primary" disabled={saving || (day && !reason.trim())}>
                    {saving ? 'Đang gửi...' : day ? 'Gửi yêu cầu' : 'Lưu chấm công'}
                  </button>
                </>
              )}
        </footer>
      </form>
    </dialog>
  );
}
