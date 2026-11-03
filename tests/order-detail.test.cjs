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

test('view mode restores design notes, internal notes, history and costs as blocks of the left column', () => {
  const sections = loader()('src/features/sales/components/orderDetail/OrderViewSections.tsx');
  const { lineCost, actorLabel } = loader()('src/features/sales/model/orderDetail.ts');
  assert.deepEqual(lineCost(line({ purchasePrice: 40 })), { purchasePrice: 40, buyingTotal: 40000, profit: 50000 });
  assert.equal(actorLabel('Khánh Ly (SALE)'), 'Khánh Ly (Sale)');
  assert.equal(actorLabel('Không vai trò'), 'Không vai trò');

  const noop = () => {};
  const blocks = [
    React.createElement(sections.OrderCostSection, { items: [line()], supplierNames: {} }),
    React.createElement(sections.OrderDesignNotesSection, {
      items: [line()],
      canEditSaleBrief: true,
      canEditDesignReply: false,
      onUpdateNotes: noop,
      onUploadFiles: noop,
      onRemoveFile: noop,
      onPreviewImage: noop
    }),
    React.createElement(sections.OrderNotesSection, {
      tasks: [],
      draft: '',
      onDraftChange: noop,
      onAdd: noop,
      onToggle: noop,
      onRemove: noop
    }),
    React.createElement(sections.OrderHistorySection, { logs: po().historyLogs, createdBy: 'Khánh Ly (SALE)' })
  ];
  const titles = blocks.map(block => renderToStaticMarkup(block).match(/<span>([^<]+)<\/span>/)[1]);
  assert.deepEqual(titles, ['Giá vốn &amp; lợi nhuận', 'Ghi chú thiết kế', 'Trao đổi nội bộ', 'Lịch sử trạng thái']);
  for (const block of blocks) {
    const html = renderToStaticMarkup(block);
    assert.match(html, /class="po-collapse-trigger" aria-expanded="false"/, 'same collapsed card as the form');
    assert.match(html, /class="po-attachments-card"/);
  }

  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /canViewOrderCosts = currentUser\.role === 'admin' \|\| currentUser\.role === 'accountant'/);
  assert.match(page, /\{canViewOrderCosts && <OrderCostSection/);
  assert.match(page, /canEditDesignReply=\{currentUser\.role === 'admin' \|\| currentUser\.role === 'designer'\}/);
  assert.match(readSource('src/features/sales/components/POFormFullScreen.tsx'), /\{readOnly && viewSections\}/);
});

test('a design note is written once when the field loses focus, not on every key', () => {
  const source = readSource('src/features/sales/components/orderDetail/OrderViewSections.tsx');
  assert.match(source, /onChange=\{event => setDraft\(event\.target\.value\)\}/);
  assert.match(source, /onBlur=\{\(\) => \{\s*if \(draft !== value\) onSave\(draft\);\s*\}\}/);
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.match(
    form,
    /const orderKey = readOnly \? `view:\$\{po\?\.id\}:\$\{po\?\.updatedAt \|\| ''\}` : `edit:\$\{po\?\.id\}`/
  );
});
