import { useMemo, useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { LeadFilterDefinition, LeadRecord, LeadStage } from '@/features/crm/model/crmModels';
import { findLeadFilterOption, getLeadFilterValues, LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import './LeadOverviewDashboard.css';

type OverviewMetric = { key: string | null; label: string; count: number };
type LeadGroup = { label: string; leads: LeadRecord[]; color: string };

const STAGES: Array<{ id: LeadStage; label: string; color: string }> = [
  { id: 'new', label: 'Mới tiếp nhận', color: '#8096c8' },
  { id: 'contacted', label: 'Đã liên hệ', color: '#38a8b8' },
  { id: 'quoted', label: 'Đã gửi báo giá', color: '#f2a842' },
  { id: 'negotiating', label: 'Đang đàm phán', color: '#e66b5b' },
  { id: 'won', label: 'Thành công', color: '#35a779' },
  { id: 'lost', label: 'Không thành công', color: '#a3adbd' },
  { id: 'converted', label: 'Đã chuyển đổi', color: '#6956bd' }
];

const OPPORTUNITY_COLORS = ['#e66b5b', '#f2a842', '#7768c9', '#38a8b8', '#a3adbd'];
const PROVINCE_COLORS = ['#3157c8', '#137584', '#955b18', '#6250a3', '#287257', '#a34e42', '#536680'];
const DASHBOARD_REFERENCE_TIME = Date.now();
const isOpen = (lead: LeadRecord) => !['won', 'lost', 'converted'].includes(lead.stage) && !lead.convertedCustomerId;

const donutBackground = (groups: LeadGroup[]) => {
  const total = groups.reduce((sum, group) => sum + group.leads.length, 0);
  if (!total) return '#e8eef7';
  let offset = 0;
  return `conic-gradient(${groups.filter(group => group.leads.length).map(group => {
    const start = offset;
    offset += group.leads.length / total * 100;
    return `${group.color} ${start}% ${offset}%`;
  }).join(', ')})`;
};

interface Props {
  leads: LeadRecord[];
  saleUsers: UserProfile[];
  currentUser: UserProfile;
  definitions: LeadFilterDefinition[];
  metrics: OverviewMetric[];
  onMetricClick: (key: string | null) => void;
  onGroupClick: (label: string, leads: LeadRecord[]) => void;
  onOpenLead: (id: string) => void;
}

export function LeadOverviewDashboard({
  leads, saleUsers, currentUser, definitions, metrics, onMetricClick, onGroupClick, onOpenLead
}: Props) {
  const [provinceMode, setProvinceMode] = useState<'all' | 'opportunity'>('all');
  const { stages, opportunities, saleRows, provinces } = useMemo(() => {
    const stages: LeadGroup[] = STAGES.map(stage => ({
      label: stage.label,
      color: stage.color,
      leads: leads.filter(lead => lead.stage === stage.id)
    }));

    const opportunityBuckets: LeadGroup[] = [
      { label: 'Đang đàm phán', color: OPPORTUNITY_COLORS[0], leads: [] },
      { label: 'Đã gửi báo giá', color: OPPORTUNITY_COLORS[1], leads: [] },
      { label: 'Đang làm mẫu', color: OPPORTUNITY_COLORS[2], leads: [] },
      { label: 'Đang trao đổi', color: OPPORTUNITY_COLORS[3], leads: [] },
      { label: 'Chưa có tín hiệu', color: OPPORTUNITY_COLORS[4], leads: [] }
    ];
    leads.filter(isOpen).forEach(lead => {
      const progress = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.progress] || [];
      const index = lead.stage === 'negotiating' || progress.includes('negotiating') ? 0
        : lead.stage === 'quoted' || progress.includes('quote_sent') || progress.includes('waiting_feedback') ? 1
          : progress.includes('sample_in_progress') ? 2
            : lead.stage === 'contacted' || progress.some(value => ['contacted', 'discussing', 'preparing_quote'].includes(value)) ? 3 : 4;
      opportunityBuckets[index].leads.push(lead);
    });

    const visibleSales = currentUser.role === 'admin'
      ? saleUsers
      : saleUsers.filter(user => user.uid === currentUser.uid);
    const saleRows = visibleSales.map(user => {
      const owned = leads.filter(lead => lead.assignedSaleId === user.uid);
      const active = owned.filter(isOpen);
      const overdue = active.filter(lead => {
        if (!lead.nextFollowUpAt || lead.followUpHandledAt) return false;
        const due = new Date(lead.nextFollowUpAt).getTime();
        return Number.isFinite(due) && due < DASHBOARD_REFERENCE_TIME;
      });
      return { id: user.uid, name: user.displayName, active, overdue, won: owned.filter(lead => lead.stage === 'won' || lead.stage === 'converted') };
    }).concat(currentUser.role === 'admin' ? [{
      id: '',
      name: 'Chưa phân công',
      active: leads.filter(lead => !lead.assignedSaleId && isOpen(lead)),
      overdue: leads.filter(lead => !lead.assignedSaleId && isOpen(lead) && Boolean(lead.nextFollowUpAt) && !lead.followUpHandledAt && new Date(lead.nextFollowUpAt).getTime() < DASHBOARD_REFERENCE_TIME),
      won: leads.filter(lead => !lead.assignedSaleId && (lead.stage === 'won' || lead.stage === 'converted'))
    }] : []).filter(row => row.active.length || row.won.length)
      .sort((a, b) => b.overdue.length - a.overdue.length || b.active.length - a.active.length);

    const provinceMap = new Map<string, { label: string; leads: LeadRecord[] }>();
    leads.forEach(lead => {
      const provinceOptionId = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.province]?.[0] || lead.provinceId;
      const label = findLeadFilterOption(definitions, LEAD_FILTER_IDS.province, provinceOptionId)?.label
        || lead.province.trim() || 'Chưa cập nhật';
      const key = provinceOptionId || label.toLocaleLowerCase('vi-VN');
      const entry = provinceMap.get(key) || { label, leads: [] };
      entry.leads.push(lead);
      provinceMap.set(key, entry);
    });
    const clearOpportunityIds = new Set(opportunityBuckets.slice(0, 3).flatMap(bucket => bucket.leads.map(lead => lead.id)));
    const sortedProvinces = Array.from(provinceMap.values())
      .map(group => ({ ...group, leads: provinceMode === 'all'
        ? group.leads
        : group.leads.filter(lead => clearOpportunityIds.has(lead.id)) }))
      .filter(group => group.leads.length)
      .sort((a, b) => b.leads.length - a.leads.length);
    const provinces = sortedProvinces.length > 7
      ? [...sortedProvinces.slice(0, 6), { label: 'Tỉnh/thành khác', leads: sortedProvinces.slice(6).flatMap(group => group.leads) }]
      : sortedProvinces;
    return { stages, opportunities: opportunityBuckets, saleRows, provinces };
  }, [leads, saleUsers, currentUser.role, currentUser.uid, definitions, provinceMode]);

  const donut = donutBackground(stages);
  const maxOpportunity = Math.max(1, ...opportunities.slice(0, 4).map(group => group.leads.length));
  const maxSale = Math.max(1, ...saleRows.map(row => row.active.length + row.won.length));
  const provinceTotal = provinces.reduce((sum, group) => sum + group.leads.length, 0);
  const splitIndex = provinces.reduce((result, group, index) => {
    if (result.index >= 0) return result;
    const next = result.total + group.leads.length;
    return next >= provinceTotal / 2 ? { index: index + 1, total: next } : { index: -1, total: next };
  }, { index: -1, total: 0 }).index;
  const provinceRows = provinces.length > 1
    ? [provinces.slice(0, Math.min(splitIndex, provinces.length - 1)), provinces.slice(Math.min(splitIndex, provinces.length - 1))]
    : provinces.length ? [provinces] : [];

  return (
    <section className="lead-insights" aria-label="Tổng quan khách hàng tiềm năng">
      <section className="lead-insights__panel" aria-labelledby="lead-insights-general">
        <h2 id="lead-insights-general">Tình hình chung</h2>
        <div className="lead-insights__metrics">
          {metrics.map(metric => <button key={metric.label} type="button" onClick={() => onMetricClick(metric.key)}>
            <strong>{metric.count.toLocaleString('vi-VN')}</strong><span>{metric.label}</span>
          </button>)}
        </div>
        <div className="lead-insights__donut-layout">
          <div className="lead-insights__donut" style={{ background: donut }} role="img" aria-label={`Phân bổ ${leads.length} khách theo giai đoạn`}>
            <span><strong>{leads.length.toLocaleString('vi-VN')}</strong><small>khách</small></span>
          </div>
          <div className="lead-insights__legend">
            {stages.map(group => <button key={group.label} type="button" onClick={() => onGroupClick(group.label, group.leads)} disabled={!group.leads.length} title={`${group.label}: ${group.leads.length} khách`}>
              <i style={{ background: group.color }} /><span>{group.label}</span><strong>{group.leads.length}</strong>
            </button>)}
          </div>
        </div>
      </section>

      <section className="lead-insights__panel" aria-labelledby="lead-insights-opportunity">
        <h2 id="lead-insights-opportunity">Cơ hội</h2>
        <div className="lead-insights__bars">
          {opportunities.slice(0, 4).map(group => <button key={group.label} type="button" className="lead-insights__bar-row" onClick={() => onGroupClick(group.label, group.leads)} disabled={!group.leads.length} title={`${group.label}: ${group.leads.length} khách`}>
            <span>{group.label}</span><span className="lead-insights__bar-track"><i style={{ width: `${group.leads.length / maxOpportunity * 100}%`, background: group.color }} /></span><strong>{group.leads.length}</strong>
          </button>)}
          <button type="button" className="lead-insights__unknown" onClick={() => onGroupClick(opportunities[4].label, opportunities[4].leads)} disabled={!opportunities[4].leads.length}>Chưa có tín hiệu <strong>{opportunities[4].leads.length}</strong></button>
        </div>
        <div className="lead-insights__subhead">Khách có tín hiệu rõ</div>
        <div className="lead-insights__lead-list">
          {opportunities.slice(0, 3).flatMap(group => group.leads
            .slice()
            .sort((a, b) => (new Date(a.nextFollowUpAt).getTime() || Infinity) - (new Date(b.nextFollowUpAt).getTime() || Infinity))
            .map(lead => ({ lead, label: group.label }))).slice(0, 3).map(({ lead, label }) => (
            <button key={lead.id} type="button" onClick={() => onOpenLead(lead.id)} title={lead.companyName}>
              <span>{lead.companyName}</span><small>{label}</small>
            </button>
          ))}
          {!opportunities.slice(0, 3).some(group => group.leads.length) && <p className="lead-insights__empty">Chưa ghi nhận tín hiệu mua rõ.</p>}
        </div>
      </section>

      <section className="lead-insights__panel" aria-labelledby="lead-insights-sale">
        <h2 id="lead-insights-sale">Theo dõi Sale</h2>
        <div className="lead-insights__sale-legend"><span><i className="is-active" />Đang xử lý</span><span><i className="is-overdue" />Quá hạn</span><span><i className="is-won" />Đã chốt</span></div>
        <div className="lead-insights__sale-list">
          {saleRows.map(row => <button key={row.id} type="button" className="lead-insights__sale-row" onClick={() => onGroupClick(`Sale: ${row.name}`, leads.filter(lead => lead.assignedSaleId === row.id))} title={`${row.name}: ${row.active.length} đang xử lý, ${row.overdue.length} quá hạn, ${row.won.length} đã chốt`}>
            <span>{row.name}</span><span className="lead-insights__sale-track"><i className="is-active" style={{ width: `${(row.active.length - row.overdue.length) / maxSale * 100}%` }} /><i className="is-overdue" style={{ width: `${row.overdue.length / maxSale * 100}%` }} /><i className="is-won" style={{ width: `${row.won.length / maxSale * 100}%` }} /></span><strong>{row.active.length}</strong><small>{row.won.length}</small>
          </button>)}
          {!saleRows.length && <p className="lead-insights__empty">Chưa có khách được Sale phụ trách.</p>}
        </div>
      </section>

      <section className="lead-insights__panel" aria-labelledby="lead-insights-province">
        <div className="lead-insights__panel-heading"><h2 id="lead-insights-province">Tỉnh thành</h2><div className="lead-insights__mode" role="group" aria-label="Chỉ số tỉnh thành"><button type="button" className={provinceMode === 'all' ? 'is-selected' : ''} aria-pressed={provinceMode === 'all'} onClick={() => setProvinceMode('all')}>Tất cả</button><button type="button" className={provinceMode === 'opportunity' ? 'is-selected' : ''} aria-pressed={provinceMode === 'opportunity'} onClick={() => setProvinceMode('opportunity')}>Cơ hội rõ</button></div></div>
        <div className="lead-insights__province-summary"><strong>{provinces.length}</strong> khu vực có dữ liệu</div>
        <div className="lead-insights__treemap">
          {provinceRows.map((row, rowIndex) => <div key={rowIndex} className="lead-insights__treemap-row" style={{ flex: row.reduce((sum, group) => sum + group.leads.length, 0) || 1 }}>
            {row.map((group, index) => <button key={group.label} type="button" style={{ flex: group.leads.length, background: PROVINCE_COLORS[rowIndex * 4 + index] || PROVINCE_COLORS.at(-1) }} onClick={() => onGroupClick(group.label, group.leads)} title={`${group.label}: ${group.leads.length} khách`}>
              <span>{group.label}</span><strong>{group.leads.length}</strong>
            </button>)}
          </div>)}
          {!provinces.length && <p className="lead-insights__empty">Chưa có dữ liệu tỉnh thành.</p>}
        </div>
      </section>
    </section>
  );
}
