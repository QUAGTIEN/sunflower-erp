import { createHash } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  assertAttendanceMonth, businessDate, isAttendanceAdmin, validateAttendanceDay,
  type AttendanceActor, type AttendanceMonth, type AttendanceSetting, type AttendanceEmployee, type EmploymentType
} from '../src/features/attendance/model/attendance.js';

const fail = (status: number, message: string): never => { throw new AdminApiError(status, message); };
const identifier = (value: unknown): string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : fail(400, 'Mã nhân viên không hợp lệ.');
const assertRevision = (expected: unknown, actual: number) => {
  if (expected !== actual) fail(409, 'Dữ liệu vừa được cập nhật ở phiên khác. Tải lại trước khi tiếp tục.');
};
const employee = (id: string, data: Record<string, unknown>): AttendanceEmployee => ({
  uid: id, displayName: String(data.displayName || id), role: String(data.role || ''), active: data.active === true
});

/** All reads and writes go through this API; no client access to attendance collections. */
export async function manageAttendance(actor: AttendanceActor, body: Record<string, unknown>) {
  if (!actor.active) fail(403, 'Tài khoản đã bị khóa.');
  const admin = isAttendanceAdmin(actor), action = String(body.action);
  const { firestore } = getFirebaseAdminServices();
  if (action === 'load') {
    assertAttendanceMonth(body.month);
    const month = body.month;
    return firestore.runTransaction(async tx => {
      if (admin) {
        const [users, settings, months] = await Promise.all([
          tx.get(firestore.collection('users')), tx.get(firestore.collection('attendance_settings')),
          tx.get(firestore.collection('attendance_months').where('month', '==', month))
        ]);
        const employees = users.docs.map(doc => employee(doc.id, doc.data()));
        // Account deletion must not make an already recorded employee disappear from history.
        for (const doc of months.docs) {
          const data = doc.data();
          if (!employees.some(person => person.uid === data.userId)) employees.push({ uid: String(data.userId), displayName: String(data.employeeName), role: '', active: false });
        }
        return { success: true, employees,
          settings: settings.docs.map(doc => ({ ...doc.data(), userId: doc.id })),
          months: months.docs.map(doc => ({ ...doc.data(), id: doc.id })) };
      }
      const [setting, record] = await Promise.all([
        tx.get(firestore.collection('attendance_settings').doc(actor.uid)),
        tx.get(firestore.collection('attendance_months').doc(`${actor.uid}_${month}`))
      ]);
      return { success: true, employees: [employee(actor.uid, { ...actor })],
        settings: setting.exists ? [{ ...setting.data(), userId: actor.uid }] : [],
        months: record.exists ? [{ ...record.data(), id: record.id }] : [] };
    });
  }
  if (action === 'settings') {
    if (!admin) fail(403, 'Chỉ Admin được thiết lập chấm công.');
    if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 200) fail(400, 'Mỗi lần lưu từ 1 đến 200 thiết lập nhân viên.');
    const changes = (body.changes as Record<string, unknown>[]).map(change => {
      if (!change || typeof change !== 'object') return fail(400, 'Thiết lập không hợp lệ.');
      const userId = identifier(change.userId), reviewerId = change.reviewerId === '' ? '' : identifier(change.reviewerId);
      if (!['full_time', 'part_time'].includes(String(change.employmentType))) fail(400, 'Chọn Full-time hoặc Part-time.');
      return { userId, employmentType: change.employmentType as EmploymentType, reviewerId, expectedRevision: change.expectedRevision };
    });
    if (new Set(changes.map(change => change.userId)).size !== changes.length) fail(400, 'Nhân viên bị trùng trong thiết lập.');
    return firestore.runTransaction(async tx => {
      const loaded = await Promise.all(changes.map(async change => ({ change,
        user: await tx.get(firestore.collection('users').doc(change.userId)),
        previous: await tx.get(firestore.collection('attendance_settings').doc(change.userId)),
        reviewer: change.reviewerId ? await tx.get(firestore.collection('users').doc(change.reviewerId)) : null
      })));
      for (const { change, user, previous, reviewer } of loaded) {
        if (!user.exists || user.data()?.active !== true) fail(400, 'Chỉ thiết lập cho nhân viên đang hoạt động.');
        if (reviewer && (reviewer.data()?.active !== true || reviewer.data()?.role !== 'admin')) fail(400, 'Người duyệt phải là Admin đang hoạt động.');
        assertRevision(change.expectedRevision, Number(previous.data()?.revision || 0));
      }
      const now = new Date().toISOString();
      for (const { change, previous } of loaded) {
        const next = { userId: change.userId, employmentType: change.employmentType, reviewerId: change.reviewerId,
          revision: Number(previous.data()?.revision || 0) + 1, updatedAt: now, updatedBy: actor.uid };
        tx.set(firestore.collection('attendance_settings').doc(change.userId), next);
        tx.set(firestore.collection('audit_events').doc(), { actorId: actor.uid, actorName: actor.displayName, actorRole: actor.role,
          module: 'attendance', category: 'attendance', action: 'attendance_settings', targetId: change.userId,
          before: previous.data() || null, after: next, summary: 'Cập nhật thiết lập chấm công', occurredAt: now, createdAt: now, sessionId: 'attendance-api' });
      }
      return { success: true };
    });
  }
  if (!['save_day', 'delete_day', 'submit', 'approve', 'return'].includes(action)) fail(400, 'Thao tác chấm công không hợp lệ.');
  const userId = identifier(body.userId);
  assertAttendanceMonth(body.month);
  const month = body.month;
  const review = action === 'approve' || action === 'return';
  if (review ? !admin : userId !== actor.uid) fail(403, review ? 'Chỉ Admin được duyệt chấm công.' : 'Bạn chỉ được cập nhật chấm công của mình.');
  const requestId = identifier(body.requestId);
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const ref = firestore.collection('attendance_months').doc(`${userId}_${month}`);
  return firestore.runTransaction(async tx => {
    const previousDoc = await tx.get(ref);
    const previous = previousDoc.data() as (AttendanceMonth & { lastRequestId?: string; lastRequestHash?: string }) | undefined;
    if (previous?.lastRequestId === requestId) {
      if (previous.lastRequestHash !== fingerprint) fail(409, 'Mã yêu cầu đã dùng cho nội dung khác. Tải lại để tiếp tục.');
      return { success: true, record: previous };
    }
    assertRevision(body.expectedRevision, previous?.revision || 0);
    const settingDoc = await tx.get(firestore.collection('attendance_settings').doc(userId));
    const setting = settingDoc.data() as AttendanceSetting | undefined;
    if (!setting || !['full_time', 'part_time'].includes(setting.employmentType)) fail(400, 'Admin cần thiết lập hình thức làm việc trước khi chấm công.');
    const hasDays = previous && Object.keys(previous.days).length > 0;
    const type = hasDays ? previous.employmentType : setting!.employmentType;
    const now = new Date().toISOString();
    const record: AttendanceMonth = previous ? structuredClone(previous) : {
      id: ref.id, userId, employeeName: actor.displayName, month, employmentType: type, days: {}, status: 'draft', revision: 0, reviewerId: '', updatedAt: now
    };
    if (!review && !['draft', 'returned'].includes(record.status)) fail(409, 'Tháng đang chờ duyệt hoặc đã duyệt. Admin cần trả về trước khi chỉnh sửa.');
    if (action === 'save_day' || action === 'delete_day') {
      if (body.employmentType !== type) fail(409, 'Hình thức làm việc đã thay đổi. Tải lại trước khi chấm công.');
      if (typeof body.date !== 'string' || !body.date.startsWith(`${month}-`)) fail(400, 'Ngày chấm công không hợp lệ.');
      if (action === 'save_day') {
        if (!body.day || typeof body.day !== 'object' || Array.isArray(body.day)) fail(400, 'Dữ liệu chấm công không hợp lệ.');
        record.days[body.date as string] = validateAttendanceDay(body.date, month, type, body.day as Record<string, unknown>, businessDate());
      } else {
        if (!record.days[body.date as string]) fail(404, 'Ngày này chưa có chấm công để xóa.');
        delete record.days[body.date as string];
      }
      record.employmentType = type;
    }
    if (action === 'submit') {
      if (!Object.keys(record.days).length) fail(400, 'Chưa có ngày chấm công để gửi duyệt.');
      if (setting!.reviewerId) {
        const reviewer = (await tx.get(firestore.collection('users').doc(setting!.reviewerId))).data();
        if (reviewer?.role !== 'admin' || reviewer.active !== true) fail(400, 'Người duyệt đã ngừng hoạt động. Nhờ Admin cập nhật thiết lập.');
      }
      record.status = 'pending'; record.submittedAt = now; record.reviewerId = setting!.reviewerId || '';
      delete record.returnReason; delete record.reviewedAt; delete record.reviewedBy;
    }
    if (review) {
      if (record.reviewerId && record.reviewerId !== actor.uid) {
        const assigned = (await tx.get(firestore.collection('users').doc(record.reviewerId))).data();
        if (assigned?.active === true && assigned.role === 'admin') fail(403, 'Tháng này đã được phân cho Admin khác duyệt.');
      }
      if (action === 'approve' && record.status !== 'pending') fail(409, 'Chỉ duyệt tháng đang chờ duyệt.');
      if (action === 'return' && !['pending', 'approved'].includes(record.status)) fail(409, 'Chỉ trả về tháng đang chờ duyệt hoặc đã duyệt.');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (action === 'return' && (!reason || reason.length > 1000)) fail(400, 'Nhập lý do trả về (tối đa 1.000 ký tự).');
      record.status = action === 'approve' ? 'approved' : 'returned';
      record.reviewedAt = now; record.reviewedBy = actor.displayName;
      if (action === 'return') record.returnReason = reason;
    }
    record.revision += 1; record.updatedAt = now;
    tx.set(ref, { ...record, lastRequestId: requestId, lastRequestHash: fingerprint });
    tx.set(firestore.collection('audit_events').doc(), { actorId: actor.uid, actorName: actor.displayName, actorRole: actor.role,
      category: 'attendance', module: 'attendance', action: `attendance_${action}`, targetId: ref.id,
      summary: `${record.employeeName} · ${month}: ${action}`, before: previous || null, after: record,
      occurredAt: now, createdAt: now, sessionId: 'attendance-api' });
    return { success: true, record };
  });
}
