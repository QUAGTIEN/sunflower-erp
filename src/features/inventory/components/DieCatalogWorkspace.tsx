import { useState } from 'react';
import { DataTablePagination } from '@/components/DataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { LoadingStatus } from '@/components/LoadingStates';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { RowActionMenu } from '@/components/RowActionMenu';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import {
  dieCornerLabel,
  dieCylinderLabel,
  dieGapLabel,
  dieLabelSize,
  dieLayoutLabel,
  type DieRecord
} from '@/features/catalog/model/dieCatalog';
import { DieDialog } from './DieDialog';

interface Props {
  canManage: boolean;
}

const DIE_QUERIES: LiveQuery<'dies'>[] = [{ name: 'dies', collection: 'die_catalog' }];
const MESSAGES = {
  readError: 'Không tải được danh mục dao. Kiểm tra kết nối và thử lại.',
  unavailable: 'Danh mục dao cần kết nối Firebase.'
};
const DIE_COLUMNS: TableColumnOption[] = [
  { id: 'code', label: 'Mã dao', required: true },
  { id: 'name', label: 'Tên dao', required: true },
  { id: 'cylinder', label: 'Trục dao' },
  { id: 'labelSize', label: 'Kích thước tem' },
  { id: 'corner', label: 'Góc' },
  { id: 'perforated', label: 'Răng cưa' },
  { id: 'layout', label: 'Bố cục tem' },
  { id: 'gap', label: 'Khoảng cách' },
  { id: 'storage', label: 'Vị trí cất' },
  { id: 'status', label: 'Trạng thái' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['code'];
const LOCKED_END = ['actions'];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Đang dùng' },
  { value: 'inactive', label: 'Ngừng dùng' }
];
const PERFORATION_OPTIONS = [
  { value: 'yes', label: 'Có răng cưa' },
  { value: 'no', label: 'Không răng cưa' }
];
const optionLabel = (options: { value: string; label: string }[], value: string) =>
  options.find(option => option.value === value)?.label || value;
const searchText = (die: DieRecord) =>
  [die.code, die.name, dieCylinderLabel(die), dieLabelSize(die), die.storageLocation, die.notes]
    .join(' ')
    .toLocaleLowerCase('vi-VN');

/** Danh mục dao (D-DAO1): every cutting die with its size, corners, perforation and layout. */
export function DieCatalogWorkspace({ canManage }: Props) {
  const live = useLiveCollections(DIE_QUERIES, MESSAGES);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<DieRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [perforationFilters, setPerforationFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'die-catalog',
    columns: DIE_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });
  const needle = search.trim().toLocaleLowerCase('vi-VN');
  const activeFilterCount = statusFilters.length + perforationFilters.length;
  const resetFilters = () => {
    setStatusFilters([]);
    setPerforationFilters([]);
  };
  const dies = ((live.snapshots?.dies || []) as unknown as DieRecord[])
    .filter(die => !needle || searchText(die).includes(needle))
    .filter(die => !statusFilters.length || statusFilters.includes(die.active ? 'active' : 'inactive'))
    .filter(die => !perforationFilters.length || perforationFilters.includes(die.perforated ? 'yes' : 'no'))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  const pagination = useDataTablePagination(dies);

  return (
    <>
      <div className="warehouse-toolbar">
        <input
          type="search"
          aria-label="Tìm dao"
          placeholder="Tìm mã dao, tên, cỡ trục, kích thước tem…"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
        {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
        {canManage && (
          <div className="warehouse-toolbar-end">
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              + Thêm dao
            </button>
          </div>
        )}
      </div>
      <DataFilterChipBar
        chips={[
          ...statusFilters.map(value => ({
            id: `status:${value}`,
            label: optionLabel(STATUS_OPTIONS, value),
            onRemove: () => setStatusFilters(statusFilters.filter(item => item !== value))
          })),
          ...perforationFilters.map(value => ({
            id: `perforation:${value}`,
            label: optionLabel(PERFORATION_OPTIONS, value),
            onRemove: () => setPerforationFilters(perforationFilters.filter(item => item !== value))
          }))
        ]}
        onClear={resetFilters}
      />
      {live.error && (
        <p className="warehouse-error" role="alert">
          {live.error}
        </p>
      )}
      <LoadingStatus loading={live.loading} hasData={Boolean(live.snapshots)} label="Đang tải danh mục dao" />
      {!live.loading && (
        <div className="warehouse-list-frame">
          <div className="table-container erp-primary-data-table">
            <table className="die-catalog-table has-dynamic-columns" data-resize-key="die-catalog">
              <thead>
                <tr>
                  <ReorderableTableCells
                    order={table.orderedColumnIds}
                    getHeaderProps={table.getHeaderProps}
                    labels={table.labels}
                  >
                    <th key="code">Mã dao</th>
                    <th key="name">Tên dao</th>
                    <th key="cylinder">Trục dao</th>
                    <th key="labelSize">Kích thước tem</th>
                    <th key="corner">Góc</th>
                    <th key="perforated">Răng cưa</th>
                    <th key="layout">Bố cục tem</th>
                    <th key="gap" title="Khoảng cách giữa các tem ngang / dọc">
                      Khoảng cách
                    </th>
                    <th key="storage">Vị trí cất</th>
                    <th key="status">Trạng thái</th>
                    <th key="actions" aria-label="Thao tác" />
                  </ReorderableTableCells>
                </tr>
              </thead>
              <tbody>
                {pagination.rows.map(die => (
                  <tr key={die.id} className={die.active ? undefined : 'is-muted'}>
                    <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                      <td key="code" title={die.code}>
                        <strong>{die.code}</strong>
                      </td>
                      <td key="name" title={[die.name, die.notes].filter(Boolean).join(' — ')}>
                        {die.name}
                      </td>
                      <td key="cylinder">{dieCylinderLabel(die)}</td>
                      <td key="labelSize">{dieLabelSize(die)}</td>
                      <td key="corner">{dieCornerLabel(die)}</td>
                      <td key="perforated">{die.perforated ? 'Có' : 'Không'}</td>
                      <td key="layout">{dieLayoutLabel(die)}</td>
                      <td key="gap" title="Ngang / dọc">
                        {dieGapLabel(die)}
                      </td>
                      <td key="storage" title={die.storageLocation}>
                        {die.storageLocation || '—'}
                      </td>
                      <td key="status">{die.active ? 'Đang dùng' : 'Ngừng dùng'}</td>
                      <td key="actions">
                        {canManage && (
                          <RowActionMenu
                            label={`Thao tác ${die.code}`}
                            actions={[{ label: 'Sửa thông tin dao', onSelect: () => setEditing(die) }]}
                          />
                        )}
                      </td>
                    </ReorderableTableCells>
                  </tr>
                ))}
                {!dies.length && (
                  <tr>
                    <td colSpan={table.orderedColumnIds.length}>
                      {needle || activeFilterCount
                        ? 'Không có dao phù hợp từ khóa hoặc bộ lọc.'
                        : 'Chưa có dao trong danh mục. Bấm "+ Thêm dao" để khai báo.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...pagination.paginationProps} />
        </div>
      )}
      <TableColumnCustomizer {...table.customizerProps} />
      <DataFilterPanel
        open={showFilters}
        title="Lọc danh sách dao"
        description="Lọc theo trạng thái sử dụng và răng cưa."
        activeCount={activeFilterCount}
        onClose={() => setShowFilters(false)}
        onReset={resetFilters}
      >
        <DataFilterSection title="Trạng thái" selectedCount={statusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={STATUS_OPTIONS}
            selectedValues={statusFilters}
            onChange={setStatusFilters}
          />
        </DataFilterSection>
        <DataFilterSection title="Răng cưa" selectedCount={perforationFilters.length}>
          <DataFilterCheckboxGroup
            options={PERFORATION_OPTIONS}
            selectedValues={perforationFilters}
            onChange={setPerforationFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>
      {(creating || editing) && (
        <DieDialog
          previous={editing || undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
