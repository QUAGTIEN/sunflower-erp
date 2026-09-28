import type { LeadCandidateRecord } from './leadCandidateModels';
import type { PhoneCallRecord } from './callHistory';
import { getLeadCandidateEffectiveScore } from './leadCandidateScoring';

export type RawPriorityGroup = 'call_first' | 'enrich' | 'verify';

export interface RawPriorityRules {
  targetIndustries: string;
  targetProducts: string;
  callFirstThreshold: number;
}

export const DEFAULT_RAW_PRIORITY_RULES: RawPriorityRules = {
  targetIndustries: '',
  targetProducts: '',
  callFirstThreshold: 55
};

export const RAW_PRIORITY_LABELS: Record<RawPriorityGroup, string> = {
  call_first: 'Nên gọi trước',
  enrich: 'Cần bổ sung thông tin',
  verify: 'Chưa nên gọi'
};

const normalize = (value: string) => value.toLocaleLowerCase('vi-VN').trim();
const matchesAny = (value: string, terms: string) => terms.split(',').map(normalize).filter(Boolean).some(term => normalize(value).includes(term));
const candidateCalls = (candidate: LeadCandidateRecord, calls: PhoneCallRecord[]) => calls.filter(call => call.subjectKey === `candidate:${candidate.id}`);

export const hasRawCandidateCall = (candidate: LeadCandidateRecord, calls: PhoneCallRecord[]) => (
  candidateCalls(candidate, calls).length > 0
  || candidate.contactAttempts > 0
  || candidate.contactLogs.some(log => log.activityType === 'call' || log.eventType === 'contact_result' && log.outcome !== 'not_contacted')
);

export const hasRawCandidateConversation = (candidate: LeadCandidateRecord, calls: PhoneCallRecord[]) => (
  candidateCalls(candidate, calls).some(call => ['discussed', 'callback'].includes(call.result))
  || candidate.contactLogs.some(log => ['connected', 'call_back', 'potential'].includes(log.outcome))
);

export interface ScoredRawCandidate {
  candidate: LeadCandidateRecord;
  score: number;
  group: RawPriorityGroup;
  reasons: string[];
  called: boolean;
  connected: boolean;
}

export const scoreRawCandidate = (candidate: LeadCandidateRecord, calls: PhoneCallRecord[], rules: RawPriorityRules): ScoredRawCandidate => {
  const history = candidateCalls(candidate, calls);
  const called = hasRawCandidateCall(candidate, calls);
  const connected = hasRawCandidateConversation(candidate, calls);
  const reasons: string[] = [];
  let score = 0;
  if (candidate.phone.trim()) { score += 25; reasons.push('Có số điện thoại'); }
  if (candidate.sourceUrl.trim()) { score += 10; reasons.push('Có đường dẫn nguồn'); }
  else if (candidate.source.trim()) { score += 5; reasons.push('Có nguồn dữ liệu'); }
  if (candidate.businessSector.trim()) { score += 10; reasons.push('Đã biết ngành nghề'); }
  if (candidate.expectedProducts.trim()) { score += 15; reasons.push('Có thông tin nhu cầu'); }
  if (candidate.province.trim()) { score += 5; reasons.push('Đã biết địa bàn'); }
  if (matchesAny(candidate.businessSector, rules.targetIndustries)) { score += 10; reasons.push('Đúng ngành mục tiêu'); }
  if (matchesAny(candidate.expectedProducts, rules.targetProducts)) { score += 15; reasons.push('Đúng sản phẩm mục tiêu'); }
  if (candidate.nextContactAt && new Date(candidate.nextContactAt).getTime() <= Date.now() + 86_400_000) {
    score += 20;
    reasons.unshift('Có lịch liên hệ sắp đến hạn');
  }
  if (candidate.scoringMode === 'manual' || (candidate.customerInsightValues || []).length > 0) {
    score = getLeadCandidateEffectiveScore(candidate);
    reasons.unshift(candidate.scoringMode === 'manual' ? 'Điểm ưu tiên được chấm thủ công' : 'Điểm tự động từ phân loại khách hàng');
  }
  const recentCalls = [...history].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const wrongNumber = recentCalls[0]?.result === 'wrong_number' || (!recentCalls.length && candidate.lastContactOutcome === 'wrong_number');
  const noAnswerCount = recentCalls.slice(0, 3).filter(call => ['no_answer', 'busy'].includes(call.result)).length;
  const noTrace = !candidate.phone.trim() && !candidate.source.trim() && !candidate.sourceUrl.trim();
  let group: RawPriorityGroup = 'enrich';
  if (noTrace || wrongNumber || noAnswerCount >= 3 || candidate.status === 'disqualified') {
    group = 'verify';
    reasons.unshift(wrongNumber ? 'Số điện thoại sai' : noAnswerCount >= 3 ? 'Ba lần gọi gần nhất chưa liên hệ được' : candidate.status === 'disqualified' ? 'Hồ sơ không phù hợp' : 'Thiếu số điện thoại và nguồn xác minh');
  } else if (candidate.phone.trim() && (score >= rules.callFirstThreshold || candidate.nextContactAt && new Date(candidate.nextContactAt).getTime() <= Date.now() + 86_400_000)) {
    group = 'call_first';
  } else {
    reasons.unshift(candidate.phone.trim() ? 'Cần bổ sung tín hiệu phù hợp' : 'Cần tìm số điện thoại');
  }
  return { candidate, score, group, reasons, called, connected };
};
