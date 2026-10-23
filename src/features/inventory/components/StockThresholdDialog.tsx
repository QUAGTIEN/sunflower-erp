import { useEffect, useRef, useState } from 'react';
import { mutateWarehouse, WarehouseRequestError } from '../api/warehouseService';
import { registerNavigationGuard } from '@/shared/feedback/navigationGuard';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import type { StockReportRow } from '@/features/accounting/model/operationalReports';
export function StockThresholdDialog({stock,onClose,onSaved}:{stock:StockReportRow;onClose:()=>void;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null), pending=useRef(false), frozen=useRef<Record<string,unknown>|null>(null);
  const [value,setValue]=useState(stock.minQuantity?.toString() || ''), [busy,setBusy]=useState(false), [uncertain,setUncertain]=useState(false), [error,setError]=useState('');
  const dirty=value !== (stock.minQuantity?.toString() || '');
  const close=() => {if (!pending.current && (!dirty && !uncertain || window.confirm(uncertain ? 'Kết quả chưa xác định. Cần tải lại tồn trước khi lập thay đổi khác. Đóng?' : 'Bỏ thay đổi ngưỡng tồn?'))) onClose();};
  useEffect(() => {const el=dialog.current;el?.showModal();return () => el?.close();},[]);
  useEffect(() => {if (!dirty && !busy && !uncertain) return; const stop=registerNavigationGuard(() => !pending.current && window.confirm('Ngưỡng tồn chưa lưu hoặc chưa xác định kết quả. Rời trang?')); const unload=(e:BeforeUnloadEvent) => e.preventDefault();window.addEventListener('beforeunload',unload);return () => {stop();window.removeEventListener('beforeunload',unload);};},[dirty,busy,uncertain]);
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="stock-threshold-title" onCancel={e => {e.preventDefault();close();}}><form onSubmit={async e => {
    e.preventDefault();if (pending.current) return;
    if (!uncertain && !window.confirm('Lưu ngưỡng tồn tối thiểu?')) return;
    frozen.current ||= {action:'threshold',requestId:crypto.randomUUID(),catalogItemId:stock.catalogItemId,warehouseId:stock.warehouseId,expectedRevision:stock.revision,minQuantity:Number(value)};
    pending.current=true;setBusy(true);setError('');
    try {await mutateWarehouse(frozen.current);showSuccessToast('Đã lưu ngưỡng tồn');onSaved();}
    catch(cause) {const unknown=cause instanceof WarehouseRequestError && cause.uncertain;setUncertain(unknown);if (!unknown) frozen.current=null;const message=cause instanceof Error ? cause.message : 'Không lưu được ngưỡng tồn.';setError(message);showErrorToast(message);}
    finally {pending.current=false;setBusy(false);}
  }}><header><h2 id="stock-threshold-title">Ngưỡng tồn · {stock.code}</h2><button type="button" className="btn btn-outline" disabled={busy} onClick={close}>Đóng</button></header><p>{stock.name} · {stock.unit}</p>{error && <p role="alert" className="warehouse-error">{error}</p>}<label>Ngưỡng tối thiểu ({stock.unit}) *<input required type="number" min="0" max="1000000000" step="0.000001" value={value} disabled={busy || uncertain} onChange={e => setValue(e.target.value)}/></label><footer><button className="btn btn-primary" disabled={busy || !dirty && !uncertain}>{busy ? 'Đang lưu…' : uncertain ? 'Kiểm tra lại yêu cầu' : 'Lưu ngưỡng tồn'}</button></footer></form></dialog>;
}
