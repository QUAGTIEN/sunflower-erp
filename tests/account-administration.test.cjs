const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

const caller = { uid: 'admin1', email: 'admin@example.test' };

function adminBackend(profiles = { worker: { uid: 'worker', role: 'sale', active: true } }) {
  const calls = [];
  const writes = [];
  const firestore = {
    collection: () => ({
      doc: uid => ({
        get: async () => ({ exists: Boolean(profiles[uid]), data: () => profiles[uid] }),
        update: async fields => writes.push({ uid, fields })
      })
    })
  };
  const auth = {
    updateUser: async (uid, fields) => calls.push(['updateUser', uid, fields]),
    revokeRefreshTokens: async uid => calls.push(['revokeRefreshTokens', uid])
  };
  const server = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ auth, firestore }) } })(
    'server/adminUsers.ts'
  );
  return { server, calls, writes };
}

test('an admin resets a password in Firebase Auth only, ends old sessions and never stores the password', async () => {
  const { server, calls, writes } = adminBackend();
  const input = server.validateResetPasswordBody({ uid: 'worker', password: '  mat-khau-moi ' });
  assert.deepEqual(input, { uid: 'worker', password: 'mat-khau-moi' });
  assert.deepEqual(await server.resetManagedUserPassword(caller, input), { uid: 'worker' });
  assert.deepEqual(calls, [
    ['updateUser', 'worker', { password: 'mat-khau-moi' }],
    ['revokeRefreshTokens', 'worker']
  ]);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].fields).sort(), ['updatedAt', 'updatedBy']);
  assert.doesNotMatch(JSON.stringify(writes), /mat-khau-moi/);
});

test('password resets reject short passwords, the admin themself and accounts without a profile', async () => {
  const { server, calls } = adminBackend();
  assert.throws(() => server.validateResetPasswordBody({ uid: 'worker', password: '1234567' }), /Mật khẩu mới/);
  assert.throws(() => server.validateResetPasswordBody({ password: 'mat-khau-moi' }), /UID/);
  await assert.rejects(
    server.resetManagedUserPassword(caller, { uid: caller.uid, password: 'mat-khau-moi' }),
    error => error.status === 400
  );
  await assert.rejects(
    server.resetManagedUserPassword(caller, { uid: 'ghost', password: 'mat-khau-moi' }),
    error => error.status === 404
  );
  assert.deepEqual(calls, []);
});

test('the existing account endpoint carries reset_password, so no new Vercel function is added', async () => {
  const received = [];
  const manage = loader({
    '../../server/adminUsers.js': {
      AdminApiError: Error,
      apiErrorResponse: error => Response.json({ error: error.message }, { status: 500 }),
      jsonResponse: payload => Response.json(payload),
      readJsonBody: async request => request.json(),
      requireAdmin: async () => caller,
      validateResetPasswordBody: body => ({ uid: body.uid, password: body.password }),
      resetManagedUserPassword: async (actor, input) => {
        received.push([actor, input]);
        return { uid: input.uid };
      }
    }
  })('api/users/manage.ts');
  const request = new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ action: 'reset_password', uid: 'worker', password: 'mat-khau-moi' })
  });
  const response = await manage.POST(request);
  assert.deepEqual(await response.json(), { uid: 'worker' });
  assert.deepEqual(received, [[caller, { uid: 'worker', password: 'mat-khau-moi' }]]);
});

test('account history keeps sign-ins and important actions; screen openings are no longer recorded', () => {
  const audit = loader({ '@/infrastructure/firebase/erpDataGateway': { dbService: {} } })(
    'src/services/auditService.ts'
  );
  assert.equal(audit.isImportantAuditEvent({ category: 'navigation' }), false, 'old screen openings stay hidden');
  for (const category of ['session', 'business', 'administration'])
    assert.equal(audit.isImportantAuditEvent({ category }), true);
  assert.equal(audit.auditService.recordNavigation, undefined);
  assert.doesNotMatch(readSource('src/app/AppShell.tsx'), /recordNavigation|page_opened/);
  assert.match(
    readSource('src/features/administration/pages/UserManagementPage.tsx'),
    /isImportantAuditEvent\(event\)/
  );
});

test('the reset dialog hides the password by default and waits for eight characters before saving', () => {
  const { ResetPasswordDialog } = loader()('src/features/administration/components/ResetPasswordDialog.tsx');
  const html = renderToStaticMarkup(
    React.createElement(ResetPasswordDialog, {
      account: { uid: 'worker', displayName: 'Nguyễn Văn A', email: 'a@example.test' },
      busy: false,
      onCancel() {},
      onSubmit() {}
    })
  );
  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="Hiện mật khẩu"/);
  assert.match(html, /<button type="submit" class="btn btn-primary" disabled="">Lưu mật khẩu<\/button>/);
  assert.match(html, /a@example\.test/);
});
