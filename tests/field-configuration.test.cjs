const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

// Compile the actual modules in memory; no browser, network or production database.
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    function resolve(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      const candidate = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`].find(p => fs.existsSync(p));
      if (!candidate) throw new Error(`Missing test module ${name}`);
      return load(candidate);
    }
    new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports);
    return mod.exports;
  }
  return load;
}

const model = loader()('src/features/crm/model/systemFieldConfig.ts');
const custom = loader()('src/features/crm/model/entityFieldConfig.ts');
const defaults = table => Object.fromEntries(model.resolveSystemFields(table, {}).map(field => [field.key, field]));

test('default catalogs are isolated and preserve mandatory identity columns', () => {
  for (const table of ['lead_candidates', 'leads', 'customers']) {
    const fields = defaults(table);
    assert.equal(fields.companyName.visible, true);
    assert.equal(new Set(Object.keys(fields)).size, Object.keys(fields).length);
    assert.deepEqual(model.validateSystemFieldOverrides(table, fields), fields);
  }
  assert.equal(defaults('leads').customerCode, undefined);
});

test('safe overrides change labels/order/visibility, never storage keys', () => {
  const fields = defaults('customers');
  fields.phone = { ...fields.phone, label: 'Điện thoại mua hàng', visible: false, order: 2 };
  assert.equal(model.validateSystemFieldOverrides('customers', fields).phone.label, 'Điện thoại mua hàng');
  for (const mutation of [
    { ...fields, customerCode: { ...fields.customerCode, visible: false } },
    { ...fields, phone: { ...fields.phone, type: 'number' } },
    { ...fields, phone: { ...fields.phone, order: NaN } },
    { ...fields, phone: { ...fields.phone, label: fields.email.label } },
    { ...fields, unknown: fields.phone }
  ]) assert.throws(() => model.validateSystemFieldOverrides('customers', mutation));
});

const e = React.createElement;
const tableUi = loader()('src/components/systemFieldLayout.ts');
test('hidden/reordered columns retain corresponding body cells, checkbox and actions', () => {
  const fields = [
    { key: 'name', label: 'Tên mới', visible: true, order: 20 },
    { key: 'phone', label: 'Điện thoại', visible: false, order: 10 },
    { key: 'email', label: 'Email', visible: true, order: 0 }
  ];
  const children = [
    e('thead', { key: 'head' }, e('tr', {}, e('th', {}, 'Chọn'), e('th', { 'data-system-field': 'name' }, 'Tên'), e('th', { 'data-system-field': 'phone' }, 'SĐT'), e('th', { 'data-system-field': 'email' }, 'Mail'), e('th', {}, 'Thao tác'))),
    e('tbody', { key: 'body' }, [1, 2].map(id => e(React.Fragment, { key: id }, e('tr', {}, e('td', {}, `check${id}`), e('td', {}, `company${id}`), e('td', {}, `phone${id}`), e('td', {}, `email${id}`), e('td', {}, `action${id}`)), e('tr', {}, e('td', { colSpan: 5 }, `detail${id}`)))))
  ];
  const html = renderToStaticMarkup(e('table', {}, tableUi.configureSystemTable(children, fields)));
  assert.match(html, /check1<\/td><td>email1<\/td><td>company1<\/td><td>action1/);
  assert.match(html, /check2<\/td><td>email2<\/td><td>company2<\/td><td>action2/);
  assert.ok(!html.includes('phone1'));
  assert.match(html, /colSpan="4"/i);
  assert.ok(html.includes('Tên mới'));
});

test('default headers keep original translations and form controls are unchanged', () => {
  const fields = model.resolveSystemFields('customers', {});
  const markup = e('thead', {}, e('tr', {}, e('th', { 'data-system-field': 'companyName' }, 'Customer')));
  const html = renderToStaticMarkup(e('table', {}, tableUi.configureSystemTable(markup, fields, model.SYSTEM_FIELD_CATALOG.customers)));
  assert.ok(html.includes('Customer</th>'));
  const labelUi = loader({ '@/hooks/useSystemFieldConfiguration': { useSystemFieldConfiguration: () => ({ fields: fields.map(field => field.key === 'companyName' ? { ...field, label: 'Tên mới' } : field) }) } })('src/components/ConfiguredSystemFields.tsx');
  const form = renderToStaticMarkup(e(labelUi.SystemFieldSurface, { table: 'customers' }, e('label', { 'data-system-label': 'companyName' }, 'Tên công ty *'), e('input', { required: true, readOnly: true, value: 'Hồ sơ cũ' })));
  assert.ok(form.includes('Tên mới *'));
  assert.match(form, /required=""/);
  assert.match(form, /readOnly=""/i);
  assert.ok(form.includes('Hồ sơ cũ'));
});

class ApiError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
function backend(seed = {}) {
  const store = new Map(Object.entries(structuredClone(seed)));
  let serial = 0;
  const snapshot = ref => ({ id: ref.id, exists: store.has(ref.path), data: () => structuredClone(store.get(ref.path)) });
  const collection = name => ({ name,
    doc: id => ({ id: id || `auto${++serial}`, path: `${name}/${id || `auto${serial}`}` }),
    where: (field, operator, value) => ({ name, field, operator, value })
  });
  const firestore = { collection, runTransaction: async callback => {
    const pending = [];
    const result = await callback({
      get: async ref => ref.path ? snapshot(ref) : { docs: [...store.keys()].filter(key => key.startsWith(`${ref.name}/`)).map(key => snapshot({ id: key.split('/')[1], path: key })).filter(doc => !ref.field || doc.data()[ref.field] === ref.value) },
      set: (ref, data) => pending.push(() => store.set(ref.path, structuredClone(data))),
      update: (ref, data) => pending.push(() => store.set(ref.path, { ...store.get(ref.path), ...structuredClone(data) }))
    });
    pending.forEach(write => write()); return result;
  } };
  const load = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) }, './adminUsers.js': { AdminApiError: ApiError } });
  const manage = load('server/fieldConfiguration.ts').manageFieldConfiguration;
  return { store, manage: body => manage({ uid: 'admin', profile: { displayName: 'Admin' } }, body) };
}
const definition = (extra = {}) => custom.normalizeEntityFieldDefinition({ id: 'custom_test', name: 'Đối thủ', fieldKey: 'doi_thu', table: 'leads', type: 'text', description: '', active: false, updatedAt: 'revision1', ...extra });
const mutation = (action, extra = {}) => ({ action, table: 'leads', id: 'custom_test', expectedUpdatedAt: 'revision1', ...extra });

for (const value of [0, false, 'Đối thủ A', ['option1']]) test(`server blocks removal of a field with historical ${JSON.stringify(value)}`, async () => {
  const { manage, store } = backend({ 'entity_field_definitions/custom_test': definition(), 'leads/old': { archived: true, customFieldValues: { custom_test: value } } });
  await assert.rejects(manage(mutation('remove')), /đã có dữ liệu/);
  assert.equal(store.get('entity_field_definitions/custom_test').removed, undefined);
  assert.deepEqual(store.get('leads/old').customFieldValues.custom_test, value);
});

test('unused-field removal is reversible and preserves metadata and audit', async () => {
  const { manage, store } = backend({ 'entity_field_definitions/custom_test': definition() });
  await manage(mutation('remove'));
  const removed = store.get('entity_field_definitions/custom_test');
  assert.equal(removed.removed, true); assert.equal(removed.name, 'Đối thủ');
  assert.ok([...store.keys()].some(key => key.startsWith('audit_events/')));
  await manage(mutation('restore', { expectedUpdatedAt: removed.updatedAt }));
  assert.equal(store.get('entity_field_definitions/custom_test').active, true);
  assert.equal(store.get('entity_field_definitions/custom_test').removed, false);
});

test('active fields cannot be removed and concurrent edits cannot overwrite silently', async () => {
  const { manage } = backend({ 'entity_field_definitions/custom_test': definition({ active: true }) });
  await assert.rejects(manage(mutation('remove')), /ngừng sử dụng/);
  await assert.rejects(manage(mutation('archive', { expectedUpdatedAt: 'old' })), error => error.status === 409);
});

test('server locks custom field type/table/key and duplicate labels', async () => {
  const { manage } = backend({ 'entity_field_definitions/custom_test': definition(), 'entity_field_definitions/other': definition({ id: 'other', name: 'Khác' }) });
  for (const change of [{ type: 'integer' }, { table: 'customers' }, { fieldKey: 'another' }, { name: 'Khác' }]) {
    await assert.rejects(manage(mutation('save', { definition: definition(change) })));
  }
});

test('retired select options remain readable after configuration update', async () => {
  const previous = definition({ type: 'single_select', options: [{ id: 'old', label: 'Cũ', active: true }] });
  const { manage, store } = backend({ 'entity_field_definitions/custom_test': previous });
  await manage(mutation('save', { definition: { ...previous, options: [{ id: 'new', label: 'Mới', active: true }] } }));
  assert.deepEqual(store.get('entity_field_definitions/custom_test').options.find(option => option.id === 'old'), { id: 'old', label: 'Cũ', active: false });
});

test('system configuration is allowlisted and revision checked on server', async () => {
  const { manage, store } = backend();
  const fields = defaults('leads'); fields.companyName.label = 'Doanh nghiệp mới';
  await manage({ action: 'system', table: 'leads', fields, expectedUpdatedAt: '' });
  assert.equal(store.get('entity_system_field_overrides/leads').fields.companyName.label, 'Doanh nghiệp mới');
  await assert.rejects(manage({ action: 'system', table: 'leads', fields, expectedUpdatedAt: '' }), error => error.status === 409);
  assert.equal(store.has('entity_system_field_overrides/customers'), false);
});

test('API rejects unauthorized requests before accessing configuration storage', async () => {
  let writes = 0;
  const load = loader({
    '../../server/adminUsers.js': { requireAdmin: async () => { throw new ApiError(403, 'Forbidden'); }, readJsonBody: async request => request.json(), apiErrorResponse: error => new Response(error.message, { status: error.status }), jsonResponse: result => Response.json(result) },
    '../../server/fieldConfiguration.js': { manageFieldConfiguration: async () => { writes++; } }
  });
  const response = await load('api/fields/manage.ts').POST(new Request('http://localhost/api/fields/manage', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 403); assert.equal(writes, 0);
});
