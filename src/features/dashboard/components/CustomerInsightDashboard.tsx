import React, { useMemo, useState } from 'react';
import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  ChevronRight,
  ClipboardList,
  Factory,
  PackageSearch,
  PhoneCall,
  ShieldCheck,
  Target,
  UsersRound
} from 'lucide-react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import {
  CUSTOMER_INSIGHT_GROUPS,
  getCustomerInsightNavigation,
  type CustomerInsightItem,
  type CustomerInsightModule
} from '@/features/crm/model/customerInsightCatalog';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import './CustomerInsightDashboard.css';

interface CustomerInsightDashboardProps {
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  users: UserProfile[];
  onNavigateInsight: (module: CustomerInsightModule, itemId: string) => void;
}

interface InsightRecord {
  key: string;
  id: string;
  companyName: string;
  module: CustomerInsightModule;
  assignedSaleId: string;
  updatedAt: string;
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
  users,
  onNavigateInsight
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState(CUSTOMER_INSIGHT_GROUPS[0].id);
  const [selectedItemId, setSelectedItemId] = useState(CUSTOMER_INSIGHT_GROUPS[0].items[0].id);

  const activeCandidates = useMemo(() => candidates.filter(candidate => !candidate.archived), [candidates]);
  const activeLeads = useMemo(() => leads.filter(activeLead), [leads]);
  const activeCustomers = useMemo(() => customers.filter(customer => !customer.deleted), [customers]);

  const insightRecords = useMemo<InsightRecord[]>(() => [
    ...activeCandidates.map(candidate => ({
      key: `customer_data:${candidate.id}`,
      id: candidate.id,
      companyName: candidate.companyName,
      module: 'customer_data' as const,
      assignedSaleId: candidate.assignedSaleId,
      updatedAt: candidate.updatedAt || candidate.createdAt,
      values: candidate.customerInsightValues || []
    })),
    ...activeLeads.map(lead => ({
      key: `leads:${lead.id}`,
      id: lead.id,
      companyName: lead.companyName,
      module: 'leads' as const,
      assignedSaleId: lead.assignedSaleId,
      updatedAt: lead.updatedAt || lead.createdAt,
      values: lead.customerInsightValues || []
    })),
    ...activeCustomers.map(customer => ({
      key: `crm:${customer.id}`,
      id: customer.id,
      companyName: customer.companyName,
      module: 'crm' as const,
      assignedSaleId: customer.assignedSaleId,
      updatedAt: customer.updatedAt || customer.createdAt,
      values: customer.customerInsightValues || []
    })),
    ...activeCustomers.filter(customer => Boolean(customer.pendingOrderDraft)).map(customer => ({
      key: `sales:${customer.id}`,
      id: customer.id,
      companyName: customer.companyName,
      module: 'sales' as const,
      assignedSaleId: customer.assignedSaleId,
      updatedAt: String(customer.pendingOrderDraft?.updatedAt || customer.updatedAt || customer.createdAt || ''),
      values: ['po_promised']
    }))
  ], [activeCandidates, activeCustomers, activeLeads]);

  const selectedGroup = CUSTOMER_INSIGHT_GROUPS.find(group => group.id === selectedGroupId) || CUSTOMER_INSIGHT_GROUPS[0];
  const selectedItem = selectedGroup.items.find(item => item.id === selectedItemId) || selectedGroup.items[0];
  const selectedRecords = insightRecords
    .filter(record => record.module === selectedItem.module && record.values.includes(selectedItem.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const itemCount = (item: CustomerInsightItem) => insightRecords.filter(record => (
    record.module === item.module && record.values.includes(item.id)
  )).length;

  const selectGroup = (groupId: string) => {
    const group = CUSTOMER_INSIGHT_GROUPS.find(entry => entry.id === groupId) || CUSTOMER_INSIGHT_GROUPS[0];
    setSelectedGroupId(group.id);
    setSelectedItemId(group.items[0].id);
  };

  const openSelectedList = () => {
    const target = getCustomerInsightNavigation(selectedItem.id);
    if (target) onNavigateInsight(target.pageId, target.insightItemId);
  };

  return (
    <section className="customer-insight-dashboard" aria-label="Tổng quan thông tin khách hàng">
      <header className="customer-insight-dashboard__heading">
        <div>
          <span className="customer-insight-dashboard__eyebrow">Tổng quan khách hàng</span>
          <h1>Theo dõi toàn bộ hành trình từ dữ liệu thô đến đơn hàng</h1>
        </div>
      </header>

      <div className="customer-insight-kpis">
        <article><UsersRound size={22} /><div><span>Tổng hồ sơ</span><strong>{activeCandidates.length + activeLeads.length + activeCustomers.length}</strong></div></article>
        <article><ClipboardList size={22} /><div><span>Dữ liệu thô</span><strong>{activeCandidates.length}</strong></div></article>
        <article><Target size={22} /><div><span>Tiềm năng</span><strong>{activeLeads.length}</strong></div></article>
        <article><Building2 size={22} /><div><span>Khách hàng</span><strong>{activeCustomers.length}</strong></div></article>
      </div>

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
            <button key={item.id} type="button" className={selectedItem.id === item.id ? 'is-active' : ''} onClick={() => setSelectedItemId(item.id)}>
              <span>{item.label}</span>
              <small className={`is-${item.module}`}>{MODULE_LABELS[item.module]}</small>
              <strong>{itemCount(item)}</strong>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      </div>

      <div className="customer-insight-results">
        <header>
          <div>
            <strong>Danh sách khách hàng</strong>
            <span>{selectedItem.label} · {selectedRecords.length} hồ sơ</span>
          </div>
          <button type="button" onClick={openSelectedList}>Mở tại {MODULE_LABELS[selectedItem.module]} <ChevronRight size={15} /></button>
        </header>
        <div className="table-container">
          <table>
            <thead><tr><th>Khách hàng</th><th>Phân hệ</th><th>Sale phụ trách</th><th>Cập nhật gần nhất</th></tr></thead>
            <tbody>
              {selectedRecords.slice(0, 10).map(record => (
                <tr key={record.key} onClick={openSelectedList}>
                  <td><strong>{record.companyName || 'Chưa có tên doanh nghiệp'}</strong></td>
                  <td><span className={`customer-insight-module-pill is-${record.module}`}>{MODULE_LABELS[record.module]}</span></td>
                  <td>{users.find(user => user.uid === record.assignedSaleId)?.displayName || 'Chưa phân công'}</td>
                  <td>{formatDateTime(record.updatedAt, 'vi-VN', '—')}</td>
                </tr>
              ))}
              {selectedRecords.length === 0 && <tr><td colSpan={4} className="customer-insight-results__empty">Chưa có hồ sơ thuộc mục này.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
