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
  options?: Array<{ id: string; label: string }>;
}

export const SearchableProvinceSelect: React.FC<SearchableProvinceSelectProps> = ({
  value,
  onChange,
  disabled = false,
  inputId,
  ariaLabel = 'Tỉnh / thành',
  placeholder = 'Chọn hoặc gõ để tìm tỉnh/thành',
  options: suppliedOptions
}) => {
  const provinceOptions = suppliedOptions || VIETNAM_ADMINISTRATIVE_UNITS;
  const exactValue = provinceOptions.find(province => province.label === value)?.label;
  const canonicalValue = exactValue || resolveVietnamProvince(value)?.label || value;
  const [query, setQuery] = useState(canonicalValue);
  const [lastCanonicalValue, setLastCanonicalValue] = useState(canonicalValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId().replace(/:/g, '');
  const resolvedInputId = inputId || `province-${generatedId}`;
  const listboxId = `${resolvedInputId}-options`;

  if (canonicalValue !== lastCanonicalValue) {
    setLastCanonicalValue(canonicalValue);
    setQuery(canonicalValue);
  }

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeVietnameseLocationText(query);
    if (!normalizedQuery || query === canonicalValue) return provinceOptions;
    return provinceOptions.filter(province => (
      normalizeVietnameseLocationText(province.label).includes(normalizedQuery)
    ));
  }, [canonicalValue, provinceOptions, query]);

  useEffect(() => {
    if (!open) return;
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
        aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-${filteredOptions[activeIndex].id}` : undefined}
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { setActiveIndex(0); setOpen(true); }}
        onClick={() => { setActiveIndex(0); setOpen(true); }}
        onChange={event => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setActiveIndex(0);
          setOpen(true);
          if (!nextQuery) onChange('');
        }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(index => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(index => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
            event.preventDefault();
            selectProvince(filteredOptions[activeIndex].label);
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
          {filteredOptions.map((province, index) => (
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
          {filteredOptions.length === 0 && <p>Không tìm thấy tỉnh/thành phù hợp.</p>}
        </div>
      )}
    </div>
  );
};
