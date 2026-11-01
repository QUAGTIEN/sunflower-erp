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
import {
  PRODUCTION_PRIORITIES,
  PRODUCTION_STATUSES,
  type ProductionLine,
  type ProductionOrder
} from './productionOrder';

const text = (value: unknown) => String(value ?? '').trim();
const unique = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))];

/** Formal black-and-white form: no fills or brand colours, so it prints and photocopies the same everywhere. */
const MONOCHROME_CSS = `
body{color:#000}
.sheet-header{border-bottom:1.5px solid #000}
.sheet-company b,h2{color:#000}
.sheet-references dt,.sheet-info dt,small{color:#000}
.sheet-title h1{font-size:22px;letter-spacing:1px}
.sheet-info{padding:6px 8px;border:1px solid #000}
th,td{border-color:#000}
th{background:none;text-transform:uppercase;font-size:10px}
tfoot td{background:none}
.sheet-note{border-color:#000}
.sheet-cancelled{margin:0 0 8px;padding:5px;border:1.5px solid #000;text-align:center;font-weight:bold}
.sheet-footer{color:#000}
`;

function specificationCell(line: ProductionLine) {
  const spec = line.specifications || {};
  const size = spec.width && spec.height ? `R${text(spec.width)} × D${text(spec.height)} mm` : text(line.specification);
  const material = [text(spec.paperType) || text(line.material), text(spec.adhesive)].filter(Boolean).join(' · ');
  return `${escapeHtml(size)}${material ? `<small>${escapeHtml(material)}</small>` : ''}`;
}

function finishingCell(line: ProductionLine) {
  const spec = line.specifications || {};
  return [
    text(spec.dieCut) || text(spec.corner) ? `Góc: ${text(spec.dieCut) || text(spec.corner)}` : '',
    text(spec.perforated) ? `Răng cưa: ${text(spec.perforated)}` : '',
    text(spec.core) || text(spec.coreType) ? `Lõi: ${[text(spec.coreType), text(spec.core)].join(' ').trim()}` : '',
    formatPrintNumber(spec.metersPerRoll) ? `${formatPrintNumber(spec.metersPerRoll)} m/cuộn` : '',
    formatPrintNumber(spec.qtyPerRoll) ? `${formatPrintNumber(spec.qtyPerRoll)} tem/cuộn` : ''
  ]
    .filter(Boolean)
    .map(detail => `<small>${escapeHtml(detail)}</small>`)
    .join('');
}

function materialCell(line: ProductionLine) {
  const code = text(line.specifications?.paperCode) || text(line.catalog?.code);
  const width = text(line.printDetails?.materialWidth);
  return `${escapeHtml(code)}${width ? `<small>Khổ ${escapeHtml(width)} mm</small>` : ''}`;
}

function lineRowHtml(order: ProductionOrder, line: ProductionLine, index: number) {
  const accepted = order.status === 'completed' ? formatPrintNumber(line.goodQuantity) : '';
  return `<tr>
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(line.productCode || line.catalog?.code || 'Nhập tay')}</td>
    <td>${escapeHtml(line.productName)}</td>
    <td>${specificationCell(line)}</td>
    <td>${finishingCell(line)}</td>
    <td class="center">${escapeHtml(line.unit)}</td>
    <td class="num">${formatPrintNumber(line.quantity)}</td>
    <td>${escapeHtml(line.customerName || '')}<small>${escapeHtml(line.poCode || '')}</small></td>
    <td>${materialCell(line)}</td>
    <td class="num">${accepted}</td>
  </tr>`;
}

/** The total is only meaningful when every line counts in the same unit; units are never converted (B6). */
function quantityTotal(lines: ProductionLine[]) {
  const units = unique(lines.map(line => line.unit));
  if (units.length !== 1) return '';
  return formatPrintNumber(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0));
}

function materialsHtml(order: ProductionOrder) {
  const rows = order.materials.length
    ? order.materials
        .map(
          (material, index) => `<tr>
            <td class="center">${index + 1}</td>
            <td>${escapeHtml(material.code)}</td>
            <td>${escapeHtml(material.name)}</td>
            <td class="center">${escapeHtml(material.width)}</td>
            <td class="center">${escapeHtml(material.unit)}</td>
            <td class="num">${formatPrintNumber(material.quantity)}</td>
            <td class="num">${formatPrintNumber(material.allowancePercent)}</td>
            <td></td>
            <td></td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="9" class="center">Chưa khai báo vật tư dự kiến.</td></tr>';
  return `<h2>Vật tư dự kiến sử dụng</h2>
  <table>
    <colgroup><col style="width:4%"><col style="width:13%"><col style="width:27%"><col style="width:8%">
      <col style="width:7%"><col style="width:10%"><col style="width:8%"><col style="width:11%"><col style="width:12%">
    </colgroup>
    <thead><tr><th>STT</th><th>Mã VT</th><th>Tên VT</th><th>Khổ (mm)</th><th>ĐVT</th><th>SL dự kiến</th>
      <th>Hao hụt (%)</th><th>SL lĩnh thực tế</th><th>Ghi chú</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * The one production order sheet (A4 landscape) for every order, old and new: a formal black-and-white form.
 * Fields the company has not supplied yet print as blanks to fill in by hand.
 */
export function productionPrintHtml(order: ProductionOrder) {
  const issuedAt = order.releasedAt || order.createdAt;
  const customers = unique(order.customerNames?.length ? order.customerNames : [order.customerName]);
  const poCodes = unique(order.poCodes?.length ? order.poCodes : [order.poCode]);
  const machine = [order.machineName || order.machineId, order.shift].map(text).filter(Boolean).join(' / ');
  const body = `
  ${companyHeaderHtml([
    { label: 'Số phiếu:', value: order.lsxCode },
    { label: 'Lần sửa đổi:', value: String(order.revision ?? '') },
    { label: 'Ngày lập:', value: formatPrintDate(order.createdAt) }
  ])}
  ${titleHtml('LỆNH SẢN XUẤT', longDateLabel(issuedAt))}
  ${
    order.status === 'cancelled'
      ? `<p class="sheet-cancelled">${escapeHtml(PRODUCTION_STATUSES.cancelled)} — KHÔNG DÙNG ĐỂ TRIỂN KHAI SẢN XUẤT</p>`
      : ''
  }
  ${infoGridHtml(
    [
      { label: 'Khách hàng', value: customers.join(', ') },
      { label: 'Đơn hàng', value: poCodes.join(', ') },
      { label: 'Người lập lệnh', value: order.createdBy },
      { label: 'Mức ưu tiên', value: PRODUCTION_PRIORITIES[order.priority] || order.priority },
      { label: 'Bắt đầu dự kiến', value: formatPrintDate(order.plannedStartDate || '') },
      { label: 'Hoàn thành dự kiến', value: formatPrintDate(order.plannedEndDate || '') },
      { label: 'Hạn giao hàng', value: formatPrintDate(order.deliveryDeadline) },
      { label: 'Máy / ca', value: machine },
      { label: 'Người chạy máy', value: order.operatorName }
    ],
    3
  )}
  <table>
    <colgroup><col style="width:4%"><col style="width:10%"><col style="width:17%"><col style="width:15%">
      <col style="width:14%"><col style="width:5%"><col style="width:8%"><col style="width:12%"><col style="width:9%">
      <col style="width:6%"></colgroup>
    <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>Quy cách / chất liệu</th><th>Gia công</th>
      <th>ĐVT</th><th>Số lượng</th><th>Khách hàng / đơn hàng</th><th>Mã NVL / khổ</th><th>Đạt QC</th></tr></thead>
    <tbody>${order.lines.map((line, index) => lineRowHtml(order, line, index)).join('')}</tbody>
    <tfoot><tr><td colspan="6">Tổng cộng</td><td class="num">${quantityTotal(order.lines)}</td>
      <td colspan="3"></td></tr></tfoot>
  </table>
  ${materialsHtml(order)}
  <h2>Yêu cầu kỹ thuật</h2><div class="sheet-note">${escapeHtml(order.technicalNotes || '')}</div>
  <h2>Ghi chú</h2><div class="sheet-note">${escapeHtml(order.notes || '')}</div>
  ${signaturesHtml(
    [
      { title: 'Người lập lệnh', name: order.createdBy },
      { title: 'Người chạy máy', name: order.operatorName },
      { title: 'Thủ kho' },
      { title: 'Kiểm tra chất lượng' },
      { title: 'Giám đốc' }
    ],
    longDateLabel(issuedAt)
  )}
  <p class="sheet-footer">${escapeHtml(order.lsxCode)} · Bản lệnh ${escapeHtml(order.revision)}.
    Xuất phiếu không đổi trạng thái lệnh hoặc tồn kho.</p>`;
  return printDocumentHtml(order.lsxCode, body, 'landscape', MONOCHROME_CSS);
}
