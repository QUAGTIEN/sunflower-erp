import { useMemo, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import {
  buildAttendanceWorkspace,
  newerCalendar,
  newerSheets,
  type AttendanceSnapshots
} from '../model/attendanceWorkspace';
import { canRecordAttendance, type AttendanceCalendar, type TimesheetMonth } from '../model/timesheet';

const MESSAGES = {
  readError: 'Không tải được dữ liệu chấm công. Kiểm tra kết nối và thử lại.',
  unavailable: 'Chấm công cần kết nối Firebase. Chế độ dữ liệu local chưa hỗ trợ chấm công.'
};
const EMPTY_SNAPSHOTS: AttendanceSnapshots = { users: [], profiles: [], sheets: [], calendars: [] };

/** The queries must match firestore.rules: staff may only ask for documents whose userId is their own. */
export function attendanceQueries(
  recorder: boolean,
  uid: string,
  month: string
): LiveQuery<keyof AttendanceSnapshots>[] {
  const own = { fieldName: 'userId', fieldValue: uid };
  // Staff read every month of their own sheets, so switching months needs no new query.
  const sheetFilter = recorder ? { fieldName: 'month', fieldValue: month } : own;
  const queries: LiveQuery<keyof AttendanceSnapshots>[] = [
    { name: 'profiles', collection: 'attendance_profiles', filter: recorder ? undefined : own },
    { name: 'sheets', collection: 'attendance_sheets', filter: sheetFilter },
    { name: 'calendars', collection: 'attendance_calendars' }
  ];
  if (recorder) queries.push({ name: 'users', collection: 'users' });
  return queries;
}

/**
 * Reads attendance straight from Firestore so cached months show at once and changes arrive live.
 * Rules decide what each viewer may read; writes still go through the attendance API.
 */
export function useAttendanceWorkspace(currentUser: UserProfile, month: string) {
  const recorder = canRecordAttendance(currentUser);
  const live = useLiveCollections(attendanceQueries(recorder, currentUser.uid, month), MESSAGES);
  const [savedSheets, setSavedSheets] = useState<TimesheetMonth[]>([]);
  const [savedCalendar, setSavedCalendar] = useState<AttendanceCalendar | null>(null);

  const workspace = useMemo(() => {
    const snapshots = live.snapshots ? { ...EMPTY_SNAPSHOTS, ...live.snapshots } : EMPTY_SNAPSHOTS;
    const base = buildAttendanceWorkspace(currentUser, recorder, month, snapshots);
    const repliesThisMonth = savedSheets.filter(sheet => sheet.month === month);
    return {
      ...base,
      sheets: newerSheets(base.sheets, repliesThisMonth),
      calendar: newerCalendar(base.calendar, savedCalendar)
    };
  }, [live.snapshots, currentUser, recorder, month, savedSheets, savedCalendar]);

  return {
    workspace,
    loading: live.loading,
    error: live.error,
    reload: live.reload,
    applySheet: (sheet: TimesheetMonth) =>
      setSavedSheets(previous => [...previous.filter(item => item.id !== sheet.id), sheet]),
    applyCalendar: setSavedCalendar
  };
}
