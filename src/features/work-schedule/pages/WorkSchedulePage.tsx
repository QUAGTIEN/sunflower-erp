import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { WORK_SCHEDULE_DEPARTMENT_LABELS, WORK_SCHEDULE_REFERENCE_LABELS, WORK_SCHEDULE_STATUS_LABELS, formatScheduleDate, formatScheduleTime, getWeekStart, isScheduleOnDate, normalizeWorkScheduleRecords, overlapsSchedule, parseDateKey, toDateKey, type WorkScheduleRecord, type WorkScheduleReferenceType, type WorkScheduleStatus } from '@/features/work-schedule/model/workScheduleModels';
import './WorkSchedule.css';

interface WorkScheduleProps {
  currentUser: UserProfile;
  users: UserProfile[];
}

interface ScheduleFormState {
  title: string;
  assigneeId: string;
  date: string;
  startTime: string;
  endTime: string;
  referenceType: WorkScheduleReferenceType;
  referenceId: string;
  referenceLabel: string;
  description: string;
  progress: string;
  status: WorkScheduleStatus;
  notes: string;
}

const todayKey = toDateKey(new Date());

const defaultForm = (assigneeId = ''): ScheduleFormState => ({
  title: '',
  assigneeId,
  date: todayKey,
  startTime: '08:00',
  endTime: '09:00',
  referenceType: 'none',
  referenceId: '',
  referenceLabel: '',
  description: '',
  progress: '0',
  status: 'not_started',
  notes: ''
});

const roleDepartment = (role: UserProfile['role']): string => WORK_SCHEDULE_DEPARTMENT_LABELS[role] || role;

const formatDateTimeInput = (date: string, time: string): string => {
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
};

const getDayLabel = (date: Date): string => date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });

export const WorkSchedule: React.FC<WorkScheduleProps> = ({ currentUser, users }) => {
  const isAdmin = currentUser.role === 'admin';
  const [items, setItems] = useState<WorkScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'today' | 'week'>('today');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date()));
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleRecord | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() => defaultForm());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictMessage, setConflictMessage] = useState('');
  const [referenceTime, setReferenceTime] = useState(() => Date.now());

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = isAdmin
        ? await dbService.getCollection('work_schedule_items')
        : await dbService.getCollectionByField('work_schedule_items', 'assigneeId', currentUser.uid, {
            orderByField: 'startAt',
            direction: 'asc',
            maxResults: 500
          });
      setItems(normalizeWorkScheduleRecords(data).filter(item => !item.deleted));
    } catch (error) {
      console.error('[WorkSchedule] Could not load schedules.', error);
      setErrorMessage('Không thể tải lịch làm việc. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.uid, isAdmin]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadItems(); }, [loadItems]);

  useEffect(() => {
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleUsers = useMemo(() => users
    .filter(user => user.active !== false)
    .filter(user => isAdmin || user.uid === currentUser.uid)
    .filter(user => departmentFilter === 'all' || user.role === departmentFilter)
    .filter(user => !searchTerm.trim() || user.displayName.toLocaleLowerCase('vi-VN').includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))),
  [currentUser.uid, departmentFilter, isAdmin, searchTerm, users]);

  const selectedDay = parseDateKey(selectedDate);
  const dayItems = useMemo(() => items.filter(item => isScheduleOnDate(item, selectedDay)), [items, selectedDay]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekAnchor);
    date.setDate(date.getDate() + index);
    return date;
  }), [weekAnchor]);

  const getScheduleForUser = (userId: string, dateItems: WorkScheduleRecord[] = dayItems): WorkScheduleRecord | null => {
    const now = referenceTime;
    return dateItems
      .filter(item => item.assigneeId === userId)
      .sort((left, right) => {
        const leftStart = new Date(left.startAt).getTime();
        const rightStart = new Date(right.startAt).getTime();
        const leftActive = leftStart <= now && new Date(left.endAt).getTime() > now && left.status !== 'completed';
        const rightActive = rightStart <= now && new Date(right.endAt).getTime() > now && right.status !== 'completed';
        return Number(rightActive) - Number(leftActive) || leftStart - rightStart;
      })[0] || null;
  };

  const filteredUsers = visibleUsers.filter(user => {
    if (!onlyAvailable) return true;
    return !getScheduleForUser(user.uid);
  });

  const activeSchedule = (userId: string): WorkScheduleRecord | null => {
    const now = referenceTime;
    return items.find(item => item.assigneeId === userId
      && item.status !== 'completed'
      && new Date(item.startAt).getTime() <= now
      && new Date(item.endAt).getTime() > now) || null;
  };

  const openCreateForm = (assigneeId = '') => {
    setEditingItem(null);
    setConflictMessage('');
    setForm(defaultForm(assigneeId));
    setIsFormOpen(true);
  };

  const openEditForm = (item: WorkScheduleRecord) => {
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    setEditingItem(item);
    setConflictMessage('');
    setForm({
      title: item.title,
      assigneeId: item.assigneeId,
      date: toDateKey(start),
      startTime: start.toTimeString().slice(0, 5),
      endTime: end.toTimeString().slice(0, 5),
      referenceType: item.referenceType,
      referenceId: item.referenceId,
      referenceLabel: item.referenceLabel,
      description: item.description,
      progress: String(item.progress),
      status: item.status,
      notes: item.notes
    });
    setIsFormOpen(true);
  };

  const notifyAssignee = async (item: WorkScheduleRecord, event: 'assigned' | 'updated' | 'cancelled') => {
    if (item.assigneeId === currentUser.uid && event === 'assigned') return;
    const labels = { assigned: 'Bạn được giao công việc', updated: 'Lịch làm việc được cập nhật', cancelled: 'Lịch làm việc đã được hủy' };
    await dbService.addDocument('notifications', {
      id: `schedule-${item.id}-${event}-${Date.now()}`,
      schemaVersion: 1,
      recipientId: item.assigneeId,
      module: 'system',
      eventType: `work_schedule_${event}`,
      eventKey: `work_schedule:${item.id}:${event}:${Date.now()}`,
      entityId: item.id,
      entityCode: item.title,
      title: labels[event],
      message: `${item.title} · ${formatScheduleDate(item.startAt)} ${formatScheduleTime(item.startAt)}–${formatScheduleTime(item.endAt)}`,
      createdAt: new Date().toISOString(),
      createdById: currentUser.uid,
      source: 'manual',
      readAt: null
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setConflictMessage('');
    const assignee = users.find(user => user.uid === form.assigneeId);
    const startAt = formatDateTimeInput(form.date, form.startTime);
    const endAt = formatDateTimeInput(form.date, form.endTime);
    if (!form.title.trim() || !assignee || !startAt || !endAt || new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setConflictMessage('Vui lòng nhập đủ thông tin và bảo đảm giờ kết thúc sau giờ bắt đầu.');
      return;
    }
    const candidate = { assigneeId: form.assigneeId, startAt, endAt };
    const conflict = items.find(item => item.id !== editingItem?.id && overlapsSchedule(candidate, item));
    if (conflict) {
      setConflictMessage(`Lịch bị trùng với “${conflict.title}” (${formatScheduleDate(conflict.startAt)} ${formatScheduleTime(conflict.startAt)}–${formatScheduleTime(conflict.endAt)}).`);
      return;
    }

    const now = new Date().toISOString();
    const progress = Number(form.progress) || 0;
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      assigneeId: assignee.uid,
      assigneeName: assignee.displayName,
      department: roleDepartment(assignee.role),
      assignedById: editingItem?.assignedById || currentUser.uid,
      assignedByName: editingItem?.assignedByName || currentUser.displayName,
      startAt,
      endAt,
      status: form.status,
      progress,
      referenceType: form.referenceType,
      referenceId: form.referenceId.trim(),
      referenceLabel: form.referenceLabel.trim(),
      notes: form.notes.trim(),
      updatedAt: now,
      completedAt: form.status === 'completed' ? (editingItem?.completedAt || now) : undefined,
      deleted: false
    };

    try {
      const saved = editingItem
        ? await dbService.updateDocument('work_schedule_items', editingItem.id, payload).then(() => ({ ...editingItem, ...payload }))
        : await dbService.addDocument('work_schedule_items', { id: `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...payload, createdAt: now });
      const normalized = normalizeWorkScheduleRecords([saved])[0];
      setItems(previous => editingItem
        ? previous.map(item => item.id === editingItem.id ? normalized : item)
        : [...previous, normalized]);
      await notifyAssignee(normalized, editingItem ? 'updated' : 'assigned');
      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'system',
        action: editingItem ? 'work_schedule_updated' : 'work_schedule_created',
        summary: `${editingItem ? 'Cập nhật' : 'Tạo'} lịch làm việc “${normalized.title}” cho ${normalized.assigneeName}`,
        targetType: 'work_schedule',
        targetId: normalized.id,
        targetLabel: normalized.title,
        pageId: 'work_schedule'
      });
      setIsFormOpen(false);
    } catch (error) {
      console.error('[WorkSchedule] Could not save schedule.', error);
      setConflictMessage('Không thể lưu lịch làm việc. Vui lòng thử lại.');
    }
  };

  const updateOwnSchedule = async (item: WorkScheduleRecord, fields: Pick<WorkScheduleRecord, 'status' | 'progress'>) => {
    try {
      const completedAt = fields.status === 'completed' ? new Date().toISOString() : undefined;
      await dbService.updateDocument('work_schedule_items', item.id, { ...fields, completedAt });
      setItems(previous => previous.map(current => current.id === item.id ? { ...current, ...fields, completedAt } : current));
      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'system',
        action: 'work_schedule_progress_updated',
        summary: `Cập nhật tiến độ “${item.title}”`,
        targetType: 'work_schedule',
        targetId: item.id,
        targetLabel: item.title,
        pageId: 'work_schedule'
      });
    } catch (error) {
      console.error('[WorkSchedule] Could not update schedule.', error);
    }
  };

  const cancelSchedule = async (item: WorkScheduleRecord) => {
    if (!window.confirm(`Hủy lịch “${item.title}”?`)) return;
    try {
      await dbService.updateDocument('work_schedule_items', item.id, { deleted: true, deletedAt: new Date().toISOString() });
      setItems(previous => previous.filter(current => current.id !== item.id));
      await notifyAssignee(item, 'cancelled');
      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'system',
        action: 'work_schedule_cancelled',
        summary: `Hủy lịch làm việc “${item.title}”`,
        targetType: 'work_schedule',
        targetId: item.id,
        targetLabel: item.title,
        pageId: 'work_schedule'
      });
    } catch (error) {
      console.error('[WorkSchedule] Could not cancel schedule.', error);
    }
  };

  const renderStatus = (item: WorkScheduleRecord | null) => {
    if (!item) return <span className="work-schedule-muted">Đang rảnh</span>;
    const canUpdate = item.assigneeId === currentUser.uid && !isAdmin;
    if (canUpdate) {
      return (
        <div className="work-schedule-inline-controls">
          <select value={item.status} onChange={event => void updateOwnSchedule(item, { status: event.target.value as WorkScheduleStatus, progress: item.progress })} aria-label="Trạng thái công việc">
            {Object.entries(WORK_SCHEDULE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input type="number" min="0" max="100" value={item.progress} onChange={event => void updateOwnSchedule(item, { status: item.status, progress: Number(event.target.value) })} aria-label="Tiến độ phần trăm" />
          <span>%</span>
        </div>
      );
    }
    return <span>{WORK_SCHEDULE_STATUS_LABELS[item.status]}{item.status !== 'completed' ? ` · ${item.progress}%` : ''}</span>;
  };

  return (
    <div className="work-schedule-page">
      <header className="page-header work-schedule-header">
        <div><h1 className="page-title">Lịch làm việc</h1></div>
        {isAdmin && <button type="button" className="btn btn-primary work-schedule-add" onClick={() => openCreateForm()}>Giao việc</button>}
      </header>

      <section className="work-schedule-card">
        <div className="work-schedule-tabs content-tabs" role="tablist" aria-label="Chế độ xem lịch làm việc">
          <button type="button" role="tab" aria-selected={activeTab === 'today'} className={activeTab === 'today' ? 'is-active' : ''} onClick={() => setActiveTab('today')}>Hôm nay</button>
          <button type="button" role="tab" aria-selected={activeTab === 'week'} className={activeTab === 'week' ? 'is-active' : ''} onClick={() => setActiveTab('week')}>Lịch tuần</button>
        </div>
        <div className="work-schedule-toolbar">
          {activeTab === 'today' ? <input type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} aria-label="Ngày xem lịch" /> : <div className="work-schedule-week-nav"><button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 7))} aria-label="Tuần trước"><ChevronLeft size={16} /></button><span>{getDayLabel(weekDates[0])} – {getDayLabel(weekDates[6])}</span><button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7))} aria-label="Tuần sau"><ChevronRight size={16} /></button></div>}
          <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} aria-label="Lọc bộ phận"><option value="all">Tất cả bộ phận</option>{Object.entries(WORK_SCHEDULE_DEPARTMENT_LABELS).filter(([role]) => role !== 'admin').map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select>
          <label className="work-schedule-search"><Search size={15} /><input placeholder="Tìm nhân viên..." value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label>
          {activeTab === 'today' && <label className="work-schedule-check"><input type="checkbox" checked={onlyAvailable} onChange={event => setOnlyAvailable(event.target.checked)} /> Chỉ người rảnh</label>}
          <button type="button" className="btn btn-outline" onClick={() => { setSelectedDate(todayKey); setWeekAnchor(getWeekStart(new Date())); }}>Hôm nay</button>
        </div>

        {errorMessage && <div className="work-schedule-message">{errorMessage}</div>}
        {isLoading ? <div className="work-schedule-empty">Đang tải lịch làm việc...</div> : activeTab === 'today' ? (
          <div className="work-schedule-table-wrap">
            <table className="work-schedule-table"><thead><tr><th>Nhân viên</th><th>Bộ phận</th><th>Đang thực hiện</th><th>Công việc liên quan</th><th>Thời gian</th><th>Tiến độ</th><th>Thao tác</th></tr></thead><tbody>
              {filteredUsers.map(user => {
                const item = getScheduleForUser(user.uid);
                const current = selectedDate === todayKey ? activeSchedule(user.uid) : null;
                return <tr key={user.uid}>
                  <td><strong>{user.displayName}</strong></td><td>{roleDepartment(user.role)}</td>
                  <td>{current ? current.title : item ? (new Date(item.startAt).getTime() > referenceTime ? 'Có lịch sắp tới' : item.title) : <span className="work-schedule-muted">—</span>}</td>
                  <td>{item?.referenceLabel || '—'}</td>
                  <td>{item ? `${formatScheduleTime(item.startAt)}–${formatScheduleTime(item.endAt)}` : '—'}</td>
                  <td>{renderStatus(item)}</td>
                  <td className="work-schedule-actions">{isAdmin && item && <button type="button" className="btn btn-sm btn-outline" onClick={() => openEditForm(item)}>Sửa</button>}{isAdmin && <button type="button" className="btn btn-sm btn-outline" onClick={() => openCreateForm(user.uid)}>Giao việc</button>}{isAdmin && item && <button type="button" className="btn btn-sm btn-outline" onClick={() => void cancelSchedule(item)}>Hủy</button>}</td>
                </tr>;
              })}
              {filteredUsers.length === 0 && <tr><td colSpan={7} className="work-schedule-empty">Không có nhân viên phù hợp.</td></tr>}
            </tbody></table>
          </div>
        ) : (
          <div className="work-schedule-table-wrap"><table className="work-schedule-table work-schedule-week-table"><thead><tr><th>Nhân viên</th>{weekDates.map(date => <th key={toDateKey(date)}>{getDayLabel(date)}</th>)}</tr></thead><tbody>{visibleUsers.map(user => <tr key={user.uid}><td><strong>{user.displayName}</strong><small>{roleDepartment(user.role)}</small></td>{weekDates.map(date => { const schedule = items.filter(item => item.assigneeId === user.uid && isScheduleOnDate(item, date)).sort((left, right) => left.startAt.localeCompare(right.startAt))[0]; return <td key={`${user.uid}-${toDateKey(date)}`}><span title={schedule?.title}>{schedule ? `${formatScheduleTime(schedule.startAt)} ${schedule.title}` : 'Trống'}</span></td>; })}</tr>)}{visibleUsers.length === 0 && <tr><td colSpan={8} className="work-schedule-empty">Không có nhân viên phù hợp.</td></tr>}</tbody></table></div>
        )}
      </section>

      {isFormOpen && isAdmin && <div className="work-schedule-modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIsFormOpen(false); }}><form className="work-schedule-modal" onSubmit={handleSave}><header><div><strong>{editingItem ? 'Sửa lịch làm việc' : 'Giao việc'}</strong><span>Nhập thông tin ngắn gọn để theo dõi trong ngày.</span></div><button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => setIsFormOpen(false)} aria-label="Đóng"><X size={16} /></button></header><div className="work-schedule-form-grid"><label>Công việc *<input value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} autoFocus /></label><label>Nhân viên *<select value={form.assigneeId} onChange={event => setForm(previous => ({ ...previous, assigneeId: event.target.value }))}><option value="">Chọn nhân viên</option>{users.filter(user => user.active !== false).map(user => <option key={user.uid} value={user.uid}>{user.displayName} · {roleDepartment(user.role)}</option>)}</select></label><label>Ngày *<input type="date" value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))} /></label><label>Giờ bắt đầu *<input type="time" value={form.startTime} onChange={event => setForm(previous => ({ ...previous, startTime: event.target.value }))} /></label><label>Giờ kết thúc *<input type="time" value={form.endTime} onChange={event => setForm(previous => ({ ...previous, endTime: event.target.value }))} /></label><label>Loại liên kết<select value={form.referenceType} onChange={event => setForm(previous => ({ ...previous, referenceType: event.target.value as WorkScheduleReferenceType }))}>{Object.entries(WORK_SCHEDULE_REFERENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Mã liên kết<input value={form.referenceId} onChange={event => setForm(previous => ({ ...previous, referenceId: event.target.value }))} placeholder="ID khách hàng, PO..." /></label><label>Khách hàng/PO liên quan<input value={form.referenceLabel} onChange={event => setForm(previous => ({ ...previous, referenceLabel: event.target.value }))} placeholder="Ví dụ: Công ty ABC · PO-001" /></label><label className="work-schedule-form-wide">Trạng thái<select value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value as WorkScheduleStatus }))}>{Object.entries(WORK_SCHEDULE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Tiến độ (%)<input type="number" min="0" max="100" value={form.progress} onChange={event => setForm(previous => ({ ...previous, progress: event.target.value }))} /></label><label className="work-schedule-form-wide">Mô tả<textarea value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} rows={2} /></label><label className="work-schedule-form-wide">Ghi chú<textarea value={form.notes} onChange={event => setForm(previous => ({ ...previous, notes: event.target.value }))} rows={2} /></label></div>{conflictMessage && <div className="work-schedule-error">{conflictMessage}</div>}<footer><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary">Lưu lịch</button></footer></form></div>}
    </div>
  );
};
