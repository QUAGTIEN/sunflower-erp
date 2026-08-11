import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import './TableColumnCustomizer.css';

export interface TableColumnOption {
  id: string;
  label: string;
  required?: boolean;
}

interface TableColumnCustomizerProps {
  open: boolean;
  columns: TableColumnOption[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (selectedIds: string[]) => void;
}

export const TableColumnCustomizer: React.FC<TableColumnCustomizerProps> = ({
  open,
  columns,
  selectedIds,
  onClose,
  onSave
}) => {
  const [query, setQuery] = useState('');
  const [draftIds, setDraftIds] = useState(() => Array.from(new Set(selectedIds)));
  const defaultIds = useMemo(() => columns.map(column => column.id), [columns]);
  const selectedSet = useMemo(() => new Set(draftIds), [draftIds]);
  const visibleColumns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return normalizedQuery
      ? columns.filter(column => column.label.toLocaleLowerCase('vi-VN').includes(normalizedQuery))
      : columns;
  }, [columns, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const toggleColumn = (column: TableColumnOption) => {
    if (column.required) return;
    setDraftIds(current => current.includes(column.id)
      ? current.filter(id => id !== column.id)
      : [...current, column.id]);
  };

  const selectedColumns = columns.filter(column => selectedSet.has(column.id));

  return (
    <div className="table-column-customizer" role="dialog" aria-modal="true" aria-labelledby="table-column-customizer-title">
      <button type="button" className="table-column-customizer__backdrop" aria-label="Đóng tùy chỉnh cột" onClick={onClose} />
      <aside className="table-column-customizer__panel">
        <header>
          <div>
            <h2 id="table-column-customizer-title">Tùy chỉnh cột</h2>
            <p>Chọn thông tin cần hiển thị trong bảng.</p>
          </div>
          <button type="button" className="table-column-customizer__close" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </header>

        <div className="table-column-customizer__body">
          <section className="table-column-customizer__available">
            <label className="table-column-customizer__search">
              <Search size={15} />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm kiếm cột" autoFocus />
            </label>
            <h3>Chọn trường</h3>
            <div className="table-column-customizer__options">
              {visibleColumns.map(column => (
                <label key={column.id} className={column.required ? 'is-required' : ''}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(column.id)}
                    disabled={column.required}
                    onChange={() => toggleColumn(column)}
                  />
                  <span>{column.label}</span>
                  {column.required && <small>Bắt buộc</small>}
                </label>
              ))}
              {visibleColumns.length === 0 && <p className="table-column-customizer__empty">Không tìm thấy cột phù hợp.</p>}
            </div>
          </section>

          <section className="table-column-customizer__selected">
            <div className="table-column-customizer__selected-heading">
              <h3>Đã chọn ({selectedColumns.length})</h3>
              <button type="button" onClick={() => setDraftIds(columns.filter(column => column.required).map(column => column.id))}>Xóa cột tùy chọn</button>
            </div>
            <div className="table-column-customizer__selected-list">
              {selectedColumns.map(column => (
                <div key={column.id}>
                  <span><Check size={13} /> {column.label}</span>
                  {column.required
                    ? <small>Bắt buộc</small>
                    : <button type="button" onClick={() => toggleColumn(column)} aria-label={`Ẩn cột ${column.label}`}><X size={15} /></button>}
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer>
          <button type="button" className="table-column-customizer__default" onClick={() => setDraftIds(defaultIds)}>Mặc định</button>
          <button type="button" className="btn btn-outline" onClick={onClose}>Hủy</button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(draftIds)}>Lưu</button>
        </footer>
      </aside>
    </div>
  );
};
