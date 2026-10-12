import { useEffect } from 'react';
import type { TableColumnLayoutManager } from '@/context/TableColumnLayoutContext';
import { getGenericTableLayoutId, readLegacyColumnWidths } from '@/domain/tableColumnLayout';
import { getTableColumnBaseWidth, syncTableColumnFill } from '@/shared/utils/tableColumnSizing';

const MIN_COLUMN_WIDTH = 64;
const TABLE_WIDTH_STORAGE_VERSION = 'v3';
const TABLE_FRAME_BOTTOM_GAP = 10;

const getInitialColumnWidth = (header: HTMLTableCellElement, measuredWidth: number) => {
  const label = header.textContent?.trim() || '';
  const labelWidth = Math.min(240, Math.max(80, label.length * 7.5 + 30));
  if (/thao tác|hành động|action/i.test(label)) return Math.max(96, measuredWidth, labelWidth);
  if (/trạng thái|phương án|tiến độ/i.test(label)) return Math.max(150, measuredWidth, labelWidth);
  if (/doanh nghiệp|khách hàng|nhà cung cấp|mặt hàng|sản phẩm|tên tem|tên vật tư/i.test(label)) return Math.max(220, measuredWidth, labelWidth);
  return Math.max(measuredWidth, labelWidth);
};

export const useGlobalTableColumnResize = (pageId: string, userId: string, manager: TableColumnLayoutManager) => {
  const { layouts, canEditColumns, saveLayout, migrateLayout } = manager;
  useEffect(() => {
    if (!userId) return;
    const root = document.querySelector<HTMLElement>('.app-main');
    if (!root) return;

    const prepareTableViewports = () => {
      const activeFrames = new Set<HTMLElement>();
      const rootStyle = window.getComputedStyle(root);
      const rootBottom = root.getBoundingClientRect().bottom;
      const rootContentBottom = rootBottom - (Number.parseFloat(rootStyle.paddingBottom) || 0);
      root.querySelectorAll<HTMLElement>([
        '.table-container',
        '.work-schedule-table-wrap',
        '.custom-field-config__table-wrap',
        '.customer-data-table-wrap',
        '.customer-onboarding-items__table-wrap',
        '.crm-customer-table-wrap'
      ].join(', ')).forEach(container => {
        if (container.closest('.modal-overlay, .header-notification-panel')) return;
        if (container.offsetParent === null) return;
        const table = container.querySelector(':scope > table');
        if (!table) return;

        const pagination = container.nextElementSibling instanceof HTMLElement
          && /pagination/i.test(container.nextElementSibling.className)
          ? container.nextElementSibling
          : null;
        const reservedHeight = pagination?.getBoundingClientRect().height || 0;
        const parentStyle = container.parentElement ? window.getComputedStyle(container.parentElement) : null;
        const parentBottomInset = parentStyle
          ? (Number.parseFloat(parentStyle.paddingBottom) || 0) + (Number.parseFloat(parentStyle.borderBottomWidth) || 0)
          : 0;
        const footerGap = pagination && parentStyle ? Number.parseFloat(parentStyle.rowGap) || 0 : 0;
        const viewportBottom = container.matches('.erp-primary-data-table') ? rootContentBottom : rootBottom;

        if (pagination && container.parentElement) {
          const frame = container.parentElement;
          const frameHeight = Math.max(160, Math.floor(
            rootBottom - frame.getBoundingClientRect().top - TABLE_FRAME_BOTTOM_GAP
          ));
          frame.classList.add('erp-data-table-frame');
          frame.style.setProperty('--erp-table-frame-height', `${frameHeight}px`);
          activeFrames.add(frame);
        }

        const availableHeight = Math.max(180, Math.floor(
          viewportBottom - container.getBoundingClientRect().top - reservedHeight - parentBottomInset - footerGap - 8
        ));
        container.style.setProperty('--erp-table-viewport-height', `${availableHeight}px`);
        container.classList.add('erp-viewport-table-scroll');

        const isKnownPrimaryWorkspaceTable = container.matches(
          '.erp-primary-data-table, '
          + '.lead-data-workspace > .lead-table-card > .table-container, '
          + '.lead-candidate-workspace > .lead-table-card > .table-container, '
          + '.crm-data-workspace .crm-customer-table-wrap'
        );
        const isWidePageTable = container.clientWidth >= root.clientWidth * 0.72
          && !container.closest('.dashboard-view, .crm-view--detail, .modal-content');
        const isPrimaryWorkspaceTable = isKnownPrimaryWorkspaceTable || isWidePageTable;
        container.classList.toggle('erp-viewport-table-scroll--fill', isPrimaryWorkspaceTable);
      });

      root.querySelectorAll<HTMLElement>('.erp-data-table-frame').forEach(frame => {
        if (activeFrames.has(frame)) return;
        frame.classList.remove('erp-data-table-frame');
        frame.style.removeProperty('--erp-table-frame-height');
      });
      root.classList.toggle('erp-data-table-page', activeFrames.size > 0);
    };

    let forceTableMeasurement = true;
    const prepareTables = () => {
      root.querySelectorAll<HTMLTableElement>('table').forEach((table, tableIndex) => {
        if (table.offsetParent === null) {
          table.dataset.erpResizeHidden = 'true';
          return;
        }
        const becameVisible = table.dataset.erpResizeHidden === 'true';
        delete table.dataset.erpResizeHidden;
        const configuredHeader = table.querySelector<HTMLTableCellElement>('th.reorderable-table-header');
        if (configuredHeader) {
          const layoutId = configuredHeader.dataset.tableLayoutId || '';
          const tableWidth = layouts[layoutId]?.widths.__tableWidth;
          if (tableWidth) table.style.setProperty('--erp-table-resized-width', `${tableWidth}px`);
          else table.style.removeProperty('--erp-table-resized-width');
          syncTableColumnFill(table);
          return;
        }
        const tableKey = table.dataset.resizeKey || `table-${tableIndex}`;
        const isPrimaryDataTable = Boolean(table.closest('.erp-primary-data-table'));
        const storageVersion = isPrimaryDataTable ? `${TABLE_WIDTH_STORAGE_VERSION}:` : '';
        const storageKey = `sunflower:table-column-widths:${storageVersion}${userId}:${pageId}:${tableKey}`;
        const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'));
        const layoutId = getGenericTableLayoutId(pageId, table.dataset.resizeKey || `${tableKey}:${table.className}:${headers.length}`);
        if (canEditColumns) migrateLayout(layoutId, { widths: readLegacyColumnWidths(storageKey) });
        const hasNewHeaders = headers.some(header => !header.classList.contains('erp-generic-resizable-header'));
        const needsTableMeasurement = forceTableMeasurement
          || becameVisible
          || hasNewHeaders
          || table.dataset.erpResizePrepared !== 'true';
        const widths = needsTableMeasurement ? layouts[layoutId]?.widths || {} : {};
        const measuredWidths = needsTableMeasurement ? headers.map(header => {
          const previousWidth = Number.parseFloat(header.style.getPropertyValue('--erp-column-resized-width'));
          const measuredWidth = previousWidth || Math.round(header.getBoundingClientRect().width);
          return isPrimaryDataTable ? getInitialColumnWidth(header, measuredWidth) : measuredWidth;
        }) : [];
        const resolvedWidths = measuredWidths.map((width, columnIndex) => widths[String(columnIndex)] || width);
        if (needsTableMeasurement) {
          headers.forEach((header, columnIndex) => {
            header.classList.add('erp-generic-resizable-header');
            header.classList.toggle('is-readonly', !canEditColumns);
            header.dataset.tableLayoutId = layoutId;
            header.dataset.resizeColumnIndex = String(columnIndex);
            if (!header.title) header.title = header.textContent?.trim() || '';
            const width = resolvedWidths[columnIndex];
            if (width) header.style.setProperty('--erp-column-resized-width', `${width}px`);
          });
        }
        if (isPrimaryDataTable) table.querySelectorAll<HTMLTableCellElement>('tbody td:not([data-erp-resize-prepared])').forEach(cell => {
          cell.dataset.erpResizePrepared = 'true';
          if (cell.title || cell.querySelector('button, input, select, textarea')) return;
          const label = cell.textContent?.replace(/\s+/g, ' ').trim();
          if (label) cell.title = label;
        });
        if (needsTableMeasurement) {
          const minimumTableWidth = table.parentElement?.clientWidth || 0;
          const tableWidth = widths.__tableWidth || resolvedWidths.reduce((total, width) => total + width, 0);
          table.style.setProperty('--erp-table-resized-width', `${Math.max(minimumTableWidth, tableWidth)}px`);
          table.dataset.erpResizePrepared = 'true';
        }
        syncTableColumnFill(table);
      });
      forceTableMeasurement = false;
      prepareTableViewports();
    };

    prepareTables();
    let animationFrame = 0;
    let viewportAnimationFrame = 0;
    const schedulePrepare = (forceMeasurement = false) => {
      forceTableMeasurement = forceTableMeasurement || forceMeasurement;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(prepareTables);
    };
    const scheduleViewportPrepare = () => {
      window.cancelAnimationFrame(viewportAnimationFrame);
      viewportAnimationFrame = window.requestAnimationFrame(prepareTableViewports);
    };
    const containsTableContent = (node: Node) => node instanceof Element && (
      node.matches('table, thead, tbody, tr, th, td, .table-container, .customer-data-table-wrap, .crm-customer-table-wrap')
      || Boolean(node.querySelector('table, th, td'))
    );
    const observer = new MutationObserver(records => {
      const tableChanged = records.some(record => (
        (record.target instanceof Element && Boolean(record.target.closest('table')))
        || Array.from(record.addedNodes).some(containsTableContent)
        || Array.from(record.removedNodes).some(containsTableContent)
      ));
      if (tableChanged) schedulePrepare(false);
    });
    observer.observe(root, { childList: true, subtree: true });
    let lastRootWidth = root.clientWidth;
    const resizeObserver = new ResizeObserver(() => {
      const currentRootWidth = root.clientWidth;
      if (currentRootWidth !== lastRootWidth) {
        lastRootWidth = currentRootWidth;
        schedulePrepare(true);
        return;
      }
      scheduleViewportPrepare();
    });
    resizeObserver.observe(root);
    root.addEventListener('scroll', scheduleViewportPrepare, { passive: true });
    const handleWindowResize = () => schedulePrepare(true);
    window.addEventListener('resize', handleWindowResize);

    let resizeCleanup: (() => void) | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (!canEditColumns) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const header = target.closest<HTMLTableCellElement>('th.erp-generic-resizable-header');
      if (!header || !root.contains(header)) return;
      const bounds = header.getBoundingClientRect();
      if (bounds.right - event.clientX > 9) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const table = header.closest('table');
      const fillsLastColumn = table?.classList.contains('erp-table-last-column-fill');
      const startWidth = fillsLastColumn ? getTableColumnBaseWidth(header) : bounds.width;
      const startTableWidth = table && fillsLastColumn
        ? Number.parseFloat(table.style.getPropertyValue('--erp-table-resized-width'))
        : table?.getBoundingClientRect().width || 0;
      const initialHeaderWidth = header.style.getPropertyValue('--erp-column-resized-width');
      const initialTableWidth = table?.style.getPropertyValue('--erp-table-resized-width') || '';
      let finalWidth = startWidth;
      let finalTableWidth = startTableWidth;
      const onPointerMove = (moveEvent: PointerEvent) => {
        finalWidth = Math.min(4096, Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX)));
        finalTableWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startTableWidth + finalWidth - startWidth));
        header.style.setProperty('--erp-column-resized-width', `${finalWidth}px`);
        table?.style.setProperty('--erp-table-resized-width', `${finalTableWidth}px`);
      };
      const onPointerUp = () => {
        resizeCleanup?.();
        const layoutId = header.dataset.tableLayoutId;
        const columnIndex = header.dataset.resizeColumnIndex;
        if (!layoutId || columnIndex === undefined) return;
        saveLayout(layoutId, { widths: { [columnIndex]: finalWidth, __tableWidth: finalTableWidth } });
      };
      resizeCleanup?.();
      resizeCleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (initialHeaderWidth) header.style.setProperty('--erp-column-resized-width', initialHeaderWidth);
        else header.style.removeProperty('--erp-column-resized-width');
        if (initialTableWidth) table?.style.setProperty('--erp-table-resized-width', initialTableWidth);
        else table?.style.removeProperty('--erp-table-resized-width');
        resizeCleanup = null;
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
    };

    root.addEventListener('pointerdown', onPointerDown);
    return () => {
      resizeCleanup?.();
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(viewportAnimationFrame);
      observer.disconnect();
      resizeObserver.disconnect();
      root.classList.remove('erp-data-table-page');
      root.removeEventListener('scroll', scheduleViewportPrepare);
      window.removeEventListener('resize', handleWindowResize);
      root.removeEventListener('pointerdown', onPointerDown);
    };
  }, [pageId, userId, layouts, canEditColumns, saveLayout, migrateLayout]);
};
