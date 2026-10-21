import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { requireConfirmedMutation, showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import { ConfiguredSystemTable, SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import { PageContextHeader } from '@/components/PageContextHeader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  LifeBuoy,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Tags,
  Trash2,
  Undo2,
  UserCheck,
  X
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  isActiveLeadRecord,
  type CustomerRecord,
  type CustomerRepositoryFolder,
  type LeadCompanySize,
  type LeadFileRecord,
  type LeadFilterDefinition,
  type LeadProfileFieldDefinition,
  type LeadRecord,
  type LeadStage
} from '@/features/crm/model/crmModels';
import {
  createCustomerFolderId,
  getCustomerRepositoryFolders,
  resolveCustomerFileFolderId
} from '@/features/crm/model/customerRepository';
import {
  createCandidateDocumentIdFromTaxCode,
  findCandidateDuplicate,
  LEAD_CANDIDATE_SCHEMA_VERSION,
  mapCandidateSourceToLeadSource,
  mapLeadSourceToCandidateSource,
  type LeadCandidateRecord
} from '@/features/crm/model/leadCandidateModels';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import {
  createLeadDocumentIdFromTaxCode,
  findTaxCodeConflict,
  normalizeTaxCode,
  type TaxCodeConflictRecord
} from '@/features/crm/model/taxCodeUniqueness';
import {
  findLeadFilterOption,
  findLeadFilterOptionId,
  findLeadFilterOptionPathInOptions,
  findLeadFilterParentOption,
  flattenLeadFilterOptions,
  getLeadFilterValues,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions,
} from '@/features/crm/model/leadFilterConfig';
import {
  getSystemFilterDefinition,
  isSystemFilterEnabled
} from '@/domain/systemFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import {
  dbService,
  isDocumentAlreadyExistsError,
  type UserProfile
} from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import {
  getNotificationDocumentId,
  NOTIFICATION_SCHEMA_VERSION
} from '@/domain/notificationModels';
import {
  isLeadSystemProfileField
} from '@/features/crm/model/leadProfileConfig';
import { PageBackButton } from '@/components/PageBackButton';
import { BusinessLocationFields } from '@/features/crm/components/BusinessLocationFields';
import { RowActionMenu } from '@/components/RowActionMenu';
import { SupportRequestDialog, type SupportRequestTarget } from '@/components/SupportRequestDialog';
import { WorkAssignmentDialog, type WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';
import { EntityCustomFieldsGrid, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
import { InlineEntityFieldManager } from '@/components/InlineEntityFieldManager';
import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import {
  formatEntityCustomFieldValue,
  getMissingRequiredEntityFields,
  getEntityCustomFieldSearchValues,
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldFilterTokens,
  type EntityCustomFieldValues
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
import { LeadOverviewDashboard } from '@/features/crm/components/LeadOverviewDashboard';
import { CustomerInsightClassification } from '@/features/crm/components/CustomerInsightClassification';
import { CrmRecordHeaderFacts, CrmRecordHeaderIdentity, CrmRecordHeaderTabs } from '@/features/crm/components/CrmRecordHeader';
import {
  CUSTOMER_INSIGHT_GROUPS,
  CUSTOMER_INSIGHT_ITEMS,
  CUSTOMER_INSIGHT_ITEM_BY_ID,
  getCustomerInsightGroupsForModule,
  matchesCustomerInsightValues,
  replaceCustomerInsightGroupValues
} from '@/features/crm/model/customerInsightCatalog';
import './Leads.css';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { leadCallHistoryKeys, leadCallSubjectKey } from '@/features/crm/model/callHistory';
import '@/components/CustomerHistory.css';

interface LeadsProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  onNavigateToCrm: () => void;
  onNavigateToCustomerData: () => void;
  onConvertLead: (lead: LeadRecord) => void;
  initialCandidate?: LeadCandidateRecord | null;
  onInitialCandidateConsumed?: () => void;
  initialLeadId?: string;
  onInitialLeadOpened?: () => void;
  initialInsightFilterId?: string;
}

type LeadOverviewSelection = 'quoted' | 'pending' | 'won' | 'lost' | 'converted';

const LEAD_OVERVIEW_LABELS: Record<LeadOverviewSelection, string> = {
  quoted: 'Đã gửi báo giá',
  pending: 'Đang chờ chốt',
  won: 'Đã chốt',
  lost: 'Không thành công',
  converted: 'Đã thành khách hàng'
};

const matchesLeadOverviewSelection = (
  lead: LeadRecord,
  selection: LeadOverviewSelection,
  definitions: LeadFilterDefinition[]
) => {
  if (selection === 'quoted') {
    const progress = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.progress] || [];
    return progress.includes('quote_sent') || lead.stage === 'quoted' || lead.stage === 'negotiating';
  }
  if (selection === 'pending') return lead.stage === 'quoted' || lead.stage === 'negotiating';
  if (selection === 'converted') return lead.stage === 'converted' || Boolean(lead.convertedCustomerId);
  return lead.stage === selection;
};

interface LeadFormState {
  companyName: string;
  contactPerson: string;
  contactPosition: string;
  phone: string;
  email: string;
  website: string;
  businessSector: string;
  industry: string;
  taxCode: string;
  address: string;
  province: string;
  ward: string;
  industrialPark: string;
  companySize: LeadCompanySize;
  source: string;
  sourceUrl: string;
  potentialValue: number;
  expectedProducts: string;
  closingProbability: number;
  expectedCloseAt: string;
  lastContactResult: string;
  nextGoal: string;
  careNote: string;
  stage: LeadStage;
  assignedSaleId: string;
  discoveredById: string;
  nextFollowUpAt: string;
  note: string;
  customerInsightValues: string[];
}

interface LeadScheduleFormState {
  nextFollowUpAt: string;
}

const LEAD_STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: 'new', label: 'Mới tiếp nhận' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'quoted', label: 'Đã gửi báo giá' },
  { id: 'negotiating', label: 'Đang đàm phán' },
  { id: 'won', label: 'Thành công' },
  { id: 'lost', label: 'Không thành công' },
  { id: 'converted', label: 'Đã chuyển đổi' }
];

const COMPANY_SIZE_LABELS: Record<LeadCompanySize, string> = {
  '': 'Chưa xác định',
  large: 'Doanh nghiệp lớn',
  medium: 'Doanh nghiệp vừa',
  small: 'Doanh nghiệp nhỏ'
};

const LEADS_PAGE_REFERENCE_TIME = Date.now();

const formatDateTime = (value: string) => {
  if (!value) return 'Chưa đặt lịch';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa đặt lịch' : date.toLocaleString('vi-VN');
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

const getLeadScheduleTime = (lead: LeadRecord): number => {
  if (!lead.nextFollowUpAt) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(lead.nextFollowUpAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const getStageLabel = (stage: LeadStage) => (
  LEAD_STAGES.find(item => item.id === stage)?.label || stage
);

const normalizeSearchText = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi-VN')
  .replace(/đ/g, 'd');

const matchesEverySearchTerm = (searchTerm: string, values: unknown[]) => {
  const terms = normalizeSearchText(searchTerm).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
};

type LeadDetailTab = 'classification' | 'profile';

const CLASSIFICATION_OWNED_PROFILE_FIELDS = new Set([
  'nganh nghe',
  'linh vuc hoat dong',
  'san pham nhu cau',
  'san pham nhu cau quan tam',
  'nhu cau san pham',
  'doi thu canh tranh',
  'quy mo doanh nghiep',
  'muc su dung'
]);

const isClassificationOwnedProfileField = (definition: { name: string }) => (
  CLASSIFICATION_OWNED_PROFILE_FIELDS.has(normalizeSearchText(definition.name))
);

const createEmptyForm = (currentUser: UserProfile, saleUsers: UserProfile[]): LeadFormState => ({
  companyName: '',
  contactPerson: '',
  contactPosition: '',
  phone: '',
  email: '',
  website: '',
  businessSector: '',
  industry: '',
  taxCode: '',
  address: '',
  province: '',
  ward: '',
  industrialPark: '',
  companySize: '',
  source: '',
  sourceUrl: '',
  potentialValue: 0,
  expectedProducts: '',
  closingProbability: 0,
  expectedCloseAt: '',
  lastContactResult: '',
  nextGoal: '',
  careNote: '',
  stage: 'new',
  assignedSaleId: currentUser.role === 'sale' ? currentUser.uid : (saleUsers[0]?.uid || ''),
  discoveredById: currentUser.role === 'sale' ? currentUser.uid : '',
  nextFollowUpAt: '',
  note: '',
  customerInsightValues: []
});

export const Leads: React.FC<LeadsProps> = ({
  customers,
  leads,
  users,
  currentUser,
  onNavigateToCrm,
  onNavigateToCustomerData,
  onConvertLead,
  initialCandidate = null,
  onInitialCandidateConsumed,
  initialLeadId = '',
  onInitialLeadOpened,
  initialInsightFilterId = ''
}) => {
  const { t } = useLanguage();
  const { definitions: customFieldDefinitions, allDefinitions: allCustomFieldDefinitions } = useEntityFieldDefinitions('leads', currentUser.role);
  const inlineSystemFieldConfiguration = useSystemFieldConfiguration('leads');
  const saleUsers = useMemo(() => users.filter(user => user.role === 'sale'), [users]);
  const [searchTerm, setSearchTerm] = useState('');
  const [leadPageSize, setLeadPageSize] = useState(25);
  const [leadCurrentPage, setLeadCurrentPage] = useState(1);
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'list'>('overview');
  const [leadListPrepared, setLeadListPrepared] = useState(false);
  const [overviewSelection, setOverviewSelection] = useState<LeadOverviewSelection | null>(null);
  const [overviewDrilldown, setOverviewDrilldown] = useState<{ label: string; ids: string[] } | null>(null);
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [storedFilterDefinitions, setStoredFilterDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [profileDefinitions, setProfileDefinitions] = useState<LeadProfileFieldDefinition[]>([]);
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string[]>>({});
  const [insightFilters, setInsightFilters] = useState<string[]>([]);
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [showLeadFilters, setShowLeadFilters] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [leadDetailTab, setLeadDetailTab] = useState<LeadDetailTab>('classification');
  const [supportTarget, setSupportTarget] = useState<SupportRequestTarget | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<WorkAssignmentTarget | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState('');
  const [convertingCandidateId, setConvertingCandidateId] = useState('');
  const [form, setForm] = useState<LeadFormState>(() => createEmptyForm(currentUser, saleUsers));
  const [formFilterValues, setFormFilterValues] = useState<Record<string, string[]>>({});
  const [formProfileValues, setFormProfileValues] = useState<Record<string, string[]>>({});
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});
  const [uploadingFiles, setUploadingFiles] = useState<LeadFileRecord[]>([]);
  const [attachmentLinkName, setAttachmentLinkName] = useState('');
  const [attachmentLinkUrl, setAttachmentLinkUrl] = useState('');
  const [activeLeadFolderId, setActiveLeadFolderId] = useState('contracts');
  const [newLeadFolderName, setNewLeadFolderName] = useState('');
  const [renamingLeadFolderId, setRenamingLeadFolderId] = useState('');
  const [leadFolderNameDraft, setLeadFolderNameDraft] = useState('');
  const [leadRepositoryFile, setLeadRepositoryFile] = useState('');
  const [leadRepositoryFileName, setLeadRepositoryFileName] = useState('');
  const [leadRepositoryFileLink, setLeadRepositoryFileLink] = useState('');
  const [taxCodeSaveError, setTaxCodeSaveError] = useState('');
  const leadProfileHistoryActive = useRef(false);

  const enterLeadProfileHistory = useCallback(() => {
    if (leadProfileHistoryActive.current) return;
    window.history.pushState({ ...window.history.state, sunflowerView: 'lead-profile' }, '');
    leadProfileHistoryActive.current = true;
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (!leadProfileHistoryActive.current) return;
      leadProfileHistoryActive.current = false;
      setShowLeadForm(false);
      setSelectedLeadId('');
      setEditingLeadId('');
      setConvertingCandidateId('');
      setLeadDetailTab('classification');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!initialInsightFilterId) return;
    setWorkspaceTab('list');
    setOverviewSelection(null);
    setOverviewDrilldown(null);
    setDynamicFilters({});
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setInsightFilters([initialInsightFilterId]);
    setLeadCurrentPage(1);
  }, [initialInsightFilterId]);

  const [scheduleLeadId, setScheduleLeadId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<LeadScheduleFormState>({
    nextFollowUpAt: tomorrowAtNine()
  });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [returningLeadId, setReturningLeadId] = useState('');
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const { selectedIds: storedVisibleColumnIds, setSelectedIds: setStoredVisibleColumnIds, canEditColumns } = useSharedTableColumns({
    layoutId: 'leads',
    legacySelectionKey: `sunflower:lead-columns:${currentUser.uid}`,
    legacyWidthKey: `sunflower:lead-column-widths:${currentUser.uid}`
  });

  const clearPurgedCustomField = (fieldId: string) => setCustomFieldValues(previous => {
    const next = { ...previous };
    delete next[fieldId];
    return next;
  });
  const clearPurgedSystemField = (fieldKey: string) => setForm(previous => ({
    ...previous,
    [fieldKey]: typeof (previous as unknown as Record<string, unknown>)[fieldKey] === 'number' ? 0 : ''
  }));

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection('lead_candidates', data => {
      setCandidates(sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt]));
    }, currentUser.role === 'sale' ? {
      fieldName: 'assignedSaleId',
      fieldValue: currentUser.uid
    } : undefined);
    return unsubscribe;
  }, [currentUser.role, currentUser.uid]);

  useEffect(() => {
    const unsubscribeDefinitions = dbService.subscribeCollection('lead_filter_definitions', data => {
      setStoredFilterDefinitions(data as LeadFilterDefinition[]);
    });
    return unsubscribeDefinitions;
  }, []);

  useEffect(() => {
    const unsubscribeDefinitions = dbService.subscribeCollection('lead_profile_field_definitions', data => {
      const definitions = (data as LeadProfileFieldDefinition[])
        .map(field => ({ ...field, options: Array.isArray(field.options) ? field.options : [] }))
        .sort((a, b) => a.order - b.order);
      setProfileDefinitions(definitions);
    });
    return unsubscribeDefinitions;
  }, []);

  const filterDefinitions = useMemo(
    () => mergeLeadFilterDefinitions(storedFilterDefinitions),
    [storedFilterDefinitions]
  );
  const leadSourceOptions = useMemo(() => {
    const definition = filterDefinitions.find(field => field.id === LEAD_FILTER_IDS.source);
    return definition
      ? flattenLeadFilterOptions(definition.options).map(option => option.label)
      : [];
  }, [filterDefinitions]);
  const systemFilterDefinitions = useSystemFilterConfiguration(filterDefinitions);
  const visibleFilterDefinitions = useMemo(
    () => filterDefinitions.filter(field => (
      field.active
      && field.showInQuickFilter
      && isSystemFilterEnabled(systemFilterDefinitions, field.id, 'lead_list')
    )),
    [filterDefinitions, systemFilterDefinitions]
  );

  const customProfileDefinitions = useMemo(
    () => profileDefinitions.filter(definition => !isLeadSystemProfileField(definition)),
    [profileDefinitions]
  );
  const profileFormCustomFieldDefinitions = useMemo(
    () => customFieldDefinitions.filter(definition => !isClassificationOwnedProfileField(definition)),
    [customFieldDefinitions]
  );

  const leadColumnOptions = useMemo<TableColumnOption[]>(() => {
    const sectionLabels: Record<string, string> = {
      company: t('Thông tin doanh nghiệp'),
      classification: t('Phân loại khách hàng'),
      contact: t('Liên hệ và nhu cầu'),
      needs: t('Liên hệ và nhu cầu'),
      assignment: t('Phụ trách và lịch làm việc'),
      additional: t('Trường thông tin bổ sung')
    };
    const configuredField = (key: string, fallback: string) => {
      const field = inlineSystemFieldConfiguration.fields.find(item => item.key === key);
      return field?.removed ? null : field?.label || t(fallback);
    };
    const systemColumn = (id: string, key: string, fallback: string, group: string, defaultVisible = false): TableColumnOption | null => {
      const label = configuredField(key, fallback);
      return label ? { id, label, group, defaultVisible } : null;
    };
    return [
      { id: 'index', label: 'STT', group: t('Điều khiển bảng'), required: true },
      { id: 'company', label: configuredField('companyName', 'Doanh nghiệp') || t('Doanh nghiệp'), group: sectionLabels.company, required: true },
      systemColumn('taxCode', 'taxCode', 'Mã số thuế', sectionLabels.company),
      systemColumn('website', 'website', 'Website', sectionLabels.company),
      systemColumn('businessSector', 'businessSector', 'Lĩnh vực hoạt động', sectionLabels.company),
      systemColumn('address', 'address', 'Địa chỉ doanh nghiệp', sectionLabels.company),
      systemColumn('companySize', 'companySize', 'Quy mô', sectionLabels.classification),
      { id: 'source', label: t('Khu vực'), group: sectionLabels.classification },
      systemColumn('sourceValue', 'source', 'Nguồn tìm kiếm', sectionLabels.classification),
      systemColumn('province', 'province', 'Tỉnh/thành', sectionLabels.classification),
      systemColumn('ward', 'ward', 'Phường/xã', sectionLabels.classification),
      systemColumn('industrialPark', 'industrialPark', 'Khu công nghiệp', sectionLabels.classification),
      { id: 'contact', label: t('Liên hệ'), group: sectionLabels.contact },
      systemColumn('contactPerson', 'contactPerson', 'Người liên hệ', sectionLabels.contact),
      systemColumn('contactPosition', 'contactPosition', 'Chức vụ', sectionLabels.contact),
      systemColumn('phone', 'phone', 'Điện thoại', sectionLabels.contact),
      systemColumn('email', 'email', 'Email', sectionLabels.contact),
      systemColumn('expectedProducts', 'expectedProducts', 'Sản phẩm / nhu cầu quan tâm', sectionLabels.contact),
      systemColumn('potentialValue', 'potentialValue', 'Giá trị tiềm năng', sectionLabels.contact, true),
      systemColumn('stage', 'stage', 'Giai đoạn xử lý', sectionLabels.contact),
      systemColumn('note', 'note', 'Ghi chú', sectionLabels.contact),
      systemColumn('assignedSale', 'assignedSaleId', 'Sale phụ trách', sectionLabels.assignment, true),
      systemColumn('discoveredBy', 'discoveredById', 'Sale tìm được Lead', sectionLabels.assignment),
      systemColumn('nextFollowUpAt', 'nextFollowUpAt', 'Chăm sóc tiếp', sectionLabels.assignment, true),
      ...CUSTOMER_INSIGHT_GROUPS.flatMap(group => group.items.map(entry => ({
        id: `insight:${entry.id}`,
        label: entry.label,
        group: `${t('Phân loại khách hàng')} · ${group.label}`,
        defaultVisible: false
      }))),
      ...customFieldDefinitions.filter(definition => definition.active).map(definition => ({
        id: `custom:${definition.id}`,
        label: definition.name,
        group: sectionLabels[definition.section] || sectionLabels.additional,
        defaultVisible: definition.defaultVisible
      })),
      { id: 'actions', label: t('Thao tác'), group: t('Điều khiển bảng'), required: true }
    ].filter((column): column is TableColumnOption => Boolean(column));
  }, [customFieldDefinitions, inlineSystemFieldConfiguration.fields, t]);
  const visibleLeadColumnIds = useMemo(() => {
    const availableIds = new Set(leadColumnOptions.map(column => column.id));
    const requiredIds = leadColumnOptions.filter(column => column.required).map(column => column.id);
    const selectedIds = storedVisibleColumnIds?.filter(id => availableIds.has(id));
    const defaultIds = leadColumnOptions.filter(column => column.required || column.defaultVisible !== false).map(column => column.id);
    return new Set([...requiredIds, ...(selectedIds?.length ? selectedIds : defaultIds)]);
  }, [leadColumnOptions, storedVisibleColumnIds]);
  const visibleLeadCustomFields = useMemo(
    () => customFieldDefinitions.filter(definition => definition.active && visibleLeadColumnIds.has(`custom:${definition.id}`)),
    [customFieldDefinitions, visibleLeadColumnIds]
  );
  const visibleLeadInsightItems = useMemo(
    () => CUSTOMER_INSIGHT_ITEMS.filter(entry => visibleLeadColumnIds.has(`insight:${entry.id}`)),
    [visibleLeadColumnIds]
  );

  const saveVisibleLeadColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const availableIds = new Set(leadColumnOptions.map(column => column.id));
    const requiredIds = leadColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([...requiredIds, ...selectedIds.filter(id => availableIds.has(id))]));
    setStoredVisibleColumnIds(nextIds);
    setShowColumnCustomizer(false);
  };
  const {
    orderedColumnIds: orderedLeadColumnIds,
    getHeaderProps: getLeadHeaderProps
  } = useReorderableTableColumns({
    columns: leadColumnOptions,
    selectedIds: storedVisibleColumnIds || Array.from(visibleLeadColumnIds),
    onOrderChange: saveVisibleLeadColumns,
    layoutId: 'leads',
    lockedStartIds: ['index', 'company'],
    lockedEndIds: ['actions']
  });
  const leadColumnLabels = Object.fromEntries(leadColumnOptions.map(column => [column.id, column.label]));

  const accessibleLeads = useMemo(
    () => leads.filter(isActiveLeadRecord),
    [leads]
  );
  const overviewLeads = useMemo(() => currentUser.role === 'sale'
    ? accessibleLeads.filter(lead => lead.discoveredById === currentUser.uid)
    : accessibleLeads,
  [accessibleLeads, currentUser.role, currentUser.uid]);

  const leadOverview = useMemo(() => {
    const count = (selection: LeadOverviewSelection) => overviewLeads.filter(lead => (
      matchesLeadOverviewSelection(lead, selection, filterDefinitions)
    )).length;
    return {
      total: overviewLeads.length,
      quoted: count('quoted'),
      pending: count('pending'),
      won: count('won'),
      lost: count('lost'),
      converted: count('converted')
    };
  }, [filterDefinitions, overviewLeads]);

  const customFilterOptions = useMemo(() => Object.fromEntries(
    customFieldDefinitions.filter(definition => definition.active).map(definition => [
      definition.id,
      Array.from(new Set(accessibleLeads.flatMap(lead => getEntityCustomFieldFilterTokens(definition, lead.customFieldValues?.[definition.id]))))
        .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
        .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
    ])
  ), [accessibleLeads, customFieldDefinitions]);

  const quickFilterOptionsByField = useMemo(() => {
    const valuesWithDataByField = new Map<string, Set<string>>([
      LEAD_FILTER_IDS.province,
      LEAD_FILTER_IDS.industrialPark
    ].map(fieldId => [fieldId, new Set(
      accessibleLeads.flatMap(lead => getLeadFilterValues(lead, filterDefinitions)[fieldId] || [])
    )]));

    return Object.fromEntries(filterDefinitions.map(field => {
      const activeOptions = field.options.filter(option => option.active);
      if (field.id === LEAD_FILTER_IDS.province) {
        const valuesWithData = valuesWithDataByField.get(field.id) || new Set<string>();
        return [field.id, activeOptions.filter(option => valuesWithData.has(option.id))];
      }
      if (field.id !== LEAD_FILTER_IDS.industrialPark) return [field.id, activeOptions];

      const pruneOptionsWithData = (options: typeof activeOptions): typeof activeOptions => options.flatMap(option => {
        const activeChildren = (option.children || []).filter(child => child.active);
        const childrenWithData = pruneOptionsWithData(activeChildren);
        const valuesWithData = valuesWithDataByField.get(field.id) || new Set<string>();
        return valuesWithData.has(option.id) || childrenWithData.length > 0
          ? [{ ...option, children: childrenWithData }]
          : [];
      });
      return [field.id, pruneOptionsWithData(activeOptions)];
    }));
  }, [accessibleLeads, filterDefinitions]);

  const visibleFilterIds = useMemo(
    () => new Set(visibleFilterDefinitions.map(field => field.id)),
    [visibleFilterDefinitions]
  );

  const advancedFilterFields = useMemo<AdvancedFilterField<LeadRecord>[]>(() => {
    const groups = {
      company: t('Thông tin doanh nghiệp'),
      contact: t('Liên hệ và nguồn dữ liệu'),
      needs: t('Nhu cầu sơ bộ'),
      assignment: t('Phụ trách và lịch hẹn'),
      additional: t('Thông tin bổ sung')
    };
    const systemField = (
      id: string,
      fallbackLabel: string,
      group: string,
      kind: AdvancedFilterField<LeadRecord>['kind'],
      getValues: AdvancedFilterField<LeadRecord>['getValues'],
      options?: AdvancedFilterField<LeadRecord>['options']
    ): AdvancedFilterField<LeadRecord> | null => {
      const configuration = inlineSystemFieldConfiguration.fields.find(field => field.key === id);
      return configuration?.removed ? null : { id: `system:${id}`, label: configuration?.label || t(fallbackLabel), group, kind, getValues, options };
    };
    const configuredClassificationFields: AdvancedFilterField<LeadRecord>[] = filterDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `classification:${definition.id}`,
        label: definition.name,
        group: definition.group || groups.needs,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        options: flattenLeadFilterOptions(definition.options).filter(option => option.active).map(option => ({ value: option.id, label: option.label })),
        getValues: lead => getLeadFilterValues(lead, filterDefinitions)[definition.id] || []
      }));
    const profileFields: AdvancedFilterField<LeadRecord>[] = customProfileDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `profile:${definition.id}`,
        label: definition.name,
        group: groups.additional,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        options: definition.type === 'checkbox'
          ? [{ value: 'true', label: 'Có' }, { value: 'false', label: 'Không' }]
          : definition.options.filter(option => option.active).map(option => ({ value: option.id, label: option.label })),
        getValues: lead => lead.profileValues?.[definition.id] || []
      }));
    const customFields: AdvancedFilterField<LeadRecord>[] = customFieldDefinitions
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
        getValues: lead => toAdvancedFilterValues(lead.customFieldValues?.[definition.id])
      }));
    return [
      systemField('companyName', 'Tên doanh nghiệp', groups.company, 'text', lead => [lead.companyName]),
      systemField('taxCode', 'Mã số thuế', groups.company, 'text', lead => [lead.taxCode]),
      systemField('website', 'Website', groups.company, 'text', lead => [lead.website]),
      systemField('businessSector', 'Lĩnh vực hoạt động', groups.company, 'text', lead => [lead.businessSector]),
      systemField('address', 'Địa chỉ doanh nghiệp', groups.company, 'text', lead => [lead.address]),
      systemField('companySize', 'Quy mô', groups.company, 'select', lead => [lead.companySize], Object.entries(COMPANY_SIZE_LABELS).map(([value, label]) => ({ value, label }))),
      systemField('contactPerson', 'Người liên hệ', groups.contact, 'text', lead => [lead.contactPerson]),
      systemField('contactPosition', 'Chức vụ', groups.contact, 'text', lead => [lead.contactPosition]),
      systemField('phone', 'Điện thoại', groups.contact, 'text', lead => [lead.phone]),
      systemField('email', 'Email', groups.contact, 'text', lead => [lead.email]),
      systemField('source', 'Nguồn tìm kiếm', groups.contact, 'text', lead => [lead.source]),
      systemField('province', 'Tỉnh / thành', groups.contact, 'text', lead => [lead.province]),
      systemField('ward', 'Phường / xã', groups.contact, 'text', lead => [lead.ward]),
      systemField('industrialPark', 'Khu công nghiệp', groups.contact, 'text', lead => [lead.industrialPark]),
      systemField('expectedProducts', 'Sản phẩm / nhu cầu quan tâm', groups.needs, 'text', lead => [lead.expectedProducts]),
      systemField('potentialValue', 'Giá trị tiềm năng', groups.needs, 'number', lead => [lead.potentialValue]),
      systemField('stage', 'Giai đoạn xử lý', groups.needs, 'select', lead => [lead.stage], LEAD_STAGES.map(stage => ({ value: stage.id, label: stage.label }))),
      systemField('note', 'Ghi chú', groups.needs, 'text', lead => [lead.note]),
      systemField('assignedSaleId', 'Sale phụ trách', groups.assignment, 'select', lead => [lead.assignedSaleId], users.map(user => ({ value: user.uid, label: user.displayName }))),
      systemField('discoveredById', 'Sale tìm được Lead', groups.assignment, 'select', lead => [lead.discoveredById], users.map(user => ({ value: user.uid, label: user.displayName }))),
      systemField('nextFollowUpAt', 'Lịch chăm sóc tiếp theo', groups.assignment, 'date', lead => [lead.nextFollowUpAt]),
      systemField('updatedAt', 'Cập nhật gần nhất', groups.assignment, 'date', lead => [lead.updatedAt]),
      ...configuredClassificationFields,
      ...profileFields,
      ...customFields
    ].filter((field): field is AdvancedFilterField<LeadRecord> => Boolean(field));
  }, [customFieldDefinitions, customProfileDefinitions, filterDefinitions, inlineSystemFieldConfiguration.fields, t, users]);

  const leadQuickFilterCount = Object.entries(dynamicFilters)
    .filter(([fieldId]) => visibleFilterIds.has(fieldId))
    .reduce((total, [, values]) => total + values.length, 0)
    + Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0)
    + insightFilters.length;
  const leadAdvancedFilterCount = countAdvancedFilters(advancedFilters);
  const leadActiveFilterCount = leadQuickFilterCount + leadAdvancedFilterCount + (overviewSelection || overviewDrilldown ? 1 : 0);
  const leadFilterChips = Object.entries(dynamicFilters).flatMap(([fieldId, values]) => {
    if (!visibleFilterIds.has(fieldId)) return [];
    const field = filterDefinitions.find(definition => definition.id === fieldId);
    if (!field) return [];
    const configuredField = getSystemFilterDefinition(systemFilterDefinitions, fieldId);
    return values.map(value => ({
      id: `${fieldId}-${value}`,
      label: `${configuredField?.name || field.name}: ${findLeadFilterOption(filterDefinitions, fieldId, value)?.label || value}`,
      onRemove: () => setDynamicFilters(previous => ({
        ...previous,
        [fieldId]: (previous[fieldId] || []).filter(item => item !== value)
      }))
    }));
  }).concat(customFieldDefinitions.filter(definition => definition.active).flatMap(definition => (
    (customFieldFilters[definition.id] || []).map(value => ({
      id: `custom-${definition.id}-${value}`,
      label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
      onRemove: () => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: (previous[definition.id] || []).filter(item => item !== value) }))
    }))
  ))).concat(insightFilters.map(value => ({
    id: `insight-${value}`,
    label: CUSTOMER_INSIGHT_ITEM_BY_ID.get(value)?.label || value,
    onRemove: () => setInsightFilters(previous => previous.filter(item => item !== value))
  }))).concat(getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
    id: `advanced-${summary.id}`,
    label: summary.label,
    onRemove: () => setAdvancedFilters(previous => {
      const next = { ...previous };
      delete next[summary.id];
      setLeadCurrentPage(1);
      return next;
    })
  }))).concat(overviewSelection ? [{
    id: `overview-${overviewSelection}`,
    label: LEAD_OVERVIEW_LABELS[overviewSelection],
    onRemove: () => setOverviewSelection(null)
  }] : []).concat(overviewDrilldown ? [{
    id: 'overview-drilldown',
    label: overviewDrilldown.label,
    onRemove: () => setOverviewDrilldown(null)
  }] : []);

  const isOverdue = (lead: LeadRecord) => {
    if (!lead.nextFollowUpAt || ['won', 'lost', 'converted'].includes(lead.stage)) return false;
    const timestamp = new Date(lead.nextFollowUpAt).getTime();
    return Number.isFinite(timestamp) && timestamp < LEADS_PAGE_REFERENCE_TIME;
  };

  const overviewDrilldownIds = useMemo(() => overviewDrilldown ? new Set(overviewDrilldown.ids) : null, [overviewDrilldown]);

  const listReady = leadListPrepared || workspaceTab === 'list';
  const orderedLeads = useMemo(() => {
    if (!listReady) return [];
    return [...accessibleLeads].sort((left, right) => {
      const leftSchedule = getLeadScheduleTime(left);
      const rightSchedule = getLeadScheduleTime(right);
      if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
      return String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt));
    });
  }, [accessibleLeads, listReady]);

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const activeClassificationFilters = Object.entries(dynamicFilters)
      .filter(([fieldId, values]) => visibleFilterIds.has(fieldId) && values.length > 0);
    const activeCustomFilters = customFieldDefinitions.filter(definition => (
      definition.active && (customFieldFilters[definition.id] || []).length > 0
    ));
    const hasAdvancedFilters = countAdvancedFilters(advancedFilters) > 0;
    if (
      !normalizedSearch
      && !overviewSelection
      && !overviewDrilldownIds
      && activeClassificationFilters.length === 0
      && insightFilters.length === 0
      && activeCustomFilters.length === 0
      && !hasAdvancedFilters
    ) return orderedLeads;

    return orderedLeads.filter(lead => {
      const leadFilterValues: Record<string, string[]> = normalizedSearch || activeClassificationFilters.length > 0
        ? getLeadFilterValues(lead, filterDefinitions)
        : {};
      const matchesSearch = !normalizedSearch || matchesEverySearchTerm(normalizedSearch, [
        lead.companyName,
        lead.contactPerson,
        lead.contactPosition,
        lead.phone,
        lead.email,
        lead.website,
        lead.businessSector,
        lead.taxCode,
        lead.address,
        lead.province,
        lead.ward,
        lead.industrialPark,
        lead.source,
        lead.expectedProducts,
        lead.note,
        lead.assignedSaleName,
        users.find(user => user.uid === lead.assignedSaleId)?.displayName,
        getStageLabel(lead.stage),
        COMPANY_SIZE_LABELS[lead.companySize],
        Object.entries(leadFilterValues).flatMap(([fieldId, optionIds]) => {
          return optionIds.map(optionId => findLeadFilterOption(filterDefinitions, fieldId, optionId)?.label || optionId);
        }),
        (lead.activities || []).map(activity => activity.note),
        Object.entries(lead.profileValues || {}).flatMap(([fieldId, fieldValues]) => {
          const definition = customProfileDefinitions.find(field => field.id === fieldId);
          return fieldValues.map(value => definition?.options.find(option => option.id === value)?.label || value);
        }),
        ...getEntityCustomFieldSearchValues(customFieldDefinitions, lead.customFieldValues)
      ]);
      const matchesClassifications = activeClassificationFilters
        .every(([fieldId, selectedValues]) => {
          const currentValues = leadFilterValues[fieldId] || [];
          return selectedValues.some(value => currentValues.includes(value));
        });
      const matchesCustomFields = activeCustomFilters.every(definition => {
        const selected = customFieldFilters[definition.id] || [];
        const tokens = getEntityCustomFieldFilterTokens(definition, lead.customFieldValues?.[definition.id]);
        return selected.some(value => tokens.includes(value));
      });
      return matchesSearch
        && (!overviewSelection || matchesLeadOverviewSelection(lead, overviewSelection, filterDefinitions))
        && (!overviewDrilldownIds || overviewDrilldownIds.has(lead.id))
        && matchesClassifications
        && matchesCustomerInsightValues(lead.customerInsightValues || [], insightFilters)
        && matchesCustomFields
        && (!hasAdvancedFilters || matchesAdvancedFilters(lead, advancedFilterFields, advancedFilters));
    });
  }, [
    orderedLeads,
    advancedFilterFields,
    advancedFilters,
    dynamicFilters,
    insightFilters,
    filterDefinitions,
    overviewSelection,
    overviewDrilldownIds,
    searchTerm,
    users,
    customProfileDefinitions,
    customFieldDefinitions,
    customFieldFilters,
    visibleFilterIds
  ]);

  const leadTotalPages = Math.max(1, Math.ceil(filteredLeads.length / leadPageSize));
  const safeLeadCurrentPage = Math.min(leadCurrentPage, leadTotalPages);
  const displayedLeads = filteredLeads.slice(
    (safeLeadCurrentPage - 1) * leadPageSize,
    safeLeadCurrentPage * leadPageSize
  );
  const visibleLeadColumnCount = leadColumnOptions.filter(column => visibleLeadColumnIds.has(column.id)).length;

  useEffect(() => {
    setLeadCurrentPage(1);
  }, [searchTerm, dynamicFilters, insightFilters, customFieldFilters, advancedFilters]);

  const selectedLead = selectedLeadId
    ? leads.find(lead => lead.id === selectedLeadId) || null
    : null;

  const leadRepositoryFolders = selectedLead
    ? getCustomerRepositoryFolders(selectedLead).filter(folder => folder.active !== false)
    : [];
  const activeLeadRepositoryFolder = leadRepositoryFolders.find(folder => folder.id === activeLeadFolderId)
    || leadRepositoryFolders[0];
  const activeLeadRepositoryFiles = selectedLead && activeLeadRepositoryFolder
    ? (selectedLead.files || []).filter(file => resolveCustomerFileFolderId(file, leadRepositoryFolders) === activeLeadRepositoryFolder.id)
    : [];

  useEffect(() => {
    if (!selectedLead) return;
    const folders = getCustomerRepositoryFolders(selectedLead).filter(folder => folder.active !== false);
    const defaultFolderId = folders.find(folder => folder.id === 'contracts')?.id || folders[0]?.id || '';
    setActiveLeadFolderId(defaultFolderId);
    setNewLeadFolderName('');
    setRenamingLeadFolderId('');
    setLeadRepositoryFile('');
    setLeadRepositoryFileName('');
    setLeadRepositoryFileLink('');
  }, [selectedLeadId]);

  const scheduleLead = scheduleLeadId
    ? leads.find(lead => lead.id === scheduleLeadId) || null
    : null;

  const updateForm = <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => {
    if (field === 'taxCode') setTaxCodeSaveError('');
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const editingLead = editingLeadId
    ? leads.find(lead => lead.id === editingLeadId) || null
    : null;
  const convertingCandidate = convertingCandidateId
    ? candidates.find(candidate => candidate.id === convertingCandidateId) || null
    : null;
  const isTaxCodeLocked = Boolean(
    (editingLeadId && normalizeTaxCode(editingLead?.taxCode))
    || (convertingCandidateId && normalizeTaxCode(convertingCandidate?.taxCode))
  );
  const taxCodeConflict = useMemo(() => findTaxCodeConflict(
    form.taxCode,
    leads,
    customers,
    editingLeadId,
    editingLead?.convertedCustomerId || ''
  ), [customers, editingLead?.convertedCustomerId, editingLeadId, form.taxCode, leads]);
  const candidateTaxCodeConflict = useMemo(() => {
    const normalizedTaxCode = normalizeTaxCode(form.taxCode);
    if (!normalizedTaxCode) return null;
    const excludedCandidateId = convertingCandidateId || editingLead?.sourceCandidateId || '';
    return candidates.find(candidate => (
      candidate.id !== excludedCandidateId
      && normalizeTaxCode(candidate.taxCode) === normalizedTaxCode
    )) || null;
  }, [candidates, convertingCandidateId, editingLead?.sourceCandidateId, form.taxCode]);

  const describeTaxCodeConflict = (conflict: TaxCodeConflictRecord): string => {
    const saleName = conflict.assignedSaleName
      || users.find(user => user.uid === conflict.assignedSaleId)?.displayName
      || 'Sale khác';
    const profileType = conflict.recordType === 'customer' ? 'khách hàng CRM' : 'khách hàng tiềm năng';
    return `Mã số thuế này đã thuộc ${profileType} “${conflict.companyName}” và đang do ${saleName} phụ trách.`;
  };

  const openCreateForm = () => {
    setEditingLeadId('');
    setConvertingCandidateId('');
    setFormFilterValues({});
    setFormProfileValues({});
    setCustomFieldValues({});
    setUploadingFiles([]);
    setForm(createEmptyForm(currentUser, saleUsers));
    setTaxCodeSaveError('');
    setLeadDetailTab('profile');
    enterLeadProfileHistory();
    setShowLeadForm(true);
  };

  const openEditForm = useCallback((lead: LeadRecord, initialTab: LeadDetailTab = 'classification') => {
    const leadIndustryDefinition = customFieldDefinitions.find(definition => definition.section === 'company' && normalizeSearchText(definition.name) === 'nganh nghe');
    const legacyIndustry = leadIndustryDefinition && lead.customFieldValues?.[leadIndustryDefinition.id] !== undefined
      ? formatEntityCustomFieldValue(leadIndustryDefinition, lead.customFieldValues[leadIndustryDefinition.id])
      : '';
    setSelectedLeadId(lead.id);
    setEditingLeadId(lead.id);
    setConvertingCandidateId('');
    setFormFilterValues(getLeadFilterValues(lead, filterDefinitions));
    setFormProfileValues(lead.profileValues || {});
    setCustomFieldValues(lead.customFieldValues || {});
    setUploadingFiles(lead.files || []);
    setTaxCodeSaveError('');
    setLeadDetailTab(initialTab);
    setForm({
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      contactPosition: lead.contactPosition || '',
      phone: lead.phone,
      email: lead.email,
      website: lead.website || '',
      businessSector: lead.businessSector || '',
      industry: lead.industry || legacyIndustry,
      taxCode: lead.taxCode,
      address: lead.address,
      province: lead.province,
      ward: lead.ward || '',
      industrialPark: lead.industrialPark || '',
      companySize: lead.companySize,
      source: lead.source,
      sourceUrl: lead.sourceUrl || '',
      potentialValue: lead.potentialValue,
      expectedProducts: lead.expectedProducts,
      closingProbability: lead.closingProbability || 0,
      expectedCloseAt: lead.expectedCloseAt || '',
      lastContactResult: lead.lastContactResult || '',
      nextGoal: lead.nextGoal || '',
      careNote: lead.careNote || '',
      stage: lead.stage,
      assignedSaleId: lead.assignedSaleId,
      discoveredById: lead.discoveredById || lead.createdById,
      nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt),
      note: lead.note,
      customerInsightValues: lead.customerInsightValues || []
    });
    enterLeadProfileHistory();
    setShowLeadForm(true);
  }, [customFieldDefinitions, enterLeadProfileHistory, filterDefinitions]);

  const openLeadById = useCallback((leadId: string) => {
    const lead = leads.find(entry => entry.id === leadId);
    if (lead) openEditForm(lead);
  }, [leads, openEditForm]);

  useEffect(() => {
    if (!initialLeadId) return;
    const lead = leads.find(entry => entry.id === initialLeadId);
    if (!lead) return;
    const timer = window.setTimeout(() => {
      openEditForm(lead);
      onInitialLeadOpened?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialLeadId, leads, onInitialLeadOpened, openEditForm]);

  const saveClassification = async (lead: LeadRecord, values: string[]) => {
    return runMutationAction("LeadsPage.tsx:saveClassification", async () => {
      const canManage = currentUser.role === 'admin'
        || (currentUser.role === 'sale' && lead.assignedSaleId === currentUser.uid);
      if (!canManage) throw new Error('Not allowed to classify this lead');
      const now = new Date().toISOString();
      await requireConfirmedMutation(dbService.updateDocument('leads', lead.id, {
        customerInsightValues: values,
        updatedAt: now,
        updatedBy: currentUser.displayName
      }));
      if (editingLeadId === lead.id) updateForm('customerInsightValues', values);
      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'leads',
        action: 'lead_classification_updated',
        summary: `Cập nhật phân loại ${lead.companyName} · ${values.length}/${CUSTOMER_INSIGHT_ITEMS.length} mục`,
        targetType: 'lead',
        targetId: lead.id,
        targetLabel: lead.companyName
      });

      showSuccessToast("Đã lưu thành công");
    }, lead);
  };

  const openScheduleForm = (lead: LeadRecord) => {
    setScheduleLeadId(lead.id);
    setScheduleForm({
      nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt) || tomorrowAtNine()
    });
    setScheduleError('');
  };

  const closeScheduleForm = () => {
    setScheduleLeadId('');
    setScheduleError('');
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    return runMutationAction("LeadsPage.tsx:handleSaveSchedule", async () => {
      event.preventDefault();
      if (!scheduleLead || !scheduleForm.nextFollowUpAt) return;
      if (!scheduleLead.assignedSaleId) {
        setScheduleError('Vui lòng phân công Sale phụ trách trước khi đặt lịch hẹn.');
        return;
      }

      const nextFollowUpAt = new Date(scheduleForm.nextFollowUpAt).toISOString();
      const now = new Date().toISOString();
      const eventKey = `leads:scheduled:${scheduleLead.id}`;
      const activityNote = `Đặt lịch chăm sóc: ${formatDateTime(nextFollowUpAt)}`;

      setSavingSchedule(true);
      setScheduleError('');
      try {
        await Promise.all([
          requireConfirmedMutation(dbService.updateDocument('leads', scheduleLead.id, {
            reminderTime: nextFollowUpAt,
            nextFollowUpAt,
            followUpHandledAt: '',
            followUpHandledById: '',
            followUpHandledByName: '',
            activities: [{
              id: `activity-schedule-${now}`,
              type: 'schedule',
              note: activityNote,
              occurredAt: now,
              createdById: currentUser.uid,
              createdByName: currentUser.displayName
            }, ...(scheduleLead.activities || [])],
            updatedAt: now,
            updatedBy: currentUser.displayName
          })),
          dbService.addDocument('notifications', {
            id: getNotificationDocumentId(scheduleLead.assignedSaleId, eventKey),
            schemaVersion: NOTIFICATION_SCHEMA_VERSION,
            recipientId: scheduleLead.assignedSaleId,
            module: 'leads',
            eventType: 'lead_follow_up_scheduled',
            eventKey,
            entityId: scheduleLead.id,
            entityCode: scheduleLead.companyName,
            title: 'Lịch chăm sóc Lead mới',
            message: `${scheduleLead.companyName} được hẹn chăm sóc vào ${formatDateTime(nextFollowUpAt)}.`,
            createdAt: now,
            createdById: currentUser.uid,
            source: 'manual',
            readAt: null
          })
        ]);

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'leads',
          action: 'lead_follow_up_scheduled',
          summary: `Đặt lịch chăm sóc Lead ${scheduleLead.companyName}`,
          targetType: 'lead',
          targetId: scheduleLead.id,
          targetLabel: scheduleLead.companyName,
          changes: [{ field: 'nextFollowUpAt', label: 'Lịch chăm sóc', before: scheduleLead.nextFollowUpAt, after: nextFollowUpAt }]
        });
        closeScheduleForm();

        showSuccessToast("Đã lưu thành công");
      } catch (error) {
        showErrorToast();
        console.error('[Leads] Could not save follow-up schedule.', error);
        setScheduleError('Không thể lưu lịch hẹn. Vui lòng thử lại.');
      } finally {
        setSavingSchedule(false);
      }
    }, event);
  };

  const openCreateFormFromCandidate = useCallback((candidate: LeadCandidateRecord) => {
    setEditingLeadId('');
    setConvertingCandidateId(candidate.id);
    setUploadingFiles(Array.isArray(candidate.files) ? candidate.files.flatMap((value, index) => {
      if (!value || typeof value !== 'object') return [];
      const file = value as Record<string, unknown>;
      const name = String(file.name || file.fileName || '');
      if (!name) return [];
      return [{
        id: String(file.id || `candidate-file-${index}`),
        name,
        size: Number(file.size) || 0,
        folderId: String(file.folderId || 'other'),
        folder: String(file.folder || 'Tài liệu khác'),
        url: String(file.url || file.fileUrl || ''),
        data: String(file.data || file.base64 || ''),
        createdAt: String(file.createdAt || ''),
        createdById: String(file.createdById || ''),
        createdBy: String(file.createdBy || '')
      } satisfies LeadFileRecord];
    }) : []);
    setFormProfileValues({});
    const sharedCustomValues = { ...(candidate.customFieldValues || {}) };
    const rawDefinitions = allCustomFieldDefinitions.filter(definition => definition.table === 'lead_candidates' && !definition.removed);
    const rawIndustryDefinition = rawDefinitions.find(definition => definition.section === 'company' && normalizeSearchText(definition.name) === 'nganh nghe');
    const rawIndustry = rawIndustryDefinition && candidate.customFieldValues?.[rawIndustryDefinition.id] !== undefined
      ? formatEntityCustomFieldValue(rawIndustryDefinition, candidate.customFieldValues[rawIndustryDefinition.id])
      : '';
    for (const leadDefinition of customFieldDefinitions) {
      const rawDefinition = rawDefinitions.find(definition => (
        definition.section === leadDefinition.section
        && definition.type === leadDefinition.type
        && normalizeSearchText(definition.name) === normalizeSearchText(leadDefinition.name)
      ));
      if (!rawDefinition) continue;
      const rawValue = candidate.customFieldValues?.[rawDefinition.id];
      if (rawValue !== undefined) sharedCustomValues[leadDefinition.id] = rawValue;
    }
    setCustomFieldValues(sharedCustomValues);
    setTaxCodeSaveError('');
    setLeadDetailTab('profile');
    const leadSource = mapCandidateSourceToLeadSource(candidate.source);
    const sourceOptionId = findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.source, leadSource);
    setFormFilterValues({
      [LEAD_FILTER_IDS.source]: sourceOptionId ? [sourceOptionId] : [],
      [LEAD_FILTER_IDS.progress]: ['contacted']
    });
    const assignedSaleId = saleUsers.some(user => user.uid === candidate.assignedSaleId)
      ? candidate.assignedSaleId
      : '';
    setForm({
      ...createEmptyForm(currentUser, saleUsers),
      companyName: candidate.companyName,
      contactPerson: candidate.contactPerson,
      contactPosition: candidate.contactPosition || '',
      phone: candidate.phone,
      email: candidate.email,
      website: candidate.website || '',
      businessSector: candidate.businessSector || '',
      industry: String(candidate.industry || rawIndustry),
      taxCode: candidate.taxCode,
      address: candidate.address,
      province: candidate.province,
      ward: candidate.ward || '',
      industrialPark: candidate.industrialPark || '',
      source: leadSource,
      sourceUrl: candidate.sourceUrl || '',
      stage: 'contacted',
      assignedSaleId,
      discoveredById: candidate.discoveredById || candidate.createdById,
      nextFollowUpAt: toDateTimeLocal(candidate.queuedNextContactAt || candidate.nextContactAt),
      expectedProducts: candidate.expectedProducts || '',
      lastContactResult: candidate.lastContactNote || '',
      note: candidate.note || '',
      customerInsightValues: candidate.customerInsightValues || []
    });
    enterLeadProfileHistory();
    setShowLeadForm(true);
  }, [allCustomFieldDefinitions, currentUser, customFieldDefinitions, enterLeadProfileHistory, filterDefinitions, saleUsers]);

  useEffect(() => {
    if (!initialCandidate) return;
    const timer = window.setTimeout(() => {
      setWorkspaceTab('list');
      openCreateFormFromCandidate(initialCandidate);
      onInitialCandidateConsumed?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialCandidate, onInitialCandidateConsumed, openCreateFormFromCandidate]);

  const closeLeadForm = () => {
    if (leadProfileHistoryActive.current) {
      window.history.back();
      return;
    }
    setShowLeadForm(false);
    setSelectedLeadId('');
    setEditingLeadId('');
    setConvertingCandidateId('');
    setLeadDetailTab('classification');
  };

  const handleLeadFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const oversizedFile = files.find(file => file.size > 900_000);
    if (oversizedFile) {
      window.alert(t('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.'));
      event.target.value = '';
      return;
    }
    const nextFiles = await Promise.all(files.map(file => new Promise<LeadFileRecord>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: `lead-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    setUploadingFiles(previous => [...previous, ...nextFiles]);
    event.target.value = '';
  };

  const handleAddAttachmentLink = () => {
    const name = attachmentLinkName.trim();
    const url = attachmentLinkUrl.trim();
    if (!name || !/^https?:\/\//i.test(url)) {
      window.alert(t('Nhập tên tệp và đường dẫn chia sẻ bắt đầu bằng http:// hoặc https://.'));
      return;
    }
    setUploadingFiles(previous => [...previous, {
      id: `lead-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      folderId: 'other',
      folder: 'Tài liệu khác',
      url,
      data: '',
      createdAt: new Date().toISOString(),
      createdById: currentUser.uid,
      createdBy: currentUser.displayName
    }]);
    setAttachmentLinkName('');
    setAttachmentLinkUrl('');
  };

  const handleLeadRepositoryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 900_000) {
      window.alert(t('Tệp lớn hơn 900 KB. Vui lòng lưu trên Google Drive hoặc OneDrive và dùng đường dẫn chia sẻ.'));
      event.target.value = '';
      return;
    }
    setLeadRepositoryFileName(file.name);
    const reader = new FileReader();
    reader.onload = loadEvent => setLeadRepositoryFile(String(loadEvent.target?.result || ''));
    reader.readAsDataURL(file);
  };

  const handleAddLeadRepositoryFolder = async () => {
    return runMutationAction("LeadsPage.tsx:handleAddLeadRepositoryFolder", async () => {
      if (!selectedLead || currentUser.role !== 'admin') return;
      const name = newLeadFolderName.trim();
      if (!name) return;
      const folders = getCustomerRepositoryFolders(selectedLead);
      if (folders.some(folder => folder.name.trim().toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'))) {
        window.alert(t('Thư mục này đã tồn tại.'));
        return;
      }
      const now = new Date().toISOString();
      const newFolder: CustomerRepositoryFolder = {
        id: createCustomerFolderId(name, folders.map(folder => folder.id)),
        name,
        parentId: null,
        order: Math.max(0, ...folders.map(folder => Number(folder.order) || 0)) + 10,
        active: true,
        createdAt: now,
        createdById: currentUser.uid,
        updatedAt: '',
        updatedById: ''
      };
      await requireConfirmedMutation(dbService.updateDocument('leads', selectedLead.id, {
        fileFolders: [...folders, newFolder],
        updatedAt: now,
        updatedBy: currentUser.displayName
      }));
      setNewLeadFolderName('');
      setActiveLeadFolderId(newFolder.id);

      showSuccessToast("Đã thêm thành công");
    }, undefined);
  };

  const handleRenameLeadRepositoryFolder = async (folderId: string) => {
    return runMutationAction("LeadsPage.tsx:handleRenameLeadRepositoryFolder", async () => {
      if (!selectedLead || currentUser.role !== 'admin') return;
      const name = leadFolderNameDraft.trim();
      if (!name) return;
      const folders = getCustomerRepositoryFolders(selectedLead);
      if (folders.some(folder => folder.id !== folderId && folder.name.trim().toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN'))) {
        window.alert(t('Tên thư mục này đã tồn tại.'));
        return;
      }
      const now = new Date().toISOString();
      const nextFolders = folders.map(folder => folder.id === folderId ? {
        ...folder,
        name,
        updatedAt: now,
        updatedById: currentUser.uid
      } : folder);
      await requireConfirmedMutation(dbService.updateDocument('leads', selectedLead.id, {
        fileFolders: nextFolders,
        updatedAt: now,
        updatedBy: currentUser.displayName
      }));
      setRenamingLeadFolderId('');
      setLeadFolderNameDraft('');

      showSuccessToast("Đã lưu thành công");
    }, folderId);
  };

  const handleUploadLeadRepositoryFile = async (event: React.FormEvent) => {
    return runMutationAction("LeadsPage.tsx:handleUploadLeadRepositoryFile", async () => {
      event.preventDefault();
      if (!selectedLead || !activeLeadRepositoryFolder) return;
      const link = leadRepositoryFileLink.trim();
      if ((!leadRepositoryFile && !link) || !leadRepositoryFileName.trim()) {
        window.alert(t('Vui lòng nhập tên và chọn tệp hoặc đường dẫn chia sẻ.'));
        return;
      }
      if (link && !/^https?:\/\//i.test(link)) {
        window.alert(t('Đường dẫn chia sẻ phải bắt đầu bằng http:// hoặc https://.'));
        return;
      }
      const now = new Date().toISOString();
      const file: LeadFileRecord = {
        id: `lead-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: leadRepositoryFileName.trim(),
        folderId: activeLeadRepositoryFolder.id,
        folder: activeLeadRepositoryFolder.name,
        url: link,
        data: leadRepositoryFile,
        createdAt: now,
        createdById: currentUser.uid,
        createdBy: currentUser.displayName
      };
      await requireConfirmedMutation(dbService.updateDocument('leads', selectedLead.id, {
        files: [...(selectedLead.files || []), file],
        fileFolders: getCustomerRepositoryFolders(selectedLead),
        updatedAt: now,
        updatedBy: currentUser.displayName
      }));
      setUploadingFiles(previous => [...previous.filter(entry => entry.id !== file.id), file]);
      setLeadRepositoryFile('');
      setLeadRepositoryFileName('');
      setLeadRepositoryFileLink('');

      showSuccessToast("Đã lưu thành công");
    }, event);
  };

  const handleDeleteLeadRepositoryFile = async (fileId: string) => {
    return runMutationAction("LeadsPage.tsx:handleDeleteLeadRepositoryFile", async () => {
      if (!selectedLead || (currentUser.role !== 'admin' && currentUser.role !== 'sale')) return;
      if (!(await confirmDelete(t('Bạn có chắc chắn muốn xóa tệp này khỏi kho lưu trữ?')))) return;
      await requireConfirmedMutation(dbService.updateDocument('leads', selectedLead.id, {
        files: (selectedLead.files || []).filter(file => file.id !== fileId),
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName
      }));
      setUploadingFiles(previous => previous.filter(file => file.id !== fileId));

      showSuccessToast("Đã xóa thành công");
    }, fileId);
  };

  const handleDeleteLeadRepositoryFolder = async (folderId: string) => {
    return runMutationAction("LeadsPage.tsx:handleDeleteLeadRepositoryFolder", async () => {
      if (!selectedLead || currentUser.role !== 'admin') return;
      const folders = getCustomerRepositoryFolders(selectedLead);
      const folder = folders.find(item => item.id === folderId);
      if (!folder) return;
      if ((selectedLead.files || []).some(file => resolveCustomerFileFolderId(file, folders) === folderId)) {
        window.alert(t('Không thể xóa thư mục đang có tài liệu. Hãy chuyển hoặc xóa tài liệu bên trong trước.'));
        return;
      }
      if (folders.length === 1) {
        window.alert(t('Kho lưu trữ phải có ít nhất một thư mục.'));
        return;
      }
      if (!(await confirmDelete(`${t('Xóa thư mục')} “${folder.name}”?`))) return;
      const nextFolders = folders.filter(item => item.id !== folderId);
      await requireConfirmedMutation(dbService.updateDocument('leads', selectedLead.id, {
        fileFolders: nextFolders,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName
      }));
      setActiveLeadFolderId(nextFolders[0]?.id || '');

      showSuccessToast("Đã xóa thành công");
    }, folderId);
  };

  const handleSaveLead = async (event: React.FormEvent) => {
    return runMutationAction("LeadsPage.tsx:handleSaveLead", async () => {
      event.preventDefault();
      const normalizedTaxCode = normalizeTaxCode(form.taxCode);
      if (!form.companyName.trim() || !normalizedTaxCode) return;
      const missingCustomFields = getMissingRequiredEntityFields(profileFormCustomFieldDefinitions, customFieldValues, currentUser.role);
      if (missingCustomFields.length > 0) {
        setTaxCodeSaveError(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`);
        return;
      }
      const [latestLeadData, latestCustomerData, latestCandidateData] = await Promise.all([
        currentUser.role === 'sale'
          ? dbService.getCollectionByField('leads', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('leads'),
        currentUser.role === 'sale'
          ? dbService.getCollectionByField('customers', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('customers'),
        currentUser.role === 'sale'
          ? dbService.getCollectionByField('lead_candidates', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('lead_candidates')
      ]);
      const latestLeads = latestLeadData as LeadRecord[];
      const latestCandidates = latestCandidateData as LeadCandidateRecord[];
      const conversionCandidate = convertingCandidateId
        ? latestCandidates.find(candidate => candidate.id === convertingCandidateId) || null
        : null;
      const reusableLead = conversionCandidate
        ? latestLeads.find(lead => (
            lead.returnedToRawData
            && (
              lead.id === conversionCandidate.returnedFromLeadId
              || lead.returnedToRawDataCandidateId === conversionCandidate.id
              || normalizeTaxCode(lead.taxCode) === normalizedTaxCode
            )
          )) || null
        : null;
      const latestConflict = findTaxCodeConflict(
        form.taxCode,
        latestLeads,
        latestCustomerData as CustomerRecord[],
        editingLeadId || reusableLead?.id || '',
        editingLead?.convertedCustomerId || ''
      );
      if (latestConflict) {
        setTaxCodeSaveError(describeTaxCodeConflict(latestConflict));
        return;
      }
      const latestCandidateConflict = findCandidateDuplicate(
        {
          companyName: form.companyName,
          phone: form.phone,
          taxCode: normalizedTaxCode
        },
        latestCandidates,
        [],
        [],
        convertingCandidateId || editingLead?.sourceCandidateId || ''
      );
      if (latestCandidateConflict?.reason === 'taxCode') {
        setTaxCodeSaveError(`Mã số thuế này đang nằm trong Dữ liệu khách hàng của doanh nghiệp “${latestCandidateConflict.companyName}”.`);
        return;
      }

      const assignedSale = saleUsers.find(user => user.uid === form.assignedSaleId);
      const discoveredById = form.discoveredById
        || (currentUser.role === 'sale' ? currentUser.uid : form.assignedSaleId);
      const discoveredBy = saleUsers.find(user => user.uid === discoveredById);
      const currentFilterValues = editingLead
        ? getLeadFilterValues(editingLead, filterDefinitions)
        : {};
      const provinceOptionId = findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.province, form.province);
      const selectedProvinceValues = formFilterValues[LEAD_FILTER_IDS.province] || [];
      const selectedProvince = selectedProvinceValues.length > 0
        ? findLeadFilterParentOption(filterDefinitions, LEAD_FILTER_IDS.province, selectedProvinceValues.at(-1) || '')
        : undefined;
      const provinceFilterValues = selectedProvince?.id === provinceOptionId
        ? selectedProvinceValues
        : [provinceOptionId].filter(Boolean);
      const industrialParkOptionId = findLeadFilterOptionId(
        filterDefinitions,
        LEAD_FILTER_IDS.industrialPark,
        form.industrialPark
      );
      const profileFilterValues = {
        ...currentFilterValues,
        ...formFilterValues,
        [LEAD_FILTER_IDS.companySize]: form.companySize ? [form.companySize] : [],
        [LEAD_FILTER_IDS.province]: provinceFilterValues,
        [LEAD_FILTER_IDS.industrialPark]: [industrialParkOptionId].filter(Boolean),
        [LEAD_FILTER_IDS.source]: [findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.source, form.source)].filter(Boolean)
      };
      const now = new Date().toISOString();
      const payload = {
        name: form.companyName.trim(),
        companyName: form.companyName.trim(),
        contactPerson: form.contactPerson.trim(),
        contactPosition: form.contactPosition.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        businessSector: form.businessSector.trim(),
        industry: form.industry.trim(),
        taxCode: normalizedTaxCode,
        address: form.address.trim(),
        province: form.province.trim(),
        ward: form.ward.trim(),
        industrialPark: form.industrialPark.trim(),
        companySize: form.companySize,
        source: form.source,
        sourceUrl: form.sourceUrl.trim(),
        potentialValue: Number(form.potentialValue),
        expectedProducts: form.expectedProducts.trim(),
        closingProbability: Number(form.closingProbability),
        expectedCloseAt: form.expectedCloseAt,
        lastContactResult: form.lastContactResult.trim(),
        nextGoal: form.nextGoal.trim(),
        careNote: form.careNote.trim(),
        customerInsightValues: form.customerInsightValues,
        stage: form.stage,
        filterValues: profileFilterValues,
        profileValues: formProfileValues,
        customFieldValues,
        assignedSaleId: form.assignedSaleId,
        assignedSaleName: assignedSale?.displayName || '',
        discoveredById,
        discoveredByName: discoveredBy?.displayName || currentUser.displayName,
        sourceCandidateId: convertingCandidateId || editingLead?.sourceCandidateId || '',
        reminderTime: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : '',
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : '',
        followUpHandledAt: form.nextFollowUpAt ? '' : (editingLead?.followUpHandledAt || ''),
        followUpHandledById: form.nextFollowUpAt ? '' : (editingLead?.followUpHandledById || ''),
        followUpHandledByName: form.nextFollowUpAt ? '' : (editingLead?.followUpHandledByName || ''),
        note: form.note.trim(),
        files: uploadingFiles,
        updatedAt: now,
        updatedBy: currentUser.displayName
      };

      let savedLeadId = editingLeadId;
      if (editingLeadId) {
        await requireConfirmedMutation(dbService.updateDocument('leads', editingLeadId, payload));
      } else if (reusableLead) {
        savedLeadId = reusableLead.id;
        await requireConfirmedMutation(dbService.updateDocument('leads', reusableLead.id, {
          ...payload,
          returnedToRawData: false,
          returnedToRawDataAt: '',
          returnedToRawDataCandidateId: '',
          returnedToRawDataById: '',
          returnedToRawDataByName: '',
          activities: [{
            id: `activity-returned-to-lead-${now}`,
            type: 'returned_to_lead',
            note: 'Tiếp nhận lại từ Dữ liệu thô',
            occurredAt: now,
            createdById: currentUser.uid,
            createdByName: currentUser.displayName
          }, ...(reusableLead.activities || [])]
        }));
      } else {
        try {
          const createdLead = await dbService.addDocumentIfAbsent(
            'leads',
            createLeadDocumentIdFromTaxCode(normalizedTaxCode),
            {
              ...payload,
              activities: [{
                id: `activity-${now}`,
                type: 'created',
                note: 'Khởi tạo khách hàng tiềm năng',
                occurredAt: now,
                createdById: currentUser.uid,
                createdByName: currentUser.displayName
              }],
              createdAt: now,
              createdById: currentUser.uid
            }
          );
          savedLeadId = createdLead.id;
        } catch (error) {
          if (!isDocumentAlreadyExistsError(error)) {
            setTaxCodeSaveError('Không thể xác minh mã số thuế trên hệ thống. Lead chưa được lưu; vui lòng thử lại.');
            return;
          }
          const existingLead = (error as { existingDocument?: LeadRecord }).existingDocument;
          setTaxCodeSaveError(existingLead
            ? describeTaxCodeConflict({
                id: existingLead.id,
                recordType: 'lead',
                companyName: existingLead.companyName,
                assignedSaleId: existingLead.assignedSaleId,
                assignedSaleName: existingLead.assignedSaleName
              })
            : 'Mã số thuế này vừa được một Sale khác đăng ký. Vui lòng kiểm tra lại.');
          return;
        }
      }

      if (convertingCandidateId && savedLeadId) {
        const candidate = candidates.find(item => item.id === convertingCandidateId);
        const conversionLog = {
          id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          occurredAt: now,
          outcome: 'task_completed' as const,
          eventType: 'activity' as const,
          activityType: 'note' as const,
          contactResult: '' as const,
          potentialLevel: '' as const,
          description: `Chuyển thành Lead ${savedLeadId}`,
          note: '',
          nextContactAt: '',
          createdById: currentUser.uid,
          createdByName: currentUser.displayName
        };
        await requireConfirmedMutation(dbService.updateDocument('lead_candidates', convertingCandidateId, {
          status: 'converted',
          convertedLeadId: savedLeadId,
          convertedAt: now,
          lastContactAt: now,
          contactAttempts: (candidate?.contactAttempts || 0) + 1,
          nextContactAt: '',
          queuedNextContactAt: '',
          taskStatus: 'dismissed',
          workStatus: 'completed',
          workQueueHidden: true,
          taskDismissedAt: now,
          contactLogs: [conversionLog, ...(candidate?.contactLogs || [])].slice(0, 50),
          updatedBy: currentUser.displayName
        }));
      }

      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'leads',
        action: editingLeadId ? 'lead_updated' : 'lead_created',
        summary: `${editingLeadId ? 'Cập nhật' : 'Tạo'} Lead ${form.companyName.trim()}`,
        targetType: 'lead',
        targetId: savedLeadId || '',
        targetLabel: form.companyName.trim()
      });
      if (convertingCandidateId) {
        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'lead_candidates',
          action: 'candidate_converted_to_lead',
          summary: `Chuyển dữ liệu khách hàng thành Lead ${form.companyName.trim()}`,
          targetType: 'lead_candidate',
          targetId: convertingCandidateId,
          targetLabel: form.companyName.trim()
        });
      }

      closeLeadForm();

      showSuccessToast(editingLeadId ? 'Đã lưu thành công' : 'Đã thêm thành công');
    }, event);
  };

  const findDuplicateCustomer = (lead: LeadRecord) => {
    const companyName = lead.companyName.trim().toLowerCase();
    const phone = lead.phone.replace(/\s/g, '');
    const taxCode = lead.taxCode.replace(/\s/g, '');
    return customers.find(customer => (
      (companyName && customer.companyName.trim().toLowerCase() === companyName)
      || (phone && customer.phone.replace(/\s/g, '') === phone)
      || (taxCode && customer.taxCode.replace(/\s/g, '') === taxCode)
    ));
  };

  const handleConvertLead = (lead: LeadRecord) => {
    const duplicate = findDuplicateCustomer(lead);
    if (duplicate) {
      window.alert(`Khách hàng có thể đã tồn tại trong CRM: ${duplicate.companyName} (${duplicate.customerCode || duplicate.id}).`);
      return;
    }
    if (!window.confirm(`Mở biểu mẫu khách hàng và đơn đầu tiên cho "${lead.companyName}"?`)) return;
    onConvertLead(lead);
  };

  const handleReturnLeadToRawData = async (lead: LeadRecord) => {
    return runMutationAction("LeadsPage.tsx:handleReturnLeadToRawData", async () => {
      const canManage = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
      if (!canManage || lead.stage === 'converted' || lead.convertedCustomerId) return;
      if (!window.confirm(`Chuyển Lead “${lead.companyName}” về Dữ liệu thô? Lead sẽ rời danh sách tiềm năng và có thể được tiếp nhận lại sau.`)) return;

      setReturningLeadId(lead.id);
      try {
        const latestCandidates = await (currentUser.role === 'sale'
          ? dbService.getCollectionByField('lead_candidates', 'assignedSaleId', currentUser.uid, { maxResults: 10000 })
          : dbService.getCollection('lead_candidates')) as LeadCandidateRecord[];
        const linkedCandidate = latestCandidates.find(candidate => (
          candidate.id === lead.sourceCandidateId
          || candidate.convertedLeadId === lead.id
          || candidate.returnedFromLeadId === lead.id
        )) || null;
        const duplicate = findCandidateDuplicate(
          {
            companyName: lead.companyName,
            phone: lead.phone,
            taxCode: lead.taxCode
          },
          latestCandidates,
          [],
          customers,
          linkedCandidate?.id || ''
        );
        if (duplicate) {
          const duplicateType = duplicate.recordType === 'customer' ? 'Khách hàng' : 'Dữ liệu thô';
          window.alert(`${duplicateType} “${duplicate.companyName}” đã tồn tại. Vui lòng kiểm tra trước khi chuyển.`);
          return;
        }

        const now = new Date().toISOString();
        const nextContactAt = lead.nextFollowUpAt || '';
        const returnLog = {
          id: `activity-returned-from-lead-${now}`,
          occurredAt: now,
          outcome: 'not_contacted' as const,
          eventType: 'activity' as const,
          activityType: 'note' as const,
          contactResult: 'not_contacted' as const,
          potentialLevel: '' as const,
          description: `Chuyển về Dữ liệu thô từ Lead ${lead.id}`,
          note: '',
          nextContactAt,
          createdById: currentUser.uid,
          createdByName: currentUser.displayName
        };
        const candidatePayload = {
          schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
          companyName: lead.companyName.trim(),
          contactPerson: lead.contactPerson.trim(),
          contactPosition: (lead.contactPosition || '').trim(),
          phone: lead.phone.trim(),
          email: lead.email.trim(),
          taxCode: normalizeTaxCode(lead.taxCode),
          address: lead.address.trim(),
          province: lead.province.trim(),
          ward: (lead.ward || '').trim(),
          industrialPark: (lead.industrialPark || '').trim(),
          website: (lead.website || '').trim(),
          businessSector: (lead.businessSector || '').trim(),
          industry: (lead.industry || '').trim(),
          expectedProducts: (lead.expectedProducts || '').trim(),
          files: lead.files || [],
          source: linkedCandidate?.source || mapLeadSourceToCandidateSource(lead.source),
          sourceUrl: lead.sourceUrl || linkedCandidate?.sourceUrl || '',
          note: lead.note.trim(),
          status: 'new' as const,
          assignedSaleId: lead.assignedSaleId,
          assignedSaleName: lead.assignedSaleName,
          discoveredById: lead.discoveredById || lead.createdById,
          discoveredByName: lead.discoveredByName || currentUser.displayName,
          nextContactAt,
          queuedNextContactAt: '',
          taskStatus: nextContactAt ? 'pending' as const : 'dismissed' as const,
          taskSource: nextContactAt ? 'sale_created' as const : '' as const,
          taskAssignedAt: nextContactAt ? now : '',
          taskAssignedById: nextContactAt ? currentUser.uid : '',
          taskAssignedByName: nextContactAt ? currentUser.displayName : '',
          taskCompletedAt: '',
          taskCompletedById: '',
          taskCompletedByName: '',
          taskDismissedAt: '',
          workQueueHidden: !nextContactAt,
          workStatus: nextContactAt ? 'pending' as const : 'not_contacted' as const,
          archived: false,
          archivedAt: '',
          archivedById: '',
          archivedByName: '',
          convertedLeadId: '',
          convertedAt: '',
          returnedFromLeadId: lead.id,
          updatedBy: currentUser.displayName
        };

        let candidateId = linkedCandidate?.id || '';
        if (linkedCandidate) {
          await requireConfirmedMutation(dbService.updateDocument('lead_candidates', linkedCandidate.id, {
            ...candidatePayload,
            contactLogs: [returnLog, ...(linkedCandidate.contactLogs || [])].slice(0, 50)
          }));
        } else {
          const createPayload = {
            ...candidatePayload,
            contactAttempts: 0,
            lastContactAt: '',
            lastContactOutcome: '',
            lastContactNote: '',
            contactLogs: [returnLog],
            contactResult: 'not_contacted' as const,
            potentialLevel: 'unrated' as const,
            pinned: false,
            createdAt: now,
            createdById: currentUser.uid,
            createdByName: currentUser.displayName
          };
          const createdCandidate = candidatePayload.taxCode
            ? await dbService.addDocumentIfAbsent(
                'lead_candidates',
                createCandidateDocumentIdFromTaxCode(candidatePayload.taxCode),
                createPayload
              )
            : await dbService.addDocument('lead_candidates', createPayload);
          candidateId = createdCandidate.id;
        }

        await requireConfirmedMutation(dbService.updateDocument('leads', lead.id, {
          returnedToRawData: true,
          returnedToRawDataAt: now,
          returnedToRawDataCandidateId: candidateId,
          returnedToRawDataById: currentUser.uid,
          returnedToRawDataByName: currentUser.displayName,
          reminderTime: '',
          nextFollowUpAt: '',
          activities: [{
            id: `activity-returned-to-raw-data-${now}`,
            type: 'returned_to_raw_data',
            note: `Chuyển về Dữ liệu thô (${candidateId})`,
            occurredAt: now,
            createdById: currentUser.uid,
            createdByName: currentUser.displayName
          }, ...(lead.activities || [])],
          updatedBy: currentUser.displayName
        }));

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'leads',
          action: 'lead_returned_to_raw_data',
          summary: `Chuyển Lead ${lead.companyName} về Dữ liệu thô`,
          targetType: 'lead',
          targetId: lead.id,
          targetLabel: lead.companyName,
          changes: [{ field: 'returnedToRawDataCandidateId', label: 'Dữ liệu thô', after: candidateId }]
        });
        setSelectedLeadId('');
        setEditingLeadId('');
        setShowLeadForm(false);
        onNavigateToCustomerData();

        showSuccessToast("Đã lưu thành công");
      } catch (error) {
        showErrorToast();
        console.error('[Leads] Could not return lead to raw data.', error);
        window.alert(isDocumentAlreadyExistsError(error)
          ? 'Doanh nghiệp này vừa được tạo trong Dữ liệu thô. Vui lòng kiểm tra lại danh sách.'
          : 'Không thể chuyển Lead về Dữ liệu thô. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.');
      } finally {
        setReturningLeadId('');
      }
    }, lead);
  };

  const handleMarkFollowUpHandled = async (lead: LeadRecord) => {
    return runMutationAction("LeadsPage.tsx:handleMarkFollowUpHandled", async () => {
      if (!lead.nextFollowUpAt || !Number.isFinite(getLeadScheduleTime(lead))) return;
      const canHandle = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
      if (!canHandle) return;

      const now = new Date().toISOString();
      const handledSchedule = lead.nextFollowUpAt;
      try {
        await requireConfirmedMutation(dbService.updateDocument('leads', lead.id, {
          reminderTime: '',
          nextFollowUpAt: '',
          lastFollowUpAt: handledSchedule,
          followUpHandledAt: now,
          followUpHandledById: currentUser.uid,
          followUpHandledByName: currentUser.displayName,
          activities: [{
            id: `activity-follow-up-handled-${now}`,
            type: 'follow_up_handled',
            note: `Đã xử lý lịch chăm sóc ${formatDateTime(handledSchedule)}`,
            occurredAt: now,
            createdById: currentUser.uid,
            createdByName: currentUser.displayName
          }, ...(lead.activities || [])],
          updatedAt: now,
          updatedBy: currentUser.displayName
        }));

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'leads',
          action: 'lead_follow_up_handled',
          summary: `Đã xử lý lịch chăm sóc Lead ${lead.companyName}`,
          targetType: 'lead',
          targetId: lead.id,
          targetLabel: lead.companyName,
          changes: [{ field: 'nextFollowUpAt', label: 'Lịch chăm sóc', before: handledSchedule, after: 'Đã xử lý' }]
        });

        showSuccessToast("Đã lưu thành công");
      } catch (error) {
        showErrorToast();
        console.error('[Leads] Could not mark follow-up as handled.', error);
        window.alert('Không thể đánh dấu lịch chăm sóc đã xử lý. Vui lòng thử lại.');
      }
    }, lead);
  };

  const handleDeleteLead = async (lead: LeadRecord) => {
    return runMutationAction("LeadsPage.tsx:handleDeleteLead", async () => {
      const canDelete = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
      if (!canDelete) return;
      if (!(await confirmDelete(`Đưa Lead “${lead.companyName}” vào Thùng rác?`))) return;

      const now = new Date().toISOString();
      try {
        await requireConfirmedMutation(dbService.updateDocument('leads', lead.id, {
          deleted: true,
          deletedAt: now,
          deletedById: currentUser.uid,
          deletedByName: currentUser.displayName,
          updatedAt: now,
          updatedBy: currentUser.displayName
        }));
        if (selectedLeadId === lead.id) setSelectedLeadId('');
        if (editingLeadId === lead.id) setShowLeadForm(false);

        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'leads',
          action: 'lead_deleted',
          summary: `Đưa Lead ${lead.companyName} vào Thùng rác`,
          targetType: 'lead',
          targetId: lead.id,
          targetLabel: lead.companyName
        });

        showSuccessToast("Đã xóa Lead");
      } catch (error) {
        showErrorToast();
        console.error('[Leads] Could not delete lead.', error);
        window.alert('Không thể xóa Lead. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.');
      }
    }, lead);
  };

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setDynamicFilters({});
    setInsightFilters([]);
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setOverviewSelection(null);
    setOverviewDrilldown(null);
    setLeadCurrentPage(1);
  }, []);

  const openOverviewList = useCallback((selection: LeadOverviewSelection | null) => {
    clearFilters();
    setOverviewDrilldown({
      label: selection ? LEAD_OVERVIEW_LABELS[selection] : 'Tổng KH tiềm năng',
      ids: overviewLeads
        .filter(lead => !selection || matchesLeadOverviewSelection(lead, selection, filterDefinitions))
        .map(lead => lead.id)
    });
    setLeadListPrepared(true);
    setWorkspaceTab('list');
  }, [clearFilters, filterDefinitions, overviewLeads]);

  const openOverviewDrilldown = useCallback((label: string, matchingLeads: LeadRecord[]) => {
    clearFilters();
    setOverviewDrilldown({ label, ids: matchingLeads.map(lead => lead.id) });
    setLeadListPrepared(true);
    setWorkspaceTab('list');
  }, [clearFilters]);

  const handleOverviewMetricClick = useCallback((key: string | null) => {
    openOverviewList(key as LeadOverviewSelection | null);
  }, [openOverviewList]);

  const openLeadListTab = () => {
    setOverviewSelection(null);
    setOverviewDrilldown(null);
    setLeadListPrepared(true);
    setWorkspaceTab('list');
  };

  const overviewCards = useMemo<Array<{ key: LeadOverviewSelection | null; label: string; count: number }>>(() => [
    { key: null, label: 'Tổng KH tiềm năng', count: leadOverview.total },
    { key: 'quoted', label: 'Đã gửi báo giá', count: leadOverview.quoted },
    { key: 'pending', label: 'Đang chờ chốt', count: leadOverview.pending },
    { key: 'won', label: 'Đã chốt', count: leadOverview.won },
    { key: 'lost', label: 'Không thành công', count: leadOverview.lost },
    { key: 'converted', label: 'Đã thành khách hàng', count: leadOverview.converted }
  ], [leadOverview]);

  const getClassificationLabel = (lead: LeadRecord, fieldId: string, fallback = '—') => {
    const optionIds = getLeadFilterValues(lead, filterDefinitions)[fieldId] || [];
    const labels = optionIds
      .map(optionId => findLeadFilterOption(filterDefinitions, fieldId, optionId)?.label)
      .filter(Boolean);
    return (fieldId === LEAD_FILTER_IDS.province ? labels.join(' · ') : labels[0]) || fallback;
  };

  const renderFollowUp = (lead: LeadRecord) => {
    if (lead.followUpHandledAt) {
      return <span className="lead-follow-up-handled">Đã xử lý</span>;
    }
    if (!lead.nextFollowUpAt || !Number.isFinite(getLeadScheduleTime(lead))) {
      return <span>Chưa đặt lịch</span>;
    }
    const overdue = isOverdue(lead);
    return (
      <button
        type="button"
        className={`lead-follow-up-action ${overdue ? 'lead-date-overdue' : 'lead-date-upcoming'}`}
        title="Đánh dấu lịch chăm sóc đã xử lý"
        onClick={event => {
          event.stopPropagation();
          void handleMarkFollowUpHandled(lead);
        }}
      >
        <CheckCircle2 size={14} />
        {overdue ? 'Quá hạn' : 'Sắp tới lịch'} · {formatDateTime(lead.nextFollowUpAt)}
      </button>
    );
  };

  const renderLeadText = (value?: string) => (
    <span className={value ? 'lead-table-text' : 'lead-table-text is-muted'} title={value || 'Chưa cập nhật'}>
      {value || 'Chưa cập nhật'}
    </span>
  );

  if (showLeadForm) {
    return renderLeadForm();
  }

  function renderLeadRepository() {
    if (!selectedLead) return null;
    return (
      <section className="lead-panel lead-panel--wide customer-file-repository-card" aria-label={t('File liên quan')}>
        <div className="card-header customer-file-repository-header">
          <div>
            <span className="card-title">{t('File liên quan')}</span>
            <small>{t('File thiết kế, báo giá và tài liệu sẽ được giữ nguyên khi chuyển thành khách hàng.')}</small>
          </div>
        </div>

        <div className="customer-drive-layout">
          <aside className="customer-drive-sidebar" aria-label={t('Danh sách thư mục file liên quan')}>
            {currentUser.role === 'admin' && (
              <div className="customer-drive-new-folder">
                <input
                  type="text"
                  value={newLeadFolderName}
                  onChange={event => setNewLeadFolderName(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleAddLeadRepositoryFolder();
                    }
                  }}
                  placeholder={t('Tên thư mục mới')}
                  aria-label={t('Tên thư mục mới')}
                />
                <button type="button" className="btn btn-primary" onClick={() => void handleAddLeadRepositoryFolder()} disabled={!newLeadFolderName.trim()}>{t('Tạo thư mục')}</button>
              </div>
            )}

            <div className="customer-drive-folder-list">
              {leadRepositoryFolders.map(folder => {
                const fileCount = (selectedLead.files || []).filter(file => resolveCustomerFileFolderId(file, leadRepositoryFolders) === folder.id).length;
                return (
                  <div key={folder.id} className={`customer-drive-folder ${activeLeadRepositoryFolder?.id === folder.id ? 'is-active' : ''}`}>
                    {renamingLeadFolderId === folder.id ? (
                      <div className="customer-drive-folder-rename">
                        <input
                          autoFocus
                          value={leadFolderNameDraft}
                          onChange={event => setLeadFolderNameDraft(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter') void handleRenameLeadRepositoryFolder(folder.id);
                            if (event.key === 'Escape') setRenamingLeadFolderId('');
                          }}
                          aria-label={t('Tên thư mục')}
                        />
                        <button type="button" onClick={() => void handleRenameLeadRepositoryFolder(folder.id)}>{t('Lưu')}</button>
                        <button type="button" onClick={() => setRenamingLeadFolderId('')}>{t('Hủy')}</button>
                      </div>
                    ) : (
                      <>
                        <button type="button" className="customer-drive-folder-select" onClick={() => setActiveLeadFolderId(folder.id)}>
                          <span title={folder.name}>{folder.name}</span>
                          <small>{fileCount}</small>
                        </button>
                        {currentUser.role === 'admin' && (
                          <div className="customer-drive-folder-actions">
                            <button type="button" onClick={() => { setRenamingLeadFolderId(folder.id); setLeadFolderNameDraft(folder.name); }}>{t('Đổi tên')}</button>
                            <button type="button" onClick={() => void handleDeleteLeadRepositoryFolder(folder.id)}>{t('Xóa')}</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="customer-drive-content">
            <div className="customer-drive-path">
              <span>{t('File liên quan')}</span>
              <strong>/ {activeLeadRepositoryFolder?.name || t('Chưa chọn thư mục')}</strong>
            </div>

            {(currentUser.role === 'admin' || currentUser.role === 'sale') && activeLeadRepositoryFolder && (
              <details className="customer-drive-upload-panel">
                <summary>{t('Thêm tài liệu vào thư mục này')}</summary>
                <form onSubmit={event => void handleUploadLeadRepositoryFile(event)}>
                  <label>
                    <span>{t('Tên tài liệu')} *</span>
                    <input value={leadRepositoryFileName} onChange={event => setLeadRepositoryFileName(event.target.value)} required placeholder={t('Ví dụ: File thiết kế nhãn chai')} />
                  </label>
                  <label>
                    <span>{t('Chọn tệp dưới 900 KB')}</span>
                    <input type="file" onChange={handleLeadRepositoryFileChange} />
                  </label>
                  <label>
                    <span>{t('Hoặc đường dẫn Drive/OneDrive')}</span>
                    <input type="url" value={leadRepositoryFileLink} onChange={event => setLeadRepositoryFileLink(event.target.value)} placeholder="https://..." />
                  </label>
                  <button type="submit" className="btn btn-primary">{t('Lưu tài liệu')}</button>
                </form>
              </details>
            )}

            <div className="table-container customer-drive-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('Tên tài liệu')}</th>
                    <th>{t('Loại')}</th>
                    <th>{t('Ngày cập nhật')}</th>
                    <th>{t('Người cập nhật')}</th>
                    <th>{t('Thao tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLeadRepositoryFiles.map(file => {
                    const source = file.data || file.url;
                    const isImage = source.startsWith('data:image/');
                    return (
                      <tr key={file.id}>
                        <td><strong title={file.name}>{file.name}</strong></td>
                        <td>{isImage ? t('Hình ảnh') : file.url ? t('Đường dẫn') : t('Tệp tài liệu')}</td>
                        <td>{formatDateTime(file.createdAt)}</td>
                        <td>{file.createdBy || users.find(user => user.uid === file.createdById)?.displayName || '—'}</td>
                        <td>
                          <div className="customer-drive-file-actions">
                            {file.url
                              ? <a href={file.url} target="_blank" rel="noreferrer">{t('Mở liên kết')}</a>
                              : source && <a href={source} download={file.name}>{t('Tải xuống')}</a>}
                            {(currentUser.role === 'admin' || currentUser.role === 'sale') && <button type="button" onClick={() => void handleDeleteLeadRepositoryFile(file.id)}>{t('Xóa')}</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {activeLeadRepositoryFiles.length === 0 && (
                    <tr><td colSpan={5} className="lead-file-repository-empty">{t('Chưa có tài liệu trong thư mục này.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderLeadForm() {
    const assignedSaleName = editingLead
      ? users.find(user => user.uid === editingLead.assignedSaleId)?.displayName || editingLead.assignedSaleName || 'Chưa phân công'
      : '';
    const canManageEditingLead = Boolean(editingLead && (
      currentUser.role === 'admin'
      || (currentUser.role === 'sale' && editingLead.assignedSaleId === currentUser.uid)
    ));
    const profileFields: Array<string | number> = [
      form.companyName, form.taxCode, form.website, form.province, form.ward,
      form.industrialPark, form.address, form.contactPerson, form.contactPosition,
      form.phone, form.email, form.source, form.sourceUrl, form.note,
      form.assignedSaleId, form.discoveredById, form.nextFollowUpAt, form.stage,
      form.potentialValue, form.closingProbability, form.expectedCloseAt,
      form.lastContactResult, form.nextGoal, form.careNote
    ];
    const completedProfileFields = profileFields.filter(value => (
      typeof value === 'number' ? value > 0 : String(value || '').trim().length > 0
    )).length;
    return (
      <SystemFieldSurface table="leads" className="lead-form-page">
        <header className={`lead-form-page__header${editingLead ? ' lead-record-header crm-record-header' : ''}`}>
          <PageBackButton iconOnly title={t('Quay lại danh sách khách hàng tiềm năng')} onClick={closeLeadForm} />
          {editingLead ? <>
            <div className="lead-record-header__identity"><CrmRecordHeaderIdentity title={form.companyName || editingLead.companyName} /></div>
            <div className="lead-record-header__actions">
              <CrmRecordHeaderTabs
                activeTab={leadDetailTab}
                classificationCount={form.customerInsightValues.length}
                classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
                classificationLabel={t('Phân loại khách hàng')}
                profileLabel={t('Thông tin hồ sơ')}
                ariaLabel={t('Nội dung hồ sơ khách hàng tiềm năng')}
                onTabChange={setLeadDetailTab}
              />
              <RowActionMenu
                label={t('Thao tác hồ sơ')}
                actions={[
                  { label: t('Hẹn lịch'), icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(editingLead) },
                  ...(currentUser.role === 'admin' ? [{ label: t('Giao việc'), icon: <ClipboardCheck size={14} />, onSelect: () => setAssignmentTarget({ id: editingLead.id, label: editingLead.companyName, module: 'leads' }) }] : []),
                  ...(currentUser.role === 'sale' ? [{ label: t('Yêu cầu hỗ trợ'), icon: <LifeBuoy size={14} />, onSelect: () => setSupportTarget({ id: editingLead.id, label: editingLead.companyName, module: 'leads' }) }] : []),
                  ...(!['converted'].includes(editingLead.stage) && !editingLead.convertedCustomerId ? [{ label: returningLeadId === editingLead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô'), icon: <Undo2 size={14} />, onSelect: () => void handleReturnLeadToRawData(editingLead), disabled: returningLeadId === editingLead.id || !canManageEditingLead }] : []),
                  ...(!['converted', 'lost'].includes(editingLead.stage) ? [{ label: t('Chuyển thành khách hàng'), icon: <UserCheck size={14} />, onSelect: () => handleConvertLead(editingLead), disabled: !canManageEditingLead }] : []),
                  ...(editingLead.stage === 'converted' ? [{ label: t('Mở CRM'), icon: <Building2 size={14} />, onSelect: onNavigateToCrm }] : []),
                  { label: t('Xóa Lead'), icon: <Trash2 size={14} />, onSelect: () => void handleDeleteLead(editingLead), danger: true, disabled: !canManageEditingLead }
                ]}
              />
            </div>
            <CrmRecordHeaderFacts
              taxCode={form.taxCode || 'Chưa cập nhật'}
              saleName={assignedSaleName}
              classificationCount={form.customerInsightValues.length}
              classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
              profileCompleted={completedProfileFields}
              profileTotal={profileFields.length}
              stageLabel={getStageLabel(form.stage)}
              nextCareLabel={form.nextFollowUpAt ? formatDateTime(form.nextFollowUpAt) : 'Chưa đặt lịch'}
            />
          </> : <div>
            <span>{convertingCandidateId ? t('CHUYỂN TỪ DỮ LIỆU KHÁCH HÀNG') : t('HỒ SƠ MỚI')}</span>
            <h1>{convertingCandidateId ? t('Tiếp nhận khách hàng thành Lead') : t('Thêm khách hàng tiềm năng')}</h1>
          </div>}
        </header>

        {editingLead && (
          <div className="lead-detail-panel" hidden={leadDetailTab !== 'classification'}>
            <CustomerInsightClassification
              key={editingLead.id}
              companyName={editingLead.companyName}
              values={form.customerInsightValues}
              canEdit={canManageEditingLead}
              onSave={values => saveClassification(editingLead, values)}
              toolbarActions={<PhoneCallCell toolbar phone={editingLead.phone} companyName={editingLead.companyName}
                subjectKey={leadCallSubjectKey(editingLead)} historyKeys={leadCallHistoryKeys(editingLead)}
                auditModule="leads" targetType="lead" targetId={editingLead.id} currentUser={currentUser}
                canRecord={canManageEditingLead} />}
            />
          </div>
        )}

        <form id="lead-profile-form" className="lead-form-page__form lead-detail-panel" hidden={Boolean(editingLead && leadDetailTab !== 'profile')} onSubmit={handleSaveLead}>
          <div className="lead-form-page__content lead-standardized-form">
            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <Building2 size={18} />
                <div><h2>{t('Thông tin doanh nghiệp')}</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label data-system-label="companyName">{t('Tên doanh nghiệp *')}</label><input autoFocus={!editingLead || leadDetailTab === 'profile'} required value={form.companyName} onChange={event => updateForm('companyName', event.target.value)} /></div>
                <div className="form-group">
                  <label data-system-label="taxCode">{t('Mã số thuế *')}</label>
                  <input
                    required
                    value={form.taxCode}
                    onChange={event => updateForm('taxCode', event.target.value)}
                    readOnly={isTaxCodeLocked}
                    aria-invalid={Boolean(taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError)}
                    aria-describedby="lead-tax-code-guidance"
                  />
                  <span id="lead-tax-code-guidance" className={taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError ? 'lead-tax-code-message is-error' : 'lead-tax-code-message'}>
                    {(taxCodeConflict || candidateTaxCodeConflict || taxCodeSaveError) && <AlertCircle size={13} />}
                    {taxCodeConflict
                      ? describeTaxCodeConflict(taxCodeConflict)
                      : candidateTaxCodeConflict
                        ? `Mã số thuế này đang nằm trong Dữ liệu thô của doanh nghiệp “${candidateTaxCodeConflict.companyName}”.`
                        : taxCodeSaveError || (isTaxCodeLocked
                          ? t('Mã số thuế là định danh duy nhất và không thể thay đổi sau khi tạo Lead.')
                          : t('Mã số thuế được kiểm tra trên toàn bộ Lead và khách hàng.'))}
                  </span>
                </div>
                <div className="form-group"><label data-system-label="website">{t('Website')}</label><input type="url" value={form.website} onChange={event => updateForm('website', event.target.value)} placeholder="https://..." /></div>
                <BusinessLocationFields
                  className="lead-form-grid__wide"
                  province={form.province}
                  ward={form.ward}
                  industrialPark={form.industrialPark}
                  onChange={location => setForm(previous => ({ ...previous, ...location }))}
                />
                <div className="form-group lead-form-grid__wide"><label data-system-label="address">{t('Địa chỉ doanh nghiệp')}</label><input value={form.address} onChange={event => updateForm('address', event.target.value)} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'company')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="company" sectionLabel={t('Thông tin doanh nghiệp')} definitions={profileFormCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'website', label: 'Website' }, { key: 'province', label: 'Tỉnh / thành' }, { key: 'ward', label: 'Phường / xã' }, { key: 'industrialPark', label: 'Khu công nghiệp' }, { key: 'address', label: 'Địa chỉ doanh nghiệp' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <UserCheck size={18} />
                <div><h2>{t('Liên hệ và nguồn dữ liệu')}</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="contactPerson">{t('Người liên hệ')}</label><input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="contactPosition">{t('Chức vụ')}</label><input value={form.contactPosition} onChange={event => updateForm('contactPosition', event.target.value)} placeholder={t('Ví dụ: Thu mua, Giám đốc...')} /></div>
                <div className="form-group"><label data-system-label="phone">{t('Điện thoại')}</label><input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="email">Email</label><input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="source">{t('Nguồn tìm kiếm')}</label><select value={form.source} onChange={event => updateForm('source', event.target.value)}><option value="">{t('Chưa chọn')}</option>{form.source && !leadSourceOptions.includes(form.source) && <option value={form.source}>{form.source}</option>}{leadSourceOptions.map(source => <option key={source} value={source}>{source}</option>)}</select></div>
                <div className="form-group"><label data-system-label="sourceUrl">{t('Đường dẫn nguồn')}</label><input type="url" value={form.sourceUrl} onChange={event => updateForm('sourceUrl', event.target.value)} placeholder="https://..." /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'contact')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="contact" sectionLabel={t('Liên hệ và nguồn dữ liệu')} definitions={profileFormCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'contactPerson', label: 'Người liên hệ' }, { key: 'contactPosition', label: 'Chức vụ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'email', label: 'Email' }, { key: 'source', label: 'Nguồn tìm kiếm' }, { key: 'sourceUrl', label: 'Đường dẫn nguồn' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading"><Search size={18} /><div><h2>{t('Thông tin bổ sung')}</h2></div></div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label data-system-label="note">{t('Ghi chú')}</label><textarea rows={3} value={form.note} onChange={event => updateForm('note', event.target.value)} placeholder={t('Thông tin cần lưu ý khi làm việc với khách hàng...')} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'needs')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="needs" sectionLabel={t('Thông tin bổ sung')} definitions={profileFormCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'note', label: 'Ghi chú' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <CalendarClock size={18} />
                <div><h2>{t('Phụ trách và lịch hẹn')}</h2></div>
              </div>
              <div className="lead-form-grid">
                <div className={`form-group${currentUser.role === 'admin' ? '' : ' lead-form-grid__wide'}`}>
                  <label data-system-label="assignedSaleId">{t('Người phụ trách *')}</label>
                  <select value={form.assignedSaleId} onChange={event => updateForm('assignedSaleId', event.target.value)} disabled={currentUser.role === 'sale'}>
                    <option value="">{t('-- Chưa phân công --')}</option>
                    {saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}
                  </select>
                </div>
                {currentUser.role === 'admin' && (
                  <div className="form-group">
                    <label data-system-label="discoveredById">{t('Sale tìm được Lead')}</label>
                    <select value={form.discoveredById} onChange={event => updateForm('discoveredById', event.target.value)}>
                      <option value="">{t('-- Chưa xác định --')}</option>
                      {saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group lead-form-grid__wide">
                  <label data-system-label="nextFollowUpAt">{t('Lịch hẹn xử lý')}</label>
                  <input type="datetime-local" value={form.nextFollowUpAt} onChange={event => updateForm('nextFollowUpAt', event.target.value)} />
                </div>
              </div>
              <EntityCustomFieldsGrid definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'assignment')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="assignment" sectionLabel={t('Phụ trách và lịch hẹn')} definitions={profileFormCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'discoveredById', label: 'Sale tìm được Lead' }, { key: 'nextFollowUpAt', label: 'Lịch hẹn xử lý' }]} />
            </section>

            <section className="lead-form-card lead-form-card--wide lead-attachments-card">
              <div className="lead-form-card__heading"><Paperclip size={18} /><div><h2>{t('File liên quan')}</h2></div></div>
              <div className="lead-attachments-card__upload-row">
                <div className="lead-attachments-card__toolbar">
                  <label className="btn btn-outline lead-attachments-card__upload">{t('Tải tệp lên')}<input type="file" multiple onChange={handleLeadFilesChange} /></label>
                  <span>{t('Tệp dưới 900 KB; tệp lớn dùng đường dẫn Drive hoặc OneDrive.')}</span>
                </div>
                <label className="lead-attachments-card__dropzone">
                  <span>{t('Kéo thả tệp vào đây hoặc chọn từ máy')}</span>
                  <input type="file" multiple onChange={handleLeadFilesChange} />
                </label>
              </div>
              <details className="lead-attachments-card__link"><summary>{t('Thêm đường dẫn Drive/OneDrive')}</summary><div><input aria-label={t('Tên tài liệu')} placeholder={t('Tên tài liệu')} value={attachmentLinkName} onChange={event => setAttachmentLinkName(event.target.value)} /><input aria-label={t('Đường dẫn chia sẻ')} type="url" placeholder="https://..." value={attachmentLinkUrl} onChange={event => setAttachmentLinkUrl(event.target.value)} /><button type="button" className="btn btn-outline" onClick={handleAddAttachmentLink}>{t('Thêm liên kết')}</button></div></details>
              {uploadingFiles.length > 0 ? (
                <div className="lead-attachments-card__table">
                  <table><thead><tr><th>{t('Tên tệp')}</th><th>{t('Loại')}</th><th>{t('Dung lượng')}</th><th>{t('Ngày cập nhật')}</th><th>{t('Người cập nhật')}</th><th>{t('Thao tác')}</th></tr></thead><tbody>
                    {uploadingFiles.map(file => {
                      const source = file.data || file.url || '';
                      return <tr key={file.id}><td title={file.name}>{file.name}</td><td>{file.url ? t('Đường dẫn') : source.startsWith('data:image/') ? t('Hình ảnh') : t('Tệp tài liệu')}</td><td>{file.size ? `${(file.size / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} KB` : '—'}</td><td>{file.createdAt ? formatDateTime(file.createdAt) : '—'}</td><td>{file.createdBy || '—'}</td><td><div className="lead-attachments-card__actions">{source && (file.url ? <a href={file.url} target="_blank" rel="noreferrer">{t('Mở liên kết')}</a> : <a href={source} download={file.name}>{t('Tải xuống')}</a>)}<button type="button" onClick={async () => { if ((await confirmDelete(t('Xóa tệp này khỏi hồ sơ?')))) setUploadingFiles(previous => previous.filter(item => item.id !== file.id)); }}>{t('Xóa')}</button></div></td></tr>;
                    })}
                  </tbody></table>
                </div>
              ) : (
                <div className="lead-attachments-card__empty">{t('Chưa có tệp đính kèm.')}</div>
              )}
            </section>

            <div className="lead-form-page__extension-label">{t('THÔNG TIN BỔ SUNG CHO TIỀM NĂNG')}</div>

            <section className="lead-form-card">
              <div className="lead-form-card__heading"><Tags size={18} /><div><h2>{t('Đánh giá tiềm năng')}</h2></div></div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="stage">{t('Giai đoạn xử lý')}</label><select value={form.stage} onChange={event => updateForm('stage', event.target.value as LeadStage)}>{LEAD_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></div>
                <div className="form-group"><label data-system-label="potentialValue">{t('Giá trị tiềm năng (đ)')}</label><input type="number" min="0" value={form.potentialValue} onChange={event => updateForm('potentialValue', Number(event.target.value))} /></div>
                <div className="form-group"><label data-system-label="closingProbability">{t('Khả năng chốt (%)')}</label><input type="number" min="0" max="100" value={form.closingProbability} onChange={event => updateForm('closingProbability', Number(event.target.value))} /></div>
                <div className="form-group"><label data-system-label="expectedCloseAt">{t('Dự kiến chốt')}</label><input type="date" value={form.expectedCloseAt} onChange={event => updateForm('expectedCloseAt', event.target.value)} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'classification')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="classification" sectionLabel={t('Đánh giá tiềm năng')} definitions={profileFormCustomFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'stage', label: 'Giai đoạn xử lý' }, { key: 'potentialValue', label: 'Giá trị tiềm năng' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading"><CalendarClock size={18} /><div><h2>{t('Kế hoạch chăm sóc')}</h2></div></div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="lastContactResult">{t('Kết quả liên hệ gần nhất')}</label><input value={form.lastContactResult} onChange={event => updateForm('lastContactResult', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="nextGoal">{t('Mục tiêu tiếp theo')}</label><input value={form.nextGoal} onChange={event => updateForm('nextGoal', event.target.value)} /></div>
                <div className="form-group lead-form-grid__wide"><label data-system-label="careNote">{t('Ghi chú chăm sóc')}</label><textarea rows={3} value={form.careNote} onChange={event => updateForm('careNote', event.target.value)} /></div>
              </div>
            </section>

            <EntityCustomFieldsSection
              definitions={profileFormCustomFieldDefinitions.filter(definition => definition.section === 'additional')}
              values={customFieldValues}
              role={currentUser.role}
              onChange={setCustomFieldValues}
            />
          </div>
          <footer className={`lead-form-page__footer${editingLead ? ' lead-form-page__footer--fixed' : ''}`}>
            <span>{t('Các thay đổi chỉ được ghi nhận khi bấm Lưu.')}</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={closeLeadForm}>{t('Hủy')}</button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={Boolean(taxCodeConflict || candidateTaxCodeConflict) || !normalizeTaxCode(form.taxCode)}
              >
                {editingLeadId ? t('Cập nhật Lead') : convertingCandidateId ? t('Lưu Lead & hoàn tất tiếp cận') : t('Lưu Lead')}
              </button>
            </div>
          </footer>
        </form>
      </SystemFieldSurface>
    );
  }

  return (
    <SystemFieldSurface table="leads" className="leads-page">
      <PageContextHeader
        section={t('Tiềm năng')}
        current={workspaceTab === 'overview' ? 'Tổng quan' : 'Danh sách KH tiềm năng'}
      />

      <div className="lead-page-navigation lead-candidate-commandbar">
        <div className="lead-workspace-tabs content-tabs content-tabs--compact" role="tablist" aria-label="Không gian quản lý khách hàng tiềm năng">
          <button type="button" role="tab" aria-selected={workspaceTab === 'overview'} className={workspaceTab === 'overview' ? 'is-active' : ''} onClick={() => setWorkspaceTab('overview')}>Tổng quan</button>
          <button type="button" role="tab" aria-selected={workspaceTab === 'list'} className={workspaceTab === 'list' ? 'is-active' : ''} onClick={openLeadListTab}>Danh sách KH tiềm năng</button>
        </div>
        {workspaceTab === 'list' && (
          <section className="lead-page-navigation__tools lead-candidate-toolbar">
            <div className="lead-search">
              <Search size={16} />
              <input value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setLeadCurrentPage(1); }} placeholder={t('Tìm công ty, liên hệ, SĐT, địa chỉ, nhu cầu, nhãn...')} />
            </div>
            <DataFilterButton activeCount={leadActiveFilterCount} open={showLeadFilters} onClick={() => setShowLeadFilters(true)} />
            {canEditColumns && <button type="button" className="lead-candidate-column-button" aria-label={t('Tùy chỉnh cột')} title={t('Tùy chỉnh cột')} onClick={() => setShowColumnCustomizer(true)}>
              <Settings2 size={16} />
            </button>}
            {(searchTerm || leadActiveFilterCount > 0) && <button type="button" className="btn btn-outline lead-toolbar-reset" onClick={clearFilters}><X size={14} /> Đặt lại</button>}
            <button type="button" className="btn btn-primary" onClick={openCreateForm}><Plus size={16} /> {t('Thêm Lead')}</button>
          </section>
        )}
      </div>

      <div className="lead-overview-surface" hidden={workspaceTab !== 'overview'}>
        <LeadOverviewDashboard
          leads={overviewLeads}
          saleUsers={saleUsers}
          currentUser={currentUser}
          definitions={filterDefinitions}
          metrics={overviewCards}
          onMetricClick={handleOverviewMetricClick}
          onGroupClick={openOverviewDrilldown}
          onOpenLead={openLeadById}
        />
      </div>
      {(leadListPrepared || workspaceTab === 'list') && (
        <div className="lead-data-workspace" hidden={workspaceTab !== 'list'}>
          <DataFilterChipBar chips={leadFilterChips} onClear={clearFilters} />

          <DataFilterPanel
            open={showLeadFilters}
            title="Lọc danh sách KH tiềm năng"
            description="Chọn nhiều tiêu chí để thu hẹp danh sách khách hàng tiềm năng."
            activeCount={leadQuickFilterCount}
            onClose={() => setShowLeadFilters(false)}
            onReset={clearFilters}
          >
            {visibleFilterDefinitions.map(field => {
              const fieldOptions = quickFilterOptionsByField[field.id] || [];
              const configuredField = getSystemFilterDefinition(systemFilterDefinitions, field.id);
              const options = field.id === LEAD_FILTER_IDS.industrialPark
                ? fieldOptions.flatMap(province => flattenLeadFilterOptions([province])
                  .filter(option => option.kind === 'region')
                  .map(option => {
                  const path = findLeadFilterOptionPathInOptions([province], option.id);
                  return {
                    value: option.id,
                    label: option.label,
                    description: path.slice(0, -1).map(parent => parent.label).join(' · ')
                  };
                  }))
                : fieldOptions.map(option => ({ value: option.id, label: option.label }));
              return (
                <DataFilterSection key={field.id} title={configuredField?.name || field.name} selectedCount={(dynamicFilters[field.id] || []).length} description={configuredField?.description || (field.id === LEAD_FILTER_IDS.province ? 'Lọc riêng theo tỉnh/thành.' : field.id === LEAD_FILTER_IDS.industrialPark ? 'Lọc theo khu công nghiệp đã cấu hình cho từng tỉnh/thành.' : 'Có thể chọn đồng thời nhiều giá trị.')}>
                  <DataFilterCheckboxGroup
                    options={options}
                    selectedValues={dynamicFilters[field.id] || []}
                    onChange={values => setDynamicFilters(previous => ({
                      ...previous,
                      [field.id]: values
                    }))}
                    searchable={options.length > 8}
                  />
                </DataFilterSection>
              );
            })}
            {getCustomerInsightGroupsForModule('leads').map(group => (
              <DataFilterSection key={`insight-${group.id}`} title={group.label} description="Lọc theo phân loại nghiệp vụ thuộc phân hệ Tiềm năng." selectedCount={group.items.filter(item => insightFilters.includes(item.id)).length}>
                <DataFilterCheckboxGroup
                  options={group.items.map(item => ({ value: item.id, label: item.label }))}
                  selectedValues={insightFilters.filter(value => group.items.some(item => item.id === value))}
                  onChange={values => setInsightFilters(current => replaceCustomerInsightGroupValues(current, group.items.map(item => item.id), values))}
                  searchable={group.items.length > 8}
                />
              </DataFilterSection>
            ))}
            {customFieldDefinitions.filter(definition => definition.active).map(definition => (
              <DataFilterSection key={definition.id} title={definition.name} description={definition.description || 'Lọc theo trường tùy chỉnh.'} selectedCount={(customFieldFilters[definition.id] || []).length}>
                <DataFilterCheckboxGroup
                  options={customFilterOptions[definition.id] || []}
                  selectedValues={customFieldFilters[definition.id] || []}
                  onChange={values => setCustomFieldFilters(previous => ({ ...previous, [definition.id]: values }))}
                  searchable={(customFilterOptions[definition.id] || []).length > 8}
                />
              </DataFilterSection>
            ))}
          </DataFilterPanel>

          <section className="lead-table-card">
            <div className="lead-table-result">Hiển thị <strong>{filteredLeads.length}</strong> / {accessibleLeads.length} Lead</div>
            <div className="table-container">
              <ConfiguredSystemTable
                table="leads"
                className="lead-table lead-table--classified has-dynamic-columns"
                style={{ minWidth: `${Math.max(1180, visibleLeadColumnCount * 150 + 130)}px` }}
              >
                <thead><tr>
                  <ReorderableTableCells order={orderedLeadColumnIds} getHeaderProps={getLeadHeaderProps} labels={leadColumnLabels}>
                  <th key="index" className="erp-table-index-column">STT</th>
                  <th key="company" data-system-field="companyName">{t('Doanh nghiệp')}</th>
                  {visibleLeadColumnIds.has('taxCode') && <th key="taxCode" data-system-field="taxCode">{t('Mã số thuế')}</th>}
                  {visibleLeadColumnIds.has('website') && <th key="website" data-system-field="website">Website</th>}
                  {visibleLeadColumnIds.has('businessSector') && <th key="businessSector" data-system-field="businessSector">{t('Lĩnh vực hoạt động')}</th>}
                  {visibleLeadColumnIds.has('address') && <th key="address" data-system-field="address">{t('Địa chỉ doanh nghiệp')}</th>}
                  {visibleLeadColumnIds.has('companySize') && <th key="companySize" data-system-field="companySize">{t('Quy mô')}</th>}
                  {visibleLeadColumnIds.has('source') && <th key="source" data-system-field="source">{t('Khu vực')}</th>}
                  {visibleLeadColumnIds.has('sourceValue') && <th key="sourceValue" data-system-field="sourceValue">{t('Nguồn tìm kiếm')}</th>}
                  {visibleLeadColumnIds.has('province') && <th key="province" data-system-field="province">{t('Tỉnh/thành')}</th>}
                  {visibleLeadColumnIds.has('ward') && <th key="ward" data-system-field="ward">{t('Phường/xã')}</th>}
                  {visibleLeadColumnIds.has('industrialPark') && <th key="industrialPark" data-system-field="industrialPark">{t('Khu công nghiệp')}</th>}
                  {visibleLeadColumnIds.has('contact') && <th key="contact" data-system-field="contact">{t('Liên hệ')}</th>}
                  {visibleLeadColumnIds.has('contactPerson') && <th key="contactPerson" data-system-field="contactPerson">{t('Người liên hệ')}</th>}
                  {visibleLeadColumnIds.has('contactPosition') && <th key="contactPosition" data-system-field="contactPosition">{t('Chức vụ')}</th>}
                  {visibleLeadColumnIds.has('phone') && <th key="phone" data-system-field="phone">{t('Điện thoại')}</th>}
                  {visibleLeadColumnIds.has('email') && <th key="email" data-system-field="email">Email</th>}
                  {visibleLeadColumnIds.has('expectedProducts') && <th key="expectedProducts" data-system-field="expectedProducts">{t('Sản phẩm / nhu cầu quan tâm')}</th>}
                  {visibleLeadColumnIds.has('potentialValue') && <th key="potentialValue" data-system-field="potentialValue">{t('Giá trị tiềm năng')}</th>}
                  {visibleLeadColumnIds.has('stage') && <th key="stage" data-system-field="stage">{t('Giai đoạn xử lý')}</th>}
                  {visibleLeadColumnIds.has('note') && <th key="note" data-system-field="note">{t('Ghi chú')}</th>}
                  {visibleLeadColumnIds.has('assignedSale') && <th key="assignedSale" data-system-field="assignedSaleId">{t('Sale phụ trách')}</th>}
                  {visibleLeadColumnIds.has('discoveredBy') && <th key="discoveredBy" data-system-field="discoveredById">{t('Sale tìm được Lead')}</th>}
                  {visibleLeadColumnIds.has('nextFollowUpAt') && <th key="nextFollowUpAt" data-system-field="nextFollowUpAt">{t('Chăm sóc tiếp')}</th>}
                  {visibleLeadInsightItems.map(entry => <th key={`insight:${entry.id}`}>{entry.label}</th>)}
                  {visibleLeadCustomFields.map(definition => <th key={`custom:${definition.id}`}>{definition.name}</th>)}
                  <th key="actions">{t('Thao tác')}</th>
                  </ReorderableTableCells>
                </tr></thead>
                <tbody>
                  {displayedLeads.map((lead, leadIndex) => (
                    <tr key={lead.id} onClick={() => openEditForm(lead)}>
                      <ReorderableTableCells order={orderedLeadColumnIds}>
                      <td key="index" className="erp-table-index-column">{(safeLeadCurrentPage - 1) * leadPageSize + leadIndex + 1}</td>
                      <td key="company"><strong className="erp-company-name" title={lead.companyName}>{lead.companyName}</strong></td>
                      {visibleLeadColumnIds.has('taxCode') && <td key="taxCode">{renderLeadText(lead.taxCode)}</td>}
                      {visibleLeadColumnIds.has('website') && <td key="website">{renderLeadText(lead.website)}</td>}
                      {visibleLeadColumnIds.has('businessSector') && <td key="businessSector">{renderLeadText(lead.businessSector)}</td>}
                      {visibleLeadColumnIds.has('address') && <td key="address">{renderLeadText(lead.address)}</td>}
                      {visibleLeadColumnIds.has('companySize') && <td key="companySize">{renderLeadText(COMPANY_SIZE_LABELS[lead.companySize])}</td>}
                      {visibleLeadColumnIds.has('source') && <td key="source">{renderLeadText([lead.province, lead.ward, lead.industrialPark].filter(Boolean).join(' · '))}</td>}
                      {visibleLeadColumnIds.has('sourceValue') && <td key="sourceValue">{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.source, lead.source || ''))}</td>}
                      {visibleLeadColumnIds.has('province') && <td key="province">{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.province, lead.province || ''))}</td>}
                      {visibleLeadColumnIds.has('ward') && <td key="ward">{renderLeadText(lead.ward)}</td>}
                      {visibleLeadColumnIds.has('industrialPark') && <td key="industrialPark">{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.industrialPark, lead.industrialPark || ''))}</td>}
                      {visibleLeadColumnIds.has('contact') && <td key="contact">{renderLeadText(lead.contactPerson)}</td>}
                      {visibleLeadColumnIds.has('contactPerson') && <td key="contactPerson">{renderLeadText(lead.contactPerson)}</td>}
                      {visibleLeadColumnIds.has('contactPosition') && <td key="contactPosition">{renderLeadText(lead.contactPosition)}</td>}
                      {visibleLeadColumnIds.has('phone') && <td key="phone">{lead.phone ? <button type="button" className="lead-candidate-phone-link" onClick={event => { event.stopPropagation(); openEditForm(lead, 'profile'); }}>{lead.phone}</button> : renderLeadText(lead.phone)}</td>}
                      {visibleLeadColumnIds.has('email') && <td key="email">{renderLeadText(lead.email)}</td>}
                      {visibleLeadColumnIds.has('expectedProducts') && <td key="expectedProducts">{renderLeadText(lead.expectedProducts)}</td>}
                      {visibleLeadColumnIds.has('potentialValue') && <td key="potentialValue"><strong>{lead.potentialValue.toLocaleString('vi-VN')} đ</strong></td>}
                      {visibleLeadColumnIds.has('stage') && <td key="stage">{renderLeadText(getStageLabel(lead.stage))}</td>}
                      {visibleLeadColumnIds.has('note') && <td key="note">{renderLeadText(lead.note)}</td>}
                      {visibleLeadColumnIds.has('assignedSale') && <td key="assignedSale">{users.find(user => user.uid === lead.assignedSaleId)?.displayName || lead.assignedSaleName || 'Chưa phân công'}</td>}
                      {visibleLeadColumnIds.has('discoveredBy') && <td key="discoveredBy">{renderLeadText(users.find(user => user.uid === lead.discoveredById)?.displayName || lead.discoveredByName)}</td>}
                      {visibleLeadColumnIds.has('nextFollowUpAt') && <td key="nextFollowUpAt">{renderFollowUp(lead)}</td>}
                      {visibleLeadInsightItems.map(entry => <td key={`insight:${entry.id}`}><span className={`lead-candidate-insight-value ${(lead.customerInsightValues || []).includes(entry.id) ? 'is-selected' : ''}`}>{(lead.customerInsightValues || []).includes(entry.id) ? 'Đã chọn' : 'Chưa chọn'}</span></td>)}
                      {visibleLeadCustomFields.map(definition => <td key={`custom:${definition.id}`}>{formatEntityCustomFieldValue(definition, lead.customFieldValues?.[definition.id])}</td>)}
                      <td key="actions">
                        <RowActionMenu
                          label={`${t('Thao tác')} ${lead.companyName}`}
                          actions={[
                            { label: t('Hẹn lịch'), icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(lead) },
                            ...(currentUser.role === 'admin' ? [{ label: t('Giao việc'), icon: <ClipboardCheck size={14} />, onSelect: () => setAssignmentTarget({ id: lead.id, label: lead.companyName, module: 'leads' }) }] : []),
                            ...(currentUser.role === 'sale' ? [{ label: t('Yêu cầu hỗ trợ'), icon: <LifeBuoy size={14} />, onSelect: () => setSupportTarget({ id: lead.id, label: lead.companyName, module: 'leads' }) }] : []),
                            {
                              label: returningLeadId === lead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô'),
                              icon: <Undo2 size={14} />,
                              onSelect: () => void handleReturnLeadToRawData(lead),
                              disabled: returningLeadId === lead.id
                                || lead.stage === 'converted'
                                || Boolean(lead.convertedCustomerId)
                                || (currentUser.role !== 'admin' && lead.assignedSaleId !== currentUser.uid)
                            },
                            {
                              label: t('Xóa Lead'),
                              icon: <Trash2 size={14} />,
                              onSelect: () => void handleDeleteLead(lead),
                              danger: true,
                              disabled: currentUser.role !== 'admin' && lead.assignedSaleId !== currentUser.uid
                            }
                          ]}
                        />
                      </td>
                      </ReorderableTableCells>
                    </tr>
                  ))}
                </tbody>
              </ConfiguredSystemTable>
            </div>
            {filteredLeads.length > 0 && (
              <footer className="lead-candidate-pagination lead-table-pagination">
                <span>Tổng số: <strong>{filteredLeads.length}</strong> bản ghi</span>
                <label>
                  Hiển thị
                  <select value={leadPageSize} onChange={event => { setLeadPageSize(Number(event.target.value)); setLeadCurrentPage(1); }}>
                    <option value={25}>25 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                  </select>
                </label>
                <div>
                  <button type="button" onClick={() => setLeadCurrentPage(page => Math.max(1, page - 1))} disabled={safeLeadCurrentPage === 1} aria-label="Trang trước"><ChevronLeft size={15} /></button>
                  <strong>{safeLeadCurrentPage} / {leadTotalPages}</strong>
                  <button type="button" onClick={() => setLeadCurrentPage(page => Math.min(leadTotalPages, page + 1))} disabled={safeLeadCurrentPage === leadTotalPages} aria-label="Trang sau"><ChevronRight size={15} /></button>
                </div>
              </footer>
            )}
          </section>
        </div>
      )}

      <TableColumnCustomizer
        open={showColumnCustomizer}
        columns={leadColumnOptions}
        selectedIds={Array.from(visibleLeadColumnIds)}
        onClose={() => setShowColumnCustomizer(false)}
        onSave={saveVisibleLeadColumns}
      />

      {scheduleLead && (
        <div className="modal-overlay">
          <form className="modal-content lead-candidate-schedule-modal" onSubmit={handleSaveSchedule}>
            <div className="modal-header">
              <div><strong>{t('ĐẶT LỊCH CHĂM SÓC TIẾP THEO')}</strong><span>{scheduleLead.companyName}</span></div>
              <button type="button" className="btn btn-sm btn-outline" onClick={closeScheduleForm}><X size={14} /> {t('Đóng')}</button>
            </div>
            <div className="modal-body lead-candidate-schedule-form">
              <label><span data-system-label="nextFollowUpAt">{t('Lịch chăm sóc tiếp theo *')}</span><input required autoFocus type="datetime-local" value={scheduleForm.nextFollowUpAt} onChange={event => setScheduleForm(previous => ({ ...previous, nextFollowUpAt: event.target.value }))} /></label>
              <p>{t('Sau khi lưu, Lead sẽ được đưa lên đầu danh sách và Sale phụ trách sẽ nhận được thông báo.')}</p>
              {scheduleError && <div className="lead-candidate-warning is-error"><AlertCircle size={14} /><span>{scheduleError}</span></div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeScheduleForm}>{t('Hủy')}</button>
              <button type="submit" className="btn btn-primary" disabled={savingSchedule}><CalendarClock size={14} /> {savingSchedule ? t('Đang lưu...') : t('Lưu lịch hẹn')}</button>
            </div>
          </form>
        </div>
      )}

      {supportTarget && (
        <SupportRequestDialog currentUser={currentUser} users={users} target={supportTarget} onClose={() => setSupportTarget(null)} />
      )}
      {assignmentTarget && (
        <WorkAssignmentDialog currentUser={currentUser} users={users} target={assignmentTarget} onClose={() => setAssignmentTarget(null)} />
      )}

    </SystemFieldSurface>
  );
};
