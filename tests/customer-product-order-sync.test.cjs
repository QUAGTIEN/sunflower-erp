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

const manualItem = (overrides = {}) => ({
  itemId: 'manual-1', customerProductId: '', productCode: '', productName: 'Dịch vụ gia công',
  size: 'Theo bản vẽ', material: 'Vật tư khách cung cấp', unit: 'lần', quantity: 2, price: 120000,
  vatRate: 8, discountType: 'percent', discountRate: 5, note: 'Giao buổi sáng',
  specifications: { description: 'Yêu cầu riêng' }, previewImages: ['data:image/png;base64,demo'],
  ...overrides
});

test('customers without a product catalog can place orders using manual items with no product code', () => {
  const record = customer([]);
  const input = manualItem();
  const [saved] = model.synchronizeCustomerProductOrderItems([input], record);
  assert.equal(saved.customerProductId, '');
  assert.equal(saved.productCode, '');
  assert.equal(saved.productName, 'Dịch vụ gia công');
  for (const field of ['itemId', 'size', 'material', 'unit', 'quantity', 'price', 'vatRate', 'discountRate', 'note']) assert.equal(saved[field], input[field]);
  assert.deepEqual(saved.specifications, input.specifications);
  assert.deepEqual(saved.previewImages, input.previewImages);
  assert.deepEqual(record.products, []);
});

test('a single order can mix manual items and catalog snapshots without changing either source', () => {
  const catalog = product();
  const record = customer([catalog]);
  const selected = model.applyCustomerProductToOrderItem({ quantity: 5, price: 90000 }, catalog);
  const original = JSON.stringify([record, selected]);
  const [linked, manual] = model.synchronizeCustomerProductOrderItems([selected, manualItem()], record);
  assert.equal(linked.customerProductId, catalog.id);
  assert.equal(linked.productCode, catalog.productCode);
  assert.equal(linked.size, '50 × 30 mm');
  assert.equal(linked.price, 85000);
  assert.equal(manual.customerProductId, '');
  assert.equal(manual.productName, 'Dịch vụ gia công');
  assert.equal(JSON.stringify([record, selected]), original);
});

test('manual rows are not silently replaced by catalog products with the same code', () => {
  const catalog = product();
  const input = manualItem({ productCode: catalog.productCode, productName: 'Tên nhập tay', unit: 'bộ' });
  assert.equal(model.findCustomerProductForOrderItem(input, [catalog]), undefined);
  const [saved] = model.synchronizeCustomerProductOrderItems([input], customer([catalog]));
  assert.equal(saved.productName, 'Tên nhập tay');
  assert.equal(saved.unit, 'bộ');
  assert.equal(saved.size, 'Theo bản vẽ');
  assert.equal(saved.customerProductId, '');
  assert.equal(model.getCustomerProductOrderHistory(catalog, [{ id: 'po-manual', items: [saved] }]).orderCount, 0);
});

test('manual item validation rejects invalid values and preserves the input object', () => {
  for (const invalid of [
    { productName: ' ' }, { unit: ' ' }, { quantity: 0 }, { quantity: NaN },
    { quantity: -2 }, { price: -1 }, { price: Infinity }, { vatRate: -1 }, { vatRate: 101 }
  ]) assert.throws(() => model.synchronizeCustomerProductOrderItems([manualItem(invalid)], customer([])), /Dòng 1:/);
  const input = manualItem({ productCode: ' CUSTOM ', productName: ' Dịch vụ ', unit: ' lần ', quantity: '3', price: '1000' });
  const [saved] = model.synchronizeCustomerProductOrderItems([input], customer([]));
  assert.equal(saved.productCode, 'CUSTOM');
  assert.equal(saved.productName, 'Dịch vụ');
  assert.equal(saved.unit, 'lần');
  assert.equal(saved.quantity, 3);
  assert.equal(saved.price, 1000);
  assert.equal(input.productName, ' Dịch vụ ');
});
