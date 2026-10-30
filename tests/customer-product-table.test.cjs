const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource } = require('./helpers/loadTs.cjs');

test('customer product codes use one column per field and move row actions into the row menu', () => {
  const card = readSource('src/features/crm/components/CustomerOrderHistoryCard.tsx');
  const headers = [
    'Ảnh',
    'Mã hàng',
    'Tên sản phẩm',
    'Loại sản phẩm',
    'Chất liệu / NVL',
    'Quy cách',
    'Số đơn',
    'SL đã đặt',
    'Đơn hàng gần nhất',
    'Tệp'
  ];
  for (const header of headers) assert.ok(card.includes(`{t('${header}')}</th>`), header);
  assert.match(card, /<RowActionMenu label=\{`\$\{t\('Thao tác'\)\} \$\{product\.productName\}`\} actions=\{actions\}/);
  assert.doesNotMatch(card, /customer-sample-identity|customer-product-asset-button|Quy cách & NVL/);
  const css = readSource('src/components/CustomerHistory.css');
  assert.match(css, /\.customer-product-catalog-table \{[^}]*table-layout: fixed;/);
});

test('attendance dialogs never style radio or checkbox inputs as text boxes', () => {
  const css = readSource('src/features/attendance/pages/Attendance.css');
  assert.match(css, /\.attendance-dialog input:not\(\[type='radio'\]\):not\(\[type='checkbox'\]\)/);
  assert.match(css, /\.attendance-status-options input \{[^}]*width: 16px(\s*!important)?;/);
  assert.match(css, /\.attendance-status-options label \{[^}]*justify-content: flex-start;[^}]*white-space: nowrap;/);
});

test('the Mã sản phẩm directory lists every customer product and counts only its own customer orders', () => {
  const { createLoader } = require('./helpers/loadTs.cjs');
  const catalog = createLoader()('src/features/crm/model/customerProductCatalog.ts');
  const product = (id, productCode, extra = {}) => ({
    id,
    productCode,
    productName: `Tem ${productCode}`,
    productType: 'tem_mau_cuon',
    unit: 'cái',
    ...extra
  });
  const customers = [
    { id: 'a', companyName: 'Công ty A', customerCode: 'KH-0001', products: [product('pa', 'TEM-01')] },
    {
      id: 'b',
      companyName: 'Công ty B',
      customerCode: 'KH-0002',
      products: [product('pb', 'TEM-01', { previousProductCodes: ['OLD-9'] }), product('gone', 'X', { deleted: true })]
    },
    { id: 'c', companyName: 'Đã xóa', deleted: true, products: [product('pc', 'TEM-01')] }
  ];
  const line = (customerProductId, quantity, productCode = 'TEM-01') => ({ customerProductId, productCode, quantity });
  const orders = [
    { id: 'o1', customerId: 'a', poCode: 'DH-2610-0001', orderDate: '2026-10-01', items: [line('pa', 100)] },
    { id: 'o2', customerId: 'b', poCode: 'DH-2610-0002', orderDate: '2026-10-02', items: [line('pb', 500)] },
    { id: 'o3', customerId: 'b', poCode: 'DH-2610-0003', orderDate: '2026-10-05', items: [line('pb', 300)] },
    { id: 'o4', customerId: 'a', poCode: 'DH-2610-0004', deleted: true, items: [line('pa', 999)] }
  ];
  const rows = catalog.buildProductDirectory(customers, orders);
  assert.deepEqual(
    rows.map(row => [row.customer.id, row.product.productCode, row.orderCount, row.totalQuantity, row.lastPoCode]),
    [
      ['b', 'TEM-01', 2, 800, 'DH-2610-0003'],
      ['a', 'TEM-01', 1, 100, 'DH-2610-0001']
    ],
    'same code of two customers stays two rows, the biggest buyer first; deleted products and customers are left out'
  );
  assert.equal(rows[0].productTypeName, 'Tem màu cuộn');
  const search = text => rows.filter(row => catalog.productDirectoryMatches(row, text)).map(row => row.customer.id);
  assert.deepEqual(search('tem-01'), ['b', 'a']);
  assert.deepEqual(search('old-9'), ['b'], 'a former code still finds the product');
  assert.deepEqual(search('KH-0001'), ['a']);

  const page = readSource('src/features/crm/pages/CrmPage.tsx');
  assert.match(page, /onClick=\{\(\) => setFilterType\('products'\)\}[\s\S]{0,200}Mã sản phẩm/);
  assert.match(page, /buildProductDirectory\(accessibleCustomers, pos\)/, 'Sale sees only the customers they can open');
});
