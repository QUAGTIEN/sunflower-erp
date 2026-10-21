import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { loadAttendance, mutateAttendance, saveAttendanceSettings } from '../api/attendanceService';
import { AttendanceDayDialog } from '../components/AttendanceDayDialog';
import { AttendanceReturnDialog } from '../components/AttendanceReturnDialog';
import {
  ATTENDANCE_STATUS_LABELS, EMPLOYMENT_LABELS, attendanceTotals, businessDate, isAttendanceAdmin, monthCalendar,
  type AttendanceDay, type AttendanceMonth, type AttendanceSetting, type AttendanceWorkspace, type EmploymentType
} from '../model/attendance';
import './Attendance.css';

type Tab = 'attendance' | 'approval' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'attendance', label: 'Chấm công' }, { id: 'approval', label: 'Duyệt chấm công' }, { id: 'settings', label: 'Thiết lập chấm công' }
];
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const dayLabel = (date: string) => date.split('-').reverse().join('/');
const roleLabels: Record<string, string> = { admin: 'Admin', sale: 'Sale', designer: 'Thiết kế', purchaser: 'Mua hàng', producer: 'Sản xuất', accountant: 'Kế toán' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không thể xử lý chấm công. Kiểm tra kết nối và thử lại.';
const dayText = (day: AttendanceDay, type: EmploymentType) => [type === 'full_time' ? 'Đi làm' : `${number(day.hours)}h`, day.lateMinutes ? `Trễ ${day.lateMinutes}p` : '', day.overtimeHours ? `OT ${number(day.overtimeHours)}h` : ''].filter(Boolean).join(' · ');

export function AttendancePage({ currentUser }: { currentUser: UserProfile }) {
  const admin = isAttendanceAdmin(currentUser);
  const today = businessDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tab, setTab] = useState<Tab>('attendance');
  const [view, setView] = useState<'calendar' | 'table'>('calendar');
  const [selectedUser, setSelectedUser] = useState(currentUser.uid);
  const [workspace, setWorkspace] = useState<AttendanceWorkspace>({ employees: [], settings: [], months: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [editingDate, setEditingDate] = useState('');
  const [returning, setReturning] = useState<AttendanceMonth | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [changes, setChanges] = useState<Record<string, AttendanceSetting>>({});
  const dirtySettings = Object.keys(changes).length > 0;
  useEffect(() => {
    let valid = true;
    loadAttendance(month).then(data => { if (valid) { setWorkspace(data); setError(''); } })
      .catch(cause => { if (valid) setError(errorText(cause)); })
      .finally(() => { if (valid) setLoading(false); });
    return () => { valid = false; };
  }, [month, reload, currentUser.uid]);
  useEffect(() => {
    const guarded = busy || dirtySettings || !!editingDate || !!returning;
    if (!guarded) return;
    const release = registerNavigationGuard(() => busy ? false : window.confirm('Rời trang và bỏ phần nhập liệu chưa lưu?'));
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { release(); window.removeEventListener('beforeunload', beforeUnload); };
  }, [busy, dirtySettings, editingDate, returning]);
  const settingFor = (userId: string) => workspace.settings.find(item => item.userId === userId);
  const record = workspace.months.find(item => item.userId === selectedUser);
  const employee = workspace.employees.find(item => item.uid === selectedUser);
  const employmentType = record && Object.keys(record.days).length ? record.employmentType : settingFor(selectedUser)?.employmentType;
  const totals = attendanceTotals(record?.days || {});
  const editable = selectedUser === currentUser.uid && !!employmentType && (!record || ['draft', 'returned'].includes(record.status)) && !loading && !error && !busy;
  const gridDays = monthCalendar(month);
  const monthDays = gridDays.filter(date => date.startsWith(month));
  const filteredApprovals = workspace.months.filter(item => (!status || item.status === status) && item.employeeName.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const approvals = useDataTablePagination(filteredApprovals);
  const activeEmployees = workspace.employees.filter(item => item.active && item.displayName.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const employeesPage = useDataTablePagination(activeEmployees);
  const refresh = () => { setLoading(true); setReload(value => value + 1); };
  const safeSwitch = (next: () => void) => {
    if (busy || editingDate || returning) return;
    if (dirtySettings && !window.confirm('Bỏ các thiết lập chấm công chưa lưu?')) return;
    setChanges({}); setSearch(''); next();
  };
  const selectMonth = (value: string) => {
    if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value) || value === month) return;
    safeSwitch(() => { setMonth(value); setLoading(true); setError(''); });
  };
  const shiftMonth = (offset: number) => {
    const [year, m] = month.split('-').map(Number);
    selectMonth(new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7));
  };
  const perform = async (operation: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true);
    try { await operation(); }
    catch (cause) { showErrorToast(errorText(cause)); throw cause; }
    finally { actionLock.current = false; setBusy(false); }
  };
  const updateRecord = (next: AttendanceMonth) => setWorkspace(previous => ({ ...previous, months: [...previous.months.filter(item => item.id !== next.id), next] }));
  const mutate = async (action: string, target: AttendanceMonth | undefined, extra: Record<string, unknown> = {}) => {
    const result = await mutateAttendance({ action, userId: target?.userId || selectedUser, month,
      expectedRevision: target?.revision || 0, requestId: crypto.randomUUID(), ...extra });
    updateRecord(result);
  };
  const saveDay = async (day: AttendanceDay | null) => perform(async () => {
    await mutate(day ? 'save_day' : 'delete_day', record, { date: editingDate, employmentType, ...(day ? { day } : {}) });
    setEditingDate(''); showSuccessToast(day ? record?.days[editingDate] ? 'Đã cập nhật chấm công.' : 'Đã lưu chấm công.' : 'Đã xóa chấm công.');
  });
  const submitMonth = () => perform(async () => {
    if (!await confirmDelete(`Gửi bảng công tháng ${month} để duyệt? Tháng sẽ khóa chỉnh sửa cho đến khi được trả về.`, { title: 'Gửi duyệt chấm công', confirmLabel: 'Gửi duyệt' })) return;
    await mutate('submit', record); showSuccessToast('Đã gửi duyệt chấm công.');
  });
  const approve = (target: AttendanceMonth) => perform(async () => {
    if (!await confirmDelete(`Duyệt bảng công tháng ${month} của ${target.employeeName}?`, { title: 'Duyệt chấm công', confirmLabel: 'Duyệt' })) return;
    await mutate('approve', target); showSuccessToast('Đã duyệt chấm công.');
  });
  const editSetting = (userId: string, patch: Partial<AttendanceSetting>) => {
    const previous = changes[userId] || settingFor(userId);
    setChanges(value => ({ ...value, [userId]: { userId, employmentType: previous?.employmentType || 'full_time', reviewerId: previous?.reviewerId || '', revision: previous?.revision || 0, ...patch } }));
  };
  const saveSettings = () => perform(async () => {
    await saveAttendanceSettings(Object.values(changes).map(item => ({ userId: item.userId, employmentType: item.employmentType, reviewerId: item.reviewerId, expectedRevision: item.revision })));
    setChanges({}); showSuccessToast('Đã lưu thiết lập chấm công.'); refresh();
  });
  const canReview = (item: AttendanceMonth) => admin && (!item.reviewerId || item.reviewerId === currentUser.uid || !workspace.employees.some(user => user.uid === item.reviewerId && user.active && user.role === 'admin'));
  const monthControls = <div className="attendance-month-controls"><button type="button" className="btn btn-outline" disabled={busy || loading || month === '2000-01'} onClick={() => shiftMonth(-1)}>Tháng trước</button><label className="attendance-month-label">Tháng<input type="month" min="2000-01" max="2099-12" value={month} onChange={event => selectMonth(event.target.value)} disabled={busy || loading} /></label><button type="button" className="btn btn-outline" disabled={busy || loading || month === '2099-12'} onClick={() => shiftMonth(1)}>Tháng sau</button></div>;

  return <section className="attendance-page" aria-busy={loading || busy}>
    <PageContextHeader section="Chấm công" current={TABS.find(item => item.id === tab)?.label} />
    <nav className="content-tabs" aria-label="Phân hệ Chấm công">{TABS.map(item => <button key={item.id} type="button" className={tab === item.id ? 'active' : ''} aria-current={tab === item.id ? 'page' : undefined} disabled={busy || (item.id !== 'attendance' && !admin)} title={item.id !== 'attendance' && !admin ? 'Chỉ Admin được duyệt và thiết lập chấm công' : undefined} onClick={() => safeSwitch(() => setTab(item.id))}>{item.label}</button>)}</nav>
    {error && <div className="attendance-error attendance-message" role="alert"><span>{error}</span><button type="button" className="btn btn-outline" onClick={refresh} disabled={loading}>Tải lại</button></div>}
    {tab !== 'settings' && <div className="attendance-toolbar">{tab === 'attendance' && <><label>Nhân viên<select value={selectedUser} disabled={!admin || busy || loading} onChange={event => setSelectedUser(event.target.value)}>{workspace.employees.length ? workspace.employees.filter(item => item.active || workspace.months.some(month => month.userId === item.uid)).map(item => <option key={item.uid} value={item.uid}>{item.displayName}{!item.active ? ' (đã khóa)' : ''}</option>) : <option value={currentUser.uid}>{currentUser.displayName}</option>}</select></label><span className="attendance-employment">{employmentType ? EMPLOYMENT_LABELS[employmentType] : 'Chưa thiết lập hình thức làm việc'}</span></>}{monthControls}<button type="button" className="btn btn-outline" onClick={refresh} disabled={loading || busy}>Tải lại</button></div>}
    {loading ? <div className="attendance-message" role="status">Đang tải chấm công...</div> : !error && tab === 'attendance' ? <div className="attendance-surface">
      <div className="attendance-summary"><span>{employmentType === 'part_time' ? <>Tổng giờ làm <strong>{number(totals.hours)} giờ</strong></> : <>Tổng công <strong>{totals.days} công</strong></>}</span><span>Tổng phút trễ <strong>{totals.lateMinutes} phút</strong></span><span>{employmentType === 'part_time' ? <>Số buổi đã làm <strong>{totals.days} buổi</strong></> : <>Tổng OT <strong>{number(totals.overtimeHours)} giờ</strong></>}</span><span className={`attendance-status attendance-status--${record?.status || 'draft'}`}>{record ? ATTENDANCE_STATUS_LABELS[record.status] : 'Chưa có chấm công'}</span></div>
      {record?.returnReason && <p className="attendance-message">Lý do trả về: {record.returnReason}</p>}
      {!employmentType && <p className="attendance-message">Nhờ Admin chọn Full-time hoặc Part-time trong Thiết lập chấm công trước khi nhập công.</p>}
      {selectedUser !== currentUser.uid && <p className="attendance-muted">Đang xem bảng công của nhân viên. Mỗi nhân viên tự cập nhật công của mình.</p>}
      <nav className="content-tabs attendance-view-tabs" aria-label="Cách xem chấm công"><button type="button" className={view === 'calendar' ? 'active' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Lịch tháng</button><button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')}>Bảng công</button></nav>
      {view === 'calendar' ? <div className="attendance-calendar-scroll"><div className="attendance-calendar">
        {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map(label => <div key={label} className="attendance-weekday">{label}</div>)}
        {gridDays.map((date, index) => {
          const inMonth = date.startsWith(month), day = inMonth ? record?.days[date] : undefined;
          const disabled = !inMonth || date > today || !editable;
          return <button key={date} type="button" className={`attendance-calendar-day${!inMonth ? ' is-outside' : ''}${index % 7 >= 5 ? ' is-weekend' : ''}${date === today ? ' is-today' : ''}`} disabled={disabled} aria-label={`${dayLabel(date)}: ${day && employmentType ? dayText(day, employmentType) : 'Chưa ghi nhận'}`} onClick={() => setEditingDate(date)}>
            <span className="attendance-date">{Number(date.slice(-2))}</span>{day && employmentType && <span className="attendance-day-status"><span>{employmentType === 'full_time' ? 'Đi làm' : `${number(day.hours)}h`}</span>{day.lateMinutes > 0 && <span className="attendance-late">Trễ {day.lateMinutes}p</span>}{day.overtimeHours > 0 && <span className="attendance-ot">OT {number(day.overtimeHours)}h</span>}</span>}
          </button>;
        })}
      </div></div> : <div className="attendance-table-scroll"><table className="attendance-days-table"><thead><tr><th>Ngày</th><th>Ghi nhận</th><th className="attendance-number">Công</th><th className="attendance-number">Giờ làm</th><th className="attendance-number">Phút trễ</th><th className="attendance-number">OT (giờ)</th><th>Thao tác</th></tr></thead><tbody>{monthDays.map(date => {
        const day = record?.days[date];
        return <tr key={date}><td>{dayLabel(date)}</td><td>{day ? 'Đi làm' : '—'}</td><td className="attendance-number">{day && employmentType === 'full_time' ? '1' : '—'}</td><td className="attendance-number">{day && employmentType === 'part_time' ? number(day.hours) : '—'}</td><td className="attendance-number">{day ? day.lateMinutes : '—'}</td><td className="attendance-number">{day && employmentType === 'full_time' ? number(day.overtimeHours) : '—'}</td><td><RowActionMenu actions={[{ label: day ? 'Chỉnh sửa' : 'Chấm công', disabled: !editable || date > today, onSelect: () => setEditingDate(date) }]} /></td></tr>;
      })}</tbody></table></div>}
    <footer className="attendance-footer"><span className="attendance-muted">{editable ? 'Bấm vào ngày để nhập hoặc chỉnh sửa. Mỗi ngày được lưu ngay khi xác nhận.' : record && ['pending', 'approved'].includes(record.status) ? 'Công đang chờ duyệt hoặc đã duyệt chỉ được sửa sau khi Admin trả về.' : 'Chỉ nhân viên được cập nhật công của mình sau khi được thiết lập hình thức làm việc.'}</span>{selectedUser === currentUser.uid && <button type="button" className="btn btn-primary" disabled={!editable || !totals.days} onClick={() => void submitMonth().catch(() => {})}>Gửi duyệt tháng</button>}</footer>
    </div> : !error && tab === 'approval' && admin ? <div className="attendance-surface">
      <div className="attendance-toolbar"><label>Nhân viên<input value={search} onChange={event => { setSearch(event.target.value); approvals.paginationProps.setPage(1); }} placeholder="Tìm tên nhân viên..." /></label><label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); approvals.paginationProps.setPage(1); }}><option value="">Tất cả trạng thái</option>{Object.entries(ATTENDANCE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <div className="attendance-table-scroll"><table className="attendance-approval-table"><thead><tr><th>Nhân viên</th><th>Hình thức</th><th className="attendance-number">Công / Giờ làm</th><th className="attendance-number">Phút trễ</th><th className="attendance-number">OT (giờ)</th><th>Ngày gửi</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{approvals.rows.map(item => {
        const sum = attendanceTotals(item.days);
        return <tr key={item.id}><td title={item.employeeName}>{item.employeeName}</td><td>{EMPLOYMENT_LABELS[item.employmentType]}</td><td className="attendance-number">{item.employmentType === 'full_time' ? `${sum.days} công` : `${number(sum.hours)} giờ`}</td><td className="attendance-number">{sum.lateMinutes}</td><td className="attendance-number">{item.employmentType === 'full_time' ? number(sum.overtimeHours) : '—'}</td><td>{item.submittedAt ? dayLabel(businessDate(new Date(item.submittedAt))) : '—'}</td><td className={`attendance-status--${item.status}`}>{ATTENDANCE_STATUS_LABELS[item.status]}</td><td><RowActionMenu label={`Thao tác bảng công ${item.employeeName}`} actions={[
          { label: 'Xem bảng công', disabled: busy, onSelect: () => { setSelectedUser(item.userId); setView('table'); setTab('attendance'); } },
          { label: 'Duyệt', disabled: busy || !canReview(item) || item.status !== 'pending', onSelect: () => void approve(item).catch(() => {}) },
          { label: 'Yêu cầu chỉnh sửa', disabled: busy || !canReview(item) || !['pending', 'approved'].includes(item.status), onSelect: () => setReturning(item) }
        ]} /></td></tr>;
      })}{!approvals.rows.length && <tr><td colSpan={8}>Không có bảng công phù hợp trong tháng này.</td></tr>}</tbody></table></div><DataTablePagination {...approvals.paginationProps} />
    </div> : !error && tab === 'settings' && admin ? <div className="attendance-surface">
      <div className="attendance-toolbar"><h2>Thiết lập chấm công</h2><div className="attendance-header-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={() => safeSwitch(refresh)}>Tải lại</button><button type="button" className="btn btn-primary" disabled={busy || !dirtySettings} onClick={() => void saveSettings().catch(() => {})}>{busy ? 'Đang lưu...' : 'Lưu thiết lập'}</button></div></div>
      <div className="attendance-rules"><p><strong>Full-time:</strong> đi làm tính 1 công/ngày; ghi nhận phút trễ và giờ OT.</p><p><strong>Part-time:</strong> tổng giờ làm theo ngày; ngày có giờ làm tính 1 buổi. Không nhập giờ vào/ra.</p><p>Hình thức làm việc áp dụng cho tháng chưa có công. Tháng đã có công giữ nguyên hình thức đã ghi nhận. Người duyệt được chốt khi gửi duyệt; bỏ trống thì các Admin đều có thể duyệt.</p></div>
      <div className="attendance-toolbar"><label>Nhân viên<input value={search} onChange={event => { setSearch(event.target.value); employeesPage.paginationProps.setPage(1); }} placeholder="Tìm tên nhân viên..." /></label>{dirtySettings && <span className="attendance-muted">Có thiết lập chưa lưu</span>}</div>
      <div className="attendance-table-scroll"><table className="attendance-settings-table"><thead><tr><th>Nhân viên</th><th>Bộ phận / vai trò</th><th>Hình thức làm việc</th><th>Người duyệt (Admin)</th></tr></thead><tbody>{employeesPage.rows.map(item => {
        const setting = changes[item.uid] || settingFor(item.uid);
        return <tr key={item.uid}><td title={item.displayName}>{item.displayName}</td><td>{roleLabels[item.role] || item.role}</td><td><select aria-label={`Hình thức làm việc của ${item.displayName}`} value={setting?.employmentType || ''} onChange={event => editSetting(item.uid, { employmentType: event.target.value as EmploymentType })} disabled={busy}><option value="" disabled>Chưa thiết lập</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option></select></td><td><select aria-label={`Người duyệt của ${item.displayName}`} value={setting?.reviewerId || ''} onChange={event => editSetting(item.uid, { reviewerId: event.target.value })} disabled={busy || !setting?.employmentType}><option value="">Các Admin</option>{workspace.employees.filter(person => person.active && person.role === 'admin').map(person => <option key={person.uid} value={person.uid}>{person.displayName}</option>)}{setting?.reviewerId && !workspace.employees.some(person => person.uid === setting.reviewerId && person.active && person.role === 'admin') && <option value={setting.reviewerId}>Người duyệt không còn hoạt động</option>}</select></td></tr>;
      })}{!employeesPage.rows.length && <tr><td colSpan={4}>Không có nhân viên phù hợp.</td></tr>}</tbody></table></div><DataTablePagination {...employeesPage.paginationProps} />
    </div> : null}
    {editingDate && employmentType && <AttendanceDayDialog date={editingDate} employeeName={employee?.displayName || currentUser.displayName} employmentType={employmentType} day={record?.days[editingDate]} onClose={() => setEditingDate('')} onSave={saveDay} />}
    {returning && <AttendanceReturnDialog employeeName={returning.employeeName} onClose={() => setReturning(null)} onReturn={reason => perform(async () => { await mutate('return', returning, { reason }); setReturning(null); showSuccessToast('Đã trả về bảng công để chỉnh sửa.'); })} />}
  </section>;
}
