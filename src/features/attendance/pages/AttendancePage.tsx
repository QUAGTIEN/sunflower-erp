import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { TableSkeleton } from '@/components/LoadingStates';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { loadAttendance, mutateAttendance } from '../api/attendanceService';
import { AttendanceMonthNav } from '../components/AttendanceMonthNav';
import { AttendanceRecorderBoard } from '../components/AttendanceRecorderBoard';
import { AttendanceTimesheetTable } from '../components/AttendanceTimesheetTable';
import { AttendanceEntryDialog } from '../components/AttendanceEntryDialog';
import { AttendanceDayOffDialog } from '../components/AttendanceDayOffDialog';
import { AttendanceProfilesDialog } from '../components/AttendanceProfilesDialog';
import { attendanceEmployees, employmentTypeFor } from '../model/attendanceRoster';
import {
  businessDate,
  canRecordAttendance,
  resolveDay,
  type AttendanceCalendar,
  type AttendanceWorkspace,
  type EmploymentType,
  type TimesheetEntryInput,
  type TimesheetMonth
} from '../model/timesheet';
import './Attendance.css';

type Tab = 'record' | 'timesheet';
const TAB_LABELS: Record<Tab, string> = { record: 'Chấm công', timesheet: 'Bảng công' };
const MONTH_PATTERN = /^(20\d{2})-(0[1-9]|1[0-2])$/;
const emptyWorkspace = (month: string): AttendanceWorkspace => ({
  canRecord: false,
  employees: [],
  profiles: [],
  sheets: [],
  calendar: { year: Number(month.slice(0, 4)), overrides: {}, revision: 0 }
});
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thể xử lý chấm công. Kiểm tra kết nối và thử lại.';

export function AttendancePage({ currentUser }: { currentUser: UserProfile }) {
  const today = businessDate();
  const recorder = canRecordAttendance(currentUser);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tab, setTab] = useState<Tab>(recorder ? 'record' : 'timesheet');
  const [workspace, setWorkspace] = useState<AttendanceWorkspace>(() => emptyWorkspace(today));
  const [loading, setLoading] = useState(true);
  const [loadedMonth, setLoadedMonth] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDate, setSelectedDate] = useState(today);
  const [editing, setEditing] = useState<{ userId: string; date: string } | null>(null);
  const [dayOffDate, setDayOffDate] = useState('');
  const [profilesOpen, setProfilesOpen] = useState(false);
  // Months already viewed show at once while the server copy refreshes in the background.
  const monthCache = useRef(new Map<string, AttendanceWorkspace>());
  // A failed write is retried with the same requestId so the server can answer it without writing twice.
  const lastRequest = useRef({ payload: '', id: '' });

  useEffect(() => {
    let valid = true;
    loadAttendance(month)
      .then(data => {
        monthCache.current.set(month, data);
        if (valid) {
          setWorkspace(data);
          setLoadedMonth(month);
          setError('');
        }
      })
      .catch(cause => {
        if (valid) setError(errorText(cause));
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [month, reload]);
  useEffect(() => {
    if (loadedMonth) monthCache.current.set(loadedMonth, workspace);
  }, [loadedMonth, workspace]);
  useEffect(() => {
    if (!busy && !editing && !dayOffDate && !profilesOpen) return;
    const release = registerNavigationGuard(() =>
      busy ? false : window.confirm('Rời trang và bỏ phần nhập liệu chưa lưu?')
    );
    return release;
  }, [busy, editing, dayOffDate, profilesOpen]);

  const activeDate = selectedDate.startsWith(month) ? selectedDate : today.startsWith(month) ? today : `${month}-01`;
  const canRecord = recorder && workspace.canRecord;
  const visibleTab: Tab = canRecord ? tab : 'timesheet';
  const showSkeleton = loading && loadedMonth !== month;
  const employees = attendanceEmployees(workspace);
  const activeEmployeeId = employees.some(person => person.uid === selectedEmployeeId) ? selectedEmployeeId : '';

  const refresh = () => {
    setLoading(true);
    setReload(value => value + 1);
  };
  const selectMonth = (value: string) => {
    if (!MONTH_PATTERN.test(value) || value === month || busy) return;
    const cached = monthCache.current.get(value);
    if (cached) {
      setWorkspace(cached);
      setLoadedMonth(value);
    }
    setMonth(value);
    setLoading(true);
    setError('');
  };
  const send = async (body: Record<string, unknown>) => {
    const payload = JSON.stringify(body);
    if (lastRequest.current.payload !== payload) lastRequest.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await mutateAttendance({ ...body, requestId: lastRequest.current.id });
      lastRequest.current = { payload: '', id: '' };
      return result;
    } finally {
      setBusy(false);
    }
  };
  const replaceSheet = (sheet: TimesheetMonth) =>
    setWorkspace(previous => ({
      ...previous,
      sheets: [...previous.sheets.filter(item => item.id !== sheet.id), sheet]
    }));
  const saveDay = async (userId: string, date: string, entry: TimesheetEntryInput | null) => {
    const sheet = workspace.sheets.find(item => item.userId === userId);
    const result = await send({ action: 'save_day', userId, date, entry, expectedRevision: sheet?.revision || 0 });
    replaceSheet(result.sheet as TimesheetMonth);
    setEditing(null);
    showSuccessToast(entry ? 'Đã lưu chấm công.' : 'Đã xóa công ngày.');
  };
  const markPresent = async (date: string) => {
    try {
      const result = await send({ action: 'mark_present', date });
      const skipped = Number(result.skippedPartTime || 0);
      showSuccessToast(
        `Đã chấm đi làm cho ${Number(result.marked || 0)} nhân viên.` +
          (skipped ? ` ${skipped} nhân viên Part-time cần chấm giờ riêng.` : '')
      );
      refresh();
    } catch (cause) {
      showErrorToast(errorText(cause));
    }
  };
  const saveDayOff = async (date: string, change: { off: boolean | null; name: string }) => {
    const result = await send({
      action: 'set_day_off',
      date,
      ...change,
      expectedRevision: workspace.calendar.revision
    });
    setWorkspace(previous => ({ ...previous, calendar: result.calendar as AttendanceCalendar }));
    setDayOffDate('');
    showSuccessToast('Đã cập nhật lịch ngày nghỉ.');
  };
  const saveProfiles = async (
    changes: { userId: string; employmentType: EmploymentType; expectedRevision: number }[]
  ) => {
    await send({ action: 'set_profiles', changes });
    setProfilesOpen(false);
    showSuccessToast('Đã lưu thiết lập hình thức làm việc.');
    refresh();
  };

  const editingEmployee = editing && workspace.employees.find(person => person.uid === editing.userId);
  return (
    <section className="attendance-page" aria-busy={loading || busy}>
      <PageContextHeader section="Chấm công" current={TAB_LABELS[visibleTab]} />
      <nav className="content-tabs" aria-label="Phân hệ Chấm công">
        {(canRecord ? (['record', 'timesheet'] as Tab[]) : (['timesheet'] as Tab[])).map(item => (
          <button
            key={item}
            type="button"
            className={visibleTab === item ? 'active' : ''}
            aria-current={visibleTab === item ? 'page' : undefined}
            disabled={busy}
            onClick={() => setTab(item)}
          >
            {TAB_LABELS[item]}
          </button>
        ))}
      </nav>
      {error && (
        <div className="attendance-error attendance-message" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-outline" onClick={refresh} disabled={loading}>
            Tải lại
          </button>
        </div>
      )}
      <div className="attendance-toolbar">
        {canRecord && (visibleTab === 'record' || !activeEmployeeId) && (
          <input
            type="search"
            aria-label="Tìm nhân viên"
            placeholder="Tìm nhân viên"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        )}
        {canRecord && visibleTab === 'timesheet' && (
          <select
            aria-label="Chọn nhân viên xem bảng công"
            value={activeEmployeeId}
            disabled={busy}
            onChange={event => setSelectedEmployeeId(event.target.value)}
          >
            <option value="">Tất cả nhân viên ({employees.length})</option>
            {employees.map(person => (
              <option key={person.uid} value={person.uid}>
                {person.displayName}
              </option>
            ))}
          </select>
        )}
        <AttendanceMonthNav
          month={month}
          currentMonth={today.slice(0, 7)}
          refreshing={loading && loadedMonth === month}
          disabled={busy}
          onSelect={selectMonth}
          onRefresh={refresh}
        />
        {visibleTab === 'record' && (
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => setProfilesOpen(true)}>
            Thiết lập NV
          </button>
        )}
      </div>
      {showSkeleton ? (
        <TableSkeleton label="Đang tải chấm công" columns={7} rows={5} />
      ) : error ? null : visibleTab === 'record' ? (
        <AttendanceRecorderBoard
          workspace={workspace}
          month={month}
          today={today}
          selectedDate={activeDate}
          search={search}
          busy={busy || loading}
          onSelectDate={setSelectedDate}
          onOpenEntry={(userId, date) => setEditing({ userId, date })}
          onMarkPresent={date => void markPresent(date)}
          onEditDayOff={setDayOffDate}
        />
      ) : (
        <AttendanceTimesheetTable
          workspace={workspace}
          month={month}
          search={search}
          selectedEmployeeId={activeEmployeeId}
          onSelectEmployee={canRecord ? setSelectedEmployeeId : undefined}
        />
      )}
      {editing && editingEmployee && (
        <AttendanceEntryDialog
          date={editing.date}
          dayInfo={resolveDay(editing.date, workspace.calendar)}
          employeeName={editingEmployee.displayName}
          employmentType={employmentTypeFor(workspace, editing.userId)}
          entry={workspace.sheets.find(sheet => sheet.userId === editing.userId)?.days[editing.date]}
          onClose={() => setEditing(null)}
          onSave={input => saveDay(editing.userId, editing.date, input)}
          onClear={() => saveDay(editing.userId, editing.date, null)}
        />
      )}
      {dayOffDate && (
        <AttendanceDayOffDialog
          date={dayOffDate}
          dayInfo={resolveDay(dayOffDate, workspace.calendar)}
          override={workspace.calendar.overrides[dayOffDate]}
          onClose={() => setDayOffDate('')}
          onSave={change => saveDayOff(dayOffDate, change)}
        />
      )}
      {profilesOpen && (
        <AttendanceProfilesDialog
          employees={attendanceEmployees(workspace)}
          profiles={workspace.profiles}
          onClose={() => setProfilesOpen(false)}
          onSave={saveProfiles}
        />
      )}
    </section>
  );
}
