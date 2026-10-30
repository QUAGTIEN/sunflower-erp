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
