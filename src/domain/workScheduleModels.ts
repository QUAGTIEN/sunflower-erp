export type WorkScheduleStatus = 'not_started' | 'in_progress' | 'paused' | 'completed';

export type WorkScheduleReferenceType =
  | 'none'
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
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

const STATUS_VALUES: WorkScheduleStatus[] = ['not_started', 'in_progress', 'paused', 'completed'];
const REFERENCE_VALUES: WorkScheduleReferenceType[] = [
  'none', 'customer', 'lead', 'po', 'design_request', 'production_order', 'delivery', 'other'
];

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
  STATUS_VALUES.includes(value as WorkScheduleStatus) ? value as WorkScheduleStatus : 'not_started'
);

const asReferenceType = (value: unknown): WorkScheduleReferenceType => (
  REFERENCE_VALUES.includes(value as WorkScheduleReferenceType)
    ? value as WorkScheduleReferenceType
    : 'none'
);

export const normalizeWorkScheduleRecord = (value: unknown): WorkScheduleRecord => {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    ...source,
    id: asText(source.id),
    title: asText(source.title),
    description: asText(source.description),
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
    createdAt: asText(source.createdAt),
    updatedAt: asText(source.updatedAt),
    completedAt: asText(source.completedAt) || undefined,
    deleted: source.deleted === true,
    deletedAt: asText(source.deletedAt) || undefined
  };
};

export const normalizeWorkScheduleRecords = (values: unknown): WorkScheduleRecord[] => (
  Array.isArray(values) ? values.map(normalizeWorkScheduleRecord) : []
);

export const WORK_SCHEDULE_STATUS_LABELS: Record<WorkScheduleStatus, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  paused: 'Tạm dừng',
  completed: 'Hoàn thành'
};

export const WORK_SCHEDULE_REFERENCE_LABELS: Record<WorkScheduleReferenceType, string> = {
  none: 'Không liên kết',
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

export const overlapsSchedule = (candidate: Pick<WorkScheduleRecord, 'assigneeId' | 'startAt' | 'endAt'>, existing: WorkScheduleRecord): boolean => (
  !existing.deleted
  && candidate.assigneeId === existing.assigneeId
  && new Date(candidate.startAt).getTime() < new Date(existing.endAt).getTime()
  && new Date(candidate.endAt).getTime() > new Date(existing.startAt).getTime()
);
