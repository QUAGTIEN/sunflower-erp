import { LoadingStatus } from '@/components/LoadingStates';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { stockAlert } from '@/features/accounting/model/operationalReports';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { PageBackButton } from '@/components/PageBackButton';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import {
  DataFilterButton,
  DataFilterCheckboxGroup,
  DataFilterChipBar,
  DataFilterPanel,
  DataFilterSection
} from '@/components/DataWorkspaceFilters';
import { isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import { mutateItemCatalog } from '@/features/catalog/api/itemCatalogService';
import { CatalogCodeFields } from '@/features/catalog/components/CatalogCodeFields';
import {
  CATALOG_KINDS,
  canManageItemCatalog,
  catalogCsvTemplate,
  parseCatalogCsv,
  previewCatalogImport,
  EMPTY_CODE_CHOICE,
  validateCatalogCodeRequest,
  validateCatalogInput,
  type CatalogCodeChoice,
  type CatalogInput,
  type CatalogItem,
  type CatalogKind
} from '@/features/catalog/model/itemCatalog';
import { confirmAppNavigation, registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { mutateWarehouse } from '../api/warehouseService';
import { useWarehouseLiveData } from '../components/useWarehouseLiveData';
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
  type WarehouseKind,
  type WarehouseVoucher
} from '../model/warehouse';
import { GOODS_KINDS, type GoodsVoucher } from '../model/finishedGoods';
import { WarehouseVoucherDialog } from '../components/WarehouseVoucherDialog';
import { GoodsVoucherDialog, type GoodsDialogOptions } from '../components/GoodsVoucherDialog';
import { DieCatalogWorkspace } from '../components/DieCatalogWorkspace';
import '../components/Warehouse.css';

const tabNames = {
  catalog: 'Danh mục vật tư',
  dies: 'Danh mục dao',
  vouchers: 'Phiếu kho'
};
const voucherViewNames = {
  list: 'Danh sách phiếu',
  report: 'Nhập xuất tồn'
};
const itemKindLabels: Record<CatalogKind, string> = {
  raw_material: 'NVL',
  finished_good: 'Thành phẩm',
  resale: 'Hàng mua'
};
const alertFilterOptions = [
  { value: 'Cần nhập hàng', label: 'Dưới ngưỡng (Cần nhập hàng)' },
  { value: 'Tồn âm', label: 'Tồn âm' },
  { value: 'surplus', label: 'Có tồn dư' },
  { value: 'Chưa thiết lập ngưỡng', label: 'Chưa thiết lập ngưỡng' },
  { value: 'Trong ngưỡng', label: 'Bình thường (Trong ngưỡng)' },
  { value: 'inactive', label: 'Ngừng sử dụng' }
];
const warehouseScopeOptions = [
  { value: 'raw_main', label: 'Kho NVL' },
  { value: 'finished_main', label: 'Kho Thành phẩm' }
];
const voucherKindOptions = [
  ...Object.entries(WAREHOUSE_KINDS).map(([value, label]) => ({
    value: `raw:${value}`,
    label: `Kho NVL · ${label}`
  })),
  ...Object.entries(GOODS_KINDS)
    .filter(([key]) => key !== 'reversal')
    .map(([value, label]) => ({
      value: `fg:${value}`,
      label: `Kho TP · ${label}`
    }))
];
export interface UnifiedStockRow extends WarehouseBalance {
  catalogItemId: string;
  warehouseId: 'raw_main' | 'finished_main';
  itemKind: CatalogKind;
  surplusQuantity: number;
  conversions: { unit: string; factor: number }[];
  notes: string;
  active: boolean;
  catalogRevision: number;
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
  const [tab, setTab] = useState<keyof typeof tabNames>('catalog');
  const [voucherView, setVoucherView] = useState<keyof typeof voucherViewNames>('list');
  const [search, setSearch] = useState('');
  const [itemKindFilters, setItemKindFilters] = useState<string[]>([]);
  const [alertFilters, setAlertFilters] = useState<string[]>([]);
  const [warehouseFilters, setWarehouseFilters] = useState<string[]>([]);
  const [kindFilters, setKindFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(warehouseDate());
  const [reportScope, setReportScope] = useState<'raw_main' | 'finished_main'>('raw_main');
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
  const permitted = canReadWarehouse(currentUser);
  const canManageCatalog = canManageItemCatalog(currentUser);
  const { data, loaded, loading, error, reload } = useWarehouseLiveData(permitted);
  const canWrite = canPostWarehouse(currentUser) && loaded && !loading;
  const canWriteCatalog = canManageCatalog && isFirebaseRuntimeEnabled && loaded && !loading;

  const saved = () => {
    setCreating(false);
    setGoodsOptions(null);
    setReversal(null);
    setCreatingCatalogItem(false);
    setEditingCatalogItem(null);
    setCsvModalOpen(false);
    onRefresh();
  };

  const allVouchers: UnifiedVoucher[] = [
    ...data.rawVouchers.map(v => ({ ...v, warehouseId: 'raw_main' as const })),
    ...data.goodsVouchers.map(v => ({ ...v, warehouseId: 'finished_main' as const }))
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
  for (const item of data.items) {
    catalogById.set(item.id, item);
  }

  const balances: UnifiedStockRow[] = [...catalogById.values()]
    .map(item => {
      const itemKind: CatalogKind = (item.kind as CatalogKind) || 'raw_material';
      const isRaw = itemKind === 'raw_material';
      const warehouseId: 'raw_main' | 'finished_main' = isRaw ? 'raw_main' : 'finished_main';
      const found = isRaw
        ? data.rawBalances.find(balance => balance.id === item.id)
        : data.goodsBalances.find(balance => balance.catalogItemId === item.id);
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
        users: data.itemUsers[item.id] || []
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, 'vi'));

  const needle = search.trim().toLocaleLowerCase('vi');
  const matches = (...values: unknown[]) => values.join(' ').toLocaleLowerCase('vi').includes(needle);

  const balancePages = useDataTablePagination(
    balances.filter(row => {
      const alertStatus = stockAlert(row.quantity, row.minQuantity);
      const matchesKind = itemKindFilters.length === 0 || itemKindFilters.includes(row.itemKind);
      const matchesAlert =
        alertFilters.length === 0 ||
        alertFilters.some(filter =>
          filter === 'surplus' ? row.surplusQuantity > 0 : filter === 'inactive' ? !row.active : alertStatus === filter
        );
      return matches(row.code, row.name, row.users.map(u => u.customerName).join(' ')) && matchesKind && matchesAlert;
    })
  );

  const voucherPages = useDataTablePagination(
    allVouchers
      .filter(row => {
        const prefix = row.warehouseId === 'raw_main' ? 'raw' : 'fg';
        const matchesWarehouse = warehouseFilters.length === 0 || warehouseFilters.includes(row.warehouseId);
        const matchesKind =
          kindFilters.length === 0 ||
          kindFilters.includes(`${prefix}:${row.kind}`) ||
          (row.kind === 'reversal' && kindFilters.includes('raw:reversal'));
        return (
          matchesWarehouse &&
          matchesKind &&
          (!from || row.postingDate >= from) &&
          (!to || row.postingDate <= to) &&
          matches(
            row.code,
            row.sourceCode,
            row.customerName || '',
            row.actorName,
            row.lines.map(line => line.code).join(' ')
          )
        );
      })
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  );

  const reportVouchers =
    reportScope === 'finished_main'
      ? data.goodsVouchers.map(voucher => ({ ...voucher, lines: voucher.lines.filter(line => line.delta !== 0) }))
      : data.rawVouchers;
  const reportPages = useDataTablePagination(
    from && to && from <= to
      ? warehouseSummary(reportVouchers, from, to).filter(row => matches(row.code, row.name))
      : []
  );

  const pagination = tab === 'catalog' ? balancePages : voucherView === 'list' ? voucherPages : reportPages;

  const activeStock = stock
    ? balances.find(row => row.id === stock.id && row.warehouseId === stock.warehouseId) || stock
    : null;

  const catalogActiveFilterCount = itemKindFilters.length + alertFilters.length;
  const voucherActiveFilterCount = warehouseFilters.length + kindFilters.length;

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
      onRefresh();
    } catch (cause) {
      showErrorToast(cause instanceof Error ? cause.message : 'Không cập nhật được trạng thái mã.');
    }
  };

  if (!permitted) return <p role="alert">Bạn không có quyền xem Kho vật tư.</p>;

  return (
    <div className="inventory-view warehouse-workspace" data-erp-table-text="single-line">
      <PageContextHeader
        section="Kho vật tư"
        current={tab === 'catalog' && activeStock ? `${tabNames.catalog} · ${activeStock.code}` : tabNames[tab]}
      />
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
                setStock(null);
                setSearch('');
                setVoucherMenuOpen(false);
                setShowFilters(false);
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
                setShowFilters(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab !== 'dies' && !(tab === 'catalog' && activeStock) && (
        <div className="warehouse-toolbar">
          <input
            aria-label="Tìm kiếm kho"
            type="search"
            placeholder={
              tab === 'catalog'
                ? 'Tìm theo mã / tên / khách hàng…'
                : voucherView === 'list'
                  ? 'Tìm số phiếu, LSX, đơn hàng…'
                  : 'Tìm mã hoặc tên vật tư…'
            }
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          {tab === 'catalog' && (
            <>
              <DataFilterButton
                activeCount={catalogActiveFilterCount}
                open={showFilters}
                onClick={() => setShowFilters(true)}
              />
              <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
              {canManageCatalog && (
                <div className="warehouse-toolbar-end">
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
              <DataFilterButton
                activeCount={voucherActiveFilterCount}
                open={showFilters}
                onClick={() => setShowFilters(true)}
              />
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
          {tab === 'vouchers' && (
            <>
              <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
              {canPostWarehouse(currentUser) && (
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
      )}

      {tab === 'catalog' && !activeStock && (
        <DataFilterChipBar
          chips={[
            ...itemKindFilters.map(value => ({
              id: `kind:${value}`,
              label: itemKindLabels[value as CatalogKind] || value,
              onRemove: () => setItemKindFilters(current => current.filter(item => item !== value))
            })),
            ...alertFilters.map(value => ({
              id: `alert:${value}`,
              label: alertFilterOptions.find(opt => opt.value === value)?.label || value,
              onRemove: () => setAlertFilters(current => current.filter(item => item !== value))
            }))
          ]}
          onClear={() => {
            setItemKindFilters([]);
            setAlertFilters([]);
          }}
        />
      )}

      {tab === 'vouchers' && voucherView === 'list' && (
        <DataFilterChipBar
          chips={[
            ...warehouseFilters.map(value => ({
              id: `wh:${value}`,
              label: warehouseScopeOptions.find(opt => opt.value === value)?.label || value,
              onRemove: () => setWarehouseFilters(current => current.filter(item => item !== value))
            })),
            ...kindFilters.map(value => ({
              id: `vkind:${value}`,
              label: voucherKindOptions.find(opt => opt.value === value)?.label || value,
              onRemove: () => setKindFilters(current => current.filter(item => item !== value))
            }))
          ]}
          onClear={() => {
            setWarehouseFilters([]);
            setKindFilters([]);
          }}
        />
      )}

      {error && (
        <p className="warehouse-error" role="alert">
          {error}
        </p>
      )}
      {tab !== 'dies' && <LoadingStatus loading={loading} hasData={loaded} label="Đang tải sổ kho" />}
      {tab === 'vouchers' && voucherView === 'report' && (!from || !to || from > to) && (
        <p role="alert" className="warehouse-error">
          Chọn khoảng ngày hợp lệ.
        </p>
      )}

      {tab === 'dies' ? (
        <DieCatalogWorkspace canManage={canManageCatalog && isFirebaseRuntimeEnabled} />
      ) : tab === 'catalog' && activeStock ? (
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
          onSaved={onRefresh}
        />
      ) : loading && !loaded ? null : (
        // The skeleton above stands in for the table until the first data arrives, so the two never stack.
        <div className="warehouse-list-frame">
          <div className="table-container erp-primary-data-table">
            <table
              data-resize-key={`warehouse-v2-${tab}-${voucherView}-${reportScope}`}
              className={`warehouse-list ${
                tab === 'catalog'
                  ? 'warehouse-list--catalog'
                  : voucherView === 'list'
                    ? 'warehouse-list--vouchers'
                    : 'warehouse-list--report'
              }`}
            >
              <thead>
                <tr>
                  {tab === 'catalog' ? (
                    <>
                      <th>Mã</th>
                      <th>Tên vật tư</th>
                      <th>Loại</th>
                      <th>ĐVT</th>
                      <th>Tồn</th>
                      <th>Tồn dư</th>
                      <th>Ngưỡng</th>
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
                      <th>Nguồn (LSX / đơn hàng / đơn mua)</th>
                      <th>Khách</th>
                      <th>Số dòng</th>
                      <th>Người lập</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </>
                  ) : (
                    <>
                      <th>Mã vật tư</th>
                      <th>Tên vật tư</th>
                      <th>ĐVT</th>
                      <th>Đầu kỳ</th>
                      <th>Nhập</th>
                      <th>Xuất</th>
                      <th>Cuối kỳ</th>
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
                        className="warehouse-row-clickable"
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
                {!loading && !error && pagination.paginationProps.totalItems === 0 && (
                  <tr>
                    <td colSpan={tab === 'vouchers' && voucherView === 'report' ? 7 : 10}>
                      {search ? 'Không có kết quả phù hợp.' : 'Chưa có dữ liệu.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <DataTablePagination {...pagination.paginationProps} />
        </div>
      )}

      {tab === 'catalog' && (
        <DataFilterPanel
          open={showFilters}
          title="Lọc danh mục vật tư"
          description="Lọc theo loại vật tư và cảnh báo tồn kho."
          activeCount={catalogActiveFilterCount}
          onClose={() => setShowFilters(false)}
          onReset={() => {
            setItemKindFilters([]);
            setAlertFilters([]);
          }}
        >
          <DataFilterSection title="Loại vật tư" selectedCount={itemKindFilters.length} defaultExpanded>
            <DataFilterCheckboxGroup
              options={[
                { value: 'raw_material', label: 'NVL' },
                { value: 'finished_good', label: 'Thành phẩm' },
                { value: 'resale', label: 'Hàng mua' }
              ]}
              selectedValues={itemKindFilters}
              onChange={setItemKindFilters}
            />
          </DataFilterSection>
          <DataFilterSection title="Cảnh báo & trạng thái" selectedCount={alertFilters.length} defaultExpanded>
            <DataFilterCheckboxGroup
              options={alertFilterOptions}
              selectedValues={alertFilters}
              onChange={setAlertFilters}
            />
          </DataFilterSection>
        </DataFilterPanel>
      )}

      {tab === 'vouchers' && voucherView === 'list' && (
        <DataFilterPanel
          open={showFilters}
          title="Lọc danh sách phiếu kho"
          description="Lọc theo kho và loại phiếu kho."
          activeCount={voucherActiveFilterCount}
          onClose={() => setShowFilters(false)}
          onReset={() => {
            setWarehouseFilters([]);
            setKindFilters([]);
          }}
        >
          <DataFilterSection title="Kho" selectedCount={warehouseFilters.length} defaultExpanded>
            <DataFilterCheckboxGroup
              options={warehouseScopeOptions}
              selectedValues={warehouseFilters}
              onChange={setWarehouseFilters}
            />
          </DataFilterSection>
          <DataFilterSection title="Loại phiếu" selectedCount={kindFilters.length} defaultExpanded>
            <DataFilterCheckboxGroup
              options={voucherKindOptions}
              selectedValues={kindFilters}
              onChange={setKindFilters}
            />
          </DataFilterSection>
        </DataFilterPanel>
      )}

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
    <section
      className="warehouse-stock-card warehouse-stock-card--fullpage"
      aria-labelledby="warehouse-stock-title"
      data-erp-table-layout="content"
    >
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
        <header className="warehouse-stock-card-header">
          <PageBackButton title="Quay lại danh mục vật tư" disabled={busy} onClick={close} />
          <div className="warehouse-stock-card-heading">
            <h2 id="warehouse-stock-title" title={stock.name}>
              {stock.name}
            </h2>
            <span title={stock.code}>
              {stock.code} · {itemKindLabels[stock.itemKind]}
            </span>
          </div>
          {onEditCatalog && (
            <button type="button" className="btn btn-outline" disabled={busy} onClick={onEditCatalog}>
              Sửa mã
            </button>
          )}
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
              <dt>Trạng thái mã</dt>
              <dd>{stock.active ? 'Đang sử dụng' : 'Ngừng sử dụng'}</dd>
            </div>
            <div>
              <dt>Quy cách / ghi chú</dt>
              <dd title={stock.notes || '—'}>{stock.notes || '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Tồn và ngưỡng</h3>
          <div className="warehouse-stock-threshold-bar">
            <p className="warehouse-stock-card-meta">
              <span>
                Tồn theo sổ: <strong>{stockNumber(stock.quantity)}</strong> {stock.unit}
              </span>
              <span>
                Tồn dư: <strong>{stockNumber(stock.surplusQuantity)}</strong> {stock.unit}
              </span>
              <span>Trạng thái: {stockAlert(stock.quantity, stock.minQuantity)}</span>
            </p>
            {canPostWarehouse(currentUser) && (
              <div className="warehouse-toolbar warehouse-threshold-controls">
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
          {error && (
            <p className="warehouse-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="warehouse-stock-card-section">
          <h3>Nguồn tồn (dư từ LSX / nhập mua)</h3>
          <div className="table-container erp-primary-data-table">
            <table className="warehouse-list warehouse-detail-table warehouse-detail-table--sources">
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
          <div className="table-container erp-primary-data-table">
            <table className="warehouse-list warehouse-detail-table warehouse-detail-table--users">
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
          <div className="table-container erp-primary-data-table">
            <table className="warehouse-list warehouse-detail-table warehouse-detail-table--ledger">
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
    </section>
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
  // New items get a D-MA1 code issued by the server; an existing item's code never changes.
  const [codeChoice, setCodeChoice] = useState<CatalogCodeChoice>(EMPTY_CODE_CHOICE);
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
      const validated = validateCatalogInput(
        { ...item, conversions: conversionsFromText(conversionText) },
        { codeIssued: !previous }
      );
      const body = {
        action: previous ? 'update' : 'create',
        item: validated,
        ...(previous ? {} : { codeRequest: validateCatalogCodeRequest(validated.kind, codeChoice) }),
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
            {previous && (
              <label>
                Mã nội bộ
                <input readOnly value={item.code} />
              </label>
            )}
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
            {!previous && <CatalogCodeFields kind={item.kind} value={codeChoice} onChange={setCodeChoice} />}
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
