const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');

const model = loader()('src/features/accounting/model/accountingLedger.ts');
const ledgerView = loader()('src/features/accounting/model/ledgerView.ts');
const admin = { uid: 'admin', role: 'admin', displayName: 'Admin', active: true, allowedPages: [] };
const accountant = { ...admin, uid: 'acc1', role: 'accountant', allowedPages: ['accounting'] };
const today = loader()('src/features/inventory/model/warehouse.ts').warehouseDate();
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const itemId = 'itm-' + 'a'.repeat(64);
function backend(extra = {}) {
  const line = {
    sourceLine: 'p1',
    poItemId: 'p1',
    catalogItemId: itemId,
    code: 'TP1',
    name: 'Tem thật',
    unit: 'cái',
    quantity: 100,
    baseQuantity: 100,
    factor: 1
  };
  const store = new Map(
    Object.entries(
      structuredClone({
        'customers/c1': { companyName: 'Khách A' },
        'suppliers/s1': { supplierName: 'NCC A' },
        'pos/po1': {
          poCode: 'PO1',
          customerId: 'c1',
          status: 'waiting_invoice',
          goodsFlowVersion: 1,
          goodsDeliveryClosed: true,
          items: [{ itemId: 'p1', quantity: 100, unit: 'cái', unitPrice: 10 }]
        },
        'purchase_orders/buy1': {
          supplierId: 's1',
          linkedPoId: 'po1',
          purCode: 'PUR1',
          items: [{ poItemId: 'p1', quantity: 100, unit: 'cái', unitPrice: 6 }]
        },
        'warehouse_vouchers/pod1': {
          id: 'pod1',
          code: 'TP-POD1',
          warehouseId: 'finished_main',
          kind: 'delivery',
          purchaseId: 'buy1',
          poId: 'po1',
          dispatchId: 'dispatch1',
          lines: [line]
        },
        'warehouse_vouchers/receive1': {
          id: 'receive1',
          code: 'KHO1',
          warehouseId: 'raw_main',
          kind: 'purchase_receipt',
          sourceType: 'purchase',
          sourceId: 'buy1',
          lines: [{ ...line, sourceLine: 'line-0', quantity: 10 }]
        },
        'warehouse_vouchers/return1': {
          id: 'return1',
          code: 'TP-RETURN',
          warehouseId: 'finished_main',
          kind: 'customer_return',
          poId: 'po1',
          dispatchId: 'dispatch1',
          returnToSupplier: true,
          lines: [{ ...line, quantity: 20 }]
        },
        ['item_catalog/' + itemId]: { active: true, code: 'TP1', name: 'Tem nội bộ', baseUnit: 'cái' },
        'warehouse_balances/fg': { quantity: 99 },
        'inventory/old': { qtyInStock: 100 },
        ...extra
      })
    )
  );
  const versions = new Map();
  let serial = 0,
    retries = 0;
  const collection = name => ({
    name,
    doc: value => {
      const id = value || 'auto' + ++serial;
      return { path: name + '/' + id, id };
    },
    where: (field, operator, value) => ({ name, field, operator, value })
  });
  const firestore = {
    collection,
    runTransaction: async callback => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const reads = new Map(),
          writes = [];
        const snapshot = ref => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const data = structuredClone(store.get(ref.path));
          return { ...ref, exists: !!data, data: () => structuredClone(data) };
        };
        const result = await callback({
          get: async ref => {
            assert.equal(writes.length, 0, 'All reads must precede every write');
            if (ref.path) return snapshot(ref);
            const docs = [...store.keys()]
              .filter(k => k.startsWith(ref.name + '/'))
              .map(path => snapshot({ path, id: path.split('/')[1] }));
            return { docs: docs.filter(d => !ref.field || d.data()[ref.field] === ref.value) };
          },
          set: (ref, data) => writes.push({ ref, data: structuredClone(data), replace: true }),
          update: (ref, data) => writes.push({ ref, data: structuredClone(data) })
        });
        if ([...reads].some(([key, v]) => v !== (versions.get(key) || 0))) {
          retries++;
          continue;
        }
        for (const { ref, data, replace } of writes) {
          store.set(ref.path, replace ? data : { ...store.get(ref.path), ...data });
          versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
        }
        return result;
      }
      throw Error('Retry limit');
    }
  };
  const stubs = {
      './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
      './adminUsers.js': { AdminApiError: ApiError }
    },
    load = loader(stubs);
  const server = load('server/accountingLedger.ts');
  const manage = (body, actor = admin) => server.manageAccountingLedger(actor, body);
  const base = extra => ({
    action: 'post',
    requestId: 'request' + ++serial,
    postingDate: today,
    expectedRevision: store.get('finance_control/main')?.revision || 0,
    side: 'ar',
    partnerId: 'c1',
    reference: 'REF' + serial,
    note: 'Chứng từ đã đối chiếu',
    ...extra
  });
  const post = (kind, extra = {}, actor = admin) => manage(base({ kind, ...extra }), actor);
  const charge = (quantity = 100, extra = {}, actor = admin) =>
    post(
      'charge',
      {
        dueDate: '2026-12-01',
        lines: [{ sourceVoucherId: 'pod1', sourceLine: 'p1', quantity, unitPrice: 10, discount: 0, taxRate: 10 }],
        ...extra
      },
      actor
    );
  const payment = (amount = 1100, extra = {}) => post('payment', { amount, method: 'bank_transfer', ...extra });
  const allocate = (fund, doc, amount, extra = {}) =>
    post('allocation', { fundId: fund.id, allocations: [{ documentId: doc.id, lineId: 'line-0', amount }], ...extra });
  const adjust = (doc, amount, extra = {}) =>
    post('adjustment', {
      direction: 'decrease',
      adjustments: [{ documentId: doc.id, lineId: 'line-0', amount }],
      ...extra
    });
  const reverse = (entryId, actor = admin) => manage(base({ action: 'reverse', entryId }), actor);
  // The page builds Sổ công nợ from what Firestore returns; the test reads the same collections from the store.
  const loadData = async () => {
    const docs = collection =>
      [...store.keys()]
        .filter(key => key.startsWith(`${collection}/`))
        .map(key => ({ ...store.get(key), id: key.split('/')[1] }));
    return ledgerView.buildLedgerView({
      revision: Number(store.get('finance_control/main')?.revision || 0),
      documents: docs('finance_documents'),
      funds: docs('finance_funds'),
      entries: docs('finance_entries'),
      sourceStates: docs('finance_source_state'),
      periods: docs('finance_periods'),
      invoices: docs('invoices'),
      vouchers: docs('warehouse_vouchers'),
      pos: docs('pos'),
      purchases: docs('purchase_orders'),
      customers: docs('customers'),
      suppliers: docs('suppliers'),
      items: docs('item_catalog')
    });
  };
  return {
    store,
    firestore,
    manage,
    base,
    post,
    charge,
    payment,
    allocate,
    adjust,
    reverse,
    loadData,
    retries: () => retries,
    load
  };
}
test('VND line arithmetic uses decimal scaling and rounds net and tax to dong', () => {
  assert.deepEqual(model.lineAmounts(3, 0.1, 0, 10), { net: 0, tax: 0, gross: 0 });
  assert.deepEqual(model.lineAmounts(1.5, 1000.5, 1, 8), { net: 1500, tax: 120, gross: 1620 });
  for (const values of [
    [0, 10, 0, 0],
    [1, 10, 11, 0],
    [1, 10, 0, 101],
    [1, 10, 0, 0.001],
    [1, NaN, 0, 0]
  ])
    assert.throws(() => model.lineAmounts(...values));
  for (const n of [-1, 1.1, Infinity, '10', 1e12 + 1]) assert.throws(() => model.money(n));
});
test('accountant confirms actual sources, server snapshots and prices; no physical stock write', async () => {
  const b = backend(),
    r = await b.charge(
      40,
      {
        lines: [
          {
            sourceVoucherId: 'pod1',
            sourceLine: 'p1',
            quantity: 40,
            unitPrice: 10,
            discount: 0,
            taxRate: 10,
            code: 'FORGED',
            partnerId: 's1',
            gross: 1
          }
        ]
      },
      accountant
    );
  const doc = b.store.get('finance_documents/' + r.id);
  assert.equal(doc.lines[0].code, 'TP1');
  assert.equal(doc.lines[0].gross, 440);
  assert.equal(doc.partnerId, 'c1');
  assert.equal(b.store.get('finance_source_state/ar_pod1').lines.p1.used, 40);
  await b.charge(60);
  await assert.rejects(b.charge(1), /vượt phiếu/);
  assert.deepEqual(b.store.get('warehouse_balances/fg'), { quantity: 99 });
  assert.deepEqual(b.store.get('inventory/old'), { qtyInStock: 100 });
});
test('AR and AP share direct delivery evidence but keep separate quantity caps and partners', async () => {
  const b = backend();
  await b.charge();
  await b.charge(100, { side: 'ap', partnerId: 's1' });
  assert.equal(b.store.get('finance_source_state/ar_pod1').lines.p1.used, 100);
  assert.equal(b.store.get('finance_source_state/ap_pod1').lines.p1.used, 100);
  await assert.rejects(b.charge(1, { side: 'ap', partnerId: 'c1' }), /Đối tác|đối tác/);
  const raw = await b.charge(10, {
    side: 'ap',
    partnerId: 's1',
    lines: [{ sourceVoucherId: 'receive1', sourceLine: 'line-0', quantity: 10, unitPrice: 6, discount: 0, taxRate: 0 }]
  });
  assert.equal(b.store.get('finance_documents/' + raw.id).lines[0].gross, 60);
});
test('only actual receipts/POD, existing source lines and unreversed sources may be charged', async () => {
  const b = backend();
  for (const kind of ['dispatch', 'supplier_dispatch', 'production_receipt', 'reversal']) {
    b.store.get('warehouse_vouchers/pod1').kind = kind;
    await assert.rejects(b.charge(), /phiếu giao/);
  }
  b.store.get('warehouse_vouchers/pod1').kind = 'delivery';
  b.store.get('warehouse_vouchers/pod1').reversedBy = 'x';
  await assert.rejects(b.charge(), /phiếu giao/);
  delete b.store.get('warehouse_vouchers/pod1').reversedBy;
  await assert.rejects(
    b.charge(1, { lines: [{ sourceVoucherId: 'pod1', sourceLine: 'unknown', quantity: 1 }] }),
    /Dòng phiếu/
  );
});
test('payment stays unallocated until explicit distribution; one fund can pay multiple documents', async () => {
  const b = backend(),
    d1 = await b.charge(40),
    d2 = await b.charge(60),
    p = await b.payment(1200);
  assert.equal(b.store.get('finance_documents/' + d1.id).lines[0].settled, 0);
  assert.equal(model.fundAvailable(b.store.get('finance_funds/' + p.id)), 1200);
  await b.post('allocation', {
    fundId: p.id,
    allocations: [
      { documentId: d1.id, lineId: 'line-0', amount: 440 },
      { documentId: d2.id, lineId: 'line-0', amount: 660 }
    ]
  });
  assert.equal(model.fundAvailable(b.store.get('finance_funds/' + p.id)), 100);
  assert.equal(b.store.get('pos/po1').status, 'waiting_discount');
  assert.equal(b.store.get('invoices/acc_' + d1.id).paidAmount, 440);
  await assert.rejects(b.allocate(p, d2, 1), /Vượt số còn nợ/);
});
test('multiple payments partially settle one SKU and never overdraw money or cross partners', async () => {
  const b = backend(),
    d = await b.charge(),
    p1 = await b.payment(400),
    p2 = await b.payment(700);
  await b.allocate(p1, d, 400);
  await b.allocate(p2, d, 500);
  assert.equal(model.lineDue(b.store.get('finance_documents/' + d.id).lines[0]), 200);
  assert.equal(b.store.get('pos/po1').status, 'waiting_receivable');
  await assert.rejects(b.allocate(p1, d, 1), /Vượt tiền/);
  await assert.rejects(b.allocate(p2, d, 1, { side: 'ap', partnerId: 's1' }), /đúng đối tác/);
});
test('a paid partial invoice never marks an unbilled delivery or undelivered PO paid/closed', async () => {
  const b = backend(),
    d = await b.charge(50),
    p = await b.payment(550);
  await b.allocate(p, d, 550);
  assert.equal(b.store.get('pos/po1').status, 'waiting_invoice');
  assert.equal(b.store.get('pos/po1').accountingProgress, 'partial');
  b.store.get('pos/po1').goodsDeliveryClosed = false;
  b.store.get('pos/po1').status = 'waiting_production';
  const rest = await b.charge(50);
  const p2 = await b.payment(550);
  await b.allocate(p2, rest, 550);
  assert.equal(b.store.get('pos/po1').status, 'waiting_production');
});
test('customer return credit requires unallocation, caps actual returned/billed quantity and supports refund', async () => {
  const b = backend(),
    d = await b.charge(),
    p = await b.payment();
  const a = await b.allocate(p, d, 1100);
  const credit = () =>
    b.adjust(d, 220, {
      adjustments: [
        { documentId: d.id, lineId: 'line-0', amount: 220, returnVoucherId: 'return1', returnLine: 'p1', quantity: 20 }
      ]
    });
  await assert.rejects(credit(), /đảo phân bổ/);
  await b.reverse(a.id);
  const c = await credit();
  assert.equal(b.store.get('finance_source_state/ar_return1').lines.p1.used, 20);
  await b.allocate(p, d, 880);
  const refund = await b.post('refund', { fundId: p.id, amount: 220 });
  assert.equal(b.store.get('finance_funds/' + p.id).refunded, 220);
  assert.equal(b.store.get('finance_entries/' + refund.id).cashDelta, -220);
  await b.reverse(c.id);
  assert.equal(model.lineDue(b.store.get('finance_documents/' + d.id).lines[0]), 220);
  assert.equal(b.store.get('finance_source_state/ar_return1').lines.p1.used, 0);
});

test('return credit cannot exceed the billed quantity of a partial document or use another dispatch', async () => {
  const b = backend(),
    d = await b.charge(10);
  await assert.rejects(
    b.adjust(d, 1, {
      adjustments: [
        { documentId: d.id, lineId: 'line-0', amount: 1, returnVoucherId: 'return1', returnLine: 'p1', quantity: 11 }
      ]
    }),
    /Lượng trả vượt/
  );
  b.store.get('warehouse_vouchers/return1').dispatchId = 'other';
  await assert.rejects(
    b.adjust(d, 1, {
      adjustments: [
        { documentId: d.id, lineId: 'line-0', amount: 1, returnVoucherId: 'return1', returnLine: 'p1', quantity: 1 }
      ]
    }),
    /không khớp/
  );
});
test('supplier credit only links goods physically returned to supplier, not company inventory', async () => {
  const b = backend(),
    d = await b.charge(100, { side: 'ap', partnerId: 's1' });
  b.store.get('warehouse_vouchers/return1').returnToSupplier = false;
  const adjust = () =>
    b.adjust(d, 100, {
      side: 'ap',
      partnerId: 's1',
      adjustments: [
        { documentId: d.id, lineId: 'line-0', amount: 100, returnVoucherId: 'return1', returnLine: 'p1', quantity: 10 }
      ]
    });
  await assert.rejects(adjust(), /trả NCC/);
  b.store.get('warehouse_vouchers/return1').returnToSupplier = true;
  await adjust();
  assert.equal(b.store.get('finance_source_state/ap_return1').lines.p1.used, 10);
});
test('adjustments preserve source snapshots and require dependent settlements reversed before reducing debt', async () => {
  const b = backend(),
    d = await b.charge(),
    increase = await b.adjust(d, 100, { direction: 'increase' }),
    p = await b.payment(1200),
    a = await b.allocate(p, d, 1200);
  await assert.rejects(b.reverse(increase.id), /đảo phân bổ/);
  await b.reverse(a.id);
  await b.reverse(increase.id);
  const doc = b.store.get('finance_documents/' + d.id);
  assert.equal(doc.lines[0].gross, 1100);
  assert.equal(doc.lines[0].adjustment, 0);
});
test('reversal is append-only, releases source after dependency reversals and leaves zero-value projection', async () => {
  const b = backend(),
    d = await b.charge(),
    p = await b.payment(),
    a = await b.allocate(p, d, 1100);
  await assert.rejects(b.reverse(d.id), /Cần đảo phân bổ/);
  await assert.rejects(b.reverse(p.id), /Cần đảo phân bổ/);
  await b.reverse(a.id);
  await b.reverse(p.id);
  const reversed = await b.reverse(d.id);
  assert.equal(b.store.get('finance_documents/' + d.id).voided, true);
  assert.equal(b.store.get('finance_source_state/ar_pod1').lines.p1.used, 0);
  assert.equal(b.store.get('finance_entries/' + d.id).reversedBy, reversed.id);
  assert.equal(b.store.get('invoices/acc_' + d.id).amount, 0);
  await assert.rejects(b.reverse(d.id), /đã đảo/);
  await b.charge();
});
test('cash direction distinguishes receipt, vendor payment and refunds; excess refund denied', async () => {
  const b = backend(),
    p = await b.payment(100),
    a = await b.payment(100, { side: 'ap', partnerId: 's1' });
  assert.equal(b.store.get('finance_entries/' + p.id).cashDelta, 100);
  assert.equal(b.store.get('finance_entries/' + a.id).cashDelta, -100);
  const r = await b.post('refund', { fundId: a.id, side: 'ap', partnerId: 's1', amount: 60 });
  assert.equal(b.store.get('finance_entries/' + r.id).cashDelta, 60);
  await assert.rejects(b.post('refund', { fundId: a.id, side: 'ap', partnerId: 's1', amount: 41 }), /Vượt tiền/);
  await b.reverse(r.id);
  assert.equal(model.fundAvailable(b.store.get('finance_funds/' + a.id)), 100);
});
test('opening debt and advance are explicit and do not synthesize historical cash or stock', async () => {
  const b = backend(),
    d = await b.post('opening', {
      openingAsOf: '2026-01-01',
      dueDate: '2026-02-01',
      lines: [{ lineId: 'old1', amount: 500, catalogItemId: itemId, poId: 'po1' }]
    }),
    p = await b.post('opening_advance', { openingAsOf: '2026-01-01', amount: 200, method: 'bank_transfer' });
  assert.equal(b.store.get('finance_entries/' + p.id).cashDelta, 0);
  assert.equal(b.store.get('finance_documents/' + d.id).lines[0].quantity, 0);
  await b.allocate(p, d, 200);
  assert.equal(model.lineDue(b.store.get('finance_documents/' + d.id).lines[0]), 300);
  assert.equal(b.store.get('warehouse_balances/fg').quantity, 99);
  await assert.rejects(
    b.post('opening_advance', { openingAsOf: '2099-01-01', amount: 1, method: 'cash' }),
    /tương lai/
  );
});
test('duplicate references, repeated requests and concurrent charges cannot double-book', async () => {
  const b = backend(),
    request = b.base({
      kind: 'charge',
      reference: 'INV-X',
      dueDate: today,
      lines: [{ sourceVoucherId: 'pod1', sourceLine: 'p1', quantity: 100, unitPrice: 10, discount: 0, taxRate: 0 }]
    });
  const results = await Promise.all([b.manage(request), b.manage(request)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(b.store.get('finance_source_state/ar_pod1').lines.p1.used, 100);
  assert.ok(b.retries() > 0);
  await assert.rejects(b.manage({ ...request, note: 'Khác' }), /Mã yêu cầu/);
  await b.reverse(results[0].id);
  await assert.rejects(b.charge(100, { reference: 'inv-x' }), /Tham chiếu/);
  const c = backend(),
    one = c.base({ kind: 'payment', amount: 10, method: 'cash' }),
    two = c.base({ kind: 'payment', amount: 10, method: 'cash' });
  const concurrent = await Promise.allSettled([c.manage(one), c.manage(two)]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal([...c.store.keys()].filter(k => k.startsWith('finance_funds/')).length, 1);
});
test('period locks reject writes and reversals, preserve acknowledged retry, and are Admin-only', async () => {
  const b = backend(),
    request = b.base({ kind: 'payment', amount: 100, method: 'cash' }),
    p = await b.manage(request);
  const period = (locked, actor = admin) =>
    b.manage(b.base({ action: 'period', month: today.slice(0, 7), locked }), actor);
  await assert.rejects(period(true, accountant), e => e.status === 403);
  await period(true);
  await assert.rejects(b.payment(), /Kỳ hiện tại/);
  await assert.rejects(b.reverse(p.id), /Kỳ hiện tại/);
  assert.equal((await b.manage(request)).id, p.id);
  await period(false);
  await b.reverse(p.id);
  assert.equal(b.store.get('finance_funds/' + p.id).voided, true);
});
test('permissions, dates, amounts and forged action are checked on the server', async () => {
  const b = backend();
  for (const actor of [
    { ...admin, active: false },
    { ...accountant, allowedPages: [] },
    { ...admin, role: 'sale', allowedPages: ['accounting'] },
    { ...admin, role: 'purchaser', allowedPages: ['accounting'] }
  ])
    await assert.rejects(b.post('payment', { amount: 1, method: 'bank_transfer' }, actor), e => e.status === 403);
  const p = await b.payment();
  await assert.rejects(b.reverse(p.id, accountant), e => e.status === 403);
  for (const amount of [0, -1, 0.1, '5', Infinity]) await assert.rejects(b.payment(amount));
  await assert.rejects(b.payment(1, { postingDate: '2020-01-01' }), /hiện tại/);
  await assert.rejects(b.charge(1, { dueDate: '2026-02-30' }), /Ngày/);
  await assert.rejects(b.post('toString'), /Loại/);
});
test('legacy invoices are read-only references and block double-invoicing the same source order', async () => {
  const legacy = { invoiceCode: 'OLD1', poId: 'po1', type: 'receivable', amount: 500, paidAmount: 100 };
  const b = backend({ 'invoices/old': legacy });
  await assert.rejects(b.charge(), /luồng cũ/);
  const data = await b.loadData();
  assert.deepEqual(data.legacy[0], { ...legacy, id: 'old' });
  assert.ok(!data.sources.some(s => s.side === 'ar'));
  assert.deepEqual(b.store.get('invoices/old'), legacy);
});
test('quantity reversal is blocked until every AR/AP and return-credit dependency is reversed', async () => {
  const b = backend(),
    d = await b.charge(),
    guard = b.load('server/financeSourceGuard.ts').assertPhysicalSourceUnbilled;
  const check = id => b.firestore.runTransaction(tx => guard(tx, b.firestore, id));
  await assert.rejects(check('pod1'), /Đảo chứng từ kế toán/);
  const a = await b.charge(100, { side: 'ap', partnerId: 's1' });
  await b.reverse(d.id);
  await assert.rejects(check('pod1'), /Đảo chứng từ kế toán/);
  await b.reverse(a.id);
  await check('pod1');
  const debt = await b.charge(),
    credit = await b.adjust(debt, 20, {
      adjustments: [
        { documentId: debt.id, lineId: 'line-0', amount: 20, returnVoucherId: 'return1', returnLine: 'p1', quantity: 2 }
      ]
    });
  await assert.rejects(check('return1'), /Đảo chứng từ/);
  await b.reverse(credit.id);
  await check('return1');
});
test('load supplies canonical source identities and only financial projections include derived paid values', async () => {
  const b = backend();
  const d = await b.charge(20);
  const data = await b.loadData();
  assert.ok(data.sources.some(s => s.side === 'ap' && s.id === 'receive1'));
  assert.equal(data.sources.find(s => s.side === 'ar').lines[0].suggestedPrice, 10);
  assert.equal(data.documents[0].id, d.id);
  assert.equal(data.revision, 1);
  assert.equal(data.legacy.length, 0);
  const projection = b.store.get('invoices/acc_' + d.id);
  assert.equal(projection.ledgerVersion, 1);
  assert.equal(projection.amount, 220);
  assert.equal(projection.customerId, 'c1');
});

const treeNodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          treeNodes
        )
      ];
function harness(file, name, props, initial = {}, stubs = {}) {
  const React = require('react'),
    ast = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    ),
    names = [];
  function visit(n) {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isArrayBindingPattern(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.expression.getText(ast) === 'useState'
    )
      names.push(n.name.elements[0].getText(ast));
    ts.forEachChild(n, visit);
  }
  visit(ast);
  const state = new Map(Object.entries(initial)),
    refs = [];
  let cursor = 0,
    refCursor = 0;
  const react = {
    ...React,
    useEffect() {},
    useRef(value) {
      const i = refCursor++;
      return (refs[i] ||= { current: value });
    },
    useState(value) {
      const key = names[cursor++];
      if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value);
      return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
    }
  };
  const component = loader({ react, ...stubs })(file)[name];
  return {
    state,
    refs,
    render() {
      cursor = 0;
      refCursor = 0;
      return component(props);
    }
  };
}

test('actual charge form sends selected quantities/price/tax with current revision and blocks source excess', () => {
  const sent = [],
    data = {
      revision: 7,
      sources: [
        {
          id: 'pod1',
          code: 'POD1',
          side: 'ar',
          partnerId: 'c1',
          partnerName: 'Khách',
          lines: [
            {
              id: 'p1',
              code: 'TP1',
              name: 'Tem',
              unit: 'cái',
              quantity: 100,
              suggestedPrice: 10,
              catalogItemId: itemId
            }
          ]
        }
      ],
      sourceStates: [],
      documents: [],
      funds: [],
      partners: [],
      openingOrders: [],
      items: [],
      returns: []
    };
  const ui = harness(
    'src/features/accounting/components/LedgerDialog.tsx',
    'LedgerDialog',
    {
      actor: admin,
      ledger: data,
      options: { kind: 'charge', side: 'ar', partnerId: 'c1' },
      onClose() {},
      onSaved() {}
    },
    {
      entries: { 'pod1:p1': { quantity: '20', unitPrice: '10', discount: '0', taxRate: '8' } },
      reference: 'INV1',
      note: 'Thực tế',
      confirmed: true
    },
    {
      './useLedgerMutation': {
        useLedgerMutation: () => ({
          busy: false,
          uncertain: false,
          error: '',
          pending: { current: false },
          execute: body => sent.push(body)
        })
      }
    }
  );
  let tree = ui.render();
  treeNodes(tree)
    .find(n => n.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  assert.equal(sent[0].expectedRevision, 7);
  assert.equal(sent[0].lines[0].quantity, 20);
  assert.equal(sent[0].lines[0].taxRate, 8);
  assert.equal(sent[0].partnerId, 'c1');
  ui.state.get('entries')['pod1:p1'].quantity = '101';
  tree = ui.render();
  assert.equal(treeNodes(tree).find(n => n.type === 'button' && n.props.children === 'Ghi sổ').props.disabled, true);
  treeNodes(tree)
    .find(n => n.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  assert.equal(sent.length, 1);
});
test('actual allocation form prevents excess fund use and submits individual document lines', () => {
  const sent = [],
    doc = {
      id: 'doc1',
      reference: 'INV1',
      side: 'ar',
      partnerId: 'c1',
      voided: false,
      lines: [{ id: 'line-0', gross: 100, adjustment: 0, settled: 0, code: 'TP1', sourceLine: 'p1' }]
    },
    fund = {
      id: 'pay1',
      reference: 'PAY1',
      side: 'ar',
      partnerId: 'c1',
      amount: 80,
      used: 0,
      refunded: 0,
      voided: false
    };
  const data = {
    revision: 4,
    documents: [doc],
    funds: [fund],
    partners: [],
    sources: [],
    sourceStates: [],
    returns: [],
    openingOrders: []
  };
  const ui = harness(
    'src/features/accounting/components/LedgerDialog.tsx',
    'LedgerDialog',
    {
      actor: accountant,
      ledger: data,
      options: { kind: 'allocation', side: 'ar', partnerId: 'c1', fundId: 'pay1' },
      onClose() {},
      onSaved() {}
    },
    {
      allocations: { 'doc1:line-0': '81' },
      reference: 'ALLOC1',
      note: 'Phân bổ',
      confirmed: true
    },
    {
      './useLedgerMutation': {
        useLedgerMutation: () => ({
          busy: false,
          uncertain: false,
          error: '',
          pending: { current: false },
          execute: body => sent.push(body)
        })
      }
    }
  );
  let tree = ui.render();
  assert.equal(treeNodes(tree).find(n => n.type === 'button' && n.props.children === 'Ghi sổ').props.disabled, true);
  ui.state.set('allocations', { 'doc1:line-0': '80' });
  tree = ui.render();
  treeNodes(tree)
    .find(n => n.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  assert.deepEqual(sent[0].allocations, [{ documentId: 'doc1', lineId: 'line-0', amount: 80 }]);
});
test('workspace keeps legacy rows read-only and only Admin sees reversal menu', () => {
  const entry = {
    id: 'e1',
    code: 'KT1',
    kind: 'payment',
    reference: 'PAY1',
    partnerName: 'Khách',
    createdAt: '2026-10-23',
    amount: 100,
    cashDelta: 100,
    postingDate: today,
    allocations: [],
    adjustments: []
  };
  const data = {
    revision: 1,
    documents: [],
    funds: [],
    entries: [entry],
    sources: [],
    sourceStates: [],
    partners: [],
    returns: [],
    periods: [],
    legacy: [{ id: 'old', invoiceCode: 'OLD1', amount: 500, paidAmount: 100 }],
    items: [],
    openingOrders: []
  };
  const stubs = {
    './LedgerDialog': { LedgerDialog: function LedgerDialog() {} },
    './useLedgerLiveData': { useLedgerLiveData: () => ({ data, loading: false, error: '', reload() {} }) },
    '@/hooks/useDataTablePagination': {
      useDataTablePagination: rows => ({ rows, paginationProps: { totalItems: rows.length } })
    }
  };
  const props = { actor: admin, onRefresh() {} },
    ui = harness(
      'src/features/accounting/components/AccountingLedgerWorkspace.tsx',
      'AccountingLedgerWorkspace',
      props,
      { view: 'history' },
      stubs
    );
  let tree = ui.render(),
    menu = treeNodes(tree).find(n => n.type?.name === 'RowActionMenu');
  assert.ok(menu.props.actions.some(a => a.label === 'Đảo phiếu'));
  props.actor = accountant;
  tree = ui.render();
  menu = treeNodes(tree).find(n => n.type?.name === 'RowActionMenu');
  assert.ok(!menu.props.actions.some(a => a.label === 'Đảo phiếu'));
  ui.state.set('view', 'legacy');
  tree = ui.render();
  assert.ok(treeNodes(tree).some(n => n.type === 'td' && n.props.children === 'Chỉ đọc'));
  assert.ok(!treeNodes(tree).some(n => n.type?.name === 'RowActionMenu'));
});
test('money mutation keeps request payload/id/date fixed on ambiguous response and confirms success once', async () => {
  class Unknown extends Error {
    constructor() {
      super('Mất phản hồi');
      this.uncertain = true;
    }
  }
  let attempts = 0,
    saved = 0;
  const bodies = [],
    success = [],
    oldWindow = global.window;
  global.window = { confirm: () => true };
  try {
    const ui = harness(
      'src/features/accounting/components/useLedgerMutation.ts',
      'useLedgerMutation',
      () => saved++,
      {},
      {
        '../api/accountingLedgerService': {
          mutateAccountingLedger: async body => {
            bodies.push(structuredClone(body));
            if (++attempts === 1) throw new Unknown();
            return { success: true, code: 'KT1' };
          }
        },
        '@/features/inventory/api/warehouseService': { WarehouseRequestError: Unknown },
        '@/shared/feedback/mutationFeedback': {
          showSuccessToast: message => success.push(message),
          showErrorToast() {}
        }
      }
    );
    await ui.render().execute({ kind: 'payment', amount: 100, reference: 'PAY1' });
    assert.equal(saved, 0);
    assert.equal(ui.render().uncertain, true);
    await ui.render().execute({ kind: 'payment', amount: 999, reference: 'Changed' });
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(saved, 1);
    assert.equal(success.length, 1);
    assert.equal(bodies[0].postingDate, today);
  } finally {
    global.window = oldWindow;
  }
});
test('accounting endpoint authenticates before reading payload and maps safe domain validation', async () => {
  let denied = true,
    parsed = 0,
    cause = null;
  const api = loader({
    '../../server/adminUsers.js': {
      AdminApiError: ApiError,
      readJsonBody: async request => {
        parsed++;
        return request.json();
      },
      jsonResponse: body => Response.json(body),
      apiErrorResponse: error =>
        Response.json(
          { error: error instanceof ApiError ? error.message : 'Lỗi hệ thống' },
          { status: error instanceof ApiError ? error.status : 500 }
        )
    },
    '../../server/erpCaller.js': {
      requireActiveErpCaller: async () => {
        if (denied) throw new ApiError(401, 'Đăng nhập lại');
        return accountant;
      }
    },
    '../../server/accountingLedger.js': {
      manageAccountingLedger: async actor => {
        assert.equal(actor, accountant);
        if (cause) throw cause;
        return { success: true };
      }
    }
  })('api/accounting/manage.ts');
  const request = () =>
    new Request('https://localhost/api/accounting/manage', { method: 'POST', body: '{"action":"load"}' });
  assert.equal((await api.POST(request())).status, 401);
  assert.equal(parsed, 0);
  denied = false;
  assert.equal((await api.POST(request())).status, 200);
  cause = new model.LedgerValidationError('Sai số tiền');
  assert.equal((await api.POST(request())).status, 400);
  cause = new Error('Internal secret');
  const response = await api.POST(request());
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /secret/);
});
test('rules and queue handlers close all legacy financial write paths; no auto invoices from Sale/dashboard', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(
    rules,
    /match \/invoices\/\{documentId\} \{\s*allow read: if isActive\(\);\s*allow create, update, delete: if false;/
  );
  for (const name of ['finance_requests', 'finance_reference_keys', 'finance_counters'])
    assert.match(rules, new RegExp('match /' + name + '/\\{documentId\\} \\{ allow read, write: if false; \\}'));
  for (const name of [
    'finance_control',
    'finance_documents',
    'finance_funds',
    'finance_entries',
    'finance_source_state',
    'finance_periods'
  ])
    assert.match(
      rules,
      new RegExp(
        'match /' + name + '/\\{documentId\\} \\{\\s*allow read: if canUseLedger\\(\\);\\s*allow write: if false;'
      )
    );
  // Same scope as canUseLedger in the model: Admin, or an active Kế toán with the accounting page.
  assert.match(
    rules,
    /function canUseLedger\(\) \{\s*return isAdmin\(\)\s*\|\| \(isActive\(\) && userProfile\(\)\.role == 'accountant' && hasPage\('accounting'\)\);/
  );
  for (const f of ['src/features/sales/pages/SalesPage.tsx', 'src/features/dashboard/pages/DashboardPage.tsx']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(s, /assertManualFinancialTransition/);
    assert.doesNotMatch(s, /ensureReceivableInvoice/);
  }
  const service = loader()('src/features/sales/api/poWorkflowService.ts');
  for (const status of ['waiting_receivable', 'waiting_discount', 'invoiced', 'debt_collected'])
    assert.throws(() => service.assertManualFinancialTransition(status), /Kế toán/);
  assert.doesNotThrow(() => service.assertManualFinancialTransition('waiting_production'));
});

test('offsetting active adjustments still block reversal of the original document', async () => {
  const b = backend(),
    d = await b.charge(),
    increase = await b.adjust(d, 100, { direction: 'increase' }),
    decrease = await b.adjust(d, 100);
  assert.equal(b.store.get('finance_documents/' + d.id).lines[0].adjustment, 0);
  await assert.rejects(b.reverse(d.id), /điều chỉnh/);
  await b.reverse(decrease.id);
  await b.reverse(increase.id);
  await b.reverse(d.id);
  assert.equal(b.store.get('finance_documents/' + d.id).voided, true);
});
test('multi-line failure is atomic and duplicate source lines cannot inflate source capacity', async () => {
  const b = backend(),
    before = structuredClone([...b.store]);
  await assert.rejects(
    b.charge(10, {
      lines: [
        { sourceVoucherId: 'pod1', sourceLine: 'p1', quantity: 10, unitPrice: 10, discount: 0, taxRate: 0 },
        { sourceVoucherId: 'receive1', sourceLine: 'line-0', quantity: 1, unitPrice: 1, discount: 0, taxRate: 0 }
      ]
    }),
    /phiếu giao/
  );
  assert.deepEqual([...b.store], before);
  const row = { sourceVoucherId: 'pod1', sourceLine: 'p1', quantity: 10, unitPrice: 10, discount: 0, taxRate: 0 };
  await assert.rejects(b.charge(0, { lines: [row, row] }), /trùng dòng/);
  assert.deepEqual([...b.store], before);
});

test('deactivated partners remain visible and existing debt can be settled; new debt is rejected', async () => {
  const b = backend(),
    d = await b.charge();
  assert.equal(b.store.get('customers/c1').financeLinked, true);
  b.store.get('customers/c1').deleted = true;
  const data = await b.loadData();
  assert.ok(data.partners.some(p => p.id === 'c1' && p.name.includes('ngừng sử dụng')));
  await assert.rejects(b.charge(1), /ngừng dùng/);
  const p = await b.payment();
  await b.allocate(p, d, 1100);
  assert.equal(model.lineDue(b.store.get('finance_documents/' + d.id).lines[0]), 0);
});
test('rules retain every pre-existing collection guard while adding financial restrictions', () => {
  const { execFileSync } = require('child_process'),
    old = execFileSync('git', ['show', 'HEAD:firestore.rules'], { cwd: root, encoding: 'utf8' }),
    current = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const matches = [...old.matchAll(/match \/([a-z_]+)\//g)].map(m => m[1]);
  for (const name of matches) assert.ok(current.includes('match /' + name + '/'), 'Missing existing rules ' + name);
  for (const fn of ['isValidRole', 'isValidUserProfile', 'canManageItemCatalog'])
    assert.ok(current.includes('function ' + fn + '('));
  assert.match(current, /financeLinked/);
});

test('phase 6 event report reconciles with actual phase 5 writer after allocation, adjustment, refund and reversals', async () => {
  const b = backend(),
    r = loader()('src/features/accounting/model/accountingReports.ts');
  const check = async () => {
    const data = await b.loadData(),
      report = r.buildDebtReport(data.documents, data.funds, data.entries, today.slice(0, 7) + '-01', today),
      current = r.currentPartnerBalances(data.documents, data.funds);
    for (const p of report.partners) {
      const c = current.find(c => c.side === p.side && c.partnerId === p.partnerId);
      assert.equal(p.closing, c?.debt || 0);
      assert.equal(p.advanceClosing, c?.advance || 0);
    }
  };
  const d1 = await b.charge(40),
    d2 = await b.charge(60),
    p = await b.payment(1200);
  await check();
  const a = await b.allocate(p, d1, 440);
  await check();
  const c = await b.adjust(d2, 100);
  await check();
  const f = await b.post('refund', { fundId: p.id, amount: 100 });
  await check();
  await b.reverse(c.id);
  await check();
  await b.reverse(f.id);
  await check();
  await b.reverse(a.id);
  await check();
  await b.reverse(d1.id);
  await check();
});

test('Sổ công nợ queries only collections that Admin and Kế toán with the accounting page may read', () => {
  const { LEDGER_LIVE_QUERIES } = loader({ '@/infrastructure/firebase/erpDataGateway': {} })(
    'src/features/accounting/components/useLedgerLiveData.ts'
  );
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const readRule = collection =>
    rules.match(new RegExp(String.raw`match /${collection}/\{documentId\} \{\s*allow read: if ([^;]+);`))?.[1];
  const ledgerReaders = ['canUseLedger()', 'isActive()', 'canReadWarehouse()', 'canManageItemCatalog()'];
  for (const { collection } of LEDGER_LIVE_QUERIES) {
    const rule = readRule(collection);
    assert.ok(rule, `${collection} has a read rule`);
    assert.ok(
      ledgerReaders.some(reader => rule.includes(reader)),
      `${collection} is readable by ledger users`
    );
  }
  assert.ok(!LEDGER_LIVE_QUERIES.some(query => /finance_(requests|counters|reference_keys)/.test(query.collection)));
});
