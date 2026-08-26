import { isActiveLeadRecord, type CustomerRecord, type LeadRecord } from './crmModels';
import type { LeadCandidateRecord } from './leadCandidateModels';
import type { CompatiblePORecord } from './poCompatibility';
import type { UserProfile } from '../services/firebaseService';
import { VIETNAM_ADMINISTRATIVE_UNITS } from '../data/vietnamAdministrativeUnits';

export type CommercialMapLayer = 'all' | 'customers' | 'leads' | 'processing' | 'unassigned';
export type CommercialMapRecordType = 'customer' | 'lead' | 'candidate';

export interface CommercialMapRecord {
  key: string;
  id: string;
  type: CommercialMapRecordType;
  companyName: string;
  taxCode: string;
  provinceId: string;
  provinceName: string;
  address: string;
  contactPerson: string;
  phone: string;
  assignedSaleId: string;
  assignedSaleName: string;
  statusLabel: string;
  potentialLabel: string;
  lastActivityAt: string;
  revenue: number;
  orderCount: number;
}

export interface CommercialProvinceSummary {
  provinceId: string;
  provinceName: string;
  total: number;
  customers: number;
  leads: number;
  candidates: number;
  processing: number;
  unassigned: number;
  revenue: number;
  orderCount: number;
}

const LEGACY_PROVINCE_ALIASES: Record<string, string> = {
  'bac giang': 'bac_ninh',
  'bac kan': 'thai_nguyen',
  'binh duong': 'tp_ho_chi_minh',
  'ba ria vung tau': 'tp_ho_chi_minh',
  'binh dinh': 'gia_lai',
  'binh phuoc': 'dong_nai',
  'binh thuan': 'lam_dong',
  'ben tre': 'vinh_long',
  'hau giang': 'can_tho',
  'hai duong': 'hai_phong',
  'hoa binh': 'phu_tho',
  'kien giang': 'an_giang',
  'kon tum': 'quang_ngai',
  'long an': 'tay_ninh',
  'nam dinh': 'ninh_binh',
  'ninh thuan': 'khanh_hoa',
  'phu yen': 'dak_lak',
  'quang nam': 'da_nang',
  'quang binh': 'quang_tri',
  'soc trang': 'can_tho',
  'thai binh': 'hung_yen',
  'tra vinh': 'vinh_long',
  'tuyen quang': 'tuyen_quang',
  'yen bai': 'lao_cai'
};

export const normalizeVietnameseText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN')
  .replace(/\b(tinh|thanh pho|tp|city)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const PROVINCE_SEARCH_ENTRIES = VIETNAM_ADMINISTRATIVE_UNITS.map(province => ({
  id: province.id,
  name: province.label,
  normalizedName: normalizeVietnameseText(province.label)
}));

export const resolveCommercialProvince = (...values: Array<string | null | undefined>) => {
  const source = normalizeVietnameseText(values.filter(Boolean).join(' '));
  if (!source) return { id: 'unknown', name: 'Chưa xác định' };

  const direct = PROVINCE_SEARCH_ENTRIES.find(province => (
    source === province.normalizedName
    || source.includes(` ${province.normalizedName} `)
    || source.startsWith(`${province.normalizedName} `)
    || source.endsWith(` ${province.normalizedName}`)
  ));
  if (direct) return { id: direct.id, name: direct.name };

  const alias = Object.entries(LEGACY_PROVINCE_ALIASES)
    .find(([legacyName]) => source.includes(legacyName));
  if (alias) {
    const province = PROVINCE_SEARCH_ENTRIES.find(entry => entry.id === alias[1]);
    if (province) return { id: province.id, name: province.name };
  }
  return { id: 'unknown', name: 'Chưa xác định' };
};

const text = (value: unknown): string => typeof value === 'string' ? value : '';
const isCandidateProcessing = (candidate: LeadCandidateRecord) => (
  Boolean(candidate.assignedSaleId)
  && !candidate.workQueueHidden
  && candidate.taskStatus !== 'dismissed'
);

const candidatePotentialLabel = (candidate: LeadCandidateRecord): string => ({
  unrated: 'Chưa đánh giá',
  not_fit: 'Không phù hợp',
  low: 'Tiềm năng thấp',
  potential: 'Có tiềm năng',
  promising: 'Khả quan',
  high: 'Tiềm năng cao'
}[candidate.potentialLevel] || 'Chưa đánh giá');

const leadStageLabel = (lead: LeadRecord): string => ({
  new: 'Mới', contacted: 'Đã liên hệ', quoted: 'Đã báo giá', negotiating: 'Đang đàm phán',
  won: 'Thành công', lost: 'Không thành công', converted: 'Đã chuyển khách hàng'
}[lead.stage] || lead.stage);

export const buildCommercialMapRecords = ({
  customers,
  leads,
  candidates,
  orders,
  users
}: {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  candidates: LeadCandidateRecord[];
  orders: CompatiblePORecord[];
  users: UserProfile[];
}): CommercialMapRecord[] => {
  const userNames = new Map(users.map(user => [user.uid, user.displayName]));
  const customerOrderSummary = new Map<string, { revenue: number; orderCount: number }>();
  orders.forEach(order => {
    if (!order.customerId) return;
    const current = customerOrderSummary.get(order.customerId) || { revenue: 0, orderCount: 0 };
    current.revenue += Number(order.netAmount || order.totalAmount) || 0;
    current.orderCount += 1;
    customerOrderSummary.set(order.customerId, current);
  });

  const records: CommercialMapRecord[] = [];
  customers.filter(customer => !customer.deleted).forEach(customer => {
    const province = resolveCommercialProvince(text(customer.province), customer.address);
    const orderSummary = customerOrderSummary.get(customer.id) || { revenue: 0, orderCount: 0 };
    records.push({
      key: `customer:${customer.id}`,
      id: customer.id,
      type: 'customer',
      companyName: customer.companyName,
      taxCode: customer.taxCode,
      provinceId: province.id,
      provinceName: province.name,
      address: [customer.address, customer.industrialPark, customer.ward, customer.province].filter(Boolean).join(', '),
      contactPerson: customer.contactPerson,
      phone: customer.phone,
      assignedSaleId: customer.assignedSaleId,
      assignedSaleName: userNames.get(customer.assignedSaleId) || 'Chưa phân công',
      statusLabel: orderSummary.orderCount > 0 ? 'Đang hợp tác' : 'Khách hàng hợp tác',
      potentialLabel: customer.customerRank ? `Hạng ${customer.customerRank}` : 'Chưa xếp hạng',
      lastActivityAt: customer.lastOrderAt || customer.updatedAt || customer.createdAt,
      revenue: orderSummary.revenue,
      orderCount: orderSummary.orderCount
    });
  });

  leads.filter(lead => isActiveLeadRecord(lead) && lead.stage !== 'converted' && !lead.convertedCustomerId).forEach(lead => {
    const province = resolveCommercialProvince(lead.province, lead.address);
    records.push({
      key: `lead:${lead.id}`,
      id: lead.id,
      type: 'lead',
      companyName: lead.companyName,
      taxCode: lead.taxCode,
      provinceId: province.id,
      provinceName: province.name,
      address: [lead.address, lead.industrialPark, lead.ward, lead.province].filter(Boolean).join(', '),
      contactPerson: lead.contactPerson,
      phone: lead.phone,
      assignedSaleId: lead.assignedSaleId,
      assignedSaleName: lead.assignedSaleName || userNames.get(lead.assignedSaleId) || 'Chưa phân công',
      statusLabel: leadStageLabel(lead),
      potentialLabel: lead.potentialValue > 0 ? `${lead.potentialValue.toLocaleString('vi-VN')} đ` : 'Chưa đánh giá',
      lastActivityAt: lead.updatedAt || lead.createdAt,
      revenue: 0,
      orderCount: 0
    });
  });

  candidates.filter(candidate => !candidate.archived && candidate.status !== 'converted' && !candidate.convertedLeadId)
    .forEach(candidate => {
      const province = resolveCommercialProvince(candidate.province, candidate.address);
      records.push({
        key: `candidate:${candidate.id}`,
        id: candidate.id,
        type: 'candidate',
        companyName: candidate.companyName,
        taxCode: candidate.taxCode,
        provinceId: province.id,
        provinceName: province.name,
        address: [candidate.address, candidate.industrialPark, candidate.ward, candidate.province].filter(Boolean).join(', '),
        contactPerson: candidate.contactPerson,
        phone: candidate.phone,
        assignedSaleId: candidate.assignedSaleId,
        assignedSaleName: candidate.assignedSaleName || userNames.get(candidate.assignedSaleId) || 'Chưa phân công',
        statusLabel: isCandidateProcessing(candidate) ? 'Đang được Sale xử lý' : candidate.assignedSaleId ? 'Đã phân công' : 'Chưa phân công',
        potentialLabel: candidatePotentialLabel(candidate),
        lastActivityAt: candidate.updatedAt || candidate.lastContactAt || candidate.createdAt,
        revenue: 0,
        orderCount: 0
      });
    });

  return records;
};

export const filterCommercialMapRecords = (
  records: CommercialMapRecord[],
  layer: CommercialMapLayer
): CommercialMapRecord[] => records.filter(record => {
  if (layer === 'all') return true;
  if (layer === 'customers') return record.type === 'customer';
  if (layer === 'leads') return record.type === 'lead';
  if (layer === 'processing') return record.type === 'candidate' && record.statusLabel === 'Đang được Sale xử lý';
  return !record.assignedSaleId;
});

export const summarizeCommercialProvinces = (records: CommercialMapRecord[]): CommercialProvinceSummary[] => {
  const summaries = new Map<string, CommercialProvinceSummary>();
  records.forEach(record => {
    const current = summaries.get(record.provinceId) || {
      provinceId: record.provinceId,
      provinceName: record.provinceName,
      total: 0,
      customers: 0,
      leads: 0,
      candidates: 0,
      processing: 0,
      unassigned: 0,
      revenue: 0,
      orderCount: 0
    };
    current.total += 1;
    current.customers += record.type === 'customer' ? 1 : 0;
    current.leads += record.type === 'lead' ? 1 : 0;
    current.candidates += record.type === 'candidate' ? 1 : 0;
    current.processing += record.statusLabel === 'Đang được Sale xử lý' ? 1 : 0;
    current.unassigned += record.assignedSaleId ? 0 : 1;
    current.revenue += record.revenue;
    current.orderCount += record.orderCount;
    summaries.set(record.provinceId, current);
  });
  return Array.from(summaries.values()).sort((left, right) => right.total - left.total || left.provinceName.localeCompare(right.provinceName, 'vi'));
};
