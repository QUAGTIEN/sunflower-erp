const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'customerOverview.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const model = {};
new Function('exports', outputText)(model);

const customers = [
  { id: 'a', companyName: 'A' },
  { id: 'b', companyName: 'B' },
  { id: 'c', companyName: 'C' }
];
const now = new Date('2026-09-21T00:00:00Z');

test('customer overview separates PO value, purchase frequency, inactivity and receivable balance', () => {
  const overview = model.buildCustomerOverview(customers, [
    { customerId: 'a', orderDate: '2026-09-01', netAmount: 200 },
    { customerId: 'a', orderDate: '2026-08-01', netAmount: 300 },
    { customerId: 'b', orderDate: '2026-01-01', totalAmount: 50 },
    { customerId: 'a', deleted: true, orderDate: '2026-09-02', netAmount: 999 }
  ], [
    { customerId: 'a', type: 'receivable', amount: 250, paidAmount: 100 },
    { customerId: 'b', type: 'receivable', amount: 50, paidAmount: 50 },
    { customerId: 'a', type: 'payable', amount: 999 },
    { customerId: 'a', type: 'receivable', deleted: true, amount: 999 }
  ], now);
  assert.equal(overview.customerCount, 3);
  assert.equal(overview.purchasedCount, 2);
  assert.equal(overview.neverOrderedCount, 1);
  assert.equal(overview.totalOrderValue, 550);
  assert.equal(overview.highestValue[0].customer.id, 'a');
  assert.equal(overview.lowestValue[0].customer.id, 'b');
  assert.equal(overview.frequent[0].ordersLast12Months, 2);
  assert.equal(overview.frequentCount, 0);
  assert.equal(overview.occasionalCount, 2);
  assert.equal(overview.noRecentOrdersCount, 1);
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.inactiveCount, 1);
  assert.equal(overview.inactive[0].customer.id, 'b');
  assert.equal(overview.debtCount, 1);
  assert.equal(overview.totalDebt, 150);
  assert.equal(overview.purchaseAgeBuckets.reduce((sum, count) => sum + count, 0), 2);
  assert.equal(overview.highestDebt[0].customer.id, 'a');
  assert.equal(overview.months.find(month => month.key === '2026-09').orderCount, 1);
  assert.equal(overview.months.find(month => month.key === '2026-08').customerCount, 1);
});

test('an order without a usable date is not falsely classified as inactive', () => {
  const overview = model.buildCustomerOverview(customers.slice(0, 1), [
    { customerId: 'a', orderDate: 'invalid', totalAmount: 25 }
  ], [], now);
  assert.equal(overview.purchasedCount, 1);
  assert.equal(overview.inactiveCount, 0);
  assert.equal(overview.rows[0].lastOrderAt, null);
  assert.equal(overview.unknownLastOrderCount, 1);
});

test('purchase age groups meet at 90 days and ignore inaccessible customers', () => {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const overview = model.buildCustomerOverview(customers.slice(0, 1), [
    { customerId: 'a', orderDate: ninetyDaysAgo, totalAmount: 100 },
    { customerId: 'b', orderDate: now.toISOString(), totalAmount: 900 }
  ], [{ customerId: 'b', type: 'receivable', amount: 800 }], now);
  assert.equal(overview.activeCount, 1);
  assert.equal(overview.inactiveCount, 0);
  assert.deepEqual(overview.purchaseAgeBuckets, [0, 0, 1, 0]);
  assert.equal(overview.totalOrderValue, 100);
  assert.equal(overview.totalDebt, 0);
  assert.equal(overview.months.reduce((sum, month) => sum + month.orderCount, 0), 1);
});
