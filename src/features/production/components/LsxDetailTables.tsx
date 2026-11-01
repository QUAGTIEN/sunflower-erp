import { useState, type ReactNode } from 'react';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { getCustomerProductSpecSummary } from '@/features/crm/model/customerProductCatalog';
import { PRODUCTION_PRIORITIES, lineKey, linePoId, type ProductionOrder } from '../model/productionOrder';

const LINE_COLUMNS: TableColumnOption[] = [
  { id: 'position', label: 'STT', required: true },
  { id: 'productCode', label: 'Mã SP' },
  { id: 'productName', label: 'Tên sản phẩm', required: true },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'order', label: 'Đơn hàng' },
  { id: 'specification', label: 'Quy cách' },
  { id: 'unit', label: 'ĐVT' },
  { id: 'quantity', label: 'SL lệnh', required: true },
  { id: 'catalogCode', label: 'Mã nội bộ' },
  { id: 'materialWidth', label: 'Khổ NVL (mm)', defaultVisible: false },
  { id: 'linePriority', label: 'Ưu tiên dòng', defaultVisible: false },
  { id: 'good', label: 'Đạt' },
  { id: 'reject', label: 'Hỏng' },
  { id: 'surplus', label: 'SL dư', defaultVisible: false },
  { id: 'shortage', label: 'SL thiếu', defaultVisible: false }
];
const LINE_LOCKED_START = ['position'];
const MATERIAL_COLUMNS: TableColumnOption[] = [
  { id: 'code', label: 'Mã NVL', required: true },
  { id: 'name', label: 'Tên NVL', required: true },
  { id: 'width', label: 'Khổ (mm)' },
  { id: 'quantity', label: 'Số lượng', required: true },
  { id: 'unit', label: 'ĐVT' },
  { id: 'allowance', label: 'Hao hụt (%)' }
];
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');

/** Order lines of a saved order with search, an order/customer filter and the standard column tools. */
export function LsxDetailLinesTable({ order }: { order: ProductionOrder }) {
  const [search, setSearch] = useState('');
  const [orderFilters, setOrderFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const table = useStandardTableColumns({
    layoutId: 'production-order-lines',
    columns: LINE_COLUMNS,
    lockedStartIds: LINE_LOCKED_START
  });
  const completed = order.status === 'completed';
  const lines = order.lines.map((line, index) => ({ line, position: index + 1, poCode: line.poCode || order.poCode }));
  const orderOptions = [...new Set(lines.map(entry => entry.poCode))].map(value => ({ value, label: value }));
  const keyword = search.trim().toLocaleLowerCase('vi');
  const visible = lines
    .filter(entry => !orderFilters.length || orderFilters.includes(entry.poCode))
    .filter(({ line }) =>
      `${line.productCode} ${line.productName} ${line.customerName || ''}`.toLocaleLowerCase('vi').includes(keyword)
    );
  const sameUnit = new Set(order.lines.map(line => line.unit)).size === 1;

  return (
    <>
      <div className="lsx-list-toolbar">
        <input
          type="search"
          aria-label="Tìm mặt hàng trong lệnh"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Tìm mã, tên sản phẩm, khách hàng…"
        />
        <DataFilterButton activeCount={orderFilters.length} open={showFilters} onClick={() => setShowFilters(true)} />
        {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
      </div>
      <DataFilterChipBar
        chips={orderFilters.map(value => ({
          id: value,
          label: value,
          onRemove: () => setOrderFilters(orderFilters.filter(item => item !== value))
        }))}
        onClear={() => setOrderFilters([])}
      />
      <DataFilterPanel
        open={showFilters}
        title="Lọc mặt hàng"
        description="Lọc các dòng theo đơn hàng của khách."
        activeCount={orderFilters.length}
        onClose={() => setShowFilters(false)}
        onReset={() => setOrderFilters([])}
      >
        <DataFilterSection title="Đơn hàng" selectedCount={orderFilters.length} defaultExpanded>
          <DataFilterCheckboxGroup options={orderOptions} selectedValues={orderFilters} onChange={setOrderFilters} />
        </DataFilterSection>
      </DataFilterPanel>
      <div className="table-container">
        <table className="lsx-detail-lines has-dynamic-columns" data-resize-key="production-order-lines">
          <thead>
            <tr>
              <ReorderableTableCells
                order={table.orderedColumnIds}
                getHeaderProps={table.getHeaderProps}
                labels={table.labels}
              >
                <th key="position" className="lsx-number">
                  STT
                </th>
                <th key="productCode">Mã SP</th>
                <th key="productName">Tên sản phẩm</th>
                <th key="customer">Khách hàng</th>
                <th key="order">Đơn hàng</th>
                <th key="specification">Quy cách</th>
                <th key="unit">ĐVT</th>
                <th key="quantity" className="lsx-number">
                  SL lệnh
                </th>
                <th key="catalogCode">Mã nội bộ</th>
                <th key="materialWidth" className="lsx-number">
                  Khổ NVL (mm)
                </th>
                <th key="linePriority">Ưu tiên dòng</th>
                <th key="good" className="lsx-number">
                  Đạt
                </th>
                <th key="reject" className="lsx-number">
                  Hỏng
                </th>
                <th key="surplus" className="lsx-number">
                  SL dư
                </th>
                <th key="shortage" className="lsx-number">
                  SL thiếu
                </th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ line, position, poCode }) => {
              const specification = [line.specification, line.material].filter(Boolean).join(' · ');
              // The full specification sits in the cell tooltip instead of a row that folds open.
              const specificationDetail = [
                specification,
                ...getCustomerProductSpecSummary(line.specifications, line.productType).map(
                  field => `${field.label}: ${field.value}`
                )
              ]
                .filter(Boolean)
                .join('\n');
              const shortage = Math.max(0, line.quantity - (line.goodQuantity ?? 0));
              const linePriority = line.printDetails?.priority || '';
              return (
                <tr key={lineKey(line)}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="position" className="lsx-number">
                      {position}
                    </td>
                    <td key="productCode" title={line.productCode}>
                      {line.productCode || 'Nhập tay'}
                    </td>
                    <td key="productName" title={line.productName}>
                      {line.productName}
                    </td>
                    <td key="customer" title={line.customerName || order.customerName}>
                      {line.customerName || order.customerName || '—'}
                    </td>
                    <td key="order" title={poCode || linePoId(line, order)}>
                      {poCode || '—'}
                    </td>
                    <td key="specification" title={specificationDetail}>
                      {specification || '—'}
                    </td>
                    <td key="unit">{line.unit}</td>
                    <td key="quantity" className="lsx-number">
                      {number(line.quantity)}
                    </td>
                    <td key="catalogCode" title={line.catalog?.code}>
                      {line.catalog?.code || 'Chưa liên kết'}
                    </td>
                    <td key="materialWidth" className="lsx-number">
                      {line.printDetails?.materialWidth || '—'}
                    </td>
                    <td key="linePriority">{PRODUCTION_PRIORITIES[linePriority] || 'Theo lệnh'}</td>
                    <td key="good" className="lsx-number">
                      {completed ? number(line.goodQuantity) : '—'}
                    </td>
                    <td key="reject" className="lsx-number">
                      {completed ? number(line.rejectQuantity) : '—'}
                    </td>
                    <td key="surplus" className="lsx-number">
                      {completed ? number(line.surplusQuantity) : '—'}
                    </td>
                    <td key="shortage" className="lsx-number">
                      {completed ? number(shortage) : '—'}
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={table.orderedColumnIds.length}>Không có mặt hàng phù hợp.</td>
              </tr>
            )}
          </tbody>
          {sameUnit && !search && !orderFilters.length && (
            <tfoot>
              <tr>
                {table.orderedColumnIds.map(columnId => (
                  <td key={columnId} className="lsx-number">
                    {columnId === 'quantity'
                      ? number(order.lines.reduce((sum, line) => sum + line.quantity, 0))
                      : columnId === table.orderedColumnIds[0]
                        ? 'Tổng'
                        : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </>
  );
}

/** Planned materials of a saved order; the action buttons of the materials tab sit beside the column button. */
export function LsxDetailMaterialsTable({ order, actions }: { order: ProductionOrder; actions?: ReactNode }) {
  const table = useStandardTableColumns({ layoutId: 'production-order-materials', columns: MATERIAL_COLUMNS });
  return (
    <>
      <div className="lsx-heading">
        <h3>Vật tư dự kiến</h3>
        <div className="lsx-actions">
          {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
          {actions}
        </div>
      </div>
      <div className="table-container">
        <table className="lsx-detail-materials has-dynamic-columns" data-resize-key="production-order-materials">
          <thead>
            <tr>
              <ReorderableTableCells
                order={table.orderedColumnIds}
                getHeaderProps={table.getHeaderProps}
                labels={table.labels}
              >
                <th key="code">Mã NVL</th>
                <th key="name">Tên NVL</th>
                <th key="width" className="lsx-number">
                  Khổ (mm)
                </th>
                <th key="quantity" className="lsx-number">
                  Số lượng
                </th>
                <th key="unit">ĐVT</th>
                <th key="allowance" className="lsx-number">
                  Hao hụt (%)
                </th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {order.materials.map(material => (
              <tr key={material.id}>
                <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                  <td key="code">{material.code}</td>
                  <td key="name" title={material.name}>
                    {material.name}
                  </td>
                  <td key="width" className="lsx-number">
                    {material.width || '—'}
                  </td>
                  <td key="quantity" className="lsx-number">
                    {number(material.quantity)}
                  </td>
                  <td key="unit">{material.unit}</td>
                  <td key="allowance" className="lsx-number">
                    {number(material.allowancePercent)}
                  </td>
                </ReorderableTableCells>
              </tr>
            ))}
            {!order.materials.length && (
              <tr>
                <td colSpan={table.orderedColumnIds.length}>Chưa khai báo vật tư dự kiến.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </>
  );
}
