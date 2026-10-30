const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

const onboarding = createLoader()('src/features/crm/model/customerOnboardingItem.ts');
const row = (patch = {}) => ({ ...onboarding.createCustomerOnboardingItem(0, '', 'percent', 0, 0), ...patch });

test('a lead becomes a customer without products or a first order when every row is left blank', () => {
  const split = onboarding.splitOnboardingItems([row()]);
  assert.deepEqual(split.products, []);
  assert.deepEqual(split.orderItems, []);
  assert.equal(split.incomplete, false);
});

test('rows with a code become product codes; only rows with a quantity enter the first order', () => {
  const productOnly = row({ productCode: 'TEM-01', productName: 'Tem thùng', quantity: 0 });
  const ordered = row({ productCode: 'TEM-02', productName: 'Tem decal', quantity: 500 });
  const split = onboarding.splitOnboardingItems([productOnly, ordered, row()]);
  assert.deepEqual(
    split.products.map(item => item.productCode),
    ['TEM-01', 'TEM-02']
  );
  assert.deepEqual(
    split.orderItems.map(item => item.productCode),
    ['TEM-02']
  );
  assert.equal(onboarding.splitOnboardingItems([row({ productCode: 'TEM-03' })]).incomplete, true);
});

test('a customer without orders shows a red "Chưa có đơn hàng" business result', () => {
  const table = readSource('src/features/crm/components/CustomerListTable.tsx');
  assert.match(table, /customerOrders\.length \?[\s\S]*?crm-business-result is-empty[\s\S]*?Chưa có đơn hàng/);
  const css = readSource('src/components/CustomerHistory.css');
  assert.match(
    css,
    /\.crm-business-result\.is-empty strong,\s*\.crm-business-result\.is-empty span \{\s*color: #b42318;/
  );
});
