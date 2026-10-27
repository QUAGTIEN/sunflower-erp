import { defaultHolidays } from './vietnamHolidays';

export type EmploymentType = 'full_time' | 'part_time';
export type DayStatus = 'present' | 'half' | 'paid_leave' | 'unpaid_leave';
export type HalfDayLeave = 'paid' | 'unpaid';

export class AttendanceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttendanceValidationError';
  }
}
export interface AttendanceActor {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
}
export interface AttendanceEmployee {
  uid: string;
  displayName: string;
  role: string;
  active: boolean;
}
export interface EmployeeProfile {
  userId: string;
  employmentType: EmploymentType;
  revision: number;
}
/** One recorded day. The employment type is kept on the entry so later profile changes never reinterpret it. */
export interface TimesheetEntry {
  status: DayStatus;
  employmentType: EmploymentType;
  halfLeave?: HalfDayLeave;
  hours: number;
  lateMinutes: number;
  overtimeHours: number;
  note: string;
  recordedBy: string;
  recordedByName: string;
  recordedAt: string;
}
export type TimesheetEntryInput = Pick<
  TimesheetEntry,
  'status' | 'halfLeave' | 'hours' | 'lateMinutes' | 'overtimeHours' | 'note'
>;
export interface TimesheetMonth {
  id: string;
  userId: string;
  employeeName: string;
  month: string;
  days: Record<string, TimesheetEntry>;
  revision: number;
  updatedAt: string;
}
/** An Admin/Kế toán decision for one date: `off: true` adds or renames a day off, `off: false` makes it a workday. */
export interface DayOverride {
  off: boolean;
  name: string;
}
export interface AttendanceCalendar {
  year: number;
  overrides: Record<string, DayOverride>;
  revision: number;
}
export interface AttendanceWorkspace {
  canRecord: boolean;
  employees: AttendanceEmployee[];
  profiles: EmployeeProfile[];
  sheets: TimesheetMonth[];
  calendar: AttendanceCalendar;
}
export interface DayInfo {
  off: boolean;
  name: string;
}
export interface TimesheetTotals {
  workDays: number;
  workHours: number;
  lateMinutes: number;
  lateCount: number;
  paidLeave: number;
  unpaidLeave: number;
  overtimeHours: number;
  offDayWork: number;
}

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = { full_time: 'Full-time', part_time: 'Part-time' };
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  present: 'Đi làm',
  half: 'Nửa buổi',
  paid_leave: 'Nghỉ có phép',
  unpaid_leave: 'Nghỉ không phép'
};
const NOTE_LIMIT = 500;

/** Only Admin and Kế toán record attendance; every other active account only reads its own timesheet. */
export const canRecordAttendance = (actor: AttendanceActor) =>
  actor.active === true && (actor.role === 'admin' || actor.role === 'accountant');

export function assertAttendanceMonth(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value))
    throw new AttendanceValidationError('Tháng chấm công không hợp lệ (2000–2099).');
}
export function assertAttendanceDate(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value))
    throw new AttendanceValidationError('Ngày chấm công không hợp lệ.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new AttendanceValidationError('Ngày chấm công không hợp lệ.');
}
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Monday-first weeks covering the whole month. */
export function monthCalendar(month: string): string[] {
  assertAttendanceMonth(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((count + offset) / 7) * 7 }, (_, index) =>
    new Date(Date.UTC(year, monthNumber - 1, index - offset + 1)).toISOString().slice(0, 10)
  );
}
export const monthDays = (month: string) => monthCalendar(month).filter(date => date.startsWith(`${month}-`));

/** Whether a date is a day off: the calendar override wins, then public holidays, then Sunday. */
export function resolveDay(date: string, calendar: Pick<AttendanceCalendar, 'overrides'> | undefined): DayInfo {
  const override = calendar?.overrides[date];
  if (override) return { off: override.off, name: override.name };
  const holiday = defaultHolidays(Number(date.slice(0, 4))).find(item => item.date === date);
  if (holiday) return { off: true, name: holiday.name };
  if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) return { off: true, name: 'Chủ nhật' };
  return { off: false, name: '' };
}

function numberField(input: Record<string, unknown>, key: 'hours' | 'lateMinutes' | 'overtimeHours', max: number) {
  const value = input[key] ?? 0;
  const label = { hours: 'Giờ làm', lateMinutes: 'Phút trễ', overtimeHours: 'Giờ OT' }[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    throw new AttendanceValidationError(`${label} không hợp lệ.`);
  if (key === 'lateMinutes' && !Number.isInteger(value))
    throw new AttendanceValidationError('Phút trễ phải là số nguyên.');
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7)
    throw new AttendanceValidationError(`${label} chỉ được nhập tối đa 2 chữ số thập phân.`);
  return value;
}

/**
 * Validate what Admin/Kế toán enters for one employee on one day. Leave is not recorded on days off:
 * resting on a Sunday or holiday is not an absence, while working on one is recorded as usual.
 */
export function validateTimesheetEntry(
  date: unknown,
  type: EmploymentType,
  input: Record<string, unknown>,
  dayInfo: DayInfo,
  today = businessDate()
): TimesheetEntryInput {
  assertAttendanceDate(date);
  if (date > today) throw new AttendanceValidationError('Không thể chấm công cho ngày trong tương lai.');
  const status = input.status as DayStatus;
  if (!Object.keys(DAY_STATUS_LABELS).includes(String(status)))
    throw new AttendanceValidationError('Chọn loại công hợp lệ.');
  if (type === 'part_time' && status === 'half')
    throw new AttendanceValidationError('Part-time chấm theo giờ làm, không chấm nửa buổi.');
  if (dayInfo.off && (status === 'paid_leave' || status === 'unpaid_leave'))
    throw new AttendanceValidationError('Ngày nghỉ không cần chấm nghỉ; chỉ chấm khi nhân viên có đi làm.');
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > NOTE_LIMIT) throw new AttendanceValidationError('Ghi chú tối đa 500 ký tự.');
  const hours = numberField(input, 'hours', 24);
  const lateMinutes = numberField(input, 'lateMinutes', 1440);
  const overtimeHours = numberField(input, 'overtimeHours', 24);
  if (status === 'paid_leave' || status === 'unpaid_leave') {
    if (hours || lateMinutes || overtimeHours)
      throw new AttendanceValidationError('Ngày nghỉ không có giờ làm, phút trễ hoặc OT.');
    return { status, hours: 0, lateMinutes: 0, overtimeHours: 0, note };
  }
  if (type === 'part_time') {
    if (hours <= 0) throw new AttendanceValidationError('Part-time cần số giờ làm lớn hơn 0.');
    if (overtimeHours) throw new AttendanceValidationError('Part-time không có giờ OT riêng.');
    return { status, hours, lateMinutes, overtimeHours: 0, note };
  }
  if (hours) throw new AttendanceValidationError('Full-time chấm theo ngày, không nhập giờ làm.');
  if (status === 'half') {
    if (input.halfLeave !== 'paid' && input.halfLeave !== 'unpaid')
      throw new AttendanceValidationError('Chọn nửa buổi còn lại là nghỉ có phép hay không phép.');
    return { status, halfLeave: input.halfLeave, hours: 0, lateMinutes, overtimeHours, note };
  }
  return { status, hours: 0, lateMinutes, overtimeHours, note };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Monthly totals of one timesheet. Unrecorded days count as nothing, never as absence. */
export function timesheetTotals(
  days: Record<string, TimesheetEntry>,
  calendar: Pick<AttendanceCalendar, 'overrides'> | undefined
): TimesheetTotals {
  const totals: TimesheetTotals = {
    workDays: 0,
    workHours: 0,
    lateMinutes: 0,
    lateCount: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    overtimeHours: 0,
    offDayWork: 0
  };
  for (const [date, entry] of Object.entries(days)) {
    const worked = entry.status === 'present' || entry.status === 'half';
    if (entry.status === 'present') totals.workDays += 1;
    if (entry.status === 'half') totals.workDays += 0.5;
    if (entry.status === 'paid_leave' || entry.halfLeave === 'paid')
      totals.paidLeave += entry.status === 'half' ? 0.5 : 1;
    if (entry.status === 'unpaid_leave' || entry.halfLeave === 'unpaid')
      totals.unpaidLeave += entry.status === 'half' ? 0.5 : 1;
    totals.workHours += entry.hours;
    totals.lateMinutes += entry.lateMinutes;
    if (entry.lateMinutes > 0) totals.lateCount += 1;
    totals.overtimeHours += entry.overtimeHours;
    if (worked && resolveDay(date, calendar).off) totals.offDayWork += 1;
  }
  totals.workHours = round2(totals.workHours);
  totals.overtimeHours = round2(totals.overtimeHours);
  return totals;
}
