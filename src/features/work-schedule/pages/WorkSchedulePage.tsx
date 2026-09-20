import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, Search } from 'lucide-react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import {
  WORK_SCHEDULE_DEPARTMENT_LABELS,
  WORK_SCHEDULE_PRIORITY_LABELS,
  WORK_SCHEDULE_REFERENCE_LABELS,
  WORK_SCHEDULE_STATUS_LABELS,
  getWeekStart,
  isScheduleOnDate,
  normalizeWorkScheduleRecords,
  toDateKey,
  type WorkSchedulePriority,
  type WorkScheduleRecord,
  type WorkScheduleReferenceType,
  type WorkScheduleStatus
} from '@/features/work-schedule/model/workScheduleModels';
import './WorkSchedule.css';

type CustomerEntity = { id: string; companyName?: string };
type SourceModule = 'customer_data' | 'leads' | 'crm';
type TaskFilter = 'all' | 'pending' | 'in_progress' | 'support' | 'overdue' | 'completed';
type PeriodFilter = 'this_month' | 'next_30_days' | 'all';

interface WorkScheduleProps {
  currentUser: UserProfile;
  users: UserProfile[];
  candidates?: CustomerEntity[];
  leads?: CustomerEntity[];
  customers?: CustomerEntity[];
  onOpenRecord?: (module: SourceModule, id: string) => void;
}

interface ScheduleFormState {
  title: string;
  assigneeId: string;
  dueAt: string;
  description: string;
  priority: WorkSchedulePriority;
  referenceType: WorkScheduleReferenceType;
  referenceId: string;
  referenceLabel: string;
  status: WorkScheduleStatus;
}

const PAGE_SIZE = 10;
const ACTIVE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'paused'];
const PAGE_REFERENCE_TIME = Date.now();
const EDITABLE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'completed', 'cancelled'];
const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const defaultDeadline = () => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(17, 0, 0, 0);
  return localDateTime(value);
};
const defaultForm = (assigneeId = ''): ScheduleFormState => ({
  title: '', assigneeId, dueAt: defaultDeadline(), description: '', priority: 'normal',
  referenceType: 'none', referenceId: '', referenceLabel: '', status: 'not_started'
});
const roleDepartment = (role: UserProfile['role']) => WORK_SCHEDULE_DEPARTMENT_LABELS[role] || role;
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
};
const relativeUpdateLabel = (value: string, referenceTime: number) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const minutes = Math.max(0, Math.floor((referenceTime - timestamp) / 60_000));
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  if (hours < 48) return 'Hôm qua';
  return new Date(value).toLocaleDateString('vi-VN');
};
const getDayLabel = (date: Date) => date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const moduleFromReference = (referenceType: WorkScheduleReferenceType): SourceModule | '' => (
  referenceType === 'lead_candidate' ? 'customer_data' : referenceType === 'lead' ? 'leads' : referenceType === 'customer' ? 'crm' : ''
);
const isTaskOverdue = (item: WorkScheduleRecord, referenceTime: number) => ACTIVE_STATUSES.includes(item.status) && new Date(item.endAt).getTime() < referenceTime;
const isTaskDueSoon = (item: WorkScheduleRecord, referenceTime: number) => {
  const due = new Date(item.endAt).getTime();
  return ACTIVE_STATUSES.includes(item.status) && due >= referenceTime && due <= referenceTime + 86_400_000;
};
const isInPeriod = (item: WorkScheduleRecord, period: PeriodFilter, referenceTime: number) => {
  if (period === 'all') return true;
  const due = new Date(item.endAt);
  if (!Number.isFinite(due.getTime())) return false;
  const reference = new Date(referenceTime);
  if (period === 'this_month') return due.getMonth() === reference.getMonth() && due.getFullYear() === reference.getFullYear();
  return due.getTime() >= referenceTime && due.getTime() <= referenceTime + 30 * 86_400_000;
};

export const WorkSchedule: React.FC<WorkScheduleProps> = ({ currentUser, users, candidates = [], leads = [], customers = [], onOpenRecord }) => {
  const isAdmin = currentUser.role === 'admin';
  const now = PAGE_REFERENCE_TIME;
  const [items, setItems] = useState<WorkScheduleRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'week'>('tasks');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('this_month');
  const [page, setPage] = useState(1);
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkScheduleRecord | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() => defaultForm(isAdmin ? '' : currentUser.uid));
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = isAdmin
        ? await dbService.getCollection('work_schedule_items')
        : await dbService.getCollectionByField('work_schedule_items', 'assigneeId', currentUser.uid);
      setItems(normalizeWorkScheduleRecords(data).filter(item => !item.deleted));
    } catch {
      setMessage('Không thể tải danh sách công việc. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.uid, isAdmin]);

  // Loading is the external synchronization performed by this effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadItems(); }, [loadItems]);

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekAnchor);
    date.setDate(date.getDate() + index);
    return date;
  }), [weekAnchor]);
  const activeUsers = useMemo(() => users
    .filter(user => user.active !== false)
    .filter(user => isAdmin || user.uid === currentUser.uid), [currentUser.uid, isAdmin, users]);
  const sourceOptions = useMemo(() => {
    if (form.referenceType === 'lead_candidate') return candidates;
    if (form.referenceType === 'lead') return leads;
    if (form.referenceType === 'customer') return customers;
    return [];
  }, [candidates, customers, form.referenceType, leads]);
  const metrics = useMemo(() => ({
    pending: items.filter(item => item.status === 'not_started').length,
    inProgress: items.filter(item => ['in_progress', 'waiting_customer', 'awaiting_confirmation', 'paused'].includes(item.status)).length,
    support: items.filter(item => item.status === 'support_requested').length,
    dueSoon: items.filter(item => isTaskDueSoon(item, now)).length,
    overdue: items.filter(item => isTaskOverdue(item, now)).length,
    completed: items.filter(item => item.status === 'completed' && new Date(item.completedAt || item.updatedAt).getTime() >= getWeekStart(new Date()).getTime()).length
  }), [items, now]);
  const counts: Record<TaskFilter, number> = {
    all: items.length,
    pending: metrics.pending,
    in_progress: metrics.inProgress,
    support: metrics.support,
    overdue: metrics.overdue,
    completed: items.filter(item => item.status === 'completed').length
  };
  const filteredItems = useMemo(() => items.filter(item => {
    const text = `${item.title} ${item.referenceLabel} ${item.assigneeName} ${item.assignedByName} ${item.description}`.toLocaleLowerCase('vi-VN');
    if (searchTerm.trim() && !text.includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))) return false;
    if (assigneeFilter !== 'all' && item.assigneeId !== assigneeFilter) return false;
    if (moduleFilter !== 'all' && item.referenceType !== moduleFilter) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    if (!isInPeriod(item, periodFilter, now)) return false;
    if (taskFilter === 'pending') return item.status === 'not_started';
    if (taskFilter === 'in_progress') return ['in_progress', 'waiting_customer', 'awaiting_confirmation', 'paused'].includes(item.status);
    if (taskFilter === 'support') return item.status === 'support_requested';
    if (taskFilter === 'overdue') return isTaskOverdue(item, now);
    if (taskFilter === 'completed') return item.status === 'completed';
    return true;
  }).sort((leftItem, rightItem) => {
    const left = isTaskOverdue(leftItem, now) ? 0 : leftItem.priority === 'urgent' ? 1 : leftItem.priority === 'high' ? 2 : 3;
    const right = isTaskOverdue(rightItem, now) ? 0 : rightItem.priority === 'urgent' ? 1 : rightItem.priority === 'high' ? 2 : 3;
    return left - right || leftItem.endAt.localeCompare(rightItem.endAt);
  }), [assigneeFilter, items, moduleFilter, periodFilter, priorityFilter, searchTerm, taskFilter, now]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const setFilterAndFirstPage = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setTaskFilter('all');
    setSearchTerm('');
    setAssigneeFilter('all');
    setModuleFilter('all');
    setPriorityFilter('all');
    setPeriodFilter('this_month');
    setPage(1);
  };
  const openCreate = () => {
    setEditingItem(null);
    setForm(defaultForm(isAdmin ? '' : currentUser.uid));
    setIsFormOpen(true);
  };
  const openEdit = (item: WorkScheduleRecord) => {
    setEditingItem(item);
    setForm({
      title: item.title, assigneeId: item.assigneeId, dueAt: localDateTime(new Date(item.endAt)),
      description: item.description, priority: item.priority, referenceType: item.referenceType,
      referenceId: item.referenceId, referenceLabel: item.referenceLabel, status: item.status
    });
    setIsFormOpen(true);
  };
  const handleReferenceChange = (id: string) => {
    const selected = sourceOptions.find(item => item.id === id);
    setForm(previous => ({ ...previous, referenceId: id, referenceLabel: selected?.companyName || '' }));
  };
  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const assignee = activeUsers.find(user => user.uid === (isAdmin ? form.assigneeId : currentUser.uid));
    const endAt = new Date(form.dueAt);
    if (!form.title.trim() || !assignee || !form.description.trim() || !Number.isFinite(endAt.getTime())) {
      setMessage('Vui lòng nhập đủ tiêu đề, người phụ trách, nội dung và thời hạn.');
      return;
    }
    setSaving(true);
    setMessage('');
    const currentTime = new Date();
    const payload = {
      title: form.title.trim(), description: form.description.trim(), stage: '', assigneeId: assignee.uid,
      assigneeName: assignee.displayName, department: roleDepartment(assignee.role),
      assignedById: editingItem?.assignedById || currentUser.uid,
      assignedByName: editingItem?.assignedByName || currentUser.displayName,
      requestedById: editingItem?.requestedById || '', requestedByName: editingItem?.requestedByName || '',
      startAt: editingItem?.startAt || currentTime.toISOString(), endAt: endAt.toISOString(), status: form.status,
      progress: form.status === 'completed' ? 100 : form.status === 'not_started' ? 0 : 50,
      referenceType: form.referenceType, referenceId: form.referenceId, referenceLabel: form.referenceLabel,
      notes: editingItem?.notes || '', priority: form.priority, taskType: editingItem?.taskType || 'assigned_task',
      updatedAt: currentTime.toISOString(), completedAt: form.status === 'completed' ? (editingItem?.completedAt || currentTime.toISOString()) : null,
      deleted: false
    };
    try {
      const saved = editingItem
        ? await dbService.updateDocument('work_schedule_items', editingItem.id, payload).then(() => ({ ...editingItem, ...payload }))
        : await dbService.addDocument('work_schedule_items', { id: `schedule-${currentTime.getTime()}-${currentUser.uid}`, ...payload, createdAt: currentTime.toISOString() });
      const normalized = normalizeWorkScheduleRecords([saved])[0];
      setItems(previous => editingItem ? previous.map(item => item.id === editingItem.id ? normalized : item) : [...previous, normalized]);
      if (normalized.assigneeId !== currentUser.uid) {
        void dbService.addDocument('notifications', {
          id: `task-${normalized.id}-${normalized.assigneeId}-${currentTime.getTime()}`,
          schemaVersion: 1, recipientId: normalized.assigneeId, module: 'system',
          eventType: editingItem ? 'work_schedule_updated' : 'work_schedule_assigned',
          eventKey: `work_schedule:${normalized.id}:${editingItem ? 'updated' : 'assigned'}:${currentTime.getTime()}`,
          entityId: normalized.id, entityCode: normalized.referenceLabel || normalized.title,
          title: editingItem ? 'Công việc được cập nhật' : 'Bạn được giao công việc',
          message: `${normalized.title} · hạn ${dateTimeLabel(normalized.endAt)}`,
          createdAt: currentTime.toISOString(), createdById: currentUser.uid, source: 'manual', readAt: null
        }).catch(() => undefined);
      }
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'system', action: editingItem ? 'work_schedule_updated' : 'work_schedule_created',
        summary: `${editingItem ? 'Cập nhật' : 'Tạo'} công việc “${normalized.title}”`,
        targetType: 'work_schedule', targetId: normalized.id, targetLabel: normalized.title, pageId: 'work_schedule'
      });
      setIsFormOpen(false);
      setSelectedItem(normalized);
      setMessage(editingItem ? 'Đã cập nhật công việc.' : 'Đã giao công việc.');
    } catch {
      setMessage('Không thể lưu công việc. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };
  const updateStatus = async (item: WorkScheduleRecord, status: WorkScheduleStatus) => {
    const updatedAt = new Date().toISOString();
    await dbService.updateDocument('work_schedule_items', item.id, {
      status, progress: status === 'completed' ? 100 : status === 'not_started' ? 0 : 50,
      updatedAt, completedAt: status === 'completed' ? updatedAt : null
    });
    const updated = {
      ...item, status, progress: status === 'completed' ? 100 : status === 'not_started' ? 0 : 50,
      updatedAt, ...(status === 'completed' ? { completedAt: updatedAt } : {})
    };
    setItems(previous => previous.map(current => current.id === item.id ? updated : current));
    setSelectedItem(updated);
  };
  const openSource = (item: WorkScheduleRecord) => {
    const module = moduleFromReference(item.referenceType);
    if (module && item.referenceId) onOpenRecord?.(module, item.referenceId);
  };
  const filterLabels: Array<[TaskFilter, string]> = [
    ['all', 'Tất cả'], ['pending', 'Chờ tiếp nhận'], ['in_progress', 'Đang thực hiện'],
    ['support', 'Yêu cầu hỗ trợ'], ['overdue', 'Quá hạn'], ['completed', 'Đã hoàn thành']
  ];

  return <div className="work-schedule-page">
    <PageContextHeader section="Lịch làm việc" current={activeTab === 'week' ? 'Lịch tuần' : 'Công việc'} />

    <div className="work-schedule-tabs" role="tablist">
      <div className="work-schedule-tab-list">
        <button type="button" role="tab" aria-selected={activeTab === 'tasks'} className={activeTab === 'tasks' ? 'is-active' : ''} onClick={() => setActiveTab('tasks')}>Công việc</button>
        <button type="button" role="tab" aria-selected={activeTab === 'week'} className={activeTab === 'week' ? 'is-active' : ''} onClick={() => setActiveTab('week')}>Lịch tuần</button>
      </div>
      {activeTab === 'tasks' && <button type="button" className="btn btn-primary work-schedule-create" onClick={openCreate}><Plus size={15} />Tạo công việc</button>}
    </div>

    {message && <div className="work-schedule-message" role="status">{message}</div>}

    {activeTab === 'tasks' ? <>
      <section className="work-schedule-kpis">
        <article><span>Chờ tiếp nhận</span><strong>{metrics.pending} việc</strong></article>
        <article><span>Đang thực hiện</span><strong>{metrics.inProgress} việc</strong></article>
        <article><span>Yêu cầu hỗ trợ</span><strong>{metrics.support} yêu cầu</strong></article>
        <article><span>Sắp đến hạn</span><strong>{metrics.dueSoon} việc</strong></article>
        <article className="is-danger"><span>Quá hạn</span><strong>{metrics.overdue} việc</strong></article>
        <article><span>Hoàn thành tuần này</span><strong>{metrics.completed} việc</strong></article>
      </section>

      <section className="work-schedule-card">
        <div className="work-schedule-filter-tabs">
          {filterLabels.map(([value, label]) => <button key={value} type="button" className={taskFilter === value ? 'is-active' : ''} onClick={() => setFilterAndFirstPage(setTaskFilter, value)}>{label} <strong>{counts[value]}</strong></button>)}
        </div>
        <div className="work-schedule-toolbar">
          <label className="work-schedule-search"><Search size={15}/><input aria-label="Tìm công việc" placeholder="Tìm công việc hoặc khách hàng..." value={searchTerm} onChange={event => setFilterAndFirstPage(setSearchTerm, event.target.value)}/></label>
          {isAdmin && <select aria-label="Lọc Sale" value={assigneeFilter} onChange={event => setFilterAndFirstPage(setAssigneeFilter, event.target.value)}><option value="all">Tất cả Sale</option>{activeUsers.filter(user => user.role === 'sale').map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select>}
          <select aria-label="Lọc phân hệ" value={moduleFilter} onChange={event => setFilterAndFirstPage(setModuleFilter, event.target.value)}><option value="all">Tất cả phân hệ</option><option value="lead_candidate">Dữ liệu thô</option><option value="lead">Tiềm năng</option><option value="customer">Khách hàng</option><option value="none">Không liên kết</option></select>
          <select aria-label="Lọc ưu tiên" value={priorityFilter} onChange={event => setFilterAndFirstPage(setPriorityFilter, event.target.value)}><option value="all">Tất cả ưu tiên</option><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select>
          <select aria-label="Lọc thời gian" value={periodFilter} onChange={event => setFilterAndFirstPage(setPeriodFilter, event.target.value as PeriodFilter)}><option value="this_month">Tháng này</option><option value="next_30_days">30 ngày tới</option><option value="all">Tất cả thời gian</option></select>
          <button type="button" className="work-schedule-clear" onClick={clearFilters}>Xóa bộ lọc</button>
        </div>
        {metrics.support > 0 && <div className="work-schedule-support-alert"><AlertCircle size={16}/><span><strong>{metrics.support} yêu cầu hỗ trợ</strong> từ Sale đang chờ xử lý</span><button type="button" onClick={() => { setTaskFilter('support'); setPage(1); }}>Xem yêu cầu</button></div>}
        <div className="work-schedule-table-wrap">
          <table className="work-schedule-table work-schedule-task-table">
            <thead><tr>
              <th>Công việc</th><th>Khách hàng</th><th>Phân hệ</th><th>Người giao</th><th>Người thực hiện</th><th>Hạn xử lý</th><th>Ưu tiên</th><th>Trạng thái</th><th>Cập nhật gần nhất</th><th>Thao tác</th>
            </tr></thead>
            <tbody>{!isLoading && pageItems.map(item => <tr key={item.id} className={isTaskOverdue(item, now) ? 'is-overdue' : ''}>
              <td><strong>{item.title}</strong><small>{item.description || 'Chưa có mô tả'}</small></td>
              <td>{item.referenceLabel ? <button type="button" className="work-schedule-link" onClick={() => openSource(item)}>{item.referenceLabel}</button> : '—'}</td>
              <td><span className={`work-schedule-reference work-schedule-reference--${item.referenceType}`}>{WORK_SCHEDULE_REFERENCE_LABELS[item.referenceType]}</span></td>
              <td>{item.assignedByName || 'Tự tạo'}</td>
              <td>{item.assigneeName}</td>
              <td><strong>{dateTimeLabel(item.endAt)}</strong>{isTaskOverdue(item, now) && <small className="work-schedule-text--danger">Đã quá hạn</small>}</td>
              <td><span className={`work-schedule-priority work-schedule-priority--${item.priority}`}>{WORK_SCHEDULE_PRIORITY_LABELS[item.priority]}</span></td>
              <td><span className={`work-schedule-status work-schedule-status--${item.status}`}>{WORK_SCHEDULE_STATUS_LABELS[item.status]}</span></td>
              <td>{relativeUpdateLabel(item.updatedAt, now)}</td>
              <td><button type="button" className="work-schedule-link" onClick={() => setSelectedItem(item)}>Xem chi tiết</button></td>
            </tr>)}</tbody>
          </table>
          {isLoading && <div className="work-schedule-empty">Đang tải công việc...</div>}
          {!isLoading && pageItems.length === 0 && <div className="work-schedule-empty">Chưa có công việc phù hợp bộ lọc.</div>}
        </div>
        <footer className="work-schedule-pagination">
          <span>{filteredItems.length} công việc</span>
          <div><span>{filteredItems.length === 0 ? '0–0' : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredItems.length)}`} / {filteredItems.length}</span><button type="button" className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => setPage(previous => Math.max(1, previous - 1))}>Trước</button><button type="button" className="btn btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(previous => Math.min(totalPages, previous + 1))}>Sau</button></div>
        </footer>
      </section>
    </> : <section className="work-schedule-card work-schedule-week-view">
      <div className="work-schedule-week-nav"><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 7))}>Tuần trước</button><strong>{getDayLabel(weekDates[0])} – {getDayLabel(weekDates[6])}</strong><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7))}>Tuần sau</button></div>
      <div className="work-schedule-table-wrap"><table className="work-schedule-table work-schedule-week-table"><thead><tr><th>Nhân viên</th>{weekDates.map(date => <th key={toDateKey(date)}>{getDayLabel(date)}</th>)}</tr></thead><tbody>{activeUsers.map(user => <tr key={user.uid}><td><strong>{user.displayName}</strong><small>{roleDepartment(user.role)}</small></td>{weekDates.map(date => { const schedules = items.filter(item => item.assigneeId === user.uid && isScheduleOnDate(item, date)); return <td key={`${user.uid}-${toDateKey(date)}`}><button type="button" className="work-schedule-week-cell" onClick={() => { setTaskFilter('all'); setActiveTab('tasks'); }}><strong>{schedules.length}</strong><span>{schedules.length ? 'công việc' : 'Trống'}</span></button></td>; })}</tr>)}</tbody></table></div>
    </section>}

    {selectedItem && <div className="work-schedule-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedItem(null); }}><section className="work-schedule-detail" role="dialog" aria-modal="true"><header><div><span>Chi tiết công việc</span><h2>{selectedItem.title}</h2></div><button type="button" className="btn btn-outline" onClick={() => setSelectedItem(null)}>Đóng</button></header><div className="work-schedule-detail__grid"><div><span>Trạng thái</span><strong className={`work-schedule-status work-schedule-status--${selectedItem.status}`}>{WORK_SCHEDULE_STATUS_LABELS[selectedItem.status]}</strong></div><div><span>Mức ưu tiên</span><strong className={`work-schedule-priority work-schedule-priority--${selectedItem.priority}`}>{WORK_SCHEDULE_PRIORITY_LABELS[selectedItem.priority]}</strong></div><div><span>Người thực hiện</span><strong>{selectedItem.assigneeName}</strong></div><div><span>Người giao việc</span><strong>{selectedItem.assignedByName || 'Tự tạo'}</strong></div><div><span>Thời hạn</span><strong>{dateTimeLabel(selectedItem.endAt)}</strong></div><div><span>Phân hệ</span><strong>{WORK_SCHEDULE_REFERENCE_LABELS[selectedItem.referenceType]}</strong></div></div><article><h3>Nội dung công việc</h3><p>{selectedItem.description || 'Chưa có nội dung.'}</p>{selectedItem.requestedByName && <p>Người yêu cầu hỗ trợ: <strong>{selectedItem.requestedByName}</strong></p>}</article><footer>{selectedItem.referenceId && moduleFromReference(selectedItem.referenceType) && <button type="button" className="btn btn-outline" onClick={() => openSource(selectedItem)}>Mở hồ sơ khách hàng</button>}<button type="button" className="btn btn-outline" onClick={() => openEdit(selectedItem)}>Chỉnh sửa</button>{selectedItem.status !== 'completed' && <button type="button" className="btn btn-primary" onClick={() => void updateStatus(selectedItem, 'completed')}>Đánh dấu hoàn thành</button>}</footer></section></div>}

    {isFormOpen && <div className="work-schedule-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setIsFormOpen(false); }}><form className="work-schedule-modal" onSubmit={saveTask}><header><div><strong>{editingItem ? 'Cập nhật công việc' : 'Tạo công việc'}</strong><span>Nhập rõ nội dung, người phụ trách và thời hạn.</span></div><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Đóng</button></header><div className="work-schedule-form-grid"><label className="is-wide">Tên công việc *<input autoFocus value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))}/></label>{isAdmin && <label>Sale đảm nhận *<select value={form.assigneeId} onChange={event => setForm(previous => ({ ...previous, assigneeId: event.target.value }))}><option value="">Chọn Sale</option>{users.filter(user => user.role === 'sale' && user.active !== false).map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></label>}<label>Thời hạn *<input type="datetime-local" value={form.dueAt} onChange={event => setForm(previous => ({ ...previous, dueAt: event.target.value }))}/></label><label>Phân hệ liên kết<select value={form.referenceType} onChange={event => setForm(previous => ({ ...previous, referenceType: event.target.value as WorkScheduleReferenceType, referenceId: '', referenceLabel: '' }))}><option value="none">Không liên kết</option><option value="lead_candidate">Dữ liệu thô</option><option value="lead">Tiềm năng</option><option value="customer">Khách hàng</option></select></label><label>Khách hàng<select disabled={form.referenceType === 'none'} value={form.referenceId} onChange={event => handleReferenceChange(event.target.value)}><option value="">Chọn khách hàng</option>{sourceOptions.map(item => <option key={item.id} value={item.id}>{item.companyName || item.id}</option>)}</select></label><label>Mức ưu tiên<select value={form.priority} onChange={event => setForm(previous => ({ ...previous, priority: event.target.value as WorkSchedulePriority }))}><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label><label>Trạng thái<select value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value as WorkScheduleStatus }))}>{EDITABLE_STATUSES.map(status => <option key={status} value={status}>{WORK_SCHEDULE_STATUS_LABELS[status]}</option>)}</select></label><label className="is-wide">Nội dung công việc *<textarea rows={4} value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))}/></label></div><footer><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu công việc'}</button></footer></form></div>}
  </div>;
};
