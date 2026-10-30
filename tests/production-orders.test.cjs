const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const model = loader()('src/features/production/model/productionOrder.ts');
const admin = { uid: 'boss', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const sale = { uid: 'sale1', displayName: 'Sale 1', role: 'sale', active: true, allowedPages: ['sales'] };
const producer = {
  uid: 'worker',
  displayName: 'Thợ máy',
  role: 'producer',
  active: true,
  allowedPages: ['production']
};
const accountant = {
  uid: 'accountant1',
  displayName: 'Kế toán',
  role: 'accountant',
  active: true,
  allowedPages: ['accounting']
};
const po = () => ({
  id: 'po1',
  poCode: 'PO-01',
  customerId: 'customer1',
  customerName: 'Công ty A',
  saleId: sale.uid,
  status: 'waiting_production',
  items: [
    {
      itemId: 'roll',
      productCode: 'TM01',
      productName: 'Tem cuộn',
      quantity: 100,
      unit: 'cuộn',
      size: '50 × 30 mm',
      specifications: { core: '76mm', coreType: 'Lõi giấy', paperCode: 'F0070' }
    },
    { itemId: 'manual', customerProductId: '', productCode: '', productName: 'Tem nhập tay', quantity: 50, unit: 'tờ' }
  ]
});
const draft = (extra = {}) => ({
  action: 'create',
  id: 'command1',
  poId: 'po1',
  requestId: 'request1',
  requiredItemIds: ['roll', 'manual'],
  lines: [{ itemId: 'roll', quantity: 40 }],
  deliveryDeadline: '2026-10-25',
  machineId: 'machine1',
  operatorId: 'worker',
  materials: [{ code: 'F0070', name: 'Giấy PP', width: '1120', unit: 'm', quantity: 60, allowancePercent: 2 }],
  ...extra
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
        'pos/po1': po(),
        'machines/machine1': { name: 'Máy 01', code: 'M01', status: 'available', colorCount: 4 },
        'users/worker': producer,
        'inventory/paper': { qtyInStock: 1000 },
        ...extra
      })
    )
  );
  const versions = new Map();
  let serial = 0;
  let retries = 0;
  const collection = name => ({
    name,
    doc: id => ({ path: `${name}/${id || `auto${++serial}`}`, id: id || `auto${serial}` }),
    where: (field, operator, value) => ({ name, field, operator, value })
  });
  const firestore = {
    collection,
    runTransaction: async callback => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const reads = new Map(),
          pending = [];
        const snapshot = ref => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const data = structuredClone(store.get(ref.path));
          return { ...ref, exists: !!data, data: () => structuredClone(data) };
        };
        const result = await callback({
          get: async ref => {
            assert.equal(pending.length, 0, 'Firestore must perform all reads before any writes');
            if (ref.path) return snapshot(ref);
            const docs = [...store.keys()]
              .filter(key => key.startsWith(`${ref.name}/`))
              .map(key => snapshot({ path: key, id: key.split('/')[1] }));
            return {
              docs: docs.filter(
                doc =>
                  !ref.field ||
                  (ref.operator === 'in'
                    ? ref.value.includes(doc.data()[ref.field])
                    : ref.operator === 'array-contains'
                      ? (doc.data()[ref.field] || []).includes(ref.value)
                      : doc.data()[ref.field] === ref.value)
              )
            };
          },
          set: (ref, data) => pending.push({ ref, data: structuredClone(data), replace: true }),
          update: (ref, data) => pending.push({ ref, data: structuredClone(data) })
        });
        if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) {
          retries++;
          continue;
        }
        for (const { ref, data, replace } of pending) {
          store.set(ref.path, replace ? data : { ...store.get(ref.path), ...data });
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
  })('server/productionOrders.ts');
  const manage = (body, actor = admin) => server.manageProductionOrder(actor, body);
  const order = id => store.get(`production_commands/${id || 'command1'}`);
  const action = (name, id = 'command1', extra = {}, actor = admin) =>
    manage(
      {
        action: name,
        id,
        poId: order(id).poId,
        expectedRevision: order(id).revision,
        requestId: `request_${++serial}`,
        ...extra
      },
      actor
    );
  return { manage, action, order, store, retries: () => retries };
}

test('manual PO lines keep stable identity and snapshots do not share mutable specs', () => {
  const order = po();
  const input = draft({
    lines: [
      { itemId: 'manual', quantity: 20 },
      { itemId: 'roll', quantity: 10 }
    ]
  });
  const result = model.validateProductionDraft(order, [], input);
  assert.equal(result.lines[0].itemId, 'manual');
  assert.equal(result.lines[0].productCode, '');
  order.items[0].specifications.core = '25mm';
  assert.equal(result.lines[1].specifications.core, '76mm');
});
test('scope excludes resale/service lines, rejects duplicate/foreign IDs and invalid numbers', () => {
  for (const lines of [
    [{ itemId: 'foreign', quantity: 1 }],
    [
      { itemId: 'roll', quantity: 1 },
      { itemId: 'roll', quantity: 1 }
    ],
    [{ itemId: 'roll', quantity: -1 }],
    [{ itemId: 'roll', quantity: Infinity }],
    [{ itemId: 'roll', quantity: NaN }]
  ])
    assert.throws(() => model.validateProductionDraft(po(), [], draft({ lines })));
  const resale = {
    ...po(),
    items: [...po().items, { itemId: 'ink', productName: 'Mực in', quantity: 5, unit: 'hộp', productType: 'muc_in' }]
  };
  assert.throws(
    () => model.validateProductionDraft(resale, [], draft({ lines: [{ itemId: 'ink', quantity: 1 }] })),
    /Dòng sản phẩm/,
    'resale and service lines are never production lines'
  );
});
test('legacy commands require explicit reconciliation, not a guessed first-item allocation', () => {
  assert.throws(() => model.allocatedQuantities([{ id: 'old', status: 'completed', qtyToProduce: 100 }]), /đối soát/);
  assert.equal(model.allocatedQuantities([{ id: 'old', status: 'cancelled' }]).size, 0);
});
test('create stores authoritative PO snapshot, audit, scope, and leaves inventory untouched', async () => {
  const b = backend();
  await b.manage(draft(), producer);
  assert.equal(b.order().status, 'draft');
  assert.equal(b.order().lines[0].productName, 'Tem cuộn');
  assert.equal(b.order().inventoryPostingMode, 'actual_issue');
  assert.equal(b.store.get('pos/po1').productionPlanLocked, true);
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
  assert.ok([...b.store.keys()].some(key => key.startsWith('audit_events/')));
});
test('concurrent requests cannot allocate more than the PO; transaction retries see fresh totals', async () => {
  const b = backend();
  const result = await Promise.allSettled([
    b.manage(draft({ lines: [{ itemId: 'roll', quantity: 60 }] })),
    b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 60 }] }))
  ]);
  assert.equal(result.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(b.retries() > 0);
  assert.equal([...b.store.keys()].filter(key => key.startsWith('production_commands/')).length, 1);
});
test('two valid splits have unique sequential codes, including concurrent creates', async () => {
  const b = backend();
  await Promise.all([
    b.manage(draft()),
    b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 60 }] }))
  ]);
  assert.notEqual(b.order().lsxCode, b.order('command2').lsxCode);
});
test('retries are idempotent and stale revisions cannot overwrite another user', async () => {
  const b = backend();
  await b.manage(draft());
  const count = b.store.size;
  await b.manage(draft());
  assert.equal(b.store.size, count);
  assert.equal(b.order().revision, 1);
  await b.action('submit');
  await assert.rejects(b.action('return', 'command1', { expectedRevision: 1 }), error => error.status === 409);
});
test('a command ID cannot be overwritten via a different PO', async () => {
  const b = backend({ 'pos/po2': { ...po(), id: 'po2' } });
  await b.manage(draft());
  await assert.rejects(b.manage(draft({ poId: 'po2', requestId: 'request2' })), error => error.status === 409);
  assert.equal(b.order().poId, 'po1');
});
test('only active production managers can create and change LSX, including drafts previously owned by Sale', async () => {
  for (const actor of [
    sale,
    { ...sale, allowedPages: ['sales', 'production'] },
    { ...producer, active: false },
    { ...producer, allowedPages: [] },
    { ...producer, role: 'purchaser' }
  ]) {
    const b = backend();
    await assert.rejects(b.manage(draft(), actor), error => error.status === 403);
    assert.equal(b.order(), undefined);
    assert.equal(b.store.get('pos/po1').productionPlanLocked, undefined);
  }
  const b = backend();
  await b.manage(draft(), producer);
  b.order().createdById = sale.uid;
  const before = structuredClone(b.order());
  for (const action of ['save', 'submit', 'return', 'release', 'start', 'complete', 'cancel']) {
    await assert.rejects(
      b.action(action, 'command1', {}, { ...sale, allowedPages: ['production', 'sales'] }),
      error => error.status === 403
    );
    assert.throws(() => model.assertTransition(sale, b.order(), action), /không có quyền/);
  }
  assert.deepEqual(b.order(), before);
  await b.action('submit', 'command1', {}, producer);
  await b.action('release', 'command1', {}, producer);
  assert.equal(b.order().status, 'released');
  assert.equal(b.order().operatorName, producer.displayName);
});

test('technical snapshot cannot change after release, including editing published drafts', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('submit');
  await b.action('release');
  await assert.rejects(b.action('save'), /Không có quyền/);
  assert.equal(b.order().lines[0].specifications.core, '76mm');
});
test('release rejects stale PO specifications, offline machines and incomplete materials', async () => {
  for (const mode of ['spec', 'machine', 'material']) {
    const b = backend();
    await b.manage(draft(mode === 'material' ? { materials: [] } : {}));
    await b.action('submit');
    if (mode === 'spec') b.store.get('pos/po1').items[0].specifications.core = '25mm';
    if (mode === 'machine') b.store.get('machines/machine1').status = 'maintenance';
    await assert.rejects(b.action('release'));
    assert.equal(b.order().status, 'pending_approval');
  }
});
test('PO can be planned during design but cannot release before production stage', async () => {
  const b = backend({ 'pos/po1': { ...po(), status: 'waiting_design' } });
  await b.manage(draft());
  await b.action('submit');
  await assert.rejects(b.action('release'), /sẵn sàng sản xuất/);
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, false);
});
test('cancellation cannot strand actual material issues; returning all material makes cancellation possible', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('submit');
  await b.action('release');
  b.store.set('warehouse_source_state/production_command1', { lines: { paper: { quantity: 10 } } });
  await assert.rejects(b.action('cancel'), /còn NVL đã cấp/);
  assert.equal(b.order().status, 'released');
  b.store.get('warehouse_source_state/production_command1').lines.paper.quantity = 0;
  await b.action('cancel');
  assert.equal(b.order().status, 'cancelled');
});
test('a cancelled draft releases reservations and retains its history; running orders cannot be cancelled', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('cancel');
  assert.equal(b.store.get('pos/po1').productionPlanLocked, false);
  await b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 100 }] }));
  await b.action('submit', 'command2');
  await b.action('release', 'command2');
  await b.action('start', 'command2');
  await assert.rejects(b.action('cancel', 'command2'));
  assert.equal(b.order().status, 'cancelled');
});
test('concurrent starts for different POs cannot run on the same machine', async () => {
  const b = backend({ 'pos/po2': { ...po(), id: 'po2' } });
  await b.manage(draft());
  await b.manage(draft({ poId: 'po2', id: 'command2', requestId: 'request2' }));
  for (const id of ['command1', 'command2']) {
    await b.action('submit', id);
    await b.action('release', id);
  }
  const result = await Promise.allSettled([b.action('start'), b.action('start', 'command2')]);
  assert.equal(result.filter(result => result.status === 'fulfilled').length, 1);
});
test('completing one split never ships the PO; every required item must meet accepted QC quantity', async () => {
  const b = backend();
  await b.manage(draft());
  await b.manage(
    draft({
      id: 'command2',
      requestId: 'request2',
      lines: [
        { itemId: 'roll', quantity: 60 },
        { itemId: 'manual', quantity: 50 }
      ]
    })
  );
  for (const id of ['command1', 'command2']) {
    await b.action('submit', id);
    await b.action('release', id);
    await b.action('start', id);
    await b.action('complete', id, {
      results: b.order(id).lines.map(line => ({ itemId: line.itemId, goodQuantity: line.quantity, rejectQuantity: 0 })),
      qcNote: 'QC đạt'
    });
    assert.equal(b.store.get('pos/po1').status, id === 'command1' ? 'waiting_production' : 'waiting_delivery');
  }
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
});
test('rejected units do not count as good; unmet quantities become available for a supplementary order', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('submit');
  await b.action('release');
  await b.action('start');
  await b.action('complete', 'command1', {
    results: [{ itemId: 'roll', goodQuantity: 35, rejectQuantity: 5 }],
    qcNote: 'Hỏng 5'
  });
  assert.equal(b.store.get('pos/po1').productionProgress, 'partial');
  await b.manage(draft({ id: 'command2', requestId: 'request2', lines: [{ itemId: 'roll', quantity: 65 }] }));
  await assert.rejects(
    b.manage(draft({ id: 'command3', requestId: 'request3', lines: [{ itemId: 'roll', quantity: 1 }] }))
  );
});
test('QC rejects missing, duplicate, negative, non-numeric and overrun results without partial writes', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('submit');
  await b.action('release');
  await b.action('start');
  for (const results of [
    [],
    [null],
    [{ itemId: 'roll', goodQuantity: 50, rejectQuantity: 0 }],
    [{ itemId: 'roll', goodQuantity: -1, rejectQuantity: 0 }],
    [{ itemId: 'roll', goodQuantity: true, rejectQuantity: 0 }]
  ])
    await assert.rejects(b.action('complete', 'command1', { results, qcNote: 'QC' }));
  assert.equal(b.order().status, 'producing');
});
test('printing is escaped, draft marked, and never performs a database or inventory mutation', () => {
  const print = loader()('src/features/production/model/productionPrint.ts').productionPrintHtml;
  const order = {
    lsxCode: '<script>alert(1)</script>',
    status: 'draft',
    lines: [],
    materials: [],
    createdAt: '2026-10-21',
    priority: 'normal',
    notes: '<img onerror="evil">',
    revision: 1
  };
  const html = print(order);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.match(html, /KHÔNG DÙNG ĐỂ TRIỂN KHAI/);
  assert.match(html, /Chưa tích hợp phiếu cấp vật tư/);
  assert.match(html, /size:A4 landscape/);
});
test('mixed units are summarized separately and legacy quantities cannot crash the dashboard', () => {
  assert.equal(
    model.productionQuantityLabel({
      productionOrderVersion: 2,
      lines: [
        { quantity: 10, unit: 'cuộn' },
        { quantity: 5, unit: 'tờ' },
        { quantity: 20, unit: 'cuộn' }
      ]
    }),
    '30 cuộn · 5 tờ'
  );
  assert.equal(model.productionQuantityLabel({}), '0 tem');
});
test('published orders freeze PO details; cancelling the only released order unlocks its scope', async () => {
  const b = backend();
  await b.manage(draft());
  await b.action('submit');
  await b.action('release');
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, true);
  await b.action('cancel');
  assert.equal(b.store.get('pos/po1').productionPlanFrozen, false);
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const nodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          nodes
        )
      ];
function interactive(file, name, props, stubs = {}) {
  const states = [],
    refs = [];
  let cursor = 0,
    refCursor = 0;
  const fakeReact = {
    ...React,
    useEffect() {},
    useMemo: callback => callback(),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [
        states[index],
        next => {
          states[index] = typeof next === 'function' ? next(states[index]) : next;
        }
      ];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    }
  };
  const Component = loader({
    react: fakeReact,
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) },
    ...stubs
  })(file)[name];
  return () => {
    cursor = 0;
    refCursor = 0;
    return Component(props);
  };
}

test('Sale cannot open production, even with an old explicit page grant; other page rights remain intact', () => {
  const { canAccessPage } = loader()('src/app/navigation/accessControl.ts');
  assert.equal(canAccessPage({ ...sale, allowedPages: ['sales', 'production'] }, 'production'), false);
  assert.equal(canAccessPage(sale, 'sales'), true);
  assert.equal(canAccessPage(producer, 'production'), true);
  assert.equal(canAccessPage({ ...admin, allowedPages: undefined }, 'production'), true);
  const Component = loader({
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      pos: [po()],
      currentUser: { ...sale, allowedPages: ['sales', 'production'] },
      users: [],
      commands: [{ id: 'private', lsxCode: 'PRIVATE-LSX' }],
      onRefresh() {}
    })
  );
  assert.match(html, /không có quyền/);
  assert.doesNotMatch(html, /PRIVATE-LSX|Lập lệnh sản xuất/);
});

test('production has exactly two tabs; legacy detail and machine management stay reachable', () => {
  const legacy = { id: 'old', poId: 'po1', lsxCode: 'LSX-OLD', status: 'producing', productName: 'Tem cũ' };
  const render = interactive('src/features/production/pages/ProductionPage.tsx', 'Production', {
    pos: [po()],
    productionCommands: [legacy],
    currentUser: admin,
    users: [producer],
    messages: [],
    onRefresh() {}
  });
  let tree = render();
  let tabs = nodes(tree).filter(node => node.props?.role === 'tab');
  assert.deepEqual(
    tabs.map(tab => tab.props.children.trim()),
    ['Lệnh sản xuất', 'Danh sách máy']
  );
  nodes(tree)
    .find(node => node.type?.name === 'ProductionOrderWorkspace')
    .props.onOpenLegacy('old');
  tree = render();
  assert.ok(nodes(tree).some(node => node.props?.className === 'modal-overlay'));
  assert.ok(nodes(tree).some(node => node.type === 'form' && node.props.onSubmit));
  legacy.status = 'transfer_pending';
  tree = render();
  for (const label of ['Duyệt bàn giao', 'Sửa', 'Xóa']) {
    assert.ok(
      nodes(tree).some(node => node.type === 'button' && node.props.children === label),
      label
    );
  }
  tabs = nodes(tree).filter(node => node.props?.role === 'tab');
  tabs[1].props.onClick();
  tree = render();
  assert.ok(nodes(tree).some(node => node.type?.name === 'MachineManagement' && node.props.canManage));
  const shell = fs.readFileSync(path.join(root, 'src/app/AppShell.tsx'), 'utf8');
  const pages = [...shell.matchAll(/data-page-id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(pages.indexOf('production'), pages.indexOf('sales') + 1);
});

test('combined order list filters and searches legacy items and opens their existing detail flow', () => {
  const opened = [];
  const render = interactive(
    'src/features/production/components/ProductionOrderWorkspace.tsx',
    'ProductionOrderWorkspace',
    {
      pos: [po()],
      currentUser: producer,
      users: [producer],
      onRefresh() {},
      onOpenLegacy: id => opened.push(id),
      commands: [
        { id: 'new', poId: 'po1', productionOrderVersion: 2, status: 'draft', lsxCode: 'LSX-NEW', lines: [] },
        { id: 'old', poId: 'po1', status: 'transfer_pending', lsxCode: 'LSX-OLD', productNameToBeCut: 'Tem nước giặt' }
      ]
    }
  );
  let tree = render();
  const rowIds = () =>
    nodes(tree)
      .filter(node => node.type === 'tr' && node.key)
      .map(node => node.key);
  assert.deepEqual(rowIds().sort(), ['new', 'old']);
  nodes(tree)
    .find(node => node.type === 'select' && node.props.value === 'all')
    .props.onChange({ target: { value: 'legacy' } });
  tree = render();
  assert.deepEqual(rowIds(), ['old']);
  nodes(tree)
    .find(node => node.type === 'input' && node.props.type === 'search')
    .props.onChange({ target: { value: 'NƯỚC GIẶT' } });
  tree = render();
  assert.deepEqual(rowIds(), ['old']);
  nodes(tree)
    .find(node => node.type?.name === 'RowActionMenu')
    .props.actions.find(action => action.label === 'Chi tiết')
    .onSelect();
  assert.deepEqual(opened, ['old']);
  assert.ok(nodes(tree).some(node => node.type === 'option' && node.props.value === 'transfer_pending'));
});

test('machine list combines catalog, active LSX, operator and deadline while retaining edit/save', async () => {
  const writes = [];
  const machine = {
    id: 'machine1',
    code: 'M01',
    name: 'Máy thử',
    type: 'Flexo',
    colorCount: 4,
    maxWidthMm: 330,
    capacityPerHour: 1000,
    supportedMaterials: ['Giấy'],
    status: 'available',
    notes: ''
  };
  const props = {
    machines: [machine],
    productionCommands: [
      {
        id: 'running',
        machineId: 'machine1',
        status: 'producing',
        lsxCode: 'LSX-RUNNING',
        shift: 'Ca sáng',
        operatorName: producer.displayName,
        deliveryDeadline: '2026-10-25'
      }
    ],
    canManage: true
  };
  const Component = loader({ '@/infrastructure/firebase/erpDataGateway': { dbService: {} } })(
    'src/features/production/components/MachineManagement.tsx'
  ).MachineManagement;
  const html = renderToStaticMarkup(React.createElement(Component, props));
  for (const text of ['LSX-RUNNING', 'Ca sáng', 'Thợ máy', '25/10/2026', 'Đang chạy', 'Thêm máy'])
    assert.ok(html.includes(text), text);
  const render = interactive('src/features/production/components/MachineManagement.tsx', 'MachineManagement', props, {
    '@/infrastructure/firebase/erpDataGateway': {
      dbService: {
        updateDocument: async (...args) => {
          writes.push(args);
          return true;
        }
      }
    },
    '@/shared/feedback/mutationFeedback': {
      runMutationAction: (_name, action) => action(),
      requireConfirmedMutation: promise => promise,
      showSuccessToast() {}
    }
  });
  let tree = render();
  nodes(tree)
    .find(node => node.type?.name === 'RowActionMenu')
    .props.actions.find(action => action.label === 'Chỉnh sửa máy')
    .onSelect();
  tree = render();
  nodes(tree)
    .find(node => node.type === 'input' && node.props.value === 'Máy thử')
    .props.onChange({ target: { value: 'Máy cập nhật' } });
  tree = render();
  await nodes(tree)
    .find(node => node.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  assert.equal(writes[0][0], 'machines');
  assert.equal(writes[0][1], 'machine1');
  assert.equal(writes[0][2].name, 'Máy cập nhật');
  assert.deepEqual(writes[0][2].supportedMaterials, ['Giấy']);
});
test('workspace renders all accessible orders across POs without a browser or real database', () => {
  const Component = loader({
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const props = { pos: [po()], currentUser: producer, users: [producer], commands: [], onRefresh() {} };
  assert.match(renderToStaticMarkup(React.createElement(Component, props)), /Chưa có lệnh phù hợp/);
  const commands = [
    { id: 'one', productionOrderVersion: 2, poId: 'po1', status: 'draft', lsxCode: 'LSX-ONE', lines: [] },
    { id: 'secret', productionOrderVersion: 2, poId: 'foreign', lsxCode: 'SECRET' }
  ];
  const html = renderToStaticMarkup(React.createElement(Component, { ...props, commands }));
  assert.ok(html.includes('LSX-ONE'));
  assert.ok(html.includes('SECRET'));
  assert.match(html, /Lập lệnh sản xuất/);
});

test('legacy-only lists count the displayed records and keep detail tables at content height', () => {
  const Component = loader({
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const props = { pos: [po()], currentUser: producer, users: [producer], onRefresh() {} };
  const legacy = { id: 'old', poId: 'po1', lsxCode: 'LSX-OLD', status: 'producing', productName: 'Tem cũ' };
  const html = renderToStaticMarkup(
    React.createElement(Component, { ...props, commands: [legacy, { ...legacy, id: 'deleted', deleted: true }] })
  );
  assert.match(html, /Lệnh cũ \(1\)/);
  assert.match(html, /Tổng số: <strong>1<\/strong>/);
  assert.match(html, /Lệnh cũ · Đang sản xuất/);
  assert.doesNotMatch(html, /Thao tác LSX-OLD/, 'old orders without a legacy opener have no row actions');
  const order = {
    ...legacy,
    id: 'new',
    productionOrderVersion: 2,
    status: 'draft',
    lines: [],
    materials: [],
    history: []
  };
  const detail = renderToStaticMarkup(
    React.createElement(Component, { ...props, commands: [order], initialSelectedId: 'new' })
  );
  assert.match(detail, /data-erp-table-layout="content"/);
  assert.ok(!detail.includes('lsx-list-frame'));
});
test('actual UI create handler sends stable PO line IDs and retries the same request without duplication', async () => {
  const states = [],
    refs = [];
  let cursor = 0,
    refCursor = 0;
  let attempts = 0;
  const calls = [];
  const fakeReact = {
    ...React,
    useEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [
        states[index],
        next => {
          states[index] = typeof next === 'function' ? next(states[index]) : next;
        }
      ];
    },
    useRef(initial) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: initial };
      return refs[index];
    }
  };
  const Component = loader({
    react: fakeReact,
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '../api/productionOrderService': {
      mutateProductionOrder: async body => {
        calls.push(body);
        if (++attempts === 1) throw new Error('Temporary network failure');
        return { success: true };
      }
    },
    '@/shared/feedback/mutationFeedback': { showErrorToast() {}, showSuccessToast() {} }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const render = () => {
    cursor = 0;
    refCursor = 0;
    return Component({ pos: [po()], commands: [], currentUser: producer, users: [producer], onRefresh() {} });
  };
  const nodes = tree =>
    !tree || typeof tree !== 'object'
      ? []
      : [
          tree,
          ...(Array.isArray(tree.props?.children)
            ? tree.props.children.flat(Infinity)
            : [tree.props?.children]
          ).flatMap(nodes)
        ];
  let tree = render();
  assert.equal(tree.props['data-erp-table-layout'], undefined);
  const listFrame = nodes(tree).find(node => node.props?.className === 'lsx-list-frame');
  assert.equal(listFrame.props.children[0].props.className, 'table-container erp-primary-data-table');
  assert.equal(listFrame.props.children[1].type.name, 'DataTablePagination');
  nodes(tree)
    .find(node => node.type === 'button' && node.props.children === 'Lập lệnh sản xuất')
    .props.onClick();
  tree = render();
  assert.equal(tree.props['data-erp-table-layout'], 'content');
  assert.ok(!nodes(tree).some(node => node.props?.className === 'lsx-list-frame'));
  assert.ok(
    !nodes(tree).some(node => node.type === 'select' && node.props.required),
    'customers follow the chosen lines; there is no customer to pick first'
  );
  // Choosing lines is a page action in the editor header, not part of the item grid.
  nodes(tree)
    .find(node => node.type === 'button' && node.props.children === 'Chọn hàng')
    .props.onClick();
  tree = render();
  nodes(tree)
    .find(node => node.type?.name === 'LsxPoPickerDialog')
    .props.onConfirm([
      { poId: 'po1', itemId: 'roll', quantity: '100', printDetails: { materialWidth: '', priority: '' } },
      { poId: 'po1', itemId: 'manual', quantity: '50', printDetails: { materialWidth: '', priority: '' } }
    ]);
  tree = render();
  const itemTable = nodes(tree).find(node => node.type?.name === 'LsxItemsTable');
  assert.deepEqual(
    itemTable.props.lines.map(line => [line.poId, line.itemId, line.quantity]),
    [
      ['po1', 'roll', '100'],
      ['po1', 'manual', '50']
    ]
  );
  itemTable.props.onChange([{ ...itemTable.props.lines[0], quantity: '40' }]);
  for (let index = 0; index < 2; index++) {
    tree = render();
    nodes(tree)
      .find(node => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].id, calls[1].id);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.deepEqual(calls[1].lines, [
    { poId: 'po1', itemId: 'roll', quantity: 40, printDetails: { materialWidth: '', priority: '' } }
  ]);
  assert.equal(calls[1].poId, undefined, 'each line names its own PO');
});
test('rules and module integration keep LSX exclusively in production', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /productionPlanRequiredItemIds/);
  assert.match(rules, /productionOrderVersion', 0\) != 2/);
  assert.match(
    rules,
    /function canManageProduction\(\)\s*\{\s*return isAdmin\(\) \|\| \(hasPage\('production'\) && userProfile\(\)\.role == 'producer'\)/
  );
  assert.match(
    rules,
    /match \/production_commands\/\{documentId\}\s*\{[\s\S]*?allow update: if canManageProduction\(\)/
  );
  assert.match(rules, /match \/machines\/\{documentId\}\s*\{[\s\S]*?allow create, update: if canManageProduction\(\)/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, 'src/features/sales/pages/SalesPage.tsx'), 'utf8'),
    /ProductionOrderWorkspace|production-commands/
  );
  const legacy = fs.readFileSync(path.join(root, 'src/features/production/pages/ProductionPage.tsx'), 'utf8');
  assert.match(legacy, /<ProductionOrderWorkspace/);
  assert.ok(!legacy.includes('0.015'));
  assert.ok(!legacy.includes('0.0002'));
  assert.ok(!legacy.includes('handleCreateLsx'));
});

const draftFields = extra => {
  const { action, id, poId, requestId, ...fields } = draft(extra);
  return fields;
};
test('existing accountants with Accounting access can draft but cannot operate production or edit another creator', async () => {
  const b = backend();
  await b.manage(draft(), accountant);
  assert.equal(b.order().createdById, accountant.uid);
  assert.equal(model.canManageProduction(accountant), false);
  await b.action('save', 'command1', draftFields(), accountant);
  await b.action('submit', 'command1', {}, accountant);
  for (const action of ['return', 'release', 'start', 'complete', 'cancel'])
    await assert.rejects(b.action(action, 'command1', {}, accountant), error => error.status === 403);
  await b.action('return');
  await assert.rejects(
    b.action('save', 'command1', draftFields(), { ...accountant, uid: 'other-accountant' }),
    error => error.status === 403
  );
  await assert.rejects(
    b.action('submit', 'command1', {}, { ...accountant, uid: 'other-accountant' }),
    error => error.status === 403
  );
  await b.action('submit', 'command1', {}, accountant);
  await b.action('release');
  await b.action('start');
  await assert.rejects(b.action('save', 'command1', draftFields(), accountant));
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
});
test('accountant access respects account status and page revocation without writing profile data', async () => {
  const access = loader()('src/app/navigation/accessControl.ts');
  assert.equal(access.canAccessPage(accountant, 'production'), true);
  assert.ok(access.getDefaultPagesForRole('accountant').includes('production'));
  for (const actor of [
    { ...accountant, active: false },
    { ...accountant, allowedPages: [] },
    { ...accountant, role: 'sale', allowedPages: ['accounting', 'production'] }
  ]) {
    assert.equal(access.canAccessPage(actor, 'production'), false);
    const b = backend();
    await assert.rejects(b.manage(draft(), actor), error => error.status === 403);
  }
  const b = backend({ 'users/accountant1': accountant });
  await b.manage(draft(), accountant);
  assert.deepEqual(b.store.get('users/accountant1'), accountant);
});
const hash = value => require('node:crypto').createHash('sha256').update(value).digest('hex');
function catalogFixture(type = 'po_item', overrides = {}) {
  const catalogModel = loader()('src/features/catalog/model/itemCatalog.ts');
  const id = `itm-${hash('FG01')}`;
  const product = {
    id,
    code: 'FG01',
    normalizedCode: 'FG01',
    name: 'Tem nội bộ',
    kind: 'finished_good',
    baseUnit: 'cái',
    conversions: [{ unit: 'cuộn', factor: 1000 }],
    active: true,
    revision: 1,
    ...overrides
  };
  const source = catalogModel.catalogSources(type, [po()])[0];
  const linkId = `link-${hash(source.key)}`;
  return {
    id,
    product,
    source,
    linkId,
    data: {
      [`item_catalog/${id}`]: product,
      [`catalog_links/${linkId}`]: {
        id: linkId,
        source: source.ref,
        sourceKey: source.key,
        sourceFingerprint: source.fingerprint,
        catalogItemId: id,
        sourceUnit: 'cuộn',
        factor: 1000,
        baseUnit: 'cái',
        revision: 1
      }
    }
  };
}
test('production resolves confirmed PO mappings on the server and ignores forged client catalog snapshots', async () => {
  const fixture = catalogFixture();
  const b = backend(fixture.data);
  await b.manage(
    draft({ lines: [{ itemId: 'roll', quantity: 20, catalog: { id: 'forged', code: 'FORGED' } }] }),
    accountant
  );
  const line = b.order().lines[0];
  assert.equal(line.catalog.id, fixture.id);
  assert.equal(line.catalog.code, 'FG01');
  assert.equal(line.catalog.factor, 1000);
  assert.equal(line.unit, 'cuộn');
  assert.equal(line.quantity, 20);
  assert.equal(line.productCode, 'TM01');
  assert.equal(b.store.get('pos/po1').items[0].catalog, undefined);
  const options = await b.manage({ action: 'catalog', poId: 'po1' }, accountant);
  assert.equal(options.lines['po1::roll'].catalog.code, 'FG01');
  assert.equal(options.materials.length, 0);
  assert.equal(options.lines['po1::manual'].catalog, undefined);
});
test('stale/inactive mappings block storage; changed catalog requires a refreshed draft before release', async () => {
  const fixture = catalogFixture();
  const b = backend(fixture.data);
  await b.manage(draft());
  await b.action('submit');
  // Firestore map fields may arrive in a different order than the saved JS object.
  b.order().lines[0].catalog = Object.fromEntries(Object.entries(b.order().lines[0].catalog).reverse());
  await b.action('release');
  const refresh = backend(fixture.data);
  await refresh.manage(draft());
  await refresh.action('submit');
  refresh.store.get(`item_catalog/${fixture.id}`).revision = 2;
  await assert.rejects(refresh.action('release'), error => error.status === 409);
  await refresh.action('return');
  await refresh.action('save', 'command1', draftFields());
  await refresh.action('submit');
  await refresh.action('release');
  b.store.get(`item_catalog/${fixture.id}`).code = 'CHANGED-LATER';
  await b.action('start');
  assert.equal(b.order().lines[0].catalog.code, 'FG01');
  const inactive = backend({ ...fixture.data, [`item_catalog/${fixture.id}`]: { ...fixture.product, active: false } });
  await assert.rejects(inactive.manage(draft()), /không còn hoạt động/);
  assert.equal(inactive.order(), undefined);
  const stale = backend({
    ...fixture.data,
    [`catalog_links/${fixture.linkId}`]: {
      ...fixture.data[`catalog_links/${fixture.linkId}`],
      sourceFingerprint: 'stale'
    }
  });
  await assert.rejects(stale.manage(draft()), /đối chiếu/);
  const before = stale.store.size;
  const result = await stale.manage({ action: 'catalog', poId: 'po1' }, accountant);
  assert.match(result.lines['po1::roll'].error, /đối chiếu/);
  assert.equal(stale.store.size, before);
});
test('customer-product mapping is inherited only for the exact identified PO version and technical snapshot', async () => {
  const fixture = catalogFixture();
  const catalogModel = loader()('src/features/catalog/model/itemCatalog.ts');
  const product = { ...po().items[0], id: 'cp1', catalogRevision: 3 };
  const customer = { id: 'customer1', products: [product] };
  const source = catalogModel.catalogSources('customer_product', [customer])[0];
  const linkId = `link-${hash(source.key)}`;
  const data = {
    [`item_catalog/${fixture.id}`]: fixture.product,
    'customers/customer1': customer,
    [`catalog_links/${linkId}`]: {
      ...fixture.data[`catalog_links/${fixture.linkId}`],
      id: linkId,
      source: source.ref,
      sourceKey: source.key,
      sourceFingerprint: source.fingerprint
    }
  };
  const linkedPO = () => {
    const order = po();
    order.items[0] = {
      ...order.items[0],
      customerProductId: 'cp1',
      customerProductVersion: '3',
      specifications: { paperCode: 'F0070', coreType: 'Lõi giấy', core: '76mm' }
    };
    return order;
  };
  const b = backend({ ...data, 'pos/po1': linkedPO() });
  await b.manage(draft());
  assert.equal(b.order().lines[0].catalog.linkId, linkId);
  for (const patch of [
    { customerProductVersion: '2' },
    { customerProductVersion: '' },
    { customerProductId: '' },
    { specifications: { core: '25mm' } },
    { productType: 'changed' }
  ]) {
    const order = linkedPO();
    Object.assign(order.items[0], patch);
    const old = backend({ ...data, 'pos/po1': order });
    await old.manage(draft());
    assert.equal(old.order().lines[0].catalog, undefined, JSON.stringify(patch));
  }
  await assert.rejects(b.manage({ action: 'catalog', poId: 'po1' }, sale), error => error.status === 403);
});
test('material selection uses canonical code and explicit conversion but never posts stock', async () => {
  const fixture = catalogFixture('po_item', {
    kind: 'raw_material',
    baseUnit: 'm',
    conversions: [{ unit: 'cuộn', factor: 200 }]
  });
  const b = backend({ [`item_catalog/${fixture.id}`]: fixture.product });
  await b.manage(
    draft({
      materials: [
        {
          id: 'mat1',
          catalogItemId: fixture.id,
          code: 'FAKE',
          name: 'Fake',
          width: '1120',
          unit: 'cuộn',
          quantity: 2,
          allowancePercent: 0
        }
      ]
    })
  );
  const material = b.order().materials[0];
  assert.equal(material.code, 'FG01');
  assert.equal(material.name, 'Tem nội bộ');
  assert.equal(material.catalog.factor, 200);
  assert.equal(material.quantity, 2);
  assert.equal(b.store.get('inventory/paper').qtyInStock, 1000);
  const bad = backend({ [`item_catalog/${fixture.id}`]: fixture.product });
  await assert.rejects(
    bad.manage(draft({ materials: [{ catalogItemId: fixture.id, code: 'X', name: 'X', unit: 'kg', quantity: 1 }] })),
    /quy đổi/
  );
  const forbidden = backend({ [`item_catalog/${fixture.id}`]: { ...fixture.product, kind: 'finished_good' } });
  await assert.rejects(
    forbidden.manage(
      draft({ materials: [{ catalogItemId: fixture.id, code: 'X', name: 'X', unit: 'm', quantity: 1 }] })
    ),
    /Nguyên vật liệu/
  );
});
test('print template and per-line details are versioned and cannot change after release', async () => {
  const b = backend();
  await b.manage(
    draft({
      printTemplate: { id: 'white_label', version: 1 },
      lines: [{ itemId: 'roll', quantity: 40, printDetails: { materialWidth: '1120', priority: 'high' } }]
    }),
    accountant
  );
  assert.equal(b.order().printTemplate.id, 'white_label');
  assert.deepEqual(b.order().lines[0].printDetails, { materialWidth: '1120', priority: 'high' });
  await b.action('submit', 'command1', {}, accountant);
  await b.action('release');
  await assert.rejects(b.action('save', 'command1', draftFields({ printTemplate: { id: 'standard', version: 1 } })));
  for (const printTemplate of [
    { id: 'injected-html', version: 1 },
    { id: 'white_label', version: 3 },
    { id: 'standard', version: 2 }
  ])
    await assert.rejects(backend().manage(draft({ printTemplate })), /Mẫu in/);
  await assert.rejects(
    backend().manage(draft({ lines: [{ itemId: 'roll', quantity: 1, printDetails: { materialWidth: '-1' } }] })),
    /Khổ NVL/
  );
});
test('white-label print follows the provided fields, escapes values and preserves old generic output', async () => {
  const b = backend({ 'customers/customer1': { customerCode: 'KH-REAL' } });
  await b.manage(
    draft({
      printTemplate: { id: 'white_label', version: 1 },
      lines: [{ itemId: 'roll', quantity: 40, printDetails: { materialWidth: '1120', priority: 'high' } }]
    })
  );
  const print = loader()('src/features/production/model/productionPrint.ts');
  const original = JSON.stringify(b.order());
  const html = print.productionPrintHtml(b.order());
  for (const label of [
    'PHIẾU LỆNH SẢN XUẤT TEM TRẮNG',
    'KH-REAL',
    'VẬT TƯ SỬ DỤNG',
    'NVL KHO CẤP',
    'NVL THỪA / THIẾU SAU 1 ĐƠN',
    'XÁC NHẬN',
    '1120',
    'Hơi gấp',
    'KHÔNG DÙNG ĐỂ TRIỂN KHAI'
  ])
    assert.ok(html.includes(label), label);
  assert.ok(!html.includes('Nguyễn Văn C'));
  assert.ok(!html.includes('KH-0012'));
  assert.ok(!html.includes('Thừa / ĐVT: 0'));
  assert.equal(JSON.stringify(b.order()), original);
  const unsafe = print.productionPrintHtml({
    ...b.order(),
    notes: '<script>alert(1)</script>',
    lines: [{ ...b.order().lines[0], productName: '<img onerror=alert(1)>', image: 'javascript:alert(1)' }]
  });
  assert.ok(!unsafe.includes('<script>'));
  assert.ok(!unsafe.includes('src="javascript:'));
  assert.ok(unsafe.includes('&lt;img'));
  const old = { ...b.order(), printTemplate: undefined };
  assert.ok(!print.productionPrintHtml(old).includes('PHIẾU LỆNH SẢN XUẤT TEM TRẮNG'));
});
test('multi-page white-label prints retain all lines, materials and full long notes', async () => {
  const b = backend();
  await b.manage(draft({ printTemplate: { id: 'white_label', version: 1 } }));
  const print = loader()('src/features/production/model/productionPrint.ts');
  const order = {
    ...b.order(),
    lines: Array.from({ length: 13 }, (_, index) => ({
      ...b.order().lines[0],
      productCode: `UNIQUE-LINE-${index}-END`
    })),
    materials: Array.from({ length: 11 }, (_, index) => ({
      ...b.order().materials[0],
      code: `UNIQUE-MAT-${index}-END`
    })),
    notes: 'Nội dung dài '.repeat(150) + 'PHẦN-CUỐI-GHI-CHÚ'
  };
  const html = print.productionPrintHtml(order);
  for (let index = 0; index < 13; index++) assert.ok(html.includes(`UNIQUE-LINE-${index}-END`));
  for (let index = 0; index < 11; index++) assert.ok(html.includes(`UNIQUE-MAT-${index}-END`));
  assert.ok(html.includes('PHẦN-CUỐI-GHI-CHÚ'));
  assert.ok(html.includes('Trang 4 / 4'));
});
test('read-only machine subscriptions do not initialize machine records for accounting', () => {
  let writes = 0;
  const service = loader({
    '@/infrastructure/firebase/erpDataGateway': {
      dbService: {
        subscribeCollection: () => () => {},
        getCollection: () => {
          writes++;
          return Promise.resolve([]);
        }
      }
    }
  })('src/features/production/api/machineService.ts');
  service.subscribeMachines(() => {}, false);
  assert.equal(writes, 0);
});
test('accountant UI exposes only own draft editing and keeps released/running operations hidden', async () => {
  const b = backend();
  await b.manage(draft(), accountant);
  const Component = loader({
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const html = order =>
    renderToStaticMarkup(
      React.createElement(Component, {
        pos: [po()],
        commands: [order],
        currentUser: accountant,
        users: [producer],
        onRefresh() {},
        initialSelectedId: order.id
      })
    );
  assert.match(html(b.order()), /Sửa nháp/);
  assert.match(html(b.order()), /Gửi duyệt/);
  assert.doesNotMatch(html({ ...b.order(), createdById: 'another-user' }), /Sửa nháp|Gửi duyệt/);
  for (const status of ['draft', 'pending_approval', 'released', 'producing']) {
    assert.doesNotMatch(
      html({ ...b.order(), status }),
      /Hủy lệnh|Trả về nháp|Duyệt &amp; phát hành|Bắt đầu sản xuất|Xác nhận nghiệm thu/
    );
  }
  assert.match(html({ ...b.order(), status: 'released' }), /Xuất lệnh sản xuất/);
});

test('LSX editor puts the back button first, drops the subtitle and the detail view exports a PDF', () => {
  const { readSource } = require('./helpers/loadTs.cjs');
  const workspace = readSource('src/features/production/components/ProductionOrderWorkspace.tsx');
  assert.doesNotMatch(workspace, /Một PO có thể chia thành nhiều lệnh/);
  assert.match(workspace, /<PageBackButton[\s\S]{0,400}?<h2>\{draft\.revision/);
  assert.match(workspace, />\s*Xuất lệnh sản xuất\s*</);
  assert.doesNotMatch(workspace, /In phiếu|label="Xuất PDF"/);
  assert.match(workspace, /setPrintReady\(true\);[\s\S]{0,400}frame\.contentWindow\?\.print\(\);/);
  const shell = readSource('src/app/AppShell.tsx');
  assert.match(shell, /<ListTodo size=\{16\} \/>\s*<span className="sidebar-item-label">Công việc/);
  assert.match(shell, /<CalendarCheck size=\{16\} \/>\s*<span className="sidebar-item-label">Chấm công/);
});

test('LSX editor uses the merged item table and the inline material table', () => {
  const { readSource } = require('./helpers/loadTs.cjs');
  const workspace = readSource('src/features/production/components/ProductionOrderWorkspace.tsx');
  assert.match(workspace, /<LsxPoPickerDialog/);
  assert.match(workspace, /<LsxItemsTable/);
  assert.match(workspace, /<LsxMaterialsTable/);
  assert.doesNotMatch(workspace, /Đơn hàng PO \*|Mã nội bộ và thông tin bổ sung trên phiếu/);
});

test('one order can draw lines from several POs and customers; allocation stays per PO line', async () => {
  const b = backend({
    'pos/po2': { ...po(), id: 'po2', poCode: 'PO-02' },
    'pos/po3': { ...po(), id: 'po3', poCode: 'PO-03', customerId: 'customer2', customerName: 'Công ty B' }
  });
  await b.manage(
    draft({
      poId: undefined,
      lines: [
        { poId: 'po1', itemId: 'roll', quantity: 100 },
        { poId: 'po2', itemId: 'roll', quantity: 40 }
      ]
    })
  );
  const order = b.order();
  assert.deepEqual(order.poIds, ['po1', 'po2']);
  assert.equal(order.poId, 'po1');
  assert.equal(order.poCode, 'PO-01, PO-02');
  assert.deepEqual(
    order.lines.map(line => [line.lineId, line.poCode]),
    [
      ['po1__roll', 'PO-01'],
      ['po2__roll', 'PO-02']
    ]
  );
  assert.equal(b.store.get('pos/po2').productionPlanLocked, true);
  const extra = (id, lines) => b.manage(draft({ id, requestId: `request-${id}`, poId: undefined, lines }));
  await assert.rejects(extra('command2', [{ poId: 'po1', itemId: 'roll', quantity: 1 }]), /vượt phần còn lại/);
  await extra('command2', [{ poId: 'po2', itemId: 'roll', quantity: 60 }]);
  assert.equal(order.customerId, 'customer1', 'a single-customer order keeps the old customer fields');
  assert.deepEqual(order.customerIds, ['customer1']);
  // D-LSX2: one order may mix customers; each line keeps its own PO's customer.
  await extra('command3', [
    { poId: 'po1', itemId: 'manual', quantity: 1 },
    { poId: 'po3', itemId: 'manual', quantity: 1 }
  ]);
  const mixed = b.order('command3');
  assert.equal(mixed.customerId, '', 'a mixed order is never attributed to its first customer');
  assert.deepEqual(mixed.customerIds, ['customer1', 'customer2']);
  assert.deepEqual(mixed.customerNames, ['Công ty A', 'Công ty B']);
  assert.equal(mixed.customerName, 'Công ty A, Công ty B');
  assert.deepEqual(
    mixed.lines.map(line => [line.poId, line.customerId, line.customerName]),
    [
      ['po1', 'customer1', 'Công ty A'],
      ['po3', 'customer2', 'Công ty B']
    ]
  );
  await assert.rejects(extra('command4', [{ poId: 'po9', itemId: 'manual', quantity: 1 }]), /Không tìm thấy đơn hàng/);
});

test('QC on a multi-PO order ships each PO only when its own lines are fully produced', async () => {
  const b = backend({ 'pos/po2': { ...po(), id: 'po2', poCode: 'PO-02' } });
  await b.manage(
    draft({
      poId: undefined,
      lines: [
        { poId: 'po1', itemId: 'roll', quantity: 100 },
        { poId: 'po1', itemId: 'manual', quantity: 50 },
        { poId: 'po2', itemId: 'roll', quantity: 30 }
      ]
    })
  );
  await b.action('submit');
  await b.action('release');
  await b.action('start');
  const byItem = b.order().lines.map(line => ({ itemId: line.itemId, goodQuantity: line.quantity, rejectQuantity: 0 }));
  await assert.rejects(
    b.action('complete', 'command1', { results: byItem, qcNote: 'QC' }),
    /trùng dòng/,
    'two POs share item "roll", so results need the line key'
  );
  await b.action('complete', 'command1', {
    results: b.order().lines.map(line => ({ lineId: line.lineId, goodQuantity: line.quantity, rejectQuantity: 0 })),
    qcNote: 'QC đạt'
  });
  assert.equal(b.store.get('pos/po1').status, 'waiting_delivery');
  assert.equal(b.store.get('pos/po2').status, 'waiting_production');
  assert.equal(b.store.get('pos/po2').productionProgress, 'partial');
});

test('the picker ticks customers, then their orders, then product lines; one order may mix customers', () => {
  const { plannableLines } = loader()('src/features/production/components/productionOrderEditor/draftLines.ts');
  const po2 = { ...po(), id: 'po2', poCode: 'PO-02', customerId: 'customer2', customerName: 'Công ty B' };
  const shipped = { ...po(), id: 'po3', poCode: 'PO-03', status: 'completed' };
  const resale = {
    ...po(),
    id: 'po4',
    poCode: 'PO-04',
    items: [{ itemId: 'ink', productName: 'Mực', quantity: 5, unit: 'hộp', productType: 'muc_in' }]
  };
  const legacy = { id: 'old', poId: 'po2', status: 'producing', qtyToProduce: 10 };
  const used = {
    id: 'used',
    poId: 'po1',
    productionOrderVersion: 2,
    status: 'draft',
    lines: [{ itemId: 'roll', quantity: 100 }]
  };
  const result = plannableLines([po(), po2, shipped, resale], [used, legacy], 'draft1');
  assert.deepEqual(
    result.lines.map(line => [line.key, line.remaining]),
    [['po1::manual', 50]],
    'roll is fully planned, shipped and resale-only POs never appear'
  );
  assert.deepEqual(result.blockedPoCodes, ['PO-02']);

  const confirmed = [];
  const po5 = { ...po(), id: 'po5', poCode: 'PO-05' };
  const render = interactive(
    'src/features/production/components/productionOrderEditor/LsxPoPickerDialog.tsx',
    'LsxPoPickerDialog',
    {
      pos: [po(), po2, po5],
      commands: [],
      draftId: 'draft1',
      draftLines: [{ poId: 'po5', itemId: 'manual', quantity: '50', printDetails: {} }],
      onClose() {},
      onConfirm: lines => confirmed.push(...lines)
    }
  );
  let tree = render();
  const box = label => nodes(tree).find(node => node.type === 'input' && node.props['aria-label'] === label);
  const tick = (label, checked = true) => {
    box(label).props.onChange({ target: { checked } });
    tree = render();
  };
  const agree = () => nodes(tree).find(node => node.type === 'button' && node.props.children === 'Đồng ý');
  const footer = () =>
    nodes(tree).find(node => node.type === 'span' && /^(Đã chọn|Chưa chọn)/.test(node.props.children));
  assert.equal(agree().props.disabled, true);
  assert.equal(box('Chọn đơn hàng PO-01'), undefined, 'orders appear only after their customer is ticked');
  tick('Chọn khách hàng Công ty A');
  assert.ok(box('Chọn đơn hàng PO-01') && box('Chọn đơn hàng PO-05'));
  assert.equal(box('Chọn đơn hàng PO-02'), undefined, 'an unticked customer’s orders stay hidden');
  assert.equal(box('Chọn cả PO-01'), undefined, 'product lines appear only after their order is ticked');
  tick('Chọn đơn hàng PO-01');
  tick('Chọn đơn hàng PO-05');
  tick('Chọn cả PO-01');
  tick('Chọn Tem cuộn của PO-05');
  assert.equal(box('Chọn Tem nhập tay của PO-05'), undefined, 'a line already on the draft is not offered again');
  // D-LSX2: lines of another customer can join the same order.
  tick('Chọn khách hàng Công ty B');
  tick('Chọn đơn hàng PO-02');
  tick('Chọn Tem cuộn của PO-02');
  assert.equal(footer().props.children, 'Đã chọn 4 mã sản phẩm từ 3 đơn hàng của 2 khách hàng');
  tick('Chọn khách hàng Công ty B', false);
  assert.equal(box('Chọn đơn hàng PO-02'), undefined);
  assert.equal(footer().props.children, 'Đã chọn 3 mã sản phẩm từ 2 đơn hàng của 1 khách hàng');
  tick('Chọn khách hàng Công ty B');
  assert.equal(box('Chọn đơn hàng PO-02').props.checked, false, 'unticking a customer drops its orders and lines');
  agree().props.onClick();
  assert.deepEqual(
    confirmed.map(line => [line.poId, line.itemId, line.quantity]),
    [
      ['po1', 'roll', '100'],
      ['po1', 'manual', '50'],
      ['po5', 'roll', '100']
    ]
  );
});

test('the company white-label sheet v2 lists the PO of each line and keeps hand-filled areas blank', () => {
  const { productionPrintHtml } = loader()('src/features/production/model/productionPrint.ts');
  const order = {
    id: 'command9',
    lsxCode: 'LSX-20261027-0001',
    productionOrderVersion: 2,
    revision: 1,
    status: 'released',
    poId: 'po1',
    poIds: ['po1', 'po2'],
    poCode: 'PO-01, PO-02',
    poCodes: ['PO-01', 'PO-02'],
    customerName: 'Công ty A <script>',
    customerCode: 'DS THÁI NGUYÊN',
    priority: 'urgent',
    deliveryDeadline: '2026-10-30',
    createdAt: '2026-10-27T03:00:00Z',
    createdBy: 'Kế toán',
    operatorName: 'Thợ máy',
    machineName: 'Máy 01',
    shift: 'Ca sáng',
    notes: 'KHÁCH KHÓ TÍNH, QA kỹ tem',
    printTemplate: { id: 'white_label', version: 2 },
    materials: [],
    lines: [
      {
        itemId: 'roll',
        poId: 'po2',
        poCode: 'PO-02',
        lineId: 'po2__roll',
        productCode: 'TM01',
        productName: 'Tem cuộn',
        unit: 'cuộn',
        quantity: 20,
        specification: '',
        material: '',
        image: '',
        specifications: {
          width: 90,
          height: 120,
          metersPerRoll: 123,
          qtyPerRoll: 1000,
          dieCut: 'R1.5',
          perforated: 'Có răng cưa xé',
          coreType: 'Lõi nhựa',
          core: '76mm',
          paperCode: 'KP0738'
        },
        printDetails: { materialWidth: '96', priority: '' }
      }
    ]
  };
  const html = productionPrintHtml(order);
  for (const text of [
    'PHIẾU LỆNH SẢN XUẤT TEM TRẮNG',
    'PO-02',
    'PO-01, PO-02',
    'R90 × D120 mm',
    '123 m',
    'R1.5',
    'Lõi nhựa 76mm',
    'KP0738',
    'Khổ 96 mm',
    'RẤT GẤP',
    'NVL THỪA / THIẾU',
    'XÁC NHẬN KHO CẤP + NHẬN NVL',
    'KHÁCH KHÓ TÍNH'
  ])
    assert.ok(html.includes(text), text);
  assert.match(html, /<i class="on"><\/i>Gấp/);
  assert.ok(!html.includes('<script>'), 'values are escaped');
  assert.ok(
    !productionPrintHtml({ ...order, printTemplate: { id: 'white_label', version: 1 } }).includes('Mẫu tem trắng v2')
  );
});

test('completed LSX with shortfall shows shortfall actions and request_materials creates procurement_requests without payables', async () => {
  const b = backend();
  // QC needs one result per LSX line, so the order carries both PO lines the results below cover.
  await b.manage(
    draft({
      lines: [
        { itemId: 'roll', quantity: 100 },
        { itemId: 'manual', quantity: 50 }
      ]
    })
  );
  await b.action('submit');
  await b.action('release');
  await b.action('start');
  await b.action('complete', 'command1', {
    results: [
      { itemId: 'roll', goodQuantity: 70, rejectQuantity: 10 },
      { itemId: 'manual', goodQuantity: 50, rejectQuantity: 0 }
    ],
    qcNote: 'Thiếu 30 cuộn'
  });
  await b.action('request_materials', 'command1');
  const prDocs = [...b.store.keys()]
    .filter(key => key.startsWith('procurement_requests/'))
    .map(key => b.store.get(key));
  assert.equal(prDocs.length, 1);
  assert.equal(prDocs[0].sourcingType, 'raw_material');
  assert.equal(prDocs[0].status, 'new');
  assert.equal(prDocs[0].lsxId, 'command1');
  assert.equal(prDocs[0].purchaseOrderId, '');
  assert.equal([...b.store.keys()].filter(key => key.startsWith('purchase_orders/')).length, 0);
  assert.equal([...b.store.keys()].filter(key => key.startsWith('invoices/')).length, 0);

  const Component = loader({
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) }
  })('src/features/production/components/ProductionOrderWorkspace.tsx').ProductionOrderWorkspace;
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      pos: [po()],
      commands: [b.order()],
      currentUser: admin,
      users: [producer],
      onRefresh() {},
      initialSelectedId: 'command1'
    })
  );
  assert.match(html, /Thiếu 30 cuộn/);
  assert.match(html, /Lập lệnh bổ sung/);
  assert.match(html, /Đề nghị mua thêm NVL/);
});

test('planned dates and technical notes are validated and saved with the draft', async () => {
  const b = backend();
  await assert.rejects(
    b.manage(draft({ plannedStartDate: '2026-11-10', plannedEndDate: '2026-11-05' })),
    /hoàn thành dự kiến/
  );
  await assert.rejects(b.manage(draft({ plannedStartDate: '10/11/2026' })), /Ngày bắt đầu dự kiến không hợp lệ/);
  await b.manage(
    draft({ plannedStartDate: '2026-11-05', plannedEndDate: '2026-11-10', technicalNotes: 'Màu theo mẫu duyệt' })
  );
  const order = b.order();
  assert.equal(order.plannedStartDate, '2026-11-05');
  assert.equal(order.plannedEndDate, '2026-11-10');
  assert.equal(order.technicalNotes, 'Màu theo mẫu duyệt');
});

test('material shortage uses the declared factor and never guesses a unit', () => {
  const { materialShortage } = loader()('src/features/production/model/productionOrder.ts');
  assert.deepEqual(materialShortage({ quantity: 2, allowancePercent: 10 }, 200, 300), {
    needed: 2.2,
    stock: 1.5,
    shortage: 0.7
  });
  assert.deepEqual(materialShortage({ quantity: 2, allowancePercent: 0 }, 200, 900), {
    needed: 2,
    stock: 4.5,
    shortage: 0
  });
  assert.deepEqual(materialShortage({ quantity: 2, allowancePercent: 0 }, null, 900), {
    needed: 2,
    stock: null,
    shortage: null
  });
});

test('before completion purchasing is asked only for the NVL shortage against current stock', async () => {
  const fixture = catalogFixture('po_item', {
    kind: 'raw_material',
    baseUnit: 'm',
    conversions: [{ unit: 'cuộn', factor: 200 }]
  });
  const material = { id: 'mat1', catalogItemId: fixture.id, code: 'X', name: 'X', unit: 'cuộn', quantity: 2 };
  const manual = { id: 'mat2', code: 'TAY-01', name: 'Mực nhập tay', unit: 'kg', quantity: 5 };
  const b = backend({
    [`item_catalog/${fixture.id}`]: fixture.product,
    [`warehouse_balances/${fixture.id}`]: { id: fixture.id, quantity: 300, revision: 1 }
  });
  await b.manage(
    draft({
      materials: [
        { ...material, allowancePercent: 10 },
        { ...manual, allowancePercent: 0 }
      ]
    })
  );
  const requests = () =>
    [...b.store.keys()].filter(key => key.startsWith('procurement_requests/')).map(key => b.store.get(key));
  await b.action('request_material_shortage');
  assert.deepEqual(
    requests().map(request => [request.productCode, request.quantity, request.unit, request.status]),
    [['FG01', 0.7, 'cuộn', 'new']],
    'only the linked material, for 2.2 cuộn needed minus 1.5 cuộn in stock'
  );
  assert.equal([...b.store.keys()].filter(key => key.startsWith('purchase_orders/')).length, 0);
  b.store.set(`warehouse_balances/${fixture.id}`, { id: fixture.id, quantity: 1000, revision: 2 });
  await assert.rejects(b.action('request_material_shortage'), /không có phần thiếu/);
  await assert.rejects(
    b.action('request_materials'),
    /quyền|trạng thái/,
    'the full re-order stays for completed orders'
  );
});

test('the LSX header is a compact voucher form that folds to one summary line', () => {
  const patches = [];
  const values = {
    deliveryDeadline: '2026-06-10',
    plannedStartDate: '',
    plannedEndDate: '',
    priority: 'normal',
    machineId: 'machine1',
    operatorId: '',
    shift: 'Ca sáng',
    printTemplate: { id: 'white_label', version: 2 },
    technicalNotes: '',
    notes: ''
  };
  const render = interactive(
    'src/features/production/components/productionOrderEditor/LsxGeneralInfo.tsx',
    'LsxGeneralInfo',
    {
      values,
      customers: ['Công ty A', 'Công ty B', 'Công ty C'],
      machines: [{ id: 'machine1', code: 'M01', name: 'Máy in' }],
      operators: [],
      onChange: patch => patches.push(patch),
      onTemplateChange() {}
    }
  );
  let tree = render();
  assert.deepEqual(
    nodes(tree)
      .filter(node => node.type === 'legend')
      .map(node => node.props.children),
    ['Đơn hàng & khách', 'Kế hoạch sản xuất', 'Phiếu & ghi chú']
  );
  const chips = nodes(tree).filter(node =>
    String(node.props?.className || '')
      .split(' ')
      .includes('lsx-customer-chip')
  );
  assert.deepEqual(
    chips.map(node => [node.props.children].flat().join('')),
    ['Công ty A', 'Công ty B', '+1'],
    'two customers show as chips and the rest as a count'
  );
  const radio = value => nodes(tree).find(node => node.type === 'input' && node.props.value === value);
  assert.equal(radio('normal').props.checked, true);
  radio('urgent').props.onChange();
  const end = nodes(tree).find(node => node.props?.['aria-label'] === 'Hoàn thành dự kiến');
  end.props.onChange({ target: { value: '2026-06-08' } });
  assert.deepEqual(patches, [{ priority: 'urgent' }, { plannedEndDate: '2026-06-08' }]);
  nodes(tree)
    .find(node => node.props?.label === 'Thu gọn thông tin chung')
    .props.onClick();
  tree = render();
  assert.ok(!nodes(tree).some(node => node.type === 'legend'), 'folded, the fields are hidden');
  const summary = nodes(tree).find(node => node.props?.className === 'lsx-general-summary');
  assert.equal(
    summary.props.children,
    'Công ty A, Công ty B, Công ty C · Cần 10/6/2026 · Bình thường · Máy M01 · Ca sáng'
  );
});
