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

test('order totals, steps and actor names come from the order itself', () => {
  const totals = model.orderTotals([line(), line({ itemId: 'i2', discountRate: 0 })]);
  assert.deepEqual(
    [totals.grossAmount, totals.discountAmount, totals.amountBeforeVat, Math.round(totals.vatAmount)],
    [200000, 10000, 190000, 15200]
  );
  assert.equal(totals.kpi.toFixed(1), '95.0');
  assert.equal(model.orderTotals([]).kpi, 0);

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
  assert.deepEqual(model.lineImages({ previewImage: 'a', saleLayouts: ['a', 'b'], designLayouts: ['c', ''] }), [
    'a',
    'b',
    'c'
  ]);
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

const renderDetail = (props = {}) => {
  const { OrderDetailView } = loader()('src/features/sales/components/orderDetail/OrderDetailView.tsx');
  const noop = () => {};
  return renderToStaticMarkup(
    React.createElement(OrderDetailView, {
      po: po(),
      saleName: 'Khánh Ly',
      supplierNames: {},
      canViewFinancials: true,
      canViewCosts: false,
      canManage: true,
      canDelete: false,
      canEditSaleBrief: true,
      canEditDesignReply: false,
      checklistDraft: '',
      onBack: noop,
      onPrint: noop,
      onRepeat: noop,
      onEdit: noop,
      onDelete: noop,
      onPreviewImage: noop,
      onUpdateLineNotes: noop,
      onUploadLineFiles: noop,
      onRemoveLineFile: noop,
      onChecklistDraftChange: noop,
      onAddChecklistItem: noop,
      onToggleChecklistItem: noop,
      onRemoveChecklistItem: noop,
      ...props
    })
  );
};

test('the detail reads like a voucher: header, read-only steps, general data and tabs without counts', () => {
  const html = renderDetail();
  assert.ok(html.includes('Đơn hàng PO-202609-0002'));
  assert.ok(html.includes('>Chờ thiết kế</span>'));
  assert.match(html, /aria-label="Xuất đơn hàng"/);
  for (const label of ['Đặt lại từ đơn này', 'Chỉnh sửa']) assert.ok(html.includes(`>${label}</button>`), label);
  assert.ok(!html.includes('>Xóa</button>'), 'only admins see Xóa');
  assert.ok(renderDetail({ canDelete: true }).includes('>Xóa</button>'));
  for (const field of ['Khách hàng', 'Số đơn hàng', 'Ngày đặt', 'Mã khách', 'PO của khách', 'Giao dự kiến'])
    assert.ok(html.includes(`<dt>${field}</dt>`), field);
  assert.ok(html.includes('KH001'));
  assert.equal((html.match(/class="order-steps__item/g) || []).length, 7);
  assert.ok(html.includes('Bước tiếp theo tự chuyển khi khách duyệt mẫu thiết kế.'));
  const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map(match => match[1]);
  assert.deepEqual(tabs, ['Hàng tiền', 'Thiết kế', 'Sản xuất', 'Giao hàng', 'Tệp và ảnh mẫu', 'Trao đổi', 'Lịch sử']);
  assert.doesNotMatch(html, /Cập nhật nhanh|<select/, 'D-PO1: no manual status and no inline discount editor');
  assert.ok(html.includes('10%'));
  assert.ok(html.includes('Tổng thanh toán'));
  assert.ok(html.includes('97.200 đ'));
});

test('without sale financials the amounts stay hidden', () => {
  const html = renderDetail({ canViewFinancials: false, canManage: false });
  assert.ok(!html.includes('97.200'));
  assert.ok(!html.includes('Tổng thanh toán'));
  assert.ok(!html.includes('Chỉnh sửa'));
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

test('the order page hands the detail to OrderDetailView and keeps money and costs behind the existing rules', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(
    page,
    /<OrderDetailView[\s\S]*canViewFinancials=\{canViewSaleFinancials\}[\s\S]*canViewCosts=\{isFull\}/
  );
  assert.doesNotMatch(page, /CHI TIẾT TIẾN ĐỘ ĐƠN HÀNG|MỤC PHẢN HỒI|Base64 nào/);
});
