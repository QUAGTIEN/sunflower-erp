import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CHANGE_STATUS_LABELS, formatAttendanceDay, type AttendanceChangeRequest } from '../model/attendance';

export function AttendanceChangeReviewDialog({ employeeName, request, canReview, onClose, onReview }: {
  employeeName: string; request: AttendanceChangeRequest; canReview: boolean; onClose: () => void;
  onReview: (approved: boolean, reason: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const close = () => { if (!busy && (!reason.trim() || window.confirm('Bỏ nội dung chưa gửi?'))) onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy || !canReview || request.status !== 'pending' || rejecting && !reason.trim()) return;
    setBusy(true); setError('');
    try { await onReview(!rejecting, rejecting ? reason.trim() : ''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể xử lý yêu cầu.'); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="attendance-dialog" aria-labelledby="attendance-change-title" onCancel={event => { event.preventDefault(); close(); }}><form onSubmit={submit}>
    <header><h2 id="attendance-change-title">{request.kind === 'delete' ? 'Yêu cầu xóa' : 'Yêu cầu sửa'} · {request.date.split('-').reverse().join('/')}</h2><button type="button" className="btn btn-outline" onClick={close} disabled={busy}>Đóng</button></header>
    <p>{employeeName}</p>
    <dl className="attendance-change-details"><dt>Công gốc</dt><dd>{formatAttendanceDay(request.before, request.employmentType)}</dd><dt>Đề nghị</dt><dd>{request.kind === 'delete' ? 'Xóa chấm công' : formatAttendanceDay(request.after, request.employmentType)}</dd><dt>Lý do</dt><dd>{request.reason}</dd><dt>Trạng thái</dt><dd>{CHANGE_STATUS_LABELS[request.status]}</dd>{request.responseReason && <><dt>Phản hồi</dt><dd>{request.responseReason}</dd></>}</dl>
    {rejecting && <label>Lý do từ chối *<textarea autoFocus required rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></label>}
    {error && <p className="attendance-error" role="alert">{error}</p>}
    {canReview && request.status === 'pending' && <footer><span /><button type="button" className="btn btn-outline" disabled={busy} onClick={() => setRejecting(value => !value)}>{rejecting ? 'Quay lại' : 'Từ chối'}</button><button type="submit" className="btn btn-primary" disabled={busy || rejecting && !reason.trim()}>{busy ? 'Đang xử lý...' : rejecting ? 'Xác nhận từ chối' : request.kind === 'delete' ? 'Duyệt xóa' : 'Duyệt sửa'}</button></footer>}
  </form></dialog>;
}
