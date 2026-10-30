import { calculatePOItemFinancials } from '@/domain/poFinancials';
import {
  companyHeaderHtml,
  escapeHtml,
  formatPrintDate,
  formatPrintNumber,
  infoGridHtml,
  longDateLabel,
  printDocumentHtml,
  signaturesHtml,
  titleHtml
} from '@/shared/print/printSheet';
import { vietnameseAmountWords } from '@/shared/utils/vietnameseAmountWords';

interface PrintableOrderItem extends Record<string, unknown> {
  productCode?: string;
  productName?: string;
  size?: string;
  material?: string;
  specification?: string;
  unit?: string;
  quantity?: number;
  deliveryDate?: string;
}

/** The fields of a saved order the sheet reads; customer data comes from the snapshot taken when the order was made. */
export interface PrintableOrder extends Record<string, unknown> {
  poCode?: string;
  customerPoCode?: string;
  customerName?: string;
  customerSnapshot?: Record<string, unknown>;
  expectedDeliveryDate?: string;
  notes?: string;
  items?: PrintableOrderItem[];
  createdAt?: string;
  createdBy?: string;
}

const text = (value: unknown) => String(value ?? '').trim();
const money = (value: number) => formatPrintNumber(Math.round(value), 0);

function specificationOf(item: PrintableOrderItem) {
  const main = text(item.size) || text(item.specification);
  const material = text(item.material);
  return `${escapeHtml(main || '—')}${material ? `<small>${escapeHtml(material)}</small>` : ''}`;
}

function discountOf(financials: ReturnType<typeof calculatePOItemFinancials>) {
  if (financials.discountAmount <= 0) return '';
  return financials.discountType === 'percent'
    ? `${formatPrintNumber(financials.discountRate)}%`
    : money(financials.discountAmount);
}

/** The total quantity is only shown when every line counts in the same unit; units are never converted. */
function quantityTotal(items: PrintableOrderItem[]) {
  const units = new Set(items.map(item => text(item.unit)));
  if (units.size !== 1) return '';
  return formatPrintNumber(items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0));
}

/** Đơn đặt hàng to send to the customer: lines, VAT, totals in figures and in words, and signatures. */
export function orderSheetHtml(order: PrintableOrder) {
  const items = order.items || [];
  const customer = order.customerSnapshot || {};
  const lines = items.map(item => ({ item, financials: calculatePOItemFinancials(item) }));
  const sum = (pick: (financials: ReturnType<typeof calculatePOItemFinancials>) => number) =>
    lines.reduce((total, line) => total + pick(line.financials), 0);
  const gross = sum(financials => financials.grossAmount);
  const discount = sum(financials => financials.discountAmount);
  const beforeVat = sum(financials => financials.amountBeforeVat);
  const vat = sum(financials => financials.vatAmount);
  const payable = sum(financials => financials.amountWithVat);
  const orderDate = text(order.createdAt);

  const rows = lines
    .map(
      ({ item, financials }, index) => `<tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.productCode || '')}</td>
        <td>${escapeHtml(item.productName || '')}</td>
        <td>${specificationOf(item)}</td>
        <td class="center">${escapeHtml(item.unit || '')}</td>
        <td class="num">${formatPrintNumber(financials.quantity)}</td>
        <td class="num">${money(financials.unitPrice)}</td>
        <td class="num">${discountOf(financials)}</td>
        <td class="num">${money(financials.amountBeforeVat)}</td>
        <td class="center">${formatPrintNumber(financials.vatRate)}%</td>
        <td class="num">${money(financials.amountWithVat)}</td>
        <td class="center">${formatPrintDate(text(item.deliveryDate) || text(order.expectedDeliveryDate))}</td>
      </tr>`
    )
    .join('');

  const body = `
  ${companyHeaderHtml([
    { label: 'Số đơn hàng:', value: text(order.poCode) },
    { label: 'Số PO khách:', value: text(order.customerPoCode) },
    { label: 'Ngày đặt:', value: formatPrintDate(orderDate) }
  ])}
  ${titleHtml('ĐƠN ĐẶT HÀNG', `Số đơn hàng: ${text(order.poCode) || '……………'}`)}
  ${infoGridHtml([
    { label: 'Kính gửi', value: text(customer.companyName) || text(order.customerName) },
    { label: 'Mã khách hàng', value: text(customer.customerCode) },
    { label: 'Địa chỉ', value: text(customer.address) },
    { label: 'Mã số thuế', value: text(customer.taxCode) },
    { label: 'Người liên hệ', value: text(customer.contactPerson) },
    { label: 'Điện thoại', value: text(customer.phone) },
    { label: 'Email', value: text(customer.email) },
    { label: 'Ngày giao dự kiến', value: formatPrintDate(text(order.expectedDeliveryDate)) }
  ])}
  <table>
    <colgroup><col style="width:4%"><col style="width:9%"><col style="width:16%"><col style="width:15%">
      <col style="width:5%"><col style="width:7%"><col style="width:8%"><col style="width:6%"><col style="width:10%">
      <col style="width:5%"><col style="width:10%"><col style="width:7%"></colgroup>
    <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng hóa</th><th>Quy cách</th><th>ĐVT</th><th>Số lượng</th>
      <th>Đơn giá</th><th>Chiết khấu</th><th>Thành tiền chưa VAT</th><th>Thuế GTGT</th><th>Thành tiền gồm VAT</th>
      <th>Ngày giao</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="12" class="center">Đơn hàng chưa có mặt hàng.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5" class="center">TỔNG CỘNG</td><td class="num">${quantityTotal(items)}</td>
      <td></td><td class="num">${discount > 0 ? money(discount) : ''}</td><td class="num">${money(beforeVat)}</td>
      <td></td><td class="num">${money(payable)}</td><td></td></tr></tfoot>
  </table>
  <table class="sheet-totals">
    <colgroup><col style="width:70%"><col style="width:30%"></colgroup>
    <tbody>
      <tr><td>Tổng tiền hàng</td><td class="num">${money(gross)}</td></tr>
      <tr><td>Chiết khấu</td><td class="num">${money(discount)}</td></tr>
      <tr><td>Tiền hàng sau chiết khấu (chưa VAT)</td><td class="num">${money(beforeVat)}</td></tr>
      <tr><td>Thuế GTGT</td><td class="num">${money(vat)}</td></tr>
      <tr class="sheet-grand-total"><td>Tổng thanh toán</td><td class="num">${money(payable)}</td></tr>
      <tr><td colspan="2"><i>Bằng chữ: ${escapeHtml(vietnameseAmountWords(payable))}.</i></td></tr>
    </tbody>
  </table>
  <h2>Ghi chú</h2><div class="sheet-note">${escapeHtml(order.notes || '')}</div>
  ${signaturesHtml(
    [
      { title: 'Khách hàng xác nhận' },
      { title: 'Người lập đơn', name: text(order.createdBy) },
      { title: 'Phụ trách bộ phận' },
      { title: 'Giám đốc' }
    ],
    longDateLabel(orderDate)
  )}
  <p class="sheet-footer">${escapeHtml(text(order.poCode))} · Đơn đặt hàng · Số tiền làm tròn đến đồng.</p>`;
  return printDocumentHtml(text(order.poCode) || 'Đơn đặt hàng', body);
}
