import type { CSSProperties, MouseEvent } from 'react';
import { CalendarCog } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import {
  dayCounts,
  dayRoster,
  chipLabel,
  entryDescription,
  entryTone,
  isNotableEntry,
  type RosterRow
} from '../model/attendanceRoster';
import { monthCalendar, resolveDay, type AttendanceWorkspace } from '../model/timesheet';

interface Props {
  workspace: AttendanceWorkspace;
  month: string;
  today: string;
  selectedDate: string;
  search: string;
  busy: boolean;
  onSelectDate: (date: string) => void;
  onOpenEntry: (userId: string, date: string) => void;
  onMarkPresent: (date: string) => void;
  onEditDayOff: (date: string) => void;
}

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
const NAMES_PER_CELL = 3;
const weekdayOf = (date: string) => WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
const shortDate = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
const matches = (row: RosterRow, search: string) =>
  row.employee.displayName.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));

export function AttendanceRecorderBoard({
  workspace,
  month,
  today,
  selectedDate,
  search,
  busy,
  onSelectDate,
  onOpenEntry,
  onMarkPresent,
  onEditDayOff
}: Props) {
  const gridDays = monthCalendar(month);
  const selectedRoster = dayRoster(workspace, selectedDate);
  const selectedCounts = dayCounts(selectedRoster);
  const selectedInfo = resolveDay(selectedDate, workspace.calendar);
  const selectedIsFuture = selectedDate > today;
  const unrecordedFullTime = selectedRoster.filter(
    row => row.employee.active && !row.entry && row.employmentType === 'full_time'
  ).length;
  const panelRows = selectedRoster.filter(row => (row.entry || row.employee.active) && matches(row, search));
  const openEntry = (event: MouseEvent, userId: string, date: string) => {
    event.stopPropagation();
    onOpenEntry(userId, date);
  };

  return (
    <>
      <dl className="attendance-summary" aria-label={`Tổng hợp ngày ${shortDate(selectedDate)}`}>
        <div>
          <dt>{weekdayOf(selectedDate)}</dt>
          <dd>
            {shortDate(selectedDate)}
            {selectedInfo.off && <small> · {selectedInfo.name}</small>}
          </dd>
        </div>
        <div>
          <dt>Nhân viên</dt>
          <dd>{selectedCounts.total}</dd>
        </div>
        <div>
          <dt>Đi làm</dt>
          <dd className="is-success">{selectedCounts.present}</dd>
        </div>
        <div>
          <dt>Nửa buổi</dt>
          <dd>{selectedCounts.half}</dd>
        </div>
        <div>
          <dt>Nghỉ có phép</dt>
          <dd>{selectedCounts.paidLeave}</dd>
        </div>
        <div>
          <dt>Nghỉ không phép</dt>
          <dd className={selectedCounts.unpaidLeave ? 'is-danger' : undefined}>{selectedCounts.unpaidLeave}</dd>
        </div>
        <div>
          <dt>Chưa chấm</dt>
          <dd className="is-muted">{selectedIsFuture || selectedInfo.off ? '—' : selectedCounts.unrecorded}</dd>
        </div>
      </dl>
      <div className="attendance-board">
        <div className="attendance-calendar-scroll">
          <div
            className="attendance-calendar"
            role="grid"
            aria-label={`Lịch chấm công ${month}`}
            style={{ '--attendance-weeks': gridDays.length / 7 } as CSSProperties}
          >
            {WEEKDAYS.map(label => (
              <div key={label} className="attendance-weekday" role="columnheader">
                {label}
              </div>
            ))}
            {gridDays.map(date => {
              const inMonth = date.startsWith(month);
              const info = resolveDay(date, workspace.calendar);
              const roster = inMonth ? dayRoster(workspace, date) : [];
              const counts = dayCounts(roster);
              const notable = roster.filter(row => row.entry && isNotableEntry(row.entry));
              const showUnrecorded = inMonth && !info.off && date <= today && counts.unrecorded > 0;
              const className = [
                'attendance-calendar-day',
                !inMonth && 'is-outside',
                info.off && 'is-off',
                date === today && 'is-today',
                date === selectedDate && 'is-selected'
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={date} role="gridcell" className={className} onClick={() => inMonth && onSelectDate(date)}>
                  <div className="attendance-day-head">
                    <button
                      type="button"
                      className="attendance-date"
                      aria-label={`Chọn ngày ${shortDate(date)}`}
                      aria-pressed={date === selectedDate}
                      disabled={!inMonth}
                      onClick={() => onSelectDate(date)}
                    >
                      {Number(date.slice(8))}
                    </button>
                    {inMonth && info.off && (
                      <span className="attendance-day-name" title={info.name}>
                        {info.name}
                      </span>
                    )}
                  </div>
                  {inMonth && (
                    <div className="attendance-day-status">
                      {counts.present > 0 && (
                        <span className="attendance-chip attendance-chip--work">{counts.present} đi làm</span>
                      )}
                      {notable.slice(0, NAMES_PER_CELL).map(row => (
                        <button
                          key={row.employee.uid}
                          type="button"
                          className={`attendance-chip attendance-chip--${entryTone(row.entry!)}`}
                          title={`${row.employee.displayName}: ${entryDescription(row.entry!)}`}
                          disabled={busy}
                          onClick={event => openEntry(event, row.employee.uid, date)}
                        >
                          {row.employee.displayName} · {chipLabel(row.entry!)}
                        </button>
                      ))}
                      {notable.length > NAMES_PER_CELL && (
                        <span className="attendance-chip attendance-chip--more">
                          +{notable.length - NAMES_PER_CELL} khác
                        </span>
                      )}
                      {showUnrecorded && (
                        <span className="attendance-chip attendance-chip--unrecorded">
                          {counts.unrecorded} chưa chấm
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <aside className="attendance-day-panel" aria-label={`Nhân viên ngày ${shortDate(selectedDate)}`}>
          <header>
            <div>
              <h3>
                {weekdayOf(selectedDate)}, {shortDate(selectedDate)}
              </h3>
              {selectedInfo.off && <span className="attendance-tag attendance-tag--off">{selectedInfo.name}</span>}
            </div>
            <IconButton
              label="Đặt ngày nghỉ / ngày làm việc"
              icon={<CalendarCog />}
              disabled={busy}
              onClick={() => onEditDayOff(selectedDate)}
            />
          </header>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || selectedInfo.off || selectedIsFuture || unrecordedFullTime === 0}
            title={
              selectedInfo.off
                ? 'Ngày nghỉ: chấm từng người nếu có đi làm'
                : 'Chấm Đi làm cho nhân viên Full-time chưa chấm ngày này'
            }
            onClick={() => onMarkPresent(selectedDate)}
          >
            Chấm cả ngày đi làm
          </button>
          {selectedIsFuture && <p className="attendance-hint">Chưa đến ngày này, chưa chấm được.</p>}
          <ul className="attendance-day-list">
            {panelRows.map(row => (
              <li key={row.employee.uid}>
                <button
                  type="button"
                  disabled={busy || selectedIsFuture}
                  title={row.entry ? entryDescription(row.entry) : 'Chưa chấm'}
                  onClick={() => onOpenEntry(row.employee.uid, selectedDate)}
                >
                  <span className="attendance-day-list__name">
                    {row.employee.displayName}
                    {row.employmentType === 'part_time' && <small> · Part-time</small>}
                  </span>
                  {row.entry ? (
                    <span className={`attendance-chip attendance-chip--${entryTone(row.entry)}`}>
                      {chipLabel(row.entry)}
                    </span>
                  ) : (
                    <span className="attendance-chip attendance-chip--unrecorded">
                      {selectedInfo.off ? 'Nghỉ' : 'Chưa chấm'}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!panelRows.length && <li className="attendance-hint">Không có nhân viên phù hợp.</li>}
          </ul>
        </aside>
      </div>
      <div className="attendance-legend" aria-label="Chú thích">
        <span className="attendance-legend__item attendance-legend__item--work">Đi làm</span>
        <span className="attendance-legend__item attendance-legend__item--late">Đi trễ</span>
        <span className="attendance-legend__item attendance-legend__item--half">Nửa buổi</span>
        <span className="attendance-legend__item attendance-legend__item--leave">Nghỉ có phép</span>
        <span className="attendance-legend__item attendance-legend__item--absent">Nghỉ không phép</span>
        <span className="attendance-legend__item attendance-legend__item--off">Ngày nghỉ</span>
      </div>
    </>
  );
}
