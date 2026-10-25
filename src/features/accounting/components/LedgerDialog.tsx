import { LoadingStatus } from '@/components/LoadingStates';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { loadAccountingLedger } from '../api/accountingLedgerService';
import {
  FINANCE_KINDS,
  canUseLedger,
  lineAmounts,
  lineDue,
  fundAvailable,
  formatMoney,
  type LedgerData,
  type LedgerEntry,
  type DebtSide
} from '../model/accountingLedger';
import type { WarehouseActor } from '@/features/inventory/model/warehouse';
import { warehouseDate, stockNumber } from '@/features/inventory/model/warehouse';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { useLedgerMutation } from './useLedgerMutation';
import '@/features/inventory/components/Warehouse.css';
import './Ledger.css';

export interface LedgerDialogOptions {
  kind: Exclude<keyof typeof FINANCE_KINDS, 'reversal'> | 'period';
  side?: DebtSide;
  partnerId?: string;
  fundId?: string;
  entry?: LedgerEntry;
}
type InputLine = { quantity: string; unitPrice: string; discount: string; taxRate: string };
export function LedgerDialog({
  actor,
  options,
  onClose,
  onSaved
}: {
  actor: WarehouseActor;
  options: LedgerDialogOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<LedgerData | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(''),
    [reload, setReload] = useState(0);
  const [side, setSide] = useState<DebtSide>(options.side || 'ar'),
    [partnerId, setPartnerId] = useState(options.partnerId || '');
  const [reference, setReference] = useState(''),
    [note, setNote] = useState(''),
    [dueDate, setDueDate] = useState(warehouseDate()),
    [openingAsOf, setOpeningAsOf] = useState(warehouseDate());
  const [entries, setEntries] = useState<Record<string, InputLine>>({}),
    [allocations, setAllocations] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState(''),
    [method, setMethod] = useState('bank_transfer'),
    [fundId, setFundId] = useState(options.fundId || '');
  const [catalogItemId, setCatalogItemId] = useState(''),
    [openingOrderId, setOpeningOrderId] = useState('');
  const [target, setTarget] = useState(''),
    [direction, setDirection] = useState('decrease'),
    [returnVoucherId, setReturnVoucherId] = useState(''),
    [returnQuantity, setReturnQuantity] = useState('');
  const [month, setMonth] = useState(warehouseDate().slice(0, 7)),
    [periodLocked, setPeriodLocked] = useState(true),
    [confirmed, setConfirmed] = useState(false);
  const mutation = useLedgerMutation(onSaved),
    locked = mutation.busy || mutation.uncertain,
    original = options.entry,
    kind = options.kind;
  const allowed = canUseLedger(actor) && (!(original || kind === 'period') || actor.role === 'admin');
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadAccountingLedger()
      .then(next => {
        if (!cancelled) {
          setData(next);
          setLoadError('');
        }
      })
      .catch(cause => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Không tải được sổ kế toán.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  const dirty = Boolean(
    reference || note || amount || target || Object.keys(entries).length || Object.keys(allocations).length
  );
  const close = () => {
    if (
      !mutation.pending.current &&
      ((!dirty && !mutation.uncertain) ||
        window.confirm(
          mutation.uncertain
            ? 'Chưa xác định kết quả. Kiểm tra lịch sử trước khi lập chứng từ khác. Đóng?'
            : 'Bỏ chứng từ chưa ghi?'
        ))
    )
      onClose();
  };
  useEffect(() => {
    if (!dirty && !locked) return;
    const unregister = registerNavigationGuard(
      () => !mutation.pending.current && window.confirm('Chứng từ chưa ghi hoặc chưa xác định kết quả. Rời trang?')
    );
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unregister();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [dirty, locked, mutation.pending]);
  const sources = data?.sources.filter(s => s.side === side && s.partnerId === partnerId) || [];
  const sourceLines = sources
    .flatMap(source =>
      source.lines.map(line => {
        const key = `${source.id}:${line.id}`,
          state = data?.sourceStates.find(s => s.id === `${side}_${source.id}`),
          input = entries[key];
        const remaining = Math.max(0, line.quantity - (state?.lines[line.id]?.used || 0));
        const values = {
          quantity: Number(input?.quantity || 0),
          unitPrice: Number(input?.unitPrice ?? line.suggestedPrice),
          discount: Number(input?.discount || 0),
          taxRate: Number(input?.taxRate || 0)
        };
        let preview = 0,
          error = '';
        if (values.quantity > 0) {
          try {
            preview = lineAmounts(values.quantity, values.unitPrice, values.discount, values.taxRate).gross;
          } catch (cause) {
            error = cause instanceof Error ? cause.message : 'Dòng không hợp lệ.';
          }
        }
        return { source, line, key, remaining, input, values, preview, error };
      })
    )
    .filter(row => row.remaining > 0);
  const debtLines =
    data?.documents
      .filter(d => !d.voided && d.side === side && d.partnerId === partnerId)
      .flatMap(document => document.lines.map(line => ({ document, line, key: `${document.id}:${line.id}` }))) || [];
  const eligibleFunds =
    data?.funds.filter(f => !f.voided && f.side === side && f.partnerId === partnerId && fundAvailable(f) > 0) || [];
  const fund = eligibleFunds.find(f => f.id === fundId),
    chosen = debtLines.find(row => row.key === target);
  const openingOrder = data?.openingOrders.find(
    row => row.id === openingOrderId && row.side === side && row.partnerId === partnerId
  );
  const selectedSources = sourceLines.filter(row => row.values.quantity > 0),
    selectedAllocations = debtLines.filter(row => Number(allocations[row.key] || 0) > 0);
  const allocationTotal = selectedAllocations.reduce((sum, row) => sum + Number(allocations[row.key]), 0);
  const invalid =
    !original &&
    (kind === 'charge'
      ? !selectedSources.length || selectedSources.some(row => row.error || row.values.quantity > row.remaining)
      : kind === 'allocation'
        ? !fund ||
          !selectedAllocations.length ||
          allocationTotal > fundAvailable(fund) ||
          selectedAllocations.some(row => Number(allocations[row.key]) > lineDue(row.line))
        : kind === 'refund'
          ? !fund || Number(amount) <= 0 || Number(amount) > fundAvailable(fund)
          : kind === 'adjustment'
            ? !chosen || Number(amount) <= 0 || (direction === 'decrease' && Number(amount) > lineDue(chosen.line))
            : kind === 'period'
              ? false
              : Number(amount) <= 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!data || !allowed || loading || (!mutation.uncertain && (invalid || !confirmed))) return;
    const lines =
      kind === 'charge'
        ? selectedSources.map(row => ({ sourceVoucherId: row.source.id, sourceLine: row.line.id, ...row.values }))
        : [
            {
              lineId: 'opening',
              amount: Number(amount),
              catalogItemId,
              poId: openingOrder?.poId || '',
              purchaseId: openingOrder?.purchaseId || ''
            }
          ];
    void mutation.execute({
      action: original ? 'reverse' : kind === 'period' ? 'period' : 'post',
      kind,
      entryId: original?.id,
      side,
      partnerId,
      reference,
      note,
      dueDate,
      openingAsOf,
      expectedRevision: data.revision,
      lines,
      amount: Number(amount),
      method,
      fundId,
      month,
      locked: periodLocked,
      direction,
      allocations: selectedAllocations.map(row => ({
        documentId: row.document.id,
        lineId: row.line.id,
        amount: Number(allocations[row.key])
      })),
      adjustments: chosen
        ? [
            {
              documentId: chosen.document.id,
              lineId: chosen.line.id,
              amount: Number(amount),
              returnVoucherId: direction === 'decrease' ? returnVoucherId : '',
              returnLine: chosen.line.sourceLine,
              quantity: Number(returnQuantity)
            }
          ]
        : []
    });
  };
  const resetPartner = () => {
    setEntries({});
    setAllocations({});
    setFundId('');
    setTarget('');
    setOpeningOrderId('');
    setReturnVoucherId('');
    setConfirmed(false);
  };
  return (
    <dialog
      ref={dialog}
      className="warehouse-dialog ledger-dialog"
      aria-labelledby="ledger-dialog-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={submit} aria-busy={locked}>
        <header>
          <h2 id="ledger-dialog-title">
            {original ? `Đảo ${original.code}` : kind === 'period' ? 'Khóa / mở kỳ' : FINANCE_KINDS[kind]}
          </h2>
          <button type="button" className="btn btn-outline" disabled={mutation.busy} onClick={close}>
            Đóng
          </button>
        </header>
        {(loadError || mutation.error) && (
          <p role="alert" className="warehouse-error">
            {loadError || mutation.error}
          </p>
        )}
        <LoadingStatus loading={loading} hasData={!!data} label="Đang tải sổ công nợ" rows={3} />
        <fieldset disabled={!data || loading || locked || !allowed}>
          {original ? (
            <p>
              {original.reference} · {original.partnerName} · {formatMoney(original.amount)}. Đảo toàn bộ phiếu; giữ
              chứng từ và lịch sử gốc.
            </p>
          ) : kind === 'period' ? (
            <div className="warehouse-fields">
              <label>
                Kỳ *
                <input
                  type="month"
                  required
                  value={month}
                  max={warehouseDate().slice(0, 7)}
                  onChange={event => setMonth(event.target.value)}
                />
              </label>
              <label>
                Thao tác
                <select
                  value={periodLocked ? 'lock' : 'unlock'}
                  onChange={event => setPeriodLocked(event.target.value === 'lock')}
                >
                  <option value="lock">Khóa kỳ</option>
                  <option value="unlock">Mở kỳ</option>
                </select>
              </label>
            </div>
          ) : (
            <>
              <div className="warehouse-fields">
                <label>
                  Loại đối tác
                  <select
                    value={side}
                    onChange={event => {
                      setSide(event.target.value as DebtSide);
                      setPartnerId('');
                      resetPartner();
                    }}
                  >
                    <option value="ar">Khách hàng — phải thu</option>
                    <option value="ap">Nhà cung cấp — phải trả</option>
                  </select>
                </label>
                <label>
                  Đối tác *
                  <select
                    required
                    value={partnerId}
                    onChange={event => {
                      setPartnerId(event.target.value);
                      resetPartner();
                    }}
                  >
                    <option value="">Chọn đối tác</option>
                    {data?.partners
                      .filter(p => p.side === side)
                      .map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Số chứng từ / tham chiếu *
                  <input
                    autoFocus
                    required
                    maxLength={200}
                    value={reference}
                    onChange={event => setReference(event.target.value)}
                  />
                </label>
                {['charge', 'opening'].includes(kind) && (
                  <label>
                    Hạn thanh toán *
                    <input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} />
                  </label>
                )}
                {['opening', 'opening_advance'].includes(kind) && (
                  <label>
                    Ngày đối chiếu đầu kỳ *
                    <input
                      type="date"
                      required
                      max={warehouseDate()}
                      value={openingAsOf}
                      onChange={event => setOpeningAsOf(event.target.value)}
                    />
                  </label>
                )}
              </div>
              {kind === 'charge' && (
                <>
                  <div className="warehouse-grid-scroll">
                    <table className="ledger-entry-table">
                      <thead>
                        <tr>
                          <th>Phiếu hàng / mã</th>
                          <th>Tên hàng</th>
                          <th>ĐVT</th>
                          <th>Chưa ghi nợ</th>
                          <th>SL chứng từ</th>
                          <th>Đơn giá chưa thuế</th>
                          <th>Chiết khấu (đ)</th>
                          <th>Thuế (%)</th>
                          <th>Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceLines.map(row => {
                          const change = (patch: Partial<InputLine>) =>
                            setEntries({
                              ...entries,
                              [row.key]: {
                                quantity: row.input?.quantity || '',
                                unitPrice: row.input?.unitPrice ?? String(row.line.suggestedPrice),
                                discount: row.input?.discount || '0',
                                taxRate: row.input?.taxRate || '0',
                                ...patch
                              }
                            });
                          return (
                            <tr key={row.key}>
                              <td title={`${row.source.code} · ${row.line.code}`}>
                                {row.source.code} · {row.line.code}
                              </td>
                              <td title={row.line.name}>{row.line.name}</td>
                              <td>{row.line.unit}</td>
                              <td className="ledger-number">{stockNumber(row.remaining)}</td>
                              <td>
                                <input
                                  aria-label={`Số lượng ${row.key}`}
                                  type="number"
                                  min="0"
                                  max={row.remaining}
                                  step="0.000001"
                                  value={row.input?.quantity || ''}
                                  onChange={event => change({ quantity: event.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Đơn giá ${row.key}`}
                                  type="number"
                                  min="0"
                                  step="0.000001"
                                  value={row.input?.unitPrice ?? row.line.suggestedPrice}
                                  onChange={event => change({ unitPrice: event.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Chiết khấu ${row.key}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={row.input?.discount || '0'}
                                  onChange={event => change({ discount: event.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Thuế ${row.key}`}
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  value={row.input?.taxRate || '0'}
                                  onChange={event => change({ taxRate: event.target.value })}
                                />
                              </td>
                              <td className="ledger-number" title={row.error}>
                                {row.error || formatMoney(row.preview)}
                              </td>
                            </tr>
                          );
                        })}
                        {!sourceLines.length && (
                          <tr>
                            <td colSpan={9}>
                              Chưa có phiếu giao/nhận đủ điều kiện hoặc nguồn đã ghi đủ công nợ. Nguồn có hóa đơn cũ cần
                              đối soát.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="ledger-total">
                    Tổng: {formatMoney(selectedSources.reduce((sum, row) => sum + row.preview, 0))}
                  </p>
                </>
              )}
              {kind === 'opening' && (
                <div className="warehouse-fields">
                  <label>
                    Đơn cũ (nếu có)
                    <select value={openingOrderId} onChange={event => setOpeningOrderId(event.target.value)}>
                      <option value="">Chưa xác định đơn</option>
                      {data?.openingOrders
                        .filter(row => row.side === side && row.partnerId === partnerId)
                        .map(row => (
                          <option key={row.id} value={row.id}>
                            {row.code}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Mã nội bộ (nếu đã đối chiếu)
                    <select value={catalogItemId} onChange={event => setCatalogItemId(event.target.value)}>
                      <option value="">Chưa chi tiết mã</option>
                      {data?.items.map(item => (
                        <option key={item.id} value={item.id}>
                          {item.code} — {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {['payment', 'opening_advance'].includes(kind) && (
                <label>
                  Phương thức
                  <select value={method} onChange={event => setMethod(event.target.value)}>
                    <option value="bank_transfer">Chuyển khoản</option>
                    <option value="cash">Tiền mặt</option>
                  </select>
                </label>
              )}
              {['allocation', 'refund'].includes(kind) && (
                <label>
                  Khoản tiền chưa phân bổ *
                  <select
                    required
                    value={fundId}
                    onChange={event => {
                      setFundId(event.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">Chọn khoản tiền</option>
                    {eligibleFunds.map(row => (
                      <option key={row.id} value={row.id}>
                        {row.reference} — còn {formatMoney(fundAvailable(row))}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === 'allocation' && (
                <>
                  <div className="warehouse-grid-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Chứng từ</th>
                          <th>Đơn / mã hàng</th>
                          <th>Còn nợ</th>
                          <th>Phân bổ (đ)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debtLines
                          .filter(row => lineDue(row.line) > 0)
                          .map(row => (
                            <tr key={row.key}>
                              <td>{row.document.reference}</td>
                              <td title={`${row.line.orderCode} · ${row.line.code} ${row.line.name}`}>
                                {row.line.orderCode || 'Chưa xác định đơn'} · {row.line.code} {row.line.name}
                              </td>
                              <td className="ledger-number">{formatMoney(lineDue(row.line))}</td>
                              <td>
                                <input
                                  aria-label={`Phân bổ ${row.key}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  max={lineDue(row.line)}
                                  value={allocations[row.key] || ''}
                                  onChange={event => setAllocations({ ...allocations, [row.key]: event.target.value })}
                                />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="ledger-total">
                    Phân bổ: {formatMoney(allocationTotal)} · Còn sau phân bổ:{' '}
                    {formatMoney((fund ? fundAvailable(fund) : 0) - allocationTotal)}
                  </p>
                </>
              )}
              {kind === 'adjustment' && (
                <>
                  <div className="warehouse-fields">
                    <label>
                      Dòng công nợ *
                      <select
                        required
                        value={target}
                        onChange={event => {
                          setTarget(event.target.value);
                          setReturnVoucherId('');
                        }}
                      >
                        <option value="">Chọn dòng</option>
                        {debtLines.map(row => (
                          <option key={row.key} value={row.key}>
                            {row.document.reference} · {row.line.code || row.line.name} · còn{' '}
                            {formatMoney(lineDue(row.line))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Điều chỉnh
                      <select value={direction} onChange={event => setDirection(event.target.value)}>
                        <option value="decrease">Giảm nợ</option>
                        <option value="increase">Tăng nợ</option>
                      </select>
                    </label>
                  </div>
                  {direction === 'decrease' && (
                    <div className="warehouse-fields">
                      <label>
                        Phiếu khách trả / trả NCC (nếu có)
                        <select value={returnVoucherId} onChange={event => setReturnVoucherId(event.target.value)}>
                          <option value="">Điều chỉnh theo chứng từ riêng</option>
                          {data?.returns
                            .filter(
                              row =>
                                row.side === side &&
                                row.lines.some(
                                  l =>
                                    l.catalogItemId === chosen?.line.catalogItemId &&
                                    l.sourceLine === chosen.line.sourceLine
                                )
                            )
                            .map(row => (
                              <option key={row.id} value={row.id}>
                                {row.code}
                              </option>
                            ))}
                        </select>
                      </label>
                      {returnVoucherId && (
                        <label>
                          Số lượng trả theo ĐVT dòng *
                          <input
                            type="number"
                            min="0.000001"
                            step="0.000001"
                            required
                            value={returnQuantity}
                            onChange={event => setReturnQuantity(event.target.value)}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}
              {['opening', 'opening_advance', 'payment', 'refund', 'adjustment'].includes(kind) && (
                <label>
                  {kind === 'adjustment' ? 'Số tiền điều chỉnh đã gồm thuế (đ) *' : 'Số tiền (đ) *'}
                  <input
                    type="number"
                    min="1"
                    max="1000000000000"
                    step="1"
                    required
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <label>
            Nội dung / lý do *
            <textarea rows={2} required maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
          </label>
          <label className="warehouse-check">
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            Xác nhận đúng đối tác, chứng từ, mã hàng và số tiền.
          </label>
        </fieldset>
        <footer>
          <button
            type="button"
            className="btn btn-outline"
            disabled={locked || loading}
            onClick={() => {
              setLoading(true);
              setConfirmed(false);
              setReload(value => value + 1);
            }}
          >
            Tải lại số liệu
          </button>
          <button type="button" className="btn btn-outline" disabled={mutation.busy} onClick={close}>
            Hủy
          </button>
          <button
            className="btn btn-primary"
            disabled={
              !data ||
              loading ||
              !allowed ||
              mutation.busy ||
              (!mutation.uncertain && (invalid || !note.trim() || !confirmed))
            }
          >
            {mutation.busy ? 'Đang ghi…' : mutation.uncertain ? 'Kiểm tra / gửi lại yêu cầu' : 'Ghi sổ'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
