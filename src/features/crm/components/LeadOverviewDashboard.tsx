import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  CircleX,
  Clock3,
  FileCheck2,
  FileSearch,
  Handshake,
  MessagesSquare,
  Send,
  Sparkles,
  TrendingUp,
  UsersRound,
  type LucideIcon
} from 'lucide-react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { LeadFilterDefinition, LeadRecord } from '@/features/crm/model/crmModels';
import { findLeadFilterOption, getLeadFilterValues, LEAD_FILTER_IDS } from '@/features/crm/model/leadFilterConfig';
import './LeadOverviewDashboard.css';

type OverviewMetric = { key: string | null; label: string; count: number };
type LeadGroup = { label: string; leads: LeadRecord[]; color: string };
type ProvinceStatus = 'total' | 'negotiating' | 'quoted' | 'sample' | 'discussing' | 'new' | 'won' | 'lost' | 'converted';
type SignalDefinition = { id: string; label: string; icon: LucideIcon; tone: string; matches?: (values: Set<string>) => boolean };

const METRIC_PRESENTATION: Record<string, { icon: LucideIcon; tone: string; lowerIsBetter?: boolean }> = {
  'Tổng KH tiềm năng': { icon: UsersRound, tone: 'blue' },
  'Đã gửi báo giá': { icon: Send, tone: 'green' },
  'Đang chờ chốt': { icon: Clock3, tone: 'orange' },
  'Đã chốt': { icon: CheckCircle2, tone: 'green' },
  'Không thành công': { icon: CircleX, tone: 'red', lowerIsBetter: true },
  'Đã thành khách hàng': { icon: Building2, tone: 'violet' }
};

const INSIGHT_SIGNAL_DEFINITIONS: SignalDefinition[] = [
  { id: 'po_promised', label: 'Hẹn lên PO', icon: CalendarClock, tone: 'blue' },
  { id: 'sample_reviewing', label: 'Đang duyệt mẫu', icon: FileSearch, tone: 'green' },
  { id: 'sample_test_ok', label: 'Test mẫu OK', icon: BadgeCheck, tone: 'green' },
  { id: 'sample_test_not_ok', label: 'Test mẫu chưa OK', icon: CircleX, tone: 'red' },
  { id: 'sample_promised_not_received', label: 'Hẹn cho mẫu, chưa nhận', icon: CalendarClock, tone: 'orange' },
  { id: 'target_price_provided', label: 'Đã cho giá target', icon: CircleDollarSign, tone: 'green' },
  { id: 'target_price_missing', label: 'Chưa cho giá target', icon: CircleHelp, tone: 'violet', matches: values => values.has('target_price_promised') && !values.has('target_price_provided') },
  { id: 'price_high', label: 'Giá cao', icon: TrendingUp, tone: 'red' },
  { id: 'sale_quote_sent', label: 'Sale đã báo giá', icon: FileCheck2, tone: 'blue' },
  { id: 'usage_100m_plus', label: 'Từ 100 triệu trở lên', icon: BarChart3, tone: 'violet' }
];

const OPPORTUNITY_COLORS = ['#e66b5b', '#f2a842', '#7768c9', '#38a8b8', '#a3adbd'];
const PROVINCE_STATUSES: Array<{ id: ProvinceStatus; label: string; color: string }> = [
  { id: 'total', label: 'Tất cả', color: '#3157c8' },
  { id: 'negotiating', label: 'Đang đàm phán', color: '#d96454' },
  { id: 'quoted', label: 'Đã gửi báo giá', color: '#d99832' },
  { id: 'sample', label: 'Đang làm mẫu', color: '#7768c9' },
  { id: 'discussing', label: 'Đang trao đổi', color: '#2594a5' },
  { id: 'new', label: 'Chưa có tín hiệu', color: '#8797af' },
  { id: 'won', label: 'Thành công', color: '#35a779' },
  { id: 'lost', label: 'Không thành công', color: '#8b99a9' },
  { id: 'converted', label: 'Đã chuyển đổi', color: '#6250a3' }
];
const DASHBOARD_REFERENCE_TIME = Date.now();
const isOpen = (lead: LeadRecord) => !['won', 'lost', 'converted'].includes(lead.stage) && !lead.convertedCustomerId;
const monthKey = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
};
const relativeMonthKey = (offset: number) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const matchesOverviewMetric = (lead: LeadRecord, key: string | null, definitions: LeadFilterDefinition[]) => {
  if (!key) return true;
  if (key === 'quoted') {
    const progress = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.progress] || [];
    return progress.includes('quote_sent') || lead.stage === 'quoted' || lead.stage === 'negotiating';
  }
  if (key === 'pending') return lead.stage === 'quoted' || lead.stage === 'negotiating';
  if (key === 'converted') return lead.stage === 'converted' || Boolean(lead.convertedCustomerId);
  return lead.stage === key;
};

const getProvinceStatus = (lead: LeadRecord, definitions: LeadFilterDefinition[]): ProvinceStatus => {
  if (lead.stage === 'converted' || lead.convertedCustomerId) return 'converted';
  if (lead.stage === 'won') return 'won';
  if (lead.stage === 'lost') return 'lost';
  const progress = getLeadFilterValues(lead, definitions)[LEAD_FILTER_IDS.progress] || [];
  if (lead.stage === 'negotiating' || progress.includes('negotiating')) return 'negotiating';
  if (lead.stage === 'quoted' || progress.includes('quote_sent') || progress.includes('waiting_feedback')) return 'quoted';
  if (progress.includes('sample_in_progress')) return 'sample';
  if (lead.stage === 'contacted' || progress.some(value => ['contacted', 'discussing', 'preparing_quote'].includes(value))) return 'discussing';
  return 'new';
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
  const [selectedProvinceStatus, setSelectedProvinceStatus] = useState<ProvinceStatus>('total');
  const { opportunities, saleRows, provinces } = useMemo(() => {
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
    const provinces = Array.from(provinceMap.values());
    return { opportunities: opportunityBuckets, saleRows, provinces };
  }, [leads, saleUsers, currentUser.role, currentUser.uid, definitions]);

  const maxOpportunity = Math.max(1, ...opportunities.slice(0, 4).map(group => group.leads.length));
  const maxSale = Math.max(1, ...saleRows.map(row => row.active.length + row.won.length));
  const metricRows = useMemo(() => {
    const thisMonth = relativeMonthKey(0);
    const previousMonth = relativeMonthKey(-1);
    return metrics.map((metric, index) => {
      const presentation: { icon: LucideIcon; tone: string; lowerIsBetter?: boolean } =
        METRIC_PRESENTATION[metric.label] || { icon: UsersRound, tone: 'blue' };
      const countInMonth = (key: string) => leads.filter(lead => {
        if (!matchesOverviewMetric(lead, metric.key, definitions)) return false;
        const eventAt = metric.key === 'converted' ? lead.convertedAt : lead.createdAt;
        return monthKey(eventAt) === key;
      }).length;
      return {
        ...metric,
        ...presentation,
        delta: index === 0 ? null : countInMonth(thisMonth) - countInMonth(previousMonth)
      };
    });
  }, [definitions, leads, metrics]);
  const signalRows = useMemo(() => {
    const opportunityPresentation = [
      { icon: Handshake, tone: 'red' },
      { icon: Send, tone: 'orange' },
      { icon: Sparkles, tone: 'violet' },
      { icon: MessagesSquare, tone: 'teal' },
      { icon: CircleHelp, tone: 'blue' }
    ];
    const opportunitySignals = opportunities.map((group, index) => ({
      id: `opportunity-${index}`,
      label: group.label,
      icon: opportunityPresentation[index].icon,
      tone: opportunityPresentation[index].tone,
      leads: group.leads
    }));
    const openLeads = leads.filter(isOpen);
    const insightSignals = INSIGHT_SIGNAL_DEFINITIONS.map(signal => ({
      ...signal,
      leads: openLeads.filter(lead => {
        const values = new Set(lead.customerInsightValues || []);
        return signal.matches ? signal.matches(values) : values.has(signal.id);
      })
    }));
    return [...opportunitySignals, ...insightSignals];
  }, [leads, opportunities]);
  const maxSignal = Math.max(1, ...signalRows.map(signal => signal.leads.length));
  const provinceSeries = useMemo(() => PROVINCE_STATUSES.filter(status => status.id === selectedProvinceStatus), [selectedProvinceStatus]);
  const provinceColumns = useMemo(() => {
    const statusByLead = new Map(leads.map(lead => [lead.id, getProvinceStatus(lead, definitions)]));
    return provinces.map(province => ({
      ...province,
      series: provinceSeries.map(status => ({
        ...status,
        leads: status.id === 'total' ? province.leads : province.leads.filter(lead => statusByLead.get(lead.id) === status.id)
      }))
    })).filter(province => province.series.some(series => series.leads.length))
      .sort((a, b) => b.series.reduce((sum, series) => sum + series.leads.length, 0) - a.series.reduce((sum, series) => sum + series.leads.length, 0));
  }, [leads, provinces, provinceSeries, definitions]);
  const provinceMax = Math.max(1, ...provinceColumns.flatMap(province => province.series.map(series => series.leads.length)));

  return (
    <section className="lead-insights" aria-label="Tổng quan khách hàng tiềm năng">
      <section className="lead-insights__panel lead-insights__panel--general" aria-label="Chỉ số tổng quan khách hàng tiềm năng">
        <div className="lead-insights__metrics">
          {metricRows.map(metric => {
            const MetricIcon = metric.icon;
            const favorable = metric.delta === 0 || metric.delta === null
              ? null
              : metric.lowerIsBetter ? metric.delta < 0 : metric.delta > 0;
            return <button key={metric.label} type="button" className={`lead-insights__metric lead-insights__metric--${metric.tone}`} onClick={() => onMetricClick(metric.key)}>
              <span className="lead-insights__metric-icon"><MetricIcon size={18} aria-hidden="true" /></span>
              <span className="lead-insights__metric-content">
                <span title={metric.label}>{metric.label}</span>
                <strong>{metric.count.toLocaleString('vi-VN')}</strong>
                {metric.delta !== null && <small className={favorable === null ? 'is-neutral' : favorable ? 'is-favorable' : 'is-unfavorable'}>
                  {metric.delta === 0 ? '— Không đổi so với tháng trước' : `${metric.delta > 0 ? '↑' : '↓'} ${Math.abs(metric.delta).toLocaleString('vi-VN')} so với tháng trước`}
                </small>}
              </span>
            </button>;
          })}
        </div>
      </section>

      <section className="lead-insights__panel lead-insights__panel--signals" aria-labelledby="lead-insights-signals">
        <header><h2 id="lead-insights-signals">Tín hiệu khai thác khách hàng</h2><p>Theo dõi nhanh tín hiệu và tiến độ chốt Lead</p></header>
        <div className="lead-insights__signals">
          {signalRows.map(signal => {
            const SignalIcon = signal.icon;
            return <button key={signal.id} type="button" className={`lead-insights__signal lead-insights__signal--${signal.tone}`} disabled={!signal.leads.length} onClick={() => onGroupClick(signal.label, signal.leads)} title={`${signal.label}: ${signal.leads.length} khách`}>
              <span className="lead-insights__signal-icon"><SignalIcon size={16} aria-hidden="true" /></span>
              <span className="lead-insights__signal-content"><span>{signal.label}</span><strong>{signal.leads.length}</strong><i><b style={{ width: `${signal.leads.length / maxSignal * 100}%` }} /></i></span>
            </button>;
          })}
        </div>
      </section>

      <section className="lead-insights__panel lead-insights__panel--opportunity" aria-labelledby="lead-insights-opportunity">
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

      <section className="lead-insights__panel lead-insights__panel--sale" aria-labelledby="lead-insights-sale">
        <h2 id="lead-insights-sale">Theo dõi Sale</h2>
        <div className="lead-insights__sale-legend"><span><i className="is-active" />Đang xử lý</span><span><i className="is-overdue" />Quá hạn</span><span><i className="is-won" />Đã chốt</span></div>
        <div className="lead-insights__sale-list">
          {saleRows.map(row => <button key={row.id} type="button" className="lead-insights__sale-row" onClick={() => onGroupClick(`Sale: ${row.name}`, leads.filter(lead => lead.assignedSaleId === row.id))} title={`${row.name}: ${row.active.length} đang xử lý, ${row.overdue.length} quá hạn, ${row.won.length} đã chốt`}>
            <span>{row.name}</span><span className="lead-insights__sale-track"><i className="is-active" style={{ width: `${(row.active.length - row.overdue.length) / maxSale * 100}%` }} /><i className="is-overdue" style={{ width: `${row.overdue.length / maxSale * 100}%` }} /><i className="is-won" style={{ width: `${row.won.length / maxSale * 100}%` }} /></span><strong>{row.active.length}</strong><small>{row.won.length}</small>
          </button>)}
          {!saleRows.length && <p className="lead-insights__empty">Chưa có khách được Sale phụ trách.</p>}
        </div>
      </section>

      <section className="lead-insights__panel lead-insights__panel--province" aria-labelledby="lead-insights-province">
        <div className="lead-insights__province-heading">
          <h2 id="lead-insights-province">Tỉnh thành</h2>
          <select
            className="lead-insights__province-select"
            aria-label="Trạng thái theo tỉnh thành"
            value={selectedProvinceStatus}
            onChange={event => setSelectedProvinceStatus(event.target.value as ProvinceStatus)}
          >
            {PROVINCE_STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}
          </select>
        </div>
        {provinceColumns.length ? <div className="lead-insights__province-chart">
          <div className="lead-insights__province-axis" aria-hidden="true"><span>{provinceMax}</span><span>{(provinceMax / 2).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span><span>0</span></div>
          <div className="lead-insights__province-scroll">
            <div className="lead-insights__province-columns">
              <div className="lead-insights__province-grid" aria-hidden="true"><i /><i /><i /></div>
              {provinceColumns.map(province => <div key={province.label} className="lead-insights__province-group" style={{ minWidth: `${Math.max(92, provinceSeries.length * 30 + 20)}px` }}>
                <div className="lead-insights__province-bars">
                  {province.series.map(series => series.leads.length ? <button key={series.id} type="button" className="lead-insights__province-bar" style={{ height: `${series.leads.length / provinceMax * 100}%`, background: series.color }} onClick={() => onGroupClick(`${province.label} · ${series.label}`, series.leads)} title={`${province.label} · ${series.label}: ${series.leads.length} khách`} aria-label={`${province.label}, ${series.label}: ${series.leads.length} khách`}><strong>{series.leads.length}</strong></button> : <span key={series.id} className="lead-insights__province-zero" title={`${province.label} · ${series.label}: 0 khách`} />)}
                </div>
                <span className="lead-insights__province-name" title={province.label}>{province.label}</span>
              </div>)}
            </div>
          </div>
        </div> : <p className="lead-insights__empty">Không có khách ở trạng thái đã chọn.</p>}
      </section>
    </section>
  );
}
