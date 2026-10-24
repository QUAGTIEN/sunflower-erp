import { RefreshCw } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { stockAlert, type StockReportRow } from '@/features/accounting/model/operationalReports';
import { StockThresholdDialog } from './StockThresholdDialog';
import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@/shared/types';
import { RowActionMenu } from '@/components/RowActionMenu';
import { DataTablePagination } from '@/components/DataTablePagination';
import { useDataTablePagination } from '@/hooks/useDataTablePagination';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { loadFinishedGoods } from '../api/finishedGoodsService';
import {
  canConfirmGoods,
  canPostGoods,
  canReadGoods,
  GOODS_KINDS,
  goodsOutstanding,
  goodsTransit,
  type GoodsData,
  type GoodsVoucher
} from '../model/finishedGoods';
import { stockNumber, warehouseDate, warehouseSummary } from '../model/warehouse';
import { GoodsVoucherDialog, type GoodsDialogOptions } from './GoodsVoucherDialog';
import './Warehouse.css';

const empty: GoodsData = {
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
export function FinishedGoodsWorkspace({
  currentUser,
  onRefresh,
  tripId = '',
  initialView
}: {
  currentUser: UserProfile;
  onRefresh: () => void;
  tripId?: string;
  initialView?: string;
}) {
  const [data, setData] = useState(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [view, setView] = useState(initialView || (tripId ? 'dispatches' : 'stock')),
    [search, setSearch] = useState('');
  const [from, setFrom] = useState(`${warehouseDate().slice(0, 7)}-01`),
    [to, setTo] = useState(warehouseDate());
  const [options, setOptions] = useState<GoodsDialogOptions | null>(null),
    [selected, setSelected] = useState<GoodsVoucher | null>(null);
  const [threshold, setThreshold] = useState<StockReportRow | null>(null),
    [stockStatus, setStockStatus] = useState('');
  const permitted = canReadGoods(currentUser),
    canWrite = !loading && !error;
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    void loadFinishedGoods()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được thành phẩm.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [permitted, refresh]);
  const reload = () => {
    setLoading(true);
    setRefresh(value => value + 1);
  };
  const saved = () => {
    setOptions(null);
    reload();
    onRefresh();
  };
  const matches = (...values: unknown[]) =>
    values.join(' ').toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
  const stock = data.items.map(item => {
    const balance = data.balances.find(b => b.catalogItemId === item.id);
    return {
      ...item,
      quantity: balance?.quantity || 0,
      minQuantity: balance?.minQuantity ?? null,
      revision: balance?.revision || 0,
      updatedAt: balance?.updatedAt || ''
    };
  });
  const vouchers = data.vouchers
    .filter(
      voucher =>
        (!tripId || voucher.tripId === tripId) &&
        matches(voucher.code, voucher.poCode, voucher.sourceCode, voucher.lines.map(line => line.code).join(' '))
    )
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const dispatches = vouchers.filter(
    voucher => ['dispatch', 'supplier_dispatch'].includes(voucher.kind) && !voucher.reversedBy
  );
  const orders = data.orders
    .flatMap(po => {
      const state = data.orderStates.find(state => state.id === po.id);
      return po.lines.map(line => {
        const progress = state?.lines[line.id];
        return { po, line, progress };
      });
    })
    .filter(row => matches(row.po.code, row.po.customerName, row.line.name, row.progress?.code));
  const report =
    from && to && from <= to
      ? warehouseSummary(
          data.vouchers.map(voucher => ({ ...voucher, lines: voucher.lines.filter(line => line.delta !== 0) })),
          from,
          to
        ).filter(row => matches(row.code, row.name))
      : [];
  const stockPages = useDataTablePagination(
      stock.filter(
        row =>
          matches(row.code, row.name) && (!stockStatus || stockAlert(row.quantity, row.minQuantity) === stockStatus)
      )
    ),
    voucherPages = useDataTablePagination(vouchers),
    dispatchPages = useDataTablePagination(dispatches),
    orderPages = useDataTablePagination(orders),
    reportPages = useDataTablePagination(report);
  const pagination =
    view === 'stock'
      ? stockPages.paginationProps
      : view === 'vouchers'
        ? voucherPages.paginationProps
        : view === 'dispatches'
          ? dispatchPages.paginationProps
          : view === 'orders'
            ? orderPages.paginationProps
            : reportPages.paginationProps;
  if (!permitted) return <p role="alert">Bạn không có quyền xem thành phẩm/hàng giao.</p>;
  return (
    <section className="warehouse-workspace" data-erp-table-text="single-line" aria-label="Thành phẩm và hàng giao">
      <div className="warehouse-toolbar">
        <select aria-label="Nội dung thành phẩm" value={view} onChange={event => setView(event.target.value)}>
          <option value="stock">Tồn thành phẩm / hàng mua</option>
          <option value="vouchers">Phiếu hàng hóa</option>
          <option value="dispatches">Theo dõi hàng giao</option>
          <option value="orders">Tiến độ từng mã / PO</option>
          <option value="report">Nhập xuất tồn</option>
        </select>
        <input
          type="search"
          aria-label="Tìm thành phẩm"
          placeholder="Mã hàng, PO, phiếu…"
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <IconButton label="Tải lại" icon={<RefreshCw />} disabled={loading} onClick={reload} />
        {canPostGoods(currentUser) && (
          <button
            className="btn btn-primary"
            disabled={!canWrite}
            onClick={() => setOptions({ kind: tripId ? 'dispatch' : 'production_receipt', tripId })}
          >
            Lập phiếu hàng hóa
          </button>
        )}
      </div>
      {view === 'stock' && (
        <select aria-label="Cảnh báo tồn thành phẩm" value={stockStatus} onChange={e => setStockStatus(e.target.value)}>
          <option value="">Tất cả trạng thái tồn</option>
          {['Tồn âm', 'Cần nhập hàng', 'Chưa thiết lập ngưỡng', 'Trong ngưỡng'].map(v => (
            <option key={v}>{v}</option>
          ))}
        </select>
      )}
      {view === 'report' && (
        <div className="warehouse-toolbar">
          <label>
            Từ ngày
            <input type="date" value={from} onChange={event => setFrom(event.target.value)} />
          </label>
          <label>
            Đến ngày
            <input type="date" value={to} onChange={event => setTo(event.target.value)} />
          </label>
          {(!from || !to || from > to) && <span role="alert">Chọn khoảng ngày hợp lệ.</span>}
        </div>
      )}
      <p className="warehouse-note">
        Kho thành phẩm chung · Chưa nạp tồn đầu kỳ cũ. Hàng NCC giao thẳng không cộng/trừ kho công ty.
        {tripId ? ' Đang lọc theo chuyến đã chọn.' : ''}
      </p>
      {loading && <p role="status">Đang tải…</p>}
      {error && (
        <p role="alert" className="warehouse-error">
          {error}
        </p>
      )}
      <div className="warehouse-list-frame">
        <div className="table-container erp-primary-data-table">
          <table className="warehouse-list" data-resize-key={`finished-goods-${view}`}>
            <thead>
              <tr>
                {view === 'stock' ? (
                  <>
                    <th>Mã nội bộ</th>
                    <th>Tên hàng</th>
                    <th>Nhóm</th>
                    <th>Tồn theo sổ</th>
                    <th>ĐVT cơ sở</th>
                    <th>Ngưỡng tối thiểu</th>
                    <th>Cảnh báo</th>
                    <th>Thao tác</th>
                  </>
                ) : view === 'vouchers' ? (
                  <>
                    <th>Phiếu</th>
                    <th>Nghiệp vụ</th>
                    <th>PO</th>
                    <th>Nguồn</th>
                    <th>Ngày</th>
                    <th>Người ghi</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </>
                ) : view === 'dispatches' ? (
                  <>
                    <th>Phiếu xuất</th>
                    <th>Tuyến hàng</th>
                    <th>PO</th>
                    <th>Mặt hàng / đang giao</th>
                    <th>Ngày xuất</th>
                    <th>Thao tác</th>
                  </>
                ) : view === 'orders' ? (
                  <>
                    <th>PO / khách</th>
                    <th>Mã / tên hàng</th>
                    <th>ĐVT</th>
                    <th>SL đặt</th>
                    <th>Đã nhận ròng</th>
                    <th>Đang giao</th>
                    <th>Cần xuất thêm</th>
                    <th>Đóng thiếu</th>
                    <th>Thao tác</th>
                  </>
                ) : (
                  <>
                    <th>Mã hàng</th>
                    <th>Tên hàng</th>
                    <th>ĐVT</th>
                    <th>Đầu</th>
                    <th>Nhập</th>
                    <th>Xuất</th>
                    <th>Cuối</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {!loading &&
                !error &&
                view === 'stock' &&
                stockPages.rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td title={row.name}>{row.name}</td>
                    <td>{row.kind === 'resale' ? 'Hàng mua bán lại' : 'Thành phẩm'}</td>
                    <td className="warehouse-number">{stockNumber(row.quantity)}</td>
                    <td>{row.baseUnit}</td>
                    <td className="warehouse-number">
                      {row.minQuantity === null ? 'Chưa thiết lập' : stockNumber(row.minQuantity)}
                    </td>
                    <td>{stockAlert(row.quantity, row.minQuantity)}</td>
                    <td>
                      <RowActionMenu
                        label={`Thao tác ${row.code}`}
                        actions={
                          canPostGoods(currentUser)
                            ? [
                                {
                                  label: 'Thiết lập ngưỡng tồn',
                                  onSelect: () =>
                                    setThreshold({
                                      id: `fg_${row.id}`,
                                      catalogItemId: row.id,
                                      warehouseId: 'finished_main',
                                      code: row.code,
                                      name: row.name,
                                      unit: row.baseUnit,
                                      quantity: row.quantity,
                                      minQuantity: row.minQuantity,
                                      revision: row.revision,
                                      updatedAt: row.updatedAt,
                                      alert: stockAlert(row.quantity, row.minQuantity)
                                    })
                                }
                              ]
                            : [{ label: 'Xem ngưỡng tồn', disabled: true, onSelect: () => {} }]
                        }
                      />
                    </td>
                  </tr>
                ))}
              {!loading &&
                !error &&
                view === 'vouchers' &&
                voucherPages.rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{GOODS_KINDS[row.kind]}</td>
                    <td>{row.poCode}</td>
                    <td>{row.sourceCode}</td>
                    <td>{row.postingDate}</td>
                    <td>{row.actorName}</td>
                    <td>{row.reversedBy ? 'Đã đảo' : row.kind === 'reversal' ? 'Phiếu đảo' : 'Đã ghi'}</td>
                    <td>
                      <RowActionMenu
                        label={`Thao tác ${row.code}`}
                        actions={[
                          { label: 'Chi tiết', onSelect: () => setSelected(row) },
                          ...(currentUser.role === 'admin' && row.kind !== 'reversal' && !row.reversedBy
                            ? [
                                {
                                  label: 'Đảo phiếu',
                                  disabled: !canWrite,
                                  onSelect: () =>
                                    setOptions({ kind: row.kind as GoodsDialogOptions['kind'], reversal: row })
                                }
                              ]
                            : [])
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              {!loading &&
                !error &&
                view === 'dispatches' &&
                dispatchPages.rows.map(row => {
                  const state = data.dispatchStates.find(state => state.id === row.id);
                  const details = row.lines
                    .map(
                      line =>
                        `${line.code}: ${stockNumber((state?.lines[line.sourceLine] ? goodsTransit(state.lines[line.sourceLine]) : 0) / line.factor)} ${line.unit}`
                    )
                    .join('; ');
                  return (
                    <tr key={row.id}>
                      <td>{row.code}</td>
                      <td>{row.kind === 'supplier_dispatch' ? 'NCC → Khách' : 'Kho → Khách'}</td>
                      <td>{row.poCode}</td>
                      <td title={details}>{details}</td>
                      <td>{row.postingDate}</td>
                      <td>
                        <RowActionMenu
                          label={`Thao tác ${row.code}`}
                          actions={[
                            { label: 'Chi tiết', onSelect: () => setSelected(row) },
                            ...(canConfirmGoods(currentUser)
                              ? [
                                  {
                                    label: 'Xác nhận khách nhận / POD',
                                    disabled: !canWrite,
                                    onSelect: () => setOptions({ kind: 'delivery', dispatchId: row.id, poId: row.poId })
                                  }
                                ]
                              : []),
                            ...(canPostGoods(currentUser)
                              ? [
                                  {
                                    label: 'Nhận lại hàng giao thất bại',
                                    disabled: !canWrite,
                                    onSelect: () => setOptions({ kind: 'failed_return', dispatchId: row.id })
                                  },
                                  {
                                    label: 'Khách trả hàng',
                                    disabled: !canWrite,
                                    onSelect: () => setOptions({ kind: 'customer_return', dispatchId: row.id })
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
                view === 'orders' &&
                orderPages.rows.map(({ po, line, progress }) => (
                  <tr key={`${po.id}-${line.id}`}>
                    <td title={`${po.code} — ${po.customerName}`}>
                      {po.code} — {po.customerName}
                    </td>
                    <td title={line.name}>
                      {progress?.code || 'Chưa liên kết'} — {line.name}
                    </td>
                    <td>{line.unit}</td>
                    <td className="warehouse-number">{stockNumber(line.quantity)}</td>
                    <td className="warehouse-number">
                      {progress
                        ? stockNumber((progress.delivered - progress.customerReturned) / progress.factor)
                        : po.legacyDelivered
                          ? 'Dữ liệu cũ'
                          : '0'}
                    </td>
                    <td className="warehouse-number">
                      {progress ? stockNumber(goodsTransit(progress) / progress.factor) : '0'}
                    </td>
                    <td className="warehouse-number">
                      {progress
                        ? stockNumber(goodsOutstanding(progress) / progress.factor)
                        : stockNumber(line.quantity)}
                    </td>
                    <td className="warehouse-number">
                      {progress ? stockNumber(progress.closedShort / progress.factor) : '0'}
                    </td>
                    <td>
                      <RowActionMenu
                        label={`Thao tác ${po.code}`}
                        actions={[
                          ...(canPostGoods(currentUser)
                            ? [
                                {
                                  label: 'Xuất giao',
                                  disabled: !canWrite || po.legacyDelivered,
                                  onSelect: () => setOptions({ kind: 'dispatch', poId: po.id, tripId })
                                }
                              ]
                            : []),
                          ...(currentUser.role === 'admin'
                            ? [
                                {
                                  label: 'Đóng thiếu có xác nhận khách',
                                  disabled: !canWrite || po.legacyDelivered,
                                  onSelect: () => setOptions({ kind: 'close_short', poId: po.id })
                                }
                              ]
                            : [])
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              {!loading &&
                !error &&
                view === 'report' &&
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
              {!loading && !error && pagination.totalItems === 0 && (
                <tr>
                  <td colSpan={9}>Chưa có dữ liệu phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataTablePagination {...pagination} />
      </div>
      {threshold && (
        <StockThresholdDialog
          stock={threshold}
          onClose={() => setThreshold(null)}
          onSaved={() => {
            setThreshold(null);
            reload();
            onRefresh();
          }}
        />
      )}
      {options && (
        <GoodsVoucherDialog
          currentUser={currentUser}
          options={options}
          onClose={() => setOptions(null)}
          onSaved={saved}
        />
      )}
      {selected && (
        <GoodsDetails
          voucher={selected}
          related={data.vouchers.find(row => row.id === (selected.reversedBy || selected.reversalOf))}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
function GoodsDetails({
  voucher,
  related,
  onClose
}: {
  voucher: GoodsVoucher;
  related?: GoodsVoucher;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="goods-detail-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="goods-detail-title">
          {voucher.code} — {GOODS_KINDS[voucher.kind]}
        </h2>
        <button className="btn btn-outline" onClick={onClose}>
          Đóng
        </button>
      </header>
      <p>
        {voucher.poCode} · {voucher.sourceCode} · {formatDateTime(voucher.postedAt)} · {voucher.actorName}
      </p>
      <p>{voucher.note}</p>
      {related && <p>Phiếu liên quan: {related.code}</p>}
      {voucher.customerConfirmation && <p>Khách chấp nhận thiếu: {voucher.customerConfirmation}</p>}
      {voucher.proof && (
        <p>
          Người nhận: {voucher.proof.receiverName} · POD: {voucher.proof.reference}
        </p>
      )}
      {voucher.proof?.signatureImage && (
        <img className="goods-proof-image" src={voucher.proof.signatureImage} alt="POD / chữ ký nhận hàng" />
      )}
      <div className="warehouse-grid-scroll">
        <table>
          <thead>
            <tr>
              <th>Mã hàng</th>
              <th>Tên hàng</th>
              <th>SL</th>
              <th>ĐVT</th>
              <th>Hệ số</th>
              <th>Thay đổi kho</th>
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
