const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'callHistory.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const callModule = {};
new Function('exports', outputText)(callModule);

test('call history follows a customer from raw data through lead and order', () => {
  const candidate = { id: 'raw-1' };
  const lead = { id: 'lead-1', sourceCandidateId: candidate.id };
  const customer = { id: 'customer-1', sourceLeadId: lead.id };
  assert.equal(callModule.candidateCallSubjectKey(candidate), 'candidate:raw-1');
  assert.equal(callModule.leadCallSubjectKey(lead), 'lead:lead-1');
  assert.deepEqual(callModule.leadCallHistoryKeys(lead), ['lead:lead-1', 'candidate:raw-1']);
  assert.equal(callModule.customerCallSubjectKey(customer), 'customer:customer-1');
  assert.deepEqual(callModule.customerCallHistoryKeys(customer, []), ['customer:customer-1', 'lead:lead-1']);
  assert.deepEqual(callModule.customerCallHistoryKeys(customer, [lead]), ['customer:customer-1', 'lead:lead-1', 'candidate:raw-1']);
});

test('standalone customers and leads do not share another business history', () => {
  const lead = { id: 'lead-2', sourceCandidateId: '' };
  assert.equal(callModule.leadCallSubjectKey(lead), 'lead:lead-2');
  assert.deepEqual(callModule.customerCallHistoryKeys({ id: 'customer-2', sourceLeadId: lead.id }, [lead]), ['customer:customer-2', 'lead:lead-2']);
  assert.deepEqual(callModule.customerCallHistoryKeys({ id: 'customer-3', sourceLeadId: '' }, [lead]), ['customer:customer-3']);
});
