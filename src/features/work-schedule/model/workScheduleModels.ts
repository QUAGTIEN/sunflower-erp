export type WorkScheduleStatus = 'not_started' | 'in_progress' | 'waiting_customer' | 'support_requested' | 'awaiting_confirmation' | 'paused' | 'cannot_process' | 'completed' | 'cancelled';
export type WorkSchedulePriority = 'normal' | 'high' | 'urgent';
export type WorkScheduleTaskType = 'assigned_task' | 'support_request' | 'personal_task';
export type WorkScheduleDisplayStatus = 'in_progress' | 'not_started' | 'cannot_process' | 'completed';

export type WorkScheduleReferenceType =
  | 'none'
  | 'lead_candidate'
  | 'customer'
  | 'lead'
  | 'po'
  | 'design_request'
  | 'production_order'
  | 'delivery'
  | 'other';

export interface WorkScheduleRecord {
  id: string;
  title: string;
  description: string;
  stage: string;
  assigneeId: string;
  assigneeName: string;
  department: string;
  assignedById: string;
  assignedByName: string;
  startAt: string;
  endAt: string;
  status: WorkScheduleStatus;
  progress: number;
  referenceType: WorkScheduleReferenceType;
  referenceId: string;
  referenceLabel: string;
  notes: string;
  cannotProcessNote: string;
  cannotProcessAt: string;
  cannotProcessById: string;
  cannotProcessByName: string;
  priority: WorkSchedulePriority;
  taskType: WorkScheduleTaskType;
  groupId: string;
  groupName: string;
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface WorkScheduleGroupRecord {
  id: string;
  name: string;
  order: number;
  active: boolean;
  system: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_WORK_SCHEDULE_GROUPS: WorkScheduleGroupRecord[] = [
  { id: 'boss', name: 'Công việc của sếp', order: 10, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'personnel', name: 'Công việc các nhân sự', order: 20, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'business', name: 'Công việc kinh doanh', order: 30, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'technical', name: 'Công việc kỹ thuật', order: 40, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'logistics', name: 'Công việc logistic', order: 50, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'workshop', name: 'Công việc xưởng', order: 60, active: true, system: true, createdAt: '', updatedAt: '' },
  { id: 'delivery', name: 'Công việc vận chuyển', order: 70, active: true, system: true, createdAt: '', updatedAt: '' }
];

const STATUS_VALUES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'paused', 'cannot_process', 'completed', 'cancelled'];
const REFERENCE_VALUES: WorkScheduleReferenceType[] = [
  'none', 'lead_candidate', 'customer', 'lead', 'po', 'design_request', 'production_order', 'delivery', 'other'
];
const PRIORITY_VALUES: WorkSchedulePriority[] = ['normal', 'high', 'urgent'];
const TASK_TYPE_VALUES: WorkScheduleTaskType[] = ['assigned_task', 'support_request', 'personal_task'];

const asText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : '';
  }
  return '';
};

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
};

const asStatus = (value: unknown): WorkScheduleStatus => (
  value === 'paused'
    ? 'in_progress'
    : value === 'cancelled' ? 'cannot_process'
    : STATUS_VALUES.includes(value as WorkScheduleStatus) ? value as WorkScheduleStatus : 'not_started'
);

const asReferenceType = (value: unknown): WorkScheduleReferenceType => (
  REFERENCE_VALUES.includes(value as WorkScheduleReferenceType)
    ? value as WorkScheduleReferenceType
    : 'none'
);

export const normalizeWorkScheduleRecord = (value: unknown): WorkScheduleRecord => {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const completedAt = asText(source.completedAt);
  const deletedAt = asText(source.deletedAt);
  return {
    ...source,
    id: asText(source.id),
    title: asText(source.title),
    description: asText(source.description),
    stage: asText(source.stage),
    assigneeId: asText(source.assigneeId),
    assigneeName: asText(source.assigneeName),
    department: asText(source.department),
    assignedById: asText(source.assignedById),
    assignedByName: asText(source.assignedByName),
    startAt: asText(source.startAt),
    endAt: asText(source.endAt),
    status: asStatus(source.status),
    progress: asNumber(source.progress),
    referenceType: asReferenceType(source.referenceType),
    referenceId: asText(source.referenceId),
    referenceLabel: asText(source.referenceLabel),
    notes: asText(source.notes),
    cannotProcessNote: asText(source.cannotProcessNote),
    cannotProcessAt: asText(source.cannotProcessAt),
    cannotProcessById: asText(source.cannotProcessById),
    cannotProcessByName: asText(source.cannotProcessByName),
    priority: PRIORITY_VALUES.includes(source.priority as WorkSchedulePriority) ? source.priority as WorkSchedulePriority : 'normal',
    taskType: TASK_TYPE_VALUES.includes(source.taskType as WorkScheduleTaskType) ? source.taskType as WorkScheduleTaskType : 'assigned_task',
    groupId: asText(source.groupId),
    groupName: asText(source.groupName),
    requestedById: asText(source.requestedById),
    requestedByName: asText(source.requestedByName),
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
    deleted: source.deleted === true,
    ...(completedAt ? { completedAt } : {}),
    ...(deletedAt ? { deletedAt } : {})
  };
};

export const normalizeWorkScheduleGroup = (value: unknown): WorkScheduleGroupRecord => {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    id: asText(source.id),
    name: asText(source.name),
    order: Number.isFinite(Number(source.order)) ? Number(source.order) : 999,
    active: source.active !== false,
    system: source.system === true,
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt)
  };
};

export const mergeWorkScheduleGroups = (values: unknown): WorkScheduleGroupRecord[] => {
  const stored = Array.isArray(values) ? values.map(normalizeWorkScheduleGroup).filter(group => group.id) : [];
  const storedById = new Map(stored.map(group => [group.id, group]));
  const defaults = DEFAULT_WORK_SCHEDULE_GROUPS.map(group => ({ ...group, ...(storedById.get(group.id) || {}) }));
  const custom = stored.filter(group => !DEFAULT_WORK_SCHEDULE_GROUPS.some(defaultGroup => defaultGroup.id === group.id));
  return [...defaults, ...custom].filter(group => group.active).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'vi-VN'));
};

export const getWorkScheduleDisplayStatus = (status: WorkScheduleStatus): WorkScheduleDisplayStatus => {
  if (status === 'in_progress' || status === 'paused') return 'in_progress';
  if (status === 'completed') return 'completed';
  if (status === 'cannot_process' || status === 'cancelled') return 'cannot_process';
  return 'not_started';
};

export const compareWorkScheduleItems = (left: WorkScheduleRecord, right: WorkScheduleRecord): number => {
  const statusRank: Record<WorkScheduleDisplayStatus, number> = { in_progress: 0, not_started: 1, cannot_process: 2, completed: 3 };
  const priorityRank: Record<WorkSchedulePriority, number> = { urgent: 0, high: 1, normal: 2 };
  return statusRank[getWorkScheduleDisplayStatus(left.status)] - statusRank[getWorkScheduleDisplayStatus(right.status)]
    || priorityRank[left.priority] - priorityRank[right.priority]
    || left.endAt.localeCompare(right.endAt);
};

export const inferWorkScheduleGroupId = (item: Partial<WorkScheduleRecord>): string => {
  if (item.groupId) return item.groupId;
  if (item.taskType === 'support_request') return 'boss';
  if (item.referenceType && item.referenceType !== 'none' && item.referenceType !== 'other') return 'business';
  const department = String(item.department || '').toLocaleLowerCase('vi-VN');
  if (department.includes('giao hàng') || department.includes('vận chuyển')) return 'delivery';
  if (department.includes('sản xuất') || department.includes('xưởng')) return 'workshop';
  if (department.includes('mua hàng') || department.includes('logistic')) return 'logistics';
  if (department.includes('thiết kế') || department.includes('kỹ thuật')) return 'technical';
  if (department.includes('sale') || department.includes('kinh doanh')) return 'business';
  if (department.includes('giám đốc')) return 'boss';
  return 'personnel';
};

export const normalizeWorkScheduleRecords = (values: unknown): WorkScheduleRecord[] => (
  Array.isArray(values) ? values.map(normalizeWorkScheduleRecord) : []
);

export const canPermanentlyDeleteWorkSchedule = (role: string, status: WorkScheduleStatus): boolean => (
  role === 'admin' && status === 'completed'
);

export const WORK_SCHEDULE_STATUS_LABELS: Record<WorkScheduleStatus, string> = {
  not_started: 'Chưa xử lí',
  in_progress: 'Đang xử lí',
  waiting_customer: 'Chờ khách hàng',
  support_requested: 'Yêu cầu hỗ trợ',
  awaiting_confirmation: 'Chờ xác nhận',
  paused: 'Đang xử lí',
  cannot_process: 'Không xử lí được',
  completed: 'Đã xử lí',
  cancelled: 'Không xử lí được'
};

export const WORK_SCHEDULE_DISPLAY_STATUS_LABELS: Record<WorkScheduleDisplayStatus, string> = {
  in_progress: 'Đang xử lí',
  not_started: 'Chưa xử lí',
  cannot_process: 'Không xử lí được',
  completed: 'Đã xử lí'
};

export const WORK_SCHEDULE_PRIORITY_LABELS: Record<WorkSchedulePriority, string> = {
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn cấp'
};

export const WORK_SCHEDULE_REFERENCE_LABELS: Record<WorkScheduleReferenceType, string> = {
  none: 'Không liên kết',
  lead_candidate: 'Dữ liệu thô',
  customer: 'Khách hàng',
  lead: 'Lead',
  po: 'PO',
  design_request: 'Yêu cầu thiết kế',
  production_order: 'Lệnh sản xuất',
  delivery: 'Giao hàng',
  other: 'Công việc khác'
};

export const WORK_SCHEDULE_DEPARTMENT_LABELS: Record<string, string> = {
  admin: 'Ban giám đốc',
  sale: 'Sale',
  designer: 'Thiết kế',
  purchaser: 'Mua hàng',
  producer: 'Sản xuất',
  accountant: 'Kế toán'
};

export const toDateKey = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
};

export const getWeekStart = (value: Date): Date => {
  const date = new Date(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const formatScheduleTime = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

export const formatScheduleDate = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export const isScheduleOnDate = (item: WorkScheduleRecord, date: Date): boolean => {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const start = new Date(item.startAt).getTime();
  const end = new Date(item.endAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < dayEnd.getTime() && end > dayStart.getTime();
};
