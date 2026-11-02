import React from 'react';
import { Copy, ImageOff } from 'lucide-react';
import { RowActionMenu } from '@/components/RowActionMenu';
import {
  CUSTOMER_PRODUCT_TYPES,
  canManageCustomerProducts,
  openCustomerProductAsset
} from '@/features/crm/model/customerProductCatalog';
import { getProductAssetSource, type CustomerHistoryTab } from '@/features/crm/model/customerWorkspace';
import { getPOBadgeClass, getPOQueueLabel } from '@/features/sales/model/poWorkflow';
import type { ErpDocument } from '@/shared/types';
import { formatDate } from '@/shared/utils/dateFormatting';

interface CustomerOrderHistoryCardProps {
  selectedCustomer: ErpDocument;
  currentUser: ErpDocument;
  activeTab: CustomerHistoryTab;
  onTabChange: (tab: CustomerHistoryTab) => void;
  products: ErpDocument[];
  productClassifications: ErpDocument[];
  getCustomerOrders: (customerId: string) => ErpDocument[];
  onEditProduct: (product: ErpDocument) => void;
  onOpenPO?: (poId: string) => void;
  onRepeatOrder?: (poId: string) => void;
  onPreviewImage: (source: string | null) => void;
  onShowProductEditor: (open: boolean) => void;
}

/** Customer detail card listing the customer's products or purchase orders, depending on the active tab. */
export const CustomerOrderHistoryCard: React.FC<CustomerOrderHistoryCardProps> = ({
  selectedCustomer,
  currentUser,
  activeTab: customerHistoryTab,
  onTabChange: setCustomerHistoryTab,
  products: selectedCustomerProducts,
  productClassifications,
  getCustomerOrders,
  onEditProduct: handleOpenEditProduct,
  onOpenPO,
  onRepeatOrder,
  onPreviewImage: setPreviewImage,
  onShowProductEditor: setShowProductEditor
}) => {
  return (
    <div
      className="card customer-order-history-card"
      hidden={!['overview', 'po', 'products'].includes(customerHistoryTab)}
    >
      <div className="customer-product-catalog-toolbar">
        <h2>{customerHistoryTab === 'products' ? 'Sản phẩm của khách hàng' : 'Danh sách đơn hàng'}</h2>
        {customerHistoryTab === 'overview' && (
          <button type="button" className="btn btn-outline" onClick={() => setCustomerHistoryTab('po')}>
            Xem tất cả ({getCustomerOrders(selectedCustomer.id).length})
          </button>
        )}
        {customerHistoryTab === 'products' && canManageCustomerProducts(currentUser, selectedCustomer) && (
          <button type="button" className="btn btn-primary" onClick={() => setShowProductEditor(true)}>
            Tạo mã sản phẩm
          </button>
        )}
      </div>

      {customerHistoryTab !== 'products' ? (
        <div className="table-container customer-order-history-table">
          <table>
            <thead>
              <tr>
                <th>Mã đơn hàng</th>
                <th>Ngày đặt</th>
                <th>Trị giá (Net)</th>
                <th>Tiến độ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {getCustomerOrders(selectedCustomer.id)
                .slice(0, customerHistoryTab === 'overview' ? 5 : undefined)
                .map(po => (
                  <tr
                    key={po.id}
                    className="customer-po-history-row"
                    onClick={() => onOpenPO?.(po.id)}
                    onKeyDown={event => {
                      if ((event.key === 'Enter' || event.key === ' ') && onOpenPO) onOpenPO(po.id);
                    }}
                    tabIndex={onOpenPO ? 0 : undefined}
                  >
                    <td>
                      <button
                        type="button"
                        className="customer-po-link"
                        onClick={event => {
                          event.stopPropagation();
                          onOpenPO?.(po.id);
                        }}
                      >
                        {po.poCode}
                      </button>
                    </td>
                    <td>{formatDate(po.orderDate)}</td>
                    <td>{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                    <td>
                      <span className={`badge ${getPOBadgeClass(po)}`}>{getPOQueueLabel(po)}</span>
                    </td>
                    <td onClick={event => event.stopPropagation()}>
                      {(currentUser.role === 'admin' || currentUser.role === 'sale') && onRepeatOrder ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline repeat-order-button"
                          onClick={() => onRepeatOrder(po.id)}
                          title="Tạo đơn hàng mới từ đơn cũ"
                        >
                          <Copy size={13} /> Đặt lại
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              {getCustomerOrders(selectedCustomer.id).length === 0 && (
                <tr>
                  <td colSpan={5}>Chưa phát sinh đơn hàng.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container customer-order-history-table">
          <table className="customer-product-catalog-table">
            <thead>
              <tr>
                <th>Ảnh</th>
                <th>Mã hàng</th>
                <th>Tên sản phẩm</th>
                <th>Loại sản phẩm</th>
                <th>Chất liệu / NVL</th>
                <th>Quy cách</th>
                <th className="customer-product-number">Số đơn</th>
                <th className="customer-product-number">SL đã đặt</th>
                <th>Đơn hàng gần nhất</th>
                <th>Tệp</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {selectedCustomerProducts.map(product => {
                const files: unknown[] =
                  product.record && Array.isArray(product.record.files) ? product.record.files : [];
                const productType = product.record
                  ? productClassifications.find(type => type.id === product.record?.productType)?.name ||
                    CUSTOMER_PRODUCT_TYPES.find(type => type.id === product.record?.productType)?.name ||
                    product.record.productType ||
                    '—'
                  : '—';
                const canEdit = product.record && (currentUser.role === 'admin' || currentUser.role === 'sale');
                const actions = [
                  ...(product.previewImage
                    ? [{ label: 'Xem ảnh', onSelect: () => setPreviewImage(product.previewImage) }]
                    : []),
                  ...files.map((file, index) => {
                    const asset = typeof file === 'object' && file ? (file as Record<string, unknown>) : {};
                    return {
                      label: `Mở tệp: ${String(asset.name || asset.fileName || `Tệp ${index + 1}`)}`,
                      onSelect: () => openCustomerProductAsset(getProductAssetSource(file))
                    };
                  }),
                  ...(canEdit ? [{ label: 'Chỉnh sửa', onSelect: () => handleOpenEditProduct(product.record) }] : [])
                ];
                return (
                  <tr key={product.key}>
                    <td>
                      {product.previewImage ? (
                        <button
                          type="button"
                          className="customer-product-thumb"
                          title="Xem ảnh"
                          onClick={() => setPreviewImage(product.previewImage)}
                        >
                          <img src={product.previewImage} alt={product.productName} />
                        </button>
                      ) : (
                        <span className="customer-product-thumb is-empty" title="Chưa có ảnh">
                          <ImageOff size={14} aria-label="Chưa có ảnh" />
                        </span>
                      )}
                    </td>
                    <td title={product.productCode}>{product.productCode || '—'}</td>
                    <td title={product.productName}>
                      <strong>{product.productName}</strong>
                    </td>
                    <td title={productType}>{productType}</td>
                    <td title={product.material}>{product.material || '—'}</td>
                    <td title={product.specification}>{product.specification || '—'}</td>
                    <td className="customer-product-number">{product.orderCount || '—'}</td>
                    <td className="customer-product-number">
                      {product.orderCount > 0
                        ? `${product.totalQuantity.toLocaleString('vi-VN')} ${product.unit || ''}`.trim()
                        : '—'}
                    </td>
                    <td>
                      {product.lastPoCode ? (
                        <button
                          type="button"
                          className="customer-po-link"
                          title={product.lastPoCode}
                          onClick={() => product.lastPoId && onOpenPO?.(product.lastPoId)}
                          disabled={!product.lastPoId || !onOpenPO}
                        >
                          {product.lastPoCode}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{product.assetCount ? `${product.assetCount} tệp` : '—'}</td>
                    <td>
                      {actions.length > 0 && (
                        <RowActionMenu label={`Thao tác ${product.productName}`} actions={actions} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {selectedCustomerProducts.length === 0 && (
                <tr>
                  <td colSpan={11}>Chưa có mã sản phẩm.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
