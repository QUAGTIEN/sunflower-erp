import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import { CUSTOMER_INSIGHT_ITEM_BY_ID } from '@/features/crm/model/customerInsightCatalog';
import type { AuditEvent, UserPresence } from '@/services/auditService';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';

export type SalesManagementModule = 'customer_data' | 'leads' | 'crm';
export type SalesActivityStatus = 'active' | 'idle' | 'offline';
export type SalesReportPeriod = 'week' | 'month' | 'quarter' | 'custom';

export interface SalesReportWindow {
  startAt: number;
  endAt: number;
  label: string;
}

export const SALES_MODULE_LABELS: Record<SalesManagementModule, string> = {
  customer_data: 'Dữ liệu thô',
  leads: 'Tiềm năng',
  crm: 'Khách hàng'
};

export const SALES_ACTIVITY_ACTIONS = new Set([
  'candidate_phone_called', 'phone_call_started', 'phone_call_confirmed', 'phone_call_manual_recorded',
  'candidate_opened', 'candidate_added_to_work_queue', 'candidate_assigned_to_sale', 'candidate_updated',
  'candidate_created', 'follow_up_scheduled', 'candidate_pin_toggled', 'contact_status_updated',
  'potential_updated', 'candidate_task_dismissed', 'candidate_archived', 'candidate_converted_to_lead',
  'lead_follow_up_scheduled', 'lead_updated', 'lead_created', 'lead_returned_to_raw_data',
  'lead_follow_up_handled', 'lead_deleted', 'customer_created', 'customer_updated', 'customer_note_updated'
]);

const ACTION_LABELS: Record<string, string> = {
  candidate_phone_called: 'Bấm gọi khách hàng',
  phone_call_started: 'Bắt đầu cuộc gọi',
  phone_call_confirmed: 'Xác nhận kết quả gọi',
  phone_call_manual_recorded: 'Ghi nhận cuộc gọi',
  candidate_opened: 'Mở hồ sơ',
  candidate_added_to_work_queue: 'Đưa vào danh sách cần xử lý',
  candidate_assigned_to_sale: 'Bàn giao dữ liệu',
  candidate_updated: 'Cập nhật dữ liệu thô',
  candidate_created: 'Tạo dữ liệu thô',
  follow_up_scheduled: 'Đặt lịch liên hệ',
  candidate_pin_toggled: 'Cập nhật ghim',
  contact_status_updated: 'Cập nhật trạng thái liên hệ',
  potential_updated: 'Cập nhật đánh giá tiềm năng',
  candidate_task_dismissed: 'Hoàn tất công việc',
  candidate_archived: 'Lưu trữ dữ liệu',
  candidate_converted_to_lead: 'Chuyển thành Tiềm năng',
  lead_follow_up_scheduled: 'Đặt lịch chăm sóc Tiềm năng',
  lead_updated: 'Cập nhật Tiềm năng',
  lead_created: 'Tạo Tiềm năng',
  lead_returned_to_raw_data: 'Chuyển về Dữ liệu thô',
  lead_follow_up_handled: 'Hoàn tất lịch chăm sóc',
  lead_deleted: 'Lưu trữ Tiềm năng',
  customer_created: 'Tạo hồ sơ Khách hàng',
  customer_updated: 'Cập nhật Khách hàng',
  customer_note_updated: 'Cập nhật ghi chú Khách hàng'
};

export const getSalesActionLabel = (event: AuditEvent): string => ACTION_LABELS[event.action] || event.summary || 'Cập nhật hồ sơ';

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
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
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

export const isWithinWindow = (value: string | undefined, window: SalesReportWindow | null): boolean => {
  if (!window || !value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= window.startAt && timestamp <= window.endAt;
};

export const getSaleActivityStatus = (
  presence: UserPresence | undefined,
  referenceTime: number,
  lastBusinessActivityAt = ''
): { status: SalesActivityStatus; minutesSinceSeen: number } => {
  const isBusinessPage = presence?.lastPageId === 'customer_data' || presence?.lastPageId === 'leads' || presence?.lastPageId === 'crm';
  const presenceTime = isBusinessPage && presence?.lastSeenAt ? new Date(presence.lastSeenAt).getTime() : 0;
  const businessActivityTime = lastBusinessActivityAt ? new Date(lastBusinessActivityAt).getTime() : 0;
  const lastSeenTime = Math.max(
    Number.isFinite(presenceTime) ? presenceTime : 0,
    Number.isFinite(businessActivityTime) ? businessActivityTime : 0
  );
  const minutesSinceSeen = lastSeenTime
    ? Math.max(0, Math.floor((referenceTime - lastSeenTime) / 60_000))
    : Number.MAX_SAFE_INTEGER;
  if (presence?.status === 'offline') return { status: 'offline', minutesSinceSeen };
  if (minutesSinceSeen <= 10) return { status: 'active', minutesSinceSeen };
  if (minutesSinceSeen <= 30) return { status: 'idle', minutesSinceSeen };
  return { status: 'offline', minutesSinceSeen };
};

export const isActiveLead = (lead: LeadRecord): boolean => (
  !lead.deleted && !lead.returnedToRawData && lead.stage !== 'converted' && !lead.convertedCustomerId
);

export const getLeadBlockerLabel = (lead: LeadRecord): string => {
  const blockerIds = new Set([
    'sample_reviewing', 'sample_test_not_ok', 'sample_planning', 'sample_promised_not_received',
    'target_price_promised', 'price_low', 'price_high', 'price_surveying',
    'zalo_connected_no_interaction', 'zalo_unconfirmed', 'indifferent', 'contact_later',
    'supplier_designated', 'supplier_change_refused', 'hard_to_source_material', 'certificate_required',
    'schedule_required', 'strict_quality_required', 'nearby_supplier_required', 'industry_reference_required',
    'factory_audit_required'
  ]);
  const classifiedReason = (lead.customerInsightValues || [])
    .map(value => CUSTOMER_INSIGHT_ITEM_BY_ID.get(value))
    .find(item => item?.module === 'leads' && blockerIds.has(item.id));
  if (classifiedReason) return classifiedReason.label.replace(/^Khách\s+/i, '');
  if (lead.stage === 'quoted') return 'Đang chờ phản hồi báo giá';
  if (lead.stage === 'negotiating') return 'Đang thương lượng';
  if (lead.stage === 'contacted') return 'Đang tiếp tục liên hệ';
  return lead.note?.trim() || 'Chưa cập nhật lý do';
};

export const getLeadCareDays = (lead: LeadRecord, referenceTime: number): number => {
  const startedAt = new Date(lead.createdAt || lead.updatedAt).getTime();
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.floor((referenceTime - startedAt) / 86_400_000));
};

export interface SalePerformance {
  sale: UserProfile;
  presence?: UserPresence;
  status: SalesActivityStatus;
  minutesSinceSeen: number;
  foundCandidates: LeadCandidateRecord[];
  assignedCandidates: LeadCandidateRecord[];
  assignedLeads: LeadRecord[];
  assignedCustomers: CustomerRecord[];
  events: AuditEvent[];
  processedCount: number;
  callCount: number;
  scheduleCount: number;
  overdueCount: number;
  convertedLeadCount: number;
  convertedCustomerCount: number;
  latestEvent?: AuditEvent;
}

export const buildSalePerformance = ({
  sale,
  candidates,
  leads,
  customers,
  events,
  presence,
  window,
  referenceTime
}: {
  sale: UserProfile;
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  events: AuditEvent[];
  presence?: UserPresence;
  window: SalesReportWindow | null;
  referenceTime: number;
}): SalePerformance => {
  const allSaleEvents = events
    .filter(event => event.actorId === sale.uid)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const saleEvents = allSaleEvents.filter(event => isWithinWindow(event.occurredAt, window));
  const foundCandidates = candidates.filter(candidate => (
    !candidate.archived
    && (candidate.discoveredById === sale.uid || (!candidate.discoveredById && candidate.createdById === sale.uid))
    && isWithinWindow(candidate.createdAt, window)
  ));
  const assignedCandidates = candidates.filter(candidate => !candidate.archived && candidate.assignedSaleId === sale.uid);
  const assignedLeads = leads.filter(lead => isActiveLead(lead) && lead.assignedSaleId === sale.uid);
  const assignedCustomers = customers.filter(customer => !customer.deleted && customer.assignedSaleId === sale.uid);
  const foundCandidateIds = new Set(foundCandidates.map(candidate => candidate.id));
  const processedIds = new Set(saleEvents
    .filter(event => event.module === 'lead_candidates' && Boolean(event.targetId) && foundCandidateIds.has(event.targetId || ''))
    .map(event => event.targetId as string));
  const convertedLeadRecords = leads.filter(lead => (
    Boolean(lead.sourceCandidateId)
    && foundCandidateIds.has(lead.sourceCandidateId)
    && isWithinWindow(lead.createdAt || lead.convertedAt, window)
  ));
  const convertedLeadIds = new Set(convertedLeadRecords.map(lead => lead.id));
  const convertedCustomers = customers.filter(customer => (
    Boolean(customer.sourceLeadId)
    && convertedLeadIds.has(customer.sourceLeadId)
    && isWithinWindow(customer.convertedAt || customer.createdAt, window)
  ));
  const overdueCount = assignedCandidates.filter(candidate => candidate.nextContactAt && new Date(candidate.nextContactAt).getTime() < referenceTime && candidate.taskStatus === 'pending').length
    + assignedLeads.filter(lead => lead.nextFollowUpAt && !lead.followUpHandledAt && new Date(lead.nextFollowUpAt).getTime() < referenceTime).length;
  const presenceStatus = getSaleActivityStatus(presence, referenceTime, allSaleEvents[0]?.occurredAt);
  return {
    sale,
    presence,
    status: presenceStatus.status,
    minutesSinceSeen: presenceStatus.minutesSinceSeen,
    foundCandidates,
    assignedCandidates,
    assignedLeads,
    assignedCustomers,
    events: saleEvents,
    processedCount: processedIds.size,
    callCount: saleEvents.filter(event => ['candidate_phone_called', 'phone_call_started', 'phone_call_confirmed', 'phone_call_manual_recorded'].includes(event.action)).length,
    scheduleCount: saleEvents.filter(event => ['follow_up_scheduled', 'lead_follow_up_scheduled'].includes(event.action)).length,
    overdueCount,
    convertedLeadCount: convertedLeadIds.size,
    convertedCustomerCount: convertedCustomers.length,
    latestEvent: allSaleEvents[0]
  };
};
