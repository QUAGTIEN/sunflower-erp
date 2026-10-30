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
import { PRODUCTION_STATUSES, type ProductionLine, type ProductionOrder } from './productionOrder';

const PRIORITY_LABELS: Record<string, string> = { urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' };
/** Orders not yet released must not be run from paper. */
const UNRELEASED_STATUSES = ['draft', 'pending_approval', 'cancelled'];
const text = (value: unknown) => String(value ?? '').trim();
const unique = (values: unknown[]) => [...new Set(values.map(text).filter(Boolean))];

function specificationCell(line: ProductionLine) {
  const spec = line.specifications || {};
  const details = [
    text(spec.dieCut) || text(spec.corner) ? `Góc: ${text(spec.dieCut) || text(spec.corner)}` : '',
    text(spec.perforated) ? `Răng cưa: ${text(spec.perforated)}` : '',
    text(spec.core) || text(spec.coreType) ? `Lõi: ${[text(spec.coreType), text(spec.core)].join(' ').trim()}` : ''
  ].filter(Boolean);
  return [
    escapeHtml(line.specification || '—'),
    line.material ? `<small>${escapeHtml(line.material)}</small>` : '',
    details.length ? `<small>${escapeHtml(details.join(' · '))}</small>` : ''
  ].join('');
}

function lineRowHtml(line: ProductionLine, index: number) {
  const code = line.productCode || line.catalog?.code || 'Nhập tay';
  return `<tr>
    <td class="center">${index + 1}</td>
    <td>${escapeHtml(code)}</td>
    <td>${escapeHtml(line.productName)}</td>
    <td>${specificationCell(line)}</td>
    <td class="center">${escapeHtml(line.unit)}</td>
    <td class="num">${formatPrintNumber(line.quantity)}</td>
    <td>${escapeHtml(line.customerName || '')}</td>
    <td>${escapeHtml(line.poCode || '')}</td>
    <td></td>
  </tr>`;
}

/** The total is only meaningful when every line counts in the same unit; units are never converted (B6). */
function quantityTotal(lines: ProductionLine[]) {
  const units = unique(lines.map(line => line.unit));
  if (units.length !== 1) return '';
  return `${formatPrintNumber(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0))}`;
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

/** Lệnh sản xuất on one A4 landscape sheet, laid out like the standard Vietnamese factory order form. */
export function productionOrderSheetHtml(order: ProductionOrder) {
  const issuedAt = order.releasedAt || order.createdAt;
  const customers = unique(order.customerNames?.length ? order.customerNames : [order.customerName]);
  const poCodes = unique(order.poCodes?.length ? order.poCodes : [order.poCode]);
  const machine = [order.machineName || order.machineId, order.shift].map(text).filter(Boolean).join(' / ');
  const body = `
  ${companyHeaderHtml([
    { label: 'Số phiếu:', value: order.lsxCode },
    { label: 'Lần sửa đổi:', value: String(order.revision ?? '') },
    { label: 'Trạng thái:', value: PRODUCTION_STATUSES[order.status] || order.status }
  ])}
  ${titleHtml('LỆNH SẢN XUẤT', `Ngày ban hành: ${longDateLabel(issuedAt)}`)}
  ${
    UNRELEASED_STATUSES.includes(order.status)
      ? `<p class="sheet-draft">${escapeHtml(PRODUCTION_STATUSES[order.status])} — KHÔNG DÙNG ĐỂ TRIỂN KHAI SẢN XUẤT</p>`
      : ''
  }
  ${infoGridHtml(
    [
      { label: 'Khách hàng', value: customers.join(', ') },
      { label: 'Đơn hàng', value: poCodes.join(', ') },
      { label: 'Bắt đầu dự kiến', value: formatPrintDate(order.plannedStartDate || '') },
      { label: 'Hoàn thành dự kiến', value: formatPrintDate(order.plannedEndDate || '') },
      { label: 'Hạn giao hàng', value: formatPrintDate(order.deliveryDeadline) },
      { label: 'Mức ưu tiên', value: PRIORITY_LABELS[order.priority] || order.priority },
      { label: 'Máy / ca', value: machine },
      { label: 'Người chạy máy', value: order.operatorName }
    ],
    4
  )}
  <table>
    <colgroup><col style="width:4%"><col style="width:12%"><col style="width:20%"><col style="width:20%">
      <col style="width:6%"><col style="width:9%"><col style="width:12%"><col style="width:9%"><col style="width:8%">
    </colgroup>
    <thead><tr><th>STT</th><th>Mã thành phẩm</th><th>Tên thành phẩm</th><th>Quy cách / chất liệu</th><th>ĐVT</th>
      <th>Số lượng</th><th>Khách hàng</th><th>Đơn hàng</th><th>Đạt QC</th></tr></thead>
    <tbody>${order.lines.map(lineRowHtml).join('')}</tbody>
    <tfoot><tr><td colspan="5">Tổng cộng</td><td class="num">${quantityTotal(order.lines)}</td>
      <td colspan="3"></td></tr></tfoot>
  </table>
  ${materialsHtml(order)}
  <h2>Yêu cầu kỹ thuật</h2><div class="sheet-note">${escapeHtml(order.technicalNotes || '')}</div>
  <h2>Ghi chú</h2><div class="sheet-note">${escapeHtml(order.notes || '')}</div>
  ${signaturesHtml(
    [
      { title: 'Người lập lệnh', name: order.createdBy },
      { title: 'Giám đốc sản xuất' },
      { title: 'Trưởng phòng KHSX' }
    ],
    longDateLabel(issuedAt)
  )}
  <p class="sheet-footer">${escapeHtml(order.lsxCode)} · Mẫu lệnh sản xuất A4 v1 · Bản lệnh ${escapeHtml(
    order.revision
  )}. Xuất phiếu không đổi trạng thái lệnh hoặc tồn kho.</p>`;
  return printDocumentHtml(order.lsxCode, body);
}
