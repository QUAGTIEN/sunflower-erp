const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const resolve = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      return load([base, `${base}.ts`, `${base}.tsx`].find(candidate => fs.existsSync(candidate)));
    };
    new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

const model = loader()('src/domain/tableColumnLayout.ts');
const admin = { uid: 'admin-1', role: 'admin', active: true };
function service({ remote = true, failure } = {}) {
  const writes = [];
  const local = new Map();
  const load = loader({
    'firebase/firestore': {
      doc: (_db, collection, id) => ({ collection, id }),
      setDoc: async (...args) => { if (failure) throw failure; writes.push(args); }
    },
    '@/infrastructure/firebase/client': { getFirebaseDatabase: async () => remote ? {} : null },
    '@/infrastructure/firebase/erpDataGateway': {
      isDocumentAlreadyExistsError: error => error.code === 'document-already-exists',
      dbService: {
      getDocument: async (_collection, id) => local.get(id) || null,
      addDocument: async (_collection, data) => { local.set(data.id, data); writes.push(data); },
      addDocumentIfAbsent: async (_collection, id, data) => {
        if (local.has(id)) throw Object.assign(new Error('exists'), { code: 'document-already-exists', existingDocument: local.get(id) });
        local.set(id, data);
        writes.push(data);
        return data;
      }
    } }
  });
  return { ...load('src/services/tableColumnLayoutService.ts'), writes, local };
}

test('all employee roles and inactive admins are rejected before any write', async () => {
  const api = service();
  for (const role of ['sale', 'designer', 'purchaser', 'producer', 'accountant']) {
    await assert.rejects(api.saveTableColumnLayout({ ...admin, role }, 'leads', { selectedIds: ['company'] }), /Chỉ Admin/);
  }
  await assert.rejects(api.saveTableColumnLayout({ ...admin, active: false }, 'leads', { widths: { phone: 200 } }), /Chỉ Admin/);
  assert.equal(api.writes.length, 0);
});

test('admin saves to a table id shared across accounts and merges separate edits', async () => {
  const api = service();
  await api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company', 'phone'], widths: { phone: 200 } });
  await api.saveTableColumnLayout(admin, 'leads', { widths: { phone: 240 } });
  assert.deepEqual(api.writes[0][0], { collection: 'table_column_layouts', id: 'leads' });
  assert.deepEqual(api.writes[0][2], { merge: true });
  assert.equal(api.writes[0][1].updatedById, admin.uid);
  assert.equal(api.writes[1][1].selectedIds, undefined);
  assert.deepEqual(api.writes[1][1].widths, { phone: 240 });
});

test('failed production saves propagate errors without writing a local substitute', async () => {
  const api = service({ failure: new Error('permission-denied') });
  await assert.rejects(api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company'] }), /permission-denied/);
  assert.equal(api.local.size, 0);
});

test('local demo preserves visibility, order and other widths across separate edits', async () => {
  const api = service({ remote: false });
  await api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company', 'email', 'phone'], widths: { phone: 180, email: 220 } });
  await api.saveTableColumnLayout(admin, 'leads', { widths: { phone: 240 } });
  assert.deepEqual(api.local.get('leads').selectedIds, ['company', 'email', 'phone']);
  assert.deepEqual(api.local.get('leads').widths, { phone: 240, email: 220 });
  assert.equal(api.local.has('customers'), false);
});

test('invalid cached widths cannot overflow or break the shared table', () => {
  const normalized = model.normalizeTableColumnLayout({ id: 'leads', selectedIds: ['phone', 'phone', 123], widths: { phone: 200, bad: NaN, tooSmall: 1, tooLarge: 99999, __tableWidth: 5000 } });
  assert.deepEqual(normalized.selectedIds, ['phone']);
  assert.deepEqual(normalized.widths, { phone: 200, __tableWidth: 5000 });
  assert.equal(model.normalizeTableColumnLayout({ id: '../leads' }), null);
  assert.notEqual(model.getGenericTableLayoutId('sales', 'orders'), model.getGenericTableLayoutId('sales', 'customers'));
});

test('migrating an admin browser never overwrites an existing company configuration', async () => {
  const api = service();
  const companyLayout = { id: 'leads', schemaVersion: 1, selectedIds: ['company', 'email'], widths: { email: 220 } };
  api.local.set('leads', companyLayout);
  const saved = await api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company', 'phone'], widths: { phone: 180 } }, true);
  assert.deepEqual(saved, companyLayout);
  assert.deepEqual(api.local.get('leads'), companyLayout);
  assert.equal(api.writes.length, 0);
});

test('employee tables use company selections instead of their old private preference', () => {
  let result;
  const companyIds = ['company', 'email', 'actions'];
  const hook = loader({ '@/context/TableColumnLayoutContext': {
    useTableColumnLayouts: () => ({
      layouts: { leads: { selectedIds: companyIds } }, canEditColumns: false,
      saveLayout: () => { throw new Error('employee write'); }, migrateLayout: () => { throw new Error('employee migration'); }
    })
  } })('src/hooks/useSharedTableColumns.ts');
  function Harness() {
    result = hook.useSharedTableColumns({ layoutId: 'leads', legacySelectionKey: 'private-sale-pref' });
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  assert.deepEqual(result.selectedIds, companyIds);
  assert.equal(result.canEditColumns, false);
});

function headerProps(canEditColumns) {
  let result;
  const moved = [];
  const layouts = { leads: { id: 'leads', schemaVersion: 1, widths: { email: 220 } } };
  const hook = loader({ '@/context/TableColumnLayoutContext': {
    useTableColumnLayouts: () => ({ layouts, canEditColumns, saveLayout: () => true })
  } })('src/hooks/useReorderableTableColumns.ts');
  function Harness() {
    result = hook.useReorderableTableColumns({
      columns: ['company', 'phone', 'email', 'actions'].map(id => ({ id, label: id })),
      selectedIds: ['company', 'phone', 'email', 'actions'], layoutId: 'leads',
      lockedStartIds: ['company'], lockedEndIds: ['actions'], onOrderChange: ids => moved.push(ids)
    });
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  return { result, moved };
}

test('employees consume admin widths with no mouse, drag or keyboard edit handlers', () => {
  const { result, moved } = headerProps(false);
  const props = result.getHeaderProps('email', 'Email');
  assert.equal(props.style['--erp-column-resized-width'], '220px');
  assert.equal(props.draggable, false);
  for (const name of ['onPointerDown', 'onDragStart', 'onDrop', 'onKeyDown', 'tabIndex']) assert.equal(props[name], undefined);
  assert.match(props.className, /is-readonly/);
  assert.equal(moved.length, 0);
});

test('admin can reorder with the keyboard while mandatory edge columns stay fixed', () => {
  const { result, moved } = headerProps(true);
  const props = result.getHeaderProps('phone', 'Phone');
  assert.equal(props.draggable, true);
  assert.equal(typeof props.onPointerDown, 'function');
  props.onKeyDown({ altKey: true, key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(moved[0], ['company', 'email', 'phone', 'actions']);
  assert.equal(result.getHeaderProps('company', 'Company').draggable, false);
});

test('Firestore layout rules restrict writes to admins and never allow employee deletion', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const block = rules.match(/match \/table_column_layouts\/\{documentId\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(block);
  assert.match(block, /allow read: if isActive\(\)/);
  assert.match(block, /allow create, update: if isAdmin\(\)/);
  assert.match(block, /updatedById == request\.auth\.uid/);
  assert.match(block, /allow delete: if false/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false/);
});
