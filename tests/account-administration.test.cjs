const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { createLoader: loader, readSource } = require('./helpers/loadTs.cjs');

const caller = { uid: 'admin1', email: 'admin@example.test' };

function adminBackend(profiles = { worker: { uid: 'worker', role: 'sale', active: true } }) {
  const calls = [];
  const writes = [];
  const firestore = {
    collection: () => ({
      doc: uid => ({
        get: async () => ({ exists: Boolean(profiles[uid]), data: () => profiles[uid] }),
        update: async fields => writes.push({ uid, fields })
      })
    })
  };
  const auth = {
    updateUser: async (uid, fields) => calls.push(['updateUser', uid, fields]),
    revokeRefreshTokens: async uid => calls.push(['revokeRefreshTokens', uid])
  };
  const server = loader({ './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ auth, firestore }) } })(
    'server/adminUsers.ts'
  );
  return { server, calls, writes };
}

test('an admin resets a password in Firebase Auth only, ends old sessions and never stores the password', async () => {
  const { server, calls, writes } = adminBackend();
  const input = server.validateResetPasswordBody({ uid: 'worker', password: '  mat-khau-moi ' });
  assert.deepEqual(input, { uid: 'worker', password: 'mat-khau-moi' });
  assert.deepEqual(await server.resetManagedUserPassword(caller, input), { uid: 'worker' });
  assert.deepEqual(calls, [
    ['updateUser', 'worker', { password: 'mat-khau-moi' }],
    ['revokeRefreshTokens', 'worker']
  ]);
  assert.equal(writes.length, 1);
  assert.deepEqual(Object.keys(writes[0].fields).sort(), ['updatedAt', 'updatedBy']);
  assert.doesNotMatch(JSON.stringify(writes), /mat-khau-moi/);
});

test('password resets reject short passwords, the admin themself and accounts without a profile', async () => {
  const { server, calls } = adminBackend();
  assert.throws(() => server.validateResetPasswordBody({ uid: 'worker', password: '1234567' }), /Mật khẩu mới/);
  assert.throws(() => server.validateResetPasswordBody({ password: 'mat-khau-moi' }), /UID/);
  await assert.rejects(
    server.resetManagedUserPassword(caller, { uid: caller.uid, password: 'mat-khau-moi' }),
    error => error.status === 400
  );
  await assert.rejects(
    server.resetManagedUserPassword(caller, { uid: 'ghost', password: 'mat-khau-moi' }),
    error => error.status === 404
  );
  assert.deepEqual(calls, []);
});

test('the existing account endpoint carries reset_password, so no new Vercel function is added', async () => {
  const received = [];
  const manage = loader({
    '../../server/adminUsers.js': {
      AdminApiError: Error,
      apiErrorResponse: error => Response.json({ error: error.message }, { status: 500 }),
      jsonResponse: payload => Response.json(payload),
      readJsonBody: async request => request.json(),
      requireAdmin: async () => caller,
      validateResetPasswordBody: body => ({ uid: body.uid, password: body.password }),
      resetManagedUserPassword: async (actor, input) => {
        received.push([actor, input]);
        return { uid: input.uid };
      }
    }
  })('api/users/manage.ts');
  const request = new Request('https://example.test', {
    method: 'POST',
    body: JSON.stringify({ action: 'reset_password', uid: 'worker', password: 'mat-khau-moi' })
  });
  const response = await manage.POST(request);
  assert.deepEqual(await response.json(), { uid: 'worker' });
  assert.deepEqual(received, [[caller, { uid: 'worker', password: 'mat-khau-moi' }]]);
});

test('account history keeps sign-ins and important actions; screen openings are no longer recorded', () => {
  const audit = loader({ '@/infrastructure/firebase/erpDataGateway': { dbService: {} } })(
    'src/services/auditService.ts'
  );
  assert.equal(audit.isImportantAuditEvent({ category: 'navigation' }), false, 'old screen openings stay hidden');
  for (const category of ['session', 'business', 'administration'])
    assert.equal(audit.isImportantAuditEvent({ category }), true);
  assert.equal(audit.auditService.recordNavigation, undefined);
  assert.doesNotMatch(readSource('src/app/AppShell.tsx'), /recordNavigation|page_opened/);
  assert.match(
    readSource('src/features/administration/components/AccountActivityDialog.tsx'),
    /filter\(isImportantAuditEvent\)/
  );
});

test('the reset dialog hides the password by default and waits for eight characters before saving', () => {
  const { ResetPasswordDialog } = loader()('src/features/administration/components/ResetPasswordDialog.tsx');
  const html = renderToStaticMarkup(
    React.createElement(ResetPasswordDialog, {
      account: { uid: 'worker', displayName: 'Nguyễn Văn A', email: 'a@example.test' },
      busy: false,
      onCancel() {},
      onSubmit() {}
    })
  );
  assert.match(html, /type="password"/);
  assert.match(html, /aria-label="Hiện mật khẩu"/);
  assert.match(html, /<button type="submit" class="btn btn-primary" disabled="">Lưu mật khẩu<\/button>/);
  assert.match(html, /a@example\.test/);
});

const COLUMN_LAYOUTS = {
  '@/context/TableColumnLayoutContext': {
    useTableColumnLayouts: () => ({ layouts: {}, canEditColumns: false, saveLayout() {}, migrateLayout() {} })
  }
};
const PAGE_STUBS = {
  ...COLUMN_LAYOUTS,
  '@/components/PageContextHeader': { PageContextHeader: () => null },
  '@/services/adminUserService': { adminUserService: {} },
  '@/services/auditService': { auditService: { recordSafely() {} }, isImportantAuditEvent: () => true },
  '@/infrastructure/firebase/erpDataGateway': { dbService: {} }
};
const treeNodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          treeNodes
        )
      ];
/** Calls the page once with inert hooks so the element tree (row menus, cells) can be inspected without a DOM. */
const renderTree = (file, name, props) => {
  const fakeReact = {
    ...React,
    useEffect() {},
    useMemo: callback => callback(),
    useCallback: callback => callback,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: initial => ({ current: initial })
  };
  return loader({ react: fakeReact, ...PAGE_STUBS })(file)[name](props);
};

const admin = { uid: 'admin1', displayName: 'Giám đốc', email: 'admin@example.test', role: 'admin', active: true };
const accounts = [
  admin,
  {
    uid: 'sale1',
    displayName: 'Đức Duy',
    email: 'duy@example.test',
    role: 'sale',
    active: true,
    createdAt: '2026-08-11T08:22:24.511Z',
    allowedPages: ['crm']
  },
  { uid: 'old1', displayName: 'Mua hàng cũ', email: 'old@example.test', role: 'purchaser', active: false }
];

test('account model groups pages like the sidebar, per role, and formats dates as dd/mm/yyyy', () => {
  const model = loader()('src/features/administration/model/accountAdministration.ts');
  const labels = role => model.pageGroupsForRole(role).map(group => group.label);
  assert.deepEqual(labels('admin'), [
    'Làm việc',
    'Kinh doanh',
    'Thiết kế',
    'Sản xuất',
    'Mua hàng',
    'Kế toán',
    'Hệ thống'
  ]);
  assert.deepEqual(labels('sale'), ['Làm việc', 'Kinh doanh']);
  assert.deepEqual(labels('producer'), ['Làm việc', 'Sản xuất', 'Mua hàng']);
  assert.deepEqual(labels('accountant'), ['Làm việc', 'Sản xuất', 'Mua hàng', 'Kế toán']);
  assert.deepEqual(
    model.pageGroupsForRole('sale')[1].pages.map(page => page.id),
    ['customer_data', 'leads', 'crm', 'sales', 'commercial_map'],
    'Quản lý Sale stays with Admin'
  );
  const tickable = model.ACCOUNT_PAGE_GROUPS.flatMap(group => group.pages.map(page => page.id)).sort();
  const pageIds = [...loader()('src/shared/types/user.ts').ERP_PAGE_IDS].sort();
  assert.deepEqual(tickable, pageIds, 'every page can be ticked');
  assert.equal(model.formatAccountDate('2026-08-11T08:22:24.511Z'), '11/08/2026');
  assert.equal(model.formatAccountDate(undefined), '—');
  assert.equal(model.accountRoleLabel('purchaser'), 'Vai trò cũ – cần xóa');
  const filtered = filters => model.filterAccounts(accounts, { keyword: '', roles: [], statuses: [], ...filters });
  assert.deepEqual(
    filtered({ keyword: 'DUY' }).map(account => account.uid),
    ['sale1']
  );
  assert.deepEqual(
    filtered({ roles: ['sale', 'admin'] }).map(account => account.uid),
    ['admin1', 'sale1']
  );
  assert.deepEqual(
    filtered({ statuses: ['locked'] }).map(account => account.uid),
    ['old1']
  );
});

test('the account list uses the standard table with one row menu and no inline buttons', () => {
  const { UserManagement } = loader(PAGE_STUBS)('src/features/administration/pages/UserManagementPage.tsx');
  const html = renderToStaticMarkup(
    React.createElement(UserManagement, { users: accounts, currentUser: admin, onRefresh() {} })
  );
  for (const header of ['Họ và tên', 'Email', 'Vai trò', 'Trạng thái', 'Ngày khởi tạo'])
    assert.ok(html.includes(`>${header}</th>`), header);
  assert.ok(html.includes('11/08/2026'));
  assert.doesNotMatch(html, /2026-08-11T/, 'no raw ISO timestamps');
  assert.ok(html.includes('Giám đốc (Bạn)'));
  assert.ok(html.includes('erp-status-text--danger">Đã khóa'));
  assert.ok(html.includes('account-legacy-role">Vai trò cũ – cần xóa'));
  assert.match(html, /type="search"/);
  assert.ok(html.includes('Thêm người dùng'));
  assert.ok(html.includes('erp-data-table-pagination'));
  assert.doesNotMatch(html, /Khóa Tài Khoản|Đặt Lại|Tất Cả Vai Trò/, 'old inline buttons and role select are gone');
  assert.equal((html.match(/row-action-menu__trigger/g) || []).length, 3);
});

test('row menus offer only what each account allows', () => {
  const tree = renderTree('src/features/administration/pages/UserManagementPage.tsx', 'UserManagement', {
    users: accounts,
    currentUser: admin,
    onRefresh() {}
  });
  const menus = treeNodes(tree).filter(node => node.type?.name === 'RowActionMenu');
  assert.deepEqual(
    menus.map(menu => menu.props.actions.map(action => action.label)),
    [
      ['Lịch sử', 'Chỉnh sửa'],
      ['Lịch sử', 'Chỉnh sửa', 'Đặt lại mật khẩu', 'Khóa tài khoản', 'Xóa'],
      ['Lịch sử', 'Mở khóa tài khoản', 'Xóa']
    ]
  );
  assert.equal(menus[1].props.actions.at(-1).danger, true);
});

test('the account form ticks only pages of the chosen role and keeps the login email fixed when editing', () => {
  const { AccountFormDialog } = loader(PAGE_STUBS)('src/features/administration/components/AccountFormDialog.tsx');
  const render = props =>
    renderToStaticMarkup(
      React.createElement(AccountFormDialog, { isSelf: false, busy: false, onCancel() {}, onSubmit() {}, ...props })
    );
  const values = {
    displayName: 'Kế toán A',
    email: 'ketoan@example.test',
    password: '',
    role: 'accountant',
    active: true,
    allowedPages: ['dashboard', 'accounting']
  };
  const created = render({ mode: 'create', initialValues: values });
  assert.ok(created.includes('Mật khẩu tạm *'));
  assert.match(created, /type="password"/);
  for (const group of ['Làm việc', 'Sản xuất', 'Mua hàng', 'Kế toán']) assert.ok(created.includes(`>${group}</span>`));
  for (const group of ['Kinh doanh', 'Thiết kế', 'Hệ thống'])
    assert.ok(!created.includes(`>${group}</span>`), `${group} is not offered to Kế toán`);
  assert.equal((created.match(/type="checkbox" checked=""/g) || []).length, 2);
  const edited = render({ mode: 'edit', initialValues: values, isSelf: true });
  assert.ok(!edited.includes('Mật khẩu tạm'));
  assert.match(edited, /<input id="account-email"[^>]*readOnly=""/);
  assert.match(edited, /<select id="account-role"[^>]*disabled=""/);
  const adminForm = render({ mode: 'create', initialValues: { ...values, role: 'admin' } });
  assert.ok(adminForm.includes('Admin luôn truy cập toàn bộ các trang.'));
  const checkboxes = adminForm.match(/<input type="checkbox"[^>]*>/g);
  assert.ok(checkboxes.every(box => box.includes('checked=""') && box.includes('disabled=""')));
});
