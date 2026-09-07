import { useMemo, useState } from 'react';
import type React from 'react';
import type { TableColumnOption } from '@/components/TableColumnCustomizer';

interface UseReorderableTableColumnsOptions {
  columns: TableColumnOption[];
  selectedIds: string[];
  onOrderChange: (orderedIds: string[]) => void;
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
  className?: string;
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
  lockedStartIds = [],
  lockedEndIds = []
}: UseReorderableTableColumnsOptions) => {
  const [draggingId, setDraggingId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const orderedColumnIds = useMemo(
    () => normalizeTableColumnOrder(columns, selectedIds, lockedStartIds, lockedEndIds),
    [columns, lockedEndIds, lockedStartIds, selectedIds]
  );
  const lockedStartSet = useMemo(() => new Set(lockedStartIds), [lockedStartIds]);
  const lockedEndSet = useMemo(() => new Set(lockedEndIds), [lockedEndIds]);

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

  const getHeaderProps = (columnId: string, label: string, currentClassName = ''): HeaderInteractionProps => {
    const movable = !lockedStartSet.has(columnId) && !lockedEndSet.has(columnId);
    const className = [currentClassName, 'reorderable-table-header', movable ? 'is-movable' : 'is-locked', draggingId === columnId ? 'is-dragging' : '', dropTargetId === columnId ? 'is-drop-target' : ''].filter(Boolean).join(' ');
    if (!movable) return { draggable: false, className };
    return {
      draggable: true,
      tabIndex: 0,
      title: `${label} — kéo để đổi vị trí; Alt + phím mũi tên để di chuyển`,
      'aria-label': `${label}. Có thể kéo để đổi vị trí cột`,
      className,
      onDragStart: event => {
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

  return { orderedColumnIds, getHeaderProps };
};
