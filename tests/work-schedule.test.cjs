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
  assert.match(page, /Quản lý công việc/);
  assert.match(page, /work-schedule-status--/);
  assert.match(page, /work-schedule-priority--/);
  const textRule = css.match(/\.work-schedule-status,\s*\.work-schedule-priority,[^{]*\{([^}]*)\}/s)?.[1] || '';
  assert.match(textRule, /color:/);
  assert.doesNotMatch(textRule, /background|border|border-radius|padding/);
});

test('work and week tabs use the straight underline shared by ERP modules', () => {
  const css = read('src/features/work-schedule/pages/WorkSchedule.css');
  const tabRule = css.match(/\.work-schedule-tabs button \{([^}]*)\}/s)?.[1] || '';
  assert.match(tabRule, /border-bottom: 2px solid transparent/);
  assert.match(tabRule, /border-radius: 0/);
  assert.match(css, /\.work-schedule-tabs button\.is-active \{[^}]*border-bottom-color:/s);
});
