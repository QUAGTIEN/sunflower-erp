import { useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { TableColumnOption } from '@/components/TableColumnCustomizer';

interface UseReorderableTableColumnsOptions {
  columns: TableColumnOption[];
  selectedIds: string[];
  onOrderChange: (orderedIds: string[]) => void;
  widthStorageKey?: string;
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
}

const unique = (ids: string[]) => Array.from(new Set(ids));

const readStoredColumnWidths = (storageKey?: string): Record<string, number> => {
  if (!storageKey) return {};
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
  widthStorageKey,
  lockedStartIds = [],
  lockedEndIds = []
}: UseReorderableTableColumnsOptions) => {
  const [draggingId, setDraggingId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [columnWidthsByKey, setColumnWidthsByKey] = useState<Record<string, Record<string, number>>>({});
  const resizeActiveRef = useRef(false);
  const activeWidthKey = widthStorageKey || '__session__';
  const columnWidths = columnWidthsByKey[activeWidthKey] || readStoredColumnWidths(widthStorageKey);
  const orderedColumnIds = useMemo(
    () => normalizeTableColumnOrder(columns, selectedIds, lockedStartIds, lockedEndIds),
    [columns, lockedEndIds, lockedStartIds, selectedIds]
  );
  const lockedStartSet = useMemo(() => new Set(lockedStartIds), [lockedStartIds]);
  const lockedEndSet = useMemo(() => new Set(lockedEndIds), [lockedEndIds]);
  const resizedTableWidth = columnWidths.__tableWidth;

  const moveColumn = (sourceId: string, targetId: string) => {
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
    const movable = !lockedStartSet.has(columnId) && !lockedEndSet.has(columnId);
    const savedWidth = columnWidths[columnId];
    const className = [currentClassName, 'reorderable-table-header', 'is-resizable', movable ? 'is-movable' : 'is-locked', draggingId === columnId ? 'is-dragging' : '', dropTargetId === columnId ? 'is-drop-target' : ''].filter(Boolean).join(' ');
    const style = savedWidth
      ? { ...currentStyle, '--erp-column-resized-width': `${savedWidth}px` } as React.CSSProperties
      : currentStyle;
    const sharedProps: HeaderInteractionProps = {
      draggable: movable,
      tabIndex: 0,
      title: `${label} — kéo mép phải để đổi độ rộng${movable ? '; kéo tiêu đề để đổi vị trí' : ''}`,
      'aria-label': `${label}. Có thể kéo mép phải để đổi độ rộng cột`,
      className,
      style,
      onPointerDown: event => {
        const header = event.currentTarget;
        const bounds = header.getBoundingClientRect();
        if (bounds.right - event.clientX > 9) return;
        event.preventDefault();
        event.stopPropagation();
        resizeActiveRef.current = true;
        const startX = event.clientX;
        const startWidth = bounds.width;
        const table = header.closest('table');
        const startTableWidth = table?.getBoundingClientRect().width || 0;
        let finalWidth = startWidth;
        let finalTableWidth = startTableWidth;
        const onPointerMove = (moveEvent: PointerEvent) => {
          finalWidth = Math.max(64, Math.round(startWidth + moveEvent.clientX - startX));
          finalTableWidth = Math.max(orderedColumnIds.length * 64, Math.round(startTableWidth + finalWidth - startWidth));
          table?.style.setProperty('--erp-table-resized-width', `${finalTableWidth}px`);
          setColumnWidthsByKey(previous => ({
            ...previous,
            [activeWidthKey]: {
              ...(previous[activeWidthKey] || columnWidths),
              [columnId]: finalWidth,
              __tableWidth: finalTableWidth
            }
          }));
        };
        const onPointerUp = () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          resizeActiveRef.current = false;
          if (!widthStorageKey) return;
          try {
            const next = { ...columnWidths, [columnId]: finalWidth, __tableWidth: finalTableWidth };
            window.localStorage.setItem(widthStorageKey, JSON.stringify(next));
          } catch {
            // The resized width remains active for the current page session.
          }
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
