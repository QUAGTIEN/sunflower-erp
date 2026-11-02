import type { CustomerProductRecord } from '@/features/crm/model/crmModels';
import React from 'react';
import { Search, X } from 'lucide-react';
import { formatDate } from '@/shared/utils/dateFormatting';

/** A line from one of the customer's earlier POs, offered for reuse. */
export interface PastOrderProduct {
  id?: string;
  productCode?: string;
  productName?: string;
  size?: string;
  price?: number;
  poCode?: string;
  orderDate?: string;
}

type SearchableProduct = CustomerProductRecord | PastOrderProduct;

interface POLegacyProductSearchDialogProps {
  setSearchPopupOpen: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  filteredCatalog: CustomerProductRecord[];
  handleSelectSearchedProduct: (product: SearchableProduct) => void;
  getProductSize: (product: SearchableProduct) => string;
  filteredHistory: PastOrderProduct[];
}

/** Product search dialog for customers without a product catalog. */
export const POLegacyProductSearchDialog: React.FC<POLegacyProductSearchDialogProps> = ({
  setSearchPopupOpen,
  searchQuery,
  setSearchQuery,
  filteredCatalog,
  handleSelectSearchedProduct,
  getProductSize,
  filteredHistory
}) => {
  return (
    <div className="modal-overlay" style={{ zIndex: 1200 }}>
      <div className="modal-content" style={{ maxWidth: '750px', width: '90%' }}>
        <div className="modal-header">
          <span
            style={{
              fontWeight: 700,
              fontSize: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Search size={18} />
            <span>TÌM KIẾM MÃ HÀNG NHẬP NHANH</span>
          </span>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setSearchPopupOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <input
              type="text"
              placeholder="Nhập mã hàng hoặc tên hàng cần tìm..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)'
              }}
              autoFocus
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              height: '320px',
              overflow: 'hidden'
            }}
          >
            {/* Catalog list */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  backgroundColor: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--color-primary)'
                }}
              >
                Sản phẩm của khách hàng
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                {filteredCatalog.map(prod => (
                  <div
                    key={prod.id}
                    className="chat-suggestion-item"
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectSearchedProduct(prod);
                      }
                    }}
                    onClick={() => handleSelectSearchedProduct(prod)}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{prod.productCode}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{prod.productName}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600 }}>
                        {Number(prod.currentPrice) > 0
                          ? `${Number(prod.currentPrice).toLocaleString('vi-VN')} đ`
                          : 'Chưa có giá'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{getProductSize(prod)}</div>
                    </div>
                  </div>
                ))}
                {filteredCatalog.length === 0 && (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--color-text-muted)',
                      fontStyle: 'italic',
                      fontSize: '12px'
                    }}
                  >
                    Không có sản phẩm nào khớp.
                  </div>
                )}
              </div>
            </div>

            {/* History list */}
            <div
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--color-border)',
                  backgroundColor: '#f8fafc',
                  fontWeight: 600,
                  fontSize: '13px',
                  color: 'var(--color-success-dark)'
                }}
              >
                Lịch Sử Đã Đặt Đơn Hàng Cũ (History)
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
                {filteredHistory.map((prod, pIdx) => (
                  <div
                    key={pIdx}
                    className="chat-suggestion-item"
                    onClick={() => handleSelectSearchedProduct(prod)}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{prod.productCode}</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{prod.productName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-primary)', fontStyle: 'italic' }}>
                        Từ đơn: {prod.poCode} ({formatDate(prod.orderDate, 'vi-VN')})
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{prod.price?.toLocaleString()} đ</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{prod.size}</div>
                    </div>
                  </div>
                ))}
                {filteredHistory.length === 0 && (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--color-text-muted)',
                      fontStyle: 'italic',
                      fontSize: '12px'
                    }}
                  >
                    Không có lịch sử cũ nào khớp.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={() => setSearchPopupOpen(false)}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
