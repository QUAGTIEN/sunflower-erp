import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  hasAdvancedFilterValue,
  normalizeAdvancedFilterText,
  type AdvancedFilterField,
  type AdvancedFilterState,
  type AdvancedFilterValue
} from './advancedDataFilterModel';
import './AdvancedDataFilters.css';

export const AdvancedDataFilters = <T,>({
  fields,
  filters,
  onChange
}: {
  fields: AdvancedFilterField<T>[];
  filters: AdvancedFilterState;
  onChange: (filters: AdvancedFilterState) => void;
}) => {
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => {
    const normalizedQuery = normalizeAdvancedFilterText(query);
    const visibleFields = normalizedQuery
      ? fields.filter(field =>
          normalizeAdvancedFilterText(`${field.group} ${field.label} ${field.description || ''}`).includes(
            normalizedQuery
          )
        )
      : fields;
    const grouped = new Map<string, AdvancedFilterField<T>[]>();
    visibleFields.forEach(field => grouped.set(field.group, [...(grouped.get(field.group) || []), field]));
    return Array.from(grouped, ([label, items]) => ({ label, items }));
  }, [fields, query]);

  const updateField = (fieldId: string, patch: Partial<AdvancedFilterValue>) => {
    const nextValue = { ...(filters[fieldId] || {}), ...patch };
    const next = { ...filters };
    if (hasAdvancedFilterValue(nextValue)) next[fieldId] = nextValue;
    else delete next[fieldId];
    onChange(next);
  };

  return (
    <div className="advanced-data-filters">
      <label className="advanced-data-filters__search">
        <span>Tìm trường lọc</span>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập tên trường..." />
      </label>

      {groups.map((group, groupIndex) => {
        const selectedCount = group.items.filter(field => hasAdvancedFilterValue(filters[field.id])).length;
        const isExpanded = Boolean(query.trim()) || (expandedGroups[group.label] ?? groupIndex === 0);
        return (
          <section key={group.label} className={`advanced-data-filters__group ${isExpanded ? 'is-expanded' : ''}`}>
            <button
              type="button"
              className="advanced-data-filters__group-heading"
              aria-expanded={isExpanded}
              onClick={() => setExpandedGroups(previous => ({ ...previous, [group.label]: !isExpanded }))}
            >
              <span>
                <h3>{group.label}</h3>
                {selectedCount > 0 && <strong>{selectedCount} đang lọc</strong>}
              </span>
              <span>
                {group.items.length} trường <ChevronDown size={14} />
              </span>
            </button>
            {isExpanded && (
              <div className="advanced-data-filters__fields">
                {group.items.map(field => {
                  const value = filters[field.id] || {};
                  return (
                    <div key={field.id} className={`advanced-data-filters__field is-${field.kind}`}>
                      <div className="advanced-data-filters__label">
                        <strong>{field.label}</strong>
                        {field.description && <small>{field.description}</small>}
                      </div>
                      {field.kind === 'text' && (
                        <input
                          type="text"
                          value={value.query || ''}
                          onChange={event => updateField(field.id, { query: event.target.value })}
                          placeholder="Chứa từ khóa..."
                        />
                      )}
                      {field.kind === 'select' && (
                        <select
                          value={value.selected || ''}
                          onChange={event => updateField(field.id, { selected: event.target.value })}
                        >
                          <option value="">Tất cả</option>
                          {(field.options || []).map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {field.kind === 'number' && (
                        <div className="advanced-data-filters__range">
                          <input
                            type="number"
                            value={value.min || ''}
                            onChange={event => updateField(field.id, { min: event.target.value })}
                            placeholder="Từ"
                          />
                          <input
                            type="number"
                            value={value.max || ''}
                            onChange={event => updateField(field.id, { max: event.target.value })}
                            placeholder="Đến"
                          />
                        </div>
                      )}
                      {field.kind === 'date' && (
                        <div className="advanced-data-filters__range">
                          <label>
                            <span>Từ ngày</span>
                            <input
                              type="date"
                              value={value.from || ''}
                              onChange={event => updateField(field.id, { from: event.target.value })}
                            />
                          </label>
                          <label>
                            <span>Đến ngày</span>
                            <input
                              type="date"
                              value={value.to || ''}
                              onChange={event => updateField(field.id, { to: event.target.value })}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {groups.length === 0 && <p className="advanced-data-filters__empty">Không tìm thấy trường phù hợp.</p>}
    </div>
  );
};
