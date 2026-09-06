import { ConfiguredSystemTable, SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import { PageContextHeader } from '@/components/PageContextHeader';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Eye,
  FileText,
  List,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  Tags,
  Trash2,
  Undo2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  isActiveLeadRecord,
  type CustomerRecord,
  type LeadCompanySize,
  type LeadFileRecord,
  type LeadFilterDefinition,
  type LeadProfileFieldDefinition,
  type LeadRecord,
  type LeadStage
} from '@/features/crm/model/crmModels';
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
  LeadDynamicFields,
  LeadSalesWorkspace
} from '@/features/crm/components/LeadFilterSystem';
import {
  isLeadSystemProfileField
} from '@/features/crm/model/leadProfileConfig';
import { PageBackButton } from '@/components/PageBackButton';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { EntityCustomFieldsGrid, EntityCustomFieldsReadOnly, EntityCustomFieldsSection } from '@/components/EntityCustomFields';
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
import { AdvancedDataFilters } from '@/components/AdvancedDataFilters';
import {
  countAdvancedFilters,
  getAdvancedFilterKindForFieldType,
  getAdvancedFilterSummaries,
  matchesAdvancedFilters,
  toAdvancedFilterValues,
  type AdvancedFilterField,
  type AdvancedFilterState
} from '@/components/advancedDataFilterModel';
import './Leads.css';

interface LeadsProps {
  customers: CustomerRecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  onNavigateToCrm: () => void;
  onNavigateToCustomerData: () => void;
  onConvertLead: (lead: LeadRecord) => void;
  initialCandidate?: LeadCandidateRecord | null;
  onInitialCandidateConsumed?: () => void;
}

interface LeadFormState {
  companyName: string;
  contactPerson: string;
  contactPosition: string;
  phone: string;
  email: string;
  website: string;
  businessSector: string;
  taxCode: string;
  address: string;
  province: string;
  ward: string;
  industrialPark: string;
  companySize: LeadCompanySize;
  source: string;
  potentialValue: number;
  expectedProducts: string;
  stage: LeadStage;
  assignedSaleId: string;
  discoveredById: string;
  nextFollowUpAt: string;
  note: string;
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

const updateLeadFilterValues = (
  currentValues: Record<string, string[]>,
  field: LeadFilterDefinition,
  value: string,
  checked?: boolean
) => {
  const previousFieldValues = currentValues[field.id] || [];
  let nextFieldValues: string[];

  if (field.id === LEAD_FILTER_IDS.province) {
    const selectedPath = value ? findLeadFilterOptionPathInOptions(field.options, value) : [];
    nextFieldValues = selectedPath.map(option => option.id);
  } else if (field.type === 'multi_select') {
    nextFieldValues = checked
      ? Array.from(new Set([...previousFieldValues, value]))
      : previousFieldValues.filter(item => item !== value);
  } else if (field.type === 'checkbox') {
    nextFieldValues = checked ? ['true'] : [];
  } else {
    nextFieldValues = value ? [value] : [];
  }

  return { ...currentValues, [field.id]: nextFieldValues };
};

const createEmptyForm = (currentUser: UserProfile, saleUsers: UserProfile[]): LeadFormState => ({
  companyName: '',
  contactPerson: '',
  contactPosition: '',
  phone: '',
  email: '',
  website: '',
  businessSector: '',
  taxCode: '',
  address: '',
  province: '',
  ward: '',
  industrialPark: '',
  companySize: '',
  source: '',
  potentialValue: 0,
  expectedProducts: '',
  stage: 'new',
  assignedSaleId: currentUser.role === 'sale' ? currentUser.uid : (saleUsers[0]?.uid || ''),
  discoveredById: currentUser.role === 'sale' ? currentUser.uid : '',
  nextFollowUpAt: '',
  note: ''
});

export const Leads: React.FC<LeadsProps> = ({
  customers,
  users,
  currentUser,
  onNavigateToCrm,
  onNavigateToCustomerData,
  onConvertLead,
  initialCandidate = null,
  onInitialCandidateConsumed
}) => {
  const { t } = useLanguage();
  const { definitions: customFieldDefinitions } = useEntityFieldDefinitions('leads', currentUser.role);
  const inlineSystemFieldConfiguration = useSystemFieldConfiguration('leads');
  const saleUsers = useMemo(() => users.filter(user => user.role === 'sale'), [users]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [leadPageSize, setLeadPageSize] = useState(25);
  const [leadCurrentPage, setLeadCurrentPage] = useState(1);
  const [workspaceTab, setWorkspaceTab] = useState<'list' | 'performance'>('list');
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [storedFilterDefinitions, setStoredFilterDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [profileDefinitions, setProfileDefinitions] = useState<LeadProfileFieldDefinition[]>([]);
  const [dynamicFilters, setDynamicFilters] = useState<Record<string, string[]>>({});
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string[]>>({});
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>({});
  const [showLeadFilters, setShowLeadFilters] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState('');
  const [convertingCandidateId, setConvertingCandidateId] = useState('');
  const [form, setForm] = useState<LeadFormState>(() => createEmptyForm(currentUser, saleUsers));
  const [formFilterValues, setFormFilterValues] = useState<Record<string, string[]>>({});
  const [formProfileValues, setFormProfileValues] = useState<Record<string, string[]>>({});
  const [customFieldValues, setCustomFieldValues] = useState<EntityCustomFieldValues>({});
  const [uploadingFiles, setUploadingFiles] = useState<LeadFileRecord[]>([]);
  const [taxCodeSaveError, setTaxCodeSaveError] = useState('');
  const [scheduleLeadId, setScheduleLeadId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<LeadScheduleFormState>({
    nextFollowUpAt: tomorrowAtNine()
  });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [returningLeadId, setReturningLeadId] = useState('');
  const [showColumnCustomizer, setShowColumnCustomizer] = useState(false);
  const [storedVisibleColumnIds, setStoredVisibleColumnIds] = useState<string[] | null>(() => {
    try {
      const stored = window.localStorage.getItem(`sunflower:lead-columns:${currentUser.uid}`);
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : null;
    } catch {
      return null;
    }
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
    const unsubscribe = dbService.subscribeCollection('leads', data => {
      setLeads(sortNewestFirst(data as LeadRecord[], lead => [lead.createdAt, lead.updatedAt]));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection('lead_candidates', data => {
      setCandidates(sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt]));
    });
    return unsubscribe;
  }, []);

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

  const saveVisibleLeadColumns = (selectedIds: string[]) => {
    const availableIds = new Set(leadColumnOptions.map(column => column.id));
    const requiredIds = leadColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(new Set([...requiredIds, ...selectedIds.filter(id => availableIds.has(id))]));
    setStoredVisibleColumnIds(nextIds);
    try {
      window.localStorage.setItem(`sunflower:lead-columns:${currentUser.uid}`, JSON.stringify(nextIds));
    } catch {
      // The current page state stays usable when the browser blocks local storage.
    }
    setShowColumnCustomizer(false);
  };

  const accessibleLeads = useMemo(() => leads.filter(lead => {
    if (!isActiveLeadRecord(lead)) return false;
    if (currentUser.role === 'admin') return true;
    return lead.assignedSaleId === currentUser.uid;
  }), [currentUser.role, currentUser.uid, leads]);

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
    + Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const leadAdvancedFilterCount = countAdvancedFilters(advancedFilters);
  const leadActiveFilterCount = leadQuickFilterCount + leadAdvancedFilterCount;
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
  ))).concat(getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
    id: `advanced-${summary.id}`,
    label: summary.label,
    onRemove: () => setAdvancedFilters(previous => {
      const next = { ...previous };
      delete next[summary.id];
      setLeadCurrentPage(1);
      return next;
    })
  })));

  const isOverdue = (lead: LeadRecord) => {
    if (!lead.nextFollowUpAt || ['won', 'lost', 'converted'].includes(lead.stage)) return false;
    const timestamp = new Date(lead.nextFollowUpAt).getTime();
    return Number.isFinite(timestamp) && timestamp < LEADS_PAGE_REFERENCE_TIME;
  };

  const filteredLeads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return accessibleLeads.filter(lead => {
      const leadFilterValues = getLeadFilterValues(lead, filterDefinitions);
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
      const matchesClassifications = Object.entries(dynamicFilters)
        .filter(([fieldId, selectedValues]) => visibleFilterIds.has(fieldId) && selectedValues.length > 0)
        .every(([fieldId, selectedValues]) => {
          const currentValues = leadFilterValues[fieldId] || [];
          return selectedValues.some(value => currentValues.includes(value));
        });
      const matchesCustomFields = customFieldDefinitions.filter(definition => definition.active).every(definition => {
        const selected = customFieldFilters[definition.id] || [];
        if (selected.length === 0) return true;
        const tokens = getEntityCustomFieldFilterTokens(definition, lead.customFieldValues?.[definition.id]);
        return selected.some(value => tokens.includes(value));
      });
      return matchesSearch
        && matchesClassifications
        && matchesCustomFields
        && matchesAdvancedFilters(lead, advancedFilterFields, advancedFilters);
    }).sort((left, right) => {
      const leftSchedule = getLeadScheduleTime(left);
      const rightSchedule = getLeadScheduleTime(right);
      if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
      return String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt));
    });
  }, [
    accessibleLeads,
    advancedFilterFields,
    advancedFilters,
    dynamicFilters,
    filterDefinitions,
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
  }, [searchTerm, dynamicFilters, customFieldFilters, advancedFilters]);

  const selectedLead = selectedLeadId
    ? leads.find(lead => lead.id === selectedLeadId) || null
    : null;

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
    setShowLeadForm(true);
  };

  const openEditForm = (lead: LeadRecord) => {
    setEditingLeadId(lead.id);
    setConvertingCandidateId('');
    setFormFilterValues(getLeadFilterValues(lead, filterDefinitions));
    setFormProfileValues(lead.profileValues || {});
    setCustomFieldValues(lead.customFieldValues || {});
    setUploadingFiles(lead.files || []);
    setTaxCodeSaveError('');
    setForm({
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      contactPosition: lead.contactPosition || '',
      phone: lead.phone,
      email: lead.email,
      website: lead.website || '',
      businessSector: lead.businessSector || '',
      taxCode: lead.taxCode,
      address: lead.address,
      province: lead.province,
      ward: lead.ward || '',
      industrialPark: lead.industrialPark || '',
      companySize: lead.companySize,
      source: lead.source,
      potentialValue: lead.potentialValue,
      expectedProducts: lead.expectedProducts,
      stage: lead.stage,
      assignedSaleId: lead.assignedSaleId,
      discoveredById: lead.discoveredById || lead.createdById,
      nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt),
      note: lead.note
    });
    setShowLeadForm(true);
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
        dbService.updateDocument('leads', scheduleLead.id, {
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
        }),
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
    } catch (error) {
      console.error('[Leads] Could not save follow-up schedule.', error);
      setScheduleError('Không thể lưu lịch hẹn. Vui lòng thử lại.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const openCreateFormFromCandidate = useCallback((candidate: LeadCandidateRecord) => {
    setEditingLeadId('');
    setConvertingCandidateId(candidate.id);
    setUploadingFiles([]);
    setFormProfileValues({});
    setCustomFieldValues({});
    setTaxCodeSaveError('');
    const leadSource = mapCandidateSourceToLeadSource(candidate.source);
    const sourceOptionId = findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.source, leadSource);
    setFormFilterValues({
      [LEAD_FILTER_IDS.source]: sourceOptionId ? [sourceOptionId] : [],
      [LEAD_FILTER_IDS.progress]: ['contacted']
    });
    const sourceReference = candidate.sourceUrl || candidate.website;
    const notes = [
      candidate.note,
      sourceReference ? `Nguồn dữ liệu: ${sourceReference}` : ''
    ].filter(Boolean).join('\n');
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
      taxCode: candidate.taxCode,
      address: candidate.address,
      province: candidate.province,
      ward: candidate.ward || '',
      industrialPark: candidate.industrialPark || '',
      source: leadSource,
      stage: 'contacted',
      assignedSaleId,
      discoveredById: candidate.discoveredById || candidate.createdById,
      nextFollowUpAt: toDateTimeLocal(candidate.queuedNextContactAt || candidate.nextContactAt),
      expectedProducts: candidate.expectedProducts || '',
      note: notes
    });
    setShowLeadForm(true);
  }, [currentUser, filterDefinitions, saleUsers]);

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
    setShowLeadForm(false);
    setConvertingCandidateId('');
  };

  const handleFormFilterValueChange = (
    field: LeadFilterDefinition,
    value: string,
    checked?: boolean
  ) => {
    setFormFilterValues(previous => updateLeadFilterValues(previous, field, value, checked));

    const selectedOption = findLeadFilterOption(filterDefinitions, field.id, value);
    const selectedLabel = selectedOption?.label || '';
    if (field.id === LEAD_FILTER_IDS.companySize) {
      updateForm('companySize', ['', 'large', 'medium', 'small'].includes(value) ? value as LeadCompanySize : '');
    } else if (field.id === LEAD_FILTER_IDS.province) {
      const selectedPath = findLeadFilterOptionPathInOptions(field.options, value);
      updateForm('province', selectedPath[0]?.label || '');
      updateForm('ward', selectedPath.find(option => option.kind === 'ward')?.label || '');
      updateForm('industrialPark', '');
      setFormFilterValues(previous => ({ ...previous, [LEAD_FILTER_IDS.industrialPark]: [] }));
    } else if (field.id === LEAD_FILTER_IDS.industrialPark) {
      updateForm('industrialPark', selectedLabel);
    } else if (field.id === LEAD_FILTER_IDS.source) {
      updateForm('source', selectedLabel);
    }
  };

  const handleLeadFilesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const nextFiles = await Promise.all(files.map(file => new Promise<LeadFileRecord>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        id: `lead-file-${file.lastModified}-${file.name}`,
        name: file.name,
        url: '',
        data: String(reader.result || '')
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
    setUploadingFiles(previous => [...previous, ...nextFiles]);
  };

  const handleSaveLead = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedTaxCode = normalizeTaxCode(form.taxCode);
    if (!form.companyName.trim() || !normalizedTaxCode) return;
    const missingCustomFields = getMissingRequiredEntityFields(customFieldDefinitions, customFieldValues, currentUser.role);
    if (missingCustomFields.length > 0) {
      setTaxCodeSaveError(`Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`);
      return;
    }
    const [latestLeadData, latestCustomerData, latestCandidateData] = await Promise.all([
      dbService.getCollection('leads'),
      dbService.getCollection('customers'),
      dbService.getCollection('lead_candidates')
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
      taxCode: normalizedTaxCode,
      address: form.address.trim(),
      province: form.province.trim(),
      ward: form.ward.trim(),
      industrialPark: form.industrialPark.trim(),
      companySize: form.companySize,
      source: form.source,
      potentialValue: Number(form.potentialValue),
      expectedProducts: form.expectedProducts.trim(),
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
      await dbService.updateDocument('leads', editingLeadId, payload);
    } else if (reusableLead) {
      savedLeadId = reusableLead.id;
      await dbService.updateDocument('leads', reusableLead.id, {
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
      });
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
      await dbService.updateDocument('lead_candidates', convertingCandidateId, {
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
      });
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
  };

  const handleLeadFilterValueChange = async (
    lead: LeadRecord,
    field: LeadFilterDefinition,
    value: string,
    checked?: boolean
  ) => {
    const currentValues = getLeadFilterValues(lead, filterDefinitions);
    const nextFilterValues = updateLeadFilterValues(currentValues, field, value, checked);
    const optionLabel = findLeadFilterOption(filterDefinitions, field.id, value)?.label || value || 'để trống';
    const actionLabel = field.type === 'multi_select' || field.type === 'checkbox'
      ? (checked ? 'Thêm' : 'Bỏ')
      : 'Cập nhật';
    const now = new Date().toISOString();
    const linkedProfileFields: Partial<Pick<LeadRecord, 'companySize' | 'province' | 'ward' | 'industrialPark' | 'source'>> = {};
    if (field.id === LEAD_FILTER_IDS.companySize && ['', 'large', 'medium', 'small'].includes(value)) {
      linkedProfileFields.companySize = value as LeadCompanySize;
    }
    if (field.id === LEAD_FILTER_IDS.province) {
      const selectedPath = findLeadFilterOptionPathInOptions(field.options, value);
      linkedProfileFields.province = selectedPath[0]?.label || '';
      linkedProfileFields.ward = selectedPath.find(option => option.kind === 'ward')?.label || '';
      linkedProfileFields.industrialPark = '';
      nextFilterValues[LEAD_FILTER_IDS.industrialPark] = [];
    }
    if (field.id === LEAD_FILTER_IDS.industrialPark) {
      linkedProfileFields.industrialPark = findLeadFilterOption(filterDefinitions, field.id, value)?.label || '';
    }
    if (field.id === LEAD_FILTER_IDS.source) {
      linkedProfileFields.source = field.options.find(item => item.id === value)?.label || '';
    }

    await dbService.updateDocument('leads', lead.id, {
      ...linkedProfileFields,
      filterValues: nextFilterValues,
      activities: [{
        id: `activity-filter-${now}`,
        type: 'filter_tag',
        note: `${actionLabel} ${field.name}: ${optionLabel}`,
        occurredAt: now,
        createdById: currentUser.uid,
        createdByName: currentUser.displayName
      }, ...(lead.activities || [])],
      updatedBy: currentUser.displayName
    });
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
    const canManage = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
    if (!canManage || lead.stage === 'converted' || lead.convertedCustomerId) return;
    if (!window.confirm(`Chuyển Lead “${lead.companyName}” về Dữ liệu thô? Lead sẽ rời danh sách tiềm năng và có thể được tiếp nhận lại sau.`)) return;

    setReturningLeadId(lead.id);
    try {
      const latestCandidates = await dbService.getCollection('lead_candidates') as LeadCandidateRecord[];
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
        expectedProducts: (lead.expectedProducts || '').trim(),
        source: linkedCandidate?.source || mapLeadSourceToCandidateSource(lead.source),
        sourceUrl: linkedCandidate?.sourceUrl || '',
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
        await dbService.updateDocument('lead_candidates', linkedCandidate.id, {
          ...candidatePayload,
          contactLogs: [returnLog, ...(linkedCandidate.contactLogs || [])].slice(0, 50)
        });
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

      await dbService.updateDocument('leads', lead.id, {
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
      });

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
      onNavigateToCustomerData();
    } catch (error) {
      console.error('[Leads] Could not return lead to raw data.', error);
      window.alert(isDocumentAlreadyExistsError(error)
        ? 'Doanh nghiệp này vừa được tạo trong Dữ liệu thô. Vui lòng kiểm tra lại danh sách.'
        : 'Không thể chuyển Lead về Dữ liệu thô. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.');
    } finally {
      setReturningLeadId('');
    }
  };

  const handleMarkFollowUpHandled = async (lead: LeadRecord) => {
    if (!lead.nextFollowUpAt || !Number.isFinite(getLeadScheduleTime(lead))) return;
    const canHandle = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
    if (!canHandle) return;

    const now = new Date().toISOString();
    const handledSchedule = lead.nextFollowUpAt;
    try {
      await dbService.updateDocument('leads', lead.id, {
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
      });

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
    } catch (error) {
      console.error('[Leads] Could not mark follow-up as handled.', error);
      window.alert('Không thể đánh dấu lịch chăm sóc đã xử lý. Vui lòng thử lại.');
    }
  };

  const handleDeleteLead = async (lead: LeadRecord) => {
    const canDelete = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
    if (!canDelete) return;
    if (!window.confirm(`Đưa Lead “${lead.companyName}” vào Thùng rác?`)) return;

    const now = new Date().toISOString();
    try {
      await dbService.updateDocument('leads', lead.id, {
        deleted: true,
        deletedAt: now,
        deletedById: currentUser.uid,
        deletedByName: currentUser.displayName,
        updatedAt: now,
        updatedBy: currentUser.displayName
      });
      if (selectedLeadId === lead.id) setSelectedLeadId('');

      auditService.recordSafely(currentUser, {
        category: 'business',
        module: 'leads',
        action: 'lead_deleted',
        summary: `Đưa Lead ${lead.companyName} vào Thùng rác`,
        targetType: 'lead',
        targetId: lead.id,
        targetLabel: lead.companyName
      });
    } catch (error) {
      console.error('[Leads] Could not delete lead.', error);
      window.alert('Không thể xóa Lead. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setDynamicFilters({});
    setCustomFieldFilters({});
    setAdvancedFilters({});
    setLeadCurrentPage(1);
  };

  const getClassificationLabel = (lead: LeadRecord, fieldId: string, fallback = '—') => {
    const optionIds = getLeadFilterValues(lead, filterDefinitions)[fieldId] || [];
    const labels = optionIds
      .map(optionId => findLeadFilterOption(filterDefinitions, fieldId, optionId)?.label)
      .filter(Boolean);
    return (fieldId === LEAD_FILTER_IDS.province ? labels.join(' · ') : labels[0]) || fallback;
  };

  const getProfileDisplayValue = (definition: LeadProfileFieldDefinition, values: string[]) => {
    if (definition.type === 'checkbox') return values[0] === 'true' ? 'Có' : 'Không';
    const labels = values.map(value => definition.options.find(option => option.id === value)?.label || value);
    return labels.join(', ') || '—';
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

  if (selectedLead) {
    const assignedSale = users.find(user => user.uid === selectedLead.assignedSaleId);
    return (
      <div className="lead-detail-page">
        <div className="lead-detail-header">
          <PageBackButton onClick={() => setSelectedLeadId('')} />
          <div>
            <div className="lead-detail-title">
              <span className={`lead-stage-badge lead-stage-badge--${selectedLead.stage}`}>{getStageLabel(selectedLead.stage)}</span>
              <h1>{selectedLead.companyName}</h1>
            </div>
            <p>{t('Thông tin, phân loại và kế hoạch chăm sóc khách hàng tiềm năng.')}</p>
          </div>
          <div className="lead-detail-actions">
            <button type="button" className="btn btn-outline" onClick={() => openEditForm(selectedLead)}>
              <Pencil size={15} /> {t('Chỉnh sửa')}
            </button>
            {!['converted'].includes(selectedLead.stage) && !selectedLead.convertedCustomerId && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => void handleReturnLeadToRawData(selectedLead)}
                disabled={returningLeadId === selectedLead.id || (currentUser.role !== 'admin' && selectedLead.assignedSaleId !== currentUser.uid)}
              >
                <Undo2 size={15} /> {returningLeadId === selectedLead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô')}
              </button>
            )}
            {!['converted', 'lost'].includes(selectedLead.stage) && (
              <button type="button" className="btn btn-primary" onClick={() => handleConvertLead(selectedLead)}>
                <UserCheck size={15} /> {t('Chuyển thành khách hàng')}
              </button>
            )}
            {selectedLead.stage === 'converted' && (
              <button type="button" className="btn btn-primary" onClick={onNavigateToCrm}>
                <Building2 size={15} /> {t('Mở CRM')}
              </button>
            )}
          </div>
        </div>

        <div className="lead-detail-layout">
          <section className="lead-panel">
            <div className="lead-panel__title"><Building2 size={17} /> {t('Hồ sơ doanh nghiệp')}</div>
            <div className="lead-info-grid">
              <span>{t('Người liên hệ')}</span><strong>{selectedLead.contactPerson || '—'}</strong>
              <span>{t('Chức vụ')}</span><strong>{selectedLead.contactPosition || '—'}</strong>
              <span>{t('Điện thoại')}</span><strong>{selectedLead.phone || '—'}</strong>
              <span>Email</span><strong>{selectedLead.email || '—'}</strong>
              <span>Website</span><strong>{selectedLead.website || '—'}</strong>
              <span>{t('Lĩnh vực hoạt động')}</span><strong>{selectedLead.businessSector || '—'}</strong>
              <span>{t('Mã số thuế')}</span><strong>{selectedLead.taxCode || '—'}</strong>
              <span>{t('Địa chỉ')}</span><strong>{selectedLead.address || '—'}</strong>
              <span>{t('Tỉnh / thành')}</span><strong>{getClassificationLabel(selectedLead, LEAD_FILTER_IDS.province, selectedLead.province || '—')}</strong>
              <span>{t('Khu công nghiệp')}</span><strong>{selectedLead.industrialPark || '—'}</strong>
              <span>{t('Quy mô')}</span><strong>{getClassificationLabel(selectedLead, LEAD_FILTER_IDS.companySize, COMPANY_SIZE_LABELS[selectedLead.companySize])}</strong>
              <span>{t('Nguồn Lead')}</span><strong>{getClassificationLabel(selectedLead, LEAD_FILTER_IDS.source, selectedLead.source || '—')}</strong>
              <span>{t('Sale phụ trách')}</span><strong>{assignedSale?.displayName || selectedLead.assignedSaleName || 'Chưa phân công'}</strong>
              <span>{t('Lịch chăm sóc tiếp theo')}</span><strong className={isOverdue(selectedLead) ? 'lead-date-overdue' : ''}>{formatDateTime(selectedLead.nextFollowUpAt)}</strong>
              <span>{t('Giá trị tiềm năng')}</span><strong>{selectedLead.potentialValue.toLocaleString('vi-VN')} đ</strong>
              {customProfileDefinitions
                .filter(definition => definition.active || (selectedLead.profileValues?.[definition.id] || []).length > 0)
                .map(definition => (
                  <React.Fragment key={definition.id}>
                    <span>{definition.name}</span>
                    <strong>{getProfileDisplayValue(definition, selectedLead.profileValues?.[definition.id] || [])}</strong>
                  </React.Fragment>
                ))}
            </div>
            <div className="lead-note-block">
              <strong>{t('Nhu cầu sản phẩm')}</strong>
              <p>{selectedLead.expectedProducts || t('Chưa cập nhật nhu cầu sản phẩm.')}</p>
            </div>
            <div className="lead-note-block">
              <strong>{t('Ghi chú')}</strong>
              <p>{selectedLead.note || t('Chưa có ghi chú.')}</p>
            </div>
            <EntityCustomFieldsReadOnly definitions={customFieldDefinitions} values={selectedLead.customFieldValues} />
            {(selectedLead.files || []).length > 0 && (
              <div className="lead-profile-files">
                <strong><Paperclip size={13} /> {t('Tài liệu đính kèm')}</strong>
                <div className="lead-files">
                  {(selectedLead.files || []).map(file => (
                    <a key={file.id} href={file.data || file.url} download={file.name} className="lead-file">
                      <FileText size={14} /><span>{file.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="lead-panel lead-classification-panel">
            <div className="lead-panel__title"><Tags size={17} /> {t('Phân loại khách hàng')}</div>
            <p className="lead-panel__hint">Các nhóm thông tin dùng để tìm và lọc Lead ngoài danh sách.</p>
            <LeadDynamicFields
              lead={selectedLead}
              definitions={filterDefinitions}
              canEditAll={currentUser.role === 'admin'}
              onChange={(field, value, checked) => handleLeadFilterValueChange(selectedLead, field, value, checked)}
            />
          </section>
        </div>
      </div>
    );
  }

  function renderLeadForm() {
    return (
      <SystemFieldSurface table="leads" className="lead-form-page">
        <header className="lead-form-page__header">
          <PageBackButton onClick={closeLeadForm} />
          <div>
            <span>{editingLeadId ? t('CHỈNH SỬA HỒ SƠ') : convertingCandidateId ? t('CHUYỂN TỪ DỮ LIỆU KHÁCH HÀNG') : t('HỒ SƠ MỚI')}</span>
            <h1>{editingLeadId ? t('Chỉnh sửa khách hàng tiềm năng') : convertingCandidateId ? t('Tiếp nhận khách hàng thành Lead') : t('Thêm khách hàng tiềm năng')}</h1>
          </div>
        </header>

        <form className="lead-form-page__form" onSubmit={handleSaveLead}>
          <div className="lead-form-page__content">
            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <Building2 size={18} />
                <div><h2>{t('Thông tin doanh nghiệp')}</h2><p>{t('Thông tin pháp lý và nhận diện doanh nghiệp.')}</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group lead-form-grid__wide"><label data-system-label="companyName">{t('Tên doanh nghiệp *')}</label><input autoFocus required value={form.companyName} onChange={event => updateForm('companyName', event.target.value)} /></div>
                <div className="form-group lead-form-grid__wide">
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
                <div className="form-group"><label data-system-label="businessSector">{t('Lĩnh vực hoạt động')}</label><input value={form.businessSector} onChange={event => updateForm('businessSector', event.target.value)} placeholder={t('Ví dụ: Bao bì, thực phẩm, điện tử...')} /></div>
                <div className="form-group lead-form-grid__wide"><label data-system-label="address">{t('Địa chỉ doanh nghiệp')}</label><input value={form.address} onChange={event => updateForm('address', event.target.value)} /></div>
              </div>
              <EntityCustomFieldsGrid definitions={customFieldDefinitions.filter(definition => definition.section === 'company')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="company" sectionLabel={t('Thông tin doanh nghiệp')} definitions={customFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'website', label: 'Website' }, { key: 'businessSector', label: 'Lĩnh vực hoạt động' }, { key: 'address', label: 'Địa chỉ doanh nghiệp' }]} />
            </section>

            <section className="lead-form-card lead-form-card--classification">
              <div className="lead-form-card__heading">
                <Tags size={18} />
                <div><h2>{t('Phân loại khách hàng')}</h2><p>{t('Thông tin chuẩn phục vụ tìm kiếm và đánh giá Lead.')}</p></div>
              </div>
              <LeadDynamicFields
                values={formFilterValues}
                definitions={filterDefinitions}
                canEditAll={currentUser.role === 'admin'}
                onChange={handleFormFilterValueChange}
              />
              <EntityCustomFieldsGrid definitions={customFieldDefinitions.filter(definition => definition.section === 'classification')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="classification" sectionLabel={t('Phân loại khách hàng')} definitions={customFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <UserCheck size={18} />
                <div><h2>{t('Liên hệ và nhu cầu')}</h2><p>{t('Đầu mối liên hệ, nhu cầu và giá trị cơ hội.')}</p></div>
              </div>
              <div className="lead-form-grid">
                <div className="form-group"><label data-system-label="contactPerson">{t('Người liên hệ')}</label><input value={form.contactPerson} onChange={event => updateForm('contactPerson', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="contactPosition">{t('Chức vụ')}</label><input value={form.contactPosition} onChange={event => updateForm('contactPosition', event.target.value)} placeholder={t('Ví dụ: Thu mua, Giám đốc...')} /></div>
                <div className="form-group"><label data-system-label="phone">{t('Điện thoại')}</label><input type="tel" value={form.phone} onChange={event => updateForm('phone', event.target.value)} /></div>
                <div className="form-group"><label data-system-label="email">Email</label><input type="email" value={form.email} onChange={event => updateForm('email', event.target.value)} /></div>
                <div className="form-group lead-form-grid__wide"><label data-system-label="expectedProducts">{t('Sản phẩm / nhu cầu quan tâm')}</label><textarea rows={3} value={form.expectedProducts} onChange={event => updateForm('expectedProducts', event.target.value)} placeholder={t('Tem nhãn, vật liệu, quy cách hoặc nhu cầu dự kiến...')} /></div>
                <div className="form-group"><label data-system-label="potentialValue">{t('Giá trị tiềm năng (đ)')}</label><input type="number" min="0" value={form.potentialValue} onChange={event => updateForm('potentialValue', Number(event.target.value))} /></div>
                <div className="form-group"><label data-system-label="stage">{t('Giai đoạn xử lý')}</label><select value={form.stage} onChange={event => updateForm('stage', event.target.value as LeadStage)}>{LEAD_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></div>
                <div className="form-group lead-form-grid__wide"><label data-system-label="note">{t('Ghi chú')}</label><textarea rows={3} value={form.note} onChange={event => updateForm('note', event.target.value)} placeholder={t('Thông tin cần lưu ý khi làm việc với khách hàng...')} /></div>
                <div className="form-group lead-form-grid__wide">
                  <label>{t('Tệp / tài liệu liên quan')}</label>
                  <div className="lead-file-dropzone">
                    <Paperclip size={18} />
                    <div><strong>{t('Chọn tệp từ máy tính')}</strong><span>{t('Có thể gắn nhiều báo giá, hình ảnh hoặc tài liệu liên quan.')}</span></div>
                    <input type="file" multiple onChange={handleLeadFilesChange} />
                  </div>
                  {uploadingFiles.length > 0 && (
                    <div className="lead-upload-list">
                      {uploadingFiles.map(file => (
                        <span key={file.id}>
                          <Paperclip size={12} /> {file.name}
                          <button type="button" onClick={() => setUploadingFiles(previous => previous.filter(item => item.id !== file.id))} aria-label={`${t('Bỏ tệp')} ${file.name}`}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <EntityCustomFieldsGrid definitions={customFieldDefinitions.filter(definition => definition.section === 'contact')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="contact" sectionLabel={t('Liên hệ và nhu cầu')} definitions={customFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'contactPerson', label: 'Người liên hệ' }, { key: 'contactPosition', label: 'Chức vụ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'email', label: 'Email' }, { key: 'expectedProducts', label: 'Sản phẩm / nhu cầu quan tâm' }, { key: 'potentialValue', label: 'Giá trị tiềm năng' }, { key: 'stage', label: 'Giai đoạn xử lý' }, { key: 'note', label: 'Ghi chú' }]} />
            </section>

            <section className="lead-form-card">
              <div className="lead-form-card__heading">
                <CalendarClock size={18} />
                <div><h2>{t('Phụ trách và lịch làm việc')}</h2><p>{t('Phân công rõ người chịu trách nhiệm và lịch chăm sóc.')}</p></div>
              </div>
              <div className="lead-form-grid">
                <div className={`form-group${currentUser.role === 'admin' ? '' : ' lead-form-grid__wide'}`}>
                  <label data-system-label="assignedSaleId">{t('Sale phụ trách')}</label>
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
                  <label data-system-label="nextFollowUpAt">{t('Lịch chăm sóc tiếp theo')}</label>
                  <input type="datetime-local" value={form.nextFollowUpAt} onChange={event => updateForm('nextFollowUpAt', event.target.value)} />
                </div>
              </div>
              <div className="lead-fixed-form-note">{t('Trường hệ thống được giữ ổn định; Admin có thể bổ sung trường riêng cho khung này.')}</div>
              <EntityCustomFieldsGrid definitions={customFieldDefinitions.filter(definition => definition.section === 'assignment')} values={customFieldValues} role={currentUser.role} onChange={setCustomFieldValues} />
              <InlineEntityFieldManager table="leads" section="assignment" sectionLabel={t('Phụ trách và lịch làm việc')} definitions={customFieldDefinitions} currentUser={currentUser} systemConfiguration={inlineSystemFieldConfiguration} onCustomFieldPurged={clearPurgedCustomField} onSystemFieldPurged={clearPurgedSystemField} systemFields={[{ key: 'discoveredById', label: 'Sale tìm được Lead' }, { key: 'nextFollowUpAt', label: 'Lịch chăm sóc tiếp theo' }]} />
            </section>

            <EntityCustomFieldsSection
              definitions={customFieldDefinitions.filter(definition => definition.section === 'additional')}
              values={customFieldValues}
              role={currentUser.role}
              onChange={setCustomFieldValues}
            />
          </div>
          <footer className="lead-form-page__footer">
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
        current={workspaceTab === 'performance' ? t('Khách hàng của Sale') : t('Danh sách Lead')}
      />

      <div className="lead-page-navigation lead-candidate-commandbar">
        <div className="lead-workspace-tabs content-tabs content-tabs--compact" role="tablist" aria-label="Không gian quản lý Lead">
          <button type="button" role="tab" aria-selected={workspaceTab === 'list'} className={workspaceTab === 'list' ? 'is-active' : ''} onClick={() => setWorkspaceTab('list')}><List size={16} /> Danh sách Lead <span>{accessibleLeads.length}</span></button>
          {currentUser.role === 'admin' && <button type="button" role="tab" aria-selected={workspaceTab === 'performance'} className={workspaceTab === 'performance' ? 'is-active' : ''} onClick={() => setWorkspaceTab('performance')}><Users size={16} /> Khách hàng của Sale</button>}
        </div>
        {workspaceTab === 'list' && (
          <section className="lead-page-navigation__tools lead-candidate-toolbar">
            <div className="lead-search">
              <Search size={16} />
              <input value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setLeadCurrentPage(1); }} placeholder={t('Tìm công ty, liên hệ, SĐT, địa chỉ, nhu cầu, nhãn...')} />
            </div>
            <DataFilterButton activeCount={leadActiveFilterCount} open={showLeadFilters} onClick={() => setShowLeadFilters(true)} />
            <button type="button" className="lead-candidate-column-button" aria-label={t('Tùy chỉnh cột')} title={t('Tùy chỉnh cột')} onClick={() => setShowColumnCustomizer(true)}>
              <Settings2 size={16} />
            </button>
            {(searchTerm || leadActiveFilterCount > 0) && <button type="button" className="btn btn-outline lead-toolbar-reset" onClick={clearFilters}><X size={14} /> Đặt lại</button>}
            <button type="button" className="btn btn-primary" onClick={openCreateForm}><Plus size={16} /> {t('Thêm Lead')}</button>
          </section>
        )}
      </div>

      {workspaceTab === 'performance' && currentUser.role === 'admin' ? (
        <LeadSalesWorkspace
          leads={leads}
          candidates={candidates}
          saleUsers={saleUsers}
          definitions={filterDefinitions}
          onOpenLead={setSelectedLeadId}
        />
      ) : (
        <div className="lead-data-workspace">
          <DataFilterChipBar chips={leadFilterChips} onClear={clearFilters} />

          <DataFilterPanel
            open={showLeadFilters}
            title="Lọc danh sách Lead"
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
                style={{ minWidth: `${Math.max(1180, visibleLeadColumnCount * 150)}px` }}
              >
                <thead><tr>
                  <th data-system-field="companyName">{t('Doanh nghiệp')}</th>
                  {visibleLeadColumnIds.has('taxCode') && <th data-system-field="taxCode">{t('Mã số thuế')}</th>}
                  {visibleLeadColumnIds.has('website') && <th data-system-field="website">Website</th>}
                  {visibleLeadColumnIds.has('businessSector') && <th data-system-field="businessSector">{t('Lĩnh vực hoạt động')}</th>}
                  {visibleLeadColumnIds.has('address') && <th data-system-field="address">{t('Địa chỉ doanh nghiệp')}</th>}
                  {visibleLeadColumnIds.has('companySize') && <th data-system-field="companySize">{t('Quy mô')}</th>}
                  {visibleLeadColumnIds.has('source') && <th data-system-field="source">{t('Khu vực')}</th>}
                  {visibleLeadColumnIds.has('sourceValue') && <th data-system-field="sourceValue">{t('Nguồn tìm kiếm')}</th>}
                  {visibleLeadColumnIds.has('province') && <th data-system-field="province">{t('Tỉnh/thành')}</th>}
                  {visibleLeadColumnIds.has('ward') && <th data-system-field="ward">{t('Phường/xã')}</th>}
                  {visibleLeadColumnIds.has('industrialPark') && <th data-system-field="industrialPark">{t('Khu công nghiệp')}</th>}
                  {visibleLeadColumnIds.has('contact') && <th data-system-field="contact">{t('Liên hệ')}</th>}
                  {visibleLeadColumnIds.has('contactPerson') && <th data-system-field="contactPerson">{t('Người liên hệ')}</th>}
                  {visibleLeadColumnIds.has('contactPosition') && <th data-system-field="contactPosition">{t('Chức vụ')}</th>}
                  {visibleLeadColumnIds.has('phone') && <th data-system-field="phone">{t('Điện thoại')}</th>}
                  {visibleLeadColumnIds.has('email') && <th data-system-field="email">Email</th>}
                  {visibleLeadColumnIds.has('expectedProducts') && <th data-system-field="expectedProducts">{t('Sản phẩm / nhu cầu quan tâm')}</th>}
                  {visibleLeadColumnIds.has('potentialValue') && <th data-system-field="potentialValue">{t('Giá trị tiềm năng')}</th>}
                  {visibleLeadColumnIds.has('stage') && <th data-system-field="stage">{t('Giai đoạn xử lý')}</th>}
                  {visibleLeadColumnIds.has('note') && <th data-system-field="note">{t('Ghi chú')}</th>}
                  {visibleLeadColumnIds.has('assignedSale') && <th data-system-field="assignedSaleId">{t('Sale phụ trách')}</th>}
                  {visibleLeadColumnIds.has('discoveredBy') && <th data-system-field="discoveredById">{t('Sale tìm được Lead')}</th>}
                  {visibleLeadColumnIds.has('nextFollowUpAt') && <th data-system-field="nextFollowUpAt">{t('Chăm sóc tiếp')}</th>}
                  {visibleLeadCustomFields.map(definition => <th key={definition.id}>{definition.name}</th>)}
                  <th>{t('Thao tác')}</th>
                </tr></thead>
                <tbody>
                  {displayedLeads.map(lead => (
                    <tr key={lead.id} onClick={() => setSelectedLeadId(lead.id)}>
                      <td><strong className="erp-company-name" title={lead.companyName}>{lead.companyName}</strong></td>
                      {visibleLeadColumnIds.has('taxCode') && <td>{renderLeadText(lead.taxCode)}</td>}
                      {visibleLeadColumnIds.has('website') && <td>{renderLeadText(lead.website)}</td>}
                      {visibleLeadColumnIds.has('businessSector') && <td>{renderLeadText(lead.businessSector)}</td>}
                      {visibleLeadColumnIds.has('address') && <td>{renderLeadText(lead.address)}</td>}
                      {visibleLeadColumnIds.has('companySize') && <td>{renderLeadText(COMPANY_SIZE_LABELS[lead.companySize])}</td>}
                      {visibleLeadColumnIds.has('source') && <td>{renderLeadText([lead.province, lead.ward, lead.industrialPark].filter(Boolean).join(' · '))}</td>}
                      {visibleLeadColumnIds.has('sourceValue') && <td>{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.source, lead.source || ''))}</td>}
                      {visibleLeadColumnIds.has('province') && <td>{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.province, lead.province || ''))}</td>}
                      {visibleLeadColumnIds.has('ward') && <td>{renderLeadText(lead.ward)}</td>}
                      {visibleLeadColumnIds.has('industrialPark') && <td>{renderLeadText(getClassificationLabel(lead, LEAD_FILTER_IDS.industrialPark, lead.industrialPark || ''))}</td>}
                      {visibleLeadColumnIds.has('contact') && <td>{renderLeadText(lead.contactPerson)}</td>}
                      {visibleLeadColumnIds.has('contactPerson') && <td>{renderLeadText(lead.contactPerson)}</td>}
                      {visibleLeadColumnIds.has('contactPosition') && <td>{renderLeadText(lead.contactPosition)}</td>}
                      {visibleLeadColumnIds.has('phone') && <td>{renderLeadText(lead.phone)}</td>}
                      {visibleLeadColumnIds.has('email') && <td>{renderLeadText(lead.email)}</td>}
                      {visibleLeadColumnIds.has('expectedProducts') && <td>{renderLeadText(lead.expectedProducts)}</td>}
                      {visibleLeadColumnIds.has('potentialValue') && <td><strong>{lead.potentialValue.toLocaleString('vi-VN')} đ</strong></td>}
                      {visibleLeadColumnIds.has('stage') && <td>{renderLeadText(getStageLabel(lead.stage))}</td>}
                      {visibleLeadColumnIds.has('note') && <td>{renderLeadText(lead.note)}</td>}
                      {visibleLeadColumnIds.has('assignedSale') && <td>{users.find(user => user.uid === lead.assignedSaleId)?.displayName || lead.assignedSaleName || 'Chưa phân công'}</td>}
                      {visibleLeadColumnIds.has('discoveredBy') && <td>{renderLeadText(users.find(user => user.uid === lead.discoveredById)?.displayName || lead.discoveredByName)}</td>}
                      {visibleLeadColumnIds.has('nextFollowUpAt') && <td>{renderFollowUp(lead)}</td>}
                      {visibleLeadCustomFields.map(definition => <td key={definition.id}>{formatEntityCustomFieldValue(definition, lead.customFieldValues?.[definition.id])}</td>)}
                      <td>
                        <RowActionMenu
                          label={`${t('Thao tác')} ${lead.companyName}`}
                          actions={[
                            { label: t('Chi tiết'), icon: <Eye size={14} />, onSelect: () => setSelectedLeadId(lead.id) },
                            { label: t('Chỉnh sửa'), icon: <Pencil size={14} />, onSelect: () => openEditForm(lead) },
                            { label: t('Hẹn lịch'), icon: <CalendarClock size={14} />, onSelect: () => openScheduleForm(lead) },
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
                    </tr>
                  ))}
                  {filteredLeads.length === 0 && <tr><td colSpan={visibleLeadColumnCount} className="lead-empty">{t('Không có Lead phù hợp với bộ lọc.')}</td></tr>}
                </tbody>
              </ConfiguredSystemTable>
            </div>
            {filteredLeads.length > 0 && (
              <footer className="lead-candidate-pagination lead-table-pagination">
                <label>
                  Hiển thị
                  <select value={leadPageSize} onChange={event => { setLeadPageSize(Number(event.target.value)); setLeadCurrentPage(1); }}>
                    <option value={25}>25 dòng</option>
                    <option value={50}>50 dòng</option>
                    <option value={100}>100 dòng</option>
                  </select>
                </label>
                <span>{(safeLeadCurrentPage - 1) * leadPageSize + 1}–{Math.min(safeLeadCurrentPage * leadPageSize, filteredLeads.length)} trong {filteredLeads.length}</span>
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

    </SystemFieldSurface>
  );
};
