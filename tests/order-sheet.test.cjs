const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

const words = createLoader()('src/shared/utils/vietnameseAmountWords.ts').vietnameseAmountWords;
const sheet = createLoader()('src/features/sales/model/orderSheet.ts');

test('amounts are read in Vietnamese words for documents', () => {
  assert.equal(words(0), 'Không đồng');
  assert.equal(words(15), 'Mười lăm đồng');
  assert.equal(words(21), 'Hai mươi mốt đồng');
  assert.equal(words(105), 'Một trăm linh năm đồng');
  assert.equal(words(1005000), 'Một triệu không trăm linh năm nghìn đồng');
  assert.equal(words(50550998), 'Năm mươi triệu năm trăm năm mươi nghìn chín trăm chín mươi tám đồng');
  assert.equal(words(2000000000), 'Hai tỷ đồng');
});

const order = {
  poCode: 'DH-2610-0001',
  customerPoCode: 'KH-PO-77',
  customerName: 'Tên khách hiện tại',
  customerSnapshot: {
    companyName: '[TEST] Công ty Bao Bì An Phát',
    customerCode: 'KH-0001',
    address: 'Hà Nội',
    taxCode: '9990000001',
    phone: '0900000001'
  },
  expectedDeliveryDate: '2026-11-05T00:00:00.000Z',
  createdAt: '2026-10-30T03:00:00.000Z',
  createdBy: 'Sale A',
  notes: '<script>alert(1)</script>',
  items: [
    {
      productCode: 'TP-AQUA-001',
      productName: 'Tem decal',
      size: 'R80 × D55 mm',
      unit: 'cuộn',
      quantity: 100,
      price: 48000,
      vatRate: 8,
      discountType: 'percent',
      discountRate: 0
    },
    {
      productCode: 'TP-AQUA-002',
      productName: 'Tem màu',
      size: '80×100',
      unit: 'cái',
      quantity: 240,
      price: 686,
      vatRate: 8,
      discountType: 'percent',
      discountRate: 10
    }
  ]
};

test('the order sheet prints the customer snapshot, every line, VAT totals and the amount in words', () => {
  const html = sheet.orderSheetHtml(order);
  for (const label of [
    'ĐƠN ĐẶT HÀNG',
    'DH-2610-0001',
    'KH-PO-77',
    '[TEST] Công ty Bao Bì An Phát',
    '9990000001',
    'TP-AQUA-001',
    'TP-AQUA-002',
    '4.800.000',
    '10%',
    'Tổng thanh toán',
    'Bằng chữ',
    'Khách hàng xác nhận',
    'Người lập đơn',
    'Giám đốc',
    'Sale A',
    '05/11/2026'
  ])
    assert.ok(html.includes(label), label);
  // 4.800.000 + 164.640 - 16.464 = 4.948.176 before VAT; with 8% VAT = 5.344.030
  assert.ok(html.includes('5.344.030'));
  assert.ok(html.includes('Năm triệu ba trăm bốn mươi bốn nghìn không trăm ba mươi đồng'));
  assert.ok(!html.includes('Tên khách hiện tại'), 'the snapshot taken with the order is printed, not the live name');
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /TỔNG CỘNG<\/td><td class="num"><\/td>/, 'cuộn and cái are never added together');
});

test('the order page exports the order sheet from the detail header and the row menu', () => {
  const page = readSource('src/features/sales/pages/SalesPage.tsx');
  assert.match(page, /onPrint=\{\(\) => setPrintPO\(viewPO\)\}/);
  assert.match(
    readSource('src/features/sales/components/orderDetail/OrderViewParts.tsx'),
    /<IconButton\s+label="Xuất phiếu đơn hàng"\s+icon=\{<Printer size=\{16\} \/>\}\s+onClick=\{onPrint\}/
  );
  assert.match(page, /label: 'Xuất đơn hàng', onSelect: \(\) => setPrintPO\(po\)/);
  assert.match(page, /<PrintPreviewDialog[\s\S]{0,200}html=\{orderSheetHtml\(printPO\)\}/);
});
