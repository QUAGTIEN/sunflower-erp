const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'callWorkspace.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const model = {};
new Function('exports', outputText)(model);

test('call draft keys remain separate for each Sale, record and phone', () => {
  assert.notEqual(
    model.callDraftStorageKey('sale-a', 'customer:1', '0901'),
    model.callDraftStorageKey('sale-b', 'customer:1', '0901')
  );
  assert.notEqual(
    model.callDraftStorageKey('sale-a', 'customer:1', '0901'),
    model.callDraftStorageKey('sale-a', 'customer:1', '0902')
  );
});

test('wrap-up requires result and a dated next action only when selected', () => {
  const draft = {
    ...model.EMPTY_CALL_DRAFT,
    need: 'Tem nhãn cuộn',
    followUpAt: '2026-10-01T09:00',
    followUpNote: 'Hỏi kết quả mẫu'
  };
  const now = new Date('2026-09-22T00:00:00').getTime();
  assert.match(model.validateCallWrap('', draft, now), /chọn kết quả/);
  assert.equal(model.validateCallWrap('discussed', draft, now), '');
  assert.doesNotMatch(model.callSummaryNote(draft), /Thời hạn|Cần làm/);
  draft.nextAction = 'callback';
  assert.equal(model.validateCallWrap('discussed', draft, now), '');
  assert.match(model.callSummaryNote(draft), /Gọi lại/);
  draft.followUpAt = '2026-09-21T09:00';
  assert.match(model.validateCallWrap('discussed', draft, now), /thời gian tương lai/);
});

test('wrap-up rejects notes beyond Firestore 500-character limit', () => {
  const draft = { ...model.EMPTY_CALL_DRAFT, need: 'x'.repeat(500) };
  assert.match(model.validateCallWrap('discussed', draft), /500 ký tự/);
});

test('call note keeps optional potential evaluation without changing the follow-up rule', () => {
  const draft = { ...model.EMPTY_CALL_DRAFT, potentialLevel: 'medium', note: 'Cần hỏi thêm số lượng' };
  assert.match(model.callSummaryNote(draft), /Mức độ tiềm năng: Trung bình/);
  assert.equal(model.validateCallWrap('discussed', draft), '');
});
