const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const goods = loader()('src/features/inventory/model/finishedGoods.ts');
const admin = { uid: 'admin1', displayName: 'Admin', role: 'admin', active: true, allowedPages: [] };
const accountant = { ...admin, uid: 'acc1', role: 'accountant', allowedPages: ['accounting'] };
const shipping = { ...admin, uid: 'ship1', role: 'purchaser', allowedPages: ['delivery'] };
const producer = { ...admin, uid: 'worker1', role: 'producer', allowedPages: ['production'] };
const catalogId = 'itm-' + 'a'.repeat(64);
const item = {
  id: catalogId,
  code: 'TP-1',
  name: 'Tem nội bộ',
  kind: 'finished_good',
  baseUnit: 'cái',
  conversions: [{ unit: 'cuộn', factor: 10 }],
  active: true,
  revision: 1
};
const catalog = {
  id: catalogId,
  code: 'TP-1',
  name: 'Tem đã duyệt',
  baseUnit: 'cái',
  sourceUnit: 'cái',
  factor: 1,
  revision: 1
};
const po = {
  id: 'po1',
  poCode: 'PO-1',
  customerId: 'customer1',
  customerName: 'Khách A',
  status: 'waiting_delivery',
  items: [{ itemId: 'p1', productCode: 'KH-01', productName: 'Tem khách', quantity: 100, unit: 'cái' }],
  historyLogs: []
};
const production = {
  id: 'lsx1',
  lsxCode: 'LSX-1',
  productionOrderVersion: 2,
  poId: 'po1',
  status: 'completed',
  lines: [{ itemId: 'p1', productName: 'Tem khách', quantity: 80, goodQuantity: 80, unit: 'cái', catalog }]
};
const purchase = {
  id: 'buy1',
  purCode: 'PUR-1',
  sourcingType: 'finished_good',
  status: 'ordered',
  linkedPoId: 'po1',
  supplierId: 'supplier1',
  procurementRequestId: 'reqbuy1',
  items: [{ poItemId: 'p1', productName: 'Tem mua ngoài', quantity: 100, unit: 'cái' }]
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
        [`item_catalog/${catalogId}`]: item,
        'pos/po1': po,
        'production_commands/lsx1': production,
        'purchase_orders/buy1': purchase,
        'procurement_requests/reqbuy1': { poId: 'po1', purchaseOrderId: 'buy1', status: 'ordered' },
        'deliveries/trip1': {
          id: 'trip1',
          delCode: 'DEL-1',
          status: 'planning',
          vehicleId: 'vehicle1',
          orders: [{ poId: 'po1', status: 'pending', customerName: 'Khách A' }]
        },
        'delivery_vehicles/vehicle1': { id: 'vehicle1', status: 'ready' },
        'inventory/old': { qtyInStock: 999 },
        'warehouse_exports/old': { quantity: 10 },
        'invoices/old': { amount: 100, paidAmount: 50 },
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
          writes = [];
        const snapshot = ref => {
          reads.set(ref.path, versions.get(ref.path) || 0);
          const data = structuredClone(store.get(ref.path));
          return { ...ref, exists: !!data, data: () => structuredClone(data) };
        };
        const result = await callback({
          get: async ref => {
            assert.equal(writes.length, 0, 'Firestore reads must precede every write');
            if (ref.path) return snapshot(ref);
            const docs = [...store.keys()]
              .filter(key => key.startsWith(`${ref.name}/`))
              .map(key => snapshot({ path: key, id: key.split('/')[1] }));
            const matches = doc =>
              ref.operator === 'array-contains'
                ? (doc.data()[ref.field] || []).includes(ref.value)
                : doc.data()[ref.field] === ref.value;
            return { docs: docs.filter(doc => !ref.field || matches(doc)) };
          },
          set: (ref, data) => writes.push({ ref, data: structuredClone(data), replace: true }),
          update: (ref, data) => writes.push({ ref, data: structuredClone(data) })
        });
        if ([...reads].some(([key, version]) => version !== (versions.get(key) || 0))) {
          retries++;
          continue;
        }
        for (const { ref, data, replace } of writes) {
          store.set(ref.path, replace ? data : { ...store.get(ref.path), ...data });
          versions.set(ref.path, (versions.get(ref.path) || 0) + 1);
        }
        return result;
      }
      throw new Error('Retry limit');
    }
  };
  const server = loader({
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
    './adminUsers.js': { AdminApiError: ApiError }
  })('server/finishedGoods.ts');
  const manage = (body, actor = admin) => server.manageFinishedGoods(actor, body);
  const productionServer = loader({
    './firebaseAdmin.js': { getFirebaseAdminServices: () => ({ firestore }) },
    './adminUsers.js': { AdminApiError: ApiError }
  })('server/productionOrders.ts');
  const manageProduction = body => productionServer.manageProductionOrder(admin, body);
  const base = (extra = {}) => ({
    requestId: `request${++serial}`,
    expectedOrderRevision: store.get('goods_order_state/po1')?.revision || 0,
    expectedBalances: { [catalogId]: store.get(`warehouse_balances/fg_${catalogId}`)?.revision || 0 },
    note: 'Chứng từ thực tế',
    ...extra
  });
  const request = (kind = 'production_receipt', quantity = 40, extra = {}) =>
    base({
      action: 'post',
      kind,
      sourceId: kind === 'production_receipt' ? 'lsx1' : 'buy1',
      poId: 'po1',
      tripId: 'trip1',
      confirmMapping: true,
      lines: [
        {
          sourceLine: ['purchase_receipt', 'supplier_dispatch'].includes(kind) ? 'line-0' : 'p1',
          poItemId: 'p1',
          catalogItemId: catalogId,
          quantity
        }
      ],
      proof: { receiverName: 'Người nhận A', reference: 'POD-01' },
      ...extra
    });
  const post = (kind, quantity, extra = {}, actor = admin) => manage(request(kind, quantity, extra), actor);
  const event = (kind, dispatchId, quantity, extra = {}, actor = admin) =>
    post(
      kind,
      quantity,
      {
        dispatchId,
        lines: [{ sourceLine: store.get(`warehouse_vouchers/${dispatchId}`).lines[0].sourceLine, quantity }],
        ...extra
      },
      actor
    );
  const reverse = (voucherId, extra = {}, actor = admin) =>
    manage(base({ action: 'reverse', voucherId, ...extra }), actor);
  const trip = status =>
    manage(
      base({
        action: 'trip_status',
        tripId: 'trip1',
        status,
        expectedTripRevision: store.get('deliveries/trip1').goodsRevision || 0
      })
    );
  const depart = async () => {
    await trip('approved');
    await trip('loading');
    await trip('delivering');
  };
  const balance = () => store.get(`warehouse_balances/fg_${catalogId}`)?.quantity || 0;
  const state = () => store.get('goods_order_state/po1')?.lines.p1;
  return {
    store,
    manage,
    manageProduction,
    base,
    request,
    post,
    event,
    reverse,
    trip,
    depart,
    balance,
    state,
    retries: () => retries
  };
}

test('QC receipts are explicit, partial, capped and preserve raw stock/money/history', async () => {
  const b = backend();
  await b.post('production_receipt', 30, {}, accountant);
  await b.post('production_receipt', 50);
  assert.equal(b.balance(), 80);
  assert.equal(b.store.get('goods_source_state/production_lsx1').lines.p1.received, 80);
  await assert.rejects(b.post('production_receipt', 1), /Vượt sản lượng/);
  assert.deepEqual(b.store.get('inventory/old'), { qtyInStock: 999 });
  assert.deepEqual(b.store.get('invoices/old'), { amount: 100, paidAmount: 50 });
  assert.equal([...b.store.keys()].filter(key => key.startsWith('invoices/')).length, 1);
  assert.equal(b.store.get('production_commands/lsx1').lines[0].goodQuantity, 80);
});
test('only completed v2 QC, active finished goods and unchanged snapshots may enter stock', async () => {
  const b = backend();
  b.store.get('production_commands/lsx1').status = 'producing';
  await assert.rejects(b.post('production_receipt', 10), /đạt QC/);
  b.store.get('production_commands/lsx1').status = 'completed';
  b.store.get(`item_catalog/${catalogId}`).kind = 'raw_material';
  await assert.rejects(b.post('production_receipt', 10), /Chọn mã/);
  b.store.get(`item_catalog/${catalogId}`).kind = 'finished_good';
  b.store.get(`item_catalog/${catalogId}`).active = false;
  await assert.rejects(b.post('production_receipt', 10), /Chọn mã/);
  b.store.get(`item_catalog/${catalogId}`).active = true;
  b.store.get(`item_catalog/${catalogId}`).name = 'Tên mới';
  const result = await b.post('production_receipt', 10);
  assert.equal(b.store.get(`warehouse_vouchers/${result.id}`).lines[0].name, 'Tem đã duyệt');
  b.store.get('production_commands/lsx1').lines[0].goodQuantity = 79;
  await assert.rejects(b.post('production_receipt', 10), /nguồn đã đổi/);
});
test('company dispatch reduces stock once; POD only updates actual receipt and remaining quantities', async () => {
  const b = backend();
  await b.post('production_receipt', 80);
  const d = await b.post('dispatch', 60);
  assert.equal(b.balance(), 20);
  assert.equal(goods.goodsTransit(b.state()), 60);
  assert.equal(b.store.get('pos/po1').items[0].qtyDelivered, 0);
  await assert.rejects(b.event('delivery', d.id, 40), /chưa xuất phát/);
  await b.depart();
  await b.event('delivery', d.id, 40, {}, shipping);
  assert.equal(b.balance(), 20);
  assert.equal(b.store.get('pos/po1').items[0].qtyDelivered, 40);
  assert.equal(goods.goodsTransit(b.state()), 20);
  await b.event('failed_return', d.id, 20);
  assert.equal(b.balance(), 40);
  assert.equal(goods.goodsOutstanding(b.state()), 60);
  assert.equal(b.store.get('deliveries/trip1').status, 'completed');
  assert.equal(b.store.get('delivery_vehicles/vehicle1').status, 'ready');
});
test('negative stock is blocked; POD/returns cannot exceed their original dispatch', async () => {
  const b = backend();
  await b.post('production_receipt', 20);
  await assert.rejects(b.post('dispatch', 21), /xuất âm/);
  const d = await b.post('dispatch', 20);
  await b.depart();
  await assert.rejects(b.event('delivery', d.id, 21), /vượt phần còn lại|Vượt lượng/);
  await b.event('delivery', d.id, 10);
  await assert.rejects(b.event('failed_return', d.id, 11), /vượt phần còn lại|Vượt lượng/);
  await assert.rejects(b.event('customer_return', d.id, 11), /vượt phần còn lại|Vượt lượng/);
  await b.event('customer_return', d.id, 5);
  assert.equal(b.balance(), 5);
  assert.equal(b.state().delivered - b.state().customerReturned, 5);
  assert.equal(goods.goodsOutstanding(b.state()), 85);
});
test('supplier direct shipping, POD and failure-to-supplier never create fictitious company stock', async () => {
  const b = backend();
  const d = await b.post('supplier_dispatch', 30);
  assert.equal(b.balance(), 0);
  assert.equal([...b.store.keys()].filter(key => key.startsWith('warehouse_balances/')).length, 0);
  await b.event('delivery', d.id, 20, {}, shipping);
  assert.equal(b.balance(), 0);
  await b.event('failed_return', d.id, 10, { returnToSupplier: true });
  assert.equal(b.balance(), 0);
  assert.equal(goods.goodsOutstanding(b.state()), 80);
  await b.post('purchase_receipt', 80);
  assert.equal(b.balance(), 80);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'received');
  assert.equal(b.store.get('procurement_requests/reqbuy1').status, 'received');
  assert.equal(b.store.get('pos/po1').purchaseProgress, 'materials_received');
  await b.event('customer_return', d.id, 5);
  assert.equal(b.balance(), 85);
  assert.equal(b.store.get('pos/po1').items[0].qtyDelivered, 15);
});
test('direct failure returned to company is a real company receipt and still fulfills the vendor order', async () => {
  const b = backend();
  const d = await b.post('supplier_dispatch', 100);
  await b.event('failed_return', d.id, 100, { returnToSupplier: false });
  assert.equal(b.balance(), 100);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'received');
  assert.equal(goods.goodsOutstanding(b.state()), 100);
  await assert.rejects(b.post('purchase_receipt', 1), /Vượt sản lượng/);
});
test('partial vendor receipts and direct allocation share one source cap and preserve explicit conversion', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').items[0].quantity = 10;
  b.store.get('purchase_orders/buy1').items[0].unit = 'cuộn';
  await b.post('purchase_receipt', 6);
  const direct = await b.post('supplier_dispatch', 4);
  assert.equal(b.balance(), 60);
  assert.equal(b.state().sent, 40);
  await assert.rejects(b.post('purchase_receipt', 1), /Vượt sản lượng/);
  await b.event('delivery', direct.id, 2);
  assert.equal(b.state().delivered, 20);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'partially_received');
  await b.event('delivery', direct.id, 2);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'received');
  assert.equal(b.balance(), 60);
});
test('mapping is explicit and immutable; embedded vendor catalog snapshots are never trusted', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').items[0].catalog = { ...catalog, code: 'FORGED', factor: 1000 };
  await assert.rejects(b.post('purchase_receipt', 5, { confirmMapping: false }), /Xác nhận/);
  const result = await b.post('purchase_receipt', 5);
  const line = b.store.get(`warehouse_vouchers/${result.id}`).lines[0];
  assert.equal(line.code, item.code);
  assert.equal(line.factor, 1);
  await assert.rejects(
    b.post('purchase_receipt', 5, {
      lines: [{ sourceLine: 'line-00', poItemId: 'p1', catalogItemId: catalogId, quantity: 5 }]
    }),
    /ID dòng/
  );
  b.store.get('pos/po1').items[0].quantity = 101;
  await assert.rejects(b.post('purchase_receipt', 5), /PO đã đổi/);
});
test('duplicate/replayed/concurrent requests cannot double-receive or issue beyond remaining order', async () => {
  const b = backend(),
    r = b.request('production_receipt', 40);
  const [one, two] = await Promise.all([b.manage(r), b.manage(r)]);
  assert.equal(one.id, two.id);
  assert.equal(b.balance(), 40);
  await assert.rejects(b.manage({ ...r, note: 'Khác' }), /Mã yêu cầu/);
  const requests = [b.request('purchase_receipt', 70), b.request('purchase_receipt', 70)];
  const results = await Promise.allSettled(requests.map(r => b.manage(r)));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.ok(b.retries() > 0);
  const dispatches = await Promise.allSettled([
    b.manage(b.request('dispatch', 70)),
    b.manage(b.request('dispatch', 70))
  ]);
  assert.equal(dispatches.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(b.state().sent, 70);
});
test('reversals preserve history and enforce dependent events and company stock conservation', async () => {
  const b = backend();
  const received = await b.post('production_receipt', 40),
    dispatched = await b.post('dispatch', 20);
  await b.depart();
  const delivered = await b.event('delivery', dispatched.id, 20);
  await assert.rejects(b.reverse(dispatched.id), /vượt phần còn lại|Vượt lượng/);
  const returned = await b.event('customer_return', dispatched.id, 5);
  await assert.rejects(b.reverse(delivered.id), /vượt phần còn lại|Vượt lượng/);
  await b.reverse(returned.id);
  await b.reverse(delivered.id);
  await b.reverse(dispatched.id);
  await b.reverse(received.id);
  assert.equal(b.balance(), 0);
  assert.equal(b.state().sent, 0);
  await assert.rejects(b.reverse(received.id), /đã được đảo/);
  assert.ok(b.store.get(`warehouse_vouchers/${received.id}`).reversedBy);
});
test('Admin close-short requires actual customer acceptance and no goods in transit; reversal reopens demand', async () => {
  const b = backend();
  await b.post('production_receipt', 40);
  const d = await b.post('dispatch', 40);
  const close = () =>
    b.base({
      action: 'close_short',
      poId: 'po1',
      confirmMapping: true,
      customerConfirmation: 'Email KH đồng ý nhận 40/100',
      lines: [{ sourceLine: 'p1', catalogItemId: catalogId }]
    });
  await assert.rejects(b.manage(close()), /đang giao/);
  await b.depart();
  await b.event('delivery', d.id, 40);
  await assert.rejects(b.manage(close(), accountant), error => error.status === 403);
  await assert.rejects(b.manage({ ...close(), customerConfirmation: '' }), /xác nhận khách/);
  const closed = await b.manage(close());
  assert.equal(b.state().closedShort, 60);
  assert.equal(b.store.get('pos/po1').deliveryProgress, 'delivered_with_tolerance');
  await b.reverse(closed.id);
  assert.equal(b.state().closedShort, 0);
  assert.equal(goods.goodsOutstanding(b.state()), 60);
  assert.equal(b.store.get('pos/po1').status, 'waiting_delivery');
});
test('roles distinguish warehouse posting and POD confirmation; disabled users and Sale without delivery denied', async () => {
  const b = backend();
  for (const actor of [
    { ...admin, active: false },
    { ...admin, role: 'sale', allowedPages: ['sales'] }
  ])
    await assert.rejects(b.manage({ action: 'load' }, actor), error => error.status === 403);
  await b.manage({ action: 'load' }, producer);
  await assert.rejects(b.post('production_receipt', 1, {}, producer), error => error.status === 403);
  await assert.rejects(b.post('production_receipt', 1, {}, shipping), error => error.status === 403);
  const d = await b.post('supplier_dispatch', 1);
  await assert.rejects(b.event('delivery', d.id, 1, {}, accountant), error => error.status === 403);
  await b.event('delivery', d.id, 1, {}, shipping);
  await assert.rejects(b.reverse(d.id, {}, accountant), error => error.status === 403);
});
test('old receipts and old fulfilled PO cannot be silently migrated or counted twice', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').status = 'received';
  await assert.rejects(b.post('purchase_receipt', 5), /luồng cũ/);
  b.store.get('pos/po1').items[0].qtyDelivered = 10;
  await assert.rejects(b.post('production_receipt', 10), /luồng cũ/);
});
test('POD needs receiver and evidence; no historical date or malformed quantity may write', async () => {
  const b = backend();
  const d = await b.post('supplier_dispatch', 10);
  for (const proof of [
    { receiverName: '', reference: 'POD' },
    { receiverName: 'A', reference: '' },
    { receiverName: 'A', signatureImage: 'data:text/html;base64,AAAA' }
  ])
    await assert.rejects(b.event('delivery', d.id, 1, { proof }), /người nhận|POD/);
  for (const quantity of [0, -1, NaN, Infinity, '3', 0.0000001])
    await assert.rejects(b.post('purchase_receipt', quantity));
  for (const postingDate of ['2000-01-01', '2099-01-01'])
    await assert.rejects(b.post('purchase_receipt', 1, { postingDate }), /hiện tại/);
  await assert.rejects(b.manage(b.request('toString', 1)), /Loại phiếu/);
});
test('trip departure needs dispatches, postponement never returns stock, vehicle leases serialize trips', async () => {
  const b = backend();
  await b.trip('approved');
  await b.trip('loading');
  await assert.rejects(b.trip('delivering'), /phiếu xuất/);
  await b.post('production_receipt', 30);
  await b.post('dispatch', 30);
  await b.trip('delivering');
  await b.trip('postponed');
  assert.equal(b.balance(), 0);
  assert.equal(goods.goodsTransit(b.state()), 30);
  b.store.get('deliveries/trip2');
  b.store.set('deliveries/trip2', {
    ...b.store.get('deliveries/trip1'),
    id: 'trip2',
    status: 'approved',
    goodsRevision: 0
  });
  b.store.get('delivery_vehicles/vehicle1').status = 'running';
  b.store.get('delivery_vehicles/vehicle1').activeGoodsTripId = 'trip2';
  await assert.rejects(b.trip('planning'), /Xe không sẵn sàng/);
  assert.equal(b.balance(), 0);
});
test('load exposes quantity data without purchase prices, and warehouse report excludes direct movements', async () => {
  const b = backend();
  b.store.get('purchase_orders/buy1').totalPrice = 999;
  await b.post('supplier_dispatch', 5);
  const data = await b.manage({ action: 'load' }, shipping);
  assert.equal(data.sources.find(source => source.type === 'purchase').totalPrice, undefined);
  assert.equal(data.balances.length, 0);
  assert.equal(data.vouchers[0].lines[0].delta, 0);
  assert.equal(data.orders[0].customerId, undefined);
});

test('direct customer return to supplier releases vendor capacity without company stock; reversal respects reused capacity', async () => {
  const b = backend(),
    d = await b.post('supplier_dispatch', 100);
  await b.event('delivery', d.id, 100);
  const returned = await b.event('customer_return', d.id, 30, { returnToSupplier: true });
  assert.equal(b.balance(), 0);
  assert.equal(b.state().delivered - b.state().customerReturned, 70);
  assert.equal(goods.goodsOutstanding(b.state()), 30);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'partially_received');
  const replacement = await b.post('purchase_receipt', 30);
  assert.equal(b.balance(), 30);
  await assert.rejects(b.reverse(returned.id), /Vượt sản lượng/);
  await b.reverse(replacement.id);
  await b.reverse(returned.id);
  assert.equal(b.balance(), 0);
  assert.equal(b.store.get('purchase_orders/buy1').status, 'received');
});
test('purchase cannot substitute a second PO line with identical catalog code', async () => {
  const b = backend();
  b.store.get('pos/po1').items.push({ ...po.items[0], itemId: 'p2' });
  await assert.rejects(
    b.post('purchase_receipt', 10, {
      lines: [{ sourceLine: 'line-0', poItemId: 'p2', catalogItemId: catalogId, quantity: 10 }]
    }),
    /đổi dòng PO/
  );
  await b.post('purchase_receipt', 10);
  assert.ok(b.store.get('goods_order_state/po1').lines.p1);
  assert.equal(b.store.get('goods_order_state/po1').lines.p2, undefined);
});
test('same SKU on different PO lines aggregates physical stock and retains independent progress', async () => {
  const b = backend();
  b.store.get('pos/po1').items.push({ ...po.items[0], itemId: 'p2', quantity: 50 });
  b.store.get('purchase_orders/buy1').items.push({ ...purchase.items[0], poItemId: 'p2', quantity: 50 });
  const lines = quantity => [
    { sourceLine: 'line-0', poItemId: 'p1', catalogItemId: catalogId, quantity: 100 },
    { sourceLine: 'line-1', poItemId: 'p2', catalogItemId: catalogId, quantity }
  ];
  await b.post('purchase_receipt', 0, { lines: lines(50) });
  assert.equal(b.balance(), 150);
  const d = await b.post('dispatch', 0, {
    lines: [
      { sourceLine: 'p1', catalogItemId: catalogId, quantity: 100 },
      { sourceLine: 'p2', catalogItemId: catalogId, quantity: 50 }
    ]
  });
  assert.equal(b.balance(), 0);
  await b.depart();
  await b.event('delivery', d.id, 0, {
    lines: [
      { sourceLine: 'p1', quantity: 90 },
      { sourceLine: 'p2', quantity: 30 }
    ]
  });
  assert.deepEqual(
    b.store.get('pos/po1').items.map(row => row.qtyDelivered),
    [90, 30]
  );
  assert.equal(goods.goodsTransit(b.store.get('goods_order_state/po1').lines.p2), 20);
  await assert.rejects(
    b.event('delivery', d.id, 1, {
      lines: [
        { sourceLine: 'p1', quantity: 1 },
        { sourceLine: 'p1', quantity: 1 }
      ]
    }),
    /trùng dòng/
  );
});
test('trip results distinguish returned from received and reversed POD clears copied evidence', async () => {
  const b = backend();
  await b.post('production_receipt', 40);
  const d = await b.post('dispatch', 40);
  assert.equal(b.store.get('pos/po1').deliveryProgress, 'delivering');
  await b.depart();
  const pod = await b.event('delivery', d.id, 20);
  await b.event('failed_return', d.id, 20);
  assert.equal(b.store.get('deliveries/trip1').orders[0].goodsResult, 'mixed');
  assert.equal(b.store.get('deliveries/trip1').orders[0].podReference, 'POD-01');
  await b.reverse(pod.id);
  assert.equal(b.store.get('deliveries/trip1').orders[0].podReference, '');
  assert.equal(b.store.get('deliveries/trip1').status, 'postponed');
  await b.event('failed_return', d.id, 20);
  assert.equal(b.store.get('deliveries/trip1').orders[0].goodsResult, 'returned');
  assert.equal(b.store.get('pos/po1').items[0].qtyDelivered, 0);
});
test('all stops require dispatch before departure; duplicate or empty trip orders are rejected', async () => {
  const b = backend();
  b.store.get('deliveries/trip1').orders.push({ poId: 'po2', status: 'pending' });
  await b.post('production_receipt', 10);
  await b.post('dispatch', 10);
  await b.trip('approved');
  await b.trip('loading');
  await assert.rejects(b.trip('delivering'), /từng PO/);
  b.store.get('deliveries/trip1').orders.push({ poId: 'po1' });
  await assert.rejects(b.trip('delivering'), /trùng dòng/);
  b.store.get('deliveries/trip1').orders = [];
  await assert.rejects(b.trip('delivering'), /PO hợp lệ/);
});
test('reversals use original snapshots after catalog deactivation; missing sources and company-to-supplier returns denied', async () => {
  const b = backend();
  const r = await b.post('production_receipt', 10);
  b.store.get('item_catalog/' + catalogId).active = false;
  await b.reverse(r.id);
  assert.equal(b.balance(), 0);
  await assert.rejects(b.post('production_receipt', 10, { sourceId: 'missing' }), error => error.status === 404);
  b.store.get('item_catalog/' + catalogId).active = true;
  await b.post('production_receipt', 10);
  const d = await b.post('dispatch', 10);
  await b.depart();
  await b.event('delivery', d.id, 10);
  await assert.rejects(b.event('customer_return', d.id, 1, { returnToSupplier: true }), /Chỉ hàng NCC/);
});
test('server-owned goods states and legacy bypass protections stay enforced in rules and integrations', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  for (const name of [
    'goods_order_state',
    'goods_source_state',
    'goods_dispatch_state',
    'goods_requests',
    'goods_counters'
  ])
    assert.match(rules, new RegExp('match /' + name + '/\\{[^}]+\\}\\s*\\{\\s*allow read, write: if false;'));
  assert.match(rules, /activeGoodsTripId/);
  assert.match(rules, /goodsDeliveryClosed/);
  const delivery = fs.readFileSync(path.join(root, 'src/features/delivery/pages/DeliveryPage.tsx'), 'utf8');
  assert.doesNotMatch(delivery, /qtyDelivered\s*:/);
  assert.match(delivery, /action: 'trip_status'/);
  assert.match(delivery, /kind: 'delivery'/);
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
test('mutation hook freezes uncertain request across edits and only toasts success after confirmed replay', async () => {
  class Unknown extends Error {
    constructor() {
      super('Chưa xác định');
      this.uncertain = true;
    }
  }
  const requests = [],
    success = [],
    failures = [];
  let attempts = 0,
    saved = 0;
  const previousWindow = global.window;
  global.window = { confirm: () => true };
  try {
    const ui = harness(
      'src/features/inventory/components/useGoodsMutation.ts',
      'useGoodsMutation',
      () => saved++,
      {},
      {
        '../api/finishedGoodsService': {
          mutateFinishedGoods: async body => {
            requests.push(structuredClone(body));
            if (++attempts === 1) throw new Unknown();
            return { success: true, code: 'TP-1' };
          }
        },
        '../api/warehouseService': { WarehouseRequestError: Unknown },
        '@/shared/feedback/mutationFeedback': {
          showSuccessToast: message => success.push(message),
          showErrorToast: message => failures.push(message)
        }
      }
    );
    await ui.render().execute({ kind: 'production_receipt', note: 'Gốc', quantity: 10 });
    assert.equal(ui.render().uncertain, true);
    assert.equal(saved, 0);
    assert.equal(success.length, 0);
    await ui.render().execute({ kind: 'dispatch', note: 'Không được thay', quantity: 99 });
    assert.deepEqual(requests[0], requests[1]);
    assert.ok(requests[0].requestId);
    assert.match(requests[0].postingDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(saved, 1);
    assert.equal(success.length, 1);
    assert.equal(failures.length, 1);
  } finally {
    global.window = previousWindow;
  }
});
test('signature pad requires real stroke, emits JPEG and obeys read-only state', () => {
  const images = [],
    props = { disabled: false, onChange: value => images.push(value) },
    ui = harness('src/features/inventory/components/GoodsSignaturePad.tsx', 'GoodsSignaturePad', props);
  let tree = ui.render(),
    canvas = treeNodes(tree).find(n => n.type === 'canvas');
  const context = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  ui.refs[0].current = {
    width: 600,
    height: 180,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 180 }),
    setPointerCapture() {},
    toDataURL: type => 'data:' + type + ';base64,AAAA'
  };
  canvas.props.onPointerDown({ clientX: 1, clientY: 1, pointerId: 1 });
  canvas.props.onPointerUp();
  assert.equal(images.length, 0);
  canvas.props.onPointerDown({ clientX: 1, clientY: 1, pointerId: 1 });
  canvas.props.onPointerMove({ clientX: 20, clientY: 20 });
  canvas.props.onPointerUp();
  assert.equal(images[0], 'data:image/jpeg;base64,AAAA');
  props.disabled = true;
  canvas = treeNodes(ui.render()).find(n => n.type === 'canvas');
  canvas.props.onPointerDown({ clientX: 1, clientY: 1 });
  canvas.props.onPointerMove({ clientX: 2, clientY: 2 });
  canvas.props.onPointerUp();
  assert.equal(images.length, 1);
});
test('actual goods dialog submits selected source quantities/revisions and blocks negative stock preview', () => {
  const sent = [],
    data = {
      items: [item],
      balances: [],
      vouchers: [],
      orderStates: [],
      sourceStates: [],
      dispatchStates: [],
      orders: [
        {
          id: 'po1',
          code: 'PO-1',
          customerName: 'Khách',
          status: 'waiting_delivery',
          legacyDelivered: false,
          lines: [{ id: 'p1', name: 'Tem', unit: 'cái', quantity: 100 }]
        }
      ],
      sources: [
        {
          id: 'lsx1',
          code: 'LSX-1',
          type: 'production',
          poId: 'po1',
          blocked: '',
          lines: [{ id: 'p1', poItemId: 'p1', name: 'Tem', unit: 'cái', quantity: 80, catalogItemId: catalogId }]
        }
      ],
      trips: [{ id: 'trip1', code: 'DEL-1', poIds: ['po1'], status: 'planning' }]
    };
  const ui = harness(
    'src/features/inventory/components/GoodsVoucherDialog.tsx',
    'GoodsVoucherDialog',
    { currentUser: admin, options: { kind: 'production_receipt', sourceId: 'lsx1' }, onClose() {}, onSaved() {} },
    {
      data,
      entries: { p1: { quantity: '30', catalogItemId: catalogId, poItemId: 'p1' } },
      note: 'Nhập thực tế',
      confirmed: true
    },
    {
      '../api/finishedGoodsService': { loadFinishedGoods: async () => data },
      './useGoodsMutation': {
        useGoodsMutation: () => ({
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
  assert.equal(sent[0].lines[0].quantity, 30);
  assert.equal(sent[0].sourceId, 'lsx1');
  assert.equal(sent[0].expectedOrderRevision, 0);
  assert.deepEqual(sent[0].expectedBalances, { [catalogId]: 0 });
  ui.state.set('kind', 'dispatch');
  ui.state.set('sourceId', '');
  ui.state.set('poId', 'po1');
  ui.state.set('tripId', 'trip1');
  tree = ui.render();
  const submit = treeNodes(tree).find(n => n.type === 'button' && n.props.children === 'Ghi sổ');
  assert.equal(submit.props.disabled, true);
  assert.ok(treeNodes(tree).some(n => n.props?.role === 'alert' && String(n.props.children).includes('âm/vượt')));
});

test('finished API authenticates before parsing; domain errors are actionable and internal errors sanitized', async () => {
  let denied = false,
    reads = 0,
    cause = null,
    called = 0;
  const api = loader({
    '../../server/adminUsers.js': {
      AdminApiError: ApiError,
      readJsonBody: async request => {
        reads++;
        return request.json();
      },
      jsonResponse: body => Response.json(body),
      apiErrorResponse: error =>
        Response.json(
          { success: false, error: error instanceof ApiError ? error.message : 'Không xử lý được yêu cầu.' },
          { status: error instanceof ApiError ? error.status : 500 }
        )
    },
    '../../server/erpCaller.js': {
      requireActiveErpCaller: async () => {
        if (denied) throw new ApiError(403, 'Tài khoản bị khóa');
        return shipping;
      }
    },
    '../../server/finishedGoods.js': {
      manageFinishedGoods: async (actor, body) => {
        called++;
        assert.equal(actor, shipping);
        assert.equal(body.action, 'load');
        if (cause) throw cause;
        return { success: true };
      }
    }
  })('api/warehouse/finished.ts');
  const request = () =>
    new Request('https://localhost/api/warehouse/finished', {
      method: 'POST',
      body: JSON.stringify({ action: 'load' })
    });
  denied = true;
  assert.equal((await api.POST(request())).status, 403);
  assert.equal(reads, 0);
  assert.equal(called, 0);
  denied = false;
  assert.equal((await api.POST(request())).status, 200);
  cause = new Error('Thiếu quy đổi đã khai báo');
  assert.equal((await api.POST(request())).status, 400);
  cause = new Error('Internal database details');
  const response = await api.POST(request());
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /Internal database/);
});

test('partial shipping preserves production access; later QC completion preserves actual delivery progress', async () => {
  const b = backend();
  b.store.get('pos/po1').status = 'waiting_production';
  b.store.get('pos/po1').productionPlanRequiredItemIds = ['p1'];
  b.store.get('pos/po1').productionPlanLocked = true;
  await b.post('production_receipt', 80);
  const d = await b.post('dispatch', 40);
  await b.depart();
  await b.event('delivery', d.id, 20);
  assert.equal(b.store.get('pos/po1').status, 'waiting_production');
  assert.equal(b.store.get('pos/po1').deliveryProgress, 'partial');
  await b.manageProduction({
    action: 'create',
    id: 'lsx2',
    poId: 'po1',
    requestId: 'productionCreate2',
    requiredItemIds: ['p1'],
    lines: [{ itemId: 'p1', quantity: 20 }],
    deliveryDeadline: '2026-10-30',
    machineId: '',
    operatorId: '',
    materials: []
  });
  assert.equal(b.store.get('production_commands/lsx2').status, 'draft');
  const command = b.store.get('production_commands/lsx2');
  command.status = 'producing';
  await b.manageProduction({
    action: 'complete',
    id: 'lsx2',
    poId: 'po1',
    requestId: 'productionComplete2',
    expectedRevision: command.revision,
    results: [{ itemId: 'p1', goodQuantity: 20, rejectQuantity: 0 }],
    qcNote: 'Đạt QC'
  });
  assert.equal(b.store.get('pos/po1').status, 'waiting_delivery');
  assert.equal(b.store.get('pos/po1').deliveryProgress, 'partial');
  assert.equal(b.store.get('pos/po1').items[0].qtyDelivered, 20);
});

test('a multi-PO order is received per PO: sources split by PO and each receipt lands on its own PO', async () => {
  const multi = {
    id: 'lsx9',
    lsxCode: 'LSX-9',
    productionOrderVersion: 2,
    poId: 'po1',
    poIds: ['po1', 'po2'],
    status: 'completed',
    lines: [
      {
        itemId: 'p1',
        poId: 'po1',
        poCode: 'PO-1',
        lineId: 'po1__p1',
        productName: 'Tem khách',
        quantity: 20,
        goodQuantity: 20,
        unit: 'cái',
        catalog
      },
      {
        itemId: 'p1',
        poId: 'po2',
        poCode: 'PO-2',
        lineId: 'po2__p1',
        productName: 'Tem khách',
        quantity: 10,
        goodQuantity: 10,
        unit: 'cái',
        catalog
      }
    ]
  };
  const b = backend({ 'pos/po2': { ...po, id: 'po2', poCode: 'PO-2' }, 'production_commands/lsx9': multi });
  const loaded = await b.manage({ action: 'load' });
  const sources = loaded.sources.filter(source => source.documentId === 'lsx9');
  assert.deepEqual(
    sources.map(source => [source.id, source.poId, source.lines.map(line => line.id)]),
    [
      ['lsx9--po1', 'po1', ['po1__p1']],
      ['lsx9--po2', 'po2', ['po2__p1']]
    ]
  );
  const receipt = (poId, sourceLine, quantity) =>
    b.manage(
      b.request('production_receipt', quantity, {
        sourceId: 'lsx9',
        poId,
        expectedOrderRevision: b.store.get(`goods_order_state/${poId}`)?.revision || 0,
        lines: [{ sourceLine, poItemId: 'p1', catalogItemId: catalogId, quantity }]
      })
    );
  await assert.rejects(receipt('po3', 'po1__p1', 1), /Chọn PO thuộc lệnh/);
  await assert.rejects(receipt('po2', 'po1__p1', 1), /không tồn tại/);
  await receipt('po2', 'po2__p1', 10);
  assert.equal(b.store.get('goods_source_state/production_lsx9').lines.po2__p1.received, 10);
  assert.equal(b.store.get('goods_order_state/po1'), undefined, 'receiving for PO 2 never touches PO 1');
  await assert.rejects(receipt('po2', 'po2__p1', 1), /Vượt sản lượng/);
});
