const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
const loadScheduleModel = () => {
  const source = read('src/features/work-schedule/model/workScheduleModels.ts');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', compiled)(module, module.exports);
  return module.exports;
};

test('new and existing work items keep their status codes with clear labels', () => {
  const { normalizeWorkScheduleRecord, WORK_SCHEDULE_STATUS_LABELS } = loadScheduleModel();
  assert.equal(normalizeWorkScheduleRecord({ status: 'not_started' }).status, 'not_started');
  assert.equal(normalizeWorkScheduleRecord({ status: 'in_progress' }).status, 'in_progress');
  assert.equal(normalizeWorkScheduleRecord({ status: 'paused' }).status, 'in_progress');
  assert.equal(WORK_SCHEDULE_STATUS_LABELS.not_started, 'Chưa xử lí');
  assert.equal(WORK_SCHEDULE_STATUS_LABELS.in_progress, 'Đang xử lí');
  assert.equal(WORK_SCHEDULE_STATUS_LABELS.cannot_process, 'Không xử lí được');
  assert.equal(WORK_SCHEDULE_STATUS_LABELS.completed, 'Đã xử lí');
});

test('work groups provide defaults and preserve stored changes', () => {
  const { mergeWorkScheduleGroups, inferWorkScheduleGroupId } = loadScheduleModel();
  const defaults = mergeWorkScheduleGroups([]);
  assert.deepEqual(defaults.map(group => group.id), ['boss', 'personnel', 'business', 'technical', 'logistics', 'workshop', 'delivery']);
  const changed = mergeWorkScheduleGroups([{ id: 'business', name: 'Kinh doanh mới', order: 30, active: true }]);
  assert.equal(changed.find(group => group.id === 'business').name, 'Kinh doanh mới');
  assert.equal(inferWorkScheduleGroupId({ taskType: 'support_request' }), 'boss');
  assert.equal(inferWorkScheduleGroupId({ referenceType: 'lead' }), 'business');
});

test('tasks sort by status before priority and deadline', () => {
  const { compareWorkScheduleItems, normalizeWorkScheduleRecord } = loadScheduleModel();
  const task = (id, status, priority, endAt) => normalizeWorkScheduleRecord({ id, status, priority, endAt });
  const rows = [
    task('completed', 'completed', 'urgent', '2026-01-01T00:00:00.000Z'),
    task('pending', 'not_started', 'urgent', '2026-01-01T00:00:00.000Z'),
    task('processing-normal', 'in_progress', 'normal', '2026-01-02T00:00:00.000Z'),
    task('processing-urgent', 'in_progress', 'urgent', '2026-01-03T00:00:00.000Z'),
    task('blocked', 'cannot_process', 'urgent', '2026-01-01T00:00:00.000Z')
  ].sort(compareWorkScheduleItems);
  assert.deepEqual(rows.map(row => row.id), ['processing-urgent', 'processing-normal', 'pending', 'blocked', 'completed']);
});

test('permanent deletion is limited to completed work and administrators', () => {
  const { canPermanentlyDeleteWorkSchedule } = loadScheduleModel();
  assert.equal(canPermanentlyDeleteWorkSchedule('admin', 'completed'), true);
  assert.equal(canPermanentlyDeleteWorkSchedule('admin', 'in_progress'), false);
  assert.equal(canPermanentlyDeleteWorkSchedule('sale', 'completed'), false);
});

test('work assignment is available in every customer lifecycle module', () => {
  for (const file of [
    'src/features/crm/components/LeadCandidateWorkspace.tsx',
    'src/features/crm/pages/LeadsPage.tsx',
    'src/features/crm/pages/CrmPage.tsx'
  ]) {
    const source = read(file);
    assert.match(source, /WorkAssignmentDialog/);
    assert.match(source, /Giao việc/);
    assert.match(source, /label: (?:t\()?['"]Giao việc['"]\)?.*icon: <ClipboardCheck/s);
  }
});

test('support requests become managed work items', () => {
  const dialog = read('src/components/SupportRequestDialog.tsx');
  assert.match(dialog, /addDocument\('work_schedule_items'/);
  assert.match(dialog, /status: 'support_requested'/);
  assert.match(dialog, /taskType: 'support_request'/);
  assert.match(dialog, /requestedById: currentUser\.uid/);
});

test('task status and priority use colored text without badge styling', () => {
  const page = read('src/features/work-schedule/pages/WorkSchedulePage.tsx');
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  assert.doesNotMatch(page, /<h1>Quản lý công việc<\/h1>/);
  assert.match(page, /work-schedule-status--/);
  assert.match(page, /work-schedule-priority--/);
  const textRule = css.match(/\.work-schedule-status,\s*\.work-schedule-priority,[^{]*\{([^}]*)\}/s)?.[1] || '';
  assert.match(textRule, /color:/);
  assert.doesNotMatch(textRule, /background|border|border-radius|padding/);
});

test('work page requires a group and uses the shared funnel filter panel', () => {
  const page = read('src/features/work-schedule/pages/WorkSchedulePage.tsx');
  const rules = read('firestore.rules');
  assert.match(page, /DataFilterButton/);
  assert.match(page, /DataFilterPanel/);
  assert.match(page, /Nhóm công việc \*/);
  assert.match(page, /Thêm nhóm công việc/);
  assert.match(page, /Quản lý nhóm công việc/);
  assert.match(rules, /match \/work_schedule_groups\/\{documentId\}/);
  for (const file of ['src/components/WorkAssignmentDialog.tsx', 'src/components/SupportRequestDialog.tsx', 'src/components/CallWorkspace.tsx']) {
    assert.match(read(file), /groupId:/);
  }
});

test('work and week tabs use the straight underline shared by ERP modules', () => {
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  const underlineRule = css.match(/\.work-schedule-tab-list > button::after,[^{]*\{([^}]*)\}/s)?.[1] || '';
  assert.match(underlineRule, /height: 2px/);
  assert.match(underlineRule, /border-radius: 0 !important/);
  assert.match(css, /\.work-schedule-tab-list > button\.is-active::after,[^{]*\{[^}]*opacity: 1/s);
});
