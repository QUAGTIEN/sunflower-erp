import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { VIETNAM_ADMINISTRATIVE_UNITS } from '@/data/vietnamAdministrativeUnits';
import { normalizeVietnameseLocationText, resolveVietnamProvince } from '@/data/vietnamProvinceCatalog';
import './SearchableProvinceSelect.css';

export interface SearchableLocationOption {
  id: string;
  label: string;
}

interface SearchableLocationSelectProps {
  value: string;
  options: SearchableLocationOption[];
  onChange: (value: string) => void;
  valueKey?: 'id' | 'label';
  disabled?: boolean;
  inputId?: string;
  ariaLabel: string;
  placeholder: string;
  emptyMessage: string;
}

export const SearchableLocationSelect: React.FC<SearchableLocationSelectProps> = ({
  value, options, onChange, valueKey = 'label', disabled = false, inputId,
  ariaLabel, placeholder, emptyMessage
}) => {
  const selectedOption = options.find(option => option[valueKey] === value);
  const displayValue = selectedOption?.label || '';
  const [query, setQuery] = useState(displayValue);
  const [lastValue, setLastValue] = useState(value);
  const [lastDisplayValue, setLastDisplayValue] = useState(displayValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const generatedId = useId().replace(/:/g, '');
  const resolvedInputId = inputId || `location-${generatedId}`;
  const listboxId = `${resolvedInputId}-options`;

  if (value !== lastValue || displayValue !== lastDisplayValue) {
    setLastValue(value);
    setLastDisplayValue(displayValue);
    setQuery(displayValue);
  }

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeVietnameseLocationText(query);
    if (!normalizedQuery || query === displayValue) return options;
    return options.filter(option => normalizeVietnameseLocationText(option.label).includes(normalizedQuery));
  }, [displayValue, options, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery(displayValue);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [displayValue, open]);

  const selectOption = (option: SearchableLocationOption) => {
    onChange(option[valueKey]);
    setQuery(option.label);
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
            selectOption(filteredOptions[activeIndex]);
          } else if (event.key === 'Escape' || event.key === 'Tab') {
            setOpen(false);
            setQuery(displayValue);
          }
        }}
      />
      {open && !disabled && (
        <div className="searchable-province-select__dropdown" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {filteredOptions.map((option, index) => (
            <button
              id={`${listboxId}-${option.id}`}
              key={option.id}
              type="button"
              role="option"
              aria-selected={option[valueKey] === value}
              className={`${option[valueKey] === value ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`.trim()}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >{option.label}</button>
          ))}
          {filteredOptions.length === 0 && <p>{emptyMessage}</p>}
        </div>
      )}
    </div>
  );
};

interface SearchableProvinceSelectProps {
  value: string;
  onChange: (provinceName: string) => void;
  disabled?: boolean;
  inputId?: string;
  ariaLabel?: string;
  placeholder?: string;
  options?: SearchableLocationOption[];
}

export const SearchableProvinceSelect: React.FC<SearchableProvinceSelectProps> = ({
  value, onChange, disabled = false, inputId, ariaLabel = 'Tỉnh / thành',
  placeholder = 'Chọn hoặc gõ để tìm tỉnh/thành', options = VIETNAM_ADMINISTRATIVE_UNITS
}) => {
  const exactValue = options.find(province => province.label === value)?.label;
  const canonicalValue = exactValue || resolveVietnamProvince(value)?.label || value;
  return <SearchableLocationSelect value={canonicalValue} options={options} onChange={onChange} disabled={disabled} inputId={inputId} ariaLabel={ariaLabel} placeholder={placeholder} emptyMessage="Không tìm thấy tỉnh/thành phù hợp." />;
};
