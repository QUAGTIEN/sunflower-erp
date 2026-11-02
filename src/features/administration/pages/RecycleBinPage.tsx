import React, { useEffect, useState } from 'react';
import { PageContextHeader } from '@/components/PageContextHeader';
import { TableSkeleton } from '@/components/LoadingStates';
import { DataTablePagination } from '@/components/DataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { adminUserService } from '@/services/adminUserService';
import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import {
  RECYCLE_COLLECTIONS,
  RECYCLE_KIND_LABELS,
  formatDeletedAt,
  recycleItemsOf,
  sortRecycleItems,
  type RecycleCollection,
  type RecycleItem,
  type RecycleKind,
  type RecycleRecord
} from '../model/recycleBin';
import './AdministrationLists.css';

interface RecycleBinProps {
  currentUser: UserProfile;
  onRefresh: () => void;
}

const RECYCLE_COLUMNS: TableColumnOption[] = [
  { id: 'kind', label: 'Loại tài liệu', required: true },
  { id: 'code', label: 'Mã' },
  { id: 'name', label: 'Tên' },
  { id: 'deletedBy', label: 'Người xóa' },
  { id: 'deletedAt', label: 'Thời gian xóa' },
  { id: 'key', label: 'Mã tài liệu hệ thống', defaultVisible: false },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['kind'];
const LOCKED_END = ['actions'];
const KIND_FILTER_OPTIONS = Object.entries(RECYCLE_KIND_LABELS).map(([value, label]) => ({ value, label }));

const asRecord = (value: unknown): RecycleRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return typeof source.id === 'string' && source.id ? { ...source, id: source.id } : null;
};

/** Live deleted documents of every bin collection; the bin is read-only here and writes go through the admin API. */
function useRecycleItems() {
  const [itemsByCollection, setItemsByCollection] = useState<Partial<Record<RecycleCollection, RecycleItem[]>>>({});
  useEffect(() => {
    const unsubscribers = RECYCLE_COLLECTIONS.map(collection =>
      dbService.subscribeCollection(collection, documents => {
        const records = documents.map(asRecord).filter((record): record is RecycleRecord => Boolean(record));
        setItemsByCollection(current => ({ ...current, [collection]: recycleItemsOf(collection, records) }));
      })
    );
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, []);
  const loaded = RECYCLE_COLLECTIONS.every(collection => collection in itemsByCollection);
  return { items: sortRecycleItems(Object.values(itemsByCollection).flat()), loaded };
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ onRefresh }) => {
  const { items, loaded } = useRecycleItems();
  const [search, setSearch] = useState('');
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [busy, setBusy] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'recycle-bin',
    columns: RECYCLE_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });
  const keyword = search.trim().toLocaleLowerCase('vi-VN');
  const visibleItems = items.filter(
    item =>
      (!kindFilters.length || kindFilters.includes(item.kind)) &&
      `${item.code} ${item.name} ${item.key} ${item.deletedByName}`.toLocaleLowerCase('vi-VN').includes(keyword)
  );
  const pagination = useDataTablePagination(visibleItems);

  const runItemAction = async (action: () => Promise<unknown>, success: string, fallbackError: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      showSuccessToast(success);
      onRefresh();
    } catch (error) {
      showErrorToast(error instanceof Error ? error.message : fallbackError);
    } finally {
      setBusy(false);
    }
  };

  const restore = (item: RecycleItem) => {
    if (item.restoreBlockReason) return showErrorToast(item.restoreBlockReason);
    return runItemAction(
      () => adminUserService.restoreRecycled(item.kind, item.key),
      'Đã khôi phục thành công',
      'Không thể khôi phục.'
    );
  };

  const purge = async (item: RecycleItem) => {
    if (item.purgeBlockReason) return showErrorToast(item.purgeBlockReason);
    const label = [RECYCLE_KIND_LABELS[item.kind], item.code || item.name].filter(Boolean).join(' ');
    const confirmed = await confirmDelete(`Xóa vĩnh viễn ${label}? Thao tác này không thể hoàn tác.`, {
      title: 'Xóa vĩnh viễn',
      confirmLabel: 'Xóa vĩnh viễn'
    });
    if (!confirmed) return;
    await runItemAction(
      () => adminUserService.purgeRecycled(item.kind, item.key),
      'Đã xóa vĩnh viễn',
      'Không thể xóa vĩnh viễn.'
    );
  };

  return (
    <div className="view-container admin-list-page">
      <PageContextHeader section="Hệ thống" current="Thùng rác" />
      <section className="card admin-list-workspace" data-erp-table-text="single-line">
        <div className="admin-list-toolbar">
          <input
            type="search"
            aria-label="Tìm trong thùng rác"
            placeholder="Tìm mã, tên, người xóa…"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <DataFilterButton activeCount={kindFilters.length} open={showFilters} onClick={() => setShowFilters(true)} />
          {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
        </div>
        <DataFilterChipBar
          chips={kindFilters.map(value => ({
            id: `kind:${value}`,
            label: RECYCLE_KIND_LABELS[value as RecycleKind],
            onRemove: () => setKindFilters(kindFilters.filter(item => item !== value))
          }))}
          onClear={() => setKindFilters([])}
        />
        {!loaded && !items.length ? (
          <TableSkeleton label="Đang tải thùng rác" rows={6} />
        ) : (
          <div className="admin-list-frame">
            <div className="table-container erp-primary-data-table">
              <table className="has-dynamic-columns" data-resize-key="recycle-bin">
                <thead>
                  <tr>
                    <ReorderableTableCells
                      order={table.orderedColumnIds}
                      getHeaderProps={table.getHeaderProps}
                      labels={table.labels}
                    >
                      <th key="kind">Loại tài liệu</th>
                      <th key="code">Mã</th>
                      <th key="name">Tên</th>
                      <th key="deletedBy">Người xóa</th>
                      <th key="deletedAt">Thời gian xóa</th>
                      <th key="key">Mã tài liệu hệ thống</th>
                      <th key="actions" aria-label="Thao tác" />
                    </ReorderableTableCells>
                  </tr>
                </thead>
                <tbody>
                  {pagination.rows.map(item => (
                    <tr key={`${item.kind}:${item.key}`}>
                      <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                        <td key="kind">{RECYCLE_KIND_LABELS[item.kind]}</td>
                        <td key="code" title={item.code}>
                          <strong>{item.code || '—'}</strong>
                        </td>
                        <td key="name" title={item.name}>
                          {item.name || '—'}
                        </td>
                        <td key="deletedBy">{item.deletedByName || 'Chưa ghi nhận'}</td>
                        <td key="deletedAt">{formatDeletedAt(item.deletedAt)}</td>
                        <td key="key" title={item.key}>
                          {item.key}
                        </td>
                        <td key="actions">
                          <RowActionMenu
                            label={`Thao tác ${item.code || item.name || item.key}`}
                            actions={[
                              { label: 'Khôi phục', onSelect: () => void restore(item), disabled: busy },
                              { label: 'Xóa vĩnh viễn', onSelect: () => void purge(item), disabled: busy, danger: true }
                            ]}
                          />
                        </td>
                      </ReorderableTableCells>
                    </tr>
                  ))}
                  {!visibleItems.length && (
                    <tr>
                      <td className="admin-list-empty" colSpan={table.orderedColumnIds.length}>
                        {items.length ? 'Không có mục phù hợp từ khóa hoặc bộ lọc.' : 'Thùng rác trống.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...pagination.paginationProps} />
          </div>
        )}
      </section>
      <TableColumnCustomizer {...table.customizerProps} />
      <DataFilterPanel
        open={showFilters}
        title="Lọc thùng rác"
        description="Lọc theo loại tài liệu."
        activeCount={kindFilters.length}
        onClose={() => setShowFilters(false)}
        onReset={() => setKindFilters([])}
      >
        <DataFilterSection title="Loại tài liệu" selectedCount={kindFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={KIND_FILTER_OPTIONS}
            selectedValues={kindFilters}
            onChange={setKindFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>
    </div>
  );
};
