import React from 'react';
import { Copy } from 'lucide-react';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useLanguage } from '@/context/LanguageContext';
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
  const { t } = useLanguage();

  return (
    <div
      className="card customer-order-history-card"
      hidden={!['overview', 'po', 'products'].includes(customerHistoryTab)}
    >
      <div className="customer-product-catalog-toolbar">
        <h2>{customerHistoryTab === 'products' ? t('Sản phẩm của khách hàng') : t('Danh sách đơn hàng (PO)')}</h2>
        {customerHistoryTab === 'overview' && (
          <button type="button" className="btn btn-outline" onClick={() => setCustomerHistoryTab('po')}>
            {t('Xem tất cả')} ({getCustomerOrders(selectedCustomer.id).length})
          </button>
        )}
        {customerHistoryTab === 'products' && canManageCustomerProducts(currentUser, selectedCustomer) && (
          <button type="button" className="btn btn-primary" onClick={() => setShowProductEditor(true)}>
            {t('Tạo mã sản phẩm')}
          </button>
        )}
      </div>

      {customerHistoryTab !== 'products' ? (
        <div className="table-container customer-order-history-table">
          <table>
            <thead>
              <tr>
                <th>{t('Mã PO')}</th>
                <th>{t('Ngày đặt')}</th>
                <th>{t('Trị giá (Net)')}</th>
                <th>{t('Tiến độ')}</th>
                <th>{t('Thao tác')}</th>
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
                      <span className={`badge ${getPOBadgeClass(po)}`}>{t(getPOQueueLabel(po))}</span>
                    </td>
                    <td onClick={event => event.stopPropagation()}>
                      {(currentUser.role === 'admin' || currentUser.role === 'sale') && onRepeatOrder ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline repeat-order-button"
                          onClick={() => onRepeatOrder(po.id)}
                          title={t('Tạo PO mới từ đơn cũ')}
                        >
                          <Copy size={13} /> {t('Đặt lại')}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              {getCustomerOrders(selectedCustomer.id).length === 0 && (
                <tr>
                  <td colSpan={5}>{t('Chưa phát sinh đơn hàng.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container customer-order-history-table">
          <table className="customer-sample-history-table customer-product-history-table">
            <thead>
              <tr>
                <th>{t('Sản phẩm / mã hàng')}</th>
                <th>{t('Loại sản phẩm')}</th>
                <th>{t('Quy cách & NVL')}</th>
                <th>{t('Lịch sử đặt')}</th>
                <th>{t('Hình ảnh / tệp')}</th>
                <th>{t('Thao tác')}</th>
              </tr>
            </thead>
            <tbody>
              {selectedCustomerProducts.map(product => (
                <tr key={product.key}>
                  <td>
                    <div className="customer-sample-identity">
                      {product.previewImage ? (
                        <img src={product.previewImage} alt={product.productName} />
                      ) : (
                        <span>{t('Chưa có ảnh')}</span>
                      )}
                      <div>
                        <strong title={product.productName}>{product.productName}</strong>
                        <small>{product.productCode || t('Chưa có mã hàng')}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {product.record
                      ? productClassifications.find(type => type.id === product.record?.productType)?.name ||
                        CUSTOMER_PRODUCT_TYPES.find(type => type.id === product.record?.productType)?.name ||
                        product.record.productType ||
                        '—'
                      : '—'}
                  </td>
                  <td>
                    <div className="customer-sample-spec">
                      <strong title={product.material}>{product.material || t('Chưa có NVL')}</strong>
                      <span title={product.specification}>{product.specification || t('Chưa có quy cách')}</span>
                    </div>
                  </td>
                  <td>
                    <div className="customer-sample-spec">
                      <strong>
                        {product.orderCount > 0
                          ? `${product.orderCount} ${t('đơn')} · ${product.totalQuantity.toLocaleString('vi-VN')} ${product.unit}`
                          : t('Chưa phát sinh PO')}
                      </strong>
                      <button
                        type="button"
                        className="customer-po-link"
                        onClick={() => product.lastPoId && onOpenPO?.(product.lastPoId)}
                        disabled={!product.lastPoId || !onOpenPO}
                      >
                        {product.lastPoCode || t('Chưa có mã PO')}
                      </button>
                    </div>
                  </td>
                  <td>
                    {product.record && Array.isArray(product.record.files) && product.record.files.length > 0 ? (
                      <RowActionMenu
                        label={t('Tệp sản phẩm')}
                        actions={product.record.files.map((file: unknown, index: number) => {
                          const asset = typeof file === 'object' && file ? (file as Record<string, unknown>) : {};
                          const url = getProductAssetSource(file);
                          return {
                            label: String(asset.name || asset.fileName || `Tệp ${index + 1}`),
                            onSelect: () => openCustomerProductAsset(url)
                          };
                        })}
                      />
                    ) : product.previewImage ? (
                      <button
                        type="button"
                        className="customer-product-asset-button"
                        onClick={() => setPreviewImage(product.previewImage)}
                      >
                        {t('Xem ảnh')} · {product.assetCount} {t('tệp')}
                      </button>
                    ) : (
                      <span className="crm-text-muted">{t('Chưa có tệp')}</span>
                    )}
                  </td>
                  <td>
                    {product.record && (currentUser.role === 'admin' || currentUser.role === 'sale') ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={() => handleOpenEditProduct(product.record)}
                      >
                        {t('Chỉnh sửa')}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
              {selectedCustomerProducts.length === 0 && (
                <tr>
                  <td colSpan={6}>{t('Chưa có mã sản phẩm.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
