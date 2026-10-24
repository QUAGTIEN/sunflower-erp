import React, { useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { PageContextHeader } from '@/components/PageContextHeader';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { AuditEvent, UserPresence } from '@/services/auditService';
import {
  SALES_ACTIVITY_ACTIONS,
  SALES_MODULE_LABELS,
  buildSalePerformance,
  getLeadBlockerLabel,
  getLeadCareDays,
  getSalesActionLabel,
  getSalesReportWindow,
  type SalePerformance,
  type SalesManagementModule,
  type SalesReportPeriod
} from '../model/salesManagement';
import './SalesManagementPage.css';

interface SalesManagementPageProps {
  users: UserProfile[];
  candidates: LeadCandidateRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  currentUser: UserProfile;
  onOpenRecord: (module: SalesManagementModule, id: string) => void;
}

const STATUS_LABELS = {
  active: 'Đang thao tác',
  idle: 'Tạm rảnh',
  offline: 'Chưa thao tác'
} as const;

const toDateInputValue = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

const formatShortDateTime = (value?: string, fallback = 'Chưa ghi nhận') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatTime = (value?: string) => {
  if (!value) return '--:--';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--:--'
    : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const getInitials = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

const auditModuleToPage = (module: AuditEvent['module']): SalesManagementModule | null =>
  module === 'lead_candidates' ? 'customer_data' : module === 'leads' || module === 'crm' ? module : null;

export const SalesManagementPage: React.FC<SalesManagementPageProps> = ({
  users,
  candidates,
  leads,
  customers,
  onOpenRecord
}) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [presences, setPresences] = useState<UserPresence[]>([]);
  const [referenceTime, setReferenceTime] = useState(() => Date.now());
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [period, setPeriod] = useState<SalesReportPeriod>('month');
  const [customStart, setCustomStart] = useState(() => toDateInputValue(new Date(Date.now() - 6 * 86_400_000)));
  const [customEnd, setCustomEnd] = useState(() => toDateInputValue(new Date()));
  const [moduleFilter, setModuleFilter] = useState<'all' | SalesManagementModule>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setReferenceTime(Date.now()), 60_000);
    const unsubscribeEvents = dbService.subscribeCollection(
      'audit_events',
      data => {
        setEvents(
          (data as AuditEvent[])
            .filter(event => event.category === 'business' && SALES_ACTIVITY_ACTIONS.has(event.action))
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        );
      },
      { orderByField: 'occurredAt', orderDirection: 'desc', maxResults: 1000 }
    );
    const unsubscribePresence = dbService.subscribeCollection(
      'user_presence',
      data => {
        setPresences(data as UserPresence[]);
      },
      { fieldName: 'role', fieldValue: 'sale' }
    );
    return () => {
      window.clearInterval(timer);
      unsubscribeEvents();
      unsubscribePresence();
    };
  }, []);

  const windowRange = useMemo(
    () => getSalesReportWindow(period, referenceTime, customStart, customEnd),
    [customEnd, customStart, period, referenceTime]
  );
  const saleUsers = useMemo(() => users.filter(user => user.role === 'sale' && user.active !== false), [users]);
  const performances = useMemo(
    () =>
      saleUsers
        .map(sale =>
          buildSalePerformance({
            sale,
            candidates,
            leads,
            customers,
            events,
            presence: presences.find(item => item.userId === sale.uid),
            window: windowRange,
            referenceTime
          })
        )
        .sort((left, right) => {
          const order = { active: 0, idle: 1, offline: 2 } as const;
          return (
            order[left.status] - order[right.status] ||
            left.sale.displayName.localeCompare(right.sale.displayName, 'vi-VN')
          );
        }),
    [candidates, customers, events, leads, presences, referenceTime, saleUsers, windowRange]
  );
  const selectedPerformance = performances.find(item => item.sale.uid === selectedSaleId) || null;

  const filteredPerformances = performances.filter(item =>
    item.sale.displayName.toLocaleLowerCase('vi-VN').includes(searchTerm.trim().toLocaleLowerCase('vi-VN'))
  );
  const teamTotals = useMemo(
    () => ({
      found: performances.reduce((sum, item) => sum + item.foundCandidates.length, 0),
      processed: performances.reduce((sum, item) => sum + item.processedCount, 0),
      convertedLeads: performances.reduce((sum, item) => sum + item.convertedLeadCount, 0),
      convertedCustomers: performances.reduce((sum, item) => sum + item.convertedCustomerCount, 0),
      assignedCandidates: performances.reduce((sum, item) => sum + item.assignedCandidates.length, 0),
      assignedLeads: performances.reduce((sum, item) => sum + item.assignedLeads.length, 0),
      assignedCustomers: performances.reduce((sum, item) => sum + item.assignedCustomers.length, 0),
      overdue: performances.reduce((sum, item) => sum + item.overdueCount, 0)
    }),
    [performances]
  );

  const selectModuleEvents = (performance: SalePerformance) =>
    performance.events.filter(event => {
      const page = auditModuleToPage(event.module);
      return page && (moduleFilter === 'all' || page === moduleFilter);
    });

  const detailEvents = selectedPerformance ? selectModuleEvents(selectedPerformance).slice(0, 20) : [];
  const todayKey = new Date(referenceTime).toLocaleDateString('vi-VN');
  const selectedTodayEvents = selectedPerformance
    ? events.filter(
        event =>
          event.actorId === selectedPerformance.sale.uid &&
          new Date(event.occurredAt).toLocaleDateString('vi-VN') === todayKey &&
          Boolean(auditModuleToPage(event.module))
      )
    : [];
  const todayCalls = selectedTodayEvents.filter(event =>
    ['candidate_phone_called', 'phone_call_started', 'phone_call_confirmed', 'phone_call_manual_recorded'].includes(
      event.action
    )
  ).length;
  const todaySchedules = selectedTodayEvents.filter(event =>
    ['follow_up_scheduled', 'lead_follow_up_scheduled'].includes(event.action)
  ).length;
  const todayProcessed = new Set(
    selectedTodayEvents.map(event => `${event.module}:${event.targetId || event.targetLabel || event.id}`)
  ).size;
  const stalledLeads = selectedPerformance
    ? selectedPerformance.assignedLeads
        .map(lead => ({ lead, careDays: getLeadCareDays(lead, referenceTime) }))
        .sort((left, right) => right.careDays - left.careDays)
    : [];
  const attentionCount = stalledLeads.filter(
    item =>
      item.careDays >= 14 ||
      (item.lead.nextFollowUpAt &&
        !item.lead.followUpHandledAt &&
        new Date(item.lead.nextFollowUpAt).getTime() < referenceTime)
  ).length;

  const openAuditTarget = (event: AuditEvent) => {
    const module = auditModuleToPage(event.module);
    if (module && event.targetId) onOpenRecord(module, event.targetId);
  };

  return (
    <div className="sales-management-page">
      <PageContextHeader section="Quản lý Sale" current={selectedPerformance?.sale.displayName || 'Tổng quan'} />

      <header className={`sales-management-toolbar${selectedPerformance ? ' is-detail' : ''}`}>
        <div className="sales-management-title">
          {selectedPerformance && (
            <button type="button" className="sales-management-back" onClick={() => setSelectedSaleId('')}>
              <span aria-hidden="true">←</span> Danh sách Sale
            </button>
          )}
          {selectedPerformance ? (
            <>
              <div className="sales-management-identity">
                <h1>{selectedPerformance.sale.displayName}</h1>
              </div>
              <div className="sales-management-current-action">
                <Clock3 size={19} aria-hidden="true" />
                <div>
                  <span>Hoạt động gần nhất</span>
                  <strong>
                    {selectedPerformance.latestEvent
                      ? `${getSalesActionLabel(selectedPerformance.latestEvent)} · ${formatShortDateTime(selectedPerformance.latestEvent.occurredAt)}`
                      : 'Chưa ghi nhận'}
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <h1>Tổng quan đội Sale</h1>
          )}
        </div>
        <div className="sales-management-filters">
          <select
            value={period}
            onChange={event => setPeriod(event.target.value as SalesReportPeriod)}
            aria-label="Kỳ báo cáo"
          >
            <option value="week">Tuần này</option>
            <option value="month">Tháng này</option>
            <option value="quarter">Quý này</option>
            <option value="custom">Khoảng ngày</option>
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={event => setCustomStart(event.target.value)}
                aria-label="Từ ngày"
              />
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={event => setCustomEnd(event.target.value)}
                aria-label="Đến ngày"
              />
            </>
          )}
          <select
            value={moduleFilter}
            onChange={event => setModuleFilter(event.target.value as 'all' | SalesManagementModule)}
            aria-label="Phân hệ"
          >
            <option value="all">Tất cả phân hệ</option>
            <option value="customer_data">Dữ liệu thô</option>
            <option value="leads">Tiềm năng</option>
            <option value="crm">Khách hàng</option>
          </select>
        </div>
      </header>

      {!windowRange && <div className="sales-management-notice is-error">Khoảng thời gian báo cáo không hợp lệ.</div>}

      {!selectedPerformance ? (
        <>
          <section className="sales-management-kpis" aria-label="Chỉ số đội Sale">
            <article>
              <span>Tổng Sale</span>
              <strong>{performances.length} người</strong>
              <small>Tài khoản Sale đang hoạt động</small>
            </article>
            <article>
              <span>Đang thao tác</span>
              <strong>{performances.filter(item => item.status === 'active').length} người</strong>
              <small>Có hoạt động trong 10 phút gần nhất</small>
            </article>
            <article>
              <span>Tạm rảnh</span>
              <strong>{performances.filter(item => item.status === 'idle').length} người</strong>
              <small>Không thao tác từ 10 đến 30 phút</small>
            </article>
            <article>
              <span>Chưa thao tác</span>
              <strong>{performances.filter(item => item.status === 'offline').length} người</strong>
              <small>Quá 30 phút chưa có hoạt động</small>
            </article>
            <article>
              <span>Dữ liệu thô phụ trách</span>
              <strong>{teamTotals.assignedCandidates} hồ sơ</strong>
              <small>Hồ sơ đang được phân công</small>
            </article>
            <article>
              <span>Tiềm năng đang chăm sóc</span>
              <strong>{teamTotals.assignedLeads} Lead</strong>
              <small>Cơ hội chưa chuyển đổi</small>
            </article>
            <article>
              <span>Khách hàng quản lý</span>
              <strong>{teamTotals.assignedCustomers} khách hàng</strong>
              <small>Hồ sơ khách hàng chính thức</small>
            </article>
            <article className="is-warning">
              <span>Lịch chăm sóc quá hạn</span>
              <strong>{teamTotals.overdue} lịch</strong>
              <small>Cần xử lý trong ngày</small>
            </article>
          </section>

          <section className="sales-management-analysis-grid">
            <article className="sales-management-card">
              <header>
                <h2>Phễu hiệu suất toàn đội</h2>
                <span>{windowRange?.label}</span>
              </header>
              <div className="sales-management-funnel">
                <div>
                  <span>Dữ liệu tự tìm</span>
                  <strong>{teamTotals.found}</strong>
                </div>
                <div>
                  <span>Đã xử lý</span>
                  <strong>{teamTotals.processed}</strong>
                  <small>{teamTotals.found ? Math.round((teamTotals.processed / teamTotals.found) * 100) : 0}%</small>
                </div>
                <div>
                  <span>Chuyển Tiềm năng</span>
                  <strong>{teamTotals.convertedLeads}</strong>
                  <small>
                    {teamTotals.processed ? Math.round((teamTotals.convertedLeads / teamTotals.processed) * 100) : 0}%
                  </small>
                </div>
                <div>
                  <span>Chuyển Khách hàng</span>
                  <strong>{teamTotals.convertedCustomers}</strong>
                  <small>
                    {teamTotals.convertedLeads
                      ? Math.round((teamTotals.convertedCustomers / teamTotals.convertedLeads) * 100)
                      : 0}
                    %
                  </small>
                </div>
              </div>
            </article>
            <article className="sales-management-card">
              <header>
                <h2>Khối lượng theo phân hệ</h2>
                <span>Hồ sơ đang phụ trách</span>
              </header>
              <div className="sales-management-bars">
                {[
                  ['Dữ liệu thô', teamTotals.assignedCandidates, '#2f6ee5'],
                  ['Tiềm năng', teamTotals.assignedLeads, '#159cb5'],
                  ['Khách hàng', teamTotals.assignedCustomers, '#7358d8']
                ].map(([label, value, color]) => {
                  const numericValue = Number(value);
                  const maximum = Math.max(
                    teamTotals.assignedCandidates,
                    teamTotals.assignedLeads,
                    teamTotals.assignedCustomers,
                    1
                  );
                  return (
                    <div key={String(label)}>
                      <span>{label}</span>
                      <i>
                        <b
                          style={{
                            width: `${Math.max(3, (numericValue / maximum) * 100)}%`,
                            background: String(color)
                          }}
                        />
                      </i>
                      <strong>{numericValue}</strong>
                    </div>
                  );
                })}
              </div>
            </article>
          </section>

          <section className="sales-management-card sales-management-list">
            <header>
              <h2>Danh sách Sale</h2>
              <label>
                <span>Tìm nhân viên</span>
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Nhập tên Sale..."
                />
              </label>
            </header>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Sale</th>
                    <th>Trạng thái</th>
                    <th>Dữ liệu thô</th>
                    <th>Tiềm năng</th>
                    <th>Khách hàng</th>
                    <th>Cuộc gọi</th>
                    <th>Lịch hẹn</th>
                    <th>Quá hạn</th>
                    <th>Thao tác gần nhất</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPerformances.map(item => (
                    <tr key={item.sale.uid}>
                      <td>
                        <button
                          type="button"
                          className="sales-management-person"
                          onClick={() => setSelectedSaleId(item.sale.uid)}
                        >
                          <span>{getInitials(item.sale.displayName)}</span>
                          <strong>{item.sale.displayName}</strong>
                        </button>
                      </td>
                      <td>
                        <span className={`sales-management-status is-${item.status}`}>
                          <i />
                          {STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="is-number">{item.assignedCandidates.length}</td>
                      <td className="is-number">{item.assignedLeads.length}</td>
                      <td className="is-number">{item.assignedCustomers.length}</td>
                      <td className="is-number">{item.callCount}</td>
                      <td className="is-number">{item.scheduleCount}</td>
                      <td className={`is-number ${item.overdueCount ? 'is-overdue' : ''}`}>{item.overdueCount}</td>
                      <td title={item.latestEvent?.summary}>
                        {item.latestEvent
                          ? `${formatTime(item.latestEvent.occurredAt)} · ${getSalesActionLabel(item.latestEvent)}`
                          : 'Chưa ghi nhận'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="sales-management-link"
                          onClick={() => setSelectedSaleId(item.sale.uid)}
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredPerformances.length === 0 && (
                    <tr>
                      <td colSpan={10} className="sales-management-empty">
                        Không tìm thấy Sale phù hợp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="sales-management-kpis is-detail" aria-label="Chỉ số Sale">
            <article>
              <span>Dữ liệu tự tìm</span>
              <strong>{selectedPerformance.foundCandidates.length} hồ sơ</strong>
              <small>Được ghi nhận trong kỳ</small>
            </article>
            <article>
              <span>Dữ liệu được giao</span>
              <strong>{selectedPerformance.assignedCandidates.length} hồ sơ</strong>
              <small>Đang phụ trách</small>
            </article>
            <article>
              <span>Đã xử lý</span>
              <strong>{selectedPerformance.processedCount} hồ sơ</strong>
              <small>Có thao tác nghiệp vụ</small>
            </article>
            <article>
              <span>Chuyển Tiềm năng</span>
              <strong>{selectedPerformance.convertedLeadCount} Lead</strong>
              <small>Trong kỳ đang chọn</small>
            </article>
            <article>
              <span>Chuyển Khách hàng</span>
              <strong>{selectedPerformance.convertedCustomerCount} khách</strong>
              <small>Trong kỳ đang chọn</small>
            </article>
            <article className="is-warning">
              <span>Lịch quá hạn</span>
              <strong>{selectedPerformance.overdueCount} lịch</strong>
              <small>Cần xử lý ngay</small>
            </article>
          </section>

          <section className="sales-management-analysis-grid is-detail">
            <article className="sales-management-card">
              <header>
                <h2>Phễu chuyển đổi cá nhân</h2>
                <span>{windowRange?.label}</span>
              </header>
              <div className="sales-management-funnel">
                <div>
                  <span>Dữ liệu tự tìm</span>
                  <strong>{selectedPerformance.foundCandidates.length}</strong>
                </div>
                <div>
                  <span>Đã xử lý</span>
                  <strong>{selectedPerformance.processedCount}</strong>
                  <small>
                    {selectedPerformance.foundCandidates.length
                      ? Math.round(
                          (selectedPerformance.processedCount / selectedPerformance.foundCandidates.length) * 100
                        )
                      : 0}
                    %
                  </small>
                </div>
                <div>
                  <span>Tiềm năng</span>
                  <strong>{selectedPerformance.convertedLeadCount}</strong>
                  <small>
                    {selectedPerformance.processedCount
                      ? Math.round((selectedPerformance.convertedLeadCount / selectedPerformance.processedCount) * 100)
                      : 0}
                    %
                  </small>
                </div>
                <div>
                  <span>Khách hàng</span>
                  <strong>{selectedPerformance.convertedCustomerCount}</strong>
                  <small>
                    {selectedPerformance.convertedLeadCount
                      ? Math.round(
                          (selectedPerformance.convertedCustomerCount / selectedPerformance.convertedLeadCount) * 100
                        )
                      : 0}
                    %
                  </small>
                </div>
              </div>
            </article>
            <article className="sales-management-card">
              <header>
                <h2>Trạng thái làm việc hôm nay</h2>
                <span className={`sales-management-status is-${selectedPerformance.status}`}>
                  <i />
                  {STATUS_LABELS[selectedPerformance.status]}
                </span>
              </header>
              <div className="sales-management-work-metrics">
                <span>
                  <strong>{selectedTodayEvents.length}</strong> thao tác
                </span>
                <span>
                  <strong>{todayCalls}</strong> cuộc gọi
                </span>
                <span>
                  <strong>{todaySchedules}</strong> lịch hẹn
                </span>
                <span>
                  <strong>{todayProcessed}</strong> hồ sơ xử lý
                </span>
              </div>
              <div className="sales-management-dayline" aria-label="Phân bố hoạt động trong ngày">
                {Array.from({ length: 10 }, (_, index) => {
                  const hour = index + 8;
                  const count = selectedTodayEvents.filter(
                    event => new Date(event.occurredAt).getHours() === hour
                  ).length;
                  return (
                    <span key={hour}>
                      <i style={{ height: `${Math.max(8, Math.min(100, count * 18))}%` }} />
                      <small>{String(hour).padStart(2, '0')}:00</small>
                    </span>
                  );
                })}
              </div>
              <p className="sales-management-latest">
                Thao tác gần nhất:{' '}
                <strong>
                  {selectedPerformance.latestEvent
                    ? `${getSalesActionLabel(selectedPerformance.latestEvent)} ${selectedPerformance.latestEvent.targetLabel || ''}`
                    : 'Chưa ghi nhận'}
                </strong>
              </p>
            </article>
          </section>

          <section className="sales-management-detail-grid">
            <article className="sales-management-card sales-management-activity">
              <header>
                <h2>Nhật ký hoạt động</h2>
                <div className="sales-management-module-tabs">
                  {(['all', 'customer_data', 'leads', 'crm'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      className={moduleFilter === value ? 'is-active' : ''}
                      onClick={() => setModuleFilter(value)}
                    >
                      {value === 'all' ? 'Tất cả' : SALES_MODULE_LABELS[value]}
                    </button>
                  ))}
                </div>
              </header>
              <div className="sales-management-activity-list">
                {detailEvents.map(event => {
                  const module = auditModuleToPage(event.module);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => openAuditTarget(event)}
                      disabled={!module || !event.targetId}
                    >
                      <time>
                        {formatTime(event.occurredAt)}
                        <small>
                          {new Date(event.occurredAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                        </small>
                      </time>
                      <span className={`is-${module}`}>{module ? SALES_MODULE_LABELS[module] : 'Hệ thống'}</span>
                      <strong title={event.targetLabel}>{event.targetLabel || 'Không có tên hồ sơ'}</strong>
                      <em title={event.summary}>{getSalesActionLabel(event)}</em>
                    </button>
                  );
                })}
                {detailEvents.length === 0 && (
                  <p className="sales-management-empty">Không có thao tác trong bộ lọc này.</p>
                )}
              </div>
            </article>

            <article className="sales-management-card sales-management-stalled">
              <header>
                <h2>Cơ hội chưa chốt</h2>
                <span className="sales-management-attention">{attentionCount} hồ sơ cần chú ý</span>
              </header>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Khách hàng</th>
                      <th>Đã chăm sóc</th>
                      <th>Lý do chưa chốt</th>
                      <th>Liên hệ cuối</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stalledLeads.slice(0, 8).map(({ lead, careDays }) => (
                      <tr key={lead.id} onClick={() => onOpenRecord('leads', lead.id)}>
                        <td>
                          <strong title={lead.companyName}>{lead.companyName}</strong>
                        </td>
                        <td className={careDays >= 14 ? 'is-overdue' : ''}>{careDays} ngày</td>
                        <td title={getLeadBlockerLabel(lead)}>{getLeadBlockerLabel(lead)}</td>
                        <td>{formatShortDateTime(lead.lastFollowUpAt || lead.updatedAt, 'Chưa liên hệ')}</td>
                      </tr>
                    ))}
                    {stalledLeads.length === 0 && (
                      <tr>
                        <td colSpan={4} className="sales-management-empty">
                          Sale này chưa có cơ hội đang chăm sóc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </>
      )}
    </div>
  );
};
