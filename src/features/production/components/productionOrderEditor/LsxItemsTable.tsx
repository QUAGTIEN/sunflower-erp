import { Trash2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import type { ProductionDraftCatalog } from '../../api/productionOrderService';
import {
  PRODUCTION_PRIORITIES,
  itemIdentity,
  type CommandRecord,
  type ProductionPO
} from '../../model/productionOrder';
import {
  EMPTY_PRINT_DETAILS,
  draftLineKey,
  poAllocations,
  remainingQuantity,
  type DraftLine,
  type LinePrintDetails
} from './draftLines';

interface Props {
  lines: DraftLine[];
  pos: ProductionPO[];
  commands: CommandRecord[];
  draftId: string;
  catalogLines: ProductionDraftCatalog['lines'];
  stockBalances?: Record<string, number>;
  catalogLoading: boolean;
  catalogError: string;
  onReloadCatalog: () => void;
  onChange: (lines: DraftLine[]) => void;
}

const ITEM_COLUMNS: TableColumnOption[] = [
  { id: 'position', label: 'STT', required: true },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'order', label: 'Đơn hàng' },
  { id: 'productCode', label: 'Mã SP' },
  { id: 'productName', label: 'Tên sản phẩm', required: true },
  { id: 'specification', label: 'Quy cách' },
  { id: 'unit', label: 'ĐVT' },
  { id: 'remaining', label: 'Còn lại' },
  { id: 'finishedStock', label: 'Tồn TP' },
  { id: 'quantity', label: 'SL lệnh', required: true },
  { id: 'catalogCode', label: 'Mã nội bộ' },
  { id: 'materialWidth', label: 'Khổ NVL (mm)' },
  { id: 'linePriority', label: 'Ưu tiên dòng' },
  { id: 'actions', label: 'Thao tác', required: true }
];
const LOCKED_START = ['position'];
const LOCKED_END = ['actions'];
const number = (value: unknown) => Number(value || 0).toLocaleString('vi-VN');
// Specifications saved by an old product-code bug read "undefinedxundefinedmm"; flag them instead of showing them.
const isBrokenSpecification = (value: string) => !value.trim() || /undefined|null|NaN/.test(value);

/** Lines of the order being drafted, one row each; every line keeps its own order and that order's customer. */
export function LsxItemsTable({
  lines,
  pos,
  commands,
  draftId,
  catalogLines,
  stockBalances,
  catalogLoading,
  catalogError,
  onReloadCatalog,
  onChange
}: Props) {
  const table = useStandardTableColumns({
    layoutId: 'production-draft-items',
    columns: ITEM_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: LOCKED_END
  });
  const update = (key: string, patch: Partial<DraftLine>) =>
    onChange(lines.map(line => (draftLineKey(line) === key ? { ...line, ...patch } : line)));
  const updateDetails = (line: DraftLine, patch: Partial<LinePrintDetails>) =>
    update(draftLineKey(line), { printDetails: { ...(line.printDetails || EMPTY_PRINT_DETAILS), ...patch } });
  const orderCount = new Set(lines.map(line => line.poId)).size;
  const customerCount = new Set(lines.map(line => String(pos.find(po => po.id === line.poId)?.customerId || line.poId)))
    .size;
  const summary = `${lines.length} dòng · ${orderCount} đơn hàng · ${customerCount} khách hàng`;

  return (
    <section className="lsx-section">
      <div className="lsx-section-header">
        <h3>Mặt hàng</h3>
        {lines.length > 0 && <span className="lsx-section-summary">{summary}</span>}
        {table.canEditColumns && <TableColumnsButton onClick={table.openCustomizer} />}
      </div>
      {catalogLoading && (
        <p role="status" className="lsx-hint">
          Đang tải mã nội bộ và danh mục NVL…
        </p>
      )}
      {catalogError && (
        <div role="alert" className="lsx-hint">
          {catalogError} Không tự ghép mã theo tên; thông tin được máy chủ kiểm tra lại khi lưu.{' '}
          <button type="button" className="btn btn-outline" disabled={catalogLoading} onClick={onReloadCatalog}>
            Tải lại danh mục
          </button>
        </div>
      )}
      <div className="table-container">
        <table className="lsx-items has-dynamic-columns" data-resize-key="production-draft-items">
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
                <th key="customer">Khách hàng</th>
                <th key="order">Đơn hàng</th>
                <th key="productCode">Mã SP</th>
                <th key="productName">Tên sản phẩm</th>
                <th key="specification">Quy cách</th>
                <th key="unit">ĐVT</th>
                <th key="remaining" className="lsx-number">
                  Còn lại
                </th>
                <th key="finishedStock" className="lsx-number" title="Tồn kho thành phẩm của mã nội bộ đã liên kết">
                  Tồn TP
                </th>
                <th key="quantity" className="lsx-number">
                  SL lệnh *
                </th>
                <th key="catalogCode">Mã nội bộ</th>
                <th
                  key="materialWidth"
                  className="lsx-number"
                  title="Khổ vật liệu đầu vào, không phải chiều rộng con tem"
                >
                  Khổ NVL (mm)
                </th>
                <th key="linePriority">Ưu tiên dòng</th>
                <th key="actions" aria-label="Thao tác" />
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, position) => {
              const key = draftLineKey(line);
              const po = pos.find(candidate => candidate.id === line.poId);
              const index = (po?.items || []).findIndex((item, row) => itemIdentity(item, row) === line.itemId);
              const item = po?.items?.[index];
              const allocated = poAllocations(commands, line.poId, draftId)?.get(key) || 0;
              const remaining = item ? remainingQuantity(item, allocated) : 0;
              const overRemaining = line.quantity !== '' && Number(line.quantity) > remaining;
              const productName = String(item?.productName || line.itemId);
              const specification = [item?.size, item?.material].filter(Boolean).map(String).join(' · ');
              const mapped = catalogLines[key];
              const finishedStock = mapped?.catalog?.id ? Number(stockBalances?.[mapped.catalog.id] || 0) : null;
              const customerName = String(po?.customerName || 'Chưa có khách');
              const poCode = String(po?.poCode || line.poId);
              return (
                <tr key={key}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="position" className="lsx-number">
                      {position + 1}
                    </td>
                    <td key="customer" title={customerName}>
                      {customerName}
                    </td>
                    <td key="order" title={poCode}>
                      {poCode}
                    </td>
                    <td key="productCode" title={String(item?.productCode || '')}>
                      {String(item?.productCode || 'Nhập tay')}
                    </td>
                    <td key="productName" title={productName}>
                      {productName}
                    </td>
                    {isBrokenSpecification(specification) ? (
                      <td key="specification" className="lsx-text-danger">
                        Chưa có quy cách
                      </td>
                    ) : (
                      <td key="specification" title={specification}>
                        {specification}
                      </td>
                    )}
                    <td key="unit">{String(item?.unit || '—')}</td>
                    <td key="remaining" className="lsx-number">
                      {number(remaining)}
                    </td>
                    <td
                      key="finishedStock"
                      className="lsx-number"
                      title={
                        finishedStock === null
                          ? 'Chưa liên kết mã nội bộ nên chưa xem được tồn'
                          : `${number(finishedStock)} ${mapped?.catalog?.baseUnit || ''}`
                      }
                    >
                      {finishedStock === null ? '—' : number(finishedStock)}
                    </td>
                    <td key="quantity">
                      <input
                        aria-label={`Số lượng ${productName} của ${poCode}`}
                        aria-invalid={overRemaining || undefined}
                        title={overRemaining ? `Vượt số lượng còn lại (${number(remaining)})` : undefined}
                        className={overRemaining ? 'lsx-number is-invalid' : 'lsx-number'}
                        type="number"
                        min="0"
                        step="any"
                        max={remaining}
                        required
                        value={line.quantity}
                        onChange={event => update(key, { quantity: event.target.value })}
                      />
                    </td>
                    <td key="catalogCode">
                      {mapped?.catalog?.code ? (
                        <span title={mapped.catalog.code}>{mapped.catalog.code}</span>
                      ) : (
                        <span className="lsx-tag lsx-tag--warning" title={mapped?.error}>
                          {mapped?.error ? 'Cần đối soát' : 'Chưa liên kết'}
                        </span>
                      )}
                    </td>
                    <td key="materialWidth">
                      <input
                        aria-label={`Khổ NVL ${productName}`}
                        className="lsx-number"
                        type="number"
                        min="0.001"
                        step="any"
                        value={line.printDetails.materialWidth}
                        onChange={event => updateDetails(line, { materialWidth: event.target.value })}
                      />
                    </td>
                    <td key="linePriority">
                      <select
                        aria-label={`Ưu tiên ${productName}`}
                        value={line.printDetails.priority}
                        onChange={event => updateDetails(line, { priority: event.target.value })}
                      >
                        <option value="">Theo ưu tiên lệnh</option>
                        {Object.entries(PRODUCTION_PRIORITIES).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td key="actions">
                      <IconButton
                        label={`Bỏ ${productName} khỏi lệnh`}
                        icon={<Trash2 />}
                        onClick={() => onChange(lines.filter(candidate => draftLineKey(candidate) !== key))}
                      />
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {!lines.length && (
              <tr>
                <td colSpan={table.orderedColumnIds.length}>
                  Chưa có mặt hàng. Bấm “Chọn hàng” cạnh ô Khách hàng để tick khách hàng, đơn hàng và mã sản phẩm.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </section>
  );
}
