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
const model = loader()('src/features/sales/model/orderDetail.ts');

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

test('order steps and actor names come from the order itself', () => {
  const steps = model.orderSteps(
    po({
      status: 'waiting_delivery',
      historyLogs: [
        { status: 'waiting_design', updatedAt: '2026-09-11T02:00:00.000Z', updatedBy: 'Sale A (SALE)' },
        { status: 'production_pending', updatedAt: '2026-09-12T02:00:00.000Z', updatedBy: 'Thiết kế B (DESIGNER)' },
        { status: 'waiting_delivery', updatedAt: '2026-09-13T02:00:00.000Z', updatedBy: 'Kế toán C (ACCOUNTANT)' }
      ]
    })
  );
  assert.deepEqual(
    steps.map(step => step.state),
    ['done', 'done', 'current', 'pending', 'pending', 'pending', 'pending']
  );
  assert.equal(steps[1].reachedAt, '2026-09-12T02:00:00.000Z', 'legacy statuses map onto their queue step');
  assert.equal(steps[3].reachedAt, '');
  assert.equal(model.actorLabel('Khánh Ly (SALE)'), 'Khánh Ly (Sale)');
  assert.equal(model.actorLabel('Lê Minh (PRODUCER)'), 'Lê Minh (Kỹ thuật)');
  assert.equal(model.actorLabel('Không vai trò'), 'Không vai trò');
});

test('view mode shows the read-only progress, the status and only the actions the role allows', () => {
  const parts = loader()('src/features/sales/components/orderDetail/OrderViewParts.tsx');
  const progress = renderToStaticMarkup(React.createElement(parts.OrderProgressStrip, { po: po() }));
  assert.equal((progress.match(/class="order-progress-strip__step /g) || []).length, 7);
  assert.match(progress, /order-progress-strip__step--current" aria-current="step" title="[^"]*Khánh Ly \(Sale\)"/);
  assert.doesNotMatch(progress, /Khi khách duyệt/, 'pending steps carry no caption');
  assert.doesNotMatch(progress, /<select|<button/, 'D-PO1: the queue is never changed by hand');
  assert.ok(renderToStaticMarkup(React.createElement(parts.OrderStatusBadge, { po: po() })).includes('Chờ thiết kế'));

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
  const audit = renderToStaticMarkup(
    React.createElement(parts.OrderAuditLine, { createdBy: 'Khánh Ly (SALE)', createdAt: '2026-09-11T02:38:09.000Z' })
  );
  assert.ok(audit.includes('Người lập: Khánh Ly (Sale)') && audit.includes('Người sửa: chưa có'));
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

test('the order form serves both modes: the view is a voucher with the same fields and grid, no tabs', () => {
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.equal(
    (form.match(/className="[^"]*po-readonly-fieldset"[^>]*disabled=\{readOnly\}|disabled=\{readOnly\}\s*>/g) || [])
      .length >= 3,
    true
  );
  assert.match(form, /\{readOnly \? \(\s*viewActions\s*\) : \(/);
  assert.match(form, /\{readOnly \? \(\s*<div className="po-voucher-body">\s*\{viewProgress\}/);
  assert.equal((form.match(/\{itemsCard\}/g) || []).length, 2, 'view and edit render the same product card');
  assert.doesNotMatch(form, /viewTabs|viewSidebar|role="tablist"/);
  assert.match(form, /readOnly=\{readOnly\}/);
  assert.match(form, /usesCatalogProducts && !readOnly && \(/, 'no product picker in view mode');
});

test('the voucher header lists the order form fields and the totals of the lines', () => {
  const view = loader()('src/features/sales/components/poForm/POVoucherView.tsx');
  const info = renderToStaticMarkup(
    React.createElement(view.POVoucherInfo, {
      customerName: 'CÔNG TY CỔ PHẦN HÀ NỘI HƯNG YÊN',
      customerRank: 'B',
      customerPoCode: '',
      expectedDeliveryDate: '2026-09-20',
      createdAt: '2026-09-11T02:38:09.000Z',
      notes: ''
    })
  );
  for (const label of ['Khách hàng', 'Hạng khách hàng', 'Số PO khách', 'Ngày giao dự kiến', 'Ghi chú đơn hàng'])
    assert.ok(info.includes(`>${label}<`), label);
  assert.ok(info.includes('Hạng B') && info.includes('2026'));
  assert.doesNotMatch(info, /<input|<select|<textarea/);
  const summary = renderToStaticMarkup(
    React.createElement(view.POVoucherSummary, {
      quantitiesByUnit: new Map([['cái', 1000]]),
      totalBeforeVat: 90000,
      totalVat: 7200,
      totalAfterVat: 97200
    })
  );
  assert.ok(summary.includes('1.000 cái') && summary.includes('97.200 đ'));
});

test('the order page opens an order in the form read-only and returns there after editing', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /<POFormFullScreen\s+key=\{`view-\$\{viewPO\.id\}/);
  assert.match(page, /isOpen\s+readOnly\s+po=\{viewPO\}/);
  assert.match(page, /viewProgress=\{<OrderProgressStrip po=\{viewPO\} \/>\}/);
  assert.doesNotMatch(page, /viewTabs|OrderDesignPanel|OrderNotesPanel/, 'D-PO1: the order view has no tabs');
  assert.match(page, /if \(showEditModal\) \{\s*setShowEditModal\(false\);\s*return;\s*\}/);
  assert.doesNotMatch(page, /OrderDetailView|CHI TIẾT TIẾN ĐỘ ĐƠN HÀNG|MỤC PHẢN HỒI|Base64 nào/);
});
