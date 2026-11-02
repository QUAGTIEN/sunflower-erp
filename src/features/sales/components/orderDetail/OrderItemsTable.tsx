import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { calculatePOItemFinancials } from '@/domain/poFinancials';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { lineImages } from '../../model/orderDetail';

export interface OrderLine extends Record<string, unknown> {
  itemId?: string;
  productCode?: string;
  productName?: string;
  size?: string;
  material?: string;
  unit?: string;
  supplierId?: string;
  supplierName?: string;
  purchasePrice?: number | string;
}

interface OrderItemsTableProps {
  items: OrderLine[];
  supplierNames: Record<string, string>;
  /** Prices, discounts, tax and KPI follow the existing sale-financials rule (D-PO1 keeps it). */
  canViewFinancials: boolean;
  /** Buying price and gross profit stay with admins and accountants. */
  canViewCosts: boolean;
  onPreviewImage: (image: string) => void;
}

/** Same columns as the voucher in mockup C; KPI, picture and cost columns can be switched on per layout. */
const BASE_COLUMNS: TableColumnOption[] = [
  { id: 'index', label: '#', required: true },
  { id: 'code', label: 'Mã hàng', required: true },
  { id: 'name', label: 'Tên hàng' },
  { id: 'spec', label: 'Quy cách / chất liệu' },
  { id: 'unit', label: 'ĐVT' },
  { id: 'quantity', label: 'Số lượng' },
  { id: 'price', label: 'Đơn giá' },
  { id: 'gross', label: 'Thành tiền' },
  { id: 'discountRate', label: '% CK' },
  { id: 'discountAmount', label: 'Tiền CK' },
  { id: 'vatRate', label: '% thuế' },
  { id: 'vatAmount', label: 'Tiền thuế' },
  { id: 'supplier', label: 'Nhà cung cấp' },
  { id: 'total', label: 'Tổng (gồm VAT)', defaultVisible: false },
  { id: 'kpi', label: 'KPI', defaultVisible: false },
  { id: 'images', label: 'Ảnh mẫu', defaultVisible: false }
];
const COST_COLUMNS: TableColumnOption[] = [
  { id: 'purchasePrice', label: 'Giá mua', defaultVisible: false },
  { id: 'profit', label: 'Lãi gộp', defaultVisible: false }
];
const LOCKED_START = ['index'];
const NO_LOCKED_END: string[] = [];

const amount = (value: number) => Math.round(value).toLocaleString('vi-VN');

export function OrderItemsTable({
  items,
  supplierNames,
  canViewFinancials,
  canViewCosts,
  onPreviewImage
}: OrderItemsTableProps) {
  const table = useStandardTableColumns({
    layoutId: canViewCosts ? 'order-detail-lines-costs' : 'order-detail-lines',
    columns: canViewCosts ? [...BASE_COLUMNS, ...COST_COLUMNS] : BASE_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: NO_LOCKED_END
  });
  const money = (value: number) => (canViewFinancials ? amount(value) : '—');
  const lines = items.map(item => {
    const line = calculatePOItemFinancials(item);
    return { item, line, profit: line.amountBeforeVat - line.quantity * (Number(item.purchasePrice) || 0) };
  });
  const units = new Set(items.map(item => item.unit || 'cái'));
  const sum = (pick: (entry: (typeof lines)[number]) => number) =>
    lines.reduce((total, entry) => total + pick(entry), 0);

  return (
    <div className="order-lines">
      {table.canEditColumns && (
        <div className="order-lines__toolbar">
          <TableColumnsButton onClick={table.openCustomizer} />
        </div>
      )}
      <div className="table-container order-grid-wrap">
        <table className="order-grid">
          <thead>
            <tr>
              <ReorderableTableCells
                order={table.orderedColumnIds}
                getHeaderProps={table.getHeaderProps}
                labels={table.labels}
              >
                <th key="index" className="order-number order-grid__index">
                  #
                </th>
                <th key="code">Mã hàng</th>
                <th key="name">Tên hàng</th>
                <th key="spec">Quy cách / chất liệu</th>
                <th key="unit">ĐVT</th>
                <th key="quantity" className="order-number">
                  Số lượng
                </th>
                <th key="price" className="order-number">
                  Đơn giá
                </th>
                <th key="gross" className="order-number">
                  Thành tiền
                </th>
                <th key="discountRate" className="order-number">
                  % CK
                </th>
                <th key="discountAmount" className="order-number">
                  Tiền CK
                </th>
                <th key="vatRate" className="order-number">
                  % thuế
                </th>
                <th key="vatAmount" className="order-number">
                  Tiền thuế
                </th>
                <th key="supplier">Nhà cung cấp</th>
                <th key="total" className="order-number">
                  Tổng (gồm VAT)
                </th>
                <th key="kpi" className="order-number">
                  KPI
                </th>
                <th key="images">Ảnh mẫu</th>
                <th key="purchasePrice" className="order-number">
                  Giá mua
                </th>
                <th key="profit" className="order-number">
                  Lãi gộp
                </th>
              </ReorderableTableCells>
            </tr>
          </thead>
          <tbody>
            {lines.map(({ item, line, profit }, index) => {
              const supplier = item.supplierName || supplierNames[item.supplierId || ''] || '';
              const spec = [item.size, item.material].filter(Boolean).join(' · ');
              const images = lineImages(item);
              return (
                <tr key={item.itemId || index}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="index" className="order-number order-grid__index">
                      {index + 1}
                    </td>
                    <td key="code" title={item.productCode}>
                      {item.productCode || '—'}
                    </td>
                    <td key="name" title={item.productName}>
                      {item.productName || <span className="order-muted">Chưa nhập</span>}
                    </td>
                    <td key="spec" title={spec}>
                      {spec || <span className="order-muted">Chưa nhập</span>}
                    </td>
                    <td key="unit">{item.unit || 'cái'}</td>
                    <td key="quantity" className="order-number">
                      {line.quantity.toLocaleString('vi-VN')}
                    </td>
                    <td key="price" className="order-number">
                      {money(line.unitPrice)}
                    </td>
                    <td key="gross" className="order-number">
                      {money(line.grossAmount)}
                    </td>
                    <td key="discountRate" className="order-number">
                      {canViewFinancials ? (line.discountType === 'percent' ? line.discountRate : '') : '—'}
                    </td>
                    <td key="discountAmount" className="order-number">
                      {money(line.discountAmount)}
                    </td>
                    <td key="vatRate" className="order-number">
                      {canViewFinancials ? line.vatRate : '—'}
                    </td>
                    <td key="vatAmount" className="order-number">
                      {money(line.vatAmount)}
                    </td>
                    <td key="supplier" title={supplier}>
                      {supplier || <span className="order-muted">Chưa chọn</span>}
                    </td>
                    <td key="total" className="order-number">
                      {money(line.amountWithVat)}
                    </td>
                    <td key="kpi" className="order-number">
                      {canViewFinancials ? `${line.kpiPo.toFixed(1)}%` : '—'}
                    </td>
                    <td key="images">
                      <span className="order-thumbnails">
                        {images.slice(0, 4).map((image, imageIndex) => (
                          <button
                            key={`${imageIndex}-${image.slice(-16)}`}
                            type="button"
                            className="order-thumbnail"
                            aria-label={`Xem ảnh mẫu ${imageIndex + 1}`}
                            onClick={() => onPreviewImage(image)}
                          >
                            <img src={image} alt="" />
                          </button>
                        ))}
                        {!images.length && <span className="order-muted">Chưa có</span>}
                      </span>
                    </td>
                    <td key="purchasePrice" className="order-number">
                      {amount(Number(item.purchasePrice) || 0)}
                    </td>
                    <td key="profit" className="order-number">
                      {amount(profit)}
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {!lines.length && (
              <tr>
                <td className="order-empty" colSpan={table.orderedColumnIds.length}>
                  Đơn hàng chưa có mặt hàng.
                </td>
              </tr>
            )}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                  <td key="index"></td>
                  <td key="code">Cộng</td>
                  <td key="name"></td>
                  <td key="spec"></td>
                  <td key="unit"></td>
                  {/* Quantities of different units are never added together (B6). */}
                  <td key="quantity" className="order-number">
                    {units.size === 1 ? sum(entry => entry.line.quantity).toLocaleString('vi-VN') : ''}
                  </td>
                  <td key="price"></td>
                  <td key="gross" className="order-number">
                    {money(sum(entry => entry.line.grossAmount))}
                  </td>
                  <td key="discountRate"></td>
                  <td key="discountAmount" className="order-number">
                    {money(sum(entry => entry.line.discountAmount))}
                  </td>
                  <td key="vatRate"></td>
                  <td key="vatAmount" className="order-number">
                    {money(sum(entry => entry.line.vatAmount))}
                  </td>
                  <td key="supplier"></td>
                  <td key="total" className="order-number">
                    {money(sum(entry => entry.line.amountWithVat))}
                  </td>
                  <td key="kpi"></td>
                  <td key="images"></td>
                  <td key="purchasePrice"></td>
                  <td key="profit" className="order-number">
                    {amount(sum(entry => entry.profit))}
                  </td>
                </ReorderableTableCells>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <TableColumnCustomizer {...table.customizerProps} />
    </div>
  );
}
