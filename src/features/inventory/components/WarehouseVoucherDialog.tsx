import { TableSkeleton } from '@/components/LoadingStates';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { conversionFactor } from '@/features/catalog/model/itemCatalog';
import { loadWarehouse, mutateWarehouse, WarehouseRequestError } from '../api/warehouseService';
import {
  canPostWarehouse,
  roundStock,
  stockNumber,
  WAREHOUSE_KINDS,
  warehouseDate,
  type WarehouseActor,
  type WarehouseData,
  type WarehouseKind,
  type WarehouseVoucher
} from '../model/warehouse';
import './Warehouse.css';

const message = (error: unknown) => (error instanceof Error ? error.message : 'Không thể xử lý phiếu kho.');
const previewQuantity = (value: number) => {
  try {
    return roundStock(value);
  } catch {
    return NaN;
  }
};
type Entry = { catalogItemId: string; quantity: string; rollCode?: string; remainingMeters?: string };
export function WarehouseVoucherDialog({
  currentUser,
  initialSourceId = '',
  initialKind = 'purchase_receipt',
  reversal,
  onClose,
  onSaved
}: {
  currentUser: WarehouseActor;
  initialSourceId?: string;
  initialKind?: Exclude<WarehouseKind, 'reversal'>;
  reversal?: WarehouseVoucher;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<WarehouseData | null>(null);
  const [kind, setKind] = useState(initialKind);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [note, setNote] = useState('');
  const [confirmMapping, setConfirmMapping] = useState(false);
  const [allowNegative, setAllowNegative] = useState(false);
  const [negativeReason, setNegativeReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const pending = useRef(false);
  const sent = useRef<Record<string, unknown> | null>(null);
  const permitted = canPostWarehouse(currentUser) && (!reversal || currentUser.role === 'admin');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadWarehouse()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setError(message(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);
  const dirty = Boolean(note || Object.values(entries).some(entry => entry.quantity));
  useEffect(() => {
    if (!dirty && !busy && !uncertain) return;
    const unregister = registerNavigationGuard(
      () =>
        !busy &&
        window.confirm(
          uncertain
            ? 'Kết quả ghi chưa xác định. Cần kiểm tra lịch sử phiếu trước khi tạo phiếu khác. Rời trang?'
            : 'Bỏ phiếu kho chưa lưu?'
        )
    );
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, busy, uncertain]);
  const close = () => {
    if (
      !pending.current &&
      ((!dirty && !uncertain) ||
        window.confirm(
          uncertain
            ? 'Chưa xác định kết quả. Kiểm tra lịch sử phiếu trước khi tạo phiếu khác. Đóng?'
            : 'Bỏ phiếu kho chưa lưu?'
        ))
    )
      onClose();
  };
  const sources =
    data?.sources.filter(
      source =>
        source.type === (kind === 'purchase_receipt' ? 'purchase' : 'production') &&
        !source.legacyReceived &&
        (kind !== 'production_issue' || source.status !== 'completed') &&
        (kind !== 'purchase_receipt' || source.status !== 'received')
    ) || [];
  const source = sources.find(source => source.id === sourceId);
  const progress = data?.progress.find(row => row.id === `${source?.type}_${sourceId}`);
  const selected =
    source?.lines
      .filter(line => Number(entries[line.id]?.quantity) > 0)
      .map(line => {
        const stored = progress?.lines[line.id];
        const catalogItemId = stored?.catalogItemId || line.catalogItemId || entries[line.id]?.catalogItemId || '';
        const item = data?.items.find(item => item.id === catalogItemId);
        let factor = 0;
        try {
          if (item) factor = conversionFactor(item, line.unit);
        } catch {
          /* Inline conversion error below; server validates again. */
        }
        const entry = entries[line.id];
        return {
          sourceLine: line.id,
          catalogItemId,
          quantity: Number(entry.quantity),
          rollCode: entry.rollCode?.trim() || '',
          remainingMeters: entry.remainingMeters ? Number(entry.remainingMeters) : undefined,
          factor,
          line,
          item
        };
      }) || [];
  const projected = new Map<string, number>();
  for (const line of reversal?.lines ||
    selected.map(row => ({
      catalogItemId: row.catalogItemId,
      delta: (kind === 'production_issue' ? -1 : 1) * previewQuantity(row.quantity * row.factor)
    }))) {
    const before =
      projected.get(line.catalogItemId) ??
      data?.balances.find(balance => balance.id === line.catalogItemId)?.quantity ??
      0;
    projected.set(line.catalogItemId, previewQuantity(before + (reversal ? -line.delta : line.delta)));
  }
  const negatives = [...projected].filter(([, quantity]) => quantity < 0);
  const needsMapping = selected.some(row => !row.line.catalogItemId && !progress?.lines[row.sourceLine]);
  const invalid =
    selected.some(
      row =>
        !row.item?.active ||
        !row.factor ||
        !Number.isFinite(row.quantity) ||
        !(previewQuantity(row.quantity * row.factor) > 0)
    ) ||
    [...projected.values()].some(value => !Number.isFinite(value)) ||
    Object.values(entries).some(
      entry => entry.quantity !== '' && (!Number.isFinite(Number(entry.quantity)) || Number(entry.quantity) < 0)
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending.current || !data || !permitted) return;
    if (
      !uncertain &&
      !window.confirm(
        reversal
          ? `Đảo ${reversal.code}? Lịch sử gốc vẫn được giữ.`
          : 'Ghi sổ phiếu này? Phiếu đã ghi chỉ có thể đảo bởi Admin.'
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      if (!sent.current)
        sent.current = {
          action: reversal ? 'reverse' : 'post',
          requestId: crypto.randomUUID(),
          postingDate: warehouseDate(),
          ...(reversal
            ? { voucherId: reversal.id }
            : {
                kind,
                sourceId,
                lines: selected.map(({ sourceLine, catalogItemId, quantity, rollCode, remainingMeters }) => ({
                  sourceLine,
                  catalogItemId,
                  quantity,
                  ...(rollCode ? { rollCode } : {}),
                  ...(remainingMeters !== undefined && Number.isFinite(remainingMeters) && remainingMeters > 0
                    ? { remainingMeters }
                    : {})
                })),
                confirmMapping
              }),
          expectedBalances: Object.fromEntries(
            [...projected.keys()].map(id => [id, data.balances.find(balance => balance.id === id)?.revision || 0])
          ),
          note,
          allowNegative,
          negativeReason
        };
      const result = await mutateWarehouse(sent.current);
      sent.current = null;
      setUncertain(false);
      showSuccessToast(`Đã ghi sổ ${result.code}`);
      onSaved();
    } catch (cause) {
      const unknown = cause instanceof WarehouseRequestError && cause.uncertain;
      setUncertain(unknown);
      if (!unknown) sent.current = null;
      setError(message(cause));
      showErrorToast(message(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog"
      aria-labelledby="warehouse-voucher-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={busy}>
        <header>
          <h2 id="warehouse-voucher-title">{reversal ? `Đảo phiếu ${reversal.code}` : 'Lập phiếu kho NVL'}</h2>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={close}>
            Đóng
          </button>
        </header>
        {error && (
          <p className="warehouse-error" role="alert">
            {error}
          </p>
        )}
        {!data && !error && <TableSkeleton label="Đang tải kho" rows={3} />}
        <fieldset disabled={!data || busy || uncertain || !permitted}>
          <div className="warehouse-fields">
            {!reversal && (
              <>
                <label>
                  Loại phiếu *
                  <select
                    value={kind}
                    onChange={event => {
                      setKind(event.target.value as typeof kind);
                      setSourceId('');
                      setEntries({});
                      setConfirmMapping(false);
                    }}
                  >
                    {Object.entries(WAREHOUSE_KINDS)
                      .filter(([key]) => key !== 'reversal')
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Chứng từ nguồn *
                  <select
                    required
                    value={sourceId}
                    onChange={event => {
                      setSourceId(event.target.value);
                      setEntries({});
                      setConfirmMapping(false);
                    }}
                  >
                    <option value="">Chọn đơn mua / LSX</option>
                    {sources.map(source => (
                      <option key={source.id} value={source.id}>
                        {source.code}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              Kho
              <input readOnly value="Kho NVL chung" />
            </label>
            <label>
              Ngày hạch toán
              <input readOnly value={warehouseDate()} />
            </label>
          </div>
          {data && sourceId && !source && !reversal && (
            <p className="warehouse-warning">
              Nguồn không còn mở nhận/cấp hoặc thuộc dữ liệu cũ cần đối soát. Không ghi kho lần nữa cho đơn đã nhận theo
              luồng cũ.
            </p>
          )}
          {reversal ? (
            <p>
              Đảo toàn bộ số lượng của {reversal.code} · {reversal.sourceCode}. Phiếu đảo được ghi ngày hiện tại.
            </p>
          ) : (
            <div className="warehouse-grid-scroll">
              <table className="warehouse-entry-table">
                <thead>
                  <tr>
                    <th>Dòng nguồn</th>
                    <th>Mã NVL nội bộ *</th>
                    <th>ĐVT nguồn</th>
                    <th>Dự kiến / đặt</th>
                    <th>Đã nhận / cấp ròng</th>
                    <th>SL phiếu này</th>
                    {kind === 'production_return' && (
                      <>
                        <th>Mã cuộn</th>
                        <th>Số mét còn lại</th>
                      </>
                    )}
                    <th>Quy đổi cơ sở</th>
                  </tr>
                </thead>
                <tbody>
                  {source?.lines.map(line => {
                    const stored = progress?.lines[line.id],
                      entry = entries[line.id];
                    const catalogId = stored?.catalogItemId || line.catalogItemId || entry?.catalogItemId || '';
                    const item = data?.items.find(item => item.id === catalogId);
                    let factor = 0;
                    try {
                      if (item) factor = conversionFactor(item, line.unit);
                    } catch {
                      /* Explicit conversion required. */
                    }
                    return (
                      <tr key={line.id}>
                        <td title={line.name}>{line.name}</td>
                        <td>
                          <select
                            aria-label={`Mã NVL ${line.name}`}
                            value={catalogId}
                            disabled={!!stored || !!line.catalogItemId}
                            onChange={event =>
                              setEntries({
                                ...entries,
                                [line.id]: { quantity: entry?.quantity || '', catalogItemId: event.target.value }
                              })
                            }
                          >
                            <option value="">Chọn mã nội bộ</option>
                            {data?.items
                              .filter(item => item.active || item.id === catalogId)
                              .map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.code} — {item.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td>{line.unit}</td>
                        <td className="warehouse-number">{stockNumber(line.quantity)}</td>
                        <td className="warehouse-number">
                          {stockNumber(factor ? (stored?.quantity || 0) / factor : 0)}
                        </td>
                        <td>
                          <input
                            aria-label={`Số lượng ${line.name}`}
                            type="number"
                            min="0"
                            max={
                              factor
                                ? kind === 'purchase_receipt'
                                  ? Math.max(0, line.quantity - (stored?.quantity || 0) / factor)
                                  : kind === 'production_return'
                                    ? (stored?.quantity || 0) / factor
                                    : undefined
                                : undefined
                            }
                            step="0.000001"
                            value={entry?.quantity || ''}
                            onChange={event =>
                              setEntries({
                                ...entries,
                                [line.id]: { ...entry, catalogItemId: catalogId, quantity: event.target.value }
                              })
                            }
                          />
                        </td>
                        {kind === 'production_return' && (
                          <>
                            <td>
                              <input
                                aria-label={`Mã cuộn ${line.name}`}
                                maxLength={100}
                                placeholder="VD: CUON-01"
                                value={entry?.rollCode || ''}
                                onChange={event =>
                                  setEntries({
                                    ...entries,
                                    [line.id]: {
                                      ...entry,
                                      catalogItemId: catalogId,
                                      quantity: entry?.quantity || '',
                                      rollCode: event.target.value
                                    }
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`Số mét còn lại ${line.name}`}
                                type="number"
                                min="0"
                                step="0.000001"
                                placeholder="Số mét"
                                value={entry?.remainingMeters || ''}
                                onChange={event =>
                                  setEntries({
                                    ...entries,
                                    [line.id]: {
                                      ...entry,
                                      catalogItemId: catalogId,
                                      quantity: entry?.quantity || '',
                                      remainingMeters: event.target.value
                                    }
                                  })
                                }
                              />
                            </td>
                          </>
                        )}
                        <td>
                          {item
                            ? factor
                              ? `1 ${line.unit} = ${stockNumber(factor)} ${item.baseUnit}`
                              : 'Thiếu quy đổi trong danh mục'
                            : 'Chưa chọn mã'}
                        </td>
                      </tr>
                    );
                  })}
                  {!source && (
                    <tr>
                      <td colSpan={kind === 'production_return' ? 9 : 7}>
                        Chọn chứng từ nguồn để nhập số lượng thực tế.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {needsMapping && (
            <label className="warehouse-check">
              <input
                type="checkbox"
                checked={confirmMapping}
                onChange={event => setConfirmMapping(event.target.checked)}
              />
              Tôi xác nhận các mã NVL nội bộ đã chọn đúng với dòng nguồn.
            </label>
          )}
          {projected.size > 0 && (
            <div className="warehouse-grid-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mã NVL</th>
                    <th>Tồn hiện tại</th>
                    <th>Tồn sau phiếu</th>
                    <th>ĐVT</th>
                  </tr>
                </thead>
                <tbody>
                  {[...projected].map(([id, quantity]) => {
                    const item = data?.items.find(item => item.id === id),
                      balance = data?.balances.find(balance => balance.id === id);
                    return (
                      <tr key={id}>
                        <td>{item?.code || balance?.code || 'Chưa chọn mã'}</td>
                        <td className="warehouse-number">{stockNumber(balance?.quantity || 0)}</td>
                        <td className={`warehouse-number${quantity < 0 ? ' warehouse-danger' : ''}`}>
                          {Number.isFinite(quantity) ? stockNumber(quantity) : 'Số lượng không hợp lệ'}
                        </td>
                        <td>{item?.baseUnit || balance?.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {negatives.length > 0 && (
            <div className="warehouse-warning" role="alert">
              <p>Phiếu làm tồn kho âm. Cần xác nhận và ghi rõ lý do.</p>
              <label className="warehouse-check">
                <input
                  type="checkbox"
                  checked={allowNegative}
                  onChange={event => setAllowNegative(event.target.checked)}
                />
                Cho phép xuất âm
              </label>
              <label>
                Lý do xuất âm *
                <textarea
                  required
                  maxLength={1000}
                  rows={2}
                  value={negativeReason}
                  onChange={event => setNegativeReason(event.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            Nội dung / lý do *
            <textarea
              autoFocus
              required
              maxLength={1000}
              rows={2}
              value={note}
              onChange={event => setNote(event.target.value)}
            />
          </label>
        </fieldset>
        <footer>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || uncertain}
            onClick={() => {
              setData(null);
              setReloadKey(value => value + 1);
            }}
          >
            Tải lại số tồn
          </button>
          <button type="button" className="btn btn-outline" disabled={busy} onClick={close}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={
              !data ||
              busy ||
              !permitted ||
              (!uncertain &&
                (!note.trim() ||
                  (!reversal && (!selected.length || invalid || (needsMapping && !confirmMapping))) ||
                  (negatives.length > 0 && (!allowNegative || !negativeReason.trim()))))
            }
          >
            {busy ? 'Đang ghi…' : uncertain ? 'Kiểm tra / gửi lại yêu cầu' : 'Ghi sổ'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
