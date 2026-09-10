import { useEffect } from 'react';

const MIN_COLUMN_WIDTH = 64;

const readWidths = (storageKey: string): Record<string, number> => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => (
      typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )));
  } catch {
    return {};
  }
};

export const useGlobalTableColumnResize = (pageId: string, userId: string) => {
  useEffect(() => {
    if (!userId) return;
    const root = document.querySelector<HTMLElement>('.app-main');
    if (!root) return;

    const prepareTableViewports = () => {
      const rootBottom = root.getBoundingClientRect().bottom;
      root.querySelectorAll<HTMLElement>([
        '.table-container',
        '.work-schedule-table-wrap',
        '.custom-field-config__table-wrap',
        '.customer-data-table-wrap',
        '.customer-onboarding-items__table-wrap'
      ].join(', ')).forEach(container => {
        if (container.closest('.modal-overlay, .header-notification-panel')) return;
        const table = container.querySelector(':scope > table');
        if (!table) return;

        const pagination = container.nextElementSibling instanceof HTMLElement
          && /pagination/i.test(container.nextElementSibling.className)
          ? container.nextElementSibling
          : null;
        const reservedHeight = pagination?.getBoundingClientRect().height || 0;
        const availableHeight = Math.max(180, Math.floor(rootBottom - container.getBoundingClientRect().top - reservedHeight - 8));
        container.style.setProperty('--erp-table-viewport-height', `${availableHeight}px`);
        container.classList.add('erp-viewport-table-scroll');

        const isKnownPrimaryWorkspaceTable = container.matches(
          '.lead-data-workspace > .lead-table-card > .table-container, '
          + '.lead-candidate-workspace > .lead-table-card > .table-container, '
          + '.crm-data-workspace .crm-customer-table-wrap'
        );
        const isWidePageTable = container.clientWidth >= root.clientWidth * 0.72
          && !container.closest('.dashboard-view, .crm-view--detail, .modal-content');
        const isPrimaryWorkspaceTable = isKnownPrimaryWorkspaceTable || isWidePageTable;
        container.classList.toggle('erp-viewport-table-scroll--fill', isPrimaryWorkspaceTable);
      });
    };

    const prepareTables = () => {
      root.querySelectorAll<HTMLTableElement>('table').forEach((table, tableIndex) => {
        const tableKey = table.dataset.resizeKey || `table-${tableIndex}`;
        const storageKey = `sunflower:table-column-widths:${userId}:${pageId}:${tableKey}`;
        const widths = readWidths(storageKey);
        const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th:not(.is-resizable)'));
        const measuredWidths = headers.map(header => Math.round(header.getBoundingClientRect().width));
        const resolvedWidths = measuredWidths.map((width, columnIndex) => widths[String(columnIndex)] || width);
        headers.forEach((header, columnIndex) => {
          header.classList.add('erp-generic-resizable-header');
          header.dataset.resizeStorageKey = storageKey;
          header.dataset.resizeColumnIndex = String(columnIndex);
          if (!header.title) header.title = header.textContent?.trim() || '';
          const width = resolvedWidths[columnIndex];
          if (width) header.style.setProperty('--erp-column-resized-width', `${width}px`);
        });
        const minimumTableWidth = table.parentElement?.clientWidth || 0;
        const tableWidth = widths.__tableWidth || resolvedWidths.reduce((total, width) => total + width, 0);
        table.style.setProperty('--erp-table-resized-width', `${Math.max(minimumTableWidth, tableWidth)}px`);
      });
      prepareTableViewports();
    };

    prepareTables();
    let animationFrame = 0;
    const schedulePrepare = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(prepareTables);
    };
    const observer = new MutationObserver(schedulePrepare);
    observer.observe(root, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(schedulePrepare);
    resizeObserver.observe(root);
    root.addEventListener('scroll', schedulePrepare, { passive: true });
    window.addEventListener('resize', schedulePrepare);

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const header = target.closest<HTMLTableCellElement>('th.erp-generic-resizable-header');
      if (!header || !root.contains(header)) return;
      const bounds = header.getBoundingClientRect();
      if (bounds.right - event.clientX > 9) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = bounds.width;
      const table = header.closest('table');
      const startTableWidth = table?.getBoundingClientRect().width || 0;
      let finalWidth = startWidth;
      let finalTableWidth = startTableWidth;
      const onPointerMove = (moveEvent: PointerEvent) => {
        finalWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
        finalTableWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startTableWidth + finalWidth - startWidth));
        header.style.setProperty('--erp-column-resized-width', `${finalWidth}px`);
        table?.style.setProperty('--erp-table-resized-width', `${finalTableWidth}px`);
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        const storageKey = header.dataset.resizeStorageKey;
        const columnIndex = header.dataset.resizeColumnIndex;
        if (!storageKey || columnIndex === undefined) return;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify({
            ...readWidths(storageKey),
            [columnIndex]: finalWidth,
            __tableWidth: finalTableWidth
          }));
        } catch {
          // The resized width remains active for the current page session.
        }
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
    };

    root.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      resizeObserver.disconnect();
      root.removeEventListener('scroll', schedulePrepare);
      window.removeEventListener('resize', schedulePrepare);
      root.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pageId, userId]);
};
