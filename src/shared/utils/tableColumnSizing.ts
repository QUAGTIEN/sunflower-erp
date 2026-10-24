/** The configured width excludes any space temporarily filled by the last column. */
export const getTableColumnBaseWidth = (header: HTMLTableCellElement) => {
  const style = window.getComputedStyle(header);
  const baseWidth = Number.parseFloat(style.getPropertyValue('--erp-column-base-width'));
  return Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : header.getBoundingClientRect().width;
};

export const syncTableColumnFill = (table: HTMLTableElement) => {
  const rows = table.tHead?.rows;
  const headers = rows?.length === 1 ? Array.from(rows[0].cells) : [];
  // Leave grouped headers and explicit colgroups on their existing layout contract.
  const supported =
    headers.length > 0 &&
    headers.every(header => header.colSpan === 1 && header.rowSpan === 1) &&
    !table.querySelector(':scope > colgroup');
  table.classList.toggle('erp-table-last-column-fill', supported);
  if (!supported) return;
  const baseWidth = headers.reduce((total, header) => total + getTableColumnBaseWidth(header), 0);
  // Recompute from visible columns, never the saved total for another selection/viewport.
  table.style.setProperty('--erp-table-resized-width', `${baseWidth}px`);
};
