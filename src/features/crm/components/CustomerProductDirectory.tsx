import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { formatDate } from '@/shared/utils/dateFormatting';
import type { CustomerRecord } from '../model/crmModels';
import { getCustomerProductSize, type ProductDirectoryRow } from '../model/customerProductCatalog';
import './CustomerProductDirectory.css';

interface Props {
  rows: ProductDirectoryRow[];
  /** Total before the search, to tell an empty system from a search without results. */
  totalCount: number;
  onOpenCustomer: (customer: CustomerRecord) => void;
}

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Every product code of every customer the viewer can see; a row opens that customer's profile. */
export function CustomerProductDirectory({ rows, totalCount, onOpenCustomer }: Props) {
  const pagination = useDataTablePagination(rows);
  return (
    <div className="customer-product-directory" data-erp-table-text="single-line">
      <div className="table-container erp-primary-data-table">
        <table className="customer-product-directory-table">
          <thead>
            <tr>
              <th>Mã sản phẩm</th>
              <th>Tên sản phẩm</th>
              <th>Khách hàng</th>
              <th>Loại</th>
              <th>Chất liệu / NVL</th>
              <th>Quy cách</th>
              <th>ĐVT</th>
              <th className="customer-product-number">Số đơn</th>
              <th className="customer-product-number">SL đã đặt</th>
              <th>Đơn hàng gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map(row => {
              const size = getCustomerProductSize(row.product);
              const customerLabel = [row.customer.customerCode, row.customer.companyName].filter(Boolean).join(' · ');
              return (
                <tr
                  key={row.key}
                  className="customer-product-directory-row"
                  tabIndex={0}
                  onClick={() => onOpenCustomer(row.customer)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') onOpenCustomer(row.customer);
                  }}
                >
                  <td title={row.product.productCode}>
                    <strong>{row.product.productCode || '—'}</strong>
                  </td>
                  <td title={row.product.productName}>{row.product.productName}</td>
                  <td title={customerLabel}>{row.customer.companyName}</td>
                  <td title={row.productTypeName}>{row.productTypeName || '—'}</td>
                  <td title={row.product.material}>{row.product.material || '—'}</td>
                  <td title={size}>{size || '—'}</td>
                  <td>{row.product.unit || '—'}</td>
                  <td className="customer-product-number">{number(row.orderCount)}</td>
                  <td className="customer-product-number">{number(row.totalQuantity)}</td>
                  <td title={row.lastPoCode ? `${row.lastPoCode} · ${formatDate(row.lastOrderDate)}` : ''}>
                    {row.lastPoCode ? `${row.lastPoCode} · ${formatDate(row.lastOrderDate)}` : '—'}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={10}>
                  {totalCount
                    ? 'Không có mã sản phẩm phù hợp từ khóa tìm kiếm.'
                    : 'Chưa có mã sản phẩm. Mở hồ sơ khách hàng và bấm "Tạo mã sản phẩm" để thêm.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataTablePagination {...pagination.paginationProps} />
    </div>
  );
}
