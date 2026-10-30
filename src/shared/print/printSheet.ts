/**
 * Building blocks of the printable sheets (đơn hàng, lệnh sản xuất): a company header, a title, signatures and the
 * shared A4 print CSS. Sheets are plain HTML documents shown in PrintPreviewDialog and saved as PDF by the browser.
 */

/**
 * Seller shown on every sheet. Only the name is confirmed; an empty field prints a dotted line to fill in by hand
 * rather than a made-up value, until the user supplies the address, phone and tax code.
 */
export const COMPANY_PRINT_PROFILE = {
  name: 'CÔNG TY TNHH SẢN XUẤT VÀ CÔNG NGHỆ SUNFLOWER',
  address: '',
  phone: '',
  taxCode: '',
  logoUrl: '/sunflower-logo-horizontal-transparent.png'
};

const BLANK = '……………………………………………';

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!
  );

/** Text of a field, or a dotted line to write on when it is empty. */
export const orBlank = (value: unknown) => {
  const text = String(value ?? '').trim();
  return text ? escapeHtml(text) : BLANK;
};

export const formatPrintNumber = (value: unknown, maximumFractionDigits = 3) =>
  value === undefined || value === null || value === '' || !Number.isFinite(Number(value))
    ? ''
    : Number(value).toLocaleString('vi-VN', { maximumFractionDigits });

const datePartsInVietnam = (value: string) => {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(entry => entry.type === type)?.value || '';
  return { day: part('day'), month: part('month'), year: part('year') };
};

export const formatPrintDate = (value: string) => {
  const parts = datePartsInVietnam(value);
  return parts ? `${parts.day}/${parts.month}/${parts.year}` : '';
};

/** "Ngày 05 tháng 06 năm 2026", or blanks to fill in by hand. */
export const longDateLabel = (value: string) => {
  const parts = datePartsInVietnam(value);
  return parts ? `Ngày ${parts.day} tháng ${parts.month} năm ${parts.year}` : 'Ngày …… tháng …… năm ……';
};

export interface PrintMetaEntry {
  label: string;
  value: string;
}

/** Logo and seller on the left, document references (số phiếu, phiên bản...) on the right. */
export function companyHeaderHtml(references: PrintMetaEntry[]) {
  const company = COMPANY_PRINT_PROFILE;
  return `<header class="sheet-header">
    <img class="sheet-logo" src="${escapeHtml(company.logoUrl)}" alt="SUNFLOWER">
    <div class="sheet-company">
      <b>${escapeHtml(company.name)}</b>
      <span>Địa chỉ: ${orBlank(company.address)}</span>
      <span>Điện thoại: ${orBlank(company.phone)} · MST: ${orBlank(company.taxCode)}</span>
    </div>
    <dl class="sheet-references">${references
      .map(entry => `<div><dt>${escapeHtml(entry.label)}</dt><dd>${orBlank(entry.value)}</dd></div>`)
      .join('')}</dl>
  </header>`;
}

export function titleHtml(title: string, subtitle: string) {
  return `<div class="sheet-title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>`;
}

/** Grid of labelled fields under the title. */
export function infoGridHtml(entries: PrintMetaEntry[], columns = 2) {
  return `<dl class="sheet-info" style="grid-template-columns:repeat(${columns},minmax(0,1fr))">${entries
    .map(entry => `<div><dt>${escapeHtml(entry.label)}:</dt><dd>${orBlank(entry.value)}</dd></div>`)
    .join('')}</dl>`;
}

export function signaturesHtml(roles: { title: string; name?: string }[], placeAndDate: string) {
  return `<section class="sheet-signatures">
    <p class="sheet-place-date">${escapeHtml(placeAndDate)}</p>
    <div style="grid-template-columns:repeat(${roles.length},minmax(0,1fr))">${roles
      .map(
        role =>
          `<div><b>${escapeHtml(role.title)}</b><small>(Ký, ghi rõ họ tên)</small><span>${escapeHtml(
            role.name || ''
          )}</span></div>`
      )
      .join('')}</div>
  </section>`;
}

const PRINT_SHEET_CSS = `
@page{size:A4 __ORIENTATION__;margin:10mm}
*{box-sizing:border-box}
body{margin:0;color:#111827;font:11px/1.4 Arial,'Helvetica Neue',sans-serif}
.sheet-header{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;padding-bottom:8px;
  border-bottom:2px solid #1e3a8a}
.sheet-logo{height:40px;width:auto}
.sheet-company{display:flex;flex-direction:column;gap:2px}
.sheet-company b{font-size:13px;color:#1e3a8a}
.sheet-references{display:grid;gap:2px;margin:0;font-size:10.5px}
.sheet-references div{display:grid;grid-template-columns:auto auto;gap:6px;justify-content:end}
.sheet-references dt{color:#4b5563}
.sheet-references dd{margin:0;font-weight:bold;text-align:right}
.sheet-title{text-align:center;margin:12px 0 10px}
.sheet-title h1{margin:0;font-size:20px;letter-spacing:.5px}
.sheet-title p{margin:4px 0 0;font-style:italic}
.sheet-info{display:grid;gap:4px 24px;margin:0 0 10px}
.sheet-info div{display:grid;grid-template-columns:110px minmax(0,1fr);gap:6px}
.sheet-info dt{color:#4b5563;font-style:italic}
.sheet-info dd{margin:0;font-weight:bold;overflow-wrap:anywhere}
.sheet-draft{margin:0 0 8px;padding:5px;border:1px solid #f59e0b;color:#92400e;text-align:center;font-weight:bold}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 10px}
th,td{border:1px solid #6b7280;padding:5px 6px;vertical-align:top;overflow-wrap:anywhere}
th{background:#dbe7f6;font-weight:bold;text-align:center;vertical-align:middle}
td.num,th.num{text-align:right}
td.center{text-align:center}
tfoot td{font-weight:bold;background:#f3f6fb}
thead{display:table-header-group}
tr{break-inside:avoid}
small{display:block;color:#4b5563}
h2{margin:10px 0 6px;font-size:12px;color:#1e3a8a;text-transform:uppercase}
.sheet-note{margin:0 0 10px;padding:6px 8px;border:1px solid #9ca3af;min-height:34px;white-space:pre-wrap}
.sheet-signatures{break-inside:avoid;margin-top:10px}
.sheet-place-date{margin:0 0 6px;text-align:right;font-style:italic}
.sheet-signatures > div{display:grid;gap:12px;text-align:center}
.sheet-signatures > div > div{display:flex;flex-direction:column;align-items:center;min-height:96px}
.sheet-signatures small{font-style:italic}
.sheet-signatures span{margin-top:auto;font-weight:bold}
.sheet-totals{width:45%;margin-left:auto}
.sheet-totals td{border-color:#9ca3af}
.sheet-grand-total td{font-weight:bold;font-size:12px;background:#f3f6fb}
.sheet-footer{margin-top:8px;color:#6b7280;font-size:9.5px}
@media print{th,tfoot td,.sheet-grand-total td,.sheet-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

export function printDocumentHtml(title: string, body: string, orientation: 'landscape' | 'portrait' = 'landscape') {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>${PRINT_SHEET_CSS.replace('__ORIENTATION__', orientation)}</style></head><body>${body}</body></html>`;
}
