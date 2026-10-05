import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { canEditTableColumns, mergeTableColumnLayout, normalizeTableColumnLayout, type TableColumnLayout, type TableColumnLayoutPatch } from '@/domain/tableColumnLayout';
import { saveTableColumnLayout, TABLE_COLUMN_LAYOUT_COLLECTION } from '@/services/tableColumnLayoutService';

type LayoutMap = Record<string, TableColumnLayout>;
interface PendingLayout { sequence: number; layout: TableColumnLayout }
const CACHE_KEY = 'sunflower:shared-table-column-layouts:v1';

const readCache = (): LayoutMap => {
  try {
    const records = JSON.parse(window.localStorage.getItem(CACHE_KEY) || '[]');
    if (!Array.isArray(records)) return {};
    return Object.fromEntries(records.map(normalizeTableColumnLayout).filter((layout): layout is TableColumnLayout => Boolean(layout)).map(layout => [layout.id, layout]));
  } catch { return {}; }
};

export interface TableColumnLayoutManager {
  layouts: LayoutMap;
  ready: boolean;
  canEditColumns: boolean;
  error: string;
  saveLayout: (id: string, patch: TableColumnLayoutPatch) => boolean;
  migrateLayout: (id: string, patch: TableColumnLayoutPatch) => void;
  retry: () => void;
}

export const TableColumnLayoutContext = createContext<TableColumnLayoutManager>({
  layouts: {}, ready: false, canEditColumns: false, error: '',
  saveLayout: () => false, migrateLayout: () => {}, retry: () => {}
});

export const useTableColumnLayouts = () => useContext(TableColumnLayoutContext);

export const useTableColumnLayoutManager = (user: UserProfile | null): TableColumnLayoutManager => {
  const [layouts, setLayouts] = useState<LayoutMap>(readCache);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const layoutsRef = useRef(layouts);
  const confirmedRef = useRef(layouts);
  const pendingRef = useRef(new Map<string, PendingLayout>());
  const queuesRef = useRef(new Map<string, Promise<void>>());
  const migratedRef = useRef(new Set<string>());
  const generationRef = useRef(0);
  const sequenceRef = useRef(0);
  const failedSaveRef = useRef<{ id: string; patch: TableColumnLayoutPatch; onlyIfAbsent: boolean } | null>(null);
  const canEditColumns = ready && canEditTableColumns(user);

  const publish = useCallback(() => {
    const next = { ...confirmedRef.current };
    pendingRef.current.forEach((pending, id) => { next[id] = pending.layout; });
    layoutsRef.current = next;
    setLayouts(next);
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.values(confirmedRef.current))); } catch { /* Remote configuration stays authoritative. */ }
  }, []);

  useEffect(() => {
    const generation = ++generationRef.current;
    pendingRef.current.clear();
    queuesRef.current.clear();
    migratedRef.current.clear();
    failedSaveRef.current = null;
    // Authentication starts a new synchronization session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(false);
    setError('');
    if (!user?.uid || user.active !== true) return;
    const unsubscribe = dbService.subscribeCollection(TABLE_COLUMN_LAYOUT_COLLECTION, records => {
      if (generation !== generationRef.current) return;
      confirmedRef.current = Object.fromEntries(records.map(normalizeTableColumnLayout).filter((layout): layout is TableColumnLayout => Boolean(layout)).map(layout => [layout.id, layout]));
      publish();
      setReady(true);
      setError('');
    }, { onError: () => {
      if (generation !== generationRef.current) return;
      setReady(false);
      setError('Không thể tải cấu hình cột dùng chung. Vui lòng thử lại.');
    } });
    return () => { generationRef.current = generation + 1; unsubscribe(); };
  }, [user?.uid, user?.active, user?.role, reload, publish]);

  const enqueueSave = useCallback((id: string, patch: TableColumnLayoutPatch, onlyIfAbsent = false) => {
    if (!user || !canEditColumns) return false;
    const generation = generationRef.current;
    const sequence = ++sequenceRef.current;
    const next = mergeTableColumnLayout(id, layoutsRef.current[id], patch);
    pendingRef.current.set(id, { sequence, layout: next });
    publish();
    setError('');
    const write = (queuesRef.current.get(id) || Promise.resolve()).then(async () => {
      if (generation !== generationRef.current) return;
      try {
        const fields = await saveTableColumnLayout(user, id, patch, onlyIfAbsent);
        if (generation !== generationRef.current) return;
        confirmedRef.current[id] = onlyIfAbsent
          ? normalizeTableColumnLayout(fields) || mergeTableColumnLayout(id, confirmedRef.current[id], patch)
          : { ...mergeTableColumnLayout(id, confirmedRef.current[id], patch), updatedAt: fields.updatedAt, updatedById: user.uid };
        if (pendingRef.current.get(id)?.sequence === sequence) pendingRef.current.delete(id);
        failedSaveRef.current = null;
      } catch {
        if (generation !== generationRef.current) return;
        if (pendingRef.current.get(id)?.sequence === sequence) pendingRef.current.delete(id);
        failedSaveRef.current = { id, patch, onlyIfAbsent };
        setError('Không thể lưu cấu hình cột. Thay đổi chưa được đồng bộ. Vui lòng thử lại.');
      }
      publish();
    });
    queuesRef.current.set(id, write);
    return true;
  }, [user, canEditColumns, publish]);

  const saveLayout = useCallback((id: string, patch: TableColumnLayoutPatch) => enqueueSave(id, patch), [enqueueSave]);

  const migrateLayout = useCallback((id: string, patch: TableColumnLayoutPatch) => {
    if (!canEditColumns || layoutsRef.current[id] || migratedRef.current.has(id)) return;
    if (patch.selectedIds === undefined && !Object.keys(patch.widths || {}).length) return;
    migratedRef.current.add(id);
    enqueueSave(id, patch, true);
  }, [canEditColumns, enqueueSave]);

  const retry = useCallback(() => {
    const failed = failedSaveRef.current;
    if (failed && canEditColumns) enqueueSave(failed.id, failed.patch, failed.onlyIfAbsent);
    else setReload(value => value + 1);
  }, [canEditColumns, enqueueSave]);

  return { layouts, ready, canEditColumns, error, saveLayout, migrateLayout, retry };
};
