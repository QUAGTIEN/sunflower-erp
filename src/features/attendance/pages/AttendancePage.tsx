import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { UserProfile } from '@/shared/types';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { RefreshingIndicator, TableSkeleton } from '@/components/LoadingStates';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { loadAttendance, mutateAttendance, saveAttendanceSettings } from '../api/attendanceService';
import { AttendanceDayDialog } from '../components/AttendanceDayDialog';
import { AttendanceReturnDialog } from '../components/AttendanceReturnDialog';
import { AttendanceChangeReviewDialog } from '../components/AttendanceChangeReviewDialog';
import {
  ATTENDANCE_STATUS_LABELS,
  CHANGE_STATUS_LABELS,
  EMPLOYMENT_LABELS,
  attendanceTotals,
  businessDate,
  formatAttendanceDay,
  hasPendingChanges,
  isAttendanceAdmin,
  monthCalendar,
  pendingDayChange,
  type AttendanceChangeRequest,
  type AttendanceDay,
  type AttendanceMonth,
  type AttendanceSetting,
  type AttendanceWorkspace,
  type EmploymentType
} from '../model/attendance';
import './Attendance.css';

type Tab = 'attendance' | 'approval' | 'settings';
type ChangeRow = { record: AttendanceMonth; request: AttendanceChangeRequest };
const TABS: { id: Tab; label: string }[] = [
  { id: 'attendance', label: 'Chấm công' },
  { id: 'approval', label: 'Duyệt chấm công' },
  { id: 'settings', label: 'Thiết lập chấm công' }
];
const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const dayLabel = (date: string) => date.split('-').reverse().join('/');
const roleLabels: Record<string, string> = {
  admin: 'Admin',
  sale: 'Sale',
  designer: 'Thiết kế',
  purchaser: 'Mua hàng',
  producer: 'Sản xuất',
  accountant: 'Kế toán'
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Không thể xử lý chấm công. Kiểm tra kết nối và thử lại.';

export function AttendancePage({ currentUser }: { currentUser: UserProfile }) {
  const admin = isAttendanceAdmin(currentUser);
  const today = businessDate();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tab, setTab] = useState<Tab>('attendance');
  const [selectedUser, setSelectedUser] = useState(currentUser.uid);
  const [workspace, setWorkspace] = useState<AttendanceWorkspace>({ employees: [], settings: [], months: [] });
  const [loading, setLoading] = useState(true);
  const [loadedMonth, setLoadedMonth] = useState('');
  // Months already viewed show at once while the server copy refreshes in the background.
  const monthCache = useRef(new Map<string, AttendanceWorkspace>());
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [editingDate, setEditingDate] = useState('');
  const [returning, setReturning] = useState<AttendanceMonth | null>(null);
  const [reviewingChange, setReviewingChange] = useState<ChangeRow | null>(null);
  const [approvalKind, setApprovalKind] = useState<'changes' | 'months'>('changes');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [changes, setChanges] = useState<Record<string, AttendanceSetting>>({});
  const dirtySettings = Object.keys(changes).length > 0;
  useEffect(() => {
    let valid = true;
    loadAttendance(month)
      .then(data => {
        monthCache.current.set(month, data);
        if (valid) {
          setWorkspace(data);
          setLoadedMonth(month);
          setError('');
          setSelectedUser(previous =>
            data.employees.some(person => person.uid === previous) ? previous : currentUser.uid
          );
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
  }, [month, reload, currentUser.uid]);
  useEffect(() => {
    if (loadedMonth) monthCache.current.set(loadedMonth, workspace);
  }, [loadedMonth, workspace]);
  useEffect(() => {
    if (!busy && !dirtySettings && !editingDate && !returning && !reviewingChange) return;
    const release = registerNavigationGuard(() =>
      busy ? false : window.confirm('Rời trang và bỏ phần nhập liệu chưa lưu?')
    );
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      release();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [busy, dirtySettings, editingDate, returning, reviewingChange]);
  const settingFor = (userId: string) => workspace.settings.find(item => item.userId === userId);
  const record = workspace.months.find(item => item.userId === selectedUser);
  const employee = workspace.employees.find(item => item.uid === selectedUser);
  const employmentType =
    record && Object.keys(record.days).length ? record.employmentType : settingFor(selectedUser)?.employmentType;
  const ownCalendar = selectedUser === currentUser.uid;
  const canCreate = ownCalendar && !!employmentType && (!record || ['draft', 'returned'].includes(record.status));
  const totals = attendanceTotals(record?.days || {});
  const pendingRequestCount = Object.values(record?.changeRequests || {}).filter(
    item => item.status === 'pending'
  ).length;
  const gridDays = monthCalendar(month);
  const matchesName = (name: string) => name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'));
  const approvals = useDataTablePagination(
    workspace.months.filter(item => (!status || item.status === status) && matchesName(item.employeeName))
  );
  const requestRows = workspace.months
    .flatMap(item => Object.values(item.changeRequests || {}).map(request => ({ record: item, request })))
    .filter(item => (!status || item.request.status === status) && matchesName(item.record.employeeName))
    .sort((a, b) => b.request.createdAt.localeCompare(a.request.createdAt));
  const requestsPage = useDataTablePagination(requestRows);
  const employeesPage = useDataTablePagination(
    workspace.employees.filter(item => item.active && matchesName(item.displayName))
  );
  const refresh = () => {
    setLoading(true);
    setReload(value => value + 1);
  };
  const safeSwitch = (next: () => void) => {
    if (busy || editingDate || returning || reviewingChange) return;
    if (dirtySettings && !window.confirm('Bỏ các thiết lập chấm công chưa lưu?')) return;
    setChanges({});
    setSearch('');
    next();
  };
  const selectMonth = (value: string) => {
    if (!/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value) || value === month) return;
    safeSwitch(() => {
      const cached = monthCache.current.get(value);
      if (cached) {
        setWorkspace(cached);
        setLoadedMonth(value);
      }
      setMonth(value);
      setLoading(true);
      setError('');
    });
  };
  const shiftMonth = (offset: number) => {
    const [year, m] = month.split('-').map(Number);
    selectMonth(new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7));
  };
  const perform = async (operation: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await operation();
    } catch (cause) {
      showErrorToast(errorText(cause));
      throw cause;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const mutate = async (action: string, target: AttendanceMonth | undefined, extra: Record<string, unknown> = {}) => {
    const next = await mutateAttendance({
      action,
      userId: target?.userId || selectedUser,
      month,
      expectedRevision: target?.revision || 0,
      requestId: crypto.randomUUID(),
      ...extra
    });
    setWorkspace(previous => ({ ...previous, months: [...previous.months.filter(item => item.id !== next.id), next] }));
  };
  const saveDay = (day: AttendanceDay) =>
    perform(async () => {
      await mutate('save_day', record, { date: editingDate, employmentType, day });
      setEditingDate('');
      showSuccessToast('Đã lưu chấm công.');
    });
  const requestChange = (kind: 'edit' | 'delete', day: AttendanceDay | null, reason: string) =>
    perform(async () => {
      await mutate('request_change', record, { date: editingDate, kind, reason, ...(day ? { day } : {}) });
      setEditingDate('');
      showSuccessToast('Đã gửi yêu cầu chờ duyệt.');
    });
  const submitMonth = () =>
    perform(async () => {
      if (
        !(await confirmDelete(`Gửi bảng công tháng ${month} để duyệt?`, {
          title: 'Gửi duyệt chấm công',
          confirmLabel: 'Gửi duyệt'
        }))
      )
        return;
      await mutate('submit', record);
      showSuccessToast('Đã gửi duyệt chấm công.');
    });
  const approve = (target: AttendanceMonth) =>
    perform(async () => {
      if (
        !(await confirmDelete(`Duyệt bảng công tháng ${month} của ${target.employeeName}?`, {
          title: 'Duyệt chấm công',
          confirmLabel: 'Duyệt'
        }))
      )
        return;
      await mutate('approve', target);
      showSuccessToast('Đã duyệt chấm công.');
    });
  const reviewChange = (approved: boolean, reason: string) =>
    perform(async () => {
      if (!reviewingChange) return;
      await mutate(approved ? 'approve_change' : 'reject_change', reviewingChange.record, {
        changeId: reviewingChange.request.id,
        reason
      });
      setReviewingChange(null);
      showSuccessToast(approved ? 'Đã duyệt yêu cầu điều chỉnh.' : 'Đã từ chối yêu cầu.');
    });
  const editSetting = (userId: string, patch: Partial<AttendanceSetting>) => {
    const previous = changes[userId] || settingFor(userId);
    setChanges(value => ({
      ...value,
      [userId]: {
        userId,
        employmentType: previous?.employmentType || 'full_time',
        reviewerId: previous?.reviewerId || '',
        revision: previous?.revision || 0,
        ...patch
      }
    }));
  };
  const saveSettings = () =>
    perform(async () => {
      await saveAttendanceSettings(
        Object.values(changes).map(item => ({
          userId: item.userId,
          employmentType: item.employmentType,
          reviewerId: item.reviewerId,
          expectedRevision: item.revision
        }))
      );
      setChanges({});
      showSuccessToast('Đã lưu thiết lập chấm công.');
      refresh();
    });
  const canReview = (item: { reviewerId: string }) =>
    admin &&
    (!item.reviewerId ||
      item.reviewerId === currentUser.uid ||
      !workspace.employees.some(user => user.uid === item.reviewerId && user.active && user.role === 'admin'));
  const openDay = (date: string) => {
    if (!employmentType) {
      showErrorToast('Chưa thiết lập hình thức làm việc. Liên hệ Admin.');
      return;
    }
    setEditingDate(date);
  };
  const dateRequests = Object.values(record?.changeRequests || {}).filter(item => item.date === editingDate);
  const lastRequest =
    pendingDayChange(record, editingDate) || dateRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

  return (
    <section className="attendance-page" aria-busy={loading || busy}>
      <PageContextHeader section="Chấm công" current={TABS.find(item => item.id === tab)?.label} />
      <nav className="content-tabs" aria-label="Phân hệ Chấm công">
        {TABS.map(item => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? 'active' : ''}
            aria-current={tab === item.id ? 'page' : undefined}
            disabled={busy || (item.id !== 'attendance' && !admin)}
            title={item.id !== 'attendance' && !admin ? 'Chỉ Admin được duyệt và thiết lập chấm công' : undefined}
            onClick={() => safeSwitch(() => setTab(item.id))}
          >
            {item.label}
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
      {tab !== 'settings' && (
        <div className="attendance-toolbar attendance-calendar-toolbar">
          {tab === 'attendance' && admin && (
            <select
              aria-label="Nhân viên"
              value={selectedUser}
              disabled={busy || loading}
              onChange={event => setSelectedUser(event.target.value)}
            >
              {workspace.employees.length ? (
                workspace.employees
                  .filter(item => item.active || workspace.months.some(month => month.userId === item.uid))
                  .map(item => (
                    <option key={item.uid} value={item.uid}>
                      {item.displayName}
                      {!item.active ? ' (đã khóa)' : ''}
                    </option>
                  ))
              ) : (
                <option value={currentUser.uid}>{currentUser.displayName}</option>
              )}
            </select>
          )}
          <div className="attendance-month-controls">
            <RefreshingIndicator active={loading && loadedMonth === month} />
            <IconButton
              label="Tháng trước"
              icon={<ChevronLeft />}
              disabled={busy || loading || month === '2000-01'}
              onClick={() => shiftMonth(-1)}
            />
            <input
              aria-label="Tháng chấm công"
              type="month"
              min="2000-01"
              max="2099-12"
              value={month}
              onChange={event => selectMonth(event.target.value)}
              disabled={busy || loading}
            />
            <IconButton
              label="Tháng sau"
              icon={<ChevronRight />}
              disabled={busy || loading || month === '2099-12'}
              onClick={() => shiftMonth(1)}
            />
            <button
              type="button"
              className="btn btn-outline"
              disabled={busy || loading || month === today.slice(0, 7)}
              onClick={() => selectMonth(today.slice(0, 7))}
            >
              Tháng này
            </button>
          </div>
          <IconButton label="Tải lại" icon={<RefreshCw />} onClick={refresh} disabled={loading || busy} />
          {tab === 'attendance' &&
            ownCalendar &&
            totals.days > 0 &&
            (!record || ['draft', 'returned'].includes(record.status)) && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || busy || !!error || (!!record && hasPendingChanges(record))}
                onClick={() => void submitMonth().catch(() => {})}
              >
                Gửi duyệt
              </button>
            )}
        </div>
      )}
      {loading && loadedMonth !== month ? (
        <TableSkeleton label="Đang tải chấm công" columns={7} rows={5} />
      ) : !error && tab === 'attendance' ? (
        <>
          <dl className="attendance-summary" aria-label={`Tổng hợp chấm công tháng ${month}`}>
            <div>
              <dt>Trạng thái tháng</dt>
              <dd>
                <span className={`attendance-status attendance-status--${record?.status || 'draft'}`}>
                  {record ? ATTENDANCE_STATUS_LABELS[record.status] : 'Chưa ghi nhận'}
                </span>
              </dd>
            </div>
            {employmentType === 'part_time' ? (
              <div>
                <dt>Giờ làm</dt>
                <dd>
                  {number(totals.hours)} <small>giờ</small>
                </dd>
              </div>
            ) : (
              <div>
                <dt>Ngày công</dt>
                <dd>
                  {totals.days} <small>ngày</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Đi trễ</dt>
              <dd>
                {totals.lateMinutes} <small>phút</small>
              </dd>
            </div>
            {employmentType !== 'part_time' && (
              <div>
                <dt>Làm thêm (OT)</dt>
                <dd>
                  {number(totals.overtimeHours)} <small>giờ</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Yêu cầu chờ duyệt</dt>
              <dd className={pendingRequestCount > 0 ? 'is-warning' : undefined}>{pendingRequestCount}</dd>
            </div>
          </dl>
          <div className="attendance-calendar-scroll">
            <div className="attendance-calendar" style={{ '--attendance-weeks': gridDays.length / 7 } as CSSProperties}>
              {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'].map(label => (
                <div key={label} className="attendance-weekday">
                  {label}
                </div>
              ))}
              {gridDays.map((date, index) => {
                const inMonth = date.startsWith(month),
                  day = inMonth ? record?.days[date] : undefined;
                const pending = pendingDayChange(record, date);
                const disabled =
                  !inMonth ||
                  date > today ||
                  busy ||
                  loading ||
                  (!day && (!ownCalendar || (!!employmentType && !canCreate)));
                return (
                  <button
                    key={date}
                    type="button"
                    className={`attendance-calendar-day${!inMonth ? ' is-outside' : ''}${index % 7 >= 5 ? ' is-weekend' : ''}${index % 7 === 6 ? ' is-sunday' : ''}${date === today ? ' is-today' : ''}`}
                    disabled={disabled}
                    aria-label={`${dayLabel(date)}: ${day && employmentType ? formatAttendanceDay(day, employmentType) : 'Chưa ghi nhận'}${pending ? ' · Chờ duyệt yêu cầu' : ''}`}
                    onClick={() => openDay(date)}
                  >
                    <span className="attendance-date">{Number(date.slice(-2))}</span>
                    {day && employmentType && (
                      <span className="attendance-day-status">
                        <span className="attendance-chip attendance-chip--work">
                          {employmentType === 'full_time' ? 'Đi làm' : `${number(day.hours)}h`}
                        </span>
                        {day.lateMinutes > 0 && (
                          <span className="attendance-chip attendance-chip--late">Trễ {day.lateMinutes}p</span>
                        )}
                        {day.overtimeHours > 0 && (
                          <span className="attendance-chip attendance-chip--ot">OT {number(day.overtimeHours)}h</span>
                        )}
                      </span>
                    )}
                    {pending && (
                      <span className="attendance-chip attendance-chip--pending">
                        Chờ duyệt {pending.kind === 'delete' ? 'xóa' : 'sửa'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="attendance-legend" aria-label="Chú thích">
            <span className="attendance-legend__item attendance-legend__item--work">Đi làm</span>
            <span className="attendance-legend__item attendance-legend__item--late">Đi trễ</span>
            <span className="attendance-legend__item attendance-legend__item--ot">Làm thêm (OT)</span>
            <span className="attendance-legend__item attendance-legend__item--pending">Chờ duyệt sửa / xóa</span>
            <span className="attendance-legend__hint">
              Bấm ô trống để chấm công, ô đã chấm để xem hoặc gửi yêu cầu sửa.
            </span>
          </div>
        </>
      ) : !error && tab === 'approval' && admin ? (
        <div className="attendance-surface">
          <div className="attendance-toolbar">
            <select
              aria-label="Nội dung duyệt"
              value={approvalKind}
              onChange={event => {
                setApprovalKind(event.target.value as 'changes' | 'months');
                setStatus('pending');
              }}
            >
              <option value="changes">Yêu cầu sửa / xóa</option>
              <option value="months">Bảng công tháng</option>
            </select>
            <input
              aria-label="Tìm nhân viên"
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                approvals.paginationProps.setPage(1);
                requestsPage.paginationProps.setPage(1);
              }}
              placeholder="Tìm nhân viên..."
            />
            <select
              aria-label="Trạng thái"
              value={status}
              onChange={event => {
                setStatus(event.target.value);
                approvals.paginationProps.setPage(1);
                requestsPage.paginationProps.setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(approvalKind === 'changes' ? CHANGE_STATUS_LABELS : ATTENDANCE_STATUS_LABELS).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>
          {approvalKind === 'changes' ? (
            <>
              <div className="attendance-table-scroll">
                <table className="attendance-change-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Ngày</th>
                      <th>Yêu cầu</th>
                      <th>Công gốc</th>
                      <th>Đề nghị</th>
                      <th>Lý do</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestsPage.rows.map(item => (
                      <tr key={item.record.id + item.request.id}>
                        <td title={item.record.employeeName}>{item.record.employeeName}</td>
                        <td>{dayLabel(item.request.date)}</td>
                        <td>{item.request.kind === 'delete' ? 'Xóa' : 'Sửa'}</td>
                        <td title={formatAttendanceDay(item.request.before, item.request.employmentType)}>
                          {formatAttendanceDay(item.request.before, item.request.employmentType)}
                        </td>
                        <td title={formatAttendanceDay(item.request.after, item.request.employmentType)}>
                          {item.request.kind === 'delete'
                            ? 'Xóa chấm công'
                            : formatAttendanceDay(item.request.after, item.request.employmentType)}
                        </td>
                        <td title={item.request.reason}>{item.request.reason}</td>
                        <td className={`attendance-status--${item.request.status}`}>
                          {CHANGE_STATUS_LABELS[item.request.status]}
                        </td>
                        <td>
                          <RowActionMenu
                            label={`Thao tác yêu cầu ${item.record.employeeName}`}
                            actions={[
                              {
                                label:
                                  item.request.status === 'pending' && canReview(item.request)
                                    ? 'Xem / duyệt yêu cầu'
                                    : 'Xem yêu cầu',
                                disabled: busy,
                                onSelect: () => setReviewingChange(item)
                              }
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                    {!requestsPage.rows.length && (
                      <tr>
                        <td colSpan={8}>Không có yêu cầu phù hợp.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <DataTablePagination {...requestsPage.paginationProps} />
            </>
          ) : (
            <>
              <div className="attendance-table-scroll">
                <table className="attendance-approval-table">
                  <thead>
                    <tr>
                      <th>Nhân viên</th>
                      <th>Hình thức</th>
                      <th className="attendance-number">Công / Giờ làm</th>
                      <th className="attendance-number">Phút trễ</th>
                      <th className="attendance-number">OT (giờ)</th>
                      <th>Ngày gửi</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.rows.map(item => {
                      const sum = attendanceTotals(item.days);
                      return (
                        <tr key={item.id}>
                          <td title={item.employeeName}>{item.employeeName}</td>
                          <td>{EMPLOYMENT_LABELS[item.employmentType]}</td>
                          <td className="attendance-number">
                            {item.employmentType === 'full_time' ? `${sum.days} công` : `${number(sum.hours)} giờ`}
                          </td>
                          <td className="attendance-number">{sum.lateMinutes}</td>
                          <td className="attendance-number">
                            {item.employmentType === 'full_time' ? number(sum.overtimeHours) : '—'}
                          </td>
                          <td>{item.submittedAt ? dayLabel(businessDate(new Date(item.submittedAt))) : '—'}</td>
                          <td className={`attendance-status--${item.status}`} title={item.returnReason}>
                            {ATTENDANCE_STATUS_LABELS[item.status]}
                          </td>
                          <td>
                            <RowActionMenu
                              label={`Thao tác bảng công ${item.employeeName}`}
                              actions={[
                                {
                                  label: 'Xem lịch công',
                                  disabled: busy,
                                  onSelect: () => {
                                    setSelectedUser(item.userId);
                                    setTab('attendance');
                                  }
                                },
                                {
                                  label: 'Duyệt',
                                  disabled:
                                    busy || !canReview(item) || item.status !== 'pending' || hasPendingChanges(item),
                                  onSelect: () => void approve(item).catch(() => {})
                                },
                                {
                                  label: 'Trả về bảng công',
                                  disabled: busy || !canReview(item) || !['pending', 'approved'].includes(item.status),
                                  onSelect: () => setReturning(item)
                                }
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {!approvals.rows.length && (
                      <tr>
                        <td colSpan={8}>Không có bảng công phù hợp.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <DataTablePagination {...approvals.paginationProps} />
            </>
          )}
        </div>
      ) : !error && tab === 'settings' && admin ? (
        <div className="attendance-surface">
          <div className="attendance-toolbar">
            <input
              aria-label="Tìm nhân viên"
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                employeesPage.paginationProps.setPage(1);
              }}
              placeholder="Tìm nhân viên..."
            />
            <div className="attendance-header-actions">
              <IconButton label="Tải lại" icon={<RefreshCw />} disabled={busy} onClick={() => safeSwitch(refresh)} />
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !dirtySettings}
                onClick={() => void saveSettings().catch(() => {})}
              >
                {busy ? 'Đang lưu...' : 'Lưu thiết lập'}
              </button>
            </div>
          </div>
          <div className="attendance-table-scroll">
            <table className="attendance-settings-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Bộ phận / vai trò</th>
                  <th>Hình thức làm việc</th>
                  <th>Người duyệt (Admin)</th>
                </tr>
              </thead>
              <tbody>
                {employeesPage.rows.map(item => {
                  const setting = changes[item.uid] || settingFor(item.uid);
                  return (
                    <tr key={item.uid}>
                      <td title={item.displayName}>{item.displayName}</td>
                      <td>{roleLabels[item.role] || item.role}</td>
                      <td>
                        <select
                          aria-label={`Hình thức làm việc của ${item.displayName}`}
                          value={setting?.employmentType || ''}
                          onChange={event =>
                            editSetting(item.uid, { employmentType: event.target.value as EmploymentType })
                          }
                          disabled={busy}
                        >
                          <option value="" disabled>
                            Chưa thiết lập
                          </option>
                          <option value="full_time">Full-time</option>
                          <option value="part_time">Part-time</option>
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Người duyệt của ${item.displayName}`}
                          value={setting?.reviewerId || ''}
                          onChange={event => editSetting(item.uid, { reviewerId: event.target.value })}
                          disabled={busy || !setting?.employmentType}
                        >
                          <option value="">Các Admin</option>
                          {workspace.employees
                            .filter(person => person.active && person.role === 'admin')
                            .map(person => (
                              <option key={person.uid} value={person.uid}>
                                {person.displayName}
                              </option>
                            ))}
                          {setting?.reviewerId &&
                            !workspace.employees.some(
                              person => person.uid === setting.reviewerId && person.active && person.role === 'admin'
                            ) && <option value={setting.reviewerId}>Người duyệt không còn hoạt động</option>}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {!employeesPage.rows.length && (
                  <tr>
                    <td colSpan={4}>Không có nhân viên phù hợp.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...employeesPage.paginationProps} />
        </div>
      ) : null}
      {editingDate && employmentType && (
        <AttendanceDayDialog
          date={editingDate}
          employeeName={employee?.displayName || currentUser.displayName}
          employmentType={employmentType}
          day={record?.days[editingDate]}
          lastRequest={lastRequest}
          readOnly={!ownCalendar}
          onClose={() => setEditingDate('')}
          onSave={saveDay}
          onRequest={requestChange}
        />
      )}
      {returning && (
        <AttendanceReturnDialog
          employeeName={returning.employeeName}
          onClose={() => setReturning(null)}
          onReturn={reason =>
            perform(async () => {
              await mutate('return', returning, { reason });
              setReturning(null);
              showSuccessToast('Đã trả về bảng công.');
            })
          }
        />
      )}
      {reviewingChange && (
        <AttendanceChangeReviewDialog
          employeeName={reviewingChange.record.employeeName}
          request={reviewingChange.request}
          canReview={canReview(reviewingChange.request)}
          onClose={() => setReviewingChange(null)}
          onReview={reviewChange}
        />
      )}
    </section>
  );
}
