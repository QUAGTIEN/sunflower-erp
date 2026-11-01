const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

const menu = createLoader()('src/app/navigation/sidebarMenu.ts');
const entries = menu.SIDEBAR_MENU;
const items = entries.flatMap(entry => (entry.kind === 'group' ? entry.items : [entry]));
const byId = id => items.find(item => item.id === id);

test('the sidebar groups every existing page and moves Giao hàng under Sản xuất', () => {
  for (const page of [
    'dashboard',
    'chat',
    'work_schedule',
    'attendance',
    'customer_data',
    'leads',
    'crm',
    'sales',
    'sales_management',
    'commercial_map',
    'production',
    'design',
    'design_library',
    'inventory',
    'purchase',
    'suppliers',
    'delivery',
    'accounting',
    'users',
    'recycle_bin'
  ])
    assert.ok(
      items.some(item => item.page === page),
      page
    );
  const production = entries.find(entry => entry.id === 'production');
  assert.deepEqual(
    production.items.map(item => item.label),
    ['Lệnh sản xuất', 'Danh sách máy', 'Danh sách dao', 'Giao hàng']
  );
  assert.ok(!entries.some(entry => entry.kind === 'item' && entry.page === 'delivery'), 'no top-level Giao hàng');
  assert.equal(byId('design_library').accessPage, 'design', 'Kho mẫu keeps the design permission');
  assert.equal(byId('production_dies').page, 'inventory', 'Danh sách dao keeps the Kho vật tư page and permission');
});

test('the highlighted item follows the tab the page shows', () => {
  assert.equal(menu.findActiveMenuItem(entries, 'production', undefined).id, 'production_orders');
  assert.equal(menu.findActiveMenuItem(entries, 'production', 'machines').id, 'production_machines');
  assert.equal(menu.findActiveMenuItem(entries, 'inventory', 'dies').id, 'production_dies');
  assert.equal(menu.findActiveMenuItem(entries, 'inventory', 'vouchers').id, 'inventory');
  assert.equal(menu.findMenuGroupOf(entries, 'production_dies').id, 'production');
  assert.equal(menu.findMenuGroupOf(entries, 'dashboard'), undefined);
});

test('clicking an item asks for its tab, and Kho vật tư leaves Danh mục dao for the catalogue', () => {
  assert.equal(menu.menuItemTab(entries, byId('production_machines'), 'commands'), 'machines');
  assert.equal(menu.menuItemTab(entries, byId('inventory'), 'dies'), 'catalog');
  assert.equal(menu.menuItemTab(entries, byId('inventory'), 'vouchers'), undefined);
  assert.equal(menu.menuItemTab(entries, byId('delivery'), undefined), undefined);
});

test('the shell renders the menu from the groups and pages switch tabs on request', () => {
  const shell = readSource('src/app/AppShell.tsx');
  assert.match(shell, /SIDEBAR_MENU\.map\(entry =>/);
  assert.match(shell, /entry\.items\.filter\(isMenuItemAllowed\)/);
  assert.match(shell, /className="sidebar-group-items" role="group"/);
  assert.match(shell, /tabRequest=\{pageTabRequest\?\.page === 'inventory' \? pageTabRequest : undefined\}/);
  assert.match(shell, /tabRequest=\{pageTabRequest\?\.page === 'production' \? pageTabRequest : undefined\}/);
  for (const page of [
    'src/features/inventory/pages/InventoryPage.tsx',
    'src/features/production/pages/ProductionPage.tsx'
  ]) {
    const source = readSource(page);
    assert.match(source, /tabRequest\.requestId !== handledTabRequest/, page);
    assert.doesNotMatch(source, /onTabChange/, page);
  }
});

test('sidebar groups stay open with a label heading and list sub-items as plain text', () => {
  const shell = readSource('src/app/AppShell.tsx');
  assert.doesNotMatch(shell, /openMenuGroup|toggleMenuGroup|sidebar-group-toggle|sidebar-group-chevron/);
  assert.match(shell, /className=\{`sidebar-group-heading/);
  const css = readSource('src/index.css');
  assert.match(css, /\.sidebar-group-heading \{[^}]*text-transform: uppercase;/);
  assert.doesNotMatch(css, /\.sidebar-group-items\[hidden\]/);
  assert.match(shell, /\{!nested && <ItemIcon size=\{16\} \/>\}/);
  assert.match(shell, /renderMenuItem\(groupItem, true\)/);
});

test('each sidebar item shows its own data once: no Danh mục dao tab in Kho vật tư, no tabs in Sản xuất', () => {
  const inventory = readSource('src/features/inventory/pages/InventoryPage.tsx');
  assert.match(inventory, /const WAREHOUSE_TABS: InventoryTab\[\] = \['catalog', 'vouchers'\];/);
  assert.match(inventory, /\{WAREHOUSE_TABS\.map\(key =>/);
  assert.match(inventory, /tab === 'dies' \? \(\s*<PageContextHeader section="Sản xuất" current="Danh sách dao" \/>/);
  const production = readSource('src/features/production/pages/ProductionPage.tsx');
  assert.doesNotMatch(production, /role="tablist"/);
});
