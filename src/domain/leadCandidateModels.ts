import { isActiveLeadRecord, type CustomerRecord, type LeadRecord } from './crmModels';
import { normalizeTaxCode } from './taxCodeUniqueness';
import { normalizeEntityCustomFieldValues, type EntityCustomFieldValues } from './entityFieldConfig';

export const LEAD_CANDIDATE_SCHEMA_VERSION = 10;

export type LeadCandidateStatus = 'new' | 'retry' | 'disqualified' | 'converted';
export type LeadCandidateTaskStatus = 'pending' | 'completed' | 'dismissed';
export type LeadCandidateTaskSource = 'admin_assigned' | 'sale_created' | '';
export type LeadCandidateWorkStatus = 'not_contacted' | 'pending' | 'completed';
export type LeadCandidateContactResult = 'not_contacted' | 'working' | 'called' | 'messaged' | 'callback';
export type LeadCandidatePotentialLevel = 'unrated' | 'not_fit' | 'low' | 'potential' | 'promising' | 'high';
export type LeadCandidateActivityType = 'call' | 'message' | 'email' | 'meeting' | 'note';
export type LeadCandidateLogEventType = 'contact_result' | 'potential_level' | 'schedule' | 'activity';
export type LeadCandidateContactOutcome =
  | 'not_contacted'
  | 'connected'
  | 'no_answer'
  | 'busy'
  | 'wrong_number'
  | 'call_back'
  | 'not_interested'
  | 'potential'
  | 'task_completed';

export interface LeadCandidateContactLog {
  id: string;
  occurredAt: string;
  outcome: LeadCandidateContactOutcome;
  eventType: LeadCandidateLogEventType;
  activityType: LeadCandidateActivityType | '';
  contactResult: LeadCandidateContactResult | '';
  potentialLevel: LeadCandidatePotentialLevel | '';
  description: string;
  note: string;
  nextContactAt: string;
  createdById: string;
  createdByName: string;
}

export interface LeadCandidateRecord extends Record<string, unknown> {
  id: string;
  schemaVersion: number;
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
  note: string;
  customFieldValues: EntityCustomFieldValues;
  status: LeadCandidateStatus;
  assignedSaleId: string;
  assignedSaleName: string;
  discoveredById: string;
  discoveredByName: string;
  contactAttempts: number;
  lastContactAt: string;
  lastContactOutcome: LeadCandidateContactOutcome | '';
  lastContactNote: string;
  contactLogs: LeadCandidateContactLog[];
  contactResult: LeadCandidateContactResult;
  potentialLevel: LeadCandidatePotentialLevel;
  nextContactAt: string;
  queuedNextContactAt: string;
  taskStatus: LeadCandidateTaskStatus;
  taskCompletedAt: string;
  taskCompletedById: string;
  taskCompletedByName: string;
  taskDismissedAt: string;
  taskSource: LeadCandidateTaskSource;
  taskAssignedAt: string;
  taskAssignedById: string;
  taskAssignedByName: string;
  workQueueHidden: boolean;
  workStatus: LeadCandidateWorkStatus;
  pinned: boolean;
  archived: boolean;
  archivedAt: string;
  archivedById: string;
  archivedByName: string;
  convertedLeadId: string;
  convertedAt: string;
  returnedFromLeadId: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt: string;
  updatedBy: string;
}

export type CandidateDuplicate = {
  id: string;
  recordType: 'candidate' | 'lead' | 'customer';
  companyName: string;
  reason: 'taxCode' | 'phone' | 'companyName';
};

const asRecord = (value: unknown): Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const asText = (value: unknown): string => typeof value === 'string' ? value : '';

const asNonNegativeInteger = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const normalizeStatus = (value: unknown): LeadCandidateStatus => {
  const statuses: LeadCandidateStatus[] = ['new', 'retry', 'disqualified', 'converted'];
  return statuses.includes(value as LeadCandidateStatus) ? value as LeadCandidateStatus : 'new';
};

const normalizeTaskStatus = (value: unknown, nextContactAt: string): LeadCandidateTaskStatus => {
  const statuses: LeadCandidateTaskStatus[] = ['pending', 'completed', 'dismissed'];
  if (statuses.includes(value as LeadCandidateTaskStatus)) return value as LeadCandidateTaskStatus;
  return nextContactAt ? 'pending' : 'dismissed';
};

const normalizeTaskSource = (
  value: unknown,
  nextContactAt: string,
  contactLogs: LeadCandidateContactLog[]
): LeadCandidateTaskSource => {
  const sources: Exclude<LeadCandidateTaskSource, ''>[] = ['admin_assigned', 'sale_created'];
  if (sources.includes(value as Exclude<LeadCandidateTaskSource, ''>)) {
    return value as LeadCandidateTaskSource;
  }
  if (contactLogs.some(log => log.description.startsWith('Bàn giao cho Sale'))) {
    return 'admin_assigned';
  }
  return nextContactAt ? 'sale_created' : '';
};

const normalizeWorkStatus = (
  value: unknown,
  taskStatus: LeadCandidateTaskStatus,
  nextContactAt: string,
  contactLogs: LeadCandidateContactLog[],
  lastContactAt: string
): LeadCandidateWorkStatus => {
  const statuses: LeadCandidateWorkStatus[] = ['not_contacted', 'pending', 'completed'];
  if (statuses.includes(value as LeadCandidateWorkStatus)) return value as LeadCandidateWorkStatus;
  if (taskStatus === 'completed') return 'completed';
  if (taskStatus === 'pending' && nextContactAt) return 'pending';
  if (contactLogs.some(log => log.outcome === 'task_completed') || lastContactAt) return 'completed';
  return 'not_contacted';
};

const normalizeContactOutcome = (value: unknown): LeadCandidateContactOutcome | '' => {
  const outcomes: LeadCandidateContactOutcome[] = [
    'connected',
    'not_contacted',
    'no_answer',
    'busy',
    'wrong_number',
    'call_back',
    'not_interested',
    'potential',
    'task_completed'
  ];
  return outcomes.includes(value as LeadCandidateContactOutcome)
    ? value as LeadCandidateContactOutcome
    : '';
};

const normalizeContactResult = (
  value: unknown,
  legacyOutcome: LeadCandidateContactOutcome | ''
): LeadCandidateContactResult => {
  const results: LeadCandidateContactResult[] = ['not_contacted', 'working', 'called', 'messaged', 'callback'];
  if (results.includes(value as LeadCandidateContactResult)) return value as LeadCandidateContactResult;
  if (value === 'connected' || value === 'unreachable') return 'called';
  if (legacyOutcome === 'call_back') return 'callback';
  if (legacyOutcome === 'connected' || legacyOutcome === 'potential' || legacyOutcome === 'task_completed') return 'called';
  if (legacyOutcome === 'no_answer' || legacyOutcome === 'busy' || legacyOutcome === 'wrong_number' || legacyOutcome === 'not_interested') return 'called';
  return 'not_contacted';
};

const normalizePotentialLevel = (
  value: unknown,
  legacyOutcome: LeadCandidateContactOutcome | ''
): LeadCandidatePotentialLevel => {
  const levels: LeadCandidatePotentialLevel[] = ['unrated', 'not_fit', 'low', 'potential', 'promising', 'high'];
  if (levels.includes(value as LeadCandidatePotentialLevel)) return value as LeadCandidatePotentialLevel;
  if (legacyOutcome === 'potential') return 'potential';
  if (legacyOutcome === 'not_interested') return 'not_fit';
  return 'unrated';
};

const normalizeActivityType = (value: unknown): LeadCandidateActivityType | '' => {
  const types: LeadCandidateActivityType[] = ['call', 'message', 'email', 'meeting', 'note'];
  return types.includes(value as LeadCandidateActivityType) ? value as LeadCandidateActivityType : '';
};

const normalizeLogEventType = (value: unknown): LeadCandidateLogEventType => {
  const types: LeadCandidateLogEventType[] = ['contact_result', 'potential_level', 'schedule', 'activity'];
  return types.includes(value as LeadCandidateLogEventType) ? value as LeadCandidateLogEventType : 'contact_result';
};

const normalizeContactLogs = (value: unknown): LeadCandidateContactLog[] => (
  Array.isArray(value)
    ? value.slice(0, 50).map(item => {
      const log = asRecord(item);
      const outcome = normalizeContactOutcome(log.outcome) || 'connected';
      const legacyPotentialLevel = outcome === 'potential'
        ? 'potential'
        : outcome === 'not_interested' ? 'not_fit' : '';
      return {
        id: asText(log.id),
        occurredAt: asText(log.occurredAt),
        outcome,
        eventType: asText(log.eventType)
          ? normalizeLogEventType(log.eventType)
          : legacyPotentialLevel ? 'potential_level' : 'contact_result',
        activityType: normalizeActivityType(log.activityType),
        contactResult: asText(log.contactResult)
          ? normalizeContactResult(log.contactResult, outcome)
          : normalizeContactResult('', outcome),
        potentialLevel: asText(log.potentialLevel)
          ? normalizePotentialLevel(log.potentialLevel, outcome)
          : legacyPotentialLevel,
        description: asText(log.description),
        note: asText(log.note),
        nextContactAt: asText(log.nextContactAt),
        createdById: asText(log.createdById),
        createdByName: asText(log.createdByName)
      };
    })
    : []
);

export const normalizeLeadCandidateRecord = (value: unknown): LeadCandidateRecord => {
  const source = asRecord(value);
  const nextContactAt = asText(source.nextContactAt);
  const taskStatus = normalizeTaskStatus(source.taskStatus, nextContactAt);
  const contactLogs = normalizeContactLogs(source.contactLogs);
  const taskSource = normalizeTaskSource(source.taskSource, nextContactAt, contactLogs);
  const legacyTaskLog = taskSource === 'admin_assigned'
    ? contactLogs.find(log => log.description.startsWith('Bàn giao cho Sale'))
    : contactLogs.find(log => log.eventType === 'schedule');
  const lastContactAt = asText(source.lastContactAt);
  const lastContactOutcome = normalizeContactOutcome(source.lastContactOutcome);
  return {
    ...source,
    id: asText(source.id),
    schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
    companyName: asText(source.companyName ?? source.name),
    contactPerson: asText(source.contactPerson),
    contactPosition: asText(source.contactPosition),
    phone: asText(source.phone),
    email: asText(source.email),
    taxCode: normalizeTaxCode(source.taxCode),
    address: asText(source.address),
    province: asText(source.province),
    ward: asText(source.ward),
    industrialPark: asText(source.industrialPark),
    website: asText(source.website),
    businessSector: asText(source.businessSector),
    expectedProducts: asText(source.expectedProducts),
    source: asText(source.source),
    sourceUrl: asText(source.sourceUrl),
    note: asText(source.note),
    customFieldValues: normalizeEntityCustomFieldValues(source.customFieldValues),
    status: normalizeStatus(source.status),
    assignedSaleId: asText(source.assignedSaleId),
    assignedSaleName: asText(source.assignedSaleName),
    discoveredById: asText(source.discoveredById ?? source.createdById),
    discoveredByName: asText(source.discoveredByName ?? source.createdByName),
    contactAttempts: asNonNegativeInteger(source.contactAttempts),
    lastContactAt,
    lastContactOutcome,
    lastContactNote: asText(source.lastContactNote),
    contactLogs,
    contactResult: normalizeContactResult(source.contactResult, lastContactOutcome),
    potentialLevel: normalizePotentialLevel(source.potentialLevel, lastContactOutcome),
    nextContactAt,
    queuedNextContactAt: asText(source.queuedNextContactAt),
    taskStatus,
    taskCompletedAt: asText(source.taskCompletedAt),
    taskCompletedById: asText(source.taskCompletedById),
    taskCompletedByName: asText(source.taskCompletedByName),
    taskDismissedAt: asText(source.taskDismissedAt),
    taskSource,
    taskAssignedAt: asText(source.taskAssignedAt) || legacyTaskLog?.occurredAt || '',
    taskAssignedById: asText(source.taskAssignedById) || legacyTaskLog?.createdById || '',
    taskAssignedByName: asText(source.taskAssignedByName) || legacyTaskLog?.createdByName || '',
    workQueueHidden: typeof source.workQueueHidden === 'boolean'
      ? source.workQueueHidden
      : !nextContactAt,
    workStatus: normalizeWorkStatus(source.workStatus, taskStatus, nextContactAt, contactLogs, lastContactAt),
    pinned: source.pinned === true,
    archived: source.archived === true,
    archivedAt: asText(source.archivedAt),
    archivedById: asText(source.archivedById),
    archivedByName: asText(source.archivedByName),
    convertedLeadId: asText(source.convertedLeadId),
    convertedAt: asText(source.convertedAt),
    returnedFromLeadId: asText(source.returnedFromLeadId),
    createdAt: asText(source.createdAt),
    createdById: asText(source.createdById),
    createdByName: asText(source.createdByName),
    updatedAt: asText(source.updatedAt),
    updatedBy: asText(source.updatedBy)
  };
};

export const normalizeLeadCandidateRecords = (values: unknown): LeadCandidateRecord[] => (
  Array.isArray(values) ? values.map(normalizeLeadCandidateRecord) : []
);

export const createCandidateDocumentIdFromTaxCode = (taxCode: string): string => (
  `candidate-mst-${normalizeTaxCode(taxCode)}`
);

const normalizeCompanyName = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('vi-VN')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]/g, '');

const normalizePhone = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

export const findCandidateDuplicate = (
  candidate: Pick<LeadCandidateRecord, 'companyName' | 'phone' | 'taxCode'>,
  candidates: LeadCandidateRecord[],
  leads: LeadRecord[],
  customers: CustomerRecord[],
  excludedCandidateId = ''
): CandidateDuplicate | null => {
  const taxCode = normalizeTaxCode(candidate.taxCode);
  const phone = normalizePhone(candidate.phone);
  const companyName = normalizeCompanyName(candidate.companyName);

  const sources = [
    ...candidates
      .filter(item => item.id !== excludedCandidateId)
      .map(item => ({ ...item, recordType: 'candidate' as const })),
    ...leads.filter(isActiveLeadRecord).map(item => ({ ...item, recordType: 'lead' as const })),
    ...customers.map(item => ({ ...item, recordType: 'customer' as const }))
  ];

  if (taxCode) {
    const duplicate = sources.find(item => normalizeTaxCode(item.taxCode) === taxCode);
    if (duplicate) {
      return { id: duplicate.id, recordType: duplicate.recordType, companyName: duplicate.companyName, reason: 'taxCode' };
    }
  }

  if (phone.length >= 8) {
    const duplicate = sources.find(item => normalizePhone(item.phone) === phone);
    if (duplicate) {
      return { id: duplicate.id, recordType: duplicate.recordType, companyName: duplicate.companyName, reason: 'phone' };
    }
  }

  if (companyName.length >= 5) {
    const duplicate = sources.find(item => normalizeCompanyName(item.companyName) === companyName);
    if (duplicate) {
      return { id: duplicate.id, recordType: duplicate.recordType, companyName: duplicate.companyName, reason: 'companyName' };
    }
  }

  return null;
};

export const mapCandidateSourceToLeadSource = (source: string): string => {
  const normalizedSource = source.trim().toLocaleLowerCase('vi-VN');
  if (normalizedSource === 'facebook' || normalizedSource === 'mạng xã hội') return 'Mạng xã hội';
  if (normalizedSource === 'website') return 'Website';
  if (normalizedSource === 'khách hàng giới thiệu') return 'Khách hàng giới thiệu';
  return 'Sale tự tìm kiếm';
};

export const mapLeadSourceToCandidateSource = (source: string): string => {
  const normalizedSource = source.trim().toLocaleLowerCase('vi-VN');
  if (normalizedSource === 'google maps') return 'Google Maps';
  if (normalizedSource === 'facebook') return 'Facebook';
  if (normalizedSource === 'mạng xã hội') return 'Mạng xã hội';
  if (normalizedSource === 'website') return 'Website';
  if (normalizedSource === 'khách hàng giới thiệu') return 'Khách hàng giới thiệu';
  return 'Khác';
};
