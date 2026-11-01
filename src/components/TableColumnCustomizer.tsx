import React, { useEffect, useMemo, useState } from 'react';
import { Search, Settings2, X } from 'lucide-react';
import { useTableColumnLayouts } from '@/context/TableColumnLayoutContext';
import './TableColumnCustomizer.css';

export interface TableColumnOption {
  id: string;
  label: string;
  required?: boolean;
  group?: string;
  defaultVisible?: boolean;
}

interface TableColumnCustomizerProps {
  open: boolean;
  columns: TableColumnOption[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (selectedIds: string[]) => void;
  textOnly?: boolean;
}

const TableColumnCustomizerDialog: React.FC<TableColumnCustomizerProps> = ({
  open,
  columns,
  selectedIds,
  onClose,
  onSave,
  textOnly = false
}) => {
  const [query, setQuery] = useState('');
  const [draftIds, setDraftIds] = useState(() => Array.from(new Set(selectedIds)));
  const defaultIds = useMemo(
    () => columns.filter(column => column.required || column.defaultVisible !== false).map(column => column.id),
    [columns]
  );
  const selectedSet = useMemo(() => new Set(draftIds), [draftIds]);
  const visibleColumns = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    return normalizedQuery
      ? columns.filter(column => column.label.toLocaleLowerCase('vi-VN').includes(normalizedQuery))
      : columns;
  }, [columns, query]);
  const groupedVisibleColumns = useMemo(() => {
    const groups = new Map<string, TableColumnOption[]>();
    visibleColumns.forEach(column => {
      const group = column.group || 'Thông tin trên bảng';
      groups.set(group, [...(groups.get(group) || []), column]);
    });
    return Array.from(groups, ([label, items]) => ({ label, items })).sort(
      (left, right) => Number(left.label === 'Điều khiển bảng') - Number(right.label === 'Điều khiển bảng')
    );
  }, [visibleColumns]);

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
    setDraftIds(current =>
      current.includes(column.id) ? current.filter(id => id !== column.id) : [...current, column.id]
    );
  };

  const selectedColumns = columns.filter(column => selectedSet.has(column.id));

  return (
    <div
      className={`table-column-customizer ${textOnly ? 'table-column-customizer--text' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-column-customizer-title"
    >
      <button
        type="button"
        className="table-column-customizer__backdrop"
        aria-label="Đóng tùy chỉnh cột"
        onClick={onClose}
      />
      <aside className="table-column-customizer__panel">
        <header>
          <div>
            <h2 id="table-column-customizer-title">Tùy chỉnh cột</h2>
            <p>Chọn cột cần hiển thị. Kéo tiêu đề trực tiếp trên bảng để đổi vị trí.</p>
          </div>
          <button type="button" className="table-column-customizer__close" onClick={onClose} aria-label="Đóng">
            {textOnly ? 'Đóng' : <X size={18} />}
          </button>
        </header>

        <div className="table-column-customizer__body">
          <section className="table-column-customizer__available">
            <label className="table-column-customizer__search">
              {!textOnly && <Search size={15} />}
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Tìm kiếm cột"
                autoFocus
              />
            </label>
            <div className="table-column-customizer__selection-heading">
              <h3>
                Chọn trường <span>({selectedColumns.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => setDraftIds(columns.filter(column => column.required).map(column => column.id))}
              >
                Bỏ chọn cột tùy chọn
              </button>
            </div>
            <div className="table-column-customizer__options">
              {groupedVisibleColumns.map(group => (
                <section key={group.label} className="table-column-customizer__group">
                  <h4>{group.label}</h4>
                  {group.items.map(column => (
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
                </section>
              ))}
              {visibleColumns.length === 0 && (
                <p className="table-column-customizer__empty">Không tìm thấy cột phù hợp.</p>
              )}
            </div>
          </section>
        </div>

        <footer>
          <button type="button" className="table-column-customizer__default" onClick={() => setDraftIds(defaultIds)}>
            Mặc định
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(draftIds)}>
            Lưu
          </button>
        </footer>
      </aside>
    </div>
  );
};

export const TableColumnCustomizer: React.FC<TableColumnCustomizerProps> = props => {
  const { canEditColumns } = useTableColumnLayouts();
  return props.open && canEditColumns ? (
    <TableColumnCustomizerDialog key={JSON.stringify(props.selectedIds)} {...props} />
  ) : null;
};

/** Toolbar button that opens the column customizer, styled like the filter button beside it. */
export const TableColumnsButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    className="data-filter-button"
    title="Tùy chỉnh cột"
    aria-label="Tùy chỉnh cột"
    onClick={onClick}
  >
    <Settings2 size={16} />
  </button>
);
