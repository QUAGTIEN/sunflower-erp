import latinFont from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
import vietnameseFont from '@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2?url';
import { PRODUCTION_STATUSES, type ProductionLine, type ProductionOrder } from './productionOrder';

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
const number = (value: number | undefined) => (value === undefined ? '—' : value.toLocaleString('vi-VN'));
const priority = (value: string) => ({ urgent: 'Gấp', high: 'Hơi gấp', normal: 'Bình thường' })[value] || '—';
const date = (value: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';
const chunk = <T>(values: T[], size: number) =>
  Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const lineRow = (order: ProductionOrder, line: ProductionLine, index: number) => {
  const spec = line.specifications;
  const urgency = line.printDetails?.priority || order.priority;
  const image = /^(https?:\/\/|data:image\/(png|jpeg|webp);base64,)/i.test(line.image)
    ? `<img alt="Mẫu ${escape(line.productCode || line.productName)}" src="${escape(line.image)}">`
    : '<span class="muted">Chưa có hình mẫu</span>';
  return `<tr><td>${index + 1}</td><td><b>${escape(line.productCode || 'Nhập tay')}</b><div>${escape(line.productName)}</div>${line.catalog ? `<small>Mã nội bộ: ${escape(line.catalog.code)}</small>` : ''}</td>
    <td>${escape(line.specification || '—')}</td><td>${number(line.quantity)}<br><small>${escape(line.unit)}</small>${order.status === 'completed' ? `<div class="muted">QC đạt ${number(line.goodQuantity)} / hỏng ${number(line.rejectQuantity)}</div>` : ''}</td>
    <td>${escape(spec.dieCut || spec.corner || '—')}</td><td>${escape(spec.perforated || '—')}</td><td>${escape(spec.core || spec.windingCore || '—')}</td><td>${escape(spec.coreType || '—')}</td>
    <td>${escape(line.printDetails?.materialWidth || spec.paperWidth || spec.materialWidth || '—')}</td><td>${escape(spec.paperCode || '—')}<br><small>${escape(spec.paperType || line.material || '')}</small></td>
    <td><span class="priority priority-${escape(urgency)}">${escape(priority(urgency))}</span></td><td class="sample">${image}<div>${escape(line.specification)}</div></td></tr>`;
};

/** Version 1 reproduces the provided white-label form; it never invents issue/return/QC data. */
export function whiteLabelPrintHtml(order: ProductionOrder) {
  const linePages = chunk(order.lines, 6),
    materialPages = chunk(order.materials, 5);
  const pageCount = Math.max(1, linePages.length, materialPages.length);
  const notes = String(order.notes || '');
  const annex = notes.length > 240;
  const sheetCount = pageCount + (annex ? 1 : 0);
  const footer = (page: number) =>
    `<footer><span>SUNFLOWER · ${escape(order.lsxCode)} · Mẫu tem trắng v1 · Bản lệnh ${order.revision}</span><span>Trang ${page} / ${sheetCount}</span></footer>`;
  const header = `<header><div class="brand"><img src="/sunflower-logo-horizontal-transparent.png" alt="SUNFLOWER"></div><div class="company"><b>CÔNG TY TNHH SẢN XUẤT VÀ CÔNG NGHỆ SUNFLOWER</b><h1>PHIẾU LỆNH SẢN XUẤT TEM TRẮNG</h1></div><div class="tagline">Tem chất lượng<br>cho mọi ngành nghề</div></header>`;
  const warning = ['draft', 'pending_approval', 'cancelled'].includes(order.status)
    ? `<div class="warning">${escape(PRODUCTION_STATUSES[order.status])} — KHÔNG DÙNG ĐỂ TRIỂN KHAI SẢN XUẤT</div>`
    : '';
  const sheets = Array.from({ length: pageCount }, (_, index) => {
    const materials = materialPages[index] || [];
    return `<section class="sheet">${header}${warning}
      <section class="meta"><div><p><b>STT LSX:</b> ${escape(order.lsxCode)}</p><p><b>Mã khách hàng:</b> ${escape(order.customerCode || '—')}</p><p><b>Ngày lên lệnh:</b> ${date(order.createdAt)}</p></div>
        <div><p><b>Ngày cần:</b> ${date(order.deliveryDeadline)}</p><p><b>Người xuống đơn:</b> ${escape(order.createdBy)}</p><p><b>Người chạy máy:</b> ${escape(order.operatorName || 'Chưa phân công')}</p></div>
        <div><p><b>Tình trạng:</b> ${escape(priority(order.priority))}</p><p><b>Máy / ca:</b> ${escape(order.machineName || order.machineId || '—')} / ${escape(order.shift || '—')}</p><p><b>PO:</b> ${escape(order.poCode)}</p></div>
        <div><b>Ghi chú chung:</b><p class="note">${escape(notes.slice(0, 240) || '—')}</p>${annex ? '<small>Xem ghi chú đầy đủ ở trang cuối.</small>' : ''}</div></section>
      <table class="lines"><colgroup>${[3, 10, 14, 9, 7, 7, 5, 8, 7, 10, 8, 12].map(width => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr><th>STT</th><th>MÃ HÀNG<br>(Tem)</th><th>QUY CÁCH TEM<br>(R × D hoặc R × D × Mét)</th><th>SỐ LƯỢNG<br>ĐVT theo PO</th><th>Góc<br>(bo / vuông)</th><th>Răng cưa<br>(có / không)</th><th>Lõi<br>(mm)</th><th>Loại lõi<br>(giấy / nhựa)</th><th>Khổ NVL<br>(mm)</th><th>Mã NVL<br>(giấy màng keo)</th><th>Tình trạng</th><th>Hình mẫu</th></tr></thead><tbody>${(linePages[index] || []).map((line, position) => lineRow(order, line, index * 6 + position)).join('') || '<tr><td colspan="12">Tiếp phần vật tư của lệnh.</td></tr>'}</tbody></table>
      <section class="bottom"><article class="materials"><h2>VẬT TƯ SỬ DỤNG</h2><p class="caption">Kế hoạch dự kiến — không phải phiếu xuất kho</p><table><thead><tr><th>STT</th><th>Tên NVL</th><th>Khổ<br>(mm)</th><th>Mã NVL</th><th>Số lượng</th></tr></thead><tbody>${Array.from(
        { length: Math.max(5, materials.length) },
        (_, i) => {
          const material = materials[i];
          return `<tr><td>${material ? index * 5 + i + 1 : ''}</td><td>${escape(material?.name || '')}</td><td>${escape(material?.width || '')}</td><td>${escape(material?.code || '')}</td><td>${material ? `${number(material.quantity)} ${escape(material.unit)}` : ''}</td></tr>`;
        }
      ).join('')}</tbody></table></article>
      <article><h2>NVL KHO CẤP</h2><div class="box-fields"><p>Kho cấp: ........................................</p><p>Tên NVL: ........................................</p><p>Số lượng / ĐVT: ...............................</p><p>Người cấp: .....................................</p><p>Thời gian / số phiếu: ........................</p><small class="muted">Ghi theo chứng từ kho thực tế.</small></div></article>
      <article><h2>NVL THỪA / THIẾU SAU 1 ĐƠN</h2><div class="box-fields"><p>Thừa / ĐVT: ...................................</p><p>Thiếu / ĐVT: ...................................</p><p>Người kiểm: ...................................</p><p>Ngày kiểm: .....................................</p><small class="muted">Chưa hạch toán hoàn/cấp bổ sung.</small></div></article>
      <article><h2>XÁC NHẬN</h2><div class="signatures"><div>Người xuống đơn<small>(Ký ghi rõ họ tên)</small></div><div>Người chạy máy<small>(Ký ghi rõ họ tên)</small></div><div class="storekeeper">Thủ kho<small>(Ký ghi rõ họ tên)</small></div></div></article></section>
      <p class="disclaimer">Khách hàng: ${escape(order.customerName)} · In phiếu không thay đổi trạng thái lệnh hoặc tồn kho. Cấp kho, thừa/thiếu và chữ ký trống cần ghi nhận thực tế.</p>${footer(index + 1)}</section>`;
  }).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escape(order.lsxCode)}</title><style>
    @font-face{font-family:Inter;src:url("${escape(latinFont)}") format("woff2");font-weight:100 900;font-style:normal}@font-face{font-family:Inter;src:url("${escape(vietnameseFont)}") format("woff2");font-weight:100 900;font-style:normal;unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@page{size:A4 landscape;margin:7mm}*{box-sizing:border-box}body{margin:0;background:white;color:#173b30;font:8.5pt Inter,sans-serif}.sheet{break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}header{display:flex;align-items:center;gap:12px;margin-bottom:8px}.brand{width:24%}.brand img{width:100%;max-height:52px;object-fit:contain}.company{flex:1;text-align:center}.company>b{font-size:12pt;color:#075a3e}h1{margin:7px 0 0;padding:7px 12px;background:#006344;border-radius:24px;color:white;font-size:17pt}.tagline{width:16%;font-size:12pt;font-style:italic;color:#006344;text-align:center}.meta{display:grid;grid-template-columns:1.05fr 1.1fr 0.85fr 1.05fr;border:1px solid #367b60;border-radius:5px;background:#eff8f2;overflow-wrap:anywhere}.meta>div{padding:7px 9px;border-right:1px solid #aacbbb}.meta>div:last-child{border:0}p{margin:4px 0}.note{white-space:pre-wrap}.warning{border:1px solid #a54b12;color:#963c05;text-align:center;font-weight:bold;padding:5px;margin-bottom:6px}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:6px 0}th,td{border:1px solid #91b6a6;padding:5px;overflow-wrap:anywhere;vertical-align:middle}th{background:#006344;color:white;font-size:8pt;text-align:center}td{text-align:center}.lines tbody td{height:12mm}.lines td:nth-child(2),.lines td:nth-child(3),.lines td:nth-child(10){text-align:left}.sample img{max-width:100%;height:32px;object-fit:contain}.sample div,small{font-size:7pt}.priority{display:inline-block;padding:3px 7px;border-radius:12px;background:#e1f5e9}.priority-urgent{background:#ffe0e0;color:#7c1e1e}.priority-high{background:#fff3c7;color:#665000}.bottom{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.1fr;gap:6px;margin-top:7px;break-inside:avoid}.bottom article{border:1px solid #367b60;border-radius:4px;overflow-wrap:anywhere}h2{margin:0;padding:5px 7px;background:#006344;color:white;font-size:9pt}.bottom table{margin:0}.bottom th{color:#194d38;background:#e6f4e9;font-size:7pt}.bottom td{font-size:7.5pt;padding:3px;height:5mm}.caption{font-size:7pt;padding:1px 5px}.box-fields{padding:5px 8px}.box-fields p{margin:7px 0}.muted,.disclaimer{color:#526c60}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:4px;text-align:center;padding:7px 4px}.signatures small{display:block}.signatures>div{min-height:22mm}.storekeeper{grid-column:1/-1;border-top:1px solid #aacbbb;padding-top:5px}.disclaimer,footer{font-size:7pt;margin-top:5px}footer{display:flex;justify-content:space-between;background:#006344;color:white;padding:5px 9px;border-radius:4px}.annex{font-size:10pt;line-height:1.5}.annex .note{overflow-wrap:anywhere;white-space:pre-wrap}thead{display:table-header-group}tr{break-inside:avoid}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>${sheets}${annex ? `<section class="sheet annex">${header}${warning}<h2>GHI CHÚ BỔ SUNG — ${escape(order.lsxCode)}</h2><p class="note">${escape(notes)}</p>${footer(sheetCount)}</section>` : ''}</body></html>`;
}
