import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import { SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import { PageContextHeader } from '@/components/PageContextHeader';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { type CustomerRecord, type LeadRecord } from '@/features/crm/model/crmModels';
import {
  createCandidateDocumentIdFromTaxCode,
  findCandidateDuplicate,
  LEAD_CANDIDATE_SCHEMA_VERSION,
  type LeadCandidateContactLog,
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
import { getSystemFilterDefinition, isSystemFilterEnabled } from '@/domain/systemFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { getNotificationDocumentId, NOTIFICATION_SCHEMA_VERSION } from '@/domain/notificationModels';
import { dbService, isDocumentAlreadyExistsError, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { candidateCallSubjectKey } from '@/features/crm/model/callHistory';
import { PageBackButton } from '@/components/PageBackButton';

import { CustomerInsightClassification } from './CustomerInsightClassification';
import { CrmRecordHeaderFacts, CrmRecordHeaderIdentity, CrmRecordHeaderTabs } from './CrmRecordHeader';
import {
  CUSTOMER_INSIGHT_ITEMS,
  CUSTOMER_INSIGHT_ITEM_BY_ID,
  matchesCustomerInsightValues
} from '@/features/crm/model/customerInsightCatalog';

import { SupportRequestDialog, type SupportRequestTarget } from '@/components/SupportRequestDialog';
import { WorkAssignmentDialog, type WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import { RawDataOverview } from './RawDataOverview';
import { RawDataScoringPage } from './RawDataScoringPage';
import { LeadCandidateScoreDialog } from './LeadCandidateScoreDialog';
import { TableColumnCustomizer } from '@/components/TableColumnCustomizer';

import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';

import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import {
  getMissingRequiredEntityFields,
  getEntityCustomFieldFilterLabel,
  getEntityCustomFieldFilterTokens,
  type EntityCustomFieldValues
} from '@/features/crm/model/entityFieldConfig';
import { DataFilterChipBar } from '@/components/DataWorkspaceFilters';
import {
  countAdvancedFilters,
  getAdvancedFilterKindForFieldType,
  getAdvancedFilterSummaries,
  matchesAdvancedFilters,
  toAdvancedFilterValues,
  type AdvancedFilterField,
  type AdvancedFilterState
} from '@/components/advancedDataFilterModel';
import {
  type CandidateFormState,
  type ScheduleFormState,
  CANDIDATE_SOURCES,
  type CandidateWorkspaceView,
  type CandidateSort,
  type CandidateColumnId,
  type CandidateDetailTab,
  isClassificationOwnedProfileField,
  getAvailableColumns,
  CONTACT_STATUS_LABELS,
  POTENTIAL_LEVEL_LABELS,
  CONTACT_RESULT_OUTCOMES,
  CANDIDATE_STAGE_LABELS,
  toDateTimeLocal,
  tomorrowAtNine,
  formatShortDateTime,
  isVisibleTask,
  createLogId,
  latestCandidateLog,
  describeCandidateLog,
  createEmptyCandidateForm,
  matchesSearch,
  describeDuplicate
} from './leadCandidateWorkspace/leadCandidateWorkspaceConfig';
import { LeadCandidateProfileFields } from './leadCandidateWorkspace/LeadCandidateProfileFields';
import { LeadCandidateTaskTable } from './leadCandidateWorkspace/LeadCandidateTaskTable';
import { LeadCandidateDataTable } from './leadCandidateWorkspace/LeadCandidateDataTable';
import { LeadCandidateCommandBar } from './leadCandidateWorkspace/LeadCandidateCommandBar';
import { LeadCandidateBatchBar } from './leadCandidateWorkspace/LeadCandidateBatchBar';
import { LeadCandidateFilterPanel } from './leadCandidateWorkspace/LeadCandidateFilterPanel';
import { EmployeeActivityMonitor } from './leadCandidateWorkspace/EmployeeActivityMonitor';
import { useEmployeeActivityMonitor } from '@/features/crm/hooks/useEmployeeActivityMonitor';
import { LeadCandidateScheduleDialog } from './leadCandidateWorkspace/LeadCandidateScheduleDialog';

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
  const provinceFilterEnabled = isSystemFilterEnabled(
    systemFilterDefinitions,
    LEAD_FILTER_IDS.province,
    'customer_data'
  );
  const industrialParkFilterEnabled = isSystemFilterEnabled(
    systemFilterDefinitions,
    LEAD_FILTER_IDS.industrialPark,
    'customer_data'
  );
  const sourceFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, LEAD_FILTER_IDS.source, 'customer_data');
  const contactResultFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'contact_result', 'customer_data');
  const potentialFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'potential_level', 'customer_data');
  const saleFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, CUSTOMER_FILTER_IDS.sale, 'customer_data');
  const pinnedFilterEnabled = isSystemFilterEnabled(systemFilterDefinitions, 'pinned', 'customer_data');
  const configuredFilterName = (filterId: string, fallback: string) =>
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.name || fallback;
  const configuredFilterDescription = (filterId: string, fallback = '') =>
    getSystemFilterDefinition(systemFilterDefinitions, filterId)?.description || fallback;
  const candidateOwners = useMemo(
    () =>
      currentUser.role === 'admin'
        ? [currentUser, ...saleUsers.filter(user => user.uid !== currentUser.uid)]
        : saleUsers.some(user => user.uid === currentUser.uid)
          ? saleUsers
          : [currentUser, ...saleUsers],
    [currentUser, saleUsers]
  );
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
  const [createdCandidateSnapshot, setCreatedCandidateSnapshot] = useState<LeadCandidateRecord | null>(null);
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
  const [supportTarget, setSupportTarget] = useState<SupportRequestTarget | null>(null);
  const [assignmentTarget, setAssignmentTarget] = useState<WorkAssignmentTarget | null>(null);

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

  const clearPurgedCustomField = (fieldId: string) =>
    setCustomFieldValues(previous => {
      const next = { ...previous };
      delete next[fieldId];
      return next;
    });
  const clearPurgedSystemField = (fieldKey: string) =>
    setForm(previous => ({
      ...previous,
      [fieldKey]: typeof (previous as unknown as Record<string, unknown>)[fieldKey] === 'number' ? 0 : ''
    }));

  const availableColumnOptions = getAvailableColumns(
    workspaceView,
    currentUser.role === 'admin',
    customFieldDefinitions,
    inlineSystemFieldConfiguration.fields
  );
  const candidateColumnLayoutId = `lead-candidates:${workspaceView}`;
  const {
    selectedIds: sharedVisibleColumns,
    setSelectedIds: setSharedVisibleColumns,
    canEditColumns
  } = useSharedTableColumns({
    layoutId: candidateColumnLayoutId,
    legacySelectionKey: `sunflower:lead-candidate-columns:${currentUser.uid}`,
    legacySelectionView: workspaceView,
    legacyWidthKey: `sunflower:lead-candidate-column-widths:v2:${currentUser.uid}:${workspaceView}`
  });
  const visibleColumnSet = new Set([
    ...availableColumnOptions.filter(column => column.required).map(column => column.id),
    ...(sharedVisibleColumns ||
      availableColumnOptions.filter(column => column.defaultVisible !== false).map(column => column.id))
  ]);
  const saveVisibleColumns = (selectedIds: string[]) => {
    if (!canEditColumns) return;
    const availableIds = new Set(availableColumnOptions.map(column => column.id));
    const requiredIds = availableColumnOptions.filter(column => column.required).map(column => column.id);
    const nextIds = Array.from(
      new Set([
        ...requiredIds,
        ...selectedIds.filter((id): id is CandidateColumnId => availableIds.has(id as CandidateColumnId))
      ])
    );
    setSharedVisibleColumns(nextIds);
    setShowColumnCustomizer(false);
  };
  const { orderedColumnIds, getHeaderProps, resizedTableWidth } = useReorderableTableColumns({
    columns: availableColumnOptions,
    selectedIds: Array.from(visibleColumnSet),
    onOrderChange: saveVisibleColumns,
    layoutId: candidateColumnLayoutId,
    lockedStartIds: workspaceView === 'all' ? ['select', 'index', 'company'] : ['index', 'company'],
    lockedEndIds: ['actions']
  });
  const candidateColumnLabels = Object.fromEntries(availableColumnOptions.map(column => [column.id, column.label]));
  const visibleCandidateInsightItems = CUSTOMER_INSIGHT_ITEMS.filter(entry =>
    visibleColumnSet.has(`insight:${entry.id}`)
  );
  const candidateTableDefaultWidth = Math.max(
    1180,
    orderedColumnIds.reduce((total, columnId) => {
      if (columnId === 'select') return total + 36;
      if (columnId === 'index') return total + 52;
      if (columnId === 'company') return total + 280;
      if (columnId === 'actions') return total + 72;
      return total + 150;
    }, 0)
  );
  const candidateTableStyle = {
    '--erp-table-resized-width': `${resizedTableWidth || candidateTableDefaultWidth}px`
  } as React.CSSProperties;

  const accessibleCandidates = useMemo(
    () =>
      candidates.filter(
        candidate =>
          !candidate.archived && (currentUser.role !== 'sale' || candidate.assignedSaleId === currentUser.uid)
      ),
    [candidates, currentUser.role, currentUser.uid]
  );
  const overviewCandidates = useMemo(
    () =>
      currentUser.role === 'sale'
        ? accessibleCandidates.filter(candidate => candidate.discoveredById === currentUser.uid)
        : accessibleCandidates,
    [accessibleCandidates, currentUser.role, currentUser.uid]
  );
  const overviewSaleUsers = useMemo(
    () => (currentUser.role === 'sale' ? saleUsers.filter(user => user.uid === currentUser.uid) : saleUsers),
    [currentUser.role, currentUser.uid, saleUsers]
  );

  const taskCandidates = useMemo(
    () =>
      accessibleCandidates.filter(
        candidate =>
          isVisibleTask(candidate) && (currentUser.role === 'admin' || candidate.assignedSaleId === currentUser.uid)
      ),
    [accessibleCandidates, currentUser.role, currentUser.uid]
  );

  const {
    employeeCards,
    selectedManagedSaleId,
    setSelectedManagedSaleId,
    selectedEmployeeCard,
    salesReportWindow,
    salesReportPeriod,
    setSalesReportPeriod,
    salesReportStart,
    salesReportEnd,
    setSalesReportStart,
    setSalesReportEnd,
    salesReportLoading,
    salesReportError,
    selectedSalesReport,
    employeeActivityRange,
    setEmployeeActivityRange,
    employeeActivityGroup,
    setEmployeeActivityGroup,
    selectedEmployeeActivities
  } = useEmployeeActivityMonitor({
    enabled: workspaceView === 'management' && currentUser.role === 'admin',
    saleUsers,
    accessibleCandidates,
    referenceTime
  });

  const provinceOptions = useMemo(
    () =>
      Array.from(new Set(accessibleCandidates.map(candidate => candidate.province.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, 'vi-VN')
      ),
    [accessibleCandidates]
  );
  const industrialParkOptions = useMemo(
    () =>
      Array.from(new Set(accessibleCandidates.map(candidate => candidate.industrialPark.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right, 'vi-VN')
      ),
    [accessibleCandidates]
  );

  const customFilterOptions = useMemo(
    () =>
      Object.fromEntries(
        customFieldDefinitions
          .filter(definition => definition.active)
          .map(definition => [
            definition.id,
            Array.from(
              new Set(
                accessibleCandidates.flatMap(candidate =>
                  getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id])
                )
              )
            )
              .map(value => ({ value, label: getEntityCustomFieldFilterLabel(definition, value) }))
              .sort((left, right) => left.label.localeCompare(right.label, 'vi-VN'))
          ])
      ),
    [accessibleCandidates, customFieldDefinitions]
  );

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
      return configuration?.removed
        ? null
        : { id: `system:${id}`, label: configuration?.label || fallbackLabel, group, kind, getValues, options };
    };
    const customFields: AdvancedFilterField<LeadCandidateRecord>[] = customFieldDefinitions
      .filter(definition => definition.active)
      .map(definition => ({
        id: `custom:${definition.id}`,
        label: definition.name,
        group: groups[definition.section as keyof typeof groups] || groups.additional,
        kind: getAdvancedFilterKindForFieldType(definition.type),
        description: definition.description,
        options:
          definition.type === 'boolean'
            ? [
                { value: 'true', label: 'Có' },
                { value: 'false', label: 'Không' }
              ]
            : definition.options
                .filter(option => option.active)
                .map(option => ({ value: option.id, label: option.label })),
        getValues: candidate => toAdvancedFilterValues(candidate.customFieldValues?.[definition.id])
      }));
    return [
      systemField('companyName', 'Tên doanh nghiệp', groups.company, 'text', candidate => [candidate.companyName]),
      systemField('taxCode', 'Mã số thuế', groups.company, 'text', candidate => [candidate.taxCode]),
      systemField('website', 'Website', groups.company, 'text', candidate => [candidate.website]),
      systemField('businessSector', 'Lĩnh vực hoạt động', groups.company, 'text', candidate => [
        candidate.businessSector
      ]),
      systemField('province', 'Tỉnh / thành', groups.company, 'text', candidate => [candidate.province]),
      systemField('ward', 'Phường / xã', groups.company, 'text', candidate => [candidate.ward]),
      systemField('industrialPark', 'Khu công nghiệp', groups.company, 'text', candidate => [candidate.industrialPark]),
      systemField('address', 'Địa chỉ doanh nghiệp', groups.company, 'text', candidate => [candidate.address]),
      systemField('contactPerson', 'Người liên hệ', groups.contact, 'text', candidate => [candidate.contactPerson]),
      systemField('contactPosition', 'Chức vụ', groups.contact, 'text', candidate => [candidate.contactPosition]),
      systemField('phone', 'Điện thoại', groups.contact, 'text', candidate => [candidate.phone]),
      systemField('email', 'Email', groups.contact, 'text', candidate => [candidate.email]),
      systemField(
        'source',
        'Nguồn tìm kiếm',
        groups.contact,
        'select',
        candidate => [candidate.source],
        CANDIDATE_SOURCES.map(source => ({ value: source, label: source }))
      ),
      systemField('sourceUrl', 'Đường dẫn nguồn', groups.contact, 'text', candidate => [candidate.sourceUrl]),
      systemField('expectedProducts', 'Sản phẩm / nhu cầu quan tâm', groups.needs, 'text', candidate => [
        candidate.expectedProducts
      ]),
      systemField('note', 'Ghi chú', groups.needs, 'text', candidate => [candidate.note]),
      systemField(
        'assignedSaleId',
        'Sale phụ trách',
        groups.assignment,
        'select',
        candidate => [candidate.assignedSaleId],
        candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField(
        'discoveredById',
        'Sale tìm được dữ liệu',
        groups.assignment,
        'select',
        candidate => [candidate.discoveredById],
        candidateOwners.map(user => ({ value: user.uid, label: user.displayName }))
      ),
      systemField(
        'contactResult',
        'Trạng thái liên hệ',
        groups.assignment,
        'select',
        candidate => [candidate.contactResult],
        Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
      ),
      systemField(
        'potentialLevel',
        'Mức độ tiềm năng',
        groups.assignment,
        'select',
        candidate => [candidate.potentialLevel],
        Object.entries(POTENTIAL_LEVEL_LABELS).map(([value, label]) => ({ value, label }))
      ),
      systemField('nextContactAt', 'Lịch hẹn xử lý', groups.assignment, 'date', candidate => [candidate.nextContactAt]),
      systemField('updatedAt', 'Cập nhật gần nhất', groups.assignment, 'date', candidate => [candidate.updatedAt]),
      ...customFields
    ].filter((field): field is AdvancedFilterField<LeadCandidateRecord> => Boolean(field));
  }, [candidateOwners, customFieldDefinitions, inlineSystemFieldConfiguration.fields]);

  const advancedFilterCount = countAdvancedFilters(advancedFilters);

  const filteredCandidates = useMemo(() => {
    const sourceCandidates = workspaceView === 'tasks' ? taskCandidates : accessibleCandidates;
    return sourceCandidates
      .filter(candidate => {
        const matchesSale =
          !saleFilterEnabled || saleFilters.length === 0 || saleFilters.includes(candidate.assignedSaleId);
        const matchesSource =
          !sourceFilterEnabled || sourceFilters.length === 0 || sourceFilters.includes(candidate.source);
        const matchesProvince =
          !provinceFilterEnabled || provinceFilters.length === 0 || provinceFilters.includes(candidate.province);
        const matchesIndustrialPark =
          !industrialParkFilterEnabled ||
          industrialParkFilters.length === 0 ||
          industrialParkFilters.includes(candidate.industrialPark);
        const matchesContactResult =
          !contactResultFilterEnabled ||
          contactResultFilters.length === 0 ||
          contactResultFilters.includes(candidate.contactResult);
        const matchesPotential =
          !potentialFilterEnabled ||
          potentialFilters.length === 0 ||
          potentialFilters.includes(candidate.potentialLevel);
        const matchesCustomFields = customFieldDefinitions
          .filter(definition => definition.active)
          .every(definition => {
            const selected = customFieldFilters[definition.id] || [];
            if (selected.length === 0) return true;
            const tokens = getEntityCustomFieldFilterTokens(definition, candidate.customFieldValues?.[definition.id]);
            return selected.some(value => tokens.includes(value));
          });
        return (
          matchesSale &&
          matchesSource &&
          matchesProvince &&
          matchesIndustrialPark &&
          matchesContactResult &&
          matchesPotential &&
          matchesCustomerInsightValues(candidate.customerInsightValues || [], insightFilters) &&
          matchesCustomFields &&
          matchesAdvancedFilters(candidate, advancedFilterFields, advancedFilters) &&
          (!pinnedFilterEnabled || !pinnedOnly || candidate.pinned) &&
          matchesSearch(candidate, searchTerm, customFieldDefinitions)
        );
      })
      .sort((left, right) => {
        if (workspaceView === 'tasks') {
          if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
          if (candidateSort === 'updated_desc') {
            return (
              new Date(right.updatedAt || right.createdAt).getTime() -
              new Date(left.updatedAt || left.createdAt).getTime()
            );
          }
          if (candidateSort === 'priority') {
            const leftAdminPriority = left.taskSource === 'admin_assigned';
            const rightAdminPriority = right.taskSource === 'admin_assigned';
            if (leftAdminPriority !== rightAdminPriority) return leftAdminPriority ? -1 : 1;
          }
          const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
          return (
            new Date(right.updatedAt || right.createdAt).getTime() -
            new Date(left.updatedAt || left.createdAt).getTime()
          );
        }
        if (candidateSort === 'company_asc') return left.companyName.localeCompare(right.companyName, 'vi-VN');
        if (candidateSort === 'next_contact_asc') {
          const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
          return leftSchedule - rightSchedule;
        }
        if (candidateSort === 'updated_desc') {
          return (
            new Date(right.updatedAt || right.createdAt).getTime() -
            new Date(left.updatedAt || left.createdAt).getTime()
          );
        }
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        const leftSchedule = left.nextContactAt ? new Date(left.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightSchedule = right.nextContactAt ? new Date(right.nextContactAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftSchedule !== rightSchedule) return leftSchedule - rightSchedule;
        return (
          new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime()
        );
      });
  }, [
    accessibleCandidates,
    advancedFilterFields,
    advancedFilters,
    candidateSort,
    contactResultFilterEnabled,
    contactResultFilters,
    customFieldDefinitions,
    customFieldFilters,
    industrialParkFilterEnabled,
    industrialParkFilters,
    insightFilters,
    pinnedFilterEnabled,
    pinnedOnly,
    potentialFilterEnabled,
    potentialFilters,
    provinceFilterEnabled,
    provinceFilters,
    saleFilterEnabled,
    saleFilters,
    searchTerm,
    sourceFilterEnabled,
    sourceFilters,
    taskCandidates,
    workspaceView
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const displayedCandidates = filteredCandidates.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const quickFilterCount =
    (provinceFilterEnabled ? provinceFilters.length : 0) +
    (industrialParkFilterEnabled ? industrialParkFilters.length : 0) +
    (sourceFilterEnabled ? sourceFilters.length : 0) +
    (contactResultFilterEnabled ? contactResultFilters.length : 0) +
    (potentialFilterEnabled ? potentialFilters.length : 0) +
    (saleFilterEnabled ? saleFilters.length : 0) +
    insightFilters.length +
    (pinnedFilterEnabled && pinnedOnly ? 1 : 0) +
    Object.values(customFieldFilters).reduce((total, values) => total + values.length, 0);
  const activeFilterCount = quickFilterCount + advancedFilterCount;
  const adminAssignedTaskCount =
    workspaceView === 'tasks'
      ? filteredCandidates.filter(candidate => candidate.taskSource === 'admin_assigned').length
      : 0;
  const candidateFilterChips = [
    ...(provinceFilterEnabled
      ? provinceFilters.map(value => ({
          id: `province-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.province, 'Tỉnh/thành')}: ${value}`,
          onRemove: () => setProvinceFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(industrialParkFilterEnabled
      ? industrialParkFilters.map(value => ({
          id: `industrial-park-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.industrialPark, 'Khu công nghiệp')}: ${value}`,
          onRemove: () => setIndustrialParkFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(sourceFilterEnabled
      ? sourceFilters.map(value => ({
          id: `source-${value}`,
          label: `${configuredFilterName(LEAD_FILTER_IDS.source, 'Nguồn')}: ${value}`,
          onRemove: () => setSourceFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(contactResultFilterEnabled
      ? contactResultFilters.map(value => ({
          id: `contact-result-${value}`,
          label: `${configuredFilterName('contact_result', 'Trạng thái liên hệ')}: ${CONTACT_STATUS_LABELS[value]}`,
          onRemove: () => setContactResultFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(potentialFilterEnabled
      ? potentialFilters.map(value => ({
          id: `potential-${value}`,
          label: `${configuredFilterName('potential_level', 'Mức độ tiềm năng')}: ${POTENTIAL_LEVEL_LABELS[value]}`,
          onRemove: () => setPotentialFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(saleFilterEnabled
      ? saleFilters.map(value => ({
          id: `sale-${value}`,
          label: `${configuredFilterName(CUSTOMER_FILTER_IDS.sale, 'Sale phụ trách')}: ${candidateOwners.find(user => user.uid === value)?.displayName || value}`,
          onRemove: () => setSaleFilters(previous => previous.filter(item => item !== value))
        }))
      : []),
    ...(pinnedFilterEnabled && pinnedOnly
      ? [{ id: 'pinned', label: configuredFilterName('pinned', 'Đã ghim'), onRemove: () => setPinnedOnly(false) }]
      : []),
    ...insightFilters.map(value => ({
      id: `insight-${value}`,
      label: CUSTOMER_INSIGHT_ITEM_BY_ID.get(value)?.label || value,
      onRemove: () => setInsightFilters(previous => previous.filter(item => item !== value))
    })),
    ...customFieldDefinitions
      .filter(definition => definition.active)
      .flatMap(definition =>
        (customFieldFilters[definition.id] || []).map(value => ({
          id: `custom-${definition.id}-${value}`,
          label: `${definition.name}: ${getEntityCustomFieldFilterLabel(definition, value)}`,
          onRemove: () =>
            setCustomFieldFilters(previous => ({
              ...previous,
              [definition.id]: (previous[definition.id] || []).filter(item => item !== value)
            }))
        }))
      ),
    ...getAdvancedFilterSummaries(advancedFilterFields, advancedFilters).map(summary => ({
      id: `advanced-${summary.id}`,
      label: summary.label,
      onRemove: () =>
        setAdvancedFilters(previous => {
          const next = { ...previous };
          delete next[summary.id];
          setCurrentPage(1);
          return next;
        })
    }))
  ];

  const editingCandidate = editingCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === editingCandidateId) ||
      (createdCandidateSnapshot?.id === editingCandidateId ? createdCandidateSnapshot : null)
    : null;
  const scheduleCandidate = scheduleCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scheduleCandidateId) || null
    : null;
  const scoringCandidateRecord = scoringCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scoringCandidateId) || null
    : null;
  const scoringCandidate =
    scoringCandidateRecord && editingCandidate?.id === scoringCandidateRecord.id
      ? { ...scoringCandidateRecord, customerInsightValues: form.customerInsightValues }
      : scoringCandidateRecord;
  const duplicate = useMemo(
    () =>
      findCandidateDuplicate(
        {
          companyName: form.companyName,
          phone: form.phone,
          taxCode: form.taxCode
        },
        candidates,
        leads,
        customers,
        editingCandidateId
      ),
    [candidates, customers, editingCandidateId, form.companyName, form.phone, form.taxCode, leads]
  );
  const hasBlockingDuplicate = duplicate?.reason === 'taxCode';

  const canManageCandidate = (candidate: LeadCandidateRecord) =>
    currentUser.role === 'admin' || candidate.assignedSaleId === currentUser.uid;

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

  const prependCandidateLog = (candidate: LeadCandidateRecord, log: LeadCandidateContactLog) =>
    [log, ...candidate.contactLogs].slice(0, 50);

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
      <button type="button" className="lead-candidate-phone-link" onClick={() => openEditForm(candidate, 'profile')}>
        {candidate.phone}
      </button>
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
  const queueSelectableDisplayedCandidates =
    workspaceView === 'all'
      ? displayedCandidates.filter(
          candidate => (candidate.status === 'new' || candidate.status === 'retry') && canManageCandidate(candidate)
        )
      : [];
  const allDisplayedQueueCandidatesSelected =
    queueSelectableDisplayedCandidates.length > 0 &&
    queueSelectableDisplayedCandidates.every(candidate => selectedQueueCandidateSet.has(candidate.id));

  const toggleQueueCandidateSelection = (candidateId: string) => {
    setBatchQueueError('');
    setSelectedQueueCandidateIds(previous =>
      previous.includes(candidateId) ? previous.filter(id => id !== candidateId) : [...previous, candidateId]
    );
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

  const getSelectedCandidates = () =>
    accessibleCandidates.filter(
      candidate =>
        selectedQueueCandidateSet.has(candidate.id) &&
        (candidate.status === 'new' || candidate.status === 'retry') &&
        canManageCandidate(candidate)
    );

  const addSelectedCandidatesToWorkQueue = async () => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:addSelectedCandidatesToWorkQueue',
      async () => {
        const candidatesToQueue = getSelectedCandidates();
        if (candidatesToQueue.length === 0) return;
        const assignedAt = new Date().toISOString();

        setSavingBatchQueue(true);
        setBatchQueueError('');
        try {
          await Promise.all(
            candidatesToQueue.map(candidate => {
              const targetTaskSource: LeadCandidateTaskSource =
                currentUser.role === 'admin' ? 'admin_assigned' : 'sale_created';
              if (!candidate.workQueueHidden && candidate.taskSource === targetTaskSource) {
                return Promise.resolve(true);
              }
              const log = buildCandidateLog(candidate, {
                eventType: 'activity',
                activityType: 'note',
                description: 'Đưa vào Công việc cần xử lý'
              });
              return requireConfirmedMutation(
                dbService.updateDocument('lead_candidates', candidate.id, {
                  schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
                  ...buildTaskAssignment(candidate, assignedAt),
                  workQueueHidden: false,
                  taskStatus: 'pending',
                  taskDismissedAt: '',
                  contactLogs: prependCandidateLog(candidate, log),
                  updatedBy: currentUser.displayName
                })
              );
            })
          );
          if (currentUser.role === 'admin') {
            const notificationOperations = candidatesToQueue.flatMap(candidate => {
              const assignee = saleUsers.find(user => user.uid === candidate.assignedSaleId);
              return assignee ? [createAdminAssignmentNotification(candidate, assignee, assignedAt)] : [];
            });
            await Promise.all(notificationOperations);
          }
          setSelectedQueueCandidateIds([]);
          setWorkspaceView('tasks');
          candidatesToQueue.forEach(candidate =>
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: 'lead_candidates',
              action: 'candidate_added_to_work_queue',
              summary: `Đưa ${candidate.companyName} vào Công việc cần xử lý`,
              targetType: 'lead_candidate',
              targetId: candidate.id,
              targetLabel: candidate.companyName
            })
          );

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setBatchQueueError(
            'Không thể chuyển một số dữ liệu sang Công việc cần xử lý. Vui lòng kiểm tra quyền Firebase và thử lại.'
          );
        } finally {
          setSavingBatchQueue(false);
        }
      },
      undefined
    );
  };

  const assignSelectedCandidatesToSale = async () => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:assignSelectedCandidatesToSale',
      async () => {
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
          await Promise.all(
            candidatesToAssign.map(candidate => {
              if (
                !candidate.workQueueHidden &&
                candidate.assignedSaleId === assignee.uid &&
                candidate.taskSource === 'admin_assigned'
              ) {
                return Promise.resolve(true);
              }
              const log = buildCandidateLog(candidate, {
                eventType: 'activity',
                activityType: 'note',
                description: `Bàn giao cho Sale · Phụ trách: ${assignee.displayName}`
              });
              return requireConfirmedMutation(
                dbService.updateDocument('lead_candidates', candidate.id, {
                  schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
                  assignedSaleId: assignee.uid,
                  assignedSaleName: assignee.displayName,
                  ...buildTaskAssignment(candidate, assignedAt),
                  workQueueHidden: false,
                  taskStatus: 'pending',
                  taskDismissedAt: '',
                  contactLogs: prependCandidateLog(candidate, log),
                  updatedBy: currentUser.displayName
                })
              );
            })
          );
          await Promise.all(
            candidatesToAssign.map(candidate => createAdminAssignmentNotification(candidate, assignee, assignedAt))
          );
          setSelectedQueueCandidateIds([]);
          setBatchAssigneeId('');
          setWorkspaceView('tasks');
          candidatesToAssign.forEach(candidate =>
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: 'lead_candidates',
              action: 'candidate_assigned_to_sale',
              summary: `Bàn giao ${candidate.companyName} cho ${assignee.displayName}`,
              targetType: 'lead_candidate',
              targetId: candidate.id,
              targetLabel: candidate.companyName,
              changes: [
                {
                  field: 'assignedSale',
                  label: 'Sale phụ trách',
                  before: candidate.assignedSaleName || 'Chưa phân công',
                  after: assignee.displayName
                }
              ]
            })
          );

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setBatchQueueError(
            'Không thể bàn giao một số dữ liệu cho Sale. Vui lòng kiểm tra quyền Firebase và thử lại.'
          );
        } finally {
          setSavingBatchQueue(false);
        }
      },
      undefined
    );
  };

  const updateForm = <K extends keyof CandidateFormState>(field: K, value: CandidateFormState[K]) => {
    setSaveError('');
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const openCreateForm = () => {
    setEditingCandidateId('');
    setCreatedCandidateSnapshot(null);
    setCandidateDetailTab('profile');
    setForm(createEmptyCandidateForm(currentUser, candidateOwners));
    setCandidateFiles([]);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
    setCustomFieldValues({});
    setSaveError('');
    setShowForm(true);
  };

  const openEditForm = useCallback(
    (candidate: LeadCandidateRecord, initialTab: CandidateDetailTab = 'classification') => {
      setEditingCandidateId(candidate.id);
      setCreatedCandidateSnapshot(null);
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
    },
    [currentUser]
  );

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
    const nextFiles = await Promise.all(
      files.map(
        file =>
          new Promise<LeadCandidateFileRecord>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
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
          })
      )
    );
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
    setCandidateFiles(previous => [
      ...previous,
      {
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
      }
    ]);
    setCandidateLinkName('');
    setCandidateLinkUrl('');
  };

  const saveClassification = async (candidate: LeadCandidateRecord, values: string[]) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:saveClassification',
      async () => {
        if (!canManageCandidate(candidate)) throw new Error('Not allowed to classify this candidate');
        const now = new Date().toISOString();
        await requireConfirmedMutation(
          dbService.updateDocument('lead_candidates', candidate.id, {
            customerInsightValues: values,
            updatedAt: now,
            updatedBy: currentUser.displayName
          })
        );
        if (editingCandidateId === candidate.id) updateForm('customerInsightValues', values);
        auditService.recordSafely(currentUser, {
          category: 'business',
          module: 'lead_candidates',
          action: 'candidate_classification_updated',
          summary: `Cập nhật phân loại ${candidate.companyName} · ${values.length}/${CUSTOMER_INSIGHT_ITEMS.length} mục`,
          targetType: 'lead_candidate',
          targetId: candidate.id,
          targetLabel: candidate.companyName
        });

        showSuccessToast('Đã lưu thành công');
      },
      candidate
    );
  };

  const handleSaveCandidate = async (event: React.FormEvent) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:handleSaveCandidate',
      async () => {
        event.preventDefault();
        if (!form.companyName.trim() || !form.assignedSaleId || hasBlockingDuplicate) return;
        const missingCustomFields = getMissingRequiredEntityFields(
          profileCustomFieldDefinitions,
          customFieldValues,
          currentUser.role
        );
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
            currentUser.role === 'admin' ? dbService.getCollection('lead_candidates') : Promise.resolve(candidates)
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
          const scheduleLog =
            editingCandidate && scheduleChanged && nextContactAt
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
            ...(scheduleChanged
              ? {
                  queuedNextContactAt: '',
                  taskStatus: 'pending' as LeadCandidateTaskStatus,
                  workStatus: nextContactAt
                    ? 'pending'
                    : editingCandidate?.contactResult === 'not_contacted'
                      ? 'not_contacted'
                      : 'completed',
                  taskCompletedAt: '',
                  taskCompletedById: '',
                  taskCompletedByName: '',
                  taskDismissedAt: '',
                  ...(taskAssignment || {}),
                  workQueueHidden: nextContactAt ? false : (editingCandidate?.workQueueHidden ?? true),
                  ...(scheduleLog && editingCandidate
                    ? { contactLogs: prependCandidateLog(editingCandidate, scheduleLog) }
                    : {})
                }
              : {}),
            updatedBy: currentUser.displayName
          };

          if (editingCandidateId) {
            await requireConfirmedMutation(dbService.updateDocument('lead_candidates', editingCandidateId, payload));
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: 'lead_candidates',
              action: 'candidate_updated',
              summary: `Cập nhật dữ liệu khách hàng ${form.companyName.trim()}`,
              targetType: 'lead_candidate',
              targetId: editingCandidateId,
              targetLabel: form.companyName.trim()
            });
            setShowForm(false);

            showSuccessToast('Đã lưu thành công');
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
            taskSource: nextContactAt ? taskAssignment?.taskSource || 'sale_created' : ('' as LeadCandidateTaskSource),
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
          const createdCandidate = (
            normalizedTaxCode
              ? await dbService.addDocumentIfAbsent(
                  'lead_candidates',
                  createCandidateDocumentIdFromTaxCode(normalizedTaxCode),
                  createPayload
                )
              : await dbService.addDocument('lead_candidates', createPayload)
          ) as LeadCandidateRecord;
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'candidate_created',
            summary: `Tạo dữ liệu khách hàng ${form.companyName.trim()}`,
            targetType: 'lead_candidate',
            targetId: createdCandidate.id,
            targetLabel: form.companyName.trim()
          });
          setCreatedCandidateSnapshot(createdCandidate);
          setEditingCandidateId(createdCandidate.id);
          setCandidateDetailTab('profile');
          setCandidateFiles(createdCandidate.files || []);
          setCustomFieldValues(createdCandidate.customFieldValues || {});
          setSaveError('');

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          const errorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
          if (isDocumentAlreadyExistsError(error)) {
            setSaveError('Mã số thuế này vừa được một Sale khác lưu vào Dữ liệu khách hàng.');
          } else if (errorCode === 'permission-denied' || errorCode === 'firestore/permission-denied') {
            setSaveError(
              normalizeTaxCode(form.taxCode)
                ? 'Không thể lưu: mã số thuế có thể đã tồn tại ở hồ sơ của Sale khác hoặc Firestore Rules chưa được cập nhật.'
                : 'Firebase chưa cấp quyền lưu Dữ liệu khách hàng. Admin cần xuất bản Firestore Rules mới nhất.'
            );
          } else if (errorCode === 'auth/session-expired' || errorCode === 'unauthenticated') {
            setSaveError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.');
          } else {
            setSaveError('Không thể lưu dữ liệu khách hàng. Vui lòng kiểm tra kết nối và thử lại.');
          }
        }
      },
      event
    );
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
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:handleSaveSchedule',
      async () => {
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
            description:
              scheduleContactResult === 'callback'
                ? `Trạng thái: ${CONTACT_STATUS_LABELS.callback} · ${formatShortDateTime(nextContactAt)}`
                : `Đặt lịch liên hệ: ${formatShortDateTime(nextContactAt)}`,
            note: scheduleForm.note.trim(),
            nextContactAt
          });
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', scheduleCandidate.id, {
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
              ...(scheduleContactResult
                ? {
                    contactResult: scheduleContactResult,
                    lastContactAt: log.occurredAt,
                    lastContactOutcome: CONTACT_RESULT_OUTCOMES[scheduleContactResult],
                    lastContactNote: scheduleForm.note.trim(),
                    contactAttempts: scheduleCandidate.contactAttempts + 1
                  }
                : {}),
              contactLogs: prependCandidateLog(scheduleCandidate, log),
              updatedBy: currentUser.displayName
            })
          );
          setScheduleCandidateId('');
          setScheduleContactResult('');
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'follow_up_scheduled',
            summary: `Đặt lịch liên hệ ${scheduleCandidate.companyName}`,
            targetType: 'lead_candidate',
            targetId: scheduleCandidate.id,
            targetLabel: scheduleCandidate.companyName,
            changes: [{ field: 'nextContactAt', label: 'Lịch hẹn', after: nextContactAt }]
          });

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
          setScheduleError(
            code.includes('permission-denied')
              ? 'Firebase chưa cấp quyền đặt lịch. Admin cần xuất bản Firestore Rules mới nhất.'
              : 'Không thể lưu lịch hẹn. Vui lòng thử lại.'
          );
        } finally {
          setSavingSchedule(false);
        }
      },
      event
    );
  };

  const updateContactResult = async (candidate: LeadCandidateRecord, contactResult: LeadCandidateContactResult) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:updateContactResult',
      async () => {
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
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', candidate.id, {
              contactResult,
              lastContactAt: contactResult === 'not_contacted' ? candidate.lastContactAt : log.occurredAt,
              lastContactOutcome: CONTACT_RESULT_OUTCOMES[contactResult],
              contactAttempts:
                contactResult === 'not_contacted' ? candidate.contactAttempts : candidate.contactAttempts + 1,
              workStatus: contactResult === 'not_contacted' ? 'not_contacted' : 'completed',
              contactLogs: prependCandidateLog(candidate, log),
              updatedBy: currentUser.displayName
            })
          );
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'contact_status_updated',
            summary: `Cập nhật trạng thái liên hệ ${candidate.companyName}`,
            targetType: 'lead_candidate',
            targetId: candidate.id,
            targetLabel: candidate.companyName,
            changes: [
              {
                field: 'contactResult',
                label: 'Trạng thái liên hệ',
                before: CONTACT_STATUS_LABELS[candidate.contactResult],
                after: CONTACT_STATUS_LABELS[contactResult]
              }
            ]
          });

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setActionError('Không thể cập nhật trạng thái liên hệ. Vui lòng kiểm tra quyền Firebase và thử lại.');
        } finally {
          setFieldActionCandidateId('');
        }
      },
      candidate,
      { busy: false }
    );
  };

  const updatePotentialLevel = async (candidate: LeadCandidateRecord, potentialLevel: LeadCandidatePotentialLevel) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:updatePotentialLevel',
      async () => {
        if (!canManageCandidate(candidate) || candidate.potentialLevel === potentialLevel) return;
        setActionError('');
        setFieldActionCandidateId(`${candidate.id}:potential`);
        try {
          const log = buildCandidateLog(candidate, {
            eventType: 'potential_level',
            potentialLevel,
            description: `Đánh giá: ${POTENTIAL_LEVEL_LABELS[potentialLevel]}`
          });
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', candidate.id, {
              potentialLevel,
              contactLogs: prependCandidateLog(candidate, log),
              updatedBy: currentUser.displayName
            })
          );
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'potential_updated',
            summary: `Đánh giá tiềm năng ${candidate.companyName}`,
            targetType: 'lead_candidate',
            targetId: candidate.id,
            targetLabel: candidate.companyName,
            changes: [
              {
                field: 'potentialLevel',
                label: 'Mức độ tiềm năng',
                before: POTENTIAL_LEVEL_LABELS[candidate.potentialLevel],
                after: POTENTIAL_LEVEL_LABELS[potentialLevel]
              }
            ]
          });

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setActionError('Không thể cập nhật mức độ tiềm năng. Vui lòng kiểm tra quyền Firebase và thử lại.');
        } finally {
          setFieldActionCandidateId('');
        }
      },
      candidate,
      { busy: false }
    );
  };

  const dismissScheduledTask = async (candidate: LeadCandidateRecord) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:dismissScheduledTask',
      async () => {
        const dismissedAt = new Date().toISOString();
        const log = buildCandidateLog(candidate, {
          eventType: 'activity',
          activityType: 'note',
          description: 'Tắt khỏi Công việc cần xử lý'
        });
        setActionError('');
        setTaskActionCandidateId(candidate.id);
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', candidate.id, {
              workQueueHidden: true,
              taskStatus: 'dismissed',
              taskDismissedAt: dismissedAt,
              contactLogs: prependCandidateLog(candidate, log),
              updatedBy: currentUser.displayName
            })
          );
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'candidate_task_dismissed',
            summary: `Tắt ${candidate.companyName} khỏi Công việc cần xử lý`,
            targetType: 'lead_candidate',
            targetId: candidate.id,
            targetLabel: candidate.companyName
          });

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setActionError('Không thể tắt công việc. Vui lòng kiểm tra quyền Firebase và thử lại.');
        } finally {
          setTaskActionCandidateId('');
        }
      },
      candidate
    );
  };

  const archiveCandidate = async (candidate: LeadCandidateRecord) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:archiveCandidate',
      async () => {
        if (
          !(await confirmDelete(
            `Xóa “${candidate.companyName}” khỏi danh sách dữ liệu? Thông tin cũ vẫn được lưu an toàn.`
          ))
        )
          return;
        const archivedAt = new Date().toISOString();
        setActionError('');
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', candidate.id, {
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
            })
          );
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'candidate_archived',
            summary: `Xóa ${candidate.companyName} khỏi danh sách dữ liệu`,
            targetType: 'lead_candidate',
            targetId: candidate.id,
            targetLabel: candidate.companyName
          });

          showSuccessToast('Đã xóa dữ liệu');
        } catch {
          showErrorToast();
          setActionError('Không thể xóa dữ liệu khỏi danh sách. Vui lòng kiểm tra quyền Firebase và thử lại.');
        }
      },
      candidate
    );
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
        {(Object.entries(CONTACT_STATUS_LABELS) as Array<[LeadCandidateContactResult, string]>).map(
          ([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          )
        )}
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
        {(Object.entries(POTENTIAL_LEVEL_LABELS) as Array<[LeadCandidatePotentialLevel, string]>).map(
          ([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          )
        )}
      </select>
    );
  };

  const renderCompactValue = (value: string, title = value, className = '') => (
    <span className={`lead-candidate-compact-value ${className}`.trim()} title={title}>
      {value}
    </span>
  );

  const renderCandidateField = (value?: string) =>
    renderCompactValue(value || 'Chưa cập nhật', value || 'Chưa cập nhật', value ? '' : 'is-muted');

  const renderInsightValue = (candidate: LeadCandidateRecord, itemId: string) => {
    const checked = (candidate.customerInsightValues || []).includes(itemId);
    return (
      <span className={`lead-candidate-insight-value ${checked ? 'is-selected' : ''}`}>
        {checked ? 'Đã chọn' : 'Chưa chọn'}
      </span>
    );
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
    const profileFields = [
      form.companyName,
      form.taxCode,
      form.website,
      form.province,
      form.ward,
      form.industrialPark,
      form.address,
      form.contactPerson,
      form.contactPosition,
      form.phone,
      form.email,
      form.source,
      form.sourceUrl,
      form.assignedSaleId,
      form.nextContactAt,
      form.note
    ];
    const completedProfileFields = profileFields.filter(value => String(value || '').trim()).length;
    const profileSaleName =
      candidateOwners.find(user => user.uid === form.assignedSaleId)?.displayName ||
      editingCandidate?.assignedSaleName ||
      'Chưa phân công';
    return (
      <SystemFieldSurface table="lead_candidates" className="lead-form-page lead-candidate-form-page">
        <header className="lead-candidate-profile-header crm-record-header">
          <PageBackButton iconOnly title="Quay lại danh sách dữ liệu" onClick={() => setShowForm(false)} />
          <CrmRecordHeaderIdentity
            title={editingCandidate ? form.companyName || 'Chưa có tên doanh nghiệp' : 'Thông tin khách hàng mới'}
          />
          <div className="lead-candidate-profile-header__toolbar">
            <CrmRecordHeaderTabs
              activeTab={candidateDetailTab}
              classificationCount={form.customerInsightValues.length}
              classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
              classificationLabel="Phân loại khách hàng"
              profileLabel="Thông tin hồ sơ"
              ariaLabel="Chi tiết dữ liệu khách hàng"
              onTabChange={setCandidateDetailTab}
            />
          </div>
          <CrmRecordHeaderFacts
            taxCode={form.taxCode || 'Chưa cập nhật'}
            saleName={profileSaleName}
            classificationCount={form.customerInsightValues.length}
            classificationTotal={CUSTOMER_INSIGHT_ITEMS.length}
            profileCompleted={completedProfileFields}
            profileTotal={profileFields.length}
            stageLabel={editingCandidate ? CANDIDATE_STAGE_LABELS[editingCandidate.status] : 'Dữ liệu mới'}
            nextCareLabel={form.nextContactAt ? formatShortDateTime(form.nextContactAt) : 'Chưa đặt lịch'}
          />
        </header>

        <div className="lead-candidate-detail-panel" hidden={candidateDetailTab !== 'classification'}>
          <CustomerInsightClassification
            key={editingCandidate?.id || 'new-candidate'}
            companyName={editingCandidate?.companyName || form.companyName || 'khách hàng mới'}
            values={form.customerInsightValues}
            canEdit={!editingCandidate || canManageCandidate(editingCandidate)}
            onDraftChange={!editingCandidate ? values => updateForm('customerInsightValues', values) : undefined}
            onSave={
              editingCandidate
                ? values => saveClassification(editingCandidate, values)
                : async values => updateForm('customerInsightValues', values)
            }
            onScore={editingCandidate ? () => setScoringCandidateId(editingCandidate.id) : undefined}
            toolbarActions={
              editingCandidate ? (
                <PhoneCallCell
                  toolbar
                  phone={editingCandidate.phone}
                  companyName={editingCandidate.companyName}
                  subjectKey={candidateCallSubjectKey(editingCandidate)}
                  currentUser={currentUser}
                  auditModule="lead_candidates"
                  targetType="lead_candidate"
                  targetId={editingCandidate.id}
                  canRecord={
                    canManageCandidate(editingCandidate) &&
                    (currentUser.role === 'sale' || currentUser.role === 'admin')
                  }
                  onCallStarted={() => recordPhoneCall(editingCandidate)}
                />
              ) : undefined
            }
          />
        </div>

        <form
          id="lead-candidate-profile-form"
          className="lead-form-page__form lead-candidate-detail-panel"
          hidden={candidateDetailTab !== 'profile'}
          onSubmit={handleSaveCandidate}
        >
          <LeadCandidateProfileFields
            candidateDetailTab={candidateDetailTab}
            form={form}
            updateForm={updateForm}
            editingCandidate={editingCandidate}
            setForm={setForm}
            currentUser={currentUser}
            candidateOwners={candidateOwners}
            customFields={{
              profileCustomFieldDefinitions,
              customFieldValues,
              setCustomFieldValues,
              inlineSystemFieldConfiguration,
              clearPurgedCustomField,
              clearPurgedSystemField
            }}
            files={{
              handleCandidateFilesChange,
              handleCandidateFilesDrop,
              candidateLinkName,
              setCandidateLinkName,
              candidateLinkUrl,
              setCandidateLinkUrl,
              handleAddCandidateLink,
              candidateFiles,
              setCandidateFiles
            }}
          />

          {(duplicate || saveError) && (
            <div className={`lead-candidate-warning ${hasBlockingDuplicate || saveError ? 'is-error' : ''}`}>
              <AlertCircle size={15} />
              <span>{saveError || (duplicate && describeDuplicate(duplicate))}</span>
            </div>
          )}

          <footer className="lead-form-page__footer lead-form-page__footer--fixed">
            <span>Dữ liệu chỉ được ghi nhận khi bấm Lưu dữ liệu.</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                Hủy
              </button>
              <button type="submit" className="btn btn-primary" disabled={Boolean(hasBlockingDuplicate)}>
                Lưu dữ liệu
              </button>
            </div>
          </footer>
        </form>
        {scoringCandidate && (
          <LeadCandidateScoreDialog
            candidate={scoringCandidate}
            currentUser={currentUser}
            onClose={() => setScoringCandidateId('')}
          />
        )}
      </SystemFieldSurface>
    );
  }

  const rawOverviewMode = adminRawView === 'priority' ? 'priority' : 'overview';
  const rawPageContext =
    adminRawView === 'list'
      ? workspaceView === 'tasks'
        ? 'Công việc cần xử lý'
        : 'Tất cả dữ liệu'
      : adminRawView === 'priority'
        ? 'Bảng ưu tiên'
        : adminRawView === 'scoring'
          ? 'Thiết lập điểm tự động'
          : 'Tổng quan';

  return (
    <>
      <PageContextHeader section="Dữ liệu thô" current={rawPageContext} />
      <SystemFieldSurface table="lead_candidates" className="lead-candidate-workspace" hidden={adminRawView === 'list'}>
        {adminRawView === 'overview' && (
          <nav
            className="lead-candidate-queues content-tabs content-tabs--compact"
            role="tablist"
            aria-label="Dữ liệu thô"
          >
            <button type="button" role="tab" aria-selected={true} className="is-active" onClick={showRawOverview}>
              Tổng quan
            </button>
            <button type="button" role="tab" aria-selected={false} onClick={showRawList}>
              Tất cả dữ liệu
            </button>
          </nav>
        )}
        {adminRawView === 'scoring' && <RawDataScoringPage currentUser={currentUser} onBack={showRawOverview} />}
        <RawDataOverview
          hidden={adminRawView === 'scoring'}
          mode={rawOverviewMode}
          candidates={overviewCandidates}
          saleUsers={overviewSaleUsers}
          canConfigureScoring={currentUser.role === 'admin'}
          onPriority={showRawPriority}
          onScoring={showRawScoring}
          onOverview={showRawOverview}
          onOpenCandidate={openRawCandidate}
        />
      </SystemFieldSurface>

      {(adminListPrepared || adminRawView === 'list') && (
        <SystemFieldSurface
          table="lead_candidates"
          className="lead-candidate-workspace"
          hidden={adminRawView !== 'list'}
        >
          <LeadCandidateCommandBar
            showRawOverview={showRawOverview}
            currentUser={currentUser}
            workspaceView={workspaceView}
            setWorkspaceView={setWorkspaceView}
            setSelectedQueueCandidateIds={setSelectedQueueCandidateIds}
            setBatchQueueError={setBatchQueueError}
            setCurrentPage={setCurrentPage}
            setShowDataFilters={setShowDataFilters}
            setShowColumnCustomizer={setShowColumnCustomizer}
            setCandidateSort={setCandidateSort}
            setSaleFilters={setSaleFilters}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            candidateSort={candidateSort}
            activeFilterCount={activeFilterCount}
            showDataFilters={showDataFilters}
            canEditColumns={canEditColumns}
            openCreateForm={openCreateForm}
            clearDataFilters={clearDataFilters}
          />

          {workspaceView !== 'management' && (
            <DataFilterChipBar chips={candidateFilterChips} onClear={clearDataFilters} />
          )}

          <LeadCandidateFilterPanel
            workspaceView={workspaceView}
            setCurrentPage={setCurrentPage}
            currentUser={currentUser}
            candidateOwners={candidateOwners}
            customFieldDefinitions={customFieldDefinitions}
            filters={{
              showDataFilters,
              quickFilterCount,
              setShowDataFilters,
              clearDataFilters,
              provinceFilterEnabled,
              configuredFilterName,
              configuredFilterDescription,
              provinceFilters,
              provinceOptions,
              setProvinceFilters,
              industrialParkFilterEnabled,
              industrialParkFilters,
              industrialParkOptions,
              setIndustrialParkFilters,
              sourceFilterEnabled,
              sourceFilters,
              setSourceFilters,
              contactResultFilterEnabled,
              contactResultFilters,
              setContactResultFilters,
              potentialFilterEnabled,
              potentialFilters,
              setPotentialFilters,
              insightFilters,
              setInsightFilters,
              saleFilterEnabled,
              saleFilters,
              setSaleFilters,
              pinnedFilterEnabled,
              pinnedOnly,
              setPinnedOnly,
              customFieldFilters,
              customFilterOptions,
              setCustomFieldFilters
            }}
          />

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
            <LeadCandidateBatchBar
              selectedQueueCandidateIds={selectedQueueCandidateIds}
              setSelectedQueueCandidateIds={setSelectedQueueCandidateIds}
              setBatchQueueError={setBatchQueueError}
              addSelectedCandidatesToWorkQueue={addSelectedCandidatesToWorkQueue}
              savingBatchQueue={savingBatchQueue}
              currentUser={currentUser}
              batchAssigneeId={batchAssigneeId}
              setBatchAssigneeId={setBatchAssigneeId}
              saleUsers={saleUsers}
              assignSelectedCandidatesToSale={assignSelectedCandidatesToSale}
              batchQueueError={batchQueueError}
            />
          )}

          {actionError && (
            <div className="lead-candidate-warning is-error">
              <AlertCircle size={14} />
              <span>{actionError}</span>
              <button type="button" onClick={() => setActionError('')} aria-label="Đóng thông báo">
                <X size={13} />
              </button>
            </div>
          )}

          {workspaceView === 'management' && currentUser.role === 'admin' && (
            <EmployeeActivityMonitor
              employeeCards={employeeCards}
              selectedManagedSaleId={selectedManagedSaleId}
              setSelectedManagedSaleId={setSelectedManagedSaleId}
              selectedEmployeeCard={selectedEmployeeCard}
              salesReportWindow={salesReportWindow}
              salesReportPeriod={salesReportPeriod}
              setSalesReportPeriod={setSalesReportPeriod}
              salesReportStart={salesReportStart}
              salesReportEnd={salesReportEnd}
              setSalesReportStart={setSalesReportStart}
              referenceTime={referenceTime}
              setSalesReportEnd={setSalesReportEnd}
              salesReportLoading={salesReportLoading}
              salesReportError={salesReportError}
              selectedSalesReport={selectedSalesReport}
              employeeActivityRange={employeeActivityRange}
              setEmployeeActivityRange={setEmployeeActivityRange}
              employeeActivityGroup={employeeActivityGroup}
              setEmployeeActivityGroup={setEmployeeActivityGroup}
              selectedEmployeeActivities={selectedEmployeeActivities}
            />
          )}

          {workspaceView !== 'management' && (
            <section className="lead-table-card">
              <div className="lead-table-result">
                {workspaceView === 'tasks' ? (
                  <>
                    <span>
                      <strong>{filteredCandidates.length}</strong> công việc thuộc Sale đang phụ trách
                    </span>
                    <span>
                      {adminAssignedTaskCount > 0
                        ? `${adminAssignedTaskCount} công việc Admin giao đang được xếp ưu tiên.`
                        : currentUser.role === 'admin'
                          ? 'Lọc theo Sale để theo dõi tiến độ làm việc.'
                          : 'Cập nhật trạng thái, đánh giá và lịch hẹn trực tiếp trên bảng.'}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      Hiển thị <strong>{filteredCandidates.length}</strong> / {accessibleCandidates.length} dữ liệu
                    </span>
                    <span>
                      {activeFilterCount > 0
                        ? `${activeFilterCount} bộ lọc đang áp dụng`
                        : 'Kho dữ liệu chung do toàn bộ Sale trong công ty thu thập.'}
                    </span>
                  </>
                )}
              </div>
              <div className="table-container">
                {workspaceView === 'tasks' ? (
                  <LeadCandidateTaskTable
                    currentUser={currentUser}
                    displayedCandidates={displayedCandidates}
                    referenceTime={referenceTime}
                    taskActionCandidateId={taskActionCandidateId}
                    safeCurrentPage={safeCurrentPage}
                    pageSize={pageSize}
                    columns={{
                      candidateTableStyle,
                      orderedColumnIds,
                      getHeaderProps,
                      candidateColumnLabels,
                      visibleColumnSet,
                      customFieldDefinitions,
                      visibleCandidateInsightItems
                    }}
                    cells={{
                      renderCandidateField,
                      renderCompactValue,
                      getContactSummary,
                      renderPhoneLink,
                      renderContactResult,
                      renderPotentialLevel,
                      renderCompactLatestActivity,
                      renderInsightValue
                    }}
                    actions={{
                      openEditForm,
                      openScheduleForm,
                      setScoringCandidateId,
                      setAssignmentTarget,
                      setSupportTarget,
                      onStartConversion,
                      dismissScheduledTask,
                      archiveCandidate,
                      canManageCandidate
                    }}
                  />
                ) : (
                  <LeadCandidateDataTable
                    displayedCandidates={displayedCandidates}
                    safeCurrentPage={safeCurrentPage}
                    pageSize={pageSize}
                    referenceTime={referenceTime}
                    currentUser={currentUser}
                    columns={{
                      candidateTableStyle,
                      orderedColumnIds,
                      getHeaderProps,
                      candidateColumnLabels,
                      visibleColumnSet,
                      customFieldDefinitions,
                      visibleCandidateInsightItems
                    }}
                    cells={{
                      renderCandidateField,
                      renderCompactValue,
                      getContactSummary,
                      renderPhoneLink,
                      renderPotentialLevel,
                      renderCompactLatestActivity,
                      renderInsightValue
                    }}
                    actions={{
                      openEditForm,
                      openScheduleForm,
                      setScoringCandidateId,
                      setAssignmentTarget,
                      setSupportTarget,
                      onStartConversion,
                      archiveCandidate,
                      canManageCandidate
                    }}
                    selection={{
                      allDisplayedQueueCandidatesSelected,
                      queueSelectableDisplayedCandidates,
                      toggleDisplayedQueueCandidates,
                      selectedQueueCandidateSet,
                      toggleQueueCandidateSelection
                    }}
                  />
                )}
              </div>
              {filteredCandidates.length > 0 && (
                <footer className="lead-candidate-pagination">
                  <span>
                    Tổng số: <strong>{filteredCandidates.length}</strong> bản ghi
                  </span>
                  <label>
                    Hiển thị{' '}
                    <select
                      value={pageSize}
                      onChange={event => {
                        setPageSize(Number(event.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={25}>25 dòng</option>
                      <option value={50}>50 dòng</option>
                      <option value={100}>100 dòng</option>
                    </select>
                  </label>
                  <div>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                      disabled={safeCurrentPage === 1}
                      aria-label="Trang trước"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <strong>
                      {safeCurrentPage} / {totalPages}
                    </strong>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                      disabled={safeCurrentPage === totalPages}
                      aria-label="Trang sau"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </footer>
              )}
            </section>
          )}

          {scheduleCandidate && (
            <LeadCandidateScheduleDialog
              handleSaveSchedule={handleSaveSchedule}
              scheduleCandidate={scheduleCandidate}
              setScheduleCandidateId={setScheduleCandidateId}
              setScheduleContactResult={setScheduleContactResult}
              scheduleForm={scheduleForm}
              setScheduleForm={setScheduleForm}
              scheduleContactResult={scheduleContactResult}
              scheduleError={scheduleError}
              savingSchedule={savingSchedule}
            />
          )}

          {scoringCandidate && (
            <LeadCandidateScoreDialog
              candidate={scoringCandidate}
              currentUser={currentUser}
              onClose={() => setScoringCandidateId('')}
            />
          )}

          {supportTarget && (
            <SupportRequestDialog
              currentUser={currentUser}
              users={users}
              target={supportTarget}
              onClose={() => setSupportTarget(null)}
            />
          )}
          {assignmentTarget && (
            <WorkAssignmentDialog
              currentUser={currentUser}
              users={users}
              target={assignmentTarget}
              onClose={() => setAssignmentTarget(null)}
            />
          )}
        </SystemFieldSurface>
      )}
    </>
  );
};
