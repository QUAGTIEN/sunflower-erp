export type WorkScheduleStatus = 'not_started' | 'in_progress' | 'waiting_customer' | 'support_requested' | 'awaiting_confirmation' | 'paused' | 'completed' | 'cancelled';
export type WorkSchedulePriority = 'normal' | 'high' | 'urgent';
export type WorkScheduleTaskType = 'assigned_task' | 'support_request' | 'personal_task';

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
  priority: WorkSchedulePriority;
  taskType: WorkScheduleTaskType;
  requestedById: string;
  requestedByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

const STATUS_VALUES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'paused', 'completed', 'cancelled'];
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
    priority: PRIORITY_VALUES.includes(source.priority as WorkSchedulePriority) ? source.priority as WorkSchedulePriority : 'normal',
    taskType: TASK_TYPE_VALUES.includes(source.taskType as WorkScheduleTaskType) ? source.taskType as WorkScheduleTaskType : 'assigned_task',
    requestedById: asText(source.requestedById),
    requestedByName: asText(source.requestedByName),
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
    deleted: source.deleted === true,
    ...(completedAt ? { completedAt } : {}),
    ...(deletedAt ? { deletedAt } : {})
  };
};

export const normalizeWorkScheduleRecords = (values: unknown): WorkScheduleRecord[] => (
  Array.isArray(values) ? values.map(normalizeWorkScheduleRecord) : []
);

export const WORK_SCHEDULE_STATUS_LABELS: Record<WorkScheduleStatus, string> = {
  not_started: 'Chờ tiếp nhận',
  in_progress: 'Đang thực hiện',
  waiting_customer: 'Chờ khách hàng',
  support_requested: 'Yêu cầu hỗ trợ',
  awaiting_confirmation: 'Chờ xác nhận',
  paused: 'Đang xử lý',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy'
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
