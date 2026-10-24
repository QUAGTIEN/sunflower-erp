import { useEffect } from 'react';
import { useTableColumnLayouts } from '@/context/TableColumnLayoutContext';
import { readLegacyColumnSelection, readLegacyColumnWidths } from '@/domain/tableColumnLayout';

interface SharedTableColumnsOptions {
  layoutId: string;
  legacySelectionKey?: string;
  legacySelectionView?: string;
  legacyWidthKey?: string;
}

export const useSharedTableColumns = ({
  layoutId,
  legacySelectionKey,
  legacySelectionView,
  legacyWidthKey
}: SharedTableColumnsOptions) => {
  const { layouts, canEditColumns, saveLayout, migrateLayout } = useTableColumnLayouts();
  useEffect(() => {
    if (!canEditColumns) return;
    migrateLayout(layoutId, {
      selectedIds: readLegacyColumnSelection(legacySelectionKey, legacySelectionView),
      widths: readLegacyColumnWidths(legacyWidthKey)
    });
  }, [canEditColumns, layoutId, legacySelectionKey, legacySelectionView, legacyWidthKey, migrateLayout]);
  return {
    selectedIds: layouts[layoutId]?.selectedIds || null,
    setSelectedIds: (selectedIds: string[]) => saveLayout(layoutId, { selectedIds }),
    canEditColumns
  };
};
