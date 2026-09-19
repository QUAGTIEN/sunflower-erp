const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'features', 'crm', 'model', 'customerInsightCatalog.ts'),
  'utf8'
);

const items = [...source.matchAll(/item\('([^']+)'\s*,\s*'([^']+)'\s*,\s*'(customer_data|leads|crm|sales)'(?:\s*,\s*'([^']+)')?\)/g)]
  .map(match => ({ id: match[1], label: match[2], module: match[3], derived: match[4] || '' }));

test('customer insight catalog contains 8 groups and exactly 59 unique items', () => {
  const groupIds = [...source.matchAll(/\{ id: '([^']+)', label: '[^']+', items: \[/g)].map(match => match[1]);
  assert.equal(groupIds.length, 8);
  assert.equal(new Set(groupIds).size, 8);
  assert.equal(items.length, 59);
  assert.equal(new Set(items.map(item => item.id)).size, 59);
});

test('each classification belongs to its agreed source module', () => {
  const counts = items.reduce((result, item) => {
    result[item.module] = (result[item.module] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { sales: 1, leads: 32, customer_data: 16, crm: 10 });
  assert.deepEqual(
    items.filter(item => item.derived).map(item => ({ id: item.id, derived: item.derived })),
    [{ id: 'po_promised', derived: 'pending_order_draft' }]
  );
});

test('catalog exposes navigation and group-safe filtering helpers', () => {
  assert.match(source, /export const getCustomerInsightNavigation/);
  assert.match(source, /export const replaceCustomerInsightGroupValues/);
  assert.match(source, /export const matchesCustomerInsightValues/);
});

test('dashboard renders every group and routes item selections to their owning module', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'components', 'CustomerInsightDashboard.tsx'),
    'utf8'
  );
  assert.match(dashboardSource, /CUSTOMER_INSIGHT_GROUPS\.map/);
  assert.match(dashboardSource, /getCustomerInsightNavigation\(selectedItem\.id\)/);
  assert.match(dashboardSource, /record\.module === selectedItem\.module/);
  assert.match(dashboardSource, /Dữ liệu thô/);
  assert.match(dashboardSource, /Tiềm năng/);
  assert.match(dashboardSource, /Khách hàng/);
  assert.match(dashboardSource, /Tạo đơn hàng/);
  assert.equal((dashboardSource.match(/<article className="is-/g) || []).length, 8);
  assert.doesNotMatch(dashboardSource, /Theo dõi toàn bộ hành trình/);
  assert.match(dashboardSource, /customer-insight-module-text/);

  const dashboardPageSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'pages', 'DashboardPage.tsx'),
    'utf8'
  );
  assert.doesNotMatch(dashboardPageSource, /Bảng tin hoạt động/);
  assert.doesNotMatch(dashboardPageSource, /Đơn Hàng Sắp Giao Trong Tuần/);
  assert.match(dashboardPageSource, /Cơ Cấu Doanh Thu & Công Nợ/);
  assert.match(dashboardPageSource, /Hàng Đợi Xử Lý PO/);
});
