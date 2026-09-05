export type AdvancedFilterKind = 'text' | 'number' | 'date' | 'select';

export interface AdvancedFilterValue {
  query?: string;
  min?: string;
  max?: string;
  from?: string;
  to?: string;
  selected?: string;
}

export type AdvancedFilterState = Record<string, AdvancedFilterValue>;

export interface AdvancedFilterField<T> {
  id: string;
  label: string;
  group: string;
  kind: AdvancedFilterKind;
  description?: string;
  options?: Array<{ value: string; label: string }>;
  getValues: (record: T) => Array<string | number | boolean | null | undefined>;
}

export const getAdvancedFilterKindForFieldType = (type: string): AdvancedFilterKind => {
  if (['integer', 'decimal', 'currency', 'percent', 'number'].includes(type)) return 'number';
  if (['date', 'datetime'].includes(type)) return 'date';
  if (['single_select', 'multi_select', 'boolean', 'checkbox'].includes(type)) return 'select';
  return 'text';
};

export const toAdvancedFilterValues = (value: unknown): Array<string | number | boolean | null | undefined> => (
  Array.isArray(value)
    ? value.map(item => (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? item : String(item ?? '')))
    : [typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined ? value : String(value)]
);

export const hasAdvancedFilterValue = (value: AdvancedFilterValue | undefined) => Boolean(
  value && Object.values(value).some(item => String(item || '').trim())
);

export const countAdvancedFilters = (filters: AdvancedFilterState): number => (
  Object.values(filters).filter(hasAdvancedFilterValue).length
);

export const normalizeAdvancedFilterText = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('vi-VN');

export function matchesAdvancedFilters<T>(record: T, fields: AdvancedFilterField<T>[], filters: AdvancedFilterState): boolean {
  return fields.every(field => {
    const filter = filters[field.id];
    if (!hasAdvancedFilterValue(filter)) return true;
    const values = field.getValues(record).filter(value => value !== null && value !== undefined && value !== '');

    if (field.kind === 'text') {
      const query = normalizeAdvancedFilterText(filter.query);
      return !query || values.some(value => normalizeAdvancedFilterText(value).includes(query));
    }
    if (field.kind === 'select') {
      return !filter.selected || values.some(value => String(value) === filter.selected);
    }
    if (field.kind === 'number') {
      const min = filter.min === undefined || filter.min === '' ? Number.NEGATIVE_INFINITY : Number(filter.min);
      const max = filter.max === undefined || filter.max === '' ? Number.POSITIVE_INFINITY : Number(filter.max);
      return values.some(value => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= min && numeric <= max;
      });
    }

    const from = filter.from ? new Date(`${filter.from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = filter.to ? new Date(`${filter.to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return values.some(value => {
      const time = new Date(String(value)).getTime();
      return Number.isFinite(time) && time >= from && time <= to;
    });
  });
}

export function getAdvancedFilterSummaries<T>(fields: AdvancedFilterField<T>[], filters: AdvancedFilterState) {
  return fields.flatMap(field => {
    const value = filters[field.id];
    if (!hasAdvancedFilterValue(value)) return [];
    let detail = value.query || '';
    if (field.kind === 'select') detail = field.options?.find(option => option.value === value.selected)?.label || value.selected || '';
    if (field.kind === 'number') detail = value.min && value.max ? `${value.min} – ${value.max}` : value.min ? `Từ ${value.min}` : `Đến ${value.max}`;
    if (field.kind === 'date') detail = value.from && value.to ? `${value.from} – ${value.to}` : value.from ? `Từ ${value.from}` : `Đến ${value.to}`;
    return [{ id: field.id, label: `${field.label}: ${detail}` }];
  });
}
