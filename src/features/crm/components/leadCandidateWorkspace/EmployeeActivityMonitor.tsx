import React from 'react';
import {
  getEmployeeActionLabel,
  formatShortDateTime,
  type SalesReportPeriod,
  toDateInputValue,
  type EmployeeActivityRange,
  type EmployeeActivityGroup,
  formatActivityTime,
  type SalesReportWindow,
  type EmployeeActivityCard,
  type SalesReportSummary
} from './leadCandidateWorkspaceConfig';
import { X } from 'lucide-react';

import type { AuditEvent } from '@/services/auditService';

interface EmployeeActivityMonitorProps {
  employeeCards: EmployeeActivityCard[];
  selectedManagedSaleId: string;
  setSelectedManagedSaleId: React.Dispatch<React.SetStateAction<string>>;
  selectedEmployeeCard: EmployeeActivityCard | null;
  salesReportWindow: SalesReportWindow | null;
  salesReportPeriod: SalesReportPeriod;
  setSalesReportPeriod: React.Dispatch<React.SetStateAction<SalesReportPeriod>>;
  salesReportStart: string;
  salesReportEnd: string;
  setSalesReportStart: React.Dispatch<React.SetStateAction<string>>;
  referenceTime: number;
  setSalesReportEnd: React.Dispatch<React.SetStateAction<string>>;
  salesReportLoading: boolean;
  salesReportError: string;
  selectedSalesReport: SalesReportSummary | null;
  employeeActivityRange: EmployeeActivityRange;
  setEmployeeActivityRange: React.Dispatch<React.SetStateAction<EmployeeActivityRange>>;
  employeeActivityGroup: EmployeeActivityGroup;
  setEmployeeActivityGroup: React.Dispatch<React.SetStateAction<EmployeeActivityGroup>>;
  selectedEmployeeActivities: AuditEvent[];
}

/** Admin view of sales staff presence, raw-data activity and period reports. */
export const EmployeeActivityMonitor: React.FC<EmployeeActivityMonitorProps> = ({
  employeeCards,
  selectedManagedSaleId,
  setSelectedManagedSaleId,
  selectedEmployeeCard,
  salesReportWindow,
  salesReportPeriod,
  setSalesReportPeriod,
  salesReportStart,
  salesReportEnd,
  setSalesReportStart,
  referenceTime,
  setSalesReportEnd,
  salesReportLoading,
  salesReportError,
  selectedSalesReport,
  employeeActivityRange,
  setEmployeeActivityRange,
  employeeActivityGroup,
  setEmployeeActivityGroup,
  selectedEmployeeActivities
}) => (
  <section className="employee-monitor" aria-label="Giám sát hoạt động Sale">
    <header className="employee-monitor__header">
      <div>
        <h2>Hoạt động tại Dữ liệu thô</h2>
        <p>Trạng thái và thao tác gần nhất của đội Sale.</p>
      </div>
      <div className="employee-monitor__summary">
        <span>
          <strong>{employeeCards.filter(card => card.presenceStatus === 'active').length}</strong> đang thao tác
        </span>
        <span>
          <strong>{employeeCards.filter(card => card.presenceStatus === 'idle').length}</strong> tạm rảnh
        </span>
        <span>
          <strong>{employeeCards.filter(card => card.presenceStatus === 'offline').length}</strong> chưa thao tác
        </span>
      </div>
    </header>

    <div className="employee-monitor__layout">
      <div className="employee-monitor__grid">
        {employeeCards.map(card => {
          const latestEvent = card.activities[0];
          const statusLabel =
            card.presenceStatus === 'active'
              ? 'Đang thao tác'
              : card.presenceStatus === 'idle'
                ? `Rảnh ${card.minutesSinceSeen} phút`
                : 'Chưa thao tác';
          return (
            <button
              key={card.sale.uid}
              type="button"
              className={`employee-monitor-card ${selectedManagedSaleId === card.sale.uid ? 'is-selected' : ''}`}
              onClick={() => setSelectedManagedSaleId(card.sale.uid)}
            >
              <div className="employee-monitor-card__top">
                <span className="employee-monitor-card__avatar">
                  {card.sale.displayName
                    .trim()
                    .split(/\s+/)
                    .slice(-2)
                    .map(part => part[0])
                    .join('')
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{card.sale.displayName}</strong>
                  <span>Sale</span>
                </div>
                <em className={`is-${card.presenceStatus}`}>
                  <i />
                  {statusLabel}
                </em>
              </div>
              <div className="employee-monitor-card__current">
                <span>Đang phụ trách</span>
                <strong>{card.currentCandidate?.companyName || 'Chưa có công việc'}</strong>
              </div>
              <div className="employee-monitor-card__metrics">
                <span>
                  <strong>{card.touchedCount}</strong> khách đã xử lý
                </span>
                <span>
                  <strong>{card.callCount}</strong> cuộc gọi
                </span>
                <span>
                  <strong>{card.scheduleCount}</strong> lịch hẹn
                </span>
                <span>
                  <strong>{card.assignedCount}</strong> cần xử lý
                </span>
              </div>
              <div className="employee-monitor-card__latest">
                <span>Thao tác gần nhất</span>
                <strong>{latestEvent ? getEmployeeActionLabel(latestEvent) : 'Chưa có thao tác'}</strong>
                <small>
                  {latestEvent
                    ? `${latestEvent.targetLabel || 'Dữ liệu thô'} · ${formatShortDateTime(latestEvent.occurredAt)}`
                    : 'Chưa ghi nhận tại Dữ liệu thô'}
                </small>
              </div>
            </button>
          );
        })}
        {employeeCards.length === 0 && (
          <p className="employee-monitor__empty">Chưa có tài khoản Sale đang hoạt động.</p>
        )}
      </div>

      {selectedEmployeeCard && (
        <aside className="employee-monitor-detail">
          <header>
            <div>
              <span>NHẬT KÝ THAO TÁC</span>
              <h3>{selectedEmployeeCard.sale.displayName}</h3>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-symbol-sm"
              onClick={() => setSelectedManagedSaleId('')}
              aria-label="Đóng"
            >
              <X size={14} />
            </button>
          </header>
          <div className="employee-monitor-detail__facts">
            <span>
              Trạng thái
              <strong>
                {selectedEmployeeCard.presenceStatus === 'active'
                  ? 'Đang thao tác'
                  : selectedEmployeeCard.presenceStatus === 'idle'
                    ? 'Tạm rảnh'
                    : 'Chưa thao tác'}
              </strong>
            </span>
            <span>
              Thao tác gần nhất
              <strong>
                {selectedEmployeeCard.activities[0]
                  ? formatShortDateTime(selectedEmployeeCard.activities[0].occurredAt)
                  : 'Chưa ghi nhận'}
              </strong>
            </span>
          </div>
          <section
            className="employee-sales-report"
            aria-label={`Báo cáo năng suất ${selectedEmployeeCard.sale.displayName}`}
          >
            <header>
              <div>
                <h4>Báo cáo năng suất dữ liệu thô</h4>
                <span>{salesReportWindow?.label || 'Chọn khoảng thời gian hợp lệ'}</span>
              </div>
              <select
                value={salesReportPeriod}
                onChange={event => setSalesReportPeriod(event.target.value as SalesReportPeriod)}
                aria-label="Kỳ báo cáo"
              >
                <option value="week">Tuần này</option>
                <option value="month">Tháng này</option>
                <option value="quarter">Quý này</option>
                <option value="custom">Tùy chọn</option>
              </select>
            </header>
            {salesReportPeriod === 'custom' && (
              <div className="employee-sales-report__dates">
                <label>
                  Từ ngày
                  <input
                    type="date"
                    value={salesReportStart}
                    max={salesReportEnd}
                    onChange={event => setSalesReportStart(event.target.value)}
                  />
                </label>
                <label>
                  Đến ngày
                  <input
                    type="date"
                    value={salesReportEnd}
                    min={salesReportStart}
                    max={toDateInputValue(new Date(referenceTime))}
                    onChange={event => setSalesReportEnd(event.target.value)}
                  />
                </label>
              </div>
            )}
            {salesReportLoading && <p className="employee-sales-report__state">Đang tải báo cáo...</p>}
            {!salesReportLoading && salesReportError && (
              <p className="employee-sales-report__state is-error">{salesReportError}</p>
            )}
            {!salesReportLoading && !salesReportError && !selectedSalesReport && (
              <p className="employee-sales-report__state is-error">Khoảng thời gian không hợp lệ.</p>
            )}
            {!salesReportLoading && !salesReportError && selectedSalesReport && (
              <>
                <div className="employee-sales-report__metrics">
                  <span>
                    <small>Dữ liệu mới</small>
                    <strong>{selectedSalesReport.created.length}</strong>
                  </span>
                  <span>
                    <small>Khách đã xử lý</small>
                    <strong>{selectedSalesReport.processedCandidateIds.size}</strong>
                  </span>
                  <span>
                    <small>Lần gọi ghi nhận</small>
                    <strong>{selectedSalesReport.calls.length}</strong>
                  </span>
                  <span>
                    <small>Kết quả gọi xác nhận</small>
                    <strong>{selectedSalesReport.confirmedCalls.length}</strong>
                  </span>
                  <span>
                    <small>Lịch chăm sóc</small>
                    <strong>{selectedSalesReport.scheduled.length}</strong>
                  </span>
                  <span>
                    <small>Chuyển thành Lead</small>
                    <strong>{selectedSalesReport.convertedCandidateIds.size}</strong>
                  </span>
                </div>
                <div className="employee-sales-report__summary">
                  <span>
                    <strong>{selectedSalesReport.events.length}</strong> thao tác hệ thống được ghi nhận
                  </span>
                  <span>
                    <strong>
                      {selectedSalesReport.processedCandidateIds.size
                        ? Math.round(
                            (selectedSalesReport.convertedCandidateIds.size /
                              selectedSalesReport.processedCandidateIds.size) *
                              100
                          )
                        : 0}
                      %
                    </strong>{' '}
                    khách xử lý đã chuyển thành Lead
                  </span>
                </div>
                <div className="employee-sales-report__table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Khách xử lý</th>
                        <th>Gọi</th>
                        <th>Lịch hẹn</th>
                        <th>Chuyển Lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSalesReport.activityByDate.map(row => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          <td>{row.processed}</td>
                          <td>{row.calls}</td>
                          <td>{row.schedules}</td>
                          <td>{row.converted}</td>
                        </tr>
                      ))}
                      {selectedSalesReport.activityByDate.length === 0 && (
                        <tr>
                          <td colSpan={5}>Chưa có thao tác dữ liệu thô trong kỳ này.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          <div className="employee-monitor-detail__filters">
            <select
              value={employeeActivityRange}
              onChange={event => setEmployeeActivityRange(event.target.value as EmployeeActivityRange)}
              aria-label="Khoảng thời gian"
            >
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày</option>
              <option value="all">Tất cả</option>
            </select>
            <select
              value={employeeActivityGroup}
              onChange={event => setEmployeeActivityGroup(event.target.value as EmployeeActivityGroup)}
              aria-label="Loại thao tác"
            >
              <option value="all">Mọi thao tác</option>
              <option value="call">Cuộc gọi</option>
              <option value="data">Dữ liệu</option>
              <option value="schedule">Lịch hẹn</option>
              <option value="task">Công việc</option>
            </select>
          </div>
          <ol className="employee-monitor-detail__timeline">
            {selectedEmployeeActivities.map(event => {
              const eventTime = formatActivityTime(event.occurredAt);
              return (
                <li key={event.id}>
                  <i />
                  <time>
                    <strong>{eventTime.time}</strong>
                    <span>{eventTime.date}</span>
                  </time>
                  <div>
                    <strong>{getEmployeeActionLabel(event)}</strong>
                    <span>{event.targetLabel || 'Dữ liệu thô'}</span>
                  </div>
                </li>
              );
            })}
            {selectedEmployeeActivities.length === 0 && (
              <li className="is-empty">Không có thao tác Dữ liệu thô trong bộ lọc này.</li>
            )}
          </ol>
        </aside>
      )}
    </div>
  </section>
);
