import { useState } from 'react';
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
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { PRODUCTION_PRIORITIES, PRODUCTION_STATUSES, type CommandRecord } from '../model/productionOrder';

interface Props {
  commands: CommandRecord[];
  canCreate: boolean;
  /** Orders before production starts that the current user may still edit or delete. */
  canChange: (command: CommandRecord) => boolean;
  onCreate: () => void;
  onOpen: (command: CommandRecord) => void;
  onPrint: (command: CommandRecord) => void;
  onEdit: (command: CommandRecord) => void;
  onDelete: (command: CommandRecord) => void;
  /** Orders of the old flow open in their own screen when this is set; otherwise they are listed only. */
  canOpenLegacy: boolean;
}

const LIST_COLUMNS: TableColumnOption[] = [
  { id: 'code', label: 'Số LSX', required: true },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'orders', label: 'Đơn hàng' },
  { id: 'products', label: 'Mặt hàng' },
  { id: 'lineCount', label: 'Số dòng' },
  { id: 'priority', label: 'Ưu tiên' },
  { id: 'deadline', label: 'Ngày cần' },
  { id: 'planned', label: 'Dự kiến sản xuất', defaultVisible: false },
  { id: 'machine', label: 'Máy', defaultVisible: false },
  { id: 'operator', label: 'Người chạy máy', defaultVisible: false },
  { id: 'createdBy', label: 'Người lập', defaultVisible: false },
  { id: 'createdAt', label: 'Ngày lập', defaultVisible: false },
  { id: 'status', label: 'Trạng thái' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['code'];
const LOCKED_END = ['actions'];
/** Older orders may also carry the transfer state of the previous production flow. */
const LIST_STATUSES: Record<string, string> = { ...PRODUCTION_STATUSES, transfer_pending: 'Chờ duyệt bàn giao' };
const ORDER_TYPES = [
  { value: 'managed', label: 'Lệnh mới' },
  { value: 'legacy', label: 'Lệnh cũ' }
];
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
const orderTypeOf = (command: CommandRecord) => (command.productionOrderVersion === 2 ? 'managed' : 'legacy');
const poCodesOf = (command: CommandRecord) =>
  command.poCodes?.length ? command.poCodes.join(', ') : String(command.poCode || '');
const productsOf = (command: CommandRecord) =>
  (command.lines || []).map(line => line.productName).join(', ') ||
  String(command.productNameToBeCut || command.productName || '');
const searchTextOf = (command: CommandRecord) =>
  [
    command.lsxCode,
    poCodesOf(command),
    command.customerName,
    command.operatorName,
    command.machineName,
    productsOf(command),
    (command.lines || []).map(line => line.productCode).join(' ')
  ]
    .join(' ')
    .toLocaleLowerCase('vi');

/** Production order list with the standard table tools: search, filters, column choice and drag-to-reorder. */
export function ProductionOrderList({
  commands,
  canCreate,
  canChange,
  onCreate,
  onOpen,
  onPrint,
  onEdit,
  onDelete,
  canOpenLegacy
}: Props) {
  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [orderTypeFilters, setOrderTypeFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'production-orders',
    columns: LIST_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });
  const activeFilterCount = statusFilters.length + priorityFilters.length + orderTypeFilters.length;
  const keyword = search.trim().toLocaleLowerCase('vi');
  // A deleted order is a cancelled one: it leaves the list and comes back only through the "Đã xóa" filter.
  const visible = commands
    .filter(command =>
      statusFilters.length ? statusFilters.includes(String(command.status)) : command.status !== 'cancelled'
    )
    .filter(command => !priorityFilters.length || priorityFilters.includes(String(command.priority || 'normal')))
    .filter(command => !orderTypeFilters.length || orderTypeFilters.includes(orderTypeOf(command)))
    .filter(command => !keyword || searchTextOf(command).includes(keyword))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const pagination = useDataTablePagination(visible);
  const filterGroups = [
    { id: 'status', values: statusFilters, labels: LIST_STATUSES, set: setStatusFilters },
    { id: 'priority', values: priorityFilters, labels: PRODUCTION_PRIORITIES, set: setPriorityFilters },
    {
      id: 'type',
      values: orderTypeFilters,
      labels: Object.fromEntries(ORDER_TYPES.map(type => [type.value, type.label])),
      set: setOrderTypeFilters
    }
  ];
  const resetFilters = () => filterGroups.forEach(group => group.set([]));
  const rowActions = (command: CommandRecord) => {
    const managed = command.productionOrderVersion === 2;
    return [
      { label: 'Chi tiết', onSelect: () => onOpen(command) },
      ...(managed ? [{ label: 'Xuất lệnh sản xuất', onSelect: () => onPrint(command) }] : []),
      ...(managed && canChange(command)
        ? [
            { label: 'Chỉnh sửa', onSelect: () => onEdit(command) },
            { label: 'Xóa', onSelect: () => onDelete(command), danger: true }
          ]
        : [])
    ];
  };

  return (
    <>
      <div className="lsx-list-toolbar">
        <input
          type="search"
          aria-label="Tìm lệnh sản xuất"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Tìm số LSX, khách hàng, đơn hàng, sản phẩm…"
        />
        <DataFilterButton activeCount={activeFilterCount} open={showFilters} onClick={() => setShowFilters(true)} />
        {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
        {canCreate && (
          <button type="button" className="btn btn-primary" onClick={onCreate}>
            Lập lệnh sản xuất
          </button>
        )}
      </div>
      <DataFilterChipBar
        chips={filterGroups.flatMap(group =>
          group.values.map(value => ({
            id: `${group.id}:${value}`,
            label: group.labels[value] || value,
            onRemove: () => group.set(group.values.filter(item => item !== value))
          }))
        )}
        onClear={resetFilters}
      />
      <DataFilterPanel
        open={showFilters}
        title="Lọc lệnh sản xuất"
        description="Lệnh đã xóa chỉ hiện khi chọn trạng thái “Đã xóa”."
        activeCount={activeFilterCount}
        onClose={() => setShowFilters(false)}
        onReset={resetFilters}
      >
        <DataFilterSection title="Trạng thái" selectedCount={statusFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup
            options={Object.entries(LIST_STATUSES).map(([value, label]) => ({ value, label }))}
            selectedValues={statusFilters}
            onChange={setStatusFilters}
          />
        </DataFilterSection>
        <DataFilterSection title="Mức độ ưu tiên" selectedCount={priorityFilters.length}>
          <DataFilterCheckboxGroup
            options={Object.entries(PRODUCTION_PRIORITIES).map(([value, label]) => ({ value, label }))}
            selectedValues={priorityFilters}
            onChange={setPriorityFilters}
          />
        </DataFilterSection>
        <DataFilterSection title="Loại lệnh" selectedCount={orderTypeFilters.length}>
          <DataFilterCheckboxGroup
            options={ORDER_TYPES}
            selectedValues={orderTypeFilters}
            onChange={setOrderTypeFilters}
          />
        </DataFilterSection>
      </DataFilterPanel>
      <div className="lsx-list-frame">
        <div className="table-container erp-primary-data-table">
          <table className="lsx-list has-dynamic-columns" data-resize-key="production-orders">
            <thead>
              <tr>
                <ReorderableTableCells
                  order={table.orderedColumnIds}
                  getHeaderProps={table.getHeaderProps}
                  labels={table.labels}
                >
                  <th key="code">Số LSX</th>
                  <th key="customer">Khách hàng</th>
                  <th key="orders">Đơn hàng</th>
                  <th key="products">Mặt hàng</th>
                  <th key="lineCount" className="lsx-number">
                    Số dòng
                  </th>
                  <th key="priority">Ưu tiên</th>
                  <th key="deadline">Ngày cần</th>
                  <th key="planned">Dự kiến sản xuất</th>
                  <th key="machine">Máy</th>
                  <th key="operator">Người chạy máy</th>
                  <th key="createdBy">Người lập</th>
                  <th key="createdAt">Ngày lập</th>
                  <th key="status">Trạng thái</th>
                  <th key="actions" aria-label="Thao tác" />
                </ReorderableTableCells>
              </tr>
            </thead>
            <tbody>
              {pagination.rows.map(command => {
                const managed = command.productionOrderVersion === 2;
                const openable = managed || canOpenLegacy;
                const poCodes = poCodesOf(command);
                const products = productsOf(command);
                const priority = String(command.priority || 'normal');
                const planned =
                  command.plannedStartDate || command.plannedEndDate
                    ? `${formatDate(command.plannedStartDate || '')} – ${formatDate(command.plannedEndDate || '')}`
                    : '';
                const status = `${managed ? '' : 'Lệnh cũ · '}${LIST_STATUSES[String(command.status)] || 'Chưa rõ'}`;
                return (
                  <tr
                    key={String(command.id)}
                    className={openable ? 'lsx-list-row' : undefined}
                    onClick={openable ? () => onOpen(command) : undefined}
                  >
                    <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                      <td key="code">{String(command.lsxCode || '')}</td>
                      <td key="customer" title={String(command.customerName || '')}>
                        {String(command.customerName || '—')}
                      </td>
                      <td key="orders" title={poCodes}>
                        {poCodes || '—'}
                      </td>
                      <td key="products" title={products}>
                        {products || '—'}
                      </td>
                      <td key="lineCount" className="lsx-number">
                        {managed ? number(command.lines?.length) : '—'}
                      </td>
                      <td key="priority">
                        <span className={`lsx-priority-badge lsx-priority-badge--${priority}`}>
                          {PRODUCTION_PRIORITIES[priority] || PRODUCTION_PRIORITIES.normal}
                        </span>
                      </td>
                      <td key="deadline">{formatDate(command.deliveryDeadline)}</td>
                      <td key="planned" title={planned}>
                        {planned || '—'}
                      </td>
                      <td key="machine" title={String(command.machineName || '')}>
                        {String(command.machineName || '—')}
                      </td>
                      <td key="operator" title={String(command.operatorName || '')}>
                        {String(command.operatorName || '—')}
                      </td>
                      <td key="createdBy" title={String(command.createdBy || '')}>
                        {String(command.createdBy || '—')}
                      </td>
                      <td key="createdAt">{formatDateTime(command.createdAt, 'vi-VN', '—')}</td>
                      <td key="status">
                        <span className={`lsx-status lsx-status--${command.status}`}>{status}</span>
                      </td>
                      <td key="actions" onClick={event => event.stopPropagation()}>
                        {openable && (
                          <RowActionMenu
                            label={`Thao tác ${command.lsxCode || 'lệnh sản xuất'}`}
                            actions={rowActions(command)}
                          />
                        )}
                      </td>
                    </ReorderableTableCells>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={table.orderedColumnIds.length}>
                    Chưa có lệnh phù hợp. Bấm “Lập lệnh sản xuất” để lấy hàng từ đơn hàng của khách.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination {...pagination.paginationProps} />
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </>
  );
}
