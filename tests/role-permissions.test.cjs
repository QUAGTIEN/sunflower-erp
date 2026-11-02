const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

const roles = loader()('src/shared/types/user.ts');
const access = loader()('src/app/navigation/accessControl.ts');
const account = (role, allowedPages) => ({ uid: `${role}1`, displayName: role, role, active: true, allowedPages });
const COMMON = ['dashboard', 'chat', 'work_schedule', 'attendance'];

test('D-PQ1: five roles, each mapped to the pages of its own department', () => {
  assert.deepEqual([...roles.USER_ROLES], ['admin', 'sale', 'designer', 'producer', 'accountant']);
  assert.equal(roles.USER_ROLE_LABELS.producer, 'Kỹ thuật');
  assert.equal(roles.isUserRole('purchaser'), false);
  assert.deepEqual([...roles.ROLE_PAGES.admin], [...roles.ERP_PAGE_IDS]);
  assert.deepEqual(roles.ROLE_PAGES.sale, [...COMMON, 'customer_data', 'leads', 'crm', 'sales', 'commercial_map']);
  assert.deepEqual(roles.ROLE_PAGES.designer, [...COMMON, 'design']);
  assert.deepEqual(roles.ROLE_PAGES.producer, [...COMMON, 'production', 'inventory', 'delivery']);
  assert.deepEqual(roles.ROLE_PAGES.accountant, [
    ...COMMON,
    'production',
    'inventory',
    'purchase',
    'suppliers',
    'delivery',
    'accounting'
  ]);
});

test('a page opens only when it belongs to the role and is ticked; removed roles and locked accounts see nothing', () => {
  const accountant = account('accountant', ['purchase', 'accounting']);
  assert.equal(access.canAccessPage(accountant, 'purchase'), true);
  assert.equal(access.canAccessPage(accountant, 'suppliers'), true, 'suppliers follow the purchase tick');
  assert.equal(access.canAccessPage(accountant, 'inventory'), false, 'no page is implied by Kế toán');
  assert.equal(access.canAccessPage(account('accountant', ['sales', 'crm']), 'sales'), false);
  assert.equal(access.canAccessPage(account('designer', ['sales', 'design']), 'sales'), false);
  assert.equal(access.canAccessPage(account('producer', ['purchase']), 'purchase'), false);
  assert.equal(access.canAccessPage(account('sale', ['crm']), 'customer_data'), true);
  assert.equal(access.canAccessPage(account('sale', ['crm', 'sales_management']), 'sales_management'), false);
  assert.equal(access.canAccessPage(account('admin', []), 'recycle_bin'), true, 'Admin keeps every page');
  assert.equal(access.canAccessPage({ ...account('accountant', ['accounting']), active: false }, 'accounting'), false);
  for (const page of ['dashboard', 'attendance', 'purchase', 'inventory'])
    assert.equal(access.canAccessPage(account('purchaser', ['dashboard', 'purchase', 'inventory']), page), false);
  assert.deepEqual(access.getDefaultPagesForRole('purchaser'), []);
});

test('production splits drafting (Kế toán, Admin) from running (also Kỹ thuật); Kỹ thuật owns machines and dies', () => {
  const production = loader()('src/features/production/model/productionOrder.ts');
  const catalog = loader()('src/features/catalog/model/itemCatalog.ts');
  const warehouse = loader()('src/features/inventory/model/warehouse.ts');
  const technician = account('producer', ['production', 'inventory', 'delivery']);
  const accountant = account('accountant', ['production', 'inventory', 'purchase']);
  assert.deepEqual([production.canDraftProduction(accountant), production.canRunProduction(accountant)], [true, true]);
  assert.deepEqual([production.canDraftProduction(technician), production.canRunProduction(technician)], [false, true]);
  assert.equal(production.canManageProduction(technician), true);
  assert.equal(production.canManageProduction(accountant), false);
  assert.equal(catalog.canManageDieCatalog(technician), true);
  assert.equal(catalog.canManageItemCatalog(technician), false);
  assert.equal(catalog.canManageItemCatalog(accountant), true);
  assert.equal(warehouse.canReadWarehouse(technician), true, 'Kỹ thuật sees all stock');
  assert.equal(warehouse.canPostWarehouse(technician), false);
  assert.equal(warehouse.canPostWarehouse(accountant), true);
  for (const removed of [
    { ...accountant, role: 'purchaser' },
    { ...technician, role: 'sale' }
  ]) {
    assert.equal(production.canRunProduction(removed), false);
    assert.equal(catalog.canManageDieCatalog(removed), false);
    assert.equal(warehouse.canReadWarehouse(removed), false);
  }
});

test('the account API rejects removed roles and pages outside the chosen role', () => {
  const admin = loader({ './firebaseAdmin.js': { getFirebaseAdminServices() {} } })('server/adminUsers.ts');
  const body = {
    email: 'ketoan@example.test',
    password: 'mat-khau-tam',
    displayName: 'Kế toán',
    role: 'accountant',
    active: true,
    allowedPages: ['dashboard', 'purchase', 'accounting']
  };
  assert.deepEqual(admin.validateCreateUserBody(body).allowedPages, body.allowedPages);
  assert.throws(() => admin.validateCreateUserBody({ ...body, role: 'purchaser' }), /Vai trò không được hỗ trợ/);
  assert.throws(
    () => admin.validateCreateUserBody({ ...body, allowedPages: ['sales'] }),
    /không thuộc chức năng của vai trò/
  );
  assert.throws(
    () => admin.validateUpdateUserBody({ ...body, uid: 'u1', role: 'producer', allowedPages: ['purchase'] }),
    /không thuộc chức năng của vai trò/
  );
});

test('every API rejects a caller whose stored role was removed', async () => {
  class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  }
  const profile = {
    uid: 'old',
    email: 'old@example.test',
    role: 'purchaser',
    active: true,
    allowedPages: ['purchase']
  };
  const verify = loader({
    './adminUsers.js': { AdminApiError: ApiError },
    './firebaseAdmin.js': {
      getFirebaseAdminServices: () => ({
        auth: {
          verifyIdToken: async () => ({ uid: 'old' }),
          getUser: async () => ({ disabled: false, email: profile.email })
        },
        firestore: { collection: () => ({ doc: () => ({ get: async () => ({ data: () => profile }) }) }) }
      })
    }
  })('server/erpCaller.ts').requireActiveErpCaller;
  const request = new Request('https://example.test', { headers: { Authorization: 'Bearer test-only' } });
  await assert.rejects(verify(request), error => error.status === 403 && /không còn được hỗ trợ/.test(error.message));
});

test('Firestore rules mirror the role pages and lock out removed roles', () => {
  const rules = readSource('firestore.rules');
  const validRoles = rules.match(/function isValidRole\(role\) \{\s*return role in \[([^\]]*)\]/)[1];
  assert.deepEqual(
    validRoles.match(/'[a-z]+'/g),
    roles.USER_ROLES.map(role => `'${role}'`)
  );
  assert.match(rules, /function isActive\(\) \{[^}]*isValidRole\(userProfile\(\)\.role\)/);
  assert.match(rules, /pageId in userProfile\(\)\.allowedPages\s*&& pageId in rolePages\(userProfile\(\)\.role\)/);
  const rolePages = rules.match(/function rolePages\(role\) \{([\s\S]*?)\n    \}/)[1];
  for (const role of ['sale', 'designer', 'producer', 'accountant']) {
    const listed = rolePages.match(new RegExp(String.raw`role == '${role}'\s*\?\s*\[([^\]]*)\]`))[1];
    assert.deepEqual(
      listed.match(/'[a-z_]+'/g),
      roles.ROLE_PAGES[role].map(page => `'${page}'`),
      role
    );
  }
  assert.doesNotMatch(rules, /== 'purchaser'|'purchaser',/);
  assert.match(rules, /function canUsePurchase\(\) \{\s*return hasPage\('purchase'\);/);
});
