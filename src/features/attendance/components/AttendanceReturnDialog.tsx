import { useEffect, useRef, useState, type FormEvent } from 'react';
export function AttendanceReturnDialog({ employeeName, onClose, onReturn }: { employeeName: string; onClose: () => void; onReturn: (reason: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const close = () => { if (!busy && (!reason.trim() || window.confirm('Bỏ lý do trả về chưa gửi?'))) onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !reason.trim()) return;
    setBusy(true); setError('');
    try { await onReturn(reason.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể trả về bảng công.'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="attendance-dialog" aria-labelledby="attendance-return-title" onCancel={event => { event.preventDefault(); close(); }}><form onSubmit={submit}>
    <header><h2 id="attendance-return-title">Trả về bảng công</h2><button type="button" className="btn btn-outline" onClick={close} disabled={busy}>Đóng</button></header>
    <p>{employeeName}</p><label>Lý do cần chỉnh sửa *<textarea autoFocus required rows={4} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>
    {error && <p className="attendance-error" role="alert">{error}</p>}
    <footer><span /><button type="button" className="btn btn-outline" onClick={close} disabled={busy}>Hủy</button><button className="btn btn-primary" disabled={busy || !reason.trim()}>{busy ? 'Đang gửi...' : 'Trả về chỉnh sửa'}</button></footer>
  </form></dialog>;
}
