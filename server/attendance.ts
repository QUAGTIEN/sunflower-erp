import { createHash } from 'node:crypto';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  assertAttendanceDate,
  assertAttendanceMonth,
  businessDate,
  canRecordAttendance,
  resolveDay,
  validateTimesheetEntry,
  type AttendanceActor,
  type AttendanceCalendar,
  type AttendanceEmployee,
  type EmployeeProfile,
  type EmploymentType,
  type TimesheetEntry,
  type TimesheetMonth
} from '../src/features/attendance/model/timesheet.js';

const SHEETS = 'attendance_sheets';
const PROFILES = 'attendance_profiles';
const CALENDARS = 'attendance_calendars';
const REQUESTS = 'attendance_requests';

const fail = (status: number, message: string): never => {
  throw new AdminApiError(status, message);
};
const identifier = (value: unknown, label = 'Mã nhân viên'): string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : fail(400, `${label} không hợp lệ.`);
const assertRevision = (expected: unknown, actual: number) => {
  if (expected !== actual) fail(409, 'Dữ liệu vừa được cập nhật ở phiên khác. Tải lại trước khi tiếp tục.');
};
const employee = (id: string, data: Record<string, unknown>): AttendanceEmployee => ({
  uid: id,
  displayName: String(data.displayName || id),
  role: String(data.role || ''),
  active: data.active === true
});
const emptyCalendar = (year: number): AttendanceCalendar => ({ year, overrides: {}, revision: 0 });
// Without a saved profile an employee is Full-time, the common case; Admin/Kế toán switch Part-time explicitly.
const employmentTypeOf = (profile: Record<string, unknown> | undefined): EmploymentType =>
  profile?.employmentType === 'part_time' ? 'part_time' : 'full_time';
const sheetId = (userId: string, month: string) => `${userId}_${month}`;

function audit(
  tx: Transaction,
  firestore: Firestore,
  actor: AttendanceActor,
  event: { action: string; targetId: string; summary: string; before: unknown; after: unknown }
) {
  const now = new Date().toISOString();
  tx.set(firestore.collection('audit_events').doc(), {
    actorId: actor.uid,
    actorName: actor.displayName,
    actorRole: actor.role,
    module: 'attendance',
    category: 'attendance',
    action: `attendance_${event.action}`,
    targetId: event.targetId,
    summary: event.summary,
    before: event.before ?? null,
    after: event.after ?? null,
    occurredAt: now,
    createdAt: now,
    sessionId: 'attendance-api'
  });
}

/** A retried request with the same ID and content returns the first result instead of writing twice. */
async function replayedResult(tx: Transaction, ref: DocumentReference, actorId: string, fingerprint: string) {
  const previous = await tx.get(ref);
  if (!previous.exists) return null;
  const data = previous.data()!;
  if (data.actorId !== actorId || data.fingerprint !== fingerprint)
    fail(409, 'Mã yêu cầu đã dùng cho nội dung khác. Tải lại để tiếp tục.');
  return data.result as Record<string, unknown>;
}

async function loadWorkspace(firestore: Firestore, actor: AttendanceActor, month: string) {
  const recorder = canRecordAttendance(actor);
  const calendarRef = firestore.collection(CALENDARS).doc(month.slice(0, 4));
  // Loading only reads, so a read-only transaction keeps one consistent snapshot without write locks.
  return firestore.runTransaction(
    async tx => {
      if (!recorder) {
        const [profile, sheet, calendar] = await Promise.all([
          tx.get(firestore.collection(PROFILES).doc(actor.uid)),
          tx.get(firestore.collection(SHEETS).doc(sheetId(actor.uid, month))),
          tx.get(calendarRef)
        ]);
        return {
          success: true,
          canRecord: false,
          employees: [employee(actor.uid, { ...actor })],
          profiles: profile.exists ? [{ ...profile.data(), userId: actor.uid }] : [],
          sheets: sheet.exists ? [{ ...sheet.data(), id: sheet.id }] : [],
          calendar: calendar.exists ? calendar.data() : emptyCalendar(Number(month.slice(0, 4)))
        };
      }
      const [users, profiles, sheets, calendar] = await Promise.all([
        tx.get(firestore.collection('users')),
        tx.get(firestore.collection(PROFILES)),
        tx.get(firestore.collection(SHEETS).where('month', '==', month)),
        tx.get(calendarRef)
      ]);
      const employees = users.docs.map(doc => employee(doc.id, doc.data()));
      // A deleted account keeps its recorded month visible under the name stored on the sheet.
      for (const doc of sheets.docs) {
        const data = doc.data();
        if (!employees.some(person => person.uid === data.userId))
          employees.push({ uid: String(data.userId), displayName: String(data.employeeName), role: '', active: false });
      }
      return {
        success: true,
        canRecord: true,
        employees,
        profiles: profiles.docs.map(doc => ({ ...doc.data(), userId: doc.id })),
        sheets: sheets.docs.map(doc => ({ ...doc.data(), id: doc.id })),
        calendar: calendar.exists ? calendar.data() : emptyCalendar(Number(month.slice(0, 4)))
      };
    },
    { readOnly: true }
  );
}

/** All attendance reads and writes go through this API; Firestore rules deny every client access. */
export async function manageAttendance(actor: AttendanceActor, body: Record<string, unknown>) {
  if (!actor.active) fail(403, 'Tài khoản đã bị khóa.');
  const action = String(body.action);
  const { firestore } = getFirebaseAdminServices();
  if (action === 'load') {
    assertAttendanceMonth(body.month);
    return loadWorkspace(firestore, actor, body.month);
  }
  if (!['save_day', 'mark_present', 'set_profiles', 'set_day_off'].includes(action))
    fail(400, 'Thao tác chấm công không hợp lệ.');
  if (!canRecordAttendance(actor)) fail(403, 'Chỉ Admin và Kế toán được chấm công.');
  const requestId = identifier(body.requestId, 'Mã yêu cầu');
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const requestRef = firestore.collection(REQUESTS).doc(requestId);
  const handlers = { save_day: saveDay, mark_present: markPresent, set_profiles: setProfiles, set_day_off: setDayOff };
  return firestore.runTransaction(async tx => {
    const replay = await replayedResult(tx, requestRef, actor.uid, fingerprint);
    if (replay) return replay;
    const result = await handlers[action as keyof typeof handlers](tx, firestore, actor, body);
    tx.set(requestRef, {
      actorId: actor.uid,
      action,
      fingerprint,
      result,
      createdAt: new Date().toISOString()
    });
    return result;
  });
}

const entryFrom = (
  input: ReturnType<typeof validateTimesheetEntry>,
  type: EmploymentType,
  actor: AttendanceActor,
  now: string
): TimesheetEntry => ({
  ...input,
  employmentType: type,
  recordedBy: actor.uid,
  recordedByName: actor.displayName,
  recordedAt: now
});
const newSheet = (userId: string, employeeName: string, month: string): TimesheetMonth => ({
  id: sheetId(userId, month),
  userId,
  employeeName,
  month,
  days: {},
  revision: 0,
  updatedAt: ''
});

async function saveDay(tx: Transaction, firestore: Firestore, actor: AttendanceActor, body: Record<string, unknown>) {
  const userId = identifier(body.userId);
  assertAttendanceDate(body.date);
  const date = body.date;
  const month = date.slice(0, 7);
  const sheetRef = firestore.collection(SHEETS).doc(sheetId(userId, month));
  const [sheetDoc, userDoc, profileDoc, calendarDoc] = await Promise.all([
    tx.get(sheetRef),
    tx.get(firestore.collection('users').doc(userId)),
    tx.get(firestore.collection(PROFILES).doc(userId)),
    tx.get(firestore.collection(CALENDARS).doc(month.slice(0, 4)))
  ]);
  const previous = sheetDoc.data() as TimesheetMonth | undefined;
  assertRevision(body.expectedRevision, previous?.revision || 0);
  const user = userDoc.data();
  if (!previous && user?.active !== true) fail(400, 'Chỉ chấm công cho nhân viên đang hoạt động.');
  const sheet = previous ? structuredClone(previous) : newSheet(userId, String(user?.displayName || userId), month);
  const before = sheet.days[date] || null;
  const now = new Date().toISOString();
  if (body.entry === null) {
    if (!before) fail(404, 'Ngày này chưa được chấm công.');
    delete sheet.days[date];
  } else {
    if (!body.entry || typeof body.entry !== 'object' || Array.isArray(body.entry))
      fail(400, 'Dữ liệu chấm công không hợp lệ.');
    const type = employmentTypeOf(profileDoc.data());
    const calendar = calendarDoc.data() as AttendanceCalendar | undefined;
    const input = validateTimesheetEntry(
      date,
      type,
      body.entry as Record<string, unknown>,
      resolveDay(date, calendar),
      businessDate()
    );
    sheet.days[date] = entryFrom(input, type, actor, now);
  }
  sheet.revision += 1;
  sheet.updatedAt = now;
  tx.set(sheetRef, sheet);
  audit(tx, firestore, actor, {
    action: body.entry === null ? 'clear_day' : 'save_day',
    targetId: sheetRef.id,
    summary: `${sheet.employeeName} · ${date}`,
    before,
    after: sheet.days[date] || null
  });
  return { success: true, sheet };
}

/** Mark every active Full-time employee without an entry as present; recorded days are never overwritten. */
async function markPresent(
  tx: Transaction,
  firestore: Firestore,
  actor: AttendanceActor,
  body: Record<string, unknown>
) {
  assertAttendanceDate(body.date);
  const date = body.date;
  const month = date.slice(0, 7);
  const [users, profiles, sheets, calendarDoc] = await Promise.all([
    tx.get(firestore.collection('users')),
    tx.get(firestore.collection(PROFILES)),
    tx.get(firestore.collection(SHEETS).where('month', '==', month)),
    tx.get(firestore.collection(CALENDARS).doc(month.slice(0, 4)))
  ]);
  const dayInfo = resolveDay(date, calendarDoc.data() as AttendanceCalendar | undefined);
  if (dayInfo.off) fail(400, `${dayInfo.name} là ngày nghỉ. Chấm từng người nếu có đi làm.`);
  const input = validateTimesheetEntry(date, 'full_time', { status: 'present' }, dayInfo, businessDate());
  const profileByUser = new Map(profiles.docs.map(doc => [doc.id, doc.data()]));
  const sheetByUser = new Map(sheets.docs.map(doc => [String(doc.data().userId), doc.data() as TimesheetMonth]));
  const now = new Date().toISOString();
  const marked: string[] = [];
  let skippedPartTime = 0;
  for (const userDoc of users.docs) {
    const user = userDoc.data();
    if (user.active !== true) continue;
    if (employmentTypeOf(profileByUser.get(userDoc.id)) === 'part_time') {
      if (!sheetByUser.get(userDoc.id)?.days[date]) skippedPartTime += 1;
      continue;
    }
    const previous = sheetByUser.get(userDoc.id);
    if (previous?.days[date]) continue;
    const sheet = previous
      ? structuredClone(previous)
      : newSheet(userDoc.id, String(user.displayName || userDoc.id), month);
    sheet.days[date] = entryFrom(input, 'full_time', actor, now);
    sheet.revision += 1;
    sheet.updatedAt = now;
    tx.set(firestore.collection(SHEETS).doc(sheet.id), sheet);
    marked.push(userDoc.id);
  }
  audit(tx, firestore, actor, {
    action: 'mark_present',
    targetId: date,
    summary: `Chấm đi làm ${marked.length} nhân viên ngày ${date}`,
    before: null,
    after: { date, userIds: marked }
  });
  return { success: true, marked: marked.length, skippedPartTime };
}

async function setProfiles(
  tx: Transaction,
  firestore: Firestore,
  actor: AttendanceActor,
  body: Record<string, unknown>
) {
  if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 200)
    fail(400, 'Mỗi lần lưu từ 1 đến 200 nhân viên.');
  const changes = (body.changes as Record<string, unknown>[]).map(change => {
    if (!change || typeof change !== 'object') return fail(400, 'Thiết lập không hợp lệ.');
    if (change.employmentType !== 'full_time' && change.employmentType !== 'part_time')
      fail(400, 'Chọn Full-time hoặc Part-time.');
    return {
      userId: identifier(change.userId),
      employmentType: change.employmentType as EmploymentType,
      expectedRevision: change.expectedRevision
    };
  });
  if (new Set(changes.map(change => change.userId)).size !== changes.length)
    fail(400, 'Nhân viên bị trùng trong thiết lập.');
  const loaded = await Promise.all(
    changes.map(async change => ({
      change,
      user: await tx.get(firestore.collection('users').doc(change.userId)),
      previous: await tx.get(firestore.collection(PROFILES).doc(change.userId))
    }))
  );
  for (const { change, user, previous } of loaded) {
    if (user.data()?.active !== true) fail(400, 'Chỉ thiết lập cho nhân viên đang hoạt động.');
    assertRevision(change.expectedRevision, Number(previous.data()?.revision || 0));
  }
  const now = new Date().toISOString();
  for (const { change, previous } of loaded) {
    const next: EmployeeProfile & { updatedAt: string; updatedBy: string } = {
      userId: change.userId,
      employmentType: change.employmentType,
      revision: Number(previous.data()?.revision || 0) + 1,
      updatedAt: now,
      updatedBy: actor.uid
    };
    tx.set(firestore.collection(PROFILES).doc(change.userId), next);
    audit(tx, firestore, actor, {
      action: 'set_profile',
      targetId: change.userId,
      summary: 'Cập nhật hình thức làm việc',
      before: previous.data() || null,
      after: next
    });
  }
  return { success: true };
}

/** Admin/Kế toán set a company day off, cancel a default one, or return the date to its default. */
async function setDayOff(tx: Transaction, firestore: Firestore, actor: AttendanceActor, body: Record<string, unknown>) {
  assertAttendanceDate(body.date);
  const date = body.date;
  const year = Number(date.slice(0, 4));
  const ref = firestore.collection(CALENDARS).doc(String(year));
  const previous = ((await tx.get(ref)).data() as AttendanceCalendar | undefined) || emptyCalendar(year);
  assertRevision(body.expectedRevision, previous.revision);
  const calendar = structuredClone(previous);
  const before = calendar.overrides[date] || null;
  if (body.off === null) {
    if (!before) fail(400, 'Ngày này đang theo lịch mặc định.');
    delete calendar.overrides[date];
  } else {
    if (typeof body.off !== 'boolean') fail(400, 'Chọn ngày nghỉ hoặc ngày làm việc.');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (body.off && (!name || name.length > 100)) fail(400, 'Nhập tên ngày nghỉ (tối đa 100 ký tự).');
    calendar.overrides[date] = { off: body.off as boolean, name: body.off ? name : '' };
  }
  calendar.revision += 1;
  tx.set(ref, { ...calendar, updatedAt: new Date().toISOString(), updatedBy: actor.uid });
  audit(tx, firestore, actor, {
    action: 'set_day_off',
    targetId: date,
    summary: `Cập nhật lịch ngày ${date}`,
    before,
    after: calendar.overrides[date] || null
  });
  return { success: true, calendar };
}
