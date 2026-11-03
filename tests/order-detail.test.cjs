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
  assert.deepEqual(
    Object.keys(model.ORDER_STEP_TRIGGERS),
    steps.map(step => step.value)
  );
  assert.equal(model.actorLabel('Khánh Ly (SALE)'), 'Khánh Ly (Sale)');
  assert.equal(model.actorLabel('Lê Minh (PRODUCER)'), 'Lê Minh (Kỹ thuật)');
  assert.equal(model.actorLabel('Không vai trò'), 'Không vai trò');
});

test('an order finds its own trips among stops of shared trips, newest first', () => {
  const { tripsForOrder } = loader()('src/features/delivery/model/deliveryTrips.ts');
  const found = tripsForOrder(
    [
      { id: 't1', deliveryDate: '2026-10-01', orders: [{ poId: 'po1', deliveredQty: 400 }] },
      { id: 't2', deliveryDate: '2026-10-05', orders: [{ poId: 'other' }, { poId: 'po1', deliveredQty: 600 }] },
      { id: 't3', deliveryDate: '2026-10-09', orders: [{ poId: 'other' }] },
      { id: 't4', deliveryDate: '2026-10-10', deleted: true, orders: [{ poId: 'po1' }] }
    ],
    'po1'
  );
  assert.deepEqual(
    found.map(({ trip, stop }) => [trip.id, stop.deliveredQty]),
    [
      ['t2', 600],
      ['t1', 400]
    ]
  );
});

test('view mode shows the read-only progress, the status and only the actions the role allows', () => {
  const parts = loader()('src/features/sales/components/orderDetail/OrderViewParts.tsx');
  const progress = renderToStaticMarkup(React.createElement(parts.OrderProgressPanel, { po: po() }));
  assert.equal((progress.match(/class="order-progress-panel__step /g) || []).length, 7);
  assert.match(progress, /order-progress-panel__step--current" aria-current="step"/);
  assert.ok(progress.includes('Khi khách duyệt mẫu thiết kế'), 'pending steps say what moves the order');
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
  assert.deepEqual(labels(actions()), ['In']);
  assert.deepEqual(labels(actions({ canManage: true })), ['In', 'Nhân bản', 'Sửa']);
  assert.deepEqual(labels(actions({ canManage: true, canDelete: true })), ['In', 'Nhân bản', 'Xóa', 'Sửa']);
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

test('the order form serves both modes: same layout, view toolbar and linked tabs only when read-only', () => {
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.equal(
    (form.match(/className="[^"]*po-readonly-fieldset"[^>]*disabled=\{readOnly\}|disabled=\{readOnly\}\s*>/g) || [])
      .length >= 3,
    true
  );
  assert.match(form, /\{readOnly \? \(\s*viewActions\s*\) : \(/);
  assert.match(form, /\{readOnly && viewSidebar\}/);
  assert.match(form, /\[\{ id: 'items', label: 'Sản phẩm' \}, \.\.\.viewTabs\]/);
  assert.match(form, /readOnly=\{readOnly\}/);
  assert.match(form, /usesCatalogProducts && !readOnly && \(/, 'no product picker in view mode');
});

test('production and delivery tabs list only this order, read-only, for every role that sees the order', () => {
  const live = rows => ({ useLiveCollections: () => ({ snapshots: rows, loading: false, error: '' }) });
  const { OrderProductionPanel } = loader({
    '@/hooks/useLiveCollections': live({
      commands: [
        { id: 'a', lsxCode: 'LSX-A', productionOrderVersion: 2, status: 'producing', poIds: ['po1', 'po2'], lines: [] },
        { id: 'b', cmdCode: 'OLD-B', poId: 'po1' },
        { id: 'c', lsxCode: 'LSX-C', productionOrderVersion: 2, status: 'released', poIds: ['po9'], lines: [] },
        { id: 'd', lsxCode: 'LSX-D', poId: 'po1', deleted: true }
      ]
    })
  })('src/features/sales/components/orderDetail/OrderProductionPanel.tsx');
  const production = renderToStaticMarkup(React.createElement(OrderProductionPanel, { poId: 'po1' }));
  assert.ok(production.includes('LSX-A') && production.includes('Đang sản xuất'));
  assert.ok(production.includes('OLD-B') && production.includes('Lệnh theo luồng cũ'));
  assert.ok(!production.includes('LSX-C') && !production.includes('LSX-D'));

  const { OrderDeliveryPanel } = loader({
    '@/hooks/useLiveCollections': live({
      trips: [{ id: 't1', delCode: 'GH-2610-0001', status: 'delivering', orders: [{ poId: 'po1', deliveredQty: 500 }] }]
    })
  })('src/features/sales/components/orderDetail/OrderDeliveryPanel.tsx');
  const delivery = renderToStaticMarkup(React.createElement(OrderDeliveryPanel, { poId: 'po1' }));
  assert.ok(delivery.includes('GH-2610-0001') && delivery.includes('Đang giao hàng') && delivery.includes('500'));
  assert.doesNotMatch(production + delivery, /<button|<input/);
});

test('the order page opens an order in the form read-only and returns there after editing', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /<POFormFullScreen\s+key=\{`view-\$\{viewPO\.id\}/);
  assert.match(page, /isOpen\s+readOnly\s+po=\{viewPO\}/);
  for (const tab of ['Thiết kế', 'Sản xuất', 'Giao hàng', 'Trao đổi', 'Lịch sử'])
    assert.ok(page.includes(`label: '${tab}'`), tab);
  assert.match(page, /if \(showEditModal\) \{\s*setShowEditModal\(false\);\s*return;\s*\}/);
  assert.doesNotMatch(page, /OrderDetailView|CHI TIẾT TIẾN ĐỘ ĐƠN HÀNG|MỤC PHẢN HỒI|Base64 nào/);
});
