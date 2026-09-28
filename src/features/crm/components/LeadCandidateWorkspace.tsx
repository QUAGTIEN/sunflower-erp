import { ConfiguredSystemTable, SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import { PageContextHeader } from '@/components/PageContextHeader';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  ListPlus,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRoundSearch,
  X
} from 'lucide-react';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import {
  createCandidateDocumentIdFromTaxCode,
  findCandidateDuplicate,
  LEAD_CANDIDATE_SCHEMA_VERSION,
  type CandidateDuplicate,
  type LeadCandidateActivityType,
  type LeadCandidateContactLog,
  type LeadCandidateContactOutcome,
  type LeadCandidateContactResult,
  type LeadCandidateFileRecord,
  type LeadCandidatePotentialLevel,
  type LeadCandidateRecord,
  type LeadCandidateTaskSource,
  type LeadCandidateTaskStatus
} from '@/features/crm/model/leadCandidateModels';
import { normalizeTaxCode } from '@/features/crm/model/taxCodeUniqueness';
import { CUSTOMER_FILTER_IDS } from '@/features/crm/model/customerFilterConfig';
import { LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import {
  getSystemFilterDefinition,
  isSystemFilterEnabled
} from '@/domain/systemFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import {
  getNotificationDocumentId,
  NOTIFICATION_SCHEMA_VERSION
} from '@/domain/notificationModels';
import {
  dbService,
  isDocumentAlreadyExistsError,
  type UserProfile
} from '@/infrastructure/firebase/erpDataGateway';
import { auditService, type AuditEvent, type UserPresence } from '@/services/auditService';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { candidateCallSubjectKey } from '@/features/crm/model/callHistory';
import { PageBackButton } from '@/components/PageBackButton';
import { BusinessLocationFields } from './BusinessLocationFields';
import { CustomerInsightClassification } from './CustomerInsightClassification';
import { CrmRecordHeaderFacts, CrmRecordHeaderIdentity, CrmRecordHeaderTabs } from './CrmRecordHeader';
import { CUSTOMER_INSIGHT_GROUPS, CUSTOMER_INSIGHT_ITEMS, CUSTOMER_INSIGHT_ITEM_BY_ID, getCustomerInsightGroupsForModule, matchesCustomerInsightValues, replaceCustomerInsightGroupValues } from '@/features/crm/model/customerInsightCatalog';
import { RowActionMenu } from '@/components/RowActionMenu';
import { SupportRequestDialog, type SupportRequestTarget } from '@/components/SupportRequestDialog';
import { WorkAssignmentDialog, type WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import { RawDataOverview } from './RawDataOverview';
import { RawDataScoringPage } from './RawDataScoringPage';
import { LeadCandidateScoreDialog } from './LeadCandidateScoreDialog';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { EntityCustomFieldsGrid, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
import { InlineEntityFieldManager } from '@/components/InlineEntityFieldManager';
import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import {
  formatEntityCustomFieldValue,
  getMissingRequiredEntityFields,
  getEntityCustomFieldSearchValues,
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldFilterTokens,
  type EntityCustomFieldValues,
  type EntityFieldDefinition
} from '@/features/crm/model/entityFieldConfig';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import {
  countAdvancedFilters,
  getAdvancedFilterKindForFieldType,
  getAdvancedFilterSummaries,
  matchesAdvancedFilters,
  toAdvancedFilterValues,
  type AdvancedFilterField,
  type AdvancedFilterState
} from '@/components/advancedDataFilterModel';

interface LeadCandidateWorkspaceProps {
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  saleUsers: UserProfile[];
  users: UserProfile[];
  currentUser: UserProfile;
  onStartConversion: (candidate: LeadCandidateRecord) => void;
  initialCandidateId?: string;
  onInitialCandidateOpened?: () => void;
  initialInsightFilterId?: string;
}

interface CandidateFormState {
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

interface ScheduleFormState {
  nextContactAt: string;
  note: string;
}

const CANDIDATE_SOURCES = ['Google Maps', 'Facebook', 'Mạng xã hội', 'Website', 'Khách hàng giới thiệu', 'Khác'];
type CandidateWorkspaceView = 'management' | 'tasks' | 'all';
type CandidateSort = 'priority' | 'updated_desc' | 'company_asc' | 'next_contact_asc';
type CandidateColumnId = string;
type EmployeeActivityRange = 'today' | '7days' | 'all';
type EmployeeActivityGroup = 'all' | 'call' | 'data' | 'schedule' | 'task';
type SalesReportPeriod = 'week' | 'month' | 'quarter' | 'custom';
type CandidateDetailTab = 'classification' | 'profile';

interface SalesReportWindow {
  startAt: number;
  endAt: number;
  label: string;
}

const normalizeCandidateFieldName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLocaleLowerCase('vi-VN')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isClassificationOwnedProfileField = (definition: EntityFieldDefinition) => {
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

interface CandidateColumnOption extends TableColumnOption {
  id: CandidateColumnId;
  adminOnly?: boolean;
  fieldKey?: string;
}

const CANDIDATE_SECTION_LABELS: Record<string, string> = {
  company: 'Thông tin doanh nghiệp',
  classification: 'Thông tin doanh nghiệp',
  contact: 'Liên hệ và nguồn dữ liệu',
  needs: 'Nhu cầu sơ bộ',
  assignment: 'Phụ trách và lịch hẹn',
  additional: 'Trường thông tin bổ sung'
};

const CANDIDATE_PROFILE_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'company', fieldKey: 'companyName', label: 'Doanh nghiệp', group: CANDIDATE_SECTION_LABELS.company, required: true },
  { id: 'taxCode', fieldKey: 'taxCode', label: 'Mã số thuế', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'website', fieldKey: 'website', label: 'Website', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'businessSector', fieldKey: 'businessSector', label: 'Lĩnh vực hoạt động', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'province', fieldKey: 'province', label: 'Tỉnh/thành', group: CANDIDATE_SECTION_LABELS.company },
  { id: 'ward', fieldKey: 'ward', label: 'Phường/xã', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'industrialPark', fieldKey: 'industrialPark', label: 'Khu công nghiệp', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'address', fieldKey: 'address', label: 'Địa chỉ doanh nghiệp', group: CANDIDATE_SECTION_LABELS.company, defaultVisible: false },
  { id: 'contact', fieldKey: 'contact', label: 'Thông tin liên hệ (tóm tắt)', group: CANDIDATE_SECTION_LABELS.contact },
  { id: 'contactPerson', fieldKey: 'contactPerson', label: 'Người liên hệ', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'contactPosition', fieldKey: 'contactPosition', label: 'Chức vụ', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'phone', fieldKey: 'phone', label: 'Điện thoại', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'email', fieldKey: 'email', label: 'Email', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'source', fieldKey: 'source', label: 'Nguồn tìm kiếm', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'sourceUrl', fieldKey: 'sourceUrl', label: 'Đường dẫn nguồn', group: CANDIDATE_SECTION_LABELS.contact, defaultVisible: false },
  { id: 'expectedProducts', fieldKey: 'expectedProducts', label: 'Sản phẩm / nhu cầu quan tâm', group: CANDIDATE_SECTION_LABELS.needs, defaultVisible: false },
  { id: 'note', fieldKey: 'note', label: 'Ghi chú', group: CANDIDATE_SECTION_LABELS.needs, defaultVisible: false }
];

const TASK_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'index', label: 'STT', group: 'Điều khiển bảng', required: true },
  ...CANDIDATE_PROFILE_COLUMN_OPTIONS,
  { id: 'status', fieldKey: 'contactResult', label: 'Trạng thái', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'assignee', fieldKey: 'assignedSaleId', label: 'Sale phụ trách', group: CANDIDATE_SECTION_LABELS.assignment, adminOnly: true },
  { id: 'potential', fieldKey: 'potentialLevel', label: 'Mức độ tiềm năng', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'schedule', fieldKey: 'nextContactAt', label: 'Lịch hẹn', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'latest', fieldKey: 'latest', label: 'Cập nhật gần nhất', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'actions', label: 'Thao tác', group: 'Điều khiển bảng', required: true }
];

const ALL_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'select', label: 'Chọn dữ liệu', group: 'Điều khiển bảng', required: true },
  { id: 'index', label: 'STT', group: 'Điều khiển bảng', required: true },
  ...CANDIDATE_PROFILE_COLUMN_OPTIONS,
  { id: 'assignee', fieldKey: 'assignedSaleId', label: 'Sale phụ trách', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'processing', fieldKey: 'processing', label: 'Sale đang xử lý', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'potential', fieldKey: 'potentialLevel', label: 'Mức độ tiềm năng', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'schedule', fieldKey: 'nextContactAt', label: 'Lịch tiếp theo', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'latest', fieldKey: 'latest', label: 'Cập nhật gần nhất', group: CANDIDATE_SECTION_LABELS.assignment },
  { id: 'actions', label: 'Thao tác', group: 'Điều khiển bảng', required: true }
];

const getAvailableColumns = (
  view: CandidateWorkspaceView,
  isAdmin: boolean,
  customDefinitions: EntityFieldDefinition[] = [],
  systemFields: Array<{ key: string; label: string; removed: boolean }> = []
): CandidateColumnOption[] => ([
  ...(view === 'tasks' ? TASK_COLUMN_OPTIONS : ALL_COLUMN_OPTIONS)
    .filter(column => !column.adminOnly || isAdmin)
    .filter(column => !column.fieldKey || !systemFields.find(field => field.key === column.fieldKey)?.removed)
    .map(column => ({
      ...column,
      label: column.fieldKey
        ? systemFields.find(field => field.key === column.fieldKey)?.label || column.label
        : column.label
    })),
  ...customDefinitions.filter(definition => definition.active).map(definition => ({
    id: `custom:${definition.id}`,
    label: definition.name,
    group: CANDIDATE_SECTION_LABELS[definition.section] || CANDIDATE_SECTION_LABELS.additional,
    defaultVisible: definition.defaultVisible
  })),
  ...CUSTOMER_INSIGHT_GROUPS.flatMap(group => group.items.map(entry => ({
    id: `insight:${entry.id}`,
    label: entry.label,
    group: `Phân loại · ${group.label}`,
    defaultVisible: false
  })))
]);

const getDefaultVisibleColumns = (isAdmin: boolean): Record<CandidateWorkspaceView, CandidateColumnId[]> => ({
  management: [],
  tasks: getAvailableColumns('tasks', isAdmin).filter(column => column.required || column.defaultVisible !== false).map(column => column.id),
  all: getAvailableColumns('all', isAdmin).filter(column => column.required || column.defaultVisible !== false).map(column => column.id)
});

const loadVisibleColumns = (userId: string, isAdmin: boolean) => {
  const defaults = getDefaultVisibleColumns(isAdmin);
  try {
    const stored = window.localStorage.getItem(`sunflower:lead-candidate-columns:${userId}`);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<Record<CandidateWorkspaceView, string[]>>;
    return (['management', 'tasks', 'all'] as CandidateWorkspaceView[]).reduce<Record<CandidateWorkspaceView, CandidateColumnId[]>>((result, view) => {
      const available = getAvailableColumns(view, isAdmin);
      const availableIds = new Set(available.map(column => column.id));
      const requiredIds = available.filter(column => column.required).map(column => column.id);
      const storedIds = Array.isArray(parsed[view]) ? parsed[view].filter((id): id is CandidateColumnId => availableIds.has(id as CandidateColumnId) || id.startsWith('custom:')) : [];
      result[view] = Array.from(new Set([...requiredIds, ...(storedIds.length > 0 ? storedIds : defaults[view])]));
      return result;
    }, { management: [], tasks: [], all: [] });
  } catch {
    return defaults;
  }
};

const CONTACT_STATUS_LABELS: Record<LeadCandidateContactResult, string> = {
  not_contacted: 'Chưa liên hệ',
  working: 'Đang làm việc',
  called: 'Đã gọi điện',
  messaged: 'Đã nhắn tin',
  callback: 'Hẹn gọi lại'
};

const POTENTIAL_LEVEL_LABELS: Record<LeadCandidatePotentialLevel, string> = {
  unrated: 'Chưa đánh giá',
  not_fit: 'Không phù hợp',
  low: 'Tiềm năng thấp',
  potential: 'Có tiềm năng',
  promising: 'Khả quan',
  high: 'Tiềm năng cao'
};

const ACTIVITY_TYPE_LABELS: Record<LeadCandidateActivityType, string> = {
  call: 'Đã gọi điện',
  message: 'Đã nhắn tin',
  email: 'Đã gửi email',
  meeting: 'Đã gặp trực tiếp',
  note: 'Ghi chú công việc'
};

const CONTACT_RESULT_OUTCOMES: Record<LeadCandidateContactResult, LeadCandidateContactOutcome> = {
  not_contacted: 'not_contacted',
  working: 'connected',
  called: 'connected',
  messaged: 'connected',
  callback: 'call_back'
};

const RAW_DATA_EMPLOYEE_ACTIONS = new Set([
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

const EMPLOYEE_ACTION_LABELS: Record<string, string> = {
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

const getEmployeeActivityGroup = (action: string): Exclude<EmployeeActivityGroup, 'all'> => {
  if (['candidate_phone_called', 'phone_call_started', 'phone_call_confirmed', 'phone_call_manual_recorded'].includes(action)) return 'call';
  if (action === 'follow_up_scheduled') return 'schedule';
  if (['candidate_added_to_work_queue', 'candidate_assigned_to_sale', 'candidate_task_dismissed'].includes(action)) return 'task';
  return 'data';
};

const CANDIDATE_STAGE_LABELS: Record<LeadCandidateRecord['status'], string> = {
  new: 'Dữ liệu mới',
  retry: 'Cần xử lý lại',
  disqualified: 'Không phù hợp',
  converted: 'Đã chuyển Tiềm năng'
};

const REPORT_WORK_ACTIONS = new Set([
  'phone_call_started', 'phone_call_manual_recorded', 'candidate_phone_called',
  'candidate_updated', 'follow_up_scheduled', 'contact_status_updated',
  'potential_updated', 'candidate_task_dismissed', 'candidate_converted_to_lead'
]);

const toDateInputValue = (value: Date) => {
  const adjusted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 10);
};

const getSalesReportWindow = (
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
  if (Number.isNaN(selectedStart.getTime()) || Number.isNaN(selectedEnd.getTime()) || selectedStart > selectedEnd) return null;
  return { startAt: selectedStart.getTime(), endAt: selectedEnd.getTime(), label: `${customStart} đến ${customEnd}` };
};

const getEmployeeActionLabel = (event: AuditEvent) => {
  if (event.action === 'contact_status_updated') {
    const value = event.changes?.find(change => change.field === 'contactResult')?.after;
    return value ? `Liên hệ: ${value}` : EMPLOYEE_ACTION_LABELS[event.action];
  }
  if (event.action === 'potential_updated') {
    const value = event.changes?.find(change => change.field === 'potentialLevel')?.after;
    return value ? `Đánh giá: ${value}` : EMPLOYEE_ACTION_LABELS[event.action];
  }
  if (event.action === 'candidate_pin_toggled') return event.summary.startsWith('Bỏ ghim') ? 'Bỏ ghim dữ liệu' : 'Ghim dữ liệu';
  return EMPLOYEE_ACTION_LABELS[event.action] || 'Cập nhật dữ liệu';
};

const formatActivityTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { time: '--:--', date: '' };
  return {
    time: date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
  };
};

const toDateTimeLocal = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const tomorrowAtNine = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
};

const formatShortDateTime = (value: string, fallback = 'Chưa có') => {
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

const isVisibleTask = (candidate: LeadCandidateRecord) => (
  !candidate.workQueueHidden
  && candidate.status !== 'converted'
  && candidate.status !== 'disqualified'
);

const createLogId = () => `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const latestCandidateLog = (candidate: LeadCandidateRecord) => candidate.contactLogs
  .slice()
  .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];

const describeCandidateLog = (log: LeadCandidateContactLog) => {
  if (log.description) return log.description;
  if (log.eventType === 'potential_level' && log.potentialLevel) return `Đánh giá: ${POTENTIAL_LEVEL_LABELS[log.potentialLevel]}`;
  if (log.eventType === 'activity' && log.activityType) return ACTIVITY_TYPE_LABELS[log.activityType];
  if (log.eventType === 'schedule') return 'Đặt lịch liên hệ tiếp theo';
  if (log.contactResult) return `Trạng thái: ${CONTACT_STATUS_LABELS[log.contactResult]}`;
  return 'Cập nhật thông tin liên hệ';
};

const createEmptyCandidateForm = (
  currentUser: UserProfile,
  ownerUsers: UserProfile[]
): CandidateFormState => ({
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
  assignedSaleId: currentUser.role === 'sale' ? currentUser.uid : (ownerUsers[0]?.uid || currentUser.uid),
  nextContactAt: '',
  note: '',
  customerInsightValues: []
});

const matchesSearch = (candidate: LeadCandidateRecord, searchTerm: string, customDefinitions: EntityFieldDefinition[] = []) => {
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

const describeDuplicate = (duplicate: CandidateDuplicate) => {
  const recordLabel = duplicate.recordType === 'candidate'
    ? 'Dữ liệu khách hàng'
    : duplicate.recordType === 'lead' ? 'Lead' : 'Khách hàng hợp tác';
  const reasonLabel = duplicate.reason === 'taxCode'
    ? 'mã số thuế'
    : duplicate.reason === 'phone' ? 'số điện thoại' : 'tên doanh nghiệp';
  return `${recordLabel} “${duplicate.companyName}” đã có cùng ${reasonLabel}.`;
};

export const LeadCandidateWorkspace: React.FC<LeadCandidateWorkspaceProps> = ({
  candidates,
  leads,
  customers,
  saleUsers,
  users,
  currentUser,
  onStartConversion,
  initialCandidateId = '',
  onInitialCandidateOpened,
  initialInsightFilterId = ''
}) => {
  const { definitions: customFieldDefinitions } = useEntityFieldDefinitions('lead_candidates', currentUser.role);
  const profileCustomFieldDefinitions = useMemo(
    () => customFieldDefinitions.filter(definition => !isClassificationOwnedProfileField(definition)),
    [customFieldDefinitions]
  );
  const inlineSystemFieldConfiguration = useSystemFieldConfiguration('lead_candidates');
  const systemFilterDefinitions = useSystemFilterConfiguration();
  const provinceFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.province, 'customer_data');
  const industrialParkFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.industrialPark, 'customer_data');
  const sourceFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.source, 'customer_data');
  const contactResultFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'contact_result', 'customer_data');
  const potentialFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'potential_level', 'customer_data');
  const saleFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.sale, 'customer_data');
  const pinnedFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'pinned', 'customer_data');
  const configuredFilterName = (filterId: string, fallback: string) => (
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.name || fallback
  );
  const configuredFilterDescription = (filterId: string, fallback = '') => (
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.description || fallback
  );
  const candidateOwners = useMemo(() => currentUser.role === 'admin'
    ? [currentUser, ...saleUsers.filter(user => user.uid !== currentUser.uid)]
    : saleUsers.some(user => user.uid === currentUser.uid) ? saleUsers : [currentUser, ...saleUsers],
  [currentUser, saleUsers]);
  const [searchTerm, setSearchTerm] = useState('');
  const [workspaceView, setWorkspaceView] = useState<CandidateWorkspaceView>('all');
  const [adminRawView, setAdminRawView] = useState<'overview' | 'priority' | 'scoring' | 'list'>('overview');
  const [adminListPrepared, setAdminListPrepared] = useState(currentUser.role !== 'admin');
  const [saleFilters, setSaleFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [provinceFilters, setProvinceFilters] = useState<string[]>([]);
  const [industrialParkFilters, setIndustrialParkFilters] = useState<string[]>([]);
  const [contactResultFilters, setContactResultFilters] = useState<LeadCandidateContactResult[]>([]);
  const [potentialFilters, setPotentialFilters] = useState<LeadCandidatePotentialLevel[]>([]);
  const [insightFilters, setInsightFilters] = useState<string[]>([]);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('priority');
  const [showDataFilters, setShowDataFilters] = useState(false);

  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [visibleColumnsByView, setVisibleColumnsByView] = useState(() => loadVisibleColumns(currentUser.uid, currentUser.role === 'admin'));
  const [hasStoredColumnPreferences, setHasStoredColumnPreferences] = useState(() => {
    try {
      return Boolean(window.localStorage.getItem(`sunflower:lead-candidate-columns:${currentUser.uid}`));
    } catch {
      return false;
    }
  });
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => {
    if (!initialInsightFilterId) return;
    const timer = window.setTimeout(() => {
      setAdminRawView('list');
      setAdminListPrepared(true);
      setWorkspaceView('all');
      setInsightFilters([initialInsightFilterId]);
      setCurrentPage(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialInsightFilterId]);
  const [showForm, setShowForm] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState('');
  const [candidateDetailTab, setCandidateDetailTab] = useState<CandidateDetailTab>('classification');
  const [form, setForm] = useState<CandidateFormState>(() => createEmptyCandidateForm(currentUser, candidateOwners));
  const [candidateFiles, setCandidateFiles] = useState<LeadCandidateFileRecord[]>([]);
  const [candidateLinkName, setCandidateLinkName] = useState('');
  const [candidateLinkUrl, setCandidateLinkUrl] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});
  const [saveError, setSaveError] = useState('');
  const [scheduleCandidateId, setScheduleCandidateId] = useState('');
  const [scoringCandidateId, setScoringCandidateId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({ nextContactAt: tomorrowAtNine(), note: '' });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleContactResult, setScheduleContactResult] = useState<LeadCandidateContactResult | ''>('');
  const [actionError, setActionError] = useState('');
  const [taskActionCandidateId, setTaskActionCandidateId] = useState('');
  const [fieldActionCandidateId, setFieldActionCandidateId] = useState('');
  const [selectedQueueCandidateIds, setSelectedQueueCandidateIds] = useState<string[]>([]);
  const [batchAssigneeId, setBatchAssigneeId] = useState('');
  const [batchQueueError, setBatchQueueError] = useState('');
  const [savingBatchQueue, setSavingBatchQueue] = useState(false);
  const [referenceTime] = useState(() => Date.now());
  const [employeeActivityEvents, setEmployeeActivityEvents] = useState<AuditEvent[]>([]);
  const [employeePresences, setEmployeePresences] = useState<UserPresence[]>([]);
  const [selectedManagedSaleId, setSelectedManagedSaleId] = useState('');
  const [supportTarget, setSupportTarget] = useState<SupportRequestTarget | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<WorkAssignmentTarget | null>(null);
  const [employeeActivityRange, setEmployeeActivityRange] = useState<EmployeeActivityRange>('today');
  const [employeeActivityGroup, setEmployeeActivityGroup] = useState<EmployeeActivityGroup>('all');
  const [salesReportPeriod, setSalesReportPeriod] = useState<SalesReportPeriod>('week');
  const [salesReportStart, setSalesReportStart] = useState(() => toDateInputValue(new Date(referenceTime - 6 * 24 * 60 * 60 * 1000)));
  const [salesReportEnd, setSalesReportEnd] = useState(() => toDateInputValue(new Date(referenceTime)));
  const [salesReportEvents, setSalesReportEvents] = useState<AuditEvent[]>([]);
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  const [salesReportError, setSalesReportError] = useState('');

  const showRawOverview = useCallback(() => {
    setAdminRawView('overview');
    setShowDataFilters(false);
    setShowColumnCustomizer(false);
  }, []);
  const showRawPriority = useCallback(() => setAdminRawView('priority'), []);
  const showRawScoring = useCallback(() => setAdminRawView('scoring'), []);
  const showRawList = useCallback(() => {
    setAdminListPrepared(true);
    setAdminRawView('list');
  }, []);
  useEffect(() => {
    if (currentUser.role !== 'admin' || adminListPrepared) return undefined;
    const frame = window.requestAnimationFrame(() => setAdminListPrepared(true));
    return () => window.cancelAnimationFrame(frame);
  }, [adminListPrepared, currentUser.role]);

  useEffect(() => {
    if (workspaceView !== 'management' || currentUser.role !== 'admin') return undefined;
    const unsubscribeEvents = dbService.subscribeCollection('audit_events', data => {
      setEmployeeActivityEvents((data as AuditEvent[])
        .filter(event => (
          event.module === 'lead_candidates'
          && event.category === 'business'
          && RAW_DATA_EMPLOYEE_ACTIONS.has(event.action)
        ))
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)));
    }, {
      orderByField: 'occurredAt',
      orderDirection: 'desc',
      maxResults: 250
    });
    const unsubscribePresence = dbService.subscribeCollection('user_presence', data => {
      setEmployeePresences(data as UserPresence[]);
    }, {
      fieldName: 'role',
      fieldValue: 'sale'
    });
    return () => {
      unsubscribeEvents();
      unsubscribePresence();
    };
  }, [currentUser.role, workspaceView]);

  const clearPurgedCustomField = (fieldId: string) => setCustomFieldValues(previous => {
    const next = { ...previous };
    delete next[fieldId];
    return next;
  });
  const clearPurgedSystemField = (fieldKey: string) => setForm(previous => ({
    ...previous,
    [fieldKey]: typeof (previous as unknown as Record<string, unknown>)[fieldKey] === 'number' ? 0 : ''
  }));

  const availableColumnOptions = getAvailableColumns(
    workspaceView,
    currentUser.role === 'admin',
    customFieldDefinitions,
    inlineSystemFieldConfiguration.fields
  );
  const visibleColumnSet = new Set([
    ...visibleColumnsByView[workspaceView],
    ...(!hasStoredColumnPreferences
      ? customFieldDefinitions.filter(definition => definition.active && definition.defaultVisible).map(definition => `custom:${definition.id}`)
      : [])
  ]);
  const saveVisibleColumns = (selectedIds: string[]) => {
    const availableIds = new Set(availableColumnOptions.map(column => column.id));
    const requiredIds = availableColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([
      ...requiredIds,
      ...selectedIds.filter((id): id is CandidateColumnId => availableIds.has(id as CandidateColumnId))
    ]));
    const nextPreferences = { ...visibleColumnsByView, [workspaceView]: nextIds };
    setVisibleColumnsByView(nextPreferences);
    setHasStoredColumnPreferences(true);
    try {
      window.localStorage.setItem(`sunflower:lead-candidate-columns:${currentUser.uid}`, JSON.stringify(nextPreferences));
    } catch {
      // The table still works with the in-memory preference when browser storage is unavailable.
    }
    setShowColumnCustomizer(false);
  };
  const {
    orderedColumnIds,
    getHeaderProps,
    resizedTableWidth
  } = useReorderableTableColumns({
    columns: availableColumnOptions,
    selectedIds: Array.from(visibleColumnSet),
    onOrderChange: saveVisibleColumns,
    widthStorageKey: `sunflower:lead-candidate-column-widths:v2:${currentUser.uid}:${workspaceView}`,
    lockedStartIds: workspaceView === 'all' ? ['select', 'index', 'company'] : ['index', 'company'],
    lockedEndIds: ['actions']
  });
  const candidateColumnLabels = Object.fromEntries(availableColumnOptions.map(column => [column.id, column.label]));
  const visibleCandidateInsightItems = CUSTOMER_INSIGHT_ITEMS.filter(entry => visibleColumnSet.has(`insight:${entry.id}`));
  const candidateTableDefaultWidth = Math.max(1180, orderedColumnIds.reduce((total, columnId) => {
    if (columnId === 'select') return total + 36;
    if (columnId === 'index') return total + 52;
    if (columnId === 'company') return total + 280;
    if (columnId === 'actions') return total + 72;
    return total + 150;
  }, 0));
  const candidateTableStyle = {
    '--erp-table-resized-width': `${resizedTableWidth || candidateTableDefaultWidth}px`
  } as React.CSSProperties;

  const accessibleCandidates = useMemo(() => candidates.filter(candidate => (
    !candidate.archived
    && (currentUser.role !== 'sale' || candidate.assignedSaleId === currentUser.uid)
  )), [candidates, currentUser.role, currentUser.uid]);

  const taskCandidates = useMemo(() => accessibleCandidates.filter(candidate => (
    isVisibleTask(candidate)
    && (currentUser.role === 'admin' || candidate.assignedSaleId === currentUser.uid)
  )), [accessibleCandidates, currentUser.role, currentUser.uid]);

  const workspaceCounts = useMemo(() => ({
    management: saleUsers.length,
    tasks: taskCandidates.length,
    all: accessibleCandidates.length
  }), [accessibleCandidates.length, saleUsers.length, taskCandidates.length]);

  const employeeCards = useMemo(() => {
    const now = referenceTime;
    const today = new Date(referenceTime).toLocaleDateString('vi-VN');
    return saleUsers.map(sale => {
      const presence = employeePresences.find(item => item.userId === sale.uid);
      const lastSeenAt = presence?.lastSeenAt || '';
      const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
      const minutesSinceSeen = lastSeenTime ? Math.max(0, Math.floor((now - lastSeenTime) / 60_000)) : Number.MAX_SAFE_INTEGER;
      const isInRawData = presence?.lastPageId === 'customer_data';
      const presenceStatus: 'active' | 'idle' | 'offline' = isInRawData && presence?.status === 'online' && minutesSinceSeen <= 3
        ? 'active'
        : isInRawData && presence?.status === 'online' && minutesSinceSeen <= 15 ? 'idle' : 'offline';
      const activities = employeeActivityEvents.filter(event => event.actorId === sale.uid);
      const todayActivities = activities.filter(event => (
        new Date(event.occurredAt).toLocaleDateString('vi-VN') === today
      ));
      const assignedCandidates = accessibleCandidates
        .filter(candidate => candidate.assignedSaleId === sale.uid && isVisibleTask(candidate))
        .sort((left, right) => String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt)));
      return {
        sale,
        presence,
        presenceStatus,
        minutesSinceSeen,
        activities,
        todayActivities,
        currentCandidate: assignedCandidates[0] || null,
        assignedCount: assignedCandidates.length,
        touchedCount: new Set(todayActivities.map(event => event.targetId).filter(Boolean)).size,
        callCount: todayActivities.filter(event => ['candidate_phone_called', 'phone_call_started', 'phone_call_manual_recorded'].includes(event.action)).length,
        scheduleCount: todayActivities.filter(event => event.action === 'follow_up_scheduled').length
      };
    }).sort((left, right) => {
      const statusOrder = { active: 0, idle: 1, offline: 2 } as const;
      return statusOrder[left.presenceStatus] - statusOrder[right.presenceStatus]
        || left.sale.displayName.localeCompare(right.sale.displayName, 'vi-VN');
    });
  }, [accessibleCandidates, employeeActivityEvents, employeePresences, referenceTime, saleUsers]);

  const selectedEmployeeCard = employeeCards.find(card => card.sale.uid === selectedManagedSaleId) || null;
  const salesReportWindow = useMemo(() => getSalesReportWindow(
    salesReportPeriod, referenceTime, salesReportStart, salesReportEnd
  ), [referenceTime, salesReportEnd, salesReportPeriod, salesReportStart]);

  useEffect(() => {
    if (workspaceView !== 'management' || currentUser.role !== 'admin' || !selectedManagedSaleId) return undefined;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setSalesReportLoading(true);
      setSalesReportError('');
      try {
        const data = await dbService.getCollectionByField('audit_events', 'actorId', selectedManagedSaleId, {
          orderByField: 'occurredAt', direction: 'desc', maxResults: 5000
        });
        if (!active) return;
        setSalesReportEvents((data as AuditEvent[]).filter(event => (
          event.module === 'lead_candidates'
          && event.category === 'business'
          && RAW_DATA_EMPLOYEE_ACTIONS.has(event.action)
        )));
      } catch {
        if (active) setSalesReportError('Không tải được dữ liệu báo cáo. Vui lòng thử lại.');
      } finally {
        if (active) setSalesReportLoading(false);
      }
    });
    return () => { active = false; };
  }, [currentUser.role, selectedManagedSaleId, workspaceView]);

  const selectedSalesReport = useMemo(() => {
    if (!salesReportWindow) return null;
    const events = salesReportEvents.filter(event => {
      const occurredAt = new Date(event.occurredAt).getTime();
      return occurredAt >= salesReportWindow.startAt && occurredAt <= salesReportWindow.endAt;
    });
    const calls = events.filter(event => ['phone_call_started', 'phone_call_manual_recorded', 'candidate_phone_called'].includes(event.action));
    const confirmedCalls = events.filter(event => event.action === 'phone_call_confirmed');
    const processedCandidateIds = new Set(events
      .filter(event => REPORT_WORK_ACTIONS.has(event.action))
      .map(event => event.targetId)
      .filter(Boolean));
    const convertedCandidateIds = new Set(events
      .filter(event => event.action === 'candidate_converted_to_lead')
      .map(event => event.targetId)
      .filter(Boolean));
    const scheduled = events.filter(event => event.action === 'follow_up_scheduled');
    const created = events.filter(event => event.action === 'candidate_created');
    const activityByDate = new Map<string, AuditEvent[]>();
    events.forEach(event => {
      const key = new Date(event.occurredAt).toLocaleDateString('vi-VN');
      activityByDate.set(key, [...(activityByDate.get(key) || []), event]);
    });
    return {
      events,
      calls,
      confirmedCalls,
      processedCandidateIds,
      convertedCandidateIds,
      scheduled,
      created,
      activityByDate: Array.from(activityByDate.entries()).map(([date, dailyEvents]) => ({
        date,
        processed: new Set(dailyEvents.filter(event => REPORT_WORK_ACTIONS.has(event.action)).map(event => event.targetId).filter(Boolean)).size,
        calls: dailyEvents.filter(event => ['phone_call_started', 'phone_call_manual_recorded', 'candidate_phone_called'].includes(event.action)).length,
        schedules: dailyEvents.filter(event => event.action === 'follow_up_scheduled').length,
        converted: new Set(dailyEvents.filter(event => event.action === 'candidate_converted_to_lead').map(event => event.targetId).filter(Boolean)).size
      })).sort((left, right) => {
        const [leftDay, leftMonth, leftYear] = left.date.split('/').map(Number);
        const [rightDay, rightMonth, rightYear] = right.date.split('/').map(Number);
        return new Date(rightYear, rightMonth - 1, rightDay).getTime() - new Date(leftYear, leftMonth - 1, leftDay).getTime();
      })
    };
  }, [salesReportEvents, salesReportWindow]);

  const selectedEmployeeActivities = useMemo(() => {
    if (!selectedEmployeeCard) return [];
    const startOfToday = new Date(referenceTime);
    startOfToday.setHours(0, 0, 0, 0);
    const rangeStart = employeeActivityRange === 'today'
      ? startOfToday.getTime()
      : employeeActivityRange === '7days' ? referenceTime - 7 * 24 * 60 * 60 * 1000 : 0;
    return selectedEmployeeCard.activities.filter(event => (
      new Date(event.occurredAt).getTime() >= rangeStart
      && (employeeActivityGroup === 'all' || getEmployeeActivityGroup(event.action) === employeeActivityGroup)
    )).slice(0, 50);
  }, [employeeActivityGroup, employeeActivityRange, referenceTime, selectedEmployeeCard]);

  const provinceOptions = useMemo(() => Array.from(new Set(
    accessibleCandidates.map(candidate => candidate.province.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'vi-VN')), [accessibleCandidates]);
  const industrialParkOptions = useMemo(() => Array.from(new Set(
    accessibleCandidates.map(candidate => candidate.industrialPark.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'vi-VN')), [accessibleCandidates]);

  const customFilterOptions = useMemo(() => Object.fromEntries(
    customFieldDefinitions.filter(definition => definition.active).map(definition => [
      definition.id,
      Array.from(new Set(accessibleCandidates.flatMap(candidate => getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]))))
        .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
    ])
  ), [accessibleCandidates, customFieldDefinitions]);

  const advancedFilterFields = useMemo<AdvancedFilterField<LeadCandidateRecord>[]>(() => {
    const groups = {
      company: 'Thông tin doanh nghiệp',
      contact: 'Liên hệ và nguồn dữ liệu',
      needs: 'Nhu cầu sơ bộ',
      assignment: 'Phụ trách và lịch hẹn',
      additional: 'Thông tin bổ sung'
    };
    const systemField = (
      id: string,
      fallbackLabel: string,
      group: string,
      kind: AdvancedFilterField<LeadCandidateRecord>['kind'],
      getValues: AdvancedFilterField<LeadCandidateRecord>['getValues'],
      options?: AdvancedFilterField<LeadCandidateRecord>['options']
    ): AdvancedFilterField<LeadCandidateRecord> | null => {
      const configuration = inlineSystemFieldConfiguration.fields.find(field => field.key === id);
      return configuration?.removed ? null : { id: `system:${id}`, label: configuration?.label || fallbackLabel, group, kind, getValues, options };
    };
    const customFields: AdvancedFilterField<LeadCandidateRecord>[] = customFieldDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `custom:${definition.id}`,
        label: definition.name,
        group: groups[definition.section as keyof typeof groups] || groups.additional,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        description: definition.description,
        options: definition.type === 'boolean'
          ? [{ value: 'true', label: 'Có' }, { value: 'false', label: 'Không' }]
          : definition.options.filter(option => option.active).map(option => ({ value: option.id, label: option.label })),
        getValues: candidate => toAdvancedFilterValues(candidate.customFieldValues?.[definition.id])
      }));
    return [
      systemField('companyName', 'Tên doanh nghiệp', groups.company, 'text', candidate => [candidate.companyName]),
      systemField('taxCode', 'Mã số thuế', groups.company, 'text', candidate => [candidate.taxCode]),
      systemField('website', 'Website', groups.company, 'text', candidate => [candidate.website]),
      systemField('businessSector', 'Lĩnh vực hoạt động', groups.company, 'text', candidate => [candidate.businessSector]),
      systemField('province', 'Tỉnh / thành', groups.company, 'text', candidate => [candidate.province]),
      systemField('ward', 'Phường / xã', groups.company, 'text', candidate => [candidate.ward]),
      systemField('industrialPark', 'Khu công nghiệp', groups.company, 'text', candidate => [candidate.industrialPark]),
      systemField('address', 'Địa chỉ doanh nghiệp', groups.company, 'text', candidate => [candidate.address]),
      systemField('contactPerson', 'Người liên hệ', groups.contact, 'text', candidate => [candidate.contactPerson]),
      systemField('contactPosition', 'Chức vụ', groups.contact, 'text', candidate => [candidate.contactPosition]),
      systemField('phone', 'Điện thoại', groups.contact, 'text', candidate => [candidate.phone]),
      systemField('email', 'Email', groups.contact, 'text', candidate => [candidate.email]),
      systemField('source', 'Nguồn tìm kiếm', groups.contact, 'select', candidate => [candidate.source], CANDIDATE_SOURCES.map(source => ({ value: source, label: source }))),
      systemField('sourceUrl', 'Đường dẫn nguồn', groups.contact, 'text', candidate => [candidate.sourceUrl]),
      systemField('expectedProducts', 'Sản phẩm / nhu cầu quan tâm', groups.needs, 'text', candidate => [candidate.expectedProducts]),
      systemField('note', 'Ghi chú', groups.needs, 'text', candidate => [candidate.note]),
      systemField('assignedSaleId', 'Sale phụ trách', groups.assignment, 'select', candidate => [candidate.assignedSaleId], candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))),
      systemField('discoveredById', 'Sale tìm được dữ liệu', groups.assignment, 'select', candidate => [candidate.discoveredById], candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))),
      systemField('contactResult', 'Trạng thái liên hệ', groups.assignment, 'select', candidate => [candidate.contactResult], Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))),
      systemField('potentialLevel', 'Mức độ tiềm năng', groups.assignment, 'select', candidate => [candidate.potentialLevel], Object.entries(POTENTIAL_LEVEL_LABELS).map(([value, label]) => ({ value, label }))),
      systemField('nextContactAt', 'Lịch hẹn xử lý', groups.assignment, 'date', candidate => [candidate.nextContactAt]),
      systemField('updatedAt', 'Cập nhật gần nhất', groups.assignment, 'date', candidate => [candidate.updatedAt]),
      ...customFields
    ].filter((field): field is AdvancedFilterField<LeadCandidateRecord> => Boolean(field));
  }, [candidateOwners, customFieldDefinitions, inlineSystemFieldConfiguration.fields]);

  const advancedFilterCount = countAdvancedFilters(advancedFilters);

  const filteredCandidates = useMemo(() => {
    const sourceCandidates = workspaceView === 'tasks' ? taskCandidates : accessibleCandidates;
    return sourceCandidates.filter(candidate => {
    const matchesSale = !saleFilterEnabled || saleFilters.length === 0 || saleFilters.includes(candidate.assignedSaleId);
    const matchesSource = !sourceFilterEnabled || sourceFilters.length === 0 || sourceFilters.includes(candidate.source);
    const matchesProvince = !provinceFilterEnabled || provinceFilters.length === 0 || provinceFilters.includes(candidate.province);
    const matchesIndustrialPark = !industrialParkFilterEnabled || industrialParkFilters.length === 0 || industrialParkFilters.includes(candidate.industrialPark);
    const matchesContactResult = !contactResultFilterEnabled || contactResultFilters.length === 0 || contactResultFilters.includes(candidate.contactResult);
    const matchesPotential = !potentialFilterEnabled || potentialFilters.length === 0 || potentialFilters.includes(candidate.potentialLevel);
    const matchesCustomFields = customFieldDefinitions.filter(definition => definition.active).every(definition => {
      const selected = customFieldFilters[definition.id] || [];
      if (selected.length === 0) return true;
      const tokens = getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]);
      return selected.some(value => tokens.includes(value));
    });
    return matchesSale && matchesSource && matchesProvince && matchesIndustrialPark && matchesContactResult && matchesPotential && matchesCustomerInsightValues(candidate.customerInsightValues || [], insightFilters) && matchesCustomFields && matchesAdvancedFilters(candidate, advancedFilterFields, advancedFilters) && (!pinnedFilterEnabled || !pinnedOnly || candidate.pinned) && matchesSearch(candidate, searchTerm, customFieldDefinitions);
  }).sort((left, right) => {
    if (workspaceView === 'tasks') {
      if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
      if (candidateSort === 'updated_desc') {
        return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
      }
      if (candidateSort === 'priority') {
        const leftAdminPriority = left.taskSource === 'admin_assigned';
        const rightAdminPriority = right.taskSource === 'admin_assigned';
        if (leftAdminPriority !== rightAdminPriority) return leftAdminPriority ? -1 : 1;
      }
      const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
      return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    }
    if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
    if (candidateSort === 'next_contact_asc') {
      const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
      return leftSchedule - rightSchedule;
    }
    if (candidateSort === 'updated_desc') {
      return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    }
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
    return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    });
  }, [accessibleCandidates, advancedFilterFields, advancedFilters, candidateSort, contactResultFilterEnabled, contactResultFilters, customFieldDefinitions, customFieldFilters, industrialParkFilterEnabled, industrialParkFilters, insightFilters, pinnedFilterEnabled, pinnedOnly, potentialFilterEnabled, potentialFilters, provinceFilterEnabled, provinceFilters, saleFilterEnabled, saleFilters, searchTerm, sourceFilterEnabled, sourceFilters, taskCandidates, workspaceView]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedCandidates = filteredCandidates.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const quickFilterCount = (provinceFilterEnabled ? provinceFilters.length : 0)
    + (industrialParkFilterEnabled ? industrialParkFilters.length : 0)
    + (sourceFilterEnabled ? sourceFilters.length : 0)
    + (contactResultFilterEnabled ? contactResultFilters.length : 0)
    + (potentialFilterEnabled ? potentialFilters.length : 0)
    + (saleFilterEnabled ? saleFilters.length : 0)
    + insightFilters.length
    + (pinnedFilterEnabled && pinnedOnly ? 1 : 0)
    + Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const activeFilterCount = quickFilterCount + advancedFilterCount;
  const adminAssignedTaskCount = workspaceView === 'tasks'
    ? filteredCandidates.filter(candidate => candidate.taskSource === 'admin_assigned').length
    : 0;
  const candidateFilterChips = [
    ...(provinceFilterEnabled ? provinceFilters.map(value => ({
      id: `province-${value}`,
      label: `${configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')}: ${value}`,
      onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(industrialParkFilterEnabled ? industrialParkFilters.map(value => ({
      id: `industrial-park-${value}`,
      label: `${configuredFilterName(LEAD_FILTER_IDS.industrialPark, 'Khu công nghiệp')}: ${value}`,
      onRemove: () => setIndustrialParkFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(sourceFilterEnabled ? sourceFilters.map(value => ({
      id: `source-${value}`,
      label: `${configuredFilterName(LEAD_FILTER_IDS.source, 'Nguồn')}: ${value}`,
      onRemove: () => setSourceFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(contactResultFilterEnabled ? contactResultFilters.map(value => ({
      id: `contact-result-${value}`,
      label: `${configuredFilterName('contact_result', 'Trạng thái liên hệ')}: ${CONTACT_STATUS_LABELS[value]}`,
      onRemove: () => setContactResultFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(potentialFilterEnabled ? potentialFilters.map(value => ({
      id: `potential-${value}`,
      label: `${configuredFilterName('potential_level', 'Mức độ tiềm năng')}: ${POTENTIAL_LEVEL_LABELS[value]}`,
      onRemove: () => setPotentialFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(saleFilterEnabled ? saleFilters.map(value => ({
      id: `sale-${value}`,
      label: `${configuredFilterName(CUSTOMER_FILTER_IDS.sale, 'Sale phụ trách')}: ${candidateOwners.find(user => user.uid === value)?.displayName || value}`,
      onRemove: () => setSaleFilters(previous => previous.filter(item => item !== value))
    })) : []),
    ...(pinnedFilterEnabled && pinnedOnly ? [{ id: 'pinned', label: configuredFilterName('pinned', 'Đã ghim'), onRemove: () => setPinnedOnly(false) }] : []),
    ...insightFilters.map(value => ({ id: `insight-${value}`, label: CUSTOMER_INSIGHT_ITEM_BY_ID.get(value)?.label || value, onRemove: () => setInsightFilters(previous => previous.filter(item => item !== value)) })),
    ...customFieldDefinitions.filter(definition => definition.active).flatMap(definition => (customFieldFilters[definition.id] || []).map(value => ({
      id: `custom-${definition.id}-${value}`,
      label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
      onRemove: () => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: (previous[definition.id] || []).filter(item => item !== value) }))
    }))),
    ...getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
      id: `advanced-${summary.id}`,
      label: summary.label,
      onRemove: () => setAdvancedFilters(previous => {
        const next = { ...previous };
        delete next[summary.id];
        setCurrentPage(1);
        return next;
      })
    }))
  ];

  const editingCandidate = editingCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === editingCandidateId) || null
    : null;
  const scheduleCandidate = scheduleCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scheduleCandidateId) || null
    : null;
  const scoringCandidateRecord = scoringCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scoringCandidateId) || null
    : null;
  const scoringCandidate = scoringCandidateRecord && editingCandidate?.id === scoringCandidateRecord.id
    ? { ...scoringCandidateRecord, customerInsightValues: form.customerInsightValues }
    : scoringCandidateRecord;
  const duplicate = useMemo(() => findCandidateDuplicate(
    {
      companyName: form.companyName,
      phone: form.phone,
      taxCode: form.taxCode
    },
    candidates,
    leads,
    customers,
    editingCandidateId
  ), [candidates, customers, editingCandidateId, form.companyName, form.phone, form.taxCode, leads]);
  const hasBlockingDuplicate = duplicate?.reason === 'taxCode';

  const canManageCandidate = (candidate: LeadCandidateRecord) => (
    currentUser.role === 'admin' || candidate.assignedSaleId === currentUser.uid
  );

  const buildCandidateLog = (
    candidate: LeadCandidateRecord,
    details: Partial<LeadCandidateContactLog> & Pick<LeadCandidateContactLog, 'eventType' | 'description'>
  ): LeadCandidateContactLog => ({
    id: createLogId(),
    occurredAt: new Date().toISOString(),
    outcome: details.outcome || candidate.lastContactOutcome || 'connected',
    eventType: details.eventType,
    activityType: details.activityType || '',
    contactResult: details.contactResult || '',
    potentialLevel: details.potentialLevel || '',
    description: details.description,
    note: details.note || '',
    nextContactAt: details.nextContactAt || '',
    createdById: currentUser.uid,
    createdByName: currentUser.displayName
  });

  const prependCandidateLog = (candidate: LeadCandidateRecord, log: LeadCandidateContactLog) => (
    [log, ...candidate.contactLogs].slice(0, 50)
  );

  const recordPhoneCall = async (candidate: LeadCandidateRecord) => {
    if (!candidate.phone || !canManageCandidate(candidate)) return;
    try {
      await dbService.updateDocument('lead_candidates', candidate.id, {
        contactAttempts: candidate.contactAttempts + 1,
        updatedBy: currentUser.displayName
      });
    } catch {
      setActionError('Đã ghi lịch sử gọi nhưng không thể cập nhật số lần liên hệ.');
    }
  };

  const renderPhoneLink = (candidate: LeadCandidateRecord) => {
    if (!candidate.phone) return renderCandidateField(candidate.phone);
    return (
      <button type="button" className="lead-candidate-phone-link" onClick={() => openEditForm(candidate, 'profile')}>{candidate.phone}</button>
    );
  };

  const buildTaskAssignment = (
    candidate?: LeadCandidateRecord | null,
    assignedAt = new Date().toISOString()
  ): Pick<LeadCandidateRecord, 'taskSource' | 'taskAssignedAt' | 'taskAssignedById' | 'taskAssignedByName'> => {
    if (currentUser.role !== 'admin' && candidate?.taskSource === 'admin_assigned') {
      return {
        taskSource: candidate.taskSource,
        taskAssignedAt: candidate.taskAssignedAt,
        taskAssignedById: candidate.taskAssignedById,
        taskAssignedByName: candidate.taskAssignedByName
      };
    }
    return {
      taskSource: currentUser.role === 'admin' ? 'admin_assigned' : 'sale_created',
      taskAssignedAt: assignedAt,
      taskAssignedById: currentUser.uid,
      taskAssignedByName: currentUser.displayName
    };
  };

  const createAdminAssignmentNotification = (
    candidate: LeadCandidateRecord,
    assignee: UserProfile,
    assignedAt: string
  ) => {
    const eventKey = `candidate-admin-assignment:${candidate.id}:${assignedAt}`;
    return dbService.addDocument('notifications', {
      id: getNotificationDocumentId(assignee.uid, eventKey),
      schemaVersion: NOTIFICATION_SCHEMA_VERSION,
      recipientId: assignee.uid,
      module: 'leads',
      eventType: 'candidate_admin_assignment',
      eventKey,
      entityId: candidate.id,
      entityCode: candidate.companyName,
      title: 'Công việc ưu tiên mới',
      message: `${currentUser.displayName} đã giao khách hàng ${candidate.companyName} cho bạn xử lý.`,
      createdAt: assignedAt,
      createdById: currentUser.uid,
      source: 'manual',
      readAt: null
    });
  };

  const selectedQueueCandidateSet = new Set(selectedQueueCandidateIds);
  const queueSelectableDisplayedCandidates = workspaceView === 'all'
    ? displayedCandidates.filter(candidate => (
      (candidate.status === 'new' || candidate.status === 'retry')
      && canManageCandidate(candidate)
    ))
    : [];
  const allDisplayedQueueCandidatesSelected = queueSelectableDisplayedCandidates.length > 0
    && queueSelectableDisplayedCandidates.every(candidate => selectedQueueCandidateSet.has(candidate.id));

  const toggleQueueCandidateSelection = (candidateId: string) => {
    setBatchQueueError('');
    setSelectedQueueCandidateIds(previous => previous.includes(candidateId)
      ? previous.filter(id => id !== candidateId)
      : [...previous, candidateId]);
  };

  const toggleDisplayedQueueCandidates = () => {
    setBatchQueueError('');
    const displayedIds = queueSelectableDisplayedCandidates.map(candidate => candidate.id);
    setSelectedQueueCandidateIds(previous => {
      if (allDisplayedQueueCandidatesSelected) {
        return previous.filter(id => !displayedIds.includes(id));
      }
      return Array.from(new Set([...previous, ...displayedIds]));
    });
  };

  const getSelectedCandidates = () => accessibleCandidates.filter(candidate => (
    selectedQueueCandidateSet.has(candidate.id)
    && (candidate.status === 'new' || candidate.status === 'retry')
    && canManageCandidate(candidate)
  ));

  const addSelectedCandidatesToWorkQueue = async () => {
    const candidatesToQueue = getSelectedCandidates();
    if (candidatesToQueue.length === 0) return;
    const assignedAt = new Date().toISOString();

    setSavingBatchQueue(true);
    setBatchQueueError('');
    try {
      await Promise.all(candidatesToQueue.map(candidate => {
        const targetTaskSource: LeadCandidateTaskSource = currentUser.role === 'admin'
          ? 'admin_assigned'
          : 'sale_created';
        if (!candidate.workQueueHidden && candidate.taskSource === targetTaskSource) {
          return Promise.resolve(true);
        }
        const log = buildCandidateLog(candidate, {
          eventType: 'activity',
          activityType: 'note',
          description: 'Đưa vào Công việc cần xử lý'
        });
        return dbService.updateDocument('lead_candidates', candidate.id, {
          schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
          ...buildTaskAssignment(candidate, assignedAt),
          workQueueHidden: false,
          taskStatus: 'pending',
          taskDismissedAt: '',
          contactLogs: prependCandidateLog(candidate, log),
          updatedBy: currentUser.displayName
        });
      }));
      if (currentUser.role === 'admin') {
        const notificationOperations = candidatesToQueue.flatMap(candidate => {
          const assignee = saleUsers.find(user => user.uid === candidate.assignedSaleId);
          return assignee ? [createAdminAssignmentNotification(candidate, assignee, assignedAt)] : [];
        });
        await Promise.all(notificationOperations);
      }
      setSelectedQueueCandidateIds([]);
      setWorkspaceView('tasks');
      candidatesToQueue.forEach(candidate => auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'lead_candidates',
        action: 'candidate_added_to_work_queue',
        summary: `Đưa ${candidate.companyName} vào Công việc cần xử lý`,
        targetType: 'lead_candidate',
        targetId: candidate.id,
        targetLabel: candidate.companyName
      }));
    } catch {
      setBatchQueueError('Không thể chuyển một số dữ liệu sang Công việc cần xử lý. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setSavingBatchQueue(false);
    }
  };

  const assignSelectedCandidatesToSale = async () => {
    const assignee = saleUsers.find(user => user.uid === batchAssigneeId);
    if (!assignee) {
      setBatchQueueError('Vui lòng chọn Sale nhận bàn giao.');
      return;
    }

    const candidatesToAssign = getSelectedCandidates();
    if (candidatesToAssign.length === 0) return;
    const assignedAt = new Date().toISOString();

    setSavingBatchQueue(true);
    setBatchQueueError('');
    try {
      await Promise.all(candidatesToAssign.map(candidate => {
        if (
          !candidate.workQueueHidden
          && candidate.assignedSaleId === assignee.uid
          && candidate.taskSource === 'admin_assigned'
        ) {
          return Promise.resolve(true);
        }
        const log = buildCandidateLog(candidate, {
          eventType: 'activity',
          activityType: 'note',
          description: `Bàn giao cho Sale · Phụ trách: ${assignee.displayName}`
        });
        return dbService.updateDocument('lead_candidates', candidate.id, {
          schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
          assignedSaleId: assignee.uid,
          assignedSaleName: assignee.displayName,
          ...buildTaskAssignment(candidate, assignedAt),
          workQueueHidden: false,
          taskStatus: 'pending',
          taskDismissedAt: '',
          contactLogs: prependCandidateLog(candidate, log),
          updatedBy: currentUser.displayName
        });
      }));
      await Promise.all(candidatesToAssign.map(candidate => (
        createAdminAssignmentNotification(candidate, assignee, assignedAt)
      )));
      setSelectedQueueCandidateIds([]);
      setBatchAssigneeId('');
      setWorkspaceView('tasks');
      candidatesToAssign.forEach(candidate => auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'lead_candidates',
        action: 'candidate_assigned_to_sale',
        summary: `Bàn giao ${candidate.companyName} cho ${assignee.displayName}`,
        targetType: 'lead_candidate',
        targetId: candidate.id,
        targetLabel: candidate.companyName,
        changes: [{ field: 'assignedSale', label: 'Sale phụ trách', before: candidate.assignedSaleName || 'Chưa phân công', after: assignee.displayName }]
      }));
    } catch {
      setBatchQueueError('Không thể bàn giao một số dữ liệu cho Sale. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setSavingBatchQueue(false);
    }
  };

  const updateForm = <K extends keyof CandidateFormState>(field: K, value: CandidateFormState[K]) => {
    setSaveError('');
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const openCreateForm = () => {
    setEditingCandidateId('');
    setCandidateDetailTab('profile');
    setForm(createEmptyCandidateForm(currentUser, candidateOwners));
    setCandidateFiles([]);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
    setCustomFieldValues({});
    setSaveError('');
    setShowForm(true);
  };

  const openEditForm = useCallback((candidate: LeadCandidateRecord, initialTab: CandidateDetailTab = 'classification') => {
    setEditingCandidateId(candidate.id);
    setCandidateDetailTab(initialTab);
    setForm({
      companyName: candidate.companyName,
      contactPerson: candidate.contactPerson,
      contactPosition: candidate.contactPosition || '',
      phone: candidate.phone,
      email: candidate.email,
      taxCode: candidate.taxCode,
      address: candidate.address,
      province: candidate.province,
      ward: candidate.ward || '',
      industrialPark: candidate.industrialPark || '',
      website: candidate.website,
      businessSector: candidate.businessSector || '',
      expectedProducts: candidate.expectedProducts || '',
      source: candidate.source || 'Google Maps',
      sourceUrl: candidate.sourceUrl,
      assignedSaleId: candidate.assignedSaleId,
      nextContactAt: toDateTimeLocal(candidate.nextContactAt),
      note: candidate.note,
      customerInsightValues: candidate.customerInsightValues || []
    });
    setCustomFieldValues(candidate.customFieldValues || {});
    setSaveError('');
    setShowForm(true);
    auditService.recordSafely(currentUser, {
      category: 'business',
      module: 'lead_candidates',
      action: 'candidate_opened',
      summary: `Mở hồ sơ ${candidate.companyName}`,
      targetType: 'lead_candidate',
      targetId: candidate.id,
      targetLabel: candidate.companyName
    });
    setCandidateFiles(candidate.files || []);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
  }, [currentUser]);

  const openRawCandidate = (id: string) => {
    const candidate = accessibleCandidates.find(entry => entry.id === id);
    if (!candidate) return;
    setAdminListPrepared(true);
    setAdminRawView('list');
    openEditForm(candidate);
  };

  useEffect(() => {
    if (!initialCandidateId) return;
    const candidate = candidates.find(entry => entry.id === initialCandidateId);
    if (!candidate) return;
    const timer = window.setTimeout(() => {
      setAdminRawView('list');
      setAdminListPrepared(true);
      openEditForm(candidate);
      onInitialCandidateOpened?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidates, initialCandidateId, onInitialCandidateOpened, openEditForm]);

  const appendCandidateFiles = async (files: File[]) => {
    const oversizedFile = files.find(file => file.size > 900_000);
    if (oversizedFile) {
      window.alert('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.');
      return;
    }
    const nextFiles = await Promise.all(files.map(file => new Promise<LeadCandidateFileRecord>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: `candidate-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: file.size,
        folderId: 'other',
        folder: 'Tài liệu khác',
        url: '',
        data: String(reader.result || ''),
        createdAt: new Date().toISOString(),
        createdById: currentUser.uid,
        createdBy: currentUser.displayName
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    setCandidateFiles(previous => [...previous, ...nextFiles]);
  };

  const handleCandidateFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await appendCandidateFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const handleCandidateFilesDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    await appendCandidateFiles(Array.from(event.dataTransfer.files || []));
  };

  const handleAddCandidateLink = () => {
    const name = candidateLinkName.trim();
    const url = candidateLinkUrl.trim();
    if (!name || !/^https?:\/\//i.test(url)) {
      window.alert('Nhập tên tài liệu và đường dẫn chia sẻ bắt đầu bằng http:// hoặc https://.');
      return;
    }
    setCandidateFiles(previous => [...previous, {
      id: `candidate-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      size: 0,
      folderId: 'other',
      folder: 'Tài liệu khác',
      url,
      data: '',
      createdAt: new Date().toISOString(),
      createdById: currentUser.uid,
      createdBy: currentUser.displayName
    }]);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
  };

  const saveClassification = async (candidate: LeadCandidateRecord, values: string[]) => {
    if (!canManageCandidate(candidate)) throw new Error('Not allowed to classify this candidate');
    const now = new Date().toISOString();
    await dbService.updateDocument('lead_candidates', candidate.id, {
      customerInsightValues: values,
      updatedAt: now,
      updatedBy: currentUser.displayName
    });
    if (editingCandidateId === candidate.id) updateForm('customerInsightValues', values);
    auditService.recordSafely(currentUser, {
      category: 'business', module: 'lead_candidates', action: 'candidate_classification_updated',
      summary: `Cập nhật phân loại ${candidate.companyName} · ${values.length}/${CUSTOMER_INSIGHT_ITEMS.length} mục`,
      targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName
    });
  };

  const handleSaveCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.assignedSaleId || hasBlockingDuplicate) return;
    const missingCustomFields = getMissingRequiredEntityFields(profileCustomFieldDefinitions, customFieldValues, currentUser.role);
    if (missingCustomFields.length > 0) {
      setSaveError(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`);
      return;
    }

    try {
      const [latestLeads, latestCustomers, latestCandidates] = await Promise.all([
        currentUser.role === 'sale'
          ? dbService.getCollectionByField('leads', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('leads'),
        currentUser.role === 'sale'
          ? dbService.getCollectionByField('customers', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('customers'),
        currentUser.role === 'admin'
          ? dbService.getCollection('lead_candidates')
          : Promise.resolve(candidates)
      ]);
      const latestDuplicate = findCandidateDuplicate(
        {
          companyName: form.companyName,
          phone: form.phone,
          taxCode: form.taxCode
        },
        latestCandidates as LeadCandidateRecord[],
        latestLeads as LeadRecord[],
        latestCustomers as CustomerRecord[],
        editingCandidateId
      );
      if (latestDuplicate?.reason === 'taxCode') {
        setSaveError(describeDuplicate(latestDuplicate));
        return;
      }

      const assignedSale = candidateOwners.find(user => user.uid === form.assignedSaleId);
      const now = new Date().toISOString();
      const normalizedTaxCode = normalizeTaxCode(form.taxCode);
      const nextContactAt = form.nextContactAt ? new Date(form.nextContactAt).toISOString() : '';
      const scheduleChanged = !editingCandidate || editingCandidate.nextContactAt !== nextContactAt;
      const taskAssignment = nextContactAt ? buildTaskAssignment(editingCandidate) : null;
      const scheduleLog = editingCandidate && scheduleChanged && nextContactAt
        ? buildCandidateLog(editingCandidate, {
          eventType: 'schedule',
          description: `Đặt lịch liên hệ: ${formatShortDateTime(nextContactAt)}`,
          note: form.note.trim(),
          nextContactAt
        })
        : null;
      const payload = {
        schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        contactPosition: form.contactPosition.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        taxCode: normalizedTaxCode,
        address: form.address.trim(),
        province: form.province.trim(),
        ward: form.ward.trim(),
        industrialPark: form.industrialPark.trim(),
        website: form.website.trim(),
        businessSector: form.businessSector.trim(),
        expectedProducts: form.expectedProducts.trim(),
        source: form.source,
        sourceUrl: form.sourceUrl.trim(),
        note: form.note.trim(),
        customerInsightValues: form.customerInsightValues,
        files: candidateFiles,
        customFieldValues,
        assignedSaleId: form.assignedSaleId,
        assignedSaleName: assignedSale?.displayName || '',
        discoveredById: editingCandidate?.discoveredById || currentUser.uid,
        discoveredByName: editingCandidate?.discoveredByName || currentUser.displayName,
        nextContactAt,
        ...(scheduleChanged ? {
          queuedNextContactAt: '',
          taskStatus: 'pending' as LeadCandidateTaskStatus,
          workStatus: nextContactAt
            ? 'pending'
            : editingCandidate?.contactResult === 'not_contacted' ? 'not_contacted' : 'completed',
          taskCompletedAt: '',
          taskCompletedById: '',
          taskCompletedByName: '',
          taskDismissedAt: '',
          ...(taskAssignment || {}),
          workQueueHidden: nextContactAt ? false : (editingCandidate?.workQueueHidden ?? true),
          ...(scheduleLog && editingCandidate ? { contactLogs: prependCandidateLog(editingCandidate, scheduleLog) } : {})
        } : {}),
        updatedBy: currentUser.displayName
      };

      if (editingCandidateId) {
        await dbService.updateDocument('lead_candidates', editingCandidateId, payload);
        auditService.recordSafely(currentUser, {
          category: 'business', module: 'lead_candidates', action: 'candidate_updated',
          summary: `Cập nhật dữ liệu khách hàng ${form.companyName.trim()}`,
          targetType: 'lead_candidate', targetId: editingCandidateId, targetLabel: form.companyName.trim()
        });
        setShowForm(false);
        return;
      }

      const createPayload = {
        ...payload,
        status: 'new' as const,
        contactAttempts: 0,
        lastContactAt: '',
        lastContactOutcome: '',
        lastContactNote: '',
        contactLogs: [],
        contactResult: 'not_contacted' as LeadCandidateContactResult,
        potentialLevel: 'unrated' as LeadCandidatePotentialLevel,
        workQueueHidden: !nextContactAt,
        taskSource: nextContactAt
          ? taskAssignment?.taskSource || 'sale_created'
          : '' as LeadCandidateTaskSource,
        taskAssignedAt: taskAssignment?.taskAssignedAt || '',
        taskAssignedById: taskAssignment?.taskAssignedById || '',
        taskAssignedByName: taskAssignment?.taskAssignedByName || '',
        pinned: false,
        archived: false,
        archivedAt: '',
        archivedById: '',
        archivedByName: '',
        convertedLeadId: '',
        convertedAt: '',
        createdAt: now,
        createdById: currentUser.uid,
        createdByName: currentUser.displayName
      };
      if (normalizedTaxCode) {
        await dbService.addDocumentIfAbsent(
          'lead_candidates',
          createCandidateDocumentIdFromTaxCode(normalizedTaxCode),
          createPayload
        );
      } else {
        await dbService.addDocument('lead_candidates', createPayload);
      }
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'candidate_created',
        summary: `Tạo dữ liệu khách hàng ${form.companyName.trim()}`,
        targetType: 'lead_candidate', targetLabel: form.companyName.trim()
      });
      setShowForm(false);
    } catch (error) {
      const errorCode = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      if (isDocumentAlreadyExistsError(error)) {
        setSaveError('Mã số thuế này vừa được một Sale khác lưu vào Dữ liệu khách hàng.');
      } else if (errorCode === 'permission-denied' || errorCode === 'firestore/permission-denied') {
        setSaveError('Firebase chưa cấp quyền lưu Dữ liệu khách hàng. Admin cần xuất bản Firestore Rules mới nhất.');
      } else if (errorCode === 'auth/session-expired' || errorCode === 'unauthenticated') {
        setSaveError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.');
      } else {
        setSaveError('Không thể lưu dữ liệu khách hàng. Vui lòng kiểm tra kết nối và thử lại.');
      }
    }
  };

  const openScheduleForm = (candidate: LeadCandidateRecord, contactResult: LeadCandidateContactResult | '' = '') => {
    if (!canManageCandidate(candidate)) return;
    setScheduleCandidateId(candidate.id);
    setScheduleForm({
      nextContactAt: toDateTimeLocal(candidate.nextContactAt) || tomorrowAtNine(),
      note: ''
    });
    setScheduleContactResult(contactResult);
    setScheduleError('');
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scheduleCandidate || !scheduleForm.nextContactAt) return;
    const nextContactAt = new Date(scheduleForm.nextContactAt).toISOString();
    setSavingSchedule(true);
    setScheduleError('');
    try {
      const contactResult = scheduleContactResult || scheduleCandidate.contactResult;
      const log = buildCandidateLog(scheduleCandidate, {
        eventType: 'schedule',
        outcome: CONTACT_RESULT_OUTCOMES[contactResult],
        contactResult: scheduleContactResult || '',
        description: scheduleContactResult === 'callback'
          ? `Trạng thái: ${CONTACT_STATUS_LABELS.callback} · ${formatShortDateTime(nextContactAt)}`
          : `Đặt lịch liên hệ: ${formatShortDateTime(nextContactAt)}`,
        note: scheduleForm.note.trim(),
        nextContactAt
      });
      await dbService.updateDocument('lead_candidates', scheduleCandidate.id, {
        nextContactAt,
        ...buildTaskAssignment(scheduleCandidate),
        queuedNextContactAt: '',
        taskStatus: 'pending',
        workStatus: 'pending',
        workQueueHidden: false,
        taskCompletedAt: '',
        taskCompletedById: '',
        taskCompletedByName: '',
        taskDismissedAt: '',
        ...(scheduleContactResult ? {
          contactResult: scheduleContactResult,
          lastContactAt: log.occurredAt,
          lastContactOutcome: CONTACT_RESULT_OUTCOMES[scheduleContactResult],
          lastContactNote: scheduleForm.note.trim(),
          contactAttempts: scheduleCandidate.contactAttempts + 1
        } : {}),
        contactLogs: prependCandidateLog(scheduleCandidate, log),
        updatedBy: currentUser.displayName
      });
      setScheduleCandidateId('');
      setScheduleContactResult('');
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'follow_up_scheduled',
        summary: `Đặt lịch liên hệ ${scheduleCandidate.companyName}`,
        targetType: 'lead_candidate', targetId: scheduleCandidate.id, targetLabel: scheduleCandidate.companyName,
        changes: [{ field: 'nextContactAt', label: 'Lịch hẹn', after: nextContactAt }]
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : '';
      setScheduleError(code.includes('permission-denied')
        ? 'Firebase chưa cấp quyền đặt lịch. Admin cần xuất bản Firestore Rules mới nhất.'
        : 'Không thể lưu lịch hẹn. Vui lòng thử lại.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const updateContactResult = async (candidate: LeadCandidateRecord, contactResult: LeadCandidateContactResult) => {
    if (!canManageCandidate(candidate) || candidate.contactResult === contactResult) return;
    if (contactResult === 'callback') {
      openScheduleForm(candidate, contactResult);
      return;
    }
    setActionError('');
    setFieldActionCandidateId(`${candidate.id}:contact`);
    try {
      const log = buildCandidateLog(candidate, {
        eventType: 'contact_result',
        outcome: CONTACT_RESULT_OUTCOMES[contactResult],
        activityType: contactResult === 'called' ? 'call' : contactResult === 'messaged' ? 'message' : '',
        contactResult,
        description: `Trạng thái: ${CONTACT_STATUS_LABELS[contactResult]}`
      });
      await dbService.updateDocument('lead_candidates', candidate.id, {
        contactResult,
        lastContactAt: contactResult === 'not_contacted' ? candidate.lastContactAt : log.occurredAt,
        lastContactOutcome: CONTACT_RESULT_OUTCOMES[contactResult],
        contactAttempts: contactResult === 'not_contacted' ? candidate.contactAttempts : candidate.contactAttempts + 1,
        workStatus: contactResult === 'not_contacted' ? 'not_contacted' : 'completed',
        contactLogs: prependCandidateLog(candidate, log),
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'contact_status_updated',
        summary: `Cập nhật trạng thái liên hệ ${candidate.companyName}`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName,
        changes: [{ field: 'contactResult', label: 'Trạng thái liên hệ', before: CONTACT_STATUS_LABELS[candidate.contactResult], after: CONTACT_STATUS_LABELS[contactResult] }]
      });
    } catch {
      setActionError('Không thể cập nhật trạng thái liên hệ. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setFieldActionCandidateId('');
    }
  };

  const updatePotentialLevel = async (candidate: LeadCandidateRecord, potentialLevel: LeadCandidatePotentialLevel) => {
    if (!canManageCandidate(candidate) || candidate.potentialLevel === potentialLevel) return;
    setActionError('');
    setFieldActionCandidateId(`${candidate.id}:potential`);
    try {
      const log = buildCandidateLog(candidate, {
        eventType: 'potential_level',
        potentialLevel,
        description: `Đánh giá: ${POTENTIAL_LEVEL_LABELS[potentialLevel]}`
      });
      await dbService.updateDocument('lead_candidates', candidate.id, {
        potentialLevel,
        contactLogs: prependCandidateLog(candidate, log),
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'potential_updated',
        summary: `Đánh giá tiềm năng ${candidate.companyName}`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName,
        changes: [{ field: 'potentialLevel', label: 'Mức độ tiềm năng', before: POTENTIAL_LEVEL_LABELS[candidate.potentialLevel], after: POTENTIAL_LEVEL_LABELS[potentialLevel] }]
      });
    } catch {
      setActionError('Không thể cập nhật mức độ tiềm năng. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setFieldActionCandidateId('');
    }
  };

  const dismissScheduledTask = async (candidate: LeadCandidateRecord) => {
    const dismissedAt = new Date().toISOString();
    const log = buildCandidateLog(candidate, {
      eventType: 'activity',
      activityType: 'note',
      description: 'Tắt khỏi Công việc cần xử lý'
    });
    setActionError('');
    setTaskActionCandidateId(candidate.id);
    try {
      await dbService.updateDocument('lead_candidates', candidate.id, {
        workQueueHidden: true,
        taskStatus: 'dismissed',
        taskDismissedAt: dismissedAt,
        contactLogs: prependCandidateLog(candidate, log),
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'candidate_task_dismissed',
        summary: `Tắt ${candidate.companyName} khỏi Công việc cần xử lý`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName
      });
    } catch {
      setActionError('Không thể tắt công việc. Vui lòng kiểm tra quyền Firebase và thử lại.');
    } finally {
      setTaskActionCandidateId('');
    }
  };

  const archiveCandidate = async (candidate: LeadCandidateRecord) => {
    if (!window.confirm(`Xóa “${candidate.companyName}” khỏi danh sách dữ liệu? Thông tin cũ vẫn được lưu an toàn.`)) return;
    const archivedAt = new Date().toISOString();
    setActionError('');
    try {
      await dbService.updateDocument('lead_candidates', candidate.id, {
        archived: true,
        archivedAt,
        archivedById: currentUser.uid,
        archivedByName: currentUser.displayName,
        nextContactAt: '',
        queuedNextContactAt: '',
        taskStatus: 'dismissed',
        workQueueHidden: true,
        taskDismissedAt: archivedAt,
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'candidate_archived',
        summary: `Xóa ${candidate.companyName} khỏi danh sách dữ liệu`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName
      });
    } catch {
      setActionError('Không thể xóa dữ liệu khỏi danh sách. Vui lòng kiểm tra quyền Firebase và thử lại.');
    }
  };

  const clearDataFilters = () => {
    setSearchTerm('');
    setProvinceFilters([]);
    setIndustrialParkFilters([]);
    setSourceFilters([]);
    setContactResultFilters([]);
    setPotentialFilters([]);
    setInsightFilters([]);
    setSaleFilters([]);
    setPinnedOnly(false);
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setCurrentPage(1);
  };

  const renderContactResult = (candidate: LeadCandidateRecord) => {
    const canManage = canManageCandidate(candidate);
    return (
      <select
        className={`lead-candidate-inline-select lead-candidate-contact-result is-${candidate.contactResult}`}
        value={candidate.contactResult}
        disabled={!canManage || fieldActionCandidateId === `${candidate.id}:contact`}
        onChange={event => updateContactResult(candidate, event.target.value as LeadCandidateContactResult)}
        aria-label={`Trạng thái ${candidate.companyName}`}
      >
        {(Object.entries(CONTACT_STATUS_LABELS) as Array<[LeadCandidateContactResult, string]>).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    );
  };

  const renderPotentialLevel = (candidate: LeadCandidateRecord) => {
    const canManage = canManageCandidate(candidate);
    return (
      <select
        className={`lead-candidate-inline-select lead-candidate-potential is-${candidate.potentialLevel}`}
        value={candidate.potentialLevel}
        disabled={!canManage || fieldActionCandidateId === `${candidate.id}:potential`}
        onChange={event => updatePotentialLevel(candidate, event.target.value as LeadCandidatePotentialLevel)}
        aria-label={`Mức độ tiềm năng ${candidate.companyName}`}
      >
        {(Object.entries(POTENTIAL_LEVEL_LABELS) as Array<[LeadCandidatePotentialLevel, string]>).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    );
  };

  const renderCompactValue = (value: string, title = value, className = '') => (
    <span className={`lead-candidate-compact-value ${className}`.trim()} title={title}>{value}</span>
  );

  const renderCandidateField = (value?: string) => (
    renderCompactValue(value || 'Chưa cập nhật', value || 'Chưa cập nhật', value ? '' : 'is-muted')
  );

  const renderInsightValue = (candidate: LeadCandidateRecord, itemId: string) => {
    const checked = (candidate.customerInsightValues || []).includes(itemId);
    return <span className={`lead-candidate-insight-value ${checked ? 'is-selected' : ''}`}>{checked ? 'Đã chọn' : 'Chưa chọn'}</span>;
  };

  const getContactSummary = (candidate: LeadCandidateRecord) => {
    const primaryContact = candidate.contactPerson || 'Chưa rõ người liên hệ';
    const contactChannel = candidate.phone || candidate.email || 'Chưa có thông tin liên hệ';
    return `${primaryContact} · ${contactChannel}`;
  };

  const renderCompactLatestActivity = (candidate: LeadCandidateRecord) => {
    const latestLog = latestCandidateLog(candidate);
    if (!latestLog) return renderCompactValue('Chưa có hoạt động', 'Chưa có hoạt động', 'is-muted');
    const description = describeCandidateLog(latestLog);
    return renderCompactValue(
      description,
      `${description} · ${latestLog.createdByName || 'Không rõ người thực hiện'} · ${formatShortDateTime(latestLog.occurredAt)}`
    );
  };

  if (showForm) {
    const profileFields = [form.companyName, form.taxCode, form.website, form.province,
      form.ward, form.industrialPark, form.address, form.contactPerson, form.contactPosition,
      form.phone, form.email, form.source, form.sourceUrl, form.assignedSaleId, form.nextContactAt, form.note];
    const completedProfileFields = profileFields.filter(value => String(value || '').trim()).length;
    return (
      <SystemFieldSurface table="lead_candidates" className="lead-form-page lead-candidate-form-page">
        <header className={editingCandidate ? 'lead-candidate-profile-header crm-record-header' : 'lead-form-page__header'}>
          <PageBackButton iconOnly title="Quay lại danh sách dữ liệu" onClick={() => setShowForm(false)} />
          {editingCandidate ? <CrmRecordHeaderIdentity title={form.companyName || 'Chưa có tên doanh nghiệp'} /> : <div><span>DỮ LIỆU MỚI</span><h1>Thêm dữ liệu khách hàng</h1></div>}
          {editingCandidate && <div className="lead-candidate-profile-header__toolbar">
            <CrmRecordHeaderTabs
              activeTab={candidateDetailTab}
              classificationCount={form.customerInsightValues.length}
              classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
              classificationLabel="Phân loại khách hàng"
              profileLabel="Thông tin hồ sơ"
              ariaLabel="Chi tiết dữ liệu khách hàng"
              onTabChange={setCandidateDetailTab}
            />
          </div>}
          {editingCandidate && <CrmRecordHeaderFacts
            taxCode={form.taxCode || 'Chưa cập nhật'}
            saleName={candidateOwners.find(user => user.uid === form.assignedSaleId)?.displayName || editingCandidate.assignedSaleName || 'Chưa phân công'}
            classificationCount={form.customerInsightValues.length}
            classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
            profileCompleted={completedProfileFields}
            profileTotal={profileFields.length}
            stageLabel={CANDIDATE_STAGE_LABELS[editingCandidate.status]}
            nextCareLabel={form.nextContactAt ? formatShortDateTime(form.nextContactAt) : 'Chưa đặt lịch'}
          />}
        </header>

        {editingCandidate && <div className="lead-candidate-detail-panel" hidden={candidateDetailTab !== 'classification'}>
          <CustomerInsightClassification
            key={editingCandidate.id}
            companyName={editingCandidate.companyName}
            values={form.customerInsightValues}
            canEdit={canManageCandidate(editingCandidate)}
            onSave={values => saveClassification(editingCandidate, values)}
            onScore={() => setScoringCandidateId(editingCandidate.id)}
            toolbarActions={<PhoneCallCell toolbar phone={editingCandidate.phone} companyName={editingCandidate.companyName}
              subjectKey={candidateCallSubjectKey(editingCandidate)} currentUser={currentUser}
              auditModule="lead_candidates" targetType="lead_candidate" targetId={editingCandidate.id}
              canRecord={canManageCandidate(editingCandidate) && (currentUser.role === 'sale' || currentUser.role === 'admin')}
              onCallStarted={() => recordPhoneCall(editingCandidate)} />}
          />
        </div>}

        <form id="lead-candidate-profile-form" className="lead-form-page__form lead-candidate-detail-panel" hidden={Boolean(editingCandidate && candidateDetailTab !== 'profile')} onSubmit={handleSaveCandidate}>
          <div className="lead-form-page__content lead-candidate-form-page__content lead-candidate-quick-form">
            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <Building2 size={18} />
                <div><h2>Thông tin doanh nghiệp</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label data-system-label="companyName">Tên doanh nghiệp *</label><input autoFocus={candidateDetailTab === 'profile'} required value={form.companyName} onChange={event => updateForm('companyName', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="taxCode">Mã số thuế</label><input value={form.taxCode} readOnly={Boolean(editingCandidate?.taxCode)} onChange={event => updateForm('taxCode', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="website">Website</label><input type="url" value={form.website} onChange={event => updateForm('website', event.target.value)} placeholder="https://..." /></div>
                <BusinessLocationFields
                  className="lead-form-grid__wide"
                  province={form.province}
                  ward={form.ward}
                  industrialPark={form.industrialPark}
                  onChange={location => setForm(previous => ({ ...previous, ...location }))}
                />
                <div className="form-group lead-form-grid__wide"><label data-system-label="address">Địa chỉ doanh nghiệp</label><input value={form.address} onChange={event => updateForm('address', event.target.value)} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'company')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="lead_candidates" section="company" sectionLabel="Thông tin doanh nghiệp" definitions={profileCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'taxCode', label: 'Mã số thuế' }, { key: 'website', label: 'Website' }, { key: 'province', label: 'Tỉnh / thành' }, { key: 'ward', label: 'Phường / xã' }, { key: 'industrialPark', label: 'Khu công nghiệp' }, { key: 'address', label: 'Địa chỉ doanh nghiệp' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <UserRoundSearch size={18} />
                <div><h2>Liên hệ và nguồn dữ liệu</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="contactPerson">Người liên hệ</label><input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="contactPosition">Chức vụ</label><input value={form.contactPosition} onChange={event => updateForm('contactPosition', event.target.value)} placeholder="Ví dụ: Thu mua, Giám đốc..." /></div>
                <div className="form-group"><label data-system-label="phone">Điện thoại</label><input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="email">Email</label><input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="source">Nguồn tìm kiếm</label><select value={form.source} onChange={event => updateForm('source', event.target.value)}>{CANDIDATE_SOURCES.map(source => <option key={source}>{source}</option>)}</select></div>
                <div className="form-group"><label data-system-label="sourceUrl">Đường dẫn nguồn</label><input type="url" value={form.sourceUrl} onChange={event => updateForm('sourceUrl', event.target.value)} placeholder="Link Facebook, Google Maps..." /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'contact')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="lead_candidates" section="contact" sectionLabel="Liên hệ và nguồn dữ liệu" definitions={profileCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'contactPerson', label: 'Người liên hệ' }, { key: 'contactPosition', label: 'Chức vụ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'email', label: 'Email' }, { key: 'source', label: 'Nguồn tìm kiếm' }, { key: 'sourceUrl', label: 'Đường dẫn nguồn' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <ListPlus size={18} />
                <div><h2>Thông tin bổ sung</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label data-system-label="note">Ghi chú</label><textarea rows={5} value={form.note} onChange={event => updateForm('note', event.target.value)} placeholder="Thông tin cần lưu ý trước khi liên hệ..." /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'needs')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="lead_candidates" section="needs" sectionLabel="Thông tin bổ sung" definitions={profileCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'note', label: 'Ghi chú' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <CalendarClock size={18} />
                <div><h2>Phụ trách và lịch hẹn</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="assignedSaleId">Người phụ trách *</label><select required value={form.assignedSaleId} disabled={currentUser.role === 'sale'} onChange={event => updateForm('assignedSaleId', event.target.value)}><option value="">Chưa phân công</option>{candidateOwners.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></div>
                <div className="form-group"><label>Sale tìm được dữ liệu</label><input value={editingCandidate?.discoveredByName || currentUser.displayName} readOnly /></div>
                <div className="form-group lead-form-grid__wide"><label data-system-label="nextContactAt">Lịch hẹn xử lý</label><input type="datetime-local" value={form.nextContactAt} onChange={event => updateForm('nextContactAt', event.target.value)} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'assignment')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="lead_candidates" section="assignment" sectionLabel="Phụ trách và lịch hẹn" definitions={profileCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'nextContactAt', label: 'Lịch hẹn xử lý' }]} />
            </section>

            <EntityCustomFieldsSection
              definitions={profileCustomFieldDefinitions.filter(definition => definition.section === 'additional')}
              values={customFieldValues}
              role={currentUser.role}
              onChange={setCustomFieldValues}
            />

            <section className="lead-form-card lead-candidate-files-card">
              <div className="lead-form-card__heading">
                <Paperclip size={18} />
                <div><h2>File liên quan</h2></div>
              </div>
              <div className="lead-candidate-files-card__tools">
                <label className="btn btn-outline lead-candidate-files-card__upload">
                  Tải tệp lên
                  <input type="file" multiple onChange={event => void handleCandidateFilesChange(event)} />
                </label>
                <span>Tệp dưới 900 KB; tệp lớn dùng đường dẫn Drive hoặc OneDrive.</span>
                <label className="lead-candidate-files-card__dropzone" onDragOver={event => event.preventDefault()} onDrop={event => void handleCandidateFilesDrop(event)}>
                  Kéo thả tệp vào đây hoặc chọn từ máy
                  <input type="file" multiple onChange={event => void handleCandidateFilesChange(event)} />
                </label>
              </div>
              <details className="lead-candidate-files-card__link">
                <summary>Thêm đường dẫn Drive/OneDrive</summary>
                <div>
                  <input value={candidateLinkName} onChange={event => setCandidateLinkName(event.target.value)} placeholder="Tên tài liệu" />
                  <input type="url" value={candidateLinkUrl} onChange={event => setCandidateLinkUrl(event.target.value)} placeholder="https://..." />
                  <button type="button" className="btn btn-outline" onClick={handleAddCandidateLink}>Thêm đường dẫn</button>
                </div>
              </details>
              <div className="lead-candidate-files-card__list">
                {candidateFiles.length === 0 ? <p>Chưa có tệp liên quan.</p> : candidateFiles.map(file => {
                  const source = file.url || file.data;
                  return <div key={file.id} className="lead-candidate-files-card__row">
                    <div><strong title={file.name}>{file.name}</strong><span>{file.url ? 'Đường dẫn' : file.size ? `${Math.ceil(file.size / 1024).toLocaleString('vi-VN')} KB` : 'Tệp tài liệu'} · {file.createdBy || 'Chưa rõ người tải'}</span></div>
                    <div>
                      {source && (file.url ? <a className="btn btn-outline" href={source} target="_blank" rel="noreferrer">Mở</a> : <a className="btn btn-outline" href={source} download={file.name}>Tải xuống</a>)}
                      <button type="button" className="btn btn-outline lead-candidate-files-card__delete" onClick={() => setCandidateFiles(previous => previous.filter(item => item.id !== file.id))}>Xóa</button>
                    </div>
                  </div>;
                })}
              </div>
            </section>
          </div>

          {(duplicate || saveError) && (
            <div className={`lead-candidate-warning ${hasBlockingDuplicate || saveError ? 'is-error' : ''}`}>
              <AlertCircle size={15} />
              <span>{saveError || (duplicate && describeDuplicate(duplicate))}</span>
            </div>
          )}

          <footer className={`lead-form-page__footer${editingCandidate ? ' lead-form-page__footer--fixed' : ''}`}>
            <span>Dữ liệu chỉ được ghi nhận khi bấm Lưu dữ liệu.</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={Boolean(hasBlockingDuplicate)}>Lưu dữ liệu</button>
            </div>
          </footer>
        </form>
        {scoringCandidate && <LeadCandidateScoreDialog candidate={scoringCandidate} currentUser={currentUser} onClose={() => setScoringCandidateId('')} />}
      </SystemFieldSurface>
    );
  }

  const rawOverviewMode = adminRawView === 'priority' ? 'priority' : 'overview';

  return <>
    {currentUser.role === 'admin' && <SystemFieldSurface table="lead_candidates" className="lead-candidate-workspace" hidden={adminRawView === 'list'}>
      <PageContextHeader section="Dữ liệu thô" current={adminRawView === 'priority' ? 'Bảng ưu tiên' : adminRawView === 'scoring' ? 'Thiết lập điểm tự động' : 'Tổng quan'} />
      {adminRawView === 'overview' && <nav className="lead-candidate-queues content-tabs content-tabs--compact" role="tablist" aria-label="Dữ liệu thô">
        <button type="button" role="tab" aria-selected={true} className="is-active" onClick={showRawOverview}>Tổng quan</button>
        <button type="button" role="tab" aria-selected={false} onClick={showRawList}>Tất cả dữ liệu <strong>{accessibleCandidates.length}</strong></button>
      </nav>}
      {adminRawView === 'scoring' ? <RawDataScoringPage
        currentUser={currentUser}
        onBack={showRawOverview}
      /> : <RawDataOverview
        mode={rawOverviewMode}
        candidates={accessibleCandidates}
        saleUsers={saleUsers}
        onPriority={showRawPriority}
        onScoring={showRawScoring}
        onOverview={showRawOverview}
        onOpenCandidate={openRawCandidate}
      />}
    </SystemFieldSurface>}

    {(currentUser.role !== 'admin' || adminListPrepared || adminRawView === 'list') && <SystemFieldSurface table="lead_candidates" className="lead-candidate-workspace" hidden={currentUser.role === 'admin' && adminRawView !== 'list'}>
      <PageContextHeader section="Dữ liệu thô" current={workspaceView === 'tasks' ? 'Công việc cần xử lý' : 'Tất cả dữ liệu'} />
      <div className="lead-candidate-commandbar">
        <nav className="lead-candidate-queues content-tabs content-tabs--compact" role="tablist" aria-label="Không gian làm việc Sale">
          {currentUser.role === 'admin' && <button type="button" role="tab" aria-selected={false} onClick={showRawOverview}>Tổng quan</button>}
          {([
            ...(currentUser.role === 'admin' ? [] : [['tasks', 'Công việc cần xử lý'] as [CandidateWorkspaceView, string]]),
            ['all', 'Tất cả dữ liệu']
          ] as Array<[CandidateWorkspaceView, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={workspaceView === value}
              className={workspaceView === value ? 'is-active' : ''}
              onClick={() => {
                setWorkspaceView(value);
                setSelectedQueueCandidateIds([]);
                setBatchQueueError('');
                setCurrentPage(1);
                setShowDataFilters(false);
                setShowColumnCustomizer(false);
                if (value === 'tasks') setCandidateSort('priority');
                if (value === 'tasks' && currentUser.role !== 'admin') setSaleFilters([]);
              }}
            >
              {value === 'management' && <UserRoundSearch size={15} />}
              {value === 'tasks' && <CalendarClock size={15} />}
              {value === 'all' && currentUser.role !== 'admin' && <ListPlus size={15} />}
              <span>{label}</span><strong>{workspaceCounts[value]}</strong>
            </button>
          ))}
        </nav>

        {workspaceView !== 'management' && <section className="lead-candidate-toolbar">
          <label className="lead-candidate-search">
            <Search size={15} />
            <input
              value={searchTerm}
              onChange={event => { setSearchTerm(event.target.value); setCurrentPage(1); }}
              placeholder="Tìm doanh nghiệp, MST, điện thoại, người liên hệ..."
            />
          </label>
          <select value={candidateSort} onChange={event => { setCandidateSort(event.target.value as CandidateSort); setCurrentPage(1); }} aria-label="Sắp xếp dữ liệu">
            <option value="priority">Ưu tiên làm việc</option>
            <option value="updated_desc">Mới cập nhật</option>
            <option value="company_asc">Tên doanh nghiệp A–Z</option>
            <option value="next_contact_asc">Lịch gọi gần nhất</option>
          </select>
          <DataFilterButton activeCount={activeFilterCount} open={showDataFilters} onClick={() => setShowDataFilters(true)} />
          <button type="button" className="lead-candidate-column-button" aria-label="Tùy chỉnh cột" title="Tùy chỉnh cột" onClick={() => setShowColumnCustomizer(true)}>
            <Settings2 size={16} />
          </button>
          {workspaceView === 'all' && <button type="button" className="btn btn-primary lead-candidate-add-button" onClick={openCreateForm}>
            <Plus size={15} /> Thêm dữ liệu
          </button>}
          {(activeFilterCount > 0 || searchTerm) && <button type="button" className="lead-candidate-clear-filter" onClick={clearDataFilters}><X size={13} /> Đặt lại</button>}
        </section>}
      </div>

      {workspaceView !== 'management' && <DataFilterChipBar chips={candidateFilterChips} onClear={clearDataFilters} />}

      <DataFilterPanel
        open={workspaceView !== 'management' && showDataFilters}
        title={workspaceView === 'tasks' ? 'Lọc công việc cần xử lý' : 'Lọc dữ liệu khách hàng'}
        description={workspaceView === 'tasks'
          ? 'Tập trung vào đúng nhóm công việc, lịch hẹn và Sale cần giám sát.'
          : 'Kết hợp khu vực, nguồn, trạng thái và người phụ trách.'}
        activeCount={quickFilterCount}
        onClose={() => setShowDataFilters(false)}
        onReset={clearDataFilters}
      >
        {provinceFilterEnabled && <DataFilterSection title={configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')} description={configuredFilterDescription(LEAD_FILTER_IDS.province, 'Có thể chọn đồng thời nhiều tỉnh/thành.')} selectedCount={provinceFilters.length}>
          <DataFilterCheckboxGroup
            options={provinceOptions.map(province => ({ value: province, label: province }))}
            selectedValues={provinceFilters}
            onChange={values => { setProvinceFilters(values); setCurrentPage(1); }}
            searchable
          />
        </DataFilterSection>}
        {industrialParkFilterEnabled && <DataFilterSection title={configuredFilterName(LEAD_FILTER_IDS.industrialPark, 'Khu công nghiệp')} description={configuredFilterDescription(LEAD_FILTER_IDS.industrialPark, 'Lọc riêng theo khu công nghiệp của doanh nghiệp.')} selectedCount={industrialParkFilters.length}>
          <DataFilterCheckboxGroup
            options={industrialParkOptions.map(industrialPark => ({ value: industrialPark, label: industrialPark }))}
            selectedValues={industrialParkFilters}
            onChange={values => { setIndustrialParkFilters(values); setCurrentPage(1); }}
            searchable
          />
        </DataFilterSection>}
        {sourceFilterEnabled && <DataFilterSection title={configuredFilterName(LEAD_FILTER_IDS.source, 'Nguồn tìm kiếm')} description={configuredFilterDescription(LEAD_FILTER_IDS.source, 'Kết hợp nhiều nguồn dữ liệu trong một lần lọc.')} selectedCount={sourceFilters.length}>
          <DataFilterCheckboxGroup
            options={CANDIDATE_SOURCES.map(source => ({ value: source, label: source }))}
            selectedValues={sourceFilters}
            onChange={values => { setSourceFilters(values); setCurrentPage(1); }}
          />
        </DataFilterSection>}
        {contactResultFilterEnabled && <DataFilterSection title={configuredFilterName('contact_result', 'Trạng thái liên hệ')} description={configuredFilterDescription('contact_result', 'Có thể theo dõi nhiều trạng thái cùng lúc.')} selectedCount={contactResultFilters.length}>
          <DataFilterCheckboxGroup
            options={(Object.entries(CONTACT_STATUS_LABELS) as Array<[LeadCandidateContactResult, string]>).map(([value, label]) => ({ value, label }))}
            selectedValues={contactResultFilters}
            onChange={values => { setContactResultFilters(values as LeadCandidateContactResult[]); setCurrentPage(1); }}
          />
        </DataFilterSection>}
        {potentialFilterEnabled && <DataFilterSection title={configuredFilterName('potential_level', 'Mức độ tiềm năng')} description={configuredFilterDescription('potential_level')} selectedCount={potentialFilters.length}>
          <DataFilterCheckboxGroup
            options={(Object.entries(POTENTIAL_LEVEL_LABELS) as Array<[LeadCandidatePotentialLevel, string]>).map(([value, label]) => ({ value, label }))}
            selectedValues={potentialFilters}
            onChange={values => { setPotentialFilters(values as LeadCandidatePotentialLevel[]); setCurrentPage(1); }}
          />
        </DataFilterSection>}
        {getCustomerInsightGroupsForModule('customer_data').map(group => <DataFilterSection key={group.id} title={group.label} description="Lọc theo phân loại dữ liệu thô." selectedCount={group.items.filter(item => insightFilters.includes(item.id)).length}>
          <DataFilterCheckboxGroup options={group.items.map(item => ({ value: item.id, label: item.label }))} selectedValues={insightFilters.filter(value => group.items.some(item => item.id === value))} onChange={values => { setInsightFilters(current => replaceCustomerInsightGroupValues(current, group.items.map(item => item.id), values)); setCurrentPage(1); }} searchable={group.items.length > 8} />
        </DataFilterSection>)}
        {saleFilterEnabled && (workspaceView === 'all' || currentUser.role === 'admin') && (
          <DataFilterSection title={configuredFilterName(CUSTOMER_FILTER_IDS.sale, 'Sale phụ trách')} description={configuredFilterDescription(CUSTOMER_FILTER_IDS.sale, 'Admin có thể chọn nhiều Sale để đối chiếu dữ liệu.')} selectedCount={saleFilters.length}>
            <DataFilterCheckboxGroup
              options={candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))}
              selectedValues={saleFilters}
              onChange={values => { setSaleFilters(values); setCurrentPage(1); }}
              searchable
            />
          </DataFilterSection>
        )}
        {pinnedFilterEnabled && <DataFilterSection title={configuredFilterName('pinned', 'Dữ liệu đã ghim')} description={configuredFilterDescription('pinned')} selectedCount={pinnedOnly ? 1 : 0}>
          <button type="button" className={`lead-candidate-pinned-filter ${pinnedOnly ? 'is-active' : ''}`} onClick={() => { setPinnedOnly(previous => !previous); setCurrentPage(1); }}>
            Chỉ hiển thị dữ liệu ưu tiên
          </button>
        </DataFilterSection>}
        {customFieldDefinitions.filter(definition => definition.active).map(definition => (
          <DataFilterSection key={definition.id} title={definition.name} description={definition.description || 'Lọc theo trường tùy chỉnh.'} selectedCount={(customFieldFilters[definition.id] || []).length}>
            <DataFilterCheckboxGroup
              options={customFilterOptions[definition.id] || []}
              selectedValues={customFieldFilters[definition.id] || []}
              onChange={values => { setCustomFieldFilters(previous => ({ ...previous, [definition.id]: values })); setCurrentPage(1); }}
              searchable={(customFilterOptions[definition.id] || []).length > 8}
            />
          </DataFilterSection>
        ))}
      </DataFilterPanel>

      {workspaceView !== 'management' && showColumnCustomizer && (
        <TableColumnCustomizer
          open
          columns={availableColumnOptions}
          selectedIds={Array.from(visibleColumnSet)}
          onClose={() => setShowColumnCustomizer(false)}
          onSave={saveVisibleColumns}
        />
      )}

      {workspaceView === 'all' && selectedQueueCandidateIds.length > 0 && (
        <section className="lead-candidate-batch-bar" aria-label="Chuyển dữ liệu sang công việc cần xử lý">
          <div>
            <ListPlus size={17} />
            <strong>Đã chọn {selectedQueueCandidateIds.length} khách hàng</strong>
            <button type="button" onClick={() => { setSelectedQueueCandidateIds([]); setBatchQueueError(''); }}>Bỏ chọn</button>
          </div>
          <div className="lead-candidate-batch-actions">
            <button type="button" className="btn btn-primary" onClick={addSelectedCandidatesToWorkQueue} disabled={savingBatchQueue}>
              <ListPlus size={14} /> {savingBatchQueue ? 'Đang xử lý...' : 'Đưa vào Công việc cần xử lý'}
            </button>
            {currentUser.role === 'admin' && (
              <div className="lead-candidate-batch-assignment">
              <label>
                <span>Bàn giao cho Sale</span>
                <select value={batchAssigneeId} onChange={event => { setBatchAssigneeId(event.target.value); setBatchQueueError(''); }}>
                  <option value="">Chọn Sale nhận việc</option>
                  {saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}
                </select>
              </label>
              <button type="button" className="btn lead-candidate-assign-button" onClick={assignSelectedCandidatesToSale} disabled={savingBatchQueue || !batchAssigneeId}>
                <UserRoundSearch size={14} /> Bàn giao
              </button>
              </div>
            )}
          </div>
          {batchQueueError && <p><AlertCircle size={13} /> {batchQueueError}</p>}
        </section>
      )}

      {actionError && (
        <div className="lead-candidate-warning is-error">
          <AlertCircle size={14} />
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo"><X size={13} /></button>
        </div>
      )}

      {workspaceView === 'management' && currentUser.role === 'admin' && (
        <section className="employee-monitor" aria-label="Giám sát hoạt động Sale">
          <header className="employee-monitor__header">
            <div>
              <h2>Hoạt động tại Dữ liệu thô</h2>
              <p>Trạng thái và thao tác gần nhất của đội Sale.</p>
            </div>
            <div className="employee-monitor__summary">
              <span><strong>{employeeCards.filter(card => card.presenceStatus === 'active').length}</strong> đang thao tác</span>
              <span><strong>{employeeCards.filter(card => card.presenceStatus === 'idle').length}</strong> tạm rảnh</span>
              <span><strong>{employeeCards.filter(card => card.presenceStatus === 'offline').length}</strong> chưa thao tác</span>
            </div>
          </header>

          <div className="employee-monitor__layout">
            <div className="employee-monitor__grid">
              {employeeCards.map(card => {
                const latestEvent = card.activities[0];
                const statusLabel = card.presenceStatus === 'active'
                  ? 'Đang thao tác'
                  : card.presenceStatus === 'idle' ? `Rảnh ${card.minutesSinceSeen} phút` : 'Chưa thao tác';
                return (
                  <button
                    key={card.sale.uid}
                    type="button"
                    className={`employee-monitor-card ${selectedManagedSaleId === card.sale.uid ? 'is-selected' : ''}`}
                    onClick={() => setSelectedManagedSaleId(card.sale.uid)}
                  >
                    <div className="employee-monitor-card__top">
                      <span className="employee-monitor-card__avatar">{card.sale.displayName.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()}</span>
                      <div><strong>{card.sale.displayName}</strong><span>Sale</span></div>
                      <em className={`is-${card.presenceStatus}`}><i />{statusLabel}</em>
                    </div>
                    <div className="employee-monitor-card__current">
                      <span>Đang phụ trách</span>
                      <strong>{card.currentCandidate?.companyName || 'Chưa có công việc'}</strong>
                    </div>
                    <div className="employee-monitor-card__metrics">
                      <span><strong>{card.touchedCount}</strong> khách đã xử lý</span>
                      <span><strong>{card.callCount}</strong> cuộc gọi</span>
                      <span><strong>{card.scheduleCount}</strong> lịch hẹn</span>
                      <span><strong>{card.assignedCount}</strong> cần xử lý</span>
                    </div>
                    <div className="employee-monitor-card__latest">
                      <span>Thao tác gần nhất</span>
                      <strong>{latestEvent ? getEmployeeActionLabel(latestEvent) : 'Chưa có thao tác'}</strong>
                      <small>{latestEvent ? `${latestEvent.targetLabel || 'Dữ liệu thô'} · ${formatShortDateTime(latestEvent.occurredAt)}` : 'Chưa ghi nhận tại Dữ liệu thô'}</small>
                    </div>
                  </button>
                );
              })}
              {employeeCards.length === 0 && <p className="employee-monitor__empty">Chưa có tài khoản Sale đang hoạt động.</p>}
            </div>

            {selectedEmployeeCard && (
              <aside className="employee-monitor-detail">
                <header>
                  <div><span>NHẬT KÝ THAO TÁC</span><h3>{selectedEmployeeCard.sale.displayName}</h3></div>
                  <button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => setSelectedManagedSaleId('')} aria-label="Đóng"><X size={14} /></button>
                </header>
                <div className="employee-monitor-detail__facts">
                  <span>Trạng thái<strong>{selectedEmployeeCard.presenceStatus === 'active' ? 'Đang thao tác' : selectedEmployeeCard.presenceStatus === 'idle' ? 'Tạm rảnh' : 'Chưa thao tác'}</strong></span>
                  <span>Thao tác gần nhất<strong>{selectedEmployeeCard.activities[0] ? formatShortDateTime(selectedEmployeeCard.activities[0].occurredAt) : 'Chưa ghi nhận'}</strong></span>
                </div>
                <section className="employee-sales-report" aria-label={`Báo cáo năng suất ${selectedEmployeeCard.sale.displayName}`}>
                  <header>
                    <div><h4>Báo cáo năng suất dữ liệu thô</h4><span>{salesReportWindow?.label || 'Chọn khoảng thời gian hợp lệ'}</span></div>
                    <select value={salesReportPeriod} onChange={event => setSalesReportPeriod(event.target.value as SalesReportPeriod)} aria-label="Kỳ báo cáo">
                      <option value="week">Tuần này</option>
                      <option value="month">Tháng này</option>
                      <option value="quarter">Quý này</option>
                      <option value="custom">Tùy chọn</option>
                    </select>
                  </header>
                  {salesReportPeriod === 'custom' && <div className="employee-sales-report__dates">
                    <label>Từ ngày<input type="date" value={salesReportStart} max={salesReportEnd} onChange={event => setSalesReportStart(event.target.value)} /></label>
                    <label>Đến ngày<input type="date" value={salesReportEnd} min={salesReportStart} max={toDateInputValue(new Date(referenceTime))} onChange={event => setSalesReportEnd(event.target.value)} /></label>
                  </div>}
                  {salesReportLoading && <p className="employee-sales-report__state">Đang tải báo cáo...</p>}
                  {!salesReportLoading && salesReportError && <p className="employee-sales-report__state is-error">{salesReportError}</p>}
                  {!salesReportLoading && !salesReportError && !selectedSalesReport && <p className="employee-sales-report__state is-error">Khoảng thời gian không hợp lệ.</p>}
                  {!salesReportLoading && !salesReportError && selectedSalesReport && <>
                    <div className="employee-sales-report__metrics">
                      <span><small>Dữ liệu mới</small><strong>{selectedSalesReport.created.length}</strong></span>
                      <span><small>Khách đã xử lý</small><strong>{selectedSalesReport.processedCandidateIds.size}</strong></span>
                      <span><small>Lần gọi ghi nhận</small><strong>{selectedSalesReport.calls.length}</strong></span>
                      <span><small>Kết quả gọi xác nhận</small><strong>{selectedSalesReport.confirmedCalls.length}</strong></span>
                      <span><small>Lịch chăm sóc</small><strong>{selectedSalesReport.scheduled.length}</strong></span>
                      <span><small>Chuyển thành Lead</small><strong>{selectedSalesReport.convertedCandidateIds.size}</strong></span>
                    </div>
                    <div className="employee-sales-report__summary">
                      <span><strong>{selectedSalesReport.events.length}</strong> thao tác hệ thống được ghi nhận</span>
                      <span><strong>{selectedSalesReport.processedCandidateIds.size ? Math.round(selectedSalesReport.convertedCandidateIds.size / selectedSalesReport.processedCandidateIds.size * 100) : 0}%</strong> khách xử lý đã chuyển thành Lead</span>
                    </div>
                    <div className="employee-sales-report__table-wrap">
                      <table>
                        <thead><tr><th>Ngày</th><th>Khách xử lý</th><th>Gọi</th><th>Lịch hẹn</th><th>Chuyển Lead</th></tr></thead>
                        <tbody>
                          {selectedSalesReport.activityByDate.map(row => <tr key={row.date}><td>{row.date}</td><td>{row.processed}</td><td>{row.calls}</td><td>{row.schedules}</td><td>{row.converted}</td></tr>)}
                          {selectedSalesReport.activityByDate.length === 0 && <tr><td colSpan={5}>Chưa có thao tác dữ liệu thô trong kỳ này.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </>}
                </section>
                <div className="employee-monitor-detail__filters">
                  <select value={employeeActivityRange} onChange={event => setEmployeeActivityRange(event.target.value as EmployeeActivityRange)} aria-label="Khoảng thời gian">
                    <option value="today">Hôm nay</option>
                    <option value="7days">7 ngày</option>
                    <option value="all">Tất cả</option>
                  </select>
                  <select value={employeeActivityGroup} onChange={event => setEmployeeActivityGroup(event.target.value as EmployeeActivityGroup)} aria-label="Loại thao tác">
                    <option value="all">Mọi thao tác</option>
                    <option value="call">Cuộc gọi</option>
                    <option value="data">Dữ liệu</option>
                    <option value="schedule">Lịch hẹn</option>
                    <option value="task">Công việc</option>
                  </select>
                </div>
                <ol className="employee-monitor-detail__timeline">
                  {selectedEmployeeActivities.map(event => {
                    const eventTime = formatActivityTime(event.occurredAt);
                    return <li key={event.id}>
                      <i />
                      <time><strong>{eventTime.time}</strong><span>{eventTime.date}</span></time>
                      <div><strong>{getEmployeeActionLabel(event)}</strong><span>{event.targetLabel || 'Dữ liệu thô'}</span></div>
                    </li>;
                  })}
                  {selectedEmployeeActivities.length === 0 && <li className="is-empty">Không có thao tác Dữ liệu thô trong bộ lọc này.</li>}
                </ol>
              </aside>
            )}
          </div>
        </section>
      )}

      {workspaceView !== 'management' && (
      <section className="lead-table-card">
        <div className="lead-table-result">
          {workspaceView === 'tasks' ? <>
            <span><strong>{filteredCandidates.length}</strong> công việc thuộc Sale đang phụ trách</span>
            <span>{adminAssignedTaskCount > 0
              ? `${adminAssignedTaskCount} công việc Admin giao đang được xếp ưu tiên.`
              : currentUser.role === 'admin' ? 'Lọc theo Sale để theo dõi tiến độ làm việc.' : 'Cập nhật trạng thái, đánh giá và lịch hẹn trực tiếp trên bảng.'}</span>
          </> : <>
            <span>Hiển thị <strong>{filteredCandidates.length}</strong> / {accessibleCandidates.length} dữ liệu</span>
            <span>{activeFilterCount > 0 ? `${activeFilterCount} bộ lọc đang áp dụng` : 'Kho dữ liệu chung do toàn bộ Sale trong công ty thu thập.'}</span>
          </>}
        </div>
        <div className="table-container">
          {workspaceView === 'tasks' ? (
            <ConfiguredSystemTable table="lead_candidates" className="lead-candidate-table lead-candidate-task-table is-compact has-dynamic-columns" style={candidateTableStyle}>
              <thead><tr>
                <ReorderableTableCells order={orderedColumnIds} getHeaderProps={getHeaderProps} labels={candidateColumnLabels}>
                {visibleColumnSet.has('index') && <th key="index" className="erp-table-index-column">STT</th>}
                {visibleColumnSet.has('company') && <th key="company" data-system-field="companyName">Doanh nghiệp</th>}
                {visibleColumnSet.has('taxCode') && <th key="taxCode" data-system-field="taxCode">Mã số thuế</th>}
                {visibleColumnSet.has('website') && <th key="website" data-system-field="website">Website</th>}
                {visibleColumnSet.has('businessSector') && <th key="businessSector" data-system-field="businessSector">Lĩnh vực hoạt động</th>}
                {visibleColumnSet.has('province') && <th key="province" data-system-field="province">Tỉnh/thành</th>}
                {visibleColumnSet.has('ward') && <th key="ward" data-system-field="ward">Phường/xã</th>}
                {visibleColumnSet.has('industrialPark') && <th key="industrialPark" data-system-field="industrialPark">Khu công nghiệp</th>}
                {visibleColumnSet.has('address') && <th key="address" data-system-field="address">Địa chỉ doanh nghiệp</th>}
                {visibleColumnSet.has('contact') && <th key="contact" data-system-field="contact">Thông tin liên hệ (tóm tắt)</th>}
                {visibleColumnSet.has('contactPerson') && <th key="contactPerson" data-system-field="contactPerson">Người liên hệ</th>}
                {visibleColumnSet.has('contactPosition') && <th key="contactPosition" data-system-field="contactPosition">Chức vụ</th>}
                {visibleColumnSet.has('phone') && <th key="phone" data-system-field="phone">Điện thoại</th>}
                {visibleColumnSet.has('email') && <th key="email" data-system-field="email">Email</th>}
                {visibleColumnSet.has('source') && <th key="source" data-system-field="source">Nguồn tìm kiếm</th>}
                {visibleColumnSet.has('sourceUrl') && <th key="sourceUrl" data-system-field="sourceUrl">Đường dẫn nguồn</th>}
                {visibleColumnSet.has('expectedProducts') && <th key="expectedProducts" data-system-field="expectedProducts">Sản phẩm / nhu cầu quan tâm</th>}
                {visibleColumnSet.has('note') && <th key="note" data-system-field="note">Ghi chú</th>}
                {visibleColumnSet.has('status') && <th key="status" data-system-field="contactResult">Trạng thái</th>}
                {currentUser.role === 'admin' && visibleColumnSet.has('assignee') && <th key="assignee" data-system-field="assignedSaleId">Sale phụ trách</th>}
                {visibleColumnSet.has('potential') && <th key="potential" data-system-field="potentialLevel">Mức độ tiềm năng</th>}
                {visibleColumnSet.has('schedule') && <th key="schedule" data-system-field="nextContactAt">Lịch hẹn</th>}
                {visibleColumnSet.has('latest') && <th key="latest" data-system-field="latest">Cập nhật gần nhất</th>}
                {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <th key={`custom:${definition.id}`}>{definition.name}</th>)}
                {visibleCandidateInsightItems.map(entry => <th key={`insight:${entry.id}`}>{entry.label}</th>)}
                {visibleColumnSet.has('actions') && <th key="actions" className="lead-candidate-actions-column">Thao tác</th>}
                </ReorderableTableCells>
              </tr></thead>
              <tbody>
                {displayedCandidates.map((candidate, candidateIndex) => {
                  const scheduledTime = candidate.nextContactAt ? new Date(candidate.nextContactAt).getTime() : Number.NaN;
                  const endOfToday = new Date(referenceTime);
                  endOfToday.setHours(23, 59, 59, 999);
                  const isOverdue = Number.isFinite(scheduledTime) && scheduledTime < referenceTime;
                  const isToday = Number.isFinite(scheduledTime) && scheduledTime <= endOfToday.getTime();
                  const isBusy = taskActionCandidateId === candidate.id;
                  const isActive = candidate.status === 'new' || candidate.status === 'retry';
                  return (
                    <tr key={candidate.id} className={isOverdue ? 'is-overdue' : ''}>
                      <ReorderableTableCells order={orderedColumnIds} expandOverflowText={false}>
                      {visibleColumnSet.has('index') && <td key="index" className="erp-table-index-column">{(safeCurrentPage - 1) * pageSize + candidateIndex + 1}</td>}
                      {visibleColumnSet.has('company') && <td key="company"><button type="button" className="lead-candidate-company-button" onClick={() => openEditForm(candidate)} title={`${candidate.companyName}${candidate.taxCode ? ` · MST ${candidate.taxCode}` : ''}`}><strong className="erp-company-name">{candidate.companyName}</strong></button></td>}
                      {visibleColumnSet.has('taxCode') && <td key="taxCode">{renderCandidateField(candidate.taxCode)}</td>}
                      {visibleColumnSet.has('website') && <td key="website">{renderCandidateField(candidate.website)}</td>}
                      {visibleColumnSet.has('businessSector') && <td key="businessSector">{renderCandidateField(candidate.businessSector)}</td>}
                      {visibleColumnSet.has('province') && <td key="province">{renderCompactValue(candidate.province || 'Chưa cập nhật', `${candidate.province || 'Chưa cập nhật'} · ${candidate.source || 'Chưa rõ nguồn'}`)}</td>}
                      {visibleColumnSet.has('ward') && <td key="ward">{renderCandidateField(candidate.ward)}</td>}
                      {visibleColumnSet.has('industrialPark') && <td key="industrialPark">{renderCandidateField(candidate.industrialPark)}</td>}
                      {visibleColumnSet.has('address') && <td key="address">{renderCandidateField(candidate.address)}</td>}
                      {visibleColumnSet.has('contact') && <td key="contact">{renderCompactValue(getContactSummary(candidate), [candidate.contactPerson, candidate.phone, candidate.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ')}</td>}
                      {visibleColumnSet.has('contactPerson') && <td key="contactPerson">{renderCandidateField(candidate.contactPerson)}</td>}
                      {visibleColumnSet.has('contactPosition') && <td key="contactPosition">{renderCandidateField(candidate.contactPosition)}</td>}
                      {visibleColumnSet.has('phone') && <td key="phone">{renderPhoneLink(candidate)}</td>}
                      {visibleColumnSet.has('email') && <td key="email">{renderCandidateField(candidate.email)}</td>}
                      {visibleColumnSet.has('source') && <td key="source">{renderCandidateField(candidate.source)}</td>}
                      {visibleColumnSet.has('sourceUrl') && <td key="sourceUrl">{renderCandidateField(candidate.sourceUrl)}</td>}
                      {visibleColumnSet.has('expectedProducts') && <td key="expectedProducts">{renderCandidateField(candidate.expectedProducts)}</td>}
                      {visibleColumnSet.has('note') && <td key="note">{renderCandidateField(candidate.note)}</td>}
                      {visibleColumnSet.has('status') && <td key="status">{renderContactResult(candidate)}</td>}
                      {currentUser.role === 'admin' && visibleColumnSet.has('assignee') && <td key="assignee">{renderCompactValue(candidate.assignedSaleName || 'Chưa phân công', candidate.discoveredByName ? `${candidate.assignedSaleName || 'Chưa phân công'} · Tìm bởi ${candidate.discoveredByName}` : candidate.assignedSaleName || 'Chưa phân công')}</td>}
                      {visibleColumnSet.has('potential') && <td key="potential">{renderPotentialLevel(candidate)}</td>}
                      {visibleColumnSet.has('schedule') && <td key="schedule">{candidate.nextContactAt
                        ? renderCompactValue(formatShortDateTime(candidate.nextContactAt), `${formatShortDateTime(candidate.nextContactAt)} · ${isOverdue ? 'Quá hạn' : isToday ? 'Hôm nay' : 'Sắp tới'}`, isOverdue ? 'lead-date-overdue' : '')
                        : renderCompactValue('Chưa đặt lịch', 'Chưa đặt lịch', 'is-muted')}</td>}
                      {visibleColumnSet.has('latest') && <td key="latest">{renderCompactLatestActivity(candidate)}</td>}
                      {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <td key={`custom:${definition.id}`}>{formatEntityCustomFieldValue(definition, candidate.customFieldValues?.[definition.id])}</td>)}
                      {visibleCandidateInsightItems.map(entry => <td key={`insight:${entry.id}`}>{renderInsightValue(candidate, entry.id)}</td>)}
                      {visibleColumnSet.has('actions') && <td key="actions" className="lead-candidate-actions-column">
                        <RowActionMenu
                          label={`Thao tác ${candidate.companyName}`}
                          actions={[
                            { label: 'Hẹn tiếp', icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(candidate) },
                            { label: 'Chấm điểm', onSelect: () => setScoringCandidateId(candidate.id) },
                            { label: 'Chỉnh sửa', icon: <Pencil size={14} />, onSelect: () => openEditForm(candidate, 'profile') },
                            ...(currentUser.role === 'admin' ? [{ label: 'Giao việc', icon: <ClipboardCheck size={14} />, onSelect: () => setAssignmentTarget({ id: candidate.id, label: candidate.companyName, module: 'customer_data' }) }] : []),
                            ...(currentUser.role === 'sale' ? [{ label: 'Yêu cầu hỗ trợ', icon: <LifeBuoy size={14} />, onSelect: () => setSupportTarget({ id: candidate.id, label: candidate.companyName, module: 'customer_data' }) }] : []),
                            ...(isActive ? [{ label: 'Chuyển thành Lead', icon: <CheckCircle2 size={14} />, onSelect: () => onStartConversion(candidate) }] : []),
                            { label: 'Tắt công việc', icon: <X size={14} />, onSelect: () => dismissScheduledTask(candidate), disabled: isBusy, danger: true }
                          ]}
                        />
                      </td>}
                      </ReorderableTableCells>
                    </tr>
                  );
                })}
              </tbody>
            </ConfiguredSystemTable>
          ) : (
            <ConfiguredSystemTable table="lead_candidates" className="lead-candidate-table is-compact has-dynamic-columns" style={candidateTableStyle}>
              <thead>
                <tr>
                  <ReorderableTableCells order={orderedColumnIds} getHeaderProps={getHeaderProps} labels={candidateColumnLabels}>
                  {visibleColumnSet.has('select') && <th key="select" className="lead-candidate-select-column">
                    <input
                      type="checkbox"
                      checked={allDisplayedQueueCandidatesSelected}
                      disabled={queueSelectableDisplayedCandidates.length === 0}
                      onChange={toggleDisplayedQueueCandidates}
                      aria-label="Chọn dữ liệu có thể đưa vào công việc trên trang này"
                    />
                  </th>}
                  {visibleColumnSet.has('index') && <th key="index" className="erp-table-index-column">STT</th>}
                  {visibleColumnSet.has('company') && <th key="company" data-system-field="companyName">Doanh nghiệp</th>}
                  {visibleColumnSet.has('taxCode') && <th key="taxCode" data-system-field="taxCode">Mã số thuế</th>}
                  {visibleColumnSet.has('website') && <th key="website" data-system-field="website">Website</th>}
                  {visibleColumnSet.has('businessSector') && <th key="businessSector" data-system-field="businessSector">Lĩnh vực hoạt động</th>}
                  {visibleColumnSet.has('province') && <th key="province" data-system-field="province">Tỉnh/thành</th>}
                  {visibleColumnSet.has('ward') && <th key="ward" data-system-field="ward">Phường/xã</th>}
                  {visibleColumnSet.has('industrialPark') && <th key="industrialPark" data-system-field="industrialPark">Khu công nghiệp</th>}
                  {visibleColumnSet.has('address') && <th key="address" data-system-field="address">Địa chỉ doanh nghiệp</th>}
                  {visibleColumnSet.has('contact') && <th key="contact" data-system-field="contact">Thông tin liên hệ (tóm tắt)</th>}
                  {visibleColumnSet.has('contactPerson') && <th key="contactPerson" data-system-field="contactPerson">Người liên hệ</th>}
                  {visibleColumnSet.has('contactPosition') && <th key="contactPosition" data-system-field="contactPosition">Chức vụ</th>}
                  {visibleColumnSet.has('phone') && <th key="phone" data-system-field="phone">Điện thoại</th>}
                  {visibleColumnSet.has('email') && <th key="email" data-system-field="email">Email</th>}
                  {visibleColumnSet.has('source') && <th key="source" data-system-field="source">Nguồn tìm kiếm</th>}
                  {visibleColumnSet.has('sourceUrl') && <th key="sourceUrl" data-system-field="sourceUrl">Đường dẫn nguồn</th>}
                  {visibleColumnSet.has('expectedProducts') && <th key="expectedProducts" data-system-field="expectedProducts">Sản phẩm / nhu cầu quan tâm</th>}
                  {visibleColumnSet.has('note') && <th key="note" data-system-field="note">Ghi chú</th>}
                  {visibleColumnSet.has('assignee') && <th key="assignee" data-system-field="assignedSaleId">Sale phụ trách</th>}
                  {visibleColumnSet.has('processing') && <th key="processing" data-system-field="processing">Sale đang xử lý</th>}
                  {visibleColumnSet.has('potential') && <th key="potential" data-system-field="potentialLevel">Mức độ tiềm năng</th>}
                  {visibleColumnSet.has('schedule') && <th key="schedule" data-system-field="nextContactAt">Lịch tiếp theo</th>}
                  {visibleColumnSet.has('latest') && <th key="latest" data-system-field="latest">Cập nhật gần nhất</th>}
                  {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <th key={`custom:${definition.id}`}>{definition.name}</th>)}
                  {visibleCandidateInsightItems.map(entry => <th key={`insight:${entry.id}`}>{entry.label}</th>)}
                  {visibleColumnSet.has('actions') && <th key="actions" className="lead-candidate-actions-column">Thao tác</th>}
                  </ReorderableTableCells>
                </tr>
              </thead>
              <tbody>
                {displayedCandidates.map((candidate, candidateIndex) => {
                  const isActive = candidate.status === 'new' || candidate.status === 'retry';
                  const canSelectForQueue = isActive && canManageCandidate(candidate);
                  const isAlreadyInQueue = !candidate.workQueueHidden && isActive;
                  const isSelectedForQueue = selectedQueueCandidateSet.has(candidate.id);
                  return (
                    <tr key={candidate.id} className={isSelectedForQueue ? 'is-selected' : ''}>
                      <ReorderableTableCells order={orderedColumnIds} expandOverflowText={false}>
                      {visibleColumnSet.has('select') && <td key="select" className="lead-candidate-select-column">
                        <input
                          type="checkbox"
                          checked={isSelectedForQueue}
                          disabled={!canSelectForQueue}
                          onChange={() => toggleQueueCandidateSelection(candidate.id)}
                          title={isAlreadyInQueue
                            ? 'Đã có trong Công việc cần xử lý; có thể chọn để giao lại'
                            : !isActive
                              ? 'Dữ liệu đã kết thúc hoặc đã chuyển đổi'
                              : canSelectForQueue ? 'Chọn để đưa vào Công việc cần xử lý' : 'Bạn không phải Sale phụ trách dữ liệu này'}
                          aria-label={`Chọn ${candidate.companyName}${isAlreadyInQueue ? ' (đã có trong Công việc cần xử lý)' : ''}`}
                        />
                      </td>}
                      {visibleColumnSet.has('index') && <td key="index" className="erp-table-index-column">{(safeCurrentPage - 1) * pageSize + candidateIndex + 1}</td>}
                      {visibleColumnSet.has('company') && <td key="company"><button type="button" className="lead-candidate-company-button" onClick={() => openEditForm(candidate)} title={`${candidate.companyName} · ${candidate.source || 'Chưa rõ nguồn'}${candidate.taxCode ? ` · MST ${candidate.taxCode}` : ''}`}><strong className="erp-company-name">{candidate.companyName}</strong></button></td>}
                      {visibleColumnSet.has('taxCode') && <td key="taxCode">{renderCandidateField(candidate.taxCode)}</td>}
                      {visibleColumnSet.has('website') && <td key="website">{renderCandidateField(candidate.website)}</td>}
                      {visibleColumnSet.has('businessSector') && <td key="businessSector">{renderCandidateField(candidate.businessSector)}</td>}
                      {visibleColumnSet.has('province') && <td key="province">{renderCompactValue(candidate.province || 'Chưa cập nhật', [candidate.province, candidate.address].filter(Boolean).join(' · ') || 'Chưa cập nhật')}</td>}
                      {visibleColumnSet.has('ward') && <td key="ward">{renderCandidateField(candidate.ward)}</td>}
                      {visibleColumnSet.has('industrialPark') && <td key="industrialPark">{renderCandidateField(candidate.industrialPark)}</td>}
                      {visibleColumnSet.has('address') && <td key="address">{renderCandidateField(candidate.address)}</td>}
                      {visibleColumnSet.has('contact') && <td key="contact">{renderCompactValue(getContactSummary(candidate), [candidate.contactPerson, candidate.phone, candidate.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ')}</td>}
                      {visibleColumnSet.has('contactPerson') && <td key="contactPerson">{renderCandidateField(candidate.contactPerson)}</td>}
                      {visibleColumnSet.has('contactPosition') && <td key="contactPosition">{renderCandidateField(candidate.contactPosition)}</td>}
                      {visibleColumnSet.has('phone') && <td key="phone">{renderPhoneLink(candidate)}</td>}
                      {visibleColumnSet.has('email') && <td key="email">{renderCandidateField(candidate.email)}</td>}
                      {visibleColumnSet.has('source') && <td key="source">{renderCandidateField(candidate.source)}</td>}
                      {visibleColumnSet.has('sourceUrl') && <td key="sourceUrl">{renderCandidateField(candidate.sourceUrl)}</td>}
                      {visibleColumnSet.has('expectedProducts') && <td key="expectedProducts">{renderCandidateField(candidate.expectedProducts)}</td>}
                      {visibleColumnSet.has('note') && <td key="note">{renderCandidateField(candidate.note)}</td>}
                      {visibleColumnSet.has('assignee') && <td key="assignee">{renderCompactValue(candidate.assignedSaleName || 'Chưa phân công', candidate.discoveredByName ? `${candidate.assignedSaleName || 'Chưa phân công'} · Tìm bởi ${candidate.discoveredByName}` : candidate.assignedSaleName || 'Chưa phân công')}</td>}
                      {visibleColumnSet.has('processing') && <td key="processing">
                        {isAlreadyInQueue
                          ? renderCompactValue(candidate.assignedSaleName || 'Chờ phân công')
                          : renderCompactValue('—', 'Chưa đưa vào xử lý', 'is-muted')}
                      </td>}
                      {visibleColumnSet.has('potential') && <td key="potential">{renderPotentialLevel(candidate)}</td>}
                      {visibleColumnSet.has('schedule') && <td key="schedule">{candidate.nextContactAt
                        ? renderCompactValue(formatShortDateTime(candidate.nextContactAt), `${formatShortDateTime(candidate.nextContactAt)} · ${new Date(candidate.nextContactAt).getTime() < referenceTime ? 'Quá hạn' : 'Đã lên lịch'}`, new Date(candidate.nextContactAt).getTime() < referenceTime ? 'lead-date-overdue' : '')
                        : renderCompactValue('Chưa đặt lịch', 'Chưa đặt lịch', 'is-muted')}</td>}
                      {visibleColumnSet.has('latest') && <td key="latest">{renderCompactLatestActivity(candidate)}</td>}
                      {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <td key={`custom:${definition.id}`}>{renderCompactValue(formatEntityCustomFieldValue(definition, candidate.customFieldValues?.[definition.id]))}</td>)}
                      {visibleCandidateInsightItems.map(entry => <td key={`insight:${entry.id}`}>{renderInsightValue(candidate, entry.id)}</td>)}
                      {visibleColumnSet.has('actions') && <td key="actions" className="lead-candidate-actions-column">
                        <RowActionMenu
                          label={`Thao tác ${candidate.companyName}`}
                          actions={[
                            ...(currentUser.role === 'admin' ? [{ label: 'Giao việc', icon: <ClipboardCheck size={14} />, onSelect: () => setAssignmentTarget({ id: candidate.id, label: candidate.companyName, module: 'customer_data' }) }] : []),
                            ...(currentUser.role === 'sale' ? [{ label: 'Yêu cầu hỗ trợ', icon: <LifeBuoy size={14} />, onSelect: () => setSupportTarget({ id: candidate.id, label: candidate.companyName, module: 'customer_data' }) }] : []),
                            ...(canManageCandidate(candidate) ? [
                              ...(isActive ? [{ label: 'Hẹn lịch', icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(candidate) }] : []),
                              { label: 'Chấm điểm', onSelect: () => setScoringCandidateId(candidate.id) },
                              { label: 'Chỉnh sửa', icon: <Pencil size={14} />, onSelect: () => openEditForm(candidate, 'profile') },
                              ...(isActive ? [{ label: 'Chuyển thành Lead', icon: <CheckCircle2 size={14} />, onSelect: () => onStartConversion(candidate) }] : [])
                            ] : []),
                            ...(currentUser.role === 'admin' ? [{ label: 'Xóa khỏi danh sách', icon: <Trash2 size={14} />, onSelect: () => archiveCandidate(candidate), danger: true }] : [])
                          ]}
                        />
                      </td>}
                      </ReorderableTableCells>
                    </tr>
                  );
                })}
              </tbody>
            </ConfiguredSystemTable>
          )}
        </div>
        {filteredCandidates.length > 0 && (
          <footer className="lead-candidate-pagination">
            <span>Tổng số: <strong>{filteredCandidates.length}</strong> bản ghi</span>
            <label>Hiển thị <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}><option value={25}>25 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option></select></label>
            <div><button type="button" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} aria-label="Trang trước"><ChevronLeft size={15} /></button><strong>{safeCurrentPage} / {totalPages}</strong><button type="button" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} aria-label="Trang sau"><ChevronRight size={15} /></button></div>
          </footer>
        )}
      </section>
      )}

      {scheduleCandidate && (
        <div className="modal-overlay">
          <form className="modal-content lead-candidate-schedule-modal" onSubmit={handleSaveSchedule}>
            <div className="modal-header">
              <div><strong>ĐẶT LỊCH LÀM VIỆC TIẾP THEO</strong><span>{scheduleCandidate.companyName}</span></div>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => { setScheduleCandidateId(''); setScheduleContactResult(''); }}><X size={14} /> Đóng</button>
            </div>
            <div className="modal-body lead-candidate-schedule-form">
              <label><span>Ngày giờ xử lý *</span><input required autoFocus type="datetime-local" value={scheduleForm.nextContactAt} onChange={event => setScheduleForm(previous => ({ ...previous, nextContactAt: event.target.value }))} /></label>
              <label><span data-system-label="note">Ghi chú</span><textarea rows={5} value={scheduleForm.note} onChange={event => setScheduleForm(previous => ({ ...previous, note: event.target.value }))} placeholder="Thông tin Sale cần lưu ý khi xử lý công việc..." /></label>
              <p>{scheduleContactResult === 'callback' ? <>Lưu lịch sẽ cập nhật trạng thái thành <strong>Hẹn gọi lại</strong> và ghi vào lịch sử.</> : <>Công việc sẽ được đưa trở lại danh sách xử lý nếu trước đó đã tắt.</>}</p>
              {scheduleError && <div className="lead-candidate-warning is-error"><AlertCircle size={14} /><span>{scheduleError}</span></div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => { setScheduleCandidateId(''); setScheduleContactResult(''); }}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={savingSchedule}><Check size={14} /> {savingSchedule ? 'Đang lưu...' : 'Lưu lịch hẹn'}</button>
            </div>
          </form>
        </div>
      )}

      {scoringCandidate && (
        <LeadCandidateScoreDialog candidate={scoringCandidate} currentUser={currentUser} onClose={() => setScoringCandidateId('')} />
      )}

      {supportTarget && (
        <SupportRequestDialog currentUser={currentUser} users={users} target={supportTarget} onClose={() => setSupportTarget(null)} />
      )}
      {assignmentTarget && (
        <WorkAssignmentDialog currentUser={currentUser} users={users} target={assignmentTarget} onClose={() => setAssignmentTarget(null)} />
      )}
    </SystemFieldSurface>}
  </>;
};
