const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/features/crm/model/customerProductCatalog.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(name => { throw new Error(`Unexpected runtime import: ${name}`); }, loaded, loaded.exports);
const model = loaded.exports;
const admin = { uid: 'admin', role: 'admin', active: true };
const product = () => model.buildCustomerProduct({
  productCode: 'TEM001', productName: 'Tem trắng', productType: 'tem_trang_cuon', unit: 'cuộn', material: 'Giấy thường',
  fields: model.getProductSpecFields('tem_trang_cuon').map(field => ({ ...field, value: field.id === 'width' ? '50' : field.id === 'height' ? '30' : field.value })),
  files: [{ id: 'design', name: 'Thiết kế.pdf', url: 'https://example.com/design.pdf', kind: 'design' }],
  note: 'Keo theo mẫu duyệt', currentPrice: 85000, purchasePrice: 50000, vatRate: 8,
  supplierId: 'supplier-a', supplierName: 'Nhà cung cấp A', leadTimeDays: 3
}, 'product-a', '2026-10-13T00:00:00.000Z');
const customer = (products) => ({ id: 'customer-a', assignedSaleId: 'sale-a', products });

test('editing dimensions recomputes cached size without changing a saved PO snapshot', () => {
  const original = product();
  const oldOrder = model.applyCustomerProductToOrderItem({ quantity: 10 }, original);
  const edited = { ...original, specifications: { ...original.specifications, width: 60, height: 40 } };
  const [saved] = model.replaceCustomerProduct(customer([original]), edited, admin);
  assert.equal(saved.size, '60 × 40 mm');
  assert.equal(saved.specifications.fields.find(field => field.id === 'width').value, 60);
  assert.equal(model.getCustomerProductSize(edited), '60 × 40 mm');
  assert.equal(oldOrder.size, '50 × 30 mm');
  assert.equal(oldOrder.specifications.width, 50);
  assert.equal(original.size, '50 × 30 mm');
});

test('PO selection inherits identity, unit, technical data, files and supplier with deep snapshots', () => {
  const catalog = product();
  const item = model.applyCustomerProductToOrderItem({ quantity: 12, note: 'Giao buổi sáng' }, catalog);
  assert.equal(item.customerProductId, 'product-a');
  assert.equal(item.productCode, 'TEM001');
  assert.equal(item.productName, 'Tem trắng');
  assert.equal(item.unit, 'cuộn');
  assert.equal(item.size, '50 × 30 mm');
  assert.equal(item.material, 'Giấy thường');
  assert.equal(item.supplierId, 'supplier-a');
  assert.equal(item.productNote, 'Keo theo mẫu duyệt');
  assert.equal(item.note, 'Giao buổi sáng');
  assert.equal(item.leadTimeDays, 3);
  catalog.files[0].name = 'Changed';
  catalog.specifications.width = 99;
  assert.equal(item.productFiles[0].name, 'Thiết kế.pdf');
  assert.equal(item.specifications.width, 50);
});

test('refreshing a draft or repeat order preserves its commercial inputs and uses current catalog metadata', () => {
  const catalog = { ...product(), productCode: 'NEW', productName: 'Tên mới', unit: 'hộp', specifications: { width: 80, height: 20 } };
  const input = { customerProductId: catalog.id, productCode: 'OLD', productName: 'Old', size: 'old size', unit: 'cái', quantity: 7, price: 99000, vatRate: 10, discountRate: 5, deliveryDate: '2026-11-01', note: 'Giữ ghi chú' };
  const [item] = model.synchronizeCustomerProductOrderItems([input], customer([catalog]));
  assert.equal(item.productCode, 'NEW');
  assert.equal(item.productName, 'Tên mới');
  assert.equal(item.size, '80 × 20 mm');
  assert.equal(item.unit, 'hộp');
  for (const key of ['quantity', 'price', 'vatRate', 'discountRate', 'deliveryDate', 'note']) assert.equal(item[key], input[key]);
  assert.equal(input.productCode, 'OLD');
});

test('stable identity rejects foreign or retired products and legacy codes resolve renamed products', () => {
  const catalog = { ...product(), productCode: 'NEW', previousProductCodes: ['TEM001'] };
  assert.equal(model.findCustomerProductForOrderItem({ productCode: 'tem001' }, [catalog]).id, catalog.id);
  assert.equal(model.findCustomerProductForOrderItem({ customerProductId: 'foreign', productCode: 'NEW' }, [catalog]), undefined);
  assert.throws(() => model.synchronizeCustomerProductOrderItems([{ customerProductId: 'foreign', productCode: 'NEW' }], customer([catalog])), /không còn hợp lệ/);
  assert.throws(() => model.synchronizeCustomerProductOrderItems([{ customerProductId: catalog.id }], customer([{ ...catalog, deleted: true }])), /không còn hợp lệ/);
  assert.throws(() => model.synchronizeCustomerProductOrderItems([], customer([catalog])), /ít nhất một/);
  assert.throws(() => model.synchronizeCustomerProductOrderItems([{ customerProductId: catalog.id }], { ...customer([catalog]), deleted: true }), /không còn hoạt động/);
});

test('technical summaries reflect current values and do not print attachment objects', () => {
  const specs = { width: 60, processing: ['Cán bóng', 'Ép kim'], fields: [
    { id: 'width', label: 'Chiều rộng', type: 'number', value: 50 },
    { id: 'processing', label: 'Gia công', type: 'checkboxes', value: [] },
    { id: 'windDirectionFiles', label: 'Ảnh', type: 'file', value: [{ url: 'file' }] }
  ] };
  assert.deepEqual(model.getCustomerProductSpecSummary(specs, 'tem_mau_cuon'), [
    { id: 'width', label: 'Chiều rộng', value: '60' },
    { id: 'processing', label: 'Gia công', value: 'Cán bóng, Ép kim' }
  ]);
});
