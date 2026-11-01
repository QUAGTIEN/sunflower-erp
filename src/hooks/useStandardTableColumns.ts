import { useState } from 'react';
import type { TableColumnOption } from '@/components/TableColumnCustomizer';
import { useReorderableTableColumns } from '@/hooks/useReorderableTableColumns';
import { useSharedTableColumns } from '@/hooks/useSharedTableColumns';

interface StandardTableColumnsOptions {
  layoutId: string;
  /** Module-level constants: the hooks below memoize on these arrays. */
  columns: TableColumnOption[];
  lockedStartIds?: string[];
  lockedEndIds?: string[];
}

const NO_IDS: string[] = [];

/**
 * Column choice, drag-to-reorder and the customizer dialog of a standard data table, as on the Kinh doanh lists.
 * Locked and required columns always stay visible; the layout is shared and only admins may change it.
 */
export function useStandardTableColumns({
  layoutId,
  columns,
  lockedStartIds = NO_IDS,
  lockedEndIds = NO_IDS
}: StandardTableColumnsOptions) {
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const { selectedIds, setSelectedIds, canEditColumns } = useSharedTableColumns({ layoutId });
  const alwaysVisible = [
    ...lockedStartIds,
    ...columns.filter(column => column.required).map(column => column.id),
    ...lockedEndIds
  ];
  const defaults = columns.filter(column => column.defaultVisible !== false).map(column => column.id);
  const visibleIds = [...new Set([...alwaysVisible, ...(selectedIds || defaults)])];
  const saveColumns = (ids: string[]) => {
    if (!canEditColumns) return;
    setSelectedIds([...new Set([...alwaysVisible, ...ids])]);
    setCustomizerOpen(false);
  };
  const { orderedColumnIds, getHeaderProps } = useReorderableTableColumns({
    columns,
    selectedIds: visibleIds,
    onOrderChange: saveColumns,
    layoutId,
    lockedStartIds,
    lockedEndIds
  });
  return {
    visible: new Set(visibleIds),
    orderedColumnIds,
    getHeaderProps,
    labels: Object.fromEntries(columns.map(column => [column.id, column.label])),
    canEditColumns,
    openCustomizer: () => setCustomizerOpen(true),
    customizerProps: {
      open: customizerOpen,
      columns,
      selectedIds: visibleIds,
      onClose: () => setCustomizerOpen(false),
      onSave: saveColumns
    }
  };
}
