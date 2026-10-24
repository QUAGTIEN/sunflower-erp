const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, stubs = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error(`Unexpected import ${name}`);
    },
    module,
    module.exports
  );
  return module.exports;
}
const model = load('src/features/crm/model/customerProductCatalog.ts');
const admin = { uid: 'admin', role: 'admin', active: true, displayName: 'Admin' };
const sale = { uid: 'sale-a', role: 'sale', active: true, displayName: 'Sale A' };
const customer = { id: 'customer-a', assignedSaleId: sale.uid, products: [] };
const input = () => ({
  productCode: ' SP001 ',
  productName: ' Giấy ',
  productType: 'giay',
  material: 'Giấy',
  unit: 'tờ',
  currentPrice: 0,
  purchasePrice: 0,
  vatRate: 8,
  supplierId: '',
  supplierName: '',
  leadTimeDays: 0,
  note: '',
  fields: model.getProductSpecFields('giay'),
  files: []
});
const product = (values = {}) =>
  model.buildCustomerProduct({ ...input(), ...values }, 'product-a', '2026-10-13T00:00:00.000Z');

test('a customer product can be registered before price and before any PO', () => {
  const result = product();
  assert.equal(result.productCode, 'SP001');
  assert.equal(result.currentPrice, 0);
  assert.deepEqual(result.priceHistory, []);
  assert.equal(model.appendCustomerProduct(customer, result, sale).length, 1);
  assert.deepEqual(customer.products, []);
});
test('codes are unique within a customer, case-insensitive, but may exist at different customers', () => {
  const result = product();
  assert.throws(
    () => model.appendCustomerProduct({ ...customer, products: [result] }, product({ productCode: 'sp001' }), admin),
    /đã tồn tại/
  );
  assert.equal(model.appendCustomerProduct({ ...customer, id: 'customer-b' }, result, admin).length, 1);
});
test('retired and previous codes stay reserved to protect historical orders', () => {
  const retired = { ...product(), deleted: true, productCode: 'NEW', previousProductCodes: ['SP001'] };
  assert.throws(
    () => model.appendCustomerProduct({ ...customer, products: [retired] }, product(), admin),
    /đã tồn tại/
  );
  assert.equal(model.hasCustomerProductCode([retired], 'NEW', retired.id), false);
});
test('sales cannot create another sales customer products, and inactive users are rejected', () => {
  assert.throws(
    () => model.appendCustomerProduct({ ...customer, assignedSaleId: 'sale-b' }, product(), sale),
    /không có quyền/
  );
  assert.throws(() => model.appendCustomerProduct(customer, product(), { ...admin, active: false }), /không có quyền/);
  assert.equal(model.canManageCustomerProducts(sale, { ...customer, deleted: true }), false);
});
test('technical fields follow product type and invalid dimensions or prices cannot be saved', () => {
  const roll = model.getProductSpecFields('tem_trang_cuon');
  assert.ok(roll.some(field => field.id === 'core'));
  assert.ok(roll.some(field => field.id === 'adhesive'));
  assert.ok(!model.getProductSpecFields('muc_in').some(field => field.id === 'core'));
  assert.throws(() => product({ productType: 'tem_trang_cuon', fields: roll }), /phải lớn hơn 0/);
  assert.throws(() => product({ productType: 'tem_trang_cuon', fields: [] }), /phải lớn hơn 0/);
  const valid = roll.map(field => ({ ...field, value: ['width', 'height'].includes(field.id) ? '30' : field.value }));
  assert.equal(product({ productType: 'tem_trang_cuon', fields: valid }).size, '30 × 30 mm');
  assert.throws(() => product({ currentPrice: -1 }), /không được âm/);
  assert.throws(() => product({ vatRate: 101 }), /100%/);
});
test('oversized attachments are rejected before the customer document is written', () => {
  const large = product({ files: [{ id: 'file', kind: 'design', name: 'big', url: 'x'.repeat(910000) }] });
  assert.throws(() => model.appendCustomerProduct(customer, large, admin), /dung lượng/);
});
test('PO selection makes a deep snapshot and preserves the order quantity and commercial discount', () => {
  const catalog = product({
    files: [{ id: 'file', name: 'drawing', url: 'https://example.com/design', kind: 'design' }]
  });
  catalog.specifications.width = 30;
  const item = model.applyCustomerProductToOrderItem({ itemId: 'row-a', quantity: 2000, discountRate: 5 }, catalog);
  catalog.specifications.width = 99;
  catalog.files[0].name = 'changed';
  assert.equal(item.specifications.width, 30);
  assert.equal(item.productFiles[0].name, 'drawing');
  assert.equal(item.customerProductId, catalog.id);
  assert.equal(item.quantity, 2000);
  assert.equal(item.discountRate, 5);
});
test('deleted products are never suggested in a new PO', () => {
  assert.deepEqual(
    model
      .getActiveCustomerProducts({ products: [product(), { ...product(), id: 'retired', deleted: true }] })
      .map(item => item.id),
    ['product-a']
  );
});
test('a product history follows its stable id and legacy codes without changing historical snapshots', () => {
  const catalog = { ...product(), productCode: 'NEW', previousProductCodes: ['SP001'] };
  const orders = [
    { id: 'po1', poCode: 'PO1', orderDate: '2026-09-01', items: [{ productCode: 'SP001', quantity: 100 }] },
    {
      id: 'po2',
      poCode: 'PO2',
      orderDate: '2026-10-01',
      items: [
        { customerProductId: catalog.id, productCode: 'OLD', quantity: 200 },
        { customerProductId: catalog.id, quantity: 50 }
      ]
    },
    { id: 'po3', deleted: true, items: [{ productCode: 'NEW', quantity: 900 }] },
    { id: 'po4', items: [{ customerProductId: 'other', productCode: 'NEW', quantity: 900 }] }
  ];
  const original = structuredClone(orders);
  assert.deepEqual(model.getCustomerProductOrderHistory(catalog, orders), {
    orderCount: 2,
    totalQuantity: 350,
    lastPoId: 'po2',
    lastPoCode: 'PO2'
  });
  assert.deepEqual(orders, original);
});
function api({ remote = true, failure, initial = customer } = {}) {
  let latest = structuredClone(initial);
  const writes = [];
  const service = load('src/features/crm/api/customerProductService.ts', {
    '../model/customerProductCatalog': model,
    '../model/crmModels': {
      normalizeCustomerProduct: (record, index) => ({ ...record, id: record.id || `product-${index + 1}` })
    },
    '@/infrastructure/firebase/client': { getFirebaseDatabase: async () => (remote ? {} : null) },
    '@/infrastructure/firebase/erpDataGateway': {
      dbService: {
        getDocument: async () => structuredClone(latest),
        updateDocument: async (_collection, _id, patch) => {
          latest = { ...latest, ...patch };
          writes.push(patch);
          return true;
        }
      }
    },
    'firebase/firestore': {
      doc: (_db, collection, id) => ({ collection, id }),
      runTransaction: async (_db, run) => {
        if (failure) throw failure;
        return run({
          get: async ref => ({ exists: () => true, id: ref.id, data: () => structuredClone(latest) }),
          update: (ref, patch) => {
            assert.equal(ref.collection, 'customers');
            latest = { ...latest, ...patch };
            writes.push(patch);
          }
        });
      }
    }
  });
  return { service, writes, customer: () => latest };
}
test('remote creation appends to the latest catalog and rejects a racing duplicate without another write', async () => {
  const existing = { ...product({ productCode: 'EXISTING' }), id: 'existing' };
  const client = api({ initial: { ...customer, products: [existing] } });
  await client.service.createCustomerProduct(customer.id, input(), sale);
  assert.equal(client.customer().products.length, 2);
  assert.equal(client.customer().products[0].id, existing.id);
  await assert.rejects(client.service.createCustomerProduct(customer.id, input(), sale), /đã tồn tại/);
  assert.equal(client.writes.length, 1);
});
test('production write failure never falls back to local data', async () => {
  const client = api({ failure: new Error('permission-denied') });
  await assert.rejects(client.service.createCustomerProduct(customer.id, input(), sale), /permission-denied/);
  assert.equal(client.writes.length, 0);
});
test('legacy products without explicit ids remain editable through their normalized identity', async () => {
  const legacy = { ...product(), id: undefined };
  const client = api({ initial: { ...customer, products: [legacy] } });
  const products = await client.service.updateCustomerProduct(
    customer.id,
    { ...legacy, id: 'product-1', productName: 'New name' },
    admin,
    model.getCustomerProductVersion(legacy)
  );
  assert.equal(products[0].id, 'product-1');
  assert.equal(products[0].productName, 'New name');
});
test('editing and approving one product keeps newly added products and rejects stale revisions', async () => {
  const existing = { ...product({ productCode: 'EXISTING' }), id: 'existing' };
  const client = api({ initial: { ...customer, products: [existing] } });
  await client.service.createCustomerProduct(customer.id, input(), sale);
  const products = await client.service.updateCustomerProduct(
    customer.id,
    { ...existing, productCode: 'RENAMED' },
    admin,
    model.getCustomerProductVersion(existing)
  );
  assert.equal(products.length, 2);
  assert.deepEqual(products[0].previousProductCodes, ['EXISTING']);
  await assert.rejects(
    client.service.updateCustomerProduct(customer.id, existing, admin, model.getCustomerProductVersion(existing)),
    /người khác/
  );
  await assert.rejects(client.service.updateCustomerProduct(customer.id, existing, sale), /Chỉ Admin/);
});
test('remote ownership check and local demo obey the same permission and uniqueness rules', async () => {
  const forbidden = api({ initial: { ...customer, assignedSaleId: 'other' } });
  await assert.rejects(forbidden.service.createCustomerProduct(customer.id, input(), sale), /không có quyền/);
  assert.equal(forbidden.writes.length, 0);
  const local = api({ remote: false });
  await local.service.createCustomerProduct(customer.id, input(), sale);
  await assert.rejects(local.service.createCustomerProduct(customer.id, input(), sale), /đã tồn tại/);
  assert.equal(local.customer().products.length, 1);
});

test('the full-page form has technical groups, optional price, and a pinned save footer', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { CustomerProductEditor } = load('src/features/crm/components/CustomerProductEditor.tsx', {
    '@/shared/feedback/mutationFeedback': {
      runMutationAction: (_key, action) => action(),
      showSuccessToast() {},
      showErrorToast() {}
    },
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'lucide-react': require('lucide-react'),
    '@/components/PageBackButton': { PageBackButton: () => React.createElement('button', { type: 'button' }, 'Back') },
    '@/components/PageContextHeader': { PageContextHeader: () => null },
    '@/context/LanguageContext': { useLanguage: () => ({ t: value => value }) },
    '../model/customerProductCatalog': model,
    '../api/customerProductService': {
      createCustomerProduct: () => {
        throw new Error('unexpected write');
      }
    },
    './CustomerProductEditor.css': {}
  });
  const html = renderToStaticMarkup(
    React.createElement(CustomerProductEditor, {
      customer: { ...customer, companyName: 'Công ty A', customerCode: 'KH-A' },
      currentUser: sale,
      classifications: [],
      suppliers: [],
      onClose() {},
      onCreated() {}
    })
  );
  assert.match(html, /Công ty A/);
  assert.match(html, /Thông số kỹ thuật/);
  assert.match(html, /Giá bán tham khảo \(đ\)<\/span><input type="number" min="0" value=""/);
  assert.match(html, /<footer class="customer-product-editor__footer"/);
  assert.match(html, /Lưu mã sản phẩm/);
  assert.doesNotMatch(html, /modal-overlay/);
  const denied = renderToStaticMarkup(
    React.createElement(CustomerProductEditor, {
      customer: { ...customer, assignedSaleId: 'other' },
      currentUser: sale,
      classifications: [],
      suppliers: [],
      onClose() {},
      onCreated() {}
    })
  );
  assert.match(denied, /không có quyền/);
  assert.doesNotMatch(denied, /<form/);
});
