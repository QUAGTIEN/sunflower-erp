const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const model = loader()('src/features/inventory/model/warehouse.ts');
const admin = { uid: 'admin1', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const accountant = { ...admin, uid: 'accountant1', role: 'accountant', allowedPages: ['accounting'] };
const purchaser = { ...admin, uid: 'purchaser1', role: 'purchaser', allowedPages: ['inventory'] };
const producer = { ...admin, uid: 'producer1', role: 'producer', allowedPages: ['production'] };
const item = {
  id: 'paper',
  code: 'NVL-01',
  name: 'Giấy',
  kind: 'raw_material',
  baseUnit: 'm',
  conversions: [{ unit: 'cuộn', factor: 10 }],
  active: true,
  revision: 1
};
const material = {
  id: 'm1',
  code: 'NVL-01',
  name: 'Giấy đã chốt',
  unit: 'm',
  quantity: 60,
  catalogItemId: 'paper',
  catalog: { id: 'paper', code: 'NVL-01', name: 'Giấy đã chốt', baseUnit: 'm', sourceUnit: 'm', factor: 1, revision: 1 }
};
const purchase = {
  id: 'buy1',
  purCode: 'PUR-1',
  sourcingType: 'raw_material',
  status: 'ordered',
  supplierId: 'supplier1',
  linkedPoId: 'po1',
  procurementRequestId: 'request1',
  items: [{ materialName: 'Giấy tên cũ', unit: 'm', quantity: 100 }]
};
const command = {
  id: 'lsx1',
  lsxCode: 'LSX-1',
  poId: 'po1',
  productionOrderVersion: 2,
  status: 'released',
  materials: [material]
};
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
function backend(extra = {}) {
  const store = new Map(
    Object.entries(
      structuredClone({
        'item_catalog/paper': item,
        'purchase_orders/buy1': purchase,
        'production_commands/lsx1': command,
        'procurement_requests/request1': { poId: 'po1', purchaseOrderId: 'buy1', status: 'ordered' },
        'pos/po1': { status: 'waiting_production', historyLogs: [] },
        'inventory/old': { materialName: 'Giấy tên cũ', qtyInStock: 999 },
        'warehouse_exports/old': { items: [{ quantity: 5 }] },
        'invoices/old': { amount: 100, paidAmount: 0 },
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
      const id = value || `auto${++serial}`;
      return { path: `${name}/${id}`, id };
    },
    where: (field, operator, value) => ({ name, field, operator, value })
  });
  const firestore = {
    collection,
    runTransaction: async callback => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const reads = new Map(),
          pending = [];
        const snapshot = ref => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const data = structuredClone(store.get(ref.path));
          return { ...ref, exists: !!data, data: () => structuredClone(data) };
        };
        const result = await callback({
          get: async ref => {
            assert.equal(pending.length, 0, 'all reads must precede writes');
            if (ref.path) return snapshot(ref);
            const docs = [...store.keys()]
              .filter(key => key.startsWith(`${ref.name}/`))
              .map(key => snapshot({ path: key, id: key.split('/')[1] }));
            return { docs: docs.filter(doc => !ref.field || doc.data()[ref.field] === ref.value) };
          },
          set: (ref, data) => pending.push({ ref, data: structuredClone(data), replace: true }),
          update: (ref, data) => pending.push({ ref, data: structuredClone(data) })
        });
        if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) {
          retries++;
          continue;
        }
        for (const { ref, data, replace } of pending) {
          store.set(ref.path, replace ? data : { ...store.get(ref.path), ...data });
          versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('transaction retries exhausted');
    }
  };
  const server = loader({
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
    './adminUsers.js': { AdminApiError: ApiError }
  })('server/warehouse.ts');
  const manage = (body, actor = admin) => server.manageWarehouse(actor, body);
  const request = (kind = 'purchase_receipt', quantity = 40, extra = {}) => ({
    action: 'post',
    requestId: `req${++serial}`,
    kind,
    sourceId: kind === 'purchase_receipt' ? 'buy1' : 'lsx1',
    lines: [{ sourceLine: kind === 'purchase_receipt' ? 'line-0' : 'm1', catalogItemId: 'paper', quantity }],
    expectedBalances: { paper: store.get('warehouse_balances/paper')?.revision || 0 },
    confirmMapping: true,
    note: 'Phiếu thực tế',
    ...extra
  });
  const reverse = (id, extra = {}, actor = admin) =>
    manage(
      {
        action: 'reverse',
        voucherId: id,
        requestId: `req${++serial}`,
        expectedBalances: { paper: store.get('warehouse_balances/paper')?.revision || 0 },
        note: 'Đảo phiếu sai',
        ...extra
      },
      actor
    );
  const balance = () => store.get('warehouse_balances/paper');
  return { store, manage, request, reverse, balance, retries: () => retries };
}

test('warehouse permission matrix separates readers, posters, inactive and inherited accountant access', async () => {
  for (const actor of [admin, purchaser, accountant]) assert.equal(model.canPostWarehouse(actor), true);
  for (const actor of [producer, { ...purchaser, allowedPages: ['purchase'] }]) {
    assert.equal(model.canReadWarehouse(actor), true);
    assert.equal(model.canPostWarehouse(actor), false);
    await assert.rejects(backend().manage({ action: 'post' }, actor), error => error.status === 403);
  }
  for (const actor of [
    { ...admin, active: false },
    { ...admin, role: 'sale', allowedPages: ['inventory'] },
    { ...accountant, allowedPages: [] }
  ])
    await assert.rejects(backend().manage({ action: 'load' }, actor), error => error.status === 403);
  const access = loader()('src/app/navigation/accessControl.ts');
  assert.equal(access.canAccessPage(accountant, 'inventory'), true);
  assert.equal(access.canAccessPage({ ...accountant, active: false }, 'inventory'), false);
});
test('partial and complete receiving updates source, request, PO, and preserves money and legacy data', async () => {
  const b = backend();
  const first = await b.manage(b.request());
  assert.equal(b.balance().quantity, 40);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'partially_received');
  assert.equal(b.store.get('procurement_requests/request1').status, 'partially_received');
  assert.equal(b.store.get('pos/po1').purchaseProgress, 'supplier_ordered');
  await b.manage(b.request('purchase_receipt', 60), accountant);
  assert.equal(b.balance().quantity, 100);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'received');
  assert.equal(b.store.get('pos/po1').purchaseProgress, 'materials_received');
  assert.equal(b.store.get('inventory/old').qtyInStock, 999);
  assert.deepEqual(b.store.get('warehouse_exports/old'), { items: [{ quantity: 5 }] });
  assert.equal([...b.store.keys()].filter(key => key.startsWith('invoices/')).length, 1);
  assert.deepEqual(b.store.get('invoices/old'), { amount: 100, paidAmount: 0 });
  const voucher = b.store.get(`warehouse_vouchers/${first.id}`);
  assert.equal(voucher.warehouseId, 'raw_main');
  assert.equal(voucher.lines[0].factor, 1);
  assert.equal(voucher.lines[0].baseQuantity, 40);
});
test('one receipt cannot mark parent PO complete while another procurement request remains open', async () => {
  const b = backend({ 'procurement_requests/request2': { poId: 'po1', status: 'ordered' } });
  await b.manage(b.request('purchase_receipt', 100));
  assert.equal(b.store.get('pos/po1').purchaseProgress, 'supplier_ordered');
});
test('receipt source quantity cap, manual mapping, and explicit catalog conversion are authoritative', async () => {
  const b = backend();
  await assert.rejects(b.manage(b.request('purchase_receipt', 101)), /vượt lượng/);
  await assert.rejects(b.manage(b.request('purchase_receipt', 1, { confirmMapping: false })), /xác nhận mã/);
  b.store.get('purchase_orders/buy1').items[0].unit = 'cuộn';
  await b.manage(b.request('purchase_receipt', 3));
  assert.equal(b.balance().quantity, 30);
  b.store.get('purchase_orders/buy1').items[0].unit = 'm²';
  await assert.rejects(b.manage(b.request('purchase_receipt', 1)), /thay đổi/);
  assert.equal(b.balance().quantity, 30);
  const unknown = backend();
  unknown.store.get('purchase_orders/buy1').items[0].unit = 'hộp';
  await assert.rejects(unknown.manage(unknown.request()), /quy đổi/);
  assert.equal(unknown.balance(), undefined);
});
test('no name matching, inactive or wrong kind catalog, or substitution of confirmed mappings', async () => {
  const b = backend({ 'item_catalog/other': { ...item, id: 'other', code: 'NVL-02' } });
  await assert.rejects(
    b.manage(
      b.request('purchase_receipt', 1, { lines: [{ sourceLine: 'line-0', catalogItemId: 'missing', quantity: 1 }] })
    ),
    /Chọn mã NVL/
  );
  await b.manage(b.request());
  await assert.rejects(
    b.manage(
      b.request('purchase_receipt', 1, { lines: [{ sourceLine: 'line-0', catalogItemId: 'other', quantity: 1 }] })
    ),
    /Mã NVL khác/
  );
  b.store.get('item_catalog/paper').active = false;
  await assert.rejects(b.manage(b.request('purchase_receipt', 1)), /Chọn mã NVL/);
  b.store.get('item_catalog/paper').active = true;
  b.store.get('item_catalog/paper').kind = 'finished_good';
  await assert.rejects(b.manage(b.request()), /Chọn mã NVL/);
});
test('request replay is idempotent; changed content or caller under same ID cannot repost', async () => {
  const b = backend(),
    request = b.request();
  const first = await b.manage(request),
    size = b.store.size;
  assert.deepEqual(await b.manage(request), first);
  assert.equal(b.store.size, size);
  assert.equal(b.balance().quantity, 40);
  await assert.rejects(b.manage({ ...request, note: 'Khác' }), error => error.status === 409);
  await assert.rejects(b.manage(request, accountant), error => error.status === 409);
});
test('client-created purchase snapshots never replace authoritative catalog labels, factors or manual confirmation', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').items[0].catalog = {
    id: 'paper',
    code: 'FORGED',
    name: 'Sai',
    factor: 999,
    baseUnit: 'kg',
    revision: 999
  };
  const view = await b.manage({ action: 'load' });
  assert.equal(view.sources.find(source => source.id === 'buy1').lines[0].catalogItemId, '');
  await assert.rejects(b.manage(b.request('purchase_receipt', 2, { confirmMapping: false })), /xác nhận mã/);
  const result = await b.manage(b.request('purchase_receipt', 2)),
    line = b.store.get(`warehouse_vouchers/${result.id}`).lines[0];
  assert.equal(line.code, item.code);
  assert.equal(line.name, item.name);
  assert.equal(line.factor, 1);
  assert.equal(line.baseUnit, 'm');
  assert.equal(line.catalogRevision, 1);
});
test('concurrent distinct receipts serialize; stale balances require reload and cannot over-receive', async () => {
  const b = backend();
  const result = await Promise.allSettled([
    b.manage(b.request('purchase_receipt', 70)),
    b.manage(b.request('purchase_receipt', 70))
  ]);
  assert.equal(result.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(b.balance().quantity, 70);
  assert.ok(b.retries() > 0);
  await assert.rejects(b.manage(b.request('purchase_receipt', 31)), /vượt lượng/);
  await assert.rejects(b.manage(b.request('purchase_receipt', 1, { expectedBalances: { paper: 0 } })), /vừa thay đổi/);
});
test('concurrent identical requests create one voucher and one quantity effect', async () => {
  const b = backend(),
    request = b.request();
  const [a, c] = await Promise.all([b.manage(request), b.manage(request)]);
  assert.deepEqual(a, c);
  assert.equal(b.balance().quantity, 40);
  assert.equal([...b.store.keys()].filter(key => key.startsWith('warehouse_vouchers/')).length, 1);
});
test('negative stock requires both explicit override and reason, also on reversal', async () => {
  const b = backend();
  await assert.rejects(b.manage(b.request('production_issue', 5)), /xuất vượt tồn/);
  await assert.rejects(b.manage(b.request('production_issue', 5, { allowNegative: true })), /xuất vượt tồn/);
  const issue = await b.manage(
    b.request('production_issue', 5, { allowNegative: true, negativeReason: 'Hàng thực nhận chưa nhập sổ' }),
    purchaser
  );
  assert.equal(b.balance().quantity, -5);
  assert.equal(b.store.get(`warehouse_vouchers/${issue.id}`).negativeReason, 'Hàng thực nhận chưa nhập sổ');
  const receipt = await b.manage(b.request('purchase_receipt', 20));
  await b.manage(b.request('production_issue', 10));
  await assert.rejects(b.reverse(receipt.id), /xuất vượt tồn/);
  await b.reverse(receipt.id, { allowNegative: true, negativeReason: 'Đảo sai số lượng' });
  assert.equal(b.balance().quantity, -15);
});
test('multiple source rows mapped to same catalog aggregate before checking negative stock', async () => {
  const b = backend({ 'production_commands/lsx1': { ...command, materials: [material, { ...material, id: 'm2' }] } });
  await b.manage(b.request('purchase_receipt', 10));
  await assert.rejects(
    b.manage(
      b.request('production_issue', 6, {
        lines: ['m1', 'm2'].map(sourceLine => ({ sourceLine, catalogItemId: 'paper', quantity: 6 }))
      })
    ),
    /xuất vượt tồn/
  );
  assert.equal(b.balance().quantity, 10);
});
test('issue multiple times, supplemental issue, partial returns and net limits use base quantities', async () => {
  const b = backend();
  await b.manage(b.request('purchase_receipt', 100));
  await b.manage(b.request('production_issue', 40));
  await b.manage(b.request('production_issue', 30));
  await b.manage(b.request('production_return', 10));
  await b.manage(b.request('production_return', 5));
  assert.equal(b.balance().quantity, 45);
  assert.equal(b.store.get('warehouse_source_state/production_lsx1').lines.m1.quantity, 55);
  await assert.rejects(b.manage(b.request('production_return', 56)), /Không hoàn vượt/);
  assert.equal(b.balance().quantity, 45);
});
test('frozen LSX names and revision survive catalog rename; catalog ID, base unit and conversion cannot change', async () => {
  const b = backend();
  b.store.get('item_catalog/paper').name = 'Tên mới';
  b.store.get('item_catalog/paper').revision = 2;
  const result = await b.manage(b.request('production_issue', 5, { allowNegative: true, negativeReason: 'Cho phép' }));
  const line = b.store.get(`warehouse_vouchers/${result.id}`).lines[0];
  assert.equal(line.name, 'Giấy đã chốt');
  assert.equal(line.catalogRevision, 1);
  b.store.get('item_catalog/paper').baseUnit = 'kg';
  await assert.rejects(b.manage(b.request('production_issue', 1)), /quy đổi|Quy đổi/);
});
test('legacy or draft LSX cannot post; completed permits return only; cancelled blocks new postings', async () => {
  const b = backend();
  await b.manage(b.request('purchase_receipt', 20));
  await b.manage(b.request('production_issue', 10));
  const source = b.store.get('production_commands/lsx1');
  for (const status of ['draft', 'pending_approval', 'cancelled', 'completed']) {
    source.status = status;
    await assert.rejects(b.manage(b.request('production_issue', 1)), error => error.status === 400);
  }
  source.status = 'completed';
  await b.manage(b.request('production_return', 1));
  source.status = 'released';
  source.productionOrderVersion = 1;
  await assert.rejects(b.manage(b.request('production_return', 1)), error => error.status === 400);
});
test('legacy receipts cannot be counted twice and sources returned to client omit purchase prices', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').status = 'received';
  b.store.get('purchase_orders/buy1').totalPrice = 99999;
  await assert.rejects(b.manage(b.request()), /luồng cũ/);
  const view = await b.manage({ action: 'load' }, producer);
  assert.equal(view.sources[0].legacyReceived, true);
  assert.equal(view.sources[0].totalPrice, undefined);
  assert.equal(view.legacyInventory[0].qtyInStock, 999);
  assert.equal(view.balances.length, 0);
});
test('manual LSX source can be reconciled explicitly without modifying its frozen source', async () => {
  const manual = { ...material };
  delete manual.catalog;
  delete manual.catalogItemId;
  const b = backend({ 'production_commands/lsx1': { ...command, materials: [manual] } });
  const before = structuredClone(b.store.get('production_commands/lsx1'));
  await assert.rejects(b.manage(b.request('production_issue', 1, { confirmMapping: false })), /xác nhận mã/);
  await b.manage(b.request('production_issue', 1, { allowNegative: true, negativeReason: 'Thực cấp' }));
  assert.deepEqual(b.store.get('production_commands/lsx1'), before);
});
test('reversal is admin only, once, append-only, and respects outstanding returns', async () => {
  const b = backend();
  const receipt = await b.manage(b.request());
  const issue = await b.manage(b.request('production_issue', 20));
  const returned = await b.manage(b.request('production_return', 5));
  await assert.rejects(b.reverse(issue.id, {}, accountant), error => error.status === 403);
  await assert.rejects(b.reverse(issue.id), /đảo phiếu hoàn/);
  const reverseReturn = await b.reverse(returned.id);
  await b.reverse(issue.id);
  assert.equal(b.balance().quantity, 40);
  await assert.rejects(b.reverse(issue.id), /đã được đảo/);
  await assert.rejects(b.reverse(reverseReturn.id), /phiếu đảo/);
  await b.reverse(receipt.id);
  assert.equal(b.balance().quantity, 0);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'ordered');
  assert.equal([...b.store.keys()].filter(key => key.startsWith('warehouse_vouchers/')).length, 6);
});
test('inactive catalog does not prevent an admin from reversing an existing voucher', async () => {
  const b = backend();
  const receipt = await b.manage(b.request());
  b.store.get('item_catalog/paper').active = false;
  await b.reverse(receipt.id);
  assert.equal(b.balance().quantity, 0);
});
test('dates, input bounds, duplicate source rows and unknown actions are rejected without writes', async () => {
  const b = backend();
  const size = b.store.size;
  for (const quantity of [0, -1, NaN, Infinity, '4', 0.0000001, 1e12])
    await assert.rejects(b.manage(b.request('purchase_receipt', quantity)));
  for (const postingDate of ['2000-01-01', '2099-01-01'])
    await assert.rejects(b.manage(b.request('purchase_receipt', 1, { postingDate })), /Không ghi lùi/);
  const lines = [{ sourceLine: 'line-0', catalogItemId: 'paper', quantity: 1 }];
  await assert.rejects(b.manage(b.request('purchase_receipt', 1, { lines: [...lines, ...lines] })), /bị trùng/);
  await assert.rejects(b.manage(b.request('purchase_receipt', 1, { note: ' ' })), /Nhập nội dung/);
  await assert.rejects(b.manage({ action: 'remove' }), /không hợp lệ/);
  assert.equal(b.store.size, size);
});
test('threshold revisions preserve quantity and alert settings; no opening quantity can be supplied', async () => {
  const b = backend();
  await b.manage(b.request());
  await b.manage(
    {
      action: 'threshold',
      requestId: 'threshold1',
      catalogItemId: 'paper',
      expectedRevision: 1,
      minQuantity: 50,
      quantity: 100000
    },
    accountant
  );
  assert.equal(b.balance().quantity, 40);
  assert.equal(b.balance().minQuantity, 50);
  await assert.rejects(
    b.manage({
      action: 'threshold',
      requestId: 'threshold2',
      catalogItemId: 'paper',
      expectedRevision: 1,
      minQuantity: 10
    }),
    /vừa thay đổi/
  );
  await b.manage(b.request('purchase_receipt', 10));
  assert.equal(b.balance().minQuantity, 50);
});

test('finished goods thresholds preserve isolated balance, audit, permission and idempotent retry', async () => {
  const b = backend({
    'item_catalog/tp': { ...item, id: 'tp', kind: 'finished_good', code: 'TP1' },
    'warehouse_balances/fg_tp': {
      id: 'fg_tp',
      catalogItemId: 'tp',
      warehouseId: 'finished_main',
      quantity: 12,
      revision: 2
    },
    'warehouse_balances/tp': { quantity: 999, revision: 9 }
  });
  const body = {
    action: 'threshold',
    warehouseId: 'finished_main',
    requestId: 'fg-threshold',
    catalogItemId: 'tp',
    minQuantity: 20,
    expectedRevision: 2
  };
  await b.manage(body, accountant);
  await b.manage(body, accountant);
  assert.equal(b.store.get('warehouse_balances/fg_tp').quantity, 12);
  assert.equal(b.store.get('warehouse_balances/fg_tp').minQuantity, 20);
  assert.equal(b.store.get('warehouse_balances/fg_tp').revision, 3);
  assert.equal(b.store.get('warehouse_balances/tp').quantity, 999);
  assert.equal([...b.store.keys()].filter(k => k.startsWith('audit_events/')).length, 1);
  await assert.rejects(b.manage({ ...body, requestId: 'stale' }, accountant), /vừa thay đổi/);
  await assert.rejects(
    b.manage({ ...body, requestId: 'denied' }, { ...producer, allowedPages: ['production'] }),
    e => e.status === 403
  );
  await assert.rejects(b.manage({ ...body, requestId: 'wrong', catalogItemId: 'paper' }, accountant), /đúng kho/);
  await assert.rejects(
    b.manage({ ...body, requestId: 'malformed', warehouseId: 'other' }, accountant),
    /Kho không hợp lệ/
  );
});
test('signed ledger report includes original and reversal, opening/closing across date boundaries', () => {
  const voucher = (postingDate, delta) => ({
    postingDate,
    lines: [{ catalogItemId: 'paper', code: 'NVL-1', name: 'Giấy', baseUnit: 'm', delta }]
  });
  const rows = model.warehouseSummary(
    [
      voucher('2026-09-30', 100),
      voucher('2026-10-01', -40),
      voucher('2026-10-02', 10),
      voucher('2026-10-03', 40),
      voucher('2026-11-01', 500)
    ],
    '2026-10-01',
    '2026-10-31'
  );
  assert.deepEqual(rows[0], {
    code: 'NVL-1',
    name: 'Giấy',
    unit: 'm',
    opening: 100,
    incoming: 50,
    outgoing: 40,
    closing: 110
  });
  assert.equal(model.warehouseDate(new Date('2026-10-22T18:00:00Z')), '2026-10-23');
});
test('client uses authenticated API, never local fallback, and marks ambiguous network results', async () => {
  const client = loader({
    '@/infrastructure/firebase/erpDataGateway': {
      isFirebaseRuntimeEnabled: true,
      authService: { getIdToken: async () => 'test-token' }
    }
  })('src/features/inventory/api/warehouseService.ts');
  const previous = global.fetch;
  let call;
  try {
    global.fetch = async (url, options) => {
      call = { url, options };
      return { ok: true, status: 200, json: async () => ({ success: true, id: 'v1' }) };
    };
    await client.mutateWarehouse({ action: 'post', requestId: 'same' });
    assert.equal(call.url, '/api/warehouse/manage');
    assert.equal(call.options.headers.Authorization, 'Bearer test-token');
    global.fetch = async () => {
      throw new Error('network');
    };
    await assert.rejects(client.mutateWarehouse({}), error => error.uncertain === true);
    global.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'Tồn kho vừa thay đổi' }) });
    await assert.rejects(
      client.mutateWarehouse({}),
      error => error.uncertain === false && /vừa thay đổi/.test(error.message)
    );
    const local = loader({ '@/infrastructure/firebase/erpDataGateway': { isFirebaseRuntimeEnabled: false } })(
      'src/features/inventory/api/warehouseService.ts'
    );
    await assert.rejects(local.mutateWarehouse({}), /không ghi kho.*local/);
  } finally {
    global.fetch = previous;
  }
});
test('static rules contract freezes legacy and protects quantity writer and managed purchase sources', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const collection of ['inventory', 'warehouse_exports'])
    assert.match(rules, new RegExp(`match /${collection}/\\{documentId\\} \\{[^}]*allow write: if false;`));
  for (const collection of ['warehouse_vouchers', 'warehouse_source_state', 'warehouse_requests', 'warehouse_counters'])
    assert.match(rules, new RegExp(`match /${collection}/\\{documentId\\} \\{ allow read, write: if false;`));
  assert.match(rules, /warehouseReceiptRevision/);
  assert.match(rules, /Quantity receipt\/direct-shipping state and its source are server-owned/);
});

function screen(file, exportName, props, initial, stubs = {}) {
  const React = require('react');
  const ast = ts.createSourceFile(
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    ),
    names = [];
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === 'useState'
    )
      names.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const state = new Map(Object.entries(initial)),
    refs = [];
  let cursor = 0,
    refCursor = 0;
  const Component = loader({
    react: {
      ...React,
      useEffect() {},
      useMemo: fn => fn(),
      useRef(value) {
        const index = refCursor++;
        return (refs[index] ||= { current: value });
      },
      useState(value) {
        const key = names[cursor++] || `hook${cursor}`;
        if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value);
        return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
      }
    },
    ...stubs
  })(file)[exportName];
  return {
    state,
    render() {
      cursor = 0;
      refCursor = 0;
      return Component(props);
    }
  };
}
const nodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          nodes
        )
      ];
test('actual warehouse form freezes an uncertain request and retries identical ID, quantities and revisions', async () => {
  class RequestError extends Error {
    constructor() {
      super('Chưa xác định kết quả');
      this.uncertain = true;
    }
  }
  const writes = [],
    success = [],
    previousWindow = global.window;
  let completed = 0;
  const data = {
    items: [item],
    balances: [],
    progress: [],
    sources: [
      {
        id: 'buy1',
        code: 'PUR-1',
        type: 'purchase',
        status: 'ordered',
        legacyReceived: false,
        lines: [{ id: 'line-0', name: 'Giấy nguồn', unit: 'm', quantity: 100, catalogItemId: '' }]
      }
    ]
  };
  global.window = { confirm: () => true };
  try {
    const ui = screen(
      'src/features/inventory/components/WarehouseVoucherDialog.tsx',
      'WarehouseVoucherDialog',
      {
        currentUser: admin,
        initialSourceId: 'buy1',
        onClose() {},
        onSaved() {
          completed++;
        }
      },
      {
        data,
        entries: { 'line-0': { catalogItemId: 'paper', quantity: '10' } },
        note: 'Thực nhận',
        confirmMapping: true
      },
      {
        '../api/warehouseService': {
          WarehouseRequestError: RequestError,
          mutateWarehouse: async body => {
            writes.push(structuredClone(body));
            if (writes.length === 1) throw new RequestError();
            return { success: true, code: 'KHO-1' };
          }
        },
        '@/shared/feedback/mutationFeedback': { showErrorToast() {}, showSuccessToast: text => success.push(text) }
      }
    );
    let tree = ui.render();
    assert.equal(
      nodes(tree).find(node => node.type === 'button' && node.props.children === 'Ghi sổ').props.disabled,
      false
    );
    await nodes(tree)
      .find(node => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    tree = ui.render();
    assert.equal(completed, 0);
    assert.equal(success.length, 0);
    assert.equal(ui.state.get('uncertain'), true);
    assert.equal(nodes(tree).find(node => node.type === 'fieldset').props.disabled, true);
    await nodes(tree)
      .find(node => node.type === 'form')
      .props.onSubmit({ preventDefault() {} });
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(writes[1].lines[0].quantity, 10);
    assert.equal(completed, 1);
    assert.equal(success.length, 1);
  } finally {
    global.window = previousWindow;
  }
});
test('actual issue form shows projected negative stock and requires explicit confirmation before enabling post', () => {
  const data = {
    items: [item],
    balances: [],
    progress: [],
    sources: [
      {
        id: 'lsx1',
        code: 'LSX-1',
        type: 'production',
        status: 'released',
        legacyReceived: false,
        lines: [{ id: 'm1', name: 'Giấy nguồn', unit: 'm', quantity: 60, catalogItemId: 'paper' }]
      }
    ]
  };
  const ui = screen(
    'src/features/inventory/components/WarehouseVoucherDialog.tsx',
    'WarehouseVoucherDialog',
    { currentUser: accountant, initialSourceId: 'lsx1', initialKind: 'production_issue', onClose() {}, onSaved() {} },
    { data, entries: { m1: { catalogItemId: 'paper', quantity: '5' } }, note: 'Thực cấp' },
    {
      '../api/warehouseService': {},
      '@/shared/feedback/mutationFeedback': {}
    }
  );
  let tree = ui.render();
  assert.equal(
    nodes(tree).find(node => node.type === 'button' && node.props.children === 'Ghi sổ').props.disabled,
    true
  );
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert' && node.props.className === 'warehouse-warning'));
  nodes(tree)
    .find(node => node.type === 'input' && node.props.type === 'checkbox')
    .props.onChange({ target: { checked: true } });
  nodes(ui.render())
    .find(node => node.type === 'textarea' && node.props.value === '')
    .props.onChange({ target: { value: 'Được phép xuất âm' } });
  assert.equal(
    nodes(ui.render()).find(node => node.type === 'button' && node.props.children === 'Ghi sổ').props.disabled,
    false
  );
});
test('actual stock preview rounds by base precision and does not falsely warn on a zero decimal balance', () => {
  const lines = ['m1', 'm2', 'm3'].map(id => ({ id, name: id, unit: 'm', quantity: 1, catalogItemId: 'paper' }));
  const data = {
    items: [item],
    balances: [{ id: 'paper', quantity: 0.3 }],
    progress: [],
    sources: [{ id: 'lsx1', code: 'LSX-1', type: 'production', status: 'released', legacyReceived: false, lines }]
  };
  const ui = screen(
    'src/features/inventory/components/WarehouseVoucherDialog.tsx',
    'WarehouseVoucherDialog',
    { currentUser: admin, initialSourceId: 'lsx1', initialKind: 'production_issue', onClose() {}, onSaved() {} },
    {
      data,
      entries: Object.fromEntries(lines.map(line => [line.id, { catalogItemId: 'paper', quantity: '0.1' }])),
      note: 'Thực cấp'
    },
    { '../api/warehouseService': {}, '@/shared/feedback/mutationFeedback': {} }
  );
  const tree = ui.render();
  assert.ok(!nodes(tree).some(node => node.props?.className === 'warehouse-warning'));
  assert.equal(
    nodes(tree).find(node => node.type === 'button' && node.props.children === 'Ghi sổ').props.disabled,
    false
  );
});

test('production_return records optional rollCode and remainingMeters and load computes itemUsers', async () => {
  const b = backend({
    'production_commands/lsx1': {
      ...command,
      customerId: 'cus1',
      customerName: 'Công ty Ánh Dương'
    },
    'customers/cus1': {
      id: 'cus1',
      name: 'Công ty Ánh Dương',
      products: [
        {
          id: 'prod1',
          code: 'SP-01',
          name: 'Tem nhãn Ánh Dương',
          specifications: { paperCode: 'NVL-01' }
        }
      ]
    }
  });
  await b.manage(b.request('purchase_receipt', 50));
  await b.manage(b.request('production_issue', 30));
  const returned = await b.manage(
    b.request('production_return', 12.5, {
      lines: [
        {
          sourceLine: 'm1',
          catalogItemId: 'paper',
          quantity: 12.5,
          rollCode: 'CUON-A12',
          remainingMeters: 12.5
        }
      ]
    })
  );
  const voucher = b.store.get(`warehouse_vouchers/${returned.id}`);
  assert.equal(voucher.customerName, 'Công ty Ánh Dương');
  assert.equal(voucher.lines[0].rollCode, 'CUON-A12');
  assert.equal(voucher.lines[0].remainingMeters, 12.5);
  const loaded = await b.manage({ action: 'load' });
  assert.ok(Array.isArray(loaded.itemUsers.paper));
  assert.equal(loaded.itemUsers.paper[0].customerName, 'Công ty Ánh Dương');
  assert.ok(loaded.itemUsers.paper[0].sources.some(source => source.includes('LSX-1')));
  assert.ok(loaded.itemUsers.paper[0].sources.some(source => source.includes('Khai báo SP')));
});
