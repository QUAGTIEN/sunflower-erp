const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

test('sales management is a standalone admin module', () => {
  const appShell = read('src/app/AppShell.tsx');
  const accessControl = read('src/app/navigation/accessControl.ts');
  const rawWorkspace = read('src/features/crm/components/LeadCandidateWorkspace.tsx');
  assert.match(appShell, /case 'sales_management'/);
  assert.match(appShell, /<SalesManagementPage/);
  assert.match(appShell, /sidebar-item-label">Quản lý Sale/);
  assert.match(accessControl, /pageId === 'sales_management'.*user\.role === 'admin'/);
  assert.doesNotMatch(rawWorkspace, /\['management', 'Quản lý nhân viên'\]/);
});

test('employee detail answers status, conversion, activity and stalled-opportunity questions', () => {
  const page = read('src/features/sales-management/pages/SalesManagementPage.tsx');
  assert.match(page, /Trạng thái làm việc hôm nay/);
  assert.match(page, /Phễu chuyển đổi cá nhân/);
  assert.match(page, /Nhật ký hoạt động/);
  assert.match(page, /Cơ hội chưa chốt/);
  assert.match(page, /Dữ liệu tự tìm/);
  assert.match(page, /Chuyển Khách hàng/);
  assert.match(page, /onOpenRecord\('leads', lead\.id\)/);
});

test('performance model combines all three customer lifecycle modules', () => {
  const model = read('src/features/sales-management/model/salesManagement.ts');
  assert.match(model, /customer_data: 'Dữ liệu thô'/);
  assert.match(model, /leads: 'Tiềm năng'/);
  assert.match(model, /crm: 'Khách hàng'/);
  assert.match(model, /minutesSinceSeen <= 10/);
  assert.match(model, /getLeadBlockerLabel/);
  assert.match(model, /candidate_converted_to_lead/);
});
