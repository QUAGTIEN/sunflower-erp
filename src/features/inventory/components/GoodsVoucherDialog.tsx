import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { UserProfile } from '@/shared/types';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { conversionFactor } from '@/features/catalog/model/itemCatalog';
import { loadFinishedGoods } from '../api/finishedGoodsService';
import { roundStock, stockNumber, type WarehouseActor } from '../model/warehouse';
import {
  canConfirmGoods,
  canPostGoods,
  GOODS_KINDS,
  goodsOutstanding,
  goodsTransit,
  type GoodsData,
  type GoodsKind,
  type GoodsVoucher
} from '../model/finishedGoods';
import { useGoodsMutation } from './useGoodsMutation';
import { GoodsSignaturePad } from './GoodsSignaturePad';
import './Warehouse.css';

type Entry = { catalogItemId: string; poItemId: string; quantity: string };
export interface GoodsDialogOptions {
  kind: Exclude<GoodsKind, 'reversal'>;
  sourceId?: string;
  poId?: string;
  tripId?: string;
  dispatchId?: string;
  reversal?: GoodsVoucher;
}
const safeQuantity = (value: number) => {
  try {
    return roundStock(value);
  } catch {
    return NaN;
  }
};
async function podImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8_000_000)
    throw new Error('Chọn ảnh JPEG/PNG/WebP tối đa 8 MB.');
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Ảnh không hợp lệ.'));
    element.src = url;
  });
  const canvas = document.createElement('canvas'),
    scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  if (!canvas.width || !canvas.height) throw new Error('Ảnh không hợp lệ.');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không xử lý được ảnh.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const value = canvas.toDataURL('image/jpeg', 0.7);
  if (value.length > 250_000) throw new Error('Ảnh sau nén còn quá lớn. Chọn ảnh nhỏ hơn.');
  return value;
}

export function GoodsVoucherDialog({
  currentUser,
  options,
  onClose,
  onSaved
}: {
  currentUser: UserProfile | WarehouseActor;
  options: GoodsDialogOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    imageSequence = useRef(0),
    alive = useRef(true);
  const [data, setData] = useState<GoodsData | null>(null),
    [loadError, setLoadError] = useState(''),
    [reload, setReload] = useState(0);
  const [kind, setKind] = useState(options.kind),
    [sourceId, setSourceId] = useState(options.sourceId || ''),
    [poId, setPoId] = useState(options.poId || '');
  const [tripId, setTripId] = useState(options.tripId || ''),
    [dispatchId, setDispatchId] = useState(options.dispatchId || '');
  const [entries, setEntries] = useState<Record<string, Entry>>({}),
    [note, setNote] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const [receiverName, setReceiverName] = useState(''),
    [reference, setReference] = useState(''),
    [image, setImage] = useState(''),
    [imageBusy, setImageBusy] = useState(false),
    [imageError, setImageError] = useState('');
  const [returnToSupplier, setReturnToSupplier] = useState(false),
    [customerConfirmation, setCustomerConfirmation] = useState('');
  const mutation = useGoodsMutation(onSaved),
    original = options.reversal;
  const locked = mutation.busy || mutation.uncertain || imageBusy;
  useEffect(() => {
    const element = dialog.current;
    alive.current = true;
    element?.showModal();
    return () => {
      element?.close();
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadFinishedGoods()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setLoadError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Không tải được kho thành phẩm.');
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  const dirty = Boolean(
    note ||
    reference ||
    image ||
    receiverName ||
    customerConfirmation ||
    Object.values(entries).some(row => row.quantity)
  );
  const close = () => {
    if (
      !mutation.pending.current &&
      !imageBusy &&
      ((!dirty && !mutation.uncertain) ||
        window.confirm(
          mutation.uncertain
            ? 'Chưa xác định kết quả. Kiểm tra lịch sử trước khi lập phiếu khác. Đóng?'
            : 'Bỏ thông tin phiếu chưa lưu?'
        ))
    )
      onClose();
  };
  useEffect(() => {
    if (!dirty && !locked) return;
    const unregister = registerNavigationGuard(
      () =>
        !mutation.pending.current &&
        !imageBusy &&
        window.confirm('Phiếu chưa lưu hoặc chưa xác định kết quả. Rời trang?')
    );
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, locked, imageBusy, mutation.pending]);
  const receipt = kind === 'production_receipt' || kind === 'purchase_receipt',
    direct = kind === 'supplier_dispatch';
  const sources =
    data?.sources.filter(
      source => !source.blocked && source.type === (kind === 'production_receipt' ? 'production' : 'purchase')
    ) || [];
  const source = sources.find(source => source.id === sourceId);
  const dispatches =
    data?.vouchers.filter(
      voucher =>
        ['dispatch', 'supplier_dispatch'].includes(voucher.kind) &&
        !voucher.reversedBy &&
        (!options.tripId || voucher.tripId === options.tripId) &&
        (!options.poId || voucher.poId === options.poId)
    ) || [];
  const dispatch = dispatches.find(voucher => voucher.id === dispatchId);
  const selectedPoId = original?.poId || dispatch?.poId || source?.poId || poId;
  const po = data?.orders.find(order => order.id === selectedPoId),
    orderState = data?.orderStates.find(state => state.id === selectedPoId);
  const state = data?.sourceStates.find(state => state.id === `${source?.type}_${sourceId}`),
    dispatchState = data?.dispatchStates.find(state => state.id === dispatchId);
  const formRows =
    receipt || direct
      ? (source?.lines || []).map(row => {
          const stored = state?.lines[row.id],
            current = entries[row.id];
          return {
            ...row,
            catalogItemId: stored?.catalogItemId || row.catalogItemId || current?.catalogItemId || '',
            poItemId: stored?.poItemId || current?.poItemId || row.poItemId || '',
            fixed: !!stored || !!row.catalogItemId,
            remainingBase: stored
              ? kind === 'production_receipt'
                ? row.quantity * stored.factor - stored.received
                : row.quantity * stored.factor -
                  stored.received -
                  stored.directSent +
                  stored.directFailed -
                  stored.failedIntoCompany +
                  (stored.directCustomerReturned || 0)
              : undefined
          };
        })
      : kind === 'dispatch' || kind === 'close_short'
        ? (po?.lines || []).map(row => {
            const stored = orderState?.lines[row.id];
            return {
              ...row,
              poItemId: row.id,
              catalogItemId: stored?.catalogItemId || entries[row.id]?.catalogItemId || '',
              fixed: !!stored,
              remainingBase: stored ? goodsOutstanding(stored) : undefined
            };
          })
        : (dispatch?.lines || []).map(row => {
            const stored = dispatchState?.lines[row.sourceLine];
            return {
              id: row.sourceLine,
              poItemId: row.poItemId,
              name: `${row.code} — ${row.name}`,
              unit: row.unit,
              quantity: row.quantity,
              catalogItemId: row.catalogItemId,
              fixed: true,
              remainingBase: stored
                ? kind === 'customer_return'
                  ? stored.delivered - stored.customerReturned
                  : goodsTransit(stored)
                : 0
            };
          });
  const selected = formRows.flatMap(row => {
    const entry = entries[row.id],
      item = data?.items.find(item => item.id === row.catalogItemId);
    let factor = 0;
    try {
      if (item) factor = conversionFactor(item, row.unit);
    } catch {
      /* Missing conversion is displayed and blocks saving. */
    }
    const quantity =
      kind === 'close_short'
        ? row.remainingBase === undefined
          ? row.quantity
          : row.remainingBase / factor
        : Number(entry?.quantity || 0);
    return quantity > 0
      ? [
          {
            sourceLine: row.id,
            catalogItemId: row.catalogItemId,
            poItemId: row.poItemId,
            quantity,
            factor,
            item,
            remainingBase: row.remainingBase
          }
        ]
      : [];
  });
  const projected = new Map<string, number>();
  const previewLines = original
    ? original.lines.map(line => ({ catalogItemId: line.catalogItemId, delta: -line.delta }))
    : selected.map(row => ({
        catalogItemId: row.catalogItemId,
        delta:
          safeQuantity(row.quantity * row.factor) *
          (kind === 'dispatch'
            ? -1
            : receipt ||
                (['customer_return', 'failed_return'].includes(kind) &&
                  !(returnToSupplier && dispatch?.kind === 'supplier_dispatch'))
              ? 1
              : 0)
      }));
  for (const line of previewLines.filter(line => line.delta !== 0))
    projected.set(
      line.catalogItemId,
      safeQuantity(
        (projected.get(line.catalogItemId) ??
          data?.balances.find(balance => balance.catalogItemId === line.catalogItemId)?.quantity ??
          0) + line.delta
      )
    );
  const badStock = [...projected.values()].some(value => !Number.isFinite(value) || value < 0);
  const invalid = selected.some(
    row =>
      !row.item?.active ||
      !row.factor ||
      !row.poItemId ||
      !Number.isFinite(row.quantity) ||
      (row.remainingBase !== undefined && safeQuantity(row.quantity * row.factor) > safeQuantity(row.remainingBase))
  );
  const permitted =
    original || kind === 'close_short'
      ? currentUser.role === 'admin'
      : kind === 'delivery'
        ? canConfirmGoods(currentUser)
        : canPostGoods(currentUser);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!data || !permitted || imageBusy) return;
    void mutation.execute({
      action: original ? 'reverse' : kind === 'close_short' ? 'close_short' : 'post',
      kind,
      sourceId,
      poId: selectedPoId,
      tripId,
      dispatchId,
      ...(original
        ? { voucherId: original.id }
        : {
            lines: selected.map(({ sourceLine, catalogItemId, poItemId, quantity }) => ({
              sourceLine,
              catalogItemId,
              poItemId,
              quantity
            })),
            confirmMapping: confirmed
          }),
      expectedOrderRevision: orderState?.revision || 0,
      expectedBalances: Object.fromEntries(
        [...projected.keys()].map(id => [
          id,
          data.balances.find(balance => balance.catalogItemId === id)?.revision || 0
        ])
      ),
      note,
      returnToSupplier,
      customerConfirmation,
      ...(kind === 'delivery' ? { proof: { receiverName, reference, signatureImage: image } } : {})
    });
  };
  const reset = () => {
    setEntries({});
    setConfirmed(false);
  };
  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="goods-dialog-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={locked}>
        <header>
          <h2 id="goods-dialog-title">{original ? `Đảo ${original.code}` : GOODS_KINDS[kind]}</h2>
          <button type="button" className="btn btn-outline" disabled={mutation.busy || imageBusy} onClick={close}>
            Đóng
          </button>
        </header>
        {(loadError || mutation.error || imageError) && (
          <p className="warehouse-error" role="alert">
            {loadError || mutation.error || imageError}
          </p>
        )}
        {!data && !loadError && <p role="status">Đang tải…</p>}
        <fieldset disabled={!data || locked || !permitted}>
          {!original && (
            <div className="warehouse-fields">
              <label>
                Nghiệp vụ
                <select
                  value={kind}
                  onChange={event => {
                    setKind(event.target.value as typeof kind);
                    setSourceId('');
                    setDispatchId('');
                    reset();
                  }}
                >
                  {Object.entries(GOODS_KINDS)
                    .filter(
                      ([key]) =>
                        key !== 'reversal' &&
                        (key === 'close_short'
                          ? currentUser.role === 'admin'
                          : key === 'delivery'
                            ? canConfirmGoods(currentUser)
                            : canPostGoods(currentUser))
                    )
                    .map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              {receipt || direct ? (
                <label>
                  Chứng từ nguồn *
                  <select
                    required
                    value={sourceId}
                    onChange={event => {
                      setSourceId(event.target.value);
                      reset();
                    }}
                  >
                    <option value="">Chọn LSX / đơn mua</option>
                    {sources.map(source => (
                      <option key={source.id} value={source.id}>
                        {source.code}
                      </option>
                    ))}
                  </select>
                </label>
              ) : kind === 'dispatch' || kind === 'close_short' ? (
                <label>
                  PO *
                  <select
                    required
                    value={poId}
                    onChange={event => {
                      setPoId(event.target.value);
                      reset();
                    }}
                  >
                    <option value="">Chọn PO</option>
                    {data?.orders
                      .filter(order => !order.legacyDelivered && !['completed', 'cancelled'].includes(order.status))
                      .map(order => (
                        <option key={order.id} value={order.id}>
                          {order.code} — {order.customerName}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label>
                  Phiếu xuất gốc *
                  <select
                    required
                    value={dispatchId}
                    onChange={event => {
                      setDispatchId(event.target.value);
                      reset();
                    }}
                  >
                    <option value="">Chọn phiếu xuất / NCC giao thẳng</option>
                    {dispatches.map(voucher => (
                      <option key={voucher.id} value={voucher.id}>
                        {voucher.code} — {voucher.poCode}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === 'dispatch' && (
                <label>
                  Chuyến giao *
                  <select required value={tripId} onChange={event => setTripId(event.target.value)}>
                    <option value="">Chọn chuyến</option>
                    {data?.trips
                      .filter(
                        trip =>
                          trip.poIds.includes(selectedPoId) && ['planning', 'approved', 'loading'].includes(trip.status)
                      )
                      .map(trip => (
                        <option key={trip.id} value={trip.id}>
                          {trip.code}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                Kho / tuyến hàng
                <input
                  readOnly
                  value={
                    direct || dispatch?.kind === 'supplier_dispatch'
                      ? 'NCC → Khách (không qua kho công ty)'
                      : 'Kho thành phẩm chung'
                  }
                />
              </label>
            </div>
          )}
          {original ? (
            <p>Đảo toàn bộ phiếu gốc. Phiếu và liên kết lịch sử được giữ lại.</p>
          ) : (
            <>
              {data?.sources.find(row => row.id === sourceId && row.blocked) && (
                <p role="alert" className="warehouse-error">
                  {data.sources.find(row => row.id === sourceId)?.blocked}
                </p>
              )}
              {po && (
                <p className="warehouse-note">
                  {po.code} · {po.customerName}
                  {po.legacyDelivered ? ' · Đã giao theo luồng cũ, cần đối soát' : ''}
                </p>
              )}
              <div className="warehouse-grid-scroll">
                <table className="goods-entry-table">
                  <thead>
                    <tr>
                      <th>Dòng nguồn</th>
                      <th>Dòng PO</th>
                      <th>Mã nội bộ *</th>
                      <th>ĐVT</th>
                      <th>Phần còn lại</th>
                      <th>Số lượng phiếu</th>
                      <th>Quy đổi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formRows.map(row => {
                      const entry = entries[row.id],
                        item = data?.items.find(item => item.id === row.catalogItemId);
                      let factor = 0;
                      try {
                        if (item) factor = conversionFactor(item, row.unit);
                      } catch {
                        /* Show missing conversion. */
                      }
                      const remaining =
                        row.remainingBase === undefined
                          ? row.quantity
                          : factor
                            ? safeQuantity(row.remainingBase / factor)
                            : 0;
                      const change = (patch: Partial<Entry>) =>
                        setEntries({
                          ...entries,
                          [row.id]: {
                            quantity: entry?.quantity || '',
                            poItemId: row.poItemId,
                            catalogItemId: row.catalogItemId,
                            ...patch
                          }
                        });
                      return (
                        <tr key={row.id}>
                          <td title={row.name}>{row.name}</td>
                          <td>
                            {source?.type === 'purchase' ? (
                              <select
                                aria-label={`Dòng PO ${row.id}`}
                                value={row.poItemId}
                                disabled={
                                  !!state?.lines[row.id] ||
                                  !!po?.lines.some(
                                    line =>
                                      line.id === source?.lines.find(sourceLine => sourceLine.id === row.id)?.poItemId
                                  )
                                }
                                onChange={event => change({ poItemId: event.target.value })}
                              >
                                <option value="">Chọn dòng PO</option>
                                {po?.lines.map(line => (
                                  <option key={line.id} value={line.id}>
                                    {line.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              po?.lines.find(line => line.id === row.poItemId)?.name || row.poItemId
                            )}
                          </td>
                          <td>
                            <select
                              aria-label={`Mã nội bộ ${row.id}`}
                              value={row.catalogItemId}
                              disabled={row.fixed}
                              onChange={event => change({ catalogItemId: event.target.value })}
                            >
                              <option value="">Chọn mã</option>
                              {data?.items
                                .filter(item => item.active || item.id === row.catalogItemId)
                                .map(item => (
                                  <option key={item.id} value={item.id}>
                                    {item.code} — {item.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td>{row.unit}</td>
                          <td className="warehouse-number">{stockNumber(remaining)}</td>
                          <td>
                            <input
                              aria-label={`Số lượng ${row.id}`}
                              type="number"
                              min="0"
                              max={remaining}
                              step="0.000001"
                              readOnly={kind === 'close_short'}
                              value={kind === 'close_short' ? remaining : entry?.quantity || ''}
                              onChange={event => change({ quantity: event.target.value })}
                            />
                          </td>
                          <td>
                            {item
                              ? factor
                                ? `1 ${row.unit} = ${stockNumber(factor)} ${item.baseUnit}`
                                : 'Thiếu quy đổi'
                              : 'Chưa chọn mã'}
                          </td>
                        </tr>
                      );
                    })}
                    {!formRows.length && (
                      <tr>
                        <td colSpan={7}>Chọn chứng từ nguồn.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <label className="warehouse-check">
                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                Xác nhận đúng mã nội bộ, dòng PO và số lượng thực tế.
              </label>
            </>
          )}
          {projected.size > 0 && (
            <div className="warehouse-grid-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã hàng</th>
                    <th>Tồn trước</th>
                    <th>Tồn sau</th>
                    <th>ĐVT cơ sở</th>
                  </tr>
                </thead>
                <tbody>
                  {[...projected].map(([id, quantity]) => {
                    const item = data?.items.find(item => item.id === id);
                    return (
                      <tr key={id}>
                        <td>{item?.code}</td>
                        <td className="warehouse-number">
                          {stockNumber(data?.balances.find(balance => balance.catalogItemId === id)?.quantity || 0)}
                        </td>
                        <td className={`warehouse-number${quantity < 0 ? ' warehouse-danger' : ''}`}>
                          {Number.isFinite(quantity) ? stockNumber(quantity) : 'Không hợp lệ'}
                        </td>
                        <td>{item?.baseUnit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {badStock && (
            <p className="warehouse-error" role="alert">
              Phiếu làm âm/vượt giới hạn tồn thành phẩm. Không được ghi sổ.
            </p>
          )}
          {['failed_return', 'customer_return'].includes(kind) &&
            dispatch?.kind === 'supplier_dispatch' &&
            !original && (
              <label>
                Hàng thực tế quay về
                <select
                  value={returnToSupplier ? 'supplier' : 'company'}
                  onChange={event => setReturnToSupplier(event.target.value === 'supplier')}
                >
                  <option value="company">Kho công ty — có nhập kho</option>
                  <option value="supplier">NCC — không nhập kho công ty</option>
                </select>
              </label>
            )}
          {kind === 'delivery' && !original && (
            <div className="warehouse-fields">
              <label>
                Người nhận *
                <input
                  required
                  maxLength={200}
                  value={receiverName}
                  onChange={event => setReceiverName(event.target.value)}
                />
              </label>
              <label>
                Mã chứng từ / link POD
                <input maxLength={1000} value={reference} onChange={event => setReference(event.target.value)} />
              </label>
              <label>
                Ảnh POD / chữ ký
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const sequence = ++imageSequence.current;
                    setImageBusy(true);
                    setImageError('');
                    void podImage(file)
                      .then(value => {
                        if (alive.current && sequence === imageSequence.current) setImage(value);
                      })
                      .catch(cause => {
                        if (alive.current && sequence === imageSequence.current)
                          setImageError(cause instanceof Error ? cause.message : 'Không xử lý được ảnh.');
                      })
                      .finally(() => {
                        if (alive.current && sequence === imageSequence.current) setImageBusy(false);
                      });
                  }}
                />
              </label>
              {image && (
                <div>
                  <img className="goods-proof-image" src={image} alt="POD / chữ ký nhận hàng" />
                  <button type="button" className="btn btn-outline" onClick={() => setImage('')}>
                    Bỏ ảnh
                  </button>
                </div>
              )}
            </div>
          )}
          {kind === 'delivery' && !original && <GoodsSignaturePad disabled={locked} onChange={setImage} />}
          {kind === 'close_short' && !original && (
            <label>
              Xác nhận khách chấp nhận phần thiếu *
              <textarea
                required
                rows={2}
                maxLength={1000}
                value={customerConfirmation}
                onChange={event => setCustomerConfirmation(event.target.value)}
              />
            </label>
          )}
          <label>
            Nội dung / lý do *
            <textarea
              autoFocus
              required
              rows={2}
              maxLength={1000}
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </label>
        </fieldset>
        <footer>
          <button
            type="button"
            className="btn btn-outline"
            disabled={locked}
            onClick={() => {
              setData(null);
              setReload(value => value + 1);
            }}
          >
            Tải lại số liệu
          </button>
          <button type="button" className="btn btn-outline" disabled={mutation.busy || imageBusy} onClick={close}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={
              !data ||
              !permitted ||
              mutation.busy ||
              imageBusy ||
              (!mutation.uncertain &&
                (badStock ||
                  !note.trim() ||
                  (!original &&
                    (!selected.length ||
                      invalid ||
                      !confirmed ||
                      !!po?.legacyDelivered ||
                      (kind === 'dispatch' && !tripId) ||
                      (kind === 'delivery' && (!receiverName.trim() || (!reference.trim() && !image))) ||
                      (kind === 'close_short' && !customerConfirmation.trim())))))
            }
          >
            {mutation.busy ? 'Đang ghi…' : mutation.uncertain ? 'Kiểm tra / gửi lại yêu cầu' : 'Ghi sổ'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
