const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const model = loader()('src/features/attendance/model/timesheet.ts');
const holidays = loader()('src/features/attendance/model/vietnamHolidays.ts');
const admin = { uid: 'boss', displayName: 'Giám đốc', role: 'admin', active: true };
const accountant = { uid: 'accountant', displayName: 'Kế toán', role: 'accountant', active: true };
const sale = { uid: 'sale', displayName: 'Sale', role: 'sale', active: true };
const worker = { uid: 'worker', displayName: 'Nhân viên A', role: 'producer', active: true };
const other = { ...worker, uid: 'other', displayName: 'Nhân viên B' };
const parttime = { ...worker, uid: 'parttime', displayName: 'Part-time C' };
const present = { status: 'present', lateMinutes: 10, overtimeHours: 1.5, note: '' };
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function backend(extra = {}) {
  const store = new Map(
    Object.entries(
      structuredClone({
        'users/boss': admin,
        'users/accountant': accountant,
        'users/sale': sale,
        'users/worker': { ...worker, email: 'private@example.test', allowedPages: ['production'] },
        'users/other': other,
        'users/parttime': parttime,
        'users/gone': { ...other, uid: 'gone', displayName: 'Đã nghỉ việc', active: false },
        'attendance_profiles/parttime': { userId: 'parttime', employmentType: 'part_time', revision: 1 },
        ...extra
      })
    )
  );
  const versions = new Map();
  let serial = 0,
    retries = 0;
  const collection = name => ({
    name,
    doc: id => ({ path: `${name}/${id || `auto${++serial}`}`, id: id || `auto${serial}` }),
    where: (field, op, value) => ({ name, field, op, value })
  });
  const firestore = {
    collection,
    runTransaction: async callback => {
      for (let attempt = 0; attempt < 12; attempt++) {
        const reads = new Map(),
          writes = [];
        const snapshot = ref => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const value = structuredClone(store.get(ref.path));
          return { ...ref, exists: !!value, data: () => structuredClone(value) };
        };
        const result = await callback({
          get: async ref => {
            assert.equal(writes.length, 0, 'all transaction reads precede writes');
            if (ref.path) return snapshot(ref);
            return {
              docs: [...store.keys()]
                .filter(key => key.startsWith(`${ref.name}/`))
                .map(key => snapshot({ path: key, id: key.split('/')[1] }))
                .filter(doc => !ref.field || doc.data()[ref.field] === ref.value)
            };
          },
          set: (ref, data) => writes.push({ ref, data: structuredClone(data) })
        });
        if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) {
          retries++;
          continue;
        }
        for (const { ref, data } of writes) {
          store.set(ref.path, data);
          versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('too many transaction retries');
    }
  };
  const manage = loader({
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
    './adminUsers.js': { AdminApiError: ApiError }
  })('server/attendance.ts').manageAttendance;
  const sheet = (uid = worker.uid, month = '2026-01') => store.get(`attendance_sheets/${uid}_${month}`);
  const calendar = (year = '2026') => store.get(`attendance_calendars/${year}`);
  const audits = () => [...store.keys()].filter(key => key.startsWith('audit_events/')).map(key => store.get(key));
  const save = (extra = {}, actor = admin) =>
    manage(actor, {
      action: 'save_day',
      userId: worker.uid,
      date: '2026-01-05',
      entry: present,
      expectedRevision: sheet(extra.userId || worker.uid, (extra.date || '2026-01-05').slice(0, 7))?.revision || 0,
      requestId: `r${++serial}`,
      ...extra
    });
  const request = (body, actor = admin) => manage(actor, { requestId: `r${++serial}`, ...body });
  return { manage, store, sheet, calendar, audits, save, request, retries: () => retries };
}
const rejectsStatus = (promise, status) => assert.rejects(promise, error => error.status === status);

test('calendar is Monday-first, handles leap years, 4/5/6 rows and Vietnam date boundaries', () => {
  const october = model.monthCalendar('2026-10');
  assert.equal(october[0], '2026-09-28');
  assert.equal(october.length, 35);
  assert.ok(model.monthCalendar('2024-02').includes('2024-02-29'));
  assert.equal(model.monthCalendar('2021-02').length, 28);
  assert.equal(model.monthCalendar('2026-03').length, 42);
  assert.equal(model.monthDays('2026-02').length, 28);
  assert.equal(model.businessDate(new Date('2026-01-31T17:01:00Z')), '2026-02-01');
  for (const value of ['', '2026-13', '2026-00', '../2026-01', '2100-01'])
    assert.throws(() => model.monthCalendar(value));
});

test('lunar holidays follow the Vietnamese calendar (UTC+7), including years where China differs', () => {
  const tet = { 2023: '2023-01-22', 2024: '2024-02-10', 2025: '2025-01-29', 2026: '2026-02-17', 2027: '2027-02-06' };
  for (const [year, date] of Object.entries(tet)) assert.equal(holidays.lunarToSolar(1, 1, Number(year)), date);
  // The new moon falls before midnight in Vietnam but after it in China, so Tết 2030 is 2 Feb here.
  assert.equal(holidays.lunarToSolar(1, 1, 2030), '2030-02-02');
  assert.equal(holidays.lunarToSolar(10, 3, 2024), '2024-04-18');
  assert.equal(holidays.lunarToSolar(10, 3, 2026), '2026-04-26');
  const year2026 = holidays.defaultHolidays(2026);
  assert.deepEqual(
    year2026.filter(day => day.name === 'Tết Nguyên đán').map(day => day.date),
    ['2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20']
  );
  assert.ok(year2026.some(day => day.date === '2026-04-27' && day.name === 'Nghỉ bù Giỗ Tổ Hùng Vương'));
  for (const date of ['2026-01-01', '2026-04-30', '2026-05-01', '2026-09-01', '2026-09-02'])
    assert.ok(
      year2026.some(day => day.date === date),
      date
    );
});

test('a calendar override wins over holidays and Sundays; ordinary weekdays stay workdays', () => {
  assert.deepEqual(model.resolveDay('2026-10-25', undefined), { off: true, name: 'Chủ nhật' });
  assert.deepEqual(model.resolveDay('2026-09-02', undefined), { off: true, name: 'Quốc khánh' });
  assert.deepEqual(model.resolveDay('2026-10-26', undefined), { off: false, name: '' });
  const calendar = {
    overrides: {
      '2026-10-25': { off: false, name: '' },
      '2026-10-26': { off: true, name: 'Công ty nghỉ' },
      '2026-09-01': { off: false, name: '' }
    }
  };
  assert.equal(model.resolveDay('2026-10-25', calendar).off, false);
  assert.deepEqual(model.resolveDay('2026-10-26', calendar), { off: true, name: 'Công ty nghỉ' });
  assert.equal(model.resolveDay('2026-09-01', calendar).off, false);
});

test('entry validation covers each day type, part-time hours, days off, future dates and limits', () => {
  const workday = { off: false, name: '' };
  const holiday = { off: true, name: 'Quốc khánh' };
  const validate = (input, type = 'full_time', day = workday, date = '2026-02-02') =>
    model.validateTimesheetEntry(date, type, input, day, '2026-02-20');
  assert.deepEqual(validate(present), { status: 'present', hours: 0, lateMinutes: 10, overtimeHours: 1.5, note: '' });
  assert.equal(validate({ status: 'half', halfLeave: 'paid', note: ' Khám bệnh ' }).note, 'Khám bệnh');
  assert.equal(validate({ status: 'paid_leave' }).status, 'paid_leave');
  assert.equal(validate({ status: 'present', hours: 4.25 }, 'part_time').hours, 4.25);
  assert.equal(validate(present, 'full_time', holiday).status, 'present', 'working on a day off is recorded normally');
  const invalid = [
    [{ status: 'half' }],
    [{ status: 'absent' }],
    [{ status: 'paid_leave', lateMinutes: 5 }],
    [{ status: 'present', hours: 8 }],
    [{ status: 'present', lateMinutes: 1.5 }],
    [{ status: 'present', overtimeHours: 25 }],
    [{ status: 'present', overtimeHours: 1.234 }],
    [{ status: 'present', note: 'x'.repeat(501) }],
    [{ status: 'present' }, 'part_time'],
    [{ status: 'half', halfLeave: 'paid', hours: 4 }, 'part_time'],
    [{ status: 'present', hours: 4, overtimeHours: 1 }, 'part_time'],
    [{ status: 'unpaid_leave' }, 'full_time', holiday],
    [present, 'full_time', workday, '2026-02-21'],
    [present, 'full_time', workday, '2026-02-30']
  ];
  for (const args of invalid) assert.throws(() => validate(...args), model.AttendanceValidationError);
});

test('totals count half days, leave types, lateness, OT and work on days off; unrecorded days count nothing', () => {
  const entry = patch => ({ hours: 0, lateMinutes: 0, overtimeHours: 0, note: '', ...patch });
  const totals = model.timesheetTotals(
    {
      '2026-10-20': entry({ status: 'present', lateMinutes: 15, overtimeHours: 1.25 }),
      '2026-10-21': entry({ status: 'half', halfLeave: 'paid' }),
      '2026-10-22': entry({ status: 'half', halfLeave: 'unpaid', overtimeHours: 0.1 }),
      '2026-10-23': entry({ status: 'paid_leave' }),
      '2026-10-24': entry({ status: 'unpaid_leave' }),
      '2026-10-25': entry({ status: 'present', lateMinutes: 5, overtimeHours: 0.2 })
    },
    undefined
  );
  assert.deepEqual(totals, {
    workDays: 3,
    workHours: 0,
    lateMinutes: 20,
    lateCount: 2,
    paidLeave: 1.5,
    unpaidLeave: 1.5,
    overtimeHours: 1.55,
    offDayWork: 1
  });
});

test('only Admin and Kế toán record attendance; every other role, and a locked account, is refused', async () => {
  const b = backend();
  for (const actor of [sale, worker, { ...admin, active: false }, { ...accountant, active: false }]) {
    await rejectsStatus(b.save({}, actor), 403);
    await rejectsStatus(b.request({ action: 'mark_present', date: '2026-01-05' }, actor), 403);
    await rejectsStatus(b.request({ action: 'set_day_off', date: '2026-01-06', off: true, name: 'Nghỉ' }, actor), 403);
    await rejectsStatus(
      b.request({ action: 'set_profiles', changes: [{ userId: 'worker', employmentType: 'full_time' }] }, actor),
      403
    );
  }
  assert.equal(b.sheet(), undefined);
  await b.save({}, accountant);
  assert.equal(b.sheet().days['2026-01-05'].recordedBy, accountant.uid);
  await b.save({ userId: accountant.uid }, accountant);
  assert.ok(b.sheet(accountant.uid).days['2026-01-05'], 'Kế toán records their own day too');
  assert.equal(model.canRecordAttendance(sale), false);
  assert.equal(model.canRecordAttendance(accountant), true);
});

test('staff load only their own timesheet without other employees, emails or permissions', async () => {
  const b = backend();
  await b.save();
  await b.save({ userId: other.uid });
  const own = await b.manage(sale, { action: 'load', month: '2026-01' });
  assert.equal(own.canRecord, false);
  assert.deepEqual(
    own.employees.map(person => person.uid),
    ['sale']
  );
  assert.deepEqual(own.sheets, []);
  const workerView = await b.manage(worker, { action: 'load', month: '2026-01' });
  assert.deepEqual(
    workerView.sheets.map(sheet => sheet.userId),
    ['worker']
  );
  assert.ok(!JSON.stringify(workerView).includes('private@example.test'));
  const full = await b.manage(accountant, { action: 'load', month: '2026-01' });
  assert.equal(full.canRecord, true);
  assert.equal(full.sheets.length, 2);
  assert.ok(!JSON.stringify(full).includes('allowedPages'));
  assert.ok(!JSON.stringify(full).includes('private@example.test'));
});

test('recorders can save, change and clear a day with revisions, audit and authoritative names', async () => {
  const b = backend();
  await b.save({ employeeName: 'Tên giả', entry: { ...present, recordedBy: 'forged' } });
  const first = b.sheet();
  assert.equal(first.id, 'worker_2026-01');
  assert.equal(first.employeeName, worker.displayName);
  assert.equal(first.days['2026-01-05'].recordedBy, admin.uid);
  assert.equal(first.days['2026-01-05'].employmentType, 'full_time', 'no profile means Full-time');
  await b.save({ entry: { status: 'half', halfLeave: 'unpaid', note: 'Về sớm' } });
  assert.equal(b.sheet().days['2026-01-05'].status, 'half');
  await rejectsStatus(b.save({ expectedRevision: 1 }), 409);
  await b.save({ entry: null });
  assert.deepEqual(b.sheet().days, {});
  assert.equal(b.sheet().revision, 3);
  await rejectsStatus(b.save({ entry: null }), 404);
  assert.deepEqual(
    b.audits().map(event => event.action),
    ['attendance_save_day', 'attendance_save_day', 'attendance_clear_day']
  );
  await rejectsStatus(b.save({ userId: 'gone' }), 400);
  await assert.rejects(b.save({ userId: 'parttime' }), /giờ làm lớn hơn 0/);
  await b.save({ userId: 'parttime', entry: { status: 'present', hours: 4.5, lateMinutes: 0 } });
  assert.equal(b.sheet('parttime').days['2026-01-05'].employmentType, 'part_time');
});

test('concurrent saves from the same revision never overwrite another day', async () => {
  const b = backend();
  const results = await Promise.allSettled([
    b.save({ date: '2026-01-05', expectedRevision: 0 }),
    b.save({ date: '2026-01-06', expectedRevision: 0 })
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(b.sheet().days).length, 1);
  assert.ok(b.retries() > 0);
});

test('mark present fills only active Full-time staff without an entry and refuses days off', async () => {
  const b = backend();
  await b.save({ userId: other.uid, entry: { status: 'paid_leave' } });
  const result = await b.request({ action: 'mark_present', date: '2026-01-05' }, accountant);
  assert.equal(result.skippedPartTime, 1);
  assert.equal(b.sheet(other.uid).days['2026-01-05'].status, 'paid_leave', 'recorded days are never overwritten');
  for (const uid of ['boss', 'accountant', 'sale', 'worker'])
    assert.equal(b.sheet(uid).days['2026-01-05'].status, 'present', uid);
  assert.equal(b.sheet('gone'), undefined);
  assert.equal(b.sheet('parttime'), undefined);
  assert.equal(result.marked, 4);
  await assert.rejects(b.request({ action: 'mark_present', date: '2026-01-04' }), /Chủ nhật là ngày nghỉ/);
  await assert.rejects(b.request({ action: 'mark_present', date: '2026-01-01' }), /Tết Dương lịch là ngày nghỉ/);
});

test('identical retries return the first result; a reused request ID with other content is rejected', async () => {
  const b = backend();
  const body = { action: 'mark_present', date: '2026-01-05', requestId: 'same' };
  const first = await b.manage(admin, body);
  const revision = b.sheet().revision;
  assert.deepEqual(await b.manage(admin, body), first);
  assert.equal(b.sheet().revision, revision);
  await rejectsStatus(b.manage(admin, { ...body, date: '2026-01-06' }), 409);
  await rejectsStatus(b.manage(accountant, body), 409);
});

test('days off can be added, cancelled and reset; leave cannot be recorded on them but work can', async () => {
  const b = backend();
  await rejectsStatus(
    b.request({ action: 'set_day_off', date: '2026-01-06', off: true, name: '', expectedRevision: 0 }),
    400
  );
  await b.request({ action: 'set_day_off', date: '2026-01-06', off: true, name: 'Công ty nghỉ', expectedRevision: 0 });
  assert.deepEqual(b.calendar().overrides['2026-01-06'], { off: true, name: 'Công ty nghỉ' });
  await assert.rejects(b.save({ date: '2026-01-06', entry: { status: 'unpaid_leave' } }), /Ngày nghỉ không cần chấm/);
  await b.save({ date: '2026-01-06' });
  assert.equal(b.sheet().days['2026-01-06'].status, 'present');
  await rejectsStatus(b.request({ action: 'set_day_off', date: '2026-01-04', off: false, expectedRevision: 0 }), 409);
  await b.request({ action: 'set_day_off', date: '2026-01-04', off: false, expectedRevision: 1 });
  await b.save({ date: '2026-01-04', entry: { status: 'unpaid_leave' } });
  await b.request({ action: 'set_day_off', date: '2026-01-06', off: null, expectedRevision: 2 });
  assert.equal(b.calendar().overrides['2026-01-06'], undefined);
  assert.equal(b.calendar().revision, 3);
  await rejectsStatus(b.request({ action: 'set_day_off', date: '2026-01-06', off: null, expectedRevision: 3 }), 400);
});

test('employment profiles require active staff and current revisions; the whole batch is atomic', async () => {
  const b = backend();
  const set = (changes, actor = admin) => b.request({ action: 'set_profiles', changes }, actor);
  await rejectsStatus(
    set([
      { userId: 'worker', employmentType: 'part_time', expectedRevision: 0 },
      { userId: 'gone', employmentType: 'part_time', expectedRevision: 0 }
    ]),
    400
  );
  assert.equal(b.store.get('attendance_profiles/worker'), undefined);
  await rejectsStatus(set([{ userId: 'parttime', employmentType: 'full_time', expectedRevision: 0 }]), 409);
  await set([{ userId: 'worker', employmentType: 'part_time', expectedRevision: 0 }], accountant);
  assert.equal(b.store.get('attendance_profiles/worker').employmentType, 'part_time');
  await assert.rejects(b.save(), /giờ làm lớn hơn 0/);
});

test('inactive accounts with a recorded month stay visible to recorders under the stored name', async () => {
  const b = backend({
    'attendance_sheets/left_2026-01': {
      id: 'left_2026-01',
      userId: 'left',
      employeeName: 'Đã xóa',
      month: '2026-01',
      days: {},
      revision: 1
    }
  });
  const data = await b.manage(admin, { action: 'load', month: '2026-01' });
  assert.deepEqual(
    data.employees.find(person => person.uid === 'left'),
    { uid: 'left', displayName: 'Đã xóa', role: '', active: false }
  );
});

test('API boundary authenticates before loading, rejects input errors and suppresses internal errors', async () => {
  let reads = 0;
  const stub = {
    AdminApiError: ApiError,
    readJsonBody: request => request.json(),
    jsonResponse: data => Response.json(data),
    apiErrorResponse: error =>
      Response.json(
        { error: error instanceof ApiError ? error.message : 'Lỗi máy chủ' },
        { status: error.status || 500 }
      )
  };
  const endpoint = (auth, manage) =>
    loader({
      '../../server/adminUsers.js': stub,
      '../../server/erpCaller.js': { requireActiveErpCaller: auth },
      '../../server/attendance.js': { manageAttendance: manage },
      '../../src/features/attendance/model/timesheet.js': {
        AttendanceValidationError: model.AttendanceValidationError
      }
    })('api/attendance/manage.ts').POST;
  const request = () =>
    new Request('https://example.test/api/attendance/manage', {
      method: 'POST',
      body: JSON.stringify({ action: 'load', month: '2026-01' })
    });
  const unauthorized = await endpoint(
    async () => {
      throw new ApiError(401, 'Đăng nhập lại');
    },
    () => reads++
  )(request());
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0);
  const invalid = await endpoint(
    async () => worker,
    () => {
      throw new model.AttendanceValidationError('Ngày không hợp lệ');
    }
  )(request());
  assert.equal(invalid.status, 400);
  const internal = await endpoint(
    async () => worker,
    () => {
      throw new TypeError('private stack');
    }
  )(request());
  assert.equal(internal.status, 500);
  assert.ok(!(await internal.text()).includes('private stack'));
});

test('the shared caller verifier rejects revoked tokens, disabled Auth accounts and locked/mismatched ERP profiles', async () => {
  let disabled = false,
    revoked = false;
  let profile = { ...worker, email: 'worker@example.test' };
  const verify = loader({
    './adminUsers.js': { AdminApiError: ApiError },
    './firebaseAdmin.js': {
      getFirebaseAdminServices: () => ({
        auth: {
          verifyIdToken: async (_token, checkRevoked) => {
            assert.equal(checkRevoked, true);
            if (revoked) throw new Error('revoked');
            return { uid: worker.uid };
          },
          getUser: async () => ({ disabled, email: 'worker@example.test' })
        },
        firestore: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => profile }) }) }) }
      })
    }
  })('server/erpCaller.ts').requireActiveErpCaller;
  const request = () => new Request('https://example.test', { headers: { Authorization: 'Bearer test-only' } });
  assert.equal((await verify(request())).uid, worker.uid);
  await rejectsStatus(verify(new Request('https://example.test')), 401);
  revoked = true;
  await rejectsStatus(verify(request()), 401);
  revoked = false;
  disabled = true;
  await rejectsStatus(verify(request()), 401);
  disabled = false;
  profile = { ...profile, active: false };
  await rejectsStatus(verify(request()), 403);
  profile = { ...profile, active: true, email: 'someone-else@example.test' };
  await rejectsStatus(verify(request()), 403);
});

test('all active roles can open attendance (Bảng công) without granting production to Sale', () => {
  const access = loader()('src/app/navigation/accessControl.ts');
  for (const role of ['admin', 'sale', 'designer', 'purchaser', 'producer', 'accountant']) {
    assert.ok(access.getDefaultPagesForRole(role).includes('attendance'));
    assert.equal(access.canAccessPage({ ...worker, role, allowedPages: [] }, 'attendance'), true);
  }
  assert.equal(access.canAccessPage(null, 'attendance'), false);
  assert.equal(access.canAccessPage({ ...worker, active: false }, 'attendance'), false);
  assert.equal(access.canAccessPage({ ...worker, role: 'sale', allowedPages: ['production'] }, 'production'), false);
});

test('attendance collections, including the retired ones, deny every direct Firestore read and write', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const collection of [
    'attendance_sheets',
    'attendance_profiles',
    'attendance_calendars',
    'attendance_requests',
    'attendance_months',
    'attendance_settings'
  ])
    assert.match(rules, new RegExp(`match /${collection}/\\{documentId\\} \\{\\s*allow read, write: if false;`));
  const shell = fs.readFileSync(path.join(root, 'src/app/AppShell.tsx'), 'utf8');
  assert.ok(shell.includes('data-page-id="attendance"'));
  assert.ok(shell.includes('data-page-id="work_schedule"'));
});
