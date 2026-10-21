export type EmploymentType = 'full_time' | 'part_time';
export type AttendanceStatus = 'draft' | 'pending' | 'approved' | 'returned';
export class AttendanceValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'AttendanceValidationError'; }
}
export interface AttendanceActor { uid: string; displayName: string; role: string; active: boolean }
export interface AttendanceEmployee { uid: string; displayName: string; role: string; active: boolean }
export interface AttendanceSetting {
  userId: string; employmentType: EmploymentType; reviewerId: string; revision: number;
}
export interface AttendanceDay { worked: boolean; hours: number; lateMinutes: number; overtimeHours: number }
export interface AttendanceMonth {
  id: string; userId: string; employeeName: string; month: string; employmentType: EmploymentType;
  days: Record<string, AttendanceDay>; status: AttendanceStatus; revision: number; reviewerId: string;
  submittedAt?: string; reviewedAt?: string; reviewedBy?: string; returnReason?: string; updatedAt: string;
}
export interface AttendanceWorkspace {
  employees: AttendanceEmployee[]; settings: AttendanceSetting[]; months: AttendanceMonth[];
}
export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = { full_time: 'Full-time', part_time: 'Part-time' };
export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  draft: 'Đang ghi nhận', pending: 'Chờ duyệt', approved: 'Đã duyệt', returned: 'Cần chỉnh sửa'
};
export const isAttendanceAdmin = (actor: AttendanceActor) => actor.active === true && actor.role === 'admin';
export function assertAttendanceMonth(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(value)) throw new AttendanceValidationError('Tháng chấm công không hợp lệ (2000–2099).');
}
export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function monthCalendar(month: string): string[] {
  assertAttendanceMonth(month);
  const [year, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((count + offset) / 7) * 7 }, (_, index) => new Date(Date.UTC(year, m - 1, index - offset + 1)).toISOString().slice(0, 10));
}
export function validateAttendanceDay(date: unknown, month: string, type: EmploymentType, input: Record<string, unknown>, today = businessDate()): AttendanceDay {
  assertAttendanceMonth(month);
  if (typeof date !== 'string' || !date.startsWith(`${month}-`) || !monthCalendar(month).includes(date)) throw new AttendanceValidationError('Ngày chấm công không hợp lệ.');
  if (date > today) throw new AttendanceValidationError('Không thể ghi nhận công cho ngày trong tương lai.');
  const numeric = (key: string, max: number, integer = false) => {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) throw new AttendanceValidationError(`${key === 'lateMinutes' ? 'Phút trễ' : key === 'hours' ? 'Giờ làm' : 'Giờ OT'} không hợp lệ.`);
    if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-7) throw new AttendanceValidationError('Số giờ chỉ được nhập tối đa 2 chữ số thập phân.');
    return value;
  };
  const lateMinutes = numeric('lateMinutes', 1440, true);
  const hours = numeric('hours', 24);
  const overtimeHours = numeric('overtimeHours', 24);
  if (type === 'full_time') {
    if (typeof input.worked !== 'boolean' || hours !== 0) throw new AttendanceValidationError('Full-time chỉ ghi nhận đi làm theo ngày.');
    if (!input.worked && (lateMinutes || overtimeHours)) throw new AttendanceValidationError('Cần đánh dấu Đi làm trước khi nhập trễ hoặc OT.');
    if (!input.worked) throw new AttendanceValidationError('Đánh dấu Đi làm hoặc dùng Xóa chấm công để bỏ ghi nhận ngày này.');
    return { worked: true, hours: 0, lateMinutes, overtimeHours };
  }
  if (type !== 'part_time' || hours <= 0 || overtimeHours !== 0) throw new AttendanceValidationError('Part-time cần số giờ làm lớn hơn 0 và không có trường OT.');
  return { worked: true, hours, lateMinutes, overtimeHours: 0 };
}
export function attendanceTotals(days: Record<string, AttendanceDay>) {
  return Object.values(days).reduce((total, day) => ({
    days: total.days + (day.worked ? 1 : 0), hours: Math.round((total.hours + day.hours) * 100) / 100,
    lateMinutes: total.lateMinutes + day.lateMinutes, overtimeHours: Math.round((total.overtimeHours + day.overtimeHours) * 100) / 100
  }), { days: 0, hours: 0, lateMinutes: 0, overtimeHours: 0 });
}
