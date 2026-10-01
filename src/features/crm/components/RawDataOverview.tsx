import { memo, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CircleX,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileText,
  ListChecks,
  Phone,
  PhoneOff,
  Send,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  UserRoundX,
  WalletCards,
  type LucideIcon
} from 'lucide-react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import type { LeadCandidateRecord } from '../model/leadCandidateModels';
import type { PhoneCallRecord } from '../model/callHistory';
import {
  DEFAULT_LEAD_CANDIDATE_SCORING_RULES,
  normalizeLeadCandidateScoringRules,
  type LeadCandidateScoringRules
} from '../model/leadCandidateScoring';
import { countRawDataByProvince } from '../model/rawDataProvinces';
import {
  DEFAULT_RAW_PRIORITY_RULES,
  RAW_PRIORITY_LABELS,
  scoreRawCandidate,
  type RawPriorityGroup,
  type RawPriorityRules
} from '../model/rawDataOverview';
import './RawDataOverview.css';

type Props = {
  hidden?: boolean;
  mode: 'overview' | 'priority';
  candidates: LeadCandidateRecord[];
  saleUsers: UserProfile[];
  canConfigureScoring: boolean;
  onPriority: () => void;
  onScoring: () => void;
  onOverview: () => void;
  onOpenCandidate: (id: string) => void;
};
const RULE_DOCUMENT_ID = 'default';
const PRIORITY_GROUPS: RawPriorityGroup[] = ['call_first', 'enrich', 'verify'];
const PRIORITY_COLORS: Record<RawPriorityGroup, string> = { call_first: '#16845e', enrich: '#c58705', verify: '#cb3a43' };
type OverviewMetric = { label: string; value: number; delta: number | null; lowerIsBetter?: boolean; loading?: boolean; icon: LucideIcon; tone: string };
type SignalDefinition = { id: string; label: string; icon: LucideIcon; tone: string; matches?: (values: Set<string>) => boolean };
const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  { id: 'po_promised', label: 'Hẹn lên PO', icon: CalendarClock, tone: 'blue' },
  { id: 'sample_reviewing', label: 'Đang duyệt mẫu', icon: FileText, tone: 'green' },
  { id: 'sample_test_ok', label: 'Test mẫu OK', icon: CheckCircle2, tone: 'green' },
  { id: 'sample_test_not_ok', label: 'Test mẫu chưa OK', icon: CircleX, tone: 'red' },
  { id: 'sample_planning', label: 'Đang làm mẫu / kế hoạch', icon: Sparkles, tone: 'violet' },
  { id: 'sample_promised_not_received', label: 'Hẹn cho mẫu, chưa nhận', icon: CalendarClock, tone: 'orange' },
  { id: 'sample_sent', label: 'Đã gửi mẫu', icon: Send, tone: 'blue' },
  { id: 'product_info_provided', label: 'Đã cung cấp thông tin SP', icon: ListChecks, tone: 'teal' },
  { id: 'target_price_provided', label: 'Đã cho giá target', icon: CircleDollarSign, tone: 'yellow' },
  { id: 'target_price_missing', label: 'Chưa cho giá target', icon: CircleX, tone: 'red', matches: values => values.has('target_price_promised') && !values.has('target_price_provided') },
  { id: 'price_low', label: 'Giá thấp', icon: TrendingDown, tone: 'green' },
  { id: 'price_high', label: 'Giá cao', icon: TrendingUp, tone: 'red' },
  { id: 'price_surveying', label: 'Đang khảo giá', icon: Tag, tone: 'violet' },
  { id: 'sale_quote_sent', label: 'Sale đã báo giá', icon: FileCheck2, tone: 'blue' },
  { id: 'usage_100m_plus', label: 'Từ 100 triệu trở lên', icon: BarChart3, tone: 'red' }
];
const formatNumber = (value: number) => value.toLocaleString('vi-VN');
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
const normalizeRules = (value: unknown): RawPriorityRules => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const threshold = Number(source.callFirstThreshold);
  return {
    targetIndustries: typeof source.targetIndustries === 'string' ? source.targetIndustries : '',
    targetProducts: typeof source.targetProducts === 'string' ? source.targetProducts : '',
    callFirstThreshold: Number.isFinite(threshold) && threshold >= 30 && threshold <= 90 ? threshold : DEFAULT_RAW_PRIORITY_RULES.callFirstThreshold
  };
};

export const RawDataOverview = memo(function RawDataOverview({ hidden = false, mode, candidates, saleUsers, canConfigureScoring, onPriority, onScoring, onOverview, onOpenCandidate }: Props) {
  const [calls, setCalls] = useState<PhoneCallRecord[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState(false);
  const [rules, setRules] = useState<RawPriorityRules>(DEFAULT_RAW_PRIORITY_RULES);
  const [scoringRules, setScoringRules] = useState<LeadCandidateScoringRules>(DEFAULT_LEAD_CANDIDATE_SCORING_RULES);
  const [group, setGroup] = useState<RawPriorityGroup>('call_first');
  const [search, setSearch] = useState('');
  const [sale, setSale] = useState('all');
  const [source, setSource] = useState('all');
  const [sector, setSector] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      dbService.getCollection('call_history'),
      dbService.getDocument('raw_data_priority_rules', RULE_DOCUMENT_ID),
      dbService.getDocument('raw_data_priority_rules', 'scoring-default')
    ]).then(([history, configuration, scoringConfiguration]) => {
      if (!active) return;
      if (history.status === 'fulfilled') setCalls(history.value as PhoneCallRecord[]);
      else setCallsError(true);
      if (configuration.status === 'fulfilled' && configuration.value) {
        const next = normalizeRules(configuration.value);
        setRules(next);
      }
      if (scoringConfiguration.status === 'fulfilled' && scoringConfiguration.value) {
        setScoringRules(normalizeLeadCandidateScoringRules(scoringConfiguration.value));
      }
      setCallsLoading(false);
    });
    return () => { active = false; };
  }, []);

  const callsByCandidate = useMemo(() => {
    const indexed = new Map<string, PhoneCallRecord[]>();
    calls.forEach(call => {
      if (!call.subjectKey?.startsWith('candidate:')) return;
      const candidateId = call.subjectKey.slice('candidate:'.length);
      const rows = indexed.get(candidateId);
      if (rows) rows.push(call);
      else indexed.set(candidateId, [call]);
    });
    return indexed;
  }, [calls]);
  const scored = useMemo(() => candidates.map(candidate => scoreRawCandidate(candidate, callsByCandidate.get(candidate.id) || [], rules, scoringRules)), [callsByCandidate, candidates, rules, scoringRules]);
  const priorityRows = useMemo(() => scored.filter(row => row.candidate.status !== 'converted' && !row.candidate.convertedLeadId), [scored]);
  const groupCounts = useMemo(() => ({
    call_first: priorityRows.filter(row => row.group === 'call_first').length,
    enrich: priorityRows.filter(row => row.group === 'enrich').length,
    verify: priorityRows.filter(row => row.group === 'verify').length
  }), [priorityRows]);
  const thisMonth = relativeMonthKey(0);
  const previousMonth = relativeMonthKey(-1);
  const metrics = useMemo<OverviewMetric[]>(() => {
    const calledInMonth = (candidate: LeadCandidateRecord, key: string) => (
      (callsByCandidate.get(candidate.id) || []).some(call => monthKey(call.startedAt) === key)
      || monthKey(candidate.lastContactAt) === key
    );
    const newInMonth = (key: string) => candidates.filter(candidate => monthKey(candidate.createdAt) === key).length;
    const calledInMonthCount = (key: string) => candidates.filter(candidate => calledInMonth(candidate, key)).length;
    const uncalledNewInMonth = (key: string) => scored.filter(row => !row.called && monthKey(row.candidate.createdAt) === key).length;
    const unassignedNewInMonth = (key: string) => candidates.filter(candidate => !candidate.assignedSaleId && monthKey(candidate.createdAt) === key).length;
    const convertedInMonth = (key: string) => candidates.filter(candidate => monthKey(candidate.convertedAt) === key).length;
    return [
      { label: 'Tổng dữ liệu thô', value: candidates.length, delta: null, icon: Database, tone: 'blue' },
      { label: 'Mới trong tháng', value: newInMonth(thisMonth), delta: newInMonth(thisMonth) - newInMonth(previousMonth), icon: ClipboardCheck, tone: 'green' },
      { label: 'Đã gọi', value: scored.filter(row => row.called).length, delta: calledInMonthCount(thisMonth) - calledInMonthCount(previousMonth), loading: callsLoading, icon: Phone, tone: 'blue' },
      { label: 'Chưa gọi', value: scored.filter(row => !row.called).length, delta: uncalledNewInMonth(thisMonth) - uncalledNewInMonth(previousMonth), lowerIsBetter: true, loading: callsLoading, icon: PhoneOff, tone: 'red' },
      { label: 'Chưa phân công Sale', value: candidates.filter(candidate => !candidate.assignedSaleId).length, delta: unassignedNewInMonth(thisMonth) - unassignedNewInMonth(previousMonth), lowerIsBetter: true, icon: UserRoundX, tone: 'violet' },
      { label: 'Chuyển Tiềm năng', value: candidates.filter(candidate => candidate.status === 'converted' || candidate.convertedLeadId).length, delta: convertedInMonth(thisMonth) - convertedInMonth(previousMonth), icon: WalletCards, tone: 'orange' }
    ];
  }, [callsByCandidate, callsLoading, candidates, previousMonth, scored, thisMonth]);
  const signalRows = useMemo(() => {
    const activeCandidates = priorityRows.map(row => row.candidate);
    return SIGNAL_DEFINITIONS.map(signal => ({
      ...signal,
      count: activeCandidates.filter(candidate => {
        const values = new Set(candidate.customerInsightValues || []);
        return signal.matches ? signal.matches(values) : values.has(signal.id);
      }).length
    }));
  }, [priorityRows]);
  const signalMax = Math.max(1, ...signalRows.map(signal => signal.count));
  const saleRows = useMemo(() => saleUsers.map(user => ({
    id: user.uid, name: user.displayName,
    count: candidates.filter(candidate => candidate.discoveredById === user.uid).length
  })).filter(row => row.count > 0).sort((left, right) => right.count - left.count).slice(0, 5), [candidates, saleUsers]);
  const saleMax = Math.max(1, ...saleRows.map(row => row.count));
  const provinceRows = useMemo(() => countRawDataByProvince(candidates), [candidates]);
  const provinceMax = Math.max(1, ...provinceRows.map(row => row.count));
  const donutTotal = priorityRows.length || 1;
  const greenPercent = groupCounts.call_first / donutTotal * 100;
  const yellowPercent = groupCounts.enrich / donutTotal * 100;
  const donutBackground = `conic-gradient(${PRIORITY_COLORS.call_first} 0 ${greenPercent}%, ${PRIORITY_COLORS.enrich} ${greenPercent}% ${greenPercent + yellowPercent}%, ${PRIORITY_COLORS.verify} ${greenPercent + yellowPercent}% 100%)`;
  const sourceOptions = useMemo(() => Array.from(new Set(priorityRows.map(row => row.candidate.source.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi-VN')), [priorityRows]);
  const sectorOptions = useMemo(() => Array.from(new Set(priorityRows.map(row => row.candidate.businessSector.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi-VN')), [priorityRows]);
  const filtered = useMemo(() => priorityRows.filter(row => {
    const candidate = row.candidate;
    return row.group === group
      && (sale === 'all' || candidate.discoveredById === sale)
      && (source === 'all' || candidate.source === source)
      && (sector === 'all' || candidate.businessSector === sector)
      && (!search.trim() || `${candidate.companyName} ${candidate.taxCode} ${candidate.phone}`.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN')));
  }).sort((left, right) => right.score - left.score || left.candidate.companyName.localeCompare(right.candidate.companyName, 'vi-VN')), [group, priorityRows, sale, search, sector, source]);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const resetFilters = () => { setSearch(''); setSale('all'); setSource('all'); setSector('all'); setPage(1); };
  return <div className="raw-overview" hidden={hidden}>
    {mode === 'priority' && <div className="raw-overview__actions"><button type="button" className="btn btn-outline" onClick={onOverview}>Quay lại Tổng quan</button></div>}
    {callsError && <p className="raw-overview__notice" role="alert">Chưa tải được lịch sử cuộc gọi; số đã gọi và vùng ưu tiên có thể chưa đầy đủ. Vui lòng tải lại trang.</p>}
    {mode === 'overview' ? <>
      <div className="raw-overview__dashboard">
        <section className="raw-overview__panel raw-overview__panel--general">
          <div className="raw-overview__metrics">{metrics.map(metric => {
            const MetricIcon = metric.icon;
            const favorable = metric.delta === 0 || metric.delta === null
              ? null
              : metric.lowerIsBetter ? metric.delta < 0 : metric.delta > 0;
            return <div key={metric.label} className={`raw-overview__metric raw-overview__metric--${metric.tone}`}>
              <span className="raw-overview__metric-icon"><MetricIcon size={18} aria-hidden="true" /></span>
              <div className="raw-overview__metric-content">
                <span title={metric.label}>{metric.label}</span>
                <strong>{metric.loading ? '…' : formatNumber(metric.value)}</strong>
                {metric.delta !== null && !metric.loading && <small className={favorable === null ? 'is-neutral' : favorable ? 'is-favorable' : 'is-unfavorable'}>
                  {metric.delta === 0 ? '— Không đổi so với tháng trước' : `${metric.delta > 0 ? '↑' : '↓'} ${formatNumber(Math.abs(metric.delta))} so với tháng trước`}
                </small>}
              </div>
            </div>;
          })}</div>
        </section>
        <section className="raw-overview__panel raw-overview__panel--signals">
          <header><h2>Tín hiệu khai thác khách hàng</h2><p>Phân loại nhanh dữ liệu thô đang xử lý</p></header>
          <div className="raw-overview__signals">
            {signalRows.map(signal => {
              const SignalIcon = signal.icon;
              return <div key={signal.id} className={`raw-overview__signal raw-overview__signal--${signal.tone}`} title={`${signal.label}: ${formatNumber(signal.count)} hồ sơ`}>
                <span className="raw-overview__signal-icon"><SignalIcon size={16} aria-hidden="true" /></span>
                <div><span>{signal.label}</span><strong>{formatNumber(signal.count)}</strong><i><b style={{ width: `${signal.count / signalMax * 100}%` }} /></i></div>
              </div>;
            })}
          </div>
        </section>
        <section className="raw-overview__panel raw-overview__panel--priority"><header className="raw-overview__panel-header"><div><h2>Ưu tiên khai thác</h2><p>Nên gọi · Bổ sung thông tin · Xác minh trước khi gọi</p></div>{canConfigureScoring && <button type="button" className="raw-overview__config-button" onClick={onScoring}>Cập nhật điểm</button>}</header><div className="raw-overview__priority-chart"><div className="raw-overview__donut" style={{ background: priorityRows.length ? donutBackground : '#e8edf5' }}><span><strong>{formatNumber(priorityRows.length)}</strong><small>hồ sơ</small></span></div><div className="raw-overview__priority-legend">{PRIORITY_GROUPS.map(key => <button key={key} type="button" onClick={() => { setGroup(key); setPage(1); onPriority(); }}><span className={`raw-overview__group raw-overview__group--${key}`}>{RAW_PRIORITY_LABELS[key]}</span><strong>{formatNumber(groupCounts[key])}</strong><i><b style={{ width: `${priorityRows.length ? groupCounts[key] / priorityRows.length * 100 : 0}%` }} /></i></button>)}</div></div><div className="raw-overview__priority-note"><span>Chọn một nhóm để xem hồ sơ và lý do xếp ưu tiên</span><button type="button" onClick={() => { setGroup('call_first'); onPriority(); }}>Xem bảng ưu tiên</button></div></section>
        <section className="raw-overview__panel raw-overview__panel--sale"><h2>Dữ liệu của Sale</h2><p>Dữ liệu thô do từng Sale tự tìm</p><div className="raw-overview__bars">{saleRows.length ? saleRows.map(row => <div key={row.id}><span title={row.name}>{row.name}</span><i><b style={{ width: `${row.count / saleMax * 100}%` }} /></i><strong>{formatNumber(row.count)}</strong></div>) : <p>Chưa có dữ liệu Sale tự tìm.</p>}</div></section>
        <section className="raw-overview__panel raw-overview__panel--province"><h2>Dữ liệu kiếm được theo tỉnh thành</h2><p>Phân bố dữ liệu thô theo địa bàn doanh nghiệp</p>{provinceRows.length ? <div className="raw-overview__province-scroll"><div className="raw-overview__province-chart" role="img" aria-label={provinceRows.map(row => `${row.label}: ${formatNumber(row.count)} hồ sơ`).join('; ')}>{provinceRows.map(row => <div className="raw-overview__province-column" key={row.label}><strong>{formatNumber(row.count)}</strong><i style={{ height: `${Math.max(3, row.count / provinceMax * 175)}px` }} /><span title={row.label}>{row.label}</span></div>)}</div></div> : <p className="raw-overview__empty">Chưa có dữ liệu để thống kê theo tỉnh thành.</p>}</section>
      </div>
    </> : <section className="raw-overview__priority-page"><h2>Ưu tiên khai thác dữ liệu</h2><p>Điểm được tính từ thông tin có sẵn; vùng ưu tiên không thay thế kết quả tư vấn thực tế.</p><div className="raw-overview__priority-tabs" role="tablist">{PRIORITY_GROUPS.map(key => <button key={key} type="button" role="tab" aria-selected={group === key} className={group === key ? 'is-active' : ''} onClick={() => { setGroup(key); setPage(1); }}>{RAW_PRIORITY_LABELS[key]} <strong>{formatNumber(groupCounts[key])}</strong></button>)}</div><div className="raw-overview__filters"><input aria-label="Tìm doanh nghiệp" placeholder="Tìm doanh nghiệp, MST, số điện thoại..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Lọc Sale tìm được" value={sale} onChange={event => { setSale(event.target.value); setPage(1); }}><option value="all">Tất cả Sale</option>{saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select><select aria-label="Lọc nguồn" value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="all">Tất cả nguồn</option>{sourceOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Lọc ngành nghề" value={sector} onChange={event => { setSector(event.target.value); setPage(1); }}><option value="all">Tất cả ngành nghề</option>{sectorOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><button type="button" onClick={resetFilters}>Đặt lại</button></div><div className="raw-overview__table-wrap"><table><thead><tr><th>Doanh nghiệp</th><th>Sale tìm được</th><th>Điểm</th><th>Lý do xếp nhóm</th><th>Liên hệ</th><th>Thao tác</th></tr></thead><tbody>{visible.map(row => <tr key={row.candidate.id}><td title={row.candidate.companyName}><strong>{row.candidate.companyName}</strong></td><td>{row.candidate.discoveredByName || 'Chưa xác định'}</td><td><strong className={`raw-overview__group raw-overview__group--${group}`}>{row.score}</strong></td><td title={row.reasons.join('; ')}>{row.reasons.slice(0, 3).join(' · ')}</td><td>{row.candidate.phone || 'Chưa có số'}</td><td><button type="button" onClick={() => onOpenCandidate(row.candidate.id)}>Mở hồ sơ</button></td></tr>)}</tbody></table>{visible.length === 0 && <p className="raw-overview__empty">Không có hồ sơ phù hợp.</p>}</div><footer className="raw-overview__pagination"><span>Hiển thị {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} / {formatNumber(filtered.length)}</span><div><button type="button" disabled={safePage === 1} onClick={() => setPage(page - 1)}>Trước</button><span>{safePage} / {totalPages}</span><button type="button" disabled={safePage === totalPages} onClick={() => setPage(page + 1)}>Sau</button></div></footer></section>}
  </div>;
});
