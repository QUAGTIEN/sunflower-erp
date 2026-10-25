import { TableSkeleton } from '@/components/LoadingStates';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, KanbanSquare, List, Plus, Search, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataFilterButton, DataFilterPanel } from '@/components/DataWorkspaceFilters';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import {
  WORK_SCHEDULE_DEPARTMENT_LABELS,
  DEFAULT_WORK_SCHEDULE_GROUPS,
  WORK_SCHEDULE_DISPLAY_STATUS_LABELS,
  WORK_SCHEDULE_PRIORITY_LABELS,
  WORK_SCHEDULE_REFERENCE_LABELS,
  WORK_SCHEDULE_STATUS_LABELS,
  WORK_SCHEDULE_WORK_TYPE_LABELS,
  canPermanentlyDeleteWorkSchedule,
  compareWorkScheduleItems,
  getWorkScheduleDisplayStatus,
  getWeekStart,
  inferWorkScheduleGroupId,
  isScheduleOnDate,
  normalizeWorkScheduleRecords,
  toDateKey,
  type WorkSchedulePriority,
  type WorkScheduleRecord,
  type WorkScheduleReferenceType,
  type WorkScheduleStatus,
  type WorkScheduleDisplayStatus,
  type WorkScheduleWorkType
} from '@/features/work-schedule/model/workScheduleModels';
import './WorkSchedule.css';

type CustomerEntity = { id: string; companyName?: string };
type SourceModule = 'customer_data' | 'leads' | 'crm';
type PeriodFilter = 'this_month' | 'next_30_days' | 'range' | 'all';

interface WorkScheduleProps {
  currentUser: UserProfile;
  users: UserProfile[];
  candidates?: CustomerEntity[];
  leads?: CustomerEntity[];
  customers?: CustomerEntity[];
  onOpenRecord?: (module: SourceModule, id: string) => void;
  initialGroupId?: string;
  onInitialGroupConsumed?: () => void;
}

interface ScheduleFormState {
  groupId: string;
  workType: WorkScheduleWorkType;
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
const ACTIVE_STATUSES: WorkScheduleStatus[] = [
  'not_started',
  'in_progress',
  'waiting_customer',
  'support_requested',
  'awaiting_confirmation',
  'paused'
];
const PAGE_REFERENCE_TIME = Date.now();
const EDITABLE_STATUSES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'completed', 'cannot_process'];
const localDateTime = (value: Date) =>
  new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const defaultDeadline = () => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(17, 0, 0, 0);
  return localDateTime(value);
};
const defaultForm = (assigneeId = '', groupId = ''): ScheduleFormState => ({
  groupId,
  workType: 'other',
  title: '',
  assigneeId,
  dueAt: defaultDeadline(),
  description: '',
  priority: 'normal',
  referenceType: 'none',
  referenceId: '',
  referenceLabel: '',
  status: 'not_started'
});
const roleDepartment = (role: UserProfile['role']) => WORK_SCHEDULE_DEPARTMENT_LABELS[role] || role;
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    : '—';
};
const getDayLabel = (date: Date) =>
  date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' });
const moduleFromReference = (referenceType: WorkScheduleReferenceType): SourceModule | '' =>
  referenceType === 'lead_candidate'
    ? 'customer_data'
    : referenceType === 'lead'
      ? 'leads'
      : referenceType === 'customer'
        ? 'crm'
        : '';
const isTaskOverdue = (item: WorkScheduleRecord, referenceTime: number) =>
  ACTIVE_STATUSES.includes(item.status) && new Date(item.endAt).getTime() < referenceTime;
const isTaskDueToday = (item: WorkScheduleRecord, referenceTime: number) =>
  ACTIVE_STATUSES.includes(item.status) &&
  new Date(item.endAt).getTime() >= referenceTime &&
  new Date(item.endAt).toDateString() === new Date(referenceTime).toDateString();
const isInPeriod = (
  item: WorkScheduleRecord,
  period: PeriodFilter,
  referenceTime: number,
  dateFrom: string,
  dateTo: string
) => {
  if (period === 'all') return true;
  const due = new Date(item.endAt);
  if (!Number.isFinite(due.getTime())) return false;
  if (period === 'range') {
    const dueKey = toDateKey(due);
    return (!dateFrom || dueKey >= dateFrom) && (!dateTo || dueKey <= dateTo);
  }
  const reference = new Date(referenceTime);
  if (period === 'this_month')
    return due.getMonth() === reference.getMonth() && due.getFullYear() === reference.getFullYear();
  return due.getTime() >= referenceTime && due.getTime() <= referenceTime + 30 * 86_400_000;
};
const isErrorMessage = (value: string) => /^(Không thể|Vui lòng|Chưa có)|\bcòn \d+ công việc/.test(value);

export const WorkSchedule: React.FC<WorkScheduleProps> = ({
  currentUser,
  users,
  candidates = [],
  leads = [],
  customers = [],
  onOpenRecord,
  initialGroupId = '',
  onInitialGroupConsumed
}) => {
  const isAdmin = currentUser.role === 'admin';
  const now = PAGE_REFERENCE_TIME;
  const [items, setItems] = useState<WorkScheduleRecord[]>([]);
  const groups = DEFAULT_WORK_SCHEDULE_GROUPS;
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || 'boss_to_staff');
  const [activeTab, setActiveTab] = useState<'tasks' | 'week'>('tasks');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | WorkScheduleDisplayStatus>('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [weekAnchor, setWeekAnchor] = useState(() => getWeekStart(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorkScheduleRecord | null>(null);
  const [selectedItem, setSelectedItem] = useState<WorkScheduleRecord | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(() =>
    defaultForm(isAdmin ? '' : currentUser.uid, isAdmin ? 'boss_to_staff' : 'self')
  );
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
      const [data, created] = await Promise.all([
        isAdmin
          ? dbService.getCollection('work_schedule_items')
          : dbService.getCollectionByField('work_schedule_items', 'assigneeId', currentUser.uid),
        isAdmin
          ? Promise.resolve([])
          : dbService.getCollectionByField('work_schedule_items', 'assignedById', currentUser.uid)
      ]);
      setItems(
        normalizeWorkScheduleRecords([...new Map([...data, ...created].map(item => [item.id, item])).values()]).filter(
          item => !item.deleted
        )
      );
    } catch {
      setMessage('Không thể tải danh sách công việc. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.uid, isAdmin]);

  useEffect(() => {
    // Loading is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadItems();
  }, [loadItems]);
  useEffect(() => {
    if (!initialGroupId || !groups.some(group => group.id === initialGroupId)) return;
    onInitialGroupConsumed?.();
  }, [groups, initialGroupId, onInitialGroupConsumed]);
  useEffect(() => {
    if (!message || isErrorMessage(message)) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 4_000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekAnchor);
        date.setDate(date.getDate() + index);
        return date;
      }),
    [weekAnchor]
  );
  const activeUsers = useMemo(() => users.filter(user => user.active !== false), [users]);
  const sourceOptions = useMemo(() => {
    if (form.referenceType === 'lead_candidate') return candidates;
    if (form.referenceType === 'lead') return leads;
    if (form.referenceType === 'customer') return customers;
    return [];
  }, [candidates, customers, form.referenceType, leads]);
  const selectedGroup = groups.find(group => group.id === selectedGroupId) || groups[0] || null;
  const creatableGroups = groups.filter(
    group =>
      group.id !== 'automatic' &&
      (isAdmin
        ? ['boss_to_staff', 'self'].includes(group.id)
        : ['staff_to_company', 'staff_to_staff', 'self'].includes(group.id))
  );
  const effectiveGroupId = selectedGroup?.id || '';
  const groupCounts = useMemo(
    () =>
      Object.fromEntries(
        groups.map(group => [group.id, items.filter(item => inferWorkScheduleGroupId(item) === group.id).length])
      ),
    [groups, items]
  );
  const groupItems = useMemo(
    () => items.filter(item => inferWorkScheduleGroupId(item) === effectiveGroupId),
    [effectiveGroupId, items]
  );
  const metrics = useMemo(
    () => ({
      in_progress: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'in_progress').length,
      not_started: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'not_started').length,
      cannot_process: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'cannot_process').length,
      completed: groupItems.filter(item => getWorkScheduleDisplayStatus(item.status) === 'completed').length,
      support: groupItems.filter(item => item.status === 'support_requested').length,
      overdue: groupItems.filter(item => isTaskOverdue(item, now)).length,
      dueToday: groupItems.filter(item => isTaskDueToday(item, now)).length,
      awaitingConfirmation: groupItems.filter(item => item.status === 'awaiting_confirmation').length
    }),
    [groupItems, now]
  );
  const activeFilterCount =
    (assigneeFilter !== 'all' ? 1 : 0) +
    (workTypeFilter !== 'all' ? 1 : 0) +
    (moduleFilter !== 'all' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (periodFilter !== 'all' ? 1 : 0);
  const filteredItems = useMemo(
    () =>
      groupItems
        .filter(item => {
          const text =
            `${item.title} ${item.referenceLabel} ${item.assigneeName} ${item.assignedByName} ${item.description}`.toLocaleLowerCase(
              'vi-VN'
            );
          if (searchTerm.trim() && !text.includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))) return false;
          if (assigneeFilter !== 'all' && item.assigneeId !== assigneeFilter) return false;
          if (moduleFilter !== 'all' && item.referenceType !== moduleFilter) return false;
          if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
          if (workTypeFilter !== 'all' && item.workType !== workTypeFilter) return false;
          if (statusFilter !== 'all' && getWorkScheduleDisplayStatus(item.status) !== statusFilter) return false;
          if (!isInPeriod(item, periodFilter, now, dateFrom, dateTo)) return false;
          return true;
        })
        .sort((leftItem, rightItem) => {
          return compareWorkScheduleItems(leftItem, rightItem);
        }),
    [
      assigneeFilter,
      groupItems,
      moduleFilter,
      periodFilter,
      dateFrom,
      dateTo,
      priorityFilter,
      workTypeFilter,
      searchTerm,
      statusFilter,
      now
    ]
  );
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
    setWorkTypeFilter('all');
    setStatusFilter('all');
    setPeriodFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };
  const openCreate = () => {
    if (!creatableGroups.length) return;
    setEditingItem(null);
    const groupId = creatableGroups.some(group => group.id === selectedGroupId)
      ? selectedGroupId
      : creatableGroups[0].id;
    setForm(defaultForm(groupId === 'self' ? currentUser.uid : '', groupId));
    setFormError('');
    setFormFieldErrors({});
    setMessage('');
    setIsFormOpen(true);
  };
  const openEdit = (item: WorkScheduleRecord) => {
    setEditingItem(item);
    setForm({
      groupId: inferWorkScheduleGroupId(item),
      workType: item.workType,
      title: item.title,
      assigneeId: item.assigneeId,
      dueAt: localDateTime(new Date(item.endAt)),
      description: item.description,
      priority: item.priority,
      referenceType: item.referenceType,
      referenceId: item.referenceId,
      referenceLabel: item.referenceLabel,
      status: item.status
    });
    setFormError('');
    setFormFieldErrors({});
    setMessage('');
    setIsFormOpen(true);
  };
  const updateFormField = <K extends keyof ScheduleFormState>(field: K, value: ScheduleFormState[K]) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setFormError('');
    if (
      field === 'groupId' ||
      field === 'title' ||
      field === 'assigneeId' ||
      field === 'dueAt' ||
      field === 'description'
    ) {
      setFormFieldErrors(previous => ({ ...previous, [field]: undefined }));
    }
  };
  const handleReferenceChange = (id: string) => {
    const selected = sourceOptions.find(item => item.id === id);
    setForm(previous => ({ ...previous, referenceId: id, referenceLabel: selected?.companyName || '' }));
  };
  const saveTask = async (event: React.FormEvent) => {
    return runMutationAction(
      'WorkSchedulePage.tsx:saveTask',
      async () => {
        event.preventDefault();
        const targetAssigneeId =
          editingItem?.assigneeId || (form.groupId === 'self' ? currentUser.uid : form.assigneeId);
        const assignee = (editingItem ? users : activeUsers).find(user => user.uid === targetAssigneeId);
        const taskGroup = groups.find(group => group.id === form.groupId);
        const endAt = new Date(form.dueAt);
        const errors: Partial<Record<RequiredTaskField, string>> = {};
        if (
          !taskGroup ||
          taskGroup.id === 'automatic' ||
          (!editingItem && !creatableGroups.some(group => group.id === taskGroup.id))
        )
          errors.groupId = 'Vui lòng chọn nhóm công việc phù hợp.';
        if (!form.title.trim()) errors.title = 'Vui lòng nhập tên công việc.';
        if (
          !assignee ||
          (!editingItem &&
            ((form.groupId === 'staff_to_company' && assignee.role !== 'admin') ||
              (form.groupId === 'staff_to_staff' && (assignee.role === 'admin' || assignee.uid === currentUser.uid)) ||
              (form.groupId === 'boss_to_staff' && (assignee.role === 'admin' || assignee.uid === currentUser.uid))))
        )
          errors.assigneeId = 'Vui lòng chọn người thực hiện phù hợp với nhóm công việc.';
        if (!form.dueAt || !Number.isFinite(endAt.getTime())) errors.dueAt = 'Vui lòng chọn thời hạn hợp lệ.';
        if (!form.description.trim()) errors.description = 'Vui lòng nhập nội dung công việc.';
        const firstInvalidField = (
          ['groupId', 'title', 'assigneeId', 'dueAt', 'description'] as RequiredTaskField[]
        ).find(field => errors[field]);
        if (firstInvalidField || !assignee || !taskGroup) {
          setFormFieldErrors(errors);
          setFormError('Hãy bổ sung các trường được đánh dấu để lưu công việc.');
          if (firstInvalidField)
            event.currentTarget.querySelector<HTMLElement>(`[name="${firstInvalidField}"]`)?.focus();
          return;
        }
        setFormFieldErrors({});
        setFormError('');
        setSaving(true);
        setMessage('');
        const currentTime = new Date();
        const taskStatus: WorkScheduleStatus = editingItem ? form.status : 'not_started';
        const payload = {
          title: form.title.trim(),
          description: form.description.trim(),
          stage: '',
          assigneeId: assignee.uid,
          assigneeName: assignee.displayName,
          department: roleDepartment(assignee.role),
          assignedById: editingItem?.assignedById || currentUser.uid,
          assignedByName: editingItem?.assignedByName || currentUser.displayName,
          requestedById: editingItem?.requestedById || '',
          requestedByName: editingItem?.requestedByName || '',
          startAt: editingItem?.startAt || currentTime.toISOString(),
          endAt: endAt.toISOString(),
          status: taskStatus,
          progress: taskStatus === 'completed' ? 100 : taskStatus === 'not_started' ? 0 : 50,
          referenceType: form.referenceType,
          referenceId: form.referenceId,
          referenceLabel: form.referenceLabel,
          notes: editingItem?.notes || '',
          priority: form.priority,
          taskType:
            editingItem?.taskType ||
            (taskGroup.id === 'staff_to_company'
              ? 'support_request'
              : taskGroup.id === 'self'
                ? 'personal_task'
                : 'assigned_task'),
          ...(editingItem ? {} : { groupId: taskGroup.id, groupName: taskGroup.name }),
          workType: form.workType,
          updatedAt: currentTime.toISOString(),
          completedAt: taskStatus === 'completed' ? editingItem?.completedAt || currentTime.toISOString() : null,
          deleted: false
        };
        try {
          const saved = editingItem
            ? await requireConfirmedMutation(
                dbService.updateDocument('work_schedule_items', editingItem.id, payload)
              ).then(() => ({ ...editingItem, ...payload }))
            : await dbService.addDocument('work_schedule_items', {
                id: `schedule-${currentTime.getTime()}-${currentUser.uid}`,
                ...payload,
                createdAt: currentTime.toISOString()
              });
          const normalized = normalizeWorkScheduleRecords([saved])[0];
          setItems(previous =>
            editingItem
              ? previous.map(item => (item.id === editingItem.id ? normalized : item))
              : [...previous, normalized]
          );
          if (normalized.assigneeId !== currentUser.uid) {
            void dbService
              .addDocument('notifications', {
                id: `task-${normalized.id}-${normalized.assigneeId}-${currentTime.getTime()}`,
                schemaVersion: 1,
                recipientId: normalized.assigneeId,
                module: 'system',
                eventType: editingItem ? 'work_schedule_updated' : 'work_schedule_assigned',
                eventKey: `work_schedule:${normalized.id}:${editingItem ? 'updated' : 'assigned'}:${currentTime.getTime()}`,
                entityId: normalized.id,
                entityCode: normalized.referenceLabel || normalized.title,
                title: editingItem ? 'Công việc được cập nhật' : 'Bạn được giao công việc',
                message: `${normalized.title} · hạn ${dateTimeLabel(normalized.endAt)}`,
                createdAt: currentTime.toISOString(),
                createdById: currentUser.uid,
                source: 'manual',
                readAt: null
              })
              .catch(() => undefined);
          }
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'system',
            action: editingItem ? 'work_schedule_updated' : 'work_schedule_created',
            summary: `${editingItem ? 'Cập nhật' : 'Tạo'} công việc “${normalized.title}”`,
            targetType: 'work_schedule',
            targetId: normalized.id,
            targetLabel: normalized.title,
            pageId: 'work_schedule'
          });
          setIsFormOpen(false);
          setSelectedItem(normalized);
          setMessage(
            editingItem
              ? 'Đã cập nhật công việc.'
              : taskGroup.id === 'self'
                ? 'Đã tạo công việc cá nhân.'
                : 'Đã giao công việc.'
          );

          showSuccessToast(editingItem ? 'Đã lưu thành công' : 'Đã thêm thành công');
        } catch (error) {
          showErrorToast();
          const permissionDenied =
            typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';
          setFormError(
            permissionDenied
              ? 'Tài khoản chưa được cấp quyền lưu công việc. Vui lòng liên hệ quản trị viên.'
              : 'Không thể lưu công việc. Vui lòng kiểm tra kết nối và thử lại.'
          );
        } finally {
          setSaving(false);
        }
      },
      event
    );
  };
  const updateStatus = async (item: WorkScheduleRecord, status: WorkScheduleStatus, failureNote: string = '') => {
    return runMutationAction(
      'WorkSchedulePage.tsx:updateStatus',
      async () => {
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
          const failureFields =
            status === 'cannot_process'
              ? {
                  cannotProcessNote: trimmedFailureNote,
                  cannotProcessAt: updatedAt,
                  cannotProcessById: currentUser.uid,
                  cannotProcessByName: currentUser.displayName
                }
              : {};
          await requireConfirmedMutation(
            dbService.updateDocument('work_schedule_items', item.id, {
              status,
              progress,
              updatedAt,
              completedAt,
              ...failureFields
            })
          );
          if (status === 'cannot_process' && !isAdmin) {
            const eventKey = `work_schedule:cannot_process:${item.id}:${updatedAt}`;
            await Promise.all(
              activeAdmins.map(admin =>
                dbService.addDocument('notifications', {
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
                })
              )
            );
          }
          const updated = {
            ...item,
            status,
            progress,
            updatedAt,
            completedAt: completedAt || undefined,
            ...failureFields
          };
          setItems(previous => previous.map(current => (current.id === item.id ? updated : current)));
          setSelectedItem(previous => (previous?.id === item.id ? updated : previous));
          setStatusNoteItem(null);
          setStatusNote('');
          setStatusNoteError('');
          setMessage(`Đã chuyển công việc sang trạng thái ${WORK_SCHEDULE_STATUS_LABELS[status].toLowerCase()}.`);

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          const errorMessage =
            status === 'cannot_process'
              ? 'Không thể lưu trạng thái hoặc gửi thông báo cho quản lý. Vui lòng thử lại.'
              : 'Không thể cập nhật trạng thái công việc. Vui lòng thử lại.';
          if (statusNoteItem) setStatusNoteError(errorMessage);
          else setDetailError(errorMessage);
        } finally {
          setDetailBusy(false);
        }
      },
      item
    );
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
    return runMutationAction(
      'WorkSchedulePage.tsx:deleteCompletedTask',
      async () => {
        if (!canPermanentlyDeleteWorkSchedule(currentUser.role, item.status) || detailBusy) return;
        if (!(await confirmDelete(`Xóa vĩnh viễn công việc “${item.title}”? Thao tác này không thể hoàn tác.`))) return;
        setDetailBusy(true);
        setDetailError('');
        setMessage('');
        try {
          const deleted = await requireConfirmedMutation(dbService.deleteDocument('work_schedule_items', item.id));
          if (!deleted) throw new Error('Work schedule item was not deleted');
          setItems(previous => previous.filter(current => current.id !== item.id));
          setSelectedItem(null);
          setMessage('Đã xóa vĩnh viễn công việc.');
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'system',
            action: 'work_schedule_deleted',
            summary: `Xóa vĩnh viễn công việc “${item.title}”`,
            targetType: 'work_schedule',
            targetId: item.id,
            targetLabel: item.title,
            pageId: 'work_schedule'
          });

          showSuccessToast('Đã xóa thành công');
        } catch {
          showErrorToast();
          setDetailError('Không thể xóa công việc. Vui lòng thử lại.');
        } finally {
          setDetailBusy(false);
        }
      },
      item
    );
  };
  const openSource = (item: WorkScheduleRecord) => {
    const module = moduleFromReference(item.referenceType);
    if (module && item.referenceId) onOpenRecord?.(module, item.referenceId);
  };
  return (
    <div className="work-schedule-page">
      <PageContextHeader section="Công việc" current={activeTab === 'week' ? 'Lịch tuần' : 'Danh sách'} />

      <div className="work-schedule-tabs" role="tablist">
        <div className="work-schedule-tab-list">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tasks'}
            className={activeTab === 'tasks' ? 'is-active' : ''}
            onClick={() => setActiveTab('tasks')}
          >
            Công việc
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'week'}
            className={activeTab === 'week' ? 'is-active' : ''}
            onClick={() => setActiveTab('week')}
          >
            Lịch tuần
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`work-schedule-message ${isErrorMessage(message) ? 'is-error' : 'is-success'}`}
          role={isErrorMessage(message) ? 'alert' : 'status'}
        >
          {isErrorMessage(message) ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span>{message}</span>
          <button type="button" aria-label="Đóng thông báo" onClick={() => setMessage('')}>
            <X size={15} />
          </button>
        </div>
      )}

      {activeTab === 'tasks' ? (
        <>
          <dl className="work-schedule-summary" aria-label={`Tình hình công việc: ${selectedGroup?.name || ''}`}>
            <div className="work-schedule-summary__item is-danger">
              <dt>Quá hạn</dt>
              <dd>{metrics.overdue}</dd>
            </div>
            <div className="work-schedule-summary__item is-warning">
              <dt>Đến hạn hôm nay</dt>
              <dd>{metrics.dueToday}</dd>
            </div>
            <div className="work-schedule-summary__item">
              <dt>Đang xử lí</dt>
              <dd>{metrics.in_progress}</dd>
            </div>
            <div className="work-schedule-summary__item">
              <dt>Chờ xác nhận</dt>
              <dd>{metrics.awaitingConfirmation}</dd>
            </div>
          </dl>
          <section className="work-schedule-card work-schedule-group-content">
            <div className="work-schedule-toolbar">
              <label className="work-schedule-search">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Tìm công việc, khách hàng, người nhận"
                  placeholder="Tìm công việc, khách hàng, người nhận..."
                  value={searchTerm}
                  onChange={event => setFilterAndFirstPage(setSearchTerm, event.target.value)}
                />
              </label>
              <select
                className="work-schedule-assignee-select work-schedule-group-select"
                aria-label="Nhóm công việc"
                value={effectiveGroupId}
                onChange={event => setFilterAndFirstPage(setSelectedGroupId, event.target.value)}
              >
                {groups.map(group => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({groupCounts[group.id] || 0})
                  </option>
                ))}
              </select>
              {isAdmin && (
                <select
                  className="work-schedule-assignee-select"
                  aria-label="Nhân sự"
                  value={assigneeFilter}
                  onChange={event => setFilterAndFirstPage(setAssigneeFilter, event.target.value)}
                >
                  <option value="all">Nhân sự: Tất cả</option>
                  {activeUsers.map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              )}
              <select
                className="work-schedule-assignee-select"
                aria-label="Thời gian"
                value={periodFilter}
                onChange={event => setFilterAndFirstPage(setPeriodFilter, event.target.value as PeriodFilter)}
              >
                <option value="all">Tất cả thời gian</option>
                <option value="this_month">Tháng này</option>
                <option value="next_30_days">30 ngày tới</option>
                <option value="range">Khoảng ngày</option>
              </select>
              {periodFilter === 'range' && (
                <span className="work-schedule-date-range">
                  <input
                    aria-label="Từ ngày"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={event => {
                      setDateFrom(event.target.value);
                      setPage(1);
                    }}
                  />
                  <span>–</span>
                  <input
                    aria-label="Đến ngày"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={event => {
                      setDateTo(event.target.value);
                      setPage(1);
                    }}
                  />
                </span>
              )}
              <DataFilterButton
                activeCount={activeFilterCount}
                open={showFilters}
                onClick={() => setShowFilters(true)}
              />
              <div className="work-schedule-view-switch" role="group" aria-label="Kiểu hiển thị">
                <IconButton
                  label="Danh sách"
                  icon={<List />}
                  active={viewMode === 'list'}
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                />
                <IconButton
                  label="Kanban"
                  icon={<KanbanSquare />}
                  active={viewMode === 'kanban'}
                  aria-pressed={viewMode === 'kanban'}
                  onClick={() => setViewMode('kanban')}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary work-schedule-create"
                onClick={openCreate}
                disabled={!creatableGroups.length}
              >
                <Plus size={15} />
                Tạo công việc
              </button>
              {(activeFilterCount > 0 || searchTerm) && (
                <button type="button" className="work-schedule-clear" onClick={clearFilters}>
                  Xóa bộ lọc
                </button>
              )}
            </div>
            <div className="work-schedule-status-filters" aria-label="Lọc nhanh theo trạng thái">
              <button
                type="button"
                className={`work-schedule-status-filter ${statusFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => {
                  setStatusFilter('all');
                  setPage(1);
                }}
              >
                Tất cả <strong>{groupItems.length}</strong>
              </button>
              {(Object.keys(WORK_SCHEDULE_DISPLAY_STATUS_LABELS) as WorkScheduleDisplayStatus[]).map(status => (
                <button
                  key={status}
                  type="button"
                  className={`work-schedule-status-filter ${statusFilter === status ? 'is-active' : ''}`}
                  onClick={() => setFilterAndFirstPage(setStatusFilter, statusFilter === status ? 'all' : status)}
                >
                  <span>{WORK_SCHEDULE_DISPLAY_STATUS_LABELS[status]}</span>
                  <strong>{metrics[status]}</strong>
                </button>
              ))}
            </div>
            {metrics.support > 0 && (
              <div className="work-schedule-support-alert">
                <AlertCircle size={16} />
                <span>
                  <strong>{metrics.support} yêu cầu hỗ trợ</strong> đang chờ xử lí trong nhóm này
                </span>
              </div>
            )}
            {viewMode === 'list' ? (
              <div className="work-schedule-table-wrap">
                <table className="work-schedule-table work-schedule-task-table">
                  <thead>
                    <tr>
                      <th>Công việc</th>
                      <th>Nhóm công việc</th>
                      <th>Loại công việc</th>
                      <th>Người giao</th>
                      <th>Người nhận</th>
                      <th>Khách hàng / Phòng ban</th>
                      <th>Hạn xử lý</th>
                      <th>Ưu tiên</th>
                      <th>Trạng thái</th>
                      <th>Tiến độ</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!isLoading &&
                      pageItems.map(item => {
                        const displayStatus = getWorkScheduleDisplayStatus(item.status);
                        return (
                          <tr
                            key={item.id}
                            className={`${isTaskOverdue(item, now) ? 'is-overdue ' : ''}is-clickable`}
                            tabIndex={0}
                            role="button"
                            aria-label={`Xem chi tiết công việc ${item.title}`}
                            onClick={() => {
                              setDetailError('');
                              setSelectedItem(item);
                            }}
                            onKeyDown={event => {
                              if (event.currentTarget !== event.target) return;
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setDetailError('');
                                setSelectedItem(item);
                              }
                            }}
                          >
                            <td>
                              <strong title={item.title}>{item.title}</strong>
                              <small title={item.description}>{item.description || 'Chưa có mô tả'}</small>
                            </td>
                            <td
                              title={
                                groups.find(group => group.id === inferWorkScheduleGroupId(item))?.name ||
                                item.groupName
                              }
                            >
                              {groups.find(group => group.id === inferWorkScheduleGroupId(item))?.name ||
                                item.groupName}
                            </td>
                            <td>{WORK_SCHEDULE_WORK_TYPE_LABELS[item.workType]}</td>
                            <td title={item.assignedByName || 'Hệ thống'}>{item.assignedByName || 'Hệ thống'}</td>
                            <td title={item.assigneeName}>{item.assigneeName}</td>
                            <td title={item.referenceLabel || item.department}>
                              {item.referenceLabel || item.department || '—'}
                            </td>
                            <td>
                              <strong>{dateTimeLabel(item.endAt)}</strong>
                              {isTaskOverdue(item, now) && (
                                <small className="work-schedule-text--danger">Đã quá hạn</small>
                              )}
                            </td>
                            <td>
                              <span className={`work-schedule-priority work-schedule-priority--${item.priority}`}>
                                {WORK_SCHEDULE_PRIORITY_LABELS[item.priority]}
                              </span>
                            </td>
                            <td>
                              <span className={`work-schedule-status work-schedule-status--${displayStatus}`}>
                                {WORK_SCHEDULE_DISPLAY_STATUS_LABELS[displayStatus]}
                              </span>
                            </td>
                            <td>
                              <div className="work-schedule-progress" aria-label={`${item.progress}% hoàn thành`}>
                                <span style={{ width: `${item.progress}%` }} />
                              </div>
                              <small>{item.progress}%</small>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="work-schedule-row-action"
                                onClick={event => {
                                  event.stopPropagation();
                                  setDetailError('');
                                  setSelectedItem(item);
                                }}
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {isLoading && <TableSkeleton label="Đang tải công việc" columns={8} rows={6} />}
                {!isLoading && pageItems.length === 0 && (
                  <div className="work-schedule-empty">
                    <span className="work-schedule-empty__icon" aria-hidden="true">
                      <ClipboardList size={42} />
                    </span>
                    <strong>Chưa có công việc phù hợp trong nhóm này.</strong>
                    <small>Hãy thử chọn nhóm khác hoặc thay đổi điều kiện lọc.</small>
                  </div>
                )}
              </div>
            ) : (
              <div className="work-schedule-kanban">
                {(Object.keys(WORK_SCHEDULE_DISPLAY_STATUS_LABELS) as WorkScheduleDisplayStatus[]).map(status => (
                  <section key={status} className="work-schedule-kanban-column">
                    <h3>
                      {WORK_SCHEDULE_DISPLAY_STATUS_LABELS[status]}{' '}
                      <span>
                        {filteredItems.filter(item => getWorkScheduleDisplayStatus(item.status) === status).length}
                      </span>
                    </h3>
                    {filteredItems
                      .filter(item => getWorkScheduleDisplayStatus(item.status) === status)
                      .map(item => (
                        <button
                          key={item.id}
                          type="button"
                          className="work-schedule-kanban-card"
                          onClick={() => {
                            setDetailError('');
                            setSelectedItem(item);
                          }}
                        >
                          <strong title={item.title}>{item.title}</strong>
                          <span>
                            {WORK_SCHEDULE_WORK_TYPE_LABELS[item.workType]} · {item.assigneeName}
                          </span>
                          <small>{dateTimeLabel(item.endAt)}</small>
                        </button>
                      ))}
                    {!isLoading &&
                      filteredItems.every(item => getWorkScheduleDisplayStatus(item.status) !== status) && (
                        <p>Chưa có công việc</p>
                      )}
                  </section>
                ))}
              </div>
            )}
            {viewMode === 'list' && (
              <footer className="work-schedule-pagination">
                <span>{filteredItems.length} công việc</span>
                <div>
                  <span>
                    {filteredItems.length === 0
                      ? '0–0'
                      : `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredItems.length)}`}{' '}
                    / {filteredItems.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={currentPage <= 1}
                    onClick={() => setPage(previous => Math.max(1, previous - 1))}
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(previous => Math.min(totalPages, previous + 1))}
                  >
                    Sau
                  </button>
                </div>
              </footer>
            )}
          </section>

          <DataFilterPanel
            open={showFilters}
            title="Lọc danh sách công việc"
            description="Lọc theo trạng thái, mức ưu tiên, phân hệ, nhân sự và thời gian."
            activeCount={activeFilterCount}
            onClose={() => setShowFilters(false)}
            onReset={clearFilters}
          >
            <label className="work-schedule-filter-field">
              <span>Trạng thái</span>
              <select
                value={statusFilter}
                onChange={event =>
                  setFilterAndFirstPage(setStatusFilter, event.target.value as 'all' | WorkScheduleDisplayStatus)
                }
              >
                <option value="all">Tất cả trạng thái</option>
                {(Object.keys(WORK_SCHEDULE_DISPLAY_STATUS_LABELS) as WorkScheduleDisplayStatus[]).map(status => (
                  <option key={status} value={status}>
                    {WORK_SCHEDULE_DISPLAY_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="work-schedule-filter-field">
              <span>Mức độ ưu tiên</span>
              <select
                value={priorityFilter}
                onChange={event => setFilterAndFirstPage(setPriorityFilter, event.target.value)}
              >
                <option value="all">Tất cả ưu tiên</option>
                <option value="urgent">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="normal">Bình thường</option>
              </select>
            </label>
            <label className="work-schedule-filter-field">
              <span>Loại công việc</span>
              <select
                value={workTypeFilter}
                onChange={event => setFilterAndFirstPage(setWorkTypeFilter, event.target.value)}
              >
                <option value="all">Tất cả loại công việc</option>
                {Object.entries(WORK_SCHEDULE_WORK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="work-schedule-filter-field">
              <span>Phân hệ</span>
              <select
                value={moduleFilter}
                onChange={event => setFilterAndFirstPage(setModuleFilter, event.target.value)}
              >
                <option value="all">Tất cả phân hệ</option>
                <option value="lead_candidate">Dữ liệu thô</option>
                <option value="lead">Tiềm năng</option>
                <option value="customer">Khách hàng</option>
                <option value="po">Đơn hàng</option>
                <option value="design_request">Thiết kế</option>
                <option value="production_order">Sản xuất</option>
                <option value="delivery">Giao hàng</option>
                <option value="none">Không liên kết</option>
              </select>
            </label>
            {isAdmin && (
              <label className="work-schedule-filter-field">
                <span>Người thực hiện</span>
                <select
                  value={assigneeFilter}
                  onChange={event => setFilterAndFirstPage(setAssigneeFilter, event.target.value)}
                >
                  <option value="all">Tất cả nhân sự</option>
                  {activeUsers.map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="work-schedule-filter-field">
              <span>Thời gian</span>
              <select
                value={periodFilter}
                onChange={event => setFilterAndFirstPage(setPeriodFilter, event.target.value as PeriodFilter)}
              >
                <option value="all">Tất cả thời gian</option>
                <option value="this_month">Tháng này</option>
                <option value="next_30_days">30 ngày tới</option>
                <option value="range">Khoảng ngày</option>
              </select>
            </label>
            {periodFilter === 'range' && (
              <>
                <label className="work-schedule-filter-field">
                  <span>Từ ngày</span>
                  <input
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={event => {
                      setDateFrom(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label className="work-schedule-filter-field">
                  <span>Đến ngày</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={event => {
                      setDateTo(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </>
            )}
          </DataFilterPanel>
        </>
      ) : (
        <section className="work-schedule-card work-schedule-week-view">
          <div className="work-schedule-week-nav">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() - 7))
              }
            >
              Tuần trước
            </button>
            <strong>
              {getDayLabel(weekDates[0])} – {getDayLabel(weekDates[6])}
            </strong>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() =>
                setWeekAnchor(previous => new Date(previous.getFullYear(), previous.getMonth(), previous.getDate() + 7))
              }
            >
              Tuần sau
            </button>
          </div>
          <div className="work-schedule-table-wrap">
            <table className="work-schedule-table work-schedule-week-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  {weekDates.map(date => (
                    <th key={toDateKey(date)}>{getDayLabel(date)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeUsers
                  .filter(user => isAdmin || user.uid === currentUser.uid)
                  .map(user => (
                    <tr key={user.uid}>
                      <td>
                        <strong>{user.displayName}</strong>
                        <small>{roleDepartment(user.role)}</small>
                      </td>
                      {weekDates.map(date => {
                        const schedules = items.filter(
                          item => item.assigneeId === user.uid && isScheduleOnDate(item, date)
                        );
                        return (
                          <td key={`${user.uid}-${toDateKey(date)}`}>
                            <button
                              type="button"
                              className="work-schedule-week-cell"
                              onClick={() => {
                                setStatusFilter('all');
                                setAssigneeFilter(user.uid);
                                setActiveTab('tasks');
                              }}
                            >
                              <strong>{schedules.length}</strong>
                              <span>{schedules.length ? 'công việc' : 'Trống'}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedItem && (
        <div
          className="work-schedule-modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !detailBusy) setSelectedItem(null);
          }}
        >
          <section
            className="work-schedule-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-schedule-detail-title"
          >
            <header>
              <div>
                <span>Chi tiết công việc</span>
                <h2 id="work-schedule-detail-title">{selectedItem.title}</h2>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setSelectedItem(null)}
                disabled={detailBusy}
              >
                Đóng
              </button>
            </header>
            <div className="work-schedule-detail__grid">
              <div>
                <span>Trạng thái</span>
                <strong
                  className={`work-schedule-status work-schedule-status--${getWorkScheduleDisplayStatus(selectedItem.status)}`}
                >
                  {WORK_SCHEDULE_DISPLAY_STATUS_LABELS[getWorkScheduleDisplayStatus(selectedItem.status)]}
                </strong>
              </div>
              <div>
                <span>Mức ưu tiên</span>
                <strong className={`work-schedule-priority work-schedule-priority--${selectedItem.priority}`}>
                  {WORK_SCHEDULE_PRIORITY_LABELS[selectedItem.priority]}
                </strong>
              </div>
              <div>
                <span>Nhóm công việc</span>
                <strong>
                  {groups.find(group => group.id === inferWorkScheduleGroupId(selectedItem))?.name ||
                    selectedItem.groupName ||
                    'Chưa phân nhóm'}
                </strong>
              </div>
              <div>
                <span>Loại công việc</span>
                <strong>{WORK_SCHEDULE_WORK_TYPE_LABELS[selectedItem.workType]}</strong>
              </div>
              <div>
                <span>Người thực hiện</span>
                <strong>{selectedItem.assigneeName}</strong>
              </div>
              <div>
                <span>Người giao việc</span>
                <strong>{selectedItem.assignedByName || 'Tự tạo'}</strong>
              </div>
              <div>
                <span>Thời hạn</span>
                <strong>{dateTimeLabel(selectedItem.endAt)}</strong>
              </div>
              <div>
                <span>Phân hệ</span>
                <strong>{WORK_SCHEDULE_REFERENCE_LABELS[selectedItem.referenceType]}</strong>
              </div>
            </div>
            <section className="work-schedule-status-control" aria-labelledby="work-status-title">
              <div>
                <h3 id="work-status-title">Xác nhận tình trạng công việc</h3>
                <p>Có thể thay đổi trạng thái bất cứ lúc nào.</p>
              </div>
              <div className="work-schedule-status-options" role="group" aria-label="Chọn trạng thái công việc">
                {EDITABLE_STATUSES.map(status => {
                  const isActive = getWorkScheduleDisplayStatus(selectedItem.status) === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`work-schedule-status-option work-schedule-status-option--${status} ${isActive ? 'is-active' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => requestStatusChange(selectedItem, status)}
                      disabled={detailBusy || isActive || (!isAdmin && selectedItem.assigneeId !== currentUser.uid)}
                    >
                      <span aria-hidden="true" />
                      <strong>{WORK_SCHEDULE_STATUS_LABELS[status]}</strong>
                    </button>
                  );
                })}
              </div>
            </section>
            <article>
              <h3>Nội dung công việc</h3>
              <p>{selectedItem.description || 'Chưa có nội dung.'}</p>
              {selectedItem.requestedByName && (
                <p>
                  Người yêu cầu hỗ trợ: <strong>{selectedItem.requestedByName}</strong>
                </p>
              )}
              {selectedItem.cannotProcessNote && (
                <div className="work-schedule-failure-note">
                  <strong>Lý do không xử lí được</strong>
                  <p>{selectedItem.cannotProcessNote}</p>
                  <small>
                    {selectedItem.cannotProcessByName || selectedItem.assigneeName}
                    {selectedItem.cannotProcessAt ? ` · ${dateTimeLabel(selectedItem.cannotProcessAt)}` : ''}
                  </small>
                </div>
              )}
            </article>
            {detailError && (
              <p className="work-schedule-detail-error" role="alert">
                {detailError}
              </p>
            )}
            <footer>
              {selectedItem.referenceId && moduleFromReference(selectedItem.referenceType) && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openSource(selectedItem)}
                  disabled={detailBusy}
                >
                  Mở hồ sơ khách hàng
                </button>
              )}
              {canPermanentlyDeleteWorkSchedule(currentUser.role, selectedItem.status) && (
                <button
                  type="button"
                  className="btn btn-outline work-schedule-delete"
                  onClick={() => void deleteCompletedTask(selectedItem)}
                  disabled={detailBusy}
                >
                  Xóa vĩnh viễn
                </button>
              )}
              {(isAdmin || selectedItem.assigneeId === currentUser.uid) && (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => openEdit(selectedItem)}
                  disabled={detailBusy}
                >
                  Chỉnh sửa
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {statusNoteItem && (
        <div
          className="work-schedule-modal-overlay work-schedule-status-note-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !detailBusy) setStatusNoteItem(null);
          }}
        >
          <form
            className="work-schedule-modal work-schedule-status-note-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-status-note-title"
            onSubmit={event => {
              event.preventDefault();
              void updateStatus(statusNoteItem, 'cannot_process', statusNote);
            }}
          >
            <header>
              <div>
                <strong id="work-status-note-title">Xác nhận không xử lí được</strong>
                <span>Lý do sẽ được lưu trong công việc và gửi tới tài khoản quản lý.</span>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setStatusNoteItem(null)}
                disabled={detailBusy}
              >
                Đóng
              </button>
            </header>
            <div className="work-schedule-form-grid">
              <label className="is-wide">
                Lý do *
                <textarea
                  autoFocus
                  rows={5}
                  maxLength={500}
                  value={statusNote}
                  onChange={event => {
                    setStatusNote(event.target.value);
                    setStatusNoteError('');
                  }}
                  placeholder="Nêu rõ trở ngại hoặc nguyên nhân không thể xử lí công việc này..."
                  aria-invalid={Boolean(statusNoteError)}
                />
              </label>
              {statusNoteError && (
                <div className="work-schedule-form-error is-wide" role="alert">
                  {statusNoteError}
                </div>
              )}
              <small className="work-schedule-note-count is-wide">{statusNote.length}/500 ký tự</small>
            </div>
            <footer>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setStatusNoteItem(null)}
                disabled={detailBusy}
              >
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={detailBusy}>
                {detailBusy ? 'Đang xác nhận...' : 'Xác nhận trạng thái'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {isFormOpen && (
        <div
          className="work-schedule-modal-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !saving) setIsFormOpen(false);
          }}
        >
          <form
            className="work-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-schedule-form-title"
            onSubmit={saveTask}
            noValidate
          >
            <header>
              <div>
                <strong id="work-schedule-form-title">{editingItem ? 'Cập nhật công việc' : 'Tạo công việc'}</strong>
                <span>Nhập rõ nội dung, người phụ trách và thời hạn.</span>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Đóng
              </button>
            </header>
            <div className="work-schedule-form-grid">
              {formError && (
                <div className="work-schedule-form-error is-wide" role="alert">
                  {formError}
                </div>
              )}
              <label>
                Nhóm công việc *
                <select
                  name="groupId"
                  aria-required="true"
                  aria-invalid={Boolean(formFieldErrors.groupId)}
                  value={form.groupId}
                  disabled={Boolean(editingItem)}
                  onChange={event => {
                    updateFormField('groupId', event.target.value);
                    setForm(previous => ({
                      ...previous,
                      groupId: event.target.value,
                      assigneeId: event.target.value === 'self' ? currentUser.uid : ''
                    }));
                  }}
                >
                  <option value="">Chọn nhóm công việc</option>
                  {editingItem && !creatableGroups.some(group => group.id === form.groupId) && (
                    <option value={form.groupId}>
                      {groups.find(group => group.id === form.groupId)?.name || form.groupId}
                    </option>
                  )}
                  {creatableGroups.map(group => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                {formFieldErrors.groupId && <small>{formFieldErrors.groupId}</small>}
              </label>
              <label>
                Loại công việc *
                <select
                  value={form.workType}
                  onChange={event => updateFormField('workType', event.target.value as WorkScheduleWorkType)}
                >
                  {Object.entries(WORK_SCHEDULE_WORK_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tên công việc *
                <input
                  name="title"
                  autoFocus
                  aria-required="true"
                  aria-invalid={Boolean(formFieldErrors.title)}
                  value={form.title}
                  onChange={event => updateFormField('title', event.target.value)}
                />
                {formFieldErrors.title && <small>{formFieldErrors.title}</small>}
              </label>
              <label>
                Người thực hiện *
                <select
                  name="assigneeId"
                  aria-required="true"
                  aria-invalid={Boolean(formFieldErrors.assigneeId)}
                  value={editingItem?.assigneeId || (form.groupId === 'self' ? currentUser.uid : form.assigneeId)}
                  disabled={form.groupId === 'self' || Boolean(editingItem)}
                  onChange={event => updateFormField('assigneeId', event.target.value)}
                >
                  <option value="">Chọn nhân sự</option>
                  {(editingItem
                    ? users.filter(user => user.uid === editingItem.assigneeId)
                    : activeUsers.filter(user =>
                        form.groupId === 'staff_to_company'
                          ? user.role === 'admin'
                          : form.groupId === 'self'
                            ? user.uid === currentUser.uid
                            : user.role !== 'admin' && user.uid !== currentUser.uid
                      )
                  ).map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
                {formFieldErrors.assigneeId && <small>{formFieldErrors.assigneeId}</small>}
              </label>
              <label>
                Thời hạn *
                <input
                  name="dueAt"
                  type="datetime-local"
                  aria-required="true"
                  aria-invalid={Boolean(formFieldErrors.dueAt)}
                  value={form.dueAt}
                  onChange={event => updateFormField('dueAt', event.target.value)}
                />
                {formFieldErrors.dueAt && <small>{formFieldErrors.dueAt}</small>}
              </label>
              <label className="is-wide">
                Nội dung công việc *
                <textarea
                  name="description"
                  rows={4}
                  aria-required="true"
                  aria-invalid={Boolean(formFieldErrors.description)}
                  value={form.description}
                  onChange={event => updateFormField('description', event.target.value)}
                />
                {formFieldErrors.description && <small>{formFieldErrors.description}</small>}
              </label>
              <label>
                Phân hệ liên kết
                <select
                  value={form.referenceType}
                  onChange={event =>
                    setForm(previous => ({
                      ...previous,
                      referenceType: event.target.value as WorkScheduleReferenceType,
                      referenceId: '',
                      referenceLabel: ''
                    }))
                  }
                >
                  <option value="none">Không liên kết</option>
                  <option value="lead_candidate">Dữ liệu thô</option>
                  <option value="lead">Tiềm năng</option>
                  <option value="customer">Khách hàng</option>
                </select>
              </label>
              <label>
                Khách hàng
                <select
                  disabled={form.referenceType === 'none'}
                  value={form.referenceId}
                  onChange={event => handleReferenceChange(event.target.value)}
                >
                  <option value="">Chọn khách hàng</option>
                  {sourceOptions.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.companyName || item.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mức ưu tiên
                <select
                  value={form.priority}
                  onChange={event =>
                    setForm(previous => ({ ...previous, priority: event.target.value as WorkSchedulePriority }))
                  }
                >
                  <option value="normal">Bình thường</option>
                  <option value="high">Cao</option>
                  <option value="urgent">Khẩn cấp</option>
                </select>
              </label>
            </div>
            <footer>
              <button type="button" className="btn btn-outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu công việc'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
};
