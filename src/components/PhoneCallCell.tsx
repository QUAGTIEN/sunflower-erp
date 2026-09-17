import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService, type AuditModule } from '@/services/auditService';
import { CALL_RESULT_LABELS, type CallResult, type PhoneCallRecord } from '@/features/crm/model/callHistory';
import type { LeadCandidateContactLog } from '@/features/crm/model/leadCandidateModels';
import './PhoneCallCell.css';

interface PhoneCallCellProps {
  phone: string;
  companyName: string;
  subjectKey: string;
  historyKeys?: string[];
  auditModule: AuditModule;
  targetType: 'lead_candidate' | 'lead' | 'customer';
  targetId: string;
  currentUser: UserProfile;
  canRecord: boolean;
  onCallStarted?: () => void | Promise<void>;
}

const RESULT_OPTIONS = (Object.keys(CALL_RESULT_LABELS) as CallResult[]).filter(result => result !== 'pending');
const formatCallTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export const PhoneCallCell = ({ phone, companyName, subjectKey, historyKeys = [], auditModule, targetType, targetId, currentUser, canRecord, onCallStarted }: PhoneCallCellProps) => {
  const [open, setOpen] = useState(false);
  const [callsByKey, setCallsByKey] = useState<Record<string, PhoneCallRecord[]>>({});
  const [legacyByKey, setLegacyByKey] = useState<Record<string, LeadCandidateContactLog[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState('');
  const [result, setResult] = useState<CallResult>('pending');
  const [note, setNote] = useState('');
  const keySignature = [...new Set([subjectKey, ...historyKeys])].sort().join('|');
  const visibleKeys = keySignature.split('|').filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const keys = keySignature.split('|').filter(Boolean);
    const pendingKeys = new Set(keys);
    const unsubscribers = keys.map(key => dbService.subscribeCollection('call_history', data => {
      setCallsByKey(previous => ({ ...previous, [key]: (data as PhoneCallRecord[]).filter(call => call.subjectKey === key) }));
      pendingKeys.delete(key);
      if (pendingKeys.size === 0) setLoading(false);
    }, {
      fieldName: 'subjectKey', fieldValue: key,
      onError: () => { setError('Không tải được lịch sử cuộc gọi.'); pendingKeys.delete(key); setLoading(false); }
    }));
    const candidateKey = keys.find(key => key.startsWith('candidate:'));
    if (candidateKey) {
      void dbService.getDocument('lead_candidates', candidateKey.slice('candidate:'.length))
        .then(candidate => setLegacyByKey(previous => ({ ...previous, [candidateKey]: (candidate?.contactLogs || []).filter(
          (log: LeadCandidateContactLog) => log.activityType === 'call'
        ) })))
        .catch(() => setLegacyByKey(previous => ({ ...previous, [candidateKey]: [] })));
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [open, keySignature]);

  useEffect(() => {
    if (!open) return undefined;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open]);

  const startCall = async (dialNumber: string) => {
    if (!canRecord || busy) return;
    setBusy(true);
    setError('');
    const startedAt = new Date().toISOString();
    try {
      const call = await dbService.addDocument('call_history', {
        subjectKey, companyName, phone, startedAt,
        createdById: currentUser.uid, createdByName: currentUser.displayName,
        result: 'pending', note: '', confirmedAt: '', confirmedById: '', confirmedByName: ''
      }) as PhoneCallRecord;
      auditService.recordSafely(currentUser, {
        category: 'business', module: auditModule, action: 'phone_call_started',
        summary: `Đã bấm gọi ${companyName} · ${phone}`,
        targetType, targetId, targetLabel: companyName,
        changes: [{ field: 'callId', label: 'Mã cuộc gọi', after: call.id }]
      });
      await onCallStarted?.();
      window.location.assign(`tel:${dialNumber}`);
    } catch {
      setError('Không lưu được lần gọi. Vui lòng kiểm tra lại lịch sử.');
      setLoading(true);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const saveConfirmation = async (call: PhoneCallRecord) => {
    if (result === 'pending' || busy) return;
    setBusy(true);
    setError('');
    try {
      const confirmedAt = new Date().toISOString();
      await dbService.updateDocument('call_history', call.id, {
        result, note: note.trim(), confirmedAt,
        confirmedById: currentUser.uid, confirmedByName: currentUser.displayName
      });
      auditService.recordSafely(currentUser, {
        category: 'business', module: auditModule, action: 'phone_call_confirmed',
        summary: `${currentUser.displayName} xác nhận cuộc gọi ${companyName}: ${CALL_RESULT_LABELS[result]}`,
        targetType, targetId, targetLabel: companyName,
        changes: [{ field: 'result', label: 'Kết quả cuộc gọi', before: CALL_RESULT_LABELS[call.result], after: CALL_RESULT_LABELS[result] }]
      });
      setEditingId('');
      setResult('pending');
      setNote('');
    } catch {
      setError('Không lưu được kết quả cuộc gọi. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  if (!phone.trim()) return <span className="phone-call-cell__empty">Chưa cập nhật</span>;
  const dialNumber = phone.replace(/[^+\d]/g, '');
  const timeline = [
    ...visibleKeys.flatMap(key => callsByKey[key] || []).map(call => ({ id: call.id, time: call.startedAt, call, legacy: null as LeadCandidateContactLog | null })),
    ...visibleKeys.flatMap(key => legacyByKey[key] || []).map(call => ({ id: `legacy:${call.id}`, time: call.occurredAt, call: null as PhoneCallRecord | null, legacy: call }))
  ].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <span className="phone-call-cell" onClick={event => event.stopPropagation()}>
      {canRecord && dialNumber ? (
        <a className="phone-call-cell__number" href={`tel:${dialNumber}`} title={`Gọi ${phone}`}
          onClick={event => { event.preventDefault(); void startCall(dialNumber); }}><span className="erp-adaptive-table-value">{phone}</span></a>
      ) : <span className="phone-call-cell__number phone-call-cell__number--readonly"><span className="erp-adaptive-table-value">{phone}</span></span>}
      <button type="button" className="phone-call-cell__history" onClick={() => { setError(''); setLoading(true); setOpen(true); }}>
        Lịch sử
      </button>
      {open && createPortal(
        <div className="phone-call-dialog-backdrop" onMouseDown={() => setOpen(false)}>
          <section className="phone-call-dialog" role="dialog" aria-modal="true" aria-label={`Lịch sử cuộc gọi ${companyName}`}
            onMouseDown={event => event.stopPropagation()}>
            <header className="phone-call-dialog__header">
              <div><strong>Lịch sử cuộc gọi</strong><span>{companyName} · {phone}</span></div>
              <button type="button" onClick={() => setOpen(false)}>Đóng</button>
            </header>
            <div className="phone-call-dialog__body">
              {error && <p className="phone-call-dialog__error" role="alert">{error}</p>}
              {loading && <p className="phone-call-dialog__empty">Đang tải lịch sử...</p>}
              {!loading && timeline.length === 0 && (
                <p className="phone-call-dialog__empty">Chưa có lần gọi nào được ghi nhận.</p>
              )}
              {!loading && timeline.length > 0 && (
                <div className="phone-call-dialog__scroll">
                  <table>
                    <thead><tr><th>Thời gian</th><th>Sale</th><th>Số gọi</th><th>Kết quả</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
                    <tbody>
                      {timeline.map(item => {
                        if (item.legacy) return <tr key={item.id}>
                          <td>{formatCallTime(item.legacy.occurredAt)}</td><td>{item.legacy.createdByName || '—'}</td><td>{phone}</td>
                          <td>Ghi nhận cũ · chưa xác minh kết quả</td><td>{item.legacy.note || '—'}</td><td>—</td>
                        </tr>;
                        const call = item.call!;
                        const canConfirm = canRecord && (call.createdById === currentUser.uid || currentUser.role === 'admin');
                        return <tr key={call.id}>
                          <td>{formatCallTime(call.startedAt)}</td><td>{call.createdByName}</td><td>{call.phone}</td>
                          <td>{editingId === call.id ? <select value={result} onChange={event => setResult(event.target.value as CallResult)}>
                            <option value="pending">Chọn kết quả</option>
                            {RESULT_OPTIONS.map(option => <option key={option} value={option}>{CALL_RESULT_LABELS[option]}</option>)}
                          </select> : CALL_RESULT_LABELS[call.result] || CALL_RESULT_LABELS.pending}</td>
                          <td>{editingId === call.id ? <input value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder="Ghi chú (không bắt buộc)" /> : call.note || '—'}</td>
                          <td>{editingId === call.id ? <span className="phone-call-dialog__actions"><button type="button" disabled={busy || result === 'pending'} onClick={() => { void saveConfirmation(call); }}>Lưu</button><button type="button" disabled={busy} onClick={() => setEditingId('')}>Hủy</button></span>
                            : canConfirm && call.result === 'pending' ? <button type="button" onClick={() => { setEditingId(call.id); setResult('pending'); setNote(''); }}>Xác nhận</button> : '—'}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>, document.body
      )}
    </span>
  );
};
