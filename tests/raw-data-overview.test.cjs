const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'rawDataOverview.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const model = {};
new Function('exports', outputText)(model);

const candidate = (overrides = {}) => ({
  id: 'raw-1', phone: '', source: '', sourceUrl: '', businessSector: '', expectedProducts: '',
  province: '', nextContactAt: '', status: 'new', lastContactOutcome: '',
  contactAttempts: 0, contactLogs: [], ...overrides
});
const call = (result, startedAt) => ({ subjectKey: 'candidate:raw-1', result, startedAt });

test('raw data without a phone but with a traceable source needs enrichment', () => {
  const result = model.scoreRawCandidate(candidate({ source: 'Google Maps', businessSector: 'Bao bì' }), [], model.DEFAULT_RAW_PRIORITY_RULES);
  assert.equal(result.group, 'enrich');
  assert.match(result.reasons[0], /số điện thoại/);
  assert.equal(result.called, false);
});

test('complete, callable target business is prioritized with visible reasons', () => {
  const rules = { targetIndustries: 'bao bì', targetProducts: 'tem nhãn', callFirstThreshold: 55 };
  const result = model.scoreRawCandidate(candidate({ phone: '0901234567', sourceUrl: 'https://example.com', businessSector: 'Bao bì', expectedProducts: 'Tem nhãn' }), [], rules);
  assert.equal(result.group, 'call_first');
  assert.ok(result.score >= 55);
  assert.ok(result.reasons.includes('Đúng ngành mục tiêu'));
  assert.ok(result.reasons.includes('Đúng sản phẩm mục tiêu'));
});

test('unverifiable data and three recent missed calls are not recommended for calling', () => {
  assert.equal(model.scoreRawCandidate(candidate(), [], model.DEFAULT_RAW_PRIORITY_RULES).group, 'verify');
  const calls = [call('no_answer', '2026-09-19'), call('busy', '2026-09-20'), call('no_answer', '2026-09-21')];
  const result = model.scoreRawCandidate(candidate({ phone: '0901234567', source: 'Website' }), calls, model.DEFAULT_RAW_PRIORITY_RULES);
  assert.equal(result.group, 'verify');
  assert.equal(result.called, true);
});

test('a newer successful call clears a previous wrong-number warning', () => {
  const calls = [call('wrong_number', '2026-09-19'), call('discussed', '2026-09-21')];
  const result = model.scoreRawCandidate(candidate({ phone: '0901234567', source: 'Website', businessSector: 'Bao bì', expectedProducts: 'Tem nhãn' }), calls, model.DEFAULT_RAW_PRIORITY_RULES);
  assert.equal(result.group, 'call_first');
  assert.equal(result.connected, true);
});
