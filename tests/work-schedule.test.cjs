const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

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

test('work and week tabs use the straight underline shared by ERP modules', () => {
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  const underlineRule = css.match(/\.work-schedule-tab-list > button::after,[^{]*\{([^}]*)\}/s)?.[1] || '';
  assert.match(underlineRule, /height: 2px/);
  assert.match(underlineRule, /border-radius: 0 !important/);
  assert.match(css, /\.work-schedule-tab-list > button\.is-active::after,[^{]*\{[^}]*opacity: 1/s);
});
