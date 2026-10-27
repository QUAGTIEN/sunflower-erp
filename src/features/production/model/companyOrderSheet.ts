import latinFont from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import vietnameseFont from '@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2?url';
import { PRODUCTION_STATUSES, linePoId, type ProductionLine, type ProductionOrder } from './productionOrder';

const LINES_PER_SHEET = 8;
const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
const number = (value: unknown) =>
  value === undefined || value === null || value === '' || !Number.isFinite(Number(value))
    ? ''
    : Number(value).toLocaleString('vi-VN');
const date = (value: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '';
const chunk = <T>(values: T[], size: number) =>
  Array.from({ length: Math.max(1, Math.ceil(values.length / size)) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
const PRIORITY_LABELS: Record<string, string> = { urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' };
const checkbox = (checked: boolean, label: string) =>
  `<span class="check"><i class="${checked ? 'on' : ''}"></i>${escape(label)}</span>`;
const text = (value: unknown) => String(value ?? '').trim();

function specificationCell(line: ProductionLine) {
  const spec = line.specifications;
  const size = spec.width && spec.height ? `R${text(spec.width)} × D${text(spec.height)} mm` : text(line.specification);
  const material = [text(spec.paperType) || text(line.material), text(spec.adhesive)].filter(Boolean).join(' · ');
  return `<b>${escape(size || '—')}</b>${material ? `<small>${escape(material)}</small>` : ''}`;
}

function materialCell(line: ProductionLine) {
  const spec = line.specifications;
  const code = text(spec.paperCode) || text(line.catalog?.code);
  const width = text(line.printDetails?.materialWidth);
  return `<b>${escape(code || '—')}</b>${width ? `<small>Khổ ${escape(width)} mm</small>` : ''}<span class="write">SL lĩnh: ………………</span>`;
}

function lineRow(order: ProductionOrder, line: ProductionLine, index: number) {
  const spec = line.specifications;
  const linePriority = line.printDetails?.priority;
  const corner = text(spec.dieCut) || text(spec.corner);
  const core = [text(spec.coreType), text(spec.core)].filter(Boolean).join(' ');
  const qc =
    order.status === 'completed'
      ? `<small>QC đạt ${number(line.goodQuantity)} · hỏng ${number(line.rejectQuantity)}</small>`
      : '';
  return `<tr>
    <td class="center">${index + 1}</td>
    <td><b>${escape(line.productCode || 'Nhập tay')}</b><small>${escape(line.productName)}</small>${line.catalog ? `<small class="muted">Mã nội bộ ${escape(line.catalog.code)}</small>` : ''}</td>
    <td class="center">${escape(line.poCode || order.poCode || linePoId(line, order))}</td>
    <td>${specificationCell(line)}</td>
    <td class="number"><b>${number(line.quantity)}</b><small>${escape(line.unit)}</small></td>
    <td class="center">${escape(number(spec.metersPerRoll) ? `${number(spec.metersPerRoll)} m` : '')}</td>
    <td class="center">${escape(number(spec.qtyPerRoll) || number(spec.qtyPerSheet))}</td>
    <td class="center">${escape(corner)}</td>
    <td class="center">${escape(text(spec.perforated))}</td>
    <td class="center">${escape(core)}</td>
    <td>${materialCell(line)}</td>
    <td class="center">${qc}</td>
    <td>${linePriority && linePriority !== order.priority ? `<b>Ưu tiên: ${escape(PRIORITY_LABELS[linePriority] || linePriority)}</b>` : ''}</td>
  </tr>`;
}

function metaBox(order: ProductionOrder) {
  const poCodes = order.poCodes?.length ? order.poCodes.join(', ') : order.poCode;
  return `<section class="meta">
    <div class="fields">
      <p><span>STT LSX</span><b>${escape(order.lsxCode)}</b></p>
      <p><span>NGÀY CẦN</span><b>${date(order.deliveryDeadline)}</b></p>
      <p><span>MÃ KH</span><b>${escape(order.customerCode || '')}</b></p>
      <p><span>KHÁCH HÀNG</span><b>${escape(order.customerName)}</b></p>
      <p><span>NGÀY LÊN LỆNH</span><b>${date(order.createdAt)}</b></p>
      <p><span>NGƯỜI XUỐNG ĐƠN</span><b>${escape(order.createdBy)}</b></p>
      <p><span>PO</span><b>${escape(poCodes)}</b></p>
      <p><span>MÁY / CA</span><b>${escape([order.machineName, order.shift].filter(Boolean).join(' / '))}</b></p>
      <p class="wide"><span>NGƯỜI CHẠY MÁY</span><b>${escape(order.operatorName || '')}</b></p>
    </div>
    <div class="status"><h3>TÌNH TRẠNG</h3>
      <div class="checks">${checkbox(order.priority === 'urgent', 'Gấp')}${checkbox(order.priority === 'high', 'Hơi gấp')}${checkbox(order.priority === 'normal', 'Bình thường')}</div>
      <div class="very-urgent"><i></i>RẤT GẤP</div>
    </div>
    <div class="general"><h3>GHI CHÚ CHUNG</h3><p>${escape(order.notes) || '&nbsp;'}</p></div>
  </section>`;
}

function materialsTable(order: ProductionOrder) {
  if (!order.materials.length) return '';
  const rows = order.materials
    .map(
      (material, index) =>
        `<tr><td class="center">${index + 1}</td><td><b>${escape(material.code)}</b> ${escape(material.name)}</td><td class="center">${escape(material.width)}</td><td class="number">${number(material.quantity)} ${escape(material.unit)}</td><td class="number">${number(material.allowancePercent)}%</td></tr>`
    )
    .join('');
  return `<table class="materials"><thead><tr><th>STT</th><th>VẬT TƯ DỰ KIẾN (không phải phiếu xuất kho)</th><th>KHỔ (mm)</th><th>SỐ LƯỢNG</th><th>HAO HỤT</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const STYLE = `
@font-face{font-family:Inter;src:url("${escape(latinFont)}") format("woff2");font-weight:100 900}
@font-face{font-family:Inter;src:url("${escape(vietnameseFont)}") format("woff2");font-weight:100 900;unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}
@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{margin:0;color:#1f2a24;font:8.5pt Inter,sans-serif}
.sheet{break-after:page}.sheet:last-child{break-after:auto}
header{display:grid;grid-template-columns:22% 1fr 22%;align-items:center;gap:10px}
header img{width:100%;max-height:56px;object-fit:contain}
.title{text-align:center}.title b{display:block;color:#0a8a3a;font-size:22pt;font-weight:800;letter-spacing:1px}
.title h1{margin:4px auto 0;padding:6px 18px;width:max-content;max-width:100%;border-radius:22px;background:#0a8a3a;color:#fff;font-size:15pt}
.done{align-self:start;text-align:right;font-size:8pt}.done span{display:block;margin-top:14px;border-bottom:1px dotted #6b7c72}
.warning{margin:6px 0;padding:4px;border:1px solid #b45309;color:#9a3412;font-weight:700;text-align:center}
.meta{display:grid;grid-template-columns:2.2fr 0.9fr 1.3fr;gap:0;margin-top:8px;border:1.5px solid #3d4a43;border-radius:10px;background:#fffbe6;overflow:hidden}
.meta>div{padding:6px 8px;border-right:1px solid #c9c3a3}.meta>div:last-child{border-right:0}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px}.fields p{display:flex;gap:6px;margin:0;align-items:baseline}
.fields .wide{grid-column:1/-1}.fields span{flex:none;width:96px;font-size:7pt;font-weight:700}.fields b{flex:1;min-width:0;border-bottom:1px solid #8a8670;overflow-wrap:anywhere}
h3{margin:0 0 4px;font-size:7.5pt;text-align:center}.checks{display:grid;gap:4px}.check{display:flex;align-items:center;gap:5px;font-size:7.5pt}
.check i,.very-urgent i{display:inline-block;width:11px;height:11px;border:1.2px solid #3d4a43;background:#fff}.check i.on{background:#0a8a3a;box-shadow:inset 0 0 0 2px #fff}
.very-urgent{display:flex;align-items:center;gap:6px;margin-top:6px;padding:4px 6px;border:1.5px solid #3d4a43;font-weight:800}
.general p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
table{width:100%;margin-top:8px;border-collapse:collapse;table-layout:fixed}
th,td{padding:4px 5px;border:1px solid #3d4a43;vertical-align:middle;overflow-wrap:anywhere}
th{background:#c6efce;font-size:7pt;font-weight:700;text-align:center}
.lines tbody td{height:15mm}td small{display:block;font-size:7pt;color:#43544a}.muted{color:#6b7c72}
.center{text-align:center}.number{text-align:right;font-variant-numeric:tabular-nums}
.write{display:block;margin-top:3px;color:#6b7c72;font-size:7pt}
.note{margin-top:6px;padding:6px 8px;border:1px solid #3d4a43;font-size:12pt;font-weight:800;white-space:pre-wrap;overflow-wrap:anywhere}
.materials td{height:6mm}
.confirm{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px;break-inside:avoid}
.confirm div{display:flex;flex-direction:column}.confirm b{font-size:7.5pt;text-align:center}.confirm span{height:22mm;margin-top:3px;background:#fffbe6;border:1px solid #d6cf9f}
footer{display:flex;justify-content:space-between;margin-top:6px;color:#43544a;font-size:7pt}
thead{display:table-header-group}tr{break-inside:avoid}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;

/**
 * Company white-label production order (template v2), following the form provided on 27/10/2026, with the PO
 * and quantity of every line. Hand-filled areas (NVL issued, remaining material, signatures) stay blank.
 */
export function companyOrderSheetHtml(order: ProductionOrder) {
  const pages = chunk(order.lines, LINES_PER_SHEET);
  const warning = ['draft', 'pending_approval', 'cancelled'].includes(order.status)
    ? `<div class="warning">${escape(PRODUCTION_STATUSES[order.status])} — KHÔNG DÙNG ĐỂ TRIỂN KHAI SẢN XUẤT</div>`
    : '';
  const header = `<header><img src="/sunflower-logo-horizontal-transparent.png" alt="SUNFLOWER"><div class="title"><b>SUNFLOWER</b><h1>PHIẾU LỆNH SẢN XUẤT TEM TRẮNG</h1></div><div class="done">Thời gian hoàn thành đơn<span>&nbsp;</span></div></header>`;
  const sheets = pages
    .map((lines, page) => {
      const last = page === pages.length - 1;
      return `<section class="sheet">${header}${warning}${metaBox(order)}
      <table class="lines"><colgroup>${[3, 13, 7, 12, 7, 5, 5, 5, 6, 6, 13, 7, 11].map(width => `<col style="width:${width}%">`).join('')}</colgroup>
      <thead><tr><th>STT</th><th>MÃ LIỆU / TÊN HÀNG</th><th>PO</th><th>QUY CÁCH</th><th>SỐ LƯỢNG</th><th>MÉT /ROLL</th><th>PCS /ROLL</th><th>LOẠI GÓC</th><th>LOẠI RĂNG CƯA</th><th>LOẠI LÕI</th><th>MÃ NGUYÊN VẬT LIỆU<br>SỐ LƯỢNG NVL LĨNH</th><th>TÌNH TRẠNG</th><th>GHI CHÚ RIÊNG</th></tr></thead>
      <tbody>${lines.map((line, index) => lineRow(order, line, page * LINES_PER_SHEET + index)).join('')}</tbody></table>
      ${last ? `${order.notes ? `<div class="note">${escape(order.notes)}</div>` : ''}${materialsTable(order)}` : ''}
      <section class="confirm"><div><b>NVL THỪA / THIẾU</b><span></span></div><div><b>XÁC NHẬN NGƯỜI CHẠY MÁY</b><span></span></div><div><b>XÁC NHẬN KHO CẤP + NHẬN NVL</b><span></span></div></section>
      <footer><span>SUNFLOWER · ${escape(order.lsxCode)} · Mẫu tem trắng v2 · Bản lệnh ${order.revision}. Xuất phiếu không đổi trạng thái lệnh hoặc tồn kho.</span><span>Trang ${page + 1} / ${pages.length}</span></footer></section>`;
    })
    .join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escape(order.lsxCode)}</title><style>${STYLE}</style></head><body>${sheets}</body></html>`;
}
