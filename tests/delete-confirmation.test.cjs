const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function setup() {
  const source = fs.readFileSync(path.join(__dirname, '../src/shared/feedback/deleteConfirmation.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const loaded = { exports: {} };
  new Function('module', 'exports', code)(loaded, loaded.exports);
  return loaded.exports;
}

test('delete waits for explicit consent before running the mutation', async () => {
  const store = setup();
  let deleted = false;
  const action = (async () => {
    if (!(await store.confirmDelete('Xóa vĩnh viễn bản ghi?'))) return;
    deleted = true;
  })();
  await Promise.resolve();
  assert.equal(deleted, false);
  const request = store.getDeleteConfirmationSnapshot();
  assert.equal(request.title, 'Xác nhận xóa');
  assert.equal(request.confirmLabel, 'Xóa');
  store.resolveDeleteConfirmation(request.id, true);
  await action;
  assert.equal(deleted, true);
  assert.equal(store.getDeleteConfirmationSnapshot(), null);
});

test('a rejected confirmation resolves false and never deletes', async () => {
  const store = setup();
  let deleted = false;
  const action = (async () => {
    if (await store.confirmDelete('Xóa bản ghi?')) deleted = true;
  })();
  store.resolveDeleteConfirmation(store.getDeleteConfirmationSnapshot().id, false);
  await action;
  assert.equal(deleted, false);
});

test('concurrent requests are queued and stale clicks cannot confirm the next record', async () => {
  const store = setup();
  const first = store.confirmDelete('Xóa A?');
  const firstId = store.getDeleteConfirmationSnapshot().id;
  const second = store.confirmDelete('Xóa B?');
  assert.equal(store.getDeleteConfirmationSnapshot().message, 'Xóa A?');
  store.resolveDeleteConfirmation(firstId, true);
  assert.equal(await first, true);
  const secondId = store.getDeleteConfirmationSnapshot().id;
  store.resolveDeleteConfirmation(firstId, true);
  assert.equal(store.getDeleteConfirmationSnapshot().id, secondId);
  store.resolveDeleteConfirmation(secondId, false);
  assert.equal(await second, false);
});

test('deletion requests retain their distinct wording and button label', async () => {
  const store = setup();
  const pending = store.confirmDelete('Gửi yêu cầu xóa tới Admin?', {
    title: 'Xác nhận yêu cầu xóa',
    confirmLabel: 'Gửi yêu cầu'
  });
  const snapshot = store.getDeleteConfirmationSnapshot();
  assert.equal(snapshot.title, 'Xác nhận yêu cầu xóa');
  assert.equal(snapshot.confirmLabel, 'Gửi yêu cầu');
  store.resolveDeleteConfirmation(snapshot.id, true);
  assert.equal(await pending, true);
});

test('unmount cancels every queued confirmation without deleting anything', async () => {
  const store = setup();
  let changes = 0;
  const unsubscribe = store.subscribeToDeleteConfirmation(() => {
    changes++;
  });
  const first = store.confirmDelete('A');
  const second = store.confirmDelete('B');
  store.cancelDeleteConfirmations();
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(store.getDeleteConfirmationSnapshot(), null);
  assert.equal(changes, 3);
  unsubscribe();
  store.cancelDeleteConfirmations();
  assert.equal(changes, 3);
});
