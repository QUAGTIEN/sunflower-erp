const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');

const nodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          nodes
        )
      ];
const admin = { uid: 'admin', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const menu = tree => nodes(tree).filter(node => node.type?.name === 'RowActionMenu');
function screen(file, name, props, initial = {}, stubs = {}) {
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
  const state = new Map(Object.entries(initial)),
    refs = [],
    layouts = [];
  let cursor = 0,
    refCursor = 0;
  const react = {
    ...React,
    useEffect() {},
    useLayoutEffect: cb => layouts.push(cb),
    useMemo: cb => cb(),
    useCallback: cb => cb,
    useRef(value) {
      const index = refCursor++;
      if (!(index in refs)) refs[index] = { current: value };
      return refs[index];
    },
    useState(value) {
      const index = cursor++,
        key = names[index] || 'hook' + index;
      if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value);
      return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
    }
  };
  const Component = loader({
    react,
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) },
    '@/infrastructure/firebase/erpDataGateway': { dbService: { getCollection: async () => [] } },
    '@/shared/feedback/mutationFeedback': {
      runMutationAction: (_name, action) => action(),
      requireConfirmedMutation: value => value,
      showSuccessToast() {}
    },
    ...stubs
  })(file)[name];
  return {
    state,
    refs,
    layouts,
    render: () => {
      cursor = 0;
      refCursor = 0;
      return Component(props);
    }
  };
}

test('accounting mounts the financial ledger instead of direct invoice/payment editors', () => {
  const writes = [],
    ui = screen(
      'src/features/accounting/pages/AccountingPage.tsx',
      'Accounting',
      { pos: [], currentUser: admin, users: [], onRefresh() {} },
      {},
      {
        '@/infrastructure/firebase/erpDataGateway': {
          dbService: { updateDocument: async (...args) => writes.push(args) }
        }
      }
    );
  const tree = ui.render();
  assert.equal(tree.props['data-erp-table-text'], 'single-line');
  assert.ok(nodes(tree).some(node => node.type?.name === 'AccountingLedgerWorkspace'));
  assert.ok(!nodes(tree).some(node => node.type === 'form'));
  assert.deepEqual(writes, []);
  const source = fs.readFileSync(path.join(root, 'src/features/accounting/pages/AccountingPage.tsx'), 'utf8');
  assert.doesNotMatch(
    source,
    /paidAmount:|addDocument\('invoices'|deleteDocument\('invoices'|updateDocument\('invoices'/
  );
});
test('Sale with a page flag cannot bypass financial role restrictions', () => {
  const ui = screen('src/features/accounting/pages/AccountingPage.tsx', 'Accounting', {
    pos: [],
    currentUser: { ...admin, role: 'sale', allowedPages: ['accounting'] },
    users: [],
    onRefresh() {}
  });
  const tree = ui.render();
  assert.equal(tree.props.role, 'alert');
  assert.equal(menu(tree).length, 0);
  assert.ok(!nodes(tree).some(node => node.type?.name === 'AccountingLedgerWorkspace'));
});

test('costing menu still opens original cost editor after changing pages', () => {
  const pos = Array.from({ length: 27 }, (_, i) => ({
    id: 'po' + i,
    poCode: 'PO-' + i,
    customerName: 'Khách',
    totalAmount: 1000000,
    status: 'waiting_production',
    items: [{ material: 'giấy', size: '10x20mm', quantity: 100 }]
  }));
  const ui = screen(
    'src/features/accounting/pages/AccountingPage.tsx',
    'Accounting',
    { pos, currentUser: admin, users: [], onRefresh() {} },
    { activeTab: 'costing' }
  );
  let tree = ui.render();
  assert.equal(menu(tree).length, 25);
  assert.ok(!nodes(tree).some(node => node.type?.name === 'BarChart'));
  assert.ok(nodes(tree).some(node => node.props?.role === 'tab' && node.props.children === 'Báo Cáo Lãi Gộp Đơn Hàng'));
  nodes(tree)
    .find(node => node.type?.name === 'DataTablePagination')
    .props.setPage(2);
  tree = ui.render();
  assert.equal(menu(tree).length, 2);
  assert.deepEqual(
    menu(tree)[0].props.actions.map(action => action.label),
    ['Sửa Chi Phí', 'In Phiếu']
  );
  menu(tree)[0].props.actions[0].onSelect();
  assert.equal(ui.state.get('customCostModalPo').id, 'po25');
});
test('inventory uses canonical ledger balances, text warnings and threshold actions without legacy quantity editors', () => {
  const item = { id: 'paper', code: 'NVL-1', name: 'Vật tư tên rất dài', baseUnit: 'm²', active: true };
  const balance = {
    id: 'paper',
    code: 'NVL-1',
    name: item.name,
    unit: 'm²',
    quantity: 0,
    minQuantity: 10,
    revision: 1
  };
  const ui = screen(
    'src/features/inventory/pages/InventoryPage.tsx',
    'Inventory',
    { currentUser: admin, onRefresh() {} },
    {},
    {
      // The die list's column tools would otherwise load the real Firebase client.
      '@/context/TableColumnLayoutContext': { useTableColumnLayouts: () => ({ layouts: {}, canEditColumns: false }) },
      '../components/useWarehouseLiveData': {
        useWarehouseLiveData: () => ({
          data: {
            items: [item],
            rawBalances: [balance],
            goodsBalances: [],
            rawVouchers: [],
            goodsVouchers: [],
            itemUsers: {}
          },
          loaded: true,
          loading: false,
          error: '',
          reload() {}
        })
      }
    }
  );
  let tree = ui.render();
  assert.equal(tree.props['data-erp-table-text'], 'single-line');
  assert.ok(nodes(tree).some(node => node.type === 'td' && node.props.children === 'Cần nhập hàng'));
  assert.ok(!nodes(tree).some(node => String(node.props?.className || '').includes('badge')));
  assert.equal(menu(tree)[0].type.name, 'RowActionMenu');
  assert.deepEqual(
    menu(tree)[0].props.actions.map(action => action.label),
    ['Xem thẻ vật tư', 'Thiết lập ngưỡng', 'Sửa mã', 'Ngừng sử dụng']
  );
  menu(tree)[0].props.actions[0].onSelect();
  tree = ui.render();
  assert.equal(ui.state.get('stock').id, 'paper');
  assert.ok(nodes(tree).some(node => node.type?.name === 'StockDetails'));
  assert.ok(!nodes(tree).some(node => node.type === 'button' && node.props.children === 'Thêm vật tư'));
  nodes(tree)
    .find(node => node.props?.role === 'tab' && node.props.children === 'Phiếu kho')
    .props.onClick();
  tree = ui.render();
  nodes(tree)
    .find(node => node.props?.role === 'tab' && node.props.children === 'Nhập xuất tồn')
    .props.onClick();
  tree = ui.render();
  assert.equal(menu(tree).length, 0);
});
test('inventory shows only the skeleton, not an empty table, until the first data arrives', () => {
  const empty = { items: [], rawBalances: [], goodsBalances: [], rawVouchers: [], goodsVouchers: [], itemUsers: {} };
  const tree = screen(
    'src/features/inventory/pages/InventoryPage.tsx',
    'Inventory',
    { currentUser: admin, onRefresh() {} },
    {},
    {
      '@/context/TableColumnLayoutContext': { useTableColumnLayouts: () => ({ layouts: {}, canEditColumns: false }) },
      '../components/useWarehouseLiveData': {
        useWarehouseLiveData: () => ({ data: empty, loaded: false, loading: true, error: '', reload() {} })
      }
    }
  ).render();
  assert.ok(nodes(tree).some(node => node.type?.name === 'LoadingStatus'));
  assert.ok(!nodes(tree).some(node => node.type === 'table'));
  assert.ok(!nodes(tree).some(node => node.type?.name === 'DataTablePagination'));
});
test('purchasing keeps request processing actions and columns while replacing icon controls', () => {
  const request = {
    id: 'r1',
    requestCode: 'MH-1',
    poCode: 'PO-1',
    status: 'new',
    customerName: 'Khách dài',
    productName: 'Tem',
    quantity: 50,
    unit: 'cái',
    sourcingType: 'subcontract',
    createdAt: '2026-10-22'
  };
  const ui = screen(
    'src/features/procurement/pages/PurchasePage.tsx',
    'Purchase',
    { pos: [], purchaseOrders: [], procurementRequests: [request], currentUser: admin, users: [], onRefresh() {} },
    {},
    {
      '@/hooks/useSharedTableColumns': {
        useSharedTableColumns: () => ({ selectedIds: [], setSelectedIds() {}, canEditColumns: true })
      },
      '@/context/TableColumnLayoutContext': { useTableColumnLayouts: () => ({ canEditColumns: true }) },
      '@/hooks/useReorderableTableColumns': {
        useReorderableTableColumns: ({ columns }) => ({
          orderedColumnIds: columns.map(column => column.id),
          getHeaderProps: () => ({})
        })
      }
    }
  );
  let tree = ui.render();
  assert.equal(tree.props['data-erp-table-text'], 'single-line');
  assert.deepEqual(
    menu(tree)[0].props.actions.map(action => action.label),
    ['Tiếp nhận', 'Chọn NCC']
  );
  menu(tree)[0].props.actions[1].onSelect();
  tree = ui.render();
  assert.equal(ui.state.get('selectedRequestId'), 'r1');
  assert.ok(nodes(tree).some(node => node.type === 'button' && node.props.children === 'Đóng'));
  assert.ok(nodes(tree).some(node => node.type?.name === 'DataFilterButton' && !node.props.textOnly));
  assert.ok(nodes(tree).some(node => node.type?.name === 'IconButton' && node.props.label === 'Tùy chỉnh cột'));
});

test('raw purchase receive opens the actual quantity voucher and does not run legacy stock or payable writes', async () => {
  const writes = [];
  let refreshes = 0;
  const ui = screen(
    'src/features/procurement/pages/PurchasePage.tsx',
    'Purchase',
    {
      pos: [],
      purchaseOrders: [
        {
          id: 'buy1',
          purCode: 'PUR-1',
          status: 'partially_received',
          sourcingType: 'raw_material',
          items: [{ materialName: 'Giấy', quantity: 100, unit: 'm' }]
        }
      ],
      procurementRequests: [],
      currentUser: admin,
      users: [],
      onRefresh() {
        refreshes++;
      }
    },
    { activeListView: 'orders' },
    {
      '@/infrastructure/firebase/erpDataGateway': {
        dbService: {
          getCollection: async () => [],
          addDocument: async (...args) => writes.push(args),
          updateDocument: async (...args) => writes.push(args)
        }
      },
      '@/hooks/useSharedTableColumns': {
        useSharedTableColumns: () => ({ selectedIds: [], setSelectedIds() {}, canEditColumns: true })
      },
      '@/context/TableColumnLayoutContext': { useTableColumnLayouts: () => ({ canEditColumns: true }) },
      '@/hooks/useReorderableTableColumns': {
        useReorderableTableColumns: ({ columns }) => ({
          orderedColumnIds: columns.map(column => column.id),
          getHeaderProps: () => ({})
        })
      }
    }
  );
  const action = menu(ui.render())[0].props.actions[0];
  assert.equal(action.label, 'Nhập kho NVL');
  await action.onSelect();
  const dialog = nodes(ui.render()).find(node => node.type?.name === 'WarehouseVoucherDialog');
  assert.equal(dialog.props.initialSourceId, 'buy1');
  assert.equal(dialog.props.initialKind, 'purchase_receipt');
  assert.deepEqual(writes, []);
  dialog.props.onSaved();
  assert.equal(refreshes, 1);
  assert.equal(ui.state.get('warehouseOrderId'), '');
});

test('finished-good purchasing opens quantity receipts or direct-shipping without creating payables', async () => {
  const writes = [],
    previousWindow = global.window;
  global.window = { confirm: () => true };
  try {
    const ui = screen(
      'src/features/procurement/pages/PurchasePage.tsx',
      'Purchase',
      {
        pos: [],
        purchaseOrders: [
          {
            id: 'buy2',
            purCode: 'PUR-2',
            status: 'ordered',
            sourcingType: 'finished_good',
            items: [],
            totalPrice: 100,
            supplierId: 'supplier1'
          }
        ],
        procurementRequests: [],
        currentUser: admin,
        users: [],
        onRefresh() {}
      },
      { activeListView: 'orders' },
      {
        '@/infrastructure/firebase/erpDataGateway': {
          dbService: {
            getCollection: async () => [],
            addDocument: async (...args) => {
              writes.push(args);
              return { id: 'invoice1' };
            },
            updateDocument: async (...args) => {
              writes.push(args);
              return true;
            }
          }
        },
        '@/hooks/useSharedTableColumns': {
          useSharedTableColumns: () => ({ selectedIds: [], setSelectedIds() {}, canEditColumns: true })
        },
        '@/context/TableColumnLayoutContext': { useTableColumnLayouts: () => ({ canEditColumns: true }) },
        '@/hooks/useReorderableTableColumns': {
          useReorderableTableColumns: ({ columns }) => ({
            orderedColumnIds: columns.map(column => column.id),
            getHeaderProps: () => ({})
          })
        }
      }
    );
    await menu(ui.render())[0].props.actions[0].onSelect();
    assert.deepEqual(writes, []);
    assert.equal(ui.state.get('goodsOptions').kind, 'purchase_receipt');
    assert.equal(ui.state.get('goodsOptions').sourceId, 'buy2');
    assert.ok(nodes(ui.render()).some(node => node.type?.name === 'GoodsVoucherDialog'));
    menu(ui.render())[0]
      .props.actions.find(action => action.label === 'NCC giao thẳng khách')
      .onSelect();
    assert.equal(ui.state.get('goodsOptions').kind, 'supplier_dispatch');
  } finally {
    global.window = previousWindow;
  }
});
test('text filter controls preserve callbacks, and default shared controls retain their icons', () => {
  const controls = loader()('src/components/DataWorkspaceFilters.tsx');
  const render = props =>
    renderToStaticMarkup(
      React.createElement(controls.DataFilterButton, { activeCount: 2, open: false, onClick() {}, ...props })
    );
  assert.ok(!render({ textOnly: true }).includes('<svg'));
  assert.ok(render({ textOnly: true }).includes('Bộ lọc (2)'));
  assert.ok(render({}).includes('<svg'));
  const panel = renderToStaticMarkup(
    React.createElement(
      controls.DataFilterPanel,
      { textOnly: true, open: true, title: 'Lọc', activeCount: 0, onClose() {}, onReset() {} },
      'Nội dung'
    )
  );
  assert.ok(!panel.includes('<svg'));
  assert.ok(panel.includes('>Đóng</button>'));
});
test('shared three-dot menu fits narrow viewports and still blocks disabled actions', () => {
  let selected = 0;
  const previousWindow = global.window;
  global.window = { innerWidth: 180, innerHeight: 160 };
  try {
    const ui = screen(
      'src/components/RowActionMenu.tsx',
      'RowActionMenu',
      {
        actions: [
          { label: 'Không được sửa', disabled: true, onSelect: () => selected++ },
          { label: 'Chi tiết', onSelect: () => selected++ }
        ]
      },
      { open: true },
      { 'react-dom': { createPortal: child => child } }
    );
    const previousDocument = global.document;
    global.document = { body: {} };
    try {
      ui.render();
      ui.refs[0].current = { getBoundingClientRect: () => ({ right: 175, bottom: 155, top: 120 }) };
      ui.refs[1].current = { offsetHeight: 250 };
      ui.layouts.splice(0).forEach(effect => effect());
      const tree = ui.render(),
        popover = nodes(tree).find(node => node.props?.role === 'menu');
      assert.ok(popover.props.style.left >= 8);
      assert.ok(popover.props.style.left + popover.props.style.width <= 172);
      assert.ok(popover.props.style.top >= 8);
      assert.equal(
        nodes(tree).find(node => node.type === 'button' && node.props['aria-haspopup'] === 'menu').props.children.props
          .size,
        18
      );
      const items = nodes(tree).filter(node => node.props?.role === 'menuitem');
      items[0].props.onClick();
      assert.equal(selected, 0);
      items[1].props.onClick();
      assert.equal(selected, 1);
      assert.equal(ui.state.get('open'), false);
    } finally {
      global.document = previousDocument;
    }
  } finally {
    global.window = previousWindow;
  }
});

test('single-line grids keep full hover text up to date without changing other pages adaptive behavior', () => {
  class Element {
    constructor(text = '', title = '') {
      this.textContent = text;
      this.title = title;
      this.dataset = {};
      this.children = [];
      this.clientWidth = 10;
      this.offsetParent = {};
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name)
      };
    }
    querySelector() {
      return null;
    }
  }
  const automatic = new Element('Tên rất dài'),
    authored = new Element('Mã', 'Thông tin riêng'),
    legacy = new Element('Tên dài ở trang khác');
  const single = { offsetParent: {}, closest: () => ({}), querySelectorAll: () => [automatic, authored] };
  const other = { offsetParent: {}, closest: () => null, querySelectorAll: () => [legacy] };
  const root = { querySelectorAll: () => [single, other] };
  const listeners = new Map(),
    frames = new Map();
  let sequence = 0,
    measurements = 0,
    cleanup;
  const window = {
    getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', font: '13px Inter', letterSpacing: '0' }),
    requestAnimationFrame: cb => {
      frames.set(++sequence, cb);
      return sequence;
    },
    cancelAnimationFrame: id => frames.delete(id),
    addEventListener: (name, cb) => listeners.set(name, cb),
    removeEventListener: name => listeners.delete(name)
  };
  const document = {
    querySelector: () => root,
    createElement: () => ({
      getContext: () => ({
        measureText: () => {
          measurements++;
          return { width: 100 };
        }
      })
    }),
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [{ width: 10, height: 10, top: 0 }] })
  };
  class Observer {
    observe() {}
    disconnect() {}
  }
  const code = ts.transpileModule(fs.readFileSync(path.join(rootPath(), 'src/hooks/useAdaptiveTableText.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const mod = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    'window',
    'document',
    'HTMLElement',
    'Element',
    'MutationObserver',
    'ResizeObserver',
    code
  )(
    () => ({
      useEffect: cb => {
        cleanup = cb();
      }
    }),
    mod,
    mod.exports,
    window,
    document,
    Element,
    Element,
    Observer,
    Observer
  );
  mod.exports.useAdaptiveTableText('accounting', 'admin');
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(cb => cb());
  };
  flush();
  assert.equal(automatic.title, 'Tên rất dài');
  assert.equal(authored.title, 'Thông tin riêng');
  assert.equal(automatic.classList.contains('is-two-line'), false);
  assert.equal(legacy.classList.contains('is-two-line'), true);
  assert.equal(measurements, 1);
  automatic.textContent = 'Tên vừa cập nhật';
  listeners.get('resize')();
  flush();
  assert.equal(automatic.title, 'Tên vừa cập nhật');
  automatic.title = 'Ghi chú do màn hình cung cấp';
  automatic.textContent = 'Tên khác';
  listeners.get('resize')();
  flush();
  assert.equal(automatic.title, 'Ghi chú do màn hình cung cấp');
  cleanup();
});
function rootPath() {
  return root;
}
