const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const { createLoader, readModuleSource } = require('./helpers/loadTs.cjs');

const overviewSource = readFileSync(
  join(__dirname, '..', 'src', 'features', 'crm', 'components', 'RawDataOverview.tsx'),
  'utf8'
);
const workspaceSource = readModuleSource(
  'src/features/crm/components/LeadCandidateWorkspace.tsx',
  'src/features/crm/components/leadCandidateWorkspace'
);
const workspaceStyles = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'Leads.css'), 'utf8');
const model = createLoader()('src/features/crm/model/rawDataOverview.ts');

const candidate = (overrides = {}) => ({
  id: 'raw-1',
  phone: '',
  source: '',
  sourceUrl: '',
  businessSector: '',
  expectedProducts: '',
  province: '',
  nextContactAt: '',
  status: 'new',
  lastContactOutcome: '',
  contactAttempts: 0,
  contactLogs: [],
  ...overrides
});
const call = (result, startedAt) => ({ subjectKey: 'candidate:raw-1', result, startedAt });

test('raw data without a phone but with a traceable source needs enrichment', () => {
  const result = model.scoreRawCandidate(
    candidate({ source: 'Google Maps', businessSector: 'Bao bì' }),
    [],
    model.DEFAULT_RAW_PRIORITY_RULES
  );
  assert.equal(result.group, 'enrich');
  assert.match(result.reasons[0], /số điện thoại/);
  assert.equal(result.called, false);
});

test('complete, callable target business is prioritized with visible reasons', () => {
  const rules = { targetIndustries: 'bao bì', targetProducts: 'tem nhãn', callFirstThreshold: 55 };
  const result = model.scoreRawCandidate(
    candidate({
      phone: '0901234567',
      sourceUrl: 'https://example.com',
      businessSector: 'Bao bì',
      expectedProducts: 'Tem nhãn'
    }),
    [],
    rules
  );
  assert.equal(result.group, 'call_first');
  assert.ok(result.score >= 55);
  assert.ok(result.reasons.includes('Đúng ngành mục tiêu'));
  assert.ok(result.reasons.includes('Đúng sản phẩm mục tiêu'));
});

test('unverifiable data and three recent missed calls are not recommended for calling', () => {
  assert.equal(model.scoreRawCandidate(candidate(), [], model.DEFAULT_RAW_PRIORITY_RULES).group, 'verify');
  const calls = [call('no_answer', '2026-09-19'), call('busy', '2026-09-20'), call('no_answer', '2026-09-21')];
  const result = model.scoreRawCandidate(
    candidate({ phone: '0901234567', source: 'Website' }),
    calls,
    model.DEFAULT_RAW_PRIORITY_RULES
  );
  assert.equal(result.group, 'verify');
  assert.equal(result.called, true);
});

test('a newer successful call clears a previous wrong-number warning', () => {
  const calls = [call('wrong_number', '2026-09-19'), call('discussed', '2026-09-21')];
  const result = model.scoreRawCandidate(
    candidate({ phone: '0901234567', source: 'Website', businessSector: 'Bao bì', expectedProducts: 'Tem nhãn' }),
    calls,
    model.DEFAULT_RAW_PRIORITY_RULES
  );
  assert.equal(result.group, 'call_first');
  assert.equal(result.connected, true);
});

test('raw data tabs preserve prepared views and overview data between switches', () => {
  assert.match(overviewSource, /memo\(function RawDataOverview/);
  assert.match(workspaceSource, /adminListPrepared/);
  // Since 4b1f928 the admin list is built on demand instead of being prewarmed after the first frame.
  assert.doesNotMatch(workspaceSource, /requestAnimationFrame\(\(\) => setAdminListPrepared\(true\)\)/);
  assert.match(workspaceSource, /\(adminListPrepared \|\| adminRawView === 'list'\) &&/);
  assert.doesNotMatch(workspaceSource, /requestIdleCallback\(prepare/);
  assert.match(workspaceSource, /hidden=\{adminRawView === 'list'\}/);
  // Since 08f11a8 the list surface hides purely by the selected admin view.
  assert.match(workspaceSource, /className="lead-candidate-workspace"\s+hidden=\{adminRawView !== 'list'\}/);
  assert.match(workspaceStyles, /\.lead-candidate-workspace\[hidden\]\s*\{\s*display:\s*none;/);
  assert.doesNotMatch(workspaceSource, /if \(currentUser\.role === 'admin' && adminRawView !== 'list'\)/);
});
