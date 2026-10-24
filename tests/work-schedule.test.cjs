const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { readModuleSource } = require('./helpers/loadTs.cjs');

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
  const blocked = normalizeWorkScheduleRecord({
    status: 'cannot_process', cannotProcessNote: 'Thiếu thông tin kỹ thuật',
    cannotProcessByName: 'Khánh Ly'
  });
  assert.equal(blocked.cannotProcessNote, 'Thiếu thông tin kỹ thuật');
  assert.equal(blocked.cannotProcessByName, 'Khánh Ly');
});

test('five assignment groups stay fixed and legacy tasks remain visible', () => {
  const { mergeWorkScheduleGroups, inferWorkScheduleGroupId, normalizeWorkScheduleRecord } = loadScheduleModel();
  const defaults = mergeWorkScheduleGroups([]);
  assert.deepEqual(defaults.map(group => group.id), ['boss_to_staff', 'staff_to_company', 'staff_to_staff', 'self', 'automatic']);
  const changed = mergeWorkScheduleGroups([{ id: 'business', name: 'Kinh doanh cũ', order: 30, active: true }]);
  assert.equal(changed.length, 5);
  assert.equal(inferWorkScheduleGroupId({ taskType: 'support_request', groupId: 'boss' }), 'staff_to_company');
  assert.equal(inferWorkScheduleGroupId({ taskType: 'personal_task', groupId: 'business' }), 'self');
  assert.equal(inferWorkScheduleGroupId({ taskType: 'assigned_task', groupId: 'business', assignedById: 'admin', assigneeId: 'sale' }), 'boss_to_staff');
  assert.equal(normalizeWorkScheduleRecord({ groupId: 'business' }).workType, 'business');
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
  // Each module is checked as a whole: the customer row menu lives in CustomerListTable, the dialog in CrmPage.
  for (const source of [
    readModuleSource(
      'src/features/crm/components/LeadCandidateWorkspace.tsx',
      'src/features/crm/components/leadCandidateWorkspace'
    ),
    readModuleSource('src/features/crm/pages/LeadsPage.tsx', 'src/features/crm/pages/leadsPage'),
    ['src/features/crm/pages/CrmPage.tsx', 'src/features/crm/components/CustomerListTable.tsx'].map(read).join('\n')
  ]) {
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
  assert.match(dialog, /groupId: 'staff_to_company'/);
});

test('staff assignments are restricted by group in Firestore rules', () => {
  const rules = read('firestore.rules').split('match /work_schedule_items/{documentId}')[1].split('match /work_schedule_groups/{documentId}')[0];
  assert.match(rules, /resource\.data\.assignedById == request\.auth\.uid/);
  assert.match(rules, /groupId == 'self'/);
  assert.match(rules, /groupId == 'staff_to_company'/);
  assert.match(rules, /groupId == 'staff_to_staff'/);
  assert.match(rules, /validWorkAssignee\(\)/);
  assert.doesNotMatch(rules.match(/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\[([^]*?)\]\)/)?.[1] || '', /'groupId'/);
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
  assert.match(page, /work-schedule-group-cards/);
  assert.match(page, /Loại công việc \*/);
  assert.match(rules, /match \/work_schedule_groups\/\{documentId\}/);
  for (const file of ['src/components/WorkAssignmentDialog.tsx', 'src/components/SupportRequestDialog.tsx', 'src/components/CallWorkspace.tsx']) {
    assert.match(read(file), /groupId:/);
  }
});

test('work groups share one table workspace and status failure requires a note', () => {
  const page = read('src/features/work-schedule/pages/WorkSchedulePage.tsx');
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  const rules = read('firestore.rules');
  assert.match(page, /work-schedule-group-cards/);
  assert.doesNotMatch(page, /<aside className="work-schedule-groups"/);
  assert.doesNotMatch(page, /work-schedule-group-header/);
  assert.match(page, /work-schedule-status-filters/);
  assert.match(page, /work-schedule-status--/);
  assert.match(page, /setSelectedItem\(previous => \(?previous\?\.id === item\.id \? updated : previous\)?\)/);
  assert.match(page, /Xác nhận tình trạng công việc/);
  assert.match(page, /Vui lòng nhập lý do không xử lí được/);
  assert.match(page, /eventType: 'work_schedule_cannot_process'/);
  assert.match(page, /activeAdmins\.map/);
  assert.match(css, /\.work-schedule-status-options/);
  assert.match(css, /\.work-schedule-message \{[^}]*position: fixed/s);
  assert.match(rules, /'cannotProcessNote'/);
});

test('dashboard work-group navigation opens the matching schedule group', () => {
  const page = read('src/features/work-schedule/pages/WorkSchedulePage.tsx');
  const shell = read('src/app/AppShell.tsx');
  assert.match(page, /initialGroupId/);
  assert.match(page, /useState\(initialGroupId \|\| 'boss_to_staff'\)/);
  assert.match(page, /onInitialGroupConsumed/);
  assert.match(shell, /setWorkScheduleGroupNavigation\(groupId\)/);
  assert.match(shell, /initialGroupId=\{workScheduleGroupNavigation\}/);
});

test('work table stays compact with flat filters, colored statuses and an empty state', () => {
  const page = read('src/features/work-schedule/pages/WorkSchedulePage.tsx');
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  assert.match(page, /<th>Công việc<\/th>\s*<th>Nhóm công việc<\/th>\s*<th>Loại công việc<\/th>\s*<th>Người giao<\/th>\s*<th>Người nhận<\/th>/);
  assert.match(page, /<th>Thao tác<\/th>/);
  assert.match(page, /work-schedule-kanban/);
  assert.match(page, /aria-label=\{`Xem chi tiết công việc/);
  assert.match(page, /work-schedule-filter-field/);
  assert.doesNotMatch(page, /<DataFilterSection/);
  assert.match(page, /work-schedule-empty__icon/);
  assert.match(css, /\.work-schedule-status-filter--in_progress[^}]*background: #eaf2ff/);
  assert.match(css, /\.work-schedule-status-filter--cannot_process[^}]*background: #fff0f0/);
  assert.match(css, /\.work-schedule-status-filter--completed[^}]*background: #e9f8f1/);
});

test('work and week tabs use the straight underline shared by ERP modules', () => {
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  const underlineRule = css.match(/\.work-schedule-tab-list > button::after,[^{]*\{([^}]*)\}/s)?.[1] || '';
  assert.match(underlineRule, /height: 2px/);
  assert.match(underlineRule, /border-radius: 0 !important/);
  assert.match(css, /\.work-schedule-tab-list > button\.is-active::after,[^{]*\{[^}]*opacity: 1/s);
});
