const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { readModuleSource } = require('./helpers/loadTs.cjs');

const source = readModuleSource('src/features/crm/pages/LeadsPage.tsx', 'src/features/crm/pages/leadsPage');

// Since 4b1f928 the list is no longer prewarmed after the first frame; it is built on demand
// when the list tab opens and then stays mounted so switching tabs keeps its state.
test('lead list is prepared when the list tab opens and preserved between workspace tabs', () => {
  assert.match(source, /const \[leadListPrepared, setLeadListPrepared\] = useState\(false\)/);
  assert.match(source, /const openLeadListTab = \(\) => \{[^}]*setLeadListPrepared\(true\);[^}]*setWorkspaceTab\('list'\);/);
  assert.doesNotMatch(source, /requestAnimationFrame\(\(\) => setLeadListPrepared\(true\)\)/);
  assert.doesNotMatch(source, /requestIdleCallback\(prepare/);
  assert.match(source, /leadListPrepared \|\| workspaceTab === 'list'/);
  assert.match(source, /className="lead-data-workspace" hidden=\{workspaceTab !== 'list'\}/);
  assert.match(source, /onClick=\{openLeadListTab\}/);
});
