import {
  type CandidateDuplicate,
  type LeadCandidateActivityType,
  type LeadCandidateContactLog,
  type LeadCandidateContactOutcome,
  type LeadCandidateContactResult,
  type LeadCandidatePotentialLevel,
  type LeadCandidateRecord
} from '@/features/crm/model/leadCandidateModels';
import { type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { type AuditEvent, type UserPresence } from '@/services/auditService';
import { CUSTOMER_INSIGHT_GROUPS } from '@/features/crm/model/customerInsightCatalog';
import { type TableColumnOption } from '@/components/TableColumnCustomizer';
import { getEntityCustomFieldSearchValues, type EntityFieldDefinition } from '@/features/crm/model/entityFieldConfig';

export interface CandidateFormState {
  companyName: string;
  contactPerson: string;
  contactPosition: string;
  phone: string;
  email: string;
  taxCode: string;
  address: string;
  province: string;
  ward: string;
  industrialPark: string;
  website: string;
  businessSector: string;
  expectedProducts: string;
  source: string;
  sourceUrl: string;
  assignedSaleId: string;
  nextContactAt: string;
  note: string;
  customerInsightValues: string[];
}

export interface ScheduleFormState {
  nextContactAt: string;
  note: string;
}

export const CANDIDATE_SOURCES = ['Google Maps', 'Facebook', 'Mạng xã hội', 'Website', 'Khách hàng giới thiệu', 'Khác'];
export type CandidateWorkspaceView = 'management' | 'tasks' | 'all';
export type CandidateSort = 'priority' | 'updated_desc' | 'company_asc' | 'next_contact_asc';
export type CandidateColumnId = string;
export type EmployeeActivityRange = 'today' | '7days' | 'all';
export type EmployeeActivityGroup = 'all' | 'call' | 'data' | 'schedule' | 'task';
export type SalesReportPeriod = 'week' | 'month' | 'quarter' | 'custom';
export type CandidateDetailTab = 'classification' | 'profile';

export interface SalesReportWindow {
  startAt: number;
  endAt: number;
  label: string;
}

/** One sales employee's presence and raw-data activity, shown in the admin monitor. */
export interface EmployeeActivityCard {
  sale: UserProfile;
  presence: UserPresence | undefined;
  presenceStatus: 'active' | 'idle' | 'offline';
  minutesSinceSeen: number;
  activities: AuditEvent[];
  todayActivities: AuditEvent[];
  currentCandidate: LeadCandidateRecord | null;
  assignedCount: number;
  touchedCount: number;
  callCount: number;
  scheduleCount: number;
}

/** Activity totals for one employee over the selected report window. */
export interface SalesReportSummary {
  events: AuditEvent[];
  calls: AuditEvent[];
  confirmedCalls: AuditEvent[];
  processedCandidateIds: Set<string | undefined>;
  convertedCandidateIds: Set<string | undefined>;
  scheduled: AuditEvent[];
  created: AuditEvent[];
  activityByDate: { date: string; processed: number; calls: number; schedules: number; converted: number }[];
}

export const normalizeCandidateFieldName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const isClassificationOwnedProfileField = (definition: EntityFieldDefinition) => {
  const name = normalizeCandidateFieldName(definition.name);
  return [
    'nganh nghe',
    'linh vuc hoat dong',
    'san pham nhu cau',
    'san pham nhu cau quan tam',
    'nhu cau san pham',
    'doi thu canh tranh',
    'quy mo doanh nghiep',
    'muc su dung'
  ].includes(name);
};

export interface CandidateColumnOption extends TableColumnOption {
  id: CandidateColumnId;
  adminOnly?: boolean;
  fieldKey?: string;
}

export const CANDIDATE_SECTION_LABELS: Record<string, string> = {
  company: 'Thông tin doanh nghiệp',
  classification: 'Thông tin doanh nghiệp',
  contact: 'Liên hệ và nguồn dữ liệu',
  needs: 'Nhu cầu sơ bộ',
  assignment: 'Phụ trách và lịch hẹn',
  additional: 'Trường thông tin bổ sung'
};

export const CANDIDATE_PROFILE_COLUMN_OPTIONS: CandidateColumnOption[] = [
  {
    id: 'company',
    fieldKey: 'companyName',
    label: 'Doanh nghiệp',
    group: CANDIDATE_SECTION_LABELS.company,
    required: true
  },
  {
    id: 'taxCode',
    fieldKey: 'taxCode',
    label: 'Mã số thuế',
    group: CANDIDATE_SECTION_LABELS.company,
    defaultVisible: false
  },
  {
    id: 'website',
    fieldKey: 'website',
    label: 'Website',
    group: CANDIDATE_SECTION_LABELS.company,
    defaultVisible: false
  },
  {
    id: 'businessSector',
    fieldKey: 'businessSector',
    label: 'Lĩnh vực hoạt động',
    group: CANDIDATE_SECTION_LABELS.company,
    defaultVisible: false
  },
  { id: 'province', fieldKey: 'province', label: 'Tỉnh/thành', group: CANDIDATE_SECTION_LABELS.company },
  { id: 'ward', fieldKey: 'ward', label: 'Phường/xã', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  {
    id: 'industrialPark',
    fieldKey: 'industrialPark',
    label: 'Khu công nghiệp',
    group: CANDIDATE_SECTION_LABELS.company,
    defaultVisible: false
  },
  {
    id: 'address',
    fieldKey: 'address',
    label: 'Địa chỉ doanh nghiệp',
    group: CANDIDATE_SECTION_LABELS.company,
    defaultVisible: false
  },
  { id: 'contact', fieldKey: 'contact', label: 'Thông tin liên hệ (tóm tắt)', group: CANDIDATE_SECTION_LABELS.contact },
  {
    id: 'contactPerson',
    fieldKey: 'contactPerson',
    label: 'Người liên hệ',
    group: CANDIDATE_SECTION_LABELS.contact,
    defaultVisible: false
  },
  {
    id: 'contactPosition',
    fieldKey: 'contactPosition',
    label: 'Chức vụ',
    group: CANDIDATE_SECTION_LABELS.contact,
    defaultVisible: false
  },
  {
    id: 'phone',
    fieldKey: 'phone',
    label: 'Điện thoại',
    group: CANDIDATE_SECTION_LABELS.contact,
    defaultVisible: false
  },
  { id: 'email', fieldKey: 'email', label: 'Email', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  {
    id: 'source',
    fieldKey: 'source',
    label: 'Nguồn tìm kiếm',
    group: CANDIDATE_SECTION_LABELS.contact,
    defaultVisible: false
  },
  {
    id: 'sourceUrl',
    fieldKey: 'sourceUrl',
    label: 'Đường dẫn nguồn',
    group: CANDIDATE_SECTION_LABELS.contact,
    defaultVisible: false
  },
  {
    id: 'expectedProducts',
    fieldKey: 'expectedProducts',
    label: 'Sản phẩm / nhu cầu quan tâm',
    group: CANDIDATE_SECTION_LABELS.needs,
    defaultVisible: false
  },
  { id: 'note', fieldKey: 'note', label: 'Ghi chú', group: CANDIDATE_SECTION_LABELS.needs, defaultVisible: false }
];

export const TASK_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'index', label: 'STT', group: 'Điều khiển bảng', required: true },
  ...CANDIDATE_PROFILE_COLUMN_OPTIONS,
  { id: 'status', fieldKey: 'contactResult', label: 'Trạng thái', group: CANDIDATE_SECTION_LABELS.assignment },
  {
    id: 'assignee',
    fieldKey: 'assignedSaleId',
    label: 'Sale phụ trách',
    group: CANDIDATE_SECTION_LABELS.assignment,
    adminOnly: true
  },
  {
    id: 'potential',
    fieldKey: 'potentialLevel',
    label: 'Mức độ tiềm năng',
    group: CANDIDATE_SECTION_LABELS.assignment
  },
  { id: 'schedule', fieldKey: 'nextContactAt', label: 'Lịch hẹn', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'latest', fieldKey: 'latest', label: 'Cập nhật gần nhất', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'actions', label: 'Thao tác', group: 'Điều khiển bảng', required: true }
];

export const ALL_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'select', label: 'Chọn dữ liệu', group: 'Điều khiển bảng', required: true },
  { id: 'index', label: 'STT', group: 'Điều khiển bảng', required: true },
  ...CANDIDATE_PROFILE_COLUMN_OPTIONS,
  { id: 'assignee', fieldKey: 'assignedSaleId', label: 'Sale phụ trách', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'processing', fieldKey: 'processing', label: 'Sale đang xử lý', group: CANDIDATE_SECTION_LABELS.assignment },
  {
    id: 'potential',
    fieldKey: 'potentialLevel',
    label: 'Mức độ tiềm năng',
    group: CANDIDATE_SECTION_LABELS.assignment
  },
  { id: 'schedule', fieldKey: 'nextContactAt', label: 'Lịch tiếp theo', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'latest', fieldKey: 'latest', label: 'Cập nhật gần nhất', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'actions', label: 'Thao tác', group: 'Điều khiển bảng', required: true }
];

export const getAvailableColumns = (
  view: CandidateWorkspaceView,
  isAdmin: boolean,
  customDefinitions: EntityFieldDefinition[] = [],
  systemFields: Array<{ key: string; label: string; removed: boolean }> = []
): CandidateColumnOption[] => [
  ...(view === 'tasks' ? TASK_COLUMN_OPTIONS : ALL_COLUMN_OPTIONS)
    .filter(column => !column.adminOnly || isAdmin)
    .filter(column => !column.fieldKey || !systemFields.find(field => field.key === column.fieldKey)?.removed)
    .map(column => ({
      ...column,
      label: column.fieldKey
        ? systemFields.find(field => field.key === column.fieldKey)?.label || column.label
        : column.label
    })),
  ...customDefinitions
    .filter(definition => definition.active)
    .map(definition => ({
      id: `custom:${definition.id}`,
      label: definition.name,
      group: CANDIDATE_SECTION_LABELS[definition.section] || CANDIDATE_SECTION_LABELS.additional,
      defaultVisible: definition.defaultVisible
    })),
  ...CUSTOMER_INSIGHT_GROUPS.flatMap(group =>
    group.items.map(entry => ({
      id: `insight:${entry.id}`,
      label: entry.label,
      group: `Phân loại · ${group.label}`,
      defaultVisible: false
    }))
  )
];

export const CONTACT_STATUS_LABELS: Record<LeadCandidateContactResult, string> = {
  not_contacted: 'Chưa liên hệ',
  working: 'Đang làm việc',
  called: 'Đã gọi điện',
  messaged: 'Đã nhắn tin',
  callback: 'Hẹn gọi lại'
};

export const POTENTIAL_LEVEL_LABELS: Record<LeadCandidatePotentialLevel, string> = {
  unrated: 'Chưa đánh giá',
  not_fit: 'Không phù hợp',
  low: 'Tiềm năng thấp',
  potential: 'Có tiềm năng',
  promising: 'Khả quan',
  high: 'Tiềm năng cao'
};

export const ACTIVITY_TYPE_LABELS: Record<LeadCandidateActivityType, string> = {
  call: 'Đã gọi điện',
  message: 'Đã nhắn tin',
  email: 'Đã gửi email',
  meeting: 'Đã gặp trực tiếp',
  note: 'Ghi chú công việc'
};

export const CONTACT_RESULT_OUTCOMES: Record<LeadCandidateContactResult, LeadCandidateContactOutcome> = {
  not_contacted: 'not_contacted',
  working: 'connected',
  called: 'connected',
  messaged: 'connected',
  callback: 'call_back'
};

export const RAW_DATA_EMPLOYEE_ACTIONS = new Set([
  'candidate_phone_called',
  'phone_call_started',
  'phone_call_confirmed',
  'phone_call_manual_recorded',
  'candidate_opened',
  'candidate_added_to_work_queue',
  'candidate_assigned_to_sale',
  'candidate_updated',
  'candidate_created',
  'follow_up_scheduled',
  'candidate_pin_toggled',
  'contact_status_updated',
  'potential_updated',
  'candidate_task_dismissed',
  'candidate_archived'
]);

export const EMPLOYEE_ACTION_LABELS: Record<string, string> = {
  candidate_phone_called: 'Đã bấm gọi',
  phone_call_started: 'Đã bấm gọi',
  phone_call_confirmed: 'Đã xác nhận kết quả gọi',
  phone_call_manual_recorded: 'Đã ghi nhận cuộc gọi',
  candidate_opened: 'Đã mở hồ sơ',
  candidate_added_to_work_queue: 'Đưa vào danh sách cần xử lý',
  candidate_assigned_to_sale: 'Bàn giao dữ liệu',
  candidate_updated: 'Cập nhật dữ liệu',
  candidate_created: 'Tạo dữ liệu mới',
  follow_up_scheduled: 'Đặt lịch liên hệ',
  candidate_pin_toggled: 'Cập nhật ghim',
  contact_status_updated: 'Cập nhật trạng thái liên hệ',
  potential_updated: 'Cập nhật đánh giá',
  candidate_task_dismissed: 'Đóng công việc cần xử lý',
  candidate_archived: 'Xóa dữ liệu'
};

export const getEmployeeActivityGroup = (action: string): Exclude<EmployeeActivityGroup, 'all'> => {
  if (
    ['candidate_phone_called', 'phone_call_started', 'phone_call_confirmed', 'phone_call_manual_recorded'].includes(
      action
    )
  )
    return 'call';
  if (action === 'follow_up_scheduled') return 'schedule';
  if (['candidate_added_to_work_queue', 'candidate_assigned_to_sale', 'candidate_task_dismissed'].includes(action))
    return 'task';
  return 'data';
};

export const CANDIDATE_STAGE_LABELS: Record<LeadCandidateRecord['status'], string> = {
  new: 'Dữ liệu mới',
  retry: 'Cần xử lý lại',
  disqualified: 'Không phù hợp',
  converted: 'Đã chuyển Tiềm năng'
};

export const REPORT_WORK_ACTIONS = new Set([
  'phone_call_started',
  'phone_call_manual_recorded',
  'candidate_phone_called',
  'candidate_updated',
  'follow_up_scheduled',
  'contact_status_updated',
  'potential_updated',
  'candidate_task_dismissed',
  'candidate_converted_to_lead'
]);

export const toDateInputValue = (value: Date) => {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

export const getSalesReportWindow = (
  period: SalesReportPeriod,
  referenceTime: number,
  customStart: string,
  customEnd: string
): SalesReportWindow | null => {
  const end = new Date(referenceTime);
  end.setHours(23, 59, 59, 999);
  const start = new Date(referenceTime);
  start.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return { startAt: start.getTime(), endAt: end.getTime(), label: 'Tuần này' };
  }
  if (period === 'month') {
    start.setDate(1);
    return { startAt: start.getTime(), endAt: end.getTime(), label: 'Tháng này' };
  }
  if (period === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    return { startAt: start.getTime(), endAt: end.getTime(), label: 'Quý này' };
  }
  if (!customStart || !customEnd) return null;
  const selectedStart = new Date(`${customStart}T00:00:00`);
  const selectedEnd = new Date(`${customEnd}T23:59:59.999`);
  if (Number.isNaN(selectedStart.getTime()) || Number.isNaN(selectedEnd.getTime()) || selectedStart > selectedEnd)
    return null;
  return { startAt: selectedStart.getTime(), endAt: selectedEnd.getTime(), label: `${customStart} đến ${customEnd}` };
};

export const getEmployeeActionLabel = (event: AuditEvent) => {
  if (event.action === 'contact_status_updated') {
    const value = event.changes?.find(change => change.field === 'contactResult')?.after;
    return value ? `Liên hệ: ${value}` : EMPLOYEE_ACTION_LABELS[event.action];
  }
  if (event.action === 'potential_updated') {
    const value = event.changes?.find(change => change.field === 'potentialLevel')?.after;
    return value ? `Đánh giá: ${value}` : EMPLOYEE_ACTION_LABELS[event.action];
  }
  if (event.action === 'candidate_pin_toggled')
    return event.summary.startsWith('Bỏ ghim') ? 'Bỏ ghim dữ liệu' : 'Ghim dữ liệu';
  return EMPLOYEE_ACTION_LABELS[event.action] || 'Cập nhật dữ liệu';
};

export const formatActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { time: '--:--', date: '' };
  return {
    time: date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  };
};

export const toDateTimeLocal = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export const tomorrowAtNine = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
};

export const formatShortDateTime = (value: string, fallback = 'Chưa có') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const isVisibleTask = (candidate: LeadCandidateRecord) =>
  !candidate.workQueueHidden && candidate.status !== 'converted' && candidate.status !== 'disqualified';

export const createLogId = () => `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const latestCandidateLog = (candidate: LeadCandidateRecord) =>
  candidate.contactLogs
    .slice()
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];

export const describeCandidateLog = (log: LeadCandidateContactLog) => {
  if (log.description) return log.description;
  if (log.eventType === 'potential_level' && log.potentialLevel)
    return `Đánh giá: ${POTENTIAL_LEVEL_LABELS[log.potentialLevel]}`;
  if (log.eventType === 'activity' && log.activityType) return ACTIVITY_TYPE_LABELS[log.activityType];
  if (log.eventType === 'schedule') return 'Đặt lịch liên hệ tiếp theo';
  if (log.contactResult) return `Trạng thái: ${CONTACT_STATUS_LABELS[log.contactResult]}`;
  return 'Cập nhật thông tin liên hệ';
};

export const createEmptyCandidateForm = (currentUser: UserProfile, ownerUsers: UserProfile[]): CandidateFormState => ({
  companyName: '',
  contactPerson: '',
  contactPosition: '',
  phone: '',
  email: '',
  taxCode: '',
  address: '',
  province: '',
  ward: '',
  industrialPark: '',
  website: '',
  businessSector: '',
  expectedProducts: '',
  source: 'Google Maps',
  sourceUrl: '',
  assignedSaleId: currentUser.role === 'sale' ? currentUser.uid : ownerUsers[0]?.uid || currentUser.uid,
  nextContactAt: '',
  note: '',
  customerInsightValues: []
});

export const matchesSearch = (
  candidate: LeadCandidateRecord,
  searchTerm: string,
  customDefinitions: EntityFieldDefinition[] = []
) => {
  const terms = searchTerm
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    candidate.companyName,
    candidate.contactPerson,
    candidate.contactPosition,
    candidate.phone,
    candidate.email,
    candidate.taxCode,
    candidate.address,
    candidate.province,
    candidate.ward,
    candidate.industrialPark,
    candidate.website,
    candidate.businessSector,
    candidate.expectedProducts,
    candidate.source,
    candidate.note,
    candidate.assignedSaleName,
    ...getEntityCustomFieldSearchValues(customDefinitions, candidate.customFieldValues)
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN');

  return terms.every(term => haystack.includes(term));
};

export const describeDuplicate = (duplicate: CandidateDuplicate) => {
  const recordLabel =
    duplicate.recordType === 'candidate'
      ? 'Dữ liệu khách hàng'
      : duplicate.recordType === 'lead'
        ? 'Lead'
        : 'Khách hàng hợp tác';
  const reasonLabel =
    duplicate.reason === 'taxCode' ? 'mã số thuế' : duplicate.reason === 'phone' ? 'số điện thoại' : 'tên doanh nghiệp';
  return `${recordLabel} “${duplicate.companyName}” đã có cùng ${reasonLabel}.`;
};
