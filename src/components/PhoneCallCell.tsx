import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService, type AuditModule } from '@/services/auditService';
import { CALL_RESULT_LABELS, parseManualCallTime, type CallResult, type PhoneCallRecord } from '@/features/crm/model/callHistory';
import type { LeadCandidateContactLog } from '@/features/crm/model/leadCandidateModels';
import { CallWorkspace, type CallWorkspaceContext } from './CallWorkspace';
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
  context?: CallWorkspaceContext;
  onCallStarted?: () => void | Promise<void>;
}

const RESULT_OPTIONS = (Object.keys(CALL_RESULT_LABELS) as CallResult[]).filter(result => result !== 'pending');
const isPermissionError = (error: unknown) => typeof error === 'object' && error !== null
  && 'code' in error && error.code === 'permission-denied';
const localDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const formatCallTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

export const PhoneCallCell = ({ phone, companyName, subjectKey, historyKeys = [], auditModule, targetType, targetId, currentUser, canRecord, context, onCallStarted }: PhoneCallCellProps) => {
  const [dialog, setDialog] = useState<'history' | 'manual' | 'call-error' | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'overview' | 'history'>('overview');
  const instanceId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const phoneRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [callsByKey, setCallsByKey] = useState<Record<string, PhoneCallRecord[]>>({});
  const [legacyByKey, setLegacyByKey] = useState<Record<string, LeadCandidateContactLog[]>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [editingId, setEditingId] = useState('');
  const [result, setResult] = useState<CallResult>('pending');
  const [note, setNote] = useState('');
  const [manualAt, setManualAt] = useState(localDateTime);
  const [manualResult, setManualResult] = useState<CallResult | ''>('');
  const [manualNote, setManualNote] = useState('');
  const keySignature = [...new Set([subjectKey, ...historyKeys])].sort().join('|');
  const visibleKeys = keySignature.split('|').filter(Boolean);

  useEffect(() => {
    if (dialog !== 'history' && !workspaceOpen) return undefined;
    const keys = keySignature.split('|').filter(Boolean);
    const pendingKeys = new Set(keys);
    const unsubscribers = keys.map(key => dbService.subscribeCollection('call_history', data => {
      setCallsByKey(previous => ({ ...previous, [key]: (data as PhoneCallRecord[]).filter(call => call.subjectKey === key) }));
      pendingKeys.delete(key);
      if (pendingKeys.size === 0) setLoading(false);
    }, {
      fieldName: 'subjectKey', fieldValue: key,
      onError: error => {
        setHistoryError(isPermissionError(error)
          ? 'Tài khoản chưa được cấp quyền xem lịch sử cuộc gọi. Vui lòng báo quản trị viên.'
          : 'Không tải được lịch sử cuộc gọi. Vui lòng thử lại hoặc báo quản trị viên.');
        pendingKeys.delete(key);
        setLoading(false);
      }
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
  }, [dialog, workspaceOpen, keySignature, historyRevision]);

  useEffect(() => {
    if (!workspaceOpen) return undefined;
    const closeOtherWorkspace = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) setWorkspaceOpen(false);
    };
    document.addEventListener('sunflower:call-workspace-open', closeOtherWorkspace);
    return () => document.removeEventListener('sunflower:call-workspace-open', closeOtherWorkspace);
  }, [workspaceOpen, instanceId]);

  useEffect(() => {
    if (!dialog) return undefined;
    const onDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { setDialog(null); phoneRef.current?.focus(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') || []);
      if (controls.length === 0) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
      if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener('keydown', onDialogKeyDown);
    return () => window.removeEventListener('keydown', onDialogKeyDown);
  }, [dialog, busy]);

  useEffect(() => {
    if (dialog) dialogRef.current?.querySelector<HTMLElement>(dialog === 'manual' ? 'input' : 'header button')?.focus();
  }, [dialog]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!phoneRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); phoneRef.current?.focus(); }
    };
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return; }
    const rect = phoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = canRecord ? 122 : 46;
    setMenuPosition({
      top: rect.bottom + menuHeight + 8 < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 196))
    });
    setMenuOpen(true);
  };

  const openHistory = () => {
    setMenuOpen(false);
    setHistoryError('');
    setActionError('');
    setSuccessMessage('');
    setLoading(true);
    setDialog('history');
  };

  const openManual = () => {
    setMenuOpen(false);
    setActionError('');
    setSuccessMessage('');
    setManualAt(localDateTime());
    setManualResult('');
    setManualNote('');
    setDialog('manual');
  };

  const openWorkspace = (initialView: 'overview' | 'history') => {
    setMenuOpen(false);
    setHistoryError('');
    setActionError('');
    setSuccessMessage('');
    setLoading(true);
    setWorkspaceView(initialView);
    document.dispatchEvent(new CustomEvent('sunflower:call-workspace-open', { detail: instanceId }));
    setWorkspaceOpen(true);
  };

  const saveManualCall = async () => {
    if (!canRecord || busy) return;
    const startedAt = parseManualCallTime(manualAt);
    if (!startedAt) {
      setActionError('Vui lòng chọn thời gian cuộc gọi hợp lệ, không ở tương lai.');
      return;
    }
    if (!manualResult || manualResult === 'pending') {
      setActionError('Vui lòng chọn kết quả cuộc gọi.');
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const call = await dbService.addDocument('call_history', {
        subjectKey, companyName, phone, source: 'manual', startedAt,
        createdById: currentUser.uid, createdByName: currentUser.displayName,
        result: manualResult, note: manualNote.trim(),
        confirmedAt: new Date().toISOString(), confirmedById: currentUser.uid,
        confirmedByName: currentUser.displayName
      }) as PhoneCallRecord;
      auditService.recordSafely(currentUser, {
        category: 'business', module: auditModule, action: 'phone_call_manual_recorded',
        summary: `${currentUser.displayName} ghi nhận cuộc gọi ${companyName}: ${CALL_RESULT_LABELS[manualResult]}`,
        targetType, targetId, targetLabel: companyName,
        changes: [{ field: 'callId', label: 'Mã cuộc gọi', after: call.id }]
      });
      await onCallStarted?.();
      openHistory();
      setSuccessMessage('Đã lưu cuộc gọi.');
    } catch (error) {
      setActionError(isPermissionError(error)
        ? 'Tài khoản chưa được cấp quyền ghi nhận cuộc gọi. Vui lòng báo quản trị viên.'
        : 'Không lưu được cuộc gọi. Vui lòng thử lại hoặc báo quản trị viên.');
    } finally {
      setBusy(false);
    }
  };

  const saveConfirmation = async (call: PhoneCallRecord) => {
    if (result === 'pending' || busy) return;
    setBusy(true);
    setActionError('');
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
      setActionError('Không lưu được kết quả cuộc gọi. Vui lòng thử lại.');
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
      <button ref={phoneRef} type="button" className="phone-call-cell__number" title={phone}
        aria-label={`Thao tác với số ${phone}`} aria-haspopup="menu" aria-expanded={menuOpen}
        disabled={busy} onClick={toggleMenu}>
        <span className="erp-adaptive-table-value">{phone}</span>
      </button>
      {menuOpen && createPortal(
        <div ref={menuRef} className="phone-call-cell__menu" role="menu" style={menuPosition}
          onClick={event => event.stopPropagation()}>
          {canRecord && dialNumber && <button type="button" role="menuitem" onClick={() => openWorkspace('overview')}>Mở không gian gọi</button>}
          {canRecord && <button type="button" role="menuitem" onClick={openManual}>Ghi nhận</button>}
          <button type="button" role="menuitem" onClick={() => openWorkspace('history')}>Lịch sử</button>
        </div>, document.body
      )}
      {dialog && createPortal(
        <div className="phone-call-dialog-backdrop" onMouseDown={() => { if (!busy) setDialog(null); }}>
          <section ref={dialogRef} className={`phone-call-dialog${dialog === 'manual' ? ' phone-call-dialog--manual' : ''}${dialog === 'call-error' ? ' phone-call-dialog--error' : ''}`} role="dialog" aria-modal="true"
            aria-label={`${dialog === 'history' ? 'Lịch sử' : dialog === 'manual' ? 'Ghi nhận' : 'Lỗi ghi nhận'} cuộc gọi ${companyName}`}
            onMouseDown={event => event.stopPropagation()}>
            <header className="phone-call-dialog__header">
              <div><strong>{dialog === 'history' ? 'Lịch sử cuộc gọi' : dialog === 'manual' ? 'Ghi nhận cuộc gọi' : 'Không thể bắt đầu cuộc gọi'}</strong><span>{companyName} · {phone}</span></div>
              <button type="button" disabled={busy} onClick={() => setDialog(null)}>Đóng</button>
            </header>
            {dialog === 'call-error' ? <p className="phone-call-dialog__error" role="alert">{actionError}</p> : dialog === 'manual' ? (
              <form className="phone-call-dialog__form" onSubmit={event => { event.preventDefault(); void saveManualCall(); }}>
                {actionError && <p className="phone-call-dialog__error" role="alert">{actionError}</p>}
                <label>Thời gian gọi *<input type="datetime-local" value={manualAt} max={localDateTime()}
                  onChange={event => setManualAt(event.target.value)} required /></label>
                <label>Kết quả cuộc gọi *<select value={manualResult} onChange={event => setManualResult(event.target.value as CallResult | '')} required>
                  <option value="">Chọn kết quả</option>
                  {RESULT_OPTIONS.map(option => <option key={option} value={option}>{CALL_RESULT_LABELS[option]}</option>)}
                </select></label>
                <label>Ghi chú<textarea value={manualNote} maxLength={500} rows={3}
                  onChange={event => setManualNote(event.target.value)} placeholder="Nội dung trao đổi (nếu có)" /></label>
                <div className="phone-call-dialog__form-actions">
                  <button type="button" disabled={busy} onClick={() => setDialog(null)}>Hủy</button>
                  <button type="submit" disabled={busy || !manualResult}>{busy ? 'Đang lưu...' : 'Lưu cuộc gọi'}</button>
                </div>
              </form>
            ) : <div className="phone-call-dialog__body">
              {successMessage && <p className="phone-call-dialog__success" role="status">{successMessage}</p>}
              {actionError && <p className="phone-call-dialog__error" role="alert">{actionError}</p>}
              {historyError && <div className="phone-call-dialog__load-error" role="alert">
                <span>{historyError}</span>
                <button type="button" onClick={() => { setHistoryError(''); setLoading(true); setHistoryRevision(value => value + 1); }}>Thử lại</button>
              </div>}
              {!historyError && loading && <p className="phone-call-dialog__empty">Đang tải lịch sử...</p>}
              {!historyError && !loading && timeline.length === 0 && <p className="phone-call-dialog__empty">Chưa có lần gọi nào được ghi nhận.</p>}
              {!historyError && !loading && timeline.length > 0 && (
                <div className="phone-call-dialog__scroll">
                  <table>
                    <thead><tr><th>Thời gian</th><th>Sale</th><th>Số gọi</th><th>Cách ghi nhận</th><th>Kết quả</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
                    <tbody>
                      {timeline.map(item => {
                        if (item.legacy) return <tr key={item.id}>
                          <td>{formatCallTime(item.legacy.occurredAt)}</td><td>{item.legacy.createdByName || '—'}</td><td>{phone}</td>
                          <td>Ghi nhận cũ</td>
                          <td>Ghi nhận cũ · chưa xác minh kết quả</td><td>{item.legacy.note || '—'}</td><td>—</td>
                        </tr>;
                        const call = item.call!;
                        const canConfirm = canRecord && (call.createdById === currentUser.uid || currentUser.role === 'admin');
                        return <tr key={call.id}>
                          <td>{formatCallTime(call.startedAt)}</td><td>{call.createdByName}</td><td>{call.phone}</td>
                          <td>{call.source === 'manual' ? 'Thủ công' : 'Bấm gọi'}</td>
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
            </div>}
          </section>
        </div>, document.body
      )}
      {workspaceOpen && createPortal(<CallWorkspace
        phone={phone} companyName={companyName} subjectKey={subjectKey}
        targetType={targetType} targetId={targetId} auditModule={auditModule}
        currentUser={currentUser} canRecord={canRecord} context={context} initialView={workspaceView}
        history={timeline.map(item => item.call ? ({
          id: item.id, time: item.time, actor: item.call.createdByName,
          result: CALL_RESULT_LABELS[item.call.result] || CALL_RESULT_LABELS.pending,
          note: item.call.note, phone: item.call.phone
        }) : ({
          id: item.id, time: item.time, actor: item.legacy?.createdByName || 'Chưa rõ',
          result: 'Ghi nhận cũ', note: item.legacy?.note || '', phone
        }))}
        historyLoading={loading} historyError={historyError}
        onCallStarted={onCallStarted} onClose={() => { setWorkspaceOpen(false); phoneRef.current?.focus(); }}
      />, document.querySelector('.app-container') || document.body)}
    </span>
  );
};
