const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const model = loader()('src/features/catalog/model/itemCatalog.ts');
const admin = { uid: 'admin1', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const accountant = {
  uid: 'acc1',
  displayName: 'Kế toán',
  role: 'accountant',
  active: true,
  allowedPages: ['accounting']
};
const purchaser = {
  uid: 'pur1',
  displayName: 'Mua hàng',
  role: 'purchaser',
  active: true,
  allowedPages: ['inventory']
};
const input = (overrides = {}) => ({
  code: 'NVL001',
  name: 'Giấy PP',
  kind: 'raw_material',
  baseUnit: 'm²',
  conversions: [{ unit: 'cuộn', factor: 100 }],
  notes: '',
  ...overrides
});
const item = (overrides = {}) => ({
  ...input(),
  id: 'item1',
  normalizedCode: 'NVL001',
  active: true,
  revision: 1,
  createdAt: '2026-10-21',
  updatedAt: '2026-10-21',
  ...overrides
});
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function backend(extra = {}) {
  const store = new Map(
    Object.entries(
      structuredClone({
        'inventory/paper1': {
          materialName: 'Giấy PP',
          unit: 'cuộn',
          category: 'paper',
          qtyInStock: 20,
          qtyReserved: 3
        },
        'customers/c1': {
          companyName: 'Khách 1',
          products: [
            { id: 'prod1', productCode: 'KH01', productName: 'Tem khách', unit: 'cái', specifications: { width: 50 } }
          ]
        },
        'pos/po1': {
          poCode: 'PO01',
          customerId: 'c1',
          productionPlanFrozen: true,
          items: [{ itemId: 'line1', customerProductId: '', productName: 'Hàng nhập tay', unit: 'cái', quantity: 100 }]
        },
        ...extra
      })
    )
  );
  const versions = new Map();
  let serial = 0,
    retries = 0;
  const collection = name => ({
    doc: key => {
      const id = key || `auto${++serial}`;
      return { id, path: `${name}/${id}` };
    }
  });
  const firestore = {
    collection,
    runTransaction: async callback => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const reads = new Map(),
          writes = [];
        const result = await callback({
          get: async ref => {
            assert.equal(writes.length, 0, 'all reads must precede writes');
            reads.set(ref.path, versions.get(ref.path) || 0);
            const value = structuredClone(store.get(ref.path));
            return { id: ref.id, exists: value !== undefined, data: () => structuredClone(value) };
          },
          set: (ref, value) => writes.push({ ref, value: structuredClone(value) })
        });
        if ([...reads].some(([key, value]) => (versions.get(key) || 0) !== value)) {
          retries++;
          continue;
        }
        for (const { ref, value } of writes) {
          store.set(ref.path, value);
          versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('transaction retries exhausted');
    }
  };
  const server = loader({
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
    './adminUsers.js': { AdminApiError: ApiError }
  })('server/itemCatalog.ts');
  const manage = (body, actor = admin) => server.manageItemCatalog(actor, body);
  const create = (value = input(), extras = {}, actor = admin) =>
    manage({ action: 'create', item: value, requestId: `req${++serial}`, ...extras }, actor);
  const items = () => [...store.entries()].filter(([key]) => key.startsWith('item_catalog/')).map(([, value]) => value);
  const links = () =>
    [...store.entries()].filter(([key]) => key.startsWith('catalog_links/')).map(([, value]) => value);
  const source = (type, key) => model.catalogSources(type, [{ ...store.get(key), id: key.split('/')[1] }])[0];
  const link = (source, catalogItemId, extras = {}) =>
    manage({
      action: 'link',
      catalogItemId,
      source: source.ref,
      sourceFingerprint: source.fingerprint,
      expectedLinkRevision: 0,
      requestId: `req${++serial}`,
      ...extras
    });
  return { manage, create, store, items, links, source, link, retries: () => retries };
}

test('units normalize spelling only and never invent roll or area conversions', () => {
  const value = model.validateCatalogInput(input({ baseUnit: ' M2 ', conversions: [{ unit: ' Cuộn ', factor: 100 }] }));
  assert.equal(value.baseUnit, 'm²');
  assert.equal(value.conversions[0].unit, 'cuộn');
  const product = item(value);
  assert.equal(model.conversionFactor(product, 'm2'), 1);
  assert.equal(model.conversionFactor(product, 'CUỘN'), 100);
  assert.throws(() => model.conversionFactor(product, 'm'), /chưa có quy đổi/);
  assert.throws(() => model.conversionFactor(item({ baseUnit: 'cái', conversions: [] }), 'tem'), /chưa có quy đổi/);
});
test('validation rejects corrupt input, invalid type, duplicate units and invalid factors', () => {
  for (const value of [
    null,
    [],
    {},
    input({ code: '' }),
    input({ name: 'a\nb' }),
    input({ kind: 'service' }),
    input({ baseUnit: '' }),
    input({ conversions: [{ unit: 'm2', factor: 1 }] }),
    input({
      conversions: [
        { unit: 'kg', factor: 1 },
        { unit: 'KG', factor: 2 }
      ]
    }),
    input({ conversions: [{ unit: 'cuộn', factor: 0 }] }),
    input({ conversions: [{ unit: 'cuộn', factor: Infinity }] }),
    input({ conversions: [{ unit: 'cuộn', factor: true }] })
  ])
    assert.throws(() => model.validateCatalogInput(value));
});
test('identity, type, base unit and saved conversion factors remain immutable', () => {
  const previous = item();
  for (const update of [
    { code: 'OTHER' },
    { kind: 'finished_good' },
    { baseUnit: 'kg' },
    { conversions: [] },
    { conversions: [{ unit: 'cuộn', factor: 101 }] }
  ])
    assert.throws(() => model.validateCatalogUpdate(previous, input(update)));
  assert.doesNotThrow(() =>
    model.validateCatalogUpdate(
      previous,
      input({ name: 'Tên mới', conversions: [...previous.conversions, { unit: 'thùng', factor: 1000 }] })
    )
  );
});
test('same customer codes stay scoped; explicit manual lines never auto-match by name or code', () => {
  const documents = ['c1', 'c2'].map(id => ({
    id,
    companyName: id,
    products: [{ id: 'same-product-id', productCode: 'TRUNG', productName: 'Tên trùng', unit: 'cái' }]
  }));
  const sources = model.catalogSources('customer_product', documents);
  assert.notEqual(sources[0].key, sources[1].key);
  assert.ok(
    sources.every(
      source =>
        model.resolveCatalogSource(source, [], [item({ code: 'TRUNG', name: 'Tên trùng' })]).status === 'unlinked'
    )
  );
  const [manual] = model.catalogSources('po_item', [
    { id: 'po1', items: [{ customerProductId: '', productCode: 'TRUNG', productName: 'Tên trùng', unit: 'cái' }] }
  ]);
  assert.equal(model.resolveCatalogSource(manual, [], []).status, 'unlinked');
});
test('missing source units are reported, not fabricated by CRM normalization', () => {
  const [source] = model.catalogSources('customer_product', [{ id: 'c1', products: [{ productName: 'Cũ' }] }]);
  assert.equal(source.unit, '');
  assert.match(source.problem, /Thiếu/);
  const duplicate = model.catalogSources('po_item', [
    { id: 'p1', items: [1, 2].map(() => ({ itemId: 'dup', productName: 'A', unit: 'cái' })) }
  ]);
  assert.ok(duplicate.every(source => source.problem.includes('trùng')));
});
test('reordering id-less rows or changing technical data invalidates old mappings', () => {
  const rows = [100, 200].map(quantity => ({ productName: 'Tem', unit: 'cái', quantity }));
  const before = model.catalogSources('po_item', [{ id: 'p1', items: rows }]);
  const after = model.catalogSources('po_item', [{ id: 'p1', items: [...rows].reverse() }]);
  const link = {
    sourceKey: before[0].key,
    sourceFingerprint: before[0].fingerprint,
    sourceUnit: 'cái',
    catalogItemId: 'item1'
  };
  assert.equal(model.resolveCatalogSource(after[0], [link], [item({ baseUnit: 'cái' })]).status, 'stale');
});
test('CSV supports BOM, delimiters, escaped quotes and multiline notes with deterministic row preview', () => {
  const rows = model.parseCatalogCsv(
    '\uFEFFcode;name;kind;baseUnit;conversions;notes\r\nA;"Giấy; ""PP""";raw_material;m2;cuộn:100;"dòng 1\ndòng 2"\r\n'
  );
  assert.equal(rows[0].name, 'Giấy; "PP"');
  assert.equal(rows[0].notes, 'dòng 1\ndòng 2');
  assert.equal(model.previewCatalogImport(rows, [])[0].error, '');
  assert.equal(model.parseCatalogCsv(model.catalogCsvTemplate).length, 2);
  assert.equal(
    model.parseCatalogCsv('code\tname\tkind\tbaseUnit\tconversions\tnotes\nA\tB\tresale\tcái\t\t').length,
    1
  );
});
test('CSV errors block import: duplicate normalized codes, existing inactive code, malformed files and invalid factors', () => {
  const duplicates = model.previewCatalogImport([input({ code: 'Ａ' }), input({ code: ' a ' })], []);
  assert.ok(duplicates.every(row => row.error.includes('trùng')));
  assert.match(model.previewCatalogImport([input()], [item({ active: false })])[0].error, /đã có/);
  assert.match(
    model.previewCatalogImport([input({ conversions: [{ unit: 'cuộn', factor: NaN }] })], [])[0].error,
    /Hệ số/
  );
  for (const csv of [
    '',
    'code,name\nA,B',
    'code,name,kind,baseUnit,conversions,notes\nA,"bad',
    'code,name,kind,baseUnit,conversions,notes\nA,"bad"x,resale,cái,,',
    'a'.repeat(1_000_001)
  ])
    assert.throws(() => model.parseCatalogCsv(csv));
  assert.throws(
    () =>
      model.parseCatalogCsv(
        'code,name,kind,baseUnit,conversions,notes\n' +
          Array.from({ length: 51 }, (_, i) => `A${i},B,resale,cái,,`).join('\n')
      ),
    /1 đến 50/
  );
});
test('create and explicit legacy link are atomic and leave inventory and frozen PO untouched', async () => {
  const b = backend();
  const source = b.source('inventory', 'inventory/paper1');
  const before = JSON.stringify([...b.store.entries()]);
  await assert.rejects(
    b.create(input({ conversions: [] }), {
      source: source.ref,
      sourceFingerprint: source.fingerprint,
      expectedLinkRevision: 0
    }),
    /quy đổi/
  );
  assert.equal(JSON.stringify([...b.store.entries()]), before);
  await b.create(
    input(),
    { source: source.ref, sourceFingerprint: source.fingerprint, expectedLinkRevision: 0 },
    accountant
  );
  assert.equal(b.items().length, 1);
  assert.equal(b.links()[0].factor, 100);
  assert.equal(b.store.get('inventory/paper1').qtyInStock, 20);
  assert.equal(b.store.get('inventory/paper1').qtyReserved, 3);
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, true);
  assert.equal(model.resolveCatalogSource(source, b.links(), b.items()).status, 'linked');
});
test('batch import has no partial writes when any code already exists', async () => {
  const b = backend();
  await b.create();
  const before = JSON.stringify([...b.store.entries()]);
  await assert.rejects(
    b.manage({ action: 'import', requestId: 'batch1', items: [input({ code: 'NEW' }), input()] }),
    /đã tồn tại/
  );
  assert.equal(JSON.stringify([...b.store.entries()]), before);
  await assert.rejects(
    b.manage({ action: 'import', requestId: 'batch2', items: [input({ code: 'Ａ' }), input({ code: ' a ' })] }),
    /trùng/
  );
  assert.equal(b.items().length, 1);
});
test('50-row imports persist an audit and receipt; exact retries do not duplicate data', async () => {
  const b = backend();
  const body = {
    action: 'import',
    requestId: 'batch50',
    items: Array.from({ length: 50 }, (_, i) => input({ code: `A${i}` }))
  };
  const result = await b.manage(body, purchaser);
  const count = b.store.size;
  assert.equal(result.ids.length, 50);
  assert.deepEqual(await b.manage(body, purchaser), result);
  assert.equal(b.store.size, count);
  assert.equal(b.store.get('catalog_requests/batch50').count, 50);
  await assert.rejects(b.manage({ ...body, items: [input()] }, purchaser), error => error.status === 409);
  await assert.rejects(b.manage(body, accountant), error => error.status === 409);
});
test('concurrent duplicate creates serialize on the normalized code reservation', async () => {
  const b = backend();
  const results = await Promise.allSettled([b.create(input({ code: 'ＭＡ01' })), b.create(input({ code: 'ma01' }))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(b.items().length, 1);
  assert.ok(b.retries() > 0);
});
test('stale updates fail; deactivation reserves the code and invalidates live mappings', async () => {
  const b = backend();
  const source = b.source('inventory', 'inventory/paper1');
  await b.create();
  const previous = b.items()[0];
  await b.link(source, previous.id);
  const body = {
    action: 'update',
    id: previous.id,
    expectedRevision: 1,
    requestId: 'update1',
    active: false,
    item: input({ name: 'Tên đã sửa' })
  };
  await b.manage(body);
  await assert.rejects(b.manage({ ...body, requestId: 'update2', active: true }), error => error.status === 409);
  await assert.rejects(b.create(), /đã tồn tại/);
  assert.equal(model.resolveCatalogSource(source, b.links(), b.items()).status, 'inactive');
  assert.equal(b.store.get('inventory/paper1').materialName, 'Giấy PP');
});
test('links validate source state, source revision, target status, unit and inventory kind', async () => {
  const b = backend();
  await b.create();
  const id = b.items()[0].id;
  const source = b.source('inventory', 'inventory/paper1');
  await assert.rejects(b.link({ ...source, fingerprint: 'stale' }, id), error => error.status === 409);
  await b.link(source, id);
  await assert.rejects(b.link(source, id), error => error.status === 409);
  b.store.get('inventory/paper1').unit = 'kg';
  await assert.rejects(b.link(source, id, { expectedLinkRevision: 1 }), error => error.status === 409);
  const current = b.source('inventory', 'inventory/paper1');
  await assert.rejects(b.link(current, id, { expectedLinkRevision: 1 }), /quy đổi/);
  await b.create(input({ code: 'FG', kind: 'finished_good', baseUnit: 'kg', conversions: [] }));
  await assert.rejects(b.link(current, b.items()[1].id, { expectedLinkRevision: 1 }), /Nguyên vật liệu/);
});
test('manual frozen PO lines and identical codes of two customers can link separately', async () => {
  const b = backend({
    'customers/c2': {
      companyName: 'Khách 2',
      products: [{ id: 'prod1', productCode: 'KH01', productName: 'Tem khách', unit: 'cái' }]
    }
  });
  const frozen = structuredClone(b.store.get('pos/po1'));
  await b.create(input({ code: 'FG1', kind: 'finished_good', baseUnit: 'cái', conversions: [] }));
  await b.create(input({ code: 'FG2', kind: 'finished_good', baseUnit: 'cái', conversions: [] }));
  await b.link(b.source('customer_product', 'customers/c1'), b.items()[0].id);
  await b.link(b.source('customer_product', 'customers/c2'), b.items()[1].id);
  await b.link(b.source('po_item', 'pos/po1'), b.items()[0].id);
  assert.equal(b.links().length, 3);
  assert.notEqual(b.links()[0].catalogItemId, b.links()[1].catalogItemId);
  assert.deepEqual(b.store.get('pos/po1'), frozen);
});
test('only authorized active admin, purchasing and accounting accounts can write catalog', async () => {
  for (const actor of [accountant, purchaser, admin]) {
    const b = backend();
    await b.create(input(), {}, actor);
    assert.equal(b.items().length, 1);
  }
  for (const actor of [
    { ...accountant, active: false },
    { ...accountant, allowedPages: [] },
    { ...accountant, allowedPages: undefined },
    { ...purchaser, allowedPages: [] },
    { ...admin, role: 'sale', allowedPages: ['inventory', 'accounting'] },
    { ...admin, role: 'producer', allowedPages: ['inventory'] }
  ]) {
    const b = backend();
    await assert.rejects(b.create(input(), {}, actor), error => error.status === 403);
    assert.equal(b.items().length, 0);
  }
});
test('bad actions, payload sizes, request IDs and missing source records cannot write', async () => {
  const b = backend();
  for (const body of [
    { action: 'delete', requestId: 'req1' },
    { action: 'create', requestId: '../x', item: input() },
    { action: 'create', requestId: 'req2', item: null },
    { action: 'import', requestId: 'req3', items: [] },
    { action: 'create', requestId: 'req4', item: input({ notes: 'a'.repeat(260_000) }) }
  ])
    await assert.rejects(b.manage(body));
  await b.create();
  await assert.rejects(
    b.link({ ref: { type: 'inventory', documentId: 'missing', rowKey: '' }, fingerprint: '' }, b.items()[0].id),
    error => error.status === 404
  );
  assert.equal(b.links().length, 0);
});
test('shared authentication verifies revocation, disabled users and canonical profile instead of supplied role', async () => {
  let profile = { ...accountant, email: 'acc@company.vn' };
  let disabled = false;
  let revoked = false;
  const caller = loader({
    './adminUsers.js': { AdminApiError: ApiError },
    './firebaseAdmin.js': {
      getFirebaseAdminServices: () => ({
        auth: {
          verifyIdToken: async (token, checkRevoked) => {
            assert.equal(checkRevoked, true);
            if (revoked) throw new Error('revoked');
            return { uid: 'acc1' };
          },
          getUser: async () => ({ email: 'acc@company.vn', disabled })
        },
        firestore: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => profile }) }) }) }
      })
    }
  })('server/erpCaller.ts');
  const request = () => new Request('https://example.test', { headers: { Authorization: 'Bearer valid' } });
  assert.equal((await caller.requireActiveErpCaller(request())).role, 'accountant');
  await assert.rejects(
    caller.requireActiveErpCaller(new Request('https://example.test')),
    error => error.status === 401
  );
  disabled = true;
  await assert.rejects(caller.requireActiveErpCaller(request()), error => error.status === 401);
  disabled = false;
  revoked = true;
  await assert.rejects(caller.requireActiveErpCaller(request()), error => error.status === 401);
  revoked = false;
  for (const change of [{ active: false }, { active: 'true' }, { uid: 'other' }, { email: 'wrong@company.vn' }]) {
    profile = { ...accountant, email: 'acc@company.vn', ...change };
    await assert.rejects(caller.requireActiveErpCaller(request()), error => error.status === 403);
  }
});
test('client does not acknowledge writes in demo mode, offline or for HTTP failure', async () => {
  const gateway = { isFirebaseRuntimeEnabled: false, authService: { getIdToken: async () => 'token' }, dbService: {} };
  const service = loader({ '@/infrastructure/firebase/erpDataGateway': gateway })(
    'src/features/catalog/api/itemCatalogService.ts'
  );
  await assert.rejects(service.mutateItemCatalog({}), /demo/);
  gateway.isFirebaseRuntimeEnabled = true;
  const previousFetch = global.fetch;
  try {
    global.fetch = async () => {
      throw new Error('offline');
    };
    await assert.rejects(service.mutateItemCatalog({}), /phản hồi/);
    global.fetch = async () => new Response(JSON.stringify({ error: 'Từ chối' }), { status: 403 });
    await assert.rejects(service.mutateItemCatalog({}), /Từ chối/);
    let savedBody;
    global.fetch = async (_, options) => {
      savedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ success: true, ids: ['a'], requestId: 'same-id' }));
    };
    const result = await service.mutateItemCatalog({ requestId: 'same-id' });
    assert.equal(result.success, true);
    assert.equal(savedBody.requestId, 'same-id');
  } finally {
    global.fetch = previousFetch;
  }
});
test('catalog security contract denies direct client writes and keeps unrelated collections denied', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const collection of ['item_catalog', 'catalog_links', 'catalog_requests']) {
    const block = rules.match(new RegExp(`match /${collection}/\\{documentId\\} \\{([\\s\\S]*?)\\n    \\}`));
    assert.ok(block);
    assert.match(block[1], /allow read: if canManageItemCatalog\(\)/);
    assert.match(block[1], /allow write: if false/);
  }
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false/);
});

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function nodeText(tree) {
  if (Array.isArray(tree)) return tree.map(nodeText).join('');
  return tree && typeof tree === 'object' ? nodeText(tree.props?.children) : String(tree ?? '');
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && nodeText(node) === label);
function catalogScreen(options = {}) {
  const file = 'src/features/catalog/components/ItemCatalogWorkspace.tsx';
  const ast = ts.createSourceFile(
    file,
    fs.readFileSync(path.join(root, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const names = [];
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === 'useState'
    )
      names.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const React = require('react');
  let cursor = 0,
    refCursor = 0;
  const state = new Map(Object.entries({ loading: false, loaded: true, ...options.state }));
  const refs = [];
  const fakeReact = {
    ...React,
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      const name = names[index] || `hook${index}`;
      if (!state.has(name)) state.set(name, typeof initial === 'function' ? initial() : initial);
      return [state.get(name), next => state.set(name, typeof next === 'function' ? next(state.get(name)) : next)];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    }
  };
  const Component = loader({
    react: fakeReact,
    '@/infrastructure/firebase/erpDataGateway': { isFirebaseRuntimeEnabled: options.online !== false },
    '@/shared/feedback/mutationFeedback': { showErrorToast() {}, showSuccessToast() {} },
    '../api/itemCatalogService': {
      mutateItemCatalog:
        options.mutate ||
        (async () => {
          throw new Error('unexpected write');
        }),
      loadItemCatalog: options.load || (async () => ({ items: [], links: [], imports: [] })),
      loadLegacyCatalogSources: async () => []
    }
  })(file).ItemCatalogWorkspace;
  const render = () => {
    cursor = 0;
    refCursor = 0;
    return Component({ currentUser: options.actor || accountant });
  };
  const setField = (label, value) => {
    const parent = nodes(render()).find(
      node => node.type === 'label' && typeof node.props.children?.[0] === 'string' && node.props.children[0] === label
    );
    assert.ok(parent, `Missing label ${label}`);
    nodes(parent)
      .find(node => ['input', 'select', 'textarea'].includes(node.type))
      .props.onChange({ target: { value } });
  };
  return { render, state, setField };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test('real catalog form preserves its request ID after a lost response and does not create another item', async () => {
  const b = backend();
  const calls = [];
  let first = true;
  const screen = catalogScreen({
    mutate: async body => {
      calls.push(body);
      const result = await b.manage(body, accountant);
      if (first) {
        first = false;
        throw new Error('Lost response after commit');
      }
      return result;
    },
    load: async () => ({ items: b.items(), links: b.links(), imports: [] })
  });
  button(screen.render(), 'Tạo mã hàng').props.onClick();
  // D-MA1: a new item has no code box; the user picks the material group and the server issues the code.
  assert.ok(!nodes(screen.render()).some(node => node.type === 'label' && node.props.children?.[0] === 'Mã nội bộ *'));
  nodes(screen.render())
    .find(node => node.type?.name === 'CatalogCodeFields')
    .props.onChange({ scheme: 'customer', customerId: '', shortCode: '', group: 'DCG' });
  screen.setField('Tên hàng *', 'Giấy UI');
  screen.setField('ĐVT cơ sở *', 'kg');
  for (let i = 0; i < 2; i++) {
    nodes(screen.render())
      .find(node => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    await flush();
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(b.items().length, 1);
  assert.equal(screen.state.get('editor'), null);
  assert.equal(screen.state.get('data').items[0].code, 'NVL-DCG-001');
});
test('real CSV preview performs no writes and disables commit for any invalid row', async () => {
  const screen = catalogScreen();
  button(screen.render(), 'Nhập CSV').props.onClick();
  const upload = nodes(screen.render()).find(node => node.type === 'input' && node.props.type === 'file');
  const file = {
    name: 'old.csv',
    size: 100,
    text: async () =>
      'code,name,kind,baseUnit,conversions,notes\nA,Giấy,raw_material,kg,,\nA,Giấy trùng,raw_material,kg,,'
  };
  upload.props.onChange({ target: { files: [file] } });
  await flush();
  const tree = screen.render();
  assert.equal(button(tree, 'Xác nhận nhập 2 mã').props.disabled, true);
  assert.match(nodeText(tree), /2 dòng lỗi/);
  assert.equal(
    nodes(tree).find(node => node.props?.className === 'card catalog-form').props['data-erp-table-layout'],
    'content'
  );
});
test('actual linking UI requires explicit target and a declared unit conversion', () => {
  const source = model.catalogSources('inventory', [{ id: 'inv1', materialName: 'Giấy', unit: 'cuộn' }])[0];
  const screen = catalogScreen({
    state: {
      view: 'legacy',
      sourceLoaded: true,
      sources: [source],
      data: { items: [item({ baseUnit: 'kg', conversions: [] })], links: [], imports: [] }
    }
  });
  nodes(screen.render())
    .find(node => node.type?.name === 'RowActionMenu')
    .props.actions[0].onSelect();
  assert.equal(screen.state.get('targetId'), '');
  screen.setField('Mã nội bộ *', 'item1');
  const tree = screen.render();
  assert.equal(button(tree, 'Xác nhận liên kết').props.disabled, true);
  assert.match(nodeText(tree), /chưa có quy đổi/);
});
test('failed loads and demo mode keep actual UI write buttons disabled; Sale sees no workspace', () => {
  assert.equal(button(catalogScreen({ state: { loaded: false } }).render(), 'Tạo mã hàng').props.disabled, true);
  assert.equal(button(catalogScreen({ online: false }).render(), 'Tạo mã hàng').props.disabled, true);
  assert.match(nodeText(catalogScreen({ actor: { ...accountant, role: 'sale' } }).render()), /không có quyền/);
});
test('unsaved-input navigation guards block leaving and are removed on cleanup', () => {
  const guard = loader()('src/shared/feedback/navigationGuard.ts');
  assert.equal(guard.confirmAppNavigation(), true);
  const unregister = guard.registerNavigationGuard(() => false);
  assert.equal(guard.confirmAppNavigation(), false);
  unregister();
  assert.equal(guard.confirmAppNavigation(), true);
});
test('changing a mapping retains its previous and next values in the immutable audit trail', async () => {
  const b = backend();
  await b.create(input({ code: 'A' }));
  await b.create(input({ code: 'B' }));
  const source = b.source('inventory', 'inventory/paper1');
  await b.link(source, b.items()[0].id);
  await b.link(source, b.items()[1].id, { expectedLinkRevision: 1 });
  const edits = [...b.store.entries()]
    .filter(([key, value]) => key.startsWith('audit_events/') && value.action === 'catalog_link')
    .map(([, value]) => value);
  assert.equal(edits.length, 2);
  assert.equal(edits[0].previousLink, null);
  assert.equal(edits[1].previousLink.catalogItemId, b.items()[0].id);
  assert.equal(edits[1].nextLink.catalogItemId, b.items()[1].id);
  assert.equal(b.links()[0].revision, 2);
  assert.equal(b.store.get('inventory/paper1').qtyInStock, 20);
});
test('HTTP catalog endpoint rejects malformed JSON and maps validation errors to readable responses', async () => {
  const route = loader({
    '../../server/erpCaller.js': { requireActiveErpCaller: async () => accountant },
    '../../server/itemCatalog.js': {
      manageItemCatalog: async () => {
        throw new Error('Đơn vị chưa hợp lệ');
      }
    }
  })('api/catalog/manage.ts');
  const malformed = await route.POST(
    new Request('https://example.test/api/catalog/manage', { method: 'POST', body: '{' })
  );
  assert.equal(malformed.status, 400);
  const validation = await route.POST(
    new Request('https://example.test/api/catalog/manage', { method: 'POST', body: '{}' })
  );
  assert.equal(validation.status, 400);
  assert.equal((await validation.json()).error, 'Đơn vị chưa hợp lệ');
  assert.equal(validation.headers.get('cache-control'), 'no-store');
});

test('D-MA1: the server issues item codes by series and reserves a customer short code once', async () => {
  const { createHash } = require('node:crypto');
  const itemKey = code => `item_catalog/itm-${createHash('sha256').update(code).digest('hex')}`;
  const b = backend({
    'customers/c2': { companyName: 'Khách 2' },
    [itemKey('TC-0001')]: item({ code: 'TC-0001', normalizedCode: 'TC-0001', kind: 'finished_good' })
  });
  const issue = (value, codeRequest, actor = admin) =>
    b.create(input({ code: 'FORGED', ...value }), { codeRequest }, actor);
  const codes = () => b.items().map(entry => entry.code);

  await issue({}, { group: 'DCG' });
  await issue({ kind: 'resale', baseUnit: 'cái', conversions: [] }, {});
  await issue({ kind: 'finished_good', baseUnit: 'cái', conversions: [] }, { scheme: 'standard' });
  assert.ok(codes().includes('NVL-DCG-001'));
  assert.ok(codes().includes('HM-0001'));
  assert.ok(codes().includes('TC-0002'), 'a code typed before D-MA1 is stepped over, never overwritten');
  assert.ok(!codes().includes('FORGED'), 'the code sent by the client is ignored');

  const product = { kind: 'finished_good', baseUnit: 'cái', conversions: [] };
  await assert.rejects(issue(product, { scheme: 'customer', customerId: 'c1' }), /chưa có mã viết tắt/);
  await assert.rejects(issue(product, { scheme: 'customer', customerId: 'c1', shortCode: 'Ánh' }), /3–5 chữ/);
  await issue(product, { scheme: 'customer', customerId: 'c1', shortCode: 'aqua' }, accountant);
  assert.equal(b.store.get('customers/c1').shortCode, 'AQUA');
  assert.equal(b.store.get('customers/c1').companyName, 'Khách 1', 'reserving the short code keeps the customer');
  assert.equal(b.store.get('customer_short_codes/AQUA').customerId, 'c1');
  await issue(product, { scheme: 'customer', customerId: 'c1', shortCode: 'OTHER' });
  assert.equal(b.store.get('customers/c1').shortCode, 'AQUA', 'a reserved short code never changes');
  assert.ok(codes().includes('TP-AQUA-001') && codes().includes('TP-AQUA-002'));
  await assert.rejects(
    issue(product, { scheme: 'customer', customerId: 'c2', shortCode: 'AQUA' }),
    /đã dùng cho khách hàng khác/
  );
  await assert.rejects(issue({}, { group: 'XYZ' }), /nhóm NVL/);

  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const customers = rules.match(/match \/customers\/\{documentId\} \{([\s\S]*?)\n    \}/)[1];
  assert.equal((customers.match(/'shortCode', 'shortCodeSetAt', 'shortCodeSetById'/g) || []).length, 2);
  assert.doesNotMatch(rules, /match \/(catalog_counters|customer_short_codes)\//, 'both stay server-only');
});
