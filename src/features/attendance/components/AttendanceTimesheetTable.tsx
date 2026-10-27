import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import {
  attendanceEmployees,
  employmentTypeFor,
  entryDescription,
  entrySymbol,
  entryTone,
  formatHours
} from '../model/attendanceRoster';
import { monthDays, resolveDay, timesheetTotals, type AttendanceWorkspace } from '../model/timesheet';

interface Props {
  workspace: AttendanceWorkspace;
  month: string;
  search: string;
}

const WEEKDAY_LETTERS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const weekdayLetter = (date: string) => WEEKDAY_LETTERS[new Date(`${date}T00:00:00Z`).getUTCDay()];
const formatDays = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/** Monthly timesheet: one row per employee, one column per day, totals at the end (MISA bảng chấm công). */
export function AttendanceTimesheetTable({ workspace, month, search }: Props) {
  const days = monthDays(month);
  const dayInfo = new Map(days.map(date => [date, resolveDay(date, workspace.calendar)]));
  const employees = attendanceEmployees(workspace).filter(person =>
    person.displayName.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))
  );
  const { rows, paginationProps } = useDataTablePagination(employees);

  return (
    <div className="attendance-timesheet">
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
                    {person.displayName}
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
      <DataTablePagination {...paginationProps} />
      <p className="attendance-legend">
        X đi làm · T đi trễ · ½ nửa buổi · P nghỉ có phép · V nghỉ không phép · số giờ với Part-time · ô trống là chưa
        chấm. Cột tô xám là ngày nghỉ.
      </p>
    </div>
  );
}
