import { memo, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import type { LeadCandidateRecord } from '../model/leadCandidateModels';
import type { PhoneCallRecord } from '../model/callHistory';
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
  mode: 'overview' | 'priority';
  candidates: LeadCandidateRecord[];
  saleUsers: UserProfile[];
  currentUser: UserProfile;
  onPriority: () => void;
  onOverview: () => void;
  onOpenCandidate: (id: string) => void;
};
const RULE_DOCUMENT_ID = 'default';
const PRIORITY_GROUPS: RawPriorityGroup[] = ['call_first', 'enrich', 'verify'];
const PRIORITY_COLORS: Record<RawPriorityGroup, string> = { call_first: '#16845e', enrich: '#c58705', verify: '#cb3a43' };
const formatNumber = (value: number) => value.toLocaleString('vi-VN');
const monthKey = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : '';
};
const monthName = (date: Date) => `T${date.getMonth() + 1}`;
const monthTicks = () => Array.from({ length: 6 }, (_, index) => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - (5 - index));
  return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: monthName(date) };
});
const normalizeRules = (value: unknown): RawPriorityRules => {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const threshold = Number(source.callFirstThreshold);
  return {
    targetIndustries: typeof source.targetIndustries === 'string' ? source.targetIndustries : '',
    targetProducts: typeof source.targetProducts === 'string' ? source.targetProducts : '',
    callFirstThreshold: Number.isFinite(threshold) && threshold >= 30 && threshold <= 90 ? threshold : DEFAULT_RAW_PRIORITY_RULES.callFirstThreshold
  };
};

export const RawDataOverview = memo(function RawDataOverview({ mode, candidates, saleUsers, currentUser, onPriority, onOverview, onOpenCandidate }: Props) {
  const [calls, setCalls] = useState<PhoneCallRecord[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState(false);
  const [rules, setRules] = useState<RawPriorityRules>(DEFAULT_RAW_PRIORITY_RULES);
  const [rulesDraft, setRulesDraft] = useState<RawPriorityRules>(DEFAULT_RAW_PRIORITY_RULES);
  const [rulesExist, setRulesExist] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState('');
  const [group, setGroup] = useState<RawPriorityGroup>('call_first');
  const [search, setSearch] = useState('');
  const [sale, setSale] = useState('all');
  const [source, setSource] = useState('all');
  const [sector, setSector] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([dbService.getCollection('call_history'), dbService.getDocument('raw_data_priority_rules', RULE_DOCUMENT_ID)]).then(([history, configuration]) => {
      if (!active) return;
      if (history.status === 'fulfilled') setCalls(history.value as PhoneCallRecord[]);
      else setCallsError(true);
      if (configuration.status === 'fulfilled' && configuration.value) {
        const next = normalizeRules(configuration.value);
        setRules(next);
        setRulesDraft(next);
        setRulesExist(true);
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
  const scored = useMemo(() => candidates.map(candidate => scoreRawCandidate(candidate, callsByCandidate.get(candidate.id) || [], rules)), [callsByCandidate, candidates, rules]);
  const priorityRows = useMemo(() => scored.filter(row => row.candidate.status !== 'converted' && !row.candidate.convertedLeadId), [scored]);
  const groupCounts = useMemo(() => ({
    call_first: priorityRows.filter(row => row.group === 'call_first').length,
    enrich: priorityRows.filter(row => row.group === 'enrich').length,
    verify: priorityRows.filter(row => row.group === 'verify').length
  }), [priorityRows]);
  const thisMonth = monthKey(new Date().toISOString());
  const metrics = useMemo(() => [
    ['Tổng dữ liệu thô', candidates.length],
    ['Mới trong tháng', candidates.filter(candidate => monthKey(candidate.createdAt) === thisMonth).length],
    ['Đã gọi', scored.filter(row => row.called).length],
    ['Chưa gọi', scored.filter(row => !row.called).length],
    ['Đã liên hệ được', scored.filter(row => row.connected).length],
    ['Chuyển Tiềm năng', candidates.filter(candidate => candidate.status === 'converted' || candidate.convertedLeadId).length]
  ] as const, [candidates, scored, thisMonth]);
  const ticks = useMemo(() => monthTicks(), []);
  const trend = useMemo(() => ticks.map(tick => ({
    ...tick,
    found: candidates.filter(candidate => monthKey(candidate.createdAt) === tick.key).length,
    called: scored.filter(row => row.called && (
      (callsByCandidate.get(row.candidate.id) || []).some(call => monthKey(call.startedAt) === tick.key)
      || monthKey(row.candidate.lastContactAt) === tick.key
    )).length
  })), [callsByCandidate, candidates, scored, ticks]);
  const trendMax = Math.max(1, ...trend.flatMap(item => [item.found, item.called]));
  const trendX = (index: number) => 44 + index * (680 / Math.max(1, trend.length - 1));
  const trendY = (value: number) => 156 - value / trendMax * 128;
  const trendLine = (key: 'found' | 'called') => trend.map((item, index) => `${trendX(index)},${trendY(item[key])}`).join(' ');
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
  const saveRules = async (event: React.FormEvent) => {
    event.preventDefault();
    if (currentUser.role !== 'admin') return;
    setRulesSaving(true);
    setRulesError('');
    try {
      const next = normalizeRules(rulesDraft);
      const payload = { id: RULE_DOCUMENT_ID, ...next, updatedAt: new Date().toISOString(), updatedById: currentUser.uid };
      if (rulesExist) await dbService.updateDocument('raw_data_priority_rules', RULE_DOCUMENT_ID, payload);
      else await dbService.addDocument('raw_data_priority_rules', payload);
      setRules(next);
      setRulesExist(true);
      setRulesOpen(false);
      setPage(1);
    } catch {
      setRulesError('Không lưu được cấu hình. Vui lòng kiểm tra kết nối hoặc quyền truy cập.');
    } finally {
      setRulesSaving(false);
    }
  };

  return <div className="raw-overview">
    {mode === 'priority' && <div className="raw-overview__actions"><button type="button" className="btn btn-outline" onClick={onOverview}>Quay lại Tổng quan</button></div>}
    {callsError && <p className="raw-overview__notice" role="alert">Chưa tải được lịch sử cuộc gọi; số đã gọi và vùng ưu tiên có thể chưa đầy đủ. Vui lòng tải lại trang.</p>}
    {mode === 'overview' ? <>
      <div className="raw-overview__dashboard">
        <section className="raw-overview__panel raw-overview__panel--general">
          <header><h2>Tình hình chung</h2><p>Số liệu dữ liệu thô và xu hướng trong 6 tháng</p></header>
          <div className="raw-overview__metrics">{metrics.map(([label, value], index) => <div key={label} className={`raw-overview__metric raw-overview__metric--${index + 1}`}><strong>{callsLoading && ['Đã gọi', 'Chưa gọi', 'Đã liên hệ được'].includes(label) ? '…' : formatNumber(value)}</strong><span>{label}</span></div>)}</div>
          <div className="raw-overview__subheading"><span>Xu hướng dữ liệu thô</span><div className="raw-overview__series-legend"><span>Dữ liệu mới</span><span>Đã gọi</span></div></div>
          <div className="raw-overview__line-chart" role="img" aria-label="Dữ liệu mới và hồ sơ đã gọi theo từng tháng trong sáu tháng gần đây">
            <svg viewBox="0 0 760 195" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(index => <g key={index}><line x1="44" x2="724" y1={28 + index * 32} y2={28 + index * 32} className="raw-overview__gridline" /><text x="34" y={32 + index * 32} textAnchor="end">{Math.round(trendMax * (4 - index) / 4)}</text></g>)}
              <polyline points={trendLine('found')} className="raw-overview__line raw-overview__line--found" />
              <polyline points={trendLine('called')} className="raw-overview__line raw-overview__line--called" />
              {trend.map((item, index) => <g key={item.key}><circle cx={trendX(index)} cy={trendY(item.found)} r="3.5" className="raw-overview__dot raw-overview__dot--found"><title>{item.label}: {item.found} dữ liệu mới</title></circle><circle cx={trendX(index)} cy={trendY(item.called)} r="3.5" className="raw-overview__dot raw-overview__dot--called"><title>{item.label}: {item.called} hồ sơ đã gọi</title></circle><text x={trendX(index)} y="183" textAnchor="middle">{item.label}</text></g>)}
            </svg>
          </div>
        </section>
        <section className="raw-overview__panel raw-overview__panel--priority"><header className="raw-overview__panel-header"><div><h2>Ưu tiên khai thác</h2><p>Nên gọi · Bổ sung thông tin · Xác minh trước khi gọi</p></div><button type="button" className="raw-overview__config-button" onClick={() => { setRulesDraft(rules); setRulesOpen(true); }}>Cấu hình ưu tiên</button></header><div className="raw-overview__priority-chart"><div className="raw-overview__donut" style={{ background: priorityRows.length ? donutBackground : '#e8edf5' }}><span><strong>{formatNumber(priorityRows.length)}</strong><small>hồ sơ</small></span></div><div className="raw-overview__priority-legend">{PRIORITY_GROUPS.map(key => <button key={key} type="button" onClick={() => { setGroup(key); setPage(1); onPriority(); }}><span className={`raw-overview__group raw-overview__group--${key}`}>{RAW_PRIORITY_LABELS[key]}</span><strong>{formatNumber(groupCounts[key])}</strong><i><b style={{ width: `${priorityRows.length ? groupCounts[key] / priorityRows.length * 100 : 0}%` }} /></i></button>)}</div></div><div className="raw-overview__priority-note"><span>Chọn một nhóm để xem hồ sơ và lý do xếp ưu tiên</span><button type="button" onClick={() => { setGroup('call_first'); onPriority(); }}>Xem bảng ưu tiên</button></div></section>
        <section className="raw-overview__panel raw-overview__panel--sale"><h2>Dữ liệu của Sale</h2><p>Dữ liệu thô do từng Sale tự tìm</p><div className="raw-overview__bars">{saleRows.length ? saleRows.map(row => <div key={row.id}><span title={row.name}>{row.name}</span><i><b style={{ width: `${row.count / saleMax * 100}%` }} /></i><strong>{formatNumber(row.count)}</strong></div>) : <p>Chưa có dữ liệu Sale tự tìm.</p>}</div></section>
        <section className="raw-overview__panel raw-overview__panel--province"><h2>Dữ liệu kiếm được theo tỉnh thành</h2><p>Phân bố dữ liệu thô theo địa bàn doanh nghiệp</p>{provinceRows.length ? <div className="raw-overview__province-scroll"><div className="raw-overview__province-chart" role="img" aria-label={provinceRows.map(row => `${row.label}: ${formatNumber(row.count)} hồ sơ`).join('; ')}>{provinceRows.map(row => <div className="raw-overview__province-column" key={row.label}><strong>{formatNumber(row.count)}</strong><i style={{ height: `${Math.max(3, row.count / provinceMax * 175)}px` }} /><span title={row.label}>{row.label}</span></div>)}</div></div> : <p className="raw-overview__empty">Chưa có dữ liệu để thống kê theo tỉnh thành.</p>}</section>
      </div>
    </> : <section className="raw-overview__priority-page"><h2>Ưu tiên khai thác dữ liệu</h2><p>Điểm được tính từ thông tin có sẵn; vùng ưu tiên không thay thế kết quả tư vấn thực tế.</p><div className="raw-overview__priority-tabs" role="tablist">{PRIORITY_GROUPS.map(key => <button key={key} type="button" role="tab" aria-selected={group === key} className={group === key ? 'is-active' : ''} onClick={() => { setGroup(key); setPage(1); }}>{RAW_PRIORITY_LABELS[key]} <strong>{formatNumber(groupCounts[key])}</strong></button>)}</div><div className="raw-overview__filters"><input aria-label="Tìm doanh nghiệp" placeholder="Tìm doanh nghiệp, MST, số điện thoại..." value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Lọc Sale tìm được" value={sale} onChange={event => { setSale(event.target.value); setPage(1); }}><option value="all">Tất cả Sale</option>{saleUsers.map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}</select><select aria-label="Lọc nguồn" value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="all">Tất cả nguồn</option>{sourceOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Lọc ngành nghề" value={sector} onChange={event => { setSector(event.target.value); setPage(1); }}><option value="all">Tất cả ngành nghề</option>{sectorOptions.map(value => <option key={value} value={value}>{value}</option>)}</select><button type="button" onClick={resetFilters}>Đặt lại</button></div><div className="raw-overview__table-wrap"><table><thead><tr><th>Doanh nghiệp</th><th>Sale tìm được</th><th>Điểm</th><th>Lý do xếp nhóm</th><th>Liên hệ</th><th>Thao tác</th></tr></thead><tbody>{visible.map(row => <tr key={row.candidate.id}><td title={row.candidate.companyName}><strong>{row.candidate.companyName}</strong></td><td>{row.candidate.discoveredByName || 'Chưa xác định'}</td><td><strong className={`raw-overview__group raw-overview__group--${group}`}>{row.score}</strong></td><td title={row.reasons.join('; ')}>{row.reasons.slice(0, 3).join(' · ')}</td><td>{row.candidate.phone || 'Chưa có số'}</td><td><button type="button" onClick={() => onOpenCandidate(row.candidate.id)}>Mở hồ sơ</button></td></tr>)}</tbody></table>{visible.length === 0 && <p className="raw-overview__empty">Không có hồ sơ phù hợp.</p>}</div><footer className="raw-overview__pagination"><span>Hiển thị {filtered.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, filtered.length)} / {formatNumber(filtered.length)}</span><div><button type="button" disabled={safePage === 1} onClick={() => setPage(page - 1)}>Trước</button><span>{safePage} / {totalPages}</span><button type="button" disabled={safePage === totalPages} onClick={() => setPage(page + 1)}>Sau</button></div></footer></section>}
    {rulesOpen && <div className="raw-overview__modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !rulesSaving) setRulesOpen(false); }}><form className="raw-overview__modal" onSubmit={saveRules} role="dialog" aria-modal="true" aria-labelledby="raw-rules-title"><header><h2 id="raw-rules-title">Cấu hình ưu tiên</h2><button type="button" onClick={() => setRulesOpen(false)} disabled={rulesSaving}>Đóng</button></header><p>Ngành và sản phẩm mục tiêu được ngăn cách bằng dấu phẩy. Mỗi hồ sơ vẫn hiển thị lý do xếp nhóm.</p><label>Ngành mục tiêu<input value={rulesDraft.targetIndustries} onChange={event => setRulesDraft(previous => ({ ...previous, targetIndustries: event.target.value }))} placeholder="Ví dụ: bao bì, thực phẩm" /></label><label>Sản phẩm mục tiêu<input value={rulesDraft.targetProducts} onChange={event => setRulesDraft(previous => ({ ...previous, targetProducts: event.target.value }))} placeholder="Ví dụ: tem nhãn, mực in" /></label><label>Điểm tối thiểu để gọi trước<input type="number" min="30" max="90" value={rulesDraft.callFirstThreshold} onChange={event => setRulesDraft(previous => ({ ...previous, callFirstThreshold: Number(event.target.value) }))} /></label>{rulesError && <p role="alert">{rulesError}</p>}<footer><button type="button" className="btn btn-outline" onClick={() => setRulesOpen(false)}>Hủy</button><button type="submit" className="btn btn-primary" disabled={rulesSaving}>{rulesSaving ? 'Đang lưu...' : 'Lưu cấu hình'}</button></footer></form></div>}
  </div>;
});
