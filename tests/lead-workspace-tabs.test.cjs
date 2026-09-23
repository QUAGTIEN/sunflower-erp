const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = readFileSync(
  join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'LeadsPage.tsx'),
  'utf8'
);

test('lead list is prepared during idle time and preserved between workspace tabs', () => {
  assert.match(source, /const \[leadListPrepared, setLeadListPrepared\] = useState\(false\)/);
  assert.match(source, /requestIdleCallback\(prepare, \{ timeout: 1200 \}\)/);
  assert.match(source, /leadListPrepared \|\| workspaceTab === 'list'/);
  assert.match(source, /className="lead-data-workspace" hidden=\{workspaceTab !== 'list'\}/);
  assert.match(source, /onClick=\{openLeadListTab\}/);
});
