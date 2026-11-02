const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

const model = loader()('src/features/administration/model/recycleBin.ts');
const caller = { uid: 'admin1', email: 'admin@example.test', profile: { displayName: 'Giám đốc', role: 'admin' } };

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** In-memory Firestore with transactions: enough for the bin's read-check-write sequence. */
function binBackend(documents) {
  const store = new Map(Object.entries(structuredClone(documents)));
  let eventSerial = 0;
  const reference = (collection, id) => ({ path: `${collection}/${id}` });
  const firestore = {
    collection: collection => ({
      doc: id => reference(collection, id ?? `event${++eventSerial}`)
    }),
    runTransaction: async work => {
      const writes = [];
      const transaction = {
        get: async ref => ({ exists: store.has(ref.path), data: () => structuredClone(store.get(ref.path)) }),
        update: (ref, fields) => writes.push(() => store.set(ref.path, { ...store.get(ref.path), ...fields })),
        set: (ref, data) => writes.push(() => store.set(ref.path, data)),
        delete: ref => writes.push(() => store.delete(ref.path))
      };
      const result = await work(transaction);
      writes.forEach(write => write());
      return result;
    }
  };
  const server = loader({
    './adminUsers.js': { AdminApiError: ApiError },
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) }
  })('server/recycleBin.ts');
  const manage = (action, kind, id) =>
    server.manageRecycledItem(caller, server.validateRecycleBody({ action: `recycle_${action}`, kind, id }));
  const events = () => [...store].filter(([path]) => path.startsWith('audit_events/')).map(([, event]) => event);
  return { store, server, manage, events };
}

test('the bin lists deleted documents and customer product codes with code, name, deleter and time', () => {
  const customers = model.recycleItemsOf('customers', [
    {
      id: 'c1',
      deleted: true,
      customerCode: 'KH001',
      companyName: 'CTY A',
      deletedAt: '2026-11-01T13:32:46.893Z',
      deletedByName: 'Giám đốc'
    },
    {
      id: 'c2',
      companyName: 'CTY B',
      products: [
        { id: 'p1', productCode: 'TEM-01', productName: 'Tem nhãn', deleted: true },
        { id: 'p2', productCode: 'TEM-02', productName: 'Còn dùng' }
      ]
    },
    { id: 'c3', companyName: 'Đang dùng' }
  ]);
  assert.deepEqual(
    customers.map(item => [item.kind, item.key, item.code, item.name, item.deletedByName]),
    [
      ['customers', 'c1', 'KH001', 'CTY A', 'Giám đốc'],
      ['customer_products', 'c2::p1', 'TEM-01', 'CTY B – Tem nhãn', '']
    ]
  );
  const [legacyOrder] = model.recycleItemsOf('production_commands', [
    { id: 'lsx-001', deleted: true, lsxCode: 'LSX-1' }
  ]);
  assert.equal(legacyOrder.code, 'LSX-1');
  assert.equal(legacyOrder.deletedAt, '', 'older deletions have no recorded time');
  assert.equal(model.formatDeletedAt(''), 'Chưa ghi nhận');
  assert.equal(model.formatDeletedAt('2026-11-01T13:32:46.893Z'), '01/11/2026 20:32');
  assert.deepEqual(
    model.sortRecycleItems([legacyOrder, customers[0]]).map(item => item.key),
    ['c1', 'lsx-001'],
    'newest recorded deletion first'
  );
  assert.deepEqual(model.deletionFields({ uid: 'u1', displayName: 'An' }, '2026-11-02T01:00:00.000Z'), {
    deleted: true,
    deletedAt: '2026-11-02T01:00:00.000Z',
    deletedById: 'u1',
    deletedByName: 'An'
  });
});

test('posted documents can be restored but never purged; old invoices stay read-only', () => {
  assert.match(model.purgeBlockReason('pos', { accountingFlowVersion: 1 }), /chứng từ kế toán/);
  assert.match(model.purgeBlockReason('suppliers', { financeLinked: true }), /chứng từ kế toán/);
  assert.match(model.purgeBlockReason('deliveries', { goodsFlowVersion: 1 }), /sổ hàng hóa/);
  assert.match(model.purgeBlockReason('invoices', {}), /chỉ đọc/);
  assert.match(model.restoreBlockReason('invoices', {}), /chỉ đọc/);
  assert.match(model.restoreBlockReason('production_commands', { productionOrderVersion: 2 }), /Lệnh sản xuất/);
  assert.equal(model.purgeBlockReason('customers', {}), '');
  assert.equal(model.restoreBlockReason('deliveries', { goodsFlowVersion: 1 }), '');
});

test('restore and purge run on the server only for records still in the bin, with an audit event', async () => {
  const b = binBackend({
    'customers/c1': { id: 'c1', companyName: 'CTY A', deleted: true },
    'leads/l1': { id: 'l1', companyName: 'Tiềm năng', deleted: true },
    'suppliers/live': { id: 'live', supplierName: 'NCC đang dùng' }
  });
  await b.manage('restore', 'customers', 'c1');
  const restored = b.store.get('customers/c1');
  assert.equal(restored.deleted, false);
  assert.deepEqual([restored.restoredById, restored.restoredByName], ['admin1', 'Giám đốc']);
  await b.manage('purge', 'leads', 'l1');
  assert.equal(b.store.has('leads/l1'), false);
  assert.deepEqual(
    b.events().map(event => [event.action, event.actorId, event.targetId]),
    [
      ['recycle_restored', 'admin1', 'c1'],
      ['recycle_purged', 'admin1', 'l1']
    ]
  );
  for (const [action, kind, id] of [
    ['purge', 'suppliers', 'live'],
    ['restore', 'customers', 'c1'],
    ['purge', 'leads', 'missing']
  ])
    await assert.rejects(b.manage(action, kind, id), error => error.status === 409);
  assert.ok(b.store.has('suppliers/live'), 'a live record is never purged');
});

test('the server refuses to purge posted documents and to restore old invoices', async () => {
  const b = binBackend({
    'pos/po1': { id: 'po1', poCode: 'DH-01', deleted: true, accountingFlowVersion: 1 },
    'deliveries/d1': { id: 'd1', deliveryCode: 'GH-01', deleted: true, goodsFlowVersion: 1 },
    'invoices/i1': { id: 'i1', deleted: true }
  });
  const before = structuredClone([...b.store]);
  await assert.rejects(b.manage('purge', 'pos', 'po1'), /chứng từ kế toán/);
  await assert.rejects(b.manage('purge', 'deliveries', 'd1'), /sổ hàng hóa/);
  await assert.rejects(b.manage('restore', 'invoices', 'i1'), /chỉ đọc/);
  assert.deepEqual([...b.store], before);
});

test('customer product codes are restored or purged inside their customer', async () => {
  const b = binBackend({
    'customers/c2': {
      id: 'c2',
      products: [
        { id: 'p1', productCode: 'TEM-01', deleted: true },
        { id: 'p2', productCode: 'TEM-02', deleted: true },
        { id: 'p3', productCode: 'TEM-03' }
      ]
    }
  });
  await b.manage('restore', 'customer_products', 'c2::p1');
  await b.manage('purge', 'customer_products', 'c2::p2');
  const products = b.store.get('customers/c2').products;
  assert.deepEqual(
    products.map(product => [product.id, product.deleted]),
    [
      ['p1', undefined],
      ['p3', undefined]
    ]
  );
  await assert.rejects(b.manage('purge', 'customer_products', 'c2::p3'), error => error.status === 409);
});

test('bin requests are validated and travel through the admin-only account endpoint', async () => {
  const { server } = binBackend({});
  for (const body of [
    { action: 'recycle_wipe', kind: 'customers', id: 'c1' },
    { action: 'recycle_purge', kind: 'users', id: 'u1' },
    { action: 'recycle_purge', kind: 'customers', id: '../users/admin' },
    { action: 'recycle_purge', kind: 'customer_products', id: 'c1' }
  ])
    assert.throws(
      () => server.validateRecycleBody(body),
      error => error.status === 400
    );
  const received = [];
  const manage = loader({
    '../../server/adminUsers.js': {
      AdminApiError: Error,
      apiErrorResponse: error => Response.json({ error: error.message }, { status: 500 }),
      jsonResponse: payload => Response.json(payload),
      readJsonBody: async request => request.json(),
      requireAdmin: async () => caller
    },
    '../../server/recycleBin.js': {
      validateRecycleBody: body => ({ action: 'purge', kind: body.kind, id: body.id }),
      manageRecycledItem: async (actor, input) => {
        received.push([actor.uid, input]);
        return { success: true, id: input.id };
      }
    }
  })('api/users/manage.ts');
  const response = await manage.POST(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ action: 'recycle_purge', kind: 'leads', id: 'l1' })
    })
  );
  assert.deepEqual(await response.json(), { success: true, id: 'l1' });
  assert.deepEqual(received, [['admin1', { action: 'purge', kind: 'leads', id: 'l1' }]]);
});

test('soft deletes stamp who deleted and when; the bin page never writes Firestore directly', () => {
  const crm = readSource('src/features/crm/pages/CrmPage.tsx');
  assert.equal(crm.match(/\.\.\.deletionFields\(currentUser\)/g).length, 2);
  assert.match(readSource('src/features/sales/pages/SalesPage.tsx'), /\.\.\.deletionFields\(currentUser\)/);
  assert.match(
    readSource('src/features/production/pages/ProductionPage.tsx'),
    /updateDocument\('production_commands',\s*lsxId,\s*deletionFields\(currentUser\)\)/
  );
  const page = readSource('src/features/administration/pages/RecycleBinPage.tsx');
  assert.doesNotMatch(page, /updateDocument|deleteDocument/);
  assert.match(page, /adminUserService\.restoreRecycled/);
  assert.match(page, /adminUserService\.purgeRecycled/);
  assert.match(page, /<RowActionMenu/);
  assert.match(page, /<DataTablePagination/);
});

test('deletes no longer ask for a shared password written in the code; only admins see them', () => {
  for (const file of [
    'src/features/crm/pages/CrmPage.tsx',
    'src/features/sales/pages/SalesPage.tsx',
    'src/features/production/pages/ProductionPage.tsx'
  ]) {
    const source = readSource(file);
    assert.doesNotMatch(source, /admin123|'123456'|mật khẩu xác nhận xóa/i, file);
  }
  const sales = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(sales, /const canDeletePO = currentUser\.role === 'admin';/);
  assert.match(sales, /\{canDeletePO && \(\s*<button[^>]*\s*className="btn btn-sm btn-danger btn-symbol-sm"/);
  const production = readSource('src/features/production/pages/ProductionPage.tsx');
  assert.match(production, /const canDeleteLsx = currentUser\.role === 'admin';/);
  assert.match(production, /\{canDeleteLsx && \(\s*<button/);
  assert.match(
    readSource('src/features/crm/pages/CrmPage.tsx'),
    /if \(currentUser\.role === 'admin'\) \{\s*if \(!\(await confirmDelete/
  );
});
