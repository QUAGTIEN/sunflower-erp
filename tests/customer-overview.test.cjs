const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'customerOverview.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const model = {};
new Function('exports', outputText)(model);

const customer = (id, companyName = id) => ({ id, companyName });
const now = new Date('2026-09-21T00:00:00Z');
const daysAgo = days => new Date(now.getTime() - days * 86_400_000).toISOString();

test('general situation, inactive group and provinces use only visible customers', () => {
  const overview = model.buildCustomerOverview(
    [customer('a'), customer('b'), customer('c')],
    [
      { customerId: 'a', orderDate: daysAgo(10), netAmount: 200 },
      { customerId: 'a', orderDate: daysAgo(50), netAmount: 300 },
      { customerId: 'b', orderDate: daysAgo(200), totalAmount: 50 },
      { customerId: 'a', deleted: true, orderDate: daysAgo(5), netAmount: 999 },
      { customerId: 'hidden', orderDate: daysAgo(5), totalAmount: 999 }
    ],
    [
      { customerId: 'a', type: 'receivable', amount: 250, paidAmount: 100 },
      { customerId: 'b', type: 'receivable', amount: 50, paidAmount: 50 },
      { customerId: 'a', type: 'payable', amount: 999 },
      { customerId: 'hidden', type: 'receivable', amount: 999 }
    ],
    now,
    new Map([['a', 'Hà Nội'], ['b', 'Hà Nội']])
  );
  assert.equal(overview.customerCount, 3);
  assert.equal(overview.purchasedCount, 2);
  assert.equal(overview.neverOrderedCount, 1);
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.inactiveCount, 1);
  assert.deepEqual(overview.inactiveAgeCounts, [0, 1, 0]);
  assert.equal(overview.inactive[0].customer.id, 'b');
  assert.equal(overview.debtCount, 1);
  assert.equal(overview.highestValue[0].orderValue, 500);
  assert.equal(overview.mostOrders[0].orderCount, 2);
  assert.deepEqual(overview.provinces.map(province => [province.label, province.rows.length]), [['Hà Nội', 2], ['Chưa xác định', 1]]);
});

test('value and PO count rankings are independent', () => {
  const overview = model.buildCustomerOverview(
    [customer('high-value'), customer('many-orders')],
    [{ customerId: 'high-value', totalAmount: 1000 }, ...Array.from({ length: 4 }, () => ({ customerId: 'many-orders', totalAmount: 10 }))],
    [], now
  );
  assert.equal(overview.highestValue[0].customer.id, 'high-value');
  assert.equal(overview.mostOrders[0].customer.id, 'many-orders');
  assert.equal(overview.unknownLastOrderCount, 2);
});

test('inactive age boundaries start after 90 days', () => {
  const customers = [90, 91, 181, 366].map(days => customer(String(days)));
  const orders = [90, 91, 181, 366].map(days => ({ customerId: String(days), orderDate: daysAgo(days), totalAmount: 1 }));
  const overview = model.buildCustomerOverview(customers, orders, [], now);
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.inactiveCount, 3);
  assert.deepEqual(overview.inactiveAgeCounts, [1, 1, 1]);
});
