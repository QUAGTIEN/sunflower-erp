import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VIETNAM_ADMINISTRATIVE_UNITS } from '@/data/vietnamAdministrativeUnits';
import {
  normalizeVietnameseLocationText,
  resolveVietnamProvince
} from '@/data/vietnamProvinceCatalog';
import './SearchableProvinceSelect.css';

interface SearchableProvinceSelectProps {
  value: string;
  onChange: (provinceName: string) => void;
  disabled?: boolean;
  inputId?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export const SearchableProvinceSelect: React.FC<SearchableProvinceSelectProps> = ({
  value,
  onChange,
  disabled = false,
  inputId,
  ariaLabel = 'Tỉnh / thành',
  placeholder = 'Chọn hoặc gõ để tìm tỉnh/thành'
}) => {
  const canonicalValue = resolveVietnamProvince(value)?.label || value;
  const [query, setQuery] = useState(canonicalValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId().replace(/:/g, '');
  const resolvedInputId = inputId || `province-${generatedId}`;
  const listboxId = `${resolvedInputId}-options`;

  useEffect(() => setQuery(canonicalValue), [canonicalValue]);

  const options = useMemo(() => {
    const normalizedQuery = normalizeVietnameseLocationText(query);
    if (!normalizedQuery || query === canonicalValue) return VIETNAM_ADMINISTRATIVE_UNITS;
    return VIETNAM_ADMINISTRATIVE_UNITS.filter(province => (
      normalizeVietnameseLocationText(province.label).includes(normalizedQuery)
    ));
  }, [canonicalValue, query]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery(canonicalValue);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [canonicalValue, open]);

  const selectProvince = (provinceName: string) => {
    onChange(provinceName);
    setQuery(provinceName);
    setOpen(false);
  };

  return (
    <div className={`searchable-province-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <input
        id={resolvedInputId}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${options[activeIndex].id}` : undefined}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={event => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setOpen(true);
          if (!nextQuery) onChange('');
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(index => Math.min(index + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && options[activeIndex]) {
            event.preventDefault();
            selectProvince(options[activeIndex].label);
          } else if (event.key === 'Escape') {
            setOpen(false);
            setQuery(canonicalValue);
          } else if (event.key === 'Tab') {
            setOpen(false);
            setQuery(canonicalValue);
          }
        }}
      />
      {open && !disabled && (
        <div className="searchable-province-select__dropdown" id={listboxId} role="listbox" aria-label="Danh sách tỉnh/thành">
          {options.map((province, index) => (
            <button
              id={`${listboxId}-${province.id}`}
              key={province.id}
              type="button"
              role="option"
              aria-selected={province.label === canonicalValue}
              className={`${province.label === canonicalValue ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`.trim()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectProvince(province.label)}
            >
              {province.label}
            </button>
          ))}
          {options.length === 0 && <p>Không tìm thấy tỉnh/thành phù hợp.</p>}
        </div>
      )}
    </div>
  );
};
