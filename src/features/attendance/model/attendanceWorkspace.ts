import type {
  AttendanceActor,
  AttendanceCalendar,
  AttendanceEmployee,
  AttendanceWorkspace,
  EmployeeProfile,
  TimesheetMonth
} from './timesheet';

type StoredDocument = Record<string, unknown> & { id: string };

export interface AttendanceSnapshots {
  users: StoredDocument[];
  profiles: StoredDocument[];
  sheets: StoredDocument[];
  calendars: StoredDocument[];
}

export const emptyAttendanceCalendar = (year: number): AttendanceCalendar => ({ year, overrides: {}, revision: 0 });

const toEmployee = (uid: string, data: Record<string, unknown>): AttendanceEmployee => ({
  uid,
  displayName: String(data.displayName || uid),
  role: String(data.role || ''),
  active: data.active === true
});

/**
 * Builds the month view from documents Firestore rules already limited to what the viewer may read.
 * Staff get only their own records, so the roster is the viewer alone and never other accounts.
 */
export function buildAttendanceWorkspace(
  viewer: AttendanceActor,
  recorder: boolean,
  month: string,
  snapshots: AttendanceSnapshots
): AttendanceWorkspace {
  const year = Number(month.slice(0, 4));
  const sheets = snapshots.sheets
    .filter(sheet => sheet.month === month && (recorder || sheet.userId === viewer.uid))
    .map(sheet => sheet as unknown as TimesheetMonth);
  const employees = recorder
    ? snapshots.users.map(user => toEmployee(user.id, user))
    : [toEmployee(viewer.uid, { ...viewer })];
  // A deleted account keeps its recorded month visible under the name stored on the sheet.
  for (const sheet of sheets)
    if (!employees.some(person => person.uid === sheet.userId))
      employees.push({ uid: sheet.userId, displayName: sheet.employeeName, role: '', active: false });
  const calendar = snapshots.calendars.find(item => item.id === String(year));
  return {
    canRecord: recorder,
    employees,
    profiles: snapshots.profiles
      .filter(profile => recorder || profile.id === viewer.uid)
      .map(profile => ({ ...profile, userId: profile.id }) as unknown as EmployeeProfile),
    sheets,
    calendar: calendar ? (calendar as unknown as AttendanceCalendar) : emptyAttendanceCalendar(year)
  };
}

/**
 * A server reply can arrive before the live snapshot; keeping the higher revision stops the next save
 * from sending a stale expectedRevision and being rejected as a conflict.
 */
export function newerSheets(live: TimesheetMonth[], saved: TimesheetMonth[]): TimesheetMonth[] {
  const merged = live.map(sheet => {
    const reply = saved.find(item => item.id === sheet.id);
    return reply && reply.revision > sheet.revision ? reply : sheet;
  });
  const missing = saved.filter(reply => !live.some(sheet => sheet.id === reply.id));
  return [...merged, ...missing];
}

export const newerCalendar = (live: AttendanceCalendar, saved: AttendanceCalendar | null): AttendanceCalendar =>
  saved && saved.year === live.year && saved.revision > live.revision ? saved : live;
