import { LoadingStatus } from '@/components/LoadingStates';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserProfile } from '@/shared/types';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import { loadItemCatalog, loadLegacyCatalogSources, mutateItemCatalog } from '../api/itemCatalogService';
import {
  CATALOG_KINDS,
  canManageItemCatalog,
  catalogCsvTemplate,
  conversionFactor,
  parseCatalogCsv,
  previewCatalogImport,
  resolveCatalogSource,
  validateCatalogInput,
  type CatalogInput,
  type CatalogItem,
  type CatalogKind,
  type CatalogLink,
  type CatalogSource,
  type CatalogSourceRef
} from '../model/itemCatalog';
import './ItemCatalog.css';

interface Editor {
  item: CatalogInput;
  conversionText: string;
  previous?: CatalogItem;
  source?: CatalogSource;
  active: boolean;
}
const blankItem = (): CatalogInput => ({
  code: '',
  name: '',
  kind: 'raw_material',
  baseUnit: '',
  conversions: [],
  notes: ''
});
const sourceTypes = {
  inventory: 'Vật tư kho',
  customer_product: 'Sản phẩm theo khách',
  po_item: 'Dòng đơn hàng'
} as const;
const linkLabels = {
  unlinked: 'Chưa liên kết',
  linked: 'Đã liên kết',
  stale: 'Nguồn đã đổi — cần đối chiếu',
  inactive: 'Mã đã ngừng sử dụng'
};
const message = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý. Hãy thử lại.');
const conversionsFromText = (text: string) =>
  text.trim()
    ? text
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [unit, factor, ...extra] = line.split(':');
          return { unit: unit.trim(), factor: extra.length || !factor?.trim() ? NaN : Number(factor) };
        })
    : [];

export function ItemCatalogWorkspace({ currentUser }: { currentUser: UserProfile }) {
  const [data, setData] = useState<{
    items: CatalogItem[];
    links: CatalogLink[];
    imports: Array<{ id: string; createdAt: string; actorName: string; count: number }>;
  }>({ items: [], links: [], imports: [] });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<'items' | 'legacy' | 'import'>('items');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [activeFilter, setActiveFilter] = useState('active');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [sourceType, setSourceType] = useState<CatalogSourceRef['type']>('inventory');
  const [sources, setSources] = useState<CatalogSource[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceLoaded, setSourceLoaded] = useState(false);
  const [sourceRefresh, setSourceRefresh] = useState(0);
  const [onlyUnlinked, setOnlyUnlinked] = useState(true);
  const [linkSource, setLinkSource] = useState<CatalogSource | null>(null);
  const [targetId, setTargetId] = useState('');
  const [targetSearch, setTargetSearch] = useState('');
  const [importRows, setImportRows] = useState<CatalogInput[]>([]);
  const [fileName, setFileName] = useState('');
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  const fileSequence = useRef(0);
  const permitted = canManageItemCatalog(currentUser);
  const canWrite = permitted && isFirebaseRuntimeEnabled && loaded && !loading && !busy;
  const dirty = Boolean(editor || linkSource || importRows.length);

  const reload = async () => {
    setLoading(true);
    setError('');
    setLoaded(false);
    try {
      setData(await loadItemCatalog());
      setLoaded(true);
    } catch (cause) {
      setError(`Không tải được danh mục. ${message(cause)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void loadItemCatalog()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setLoaded(true);
          setLoading(false);
        }
      })
      .catch(cause => {
        if (!cancelled) {
          setError(`Không tải được danh mục. ${message(cause)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [permitted]);
  useEffect(() => {
    if (view !== 'legacy' || !permitted) return;
    let cancelled = false;
    void loadLegacyCatalogSources(sourceType)
      .then(rows => {
        if (!cancelled) {
          setSources(rows);
          setSourceLoaded(true);
        }
      })
      .catch(cause => {
        if (!cancelled) setError(`Không tải được dữ liệu nguồn. ${message(cause)}`);
      })
      .finally(() => {
        if (!cancelled) setSourceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceType, view, permitted, sourceRefresh]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    const unregister = registerNavigationGuard(
      () => !busy && window.confirm('Danh mục có thông tin chưa lưu. Bạn có muốn rời trang và bỏ thay đổi?')
    );
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      unregister();
    };
  }, [dirty, busy]);

  const discard = () => {
    if (busy || (dirty && !window.confirm('Thông tin đang nhập chưa được lưu. Bạn có muốn bỏ thay đổi?'))) return false;
    setEditor(null);
    setLinkSource(null);
    setImportRows([]);
    setFileName('');
    fileSequence.current++;
    return true;
  };
  const resetSources = () => {
    setSourceLoading(true);
    setSourceLoaded(false);
    setSources([]);
  };
  const switchView = (next: typeof view) => {
    if (discard()) {
      if (next === 'legacy') resetSources();
      setView(next);
      setSourceRefresh(value => value + 1);
      setSearch('');
      setError('');
    }
  };
  const execute = async (body: Record<string, unknown>, after: () => void) => {
    if (pending.current || !canWrite) return;
    const payload = JSON.stringify(body);
    if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await mutateItemCatalog({ ...body, requestId: request.current.id });
      request.current = { payload: '', id: '' };
      after();
      setNotice(`Đã lưu ${result.ids.length} mã hàng. Mã lượt ghi: ${result.requestId}.`);
      showSuccessToast('Đã lưu danh mục thành công');
      await reload();
    } catch (cause) {
      setError(message(cause));
      showErrorToast(message(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const reportError = (cause: unknown) => {
    setError(message(cause));
    showErrorToast(message(cause));
  };
  const openEditor = (previous?: CatalogItem, source?: CatalogSource) => {
    if (!discard()) return;
    setError('');
    setEditor({
      item: previous
        ? {
            code: previous.code,
            name: previous.name,
            kind: previous.kind,
            baseUnit: previous.baseUnit,
            conversions: previous.conversions.map(entry => ({ ...entry })),
            notes: previous.notes
          }
        : source
          ? { ...blankItem(), code: source.code, name: source.name, baseUnit: source.unit }
          : blankItem(),
      conversionText: previous?.conversions.map(entry => `${entry.unit}:${entry.factor}`).join('\n') || '',
      previous,
      source,
      active: previous?.active ?? true
    });
  };
  const updateItem = (patch: Partial<CatalogInput>) =>
    setEditor(current => (current ? { ...current, item: { ...current.item, ...patch } } : current));
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    try {
      const item = validateCatalogInput({ ...editor.item, conversions: conversionsFromText(editor.conversionText) });
      const priorLink = editor.source ? data.links.find(link => link.sourceKey === editor.source!.key) : undefined;
      void execute(
        {
          action: editor.previous ? 'update' : 'create',
          item,
          ...(editor.previous
            ? { id: editor.previous.id, expectedRevision: editor.previous.revision, active: editor.active }
            : {}),
          ...(editor.source
            ? {
                source: editor.source.ref,
                sourceFingerprint: editor.source.fingerprint,
                expectedLinkRevision: priorLink?.revision || 0
              }
            : {})
        },
        () => setEditor(null)
      );
    } catch (cause) {
      reportError(cause);
    }
  };
  const saveLink = (event: FormEvent) => {
    event.preventDefault();
    if (!linkSource || !targetId) return;
    const prior = data.links.find(link => link.sourceKey === linkSource.key);
    void execute(
      {
        action: 'link',
        catalogItemId: targetId,
        source: linkSource.ref,
        sourceFingerprint: linkSource.fingerprint,
        expectedLinkRevision: prior?.revision || 0
      },
      () => setLinkSource(null)
    );
  };
  const readFile = async (file?: File) => {
    if (!file || busy) return;
    const sequence = ++fileSequence.current;
    setError('');
    setImportRows([]);
    setFileName(file.name);
    try {
      if (!/\.csv$/i.test(file.name) || file.size > 1_000_000)
        throw new Error('Chọn tệp CSV UTF-8, tối đa 1 MB và 50 dòng. Excel có thể lưu sang định dạng CSV UTF-8.');
      const rows = parseCatalogCsv(await file.text());
      if (sequence === fileSequence.current) setImportRows(rows);
    } catch (cause) {
      if (sequence === fileSequence.current) reportError(cause);
    }
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([catalogCsvTemplate], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sunflower-danh-muc-hang.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const needle = search.trim().toLocaleLowerCase('vi-VN');
  const visibleItems = data.items
    .filter(
      item =>
        (!kind || item.kind === kind) &&
        (!activeFilter || item.active === (activeFilter === 'active')) &&
        `${item.code} ${item.name} ${item.notes}`.toLocaleLowerCase('vi-VN').includes(needle)
    )
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));
  const visibleSources = sources.filter(
    source =>
      (!onlyUnlinked || resolveCatalogSource(source, data.links, data.items).status !== 'linked') &&
      `${source.label} ${source.code} ${source.name}`.toLocaleLowerCase('vi-VN').includes(needle)
  );
  const itemPages = useDataTablePagination(visibleItems);
  const sourcePages = useDataTablePagination(visibleSources);
  const preview = previewCatalogImport(importRows, data.items);
  const candidates = data.items.filter(
    item =>
      item.active &&
      (!linkSource || linkSource.ref.type !== 'inventory' || item.kind === 'raw_material') &&
      `${item.code} ${item.name}`.toLocaleLowerCase('vi-VN').includes(targetSearch.trim().toLocaleLowerCase('vi-VN'))
  );
  const target = data.items.find(item => item.id === targetId);
  let unitNotice = '';
  if (linkSource && target) {
    try {
      unitNotice = `1 ${linkSource.unit} = ${conversionFactor(target, linkSource.unit).toLocaleString('vi-VN')} ${target.baseUnit}`;
    } catch (cause) {
      unitNotice = message(cause);
    }
  }
  let validConversion = false;
  if (linkSource && target) {
    try {
      conversionFactor(target, linkSource.unit);
      validConversion = true;
    } catch {
      /* Display the validation message above. */
    }
  }
  if (!permitted) return <p role="status">Bạn không có quyền quản lý danh mục hàng.</p>;

  return (
    <section
      className="item-catalog"
      data-erp-table-text="single-line"
      aria-label="Danh mục hàng dùng chung"
      aria-busy={loading || busy}
    >
      <div className="content-tabs" role="tablist" aria-label="Danh mục hàng">
        {(
          [
            ['items', 'Danh mục nội bộ'],
            ['legacy', 'Liên kết dữ liệu cũ'],
            ['import', 'Nhập CSV']
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            role="tab"
            key={key}
            aria-selected={view === key}
            className={view === key ? 'is-active' : ''}
            disabled={busy}
            onClick={() => switchView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {!isFirebaseRuntimeEnabled && <p role="status">Chế độ demo chỉ xem. Thao tác lưu cần Firebase và API máy chủ.</p>}
      {error && (
        <div className="erp-column-layout-error" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void reload()}>
            Tải lại
          </button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <LoadingStatus loading={loading} hasData={data.items.length > 0} label="Đang tải danh mục" />

      {editor && (
        <form className="card catalog-form" onSubmit={save} data-erp-table-layout="content">
          <h2>
            {editor.previous ? 'Cập nhật mã hàng' : editor.source ? 'Tạo mã và liên kết dòng nguồn' : 'Tạo mã hàng'}
          </h2>
          {editor.source && (
            <p>
              Nguồn: {editor.source.label} / {editor.source.name} ({editor.source.unit}). Chỉ lưu danh mục và liên kết,
              không cập nhật số tồn hoặc ghi đè hồ sơ nguồn.
            </p>
          )}
          <fieldset disabled={busy}>
            <div className="catalog-form-grid">
              <label>
                Mã nội bộ *
                <input
                  required
                  maxLength={100}
                  readOnly={Boolean(editor.previous)}
                  value={editor.item.code}
                  onChange={event => updateItem({ code: event.target.value })}
                />
              </label>
              <label>
                Tên hàng *
                <input
                  required
                  maxLength={250}
                  value={editor.item.name}
                  onChange={event => updateItem({ name: event.target.value })}
                />
              </label>
              <label>
                Nhóm hàng *
                <select
                  disabled={Boolean(editor.previous)}
                  value={editor.item.kind}
                  onChange={event => updateItem({ kind: event.target.value as CatalogKind })}
                >
                  {Object.entries(CATALOG_KINDS).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ĐVT cơ sở *
                <input
                  required
                  maxLength={40}
                  list="catalog-units"
                  readOnly={Boolean(editor.previous)}
                  value={editor.item.baseUnit}
                  onChange={event => updateItem({ baseUnit: event.target.value })}
                />
              </label>
              <label>
                Quy đổi riêng cho mã này
                <textarea
                  placeholder={'Mỗi dòng: đơn vị:hệ số\nVí dụ: cuộn:1000'}
                  value={editor.conversionText}
                  onChange={event => setEditor({ ...editor, conversionText: event.target.value })}
                />
                <span>
                  1 đơn vị giao dịch bằng hệ số × ĐVT cơ sở. Hệ số đã lưu được giữ nguyên; có thể thêm đơn vị mới.
                </span>
              </label>
              <label>
                Ghi chú hoặc quy cách
                <textarea
                  maxLength={2000}
                  value={editor.item.notes}
                  onChange={event => updateItem({ notes: event.target.value })}
                />
              </label>
            </div>
            {editor.previous && (
              <label className="catalog-check">
                <input
                  type="checkbox"
                  checked={editor.active}
                  onChange={event => setEditor({ ...editor, active: event.target.checked })}
                />
                Đang sử dụng
              </label>
            )}
          </fieldset>
          <div className="catalog-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={discard}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canWrite}>
              {busy ? 'Đang lưu…' : 'Lưu mã hàng'}
            </button>
          </div>
        </form>
      )}

      {linkSource && (
        <form className="card catalog-form" data-erp-table-layout="content" onSubmit={saveLink}>
          <h2>Xác nhận liên kết mã</h2>
          <p>
            {linkSource.label} / {linkSource.code || '(chưa có mã)'} / {linkSource.name} / {linkSource.unit}
          </p>
          <div className="catalog-form-grid">
            <label>
              Tìm mã nội bộ
              <input
                disabled={busy}
                value={targetSearch}
                onChange={event => {
                  setTargetSearch(event.target.value);
                  setTargetId('');
                }}
              />
            </label>
            <label>
              Mã nội bộ *
              <select disabled={busy} required value={targetId} onChange={event => setTargetId(event.target.value)}>
                <option value="">Chọn mã để liên kết</option>
                {candidates.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.code} — {item.name} ({item.baseUnit})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status">
            {unitNotice || 'Hệ thống không tự ghép theo tên. Chọn đúng mã và kiểm tra quy cách trước khi xác nhận.'}
          </p>
          <div className="catalog-actions">
            <button type="button" className="btn btn-outline" disabled={busy} onClick={discard}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={!canWrite || !targetId || !validConversion}>
              Xác nhận liên kết
            </button>
          </div>
        </form>
      )}

      {!editor && !linkSource && view === 'items' && (
        <>
          <div className="erp-tab-actionbar">
            <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading || busy} onClick={() => void reload()} />
            <button className="btn btn-primary" disabled={!canWrite} onClick={() => openEditor()}>
              Tạo mã hàng
            </button>
          </div>
          <div className="catalog-toolbar">
            <label>
              Tìm kiếm
              <input
                placeholder="Mã, tên hoặc quy cách…"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
            </label>
            <label>
              Nhóm
              <select value={kind} onChange={event => setKind(event.target.value)}>
                <option value="">Tất cả nhóm</option>
                {Object.entries(CATALOG_KINDS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trạng thái
              <select value={activeFilter} onChange={event => setActiveFilter(event.target.value)}>
                <option value="active">Đang sử dụng</option>
                <option value="inactive">Ngừng sử dụng</option>
                <option value="">Tất cả</option>
              </select>
            </label>
          </div>
          <div className="card catalog-list-frame">
            <div className="table-container erp-primary-data-table">
              <table data-resize-key="item-catalog-list">
                <thead>
                  <tr>
                    <th>Mã nội bộ</th>
                    <th>Tên hàng</th>
                    <th>Nhóm</th>
                    <th>ĐVT cơ sở</th>
                    <th>Quy đổi</th>
                    <th>Quy cách</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {itemPages.rows.map(item => (
                    <tr key={item.id}>
                      <td title={item.code}>{item.code}</td>
                      <td title={item.name}>{item.name}</td>
                      <td>{CATALOG_KINDS[item.kind]}</td>
                      <td>{item.baseUnit}</td>
                      <td
                        title={item.conversions
                          .map(entry => `1 ${entry.unit} = ${entry.factor} ${item.baseUnit}`)
                          .join('; ')}
                      >
                        {item.conversions.map(entry => `${entry.unit}: ${entry.factor}`).join('; ') || '—'}
                      </td>
                      <td title={item.notes}>{item.notes || '—'}</td>
                      <td>{item.active ? 'Đang sử dụng' : 'Ngừng sử dụng'}</td>
                      <td>
                        <RowActionMenu
                          label={`Thao tác ${item.code}`}
                          actions={[{ label: 'Cập nhật', onSelect: () => openEditor(item), disabled: !canWrite }]}
                        />
                      </td>
                    </tr>
                  ))}
                  {!loading && !visibleItems.length && (
                    <tr>
                      <td colSpan={8}>
                        {!loaded
                          ? 'Chưa tải được dữ liệu.'
                          : data.items.length
                            ? 'Không có kết quả phù hợp.'
                            : 'Chưa có mã nội bộ. Tạo mã mới, nhập CSV hoặc liên kết dữ liệu cũ.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...itemPages.paginationProps} />
          </div>
        </>
      )}

      {!editor && !linkSource && view === 'legacy' && (
        <>
          <div className="catalog-toolbar">
            <label>
              Nguồn dữ liệu
              <select
                disabled={sourceLoading || busy}
                value={sourceType}
                onChange={event => {
                  resetSources();
                  setSourceType(event.target.value as CatalogSourceRef['type']);
                  setError('');
                }}
              >
                {Object.entries(sourceTypes).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tìm kiếm
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Khách, đơn hàng, mã hoặc tên…"
              />
            </label>
            <label className="catalog-check">
              <input type="checkbox" checked={onlyUnlinked} onChange={event => setOnlyUnlinked(event.target.checked)} />
              Chỉ dòng cần xử lý
            </label>
            <button
              className="btn btn-outline"
              disabled={busy || sourceLoading}
              onClick={() => {
                resetSources();
                setSourceRefresh(value => value + 1);
              }}
            >
              Tải lại nguồn
            </button>
          </div>
          <p>
            Chọn từng dòng để tạo mã riêng hoặc liên kết vào mã đã có. Hai khách cùng mã không tự được gộp. Liên kết
            không sửa đơn hàng, LSX, sản phẩm khách hoặc số tồn.
          </p>
          {sourceLoading && <p role="status">Đang đọc dữ liệu nguồn…</p>}
          <div className="card catalog-list-frame">
            <div className="table-container erp-primary-data-table">
              <table data-resize-key="catalog-legacy-list">
                <thead>
                  <tr>
                    <th>Hồ sơ nguồn</th>
                    <th>Mã hiện tại</th>
                    <th>Tên hàng</th>
                    <th>ĐVT</th>
                    <th>Mã nội bộ</th>
                    <th>Đối chiếu</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {sourcePages.rows.map((source, index) => {
                    const resolved = resolveCatalogSource(source, data.links, data.items);
                    return (
                      <tr key={`${source.key}-${index}`}>
                        <td title={source.label}>{source.label}</td>
                        <td title={source.code}>{source.code || '—'}</td>
                        <td title={source.name}>{source.name || '—'}</td>
                        <td>{source.unit || '—'}</td>
                        <td>{resolved.item?.code || '—'}</td>
                        <td title={source.problem || linkLabels[resolved.status]}>
                          {source.problem || linkLabels[resolved.status]}
                        </td>
                        <td>
                          <RowActionMenu
                            label={`Liên kết ${source.name}`}
                            actions={[
                              {
                                label: 'Liên kết mã có sẵn',
                                disabled: !canWrite || Boolean(source.problem),
                                onSelect: () => {
                                  setLinkSource(source);
                                  setTargetId('');
                                  setTargetSearch('');
                                  setError('');
                                }
                              },
                              {
                                label: 'Tạo mã từ dòng này',
                                disabled: !canWrite || Boolean(source.problem),
                                onSelect: () => openEditor(undefined, source)
                              }
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {!sourceLoading && !visibleSources.length && (
                    <tr>
                      <td colSpan={7}>
                        {!sourceLoaded
                          ? 'Chưa tải được nguồn. Hãy tải lại.'
                          : sources.length
                            ? 'Không còn dòng cần xử lý hoặc không có kết quả phù hợp.'
                            : 'Nguồn chưa có dữ liệu.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <DataTablePagination {...sourcePages.paginationProps} />
          </div>
        </>
      )}

      {view === 'import' && (
        <div className="card catalog-form" data-erp-table-layout="content">
          <h2>Nhập danh mục từ CSV</h2>
          <p>
            Lưu bảng Excel thành CSV UTF-8 theo tệp mẫu, tối đa 50 dòng mỗi đợt. Chỉ tạo mã mới; không ghi đè mã có sẵn
            và không nhập số tồn hoặc công nợ.
          </p>
          <p>
            Cột kind: raw_material = nguyên vật liệu; finished_good = thành phẩm; resale = hàng mua bán lại. Cột
            conversions: cuộn:1000 nghĩa là 1 cuộn bằng 1.000 ĐVT cơ sở của riêng mã đó; ngăn các quy đổi bằng dấu |.
          </p>
          <div className="catalog-actions">
            <button type="button" className="btn btn-outline" onClick={downloadTemplate}>
              Tải tệp mẫu
            </button>
            <label>
              Chọn CSV
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={!canWrite}
                onChange={event => void readFile(event.target.files?.[0])}
              />
            </label>
          </div>
          {fileName && (
            <p>
              {fileName} — {preview.length} dòng; {preview.filter(row => row.error).length} dòng lỗi.
            </p>
          )}
          {preview.length > 0 && (
            <>
              <div className="table-container catalog-inline-table">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      <th>Mã</th>
                      <th>Tên</th>
                      <th>Nhóm</th>
                      <th>ĐVT</th>
                      <th>Kết quả kiểm tra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map(row => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td title={row.input.code}>{row.input.code}</td>
                        <td title={row.input.name}>{row.input.name}</td>
                        <td>{CATALOG_KINDS[row.input.kind] || row.input.kind}</td>
                        <td>{row.input.baseUnit}</td>
                        <td title={row.error || 'Hợp lệ'}>{row.error || 'Hợp lệ'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="catalog-actions">
                <button className="btn btn-outline" disabled={busy} onClick={discard}>
                  Bỏ tệp
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!canWrite || preview.some(row => row.error)}
                  onClick={() => {
                    if (window.confirm(`Xác nhận tạo ${preview.length} mã mới? Dữ liệu hiện có sẽ được giữ nguyên.`))
                      void execute({ action: 'import', items: importRows }, () => {
                        setImportRows([]);
                        setFileName('');
                      });
                  }}
                >
                  Xác nhận nhập {preview.length} mã
                </button>
              </div>
            </>
          )}
          <h2>Các đợt nhập đã ghi nhận</h2>
          {data.imports.length ? (
            <ul>
              {data.imports
                .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 10)
                .map(entry => (
                  <li key={entry.id}>
                    {formatDateTime(entry.createdAt)} — {entry.actorName}: {entry.count} mã. Mã đợt: {entry.id}
                  </li>
                ))}
            </ul>
          ) : (
            <p>Chưa có đợt nhập CSV.</p>
          )}
        </div>
      )}
      <datalist id="catalog-units">
        {['cái', 'tem', 'cuộn', 'tờ', 'm', 'm²', 'kg', 'g', 'hộp', 'bộ'].map(unit => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </section>
  );
}
