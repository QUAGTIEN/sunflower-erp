const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/shared/feedback/mutationFeedback.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  class Element {}
  class Button extends Element {
    disabled = false;
    dataset = {};
    attributes = new Map();
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
  }
  class Form extends Element {}
  const document = { activeElement: null };
  const loaded = { exports: {} };
  new Function('module', 'exports', 'setTimeout', 'clearTimeout', 'document', 'HTMLButtonElement', 'HTMLFormElement', 'Element', code)(
    loaded, loaded.exports,
    (callback, delay) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id; },
    id => timers.delete(id), document, Button, Form, Element
  );
  const advance = ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); }
  };
  return { ...loaded.exports, advance, document, Button, Form, Element };
}

test('success is one line and dismisses after exactly three seconds', () => {
  const store = setup();
  store.showSuccessToast('Đã lưu\n thành công');
  assert.equal(store.getToastSnapshot().text, 'Đã lưu thành công');
  assert.equal(store.getToastSnapshot().tone, 'success');
  store.advance(2999);
  assert.ok(store.getToastSnapshot());
  store.advance(1);
  assert.equal(store.getToastSnapshot(), null);
});

test('a previous toast timer cannot dismiss a newer message', () => {
  const store = setup();
  store.showSuccessToast('Đã thêm thành công');
  store.advance(2000);
  store.showSuccessToast('Đã xóa Lead');
  store.advance(1000);
  assert.equal(store.getToastSnapshot().text, 'Đã xóa Lead');
  store.advance(2000);
  assert.equal(store.getToastSnapshot(), null);
});

test('manual dismissal cancels the timer and subscribers can unsubscribe', () => {
  const store = setup();
  let changes = 0;
  const unsubscribe = store.subscribeToToast(() => { changes++; });
  store.showSuccessToast();
  store.dismissToast();
  store.advance(3000);
  assert.equal(changes, 2);
  unsubscribe();
  store.showSuccessToast();
  assert.equal(changes, 2);
});

test('a cancelled or unchanged action does not announce a successful save', async () => {
  const store = setup();
  await store.withMutationFeedback('cancelled', async () => undefined)();
  assert.equal(store.getToastSnapshot(), null);
});

test('a failed save keeps the rejection and only shows failure feedback', async () => {
  const store = setup();
  const error = new Error('permission-denied');
  const save = store.withMutationFeedback('save', async () => { throw error; });
  await assert.rejects(save, candidate => candidate === error);
  assert.equal(store.getToastSnapshot().tone, 'error');
});

test('false persistence results cannot reach a success notification', async () => {
  const store = setup();
  const save = store.withMutationFeedback('save', async () => {
    await store.requireConfirmedMutation(Promise.resolve(false));
    store.showSuccessToast();
  });
  await assert.rejects(save);
  assert.equal(store.getToastSnapshot().tone, 'error');
  assert.equal(await store.requireConfirmedMutation(Promise.resolve(true)), true);
});

test('save feedback waits for completion and duplicate submissions are blocked', async () => {
  const store = setup();
  const button = new store.Button();
  store.document.activeElement = button;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const save = store.withMutationFeedback('save', async () => {
    calls++;
    await pending;
    store.showSuccessToast();
  });
  const first = save();
  await save();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(store.getToastSnapshot(), null);
  finish();
  await first;
  assert.equal(button.disabled, false);
  assert.equal(button.dataset.mutationPending, undefined);
  assert.equal(button.getAttribute('aria-busy'), null);
  assert.equal(store.getToastSnapshot().tone, 'success');
});

test('nested saves leave the outer action button locked until the entire operation completes', async () => {
  const store = setup();
  const button = new store.Button();
  store.document.activeElement = button;
  const inner = store.withMutationFeedback('inner', async () => undefined);
  const outer = store.withMutationFeedback('outer', async () => {
    await inner();
    assert.equal(button.disabled, true);
    assert.equal(button.dataset.mutationPending, 'true');
  });
  await outer();
  assert.equal(button.disabled, false);
});

test('keyboard submissions are guarded even when no button has focus', async () => {
  const store = setup();
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let calls = 0;
  const save = store.withMutationFeedback('keyboard-save', async () => {
    calls++;
    await pending;
  });
  const first = save();
  await save();
  assert.equal(calls, 1);
  finish();
  await first;
  await save();
  assert.equal(calls, 2);
});

test('automatic field updates are not dropped or allowed to lock an unrelated button', async () => {
  const store = setup();
  const button = new store.Button();
  store.document.activeElement = button;
  let calls = 0;
  const update = store.withMutationFeedback('field', async () => { calls++; }, { busy: false });
  await Promise.all([update(), update()]);
  assert.equal(calls, 2);
  assert.equal(button.disabled, false);
});
