import { ReorderableTableCells } from '@/components/ReorderableTableColumns';
import { TableColumnCustomizer, TableColumnsButton, type TableColumnOption } from '@/components/TableColumnCustomizer';
import { calculatePOItemFinancials } from '@/domain/poFinancials';
import { useStandardTableColumns } from '@/hooks/useStandardTableColumns';
import { lineImages, orderTotals } from '../../model/orderDetail';

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

const BASE_COLUMNS: TableColumnOption[] = [
  { id: 'index', label: '#', required: true },
  { id: 'code', label: 'Mã hàng', required: true },
  { id: 'name', label: 'Tên hàng' },
  { id: 'spec', label: 'Quy cách / chất liệu' },
  { id: 'unit', label: 'ĐVT' },
  { id: 'quantity', label: 'Số lượng' },
  { id: 'price', label: 'Đơn giá' },
  { id: 'gross', label: 'Thành tiền' },
  { id: 'discount', label: 'Chiết khấu' },
  { id: 'vat', label: 'Thuế GTGT' },
  { id: 'total', label: 'Tổng (gồm VAT)' },
  { id: 'kpi', label: 'KPI' },
  { id: 'supplier', label: 'Nhà cung cấp' },
  { id: 'images', label: 'Ảnh mẫu' }
];
const COST_COLUMNS: TableColumnOption[] = [
  { id: 'purchasePrice', label: 'Giá mua', defaultVisible: false },
  { id: 'profit', label: 'Lãi gộp', defaultVisible: false }
];
const LOCKED_START = ['index'];
const NO_LOCKED_END: string[] = [];

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
const quantityText = (value: number) => value.toLocaleString('vi-VN');

export function OrderItemsTable({
  items,
  supplierNames,
  canViewFinancials,
  canViewCosts,
  onPreviewImage
}: OrderItemsTableProps) {
  const table = useStandardTableColumns({
    layoutId: canViewCosts ? 'order-detail-items-costs' : 'order-detail-items',
    columns: canViewCosts ? [...BASE_COLUMNS, ...COST_COLUMNS] : BASE_COLUMNS,
    lockedStartIds: LOCKED_START,
    lockedEndIds: NO_LOCKED_END
  });
  const totals = orderTotals(items);
  const hidden = (value: string) => (canViewFinancials ? value : '—');

  return (
    <div className="order-items">
      {table.canEditColumns && (
        <div className="order-items__toolbar">
          <TableColumnsButton onClick={table.openCustomizer} />
        </div>
      )}
      <div className="table-container erp-primary-data-table">
        <table className="order-items__table has-dynamic-columns" data-resize-key="order-detail-items">
          <thead>
            <tr>
              <ReorderableTableCells
                order={table.orderedColumnIds}
                getHeaderProps={table.getHeaderProps}
                labels={table.labels}
              >
                <th key="index" className="order-number">
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
                <th key="discount" className="order-number">
                  Chiết khấu
                </th>
                <th key="vat" className="order-number">
                  Thuế GTGT
                </th>
                <th key="total" className="order-number">
                  Tổng (gồm VAT)
                </th>
                <th key="kpi" className="order-number">
                  KPI
                </th>
                <th key="supplier">Nhà cung cấp</th>
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
            {items.map((item, index) => {
              const line = calculatePOItemFinancials(item);
              const supplier = item.supplierName || supplierNames[item.supplierId || ''] || '';
              const spec = [item.size, item.material].filter(Boolean).join(' · ');
              const buyingTotal = line.quantity * (Number(item.purchasePrice) || 0);
              const discount = line.discountType === 'amount' ? money(line.discountAmount) : `${line.discountRate}%`;
              const images = lineImages(item);
              return (
                <tr key={item.itemId || index}>
                  <ReorderableTableCells order={table.orderedColumnIds} expandOverflowText={false}>
                    <td key="index" className="order-number">
                      {index + 1}
                    </td>
                    <td key="code" title={item.productCode}>
                      <strong>{item.productCode || '—'}</strong>
                    </td>
                    <td key="name" title={item.productName}>
                      {item.productName || <span className="order-muted">Chưa nhập</span>}
                    </td>
                    <td key="spec" title={spec}>
                      {spec || <span className="order-muted">Chưa nhập</span>}
                    </td>
                    <td key="unit">{item.unit || 'cái'}</td>
                    <td key="quantity" className="order-number">
                      {quantityText(line.quantity)}
                    </td>
                    <td key="price" className="order-number">
                      {hidden(money(line.unitPrice))}
                    </td>
                    <td key="gross" className="order-number">
                      {hidden(money(line.grossAmount))}
                    </td>
                    <td key="discount" className="order-number">
                      {hidden(discount)}
                    </td>
                    <td
                      key="vat"
                      className="order-number"
                      title={canViewFinancials ? money(line.vatAmount) : undefined}
                    >
                      {hidden(`${line.vatRate}%`)}
                    </td>
                    <td key="total" className="order-number">
                      <strong>{hidden(money(line.amountWithVat))}</strong>
                    </td>
                    <td key="kpi" className="order-number">
                      {hidden(`${line.kpiPo.toFixed(1)}%`)}
                    </td>
                    <td key="supplier" title={supplier}>
                      {supplier || <span className="order-muted">Chưa chọn</span>}
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
                      {money(Number(item.purchasePrice) || 0)}
                    </td>
                    <td key="profit" className="order-number">
                      {money(line.amountBeforeVat - buyingTotal)}
                    </td>
                  </ReorderableTableCells>
                </tr>
              );
            })}
            {!items.length && (
              <tr>
                <td className="order-empty" colSpan={table.orderedColumnIds.length}>
                  Đơn hàng chưa có mặt hàng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canViewFinancials && items.length > 0 && (
        <dl className="order-totals">
          <dt>Tổng tiền hàng</dt>
          <dd>{money(totals.grossAmount)}</dd>
          <dt>Chiết khấu</dt>
          <dd>{money(totals.discountAmount)}</dd>
          <dt>Thuế GTGT</dt>
          <dd>{money(totals.vatAmount)}</dd>
          <dt className="order-totals__grand">Tổng thanh toán</dt>
          <dd className="order-totals__grand">{money(totals.amountWithVat)}</dd>
          <dt>KPI đơn hàng</dt>
          <dd>{totals.kpi.toFixed(1)}%</dd>
        </dl>
      )}
      <TableColumnCustomizer {...table.customizerProps} />
    </div>
  );
}
