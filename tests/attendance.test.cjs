const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith('.css')) return {};
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      const candidate = [base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`, base].find(file => fs.existsSync(file));
      if (!candidate) throw new Error(`Missing ${name}`);
      return load(candidate);
    };
    new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
const model = loader()('src/features/attendance/model/attendance.ts');
const admin = { uid: 'boss', displayName: 'Giám đốc', role: 'admin', active: true };
const otherAdmin = { ...admin, uid: 'boss2', displayName: 'Admin 2' };
const worker = { uid: 'worker', displayName: 'Nhân viên A', role: 'producer', active: true };
const other = { ...worker, uid: 'other', displayName: 'Nhân viên B' };
const fullDay = { worked: true, hours: 0, lateMinutes: 10, overtimeHours: 1.5 };
const partDay = { worked: true, hours: 4.25, lateMinutes: 5, overtimeHours: 0 };
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

function backend(extra = {}) {
  const store = new Map(Object.entries(structuredClone({
    'users/boss': admin, 'users/boss2': otherAdmin, 'users/worker': { ...worker, email: 'private@example.test', allowedPages: ['production'] }, 'users/other': other,
    'attendance_settings/worker': { userId: 'worker', employmentType: 'full_time', reviewerId: '', revision: 1 }, ...extra
  })));
  const versions = new Map(); let serial = 0, retries = 0;
  const collection = name => ({ name, doc: id => ({ path: `${name}/${id || `auto${++serial}`}`, id: id || `auto${serial}` }), where: (field, op, value) => ({ name, field, op, value }) });
  const firestore = { collection, runTransaction: async callback => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const reads = new Map(), writes = [];
      const snapshot = ref => { reads.set(ref.path, versions.get(ref.path) || 0); const value = structuredClone(store.get(ref.path)); return { ...ref, exists: !!value, data: () => structuredClone(value) }; };
      const result = await callback({
        get: async ref => {
          assert.equal(writes.length, 0, 'all transaction reads precede writes');
          if (ref.path) return snapshot(ref);
          return { docs: [...store.keys()].filter(key => key.startsWith(`${ref.name}/`)).map(key => snapshot({ path: key, id: key.split('/')[1] })).filter(doc => !ref.field || doc.data()[ref.field] === ref.value) };
        },
        set: (ref, data) => writes.push({ ref, data: structuredClone(data) })
      });
      if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) { retries++; continue; }
      for (const { ref, data } of writes) { store.set(ref.path, data); versions.set(ref.path, (versions.get(ref.path) || 0) + 1); }
      return result;
    }
    throw new Error('too many transaction retries');
  } };
  const manage = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) }, './adminUsers.js': { AdminApiError: ApiError } })('server/attendance.ts').manageAttendance;
  const record = (uid = worker.uid, month = '2026-01') => store.get(`attendance_months/${uid}_${month}`);
  const save = (extra = {}, actor = worker) => manage(actor, { action: 'save_day', userId: actor.uid, month: '2026-01', date: '2026-01-05', day: fullDay,
    employmentType: record(actor.uid)?.employmentType || 'full_time', expectedRevision: record(actor.uid)?.revision || 0, requestId: `r${++serial}`, ...extra });
  const action = (action, actor = worker, extra = {}) => manage(actor, { action, userId: worker.uid, month: '2026-01', expectedRevision: record()?.revision || 0, requestId: `r${++serial}`, ...extra });
  return { manage, store, record, save, action, retries: () => retries };
}
const rejectsStatus = (promise, status) => assert.rejects(promise, error => error.status === status);

test('calendar is Monday-first, handles leap years, 4/5/6 rows and Vietnam date boundaries', () => {
  const october = model.monthCalendar('2026-10');
  assert.equal(october[0], '2026-09-28'); assert.equal(october.length, 35); assert.equal(october[34], '2026-11-01');
  assert.ok(model.monthCalendar('2024-02').includes('2024-02-29'));
  assert.equal(model.monthCalendar('2021-02').length, 28);
  assert.equal(model.monthCalendar('2026-03').length, 42);
  assert.equal(model.businessDate(new Date('2026-01-31T17:01:00Z')), '2026-02-01');
  for (const value of ['', '2026-13', '2026-00', '../2026-01', '2100-01']) assert.throws(() => model.monthCalendar(value));
});
test('day validation rejects wrong month, impossible/future dates, invalid numbers and incompatible employment fields', () => {
  const validate = (date, type, day) => model.validateAttendanceDay(date, '2026-02', type, day, '2026-02-20');
  assert.deepEqual(validate('2026-02-02', 'full_time', fullDay), fullDay);
  assert.deepEqual(validate('2026-02-02', 'part_time', partDay), partDay);
  for (const date of ['2026-02-29', '2026-02-30', '2026-02-21', '2026-01-02', '2026-02-2', '__proto__']) assert.throws(() => validate(date, 'full_time', fullDay));
  for (const patch of [{ lateMinutes: -1 }, { lateMinutes: .5 }, { lateMinutes: 1441 }, { lateMinutes: '5' }, { overtimeHours: NaN }, { overtimeHours: Infinity }, { overtimeHours: 24.01 }, { overtimeHours: .333 }, { worked: false }, { hours: 4 }]) assert.throws(() => validate('2026-02-02', 'full_time', { ...fullDay, ...patch }));
  for (const patch of [{ hours: 0 }, { hours: -1 }, { hours: 25 }, { hours: .123 }, { overtimeHours: 1 }]) assert.throws(() => validate('2026-02-02', 'part_time', { ...partDay, ...patch }));
});
test('totals count days and sessions once per day; decimal hours do not drift', () => {
  const total = model.attendanceTotals({ '2026-01-01': { ...partDay, hours: .1 }, '2026-01-02': { ...partDay, hours: .2 } });
  assert.deepEqual(total, { days: 2, hours: .3, lateMinutes: 10, overtimeHours: 0 });
});
test('first save uses authoritative employee identity/type, canonical record ID, and audit; unrelated data is untouched', async () => {
  const b = backend({ 'inventory/paper': { qty: 50 }, 'pos/po1': { total: 100 } });
  await b.save({ employeeName: 'Fake Name', days: { fake: fullDay }, status: 'approved', revision: 99 });
  assert.equal(b.record().employeeName, worker.displayName); assert.equal(b.record().status, 'draft'); assert.equal(b.record().revision, 1);
  assert.deepEqual(b.record().days, { '2026-01-05': fullDay });
  assert.deepEqual(b.store.get('inventory/paper'), { qty: 50 }); assert.deepEqual(b.store.get('pos/po1'), { total: 100 });
  assert.equal([...b.store.keys()].filter(key => key.startsWith('audit_events/')).length, 1);
});
test('recorded days cannot be directly changed/deleted; manager-approved deletion retains revision and request history', async () => {
  const b = backend(); await b.save();
  await rejectsStatus(b.save({ day: { ...fullDay, lateMinutes: 0, overtimeHours: 2 } }), 403);
  await rejectsStatus(b.action('delete_day', worker, { date: '2026-01-05' }), 403);
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'delete', reason: 'Chấm nhầm ngày', requestId: 'deletion1' });
  assert.deepEqual(b.record().days['2026-01-05'], fullDay);
  await b.action('approve_change', admin, { changeId: 'deletion1' });
  assert.deepEqual(b.record().days, {}); assert.equal(b.record().revision, 3);
  assert.equal(b.record().changeRequests.deletion1.status, 'approved');
  await rejectsStatus(b.action('submit'), 400);
  await rejectsStatus(b.save({ expectedRevision: 0 }), 409);
});
test('private load never returns another employee record, email or user permissions', async () => {
  const b = backend(); await b.save();
  const result = await b.manage(other, { action: 'load', month: '2026-01', userId: 'worker' });
  assert.equal(result.employees.length, 1); assert.equal(result.employees[0].uid, other.uid); assert.deepEqual(result.months, []); assert.deepEqual(result.settings, []);
  const all = await b.manage(admin, { action: 'load', month: '2026-01' });
  assert.equal(all.months.length, 1); assert.equal(all.employees.length, 4); assert.equal(all.employees.find(e => e.uid === worker.uid).email, undefined);
});
test('deleted accounts remain selectable in recorded history without reactivating them', async () => {
  const b = backend(); await b.save(); b.store.delete('users/worker');
  const result = await b.manage(admin, { action: 'load', month: '2026-01' });
  const historical = result.employees.find(person => person.uid === worker.uid);
  assert.equal(historical.displayName, worker.displayName); assert.equal(historical.active, false);
  assert.equal(result.months[0].days['2026-01-05'].worked, true);
});
test('no employee or Admin can punch for others; staff cannot approve, configure or use a locked account', async () => {
  const b = backend();
  await rejectsStatus(b.save({ userId: other.uid }), 403);
  await rejectsStatus(b.save({ userId: worker.uid }, admin), 403);
  await rejectsStatus(b.manage(worker, { action: 'settings', changes: [] }), 403);
  await rejectsStatus(b.action('approve', worker), 403);
  await rejectsStatus(b.manage({ ...worker, active: false }, { action: 'load', month: '2026-01' }), 403);
  assert.equal(b.record(), undefined);
});
test('submit locks both updates and deletes; approve and return enforce state and reason, resubmit clears old review', async () => {
  const b = backend(); await b.save(); await b.action('submit'); assert.equal(b.record().status, 'pending');
  await rejectsStatus(b.save(), 409);
  await rejectsStatus(b.action('delete_day', worker, { date: '2026-01-05', employmentType: 'full_time' }), 403);
  await rejectsStatus(b.action('submit'), 409);
  await b.action('approve', admin); assert.equal(b.record().status, 'approved');
  await rejectsStatus(b.action('approve', admin), 409);
  await rejectsStatus(b.action('return', admin, { reason: ' ' }), 400);
  await b.action('return', admin, { reason: 'Kiểm tra lại OT' }); assert.equal(b.record().returnReason, 'Kiểm tra lại OT');
  await rejectsStatus(b.save({ day: { ...fullDay, overtimeHours: 0 } }), 403);
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'edit', day: { ...fullDay, overtimeHours: 0 }, reason: 'Sửa OT', requestId: 'edit1' });
  await b.action('approve_change', admin, { changeId: 'edit1' }); await b.action('submit');
  assert.equal(b.record().status, 'pending'); assert.equal(b.record().returnReason, undefined); assert.equal(b.record().reviewedBy, undefined);
});
test('concurrent writes from the same revision never overwrite another day', async () => {
  const b = backend();
  const result = await Promise.allSettled([b.save({ expectedRevision: 0 }), b.save({ expectedRevision: 0, date: '2026-01-06' })]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1); assert.ok(b.retries() > 0);
  assert.equal(Object.keys(b.record().days).length, 1);
});
test('a correction is a snapshot proposal; submitting and approving a month waits for pending requests', async () => {
  const b = backend(); await b.save();
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'edit', day: { ...fullDay, overtimeHours: 2 }, reason: 'Bổ sung OT', requestId: 'correction1', before: { hours: 999 }, status: 'approved' });
  const change = b.record().changeRequests.correction1;
  assert.deepEqual(change.before, fullDay); assert.equal(change.status, 'pending');
  assert.deepEqual(b.record().days['2026-01-05'], fullDay);
  await rejectsStatus(b.action('submit'), 409);
  await rejectsStatus(b.action('request_change', worker, { date: '2026-01-05', kind: 'delete', reason: 'Lặp yêu cầu' }), 409);
  await b.action('approve_change', admin, { changeId: 'correction1', day: { ...fullDay, overtimeHours: 999 } });
  assert.equal(b.record().days['2026-01-05'].overtimeHours, 2);
  assert.equal(b.record().changeRequests.correction1.status, 'approved');
  await rejectsStatus(b.action('approve_change', admin, { changeId: 'correction1' }), 409);
  await b.action('submit');
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'delete', reason: 'Chấm nhầm', requestId: 'correction2' });
  await rejectsStatus(b.action('approve', admin), 409);
});
test('rejection requires reason and leaves recorded work unchanged; staff cannot self-approve or change another employee', async () => {
  const b = backend(); await b.save();
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'delete', reason: 'Chấm nhầm', requestId: 'delete1' });
  await rejectsStatus(b.action('approve_change', worker, { changeId: 'delete1' }), 403);
  await rejectsStatus(b.action('reject_change', admin, { changeId: 'delete1', reason: ' ' }), 400);
  await rejectsStatus(b.action('request_change', other, { date: '2026-01-05', kind: 'delete', reason: 'Giả mạo' }), 403);
  await b.action('reject_change', admin, { changeId: 'delete1', reason: 'Đã xác nhận có đi làm' });
  assert.deepEqual(b.record().days['2026-01-05'], fullDay);
  assert.equal(b.record().changeRequests.delete1.responseReason, 'Đã xác nhận có đi làm');
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'edit', day: { ...fullDay, lateMinutes: 0 }, reason: 'Sửa phút trễ' });
  assert.equal(Object.values(b.record().changeRequests).filter(item => item.status === 'pending').length, 1);
});
test('corrections can be requested for an approved month; approval reopens monthly review without unlocking existing days', async () => {
  const b = backend(); await b.save(); await b.action('submit'); await b.action('approve', admin);
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'edit', day: { ...fullDay, lateMinutes: 0 }, reason: 'Kiểm tra lại phút trễ', requestId: 'editApproved' });
  assert.equal(b.record().status, 'approved');
  await b.action('approve_change', admin, { changeId: 'editApproved' });
  assert.equal(b.record().status, 'returned'); assert.equal(b.record().days['2026-01-05'].lateMinutes, 0);
  await rejectsStatus(b.save(), 403);
  await b.action('submit'); assert.equal(b.record().status, 'pending');
});
test('request validation prevents no-op, invalid hours, foreign dates, forged revision and simultaneous duplicate requests', async () => {
  const b = backend(); await b.save();
  const base = { date: '2026-01-05', kind: 'edit', day: { ...fullDay, lateMinutes: 0 }, reason: 'Điều chỉnh' };
  await rejectsStatus(b.action('request_change', worker, { ...base, day: fullDay }), 400);
  await rejectsStatus(b.action('request_change', worker, { ...base, reason: '' }), 400);
  await rejectsStatus(b.action('request_change', worker, { ...base, date: '2026-02-05' }), 404);
  await rejectsStatus(b.action('request_change', worker, { ...base, expectedRevision: 0 }), 409);
  await assert.rejects(b.action('request_change', worker, { ...base, day: { ...fullDay, overtimeHours: -1 } }));
  const results = await Promise.allSettled([b.action('request_change', worker, { ...base, expectedRevision: 1 }), b.action('request_change', worker, { ...base, expectedRevision: 1 })]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(b.record().changeRequests).length, 1);
});
test('assigned reviewers and stale base data are checked on approval; rejection remains available after base changes', async () => {
  const b = backend(); await b.save();
  b.store.set('attendance_settings/worker', { ...b.store.get('attendance_settings/worker'), reviewerId: otherAdmin.uid });
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'delete', reason: 'Xóa nhầm', requestId: 'assigned1' });
  await rejectsStatus(b.action('approve_change', admin, { changeId: 'assigned1' }), 403);
  await rejectsStatus(b.action('reject_change', admin, { changeId: 'assigned1', reason: 'Không đúng' }), 403);
  b.store.set('attendance_months/worker_2026-01', { ...b.record(), days: { '2026-01-05': { ...fullDay, lateMinutes: 1 } } });
  await rejectsStatus(b.action('approve_change', otherAdmin, { changeId: 'assigned1' }), 409);
  await b.action('reject_change', otherAdmin, { changeId: 'assigned1', reason: 'Công gốc đã đổi' });
  assert.equal(b.record().days['2026-01-05'].lateMinutes, 1);
});
test('concurrent approve/reject resolves once and records only the affected day/request in audit', async () => {
  const b = backend(); await b.save(); await b.save({ date: '2026-01-06' });
  await b.action('request_change', worker, { date: '2026-01-05', kind: 'edit', day: { ...fullDay, lateMinutes: 0 }, reason: 'Chỉnh phút trễ', requestId: 'concurrentReview' });
  const revision = b.record().revision;
  const results = await Promise.allSettled([
    b.action('approve_change', admin, { changeId: 'concurrentReview', expectedRevision: revision }),
    b.action('reject_change', admin, { changeId: 'concurrentReview', expectedRevision: revision, reason: 'Không chấp nhận' })
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.deepEqual(b.record().days['2026-01-06'], fullDay);
  const events = [...b.store.entries()].filter(([key]) => key.startsWith('audit_events/')).map(([, value]) => value);
  const review = events.find(event => ['attendance_approve_change', 'attendance_reject_change'].includes(event.action));
  assert.deepEqual(Object.keys(review.after.days), ['2026-01-05']);
  assert.equal(review.before.change.status, 'pending'); assert.ok(['approved', 'rejected'].includes(review.after.change.status));
  assert.equal(review.after.changeRequests, undefined);
});
test('identical acknowledged retries are no-ops; same request ID with altered content is rejected', async () => {
  const b = backend(); const request = { expectedRevision: 0, requestId: 'uniqueRequest' };
  await b.save(request); await b.save(request);
  assert.equal(b.record().revision, 1); assert.equal([...b.store.keys()].filter(key => key.startsWith('audit_events/')).length, 1);
  await rejectsStatus(b.save({ ...request, day: { ...fullDay, lateMinutes: 0 } }), 409);
});
test('configuration requires active employees/admin reviewers and optimistic revisions; whole batch is atomic', async () => {
  const b = backend();
  const setting = { userId: worker.uid, employmentType: 'part_time', reviewerId: admin.uid, expectedRevision: 1 };
  await rejectsStatus(b.manage(admin, { action: 'settings', changes: [{ ...setting, reviewerId: worker.uid }] }), 400);
  await rejectsStatus(b.manage(admin, { action: 'settings', changes: [setting, { ...setting, userId: 'missing' }] }), 400);
  assert.equal(b.store.get('attendance_settings/worker').revision, 1);
  await b.manage(admin, { action: 'settings', changes: [setting] });
  assert.equal(b.store.get('attendance_settings/worker').revision, 2);
  await rejectsStatus(b.manage(admin, { action: 'settings', changes: [setting] }), 409);
});
test('changing employment type preserves entered months and applies to new months; stale UI type cannot silently change interpretation', async () => {
  const b = backend(); await b.save();
  await b.manage(admin, { action: 'settings', changes: [{ userId: worker.uid, employmentType: 'part_time', reviewerId: '', expectedRevision: 1 }] });
  await b.save({ date: '2026-01-06' }); assert.equal(b.record().employmentType, 'full_time');
  await rejectsStatus(b.save({ month: '2026-02', date: '2026-02-02', expectedRevision: 0 }), 409);
  await b.save({ month: '2026-02', date: '2026-02-02', employmentType: 'part_time', expectedRevision: 0, day: partDay });
  assert.equal(b.record(worker.uid, '2026-02').employmentType, 'part_time');
});
test('missing employment configuration blocks entry; inactive assigned reviewer must be corrected on submit', async () => {
  const b = backend(); await rejectsStatus(b.save({}, other), 400);
  await b.save();
  b.store.set('attendance_settings/worker', { ...b.store.get('attendance_settings/worker'), reviewerId: otherAdmin.uid });
  b.store.set('users/boss2', { ...otherAdmin, active: false });
  await rejectsStatus(b.action('submit'), 400);
});
test('reviewer is snapshotted at submission; other Admin cannot override active assignment but can recover if reviewer is gone', async () => {
  const b = backend(); await b.save();
  b.store.set('attendance_settings/worker', { ...b.store.get('attendance_settings/worker'), reviewerId: otherAdmin.uid });
  await b.action('submit'); assert.equal(b.record().reviewerId, otherAdmin.uid);
  b.store.set('attendance_settings/worker', { ...b.store.get('attendance_settings/worker'), reviewerId: admin.uid });
  await rejectsStatus(b.action('approve', admin), 403);
  await b.action('approve', otherAdmin);
  b.store.delete('users/boss2'); await b.action('return', admin, { reason: 'Đối soát lại' });
  assert.equal(b.record().status, 'returned');
});
test('API boundary authenticates before loading, rejects input errors and suppresses internal errors', async () => {
  let reads = 0;
  const stub = { AdminApiError: ApiError, readJsonBody: request => request.json(), jsonResponse: data => Response.json(data), apiErrorResponse: error => Response.json({ error: error instanceof ApiError ? error.message : 'Lỗi máy chủ' }, { status: error.status || 500 }) };
  const endpoint = (auth, manage) => loader({ '../../server/adminUsers.js': stub, '../../server/erpCaller.js': { requireActiveErpCaller: auth }, '../../server/attendance.js': { manageAttendance: manage }, '../../src/features/attendance/model/attendance.js': { AttendanceValidationError: model.AttendanceValidationError } })('api/attendance/manage.ts').POST;
  const request = () => new Request('https://example.test/api/attendance/manage', { method: 'POST', body: JSON.stringify({ action: 'load', month: '2026-01' }) });
  const unauthorized = await endpoint(async () => { throw new ApiError(401, 'Đăng nhập lại'); }, () => reads++)(request());
  assert.equal(unauthorized.status, 401); assert.equal(reads, 0);
  const invalid = await endpoint(async () => worker, () => { throw new model.AttendanceValidationError('Ngày không hợp lệ'); })(request()); assert.equal(invalid.status, 400);
  const internal = await endpoint(async () => worker, () => { throw new TypeError('private stack'); })(request());
  assert.equal(internal.status, 500); assert.ok(!(await internal.text()).includes('private stack'));
});
test('the shared caller verifier rejects revoked tokens, disabled Auth accounts and locked/mismatched ERP profiles', async () => {
  let disabled = false, revoked = false;
  let profile = { ...worker, email: 'worker@example.test' };
  const verify = loader({ './adminUsers.js': { AdminApiError: ApiError }, './firebaseAdmin.js': { getFirebaseAdminServices: () => ({
    auth: { verifyIdToken: async (_token, checkRevoked) => { assert.equal(checkRevoked, true); if (revoked) throw new Error('revoked'); return { uid: worker.uid }; }, getUser: async () => ({ disabled, email: 'worker@example.test' }) },
    firestore: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => profile }) }) }) }
  }) } })('server/erpCaller.ts').requireActiveErpCaller;
  const request = () => new Request('https://example.test', { headers: { Authorization: 'Bearer test-only' } });
  assert.equal((await verify(request())).uid, worker.uid);
  await rejectsStatus(verify(new Request('https://example.test')), 401);
  revoked = true; await rejectsStatus(verify(request()), 401); revoked = false;
  disabled = true; await rejectsStatus(verify(request()), 401); disabled = false;
  profile = { ...profile, active: false }; await rejectsStatus(verify(request()), 403);
  profile = { ...profile, active: true, email: 'someone-else@example.test' }; await rejectsStatus(verify(request()), 403);
});
test('attendance client uses the authenticated server endpoint and reports offline/API errors without local fallback', async () => {
  const originalFetch = global.fetch; const requests = [];
  try {
    const gateway = { isFirebaseRuntimeEnabled: true, authService: { getIdToken: async () => 'test-only' } };
    const api = loader({ '@/infrastructure/firebase/erpDataGateway': gateway })('src/features/attendance/api/attendanceService.ts');
    global.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ success: true, employees: [], settings: [], months: [] }); };
    await api.loadAttendance('2026-01');
    assert.equal(requests[0].url, '/api/attendance/manage'); assert.equal(requests[0].options.headers.Authorization, 'Bearer test-only');
    assert.equal(JSON.parse(requests[0].options.body).action, 'load');
    global.fetch = async () => new Response('<html>Not found</html>', { status: 404 });
    await assert.rejects(api.loadAttendance('2026-01'), /chưa được triển khai/);
    global.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(api.loadAttendance('2026-01'), /Tải lại để kiểm tra dữ liệu/);
    gateway.isFirebaseRuntimeEnabled = false;
    await assert.rejects(api.loadAttendance('2026-01'), /local chưa hỗ trợ/);
  } finally { global.fetch = originalFetch; }
});
test('all active roles, including old explicit allowedPages arrays, can access own attendance without granting production to Sale', () => {
  const access = loader()('src/app/navigation/accessControl.ts');
  for (const role of ['admin', 'sale', 'designer', 'purchaser', 'producer', 'accountant']) {
    assert.ok(access.getDefaultPagesForRole(role).includes('attendance'));
    assert.equal(access.canAccessPage({ ...worker, role, allowedPages: [] }, 'attendance'), true);
  }
  assert.equal(access.canAccessPage(null, 'attendance'), false);
  assert.equal(access.canAccessPage({ ...worker, active: false }, 'attendance'), false);
  assert.equal(access.canAccessPage({ ...worker, role: 'sale', allowedPages: ['production'] }, 'production'), false);
});

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(nodes)];
function screen(file, name, props, initial = {}, stubs = {}) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = []; const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(ast) === 'useState') names.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  }; visit(ast);
  const state = new Map(Object.entries(initial)); let cursor = 0, refCursor = 0; const refs = [];
  const react = { ...React, useEffect() {}, useMemo: cb => cb(), useCallback: cb => cb,
    useRef(value) { const i = refCursor++; return refs[i] ||= { current: value }; },
    useState(value) { const i = cursor++, key = names[i] || `hook${i}`; if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value); return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)]; }
  };
  const Component = loader({ react, '@/infrastructure/firebase/erpDataGateway': {}, ...stubs })(file)[name];
  return { state, render: () => { cursor = 0; refCursor = 0; return Component(props); } };
}
const monthRecord = () => ({ id: 'worker_2026-01', userId: worker.uid, employeeName: worker.displayName, month: '2026-01', employmentType: 'full_time', days: { '2026-01-05': fullDay }, status: 'draft', revision: 1, reviewerId: '', updatedAt: '' });
const workspace = () => ({ employees: [worker, admin], settings: [{ userId: worker.uid, employmentType: 'full_time', reviewerId: '', revision: 1 }], months: [monthRecord()] });
test('UI keeps exactly three main tabs and only the month grid, without summary, annotations or daily-list navigation', () => {
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: worker }, { loading: false, month: '2026-01', workspace: workspace() });
  let tree = ui.render();
  const tabs = nodes(tree).find(node => node.props?.['aria-label'] === 'Phân hệ Chấm công');
  assert.deepEqual(tabs.props.children.map(tab => tab.props.children), ['Chấm công', 'Duyệt chấm công', 'Thiết lập chấm công']);
  assert.equal(tabs.props.children[1].props.disabled, true);
  const calendarDay = date => nodes(tree).find(node => node.type === 'button' && node.props['aria-label']?.startsWith(date));
  assert.equal(calendarDay('05/01/2026').props.disabled, false); calendarDay('05/01/2026').props.onClick(); assert.equal(ui.state.get('editingDate'), '2026-01-05');
  ui.state.set('editingDate', ''); ui.state.set('workspace', { ...workspace(), months: [{ ...monthRecord(), status: 'pending' }] }); tree = ui.render();
  assert.equal(calendarDay('05/01/2026').props.disabled, false, 'recorded locked days can request corrections');
  assert.equal(calendarDay('06/01/2026').props.disabled, true, 'new entries remain locked in a submitted month');
  assert.equal(nodes(tree).filter(node => node.type === 'nav').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'table' || node.type === 'p').length, 0);
  assert.ok(!nodes(tree).some(node => node.props?.className === 'attendance-summary'));
  ui.state.set('editingDate', ''); ui.state.set('workspace', workspace());
  ui.state.set('month', '2099-12'); tree = ui.render();
  assert.ok(nodes(tree).filter(node => node.props?.className?.startsWith('attendance-calendar-day')).every(day => day.props.disabled));
});
test('saving through the calendar dialog calls the API, updates totals/state and emits success only after response', async () => {
  const writes = [], toasts = [];
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: worker }, { loading: false, month: '2026-01', workspace: workspace(), editingDate: '2026-01-06' }, {
    '../api/attendanceService': { mutateAttendance: async body => { writes.push(body); return { ...monthRecord(), days: { ...monthRecord().days, [body.date]: body.day }, revision: 2 }; } },
    '@/shared/feedback/mutationFeedback': { showSuccessToast: text => toasts.push(text), showErrorToast() {} }
  });
  const dialog = nodes(ui.render()).find(node => node.type?.name === 'AttendanceDayDialog');
  await dialog.props.onSave(fullDay);
  assert.equal(writes[0].action, 'save_day'); assert.equal(writes[0].userId, worker.uid); assert.equal(writes[0].expectedRevision, 1);
  assert.equal(ui.state.get('editingDate'), ''); assert.equal(model.attendanceTotals(ui.state.get('workspace').months[0].days).days, 2);
  assert.deepEqual(toasts, ['Đã lưu chấm công.']);
});
test('failed save keeps modal open and emits no success; existing-day deletion sends a request with reason and never calls save', async () => {
  const toasts = [];
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: worker }, { loading: false, month: '2026-01', workspace: workspace(), editingDate: '2026-01-05' }, {
    '../api/attendanceService': { mutateAttendance: async () => { throw new Error('Mất kết nối'); } },
    '@/shared/feedback/mutationFeedback': { showSuccessToast: text => toasts.push(text), showErrorToast() {} }
  });
  await assert.rejects(nodes(ui.render()).find(node => node.type?.name === 'AttendanceDayDialog').props.onSave(fullDay), /Mất kết nối/);
  assert.equal(ui.state.get('editingDate'), '2026-01-05'); assert.deepEqual(toasts, []);
  const requested = []; let saves = 0;
  const dayUI = screen('src/features/attendance/components/AttendanceDayDialog.tsx', 'AttendanceDayDialog', { date: '2026-01-05', employeeName: worker.displayName, employmentType: 'full_time', day: fullDay, onClose() {}, onSave: async () => { saves++; }, onRequest: async (...args) => requested.push(args) });
  assert.ok(nodes(dayUI.render()).filter(node => node.type === 'input').every(input => input.props.disabled));
  nodes(dayUI.render()).find(node => node.type === 'button' && node.props.children === 'Yêu cầu xóa').props.onClick();
  await nodes(dayUI.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(requested.length, 0);
  nodes(dayUI.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Chấm nhầm' } });
  await nodes(dayUI.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(requested, [['delete', null, 'Chấm nhầm']]); assert.equal(saves, 0);
});
test('part-time modal exposes only worked hours and late minutes, never OT or clock-in/out', async () => {
  let saved;
  const ui = screen('src/features/attendance/components/AttendanceDayDialog.tsx', 'AttendanceDayDialog', { date: '2026-01-05', employeeName: worker.displayName, employmentType: 'part_time', onClose() {}, onSave: async day => { saved = day; } });
  const tree = ui.render(); const inputs = nodes(tree).filter(node => node.type === 'input');
  assert.equal(inputs.length, 2); assert.ok(inputs.every(input => input.props.type === 'number'));
  inputs[0].props.onChange({ target: { value: '4.25' } }); inputs[1].props.onChange({ target: { value: '10' } });
  await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(saved, { ...partDay, lateMinutes: 10 });
});
test('existing-day edits require an explicit request, changed values and reason; pending/read-only days expose no change buttons', async () => {
  let saves = 0; const requests = [];
  const props = { date: '2026-01-05', employeeName: worker.displayName, employmentType: 'full_time', day: fullDay, onClose() {}, onSave: async () => saves++, onRequest: async (...args) => requests.push(args) };
  const ui = screen('src/features/attendance/components/AttendanceDayDialog.tsx', 'AttendanceDayDialog', props);
  nodes(ui.render()).find(node => node.type === 'button' && node.props.children === 'Yêu cầu sửa').props.onClick();
  nodes(ui.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Bổ sung OT' } });
  await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(requests.length, 0, 'unchanged values cannot be submitted');
  nodes(ui.render()).find(node => node.type === 'input' && node.props.value === '1.5').props.onChange({ target: { value: '2' } });
  await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(requests, [['edit', { ...fullDay, overtimeHours: 2 }, 'Bổ sung OT']]); assert.equal(saves, 0);
  for (const extra of [{ readOnly: true }, { lastRequest: { status: 'pending', kind: 'edit' } }]) {
    const locked = screen('src/features/attendance/components/AttendanceDayDialog.tsx', 'AttendanceDayDialog', { ...props, ...extra });
    assert.ok(nodes(locked.render()).filter(node => node.type === 'input').every(input => input.props.disabled));
    assert.ok(!nodes(locked.render()).some(node => node.type === 'button' && ['Yêu cầu sửa', 'Yêu cầu xóa', 'Lưu thay đổi', 'Lưu chấm công'].includes(node.props.children)));
  }
});
test('requesting from a day dialog uses request_change, keeps stored work intact and reports pending confirmation', async () => {
  const writes = [], toasts = [];
  const request = { id: 'pendingEdit', date: '2026-01-05', kind: 'edit', status: 'pending', createdAt: '', before: fullDay, after: { ...fullDay, lateMinutes: 0 }, reason: 'Sửa phút trễ', employmentType: 'full_time', reviewerId: '' };
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: worker }, { loading: false, month: '2026-01', workspace: workspace(), editingDate: '2026-01-05' }, {
    '../api/attendanceService': { mutateAttendance: async body => { writes.push(body); return { ...monthRecord(), revision: 2, changeRequests: { pendingEdit: request } }; } },
    '@/shared/feedback/mutationFeedback': { showSuccessToast: text => toasts.push(text), showErrorToast() {} }
  });
  const dialog = nodes(ui.render()).find(node => node.type?.name === 'AttendanceDayDialog');
  await dialog.props.onRequest('edit', request.after, request.reason);
  assert.equal(writes[0].action, 'request_change'); assert.equal(writes[0].userId, worker.uid);
  assert.deepEqual(ui.state.get('workspace').months[0].days['2026-01-05'], fullDay);
  assert.deepEqual(toasts, ['Đã gửi yêu cầu chờ duyệt.']);
  assert.ok(nodes(ui.render()).some(node => node.props?.className === 'attendance-request-status'));
});
test('review UI shows proposed data, only mutates after manager submits, and requires rejection reason', async () => {
  const request = { id: 'edit1', date: '2026-01-05', kind: 'edit', status: 'pending', createdAt: '', before: fullDay, after: { ...fullDay, lateMinutes: 0 }, reason: 'Sửa phút trễ', employmentType: 'full_time', reviewerId: '' };
  const pending = { ...monthRecord(), changeRequests: { edit1: request } }, writes = [];
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: admin }, { loading: false, month: '2026-01', workspace: { ...workspace(), months: [pending] }, tab: 'approval' }, {
    '../api/attendanceService': { mutateAttendance: async body => { writes.push(body); return { ...pending, days: { '2026-01-05': request.after }, revision: 2 }; } },
    '@/shared/feedback/mutationFeedback': { showSuccessToast() {}, showErrorToast() {} }
  });
  nodes(ui.render()).find(node => node.type?.name === 'RowActionMenu').props.actions[0].onSelect();
  assert.equal(writes.length, 0);
  const detail = nodes(ui.render()).find(node => node.type?.name === 'AttendanceChangeReviewDialog');
  assert.deepEqual(detail.props.request.before, fullDay); assert.equal(detail.props.canReview, true);
  await detail.props.onReview(true, '');
  assert.equal(writes[0].action, 'approve_change'); assert.equal(writes[0].changeId, request.id); assert.equal(ui.state.get('reviewingChange'), null);
  const decisions = [];
  const modal = screen('src/features/attendance/components/AttendanceChangeReviewDialog.tsx', 'AttendanceChangeReviewDialog', { employeeName: worker.displayName, request, canReview: true, onClose() {}, onReview: async (...args) => decisions.push(args) });
  nodes(modal.render()).find(node => node.type === 'button' && node.props.children === 'Từ chối').props.onClick();
  await nodes(modal.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); assert.equal(decisions.length, 0);
  nodes(modal.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Công gốc đúng' } });
  await nodes(modal.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(decisions, [[false, 'Công gốc đúng']]);
});
test('approval actions call the real mutation path after confirmation and display the returned status', async () => {
  const writes = [], pending = { ...monthRecord(), status: 'pending' };
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: admin }, { loading: false, month: '2026-01', workspace: { ...workspace(), months: [pending] }, tab: 'approval', approvalKind: 'months' }, {
    '../api/attendanceService': { mutateAttendance: async body => { writes.push(body); return { ...pending, status: 'approved', revision: 2 }; } },
    '@/shared/feedback/deleteConfirmation': { confirmDelete: async () => true },
    '@/shared/feedback/mutationFeedback': { showSuccessToast() {}, showErrorToast() {} }
  });
  const menu = nodes(ui.render()).find(node => node.type?.name === 'RowActionMenu');
  await menu.props.actions.find(action => action.label === 'Duyệt').onSelect();
  // onSelect deliberately fire-and-forgets; flush its awaited confirmation/API continuation.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes[0].action, 'approve'); assert.equal(writes[0].userId, worker.uid);
  assert.equal(ui.state.get('workspace').months[0].status, 'approved');
});
test('settings UI saves only edited employees with original revisions and clears changes after acknowledgment', async () => {
  const writes = [], toasts = [];
  const ui = screen('src/features/attendance/pages/AttendancePage.tsx', 'AttendancePage', { currentUser: admin }, { loading: false, month: '2026-01', workspace: workspace(), tab: 'settings' }, {
    '../api/attendanceService': { saveAttendanceSettings: async changes => { writes.push(changes); } },
    '@/shared/feedback/mutationFeedback': { showSuccessToast: text => toasts.push(text), showErrorToast() {} }
  });
  const select = nodes(ui.render()).find(node => node.type === 'select' && node.props['aria-label'] === `Hình thức làm việc của ${worker.displayName}`);
  select.props.onChange({ target: { value: 'part_time' } });
  assert.equal(ui.state.get('changes')[worker.uid].employmentType, 'part_time');
  await nodes(ui.render()).find(node => node.type === 'button' && node.props.children === 'Lưu thiết lập').props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(writes, [[{ userId: worker.uid, employmentType: 'part_time', reviewerId: '', expectedRevision: 1 }]]);
  assert.deepEqual(ui.state.get('changes'), {}); assert.equal(ui.state.get('loading'), true); assert.deepEqual(toasts, ['Đã lưu thiết lập chấm công.']);
});
test('new attendance collections deny direct Firestore reads and writes; sidebar adds a separate module without replacing work schedules', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const collection of ['attendance_months', 'attendance_settings']) assert.ok(rules.includes(`match /${collection}/{documentId} {\n      allow read, write: if false;`));
  const shell = fs.readFileSync(path.join(root, 'src/app/AppShell.tsx'), 'utf8');
  assert.ok(shell.includes('data-page-id="attendance"')); assert.ok(shell.includes('data-page-id="work_schedule"'));
});
