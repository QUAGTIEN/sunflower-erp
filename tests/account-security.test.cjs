const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

/** In-memory Firestore + Auth with just what the account API uses (docs, simple where, batches). */
function accountBackend({ documents = {}, authUsers = {} } = {}) {
  const store = new Map(Object.entries(structuredClone(documents)));
  const accounts = new Map(Object.entries(structuredClone(authUsers)));
  let generated = 0;
  const snapshot = (path, id) => ({
    id,
    ref: { path },
    exists: store.has(path),
    data: () => structuredClone(store.get(path))
  });
  const documentReference = (collection, id) => {
    const path = `${collection}/${id}`;
    return {
      path,
      id,
      get: async () => snapshot(path, id),
      set: async data => store.set(path, structuredClone(data)),
      create: async data => {
        if (store.has(path)) throw Object.assign(new Error('exists'), { code: 'already-exists' });
        store.set(path, structuredClone(data));
      },
      update: async fields => store.set(path, { ...store.get(path), ...structuredClone(fields) }),
      delete: async () => store.delete(path)
    };
  };
  const listOf = (collection, filter = () => true) => {
    const docs = [...store.keys()]
      .filter(path => path.startsWith(`${collection}/`))
      .map(path => snapshot(path, path.slice(collection.length + 1)))
      .filter(document => filter(document.data()));
    return { docs, size: docs.length };
  };
  const firestore = {
    collection: collection => ({
      doc: id => documentReference(collection, id ?? `generated${++generated}`),
      get: async () => listOf(collection),
      where: (field, operator, value) => ({
        limit: () => ({ get: async () => listOf(collection, data => data[field] === value) }),
        get: async () => listOf(collection, data => data[field] === value)
      })
    }),
    batch: () => {
      const writes = [];
      return {
        set: (reference, data) => writes.push(() => store.set(reference.path, structuredClone(data))),
        create: (reference, data) => writes.push(() => store.set(reference.path, structuredClone(data))),
        update: (reference, fields) =>
          writes.push(() => store.set(reference.path, { ...store.get(reference.path), ...structuredClone(fields) })),
        delete: reference => writes.push(() => store.delete(reference.path)),
        commit: async () => writes.forEach(write => write())
      };
    }
  };
  const auth = {
    verifyIdToken: async token => ({ uid: token }),
    getUser: async uid => {
      if (!accounts.has(uid)) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
      return { uid, disabled: false, ...accounts.get(uid) };
    },
    createUser: async input => {
      const uid = `auth${accounts.size + 1}`;
      accounts.set(uid, { email: input.email, displayName: input.displayName });
      return { uid };
    },
    updateUser: async () => undefined,
    deleteUser: async uid => accounts.delete(uid),
    revokeRefreshTokens: async () => undefined
  };
  const server = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ auth, firestore }) } })(
    'server/adminUsers.ts'
  );
  const request = uid => new Request('https://example.test', { headers: { Authorization: `Bearer ${uid}` } });
  return { store, server, request };
}

const bootstrapEmail = 'admin@sunflower.com';
const adminProfile = { uid: 'boss', email: 'boss@example.test', displayName: 'Giám đốc', role: 'admin', active: true };

test('the bootstrap email becomes admin only while the system has no real administrator', async () => {
  const fresh = accountBackend({ authUsers: { first: { email: bootstrapEmail } } });
  const caller = await fresh.server.requireAdmin(fresh.request('first'));
  assert.equal(caller.profile.role, 'admin');
  assert.equal(fresh.store.get('users/first').email, bootstrapEmail);
  assert.deepEqual(
    Object.keys(fresh.store.get('user_directory/first')).sort(),
    ['active', 'displayName', 'role', 'uid', 'updatedAt'],
    'the directory never carries the login email or page grants'
  );

  const running = accountBackend({
    documents: { 'users/boss': { ...adminProfile, allowedPages: [] } },
    authUsers: { boss: { email: adminProfile.email }, intruder: { email: bootstrapEmail } }
  });
  await assert.rejects(running.server.requireAdmin(running.request('intruder')), error => error.status === 403);
  assert.equal(running.store.has('users/intruder'), false, 'a recreated bootstrap email gets nothing');

  const legacyOnly = accountBackend({
    documents: { 'users/u-admin': { ...adminProfile, uid: 'u-admin' } },
    authUsers: { first: { email: bootstrapEmail } }
  });
  assert.equal((await legacyOnly.server.requireAdmin(legacyOnly.request('first'))).profile.role, 'admin');
});

test('profile writes keep the public directory in step and never copy private fields into it', async () => {
  const b = accountBackend({
    documents: { 'users/boss': { ...adminProfile, allowedPages: [] } },
    authUsers: { boss: { email: adminProfile.email } }
  });
  const caller = await b.server.requireAdmin(b.request('boss'));
  const created = await b.server.createManagedUser(
    caller,
    b.server.validateCreateUserBody({
      email: 'ketoan@example.test',
      password: 'mat-khau-tam',
      displayName: 'Kế toán A',
      role: 'accountant',
      active: true,
      allowedPages: ['accounting']
    })
  );
  const entry = () => b.store.get(`user_directory/${created.uid}`);
  assert.deepEqual([entry().displayName, entry().role, entry().active], ['Kế toán A', 'accountant', true]);
  assert.equal(entry().email, undefined);
  assert.equal(entry().allowedPages, undefined);
  await b.server.updateManagedUser(
    caller,
    b.server.validateUpdateUserBody({
      uid: created.uid,
      displayName: 'Kế toán B',
      role: 'accountant',
      active: true,
      allowedPages: ['accounting']
    })
  );
  assert.equal(entry().displayName, 'Kế toán B');
  await b.server.setManagedUserActive(caller, { uid: created.uid, active: false });
  assert.equal(entry().active, false);
  await b.server.deleteManagedUser(caller, { uid: created.uid });
  assert.equal(entry(), undefined);
});

test('directory sync fills accounts created before the directory and drops entries without a profile', async () => {
  const b = accountBackend({
    documents: {
      'users/boss': { ...adminProfile, allowedPages: [] },
      'users/sale1': { uid: 'sale1', email: 's@example.test', displayName: 'Sale', role: 'sale', active: true },
      'user_directory/gone': { uid: 'gone', displayName: 'Đã xóa', role: 'sale', active: true }
    }
  });
  assert.deepEqual(await b.server.syncUserDirectory(), { synced: 2, removed: 1 });
  assert.deepEqual([...b.store.keys()].filter(path => path.startsWith('user_directory/')).sort(), [
    'user_directory/boss',
    'user_directory/sale1'
  ]);
  assert.equal(b.store.get('user_directory/sale1').email, undefined);
  const model = loader()('src/features/administration/model/accountAdministration.ts');
  const profiles = [{ uid: 'a', displayName: 'A', role: 'sale', active: true }];
  assert.equal(model.isDirectoryInStep(profiles, profiles), true);
  assert.equal(model.isDirectoryInStep(profiles, []), false);
  assert.equal(model.isDirectoryInStep(profiles, [{ ...profiles[0], active: false }]), false);
});

test('rules: no bootstrap bypass, private profiles, public directory, no client profile writes', () => {
  const rules = readSource('firestore.rules');
  assert.doesNotMatch(rules, /isBootstrapAdmin|admin@sunflower\.com/);
  assert.match(rules, /function isActive\(\) \{\s*return hasUserProfile\(\)\s*&& userProfile\(\)\.active == true/);
  assert.match(
    rules,
    /match \/users\/\{userId\} \{\s*allow get: if signedIn\(\) && userId == request\.auth\.uid;\s*allow read: if isAdmin\(\);\s*allow write: if false;/
  );
  assert.match(rules, /match \/user_directory\/\{userId\} \{\s*allow read: if isActive\(\);\s*allow write: if false;/);
});

test('colleague lists read the directory; only admins load private profiles', () => {
  const shell = readSource('src/app/AppShell.tsx');
  assert.match(shell, /isFirebaseRuntimeEnabled \? USER_DIRECTORY_COLLECTION : 'users'/);
  assert.match(shell, /user\.role === 'admin'\s*\?\s*dbService\.subscribeCollection\('users'/);
  assert.match(shell, /<UserManagement\s+users=\{accountProfiles\}\s+directory=\{users\}/);
  assert.match(
    readSource('src/features/attendance/components/useAttendanceWorkspace.ts'),
    /collection: isFirebaseRuntimeEnabled \? USER_DIRECTORY_COLLECTION : 'users'/
  );
  const adapter = readSource('src/infrastructure/firebase/authAdapter.ts');
  assert.doesNotMatch(adapter, /setDoc|getDocs/, 'the browser never writes or lists profiles');
  assert.match(adapter, /action: 'bootstrap'/);
});

test('production bundles always sign in through Firebase and ship no demo passwords', () => {
  assert.match(
    readSource('src/infrastructure/firebase/client.ts'),
    /import\.meta\.env\.PROD \|\| import\.meta\.env\.VITE_FIREBASE_AUTH_MODE === 'email-password' \? 'email-password' : 'local'/
  );
  for (const file of ['src/infrastructure/firebase/authAdapter.ts', 'src/app/AppShell.tsx'])
    assert.doesNotMatch(readSource(file), /admin123|sale123|design123|produce123|account123|'123456'/, file);
});
