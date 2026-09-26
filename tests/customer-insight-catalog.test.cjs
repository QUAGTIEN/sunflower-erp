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

test('customer insight catalog contains 8 groups and exactly 61 unique items', () => {
  const groupIds = [...source.matchAll(/\{ id: '([^']+)', label: '[^']+', items: \[/g)].map(match => match[1]);
  assert.equal(groupIds.length, 8);
  assert.equal(new Set(groupIds).size, 8);
  assert.equal(items.length, 61);
  assert.equal(new Set(items.map(item => item.id)).size, 61);
});

test('classifications are owned only by raw data and leads', () => {
  const counts = items.reduce((result, item) => {
    result[item.module] = (result[item.module] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, { leads: 45, customer_data: 16 });
  assert.deepEqual(
    items.filter(item => item.derived).map(item => ({ id: item.id, derived: item.derived })),
    [{ id: 'po_promised', derived: 'pending_order_draft' }]
  );
  assert.deepEqual(
    items.filter(item => ['design_file_provided', 'sale_quote_sent'].includes(item.id)).map(item => item.label),
    ['Khách đã được Sale báo giá', 'Khách cho file thiết kế']
  );
});

test('catalog exposes navigation and group-safe filtering helpers', () => {
  assert.match(source, /export const getCustomerInsightNavigation/);
  assert.match(source, /export const replaceCustomerInsightGroupValues/);
  assert.match(source, /export const matchesCustomerInsightValues/);
  assert.match(source, /module === 'customer_data' \|\| module === 'leads'/);
});

test('dashboard renders the focused overview and limits classification records to raw data and leads', () => {
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'components', 'CustomerInsightDashboard.tsx'),
    'utf8'
  );
  assert.match(dashboardSource, /DASHBOARD_GROUP_IDS/);
  assert.match(dashboardSource, /getCustomerInsightNavigation\(item\.id\)/);
  assert.match(dashboardSource, /customer-insight-expanded-groups/);
  assert.match(dashboardSource, /group\.items\.map/);
  assert.doesNotMatch(dashboardSource, /setSelectedGroupId/);
  assert.match(dashboardSource, /phân loại/);
  assert.match(dashboardSource, /Dữ liệu thô/);
  assert.match(dashboardSource, /Tiềm năng/);
  assert.match(dashboardSource, /PO đang hoạt động/);
  assert.match(dashboardSource, /product_needs/);
  assert.match(dashboardSource, /contact_interaction/);
  assert.doesNotMatch(dashboardSource, /key: `crm:/);
  assert.doesNotMatch(dashboardSource, /key: `sales:/);
  assert.equal((dashboardSource.match(/<article className="is-/g) || []).length, 4);
  assert.doesNotMatch(dashboardSource, /Theo dõi toàn bộ hành trình/);
  assert.match(dashboardSource, /customer-insight-overview-grid/);
  assert.ok(dashboardSource.indexOf('{revenueContent}') < dashboardSource.indexOf('customer-insight-summary-panel'));

  const dashboardPageSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'dashboard', 'pages', 'DashboardPage.tsx'),
    'utf8'
  );
  assert.doesNotMatch(dashboardPageSource, /Bảng tin hoạt động/);
  assert.doesNotMatch(dashboardPageSource, /Đơn Hàng Sắp Giao Trong Tuần/);
  assert.match(dashboardPageSource, /Giá trị PO 6 tháng gần nhất/);
  assert.match(dashboardPageSource, /dashboard-revenue-trend__discount/);
  assert.match(dashboardPageSource, /Tổng cột = trước chiết khấu/);
  assert.match(dashboardPageSource, /Hàng đợi xử lý PO/);
  assert.match(dashboardPageSource, /Việc cần xử lý/);
  assert.match(dashboardPageSource, /Chiết khấu phải trả/);
  assert.match(dashboardPageSource, /mergeWorkScheduleGroups/);
  assert.match(dashboardPageSource, /workGroupSummaries\.map/);
  assert.match(dashboardPageSource, /onNavigateWorkGroup\(summary\.group\.id\)/);
});

test('raw data and leads share the 61-item classification page and list controls', () => {
  const workspaceSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'components', 'LeadCandidateWorkspace.tsx'),
    'utf8'
  );
  const classificationSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'components', 'CustomerInsightClassification.tsx'),
    'utf8'
  );
  assert.match(workspaceSource, /Phân loại khách hàng <strong>\{form\.customerInsightValues\.length\}/);
  assert.match(workspaceSource, />\s*Thông tin hồ sơ\s*<\/button>/);
  assert.match(workspaceSource, /CustomerInsightClassification/);
  assert.match(workspaceSource, /CUSTOMER_INSIGHT_GROUPS\.flatMap/);
  assert.match(workspaceSource, /visibleCandidateInsightItems\.map/);
  assert.doesNotMatch(workspaceSource, /lead-candidate-drawer/);
  assert.doesNotMatch(workspaceSource, /label: 'Xem hồ sơ'/);
  assert.match(workspaceSource, /className="lead-candidate-company-button" onClick=\{\(\) => openEditForm\(candidate\)\}/);
  assert.match(workspaceSource, /className="lead-candidate-phone-link" onClick=\{\(\) => openEditForm\(candidate, 'profile'\)\}/);
  assert.doesNotMatch(workspaceSource, /data-system-label="businessSector"/);
  assert.doesNotMatch(workspaceSource, /data-system-label="expectedProducts"/);
  assert.match(workspaceSource, /<h2>File liên quan<\/h2>/);
  assert.match(classificationSource, /CUSTOMER_INSIGHT_GROUPS\.map/);
  assert.match(classificationSource, /Tìm trong \{CUSTOMER_INSIGHT_ITEMS\.length\} mục/);
  assert.match(classificationSource, /Lưu phân loại/);
  assert.match(classificationSource, /type="checkbox"/);
  assert.match(classificationSource, /toolbarActions/);
  assert.doesNotMatch(classificationSource, /FILTER_OPTIONS/);
  assert.doesNotMatch(classificationSource, />Đặt lại<\/button>/);

  const customerDataCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'CustomerData.css'),
    'utf8'
  );
  assert.match(customerDataCss, /\.customer-classification__groups\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.match(customerDataCss, /@media \(max-width: 1500px\)[\s\S]*\.customer-classification__groups\s*\{[^}]*repeat\(2,/);

  const leadsSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'LeadsPage.tsx'),
    'utf8'
  );
  assert.match(leadsSource, /CUSTOMER_INSIGHT_GROUPS\.flatMap/);
  assert.match(leadsSource, /visibleLeadInsightItems\.map/);
  assert.doesNotMatch(leadsSource, /classificationLeadId/);
  assert.match(leadsSource, /CustomerInsightClassification/);
  assert.match(leadsSource, /type LeadDetailTab = 'classification' \| 'profile'/);
  assert.match(leadsSource, /className="lead-record-header__tabs"/);
  assert.match(leadsSource, /hidden=\{leadDetailTab !== 'classification'\}/);
  assert.match(leadsSource, /hidden=\{Boolean\(editingLead && leadDetailTab !== 'profile'\)\}/);
  assert.match(leadsSource, /customerInsightValues: candidate\.customerInsightValues \|\| \[\]/);
  assert.doesNotMatch(leadsSource, /CustomerInsightEditor/);
  assert.match(leadsSource, /lead-record-header/);
  assert.match(leadsSource, /id="lead-profile-form"/);
  assert.doesNotMatch(leadsSource, /label: t\('Mở hồ sơ'\)/);
  assert.match(leadsSource, /<tr key=\{lead\.id\} onClick=\{\(\) => openEditForm\(lead\)\}>/);
  assert.match(leadsSource, /className="lead-candidate-phone-link"/);
  assert.match(leadsSource, /openEditForm\(lead, 'profile'\)/);
  assert.doesNotMatch(leadsSource, /data-system-label="businessSector"/);
  assert.doesNotMatch(leadsSource, /data-system-label="expectedProducts"/);
  assert.doesNotMatch(leadsSource, /data-system-label="companySize"/);
  assert.doesNotMatch(leadsSource, /if \(selectedLead\) \{/);
  assert.match(leadsSource, /function renderLeadRepository\(\)/);
  assert.doesNotMatch(leadsSource, /const renderLeadRepository\s*=/);
  assert.match(leadsSource, /window\.history\.pushState/);
  assert.match(leadsSource, /window\.addEventListener\('popstate'/);

  const leadsCss = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'features', 'crm', 'pages', 'Leads.css'),
    'utf8'
  );
  assert.match(leadsCss, /\.lead-form-page__header\.lead-record-header\s*\{[^}]*display: grid !important/s);
  assert.match(leadsCss, /\.lead-form-page__header\.lead-record-header\s*\{[^}]*min-height: 70px !important/s);
  assert.match(leadsCss, /\.lead-form-page__header\.lead-record-header\s*\{[^}]*padding: 10px 12px !important/s);
  assert.match(leadsCss, /> \.lead-record-header__actions\s*\{[^}]*flex-wrap: nowrap/s);

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

  const appShellSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'app', 'AppShell.tsx'),
    'utf8'
  );
  assert.match(appShellSource, /normalizeLeadRecords\(data\)/);
  assert.match(leadsSource, /\(selectedLead\.files \|\| \[\]\)\.filter/);
});
