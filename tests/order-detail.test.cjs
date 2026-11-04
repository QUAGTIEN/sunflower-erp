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

test('an open order shows its status and only the header tools the role allows', () => {
  const parts = loader()('src/features/sales/components/orderDetail/OrderViewParts.tsx');
  assert.ok(renderToStaticMarkup(React.createElement(parts.OrderStatusBadge, { po: po() })).includes('Chờ thiết kế'));
  const noop = () => {};
  const actions = props =>
    renderToStaticMarkup(
      React.createElement(parts.OrderHeaderActions, { canDelete: false, onPrint: noop, onDelete: noop, ...props })
    );
  const labels = html => [...html.matchAll(/>([^<>]+)<\/button>/g)].map(match => match[1]);
  assert.match(actions(), /aria-label="Xuất phiếu đơn hàng"/, 'printing is an icon tool button');
  assert.deepEqual(labels(actions()), []);
  assert.deepEqual(labels(actions({ canDelete: true })), ['Xóa']);
});

test('the order lines grid keeps its actions in the row menu; a locked order only opens details', () => {
  const menuLabels = [];
  const { POItemsGrid } = loader({
    '@/components/RowActionMenu': {
      RowActionMenu: ({ actions }) => {
        menuLabels.push(actions);
        return null;
      }
    }
  })('src/features/sales/components/poForm/POItemsGrid.tsx');
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
  const locked = render(true);
  const controls = locked.match(/<(input|select|textarea)\b[^>]*>/g) || [];
  assert.ok(controls.length > 0);
  assert.ok(
    controls.every(control => control.includes('disabled=""')),
    'no editable control on a locked order'
  );
  assert.deepEqual(
    menuLabels.pop().map(action => action.label),
    ['Chi tiết']
  );
  const edit = render(false);
  const editActions = menuLabels.pop();
  assert.deepEqual(
    editActions.map(action => action.label),
    ['Chi tiết', 'Đổi sản phẩm', 'Xóa dòng']
  );
  assert.equal(editActions[1].disabled, true, 'no catalog products to change to');
  assert.equal(editActions[2].danger, true);
  assert.ok((edit.match(/<(input|select|textarea)\b[^>]*>/g) || []).some(control => !control.includes('disabled=""')));
});

test('one form per order: save stays beside the header tools and the left column opens and closes', () => {
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.equal(
    (form.match(/className="[^"]*po-readonly-fieldset"[^>]*disabled=\{readOnly\}|disabled=\{readOnly\}\s*>/g) || [])
      .length >= 3,
    true
  );
  assert.match(form, /\{headerActions\}\s*\{!readOnly && \(\s*<button/);
  assert.match(form, /po\s*\?\s*'Lưu'\s*:\s*'Lưu Đơn Hàng'/);
  assert.match(form, /\? `Đơn hàng \$\{po\.poCode\}`/);
  assert.doesNotMatch(form, /Chỉnh sửa đơn hàng|viewActions|viewTabs|role="tablist"/);
  assert.match(form, /readOnly=\{readOnly\}/);
  assert.match(form, /usesCatalogProducts && !readOnly && \(/, 'no product picker on a locked order');
  assert.match(form, /label=\{isSidebarOpen \? 'Ẩn thông tin đơn hàng' : 'Hiện thông tin đơn hàng'\}/);
  assert.match(form, /\{isSidebarOpen && \(\s*<aside id="po-order-sidebar"/);
});

test('unsaved edits of an open order warn before leaving; saving clears the warning', () => {
  const form = readSource('src/features/sales/components/POFormFullScreen.tsx');
  assert.match(form, /Boolean\(po\) && !readOnly && editableValues\.some/);
  assert.match(form, /if \(hasUnsavedOrderEdits && !window\.confirm\(DISCARD_ORDER_EDITS_MESSAGE\)\) return;/);
  assert.match(form, /registerNavigationGuard\(\s*\(\) => !isSaving && window\.confirm\(DISCARD_ORDER_EDITS_MESSAGE\)/);
  assert.match(form, /await onSave\(poData\);\s*setSavedValues\(editableValues\);/);
});

test('saving the form keeps design notes written meanwhile; other line edits win', () => {
  const { withLiveLineNotes } = loader()('src/features/sales/model/orderDetail.ts');
  const [changed, added, legacy, moved] = withLiveLineNotes(
    [
      { itemId: 'a', quantity: 5, saleNotes: 'cũ' },
      { itemId: 'new', quantity: 1 },
      { itemId: 'generated', productCode: 'OLD', saleNotes: 'cũ' },
      { itemId: 'generated2', productCode: 'OTHER', saleNotes: 'giữ' }
    ],
    [
      { itemId: 'a', quantity: 1, saleNotes: 'mới', designNotes: 'trả lời', saleLayouts: ['x'], designLayouts: [] },
      { itemId: 'b', quantity: 9, saleNotes: 'dòng đã xóa' },
      { productCode: 'OLD', saleNotes: 'mới theo vị trí' },
      { productCode: 'DIFFERENT', saleNotes: 'khác mã' }
    ]
  );
  assert.equal(changed.quantity, 5);
  assert.equal(changed.saleNotes, 'mới');
  assert.equal(changed.designNotes, 'trả lời');
  assert.deepEqual(changed.saleLayouts, ['x']);
  assert.deepEqual(added, { itemId: 'new', quantity: 1 });
  assert.equal(legacy.saleNotes, 'mới theo vị trí');
  assert.equal(moved.saleNotes, 'giữ', 'a line without id never takes notes of another product');
});

test('the order page opens one editable page; role or a production plan locks it with a reason', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /<POFormFullScreen\s+key=\{`order-\$\{viewPO\.id\}`\}/);
  assert.match(page, /readOnly=\{!canManageOrder \|\| Boolean\(viewPO\.productionPlanFrozen\)\}/);
  assert.match(page, /lockedReason=\{canManageOrder && viewPO\.productionPlanFrozen \? ORDER_FROZEN_MESSAGE : ''\}/);
  assert.doesNotMatch(page, /showEditModal|handleOpenEditModal|OrderViewActions|viewTabs/);
  assert.match(page, /label: 'Đặt lại', onSelect: \(\) => handleOpenRepeatOrder\(po\)/);
  assert.match(page, /const items = withLiveLineNotes\(poData\.items, viewPO\.items \|\| \[\]\);/);
  assert.match(page, /\(viewPO\.historyLogs \|\| \[\]\)/);
  assert.doesNotMatch(
    page,
    /selectedPO\.items|selectedPO\.internalChecklist/,
    'a stale pick never overwrites the order'
  );
});

test('an open order has design notes, internal notes, history and costs as blocks of the left column', () => {
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
  assert.match(readSource('src/features/sales/components/POFormFullScreen.tsx'), /\{po && orderSections\}/);
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
