import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import {
  WORK_SCHEDULE_DEPARTMENT_LABELS,
  WORK_SCHEDULE_STATUS_LABELS,
  formatScheduleTime,
  getWeekStart,
  isScheduleOnDate,
  normalizeWorkScheduleRecords,
  parseDateKey,
  toDateKey,
  type WorkScheduleRecord,
  type WorkScheduleReferenceType,
  type WorkScheduleStatus
} from '@/features/work-schedule/model/workScheduleModels';
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
  stage: string;
  referenceType: WorkScheduleReferenceType;
  referenceId: string;
  referenceLabel: string;
  description: string;
  progress: string;
  status: WorkScheduleStatus;
  notes: string;
}

const todayKey = toDateKey(new Date());
const EDITABLE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'completed'];

const defaultForm = (assigneeId = '', date = todayKey): ScheduleFormState => ({
  title: '', assigneeId, date, startTime: '08:00', endTime: '09:00', stage: '',
  referenceType: 'none', referenceId: '', referenceLabel: '', description: '',
  progress: '0', status: 'not_started', notes: ''
});

const roleDepartment = (role: UserProfile['role']): string => WORK_SCHEDULE_DEPARTMENT_LABELS[role] || role;
const formatDateTimeInput = (date: string, time: string): string => {
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
};
const getDayLabel = (date: Date): string => date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const getSelectedDateLabel = (date: Date): string => date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
const getMonthLabel = (date: Date): string => date.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
const getCalendarDates = (monthAnchor: Date): Date[] => {
  const firstDay = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1);
  const gridStart = getWeekStart(firstDay);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + index);
    return date;
  });
};

export const WorkSchedule: React.FC<WorkScheduleProps> = ({ currentUser, users }) => {
  const isAdmin = currentUser.role === 'admin';
  const [items, setItems] = useState<WorkScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'week'>('tasks');
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [monthAnchor, setMonthAnchor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date()));
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleRecord | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() => defaultForm(currentUser.uid));
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictMessage, setConflictMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [noteEditingId, setNoteEditingId] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingItemId, setSavingItemId] = useState('');

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = isAdmin
        ? await dbService.getCollection('work_schedule_items')
        : await dbService.getCollectionByField('work_schedule_items', 'assigneeId', currentUser.uid);
      setItems(normalizeWorkScheduleRecords(data).filter(item => !item.deleted));
    } catch (error) {
      console.error('[WorkSchedule] Could not load schedules.', error);
      setErrorMessage('Không thể tải lịch làm việc. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.uid, isAdmin]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const visibleUsers = useMemo(() => users
    .filter(user => user.active !== false)
    .filter(user => isAdmin || user.uid === currentUser.uid)
    .filter(user => departmentFilter === 'all' || user.role === departmentFilter)
    .filter(user => !searchTerm.trim() || user.displayName.toLocaleLowerCase('vi-VN').includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))),
  [currentUser.uid, departmentFilter, isAdmin, searchTerm, users]);
  const visibleUserIds = useMemo(() => new Set(visibleUsers.map(user => user.uid)), [visibleUsers]);
  const selectedDay = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const dayItems = useMemo(() => items
    .filter(item => visibleUserIds.has(item.assigneeId) && isScheduleOnDate(item, selectedDay))
    .sort((left, right) => left.startAt.localeCompare(right.startAt)), [items, selectedDay, visibleUserIds]);
  const calendarDates = useMemo(() => getCalendarDates(monthAnchor), [monthAnchor]);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekAnchor);
    date.setDate(date.getDate() + index);
    return date;
  }), [weekAnchor]);
  const openCreateForm = (assigneeId = isAdmin ? '' : currentUser.uid, date = selectedDate) => {
    setEditingItem(null);
    setConflictMessage('');
    setForm(defaultForm(assigneeId, date));
    setIsFormOpen(true);
  };

  const openEditForm = (item: WorkScheduleRecord) => {
    if (!isAdmin && item.assigneeId !== currentUser.uid) return;
    const start = new Date(item.startAt);
    const end = new Date(item.endAt);
    setEditingItem(item);
    setConflictMessage('');
    setForm({
      title: item.title, assigneeId: item.assigneeId, date: toDateKey(start),
      startTime: start.toTimeString().slice(0, 5), endTime: end.toTimeString().slice(0, 5),
      stage: item.stage, referenceType: item.referenceType, referenceId: item.referenceId,
      referenceLabel: item.referenceLabel, description: item.description, progress: String(item.progress),
      status: item.status, notes: item.notes
    });
    setIsFormOpen(true);
  };

  const notifyAssignee = async (item: WorkScheduleRecord, event: 'assigned' | 'updated' | 'cancelled') => {
    if (item.assigneeId === currentUser.uid) return;
    const labels = { assigned: 'Bạn được giao công việc', updated: 'Lịch làm việc được cập nhật', cancelled: 'Lịch làm việc đã được hủy' };
    await dbService.addDocument('notifications', {
      id: `schedule-${item.id}-${event}-${Date.now()}`, schemaVersion: 1,
      recipientId: item.assigneeId, module: 'system', eventType: `work_schedule_${event}`,
      eventKey: `work_schedule:${item.id}:${event}:${Date.now()}`, entityId: item.id,
      entityCode: item.title, title: labels[event],
      message: `${item.title} · ${formatScheduleTime(item.startAt)}–${formatScheduleTime(item.endAt)}`,
      createdAt: new Date().toISOString(), createdById: currentUser.uid, source: 'manual', readAt: null
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setConflictMessage('');
    setActionMessage('');
    const assigneeId = isAdmin ? form.assigneeId : currentUser.uid;
    const assignee = users.find(user => user.uid === assigneeId);
    const startAt = formatDateTimeInput(form.date, form.startTime);
    const endAt = formatDateTimeInput(form.date, form.endTime);
    if (!form.title.trim() || !assignee || !startAt || !endAt || new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setConflictMessage('Vui lòng nhập đủ thông tin và bảo đảm giờ kết thúc sau giờ bắt đầu.');
      return;
    }
    const now = new Date().toISOString();
    const progress = form.status === 'completed' ? 100 : Math.min(99, Math.max(0, Number(form.progress) || 0));
    const payload = {
      title: form.title.trim(), description: form.description.trim(), stage: form.stage.trim(),
      assigneeId: assignee.uid, assigneeName: assignee.displayName, department: roleDepartment(assignee.role),
      assignedById: editingItem?.assignedById || currentUser.uid,
      assignedByName: editingItem?.assignedByName || currentUser.displayName,
      startAt, endAt, status: form.status, progress, referenceType: form.referenceType,
      referenceId: form.referenceId.trim(), referenceLabel: form.referenceLabel.trim(), notes: form.notes.trim(),
      updatedAt: now, completedAt: form.status === 'completed' ? (editingItem?.completedAt || now) : null,
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
      void notifyAssignee(normalized, editingItem ? 'updated' : 'assigned')
        .catch(error => console.error('[WorkSchedule] Could not notify assignee.', error));
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'system', action: editingItem ? 'work_schedule_updated' : 'work_schedule_created',
        summary: `${editingItem ? 'Cập nhật' : 'Tạo'} công việc “${normalized.title}” cho ${normalized.assigneeName}`,
        targetType: 'work_schedule', targetId: normalized.id, targetLabel: normalized.title, pageId: 'work_schedule'
      });
      setSelectedDate(form.date);
      setMonthAnchor(new Date(Number(form.date.slice(0, 4)), Number(form.date.slice(5, 7)) - 1, 1));
      setActionMessage(editingItem ? 'Đã cập nhật công việc.' : 'Đã thêm công việc.');
      setIsFormOpen(false);
    } catch (error) {
      console.error('[WorkSchedule] Could not save schedule.', error);
      setConflictMessage('Không thể lưu công việc. Vui lòng thử lại.');
    }
  };

  const saveNote = async (item: WorkScheduleRecord) => {
    const now = new Date().toISOString();
    setSavingItemId(item.id);
    try {
      const notes = noteDraft.trim();
      await dbService.updateDocument('work_schedule_items', item.id, { notes, updatedAt: now });
      setItems(previous => previous.map(current => current.id === item.id
        ? { ...current, notes, updatedAt: now }
        : current));
      setNoteEditingId('');
      setActionMessage('Đã lưu note.');
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'system', action: 'work_schedule_note_updated',
        summary: `Cập nhật note cho công việc “${item.title}”`,
        targetType: 'work_schedule', targetId: item.id, targetLabel: item.title, pageId: 'work_schedule'
      });
    } catch (error) {
      console.error('[WorkSchedule] Could not save note.', error);
      setActionMessage('Không thể lưu note. Vui lòng thử lại.');
    } finally {
      setSavingItemId('');
    }
  };

  const deleteSchedule = async (item: WorkScheduleRecord) => {
    if (!window.confirm(`Xóa công việc “${item.title}”?`)) return;
    setSavingItemId(item.id);
    try {
      await dbService.updateDocument('work_schedule_items', item.id, { deleted: true, deletedAt: new Date().toISOString() });
      setItems(previous => previous.filter(current => current.id !== item.id));
      void notifyAssignee(item, 'cancelled')
        .catch(error => console.error('[WorkSchedule] Could not notify assignee.', error));
      setActionMessage('Đã xóa công việc.');
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'system', action: 'work_schedule_deleted', summary: `Xóa công việc “${item.title}”`,
        targetType: 'work_schedule', targetId: item.id, targetLabel: item.title, pageId: 'work_schedule'
      });
    } catch (error) {
      console.error('[WorkSchedule] Could not delete schedule.', error);
      setActionMessage('Không thể xóa công việc. Vui lòng thử lại.');
    } finally {
      setSavingItemId('');
    }
  };

  const selectCalendarDate = (date: Date) => {
    setSelectedDate(toDateKey(date));
    setCalendarOpen(false);
    if (date.getMonth() !== monthAnchor.getMonth() || date.getFullYear() !== monthAnchor.getFullYear()) {
      setMonthAnchor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  return (
    <div className="work-schedule-page">
      <PageContextHeader section="Lịch làm việc" current={activeTab === 'week' ? 'Lịch tuần' : 'Công việc'} />
      <div className="work-schedule-tabs content-tabs" role="tablist" aria-label="Chế độ xem lịch làm việc">
        <button type="button" role="tab" aria-selected={activeTab === 'tasks'} className={activeTab === 'tasks' ? 'is-active' : ''} onClick={() => setActiveTab('tasks')}>Công việc</button>
        <button type="button" role="tab" aria-selected={activeTab === 'week'} className={activeTab === 'week' ? 'is-active' : ''} onClick={() => setActiveTab('week')}>Lịch tuần</button>
      </div>

      <section className="work-schedule-card">
        <div className="work-schedule-toolbar">
          {isAdmin && <select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} aria-label="Lọc bộ phận"><option value="all">Tất cả bộ phận</option>{Object.entries(WORK_SCHEDULE_DEPARTMENT_LABELS).map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select>}
          {isAdmin && <label className="work-schedule-search"><span>Tìm</span><input placeholder="Tên nhân viên" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /></label>}
          <button type="button" className="btn btn-outline" onClick={() => { const today = new Date(); setSelectedDate(todayKey); setMonthAnchor(new Date(today.getFullYear(), today.getMonth(), 1)); setWeekAnchor(getWeekStart(today)); }}>Hôm nay</button>
          {activeTab === 'tasks' && <button type="button" className={`btn btn-outline work-schedule-calendar-toggle ${calendarOpen ? 'is-active' : ''}`} aria-label="Mở lịch" title="Mở lịch" aria-expanded={calendarOpen} onClick={() => setCalendarOpen(previous => !previous)}><CalendarDays size={17} /></button>}
          <button type="button" className="btn btn-primary work-schedule-add" onClick={() => openCreateForm()}>{isAdmin ? 'Giao việc' : 'Thêm công việc'}</button>
        </div>

        {errorMessage && <div className="work-schedule-message work-schedule-message--error">{errorMessage}</div>}
        {actionMessage && <div className="work-schedule-message" role="status">{actionMessage}</div>}
        {isLoading ? <div className="work-schedule-empty">Đang tải lịch làm việc...</div> : activeTab === 'tasks' ? (
          <div className="work-schedule-workspace">
              {calendarOpen && <aside className="work-schedule-calendar" aria-label="Chọn ngày làm việc">
                <header><button type="button" className="btn btn-outline btn-sm" onClick={() => setMonthAnchor(previous => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))}>Tháng trước</button><strong>{getMonthLabel(monthAnchor)}</strong><button type="button" className="btn btn-outline btn-sm" onClick={() => setMonthAnchor(previous => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))}>Tháng sau</button></header>
                <div className="work-schedule-calendar__weekdays"><span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span></div>
                <div className="work-schedule-calendar__grid">
                  {calendarDates.map(date => {
                    const dateKey = toDateKey(date);
                    const count = items.filter(item => visibleUserIds.has(item.assigneeId) && isScheduleOnDate(item, date)).length;
                    const outsideMonth = date.getMonth() !== monthAnchor.getMonth();
                    return <button key={dateKey} type="button" className={`${dateKey === selectedDate ? 'is-selected' : ''} ${dateKey === todayKey ? 'is-today' : ''} ${outsideMonth ? 'is-outside' : ''}`} aria-label={`${date.toLocaleDateString('vi-VN')}, ${count} công việc`} onClick={() => selectCalendarDate(date)}><span>{date.getDate()}</span>{count > 0 && <small>{count}</small>}</button>;
                  })}
                </div>
              </aside>}

              <main className="work-schedule-day-panel">
                <header><div><h2>{getSelectedDateLabel(selectedDay)}</h2><p>{dayItems.length} công việc · {dayItems.filter(item => item.status !== 'completed').length} chưa xử lý xong</p></div><button type="button" className="btn btn-primary" onClick={() => openCreateForm(isAdmin ? '' : currentUser.uid, selectedDate)}>{isAdmin ? 'Giao việc' : 'Thêm công việc'}</button></header>
                <div className="work-schedule-task-list">
                  {dayItems.map(item => (
                    <article key={item.id} className={`work-schedule-task ${item.status === 'completed' ? 'is-completed' : ''}`}>
                      <div className="work-schedule-task__time"><strong>{formatScheduleTime(item.startAt)}</strong><span>{formatScheduleTime(item.endAt)}</span></div>
                      <div className="work-schedule-task__body">
                        <div className="work-schedule-task__heading"><strong title={item.title}>{item.title}</strong><span className={`work-schedule-status work-schedule-status--${item.status}`}>{WORK_SCHEDULE_STATUS_LABELS[item.status]}</span></div>
                        <div className="work-schedule-task__meta"><span>{item.assigneeName}</span><span>{item.department}</span>{item.stage && <span>Công đoạn: {item.stage}</span>}</div>
                        {item.description && <p>{item.description}</p>}
                        {item.notes && noteEditingId !== item.id && <p className="work-schedule-task__note">Note: {item.notes}</p>}
                        {noteEditingId === item.id && <div className="work-schedule-note-editor"><textarea value={noteDraft} onChange={event => setNoteDraft(event.target.value)} rows={2} aria-label={`Note cho ${item.title}`} autoFocus /><button type="button" className="btn btn-primary btn-sm" disabled={savingItemId === item.id} onClick={() => void saveNote(item)}>{savingItemId === item.id ? 'Đang lưu...' : 'Lưu note'}</button><button type="button" className="btn btn-outline btn-sm" onClick={() => setNoteEditingId('')}>Hủy</button></div>}
                      </div>
                      <div className="work-schedule-task__actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setNoteEditingId(item.id); setNoteDraft(item.notes); }}>Note</button>
                        <button type="button" className="btn btn-danger btn-sm" disabled={savingItemId === item.id} onClick={() => void deleteSchedule(item)}>Xóa</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => openEditForm(item)}>Cập nhật</button>
                      </div>
                    </article>
                  ))}
                  {dayItems.length === 0 && <div className="work-schedule-empty">Chưa có công việc trong ngày này.</div>}
                </div>
              </main>
            </div>
        ) : (
          <div className="work-schedule-week-view">
            <div className="work-schedule-week-nav"><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 7))}>Tuần trước</button><strong>{getDayLabel(weekDates[0])} – {getDayLabel(weekDates[6])}</strong><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7))}>Tuần sau</button></div>
            <div className="work-schedule-table-wrap"><table className="work-schedule-table work-schedule-week-table"><thead><tr><th>Nhân viên</th>{weekDates.map(date => <th key={toDateKey(date)}>{getDayLabel(date)}</th>)}</tr></thead><tbody>{visibleUsers.map(user => <tr key={user.uid}><td><strong>{user.displayName}</strong><small>{roleDepartment(user.role)}</small></td>{weekDates.map(date => { const schedules = items.filter(item => item.assigneeId === user.uid && isScheduleOnDate(item, date)); return <td key={`${user.uid}-${toDateKey(date)}`}><button type="button" className="work-schedule-week-cell" onClick={() => { setSelectedDate(toDateKey(date)); setMonthAnchor(new Date(date.getFullYear(), date.getMonth(), 1)); setActiveTab('tasks'); }}><strong>{schedules.length}</strong><span>{schedules.length ? 'công việc' : 'Trống'}</span></button></td>; })}</tr>)}{visibleUsers.length === 0 && <tr><td colSpan={8} className="work-schedule-empty">Không có nhân viên phù hợp.</td></tr>}</tbody></table></div>
          </div>
        )}
      </section>

      {isFormOpen && (
        <div className="work-schedule-modal-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setIsFormOpen(false); }}>
          <form className="work-schedule-modal" onSubmit={handleSave}>
            <header><div><strong>{editingItem ? 'Cập nhật công việc' : isAdmin ? 'Giao việc' : 'Thêm công việc'}</strong><span>Lưu nội dung và trạng thái công việc.</span></div><button type="button" className="btn btn-outline btn-sm" onClick={() => setIsFormOpen(false)}>Đóng</button></header>
            <div className="work-schedule-form-grid">
              <label className="work-schedule-form-wide">Tên công việc *<input value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} autoFocus /></label>
              {isAdmin ? <label>Người phụ trách *<select value={form.assigneeId} onChange={event => setForm(previous => ({ ...previous, assigneeId: event.target.value }))}><option value="">Chọn nhân viên</option>{users.filter(user => user.active !== false).map(user => <option key={user.uid} value={user.uid}>{user.displayName} · {roleDepartment(user.role)}</option>)}</select></label> : <label>Người phụ trách<input value={currentUser.displayName} readOnly /></label>}
              <label>Ngày thực hiện *<input type="date" value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))} /></label>
              <label>Giờ bắt đầu *<input type="time" value={form.startTime} onChange={event => setForm(previous => ({ ...previous, startTime: event.target.value }))} /></label>
              <label>Giờ kết thúc *<input type="time" value={form.endTime} onChange={event => setForm(previous => ({ ...previous, endTime: event.target.value }))} /></label>
              <label className="work-schedule-form-wide">Công đoạn hiện tại<input value={form.stage} onChange={event => setForm(previous => ({ ...previous, stage: event.target.value }))} placeholder="Ví dụ: Đang duyệt báo giá" /></label>
              <label className="work-schedule-form-wide">Trạng thái<select value={form.status} onChange={event => { const status = event.target.value as WorkScheduleStatus; setForm(previous => ({ ...previous, status, progress: status === 'completed' ? '100' : status === 'in_progress' ? (previous.progress === '0' ? '50' : previous.progress) : '0' })); }}>{EDITABLE_STATUSES.map(status => <option key={status} value={status}>{WORK_SCHEDULE_STATUS_LABELS[status]}</option>)}</select></label>
              <label className="work-schedule-form-wide">Nội dung công việc<textarea value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} rows={2} /></label>
            </div>
            {conflictMessage && <div className="work-schedule-error">{conflictMessage}</div>}
            <footer><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary">Lưu</button></footer>
          </form>
        </div>
      )}
    </div>
  );
};
