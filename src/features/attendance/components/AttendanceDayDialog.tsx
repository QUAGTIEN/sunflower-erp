import { useEffect, useRef, useState, type FormEvent } from 'react';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { validateAttendanceDay, EMPLOYMENT_LABELS, type AttendanceDay, type EmploymentType } from '../model/attendance';

interface Props {
  date: string; employeeName: string; employmentType: EmploymentType; day?: AttendanceDay;
  onClose: () => void; onSave: (day: AttendanceDay | null) => Promise<void>;
}
export function AttendanceDayDialog({ date, employeeName, employmentType, day, onClose, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [worked, setWorked] = useState(day?.worked ?? true);
  const [hours, setHours] = useState(String(day?.hours || ''));
  const [late, setLate] = useState(String(day?.lateMinutes || 0));
  const [ot, setOt] = useState(String(day?.overtimeHours || 0));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = worked !== (day?.worked ?? true) || hours !== String(day?.hours || '') || late !== String(day?.lateMinutes || 0) || ot !== String(day?.overtimeHours || 0);
  const close = () => {
    if (!saving && (!dirty || window.confirm('Bỏ thay đổi chấm công chưa lưu?'))) onClose();
  };
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (saving) return;
    setError('');
    try {
      if (late.trim() === '' || (employmentType === 'full_time' ? ot.trim() === '' : hours.trim() === '')) throw new Error('Nhập đủ các trường số; không đi trễ hoặc OT thì nhập 0.');
      const value = validateAttendanceDay(date, date.slice(0, 7), employmentType, {
        worked, hours: employmentType === 'part_time' ? Number(hours) : 0, lateMinutes: Number(late), overtimeHours: employmentType === 'full_time' ? Number(ot) : 0
      });
      setSaving(true); await onSave(value);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu chấm công.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!await confirmDelete(`Xóa chấm công ngày ${date.split('-').reverse().join('/')}?`)) return;
      await onSave(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xóa chấm công.'); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} className="attendance-dialog" aria-labelledby="attendance-day-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={submit} aria-busy={saving}>
      <header><h2 id="attendance-day-title">Chấm công ngày {date.split('-').reverse().join('/')}</h2><button type="button" className="btn btn-outline" onClick={close} disabled={saving}>Đóng</button></header>
      <p>{employeeName} · {EMPLOYMENT_LABELS[employmentType]}</p>
      <div className="attendance-day-fields">
        {employmentType === 'full_time' && <label className="attendance-checkbox"><input type="checkbox" checked={worked} onChange={event => setWorked(event.target.checked)} disabled={saving} />Đi làm ngày này</label>}
        {employmentType === 'part_time' && <label>Số giờ đã làm *<input autoFocus type="number" required min="0.01" max="24" step="0.01" value={hours} onChange={event => setHours(event.target.value)} disabled={saving} /></label>}
        <label>Đi trễ (phút)<input autoFocus={employmentType === 'full_time'} type="number" required min="0" max="1440" step="1" value={late} onChange={event => setLate(event.target.value)} disabled={saving} /></label>
        {employmentType === 'full_time' && <label>OT (giờ)<input type="number" required min="0" max="24" step="0.01" value={ot} onChange={event => setOt(event.target.value)} disabled={saving} /></label>}
      </div>
      <p className="attendance-muted">{employmentType === 'full_time' ? 'Đi làm tính 1 công/ngày. Không trễ hoặc OT thì nhập 0.' : 'Nhập tổng giờ làm trong ngày; không cần giờ vào/ra.'}</p>
      {error && <p className="attendance-error" role="alert">{error}</p>}
      <footer>{day && <button type="button" className="btn btn-outline attendance-danger" onClick={() => void remove()} disabled={saving}>Xóa chấm công</button>}<span /><button type="button" className="btn btn-outline" onClick={close} disabled={saving}>Hủy</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : day ? 'Lưu thay đổi' : 'Lưu chấm công'}</button></footer>
    </form>
  </dialog>;
}
