import React, { useMemo, type ReactNode } from 'react';
import { ChevronRight, Package, PhoneCall } from 'lucide-react';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import {
  CUSTOMER_INSIGHT_GROUPS,
  getCustomerInsightNavigation,
  type CustomerInsightGroup,
  type CustomerInsightItem,
  type CustomerInsightModule
} from '@/features/crm/model/customerInsightCatalog';
import './CustomerInsightDashboard.css';

interface CustomerInsightDashboardProps {
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  onNavigateInsight: (module: CustomerInsightModule, itemId: string) => void;
  activeOrdersCount: number;
  revenueContent: ReactNode;
  queueContent: ReactNode;
  tasksContent: ReactNode;
}

interface InsightRecord {
  key: string;
  values: string[];
}

const activeLead = (lead: LeadRecord) => (
  !lead.deleted && !lead.returnedToRawData && lead.stage !== 'converted' && !lead.convertedCustomerId
);

const DASHBOARD_GROUP_IDS = ['product_needs', 'contact_interaction'] as const;

const GROUP_PRESENTATION = {
  product_needs: {
    description: 'Xem chi tiết sản phẩm khách hàng quan tâm và nhu cầu hiện tại.',
    Icon: Package
  },
  contact_interaction: {
    description: 'Xem lịch sử liên hệ, ghi chú và các tương tác với khách hàng.',
    Icon: PhoneCall
  }
};

export const CustomerInsightDashboard: React.FC<CustomerInsightDashboardProps> = ({
  candidates,
  leads,
  customers,
  onNavigateInsight,
  activeOrdersCount,
  revenueContent,
  queueContent,
  tasksContent
}) => {
  const activeCandidates = useMemo(() => candidates.filter(candidate => !candidate.archived), [candidates]);
  const activeLeads = useMemo(() => leads.filter(activeLead), [leads]);
  const activeCustomers = useMemo(() => customers.filter(customer => !customer.deleted), [customers]);

  const insightRecords = useMemo<InsightRecord[]>(() => [
    ...activeCandidates.map(candidate => ({
      key: `customer_data:${candidate.id}`,
      values: candidate.customerInsightValues || []
    })),
    ...activeLeads.map(lead => ({
      key: `leads:${lead.id}`,
      values: lead.customerInsightValues || []
    }))
  ], [activeCandidates, activeLeads]);

  const dashboardGroups = DASHBOARD_GROUP_IDS
    .map(groupId => CUSTOMER_INSIGHT_GROUPS.find(group => group.id === groupId))
    .filter((group): group is CustomerInsightGroup => Boolean(group));

  const itemCount = (item: CustomerInsightItem) => (
    insightRecords.filter(record => record.values.includes(item.id)).length
  );

  const groupRecordCount = (group: CustomerInsightGroup) => new Set(
    insightRecords
      .filter(record => group.items.some(item => record.values.includes(item.id)))
      .map(record => record.key)
  ).size;

  const openItem = (item: CustomerInsightItem) => {
    const target = getCustomerInsightNavigation(item.id);
    if (target) onNavigateInsight(target.pageId, target.insightItemId);
  };

  return (
    <section className="customer-insight-dashboard" aria-label="Tổng quan thông tin khách hàng">
      <div className="customer-insight-kpis">
        <article className="is-raw">
          <div><span>Dữ liệu thô</span><strong>{activeCandidates.length} hồ sơ</strong><small>Thông tin doanh nghiệp mới thu thập</small></div>
        </article>
        <article className="is-lead">
          <div><span>Tiềm năng</span><strong>{activeLeads.length} Lead</strong><small>Khách hàng đang được chăm sóc</small></div>
        </article>
        <article className="is-customer">
          <div><span>Khách hàng</span><strong>{activeCustomers.length} khách hàng</strong><small>Hồ sơ đã chuyển thành khách hàng</small></div>
        </article>
        <article className="is-orders">
          <div><span>PO đang hoạt động</span><strong>{activeOrdersCount} đơn</strong><small>PO chưa hoàn thành trong kỳ đang chọn</small></div>
        </article>
      </div>

      <div className="customer-insight-overview-grid">
        {revenueContent}
        {queueContent}
        {tasksContent}

        <section className="customer-overview-panel customer-insight-summary-panel" aria-labelledby="customer-insight-summary-title">
          <header className="customer-overview-panel__header">
            <h3 id="customer-insight-summary-title">Các nhóm thông tin khách hàng</h3>
            <small>{dashboardGroups.reduce((total, group) => total + group.items.length, 0)} phân loại</small>
          </header>
          <div className="customer-insight-expanded-groups">
            {dashboardGroups.map(group => {
              const presentation = GROUP_PRESENTATION[group.id as keyof typeof GROUP_PRESENTATION];
              const Icon = presentation.Icon;
              return (
                <section key={group.id} className="customer-insight-expanded-group" aria-labelledby={`customer-insight-group-${group.id}`}>
                  <header>
                    <span className="customer-insight-summary-card__icon"><Icon size={20} aria-hidden="true" /></span>
                    <div>
                      <strong id={`customer-insight-group-${group.id}`}>{group.label}</strong>
                      <small>{groupRecordCount(group)} hồ sơ · {group.items.length} phân loại</small>
                    </div>
                  </header>
                  <div className="customer-insight-classification-list">
                    {group.items.map(item => (
                      <button key={item.id} type="button" onClick={() => openItem(item)}>
                        <span>{item.label}</span>
                        <small>{itemCount(item)} hồ sơ</small>
                        <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
};
