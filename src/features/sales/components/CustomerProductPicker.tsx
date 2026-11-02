import { useEffect, useRef, useState } from 'react';
import type { CustomerProductRecord } from '@/features/crm/model/crmModels';
import { CUSTOMER_PRODUCT_TYPES, getCustomerProductSize } from '@/features/crm/model/customerProductCatalog';

interface Props {
  companyName: string;
  products: CustomerProductRecord[];
  single: boolean;
  initialIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}

export function CustomerProductPicker({ companyName, products, single, initialIds, onClose, onConfirm }: Props) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState(initialIds);
  const dialog = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('vi')
      .trim();
  const visible = products.filter(
    product =>
      (!type || product.productType === type) &&
      normalize(`${product.productCode} ${product.productName}`).includes(normalize(query))
  );
  const types = [...new Set(products.map(product => product.productType))];
  const allSelected = visible.length > 0 && visible.every(product => selected.includes(product.id));
  const typeLabel = (value: string) =>
    CUSTOMER_PRODUCT_TYPES.find(item => item.id === value)?.name || value || 'Chưa phân loại';

  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = !allSelected && visible.some(product => selected.includes(product.id));
  }, [allSelected, visible, selected]);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    search.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      trigger?.focus();
    };
  }, [onClose]);

  const toggle = (id: string) =>
    setSelected(previous =>
      single ? [id] : previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]
    );

  return (
    <div className="modal-overlay po-catalog-picker-overlay">
      <div
        ref={dialog}
        className="po-catalog-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="po-catalog-picker-title"
      >
        <header>
          <div>
            <h2 id="po-catalog-picker-title">Chọn mã sản phẩm</h2>
            <span>
              {companyName} · {products.length} mã sản phẩm
            </span>
          </div>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Đóng
          </button>
        </header>
        <div className="po-catalog-picker__filters">
          <input
            ref={search}
            aria-label="Tìm mã hoặc tên sản phẩm"
            placeholder="Tìm mã hoặc tên sản phẩm..."
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
          <select aria-label="Loại sản phẩm" value={type} onChange={event => setType(event.target.value)}>
            <option value="">Tất cả loại sản phẩm</option>
            {types.map(value => (
              <option key={value} value={value}>
                {typeLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="po-catalog-picker__table">
          <table>
            <thead>
              <tr>
                <th className="po-catalog-picker__check">
                  {!single && (
                    <input
                      ref={selectAll}
                      type="checkbox"
                      aria-label="Chọn tất cả sản phẩm đang hiển thị"
                      checked={allSelected}
                      disabled={!visible.length}
                      onChange={() =>
                        setSelected(previous =>
                          allSelected
                            ? previous.filter(id => !visible.some(product => product.id === id))
                            : [...new Set([...previous, ...visible.map(product => product.id)])]
                        )
                      }
                    />
                  )}
                </th>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Loại sản phẩm</th>
                <th>Quy cách / Chất liệu</th>
                <th className="po-catalog-picker__unit">ĐVT</th>
                <th>Đơn giá tham khảo</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(product => (
                <tr key={product.id} className={selected.includes(product.id) ? 'is-selected' : ''}>
                  <td>
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name="po-catalog-selection"
                      aria-label={`Chọn: ${product.productCode} — ${product.productName}`}
                      checked={selected.includes(product.id)}
                      onChange={() => toggle(product.id)}
                    />
                  </td>
                  <td title={product.productCode}>{product.productCode}</td>
                  <td title={product.productName}>{product.productName}</td>
                  <td>{typeLabel(product.productType)}</td>
                  <td title={[getCustomerProductSize(product), product.material].filter(Boolean).join(' · ')}>
                    {[getCustomerProductSize(product), product.material].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>{product.unit}</td>
                  <td>{Number(product.currentPrice || 0).toLocaleString('vi-VN')} đ</td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={7}>Không có sản phẩm phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>Đã chọn {selected.length} sản phẩm</span>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!selected.length}
            onClick={() => onConfirm(selected)}
          >
            {single ? 'Chọn mã sản phẩm' : 'Thêm vào đơn hàng'}
          </button>
        </footer>
      </div>
    </div>
  );
}
