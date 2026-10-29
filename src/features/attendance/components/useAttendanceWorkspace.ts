import { useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { dbService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import {
  buildAttendanceWorkspace,
  newerCalendar,
  newerSheets,
  type AttendanceSnapshots
} from '../model/attendanceWorkspace';
import { canRecordAttendance, type AttendanceCalendar, type TimesheetMonth } from '../model/timesheet';

type SnapshotName = keyof AttendanceSnapshots;
interface FieldFilter {
  fieldName: string;
  fieldValue: string;
}
interface AttendanceQuery {
  name: SnapshotName;
  collection: string;
  filter?: FieldFilter;
  key: string;
}
interface Received {
  key: string;
  rows: AttendanceSnapshots[SnapshotName];
}

const LOCAL_MODE_ERROR = 'Chấm công cần kết nối Firebase. Chế độ dữ liệu local chưa hỗ trợ chấm công.';
const READ_ERROR = 'Không tải được dữ liệu chấm công. Kiểm tra kết nối và thử lại.';
const EMPTY_SNAPSHOTS: AttendanceSnapshots = { users: [], profiles: [], sheets: [], calendars: [] };

/** The queries must match firestore.rules: staff may only ask for documents whose userId is their own. */
export function attendanceQueries(recorder: boolean, uid: string, month: string, reload: number): AttendanceQuery[] {
  const own = { fieldName: 'userId', fieldValue: uid };
  // Staff read every month of their own sheets, so switching months needs no new query.
  const sheetFilter = recorder ? { fieldName: 'month', fieldValue: month } : own;
  const queries: Omit<AttendanceQuery, 'key'>[] = [
    { name: 'profiles', collection: 'attendance_profiles', filter: recorder ? undefined : own },
    { name: 'sheets', collection: 'attendance_sheets', filter: sheetFilter },
    { name: 'calendars', collection: 'attendance_calendars' }
  ];
  if (recorder) queries.push({ name: 'users', collection: 'users' });
  return queries.map(item => ({ ...item, key: `${item.filter?.fieldValue || ''}-${reload}` }));
}

/**
 * Reads attendance straight from Firestore so cached months show at once and changes arrive live.
 * Rules decide what each viewer may read; writes still go through the attendance API.
 */
export function useAttendanceWorkspace(currentUser: UserProfile, month: string) {
  const recorder = canRecordAttendance(currentUser);
  const [received, setReceived] = useState<Partial<Record<SnapshotName, Received>>>({});
  const [failure, setFailure] = useState('');
  const [reload, setReload] = useState(0);
  const [savedSheets, setSavedSheets] = useState<TimesheetMonth[]>([]);
  const [savedCalendar, setSavedCalendar] = useState<AttendanceCalendar | null>(null);
  const queries = useMemo(
    () => attendanceQueries(recorder, currentUser.uid, month, reload),
    [recorder, currentUser.uid, month, reload]
  );

  useEffect(() => {
    if (!isFirebaseRuntimeEnabled) return;
    const stops = queries.map(({ name, collection, filter, key }) =>
      dbService.subscribeCollection(
        collection,
        rows => setReceived(previous => ({ ...previous, [name]: { key, rows } })),
        { ...filter, onError: () => setFailure(READ_ERROR) }
      )
    );
    return () => stops.forEach(stop => stop());
  }, [queries]);

  const { workspace, ready } = useMemo(() => {
    // A snapshot still answering an earlier query (another month, before a reload) is not shown as current.
    const current = queries.map(query => received[query.name]?.key === query.key && received[query.name]?.rows);
    const allReceived = current.every(Boolean);
    const snapshots = { ...EMPTY_SNAPSHOTS };
    if (allReceived) queries.forEach((query, index) => (snapshots[query.name] = current[index] || []));
    const base = buildAttendanceWorkspace(currentUser, recorder, month, snapshots);
    const repliesThisMonth = savedSheets.filter(sheet => sheet.month === month);
    return {
      ready: allReceived,
      workspace: {
        ...base,
        sheets: newerSheets(base.sheets, repliesThisMonth),
        calendar: newerCalendar(base.calendar, savedCalendar)
      }
    };
  }, [queries, received, currentUser, recorder, month, savedSheets, savedCalendar]);

  return {
    workspace,
    loading: !ready && !failure,
    error: isFirebaseRuntimeEnabled ? failure : LOCAL_MODE_ERROR,
    reload: () => {
      setFailure('');
      setReload(value => value + 1);
    },
    applySheet: (sheet: TimesheetMonth) =>
      setSavedSheets(previous => [...previous.filter(item => item.id !== sheet.id), sheet]),
    applyCalendar: setSavedCalendar
  };
}
