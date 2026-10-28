import { LoadingStatus } from '@/components/LoadingStates';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { stockAlert } from '@/features/accounting/model/operationalReports';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import {
  loadItemCatalog,
  loadLegacyCatalogSources,
  mutateItemCatalog
} from '@/features/catalog/api/itemCatalogService';
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
} from '@/features/catalog/model/itemCatalog';
import { confirmAppNavigation, registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { loadWarehouse, mutateWarehouse } from '../api/warehouseService';
import { loadFinishedGoods } from '../api/finishedGoodsService';
import {
  canPostWarehouse,
  canReadWarehouse,
  roundStock,
  stockNumber,
  warehouseSummary,
  warehouseDate,
  WAREHOUSE_KINDS,
  type WarehouseBalance,
  type WarehouseCustomerUsage,
  type WarehouseData,
  type WarehouseKind,
  type WarehouseVoucher
} from '../model/warehouse';
import { GOODS_KINDS, type GoodsData, type GoodsVoucher } from '../model/finishedGoods';
import { WarehouseVoucherDialog } from '../components/WarehouseVoucherDialog';
import { GoodsVoucherDialog, type GoodsDialogOptions } from '../components/GoodsVoucherDialog';
import '../components/Warehouse.css';

const empty: WarehouseData = {
  items: [],
  balances: [],
  vouchers: [],
  sources: [],
  progress: [],
  legacyInventory: [],
  legacyExports: [],
  itemUsers: {}
};
const emptyGoods: GoodsData = {
  items: [],
  balances: [],
  vouchers: [],
  orderStates: [],
  sourceStates: [],
  dispatchStates: [],
  orders: [],
  sources: [],
  trips: []
};
const tabNames = {
  catalog: 'Danh mục vật tư',
  vouchers: 'Phiếu kho'
};
const voucherViewNames = {
  list: 'Danh sách phiếu',
  report: 'Nhập xuất tồn',
  legacy: 'Dữ liệu cũ'
};
const itemKindLabels: Record<CatalogKind, string> = {
  raw_material: 'NVL',
  finished_good: 'Thành phẩm',
  resale: 'Hàng mua'
};
export interface UnifiedStockRow extends WarehouseBalance {
  catalogItemId: string;
  warehouseId: 'raw_main' | 'finished_main';
  itemKind: CatalogKind;
  surplusQuantity: number;
  conversions: { unit: string; factor: number }[];
  notes: string;
  active: boolean;
  catalogRevision: number;
  linksCount: number;
  users: WarehouseCustomerUsage[];
}
type UnifiedVoucher = (WarehouseVoucher | GoodsVoucher) & { warehouseId: 'raw_main' | 'finished_main' };

const shortKindLabel = (voucher: UnifiedVoucher): { label: string; tone: string } => {
  if (voucher.kind === 'reversal') return { label: 'Đảo phiếu', tone: 'danger' };
  if (voucher.warehouseId === 'raw_main') {
    if (voucher.kind === 'purchase_receipt') return { label: 'Nhập mua', tone: 'info' };
    if (voucher.kind === 'production_issue') return { label: 'Cấp LSX', tone: 'warn' };
    if (voucher.kind === 'production_return') return { label: 'Hoàn LSX', tone: 'purple' };
    return { label: WAREHOUSE_KINDS[voucher.kind as WarehouseKind] || voucher.kind, tone: 'neutral' };
  }
  if (voucher.kind === 'production_receipt') return { label: 'Nhập TP từ QC', tone: 'ok' };
  if (voucher.kind === 'production_surplus_receipt') return { label: 'Nhập dư', tone: 'purple' };
  if (voucher.kind === 'purchase_receipt') return { label: 'Nhập mua', tone: 'info' };
  return { label: GOODS_KINDS[voucher.kind as keyof typeof GOODS_KINDS] || voucher.kind, tone: 'neutral' };
};

export function Inventory({ currentUser, onRefresh }: { currentUser: UserProfile; onRefresh: () => void }) {
  const [data, setData] = useState(empty);
  const [goodsData, setGoodsData] = useState(emptyGoods);
  const [catalogMeta, setCatalogMeta] = useState<{ items: CatalogItem[]; links: CatalogLink[] }>({
    items: [],
    links: []
  });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<keyof typeof tabNames>('catalog');
  const [voucherView, setVoucherView] = useState<keyof typeof voucherViewNames>('list');
  const [search, setSearch] = useState('');
  const [itemKindFilter, setItemKindFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(warehouseDate());
  const [reportScope, setReportScope] = useState<'raw_main' | 'finished_main'>('raw_main');
  const [legacyScope, setLegacyScope] = useState<'legacy_inventory' | 'legacy_exports'>('legacy_inventory');
  const [creating, setCreating] = useState(false);
  const [creatingKind, setCreatingKind] = useState<Exclude<WarehouseKind, 'reversal'>>('purchase_receipt');
  const [goodsOptions, setGoodsOptions] = useState<GoodsDialogOptions | null>(null);
  const [voucherMenuOpen, setVoucherMenuOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedVoucher | null>(null);
  const [reversal, setReversal] = useState<WarehouseVoucher | null>(null);
  const [stock, setStock] = useState<UnifiedStockRow | null>(null);
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [creatingCatalogItem, setCreatingCatalogItem] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [legacyLinkModalOpen, setLegacyLinkModalOpen] = useState(false);
  const permitted = canReadWarehouse(currentUser);
  const canManageCatalog = canManageItemCatalog(currentUser);
  const canWrite = canPostWarehouse(currentUser) && loaded && !loading;
  const canWriteCatalog = canManageCatalog && isFirebaseRuntimeEnabled && loaded && !loading;

  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void Promise.all([
      loadWarehouse(),
      loadFinishedGoods().catch(() => emptyGoods),
      canManageCatalog ? loadItemCatalog().catch(() => ({ items: [], links: [], imports: [] })) : Promise.resolve(null)
    ])
      .then(([nextRaw, nextGoods, nextCatalog]) => {
        if (!cancelled) {
          setData(nextRaw);
          setGoodsData(nextGoods);
          if (nextCatalog) setCatalogMeta({ items: nextCatalog.items, links: nextCatalog.links });
          setLoaded(true);
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được sổ kho.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permitted, canManageCatalog, refresh]);

  const reload = () => {
    setLoaded(false);
    setLoading(true);
    setRefresh(value => value + 1);
  };
  const saved = () => {
    setCreating(false);
    setGoodsOptions(null);
    setReversal(null);
    setCreatingCatalogItem(false);
    setEditingCatalogItem(null);
    setCsvModalOpen(false);
    setLegacyLinkModalOpen(false);
    reload();
    onRefresh();
  };

  const allVouchers: UnifiedVoucher[] = [
    ...data.vouchers.map(v => ({ ...v, warehouseId: 'raw_main' as const })),
    ...goodsData.vouchers.map(v => ({ ...v, warehouseId: 'finished_main' as const }))
  ];

  const surplusByItem = new Map<string, number>();
  for (const voucher of allVouchers) {
    if (voucher.reversedBy || (voucher.kind !== 'production_return' && voucher.kind !== 'production_surplus_receipt'))
      continue;
    for (const line of voucher.lines) {
      if (line.delta > 0) {
        surplusByItem.set(line.catalogItemId, roundStock((surplusByItem.get(line.catalogItemId) || 0) + line.delta));
      }
    }
  }

  const catalogById = new Map<string, CatalogItem>();
  for (const item of [...data.items, ...goodsData.items, ...catalogMeta.items]) {
    catalogById.set(item.id, item);
  }

  const balances: UnifiedStockRow[] = [...catalogById.values()]
    .map(item => {
      const itemKind: CatalogKind = (item.kind as CatalogKind) || 'raw_material';
      const isRaw = itemKind === 'raw_material';
      const warehouseId: 'raw_main' | 'finished_main' = isRaw ? 'raw_main' : 'finished_main';
      const found = isRaw
        ? data.balances.find(balance => balance.id === item.id)
        : goodsData.balances.find(balance => balance.catalogItemId === item.id);
      const quantity = found?.quantity || 0;
      const rawSurplus = surplusByItem.get(item.id) || 0;
      const surplusQuantity = quantity > 0 ? Math.min(quantity, rawSurplus) : 0;
      return {
        id: item.id,
        catalogItemId: item.id,
        warehouseId,
        itemKind,
        code: item.code,
        name: item.name,
        unit: item.baseUnit,
        quantity,
        surplusQuantity,
        minQuantity: found?.minQuantity ?? null,
        revision: found?.revision || 0,
        updatedAt: found?.updatedAt || '',
        conversions: Array.isArray(item.conversions) ? item.conversions : [],
        notes: item.notes || '',
        active: item.active !== false,
        catalogRevision: item.revision || 1,
        linksCount: catalogMeta.links.filter(link => link.catalogItemId === item.id).length,
        users: data.itemUsers?.[item.id] || []
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

  const needle = search.trim().toLocaleLowerCase('vi');
  const matches = (...values: unknown[]) => values.join(' ').toLocaleLowerCase('vi').includes(needle);

  const balancePages = useDataTablePagination(
    balances.filter(row => {
      const alertStatus = stockAlert(row.quantity, row.minQuantity);
      const matchesAlert =
        !alertFilter ||
        (alertFilter === 'surplus'
          ? row.surplusQuantity > 0
          : alertFilter === 'inactive'
            ? !row.active
            : alertStatus === alertFilter);
      return (
        matches(row.code, row.name, row.users.map(u => u.customerName).join(' ')) &&
        (!itemKindFilter || row.itemKind === itemKindFilter) &&
        matchesAlert
      );
    })
  );

  const voucherPages = useDataTablePagination(
    allVouchers
      .filter(
        row =>
          (!warehouseFilter || row.warehouseId === warehouseFilter) &&
          (!kind || row.kind === kind) &&
          (!from || row.postingDate >= from) &&
          (!to || row.postingDate <= to) &&
          matches(
            row.code,
            row.sourceCode,
            row.customerName || '',
            row.actorName,
            row.lines.map(line => line.code).join(' ')
          )
      )
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  );

  const reportVouchers =
    reportScope === 'finished_main'
      ? goodsData.vouchers.map(voucher => ({ ...voucher, lines: voucher.lines.filter(line => line.delta !== 0) }))
      : data.vouchers;
  const reportPages = useDataTablePagination(
    from && to && from <= to
      ? warehouseSummary(reportVouchers, from, to).filter(row => matches(row.code, row.name))
      : []
  );
  const legacyPages = useDataTablePagination(
    (legacyScope === 'legacy_inventory' ? data.legacyInventory : data.legacyExports).filter(row =>
      matches(row.materialName, row.exportCode, row.receiverName)
    )
  );

  const pagination =
    tab === 'catalog'
      ? balancePages
      : voucherView === 'list'
        ? voucherPages
        : voucherView === 'report'
          ? reportPages
          : legacyPages;

  const activeStock = stock
    ? balances.find(row => row.id === stock.id && row.warehouseId === stock.warehouseId) || stock
    : null;

  const toggleCatalogActive = async (row: UnifiedStockRow) => {
    const targetItem = catalogById.get(row.id);
    if (!targetItem || !canWriteCatalog) return;
    const nextActive = !row.active;
    if (
      !window.confirm(
        nextActive
          ? `Kích hoạt lại mã vật tư ${row.code}?`
          : `Ngừng sử dụng mã vật tư ${row.code}? Lịch sử phiếu kho vẫn được giữ nguyên.`
      )
    )
      return;
    try {
      await mutateItemCatalog({
        action: 'update',
        id: targetItem.id,
        expectedRevision: targetItem.revision,
        active: nextActive,
        item: {
          code: targetItem.code,
          name: targetItem.name,
          kind: targetItem.kind,
          baseUnit: targetItem.baseUnit,
          conversions: targetItem.conversions || [],
          notes: targetItem.notes || ''
        },
        requestId: crypto.randomUUID()
      });
      showSuccessToast(nextActive ? 'Đã kích hoạt lại mã vật tư' : 'Đã ngừng sử dụng mã vật tư');
      reload();
      onRefresh();
    } catch (cause) {
      showErrorToast(cause instanceof Error ? cause.message : 'Không cập nhật được trạng thái mã.');
    }
  };

  if (!permitted) return <p role="alert">Bạn không có quyền xem Kho vật tư.</p>;

  return (
    <div className="inventory-view warehouse-workspace" data-erp-table-text="single-line">
      <PageContextHeader section="Kho vật tư" current={tabNames[tab]} />
      <nav className="content-tabs" aria-label="Kho vật tư" role="tablist">
        {Object.entries(tabNames).map(([key, name]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => {
              if (confirmAppNavigation()) {
                setTab(key as typeof tab);
                setSearch('');
                setVoucherMenuOpen(false);
              }
            }}
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === 'vouchers' && (
        <div className="warehouse-subtabs" role="tablist" aria-label="Chế độ xem phiếu kho">
          {Object.entries(voucherViewNames).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={voucherView === key}
              className={voucherView === key ? 'active' : ''}
              onClick={() => {
                setVoucherView(key as typeof voucherView);
                setSearch('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="warehouse-toolbar">
        <input
          aria-label="Tìm kiếm kho"
          type="search"
          placeholder={
            tab === 'catalog'
              ? 'Tìm theo mã / tên / khách hàng…'
              : voucherView === 'list'
                ? 'Tìm số phiếu, LSX, PO…'
                : 'Tìm mã hoặc tên vật tư…'
          }
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        {tab === 'catalog' && (
          <>
            <select
              aria-label="Loại vật tư"
              value={itemKindFilter}
              onChange={event => setItemKindFilter(event.target.value)}
            >
              <option value="">Tất cả loại (NVL, Thành phẩm, Hàng mua)</option>
              <option value="raw_material">NVL</option>
              <option value="finished_good">Thành phẩm</option>
              <option value="resale">Hàng mua</option>
            </select>
            <select
              aria-label="Cảnh báo tồn"
              value={alertFilter}
              onChange={event => setAlertFilter(event.target.value)}
            >
              <option value="">Tất cả cảnh báo (dưới ngưỡng, tồn âm, có tồn dư…)</option>
              <option value="Cần nhập hàng">Dưới ngưỡng (Cần nhập hàng)</option>
              <option value="Tồn âm">Tồn âm</option>
              <option value="surplus">Có tồn dư</option>
              <option value="Chưa thiết lập ngưỡng">Chưa thiết lập ngưỡng</option>
              <option value="Trong ngưỡng">Bình thường (Trong ngưỡng)</option>
              <option value="inactive">Ngừng sử dụng</option>
            </select>
            <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
            {canManageCatalog && (
              <div className="warehouse-toolbar-end">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!canWriteCatalog}
                  onClick={() => setLegacyLinkModalOpen(true)}
                >
                  Liên kết dữ liệu cũ
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={!canWriteCatalog}
                  onClick={() => setCsvModalOpen(true)}
                >
                  Nhập CSV
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canWriteCatalog}
                  onClick={() => {
                    setEditingCatalogItem(null);
                    setCreatingCatalogItem(true);
                  }}
                >
                  + Thêm vật tư
                </button>
              </div>
            )}
          </>
        )}
        {tab === 'vouchers' && voucherView === 'list' && (
          <>
            <select aria-label="Loại phiếu" value={kind} onChange={event => setKind(event.target.value)}>
              <option value="">Tất cả loại phiếu (Nhập mua, Cấp LSX, Hoàn LSX…)</option>
              <optgroup label="Kho NVL">
                {Object.entries(WAREHOUSE_KINDS).map(([key, label]) => (
                  <option key={`raw-${key}`} value={key}>
                    {label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Kho Thành phẩm">
                {Object.entries(GOODS_KINDS)
                  .filter(([key]) => key !== 'reversal')
                  .map(([key, label]) => (
                    <option key={`fg-${key}`} value={key}>
                      {label}
                    </option>
                  ))}
              </optgroup>
            </select>
            <select aria-label="Kho" value={warehouseFilter} onChange={event => setWarehouseFilter(event.target.value)}>
              <option value="">Tất cả kho (NVL, TP)</option>
              <option value="raw_main">Kho NVL</option>
              <option value="finished_main">Kho Thành phẩm</option>
            </select>
            <label>
              Từ ngày
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={to} onChange={event => setTo(event.target.value)} />
            </label>
          </>
        )}
        {tab === 'vouchers' && voucherView === 'report' && (
          <>
            <select
              aria-label="Loại báo cáo"
              value={reportScope}
              onChange={event => setReportScope(event.target.value as typeof reportScope)}
            >
              <option value="raw_main">Nhập xuất tồn kho NVL</option>
              <option value="finished_main">Nhập xuất tồn thành phẩm</option>
            </select>
            <label>
              Từ ngày
              <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={to} onChange={event => setTo(event.target.value)} />
            </label>
          </>
        )}
        {tab === 'vouchers' && voucherView === 'legacy' && (
          <select
            aria-label="Loại dữ liệu cũ"
            value={legacyScope}
            onChange={event => setLegacyScope(event.target.value as typeof legacyScope)}
          >
            <option value="legacy_inventory">Dữ liệu cũ — Tồn kho cũ</option>
            <option value="legacy_exports">Dữ liệu cũ — Phiếu xuất cũ</option>
          </select>
        )}
        {tab === 'vouchers' && (
          <>
            <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
            {canPostWarehouse(currentUser) && voucherView !== 'legacy' && (
              <div className="warehouse-menu-wrap warehouse-toolbar-end">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canWrite}
                  onClick={() => setVoucherMenuOpen(open => !open)}
                >
                  + Lập phiếu kho
                </button>
                {voucherMenuOpen && (
                  <div className="warehouse-action-menu" role="menu" aria-label="Chọn loại phiếu kho">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setCreatingKind('purchase_receipt');
                        setCreating(true);
                      }}
                    >
                      Nhập mua NVL
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setCreatingKind('production_issue');
                        setCreating(true);
                      }}
                    >
                      Cấp NVL cho LSX
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setCreatingKind('production_return');
                        setCreating(true);
                      }}
                    >
                      Hoàn NVL từ LSX
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setGoodsOptions({ kind: 'production_receipt' });
                      }}
                    >
                      Nhập thành phẩm từ QC
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setGoodsOptions({ kind: 'production_surplus_receipt' });
                      }}
                    >
                      Nhập thành phẩm dư từ SX
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setVoucherMenuOpen(false);
                        setGoodsOptions({ kind: 'purchase_receipt' });
                      }}
                    >
                      Nhập hàng mua / gia công
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      <LoadingStatus loading={loading} hasData={data !== empty} label="Đang tải sổ kho" />
      {tab === 'vouchers' && voucherView === 'legacy' ? (
        <p className="warehouse-note">Dữ liệu cũ chỉ để đối soát, chưa chuyển thành tồn đầu kỳ của sổ mới.</p>
      ) : (
        <p className="warehouse-note">
          Kho vật tư · Nhìn toàn bộ vật tư, tồn dư và khách hàng đang dùng trên một bảng; chứng từ nhập xuất và báo cáo
          tại tab Phiếu kho.
        </p>
      )}
      {tab === 'vouchers' && voucherView === 'report' && (!from || !to || from > to) && (
        <p role="alert" className="warehouse-error">
          Chọn khoảng ngày hợp lệ.
        </p>
      )}

      <div className={`warehouse-split-layout ${tab === 'catalog' && activeStock ? 'has-panel' : ''}`}>
        <div className="warehouse-list-frame">
          <div className="table-container erp-primary-data-table">
            <table data-resize-key={`warehouse-${tab}-${voucherView}-${reportScope}`} className="warehouse-list">
              <thead>
                <tr>
                  {tab === 'catalog' ? (
                    <>
                      <th>Mã</th>
                      <th>Tên vật tư</th>
                      <th>Loại</th>
                      <th>ĐVT</th>
                      <th className="warehouse-number">Tồn</th>
                      <th className="warehouse-number">Tồn dư</th>
                      <th className="warehouse-number">Ngưỡng</th>
                      <th>Trạng thái</th>
                      <th>Khách đang dùng</th>
                      <th>Thao tác</th>
                    </>
                  ) : voucherView === 'list' ? (
                    <>
                      <th>Số phiếu</th>
                      <th>Ngày</th>
                      <th>Loại phiếu</th>
                      <th>Kho</th>
                      <th>Nguồn (LSX / PO / đơn mua)</th>
                      <th>Khách</th>
                      <th className="warehouse-number">Số dòng</th>
                      <th>Người lập</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </>
                  ) : voucherView === 'report' ? (
                    <>
                      <th>Mã vật tư</th>
                      <th>Tên vật tư</th>
                      <th>ĐVT</th>
                      <th className="warehouse-number">Đầu kỳ</th>
                      <th className="warehouse-number">Nhập</th>
                      <th className="warehouse-number">Xuất</th>
                      <th className="warehouse-number">Cuối kỳ</th>
                    </>
                  ) : legacyScope === 'legacy_inventory' ? (
                    <>
                      <th>Tên vật tư cũ</th>
                      <th>ĐVT cũ</th>
                      <th>Tồn cũ</th>
                      <th>Giữ chỗ cũ</th>
                      <th>Ngưỡng cũ</th>
                      <th>Trạng thái cũ</th>
                    </>
                  ) : (
                    <>
                      <th>Mã phiếu cũ</th>
                      <th>Ngày xuất</th>
                      <th>Người nhận</th>
                      <th>Lý do</th>
                      <th>Số dòng</th>
                      <th>Chi tiết</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {!loading &&
                  !error &&
                  tab === 'catalog' &&
                  balancePages.rows.map(row => {
                    const customerLabel = row.users.map(u => u.customerName).join(', ');
                    const alertStatus = stockAlert(row.quantity, row.minQuantity);
                    const catalogItem = catalogById.get(row.id);
                    return (
                      <tr
                        key={`${row.warehouseId}-${row.id}`}
                        className={`warehouse-row-clickable ${
                          activeStock?.id === row.id && activeStock?.warehouseId === row.warehouseId
                            ? 'warehouse-row-active'
                            : ''
                        }`}
                        onClick={event => {
                          if ((event.target as HTMLElement).closest('button, [role="menu"]')) return;
                          setStock(row);
                        }}
                      >
                        <td>{row.code}</td>
                        <td title={row.name}>{row.name}</td>
                        <td>{itemKindLabels[row.itemKind]}</td>
                        <td>{row.unit}</td>
                        <td className={`warehouse-number ${row.quantity < 0 ? 'warehouse-danger' : ''}`}>
                          {stockNumber(row.quantity)}
                        </td>
                        <td className="warehouse-number">{stockNumber(row.surplusQuantity)}</td>
                        <td className="warehouse-number">
                          {row.minQuantity === null ? 'Chưa thiết lập' : stockNumber(row.minQuantity)}
                        </td>
                        <td className={['Tồn âm', 'Cần nhập hàng'].includes(alertStatus) ? 'warehouse-danger' : ''}>
                          {!row.active ? 'Ngừng sử dụng' : alertStatus}
                        </td>
                        <td title={customerLabel}>{customerLabel || '--'}</td>
                        <td>
                          <RowActionMenu
                            label={`Thao tác ${row.code}`}
                            actions={[
                              { label: 'Xem thẻ vật tư', onSelect: () => setStock(row) },
                              ...(canWrite ? [{ label: 'Thiết lập ngưỡng', onSelect: () => setStock(row) }] : []),
                              ...(canManageCatalog && catalogItem
                                ? [
                                    {
                                      label: 'Sửa mã',
                                      disabled: !canWriteCatalog,
                                      onSelect: () => {
                                        setEditingCatalogItem(catalogItem);
                                        setCreatingCatalogItem(false);
                                      }
                                    },
                                    {
                                      label: row.active ? 'Ngừng sử dụng' : 'Kích hoạt lại',
                                      disabled: !canWriteCatalog,
                                      onSelect: () => void toggleCatalogActive(row)
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                {!loading &&
                  !error &&
                  tab === 'vouchers' &&
                  voucherView === 'list' &&
                  voucherPages.rows.map(row => {
                    const isFinished = row.warehouseId === 'finished_main';
                    const kindMeta = shortKindLabel(row);
                    const fullKindLabel = isFinished
                      ? GOODS_KINDS[row.kind as keyof typeof GOODS_KINDS]
                      : WAREHOUSE_KINDS[row.kind as WarehouseKind];
                    const statusLabel = row.reversedBy ? 'Đã đảo' : row.kind === 'reversal' ? 'Phiếu đảo' : 'Đã ghi sổ';
                    const statusTone = row.reversedBy ? 'danger' : row.kind === 'reversal' ? 'warn' : 'ok';
                    return (
                      <tr key={`${row.warehouseId}-${row.id}`}>
                        <td>{row.code}</td>
                        <td>{formatDateTime(row.postedAt) || row.postingDate}</td>
                        <td title={fullKindLabel}>
                          <span className={`warehouse-pill warehouse-pill--${kindMeta.tone}`}>{kindMeta.label}</span>
                        </td>
                        <td>{isFinished ? 'Kho Thành phẩm' : 'Kho NVL'}</td>
                        <td title={row.sourceCode}>{row.sourceCode}</td>
                        <td title={row.customerName || '--'}>{row.customerName || '--'}</td>
                        <td className="warehouse-number">{row.lines.length}</td>
                        <td>{row.actorName}</td>
                        <td>
                          <span className={`warehouse-pill warehouse-pill--${statusTone}`}>{statusLabel}</span>
                        </td>
                        <td>
                          <RowActionMenu
                            label={`Thao tác ${row.code}`}
                            actions={[
                              { label: 'Chi tiết', onSelect: () => setSelected(row) },
                              ...(currentUser.role === 'admin' && !row.reversedBy && row.kind !== 'reversal'
                                ? [
                                    {
                                      label: 'Đảo phiếu',
                                      disabled: !canWrite,
                                      onSelect: () =>
                                        isFinished
                                          ? setGoodsOptions({
                                              kind: row.kind as GoodsDialogOptions['kind'],
                                              reversal: row as GoodsVoucher
                                            })
                                          : setReversal(row as WarehouseVoucher)
                                    }
                                  ]
                                : [])
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                {!loading &&
                  !error &&
                  tab === 'vouchers' &&
                  voucherView === 'report' &&
                  reportPages.rows.map(row => (
                    <tr key={row.code}>
                      <td>{row.code}</td>
                      <td title={row.name}>{row.name}</td>
                      <td>{row.unit}</td>
                      {[row.opening, row.incoming, row.outgoing, row.closing].map((value, index) => (
                        <td className="warehouse-number" key={index}>
                          {stockNumber(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  !error &&
                  tab === 'vouchers' &&
                  voucherView === 'legacy' &&
                  legacyPages.rows.map(row => (
                    <tr key={String(row.id)}>
                      {legacyScope === 'legacy_inventory' ? (
                        <>
                          <td title={String(row.materialName || '')}>{String(row.materialName || '')}</td>
                          <td>{String(row.unit || '')}</td>
                          <td>{String(row.qtyInStock ?? '')}</td>
                          <td>{String(row.qtyReserved ?? '')}</td>
                          <td>{String(row.minQtyAlert ?? '')}</td>
                          <td>{row.deleted ? 'Đã xóa cũ' : 'Dữ liệu cũ'}</td>
                        </>
                      ) : (
                        <>
                          <td>{String(row.exportCode || row.id)}</td>
                          <td>{formatDateTime(String(row.createdAt || row.exportDate || ''))}</td>
                          <td>{String(row.receiverName || '')}</td>
                          <td title={String(row.reason || '')}>{String(row.reason || '')}</td>
                          <td>{Array.isArray(row.items) ? row.items.length : 0}</td>
                          <td title={JSON.stringify(row.items || [])}>{JSON.stringify(row.items || [])}</td>
                        </>
                      )}
                    </tr>
                  ))}
                {!loading && !error && pagination.paginationProps.totalItems === 0 && (
                  <tr>
                    <td colSpan={10}>{search ? 'Không có kết quả phù hợp.' : 'Chưa có dữ liệu.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...pagination.paginationProps} />
        </div>
        {tab === 'catalog' && activeStock && (
          <StockDetails
            key={`${activeStock.warehouseId}-${activeStock.id}`}
            stock={activeStock}
            currentUser={currentUser}
            vouchers={allVouchers.filter(
              voucher =>
                voucher.warehouseId === activeStock.warehouseId &&
                voucher.lines.some(line => line.catalogItemId === activeStock.catalogItemId)
            )}
            onEditCatalog={
              canManageCatalog && catalogById.has(activeStock.id)
                ? () => {
                    setEditingCatalogItem(catalogById.get(activeStock.id)!);
                    setCreatingCatalogItem(false);
                  }
                : undefined
            }
            onClose={() => setStock(null)}
            onSaved={() => {
              reload();
            }}
          />
        )}
      </div>

      {(creating || reversal) && (
        <WarehouseVoucherDialog
          currentUser={currentUser}
          initialKind={creatingKind}
          reversal={reversal || undefined}
          onClose={() => {
            setCreating(false);
            setReversal(null);
          }}
          onSaved={saved}
        />
      )}
      {goodsOptions && (
        <GoodsVoucherDialog
          currentUser={currentUser}
          options={goodsOptions}
          onClose={() => setGoodsOptions(null)}
          onSaved={saved}
        />
      )}
      {selected && <VoucherDetails voucher={selected} vouchers={allVouchers} onClose={() => setSelected(null)} />}
      {(creatingCatalogItem || editingCatalogItem) && (
        <CatalogItemDialog
          previous={editingCatalogItem || undefined}
          onClose={() => {
            setCreatingCatalogItem(false);
            setEditingCatalogItem(null);
          }}
          onSaved={saved}
        />
      )}
      {csvModalOpen && (
        <CatalogCsvDialog
          existingItems={[...catalogById.values()]}
          onClose={() => setCsvModalOpen(false)}
          onSaved={saved}
        />
      )}
      {legacyLinkModalOpen && (
        <CatalogLegacyLinkDialog
          items={[...catalogById.values()]}
          links={catalogMeta.links}
          onClose={() => setLegacyLinkModalOpen(false)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function VoucherDetails({
  voucher,
  vouchers,
  onClose
}: {
  voucher: UnifiedVoucher;
  vouchers: UnifiedVoucher[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const related = vouchers.find(
    row => row.warehouseId === voucher.warehouseId && row.id === (voucher.reversalOf || voucher.reversedBy)
  );
  const isFinished = voucher.warehouseId === 'finished_main';
  const kindLabel = isFinished
    ? GOODS_KINDS[voucher.kind as keyof typeof GOODS_KINDS]
    : WAREHOUSE_KINDS[voucher.kind as WarehouseKind];
  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="warehouse-detail-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="warehouse-detail-title">{voucher.code}</h2>
        <button className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
      </header>
      <p>
        {kindLabel} · {voucher.sourceCode} · {isFinished ? 'Kho Thành phẩm' : 'Kho NVL'}
        {voucher.customerName ? ` · Khách: ${voucher.customerName}` : ''}
      </p>
      <p>
        {formatDateTime(voucher.postedAt)} · {voucher.actorName}
      </p>
      <p>{voucher.note}</p>
      {'negativeReason' in voucher && voucher.negativeReason && (
        <p className="warehouse-danger">Xuất âm: {voucher.negativeReason}</p>
      )}
      {related && <p>Phiếu liên quan: {related.code}</p>}
      <div className="warehouse-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã vật tư</th>
              <th>Tên vật tư</th>
              <th>SL nguồn</th>
              <th>ĐVT nguồn</th>
              <th>Hệ số</th>
              <th>Tăng / giảm</th>
              <th>ĐVT cơ sở</th>
            </tr>
          </thead>
          <tbody>
            {voucher.lines.map(line => (
              <tr key={line.sourceLine}>
                <td>{line.code}</td>
                <td title={line.name}>{line.name}</td>
                <td className="warehouse-number">{stockNumber(line.quantity)}</td>
                <td>{line.unit}</td>
                <td className="warehouse-number">{stockNumber(line.factor)}</td>
                <td className="warehouse-number">{stockNumber(line.delta)}</td>
                <td>{line.baseUnit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}

function StockDetails({
  stock,
  currentUser,
  vouchers,
  onEditCatalog,
  onClose,
  onSaved
}: {
  stock: UnifiedStockRow;
  currentUser: UserProfile;
  vouchers: UnifiedVoucher[];
  onEditCatalog?: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const pending = useRef(false),
    request = useRef({ payload: '', id: '' });
  const [threshold, setThreshold] = useState(stock.minQuantity?.toString() || '');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dirty = threshold !== (stock.minQuantity?.toString() || '');
  const close = () => {
    if (!pending.current && (!dirty || window.confirm('Bỏ thay đổi ngưỡng tồn?'))) onClose();
  };
  useEffect(() => {
    if (!dirty && !busy) return;
    const unregister = registerNavigationGuard(() => !busy && window.confirm('Bỏ thay đổi ngưỡng tồn?'));
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, busy]);

  const stockSources = vouchers
    .filter(
      voucher =>
        !voucher.reversedBy &&
        (voucher.kind === 'production_return' ||
          voucher.kind === 'production_surplus_receipt' ||
          voucher.kind === 'purchase_receipt')
    )
    .flatMap(voucher =>
      voucher.lines
        .filter(line => line.catalogItemId === stock.catalogItemId && line.delta > 0)
        .map(line => ({
          id: `${voucher.id}-${line.sourceLine}`,
          voucherCode: voucher.code,
          kind: voucher.kind,
          sourceCode: voucher.sourceCode,
          customerName:
            voucher.kind === 'purchase_receipt' ? `Đơn mua ${voucher.sourceCode}` : voucher.customerName || 'Kho chung',
          rollCode: 'rollCode' in line ? line.rollCode : undefined,
          remainingMeters: 'remainingMeters' in line ? line.remainingMeters : undefined,
          delta: line.delta,
          baseUnit: line.baseUnit,
          postingDate: voucher.postingDate
        }))
    );

  const conversionsLabel = stock.conversions.length
    ? stock.conversions.map(entry => `1 ${entry.unit} = ${stockNumber(entry.factor)} ${stock.unit}`).join(' · ')
    : 'Chỉ dùng ĐVT cơ sở';

  return (
    <aside className="warehouse-stock-card" aria-labelledby="warehouse-stock-title">
      <form
        onSubmit={async event => {
          event.preventDefault();
          if (pending.current || !canPostWarehouse(currentUser)) return;
          const body = {
            action: 'threshold',
            catalogItemId: stock.catalogItemId,
            warehouseId: stock.warehouseId,
            expectedRevision: stock.revision,
            minQuantity: Number(threshold)
          };
          const payload = JSON.stringify(body);
          if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            await mutateWarehouse({ ...body, requestId: request.current.id });
            showSuccessToast('Đã lưu ngưỡng tồn');
            onSaved();
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : 'Không lưu được ngưỡng tồn.';
            setError(message);
            showErrorToast(message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <header>
          <h2 id="warehouse-stock-title">
            Thẻ vật tư · {stock.code} — {stock.name}
          </h2>
          <div className="warehouse-toolbar">
            {onEditCatalog && (
              <button type="button" className="btn btn-outline" disabled={busy} onClick={onEditCatalog}>
                Sửa mã
              </button>
            )}
            <button type="button" className="btn btn-outline" disabled={busy} onClick={close}>
              Đóng
            </button>
          </div>
        </header>

        <div className="warehouse-stock-card-section">
          <h3>Thông tin mã</h3>
          <dl className="warehouse-kv-grid">
            <div>
              <dt>Loại & ĐVT cơ sở</dt>
              <dd>
                {itemKindLabels[stock.itemKind]} · {stock.unit}
              </dd>
            </div>
            <div>
              <dt>Hệ số quy đổi</dt>
              <dd title={conversionsLabel}>{conversionsLabel}</dd>
            </div>
            <div>
              <dt>Liên kết & trạng thái</dt>
              <dd>
                {stock.active ? 'Đang sử dụng' : 'Ngừng sử dụng'} · {stock.linksCount} liên kết
              </dd>
            </div>
            <div>
              <dt>Quy cách / ghi chú</dt>
              <dd title={stock.notes || '—'}>{stock.notes || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Tồn và ngưỡng</h3>
          <p className="warehouse-stock-card-meta">
            <span>
              Tồn theo sổ: <strong>{stockNumber(stock.quantity)}</strong> {stock.unit}
            </span>
            <span>
              Tồn dư: <strong>{stockNumber(stock.surplusQuantity)}</strong> {stock.unit}
            </span>
            <span>Trạng thái: {stockAlert(stock.quantity, stock.minQuantity)}</span>
          </p>
          {error && (
            <p className="warehouse-error" role="alert">
              {error}
            </p>
          )}
          {canPostWarehouse(currentUser) && (
            <div className="warehouse-toolbar">
              <label>
                Ngưỡng tối thiểu ({stock.unit}) *
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.000001"
                  value={threshold}
                  disabled={busy}
                  onChange={event => setThreshold(event.target.value)}
                />
              </label>
              <button className="btn btn-primary" disabled={busy || !dirty}>
                {busy ? 'Đang lưu…' : 'Lưu ngưỡng tồn'}
              </button>
            </div>
          )}
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Nguồn tồn (dư từ LSX / nhập mua)</h3>
          <div className="warehouse-grid-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nguồn</th>
                  <th>Khách / Đơn mua</th>
                  <th>Cuộn / số mét</th>
                  <th>Số lượng</th>
                </tr>
              </thead>
              <tbody>
                {stockSources.map(entry => (
                  <tr key={entry.id}>
                    <td title={`${entry.sourceCode} (${entry.voucherCode})`}>{entry.sourceCode}</td>
                    <td title={entry.customerName}>{entry.customerName}</td>
                    <td>
                      {entry.rollCode || entry.remainingMeters !== undefined
                        ? [
                            entry.rollCode ? `Cuộn ${entry.rollCode}` : '',
                            entry.remainingMeters !== undefined ? `Còn ${stockNumber(entry.remainingMeters)} m` : ''
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : entry.kind === 'purchase_receipt'
                          ? 'Nhập mua'
                          : '—'}
                    </td>
                    <td className="warehouse-number">
                      {stockNumber(entry.delta)} {entry.baseUnit}
                    </td>
                  </tr>
                ))}
                {!stockSources.length && (
                  <tr>
                    <td colSpan={4}>Chưa có nguồn tồn dư hoặc phiếu nhập mua.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Khách đang dùng</h3>
          <div className="warehouse-grid-scroll">
            <table>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Nguồn ghi nhận</th>
                </tr>
              </thead>
              <tbody>
                {stock.users.map(usage => (
                  <tr key={`${usage.customerId}-${usage.customerName}`}>
                    <td title={usage.customerName}>{usage.customerName}</td>
                    <td title={usage.sources.join(', ')}>{usage.sources.join(', ')}</td>
                  </tr>
                ))}
                {!stock.users.length && (
                  <tr>
                    <td colSpan={2}>Chưa có khách hàng dùng mã vật tư này.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Thẻ kho (lịch sử nhập xuất gần nhất)</h3>
          <div className="warehouse-grid-scroll">
            <table>
              <thead>
                <tr>
                  <th>Số phiếu</th>
                  <th>Nguồn</th>
                  <th>Ngày</th>
                  <th>Tăng / giảm</th>
                </tr>
              </thead>
              <tbody>
                {vouchers
                  .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
                  .map(voucher => (
                    <tr key={voucher.id}>
                      <td>{voucher.code}</td>
                      <td title={voucher.sourceCode}>{voucher.sourceCode}</td>
                      <td>{voucher.postingDate}</td>
                      <td className="warehouse-number">
                        {stockNumber(
                          voucher.lines
                            .filter(line => line.catalogItemId === stock.catalogItemId)
                            .reduce((sum, line) => sum + line.delta, 0)
                        )}
                      </td>
                    </tr>
                  ))}
                {!vouchers.length && (
                  <tr>
                    <td colSpan={4}>Chưa có phiếu.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </aside>
  );
}

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

function CatalogItemDialog({
  previous,
  onClose,
  onSaved
}: {
  previous?: CatalogItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  const [item, setItem] = useState<CatalogInput>(() =>
    previous
      ? {
          code: previous.code,
          name: previous.name,
          kind: previous.kind,
          baseUnit: previous.baseUnit,
          conversions: previous.conversions.map(entry => ({ ...entry })),
          notes: previous.notes
        }
      : { code: '', name: '', kind: 'raw_material', baseUnit: '', conversions: [], notes: '' }
  );
  const [conversionText, setConversionText] = useState(
    previous?.conversions.map(entry => `${entry.unit}:${entry.factor}`).join('\n') || ''
  );
  const [active, setActive] = useState(previous?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current) return;
    try {
      const validated = validateCatalogInput({ ...item, conversions: conversionsFromText(conversionText) });
      const body = {
        action: previous ? 'update' : 'create',
        item: validated,
        ...(previous ? { id: previous.id, expectedRevision: previous.revision, active } : {})
      };
      const payload = JSON.stringify(body);
      if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
      pending.current = true;
      setBusy(true);
      setError('');
      await mutateItemCatalog({ ...body, requestId: request.current.id });
      showSuccessToast('Đã lưu danh mục thành công');
      onSaved();
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Không lưu được mã vật tư.';
      setError(msg);
      showErrorToast(msg);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="catalog-item-dialog-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="catalog-item-dialog-title">{previous ? 'Cập nhật mã vật tư' : 'Thêm vật tư mới'}</h2>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
            Đóng
          </button>
        </header>
        {error && (
          <p className="warehouse-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          <div className="warehouse-fields">
            <label>
              Mã nội bộ *
              <input
                required
                maxLength={100}
                readOnly={Boolean(previous)}
                value={item.code}
                onChange={event => setItem({ ...item, code: event.target.value })}
              />
            </label>
            <label>
              Tên vật tư *
              <input
                required
                maxLength={250}
                value={item.name}
                onChange={event => setItem({ ...item, name: event.target.value })}
              />
            </label>
            <label>
              Loại vật tư *
              <select
                disabled={Boolean(previous)}
                value={item.kind}
                onChange={event => setItem({ ...item, kind: event.target.value as CatalogKind })}
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
                readOnly={Boolean(previous)}
                value={item.baseUnit}
                onChange={event => setItem({ ...item, baseUnit: event.target.value })}
              />
            </label>
            <label>
              Quy đổi riêng cho mã này (mỗi dòng: đơn vị:hệ số)
              <textarea
                rows={3}
                placeholder={'Ví dụ:\ncuộn:1000'}
                value={conversionText}
                onChange={event => setConversionText(event.target.value)}
              />
            </label>
            <label>
              Ghi chú hoặc quy cách
              <textarea
                rows={3}
                maxLength={2000}
                value={item.notes}
                onChange={event => setItem({ ...item, notes: event.target.value })}
              />
            </label>
          </div>
          {previous && (
            <label className="warehouse-check">
              <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />
              Đang sử dụng
            </label>
          )}
        </fieldset>
        <footer>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu mã vật tư'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function CatalogCsvDialog({
  existingItems,
  onClose,
  onSaved
}: {
  existingItems: CatalogItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef({ payload: '', id: '' });
  const pending = useRef(false);
  const [importRows, setImportRows] = useState<CatalogInput[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const preview = previewCatalogImport(importRows, existingItems);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([catalogCsvTemplate], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sunflower-danh-muc-hang.csv';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const readFile = async (file?: File) => {
    if (!file || busy) return;
    setError('');
    setImportRows([]);
    setFileName(file.name);
    try {
      if (!/\.csv$/i.test(file.name) || file.size > 1_000_000)
        throw new Error('Chọn tệp CSV UTF-8, tối đa 1 MB và 50 dòng.');
      setImportRows(parseCatalogCsv(await file.text()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được tệp CSV.');
    }
  };

  const commitImport = async () => {
    if (pending.current || !importRows.length || preview.some(row => row.error)) return;
    const body = { action: 'import', items: importRows };
    const payload = JSON.stringify(body);
    if (request.current.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await mutateItemCatalog({ ...body, requestId: request.current.id });
      showSuccessToast(`Đã nhập ${preview.length} mã vật tư`);
      onSaved();
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : 'Không nhập được CSV.';
      setError(msg);
      showErrorToast(msg);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="catalog-csv-dialog-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="catalog-csv-dialog-title">Nhập danh mục vật tư từ CSV</h2>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
          Đóng
        </button>
      </header>
      <p className="warehouse-note">
        Lưu tệp CSV UTF-8 theo mẫu, tối đa 50 dòng mỗi đợt. Chỉ tạo mã mới; không ghi đè mã có sẵn và không nhập số tồn.
      </p>
      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      <div className="warehouse-toolbar">
        <button type="button" className="btn btn-outline" onClick={downloadTemplate}>
          Tải tệp mẫu
        </button>
        <label>
          Chọn tệp CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
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
        <div className="warehouse-grid-scroll">
          <table>
            <thead>
              <tr>
                <th>Dòng</th>
                <th>Mã</th>
                <th>Tên</th>
                <th>Loại</th>
                <th>ĐVT</th>
                <th>Kết quả kiểm tra</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => (
                <tr key={row.row}>
                  <td>{row.row}</td>
                  <td>{row.input.code}</td>
                  <td>{row.input.name}</td>
                  <td>{CATALOG_KINDS[row.input.kind] || row.input.kind}</td>
                  <td>{row.input.baseUnit}</td>
                  <td className={row.error ? 'warehouse-danger' : ''}>{row.error || 'Hợp lệ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <footer>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
          Hủy
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !preview.length || preview.some(row => row.error)}
          onClick={() => void commitImport()}
        >
          {busy ? 'Đang nhập…' : `Xác nhận nhập ${preview.length} mã`}
        </button>
      </footer>
    </dialog>
  );
}

function CatalogLegacyLinkDialog({
  items,
  links,
  onClose,
  onSaved
}: {
  items: CatalogItem[];
  links: CatalogLink[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [sourceType, setSourceType] = useState<CatalogSourceRef['type']>('inventory');
  const [sources, setSources] = useState<CatalogSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedSource, setSelectedSource] = useState<CatalogSource | null>(null);
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadLegacyCatalogSources(sourceType)
      .then(rows => {
        if (!cancelled) setSources(rows);
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu nguồn.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceType]);

  const target = items.find(item => item.id === targetId);
  let validConversion = false;
  let unitNotice = '';
  if (selectedSource && target) {
    try {
      unitNotice = `1 ${selectedSource.unit} = ${conversionFactor(target, selectedSource.unit).toLocaleString('vi-VN')} ${target.baseUnit}`;
      validConversion = true;
    } catch (cause) {
      unitNotice = cause instanceof Error ? cause.message : 'Chưa có quy đổi.';
    }
  }

  const saveLink = async () => {
    if (!selectedSource || !targetId || !validConversion || busy) return;
    const prior = links.find(link => link.sourceKey === selectedSource.key);
    setBusy(true);
    setError('');
    try {
      await mutateItemCatalog({
        action: 'link',
        catalogItemId: targetId,
        source: selectedSource.ref,
        sourceFingerprint: selectedSource.fingerprint,
        expectedLinkRevision: prior?.revision || 0,
        requestId: crypto.randomUUID()
      });
      showSuccessToast('Đã liên kết mã vật tư');
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được liên kết.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="catalog-legacy-dialog-title"
      onCancel={event => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id="catalog-legacy-dialog-title">Liên kết dữ liệu cũ vào mã vật tư</h2>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>
          Đóng
        </button>
      </header>
      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      <div className="warehouse-toolbar">
        <label>
          Nguồn dữ liệu
          <select
            disabled={loading || busy}
            value={sourceType}
            onChange={event => {
              setSelectedSource(null);
              setSourceType(event.target.value as CatalogSourceRef['type']);
            }}
          >
            <option value="inventory">Vật tư kho cũ</option>
            <option value="customer_product">Sản phẩm theo khách</option>
            <option value="po_item">Dòng PO</option>
          </select>
        </label>
      </div>
      {selectedSource && (
        <div className="warehouse-toolbar">
          <span>
            Đang chọn: <strong>{selectedSource.label}</strong> — {selectedSource.name} ({selectedSource.unit})
          </span>
          <select value={targetId} onChange={event => setTargetId(event.target.value)}>
            <option value="">Chọn mã vật tư để liên kết…</option>
            {items
              .filter(item => item.active && (selectedSource.ref.type !== 'inventory' || item.kind === 'raw_material'))
              .map(item => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name} ({item.baseUnit})
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !targetId || !validConversion}
            onClick={() => void saveLink()}
          >
            Xác nhận liên kết
          </button>
          {unitNotice && <span className="warehouse-note">{unitNotice}</span>}
        </div>
      )}
      <div className="warehouse-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Hồ sơ nguồn</th>
              <th>Mã hiện tại</th>
              <th>Tên hàng</th>
              <th>ĐVT</th>
              <th>Mã nội bộ</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source, index) => {
              const resolved = resolveCatalogSource(source, links, items);
              return (
                <tr key={`${source.key}-${index}`}>
                  <td title={source.label}>{source.label}</td>
                  <td>{source.code || '—'}</td>
                  <td title={source.name}>{source.name || '—'}</td>
                  <td>{source.unit || '—'}</td>
                  <td>{resolved.item?.code || 'Chưa liên kết'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy || Boolean(source.problem)}
                      onClick={() => {
                        setSelectedSource(source);
                        setTargetId(resolved.item?.id || '');
                      }}
                    >
                      Chọn liên kết
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && !sources.length && (
              <tr>
                <td colSpan={6}>Chưa có dữ liệu nguồn.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </dialog>
  );
}
