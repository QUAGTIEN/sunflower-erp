import { useEffect } from 'react';

const MIN_COLUMN_WIDTH = 64;
const MAX_COLUMN_WIDTH = 520;

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

    const prepareTables = () => {
      root.querySelectorAll<HTMLTableElement>('table').forEach((table, tableIndex) => {
        const tableKey = table.dataset.resizeKey || `table-${tableIndex}`;
        const storageKey = `sunflower:table-column-widths:${userId}:${pageId}:${tableKey}`;
        const widths = readWidths(storageKey);
        table.querySelectorAll<HTMLTableCellElement>('thead th:not(.is-resizable)').forEach((header, columnIndex) => {
          header.classList.add('erp-generic-resizable-header');
          header.dataset.resizeStorageKey = storageKey;
          header.dataset.resizeColumnIndex = String(columnIndex);
          if (!header.title) header.title = header.textContent?.trim() || '';
          const width = widths[String(columnIndex)];
          if (width) header.style.setProperty('--erp-column-resized-width', `${width}px`);
        });
      });
    };

    prepareTables();
    const observer = new MutationObserver(prepareTables);
    observer.observe(root, { childList: true, subtree: true });

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
      let finalWidth = startWidth;
      const onPointerMove = (moveEvent: PointerEvent) => {
        finalWidth = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)));
        header.style.setProperty('--erp-column-resized-width', `${finalWidth}px`);
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
            [columnIndex]: finalWidth
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
      observer.disconnect();
      root.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pageId, userId]);
};
