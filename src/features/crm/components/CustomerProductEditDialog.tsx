import React from 'react';
import type { ErpDocument } from '@/shared/types';

interface SpecCustomRow {
  key: string;
  value: string;
}

/** Product form values owned by CrmPage (shared with other product flows there). */
export interface ProductEditForm {
  productLayoutBase64: string;
  productType: string;
  productName: string;
  setProductName: React.Dispatch<React.SetStateAction<string>>;
  productCode: string;
  setProductCode: React.Dispatch<React.SetStateAction<string>>;
  productMaterial: string;
  setProductMaterial: React.Dispatch<React.SetStateAction<string>>;
  currentPrice: number;
  setCurrentPrice: React.Dispatch<React.SetStateAction<number>>;
  specFields: ErpDocument[];
  specCustomRows: SpecCustomRow[];
  setSpecCustomRows: React.Dispatch<React.SetStateAction<SpecCustomRow[]>>;
  editingLabelId: string | null;
  setEditingLabelId: React.Dispatch<React.SetStateAction<string | null>>;
  tempLabelText: string;
  setTempLabelText: React.Dispatch<React.SetStateAction<string>>;
}

/** Operations on the editable technical spec fields. */
export interface ProductSpecFieldActions {
  handleUpdateFieldValue: (fieldId: string, value: unknown) => void;
  handleDeleteField: (fieldId: string) => unknown;
  handleStartEditLabel: (fieldId: string, currentLabel: string) => void;
  handleSaveLabel: (fieldId: string) => void;
  handleAddField: () => void;
  handleAddSelectField: () => void;
  handleEditDropdownOptions: (fieldId: string) => void;
  handleWindDirectionFilesChangeForField: (fieldId: string, event: React.ChangeEvent<HTMLInputElement>) => unknown;
  handleEditProductTypeChange: (type: string) => void;
  handleProductLayoutChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Product classifications and wind directions the user can pick or extend. */
export interface ProductCatalogActions {
  availableProductClassifications: ErpDocument[];
  windDirections: ErpDocument[];
  triggerAddClassification: () => unknown;
  triggerEditClassification: (id: string) => unknown;
  triggerAddWindDirection: () => unknown;
  triggerEditWindDirection: (id: string) => unknown;
}

interface CustomerProductEditDialogProps {
  form: ProductEditForm;
  fieldActions: ProductSpecFieldActions;
  catalog: ProductCatalogActions;
  renderProductCommercialFields: () => React.ReactNode;
  onSubmit: (event: React.FormEvent) => unknown;
  onClose: () => void;
}

/** Edit dialog for one customer product: commercial terms, technical spec fields, layout and files. */
export const CustomerProductEditDialog: React.FC<CustomerProductEditDialogProps> = ({
  form: {
    productType,
    productLayoutBase64,
    productName,
    setProductName,
    productCode,
    setProductCode,
    productMaterial,
    setProductMaterial,
    currentPrice,
    setCurrentPrice,
    specFields,
    specCustomRows,
    setSpecCustomRows,
    editingLabelId,
    setEditingLabelId,
    tempLabelText,
    setTempLabelText
  },
  fieldActions: {
    handleUpdateFieldValue,
    handleDeleteField,
    handleStartEditLabel,
    handleSaveLabel,
    handleAddField,
    handleAddSelectField,
    handleEditDropdownOptions,
    handleWindDirectionFilesChangeForField,
    handleEditProductTypeChange,
    handleProductLayoutChange
  },
  catalog: {
    availableProductClassifications,
    windDirections,
    triggerAddClassification,
    triggerEditClassification,
    triggerAddWindDirection,
    triggerEditWindDirection
  },
  renderProductCommercialFields,
  onSubmit: handleEditProductSubmit,
  onClose
}) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <span style={{ fontWeight: 700, fontSize: '16px' }}>CHỈNH SỬA MÃ SẢN PHẨM KHÁCH HÀNG</span>
          <button className="btn btn-sm btn-outline" onClick={onClose}>
            Đóng
          </button>
        </div>
        <form onSubmit={handleEditProductSubmit}>
          <div className="modal-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label>Mã Sản Phẩm *</label>
                <input type="text" value={productCode} onChange={e => setProductCode(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Tên Hàng Hóa *</label>
                <input type="text" value={productName} onChange={e => setProductName(e.target.value)} required />
              </div>
            </div>

            <div
              className="form-grid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}
            >
              <div className="form-group">
                <label>Phân Loại Sản Phẩm *</label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select
                    value={productType}
                    onChange={e => handleEditProductTypeChange(e.target.value as any)}
                    style={{ flex: 1 }}
                  >
                    {availableProductClassifications.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={triggerAddClassification}
                    title="Thêm"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline"
                    onClick={() => triggerEditClassification(productType)}
                    title="Sửa"
                  >
                    Sửa
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Đơn Giá Bán Hiện Tại (đ) *</label>
                <input
                  type="number"
                  min="0"
                  value={currentPrice}
                  onChange={e => setCurrentPrice(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <div
              className="form-grid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}
            >
              <div className="form-group">
                <label>Chất Liệu</label>
                <input
                  type="text"
                  value={productMaterial}
                  onChange={e => setProductMaterial(e.target.value)}
                  placeholder="VD: Decal Giấy Fasson AW0339F"
                  list="materials-suggest-crm-edit"
                />
                <datalist id="materials-suggest-crm-edit">
                  <option value="Decal Giấy Fasson AW0339F" />
                  <option value="Decal Nhựa PVC Avery Dennison" />
                  <option value="Màng BOPP bóng 12mic" />
                  <option value="Giấy Ford" />
                </datalist>
              </div>
              <div className="form-group">
                <label>Tải Ảnh Layout Thiết Kế Mẫu</label>
                <input type="file" accept="image/*" onChange={handleProductLayoutChange} style={{ fontSize: '12px' }} />
                {productLayoutBase64 && (
                  <img
                    src={productLayoutBase64}
                    alt="Preview"
                    style={{ maxHeight: '80px', marginTop: '8px', borderRadius: '4px', display: 'block' }}
                  />
                )}
              </div>
            </div>

            {renderProductCommercialFields()}

            <span
              style={{ display: 'block', borderBottom: '1px solid var(--color-border-light)', margin: '16px 0' }}
            ></span>
            <h4 style={{ color: 'var(--color-primary)', marginBottom: '10px' }}>MÔ TẢ THÔNG SỐ KỸ THUẬT</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
              {specFields.map(field => {
                const isEditingLabel = editingLabelId === field.id;

                return (
                  <div
                    key={field.id}
                    className="form-group"
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%'
                        }}
                        onDoubleClick={() => handleStartEditLabel(field.id, field.label)}
                        title="Nhấp đúp chuột để sửa tên"
                      >
                        {isEditingLabel ? (
                          <input
                            type="text"
                            value={tempLabelText}
                            onChange={e => setTempLabelText(e.target.value)}
                            onBlur={() => handleSaveLabel(field.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSaveLabel(field.id);
                              else if (e.key === 'Escape') setEditingLabelId(null);
                            }}
                            autoFocus
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: '12.5px',
                              padding: '2px 6px',
                              border: '1px solid var(--color-primary)',
                              borderRadius: '4px',
                              width: '100%'
                            }}
                          />
                        ) : (
                          <>
                            <span style={{ textDecoration: 'underline dotted var(--color-primary)' }}>
                              {field.label}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                color: 'var(--color-text-muted)',
                                marginLeft: '6px',
                                fontWeight: 'normal'
                              }}
                            >
                              (nhấn đúp để sửa)
                            </span>
                          </>
                        )}
                      </label>

                      {/* Delete field button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteField(field.id)}
                        style={{
                          border: 'none',
                          background: 'none',
                          color: 'var(--color-danger, #ef4444)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '12px'
                        }}
                        title="Xóa thông số này"
                      >
                        ❌
                      </button>
                    </div>

                    {/* Render input based on field type */}
                    {field.type === 'number' && (
                      <input
                        type="number"
                        value={field.value}
                        onChange={e => handleUpdateFieldValue(field.id, Number(e.target.value))}
                      />
                    )}

                    {field.type === 'text' && (
                      <input
                        type="text"
                        value={field.value}
                        onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                      />
                    )}

                    {field.type === 'select' && field.id === 'windDirection' && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select
                          value={field.value}
                          onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                          style={{ flex: 1 }}
                        >
                          {windDirections.map(w => (
                            <option key={w.id} value={w.name}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={triggerAddWindDirection}
                          title="Thêm"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          onClick={() => {
                            const matched = windDirections.find(w => w.name === field.value);
                            if (matched) triggerEditWindDirection(matched.id);
                          }}
                          title="Sửa"
                        >
                          Sửa
                        </button>
                      </div>
                    )}

                    {field.type === 'select' && field.id !== 'windDirection' && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <select
                          value={field.value}
                          onChange={e => handleUpdateFieldValue(field.id, e.target.value)}
                          style={{ flex: 1 }}
                        >
                          {field.options?.map((opt: string) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                        {field.id.startsWith('custom_') && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => handleEditDropdownOptions(field.id)}
                            title="Sửa danh sách lựa chọn"
                          >
                            Sửa mục
                          </button>
                        )}
                      </div>
                    )}

                    {field.type === 'checkboxes' && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '10px',
                          fontSize: '12.5px',
                          marginTop: '6px'
                        }}
                      >
                        {field.options?.map((proc: string) => {
                          const checked = Array.isArray(field.value) ? field.value.includes(proc) : false;
                          return (
                            <label
                              key={proc}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 'normal',
                                cursor: 'pointer'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  const currentList = Array.isArray(field.value) ? field.value : [];
                                  if (e.target.checked) {
                                    handleUpdateFieldValue(field.id, [...currentList, proc]);
                                  } else {
                                    handleUpdateFieldValue(
                                      field.id,
                                      currentList.filter((p: any) => p !== proc)
                                    );
                                  }
                                }}
                              />
                              <span>{proc}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {field.type === 'file' && (
                      <div style={{ marginTop: '4px' }}>
                        <input
                          type="file"
                          multiple
                          onChange={e => handleWindDirectionFilesChangeForField(field.id, e)}
                          style={{ fontSize: '12px' }}
                        />
                        {Array.isArray(field.value) && field.value.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                            {field.value.map((f: any, idx: number) => (
                              <div
                                key={idx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '4px 8px',
                                  border: '1px solid var(--color-border-light)',
                                  borderRadius: '4px',
                                  backgroundColor: 'var(--color-bg-light)'
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '12px',
                                    maxWidth: '120px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {f.name}
                                </span>
                                <button
                                  type="button"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'red',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => {
                                    const updatedFiles = field.value.filter((_: any, i: number) => i !== idx);
                                    handleUpdateFieldValue(field.id, updatedFiles);
                                  }}
                                >
                                  X
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-start' }}>
              <button type="button" className="btn btn-sm btn-outline" onClick={handleAddField}>
                + Thêm Nhập Liệu
              </button>
              <button type="button" className="btn btn-sm btn-outline" onClick={handleAddSelectField}>
                + Thêm Dropdown
              </button>
            </div>

            {/* Custom Specifications / Choices Section */}
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}
              >
                <h5 style={{ color: 'var(--color-primary)', margin: 0, fontSize: '13.5px', fontWeight: 600 }}>
                  LỰA CHỌN & THÔNG SỐ BỔ SUNG
                </h5>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => setSpecCustomRows([...specCustomRows, { key: '', value: '' }])}
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                >
                  + Thêm Dòng
                </button>
              </div>
              {specCustomRows.length === 0 ? (
                <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', fontStyle: 'italic', margin: 0 }}>
                  Chưa có thông số bổ sung nào.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {specCustomRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={row.key}
                        onChange={e => {
                          const updated = [...specCustomRows];
                          updated[idx].key = e.target.value;
                          setSpecCustomRows(updated);
                        }}
                        placeholder="Tên thông số (VD: Độ bám dính)"
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          fontSize: '12px',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px'
                        }}
                        required
                      />
                      <input
                        type="text"
                        value={row.value}
                        onChange={e => {
                          const updated = [...specCustomRows];
                          updated[idx].value = e.target.value;
                          setSpecCustomRows(updated);
                        }}
                        placeholder="Giá trị (VD: Cao)"
                        style={{
                          flex: 1,
                          padding: '4px 8px',
                          fontSize: '12px',
                          border: '1px solid var(--color-border)',
                          borderRadius: '4px'
                        }}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setSpecCustomRows(specCustomRows.filter((_, i) => i !== idx))}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'red',
                          cursor: 'pointer',
                          padding: '0 4px',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              Lưu Thay Đổi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
