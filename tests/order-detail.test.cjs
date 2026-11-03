const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

const STUBS = {
  '@/context/TableColumnLayoutContext': {
    useTableColumnLayouts: () => ({ layouts: {}, canEditColumns: false, saveLayout() {}, migrateLayout() {} })
  },
  '@/infrastructure/firebase/erpDataGateway': { dbService: {}, isFirebaseRuntimeEnabled: false }
};
const loader = (stubs = {}) => createLoader({ ...STUBS, ...stubs });

const line = (overrides = {}) => ({
  itemId: 'i1',
  productCode: 'TEM',
  productName: 'Tem nhãn',
  unit: 'cái',
  quantity: 1000,
  price: 100,
  discountRate: 10,
  vatRate: 8,
  ...overrides
});
const po = (overrides = {}) => ({
  id: 'po1',
  poCode: 'PO-202609-0002',
  status: 'waiting_design',
  customerId: 'c1',
  customerName: 'CÔNG TY CỔ PHẦN HÀ NỘI HƯNG YÊN',
  customerSnapshot: { customerCode: 'KH001', companyName: 'CÔNG TY CỔ PHẦN HÀ NỘI HƯNG YÊN', customerRank: 'B' },
  items: [line()],
  historyLogs: [
    { status: 'waiting_design', updatedAt: '2026-09-11T02:38:09.000Z', updatedBy: 'Khánh Ly (SALE)', note: 'Khởi tạo' }
  ],
  createdBy: 'Khánh Ly (SALE)',
  createdAt: '2026-09-11T02:38:09.000Z',
  ...overrides
});

test('view mode shows the status and only the actions the role allows', () => {
  const parts = loader()('src/features/sales/components/orderDetail/OrderViewParts.tsx');
  assert.ok(renderToStaticMarkup(React.createElement(parts.OrderStatusBadge, { po: po() })).includes('Chờ thiết kế'));
  assert.equal(typeof parts.OrderProgressStrip, 'undefined', 'the view adds nothing the create form does not have');

  const noop = () => {};
  const actions = props =>
    renderToStaticMarkup(
      React.createElement(parts.OrderViewActions, {
        canManage: false,
        canDelete: false,
        onPrint: noop,
        onRepeat: noop,
        onEdit: noop,
        onDelete: noop,
        ...props
      })
    );
  const labels = html => [...html.matchAll(/>([^<>]+)<\/button>/g)].map(match => match[1]);
  assert.match(actions(), /aria-label="In đơn hàng"/, 'printing is an icon tool button');
  assert.deepEqual(labels(actions()), []);
  assert.deepEqual(labels(actions({ canManage: true })), ['Nhân bản', 'Sửa']);
  assert.deepEqual(labels(actions({ canManage: true, canDelete: true })), ['Nhân bản', 'Xóa', 'Sửa']);
});

test('the order lines grid locks every input in view mode but keeps details and pictures', () => {
  const { POItemsGrid } = loader()('src/features/sales/components/poForm/POItemsGrid.tsx');
  const noop = () => {};
  const render = readOnly =>
    renderToStaticMarkup(
      React.createElement(POItemsGrid, {
        tableZoom: 100,
        usesCatalogProducts: true,
        orderItems: [{ id: 'i1', itemId: 'i1', productCode: 'TEM', unit: 'cái', quantity: 1000, price: 100 }],
        expandedItemIds: [],
        setPreviewImage: noop,
        deleteRowImage: noop,
        handleRowFileChange: async () => {},
        toggleItemDetails: noop,
        handleRemoveRow: noop,
        handleUpdateRowField: noop,
        catalogProducts: [],
        openSearchPopup: noop,
        isSaving: false,
        readOnly
      })
    );
  const view = render(true);
  const controls = view.match(/<(input|select|textarea)\b[^>]*>/g) || [];
  assert.ok(controls.length > 0);
  assert.ok(
    controls.every(control => control.includes('disabled=""')),
    'no editable control in view mode'
  );
  assert.ok(view.includes('>Chi tiết</button>'), 'line details still open');
  assert.doesNotMatch(view, />Đổi<|>Xóa</);
  const edit = render(false);
  assert.ok(edit.includes('>Đổi</button>') && edit.includes('>Xóa</button>'));
  assert.ok((edit.match(/<(input|select|textarea)\b[^>]*>/g) || []).some(control => !control.includes('disabled=""')));
});

test('the order form serves both modes with one layout; the left column opens and closes', () => {
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.equal(
    (form.match(/className="[^"]*po-readonly-fieldset"[^>]*disabled=\{readOnly\}|disabled=\{readOnly\}\s*>/g) || [])
      .length >= 3,
    true
  );
  assert.match(form, /\{readOnly \? \(\s*viewActions\s*\) : \(/);
  assert.doesNotMatch(form, /viewTabs|viewSidebar|viewProgress|po-voucher|role="tablist"/);
  assert.match(form, /readOnly=\{readOnly\}/);
  assert.match(form, /usesCatalogProducts && !readOnly && \(/, 'no product picker in view mode');
  assert.match(form, /label=\{isSidebarOpen \? 'Ẩn thông tin đơn hàng' : 'Hiện thông tin đơn hàng'\}/);
  assert.match(form, /\{isSidebarOpen && \(\s*<aside id="po-order-sidebar"/);
  assert.match(form, /gridTemplateColumns: isSidebarOpen \? '300px minmax\(0, 1fr\)' : 'minmax\(0, 1fr\)'/);
});

test('the order page opens an order in the form read-only and returns there after editing', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /<POFormFullScreen\s+key=\{`view-\$\{viewPO\.id\}/);
  assert.match(page, /isOpen\s+readOnly\s+po=\{viewPO\}/);
  assert.doesNotMatch(page, /viewTabs|OrderDesignPanel|OrderNotesPanel/, 'D-PO1: the order view has no tabs');
  assert.match(page, /if \(showEditModal\) \{\s*setShowEditModal\(false\);\s*return;\s*\}/);
  assert.doesNotMatch(page, /OrderDetailView|CHI TIẾT TIẾN ĐỘ ĐƠN HÀNG|MỤC PHẢN HỒI|Base64 nào/);
});
