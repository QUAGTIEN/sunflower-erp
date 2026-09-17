import type { CustomerRecord, LeadRecord } from './crmModels';
import type { LeadCandidateRecord } from './leadCandidateModels';

export type CallResult = 'pending' | 'discussed' | 'no_answer' | 'busy' | 'callback' | 'wrong_number' | 'not_interested';

export interface PhoneCallRecord {
  id: string;
  subjectKey: string;
  companyName: string;
  phone: string;
  startedAt: string;
  createdById: string;
  createdByName: string;
  result: CallResult;
  note: string;
  confirmedAt: string;
  confirmedById: string;
  confirmedByName: string;
}

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  pending: 'Chưa xác nhận kết quả',
  discussed: 'Đã trao đổi',
  no_answer: 'Không nghe máy',
  busy: 'Máy bận',
  callback: 'Hẹn gọi lại',
  wrong_number: 'Sai số',
  not_interested: 'Không có nhu cầu'
};

export const candidateCallSubjectKey = (candidate: LeadCandidateRecord) => `candidate:${candidate.id}`;

export const leadCallSubjectKey = (lead: LeadRecord) => `lead:${lead.id}`;

export const leadCallHistoryKeys = (lead: LeadRecord) => [
  leadCallSubjectKey(lead),
  ...(lead.sourceCandidateId ? [`candidate:${lead.sourceCandidateId}`] : [])
];

export const customerCallSubjectKey = (customer: CustomerRecord) => `customer:${customer.id}`;

export const customerCallHistoryKeys = (customer: CustomerRecord, leads: LeadRecord[]) => {
  const keys = [customerCallSubjectKey(customer)];
  if (!customer.sourceLeadId) return keys;
  keys.push(`lead:${customer.sourceLeadId}`);
  const sourceLead = leads.find(lead => lead.id === customer.sourceLeadId);
  if (sourceLead?.sourceCandidateId) keys.push(`candidate:${sourceLead.sourceCandidateId}`);
  return keys;
};
