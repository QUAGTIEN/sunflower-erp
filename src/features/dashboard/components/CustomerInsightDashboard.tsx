import React, { useMemo, useState, type ReactNode } from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Factory,
  FileClock,
  Handshake,
  Coins,
  PackageSearch,
  PhoneCall,
  ShieldCheck,
  Target,
  UsersRound
} from 'lucide-react';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import {
  CUSTOMER_INSIGHT_GROUPS,
  getCustomerInsightNavigation,
  type CustomerInsightItem,
  type CustomerInsightModule
} from '@/features/crm/model/customerInsightCatalog';
import './CustomerInsightDashboard.css';

interface CustomerInsightDashboardProps {
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  onNavigateInsight: (module: CustomerInsightModule, itemId: string) => void;
  collaboratingCustomersCount: number;
  totalRevenue: number;
  activeEmployeesCount: number;
  activeOrdersCount: number;
  operationalContent: ReactNode;
}

interface InsightRecord {
  key: string;
  module: CustomerInsightModule;
  values: string[];
}

const MODULE_LABELS: Record<CustomerInsightModule, string> = {
  customer_data: 'Dữ liệu thô',
  leads: 'Tiềm năng',
  crm: 'Khách hàng',
  sales: 'Tạo đơn hàng'
};

const GROUP_ICONS = {
  order_progress: ClipboardList,
  commercial_price: BadgeDollarSign,
  contact_interaction: PhoneCall,
  usage_scale: BarChart3,
  supplier_competition: Building2,
  special_requirements: ShieldCheck,
  product_needs: PackageSearch,
  industry: Factory
};

const activeLead = (lead: LeadRecord) => !lead.deleted && !lead.returnedToRawData && lead.stage !== 'converted' && !lead.convertedCustomerId;

export const CustomerInsightDashboard: React.FC<CustomerInsightDashboardProps> = ({
  candidates,
  leads,
  customers,
  onNavigateInsight,
  collaboratingCustomersCount,
  totalRevenue,
  activeEmployeesCount,
  activeOrdersCount,
  operationalContent
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState(CUSTOMER_INSIGHT_GROUPS[0].id);

  const activeCandidates = useMemo(() => candidates.filter(candidate => !candidate.archived), [candidates]);
  const activeLeads = useMemo(() => leads.filter(activeLead), [leads]);
  const activeCustomers = useMemo(() => customers.filter(customer => !customer.deleted), [customers]);

  const insightRecords = useMemo<InsightRecord[]>(() => [
    ...activeCandidates.map(candidate => ({
      key: `customer_data:${candidate.id}`,
      module: 'customer_data' as const,
      values: candidate.customerInsightValues || []
    })),
    ...activeLeads.map(lead => ({
      key: `leads:${lead.id}`,
      module: 'leads' as const,
      values: lead.customerInsightValues || []
    })),
    ...activeCustomers.map(customer => ({
      key: `crm:${customer.id}`,
      module: 'crm' as const,
      values: customer.customerInsightValues || []
    })),
    ...activeCustomers.filter(customer => Boolean(customer.pendingOrderDraft)).map(customer => ({
      key: `sales:${customer.id}`,
      module: 'sales' as const,
      values: ['po_promised']
    }))
  ], [activeCandidates, activeCustomers, activeLeads]);

  const selectedGroup = CUSTOMER_INSIGHT_GROUPS.find(group => group.id === selectedGroupId) || CUSTOMER_INSIGHT_GROUPS[0];

  const itemCount = (item: CustomerInsightItem) => insightRecords.filter(record => (
    record.module === item.module && record.values.includes(item.id)
  )).length;

  const selectGroup = (groupId: string) => {
    const group = CUSTOMER_INSIGHT_GROUPS.find(entry => entry.id === groupId) || CUSTOMER_INSIGHT_GROUPS[0];
    setSelectedGroupId(group.id);
  };

  const openItemList = (item: CustomerInsightItem) => {
    const target = getCustomerInsightNavigation(item.id);
    if (target) onNavigateInsight(target.pageId, target.insightItemId);
  };

  return (
    <section className="customer-insight-dashboard" aria-label="Tổng quan thông tin khách hàng">
      <div className="customer-insight-kpis">
        <article className="is-total"><UsersRound size={25} /><div><span>Tổng hồ sơ</span><strong>{activeCandidates.length + activeLeads.length + activeCustomers.length} hồ sơ</strong><small>Tổng dữ liệu đang được quản lý</small></div></article>
        <article className="is-raw"><ClipboardList size={25} /><div><span>Dữ liệu thô</span><strong>{activeCandidates.length} hồ sơ</strong><small>Thông tin doanh nghiệp mới thu thập</small></div></article>
        <article className="is-lead"><Target size={25} /><div><span>Tiềm năng</span><strong>{activeLeads.length} Lead</strong><small>Khách hàng đang được chăm sóc</small></div></article>
        <article className="is-customer"><Building2 size={25} /><div><span>Khách hàng</span><strong>{activeCustomers.length} khách hàng</strong><small>Hồ sơ đã chuyển thành khách hàng</small></div></article>
        <article className="is-collaborating"><Handshake size={25} /><div><span>Khách hàng đang hợp tác</span><strong>{collaboratingCustomersCount} khách hàng</strong><small>Đã phát sinh ít nhất một PO</small></div></article>
        <article className="is-revenue"><Coins size={25} /><div><span>Doanh thu</span><strong>{totalRevenue.toLocaleString('vi-VN')} đ</strong><small>Hóa đơn đã thanh toán trong kỳ đang chọn</small></div></article>
        <article className="is-employees"><UsersRound size={25} /><div><span>Nhân viên</span><strong>{activeEmployeesCount} người</strong><small>Tài khoản nhân viên đang hoạt động</small></div></article>
        <article className="is-orders"><FileClock size={25} /><div><span>Đơn đang xử lý</span><strong>{activeOrdersCount} đơn</strong><small>PO chưa hoàn thành trong kỳ đang chọn</small></div></article>
      </div>

      {operationalContent}

      <div className="customer-insight-groups">
        <div className="customer-insight-section-title"><span>8 nhóm thông tin khách hàng</span><small>Chọn một nhóm để xem chi tiết</small></div>
        <div className="customer-insight-group-grid">
          {CUSTOMER_INSIGHT_GROUPS.map(group => {
            const Icon = GROUP_ICONS[group.id as keyof typeof GROUP_ICONS] || ClipboardList;
            const groupRecords = insightRecords.filter(record => group.items.some(item => item.module === record.module && record.values.includes(item.id)));
            const moduleCounts = Array.from(new Set(group.items.map(item => item.module))).map(module => ({
              module,
              count: new Set(groupRecords.filter(record => record.module === module).map(record => record.key)).size
            }));
            return (
              <button key={group.id} type="button" className={selectedGroup.id === group.id ? 'is-active' : ''} onClick={() => selectGroup(group.id)}>
                <span className="customer-insight-group-card__icon"><Icon size={21} /></span>
                <span className="customer-insight-group-card__content">
                  <strong>{group.label}</strong>
                  <b>{new Set(groupRecords.map(record => record.key)).size}</b>
                  <small>{moduleCounts.map(entry => `${MODULE_LABELS[entry.module]} ${entry.count}`).join(' · ')}</small>
                </span>
                <span className="customer-insight-group-card__action">Xem chi tiết <ChevronRight size={14} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="customer-insight-drilldown">
        <header>
          <div><ClipboardList size={19} /><strong>{selectedGroup.label}</strong></div>
          <span>{selectedGroup.items.length} mục phân loại</span>
        </header>
        <div className="customer-insight-item-grid">
          {selectedGroup.items.map(item => (
            <button key={item.id} type="button" onClick={() => openItemList(item)}>
              <span>{item.label}</span>
              <em className={`customer-insight-module-text is-${item.module}`}>{MODULE_LABELS[item.module]}</em>
              <strong>{itemCount(item)}</strong>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </div>

    </section>
  );
};
