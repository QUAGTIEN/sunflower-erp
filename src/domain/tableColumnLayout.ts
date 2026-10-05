import type { UserProfile } from '@/shared/types';

export interface TableColumnLayout {
  id: string;
  schemaVersion: 1;
  selectedIds?: string[];
  widths: Record<string, number>;
  updatedAt?: string;
  updatedById?: string;
}

export interface TableColumnLayoutPatch {
  selectedIds?: string[];
  widths?: Record<string, number>;
}

export const canEditTableColumns = (user: Pick<UserProfile, 'role' | 'active'> | null) => (
  user?.role === 'admin' && user.active === true
);

export const normalizeColumnWidths = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, width]) => (
    key.length <= 180 && typeof width === 'number' && Number.isFinite(width)
    && width >= 64 && width <= (key === '__tableWidth' ? 100_000 : 4096)
  )).slice(0, 256));
};

export const normalizeColumnSelection = (value: unknown): string[] | undefined => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 180))).slice(0, 256)
    : undefined
);

export const normalizeTableColumnLayout = (value: unknown): TableColumnLayout | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,180}$/.test(record.id)) return null;
  const selectedIds = normalizeColumnSelection(record.selectedIds);
  return {
    id: record.id,
    schemaVersion: 1,
    ...(selectedIds ? { selectedIds } : {}),
    widths: normalizeColumnWidths(record.widths),
    ...(typeof record.updatedAt === 'string' ? { updatedAt: record.updatedAt } : {}),
    ...(typeof record.updatedById === 'string' ? { updatedById: record.updatedById } : {})
  };
};

export const mergeTableColumnLayout = (
  id: string,
  previous: TableColumnLayout | undefined,
  patch: TableColumnLayoutPatch
): TableColumnLayout => ({
  ...(previous || { id, schemaVersion: 1 as const, widths: {} }),
  ...(patch.selectedIds !== undefined ? { selectedIds: normalizeColumnSelection(patch.selectedIds) || [] } : {}),
  widths: { ...previous?.widths, ...normalizeColumnWidths(patch.widths) }
});

// Legacy preferences are read only when an administrator migrates a table.
export const readLegacyColumnSelection = (key?: string, view?: string): string[] | undefined => {
  if (!key) return undefined;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return normalizeColumnSelection(view ? value?.[view] : value);
  } catch {
    return undefined;
  }
};

export const readLegacyColumnWidths = (key?: string): Record<string, number> => {
  if (!key) return {};
  try {
    return normalizeColumnWidths(JSON.parse(window.localStorage.getItem(key) || '{}'));
  } catch {
    return {};
  }
};

export const getGenericTableLayoutId = (pageId: string, tableKey: string) => {
  let hash = 2166136261;
  for (const char of tableKey) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `generic:${pageId}:${(hash >>> 0).toString(36)}`;
};
