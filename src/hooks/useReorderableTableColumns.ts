import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { TableColumnOption } from '@/components/TableColumnCustomizer';
import { useTableColumnLayouts } from '@/context/TableColumnLayoutContext';

interface UseReorderableTableColumnsOptions {
  columns: TableColumnOption[];
  selectedIds: string[];
  onOrderChange: (orderedIds: string[]) => void;
  layoutId: string;
  lockedStartIds?: string[];
  lockedEndIds?: string[];
}

export interface HeaderInteractionProps {
  draggable: boolean;
  tabIndex?: number;
  title?: string;
  'aria-label'?: string;
  onDragStart?: React.DragEventHandler<HTMLTableCellElement>;
  onDragOver?: React.DragEventHandler<HTMLTableCellElement>;
  onDrop?: React.DragEventHandler<HTMLTableCellElement>;
  onDragEnd?: React.DragEventHandler<HTMLTableCellElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLTableCellElement>;
  onPointerDown?: React.PointerEventHandler<HTMLTableCellElement>;
  className?: string;
  style?: React.CSSProperties;
  'data-table-layout-id'?: string;
}

const unique = (ids: string[]) => Array.from(new Set(ids));

export const normalizeTableColumnOrder = (
  columns: TableColumnOption[],
  selectedIds: string[],
  lockedStartIds: string[] = [],
  lockedEndIds: string[] = []
) => {
  const availableIds = new Set(columns.map(column => column.id));
  const selectedSet = new Set(selectedIds.filter(id => availableIds.has(id)));
  columns.filter(column => column.required).forEach(column => selectedSet.add(column.id));
  const preferredIds = unique([
    ...selectedIds.filter(id => selectedSet.has(id)),
    ...columns.map(column => column.id).filter(id => selectedSet.has(id))
  ]);
  const start = lockedStartIds.filter(id => selectedSet.has(id));
  const end = lockedEndIds.filter(id => selectedSet.has(id));
  const locked = new Set([...start, ...end]);
  return [...start, ...preferredIds.filter(id => !locked.has(id)), ...end];
};

export const useReorderableTableColumns = ({
  columns,
  selectedIds,
  onOrderChange,
  layoutId,
  lockedStartIds = [],
  lockedEndIds = []
}: UseReorderableTableColumnsOptions) => {
  const { layouts, canEditColumns, saveLayout } = useTableColumnLayouts();
  const [draggingId, setDraggingId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const resizeActiveRef = useRef(false);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const columnWidths = layouts[layoutId]?.widths || {};
  useEffect(() => () => { resizeCleanupRef.current?.(); }, [layoutId, canEditColumns]);
  const orderedColumnIds = useMemo(
    () => normalizeTableColumnOrder(columns, selectedIds, lockedStartIds, lockedEndIds),
    [columns, lockedEndIds, lockedStartIds, selectedIds]
  );
  const lockedStartSet = useMemo(() => new Set(lockedStartIds), [lockedStartIds]);
  const lockedEndSet = useMemo(() => new Set(lockedEndIds), [lockedEndIds]);
  const resizedTableWidth = columnWidths.__tableWidth;

  const moveColumn = (sourceId: string, targetId: string) => {
    if (!canEditColumns) return;
    if (!sourceId || sourceId === targetId || lockedStartSet.has(sourceId) || lockedEndSet.has(sourceId)) return;
    if (lockedStartSet.has(targetId)) return;
    const next = [...orderedColumnIds];
    const sourceIndex = next.indexOf(sourceId);
    const targetIndex = next.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(sourceIndex, 1);
    const currentTargetIndex = next.indexOf(targetId);
    const insertionIndex = lockedEndSet.has(targetId)
      ? currentTargetIndex
      : sourceIndex < targetIndex ? currentTargetIndex + 1 : currentTargetIndex;
    next.splice(insertionIndex, 0, sourceId);
    onOrderChange(next);
  };

  const moveWithKeyboard = (columnId: string, direction: -1 | 1) => {
    if (!canEditColumns) return;
    if (lockedStartSet.has(columnId) || lockedEndSet.has(columnId)) return;
    const currentIndex = orderedColumnIds.indexOf(columnId);
    const targetIndex = currentIndex + direction;
    const targetId = orderedColumnIds[targetIndex];
    if (!targetId || lockedStartSet.has(targetId) || lockedEndSet.has(targetId)) return;
    const next = [...orderedColumnIds];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    onOrderChange(next);
  };

  const getHeaderProps = (
    columnId: string,
    label: string,
    currentClassName = '',
    currentStyle: React.CSSProperties = {}
  ): HeaderInteractionProps => {
    const movable = canEditColumns && !lockedStartSet.has(columnId) && !lockedEndSet.has(columnId);
    const savedWidth = columnWidths[columnId];
    const className = [currentClassName, 'reorderable-table-header', canEditColumns ? 'is-resizable' : 'is-readonly', movable ? 'is-movable' : 'is-locked', canEditColumns && draggingId === columnId ? 'is-dragging' : '', canEditColumns && dropTargetId === columnId ? 'is-drop-target' : ''].filter(Boolean).join(' ');
    const style = savedWidth
      ? { ...currentStyle, '--erp-column-resized-width': `${savedWidth}px` } as React.CSSProperties
      : currentStyle;
    if (!canEditColumns) return { draggable: false, title: label, className, style, 'data-table-layout-id': layoutId };
    const sharedProps: HeaderInteractionProps = {
      draggable: movable,
      tabIndex: 0,
      title: `${label} — kéo mép phải để đổi độ rộng${movable ? '; kéo tiêu đề để đổi vị trí' : ''}`,
      'aria-label': `${label}. Có thể kéo mép phải để đổi độ rộng cột`,
      className,
      style,
      'data-table-layout-id': layoutId,
      onPointerDown: event => {
        const header = event.currentTarget;
        const bounds = header.getBoundingClientRect();
        if (bounds.right - event.clientX > 9) return;
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startWidth = bounds.width;
        const table = header.closest('table');
        const startTableWidth = table?.getBoundingClientRect().width || 0;
        const initialHeaderWidth = header.style.getPropertyValue('--erp-column-resized-width');
        const initialTableWidth = table?.style.getPropertyValue('--erp-table-resized-width') || '';
        let finalWidth = startWidth;
        let finalTableWidth = startTableWidth;
        const onPointerMove = (moveEvent: PointerEvent) => {
          finalWidth = Math.min(4096, Math.max(64, Math.round(startWidth + moveEvent.clientX - startX)));
          finalTableWidth = Math.max(orderedColumnIds.length * 64, Math.round(startTableWidth + finalWidth - startWidth));
          header.style.setProperty('--erp-column-resized-width', `${finalWidth}px`);
          table?.style.setProperty('--erp-table-resized-width', `${finalTableWidth}px`);
        };
        const onPointerUp = () => {
          resizeCleanupRef.current?.();
          saveLayout(layoutId, { widths: { [columnId]: finalWidth, __tableWidth: finalTableWidth } });
        };
        resizeCleanupRef.current?.();
        resizeActiveRef.current = true;
        resizeCleanupRef.current = () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          if (initialHeaderWidth) header.style.setProperty('--erp-column-resized-width', initialHeaderWidth);
          else header.style.removeProperty('--erp-column-resized-width');
          if (initialTableWidth) table?.style.setProperty('--erp-table-resized-width', initialTableWidth);
          else table?.style.removeProperty('--erp-table-resized-width');
          resizeActiveRef.current = false;
          resizeCleanupRef.current = null;
        };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
      }
    };
    if (!movable) return sharedProps;
    return {
      ...sharedProps,
      onDragStart: event => {
        if (resizeActiveRef.current) {
          event.preventDefault();
          return;
        }
        setDraggingId(columnId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', columnId);
      },
      onDragOver: event => {
        if (lockedStartSet.has(columnId)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTargetId(columnId);
      },
      onDrop: event => {
        event.preventDefault();
        moveColumn(event.dataTransfer.getData('text/plain') || draggingId, columnId);
        setDraggingId('');
        setDropTargetId('');
      },
      onDragEnd: () => {
        setDraggingId('');
        setDropTargetId('');
      },
      onKeyDown: event => {
        if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        moveWithKeyboard(columnId, event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
  };

  return { orderedColumnIds, getHeaderProps, resizedTableWidth };
};
