import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import { SystemFieldSurface } from '@/components/ConfiguredSystemFields';
import { PageContextHeader } from '@/components/PageContextHeader';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  LifeBuoy,
  Trash2,
  Undo2,
  UserCheck
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import {
  isActiveLeadRecord,
  type CustomerRecord,
  type CustomerRepositoryFolder,
  type LeadFileRecord,
  type LeadFilterDefinition,
  type LeadProfileFieldDefinition,
  type LeadRecord
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
  findLeadFilterParentOption,
  flattenLeadFilterOptions,
  getLeadFilterValues,
  LEAD_FILTER_IDS,
  mergeLeadFilterDefinitions
} from '@/features/crm/model/leadFilterConfig';
import { isSystemFilterEnabled } from '@/domain/systemFilterConfig';
import { useSystemFilterConfiguration } from '@/hooks/useSystemFilterConfiguration';
import { useSystemFieldConfiguration } from '@/hooks/useSystemFieldConfiguration';
import { dbService, isDocumentAlreadyExistsError, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';

import { isLeadSystemProfileField } from '@/features/crm/model/leadProfileConfig';
import { PageBackButton } from '@/components/PageBackButton';

import { RowActionMenu } from '@/components/RowActionMenu';
import { SupportRequestDialog, type SupportRequestTarget } from '@/components/SupportRequestDialog';
import { WorkAssignmentDialog, type WorkAssignmentTarget } from '@/components/WorkAssignmentDialog';
import { TableColumnCustomizer } from '@/components/TableColumnCustomizer';

import { useEntityFieldDefinitions } from '@/hooks/useEntityFieldDefinitions';
import {
  formatEntityCustomFieldValue,
  getMissingRequiredEntityFields,
  type EntityCustomFieldValues
} from '@/features/crm/model/entityFieldConfig';
import { DataFilterChipBar } from '@/components/DataWorkspaceFilters';

import { LeadOverviewDashboard } from '@/features/crm/components/LeadOverviewDashboard';
import { CustomerInsightClassification } from '@/features/crm/components/CustomerInsightClassification';
import {
  CrmRecordHeaderFacts,
  CrmRecordHeaderIdentity,
  CrmRecordHeaderTabs
} from '@/features/crm/components/CrmRecordHeader';
import { CUSTOMER_INSIGHT_ITEMS } from '@/features/crm/model/customerInsightCatalog';
import { PhoneCallCell } from '@/components/PhoneCallCell';
import { leadCallHistoryKeys, leadCallSubjectKey } from '@/features/crm/model/callHistory';
import {
  type LeadOverviewSelection,
  LEAD_OVERVIEW_LABELS,
  matchesLeadOverviewSelection,
  type LeadFormState,
  LEADS_PAGE_REFERENCE_TIME,
  formatDateTime,
  toDateTimeLocal,
  getLeadScheduleTime,
  getStageLabel,
  normalizeSearchText,
  type LeadDetailTab,
  isClassificationOwnedProfileField,
  createEmptyForm
} from './leadsPage/leadsPageConfig';
import { LeadProfileFields } from './leadsPage/LeadProfileFields';
import { LeadListToolbar } from './leadsPage/LeadListToolbar';
import { LeadFilterPanel } from './leadsPage/LeadFilterPanel';
import { LeadListTable } from './leadsPage/LeadListTable';
import { useLeadListFilters } from '@/features/crm/hooks/useLeadListFilters';
import { useLeadTableColumns } from '@/features/crm/hooks/useLeadTableColumns';
import { useLeadSchedule } from '@/features/crm/hooks/useLeadSchedule';
import { useLeadFileDrafts } from '@/features/crm/hooks/useLeadFileDrafts';
import { LeadScheduleDialog } from './leadsPage/LeadScheduleDialog';

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
  const { definitions: customFieldDefinitions, allDefinitions: allCustomFieldDefinitions } = useEntityFieldDefinitions(
    'leads',
    currentUser.role
  );
  const inlineSystemFieldConfiguration = useSystemFieldConfiguration('leads');
  const saleUsers = useMemo(() => users.filter(user => user.role === 'sale'), [users]);
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'list'>('overview');
  const [leadListPrepared, setLeadListPrepared] = useState(false);
  const [overviewSelection, setOverviewSelection] = useState<LeadOverviewSelection | null>(null);
  const [overviewDrilldown, setOverviewDrilldown] = useState<{ label: string; ids: string[] } | null>(null);
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [storedFilterDefinitions, setStoredFilterDefinitions] = useState<LeadFilterDefinition[]>([]);
  const [profileDefinitions, setProfileDefinitions] = useState<LeadProfileFieldDefinition[]>([]);
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
  const {
    uploadingFiles,
    setUploadingFiles,
    attachmentLinkName,
    setAttachmentLinkName,
    attachmentLinkUrl,
    setAttachmentLinkUrl,
    handleLeadFilesChange,
    handleAddAttachmentLink
  } = useLeadFileDrafts({ currentUser });
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

  const [returningLeadId, setReturningLeadId] = useState('');
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

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection(
      'lead_candidates',
      data => {
        setCandidates(
          sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt])
        );
      },
      currentUser.role === 'sale'
        ? {
            fieldName: 'assignedSaleId',
            fieldValue: currentUser.uid
          }
        : undefined
    );
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
    return definition ? flattenLeadFilterOptions(definition.options).map(option => option.label) : [];
  }, [filterDefinitions]);
  const systemFilterDefinitions = useSystemFilterConfiguration(filterDefinitions);
  const visibleFilterDefinitions = useMemo(
    () =>
      filterDefinitions.filter(
        field =>
          field.active &&
          field.showInQuickFilter &&
          isSystemFilterEnabled(systemFilterDefinitions, field.id, 'lead_list')
      ),
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

  const {
    showColumnCustomizer,
    setShowColumnCustomizer,
    canEditColumns,
    leadColumnOptions,
    visibleLeadColumnIds,
    visibleLeadCustomFields,
    visibleLeadInsightItems,
    saveVisibleLeadColumns,
    orderedLeadColumnIds,
    getLeadHeaderProps,
    leadColumnLabels,
    visibleLeadColumnCount
  } = useLeadTableColumns({ currentUser, inlineSystemFieldConfiguration, customFieldDefinitions });

  const accessibleLeads = useMemo(() => leads.filter(isActiveLeadRecord), [leads]);
  const overviewLeads = useMemo(
    () =>
      currentUser.role === 'sale'
        ? accessibleLeads.filter(lead => lead.discoveredById === currentUser.uid)
        : accessibleLeads,
    [accessibleLeads, currentUser.role, currentUser.uid]
  );

  const leadOverview = useMemo(() => {
    const count = (selection: LeadOverviewSelection) =>
      overviewLeads.filter(lead => matchesLeadOverviewSelection(lead, selection, filterDefinitions)).length;
    return {
      total: overviewLeads.length,
      quoted: count('quoted'),
      pending: count('pending'),
      won: count('won'),
      lost: count('lost'),
      converted: count('converted')
    };
  }, [filterDefinitions, overviewLeads]);

  const overviewDrilldownIds = useMemo(
    () => (overviewDrilldown ? new Set(overviewDrilldown.ids) : null),
    [overviewDrilldown]
  );

  const {
    searchTerm,
    setSearchTerm,
    leadPageSize,
    setLeadPageSize,
    setLeadCurrentPage,
    dynamicFilters,
    setDynamicFilters,
    insightFilters,
    setInsightFilters,
    customFieldFilters,
    setCustomFieldFilters,
    advancedFilters,
    setAdvancedFilters,
    showLeadFilters,
    setShowLeadFilters,
    customFilterOptions,
    quickFilterOptionsByField,
    leadQuickFilterCount,
    leadActiveFilterCount,
    leadFilterChips,
    filteredLeads,
    leadTotalPages,
    safeLeadCurrentPage,
    displayedLeads
  } = useLeadListFilters({
    customFieldDefinitions,
    accessibleLeads,
    filterDefinitions,
    visibleFilterDefinitions,
    t,
    inlineSystemFieldConfiguration,
    customProfileDefinitions,
    users,
    overviewSelection,
    overviewDrilldown,
    systemFilterDefinitions,
    setOverviewSelection,
    setOverviewDrilldown,
    leadListPrepared,
    workspaceTab,
    overviewDrilldownIds
  });

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
  }, [
    initialInsightFilterId,
    setAdvancedFilters,
    setCustomFieldFilters,
    setDynamicFilters,
    setInsightFilters,
    setLeadCurrentPage
  ]);
  const isOverdue = (lead: LeadRecord) => {
    if (!lead.nextFollowUpAt || ['won', 'lost', 'converted'].includes(lead.stage)) return false;
    const timestamp = new Date(lead.nextFollowUpAt).getTime();
    return Number.isFinite(timestamp) && timestamp < LEADS_PAGE_REFERENCE_TIME;
  };

  useEffect(() => {
    setLeadCurrentPage(1);
  }, [searchTerm, dynamicFilters, insightFilters, customFieldFilters, advancedFilters]);

  const selectedLead = selectedLeadId ? leads.find(lead => lead.id === selectedLeadId) || null : null;

  const leadRepositoryFolders = selectedLead
    ? getCustomerRepositoryFolders(selectedLead).filter(folder => folder.active !== false)
    : [];
  const activeLeadRepositoryFolder =
    leadRepositoryFolders.find(folder => folder.id === activeLeadFolderId) || leadRepositoryFolders[0];
  const activeLeadRepositoryFiles =
    selectedLead && activeLeadRepositoryFolder
      ? (selectedLead.files || []).filter(
          file => resolveCustomerFileFolderId(file, leadRepositoryFolders) === activeLeadRepositoryFolder.id
        )
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

  const updateForm = <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => {
    if (field === 'taxCode') setTaxCodeSaveError('');
    setForm(previous => ({ ...previous, [field]: value }));
  };

  const editingLead = editingLeadId ? leads.find(lead => lead.id === editingLeadId) || null : null;
  const convertingCandidate = convertingCandidateId
    ? candidates.find(candidate => candidate.id === convertingCandidateId) || null
    : null;
  const isTaxCodeLocked = Boolean(
    (editingLeadId && normalizeTaxCode(editingLead?.taxCode)) ||
    (convertingCandidateId && normalizeTaxCode(convertingCandidate?.taxCode))
  );
  const taxCodeConflict = useMemo(
    () => findTaxCodeConflict(form.taxCode, leads, customers, editingLeadId, editingLead?.convertedCustomerId || ''),
    [customers, editingLead?.convertedCustomerId, editingLeadId, form.taxCode, leads]
  );
  const candidateTaxCodeConflict = useMemo(() => {
    const normalizedTaxCode = normalizeTaxCode(form.taxCode);
    if (!normalizedTaxCode) return null;
    const excludedCandidateId = convertingCandidateId || editingLead?.sourceCandidateId || '';
    return (
      candidates.find(
        candidate => candidate.id !== excludedCandidateId && normalizeTaxCode(candidate.taxCode) === normalizedTaxCode
      ) || null
    );
  }, [candidates, convertingCandidateId, editingLead?.sourceCandidateId, form.taxCode]);

  const describeTaxCodeConflict = (conflict: TaxCodeConflictRecord): string => {
    const saleName =
      conflict.assignedSaleName || users.find(user => user.uid === conflict.assignedSaleId)?.displayName || 'Sale khác';
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

  const openEditForm = useCallback(
    (lead: LeadRecord, initialTab: LeadDetailTab = 'classification') => {
      const leadIndustryDefinition = customFieldDefinitions.find(
        definition => definition.section === 'company' && normalizeSearchText(definition.name) === 'nganh nghe'
      );
      const legacyIndustry =
        leadIndustryDefinition && lead.customFieldValues?.[leadIndustryDefinition.id] !== undefined
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
    },
    [customFieldDefinitions, enterLeadProfileHistory, filterDefinitions]
  );

  const openLeadById = useCallback(
    (leadId: string) => {
      const lead = leads.find(entry => entry.id === leadId);
      if (lead) openEditForm(lead);
    },
    [leads, openEditForm]
  );

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
    return runMutationAction(
      'LeadsPage.tsx:saveClassification',
      async () => {
        const canManage =
          currentUser.role === 'admin' || (currentUser.role === 'sale' && lead.assignedSaleId === currentUser.uid);
        if (!canManage) throw new Error('Not allowed to classify this lead');
        const now = new Date().toISOString();
        await requireConfirmedMutation(
          dbService.updateDocument('leads', lead.id, {
            customerInsightValues: values,
            updatedAt: now,
            updatedBy: currentUser.displayName
          })
        );
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

        showSuccessToast('Đã lưu thành công');
      },
      lead
    );
  };

  const {
    scheduleForm,
    setScheduleForm,
    scheduleError,
    savingSchedule,
    scheduleLead,
    openScheduleForm,
    closeScheduleForm,
    handleSaveSchedule
  } = useLeadSchedule({ leads, currentUser });

  const openCreateFormFromCandidate = useCallback(
    (candidate: LeadCandidateRecord) => {
      setEditingLeadId('');
      setConvertingCandidateId(candidate.id);
      setUploadingFiles(
        Array.isArray(candidate.files)
          ? candidate.files.flatMap((value, index) => {
              if (!value || typeof value !== 'object') return [];
              const file = value as Record<string, unknown>;
              const name = String(file.name || file.fileName || '');
              if (!name) return [];
              return [
                {
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
                } satisfies LeadFileRecord
              ];
            })
          : []
      );
      setFormProfileValues({});
      const sharedCustomValues = { ...(candidate.customFieldValues || {}) };
      const rawDefinitions = allCustomFieldDefinitions.filter(
        definition => definition.table === 'lead_candidates' && !definition.removed
      );
      const rawIndustryDefinition = rawDefinitions.find(
        definition => definition.section === 'company' && normalizeSearchText(definition.name) === 'nganh nghe'
      );
      const rawIndustry =
        rawIndustryDefinition && candidate.customFieldValues?.[rawIndustryDefinition.id] !== undefined
          ? formatEntityCustomFieldValue(rawIndustryDefinition, candidate.customFieldValues[rawIndustryDefinition.id])
          : '';
      for (const leadDefinition of customFieldDefinitions) {
        const rawDefinition = rawDefinitions.find(
          definition =>
            definition.section === leadDefinition.section &&
            definition.type === leadDefinition.type &&
            normalizeSearchText(definition.name) === normalizeSearchText(leadDefinition.name)
        );
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
    },
    [
      allCustomFieldDefinitions,
      currentUser,
      customFieldDefinitions,
      enterLeadProfileHistory,
      filterDefinitions,
      saleUsers
    ]
  );

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
    return runMutationAction(
      'LeadsPage.tsx:handleAddLeadRepositoryFolder',
      async () => {
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
          id: createCustomerFolderId(
            name,
            folders.map(folder => folder.id)
          ),
          name,
          parentId: null,
          order: Math.max(0, ...folders.map(folder => Number(folder.order) || 0)) + 10,
          active: true,
          createdAt: now,
          createdById: currentUser.uid,
          updatedAt: '',
          updatedById: ''
        };
        await requireConfirmedMutation(
          dbService.updateDocument('leads', selectedLead.id, {
            fileFolders: [...folders, newFolder],
            updatedAt: now,
            updatedBy: currentUser.displayName
          })
        );
        setNewLeadFolderName('');
        setActiveLeadFolderId(newFolder.id);

        showSuccessToast('Đã thêm thành công');
      },
      undefined
    );
  };

  const handleRenameLeadRepositoryFolder = async (folderId: string) => {
    return runMutationAction(
      'LeadsPage.tsx:handleRenameLeadRepositoryFolder',
      async () => {
        if (!selectedLead || currentUser.role !== 'admin') return;
        const name = leadFolderNameDraft.trim();
        if (!name) return;
        const folders = getCustomerRepositoryFolders(selectedLead);
        if (
          folders.some(
            folder =>
              folder.id !== folderId &&
              folder.name.trim().toLocaleLowerCase('vi-VN') === name.toLocaleLowerCase('vi-VN')
          )
        ) {
          window.alert(t('Tên thư mục này đã tồn tại.'));
          return;
        }
        const now = new Date().toISOString();
        const nextFolders = folders.map(folder =>
          folder.id === folderId
            ? {
                ...folder,
                name,
                updatedAt: now,
                updatedById: currentUser.uid
              }
            : folder
        );
        await requireConfirmedMutation(
          dbService.updateDocument('leads', selectedLead.id, {
            fileFolders: nextFolders,
            updatedAt: now,
            updatedBy: currentUser.displayName
          })
        );
        setRenamingLeadFolderId('');
        setLeadFolderNameDraft('');

        showSuccessToast('Đã lưu thành công');
      },
      folderId
    );
  };

  const handleUploadLeadRepositoryFile = async (event: React.FormEvent) => {
    return runMutationAction(
      'LeadsPage.tsx:handleUploadLeadRepositoryFile',
      async () => {
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
        await requireConfirmedMutation(
          dbService.updateDocument('leads', selectedLead.id, {
            files: [...(selectedLead.files || []), file],
            fileFolders: getCustomerRepositoryFolders(selectedLead),
            updatedAt: now,
            updatedBy: currentUser.displayName
          })
        );
        setUploadingFiles(previous => [...previous.filter(entry => entry.id !== file.id), file]);
        setLeadRepositoryFile('');
        setLeadRepositoryFileName('');
        setLeadRepositoryFileLink('');

        showSuccessToast('Đã lưu thành công');
      },
      event
    );
  };

  const handleDeleteLeadRepositoryFile = async (fileId: string) => {
    return runMutationAction(
      'LeadsPage.tsx:handleDeleteLeadRepositoryFile',
      async () => {
        if (!selectedLead || (currentUser.role !== 'admin' && currentUser.role !== 'sale')) return;
        if (!(await confirmDelete(t('Bạn có chắc chắn muốn xóa tệp này khỏi kho lưu trữ?')))) return;
        await requireConfirmedMutation(
          dbService.updateDocument('leads', selectedLead.id, {
            files: (selectedLead.files || []).filter(file => file.id !== fileId),
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.displayName
          })
        );
        setUploadingFiles(previous => previous.filter(file => file.id !== fileId));

        showSuccessToast('Đã xóa thành công');
      },
      fileId
    );
  };

  const handleDeleteLeadRepositoryFolder = async (folderId: string) => {
    return runMutationAction(
      'LeadsPage.tsx:handleDeleteLeadRepositoryFolder',
      async () => {
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
        await requireConfirmedMutation(
          dbService.updateDocument('leads', selectedLead.id, {
            fileFolders: nextFolders,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.displayName
          })
        );
        setActiveLeadFolderId(nextFolders[0]?.id || '');

        showSuccessToast('Đã xóa thành công');
      },
      folderId
    );
  };

  const handleSaveLead = async (event: React.FormEvent) => {
    return runMutationAction(
      'LeadsPage.tsx:handleSaveLead',
      async () => {
        event.preventDefault();
        const normalizedTaxCode = normalizeTaxCode(form.taxCode);
        if (!form.companyName.trim() || !normalizedTaxCode) return;
        const missingCustomFields = getMissingRequiredEntityFields(
          profileFormCustomFieldDefinitions,
          customFieldValues,
          currentUser.role
        );
        if (missingCustomFields.length > 0) {
          setTaxCodeSaveError(
            `Vui lòng nhập trường bắt buộc: ${missingCustomFields.map(field => field.name).join(', ')}.`
          );
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
            ? dbService.getCollectionByField('lead_candidates', 'assignedSaleId', currentUser.uid, {
                maxResults: 10000
              })
            : dbService.getCollection('lead_candidates')
        ]);
        const latestLeads = latestLeadData as LeadRecord[];
        const latestCandidates = latestCandidateData as LeadCandidateRecord[];
        const conversionCandidate = convertingCandidateId
          ? latestCandidates.find(candidate => candidate.id === convertingCandidateId) || null
          : null;
        const reusableLead = conversionCandidate
          ? latestLeads.find(
              lead =>
                lead.returnedToRawData &&
                (lead.id === conversionCandidate.returnedFromLeadId ||
                  lead.returnedToRawDataCandidateId === conversionCandidate.id ||
                  normalizeTaxCode(lead.taxCode) === normalizedTaxCode)
            ) || null
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
          setTaxCodeSaveError(
            `Mã số thuế này đang nằm trong Dữ liệu khách hàng của doanh nghiệp “${latestCandidateConflict.companyName}”.`
          );
          return;
        }

        const assignedSale = saleUsers.find(user => user.uid === form.assignedSaleId);
        const discoveredById =
          form.discoveredById || (currentUser.role === 'sale' ? currentUser.uid : form.assignedSaleId);
        const discoveredBy = saleUsers.find(user => user.uid === discoveredById);
        const currentFilterValues = editingLead ? getLeadFilterValues(editingLead, filterDefinitions) : {};
        const provinceOptionId = findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.province, form.province);
        const selectedProvinceValues = formFilterValues[LEAD_FILTER_IDS.province] || [];
        const selectedProvince =
          selectedProvinceValues.length > 0
            ? findLeadFilterParentOption(
                filterDefinitions,
                LEAD_FILTER_IDS.province,
                selectedProvinceValues.at(-1) || ''
              )
            : undefined;
        const provinceFilterValues =
          selectedProvince?.id === provinceOptionId ? selectedProvinceValues : [provinceOptionId].filter(Boolean);
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
          [LEAD_FILTER_IDS.source]: [
            findLeadFilterOptionId(filterDefinitions, LEAD_FILTER_IDS.source, form.source)
          ].filter(Boolean)
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
          followUpHandledAt: form.nextFollowUpAt ? '' : editingLead?.followUpHandledAt || '',
          followUpHandledById: form.nextFollowUpAt ? '' : editingLead?.followUpHandledById || '',
          followUpHandledByName: form.nextFollowUpAt ? '' : editingLead?.followUpHandledByName || '',
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
          await requireConfirmedMutation(
            dbService.updateDocument('leads', reusableLead.id, {
              ...payload,
              returnedToRawData: false,
              returnedToRawDataAt: '',
              returnedToRawDataCandidateId: '',
              returnedToRawDataById: '',
              returnedToRawDataByName: '',
              activities: [
                {
                  id: `activity-returned-to-lead-${now}`,
                  type: 'returned_to_lead',
                  note: 'Tiếp nhận lại từ Dữ liệu thô',
                  occurredAt: now,
                  createdById: currentUser.uid,
                  createdByName: currentUser.displayName
                },
                ...(reusableLead.activities || [])
              ]
            })
          );
        } else {
          try {
            const createdLead = await dbService.addDocumentIfAbsent(
              'leads',
              createLeadDocumentIdFromTaxCode(normalizedTaxCode),
              {
                ...payload,
                activities: [
                  {
                    id: `activity-${now}`,
                    type: 'created',
                    note: 'Khởi tạo khách hàng tiềm năng',
                    occurredAt: now,
                    createdById: currentUser.uid,
                    createdByName: currentUser.displayName
                  }
                ],
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
            setTaxCodeSaveError(
              existingLead
                ? describeTaxCodeConflict({
                    id: existingLead.id,
                    recordType: 'lead',
                    companyName: existingLead.companyName,
                    assignedSaleId: existingLead.assignedSaleId,
                    assignedSaleName: existingLead.assignedSaleName
                  })
                : 'Mã số thuế này vừa được một Sale khác đăng ký. Vui lòng kiểm tra lại.'
            );
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
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', convertingCandidateId, {
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
            })
          );
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
      },
      event
    );
  };

  const findDuplicateCustomer = (lead: LeadRecord) => {
    const companyName = lead.companyName.trim().toLowerCase();
    const phone = lead.phone.replace(/\s/g, '');
    const taxCode = lead.taxCode.replace(/\s/g, '');
    return customers.find(
      customer =>
        (companyName && customer.companyName.trim().toLowerCase() === companyName) ||
        (phone && customer.phone.replace(/\s/g, '') === phone) ||
        (taxCode && customer.taxCode.replace(/\s/g, '') === taxCode)
    );
  };

  const handleConvertLead = (lead: LeadRecord) => {
    const duplicate = findDuplicateCustomer(lead);
    if (duplicate) {
      window.alert(
        `Khách hàng có thể đã tồn tại trong CRM: ${duplicate.companyName} (${duplicate.customerCode || duplicate.id}).`
      );
      return;
    }
    if (!window.confirm(`Mở biểu mẫu khách hàng và đơn đầu tiên cho "${lead.companyName}"?`)) return;
    onConvertLead(lead);
  };

  const handleReturnLeadToRawData = async (lead: LeadRecord) => {
    return runMutationAction(
      'LeadsPage.tsx:handleReturnLeadToRawData',
      async () => {
        const canManage = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
        if (!canManage || lead.stage === 'converted' || lead.convertedCustomerId) return;
        if (
          !window.confirm(
            `Chuyển Lead “${lead.companyName}” về Dữ liệu thô? Lead sẽ rời danh sách tiềm năng và có thể được tiếp nhận lại sau.`
          )
        )
          return;

        setReturningLeadId(lead.id);
        try {
          const latestCandidates = (await (currentUser.role === 'sale'
            ? dbService.getCollectionByField('lead_candidates', 'assignedSaleId', currentUser.uid, {
                maxResults: 10000
              })
            : dbService.getCollection('lead_candidates'))) as LeadCandidateRecord[];
          const linkedCandidate =
            latestCandidates.find(
              candidate =>
                candidate.id === lead.sourceCandidateId ||
                candidate.convertedLeadId === lead.id ||
                candidate.returnedFromLeadId === lead.id
            ) || null;
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
            taskStatus: nextContactAt ? ('pending' as const) : ('dismissed' as const),
            taskSource: nextContactAt ? ('sale_created' as const) : ('' as const),
            taskAssignedAt: nextContactAt ? now : '',
            taskAssignedById: nextContactAt ? currentUser.uid : '',
            taskAssignedByName: nextContactAt ? currentUser.displayName : '',
            taskCompletedAt: '',
            taskCompletedById: '',
            taskCompletedByName: '',
            taskDismissedAt: '',
            workQueueHidden: !nextContactAt,
            workStatus: nextContactAt ? ('pending' as const) : ('not_contacted' as const),
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
            await requireConfirmedMutation(
              dbService.updateDocument('lead_candidates', linkedCandidate.id, {
                ...candidatePayload,
                contactLogs: [returnLog, ...(linkedCandidate.contactLogs || [])].slice(0, 50)
              })
            );
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

          await requireConfirmedMutation(
            dbService.updateDocument('leads', lead.id, {
              returnedToRawData: true,
              returnedToRawDataAt: now,
              returnedToRawDataCandidateId: candidateId,
              returnedToRawDataById: currentUser.uid,
              returnedToRawDataByName: currentUser.displayName,
              reminderTime: '',
              nextFollowUpAt: '',
              activities: [
                {
                  id: `activity-returned-to-raw-data-${now}`,
                  type: 'returned_to_raw_data',
                  note: `Chuyển về Dữ liệu thô (${candidateId})`,
                  occurredAt: now,
                  createdById: currentUser.uid,
                  createdByName: currentUser.displayName
                },
                ...(lead.activities || [])
              ],
              updatedBy: currentUser.displayName
            })
          );

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

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          console.error('[Leads] Could not return lead to raw data.', error);
          window.alert(
            isDocumentAlreadyExistsError(error)
              ? 'Doanh nghiệp này vừa được tạo trong Dữ liệu thô. Vui lòng kiểm tra lại danh sách.'
              : 'Không thể chuyển Lead về Dữ liệu thô. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.'
          );
        } finally {
          setReturningLeadId('');
        }
      },
      lead
    );
  };

  const handleMarkFollowUpHandled = async (lead: LeadRecord) => {
    return runMutationAction(
      'LeadsPage.tsx:handleMarkFollowUpHandled',
      async () => {
        if (!lead.nextFollowUpAt || !Number.isFinite(getLeadScheduleTime(lead))) return;
        const canHandle = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
        if (!canHandle) return;

        const now = new Date().toISOString();
        const handledSchedule = lead.nextFollowUpAt;
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('leads', lead.id, {
              reminderTime: '',
              nextFollowUpAt: '',
              lastFollowUpAt: handledSchedule,
              followUpHandledAt: now,
              followUpHandledById: currentUser.uid,
              followUpHandledByName: currentUser.displayName,
              activities: [
                {
                  id: `activity-follow-up-handled-${now}`,
                  type: 'follow_up_handled',
                  note: `Đã xử lý lịch chăm sóc ${formatDateTime(handledSchedule)}`,
                  occurredAt: now,
                  createdById: currentUser.uid,
                  createdByName: currentUser.displayName
                },
                ...(lead.activities || [])
              ],
              updatedAt: now,
              updatedBy: currentUser.displayName
            })
          );

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

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          console.error('[Leads] Could not mark follow-up as handled.', error);
          window.alert('Không thể đánh dấu lịch chăm sóc đã xử lý. Vui lòng thử lại.');
        }
      },
      lead
    );
  };

  const handleDeleteLead = async (lead: LeadRecord) => {
    return runMutationAction(
      'LeadsPage.tsx:handleDeleteLead',
      async () => {
        const canDelete = currentUser.role === 'admin' || lead.assignedSaleId === currentUser.uid;
        if (!canDelete) return;
        if (!(await confirmDelete(`Đưa Lead “${lead.companyName}” vào Thùng rác?`))) return;

        const now = new Date().toISOString();
        try {
          await requireConfirmedMutation(
            dbService.updateDocument('leads', lead.id, {
              deleted: true,
              deletedAt: now,
              deletedById: currentUser.uid,
              deletedByName: currentUser.displayName,
              updatedAt: now,
              updatedBy: currentUser.displayName
            })
          );
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

          showSuccessToast('Đã xóa Lead');
        } catch (error) {
          showErrorToast();
          console.error('[Leads] Could not delete lead.', error);
          window.alert('Không thể xóa Lead. Vui lòng thử lại hoặc kiểm tra quyền tài khoản.');
        }
      },
      lead
    );
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
  }, [
    setAdvancedFilters,
    setCustomFieldFilters,
    setDynamicFilters,
    setInsightFilters,
    setLeadCurrentPage,
    setSearchTerm
  ]);

  const openOverviewList = useCallback(
    (selection: LeadOverviewSelection | null) => {
      clearFilters();
      setOverviewDrilldown({
        label: selection ? LEAD_OVERVIEW_LABELS[selection] : 'Tổng KH tiềm năng',
        ids: overviewLeads
          .filter(lead => !selection || matchesLeadOverviewSelection(lead, selection, filterDefinitions))
          .map(lead => lead.id)
      });
      setLeadListPrepared(true);
      setWorkspaceTab('list');
    },
    [clearFilters, filterDefinitions, overviewLeads]
  );

  const openOverviewDrilldown = useCallback(
    (label: string, matchingLeads: LeadRecord[]) => {
      clearFilters();
      setOverviewDrilldown({ label, ids: matchingLeads.map(lead => lead.id) });
      setLeadListPrepared(true);
      setWorkspaceTab('list');
    },
    [clearFilters]
  );

  const handleOverviewMetricClick = useCallback(
    (key: string | null) => {
      openOverviewList(key as LeadOverviewSelection | null);
    },
    [openOverviewList]
  );

  const openLeadListTab = () => {
    setOverviewSelection(null);
    setOverviewDrilldown(null);
    setLeadListPrepared(true);
    setWorkspaceTab('list');
  };

  const overviewCards = useMemo<Array<{ key: LeadOverviewSelection | null; label: string; count: number }>>(
    () => [
      { key: null, label: 'Tổng KH tiềm năng', count: leadOverview.total },
      { key: 'quoted', label: 'Đã gửi báo giá', count: leadOverview.quoted },
      { key: 'pending', label: 'Đang chờ chốt', count: leadOverview.pending },
      { key: 'won', label: 'Đã chốt', count: leadOverview.won },
      { key: 'lost', label: 'Không thành công', count: leadOverview.lost },
      { key: 'converted', label: 'Đã thành khách hàng', count: leadOverview.converted }
    ],
    [leadOverview]
  );

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
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleAddLeadRepositoryFolder()}
                  disabled={!newLeadFolderName.trim()}
                >
                  {t('Tạo thư mục')}
                </button>
              </div>
            )}

            <div className="customer-drive-folder-list">
              {leadRepositoryFolders.map(folder => {
                const fileCount = (selectedLead.files || []).filter(
                  file => resolveCustomerFileFolderId(file, leadRepositoryFolders) === folder.id
                ).length;
                return (
                  <div
                    key={folder.id}
                    className={`customer-drive-folder ${activeLeadRepositoryFolder?.id === folder.id ? 'is-active' : ''}`}
                  >
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
                        <button type="button" onClick={() => void handleRenameLeadRepositoryFolder(folder.id)}>
                          {t('Lưu')}
                        </button>
                        <button type="button" onClick={() => setRenamingLeadFolderId('')}>
                          {t('Hủy')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="customer-drive-folder-select"
                          onClick={() => setActiveLeadFolderId(folder.id)}
                        >
                          <span title={folder.name}>{folder.name}</span>
                          <small>{fileCount}</small>
                        </button>
                        {currentUser.role === 'admin' && (
                          <div className="customer-drive-folder-actions">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingLeadFolderId(folder.id);
                                setLeadFolderNameDraft(folder.name);
                              }}
                            >
                              {t('Đổi tên')}
                            </button>
                            <button type="button" onClick={() => void handleDeleteLeadRepositoryFolder(folder.id)}>
                              {t('Xóa')}
                            </button>
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
                    <input
                      value={leadRepositoryFileName}
                      onChange={event => setLeadRepositoryFileName(event.target.value)}
                      required
                      placeholder={t('Ví dụ: File thiết kế nhãn chai')}
                    />
                  </label>
                  <label>
                    <span>{t('Chọn tệp dưới 900 KB')}</span>
                    <input type="file" onChange={handleLeadRepositoryFileChange} />
                  </label>
                  <label>
                    <span>{t('Hoặc đường dẫn Drive/OneDrive')}</span>
                    <input
                      type="url"
                      value={leadRepositoryFileLink}
                      onChange={event => setLeadRepositoryFileLink(event.target.value)}
                      placeholder="https://..."
                    />
                  </label>
                  <button type="submit" className="btn btn-primary">
                    {t('Lưu tài liệu')}
                  </button>
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
                        <td>
                          <strong title={file.name}>{file.name}</strong>
                        </td>
                        <td>{isImage ? t('Hình ảnh') : file.url ? t('Đường dẫn') : t('Tệp tài liệu')}</td>
                        <td>{formatDateTime(file.createdAt)}</td>
                        <td>
                          {file.createdBy || users.find(user => user.uid === file.createdById)?.displayName || '—'}
                        </td>
                        <td>
                          <div className="customer-drive-file-actions">
                            {file.url ? (
                              <a href={file.url} target="_blank" rel="noreferrer">
                                {t('Mở liên kết')}
                              </a>
                            ) : (
                              source && (
                                <a href={source} download={file.name}>
                                  {t('Tải xuống')}
                                </a>
                              )
                            )}
                            {(currentUser.role === 'admin' || currentUser.role === 'sale') && (
                              <button type="button" onClick={() => void handleDeleteLeadRepositoryFile(file.id)}>
                                {t('Xóa')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {activeLeadRepositoryFiles.length === 0 && (
                    <tr>
                      <td colSpan={5} className="lead-file-repository-empty">
                        {t('Chưa có tài liệu trong thư mục này.')}
                      </td>
                    </tr>
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
      ? users.find(user => user.uid === editingLead.assignedSaleId)?.displayName ||
        editingLead.assignedSaleName ||
        'Chưa phân công'
      : '';
    const canManageEditingLead = Boolean(
      editingLead &&
      (currentUser.role === 'admin' || (currentUser.role === 'sale' && editingLead.assignedSaleId === currentUser.uid))
    );
    const profileFields: Array<string | number> = [
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
      form.note,
      form.assignedSaleId,
      form.discoveredById,
      form.nextFollowUpAt,
      form.stage,
      form.potentialValue,
      form.closingProbability,
      form.expectedCloseAt,
      form.lastContactResult,
      form.nextGoal,
      form.careNote
    ];
    const completedProfileFields = profileFields.filter(value =>
      typeof value === 'number' ? value > 0 : String(value || '').trim().length > 0
    ).length;
    return (
      <SystemFieldSurface table="leads" className="lead-form-page">
        <header className={`lead-form-page__header${editingLead ? ' lead-record-header crm-record-header' : ''}`}>
          <PageBackButton iconOnly title={t('Quay lại danh sách khách hàng tiềm năng')} onClick={closeLeadForm} />
          {editingLead ? (
            <>
              <div className="lead-record-header__identity">
                <CrmRecordHeaderIdentity title={form.companyName || editingLead.companyName} />
              </div>
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
                    {
                      label: t('Hẹn lịch'),
                      icon: <CalendarClock size={14} />,
                      onSelect: () => openScheduleForm(editingLead)
                    },
                    ...(currentUser.role === 'admin'
                      ? [
                          {
                            label: t('Giao việc'),
                            icon: <ClipboardCheck size={14} />,
                            onSelect: () =>
                              setAssignmentTarget({
                                id: editingLead.id,
                                label: editingLead.companyName,
                                module: 'leads'
                              })
                          }
                        ]
                      : []),
                    ...(currentUser.role === 'sale'
                      ? [
                          {
                            label: t('Yêu cầu hỗ trợ'),
                            icon: <LifeBuoy size={14} />,
                            onSelect: () =>
                              setSupportTarget({ id: editingLead.id, label: editingLead.companyName, module: 'leads' })
                          }
                        ]
                      : []),
                    ...(!['converted'].includes(editingLead.stage) && !editingLead.convertedCustomerId
                      ? [
                          {
                            label:
                              returningLeadId === editingLead.id ? t('Đang chuyển...') : t('Chuyển về Dữ liệu thô'),
                            icon: <Undo2 size={14} />,
                            onSelect: () => void handleReturnLeadToRawData(editingLead),
                            disabled: returningLeadId === editingLead.id || !canManageEditingLead
                          }
                        ]
                      : []),
                    ...(!['converted', 'lost'].includes(editingLead.stage)
                      ? [
                          {
                            label: t('Chuyển thành khách hàng'),
                            icon: <UserCheck size={14} />,
                            onSelect: () => handleConvertLead(editingLead),
                            disabled: !canManageEditingLead
                          }
                        ]
                      : []),
                    ...(editingLead.stage === 'converted'
                      ? [{ label: t('Mở CRM'), icon: <Building2 size={14} />, onSelect: onNavigateToCrm }]
                      : []),
                    {
                      label: t('Xóa Lead'),
                      icon: <Trash2 size={14} />,
                      onSelect: () => void handleDeleteLead(editingLead),
                      danger: true,
                      disabled: !canManageEditingLead
                    }
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
            </>
          ) : (
            <div>
              <span>{convertingCandidateId ? t('CHUYỂN TỪ DỮ LIỆU KHÁCH HÀNG') : t('HỒ SƠ MỚI')}</span>
              <h1>{convertingCandidateId ? t('Tiếp nhận khách hàng thành Lead') : t('Thêm khách hàng tiềm năng')}</h1>
            </div>
          )}
        </header>

        {editingLead && (
          <div className="lead-detail-panel" hidden={leadDetailTab !== 'classification'}>
            <CustomerInsightClassification
              key={editingLead.id}
              companyName={editingLead.companyName}
              values={form.customerInsightValues}
              canEdit={canManageEditingLead}
              onSave={values => saveClassification(editingLead, values)}
              toolbarActions={
                <PhoneCallCell
                  toolbar
                  phone={editingLead.phone}
                  companyName={editingLead.companyName}
                  subjectKey={leadCallSubjectKey(editingLead)}
                  historyKeys={leadCallHistoryKeys(editingLead)}
                  auditModule="leads"
                  targetType="lead"
                  targetId={editingLead.id}
                  currentUser={currentUser}
                  canRecord={canManageEditingLead}
                />
              }
            />
          </div>
        )}

        <form
          id="lead-profile-form"
          className="lead-form-page__form lead-detail-panel"
          hidden={Boolean(editingLead && leadDetailTab !== 'profile')}
          onSubmit={handleSaveLead}
        >
          <LeadProfileFields
            editingLead={editingLead}
            leadDetailTab={leadDetailTab}
            form={form}
            updateForm={updateForm}
            setForm={setForm}
            currentUser={currentUser}
            leadSourceOptions={leadSourceOptions}
            saleUsers={saleUsers}
            taxCode={{
              isTaxCodeLocked,
              taxCodeConflict,
              candidateTaxCodeConflict,
              taxCodeSaveError,
              describeTaxCodeConflict
            }}
            customFields={{
              profileFormCustomFieldDefinitions,
              customFieldValues,
              setCustomFieldValues,
              inlineSystemFieldConfiguration,
              clearPurgedCustomField,
              clearPurgedSystemField
            }}
            attachments={{
              handleLeadFilesChange,
              attachmentLinkName,
              setAttachmentLinkName,
              attachmentLinkUrl,
              setAttachmentLinkUrl,
              handleAddAttachmentLink,
              uploadingFiles,
              setUploadingFiles
            }}
          />
          <footer className={`lead-form-page__footer${editingLead ? ' lead-form-page__footer--fixed' : ''}`}>
            <span>{t('Các thay đổi chỉ được ghi nhận khi bấm Lưu.')}</span>
            <div>
              <button type="button" className="btn btn-outline" onClick={closeLeadForm}>
                {t('Hủy')}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={Boolean(taxCodeConflict || candidateTaxCodeConflict) || !normalizeTaxCode(form.taxCode)}
              >
                {editingLeadId
                  ? t('Cập nhật Lead')
                  : convertingCandidateId
                    ? t('Lưu Lead & hoàn tất tiếp cận')
                    : t('Lưu Lead')}
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
        <div
          className="lead-workspace-tabs content-tabs content-tabs--compact"
          role="tablist"
          aria-label="Không gian quản lý khách hàng tiềm năng"
        >
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'overview'}
            className={workspaceTab === 'overview' ? 'is-active' : ''}
            onClick={() => setWorkspaceTab('overview')}
          >
            Tổng quan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceTab === 'list'}
            className={workspaceTab === 'list' ? 'is-active' : ''}
            onClick={openLeadListTab}
          >
            Danh sách KH tiềm năng
          </button>
        </div>
        {workspaceTab === 'list' && (
          <LeadListToolbar
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            setLeadCurrentPage={setLeadCurrentPage}
            leadActiveFilterCount={leadActiveFilterCount}
            showLeadFilters={showLeadFilters}
            setShowLeadFilters={setShowLeadFilters}
            canEditColumns={canEditColumns}
            setShowColumnCustomizer={setShowColumnCustomizer}
            clearFilters={clearFilters}
            openCreateForm={openCreateForm}
          />
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

          <LeadFilterPanel
            customFieldDefinitions={customFieldDefinitions}
            filters={{
              showLeadFilters,
              leadQuickFilterCount,
              setShowLeadFilters,
              clearFilters,
              visibleFilterDefinitions,
              quickFilterOptionsByField,
              systemFilterDefinitions,
              dynamicFilters,
              setDynamicFilters,
              insightFilters,
              setInsightFilters,
              customFieldFilters,
              customFilterOptions,
              setCustomFieldFilters
            }}
          />

          <LeadListTable
            filteredLeads={filteredLeads}
            accessibleLeads={accessibleLeads}
            displayedLeads={displayedLeads}
            users={users}
            currentUser={currentUser}
            columns={{
              visibleLeadColumnCount,
              orderedLeadColumnIds,
              getLeadHeaderProps,
              leadColumnLabels,
              visibleLeadColumnIds,
              visibleLeadInsightItems,
              visibleLeadCustomFields
            }}
            cells={{ renderLeadText, getClassificationLabel, renderFollowUp }}
            actions={{
              openEditForm,
              openScheduleForm,
              setAssignmentTarget,
              setSupportTarget,
              returningLeadId,
              handleReturnLeadToRawData,
              handleDeleteLead
            }}
            paging={{ safeLeadCurrentPage, leadPageSize, setLeadPageSize, setLeadCurrentPage, leadTotalPages }}
          />
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
        <LeadScheduleDialog
          handleSaveSchedule={handleSaveSchedule}
          scheduleLead={scheduleLead}
          closeScheduleForm={closeScheduleForm}
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          scheduleError={scheduleError}
          savingSchedule={savingSchedule}
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
  );
};
