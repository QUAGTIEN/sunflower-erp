const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), code)(
    name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected import ${name}`);
    },
    module,
    module.exports,
    ...Object.values(globals)
  );
  return module.exports;
}

const catalog = load('src/features/crm/model/customerProductCatalog.ts');
const financials = load('src/domain/poFinancials.ts');
const formPath = 'src/features/sales/components/POFormFullScreen.tsx';
const ast = ts.createSourceFile(
  formPath,
  fs.readFileSync(path.join(root, formPath), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const stateNames = [];
function collectStates(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isArrayBindingPattern(node.name) &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(ast) === 'useState'
  ) {
    stateNames.push(node.name.elements[0].getText(ast));
  }
  ts.forEachChild(node, collectStates);
}
collectStates(ast);

// Exercise the form's real event handlers and JSX controls without browser/network side effects.
function form(products = [], initial = {}) {
  const state = new Map(
    Object.entries({ customerId: 'customer-a', customerRank: 'B', expectedDeliveryDate: '2026-11-01', ...initial })
  );
  let cursor = 0;
  let nextId = 0;
  let saved;
  const alerts = [];
  const react = {
    Fragment: Symbol('Fragment'),
    useState(value) {
      const key = stateNames[cursor++];
      if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value);
      return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
    },
    useEffect() {},
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useRef: value => ({ current: value })
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': new Proxy({}, { get: (_target, name) => name }),
    '@/shared/feedback/deleteConfirmation': { confirmDelete: async () => true },
    '@/shared/feedback/mutationFeedback': { runMutationAction: (_key, action) => action() },
    '@/infrastructure/firebase/erpDataGateway': { dbService: {} },
    '@/domain/poFinancials': financials,
    '@/features/crm/model/crmModels': { createCustomerSnapshot: customer => ({ companyName: customer.companyName }) },
    '@/components/CustomerHistory.css': {},
    '@/components/PageBackButton': { PageBackButton: () => null },
    './POFormCatalog.css': {},
    '@/shared/utils/dateFormatting': {
      formatDate: value => value,
      toDateInputValue: value => String(value || '').slice(0, 10)
    },
    '@/features/crm/model/customerProductCatalog': catalog,
    './CustomerProductPicker': { CustomerProductPicker: 'CustomerProductPicker' },
    // Dialogs split out of the form only render behind toggles these tests never open.
    './poForm/POImagePreviewDialog': { POImagePreviewDialog: 'POImagePreviewDialog' },
    './poForm/POFileRepositoryDialog': { POFileRepositoryDialog: 'POFileRepositoryDialog' },
    './poForm/POLegacyProductSearchDialog': { POLegacyProductSearchDialog: 'POLegacyProductSearchDialog' }
  };
  const globals = {
    window: { localStorage: { removeItem() {} } },
    alert: message => alerts.push(message),
    crypto: { randomUUID: () => `item-${++nextId}` }
  };
  // The line grid is stateless, so it is loaded for real and expanded by nodes() like inline JSX.
  imports['./poForm/POItemsGrid'] = load('src/features/sales/components/poForm/POItemsGrid.tsx', imports, globals);
  const Component = load(formPath, imports, globals).default;
  const render = () => {
    cursor = 0;
    return Component({
      isOpen: true,
      po: null,
      customers: [{ id: 'customer-a', companyName: 'Công ty A', products }],
      suppliers: [],
      users: [],
      currentUser: { uid: 'sale-a', role: 'sale' },
      onClose() {},
      onSave: async payload => {
        saved = payload;
      },
      t: value => value
    });
  };
  return { render, state, alerts, saved: () => saved };
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return [tree, ...nodes(tree.type(tree.props))];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return tree && typeof tree === 'object' ? text(tree.props?.children) : String(tree ?? '');
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node) === label);
const edit = (tree, placeholder, value) => {
  const input = nodes(tree).find(node => node.type === 'input' && node.props.placeholder === placeholder);
  assert.ok(input, `Editable field: ${placeholder}`);
  input.props.onChange({ target: { value } });
};

test('manual entry is available without catalog products but still requires a customer', () => {
  const ready = form();
  assert.equal(button(ready.render(), 'Thêm dòng nhập tay').props.disabled, false);
  assert.equal(button(ready.render(), 'Chọn sản phẩm').props.disabled, true);
  const unselected = form([], { customerId: '' });
  assert.equal(button(unselected.render(), 'Thêm dòng nhập tay').props.disabled, true);
});

test('a user can add, edit and save a new PO item without a registered product or code', async () => {
  const screen = form();
  button(screen.render(), 'Thêm dòng nhập tay').props.onClick();
  edit(screen.render(), 'Tên sản phẩm', 'Dịch vụ đóng gói');
  edit(screen.render(), 'Quy cách', 'Theo yêu cầu');
  edit(screen.render(), 'ĐVT', 'lần');
  await button(screen.render(), 'Lưu Đơn Hàng PO').props.onClick({ preventDefault() {} });
  assert.deepEqual(screen.alerts, []);
  const [item] = screen.saved().items;
  assert.equal(item.productName, 'Dịch vụ đóng gói');
  assert.equal(item.size, 'Theo yêu cầu');
  assert.equal(item.unit, 'lần');
  assert.equal(item.customerProductId, '');
  assert.equal(item.productCode, '');
  assert.equal(catalog.synchronizeCustomerProductOrderItems([item], { products: [] }).length, 1);
});

test('catalog selection still fills locked fields and can be combined with editable manual items', async () => {
  const product = {
    id: 'product-a',
    productCode: 'TEM001',
    productName: 'Tem theo mẫu',
    unit: 'cuộn',
    specifications: { width: 50, height: 30 },
    currentPrice: 10000
  };
  const screen = form([product]);
  button(screen.render(), 'Chọn sản phẩm').props.onClick();
  nodes(screen.render())
    .find(node => node.type === 'CustomerProductPicker')
    .props.onConfirm(['product-a']);
  assert.equal(screen.state.get('poItems')[0].customerProductId, 'product-a');
  assert.equal(
    nodes(screen.render()).some(node => node.type === 'input' && node.props.placeholder === 'Tên sản phẩm'),
    false
  );
  button(screen.render(), 'Thêm dòng nhập tay').props.onClick();
  edit(screen.render(), 'Mã sản phẩm', 'TEM001');
  edit(screen.render(), 'Tên sản phẩm', 'Hàng nhập trực tiếp');
  await button(screen.render(), 'Lưu Đơn Hàng PO').props.onClick({ preventDefault() {} });
  assert.deepEqual(screen.alerts, []);
  const [linked, manual] = catalog.synchronizeCustomerProductOrderItems(screen.saved().items, { products: [product] });
  assert.equal(linked.customerProductId, 'product-a');
  assert.equal(linked.size, '50 × 30 mm');
  assert.equal(linked.unit, 'cuộn');
  assert.equal(manual.customerProductId, '');
  assert.equal(manual.productName, 'Hàng nhập trực tiếp');
});
