import {
  DAY_STATUS_LABELS,
  type AttendanceEmployee,
  type AttendanceWorkspace,
  type EmploymentType,
  type TimesheetEntry
} from './timesheet';

export interface RosterRow {
  employee: AttendanceEmployee;
  employmentType: EmploymentType;
  entry?: TimesheetEntry;
}
export interface DayCounts {
  total: number;
  present: number;
  half: number;
  paidLeave: number;
  unpaidLeave: number;
  late: number;
  unrecorded: number;
}

const formatHours = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Employees shown on a month: every active account plus inactive ones that already have a recorded sheet. */
export function attendanceEmployees(workspace: AttendanceWorkspace): AttendanceEmployee[] {
  const recorded = new Set(workspace.sheets.map(sheet => sheet.userId));
  return workspace.employees
    .filter(person => person.active || recorded.has(person.uid))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
}

export const employmentTypeFor = (workspace: AttendanceWorkspace, userId: string): EmploymentType =>
  workspace.profiles.find(profile => profile.userId === userId)?.employmentType === 'part_time'
    ? 'part_time'
    : 'full_time';

export function dayRoster(workspace: AttendanceWorkspace, date: string): RosterRow[] {
  return attendanceEmployees(workspace).map(employee => ({
    employee,
    employmentType: employmentTypeFor(workspace, employee.uid),
    entry: workspace.sheets.find(sheet => sheet.userId === employee.uid)?.days[date]
  }));
}

/** Counts for one day. Inactive employees without an entry are not expected to work, so they are not "unrecorded". */
export function dayCounts(roster: RosterRow[]): DayCounts {
  const counts: DayCounts = { total: 0, present: 0, half: 0, paidLeave: 0, unpaidLeave: 0, late: 0, unrecorded: 0 };
  for (const { employee, entry } of roster) {
    if (!entry && !employee.active) continue;
    counts.total += 1;
    if (!entry) counts.unrecorded += 1;
    else if (entry.status === 'present') counts.present += 1;
    else if (entry.status === 'half') counts.half += 1;
    else if (entry.status === 'paid_leave') counts.paidLeave += 1;
    else counts.unpaidLeave += 1;
    if (entry && entry.lateMinutes > 0) counts.late += 1;
  }
  return counts;
}

/** Entries worth naming in a calendar cell: anything other than a plain, on-time working day. */
export const isNotableEntry = (entry: TimesheetEntry) => entry.status !== 'present' || entry.lateMinutes > 0;

export function entryLabel(entry: TimesheetEntry): string {
  if (entry.employmentType === 'part_time' && entry.status === 'present') return `${formatHours(entry.hours)} giờ`;
  if (entry.status === 'half') return `Nửa buổi · nghỉ ${entry.halfLeave === 'paid' ? 'có phép' : 'không phép'}`;
  return DAY_STATUS_LABELS[entry.status];
}

/** Short chip text: a late working day shows the lateness instead of a plain "Đi làm". */
export const chipLabel = (entry: TimesheetEntry) =>
  entry.status === 'present' && entry.lateMinutes > 0 && entry.employmentType === 'full_time'
    ? `Trễ ${entry.lateMinutes}p`
    : entryLabel(entry);

/** Full description for tooltips: type, lateness, OT and note. */
export function entryDescription(entry: TimesheetEntry): string {
  return [
    entryLabel(entry),
    entry.lateMinutes ? `Trễ ${entry.lateMinutes} phút` : '',
    entry.overtimeHours ? `OT ${formatHours(entry.overtimeHours)} giờ` : '',
    entry.note
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Timesheet symbol in the MISA style: X đi làm, T trễ, ½ nửa buổi, P phép, V vắng; part-time shows hours. */
export function entrySymbol(entry: TimesheetEntry): string {
  if (entry.status === 'paid_leave') return 'P';
  if (entry.status === 'unpaid_leave') return 'V';
  if (entry.status === 'half') return '½';
  if (entry.employmentType === 'part_time') return formatHours(entry.hours);
  return entry.lateMinutes > 0 ? 'T' : 'X';
}

export type EntryTone = 'work' | 'late' | 'half' | 'leave' | 'absent';
export function entryTone(entry: TimesheetEntry): EntryTone {
  if (entry.status === 'paid_leave') return 'leave';
  if (entry.status === 'unpaid_leave') return 'absent';
  if (entry.status === 'half') return 'half';
  return entry.lateMinutes > 0 ? 'late' : 'work';
}

export { formatHours };
