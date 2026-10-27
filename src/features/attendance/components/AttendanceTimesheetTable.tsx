import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import {
  attendanceEmployees,
  employmentTypeFor,
  entryDescription,
  entryLabel,
  entrySymbol,
  entryTone,
  formatHours
} from '../model/attendanceRoster';
import {
  EMPLOYMENT_LABELS,
  monthDays,
  resolveDay,
  timesheetTotals,
  type AttendanceWorkspace
} from '../model/timesheet';

interface Props {
  workspace: AttendanceWorkspace;
  month: string;
  search: string;
  selectedEmployeeId?: string;
  onSelectEmployee?: (userId: string) => void;
}

const WEEKDAY_LETTERS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const weekdayLetter = (date: string) => WEEKDAY_LETTERS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const weekdayName = (date: string) => WEEKDAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];
const shortDate = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
const formatDays = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** Monthly timesheet: all employees or a single employee's full breakdown (MISA bảng chấm công). */
export function AttendanceTimesheetTable({
  workspace,
  month,
  search,
  selectedEmployeeId = '',
  onSelectEmployee
}: Props) {
  const days = monthDays(month);
  const dayInfo = new Map(days.map(date => [date, resolveDay(date, workspace.calendar)]));
  const allEmployees = attendanceEmployees(workspace);
  const focusedEmployee = selectedEmployeeId
    ? allEmployees.find(person => person.uid === selectedEmployeeId) || null
    : !workspace.canRecord && allEmployees.length === 1
      ? allEmployees[0]
      : null;
  const employees = focusedEmployee
    ? [focusedEmployee]
    : allEmployees.filter(person =>
        person.displayName.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))
      );
  const { rows, paginationProps } = useDataTablePagination(employees);
  const focusedDays = focusedEmployee
    ? workspace.sheets.find(sheet => sheet.userId === focusedEmployee.uid)?.days || {}
    : {};
  const focusedTotals = focusedEmployee ? timesheetTotals(focusedDays, workspace.calendar) : null;
  const focusedType = focusedEmployee ? employmentTypeFor(workspace, focusedEmployee.uid) : 'full_time';

  return (
    <div className="attendance-timesheet">
      {focusedEmployee && focusedTotals && (
        <div className="attendance-employee-sheet">
          <div className="attendance-employee-sheet__header">
            <div className="attendance-employee-sheet__title">
              <h3>Bảng công cá nhân: {focusedEmployee.displayName}</h3>
              <span className="attendance-tag">{EMPLOYMENT_LABELS[focusedType]}</span>
            </div>
            {workspace.canRecord && onSelectEmployee && (
              <button type="button" className="btn btn-outline" onClick={() => onSelectEmployee('')}>
                Xem tất cả nhân viên
              </button>
            )}
          </div>
          <dl className="attendance-summary" aria-label={`Tổng hợp tháng của ${focusedEmployee.displayName}`}>
            <div>
              <dt>Ngày công</dt>
              <dd className="is-success">
                {formatDays(focusedTotals.workDays)}
                {focusedType === 'part_time' && focusedTotals.workHours > 0 && (
                  <small> ({formatHours(focusedTotals.workHours)}h)</small>
                )}
              </dd>
            </div>
            <div>
              <dt>Đi trễ</dt>
              <dd>
                {focusedTotals.lateMinutes} phút
                {focusedTotals.lateCount > 0 && <small> · {focusedTotals.lateCount} lần</small>}
              </dd>
            </div>
            <div>
              <dt>Nghỉ có phép</dt>
              <dd>{formatDays(focusedTotals.paidLeave)}</dd>
            </div>
            <div>
              <dt>Nghỉ không phép</dt>
              <dd className={focusedTotals.unpaidLeave ? 'is-danger' : undefined}>
                {formatDays(focusedTotals.unpaidLeave)}
              </dd>
            </div>
            <div>
              <dt>Làm thêm OT</dt>
              <dd>{formatHours(focusedTotals.overtimeHours)} giờ</dd>
            </div>
            <div>
              <dt>Làm ngày nghỉ</dt>
              <dd>{focusedTotals.offDayWork}</dd>
            </div>
          </dl>
        </div>
      )}
      <div className="attendance-table-scroll">
        <table className="attendance-timesheet-table">
          <thead>
            <tr>
              <th className="attendance-timesheet-name">Nhân viên</th>
              {days.map(date => (
                <th
                  key={date}
                  className={dayInfo.get(date)!.off ? 'is-off' : undefined}
                  title={dayInfo.get(date)!.name || undefined}
                >
                  <span>{Number(date.slice(8))}</span>
                  <small>{weekdayLetter(date)}</small>
                </th>
              ))}
              <th className="attendance-number" title="Ngày công (Part-time: số buổi)">
                Công
              </th>
              <th className="attendance-number" title="Tổng phút đi trễ">
                Trễ
              </th>
              <th className="attendance-number" title="Ngày nghỉ có phép">
                Phép
              </th>
              <th className="attendance-number" title="Ngày nghỉ không phép">
                Vắng
              </th>
              <th className="attendance-number" title="Giờ làm thêm">
                OT
              </th>
              <th className="attendance-number" title="Số ngày đi làm vào Chủ nhật / ngày lễ">
                Ngày nghỉ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(person => {
              const sheetDays = workspace.sheets.find(sheet => sheet.userId === person.uid)?.days || {};
              const totals = timesheetTotals(sheetDays, workspace.calendar);
              const partTime = employmentTypeFor(workspace, person.uid) === 'part_time';
              return (
                <tr key={person.uid}>
                  <td className="attendance-timesheet-name" title={person.displayName}>
                    {!focusedEmployee && workspace.canRecord && onSelectEmployee ? (
                      <button
                        type="button"
                        className="attendance-employee-link"
                        title={`Xem bảng công của ${person.displayName}`}
                        onClick={() => onSelectEmployee(person.uid)}
                      >
                        {person.displayName}
                      </button>
                    ) : (
                      person.displayName
                    )}
                    {partTime && <small> · Part-time</small>}
                  </td>
                  {days.map(date => {
                    const entry = sheetDays[date];
                    const info = dayInfo.get(date)!;
                    return (
                      <td
                        key={date}
                        className={[info.off && 'is-off', entry && `is-${entryTone(entry)}`].filter(Boolean).join(' ')}
                        title={entry ? entryDescription(entry) : info.off ? info.name : 'Chưa chấm'}
                      >
                        {entry ? entrySymbol(entry) : ''}
                      </td>
                    );
                  })}
                  <td className="attendance-number">
                    {formatDays(totals.workDays)}
                    {partTime && totals.workHours > 0 && <small> ({formatHours(totals.workHours)}h)</small>}
                  </td>
                  <td className="attendance-number">{totals.lateMinutes}</td>
                  <td className="attendance-number">{formatDays(totals.paidLeave)}</td>
                  <td className="attendance-number">{formatDays(totals.unpaidLeave)}</td>
                  <td className="attendance-number">{formatHours(totals.overtimeHours)}</td>
                  <td className="attendance-number">{totals.offDayWork}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={days.length + 7}>Không có nhân viên phù hợp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!focusedEmployee && <DataTablePagination {...paginationProps} />}
      {focusedEmployee && (
        <div className="attendance-table-scroll">
          <table
            className="attendance-employee-detail-table"
            aria-label={`Chi tiết ngày công của ${focusedEmployee.displayName}`}
          >
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Thứ</th>
                <th>Trạng thái</th>
                <th className="attendance-number">Đi trễ (phút)</th>
                <th className="attendance-number">Làm thêm OT (giờ)</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {days.map(date => {
                const entry = focusedDays[date];
                const info = dayInfo.get(date)!;
                return (
                  <tr key={`detail-${date}`} className={info.off ? 'is-off' : undefined}>
                    <td>{shortDate(date)}</td>
                    <td>
                      {weekdayName(date)}
                      {info.off && info.name !== 'Chủ nhật' && <small> · {info.name}</small>}
                    </td>
                    <td>
                      {entry ? (
                        <span className={`attendance-chip attendance-chip--${entryTone(entry)}`}>
                          {entryLabel(entry)}
                        </span>
                      ) : (
                        <span className="attendance-hint">{info.off ? info.name : 'Chưa chấm'}</span>
                      )}
                    </td>
                    <td className="attendance-number">{entry?.lateMinutes || '—'}</td>
                    <td className="attendance-number">
                      {entry?.overtimeHours ? formatHours(entry.overtimeHours) : '—'}
                    </td>
                    <td title={entry?.note || undefined}>{entry?.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="attendance-legend">
        X đi làm · T đi trễ · ½ nửa buổi · P nghỉ có phép · V nghỉ không phép · số giờ với Part-time · ô trống là chưa
        chấm. Cột tô xám là ngày nghỉ.
      </p>
    </div>
  );
}
