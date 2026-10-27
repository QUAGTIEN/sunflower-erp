import { LoadingStatus } from '@/components/LoadingStates';
import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { stockAlert } from '@/features/accounting/model/operationalReports';
import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { PageContextHeader } from '@/components/PageContextHeader';
import { DataTablePagination } from '@/components/DataTablePagination';
import { RowActionMenu } from '@/components/RowActionMenu';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { ItemCatalogWorkspace } from '@/features/catalog/components/ItemCatalogWorkspace';
import { canManageItemCatalog, type CatalogKind } from '@/features/catalog/model/itemCatalog';
import { confirmAppNavigation, registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { loadWarehouse, mutateWarehouse } from '../api/warehouseService';
import { loadFinishedGoods } from '../api/finishedGoodsService';
import {
  canPostWarehouse,
  canReadWarehouse,
  stockNumber,
  warehouseSummary,
  warehouseDate,
  WAREHOUSE_KINDS,
  type WarehouseBalance,
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
  legacyExports: []
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
  inventory: 'Tồn kho',
  vouchers: 'Phiếu kho',
  report: 'Báo cáo',
  catalog: 'Danh mục vật tư'
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
}
type UnifiedVoucher = (WarehouseVoucher | GoodsVoucher) & { warehouseId: 'raw_main' | 'finished_main' };

export function Inventory({ currentUser, onRefresh }: { currentUser: UserProfile; onRefresh: () => void }) {
  const [data, setData] = useState(empty);
  const [goodsData, setGoodsData] = useState(emptyGoods);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<keyof typeof tabNames>('inventory');
  const [search, setSearch] = useState('');
  const [itemKindFilter, setItemKindFilter] = useState('');
  const [alertFilter, setAlertFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [kind, setKind] = useState('');
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(warehouseDate());
  const [reportScope, setReportScope] = useState<'raw_main' | 'finished_main' | 'legacy_inventory' | 'legacy_exports'>(
    'raw_main'
  );
  const [creating, setCreating] = useState(false);
  const [creatingKind, setCreatingKind] = useState<Exclude<WarehouseKind, 'reversal'>>('purchase_receipt');
  const [goodsOptions, setGoodsOptions] = useState<GoodsDialogOptions | null>(null);
  const [voucherMenuOpen, setVoucherMenuOpen] = useState(false);
  const [selected, setSelected] = useState<UnifiedVoucher | null>(null);
  const [reversal, setReversal] = useState<WarehouseVoucher | null>(null);
  const [stock, setStock] = useState<UnifiedStockRow | null>(null);
  const permitted = canReadWarehouse(currentUser);
  const canWrite = canPostWarehouse(currentUser) && loaded && !loading;
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void Promise.all([loadWarehouse(), loadFinishedGoods().catch(() => emptyGoods)])
      .then(([nextRaw, nextGoods]) => {
        if (!cancelled) {
          setData(nextRaw);
          setGoodsData(nextGoods);
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
  }, [permitted, refresh]);
  const reload = () => {
    setLoaded(false);
    setLoading(true);
    setRefresh(value => value + 1);
  };
  const saved = () => {
    setCreating(false);
    setGoodsOptions(null);
    setReversal(null);
    reload();
    onRefresh();
  };
  const needle = search.trim().toLocaleLowerCase('vi');
  const matches = (...values: unknown[]) => values.join(' ').toLocaleLowerCase('vi').includes(needle);
  const rawBalances: UnifiedStockRow[] = data.items.map(item => {
    const found = data.balances.find(balance => balance.id === item.id);
    return {
      id: item.id,
      catalogItemId: item.id,
      warehouseId: 'raw_main',
      itemKind: (item.kind as CatalogKind) || 'raw_material',
      code: item.code,
      name: item.name,
      unit: item.baseUnit,
      quantity: found?.quantity || 0,
      minQuantity: found?.minQuantity ?? null,
      revision: found?.revision || 0,
      updatedAt: found?.updatedAt || ''
    };
  });
  const fgBalances: UnifiedStockRow[] = goodsData.items.map(item => {
    const found = goodsData.balances.find(balance => balance.catalogItemId === item.id);
    return {
      id: item.id,
      catalogItemId: item.id,
      warehouseId: 'finished_main',
      itemKind: (item.kind as CatalogKind) || 'finished_good',
      code: item.code,
      name: item.name,
      unit: item.baseUnit,
      quantity: found?.quantity || 0,
      minQuantity: found?.minQuantity ?? null,
      revision: found?.revision || 0,
      updatedAt: found?.updatedAt || ''
    };
  });
  const balances: UnifiedStockRow[] = [...rawBalances, ...fgBalances].sort((a, b) =>
    a.code.localeCompare(b.code, 'vi')
  );
  const allVouchers: UnifiedVoucher[] = [
    ...data.vouchers.map(v => ({ ...v, warehouseId: 'raw_main' as const })),
    ...goodsData.vouchers.map(v => ({ ...v, warehouseId: 'finished_main' as const }))
  ];
  const balancePages = useDataTablePagination(
    balances.filter(
      row =>
        matches(row.code, row.name) &&
        (!itemKindFilter || row.itemKind === itemKindFilter) &&
        (!alertFilter || stockAlert(row.quantity, row.minQuantity) === alertFilter)
    )
  );
  const voucherPages = useDataTablePagination(
    allVouchers
      .filter(
        row =>
          (!warehouseFilter || row.warehouseId === warehouseFilter) &&
          (!kind || row.kind === kind) &&
          (!from || row.postingDate >= from) &&
          (!to || row.postingDate <= to) &&
          matches(row.code, row.sourceCode, row.actorName, row.lines.map(line => line.code).join(' '))
      )
      .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  );
  const reportVouchers =
    reportScope === 'finished_main'
      ? goodsData.vouchers.map(voucher => ({ ...voucher, lines: voucher.lines.filter(line => line.delta !== 0) }))
      : data.vouchers;
  const reportPages = useDataTablePagination(
    from && to && from <= to && (reportScope === 'raw_main' || reportScope === 'finished_main')
      ? warehouseSummary(reportVouchers, from, to).filter(row => matches(row.code, row.name))
      : []
  );
  const legacyPages = useDataTablePagination(
    (reportScope === 'legacy_inventory' ? data.legacyInventory : data.legacyExports).filter(row =>
      matches(row.materialName, row.exportCode, row.receiverName)
    )
  );
  const isLegacyReport = reportScope === 'legacy_inventory' || reportScope === 'legacy_exports';
  const pagination =
    tab === 'inventory' ? balancePages : tab === 'vouchers' ? voucherPages : isLegacyReport ? legacyPages : reportPages;
  const activeStock = stock
    ? balances.find(row => row.id === stock.id && row.warehouseId === stock.warehouseId) || stock
    : null;
  if (!permitted) return <p role="alert">Bạn không có quyền xem Kho vật tư.</p>;
  return (
    <div className="inventory-view warehouse-workspace" data-erp-table-text="single-line">
      <PageContextHeader section="Kho vật tư" current={tabNames[tab]} />
      <nav className="content-tabs" aria-label="Kho vật tư" role="tablist">
        {Object.entries(tabNames)
          .filter(([key]) => key !== 'catalog' || canManageItemCatalog(currentUser))
          .map(([key, name]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'active' : ''}
              onClick={() => {
                if (tab !== 'catalog' || confirmAppNavigation()) {
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
      {tab === 'catalog' ? (
        <ItemCatalogWorkspace currentUser={currentUser} />
      ) : (
        <>
          <div className="warehouse-toolbar">
            <input
              aria-label="Tìm kiếm kho"
              type="search"
              placeholder={
                tab === 'inventory' ? 'Tìm mã, tên vật tư hoặc khách hàng…' : 'Tìm mã, tên vật tư hoặc chứng từ…'
              }
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            {tab === 'inventory' && (
              <>
                <select
                  aria-label="Loại vật tư"
                  value={itemKindFilter}
                  onChange={event => setItemKindFilter(event.target.value)}
                >
                  <option value="">Tất cả loại</option>
                  <option value="raw_material">NVL</option>
                  <option value="finished_good">Thành phẩm</option>
                  <option value="resale">Hàng mua</option>
                </select>
                <select
                  aria-label="Cảnh báo tồn"
                  value={alertFilter}
                  onChange={event => setAlertFilter(event.target.value)}
                >
                  <option value="">Tất cả cảnh báo</option>
                  {['Tồn âm', 'Cần nhập hàng', 'Chưa thiết lập ngưỡng', 'Trong ngưỡng'].map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </>
            )}
            {tab === 'vouchers' && (
              <>
                <select
                  aria-label="Kho"
                  value={warehouseFilter}
                  onChange={event => setWarehouseFilter(event.target.value)}
                >
                  <option value="">Tất cả kho</option>
                  <option value="raw_main">Kho NVL</option>
                  <option value="finished_main">Kho thành phẩm</option>
                </select>
                <select aria-label="Loại phiếu" value={kind} onChange={event => setKind(event.target.value)}>
                  <option value="">Tất cả loại phiếu</option>
                  <optgroup label="Kho NVL">
                    {Object.entries(WAREHOUSE_KINDS).map(([key, label]) => (
                      <option key={`raw-${key}`} value={key}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Kho thành phẩm">
                    {Object.entries(GOODS_KINDS)
                      .filter(([key]) => key !== 'reversal')
                      .map(([key, label]) => (
                        <option key={`fg-${key}`} value={key}>
                          {label}
                        </option>
                      ))}
                  </optgroup>
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
            {tab === 'report' && (
              <>
                <select
                  aria-label="Loại báo cáo"
                  value={reportScope}
                  onChange={event => setReportScope(event.target.value as typeof reportScope)}
                >
                  <option value="raw_main">Nhập xuất tồn kho NVL</option>
                  <option value="finished_main">Nhập xuất tồn thành phẩm</option>
                  <option value="legacy_inventory">Dữ liệu cũ — Tồn kho cũ</option>
                  <option value="legacy_exports">Dữ liệu cũ — Phiếu xuất cũ</option>
                </select>
                {!isLegacyReport && (
                  <>
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
              </>
            )}
            <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
            {canPostWarehouse(currentUser) && !isLegacyReport && (
              <div className="warehouse-menu-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canWrite}
                  onClick={() => setVoucherMenuOpen(open => !open)}
                >
                  Lập phiếu kho
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
                        setGoodsOptions({ kind: 'purchase_receipt' });
                      }}
                    >
                      Nhập hàng mua / gia công
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {error && (
            <p className="warehouse-error" role="alert">
              {error}
            </p>
          )}
          <LoadingStatus loading={loading} hasData={data !== empty} label="Đang tải sổ kho" />
          {isLegacyReport ? (
            <p className="warehouse-note">Dữ liệu cũ chỉ để đối soát, chưa chuyển thành tồn đầu kỳ của sổ mới.</p>
          ) : (
            <p className="warehouse-note">
              Kho vật tư (NVL & thành phẩm) · Số lượng từ phiếu thực tế; chưa bao gồm tồn cũ chưa đối soát. Theo dõi
              hàng giao và tiến độ PO xem tại phân hệ Giao hàng.
            </p>
          )}
          {tab === 'report' && !isLegacyReport && (!from || !to || from > to) && (
            <p role="alert" className="warehouse-error">
              Chọn khoảng ngày hợp lệ.
            </p>
          )}
          <div className={`warehouse-split-layout ${tab === 'inventory' && activeStock ? 'has-panel' : ''}`}>
            <div className="warehouse-list-frame">
              <div className="table-container erp-primary-data-table">
                <table data-resize-key={`warehouse-${tab}-${reportScope}`} className="warehouse-list">
                  <thead>
                    <tr>
                      {tab === 'inventory' ? (
                        <>
                          <th>Mã</th>
                          <th>Tên vật tư</th>
                          <th>Loại</th>
                          <th>ĐVT cơ sở</th>
                          <th>Tồn</th>
                          <th>Ngưỡng</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </>
                      ) : tab === 'vouchers' ? (
                        <>
                          <th>Mã phiếu</th>
                          <th>Kho</th>
                          <th>Loại phiếu</th>
                          <th>Nguồn</th>
                          <th>Ngày hạch toán</th>
                          <th>Người ghi sổ</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </>
                      ) : tab === 'report' && !isLegacyReport ? (
                        <>
                          <th>Mã vật tư</th>
                          <th>Tên vật tư</th>
                          <th>ĐVT</th>
                          <th>Đầu kỳ</th>
                          <th>Nhập</th>
                          <th>Xuất</th>
                          <th>Cuối kỳ</th>
                        </>
                      ) : reportScope === 'legacy_inventory' ? (
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
                      tab === 'inventory' &&
                      balancePages.rows.map(row => (
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
                          <td className="warehouse-number">{stockNumber(row.quantity)}</td>
                          <td className="warehouse-number">
                            {row.minQuantity === null ? 'Chưa thiết lập' : stockNumber(row.minQuantity)}
                          </td>
                          <td
                            className={
                              ['Tồn âm', 'Cần nhập hàng'].includes(stockAlert(row.quantity, row.minQuantity))
                                ? 'warehouse-danger'
                                : ''
                            }
                          >
                            {stockAlert(row.quantity, row.minQuantity)}
                          </td>
                          <td>
                            <RowActionMenu
                              label={`Thao tác ${row.code}`}
                              actions={[
                                { label: 'Xem thẻ kho', onSelect: () => setStock(row) },
                                ...(canWrite ? [{ label: 'Thiết lập ngưỡng', onSelect: () => setStock(row) }] : [])
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    {!loading &&
                      !error &&
                      tab === 'vouchers' &&
                      voucherPages.rows.map(row => {
                        const isFinished = row.warehouseId === 'finished_main';
                        const kindLabel = isFinished
                          ? GOODS_KINDS[row.kind as keyof typeof GOODS_KINDS]
                          : WAREHOUSE_KINDS[row.kind as WarehouseKind];
                        return (
                          <tr key={`${row.warehouseId}-${row.id}`}>
                            <td>{row.code}</td>
                            <td>{isFinished ? 'Kho thành phẩm' : 'Kho NVL'}</td>
                            <td title={kindLabel}>{kindLabel}</td>
                            <td title={row.sourceCode}>{row.sourceCode}</td>
                            <td>{row.postingDate}</td>
                            <td>{row.actorName}</td>
                            <td>{row.reversedBy ? 'Đã đảo' : row.kind === 'reversal' ? 'Phiếu đảo' : 'Đã ghi sổ'}</td>
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
                      tab === 'report' &&
                      !isLegacyReport &&
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
                      tab === 'report' &&
                      isLegacyReport &&
                      legacyPages.rows.map(row => (
                        <tr key={String(row.id)}>
                          {reportScope === 'legacy_inventory' ? (
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
                        <td colSpan={8}>{search ? 'Không có kết quả phù hợp.' : 'Chưa có dữ liệu.'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <DataTablePagination {...pagination.paginationProps} />
            </div>
            {tab === 'inventory' && activeStock && (
              <StockDetails
                key={`${activeStock.warehouseId}-${activeStock.id}`}
                stock={activeStock}
                currentUser={currentUser}
                vouchers={allVouchers.filter(
                  voucher =>
                    voucher.warehouseId === activeStock.warehouseId &&
                    voucher.lines.some(line => line.catalogItemId === activeStock.catalogItemId)
                )}
                onClose={() => setStock(null)}
                onSaved={() => {
                  reload();
                }}
              />
            )}
          </div>
        </>
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
        {kindLabel} · {voucher.sourceCode} · {isFinished ? 'Kho thành phẩm chung' : 'Kho NVL chung'}
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
  onClose,
  onSaved
}: {
  stock: UnifiedStockRow;
  currentUser: UserProfile;
  vouchers: UnifiedVoucher[];
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
            Thẻ kho · {stock.code} — {stock.name}
          </h2>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={close}>
            Đóng
          </button>
        </header>
        <p className="warehouse-stock-card-meta">
          <span>Loại: {itemKindLabels[stock.itemKind]}</span>
          <span>
            Tồn theo sổ: <strong>{stockNumber(stock.quantity)}</strong> {stock.unit}
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
        <div className="warehouse-stock-card-section">
          <h3>Lịch sử nhập xuất</h3>
          <div className="warehouse-grid-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mã phiếu</th>
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
