import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, FolderCog, Plus, Search } from 'lucide-react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataFilterButton, DataFilterPanel, DataFilterSection } from '@/components/DataWorkspaceFilters';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import {
  WORK_SCHEDULE_DEPARTMENT_LABELS,
  WORK_SCHEDULE_DISPLAY_STATUS_LABELS,
  WORK_SCHEDULE_PRIORITY_LABELS,
  WORK_SCHEDULE_REFERENCE_LABELS,
  WORK_SCHEDULE_STATUS_LABELS,
  canPermanentlyDeleteWorkSchedule,
  compareWorkScheduleItems,
  getWorkScheduleDisplayStatus,
  getWeekStart,
  inferWorkScheduleGroupId,
  isScheduleOnDate,
  mergeWorkScheduleGroups,
  normalizeWorkScheduleRecords,
  toDateKey,
  type WorkSchedulePriority,
  type WorkScheduleRecord,
  type WorkScheduleReferenceType,
  type WorkScheduleStatus,
  type WorkScheduleDisplayStatus,
  type WorkScheduleGroupRecord
} from '@/features/work-schedule/model/workScheduleModels';
import './WorkSchedule.css';

type CustomerEntity = { id: string; companyName?: string };
type SourceModule = 'customer_data' | 'leads' | 'crm';
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
  groupId: string;
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

type RequiredTaskField = 'groupId' | 'title' | 'assigneeId' | 'dueAt' | 'description';

const PAGE_SIZE = 10;
const ACTIVE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'paused'];
const PAGE_REFERENCE_TIME = Date.now();
const EDITABLE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'completed', 'cannot_process'];
const localDateTime = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const defaultDeadline = () => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(17, 0, 0, 0);
  return localDateTime(value);
};
const defaultForm = (assigneeId = '', groupId = ''): ScheduleFormState => ({
  groupId, title: '', assigneeId, dueAt: defaultDeadline(), description: '', priority: 'normal',
  referenceType: 'none', referenceId: '', referenceLabel: '', status: 'not_started'
});
const roleDepartment = (role: UserProfile['role']) => WORK_SCHEDULE_DEPARTMENT_LABELS[role] || role;
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
};
const getDayLabel = (date: Date) => date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const moduleFromReference = (referenceType: WorkScheduleReferenceType): SourceModule | '' => (
  referenceType === 'lead_candidate' ? 'customer_data' : referenceType === 'lead' ? 'leads' : referenceType === 'customer' ? 'crm' : ''
);
const isTaskOverdue = (item: WorkScheduleRecord, referenceTime: number) => ACTIVE_STATUSES.includes(item.status) && new Date(item.endAt).getTime() < referenceTime;
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
  const [groups, setGroups] = useState<WorkScheduleGroupRecord[]>(() => mergeWorkScheduleGroups([]));
  const [selectedGroupId, setSelectedGroupId] = useState('boss');
  const [activeTab, setActiveTab] = useState<'tasks' | 'week'>('tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkScheduleDisplayStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [groupDialog, setGroupDialog] = useState<'create' | 'rename' | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [page, setPage] = useState(1);
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkScheduleRecord | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() => defaultForm(isAdmin ? '' : currentUser.uid, 'boss'));
  const [formError, setFormError] = useState('');
  const [formFieldErrors, setFormFieldErrors] = useState<Partial<Record<RequiredTaskField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [statusNoteItem, setStatusNoteItem] = useState<WorkScheduleRecord | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [statusNoteError, setStatusNoteError] = useState('');

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, storedGroups] = await Promise.all([
        isAdmin
          ? dbService.getCollection('work_schedule_items')
          : dbService.getCollectionByField('work_schedule_items', 'assigneeId', currentUser.uid),
        dbService.getCollection('work_schedule_groups').catch(() => [])
      ]);
      setItems(normalizeWorkScheduleRecords(data).filter(item => !item.deleted));
      setGroups(mergeWorkScheduleGroups(storedGroups));
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
  const selectedGroup = groups.find(group => group.id === selectedGroupId) || groups[0] || null;
  const effectiveGroupId = selectedGroup?.id || '';
  const groupCounts = useMemo(() => Object.fromEntries(groups.map(group => [
    group.id,
    items.filter(item => inferWorkScheduleGroupId(item) === group.id).length
  ])), [groups, items]);
  const groupItems = useMemo(() => items.filter(item => inferWorkScheduleGroupId(item) === effectiveGroupId), [effectiveGroupId, items]);
  const metrics = useMemo(() => ({
    in_progress: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'in_progress').length,
    not_started: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'not_started').length,
    cannot_process: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'cannot_process').length,
    completed: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'completed').length,
    support: groupItems.filter(item => item.status === 'support_requested').length
  }), [groupItems]);
  const activeFilterCount = (assigneeFilter !== 'all' ? 1 : 0)
    + (moduleFilter !== 'all' ? 1 : 0)
    + (priorityFilter !== 'all' ? 1 : 0)
    + (statusFilter !== 'all' ? 1 : 0)
    + (periodFilter !== 'all' ? 1 : 0);
  const filteredItems = useMemo(() => groupItems.filter(item => {
    const text = `${item.title} ${item.referenceLabel} ${item.assigneeName} ${item.assignedByName} ${item.description}`.toLocaleLowerCase('vi-VN');
    if (searchTerm.trim() && !text.includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))) return false;
    if (assigneeFilter !== 'all' && item.assigneeId !== assigneeFilter) return false;
    if (moduleFilter !== 'all' && item.referenceType !== moduleFilter) return false;
    if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
    if (statusFilter !== 'all' && getWorkScheduleDisplayStatus(item.status) !== statusFilter) return false;
    if (!isInPeriod(item, periodFilter, now)) return false;
    return true;
  }).sort((leftItem, rightItem) => {
    return compareWorkScheduleItems(leftItem, rightItem);
  }), [assigneeFilter, groupItems, moduleFilter, periodFilter, priorityFilter, searchTerm, statusFilter, now]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const setFilterAndFirstPage = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearchTerm('');
    setAssigneeFilter('all');
    setModuleFilter('all');
    setPriorityFilter('all');
    setStatusFilter('all');
    setPeriodFilter('all');
    setPage(1);
  };
  const openCreate = () => {
    if (!selectedGroup) return;
    setEditingItem(null);
    setForm(defaultForm(isAdmin ? '' : currentUser.uid, selectedGroup.id));
    setFormError('');
    setFormFieldErrors({});
    setMessage('');
    setIsFormOpen(true);
  };
  const openEdit = (item: WorkScheduleRecord) => {
    setEditingItem(item);
    setForm({
      groupId: inferWorkScheduleGroupId(item),
      title: item.title, assigneeId: item.assigneeId, dueAt: localDateTime(new Date(item.endAt)),
      description: item.description, priority: item.priority, referenceType: item.referenceType,
      referenceId: item.referenceId, referenceLabel: item.referenceLabel, status: item.status
    });
    setFormError('');
    setFormFieldErrors({});
    setMessage('');
    setIsFormOpen(true);
  };
  const updateFormField = <K extends keyof ScheduleFormState>(field: K, value: ScheduleFormState[K]) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setFormError('');
    if (field === 'groupId' || field === 'title' || field === 'assigneeId' || field === 'dueAt' || field === 'description') {
      setFormFieldErrors(previous => ({ ...previous, [field]: undefined }));
    }
  };
  const handleReferenceChange = (id: string) => {
    const selected = sourceOptions.find(item => item.id === id);
    setForm(previous => ({ ...previous, referenceId: id, referenceLabel: selected?.companyName || '' }));
  };
  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const assignee = activeUsers.find(user => user.uid === (isAdmin ? form.assigneeId : currentUser.uid));
    const taskGroup = groups.find(group => group.id === form.groupId);
    const endAt = new Date(form.dueAt);
    const errors: Partial<Record<RequiredTaskField, string>> = {};
    if (!taskGroup) errors.groupId = 'Vui lòng chọn nhóm công việc.';
    if (!form.title.trim()) errors.title = 'Vui lòng nhập tên công việc.';
    if (!assignee) errors.assigneeId = isAdmin ? 'Vui lòng chọn người thực hiện.' : 'Không tìm thấy tài khoản người phụ trách đang hoạt động.';
    if (!form.dueAt || !Number.isFinite(endAt.getTime())) errors.dueAt = 'Vui lòng chọn thời hạn hợp lệ.';
    if (!form.description.trim()) errors.description = 'Vui lòng nhập nội dung công việc.';
    const firstInvalidField = (['groupId', 'title', 'assigneeId', 'dueAt', 'description'] as RequiredTaskField[]).find(field => errors[field]);
    if (firstInvalidField || !assignee || !taskGroup) {
      setFormFieldErrors(errors);
      setFormError('Hãy bổ sung các trường được đánh dấu để lưu công việc.');
      if (firstInvalidField) event.currentTarget.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
      return;
    }
    setFormFieldErrors({});
    setFormError('');
    setSaving(true);
    setMessage('');
    const currentTime = new Date();
    const taskStatus: WorkScheduleStatus = editingItem ? form.status : 'not_started';
    const payload = {
      title: form.title.trim(), description: form.description.trim(), stage: '', assigneeId: assignee.uid,
      assigneeName: assignee.displayName, department: roleDepartment(assignee.role),
      assignedById: editingItem?.assignedById || currentUser.uid,
      assignedByName: editingItem?.assignedByName || currentUser.displayName,
      requestedById: editingItem?.requestedById || '', requestedByName: editingItem?.requestedByName || '',
      startAt: editingItem?.startAt || currentTime.toISOString(), endAt: endAt.toISOString(), status: taskStatus,
      progress: taskStatus === 'completed' ? 100 : taskStatus === 'not_started' ? 0 : 50,
      referenceType: form.referenceType, referenceId: form.referenceId, referenceLabel: form.referenceLabel,
      notes: editingItem?.notes || '', priority: form.priority, taskType: editingItem?.taskType || 'assigned_task',
      groupId: taskGroup.id, groupName: taskGroup.name,
      updatedAt: currentTime.toISOString(), completedAt: taskStatus === 'completed' ? (editingItem?.completedAt || currentTime.toISOString()) : null,
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
    } catch (error) {
      const permissionDenied = typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
      setFormError(permissionDenied
        ? 'Tài khoản chưa được cấp quyền lưu công việc. Vui lòng liên hệ quản trị viên.'
        : 'Không thể lưu công việc. Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };
  const updateStatus = async (item: WorkScheduleRecord, status: WorkScheduleStatus, failureNote = '') => {
    const trimmedFailureNote = failureNote.trim();
    const activeAdmins = users.filter(user => user.role === 'admin' && user.active !== false);
    if (status === 'cannot_process' && !trimmedFailureNote) {
      setStatusNoteError('Vui lòng nhập lý do không xử lí được.');
      return;
    }
    if (status === 'cannot_process' && !isAdmin && activeAdmins.length === 0) {
      setStatusNoteError('Chưa có tài khoản quản lý đang hoạt động để nhận thông báo.');
      return;
    }
    setDetailBusy(true);
    setDetailError('');
    setMessage('');
    try {
      const updatedAt = new Date().toISOString();
      const completedAt = status === 'completed' ? updatedAt : null;
      const progress = status === 'completed' ? 100 : status === 'not_started' ? 0 : 50;
      const failureFields = status === 'cannot_process' ? {
        cannotProcessNote: trimmedFailureNote,
        cannotProcessAt: updatedAt,
        cannotProcessById: currentUser.uid,
        cannotProcessByName: currentUser.displayName
      } : {};
      await dbService.updateDocument('work_schedule_items', item.id, { status, progress, updatedAt, completedAt, ...failureFields });
      if (status === 'cannot_process' && !isAdmin) {
        const eventKey = `work_schedule:cannot_process:${item.id}:${updatedAt}`;
        await Promise.all(activeAdmins.map(admin => dbService.addDocument('notifications', {
          id: `work-status-${item.id}-${admin.uid}-${Date.now()}`,
          schemaVersion: 1,
          recipientId: admin.uid,
          module: 'system',
          eventType: 'work_schedule_cannot_process',
          eventKey,
          entityId: item.id,
          entityCode: item.referenceLabel || item.title,
          title: `${currentUser.displayName} không thể xử lí công việc`,
          message: `${item.title} · ${trimmedFailureNote}`,
          createdAt: updatedAt,
          createdById: currentUser.uid,
          source: 'manual',
          readAt: null
        })));
      }
      const updated = { ...item, status, progress, updatedAt, completedAt: completedAt || undefined, ...failureFields };
      setItems(previous => previous.map(current => current.id === item.id ? updated : current));
      setSelectedItem(updated);
      setStatusNoteItem(null);
      setStatusNote('');
      setStatusNoteError('');
      setMessage(`Đã chuyển công việc sang trạng thái ${WORK_SCHEDULE_STATUS_LABELS[status].toLowerCase()}.`);
    } catch {
      const errorMessage = status === 'cannot_process'
        ? 'Không thể lưu trạng thái hoặc gửi thông báo cho quản lý. Vui lòng thử lại.'
        : 'Không thể cập nhật trạng thái công việc. Vui lòng thử lại.';
      if (statusNoteItem) setStatusNoteError(errorMessage);
      else setDetailError(errorMessage);
    } finally {
      setDetailBusy(false);
    }
  };
  const requestStatusChange = (item: WorkScheduleRecord, status: WorkScheduleStatus) => {
    if (getWorkScheduleDisplayStatus(item.status) === status) return;
    if (status === 'cannot_process') {
      setStatusNoteItem(item);
      setStatusNote(item.cannotProcessNote || '');
      setStatusNoteError('');
      return;
    }
    void updateStatus(item, status);
  };
  const deleteCompletedTask = async (item: WorkScheduleRecord) => {
    if (!canPermanentlyDeleteWorkSchedule(currentUser.role, item.status) || detailBusy) return;
    if (!window.confirm(`Xóa vĩnh viễn công việc “${item.title}”? Thao tác này không thể hoàn tác.`)) return;
    setDetailBusy(true);
    setDetailError('');
    setMessage('');
    try {
      const deleted = await dbService.deleteDocument('work_schedule_items', item.id);
      if (!deleted) throw new Error('Work schedule item was not deleted');
      setItems(previous => previous.filter(current => current.id !== item.id));
      setSelectedItem(null);
      setMessage('Đã xóa vĩnh viễn công việc.');
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'system', action: 'work_schedule_deleted',
        summary: `Xóa vĩnh viễn công việc “${item.title}”`,
        targetType: 'work_schedule', targetId: item.id, targetLabel: item.title, pageId: 'work_schedule'
      });
    } catch {
      setDetailError('Không thể xóa công việc. Vui lòng thử lại.');
    } finally {
      setDetailBusy(false);
    }
  };
  const openSource = (item: WorkScheduleRecord) => {
    const module = moduleFromReference(item.referenceType);
    if (module && item.referenceId) onOpenRecord?.(module, item.referenceId);
  };
  const openGroupDialog = (mode: 'create' | 'rename') => {
    setGroupDialog(mode);
    setGroupNameDraft(mode === 'rename' ? selectedGroup?.name || '' : '');
    setGroupError('');
  };
  const saveGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupNameDraft.trim();
    if (!isAdmin || !name) {
      setGroupError('Vui lòng nhập tên nhóm công việc.');
      return;
    }
    const nowIso = new Date().toISOString();
    const existing = groupDialog === 'rename' ? selectedGroup : null;
    const group: WorkScheduleGroupRecord = existing ? {
      ...existing, name, updatedAt: nowIso
    } : {
      id: `work-group-${Date.now()}`,
      name,
      order: Math.max(0, ...groups.map(item => item.order)) + 10,
      active: true,
      system: false,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    setGroupBusy(true);
    setGroupError('');
    try {
      await dbService.addDocument('work_schedule_groups', group);
      setGroups(previous => [...previous.filter(item => item.id !== group.id), group].sort((left, right) => left.order - right.order));
      setSelectedGroupId(group.id);
      setGroupDialog(null);
      setMessage(existing ? 'Đã đổi tên nhóm công việc.' : 'Đã thêm nhóm công việc.');
    } catch {
      setGroupError('Không thể lưu nhóm công việc. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setGroupBusy(false);
    }
  };
  const deleteGroup = async () => {
    if (!isAdmin || !selectedGroup || groupBusy) return;
    const taskCount = groupCounts[selectedGroup.id] || 0;
    if (taskCount > 0) {
      setMessage(`Nhóm “${selectedGroup.name}” còn ${taskCount} công việc. Hãy chuyển công việc sang nhóm khác trước khi xóa.`);
      return;
    }
    if (!window.confirm(`Xóa nhóm “${selectedGroup.name}”?`)) return;
    setGroupBusy(true);
    try {
      await dbService.addDocument('work_schedule_groups', { ...selectedGroup, active: false, updatedAt: new Date().toISOString() });
      const remaining = groups.filter(group => group.id !== selectedGroup.id);
      setGroups(remaining);
      setSelectedGroupId(remaining[0]?.id || '');
      setMessage('Đã xóa nhóm công việc.');
    } catch {
      setMessage('Không thể xóa nhóm công việc. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setGroupBusy(false);
    }
  };

  return <div className="work-schedule-page">
    <PageContextHeader section="Lịch làm việc" current={activeTab === 'week' ? 'Lịch tuần' : 'Công việc'} />

    <div className="work-schedule-tabs" role="tablist">
      <div className="work-schedule-tab-list">
        <button type="button" role="tab" aria-selected={activeTab === 'tasks'} className={activeTab === 'tasks' ? 'is-active' : ''} onClick={() => setActiveTab('tasks')}>Công việc</button>
        <button type="button" role="tab" aria-selected={activeTab === 'week'} className={activeTab === 'week' ? 'is-active' : ''} onClick={() => setActiveTab('week')}>Lịch tuần</button>
      </div>
      {activeTab === 'tasks' && <button type="button" className="btn btn-primary work-schedule-create" onClick={openCreate} disabled={!selectedGroup}><Plus size={15} />Tạo công việc</button>}
    </div>

    {message && <div className="work-schedule-message" role="status">{message}</div>}

    {activeTab === 'tasks' ? <>
      <section className="work-schedule-card work-schedule-group-content">
          <nav className="work-schedule-group-nav" aria-label="Nhóm công việc">
            <div className="work-schedule-group-tabs">
              {groups.map(group => <button key={group.id} type="button" className={effectiveGroupId === group.id ? 'is-active' : ''} onClick={() => { setSelectedGroupId(group.id); setPage(1); }}><span>{group.name}</span><strong>{groupCounts[group.id] || 0}</strong></button>)}
            </div>
            {isAdmin && <div className="work-schedule-group-actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => openGroupDialog('rename')} disabled={!selectedGroup}><FolderCog size={14} />Quản lý nhóm</button><button type="button" className="btn btn-outline btn-sm" onClick={() => openGroupDialog('create')}><Plus size={14} />Thêm nhóm</button></div>}
          </nav>
          <header className="work-schedule-group-header">
            <div><h2>{selectedGroup?.name || 'Chưa chọn nhóm'}</h2><span>{groupItems.length} công việc</span></div>
            <div>{isAdmin && <select aria-label="Nhân sự" value={assigneeFilter} onChange={event => setFilterAndFirstPage(setAssigneeFilter, event.target.value)}><option value="all">Nhân sự: Tất cả</option>{activeUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select>}</div>
          </header>
          <div className="work-schedule-status-summary">
            {(Object.keys(WORK_SCHEDULE_DISPLAY_STATUS_LABELS) as WorkScheduleDisplayStatus[]).map(status => <button key={status} type="button" className={`work-schedule-summary work-schedule-summary--${status} ${statusFilter === status ? 'is-active' : ''}`} onClick={() => setFilterAndFirstPage(setStatusFilter, statusFilter === status ? 'all' : status)}><span>{WORK_SCHEDULE_DISPLAY_STATUS_LABELS[status]}</span><strong>{metrics[status]}</strong></button>)}
          </div>
          <div className="work-schedule-toolbar">
            <label className="work-schedule-search"><Search size={15}/><input aria-label="Tìm công việc" placeholder="Tìm công việc, khách hàng..." value={searchTerm} onChange={event => setFilterAndFirstPage(setSearchTerm, event.target.value)}/></label>
            <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
            {(activeFilterCount > 0 || searchTerm) && <button type="button" className="work-schedule-clear" onClick={clearFilters}>Xóa bộ lọc</button>}
          </div>
          {metrics.support > 0 && <div className="work-schedule-support-alert"><AlertCircle size={16}/><span><strong>{metrics.support} yêu cầu hỗ trợ</strong> đang chờ xử lí trong nhóm này</span></div>}
          <div className="work-schedule-table-wrap">
            <table className="work-schedule-table work-schedule-task-table">
              <thead><tr><th>Công việc</th><th>Khách hàng</th><th>Phân hệ</th><th>Người giao</th><th>Người thực hiện</th><th>Hạn xử lý</th><th>Ưu tiên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{!isLoading && pageItems.map(item => { const displayStatus = getWorkScheduleDisplayStatus(item.status); return <tr key={item.id} className={isTaskOverdue(item, now) ? 'is-overdue' : ''}>
                <td><strong title={item.title}>{item.title}</strong><small title={item.description}>{item.description || 'Chưa có mô tả'}</small></td>
                <td>{item.referenceLabel ? <button type="button" className="work-schedule-link" onClick={() => openSource(item)}>{item.referenceLabel}</button> : '—'}</td>
                <td><span className={`work-schedule-reference work-schedule-reference--${item.referenceType}`}>{WORK_SCHEDULE_REFERENCE_LABELS[item.referenceType]}</span></td>
                <td>{item.assignedByName || 'Tự tạo'}</td><td>{item.assigneeName}</td>
                <td><strong>{dateTimeLabel(item.endAt)}</strong>{isTaskOverdue(item, now) && <small className="work-schedule-text--danger">Đã quá hạn</small>}</td>
                <td><span className={`work-schedule-priority work-schedule-priority--${item.priority}`}>{WORK_SCHEDULE_PRIORITY_LABELS[item.priority]}</span></td>
                <td><span className={`work-schedule-status work-schedule-status--${displayStatus}`}>{WORK_SCHEDULE_DISPLAY_STATUS_LABELS[displayStatus]}</span></td>
                <td><button type="button" className="work-schedule-link" onClick={() => { setDetailError(''); setSelectedItem(item); }}>Xem chi tiết</button></td>
              </tr>; })}</tbody>
            </table>
            {isLoading && <div className="work-schedule-empty">Đang tải công việc...</div>}
            {!isLoading && pageItems.length === 0 && <div className="work-schedule-empty">Chưa có công việc phù hợp trong nhóm này.</div>}
          </div>
          <footer className="work-schedule-pagination"><span>{filteredItems.length} công việc</span><div><span>{filteredItems.length === 0 ? '0–0' : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredItems.length)}`} / {filteredItems.length}</span><button type="button" className="btn btn-outline btn-sm" disabled={currentPage <= 1} onClick={() => setPage(previous => Math.max(1, previous - 1))}>Trước</button><button type="button" className="btn btn-outline btn-sm" disabled={currentPage >= totalPages} onClick={() => setPage(previous => Math.min(totalPages, previous + 1))}>Sau</button></div></footer>
      </section>

      <DataFilterPanel open={showFilters} title="Lọc danh sách công việc" description="Lọc theo trạng thái, mức ưu tiên, phân hệ, nhân sự và thời gian." activeCount={activeFilterCount} onClose={() => setShowFilters(false)} onReset={clearFilters}>
        <DataFilterSection title="Trạng thái" selectedCount={statusFilter === 'all' ? 0 : 1} defaultExpanded><select value={statusFilter} onChange={event => setFilterAndFirstPage(setStatusFilter, event.target.value as 'all' | WorkScheduleDisplayStatus)}><option value="all">Tất cả trạng thái</option>{(Object.keys(WORK_SCHEDULE_DISPLAY_STATUS_LABELS) as WorkScheduleDisplayStatus[]).map(status => <option key={status} value={status}>{WORK_SCHEDULE_DISPLAY_STATUS_LABELS[status]}</option>)}</select></DataFilterSection>
        <DataFilterSection title="Mức độ ưu tiên" selectedCount={priorityFilter === 'all' ? 0 : 1} defaultExpanded><select value={priorityFilter} onChange={event => setFilterAndFirstPage(setPriorityFilter, event.target.value)}><option value="all">Tất cả ưu tiên</option><option value="urgent">Khẩn cấp</option><option value="high">Cao</option><option value="normal">Bình thường</option></select></DataFilterSection>
        <DataFilterSection title="Phân hệ" selectedCount={moduleFilter === 'all' ? 0 : 1}><select value={moduleFilter} onChange={event => setFilterAndFirstPage(setModuleFilter, event.target.value)}><option value="all">Tất cả phân hệ</option><option value="lead_candidate">Dữ liệu thô</option><option value="lead">Tiềm năng</option><option value="customer">Khách hàng</option><option value="po">Đơn hàng</option><option value="design_request">Thiết kế</option><option value="production_order">Sản xuất</option><option value="delivery">Giao hàng</option><option value="none">Không liên kết</option></select></DataFilterSection>
        {isAdmin && <DataFilterSection title="Người thực hiện" selectedCount={assigneeFilter === 'all' ? 0 : 1}><select value={assigneeFilter} onChange={event => setFilterAndFirstPage(setAssigneeFilter, event.target.value)}><option value="all">Tất cả nhân sự</option>{activeUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></DataFilterSection>}
        <DataFilterSection title="Thời gian" selectedCount={periodFilter === 'all' ? 0 : 1}><select value={periodFilter} onChange={event => setFilterAndFirstPage(setPeriodFilter, event.target.value as PeriodFilter)}><option value="all">Tất cả thời gian</option><option value="this_month">Tháng này</option><option value="next_30_days">30 ngày tới</option></select></DataFilterSection>
      </DataFilterPanel>
    </> : <section className="work-schedule-card work-schedule-week-view">
      <div className="work-schedule-week-nav"><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 7))}>Tuần trước</button><strong>{getDayLabel(weekDates[0])} – {getDayLabel(weekDates[6])}</strong><button type="button" className="btn btn-outline btn-sm" onClick={() => setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7))}>Tuần sau</button></div>
      <div className="work-schedule-table-wrap"><table className="work-schedule-table work-schedule-week-table"><thead><tr><th>Nhân viên</th>{weekDates.map(date => <th key={toDateKey(date)}>{getDayLabel(date)}</th>)}</tr></thead><tbody>{activeUsers.map(user => <tr key={user.uid}><td><strong>{user.displayName}</strong><small>{roleDepartment(user.role)}</small></td>{weekDates.map(date => { const schedules = items.filter(item => item.assigneeId === user.uid && isScheduleOnDate(item, date)); return <td key={`${user.uid}-${toDateKey(date)}`}><button type="button" className="work-schedule-week-cell" onClick={() => { setStatusFilter('all'); setAssigneeFilter(user.uid); setActiveTab('tasks'); }}><strong>{schedules.length}</strong><span>{schedules.length ? 'công việc' : 'Trống'}</span></button></td>; })}</tr>)}</tbody></table></div>
    </section>}

    {selectedItem && <div className="work-schedule-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !detailBusy) setSelectedItem(null); }}>
      <section className="work-schedule-detail" role="dialog" aria-modal="true" aria-labelledby="work-schedule-detail-title">
        <header><div><span>Chi tiết công việc</span><h2 id="work-schedule-detail-title">{selectedItem.title}</h2></div><button type="button" className="btn btn-outline" onClick={() => setSelectedItem(null)} disabled={detailBusy}>Đóng</button></header>
        <div className="work-schedule-detail__grid"><div><span>Trạng thái</span><strong className={`work-schedule-status work-schedule-status--${getWorkScheduleDisplayStatus(selectedItem.status)}`}>{WORK_SCHEDULE_DISPLAY_STATUS_LABELS[getWorkScheduleDisplayStatus(selectedItem.status)]}</strong></div><div><span>Mức ưu tiên</span><strong className={`work-schedule-priority work-schedule-priority--${selectedItem.priority}`}>{WORK_SCHEDULE_PRIORITY_LABELS[selectedItem.priority]}</strong></div><div><span>Nhóm công việc</span><strong>{groups.find(group => group.id === inferWorkScheduleGroupId(selectedItem))?.name || selectedItem.groupName || 'Chưa phân nhóm'}</strong></div><div><span>Người thực hiện</span><strong>{selectedItem.assigneeName}</strong></div><div><span>Người giao việc</span><strong>{selectedItem.assignedByName || 'Tự tạo'}</strong></div><div><span>Thời hạn</span><strong>{dateTimeLabel(selectedItem.endAt)}</strong></div><div><span>Phân hệ</span><strong>{WORK_SCHEDULE_REFERENCE_LABELS[selectedItem.referenceType]}</strong></div></div>
        <section className="work-schedule-status-control" aria-labelledby="work-status-title">
          <div><h3 id="work-status-title">Xác nhận tình trạng công việc</h3><p>Có thể thay đổi trạng thái bất cứ lúc nào.</p></div>
          <div className="work-schedule-status-options" role="group" aria-label="Chọn trạng thái công việc">
            {EDITABLE_STATUSES.map(status => { const isActive = getWorkScheduleDisplayStatus(selectedItem.status) === status; return <button key={status} type="button" className={`work-schedule-status-option work-schedule-status-option--${status} ${isActive ? 'is-active' : ''}`} aria-pressed={isActive} onClick={() => requestStatusChange(selectedItem, status)} disabled={detailBusy || isActive}><span aria-hidden="true"/><strong>{WORK_SCHEDULE_STATUS_LABELS[status]}</strong></button>; })}
          </div>
        </section>
        <article><h3>Nội dung công việc</h3><p>{selectedItem.description || 'Chưa có nội dung.'}</p>{selectedItem.requestedByName && <p>Người yêu cầu hỗ trợ: <strong>{selectedItem.requestedByName}</strong></p>}{selectedItem.cannotProcessNote && <div className="work-schedule-failure-note"><strong>Lý do không xử lí được</strong><p>{selectedItem.cannotProcessNote}</p><small>{selectedItem.cannotProcessByName || selectedItem.assigneeName}{selectedItem.cannotProcessAt ? ` · ${dateTimeLabel(selectedItem.cannotProcessAt)}` : ''}</small></div>}</article>
        {detailError && <p className="work-schedule-detail-error" role="alert">{detailError}</p>}
        <footer>
          {selectedItem.referenceId && moduleFromReference(selectedItem.referenceType) && <button type="button" className="btn btn-outline" onClick={() => openSource(selectedItem)} disabled={detailBusy}>Mở hồ sơ khách hàng</button>}
          {canPermanentlyDeleteWorkSchedule(currentUser.role, selectedItem.status) && <button type="button" className="btn btn-outline work-schedule-delete" onClick={() => void deleteCompletedTask(selectedItem)} disabled={detailBusy}>Xóa vĩnh viễn</button>}
          <button type="button" className="btn btn-outline" onClick={() => openEdit(selectedItem)} disabled={detailBusy}>Chỉnh sửa</button>
        </footer>
      </section>
    </div>}

    {statusNoteItem && <div className="work-schedule-modal-overlay work-schedule-status-note-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !detailBusy) setStatusNoteItem(null); }}>
      <form className="work-schedule-modal work-schedule-status-note-modal" role="dialog" aria-modal="true" aria-labelledby="work-status-note-title" onSubmit={event => { event.preventDefault(); void updateStatus(statusNoteItem, 'cannot_process', statusNote); }}>
        <header><div><strong id="work-status-note-title">Xác nhận không xử lí được</strong><span>Lý do sẽ được lưu trong công việc và gửi tới tài khoản quản lý.</span></div><button type="button" className="btn btn-outline" onClick={() => setStatusNoteItem(null)} disabled={detailBusy}>Đóng</button></header>
        <div className="work-schedule-form-grid"><label className="is-wide">Lý do *<textarea autoFocus rows={5} maxLength={500} value={statusNote} onChange={event => { setStatusNote(event.target.value); setStatusNoteError(''); }} placeholder="Nêu rõ trở ngại hoặc nguyên nhân không thể xử lí công việc này..." aria-invalid={Boolean(statusNoteError)} /></label>{statusNoteError && <div className="work-schedule-form-error is-wide" role="alert">{statusNoteError}</div>}<small className="work-schedule-note-count is-wide">{statusNote.length}/500 ký tự</small></div>
        <footer><button type="button" className="btn btn-outline" onClick={() => setStatusNoteItem(null)} disabled={detailBusy}>Hủy</button><button type="submit" className="btn btn-primary" disabled={detailBusy}>{detailBusy ? 'Đang xác nhận...' : 'Xác nhận trạng thái'}</button></footer>
      </form>
    </div>}

    {isFormOpen && <div className="work-schedule-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setIsFormOpen(false); }}>
      <form className="work-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="work-schedule-form-title" onSubmit={saveTask} noValidate>
        <header><div><strong id="work-schedule-form-title">{editingItem ? 'Cập nhật công việc' : 'Tạo công việc'}</strong><span>Nhập rõ nội dung, người phụ trách và thời hạn.</span></div><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)} disabled={saving}>Đóng</button></header>
        <div className="work-schedule-form-grid">
          {formError && <div className="work-schedule-form-error is-wide" role="alert">{formError}</div>}
          <label>Nhóm công việc *<select name="groupId" aria-required="true" aria-invalid={Boolean(formFieldErrors.groupId)} value={form.groupId} onChange={event => updateFormField('groupId', event.target.value)}><option value="">Chọn nhóm công việc</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{formFieldErrors.groupId && <small>{formFieldErrors.groupId}</small>}</label>
          <label>Tên công việc *<input name="title" autoFocus aria-required="true" aria-invalid={Boolean(formFieldErrors.title)} value={form.title} onChange={event => updateFormField('title', event.target.value)} />{formFieldErrors.title && <small>{formFieldErrors.title}</small>}</label>
          {isAdmin && <label>Người thực hiện *<select name="assigneeId" aria-required="true" aria-invalid={Boolean(formFieldErrors.assigneeId)} value={form.assigneeId} onChange={event => updateFormField('assigneeId', event.target.value)}><option value="">Chọn nhân sự</option>{users.filter(user => user.active !== false).map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select>{formFieldErrors.assigneeId && <small>{formFieldErrors.assigneeId}</small>}</label>}
          <label>Thời hạn *<input name="dueAt" type="datetime-local" aria-required="true" aria-invalid={Boolean(formFieldErrors.dueAt)} value={form.dueAt} onChange={event => updateFormField('dueAt', event.target.value)} />{formFieldErrors.dueAt && <small>{formFieldErrors.dueAt}</small>}</label>
          <label className="is-wide">Nội dung công việc *<textarea name="description" rows={4} aria-required="true" aria-invalid={Boolean(formFieldErrors.description)} value={form.description} onChange={event => updateFormField('description', event.target.value)} />{formFieldErrors.description && <small>{formFieldErrors.description}</small>}</label>
          <label>Phân hệ liên kết<select value={form.referenceType} onChange={event => setForm(previous => ({ ...previous, referenceType: event.target.value as WorkScheduleReferenceType, referenceId: '', referenceLabel: '' }))}><option value="none">Không liên kết</option><option value="lead_candidate">Dữ liệu thô</option><option value="lead">Tiềm năng</option><option value="customer">Khách hàng</option></select></label>
          <label>Khách hàng<select disabled={form.referenceType === 'none'} value={form.referenceId} onChange={event => handleReferenceChange(event.target.value)}><option value="">Chọn khách hàng</option>{sourceOptions.map(item => <option key={item.id} value={item.id}>{item.companyName || item.id}</option>)}</select></label>
          <label>Mức ưu tiên<select value={form.priority} onChange={event => setForm(previous => ({ ...previous, priority: event.target.value as WorkSchedulePriority }))}><option value="normal">Bình thường</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option></select></label>
        </div>
        <footer><button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)} disabled={saving}>Hủy</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu công việc'}</button></footer>
      </form>
    </div>}

    {groupDialog && selectedGroup && <div className="work-schedule-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !groupBusy) setGroupDialog(null); }}>
      <form className="work-schedule-modal work-schedule-group-modal" role="dialog" aria-modal="true" aria-labelledby="work-group-title" onSubmit={saveGroup}>
        <header><div><strong id="work-group-title">{groupDialog === 'create' ? 'Thêm nhóm công việc' : 'Quản lý nhóm công việc'}</strong><span>{groupDialog === 'create' ? 'Tạo nhóm trước khi thêm công việc bên trong.' : `${groupCounts[selectedGroup.id] || 0} công việc đang thuộc nhóm này.`}</span></div><button type="button" className="btn btn-outline" onClick={() => setGroupDialog(null)} disabled={groupBusy}>Đóng</button></header>
        <div className="work-schedule-form-grid"><label className="is-wide">Tên nhóm *<input autoFocus value={groupNameDraft} onChange={event => { setGroupNameDraft(event.target.value); setGroupError(''); }} /></label>{groupError && <div className="work-schedule-form-error is-wide" role="alert">{groupError}</div>}</div>
        <footer>{groupDialog === 'rename' && <button type="button" className="btn btn-outline work-schedule-delete" onClick={() => void deleteGroup()} disabled={groupBusy || (groupCounts[selectedGroup.id] || 0) > 0}>Xóa nhóm</button>}<button type="button" className="btn btn-outline" onClick={() => setGroupDialog(null)} disabled={groupBusy}>Hủy</button><button type="submit" className="btn btn-primary" disabled={groupBusy}>{groupBusy ? 'Đang lưu...' : 'Lưu nhóm'}</button></footer>
      </form>
    </div>}
  </div>;
};
