import {
  type LeadCompanySize,
  type LeadFilterDefinition,
  type LeadRecord,
  type LeadStage
} from '@/features/crm/model/crmModels';
import { getLeadFilterValues, LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import { type UserProfile } from '@/infrastructure/firebase/erpDataGateway';

export type LeadOverviewSelection = 'quoted' | 'pending' | 'won' | 'lost' | 'converted';

export const LEAD_OVERVIEW_LABELS: Record<LeadOverviewSelection, string> = {
  quoted: 'Đã gửi báo giá',
  pending: 'Đang chờ chốt',
  won: 'Đã chốt',
  lost: 'Không thành công',
  converted: 'Đã thành khách hàng'
};

export const matchesLeadOverviewSelection = (
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

export interface LeadFormState {
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

export interface LeadScheduleFormState {
  nextFollowUpAt: string;
}

export const LEAD_STAGES: Array<{ id: LeadStage; label: string }> = [
  { id: 'new', label: 'Mới tiếp nhận' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'quoted', label: 'Đã gửi báo giá' },
  { id: 'negotiating', label: 'Đang đàm phán' },
  { id: 'won', label: 'Thành công' },
  { id: 'lost', label: 'Không thành công' },
  { id: 'converted', label: 'Đã chuyển đổi' }
];

export const COMPANY_SIZE_LABELS: Record<LeadCompanySize, string> = {
  '': 'Chưa xác định',
  large: 'Doanh nghiệp lớn',
  medium: 'Doanh nghiệp vừa',
  small: 'Doanh nghiệp nhỏ'
};

export const LEADS_PAGE_REFERENCE_TIME = Date.now();

export const formatDateTime = (value: string) => {
  if (!value) return 'Chưa đặt lịch';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa đặt lịch' : date.toLocaleString('vi-VN');
};

export const toDateTimeLocal = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export const tomorrowAtNine = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return toDateTimeLocal(date.toISOString());
};

export const getLeadScheduleTime = (lead: LeadRecord): number => {
  if (!lead.nextFollowUpAt) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(lead.nextFollowUpAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

export const getStageLabel = (stage: LeadStage) => LEAD_STAGES.find(item => item.id === stage)?.label || stage;

export const normalizeSearchText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd');

export const matchesEverySearchTerm = (searchTerm: string, values: unknown[]) => {
  const terms = normalizeSearchText(searchTerm).trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeSearchText(values.filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
};

export type LeadDetailTab = 'classification' | 'profile';

export const CLASSIFICATION_OWNED_PROFILE_FIELDS = new Set([
  'nganh nghe',
  'linh vuc hoat dong',
  'san pham nhu cau',
  'san pham nhu cau quan tam',
  'nhu cau san pham',
  'doi thu canh tranh',
  'quy mo doanh nghiep',
  'muc su dung'
]);

export const isClassificationOwnedProfileField = (definition: { name: string }) =>
  CLASSIFICATION_OWNED_PROFILE_FIELDS.has(normalizeSearchText(definition.name));

export const createEmptyForm = (currentUser: UserProfile, saleUsers: UserProfile[]): LeadFormState => ({
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
  assignedSaleId: currentUser.role === 'sale' ? currentUser.uid : saleUsers[0]?.uid || '',
  discoveredById: currentUser.role === 'sale' ? currentUser.uid : '',
  nextFollowUpAt: '',
  note: '',
  customerInsightValues: []
});
