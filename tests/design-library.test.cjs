const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

const STUBS = {
  '@/context/TableColumnLayoutContext': {
    useTableColumnLayouts: () => ({ layouts: {}, canEditColumns: false, saveLayout() {}, migrateLayout() {} })
  }
};
const loader = () => createLoader(STUBS);
const model = loader()('src/features/design/model/approvedDesigns.ts');

const order = (overrides = {}) => ({
  id: 'po1',
  poCode: 'PO-1',
  customerId: 'c1',
  customerName: 'Công ty A',
  items: [{ itemId: 'i1', productCode: 'TEM', productName: 'Tem nhãn', size: '60x40', material: 'Decal' }],
  ...overrides
});
const design = (overrides = {}) => ({
  id: 'd1',
  poId: 'po1',
  itemId: 'i1',
  status: 'approved',
  customerReferenceCode: 'KH-9',
  versions: [
    { versionNumber: 2, previewImage: 'data:image/png;base64,AA', aiLink: 'https://x/ai', feedbackAt: '2026-06-02' }
  ],
  ...overrides
});

test('the library lists approved designs that still have an order, newest approval first', () => {
  const templates = model.buildApprovedTemplates(
    [
      design(),
      design({ id: 'draft', status: 'waiting_client' }),
      design({ id: 'no-order', poId: 'gone' }),
      design({ id: 'newer', versions: [{ versionNumber: 1, feedbackAt: '2026-07-01' }] }),
      design({ id: 'old-file', versions: [], fileUrl: 'https://x/old.png', updatedAt: '2026-01-01' })
    ],
    [order()]
  );
  assert.deepEqual(
    templates.map(template => template.design.id),
    ['newer', 'd1', 'old-file']
  );
  assert.equal(templates[2].version.previewImage, 'https://x/old.png', 'old records keep their single file');
});

test('designers see the reference code instead of the customer name', () => {
  const [forSale] = model.buildApprovedTemplates([design()], [order()], 'sale');
  const [forDesigner] = model.buildApprovedTemplates([design()], [order()], 'designer');
  assert.equal(forSale.customerLabel, 'Công ty A');
  assert.equal(forDesigner.customerLabel, 'KH-9');
  assert.equal(forDesigner.customerKey, 'KH-9');
  assert.equal(model.filterApprovedTemplates([forDesigner], 'công ty', []).length, 0, 'the name is not searchable');
});

test('search and customer filter work together', () => {
  const templates = model.buildApprovedTemplates([design()], [order()]);
  assert.equal(model.filterApprovedTemplates(templates, ' tem ', []).length, 1);
  assert.equal(model.filterApprovedTemplates(templates, 'không có', []).length, 0);
  assert.equal(model.filterApprovedTemplates(templates, '', ['c1']).length, 1);
  assert.equal(model.filterApprovedTemplates(templates, '', ['c2']).length, 0);
});

test('a size built from missing numbers counts as no size', () => {
  assert.equal(model.cleanSpecText('undefinedxundefined'), '');
  assert.equal(model.cleanSpecText(' 80×55mm '), '80×55mm');
  assert.equal(model.cleanSpecText(undefined), '');
});

test('the library is a standard table: search, filter, pagination and a row menu', () => {
  const load = createLoader({
    ...STUBS,
    '@/components/RowActionMenu': {
      RowActionMenu: ({ actions }) => React.createElement('menu', null, actions.map(action => action.label).join('|'))
    }
  });
  const { ApprovedDesignLibrary } = load('src/features/design/components/ApprovedDesignLibrary.tsx');
  const render = props => renderToStaticMarkup(React.createElement(ApprovedDesignLibrary, props));
  const html = render({ designs: [design()], pos: [order()] });
  for (const label of ['Ảnh mẫu', 'Khách hàng', 'Mặt hàng', 'Mã hàng', 'Đơn hàng', 'Quy cách', 'Chất liệu'])
    assert.ok(html.includes(`>${label}</th>`) || html.includes(label), label);
  assert.ok(html.includes('Tem nhãn') && html.includes('v2') && html.includes('>AI</a>'));
  assert.ok(html.includes('Xem ảnh mẫu|Mở file AI'));
  assert.doesNotMatch(html, /approved-template-card|Mở file Corel/);
  assert.ok(render({ designs: [], pos: [] }).includes('Chưa có mẫu thiết kế đã duyệt.'));
  const page = readSource('src/features/design/pages/DesignLibraryPage.tsx');
  assert.doesNotMatch(page, /design-metric-card/);
});

test('the design list keeps priority in its own column, also for saved column layouts', () => {
  const page = readSource('src/features/design/pages/DesignPage.tsx');
  assert.match(page, /DESIGN_REQUIRED_COLUMN_IDS = \['request', 'priority', 'actions'\]/);
  assert.match(page, /<th key="priority">Mức ưu tiên<\/th>/);
  assert.match(page, /<td key="priority">\s*<span\s+className=\{`design-priority-text/);
  assert.match(page, /lockedStartIds: \['request', 'priority'\]/);
  assert.match(page, /cleanSpecText\(request\.size\)/);
  assert.match(page, /<th key="actions">Thao tác<\/th>/);
});
