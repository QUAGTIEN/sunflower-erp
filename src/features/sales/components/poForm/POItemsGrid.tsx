import type { CustomerProductRecord } from '@/features/crm/model/crmModels';
import React from 'react';
import type { ErpDocument } from '@/shared/types';
import { calculatePOItemFinancials } from '@/domain/poFinancials';
import {
  getCustomerProductSpecSummary,
  type ProductAttachment,
  openCustomerProductAsset
} from '@/features/crm/model/customerProductCatalog';
import { Upload, SlidersHorizontal, Trash2 } from 'lucide-react';

interface POItemsGridProps {
  tableZoom: number;
  usesCatalogProducts: boolean;
  orderItems: ErpDocument[];
  expandedItemIds: string[];
  setPreviewImage: React.Dispatch<React.SetStateAction<string | null>>;
  deleteRowImage: (rowIndex: number, imgIndex: number) => void;
  handleRowFileChange: (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number) => Promise<void>;
  toggleItemDetails: (itemId: string) => void;
  handleRemoveRow: (index: number) => void;
  handleUpdateRowField: (index: number, field: string, value: unknown) => void;
  catalogProducts: CustomerProductRecord[];
  openSearchPopup: (rowIndex: number) => void;
  isSaving: boolean;
}

/** Editable PO line grid: product, specification, quantity, price and file columns. */
export const POItemsGrid: React.FC<POItemsGridProps> = ({
  tableZoom,
  usesCatalogProducts,
  orderItems,
  expandedItemIds,
  setPreviewImage,
  deleteRowImage,
  handleRowFileChange,
  toggleItemDetails,
  handleRemoveRow,
  handleUpdateRowField,
  catalogProducts,
  openSearchPopup,
  isSaving
}) => (
  <div className="po-inline-grid-container">
    <table className="po-inline-grid po-items-overview-table" style={{ zoom: tableZoom / 100 }}>
      <thead>
        <tr>
          <th style={{ width: '64px', textAlign: 'center' }}>STT</th>
          <th style={{ width: '130px' }}>Mã sản phẩm</th>
          <th style={{ width: '180px' }}>{usesCatalogProducts ? 'Tên sản phẩm' : 'Tên hàng *'}</th>
          <th style={{ width: '180px' }}>Quy cách / Chất liệu</th>
          <th style={{ width: '70px' }}>ĐVT</th>
          <th style={{ width: '80px' }}>Số lượng</th>
          <th style={{ width: '95px' }}>Đơn giá</th>
          <th style={{ width: '65px' }}>Thuế (%)</th>
          <th style={{ width: '190px' }}>Chiết khấu</th>
          <th style={{ width: '125px' }}>Thành tiền (gồm VAT)</th>
          <th style={{ width: '85px' }}>KPI đơn hàng</th>
          <th style={{ width: usesCatalogProducts ? '180px' : '140px' }}>
            {usesCatalogProducts ? 'Thao tác' : 'File liên quan'}
          </th>
        </tr>
      </thead>
      <tbody>
        {orderItems.map((item, index) => {
          const financials = calculatePOItemFinancials(item);

          // Backward compatibility for layouts
          const imagesList = item.previewImages || (item.previewImage ? [item.previewImage] : []);
          const itemKey = item.itemId || String(index);
          const isExpanded = expandedItemIds.includes(itemKey);
          const lockedFields = usesCatalogProducts && Boolean(item.customerProductId);
          const technicalSummary = getCustomerProductSpecSummary(item.specifications || {}, item.productType || '');
          const productAssets = Array.isArray(item.productFiles)
            ? (item.productFiles as ProductAttachment[]).filter(
                file => file && typeof file.url === 'string' && file.url
              )
            : [];
          const rowAttachments = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {/* Multiple image thumbnails */}
              {imagesList.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {imagesList.map((img: string, imgIdx: number) => (
                    <div key={imgIdx} style={{ position: 'relative', width: '32px', height: '32px' }}>
                      <img
                        src={img}
                        alt="layout"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border)'
                        }}
                        onClick={() => setPreviewImage(img)}
                      />
                      <button
                        type="button"
                        onClick={() => deleteRowImage(index, imgIdx)}
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '12px',
                          height: '12px',
                          fontSize: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload triggers */}
              {imagesList.length < 5 && (
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    border: '1px dashed var(--color-primary)',
                    borderRadius: '4px',
                    width: 'fit-content'
                  }}
                >
                  <Upload size={10} />
                  <span>+ File</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={e => handleRowFileChange(e, index)}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          );
          return (
            <React.Fragment key={itemKey}>
              <tr>
                <td className="po-item-index-cell">
                  <strong>{index + 1}</strong>
                  {!usesCatalogProducts && (
                    <div className="po-row-actions">
                      <button
                        type="button"
                        className={`po-detail-toggle ${isExpanded ? 'is-active' : ''}`}
                        onClick={() => toggleItemDetails(itemKey)}
                        title={isExpanded ? 'Ẩn chi tiết' : 'Mở ngày giao và ghi chú'}
                        aria-expanded={isExpanded}
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger po-row-delete"
                        onClick={() => handleRemoveRow(index)}
                        title="Xóa dòng"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </td>
                <td>
                  {lockedFields ? (
                    <span className="po-source-text" title={item.productCode}>
                      {item.productCode || '—'}
                    </span>
                  ) : (
                    <div className="po-product-code-control">
                      <input
                        type="text"
                        className="po-grid-input"
                        value={item.productCode || ''}
                        onChange={event => handleUpdateRowField(index, 'productCode', event.target.value)}
                        placeholder="Mã sản phẩm"
                        list={`product-codes-list-${index}`}
                      />
                      <datalist id={`product-codes-list-${index}`}>
                        {catalogProducts.map(product => (
                          <option key={product.id} value={product.productCode}>
                            {product.productName}
                          </option>
                        ))}
                      </datalist>
                      {!usesCatalogProducts && (
                        <button type="button" className="btn btn-outline" onClick={() => openSearchPopup(index)}>
                          Chọn
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td>
                  {lockedFields ? (
                    <span className="po-source-text" title={item.productName}>
                      {item.productName || '—'}
                    </span>
                  ) : (
                    <>
                      <input
                        type="text"
                        className="po-grid-input"
                        value={item.productName || ''}
                        onChange={event => handleUpdateRowField(index, 'productName', event.target.value)}
                        placeholder="Tên sản phẩm"
                        list={`product-names-list-${index}`}
                      />
                      <datalist id={`product-names-list-${index}`}>
                        {catalogProducts.map(product => (
                          <option key={product.id} value={product.productName}>
                            {product.productCode}
                          </option>
                        ))}
                      </datalist>
                    </>
                  )}
                </td>
                <td>
                  {lockedFields ? (
                    <span className="po-source-text" title={[item.size, item.material].filter(Boolean).join(' · ')}>
                      {[item.size, item.material].filter(Boolean).join(' · ') || '—'}
                    </span>
                  ) : (
                    <>
                      <div className="po-item-spec-cell">
                        <input
                          type="text"
                          className="po-grid-input"
                          value={item.size || ''}
                          onChange={event => handleUpdateRowField(index, 'size', event.target.value)}
                          placeholder="Quy cách"
                        />
                        <input
                          type="text"
                          className="po-grid-input"
                          value={item.material || ''}
                          onChange={event => handleUpdateRowField(index, 'material', event.target.value)}
                          placeholder="Chất liệu"
                          list={`materials-suggest-${index}`}
                        />
                      </div>
                      <datalist id={`materials-suggest-${index}`}>
                        <option value="Decal Giấy Fasson AW0339F" />
                        <option value="Decal Nhựa PVC Avery Dennison" />
                        <option value="Màng BOPP bóng 12mic" />
                        <option value="Giấy Ford" />
                      </datalist>
                    </>
                  )}
                </td>
                <td>
                  {lockedFields ? (
                    <span className="po-source-text" title={item.unit}>
                      {item.unit || '—'}
                    </span>
                  ) : (
                    <input
                      type="text"
                      className="po-grid-input"
                      value={item.unit || ''}
                      onChange={event => handleUpdateRowField(index, 'unit', event.target.value)}
                      placeholder="ĐVT"
                    />
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    className="po-grid-input"
                    value={item.quantity}
                    onChange={e => handleUpdateRowField(index, 'quantity', Number(e.target.value))}
                    min="1"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="po-grid-input"
                    value={item.price}
                    onChange={e => handleUpdateRowField(index, 'price', Number(e.target.value))}
                    min="0"
                    step="any"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="po-grid-input"
                    value={item.vatRate}
                    onChange={e => handleUpdateRowField(index, 'vatRate', Number(e.target.value))}
                    min="0"
                    max="100"
                  />
                </td>
                <td>
                  <div className="po-discount-editor">
                    <select
                      className="po-grid-input po-discount-mode"
                      value={financials.discountType}
                      title={financials.discountType === 'amount' ? 'Tiền chênh (VNĐ)' : 'Theo phần trăm'}
                      aria-label="Hình thức chiết khấu"
                      onChange={e => {
                        const discountType = e.target.value === 'amount' ? 'amount' : 'percent';
                        handleUpdateRowField(index, 'discountType', discountType);
                      }}
                    >
                      <option value="percent">%</option>
                      <option value="amount">Tiền chênh</option>
                    </select>
                    <input
                      type="number"
                      className="po-grid-input po-discount-value"
                      value={financials.discountType === 'amount' ? item.discountAmount || 0 : item.discountRate || 0}
                      onChange={e =>
                        handleUpdateRowField(
                          index,
                          financials.discountType === 'amount' ? 'discountAmount' : 'discountRate',
                          Number(e.target.value)
                        )
                      }
                      min="0"
                      max={financials.discountType === 'percent' ? 100 : financials.grossAmount || undefined}
                      step="any"
                    />
                    <span className="po-discount-hint">
                      -{Math.round(financials.discountAmount).toLocaleString()} đ
                    </span>
                  </div>
                </td>
                <td className="po-money-cell">{Math.round(financials.amountWithVat).toLocaleString()} đ</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="po-kpi-badge" title="Tỷ lệ giá trị còn lại sau chiết khấu">
                    {financials.kpiPo.toFixed(1)}%
                  </span>
                </td>
                <td>
                  {usesCatalogProducts ? (
                    <div className="po-catalog-row-actions">
                      <button type="button" aria-expanded={isExpanded} onClick={() => toggleItemDetails(itemKey)}>
                        {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSearchPopup(index)}
                        disabled={!catalogProducts.length || isSaving}
                        aria-label={`Đổi sản phẩm: ${item.productCode || index + 1}`}
                      >
                        Đổi
                      </button>
                      <button
                        type="button"
                        className="po-catalog-row-delete"
                        onClick={() => handleRemoveRow(index)}
                        aria-label={`Xóa dòng: ${item.productCode || index + 1}`}
                      >
                        Xóa
                      </button>
                    </div>
                  ) : (
                    rowAttachments
                  )}
                </td>
              </tr>
              {isExpanded && (
                <tr className="po-item-detail-row">
                  <td colSpan={12}>
                    {usesCatalogProducts && (
                      <section className="po-catalog-row-files">
                        <h4>Ảnh thiết kế / layout</h4>
                        {rowAttachments}
                      </section>
                    )}
                    {(technicalSummary.length > 0 || productAssets.length > 0 || item.productNote) && (
                      <div className="po-inherited-details">
                        {technicalSummary.length > 0 && (
                          <section>
                            <h4>Thông số kỹ thuật</h4>
                            <dl>
                              {technicalSummary.map(field => (
                                <div key={field.id}>
                                  <dt>{field.label}</dt>
                                  <dd>{field.value}</dd>
                                </div>
                              ))}
                            </dl>
                          </section>
                        )}
                        {productAssets.length > 0 && (
                          <section>
                            <h4>Tệp của sản phẩm</h4>
                            <div className="po-inherited-files">
                              {productAssets.map((file, fileIndex) => (
                                <button
                                  key={file.id || fileIndex}
                                  type="button"
                                  className="btn btn-outline"
                                  onClick={() => openCustomerProductAsset(file.url)}
                                  title={file.name}
                                >
                                  {file.name || 'Xem tệp'}
                                </button>
                              ))}
                            </div>
                          </section>
                        )}
                        {item.productNote && (
                          <section>
                            <h4>Ghi chú sản phẩm</h4>
                            <p>{item.productNote}</p>
                          </section>
                        )}
                      </div>
                    )}
                    <div className="po-item-detail-grid">
                      <div className="form-group">
                        <label>Ngày giao của mã hàng</label>
                        <input
                          type="date"
                          value={item.deliveryDate}
                          onChange={e => handleUpdateRowField(index, 'deliveryDate', e.target.value)}
                        />
                      </div>
                      <div className="form-group po-item-note-field">
                        <label>Ghi chú dòng hàng</label>
                        <input
                          type="text"
                          value={item.note || ''}
                          onChange={e => handleUpdateRowField(index, 'note', e.target.value)}
                          placeholder="Yêu cầu riêng cho mã hàng..."
                        />
                      </div>
                      <div className="po-item-calculation">
                        <span>
                          Trước chiết khấu: <strong>{Math.round(financials.grossAmount).toLocaleString()} đ</strong>
                        </span>
                        <span>
                          Chiết khấu: <strong>{Math.round(financials.discountAmount).toLocaleString()} đ</strong>
                        </span>
                        <span>
                          Trước VAT: <strong>{Math.round(financials.amountBeforeVat).toLocaleString()} đ</strong>
                        </span>
                        <span>
                          Sau VAT: <strong>{Math.round(financials.amountWithVat).toLocaleString()} đ</strong>
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);
