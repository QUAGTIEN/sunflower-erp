const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith('.css')) return {};
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      const candidate = [base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`, base].find(file => fs.existsSync(file));
      if (!candidate) throw new Error(`Missing ${name}`);
      return load(candidate);
    };
    try { new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports); }
    catch (error) { error.message = `${file}: ${error.message}`; throw error; }
    return mod.exports;
  }
  return load;
}
const model = loader()('src/features/production/model/productionOrder.ts');
const admin = { uid: 'boss', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const sale = { uid: 'sale1', displayName: 'Sale 1', role: 'sale', active: true, allowedPages: ['sales'] };
const producer = { uid: 'worker', displayName: 'Thợ máy', role: 'producer', active: true, allowedPages: ['production'] };
const po = () => ({ id: 'po1', poCode: 'PO-01', customerId: 'customer1', customerName: 'Công ty A', saleId: sale.uid, status: 'waiting_production', items: [
  { itemId: 'roll', productCode: 'TM01', productName: 'Tem cuộn', quantity: 100, unit: 'cuộn', size: '50 × 30 mm', specifications: { core: '76mm', coreType: 'Lõi giấy', paperCode: 'F0070' } },
  { itemId: 'manual', customerProductId: '', productCode: '', productName: 'Tem nhập tay', quantity: 50, unit: 'tờ' }
] });
const draft = (extra = {}) => ({ action: 'create', id: 'command1', poId: 'po1', requestId: 'request1', requiredItemIds: ['roll', 'manual'], lines: [{ itemId: 'roll', quantity: 40 }],
  deliveryDeadline: '2026-10-25', machineId: 'machine1', operatorId: 'worker', materials: [{ code: 'F0070', name: 'Giấy PP', width: '1120', unit: 'm', quantity: 60, allowancePercent: 2 }], ...extra });
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function backend(extra = {}) {
  const store = new Map(Object.entries(structuredClone({ 'pos/po1': po(), 'machines/machine1': { name: 'Máy 01', code: 'M01', status: 'available', colorCount: 4 }, 'users/worker': producer, 'inventory/paper': { qtyInStock: 1000 }, ...extra })));
  const versions = new Map(); let serial = 0; let retries = 0;
  const collection = name => ({ name, doc: id => ({ path: `${name}/${id || `auto${++serial}`}`, id: id || `auto${serial}` }), where: (field, operator, value) => ({ name, field, operator, value }) });
  const firestore = { collection, runTransaction: async callback => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const reads = new Map(), pending = [];
      const snapshot = ref => { reads.set(ref.path, versions.get(ref.path) || 0); const data = structuredClone(store.get(ref.path)); return { ...ref, exists: !!data, data: () => structuredClone(data) }; };
      const result = await callback({
        get: async ref => {
          assert.equal(pending.length, 0, 'Firestore must perform all reads before any writes');
          if (ref.path) return snapshot(ref);
          const docs = [...store.keys()].filter(key => key.startsWith(`${ref.name}/`)).map(key => snapshot({ path: key, id: key.split('/')[1] }));
          return { docs: docs.filter(doc => !ref.field || (ref.operator === 'in' ? ref.value.includes(doc.data()[ref.field]) : doc.data()[ref.field] === ref.value)) };
        },
        set: (ref, data) => pending.push({ ref, data: structuredClone(data), replace: true }),
        update: (ref, data) => pending.push({ ref, data: structuredClone(data) })
      });
      if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) { retries++; continue; }
      for (const { ref, data, replace } of pending) { store.set(ref.path, replace ? data : { ...store.get(ref.path), ...data }); versions.set(ref.path, (versions.get(ref.path) || 0) + 1); }
      return result;
    }
    throw new Error('transaction retries exhausted');
  } };
  const server = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) }, './adminUsers.js': { AdminApiError: ApiError } })('server/productionOrders.ts');
  const manage = (body, actor = admin) => server.manageProductionOrder(actor, body);
  const order = id => store.get(`production_commands/${id || 'command1'}`);
  const action = (name, id = 'command1', extra = {}, actor = admin) => manage({ action: name, id, poId: order(id).poId, expectedRevision: order(id).revision, requestId: `request_${++serial}`, ...extra }, actor);
  return { manage, action, order, store, retries: () => retries };
}

test('manual PO lines keep stable identity and snapshots do not share mutable specs', () => {
  const order = po(); const input = draft({ lines: [{ itemId: 'manual', quantity: 20 }, { itemId: 'roll', quantity: 10 }] });
  const result = model.validateProductionDraft(order, [], input);
  assert.equal(result.lines[0].itemId, 'manual'); assert.equal(result.lines[0].productCode, '');
  order.items[0].specifications.core = '25mm'; assert.equal(result.lines[1].specifications.core, '76mm');
});
test('scope excludes resale/service lines, rejects duplicate/foreign IDs and invalid numbers', () => {
  for (const lines of [[{ itemId: 'foreign', quantity: 1 }], [{ itemId: 'roll', quantity: 1 }, { itemId: 'roll', quantity: 1 }], [{ itemId: 'roll', quantity: -1 }], [{ itemId: 'roll', quantity: Infinity }], [{ itemId: 'roll', quantity: NaN }]]) assert.throws(() => model.validateProductionDraft(po(), [], draft({ lines })));
  assert.throws(() => model.validateProductionDraft(po(), [], draft({ requiredItemIds: ['manual'] })), /Dòng sản phẩm/);
});
test('legacy commands require explicit reconciliation, not a guessed first-item allocation', () => {
  assert.throws(() => model.allocatedQuantities([{ id: 'old', status: 'completed', qtyToProduce: 100 }]), /đối soát/);
  assert.equal(model.allocatedQuantities([{ id: 'old', status: 'cancelled' }]).size, 0);
});
test('create stores authoritative PO snapshot, audit, scope, and leaves inventory untouched', async () => {
  const b = backend(); await b.manage(draft(), sale);
  assert.equal(b.order().status, 'draft'); assert.equal(b.order().lines[0].productName, 'Tem cuộn');
  assert.equal(b.order().inventoryPostingMode, 'actual_issue'); assert.equal(b.store.get('pos/po1').productionPlanLocked, true);
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
  assert.ok([...b.store.keys()].some(key => key.startsWith('audit_events/')));
});
test('concurrent requests cannot allocate more than the PO; transaction retries see fresh totals', async () => {
  const b = backend();
  const result = await Promise.allSettled([b.manage(draft({ lines: [{ itemId: 'roll', quantity: 60 }] })), b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 60 }] }))]);
  assert.equal(result.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(b.retries() > 0); assert.equal([...b.store.keys()].filter(key => key.startsWith('production_commands/')).length, 1);
});
test('two valid splits have unique sequential codes, including concurrent creates', async () => {
  const b = backend();
  await Promise.all([b.manage(draft()), b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 60 }] }))]);
  assert.notEqual(b.order().lsxCode, b.order('command2').lsxCode);
});
test('retries are idempotent and stale revisions cannot overwrite another user', async () => {
  const b = backend(); await b.manage(draft()); const count = b.store.size;
  await b.manage(draft()); assert.equal(b.store.size, count); assert.equal(b.order().revision, 1);
  await b.action('submit');
  await assert.rejects(b.action('return', 'command1', { expectedRevision: 1 }), error => error.status === 409);
});
test('a command ID cannot be overwritten via a different PO', async () => {
  const b = backend({ 'pos/po2': { ...po(), id: 'po2' } }); await b.manage(draft());
  await assert.rejects(b.manage(draft({ poId: 'po2', requestId: 'request2' })), error => error.status === 409);
  assert.equal(b.order().poId, 'po1');
});
test('sale may draft own PO but cannot release; disabled, foreign-sale and page-less actors cannot create', async () => {
  for (const actor of [{ ...sale, active: false }, { ...sale, uid: 'other' }, { ...sale, allowedPages: [] }]) await assert.rejects(backend().manage(draft(), actor));
  const b = backend(); await b.manage(draft(), sale); await b.action('submit', 'command1', {}, sale);
  await assert.rejects(b.action('release', 'command1', {}, sale), /Không có quyền/);
  await b.action('release'); assert.equal(b.order().status, 'released');
  assert.equal(b.order().operatorName, producer.displayName);
});
test('technical snapshot cannot change after release, including editing published drafts', async () => {
  const b = backend(); await b.manage(draft()); await b.action('submit'); await b.action('release');
  await assert.rejects(b.action('save'), /Không có quyền/);
  assert.equal(b.order().lines[0].specifications.core, '76mm');
});
test('release rejects stale PO specifications, offline machines and incomplete materials', async () => {
  for (const mode of ['spec', 'machine', 'material']) {
    const b = backend(); await b.manage(draft(mode === 'material' ? { materials: [] } : {})); await b.action('submit');
    if (mode === 'spec') b.store.get('pos/po1').items[0].specifications.core = '25mm';
    if (mode === 'machine') b.store.get('machines/machine1').status = 'maintenance';
    await assert.rejects(b.action('release')); assert.equal(b.order().status, 'pending_approval');
  }
});
test('PO can be planned during design but cannot release before production stage', async () => {
  const b = backend({ 'pos/po1': { ...po(), status: 'waiting_design' } });
  await b.manage(draft()); await b.action('submit'); await assert.rejects(b.action('release'), /sẵn sàng sản xuất/);
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, false);
});
test('a cancelled draft releases reservations and retains its history; running orders cannot be cancelled', async () => {
  const b = backend(); await b.manage(draft()); await b.action('cancel');
  assert.equal(b.store.get('pos/po1').productionPlanLocked, false);
  await b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 100 }] }));
  await b.action('submit', 'command2'); await b.action('release', 'command2'); await b.action('start', 'command2');
  await assert.rejects(b.action('cancel', 'command2')); assert.equal(b.order().status, 'cancelled');
});
test('concurrent starts for different POs cannot run on the same machine', async () => {
  const b = backend({ 'pos/po2': { ...po(), id: 'po2' } });
  await b.manage(draft()); await b.manage(draft({ poId: 'po2', id: 'command2', requestId: 'request2' }));
  for (const id of ['command1', 'command2']) { await b.action('submit', id); await b.action('release', id); }
  const result = await Promise.allSettled([b.action('start'), b.action('start', 'command2')]);
  assert.equal(result.filter(result => result.status === 'fulfilled').length, 1);
});
test('completing one split never ships the PO; every required item must meet accepted QC quantity', async () => {
  const b = backend();
  await b.manage(draft()); await b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 60 }, { itemId: 'manual', quantity: 50 }] }));
  for (const id of ['command1', 'command2']) {
    await b.action('submit', id); await b.action('release', id); await b.action('start', id);
    await b.action('complete', id, { results: b.order(id).lines.map(line => ({ itemId: line.itemId, goodQuantity: line.quantity, rejectQuantity: 0 })), qcNote: 'QC đạt' });
    assert.equal(b.store.get('pos/po1').status, id === 'command1' ? 'waiting_production' : 'waiting_delivery');
  }
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
});
test('rejected units do not count as good; unmet quantities become available for a supplementary order', async () => {
  const b = backend(); await b.manage(draft()); await b.action('submit'); await b.action('release'); await b.action('start');
  await b.action('complete', 'command1', { results: [{ itemId: 'roll', goodQuantity: 35, rejectQuantity: 5 }], qcNote: 'Hỏng 5' });
  assert.equal(b.store.get('pos/po1').productionProgress, 'partial');
  await b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 65 }] }));
  await assert.rejects(b.manage(draft({ id: 'command3', requestId: 'request3', lines: [{ itemId: 'roll', quantity: 1 }] })));
});
test('QC rejects missing, duplicate, negative, non-numeric and overrun results without partial writes', async () => {
  const b = backend(); await b.manage(draft()); await b.action('submit'); await b.action('release'); await b.action('start');
  for (const results of [[], [null], [{ itemId: 'roll', goodQuantity: 50, rejectQuantity: 0 }], [{ itemId: 'roll', goodQuantity: -1, rejectQuantity: 0 }], [{ itemId: 'roll', goodQuantity: true, rejectQuantity: 0 }]]) await assert.rejects(b.action('complete', 'command1', { results, qcNote: 'QC' }));
  assert.equal(b.order().status, 'producing');
});
test('printing is escaped, draft marked, and never performs a database or inventory mutation', () => {
  const print = loader()('src/features/production/model/productionPrint.ts').productionPrintHtml;
  const order = { lsxCode: '<script>alert(1)</script>', status: 'draft', lines: [], materials: [], createdAt: '2026-10-21', priority: 'normal', notes: '<img onerror="evil">', revision: 1 };
  const html = print(order);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img onerror'));
  assert.match(html, /KHÔNG DÙNG ĐỂ TRIỂN KHAI/); assert.match(html, /Chưa tích hợp phiếu cấp vật tư/);
  assert.match(html, /size:A4 landscape/);
});
test('mixed units are summarized separately and legacy quantities cannot crash the dashboard', () => {
  assert.equal(model.productionQuantityLabel({ productionOrderVersion: 2, lines: [{ quantity: 10, unit: 'cuộn' }, { quantity: 5, unit: 'tờ' }, { quantity: 20, unit: 'cuộn' }] }), '30 cuộn · 5 tờ');
  assert.equal(model.productionQuantityLabel({}), '0 tem');
});
test('published orders freeze PO details; cancelling the only released order unlocks its scope', async () => {
  const b = backend(); await b.manage(draft()); await b.action('submit'); await b.action('release');
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, true);
  await b.action('cancel'); assert.equal(b.store.get('pos/po1').productionPlanFrozen, false);
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
test('workspace renders empty, mixed-status and sale-scoped lists without a browser or real database', () => {
  const Component = loader({ '@/infrastructure/firebase/erpDataGateway': { dbService: {} } })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const props = { pos: [po()], currentUser: sale, users: [producer], commands: [], onRefresh() {} };
  assert.match(renderToStaticMarkup(React.createElement(Component, props)), /Chưa có lệnh phù hợp/);
  const commands = [{ id: 'one', productionOrderVersion: 2, poId: 'po1', status: 'draft', lsxCode: 'LSX-ONE', lines: [] }, { id: 'secret', productionOrderVersion: 2, poId: 'foreign', lsxCode: 'SECRET' }];
  const html = renderToStaticMarkup(React.createElement(Component, { ...props, commands }));
  assert.ok(html.includes('LSX-ONE')); assert.ok(!html.includes('SECRET')); assert.match(html, /Lập lệnh sản xuất/);
});

test('legacy-only lists count the displayed records and keep detail tables at content height', () => {
  const Component = loader({ '@/infrastructure/firebase/erpDataGateway': { dbService: {} } })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const props = { pos: [po()], currentUser: sale, users: [producer], onRefresh() {} };
  const legacy = { id: 'old', poId: 'po1', lsxCode: 'LSX-OLD', status: 'producing', productName: 'Tem cũ' };
  const html = renderToStaticMarkup(React.createElement(Component, { ...props, commands: [legacy, { ...legacy, id: 'deleted', deleted: true }, { ...legacy, id: 'foreign', poId: 'other' }] }));
  assert.match(html, /1 lệnh \(1 lệnh cũ\)/);
  assert.match(html, /Tổng số: <strong>1<\/strong>/);
  assert.match(html, /Lệnh cũ · Đang sản xuất/);
  assert.match(html, /title="Xem tại Sản xuất → Lệnh cũ"/);
  const order = { ...legacy, id: 'new', productionOrderVersion: 2, status: 'draft', lines: [], materials: [], history: [] };
  const detail = renderToStaticMarkup(React.createElement(Component, { ...props, commands: [order], initialSelectedId: 'new' }));
  assert.match(detail, /data-erp-table-layout="content"/);
  assert.ok(!detail.includes('lsx-list-frame'));
});
test('actual UI create handler sends stable PO line IDs and retries the same request without duplication', async () => {
  const states = [], refs = []; let cursor = 0, refCursor = 0; let attempts = 0; const calls = [];
  const fakeReact = { ...React, useEffect() {}, useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; }, useRef(initial) { const index = refCursor++; if (!(index in refs)) refs[index] = { current: initial }; return refs[index]; } };
  const Component = loader({ react: fakeReact, '@/infrastructure/firebase/erpDataGateway': { dbService: {} }, '../api/productionOrderService': { mutateProductionOrder: async body => { calls.push(body); if (++attempts === 1) throw new Error('Temporary network failure'); return { success: true }; } }, '@/shared/feedback/mutationFeedback': { showErrorToast() {}, showSuccessToast() {} } })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const render = () => { cursor = 0; refCursor = 0; return Component({ pos: [po()], commands: [], currentUser: sale, users: [producer], onRefresh() {} }); };
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(nodes)];
  let tree = render();
  assert.equal(tree.props['data-erp-table-layout'], undefined);
  const listFrame = nodes(tree).find(node => node.props?.className === 'lsx-list-frame');
  assert.equal(listFrame.props.children[0].props.className, 'table-container erp-primary-data-table');
  assert.equal(listFrame.props.children[1].type.name, 'DataTablePagination');
  nodes(tree).find(node => node.type === 'button' && node.props.children === 'Lập lệnh sản xuất').props.onClick();
  tree = render();
  assert.equal(tree.props['data-erp-table-layout'], 'content');
  assert.ok(!nodes(tree).some(node => node.props?.className === 'lsx-list-frame'));
  nodes(tree).find(node => node.type === 'select' && node.props.value === '' && node.props.required).props.onChange({ target: { value: 'po1' } });
  tree = render();
  nodes(tree).find(node => node.props?.['aria-label'] === 'Số lượng Tem cuộn').props.onChange({ target: { value: '40' } });
  for (let index = 0; index < 2; index++) { tree = render(); nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(calls.length, 2); assert.equal(calls[0].id, calls[1].id); assert.equal(calls[0].requestId, calls[1].requestId);
  assert.deepEqual(calls[1].lines, [{ itemId: 'roll', quantity: 40 }]); assert.equal(calls[1].poId, 'po1');
});
test('rules and module integration protect managed records and expose shared LSX tab', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /productionPlanRequiredItemIds/); assert.match(rules, /productionOrderVersion', 0\) != 2/);
  for (const file of ['src/features/sales/pages/SalesPage.tsx', 'src/features/production/pages/ProductionPage.tsx']) assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<ProductionOrderWorkspace/);
  const legacy = fs.readFileSync(path.join(root, 'src/features/production/pages/ProductionPage.tsx'), 'utf8');
  assert.ok(!legacy.includes('0.015')); assert.ok(!legacy.includes('0.0002')); assert.ok(!legacy.includes('handleCreateLsx'));
});
