import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CircleDollarSign,
  Database,
  ExternalLink,
  MapPinned,
  Search,
  Target,
  UserRoundCheck,
  UsersRound
} from 'lucide-react';
import type { CustomerRecord, LeadRecord } from '../domain/crmModels';
import type { LeadCandidateRecord } from '../domain/leadCandidateModels';
import type { CompatiblePORecord } from '../domain/poCompatibility';
import {
  projectVietnamCoordinate,
  VIETNAM_MAP_PATHS,
  VIETNAM_MAP_VIEW_BOX
} from '../data/vietnamMapGeometry';
import type { UserProfile } from '../services/firebaseService';
import { dbService } from '../services/firebaseService';
import {
  buildCommercialMapRecords,
  COMMERCIAL_MAP_POINTS,
  filterCommercialMapRecords,
  summarizeCommercialProvinces,
  type CommercialMapLayer,
  type CommercialMapRecord
} from '../domain/commercialMapModels';
import './CommercialMap.css';

interface CommercialMapProps {
  customers: CustomerRecord[];
  leads: LeadRecord[];
  orders: CompatiblePORecord[];
  users: UserProfile[];
  currentUser: UserProfile;
  onNavigateToCrm: () => void;
  onNavigateToLeads: () => void;
}

const LAYERS: Array<{ id: CommercialMapLayer; label: string; color: string }> = [
  { id: 'all', label: 'Tất cả dữ liệu nội bộ', color: '#1d4ed8' },
  { id: 'customers', label: 'Khách hàng CRM', color: '#059669' },
  { id: 'leads', label: 'Khách hàng tiềm năng', color: '#7c3aed' },
  { id: 'processing', label: 'Sale đang xử lý', color: '#ea580c' },
  { id: 'unassigned', label: 'Chưa phân công', color: '#64748b' }
];

const RECORD_TYPE_LABELS: Record<CommercialMapRecord['type'], string> = {
  customer: 'Khách hàng CRM',
  lead: 'Lead',
  candidate: 'Dữ liệu khách hàng'
};

const formatCurrency = (value: number): string => value > 0
  ? `${value.toLocaleString('vi-VN')} đ`
  : '—';

const formatShortDate = (value: string): string => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('vi-VN') : '—';
};

export const CommercialMap: React.FC<CommercialMapProps> = ({
  customers,
  leads,
  orders,
  users,
  currentUser,
  onNavigateToCrm,
  onNavigateToLeads
}) => {
  const [candidates, setCandidates] = useState<LeadCandidateRecord[]>([]);
  const [activeLayer, setActiveLayer] = useState<CommercialMapLayer>('all');
  const [selectedProvinceId, setSelectedProvinceId] = useState('');
  const [saleFilter, setSaleFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => dbService.subscribeCollection('lead_candidates', data => {
    setCandidates(data as LeadCandidateRecord[]);
  }), []);

  const allRecords = useMemo(() => buildCommercialMapRecords({
    customers,
    leads,
    candidates,
    orders,
    users
  }), [candidates, customers, leads, orders, users]);

  const accessibleRecords = useMemo(() => currentUser.role === 'admin'
    ? allRecords
    : allRecords.filter(record => record.assignedSaleId === currentUser.uid), [allRecords, currentUser]);

  const layerRecords = useMemo(
    () => filterCommercialMapRecords(accessibleRecords, activeLayer),
    [accessibleRecords, activeLayer]
  );

  const provinceSummaries = useMemo(
    () => summarizeCommercialProvinces(layerRecords),
    [layerRecords]
  );
  const summaryByProvince = useMemo(
    () => new Map(provinceSummaries.map(summary => [summary.provinceId, summary])),
    [provinceSummaries]
  );
  const maximumProvinceTotal = Math.max(...provinceSummaries.map(summary => summary.total), 1);

  const selectedProvince = selectedProvinceId
    ? summaryByProvince.get(selectedProvinceId)
    : undefined;

  const visibleRecords = useMemo(() => {
    const keyword = searchTerm.trim().toLocaleLowerCase('vi-VN');
    return layerRecords.filter(record => {
      if (selectedProvinceId && record.provinceId !== selectedProvinceId) return false;
      if (saleFilter !== 'all' && record.assignedSaleId !== saleFilter) return false;
      if (!keyword) return true;
      return [record.companyName, record.taxCode, record.address, record.contactPerson, record.phone]
        .join(' ')
        .toLocaleLowerCase('vi-VN')
        .includes(keyword);
    });
  }, [layerRecords, saleFilter, searchTerm, selectedProvinceId]);

  const totals = useMemo(() => ({
    total: layerRecords.length,
    customers: layerRecords.filter(record => record.type === 'customer').length,
    leads: layerRecords.filter(record => record.type === 'lead').length,
    processing: layerRecords.filter(record => record.statusLabel === 'Đang được Sale xử lý').length,
    revenue: layerRecords.reduce((sum, record) => sum + record.revenue, 0),
    provinces: new Set(layerRecords.filter(record => record.provinceId !== 'unknown').map(record => record.provinceId)).size
  }), [layerRecords]);

  const conversionBase = totals.customers + totals.leads;
  const conversionRate = conversionBase > 0 ? Math.round((totals.customers / conversionBase) * 100) : 0;
  const activeLayerDefinition = LAYERS.find(layer => layer.id === activeLayer) || LAYERS[0];

  const openRecord = (record: CommercialMapRecord) => {
    if (record.type === 'customer') onNavigateToCrm();
    else onNavigateToLeads();
  };

  return (
    <div className="commercial-map-view">
      <header className="commercial-map-header">
        <div>
          <div className="commercial-map-heading"><MapPinned size={22} /><h1>BẢN ĐỒ THƯƠNG MẠI</h1></div>
          <p>Phân tích độ phủ khách hàng, Lead và công việc Sale theo tỉnh/thành từ dữ liệu nội bộ Sunflower.</p>
        </div>
        <span className="commercial-map-source"><Database size={14} /> Chỉ sử dụng dữ liệu nội bộ</span>
      </header>

      <section className="commercial-map-kpis">
        <article><span><Building2 size={17} /> Doanh nghiệp</span><strong>{totals.total}</strong><small>Trong lớp đang chọn</small></article>
        <article><span><UserRoundCheck size={17} /> Khách hàng CRM</span><strong>{totals.customers}</strong><small>{conversionRate}% trên CRM + Lead</small></article>
        <article><span><Target size={17} /> Lead</span><strong>{totals.leads}</strong><small>Đang trong quy trình bán hàng</small></article>
        <article><span><UsersRound size={17} /> Sale đang xử lý</span><strong>{totals.processing}</strong><small>Đã có trong hàng công việc</small></article>
        <article><span><CircleDollarSign size={17} /> Doanh thu PO</span><strong>{formatCurrency(totals.revenue)}</strong><small>Tổng dữ liệu đang hiển thị</small></article>
        <article><span><MapPinned size={17} /> Địa bàn có dữ liệu</span><strong>{totals.provinces}</strong><small>Tỉnh/thành đã xác định</small></article>
      </section>

      <section className="commercial-map-workspace">
        <aside className="commercial-map-sidebar">
          <div className="commercial-map-panel-title">
            <strong>Lớp dữ liệu</strong>
            <span>Chọn một lớp để phủ lên bản đồ.</span>
          </div>
          <div className="commercial-map-layer-list">
            {LAYERS.map(layer => (
              <button
                key={layer.id}
                type="button"
                className={activeLayer === layer.id ? 'active' : ''}
                onClick={() => {
                  setActiveLayer(layer.id);
                  setSelectedProvinceId('');
                }}
              >
                <i style={{ backgroundColor: layer.color }} />
                <span>{layer.label}</span>
                <b>{filterCommercialMapRecords(accessibleRecords, layer.id).length}</b>
              </button>
            ))}
          </div>

          <div className="commercial-map-top-regions">
            <div className="commercial-map-panel-title"><strong>Địa bàn nổi bật</strong><span>Xếp theo số doanh nghiệp.</span></div>
            {provinceSummaries.slice(0, 7).map((province, index) => (
              <button key={province.provinceId} type="button" onClick={() => setSelectedProvinceId(province.provinceId)}>
                <b>{index + 1}</b><span>{province.provinceName}</span><strong>{province.total}</strong>
              </button>
            ))}
            {provinceSummaries.length === 0 && <p className="commercial-map-muted">Chưa có dữ liệu phù hợp.</p>}
          </div>
        </aside>

        <div className="commercial-map-canvas-card">
          <div className="commercial-map-canvas-header">
            <div><strong>{selectedProvince?.provinceName || 'Toàn quốc'}</strong><span>{activeLayerDefinition.label}</span></div>
            {selectedProvinceId && <button type="button" className="btn btn-sm btn-outline" onClick={() => setSelectedProvinceId('')}>Xem toàn quốc</button>}
          </div>
          <div className="commercial-map-canvas">
            <svg viewBox={VIETNAM_MAP_VIEW_BOX} role="img" aria-label="Bản đồ thương mại Việt Nam theo tỉnh thành">
              <defs>
                <linearGradient id="commercial-map-land" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#eff6ff" />
                  <stop offset="100%" stopColor="#dbeafe" />
                </linearGradient>
                <filter id="commercial-map-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0f2f74" floodOpacity="0.15" />
                </filter>
              </defs>
              <g className="commercial-map-country" filter="url(#commercial-map-shadow)">
                {VIETNAM_MAP_PATHS.map((path, index) => (
                  <path
                    key={index}
                    className="commercial-map-silhouette"
                    d={path}
                    fill="url(#commercial-map-land)"
                  />
                ))}
              </g>
              <g className="commercial-map-archipelago" aria-hidden="true">
                <path d="M341 315 l8 -3 l-2 9 z M352 337 l6 -2 l-1 7 z M335 355 l5 -2 l-1 6 z" />
                <text x="326" y="302">Hoàng Sa</text>
                <path d="M320 493 l6 -2 l-1 7 z M338 517 l7 -2 l-2 8 z M315 542 l5 -2 l-1 6 z" />
                <text x="299" y="480">Trường Sa</text>
              </g>
              {COMMERCIAL_MAP_POINTS.map(point => {
                const summary = summaryByProvince.get(point.provinceId);
                const coordinate = projectVietnamCoordinate(point.longitude, point.latitude);
                const count = summary?.total || 0;
                const intensity = count > 0 ? 0.35 + (count / maximumProvinceTotal) * 0.65 : 0.12;
                const selected = selectedProvinceId === point.provinceId;
                const radius = count > 0 ? 6 + Math.min(12, Math.sqrt(count) * 3) : 4;
                return (
                  <g
                    key={point.provinceId}
                    className={`commercial-map-point ${selected ? 'selected' : ''}`}
                    onClick={() => setSelectedProvinceId(point.provinceId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedProvinceId(point.provinceId);
                    }}
                  >
                    <circle cx={coordinate.x} cy={coordinate.y} r={radius + (selected ? 5 : 0)} fill={activeLayerDefinition.color} opacity={selected ? 0.18 : 0.08} />
                    <circle cx={coordinate.x} cy={coordinate.y} r={radius} fill={activeLayerDefinition.color} opacity={intensity} stroke="#fff" strokeWidth={selected ? 3 : 1.5} />
                    {count > 0 && <text x={coordinate.x} y={coordinate.y + 3.5} textAnchor="middle">{count}</text>}
                    <title>{summary ? `${summary.provinceName}: ${count} doanh nghiệp` : 'Chưa có dữ liệu'}</title>
                  </g>
                );
              })}
            </svg>
            <div className="commercial-map-legend"><span>Ít</span><i /><i /><i /><i /><span>Nhiều</span></div>
          </div>
        </div>

        <aside className="commercial-map-insight">
          <div className="commercial-map-panel-title"><strong>Phân tích địa bàn</strong><span>{selectedProvince?.provinceName || 'Toàn quốc'}</span></div>
          <dl>
            <div><dt>Tổng doanh nghiệp</dt><dd>{selectedProvince?.total ?? totals.total}</dd></div>
            <div><dt>Khách hàng CRM</dt><dd>{selectedProvince?.customers ?? totals.customers}</dd></div>
            <div><dt>Lead</dt><dd>{selectedProvince?.leads ?? totals.leads}</dd></div>
            <div><dt>Dữ liệu tìm kiếm</dt><dd>{selectedProvince?.candidates ?? layerRecords.filter(record => record.type === 'candidate').length}</dd></div>
            <div><dt>Chưa phân công</dt><dd>{selectedProvince?.unassigned ?? layerRecords.filter(record => !record.assignedSaleId).length}</dd></div>
            <div><dt>Số PO</dt><dd>{selectedProvince?.orderCount ?? layerRecords.reduce((sum, record) => sum + record.orderCount, 0)}</dd></div>
            <div><dt>Doanh thu</dt><dd>{formatCurrency(selectedProvince?.revenue ?? totals.revenue)}</dd></div>
          </dl>
          <div className="commercial-map-note">
            <strong>Chất lượng dữ liệu địa bàn</strong>
            <p>{summaryByProvince.get('unknown')?.total || 0} doanh nghiệp chưa xác định được tỉnh/thành và cần bổ sung địa chỉ chuẩn.</p>
          </div>
        </aside>
      </section>

      <section className="commercial-map-records">
        <header>
          <div><strong>Doanh nghiệp {selectedProvince ? `tại ${selectedProvince.provinceName}` : 'trên toàn quốc'}</strong><span>{visibleRecords.length} kết quả</span></div>
          <div className="commercial-map-record-filters">
            <label><Search size={15} /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm doanh nghiệp, MST, liên hệ..." /></label>
            {currentUser.role === 'admin' && (
              <select value={saleFilter} onChange={event => setSaleFilter(event.target.value)}>
                <option value="all">Tất cả Sale</option>
                {users.filter(user => user.role === 'sale').map(user => <option key={user.uid} value={user.uid}>{user.displayName}</option>)}
              </select>
            )}
          </div>
        </header>
        <div className="commercial-map-table-wrap">
          <table>
            <thead><tr><th>Doanh nghiệp</th><th>Địa bàn</th><th>Phân loại</th><th>Sale phụ trách</th><th>Trạng thái</th><th>Tiềm năng/Hạng</th><th>Doanh thu</th><th>Cập nhật</th><th /></tr></thead>
            <tbody>
              {visibleRecords.slice(0, 100).map(record => (
                <tr key={record.key}>
                  <td><strong title={record.companyName}>{record.companyName}</strong><span>{record.taxCode || record.phone || 'Chưa có MST/SĐT'}</span></td>
                  <td><strong>{record.provinceName}</strong><span title={record.address}>{record.address || 'Chưa có địa chỉ'}</span></td>
                  <td><span className={`commercial-map-type commercial-map-type--${record.type}`}>{RECORD_TYPE_LABELS[record.type]}</span></td>
                  <td>{record.assignedSaleName}</td>
                  <td>{record.statusLabel}</td>
                  <td>{record.potentialLabel}</td>
                  <td>{formatCurrency(record.revenue)}</td>
                  <td>{formatShortDate(record.lastActivityAt)}</td>
                  <td><button type="button" className="btn btn-sm btn-outline btn-symbol-sm" onClick={() => openRecord(record)} title="Mở phân hệ"><ExternalLink size={14} /></button></td>
                </tr>
              ))}
              {visibleRecords.length === 0 && <tr><td colSpan={9} className="commercial-map-empty">Chưa có doanh nghiệp phù hợp với điều kiện đang chọn.</td></tr>}
            </tbody>
          </table>
        </div>
        {visibleRecords.length > 100 && <p className="commercial-map-limit-note">Đang hiển thị 100 doanh nghiệp đầu tiên. Hãy chọn tỉnh hoặc dùng tìm kiếm để thu hẹp kết quả.</p>}
      </section>
    </div>
  );
};
