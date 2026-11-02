const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

const TEST_KEY = crypto.randomBytes(32).toString('base64');
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function vaultBackend(documents = {}) {
  const store = new Map(Object.entries(structuredClone(documents)));
  let serial = 0;
  const firestore = {
    collection: collection => ({
      doc: id => {
        const path = `${collection}/${id ?? `generated${++serial}`}`;
        return {
          get: async () => ({ exists: store.has(path), data: () => structuredClone(store.get(path)) }),
          set: async data => store.set(path, structuredClone(data)),
          delete: async () => store.delete(path)
        };
      }
    })
  };
  const vault = loader({
    './adminUsers.js': { AdminApiError: ApiError },
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) }
  })('server/passwordVault.ts');
  return { store, vault };
}
const withKey = async (key, work) => {
  const previous = process.env.ACCOUNT_PASSWORD_KEY;
  if (key) process.env.ACCOUNT_PASSWORD_KEY = key;
  else delete process.env.ACCOUNT_PASSWORD_KEY;
  try {
    return await work();
  } finally {
    if (previous === undefined) delete process.env.ACCOUNT_PASSWORD_KEY;
    else process.env.ACCOUNT_PASSWORD_KEY = previous;
  }
};
const admin = { uid: 'boss', profile: { displayName: 'Giám đốc', role: 'admin' } };

test('passwords are sealed with AES-GCM bound to the account and cannot be moved or altered', () => {
  const { vault } = vaultBackend();
  const key = Buffer.from(TEST_KEY, 'base64');
  const sealed = vault.sealPasswordText('Mat-khau-1', key, 'u1');
  assert.ok(!JSON.stringify(sealed).includes('Mat-khau-1'));
  assert.equal(vault.openPasswordText(sealed, key, 'u1'), 'Mat-khau-1');
  assert.throws(() => vault.openPasswordText(sealed, key, 'u2'), 'a copy pasted onto another account fails');
  assert.throws(() =>
    vault.openPasswordText({ ...sealed, ciphertext: Buffer.from('xx').toString('base64') }, key, 'u1')
  );
  assert.throws(() => vault.openPasswordText(sealed, crypto.randomBytes(32), 'u1'));
});

test('admins reveal a stored password through the server, and every reveal is audited', async () => {
  await withKey(TEST_KEY, async () => {
    const { store, vault } = vaultBackend();
    assert.equal(await vault.storeAccountPassword('u1', 'Mat-khau-1', 'admin_create', 'Giám đốc'), true);
    const stored = store.get('account_secrets/u1');
    assert.equal(stored.source, 'admin_create');
    assert.ok(!JSON.stringify(stored).includes('Mat-khau-1'), 'Firestore never holds the plain password');
    const revealed = await vault.revealAccountPassword(admin, 'u1');
    assert.equal(revealed.password, 'Mat-khau-1');
    const events = [...store].filter(([path]) => path.startsWith('audit_events/')).map(([, event]) => event);
    assert.deepEqual(
      events.map(event => [event.action, event.actorId, event.targetId]),
      [['password_revealed', 'boss', 'u1']]
    );
    await assert.rejects(vault.revealAccountPassword(admin, 'unknown'), error => error.status === 404);
  });
});

test('without a server key nothing is stored and reveals explain the missing setup', async () => {
  await withKey('', async () => {
    const { store, vault } = vaultBackend();
    assert.equal(await vault.storeAccountPassword('u1', 'Mat-khau-1', 'admin_reset', 'Giám đốc'), false);
    assert.equal(store.size, 0);
    await assert.rejects(vault.revealAccountPassword(admin, 'u1'), error => error.status === 503);
  });
  await withKey(Buffer.from('short').toString('base64'), async () => {
    assert.equal(vaultBackend().vault.isPasswordVaultConfigured(), false, 'a key that is not 32 bytes is ignored');
  });
});

function ownPasswordBackend({ profile, authTime }) {
  const calls = [];
  const firestore = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: Boolean(profile), data: () => profile }),
        update: async fields => calls.push(['profile', Object.keys(fields).sort()])
      })
    })
  };
  const auth = {
    verifyIdToken: async () => ({ uid: 'u1', auth_time: authTime }),
    updateUser: async (uid, fields) => calls.push(['updateUser', uid, fields]),
    revokeRefreshTokens: async uid => calls.push(['revoke', uid])
  };
  const server = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ auth, firestore }) } })(
    'server/adminUsers.ts'
  );
  const request = new Request('https://example.test', { headers: { Authorization: 'Bearer token' } });
  return { server, calls, request };
}

test('staff change their own password only right after re-entering the current one', async () => {
  const now = Math.floor(Date.now() / 1000);
  const profile = { uid: 'u1', email: 'u1@example.test', displayName: 'Sale A', role: 'sale', active: true };
  const fresh = ownPasswordBackend({ profile, authTime: now - 10 });
  const result = await fresh.server.changeOwnPassword(
    fresh.request,
    fresh.server.validateOwnPasswordBody({ password: 'Mat-khau-moi' })
  );
  assert.deepEqual(result, { uid: 'u1', displayName: 'Sale A', password: 'Mat-khau-moi' });
  assert.deepEqual(fresh.calls, [
    ['updateUser', 'u1', { password: 'Mat-khau-moi' }],
    ['revoke', 'u1'],
    ['profile', ['updatedAt', 'updatedBy']]
  ]);
  const stale = ownPasswordBackend({ profile, authTime: now - 3600 });
  await assert.rejects(
    stale.server.changeOwnPassword(stale.request, { password: 'Mat-khau-moi' }),
    /mật khẩu hiện tại/
  );
  const locked = ownPasswordBackend({ profile: { ...profile, active: false }, authTime: now });
  await assert.rejects(
    locked.server.changeOwnPassword(locked.request, { password: 'Mat-khau-moi' }),
    e => e.status === 403
  );
  assert.deepEqual([...stale.calls, ...locked.calls], []);
  assert.throws(() => fresh.server.validateOwnPasswordBody({ password: 'ngan' }), /Mật khẩu mới/);
});

function manageEndpoint({ storeFails = false } = {}) {
  const log = [];
  const caller = { uid: 'boss', email: 'boss@example.test', profile: { displayName: 'Giám đốc', role: 'admin' } };
  const manage = loader({
    '../../server/adminUsers.js': {
      AdminApiError: ApiError,
      apiErrorResponse: error => Response.json({ error: error.message }, { status: error.status || 500 }),
      jsonResponse: (payload, status = 200) => Response.json(payload, { status }),
      readJsonBody: async request => request.json(),
      requireAdmin: async () => {
        log.push('requireAdmin');
        return caller;
      },
      changeOwnPassword: async (_request, input) => ({ uid: 'u1', displayName: 'Sale A', password: input.password }),
      validateOwnPasswordBody: body => ({ password: body.password }),
      createManagedUser: async () => ({ uid: 'new1' }),
      validateCreateUserBody: body => body,
      resetManagedUserPassword: async (_caller, input) => ({ uid: input.uid }),
      validateResetPasswordBody: body => ({ uid: body.uid, password: body.password }),
      deleteManagedUser: async (_caller, input) => ({ uid: input.uid }),
      validateDeleteUserBody: body => ({ uid: body.uid })
    },
    '../../server/passwordVault.js': {
      storeAccountPassword: async (uid, password, source) => {
        if (storeFails) throw new Error('down');
        log.push(['store', uid, password, source]);
        return true;
      },
      deleteAccountPassword: async uid => log.push(['forget', uid]),
      revealAccountPassword: async (_caller, uid) => ({ uid, password: 'Mat-khau-1' })
    },
    '../../server/recycleBin.js': { manageRecycledItem() {}, validateRecycleBody() {} }
  })('api/users/manage.ts');
  const call = async body =>
    (await manage.POST(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) }))).json();
  return { call, log };
}

test('the account endpoint keeps the sealed copy in step with every password change', async () => {
  const endpoint = manageEndpoint();
  assert.deepEqual(await endpoint.call({ action: 'change_own_password', password: 'Tu-doi-123' }), {
    uid: 'u1',
    passwordStored: true
  });
  assert.ok(!endpoint.log.includes('requireAdmin'), 'staff change their own password without admin rights');
  await endpoint.call({ action: 'create', email: 'a@example.test', password: 'Tam-thoi-1' });
  await endpoint.call({ action: 'reset_password', uid: 'u2', password: 'Dat-lai-12' });
  await endpoint.call({ action: 'delete', uid: 'u3' });
  assert.deepEqual(await endpoint.call({ action: 'reveal_password', uid: 'u1' }), {
    uid: 'u1',
    password: 'Mat-khau-1'
  });
  assert.deepEqual(
    endpoint.log.filter(entry => Array.isArray(entry)),
    [
      ['store', 'u1', 'Tu-doi-123', 'self_change'],
      ['store', 'new1', 'Tam-thoi-1', 'admin_create'],
      ['store', 'u2', 'Dat-lai-12', 'admin_reset'],
      ['forget', 'u3']
    ]
  );
  const failing = manageEndpoint({ storeFails: true });
  assert.deepEqual(await failing.call({ action: 'reset_password', uid: 'u2', password: 'Dat-lai-12' }), {
    uid: 'u2',
    passwordStored: false
  });
  assert.deepEqual(failing.log.at(-1), ['forget', 'u2'], 'a stale copy is dropped instead of shown');
});

test('browsers never read sealed passwords; admins see them masked until they press the eye', () => {
  assert.match(readSource('firestore.rules'), /match \/account_secrets\/\{userId\} \{\s*allow read, write: if false;/);
  const stubs = {
    '@/services/adminUserService': { adminUserService: {} },
    '@/infrastructure/firebase/erpDataGateway': { authService: {}, dbService: {} }
  };
  const { AccountPasswordCell } = loader(stubs)('src/features/administration/components/AccountPasswordCell.tsx');
  const cell = renderToStaticMarkup(React.createElement(AccountPasswordCell, { uid: 'u1', displayName: 'Sale A' }));
  assert.match(cell, /••••••••/);
  assert.match(cell, /aria-label="Xem mật khẩu Sale A"/);
  const { ChangePasswordDialog } = loader(stubs)('src/features/administration/components/ChangePasswordDialog.tsx');
  const dialog = renderToStaticMarkup(React.createElement(ChangePasswordDialog, { onClose() {} }));
  for (const label of ['Mật khẩu hiện tại *', 'Mật khẩu mới *', 'Nhập lại mật khẩu mới *'])
    assert.ok(dialog.includes(label), label);
  assert.equal((dialog.match(/type="password"/g) || []).length, 3);
  const shell = readSource('src/app/AppShell.tsx');
  assert.match(shell, /label="Đổi mật khẩu"/);
  assert.match(readSource('src/features/administration/pages/UserManagementPage.tsx'), /<AccountPasswordCell/);
  assert.doesNotMatch(
    readSource('src/infrastructure/firebase/client.ts') + readSource('src/app/AppShell.tsx'),
    /ACCOUNT_PASSWORD_KEY/,
    'the key never reaches the browser bundle'
  );
});
