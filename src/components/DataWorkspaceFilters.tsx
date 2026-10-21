import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Filter, RotateCcw, Search, X } from 'lucide-react';
import './DataWorkspaceFilters.css';

export type DataFilterOption = {
  value: string;
  label: string;
  description?: string;
};

export type DataFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

export const DataFilterButton: React.FC<{
  activeCount: number;
  open: boolean;
  onClick: () => void;
  textOnly?: boolean;
}> = ({ activeCount, open, onClick, textOnly = false }) => (
  <button
    type="button"
    className={`data-filter-button ${textOnly ? 'data-filter-button--text' : ''} ${open || activeCount > 0 ? 'is-active' : ''}`}
    aria-expanded={open}
    aria-label={activeCount > 0 ? `Bộ lọc, ${activeCount} điều kiện đang áp dụng` : 'Bộ lọc'}
    title={activeCount > 0 ? `Bộ lọc (${activeCount})` : 'Bộ lọc'}
    onClick={onClick}
  >
    {textOnly ? `Bộ lọc${activeCount > 0 ? ` (${activeCount})` : ''}` : <><Filter size={15} />{activeCount > 0 && <strong>{activeCount}</strong>}</>}
  </button>
);

export const DataFilterChipBar: React.FC<{
  chips: DataFilterChip[];
  onClear: () => void;
  textOnly?: boolean;
}> = ({ chips, onClear, textOnly = false }) => {
  if (chips.length === 0) return null;
  return (
    <div className={`data-filter-chips ${textOnly ? 'data-filter-chips--text' : ''}`} aria-label="Điều kiện lọc đang áp dụng">
      <span>Đang lọc:</span>
      {chips.map(chip => (
        <button key={chip.id} type="button" onClick={chip.onRemove} title={`Bỏ lọc ${chip.label}`}>
          {chip.label}{textOnly ? ' · Bỏ' : <X size={12} />}
        </button>
      ))}
      <button type="button" className="data-filter-chips__clear" onClick={onClear}>Xóa tất cả</button>
    </div>
  );
};

export const DataFilterPanel: React.FC<{
  open: boolean;
  title: string;
  description?: string;
  activeCount: number;
  onClose: () => void;
  onReset: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  textOnly?: boolean;
}> = ({ open, title, description, activeCount, onClose, onReset, headerAction, children, textOnly = false }) => {
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <>
      <button type="button" className="data-filter-panel__backdrop" aria-label="Đóng bộ lọc" onClick={onClose} />
      <aside className={`data-filter-panel ${textOnly ? 'data-filter-panel--text' : ''}`} aria-label={title}>
        <header>
          <div>
            <span>BỘ LỌC</span>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng">{textOnly ? 'Đóng' : <X size={18} />}</button>
        </header>
        {headerAction && <div className="data-filter-panel__admin-action">{headerAction}</div>}
        <div className="data-filter-panel__body">{children}</div>
        <footer>
          <button type="button" className="btn btn-outline" onClick={onReset} disabled={activeCount === 0}>
            {!textOnly && <RotateCcw size={14} />} Đặt lại
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {!textOnly && <Check size={14} />} Áp dụng {activeCount > 0 ? `(${activeCount})` : ''}
          </button>
        </footer>
      </aside>
    </>
  );
};

export const DataFilterSection: React.FC<{
  title: string;
  description?: string;
  selectedCount?: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}> = ({ title, description, selectedCount = 0, children, defaultExpanded }) => {
  const [expanded, setExpanded] = useState(defaultExpanded ?? selectedCount > 0);
  return (
    <section className={`data-filter-section ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
      <button type="button" className="data-filter-section__heading" aria-expanded={expanded} onClick={() => setExpanded(previous => !previous)}>
        <span>
          <strong>{title}</strong>
          {selectedCount > 0 && <span className="data-filter-section__count">{selectedCount} đã chọn</span>}
        </span>
        <ChevronDown size={15} />
      </button>
      {expanded && (
        <div className="data-filter-section__expanded-content">
          {description && <p>{description}</p>}
          <div className="data-filter-section__content">{children}</div>
        </div>
      )}
    </section>
  );
};

export const DataFilterCheckboxGroup: React.FC<{
  options: DataFilterOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
  emptyText?: string;
}> = ({ options, selectedValues, onChange, searchable = false, emptyText = 'Chưa có dữ liệu' }) => {
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalizedQuery) return options;
    return options.filter(option => `${option.label} ${option.description || ''}`.toLocaleLowerCase('vi-VN').includes(normalizedQuery));
  }, [options, query]);

  return (
    <div className="data-filter-checklist">
      {searchable && options.length > 6 && (
        <label className="data-filter-checklist__search">
          <Search size={14} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong danh sách..." />
        </label>
      )}
      <div className="data-filter-checklist__options">
        {visibleOptions.map(option => {
          const selected = selectedValues.includes(option.value);
          return (
            <label key={option.value} className={selected ? 'is-selected' : ''}>
              <input
                type="checkbox"
                checked={selected}
                onChange={event => onChange(event.target.checked
                  ? Array.from(new Set([...selectedValues, option.value]))
                  : selectedValues.filter(value => value !== option.value))}
              />
              <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
            </label>
          );
        })}
        {visibleOptions.length === 0 && <span className="data-filter-checklist__empty">{emptyText}</span>}
      </div>
      {selectedValues.length > 0 && <button type="button" className="data-filter-checklist__clear" onClick={() => onChange([])}>Bỏ chọn nhóm này</button>}
    </div>
  );
};
