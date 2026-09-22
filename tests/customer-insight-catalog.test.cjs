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

test('classifications are owned only by raw data and leads', () => {
  const counts = items.reduce((result, item) => {
    result[item.module] = (result[item.module] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { leads: 43, customer_data: 16 });
  assert.deepEqual(
    items.filter(item => item.derived).map(item => ({ id: item.id, derived: item.derived })),
    [{ id: 'po_promised', derived: 'pending_order_draft' }]
  );
});

test('catalog exposes navigation and group-safe filtering helpers', () => {
  assert.match(source, /export const getCustomerInsightNavigation/);
  assert.match(source, /export const replaceCustomerInsightGroupValues/);
  assert.match(source, /export const matchesCustomerInsightValues/);
  assert.match(source, /module === 'customer_data' \|\| module === 'leads'/);
});

test('dashboard renders every group and limits classification records to raw data and leads', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'components', 'CustomerInsightDashboard.tsx'),
    'utf8'
  );
  assert.match(dashboardSource, /CUSTOMER_INSIGHT_GROUPS\.map/);
  assert.match(dashboardSource, /getCustomerInsightNavigation\(item\.id\)/);
  assert.match(dashboardSource, /Dữ liệu thô/);
  assert.match(dashboardSource, /Tiềm năng/);
  assert.doesNotMatch(dashboardSource, /key: `crm:/);
  assert.doesNotMatch(dashboardSource, /key: `sales:/);
  assert.equal((dashboardSource.match(/<article className="is-/g) || []).length, 8);
  assert.doesNotMatch(dashboardSource, /Theo dõi toàn bộ hành trình/);
  assert.match(dashboardSource, /customer-insight-module-text/);
  assert.doesNotMatch(dashboardSource, /customer-insight-results/);
  assert.ok(dashboardSource.indexOf('{operationalContent}') < dashboardSource.indexOf('customer-insight-groups'));

  const dashboardPageSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'pages', 'DashboardPage.tsx'),
    'utf8'
  );
  assert.doesNotMatch(dashboardPageSource, /Bảng tin hoạt động/);
  assert.doesNotMatch(dashboardPageSource, /Đơn Hàng Sắp Giao Trong Tuần/);
  assert.match(dashboardPageSource, /Cơ Cấu Doanh Thu & Công Nợ/);
  assert.match(dashboardPageSource, /Hàng Đợi Xử Lý PO/);
});

test('raw data and leads share the 59-item classification page and list controls', () => {
  const workspaceSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'components', 'LeadCandidateWorkspace.tsx'),
    'utf8'
  );
  const classificationSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'components', 'CustomerInsightClassification.tsx'),
    'utf8'
  );
  assert.match(workspaceSource, />Phân loại<\/button>/);
  assert.match(workspaceSource, /CustomerInsightClassification/);
  assert.match(workspaceSource, /CUSTOMER_INSIGHT_GROUPS\.flatMap/);
  assert.match(workspaceSource, /visibleCandidateInsightItems\.map/);
  assert.match(classificationSource, /CUSTOMER_INSIGHT_GROUPS\.map/);
  assert.match(classificationSource, /Tìm trong 59 mục/);
  assert.match(classificationSource, /Lưu phân loại/);
  assert.match(classificationSource, /type="checkbox"/);

  const leadsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'LeadsPage.tsx'),
    'utf8'
  );
  assert.match(leadsSource, /CUSTOMER_INSIGHT_GROUPS\.flatMap/);
  assert.match(leadsSource, /visibleLeadInsightItems\.map/);
  assert.match(leadsSource, /classificationLeadId/);
  assert.match(leadsSource, /CustomerInsightClassification/);
  assert.match(leadsSource, /openClassification\(selectedLead\)/);
  assert.match(leadsSource, /customerInsightValues: candidate\.customerInsightValues \|\| \[\]/);
  assert.doesNotMatch(leadsSource, /CustomerInsightEditor/);

  const customerSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'CrmPage.tsx'),
    'utf8'
  );
  const salesSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'sales', 'pages', 'SalesPage.tsx'),
    'utf8'
  );
  assert.doesNotMatch(customerSource, /CustomerInsightEditor/);
  assert.doesNotMatch(customerSource, /getCustomerInsightGroupsForModule\('crm'\)/);
  assert.doesNotMatch(salesSource, /getCustomerInsightGroupsForModule\('sales'\)/);
});
