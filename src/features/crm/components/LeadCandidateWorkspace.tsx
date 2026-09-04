import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  History,
  ListPlus,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  Star,
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
import {
  getNotificationDocumentId,
  NOTIFICATION_SCHEMA_VERSION
} from '@/domain/notificationModels';
import {
  dbService,
  isDocumentAlreadyExistsError,
  type UserProfile
} from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { PageBackButton } from '@/components/PageBackButton';
import { BusinessLocationFields } from './BusinessLocationFields';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { EntityCustomFieldsReadOnly, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
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

interface LeadCandidateWorkspaceProps {
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  saleUsers: UserProfile[];
  currentUser: UserProfile;
  onStartConversion: (candidate: LeadCandidateRecord) => void;
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
}

interface ScheduleFormState {
  nextContactAt: string;
  note: string;
}

const CANDIDATE_SOURCES = ['Google Maps', 'Facebook', 'Mạng xã hội', 'Website', 'Khách hàng giới thiệu', 'Khác'];
type CandidateWorkspaceView = 'tasks' | 'all';
type CandidateSort = 'priority' | 'updated_desc' | 'company_asc' | 'next_contact_asc';
type CandidateColumnId = string;

interface CandidateColumnOption extends TableColumnOption {
  id: CandidateColumnId;
  adminOnly?: boolean;
}

const TASK_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'status', label: 'Trạng thái' },
  { id: 'company', label: 'Doanh nghiệp', required: true },
  { id: 'province', label: 'Tỉnh/thành' },
  { id: 'contact', label: 'Liên hệ' },
  { id: 'assignee', label: 'Sale phụ trách', adminOnly: true },
  { id: 'potential', label: 'Mức độ tiềm năng' },
  { id: 'schedule', label: 'Lịch hẹn' },
  { id: 'latest', label: 'Cập nhật gần nhất' },
  { id: 'actions', label: 'Thao tác', required: true }
];

const ALL_COLUMN_OPTIONS: CandidateColumnOption[] = [
  { id: 'select', label: 'Chọn dữ liệu', required: true },
  { id: 'company', label: 'Doanh nghiệp', required: true },
  { id: 'province', label: 'Tỉnh/thành' },
  { id: 'contact', label: 'Thông tin liên hệ' },
  { id: 'assignee', label: 'Sale phụ trách' },
  { id: 'processing', label: 'Sale đang xử lý' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'potential', label: 'Mức độ tiềm năng' },
  { id: 'schedule', label: 'Lịch tiếp theo' },
  { id: 'latest', label: 'Cập nhật gần nhất' },
  { id: 'actions', label: 'Thao tác', required: true }
];

const getAvailableColumns = (view: CandidateWorkspaceView, isAdmin: boolean, customDefinitions: EntityFieldDefinition[] = []): CandidateColumnOption[] => ([
  ...(view === 'tasks' ? TASK_COLUMN_OPTIONS : ALL_COLUMN_OPTIONS).filter(column => !column.adminOnly || isAdmin),
  ...customDefinitions.filter(definition => definition.active).map(definition => ({ id: `custom:${definition.id}`, label: definition.name }))
]);

const getDefaultVisibleColumns = (isAdmin: boolean): Record<CandidateWorkspaceView, CandidateColumnId[]> => ({
  tasks: getAvailableColumns('tasks', isAdmin).map(column => column.id),
  all: getAvailableColumns('all', isAdmin).map(column => column.id)
});

const loadVisibleColumns = (userId: string, isAdmin: boolean) => {
  const defaults = getDefaultVisibleColumns(isAdmin);
  try {
    const stored = window.localStorage.getItem(`sunflower:lead-candidate-columns:${userId}`);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<Record<CandidateWorkspaceView, string[]>>;
    return (['tasks', 'all'] as CandidateWorkspaceView[]).reduce<Record<CandidateWorkspaceView, CandidateColumnId[]>>((result, view) => {
      const available = getAvailableColumns(view, isAdmin);
      const availableIds = new Set(available.map(column => column.id));
      const requiredIds = available.filter(column => column.required).map(column => column.id);
      const storedIds = Array.isArray(parsed[view]) ? parsed[view].filter((id): id is CandidateColumnId => availableIds.has(id as CandidateColumnId)) : [];
      result[view] = Array.from(new Set([...requiredIds, ...(storedIds.length > 0 ? storedIds : defaults[view])]));
      return result;
    }, { tasks: [], all: [] });
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
  note: ''
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
  currentUser,
  onStartConversion
}) => {
  const { definitions: customFieldDefinitions } = useEntityFieldDefinitions('lead_candidates', currentUser.role);
  const systemFilterDefinitions = useSystemFilterConfiguration();
  const provinceFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.province, 'customer_data');
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
  const candidateOwners = currentUser.role === 'admin'
    ? [currentUser, ...saleUsers.filter(user => user.uid !== currentUser.uid)]
    : saleUsers.some(user => user.uid === currentUser.uid) ? saleUsers : [currentUser, ...saleUsers];
  const [searchTerm, setSearchTerm] = useState('');
  const [workspaceView, setWorkspaceView] = useState<CandidateWorkspaceView>('tasks');
  const [saleFilters, setSaleFilters] = useState<string[]>([]);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [provinceFilters, setProvinceFilters] = useState<string[]>([]);
  const [contactResultFilters, setContactResultFilters] = useState<LeadCandidateContactResult[]>([]);
  const [potentialFilters, setPotentialFilters] = useState<LeadCandidatePotentialLevel[]>([]);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [candidateSort, setCandidateSort] = useState<CandidateSort>('priority');
  const [showDataFilters, setShowDataFilters] = useState(false);
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [visibleColumnsByView, setVisibleColumnsByView] = useState(() => loadVisibleColumns(currentUser.uid, currentUser.role === 'admin'));
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState('');
  const [form, setForm] = useState<CandidateFormState>(() => createEmptyCandidateForm(currentUser, candidateOwners));
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});
  const [saveError, setSaveError] = useState('');
  const [scheduleCandidateId, setScheduleCandidateId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({ nextContactAt: tomorrowAtNine(), note: '' });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleContactResult, setScheduleContactResult] = useState<LeadCandidateContactResult | ''>('');
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [actionError, setActionError] = useState('');
  const [taskActionCandidateId, setTaskActionCandidateId] = useState('');
  const [fieldActionCandidateId, setFieldActionCandidateId] = useState('');
  const [selectedQueueCandidateIds, setSelectedQueueCandidateIds] = useState<string[]>([]);
  const [batchAssigneeId, setBatchAssigneeId] = useState('');
  const [batchQueueError, setBatchQueueError] = useState('');
  const [savingBatchQueue, setSavingBatchQueue] = useState(false);
  const [referenceTime] = useState(() => Date.now());

  const availableColumnOptions = getAvailableColumns(workspaceView, currentUser.role === 'admin', customFieldDefinitions);
  const visibleColumnSet = new Set([
    ...visibleColumnsByView[workspaceView],
    ...customFieldDefinitions.filter(definition => definition.active && definition.defaultVisible).map(definition => `custom:${definition.id}`)
  ]);
  const visibleColumnCount = availableColumnOptions.filter(column => visibleColumnSet.has(column.id)).length;

  const saveVisibleColumns = (selectedIds: string[]) => {
    const availableIds = new Set(availableColumnOptions.map(column => column.id));
    const requiredIds = availableColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([
      ...requiredIds,
      ...selectedIds.filter((id): id is CandidateColumnId => availableIds.has(id as CandidateColumnId))
    ]));
    const nextPreferences = { ...visibleColumnsByView, [workspaceView]: nextIds };
    setVisibleColumnsByView(nextPreferences);
    try {
      window.localStorage.setItem(`sunflower:lead-candidate-columns:${currentUser.uid}`, JSON.stringify(nextPreferences));
    } catch {
      // The table still works with the in-memory preference when browser storage is unavailable.
    }
    setShowColumnCustomizer(false);
  };

  const accessibleCandidates = useMemo(() => candidates.filter(candidate => (
    !candidate.archived
  )), [candidates]);

  const taskCandidates = useMemo(() => accessibleCandidates.filter(candidate => (
    isVisibleTask(candidate)
    && (currentUser.role === 'admin' || candidate.assignedSaleId === currentUser.uid)
  )), [accessibleCandidates, currentUser.role, currentUser.uid]);

  const workspaceCounts = useMemo(() => ({
    tasks: taskCandidates.length,
    all: accessibleCandidates.length
  }), [accessibleCandidates.length, taskCandidates.length]);

  const provinceOptions = useMemo(() => Array.from(new Set(
    accessibleCandidates.map(candidate => candidate.province.trim()).filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'vi-VN')), [accessibleCandidates]);

  const customFilterOptions = useMemo(() => Object.fromEntries(
    customFieldDefinitions.filter(definition => definition.active && definition.filterable).map(definition => [
      definition.id,
      Array.from(new Set(accessibleCandidates.flatMap(candidate => getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]))))
        .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
    ])
  ), [accessibleCandidates, customFieldDefinitions]);

  const filteredCandidates = useMemo(() => {
    const sourceCandidates = workspaceView === 'tasks' ? taskCandidates : accessibleCandidates;
    return sourceCandidates.filter(candidate => {
    const matchesSale = !saleFilterEnabled || saleFilters.length === 0 || saleFilters.includes(candidate.assignedSaleId);
    const matchesSource = !sourceFilterEnabled || sourceFilters.length === 0 || sourceFilters.includes(candidate.source);
    const matchesProvince = !provinceFilterEnabled || provinceFilters.length === 0 || provinceFilters.includes(candidate.province);
    const matchesContactResult = !contactResultFilterEnabled || contactResultFilters.length === 0 || contactResultFilters.includes(candidate.contactResult);
    const matchesPotential = !potentialFilterEnabled || potentialFilters.length === 0 || potentialFilters.includes(candidate.potentialLevel);
    const matchesCustomFields = customFieldDefinitions.filter(definition => definition.active && definition.filterable).every(definition => {
      const selected = customFieldFilters[definition.id] || [];
      if (selected.length === 0) return true;
      const tokens = getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]);
      return selected.some(value => tokens.includes(value));
    });
    return matchesSale && matchesSource && matchesProvince && matchesContactResult && matchesPotential && matchesCustomFields && (!pinnedFilterEnabled || !pinnedOnly || candidate.pinned) && matchesSearch(candidate, searchTerm, customFieldDefinitions);
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
  }, [accessibleCandidates, candidateSort, contactResultFilterEnabled, contactResultFilters, customFieldDefinitions, customFieldFilters, pinnedFilterEnabled, pinnedOnly, potentialFilterEnabled, potentialFilters, provinceFilterEnabled, provinceFilters, saleFilterEnabled, saleFilters, searchTerm, sourceFilterEnabled, sourceFilters, taskCandidates, workspaceView]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedCandidates = filteredCandidates.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const activeFilterCount = (provinceFilterEnabled ? provinceFilters.length : 0)
    + (sourceFilterEnabled ? sourceFilters.length : 0)
    + (contactResultFilterEnabled ? contactResultFilters.length : 0)
    + (potentialFilterEnabled ? potentialFilters.length : 0)
    + (saleFilterEnabled ? saleFilters.length : 0)
    + (pinnedFilterEnabled && pinnedOnly ? 1 : 0)
    + Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const adminAssignedTaskCount = workspaceView === 'tasks'
    ? filteredCandidates.filter(candidate => candidate.taskSource === 'admin_assigned').length
    : 0;
  const candidateFilterChips = [
    ...(provinceFilterEnabled ? provinceFilters.map(value => ({
      id: `province-${value}`,
      label: `${configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')}: ${value}`,
      onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
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
    ...customFieldDefinitions.filter(definition => definition.active && definition.filterable).flatMap(definition => (customFieldFilters[definition.id] || []).map(value => ({
      id: `custom-${definition.id}-${value}`,
      label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
      onRemove: () => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: (previous[definition.id] || []).filter(item => item !== value) }))
    })))
  ];

  const editingCandidate = editingCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === editingCandidateId) || null
    : null;
  const scheduleCandidate = scheduleCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scheduleCandidateId) || null
    : null;
  const selectedCandidate = selectedCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === selectedCandidateId) || null
    : null;
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
    setForm(createEmptyCandidateForm(currentUser, candidateOwners));
    setCustomFieldValues({});
    setSaveError('');
    setShowForm(true);
  };

  const openEditForm = (candidate: LeadCandidateRecord) => {
    setEditingCandidateId(candidate.id);
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
      note: candidate.note
    });
    setCustomFieldValues(candidate.customFieldValues || {});
    setSaveError('');
    setShowForm(true);
  };

  const handleSaveCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.companyName.trim() || !form.assignedSaleId || hasBlockingDuplicate) return;
    const missingCustomFields = getMissingRequiredEntityFields(customFieldDefinitions, customFieldValues, currentUser.role);
    if (missingCustomFields.length > 0) {
      setSaveError(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`);
      return;
    }

    try {
      const [latestLeads, latestCustomers, latestCandidates] = await Promise.all([
        dbService.getCollection('leads'),
        dbService.getCollection('customers'),
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

  const togglePinned = async (candidate: LeadCandidateRecord) => {
    if (!canManageCandidate(candidate)) return;
    setActionError('');
    try {
      await dbService.updateDocument('lead_candidates', candidate.id, {
        pinned: !candidate.pinned,
        updatedBy: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: 'lead_candidates', action: 'candidate_pin_toggled',
        summary: `${candidate.pinned ? 'Bỏ ghim' : 'Ghim'} dữ liệu khách hàng ${candidate.companyName}`,
        targetType: 'lead_candidate', targetId: candidate.id, targetLabel: candidate.companyName
      });
    } catch {
      setActionError('Không thể cập nhật dữ liệu. Vui lòng kiểm tra quyền Firebase và thử lại.');
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
      setSelectedCandidateId('');
    } catch {
      setActionError('Không thể xóa dữ liệu khỏi danh sách. Vui lòng kiểm tra quyền Firebase và thử lại.');
    }
  };

  const clearDataFilters = () => {
    setSearchTerm('');
    setProvinceFilters([]);
    setSourceFilters([]);
    setContactResultFilters([]);
    setPotentialFilters([]);
    setSaleFilters([]);
    setPinnedOnly(false);
    setCustomFieldFilters({});
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
    return (
      <div className="lead-form-page lead-candidate-form-page">
        <header className="lead-form-page__header">
          <PageBackButton onClick={() => setShowForm(false)} />
          <div>
            <span>{editingCandidateId ? 'CHỈNH SỬA DỮ LIỆU' : 'DỮ LIỆU MỚI'}</span>
            <h1>{editingCandidateId ? 'Chỉnh sửa dữ liệu khách hàng' : 'Thêm dữ liệu khách hàng'}</h1>
          </div>
        </header>

        <form className="lead-form-page__form" onSubmit={handleSaveCandidate}>
          <div className="lead-form-page__content lead-candidate-form-page__content lead-candidate-quick-form">
            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <Building2 size={18} />
                <div><h2>Thông tin doanh nghiệp</h2><p>Thông tin nhận diện, pháp lý và địa bàn của doanh nghiệp.</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label>Tên doanh nghiệp *</label><input autoFocus required value={form.companyName} onChange={event => updateForm('companyName', event.target.value)} /></div>
                <div className="form-group"><label>Mã số thuế</label><input value={form.taxCode} readOnly={Boolean(editingCandidate?.taxCode)} onChange={event => updateForm('taxCode', event.target.value)} /></div>
                <div className="form-group"><label>Website</label><input type="url" value={form.website} onChange={event => updateForm('website', event.target.value)} placeholder="https://..." /></div>
                <div className="form-group lead-form-grid__wide"><label>Lĩnh vực hoạt động</label><input value={form.businessSector} onChange={event => updateForm('businessSector', event.target.value)} placeholder="Ví dụ: Bao bì, thực phẩm, điện tử..." /></div>
                <BusinessLocationFields
                  className="lead-form-grid__wide"
                  province={form.province}
                  ward={form.ward}
                  industrialPark={form.industrialPark}
                  onChange={location => setForm(previous => ({ ...previous, ...location }))}
                />
                <div className="form-group lead-form-grid__wide"><label>Địa chỉ doanh nghiệp</label><input value={form.address} onChange={event => updateForm('address', event.target.value)} /></div>
              </div>
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <UserRoundSearch size={18} />
                <div><h2>Liên hệ và nguồn dữ liệu</h2><p>Đầu mối liên hệ và nơi tìm thấy thông tin doanh nghiệp.</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group"><label>Người liên hệ</label><input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} /></div>
                <div className="form-group"><label>Chức vụ</label><input value={form.contactPosition} onChange={event => updateForm('contactPosition', event.target.value)} placeholder="Ví dụ: Thu mua, Giám đốc..." /></div>
                <div className="form-group"><label>Điện thoại</label><input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} /></div>
                <div className="form-group"><label>Nguồn tìm kiếm</label><select value={form.source} onChange={event => updateForm('source', event.target.value)}>{CANDIDATE_SOURCES.map(source => <option key={source}>{source}</option>)}</select></div>
                <div className="form-group"><label>Đường dẫn nguồn</label><input type="url" value={form.sourceUrl} onChange={event => updateForm('sourceUrl', event.target.value)} placeholder="Link Facebook, Google Maps..." /></div>
              </div>
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <Search size={18} />
                <div><h2>Nhu cầu sơ bộ</h2><p>Thông tin phục vụ đánh giá trước khi chuyển thành Lead.</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label>Sản phẩm / nhu cầu quan tâm</label><textarea rows={4} value={form.expectedProducts} onChange={event => updateForm('expectedProducts', event.target.value)} placeholder="Tem nhãn, vật liệu, quy cách hoặc nhu cầu dự kiến..." /></div>
                <div className="form-group lead-form-grid__wide"><label>Ghi chú</label><textarea rows={5} value={form.note} onChange={event => updateForm('note', event.target.value)} placeholder="Thông tin cần lưu ý trước khi liên hệ..." /></div>
              </div>
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <CalendarClock size={18} />
                <div><h2>Phụ trách và lịch hẹn</h2><p>Có thể lưu dữ liệu trước và đặt lịch làm việc sau.</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label>Người phụ trách *</label><select required value={form.assignedSaleId} disabled={currentUser.role === 'sale'} onChange={event => updateForm('assignedSaleId', event.target.value)}><option value="">Chưa phân công</option>{candidateOwners.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select></div>
                <div className="form-group lead-form-grid__wide"><label>Lịch hẹn xử lý</label><input type="datetime-local" value={form.nextContactAt} onChange={event => updateForm('nextContactAt', event.target.value)} /></div>
              </div>
              <div className="lead-fixed-form-note">Cấu trúc biểu mẫu được cố định để dữ liệu giữa các Sale luôn thống nhất.</div>
            </section>

            <EntityCustomFieldsSection
              definitions={customFieldDefinitions}
              values={customFieldValues}
              role={currentUser.role}
              onChange={setCustomFieldValues}
            />
          </div>

          {(duplicate || saveError) && (
            <div className={`lead-candidate-warning ${hasBlockingDuplicate || saveError ? 'is-error' : ''}`}>
              <AlertCircle size={15} />
              <span>{saveError || (duplicate && describeDuplicate(duplicate))}</span>
            </div>
          )}

          <footer className="lead-form-page__footer">
            <span>Dữ liệu chỉ được ghi nhận khi bấm Lưu dữ liệu.</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
              <button type="submit" className="btn btn-primary" disabled={Boolean(hasBlockingDuplicate)}>Lưu dữ liệu</button>
            </div>
          </footer>
        </form>
      </div>
    );
  }

  return (
    <div className="lead-candidate-workspace">
      <div className="lead-candidate-commandbar">
        <nav className="lead-candidate-queues content-tabs content-tabs--compact" role="tablist" aria-label="Không gian làm việc Sale">
          {([
            ['tasks', 'Công việc cần xử lý'],
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
                setSelectedCandidateId('');
                setSelectedQueueCandidateIds([]);
                setBatchQueueError('');
                setCurrentPage(1);
                if (value === 'tasks') setCandidateSort('priority');
                if (value === 'tasks' && currentUser.role !== 'admin') setSaleFilters([]);
              }}
            >
              {value === 'tasks' && <CalendarClock size={15} />}
              {value === 'all' && <UserRoundSearch size={15} />}
              <span>{label}</span><strong>{workspaceCounts[value]}</strong>
            </button>
          ))}
        </nav>

        <section className="lead-candidate-toolbar">
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
        </section>
      </div>

      <DataFilterChipBar chips={candidateFilterChips} onClear={clearDataFilters} />

      <DataFilterPanel
        open={showDataFilters}
        title={workspaceView === 'tasks' ? 'Lọc công việc cần xử lý' : 'Lọc dữ liệu khách hàng'}
        description={workspaceView === 'tasks'
          ? 'Tập trung vào đúng nhóm công việc, lịch hẹn và Sale cần giám sát.'
          : 'Kết hợp khu vực, nguồn, trạng thái và người phụ trách.'}
        activeCount={activeFilterCount}
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
            <Star size={14} fill={pinnedOnly ? 'currentColor' : 'none'} /> Chỉ hiển thị dữ liệu đã ghim
          </button>
        </DataFilterSection>}
        {customFieldDefinitions.filter(definition => definition.active && definition.filterable).map(definition => (
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

      {showColumnCustomizer && (
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
            <table className="lead-candidate-table lead-candidate-task-table is-compact">
              <thead><tr>
                {visibleColumnSet.has('status') && <th>Trạng thái</th>}
                {visibleColumnSet.has('company') && <th>Doanh nghiệp</th>}
                {visibleColumnSet.has('province') && <th>Tỉnh/thành</th>}
                {visibleColumnSet.has('contact') && <th>Liên hệ</th>}
                {currentUser.role === 'admin' && visibleColumnSet.has('assignee') && <th>Sale phụ trách</th>}
                {visibleColumnSet.has('potential') && <th>Mức độ tiềm năng</th>}
                {visibleColumnSet.has('schedule') && <th>Lịch hẹn</th>}
                {visibleColumnSet.has('latest') && <th>Cập nhật gần nhất</th>}
                {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <th key={definition.id}>{definition.name}</th>)}
                {visibleColumnSet.has('actions') && <th className="lead-candidate-actions-column">Thao tác</th>}
              </tr></thead>
              <tbody>
                {displayedCandidates.map(candidate => {
                  const scheduledTime = candidate.nextContactAt ? new Date(candidate.nextContactAt).getTime() : Number.NaN;
                  const endOfToday = new Date(referenceTime);
                  endOfToday.setHours(23, 59, 59, 999);
                  const isOverdue = Number.isFinite(scheduledTime) && scheduledTime < referenceTime;
                  const isToday = Number.isFinite(scheduledTime) && scheduledTime <= endOfToday.getTime();
                  const isBusy = taskActionCandidateId === candidate.id;
                  const isActive = candidate.status === 'new' || candidate.status === 'retry';
                  return (
                    <tr key={candidate.id} className={isOverdue ? 'is-overdue' : ''}>
                      {visibleColumnSet.has('status') && <td>{renderContactResult(candidate)}</td>}
                      {visibleColumnSet.has('company') && <td><button type="button" className="lead-candidate-company-button" onClick={() => setSelectedCandidateId(candidate.id)} title={`${candidate.companyName}${candidate.taxCode ? ` · MST ${candidate.taxCode}` : ''}`}><strong>{candidate.companyName}</strong></button></td>}
                      {visibleColumnSet.has('province') && <td>{renderCompactValue(candidate.province || 'Chưa cập nhật', `${candidate.province || 'Chưa cập nhật'} · ${candidate.source || 'Chưa rõ nguồn'}`)}</td>}
                      {visibleColumnSet.has('contact') && <td>{renderCompactValue(getContactSummary(candidate), [candidate.contactPerson, candidate.phone, candidate.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ')}</td>}
                      {currentUser.role === 'admin' && visibleColumnSet.has('assignee') && <td>{renderCompactValue(candidate.assignedSaleName || 'Chưa phân công', candidate.discoveredByName ? `${candidate.assignedSaleName || 'Chưa phân công'} · Tìm bởi ${candidate.discoveredByName}` : candidate.assignedSaleName || 'Chưa phân công')}</td>}
                      {visibleColumnSet.has('potential') && <td>{renderPotentialLevel(candidate)}</td>}
                      {visibleColumnSet.has('schedule') && <td>{candidate.nextContactAt
                        ? renderCompactValue(formatShortDateTime(candidate.nextContactAt), `${formatShortDateTime(candidate.nextContactAt)} · ${isOverdue ? 'Quá hạn' : isToday ? 'Hôm nay' : 'Sắp tới'}`, isOverdue ? 'lead-date-overdue' : '')
                        : renderCompactValue('Chưa đặt lịch', 'Chưa đặt lịch', 'is-muted')}</td>}
                      {visibleColumnSet.has('latest') && <td>{renderCompactLatestActivity(candidate)}</td>}
                      {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <td key={definition.id}>{formatEntityCustomFieldValue(definition, candidate.customFieldValues?.[definition.id])}</td>)}
                      {visibleColumnSet.has('actions') && <td className="lead-candidate-actions-column">
                        <RowActionMenu
                          label={`Thao tác ${candidate.companyName}`}
                          actions={[
                            { label: 'Hẹn tiếp', icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(candidate) },
                            { label: 'Lịch sử', icon: <History size={14} />, onSelect: () => setSelectedCandidateId(candidate.id) },
                            { label: 'Chỉnh sửa', icon: <Pencil size={14} />, onSelect: () => openEditForm(candidate) },
                            ...(isActive ? [{ label: 'Chuyển thành Lead', icon: <CheckCircle2 size={14} />, onSelect: () => onStartConversion(candidate) }] : []),
                            { label: 'Tắt công việc', icon: <X size={14} />, onSelect: () => dismissScheduledTask(candidate), disabled: isBusy, danger: true }
                          ]}
                        />
                      </td>}
                    </tr>
                  );
                })}
                {filteredCandidates.length === 0 && <tr><td colSpan={visibleColumnCount} className="lead-empty">Không có công việc phù hợp. Công việc chỉ biến mất khi được chọn “Tắt công việc”.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="lead-candidate-table is-compact">
              <thead>
                <tr>
                  {visibleColumnSet.has('select') && <th className="lead-candidate-select-column">
                    <input
                      type="checkbox"
                      checked={allDisplayedQueueCandidatesSelected}
                      disabled={queueSelectableDisplayedCandidates.length === 0}
                      onChange={toggleDisplayedQueueCandidates}
                      aria-label="Chọn dữ liệu có thể đưa vào công việc trên trang này"
                    />
                  </th>}
                  {visibleColumnSet.has('company') && <th>Doanh nghiệp</th>}
                  {visibleColumnSet.has('province') && <th>Tỉnh/thành</th>}
                  {visibleColumnSet.has('contact') && <th>Thông tin liên hệ</th>}
                  {visibleColumnSet.has('assignee') && <th>Sale phụ trách</th>}
                  {visibleColumnSet.has('processing') && <th>Sale đang xử lý</th>}
                  {visibleColumnSet.has('status') && <th>Trạng thái</th>}
                  {visibleColumnSet.has('potential') && <th>Mức độ tiềm năng</th>}
                  {visibleColumnSet.has('schedule') && <th>Lịch tiếp theo</th>}
                  {visibleColumnSet.has('latest') && <th>Cập nhật gần nhất</th>}
                  {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <th key={definition.id}>{definition.name}</th>)}
                  {visibleColumnSet.has('actions') && <th className="lead-candidate-actions-column">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {displayedCandidates.map(candidate => {
                  const isActive = candidate.status === 'new' || candidate.status === 'retry';
                  const canSelectForQueue = isActive && canManageCandidate(candidate);
                  const isAlreadyInQueue = !candidate.workQueueHidden && isActive;
                  const isSelectedForQueue = selectedQueueCandidateSet.has(candidate.id);
                  return (
                    <tr key={candidate.id} className={isSelectedForQueue ? 'is-selected' : ''}>
                      {visibleColumnSet.has('select') && <td className="lead-candidate-select-column">
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
                      {visibleColumnSet.has('company') && <td>
                        <div className="lead-candidate-company-cell">
                          {canManageCandidate(candidate) && <button
                            type="button"
                            className={`lead-candidate-pin ${candidate.pinned ? 'is-active' : ''}`}
                            title={candidate.pinned ? 'Bỏ ghim' : 'Ghim ưu tiên'}
                            onClick={() => togglePinned(candidate)}
                          ><Star size={14} fill={candidate.pinned ? 'currentColor' : 'none'} /></button>}
                          <button type="button" className="lead-candidate-company-button" onClick={() => setSelectedCandidateId(candidate.id)} title={`${candidate.companyName} · ${candidate.source || 'Chưa rõ nguồn'}${candidate.taxCode ? ` · MST ${candidate.taxCode}` : ''}`}>
                            <strong>{candidate.companyName}</strong>
                          </button>
                        </div>
                      </td>}
                      {visibleColumnSet.has('province') && <td>{renderCompactValue(candidate.province || 'Chưa cập nhật', [candidate.province, candidate.address].filter(Boolean).join(' · ') || 'Chưa cập nhật')}</td>}
                      {visibleColumnSet.has('contact') && <td>{renderCompactValue(getContactSummary(candidate), [candidate.contactPerson, candidate.phone, candidate.email].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ')}</td>}
                      {visibleColumnSet.has('assignee') && <td>{renderCompactValue(candidate.assignedSaleName || 'Chưa phân công', candidate.discoveredByName ? `${candidate.assignedSaleName || 'Chưa phân công'} · Tìm bởi ${candidate.discoveredByName}` : candidate.assignedSaleName || 'Chưa phân công')}</td>}
                      {visibleColumnSet.has('processing') && <td>
                        {isAlreadyInQueue
                          ? renderCompactValue(candidate.assignedSaleName || 'Chờ phân công')
                          : renderCompactValue('—', 'Chưa đưa vào xử lý', 'is-muted')}
                      </td>}
                      {visibleColumnSet.has('status') && <td>{renderContactResult(candidate)}</td>}
                      {visibleColumnSet.has('potential') && <td>{renderPotentialLevel(candidate)}</td>}
                      {visibleColumnSet.has('schedule') && <td>{candidate.nextContactAt
                        ? renderCompactValue(formatShortDateTime(candidate.nextContactAt), `${formatShortDateTime(candidate.nextContactAt)} · ${new Date(candidate.nextContactAt).getTime() < referenceTime ? 'Quá hạn' : 'Đã lên lịch'}`, new Date(candidate.nextContactAt).getTime() < referenceTime ? 'lead-date-overdue' : '')
                        : renderCompactValue('Chưa đặt lịch', 'Chưa đặt lịch', 'is-muted')}</td>}
                      {visibleColumnSet.has('latest') && <td>{renderCompactLatestActivity(candidate)}</td>}
                      {customFieldDefinitions.filter(definition => visibleColumnSet.has(`custom:${definition.id}`)).map(definition => <td key={definition.id}>{formatEntityCustomFieldValue(definition, candidate.customFieldValues?.[definition.id])}</td>)}
                      {visibleColumnSet.has('actions') && <td className="lead-candidate-actions-column">
                        <RowActionMenu
                          label={`Thao tác ${candidate.companyName}`}
                          actions={[
                            { label: 'Xem hồ sơ', icon: <Eye size={14} />, onSelect: () => setSelectedCandidateId(candidate.id) },
                            { label: 'Lịch sử', icon: <History size={14} />, onSelect: () => setSelectedCandidateId(candidate.id) },
                            ...(canManageCandidate(candidate) ? [
                              ...(isActive ? [{ label: 'Hẹn lịch', icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(candidate) }] : []),
                              { label: 'Chỉnh sửa', icon: <Pencil size={14} />, onSelect: () => openEditForm(candidate) },
                              ...(isActive ? [{ label: 'Chuyển thành Lead', icon: <CheckCircle2 size={14} />, onSelect: () => onStartConversion(candidate) }] : [])
                            ] : []),
                            ...(currentUser.role === 'admin' ? [{ label: 'Xóa khỏi danh sách', icon: <Trash2 size={14} />, onSelect: () => archiveCandidate(candidate), danger: true }] : [])
                          ]}
                        />
                      </td>}
                    </tr>
                  );
                })}
                {filteredCandidates.length === 0 && <tr><td colSpan={visibleColumnCount} className="lead-empty">Không có dữ liệu phù hợp với điều kiện lọc.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        {filteredCandidates.length > 0 && (
          <footer className="lead-candidate-pagination">
            <label>Hiển thị <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setCurrentPage(1); }}><option value={25}>25 dòng</option><option value={50}>50 dòng</option><option value={100}>100 dòng</option></select></label>
            <span>{(safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, filteredCandidates.length)} trong {filteredCandidates.length}</span>
            <div><button type="button" onClick={() => setCurrentPage(page => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} aria-label="Trang trước"><ChevronLeft size={15} /></button><strong>{safeCurrentPage} / {totalPages}</strong><button type="button" onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} aria-label="Trang sau"><ChevronRight size={15} /></button></div>
          </footer>
        )}
      </section>

      {selectedCandidate && (
        <>
          <button type="button" className="lead-candidate-drawer-backdrop" aria-label="Đóng hồ sơ" onClick={() => setSelectedCandidateId('')} />
          <aside className="lead-candidate-drawer" aria-label={`Hồ sơ ${selectedCandidate.companyName}`}>
            <div className="lead-candidate-drawer__header">
              <div><span>HỒ SƠ DỮ LIỆU</span><h2>{selectedCandidate.companyName}</h2><p>{selectedCandidate.province || 'Chưa rõ tỉnh/thành'} · {selectedCandidate.source || 'Chưa rõ nguồn'}</p></div>
              <button type="button" className="btn btn-sm btn-outline btn-symbol-sm" onClick={() => setSelectedCandidateId('')} aria-label="Đóng"><X size={15} /></button>
            </div>

            <div className="lead-candidate-drawer__actions">
              {canManageCandidate(selectedCandidate) && (selectedCandidate.status === 'new' || selectedCandidate.status === 'retry') && <button type="button" className="btn btn-primary" onClick={() => openScheduleForm(selectedCandidate)}><CalendarClock size={14} /> Hẹn lịch xử lý</button>}
              {canManageCandidate(selectedCandidate) && (selectedCandidate.status === 'new' || selectedCandidate.status === 'retry') && <button type="button" className="btn btn-outline" onClick={() => onStartConversion(selectedCandidate)}><CheckCircle2 size={14} /> Chuyển Lead</button>}
              {canManageCandidate(selectedCandidate) && <button type="button" className="btn btn-outline btn-symbol-sm" onClick={() => openEditForm(selectedCandidate)} title="Chỉnh sửa"><Pencil size={14} /></button>}
            </div>

            <div className="lead-candidate-drawer__body">
              <section>
                <h3>Thông tin liên hệ</h3>
                <div className="lead-candidate-drawer__info">
                  <span><UserRoundSearch size={13} /> Người liên hệ</span><strong>{selectedCandidate.contactPerson || '—'}</strong>
                  <span><Phone size={13} /> Điện thoại</span><strong>{selectedCandidate.phone || '—'}</strong>
                  <span><Mail size={13} /> Email</span><strong>{selectedCandidate.email || '—'}</strong>
                  <span><UserRoundSearch size={13} /> Chức vụ</span><strong>{selectedCandidate.contactPosition || '—'}</strong>
                  <span><Building2 size={13} /> Lĩnh vực</span><strong>{selectedCandidate.businessSector || '—'}</strong>
                  <span><MapPin size={13} /> Địa chỉ</span><strong>{selectedCandidate.address || '—'}</strong>
                  <span><Building2 size={13} /> Mã số thuế</span><strong>{selectedCandidate.taxCode || '—'}</strong>
                  <span><UserRoundSearch size={13} /> Sale phụ trách</span><strong>{selectedCandidate.assignedSaleName || 'Chưa phân công'}</strong>
                  <span><CheckCircle2 size={13} /> Trạng thái</span><strong>{CONTACT_STATUS_LABELS[selectedCandidate.contactResult]}</strong>
                  <span><Star size={13} /> Tiềm năng</span><strong>{POTENTIAL_LEVEL_LABELS[selectedCandidate.potentialLevel]}</strong>
                </div>
                {(selectedCandidate.sourceUrl || selectedCandidate.website) && <a className="lead-candidate-source-link" href={selectedCandidate.sourceUrl || selectedCandidate.website} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Mở nguồn dữ liệu</a>}
              </section>

              <section>
                <h3>Nhu cầu sơ bộ</h3>
                <p className="lead-candidate-drawer__note">{selectedCandidate.expectedProducts || 'Chưa ghi nhận nhu cầu sản phẩm.'}</p>
              </section>

              <section>
                <h3>Ghi chú làm việc</h3>
                <p className="lead-candidate-drawer__note">{selectedCandidate.note || 'Chưa có ghi chú.'}</p>
              </section>

              <EntityCustomFieldsReadOnly definitions={customFieldDefinitions} values={selectedCandidate.customFieldValues} />

              <section>
                <h3>Lịch sử cập nhật ({selectedCandidate.contactLogs.length})</h3>
                {selectedCandidate.contactLogs.length > 0 ? (
                  <ol className="lead-candidate-history-list">
                    {selectedCandidate.contactLogs
                      .slice()
                      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
                      .map(log => (
                        <li key={log.id || `${log.occurredAt}-${log.description}`}>
                          <span className="lead-candidate-history-list__dot" />
                          <div>
                            <strong>{describeCandidateLog(log)}</strong>
                            <span>{log.createdByName || 'Không rõ người thực hiện'} · {formatShortDateTime(log.occurredAt)}</span>
                            {log.note && <p>{log.note}</p>}
                          </div>
                        </li>
                      ))}
                  </ol>
                ) : <p className="lead-candidate-drawer__note">Chưa có cập nhật nào được ghi nhận.</p>}
              </section>

              {currentUser.role === 'admin' && <button type="button" className="lead-candidate-disqualify" onClick={() => archiveCandidate(selectedCandidate)}>Xóa khỏi danh sách dữ liệu</button>}
            </div>
          </aside>
        </>
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
              <label><span>Ghi chú</span><textarea rows={5} value={scheduleForm.note} onChange={event => setScheduleForm(previous => ({ ...previous, note: event.target.value }))} placeholder="Thông tin Sale cần lưu ý khi xử lý công việc..." /></label>
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

    </div>
  );
};
