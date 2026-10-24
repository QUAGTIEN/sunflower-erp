import {
  requireConfirmedMutation,
  showErrorToast,
  showSuccessToast,
  runMutationAction
} from '@/shared/feedback/mutationFeedback';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  History,
  Mail,
  MessageCircle,
  Package,
  Phone,
  PhoneMissed,
  PhoneOff,
  RotateCcw,
  SignalHigh,
  SignalLow,
  SignalMedium,
  StickyNote,
  UserRound,
  X,
  type LucideIcon
} from 'lucide-react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService, type AuditModule } from '@/services/auditService';
import { CALL_RESULT_LABELS, type CallResult, type PhoneCallRecord } from '@/features/crm/model/callHistory';
import {
  CALL_NEXT_ACTION_LABELS,
  EMPTY_CALL_DRAFT,
  callDraftStorageKey,
  callSummaryNote,
  validateCallWrap,
  type CallDraft,
  type CallNextAction
} from '@/features/crm/model/callWorkspace';
import './CallWorkspace.css';

export interface CallWorkspaceContext {
  phoneLabel?: string;
  contactPerson?: string;
  contactPosition?: string;
  province?: string;
  businessSector?: string;
  expectedProducts?: string;
  source?: string;
  assignedSaleName?: string;
}

export interface CallWorkspaceHistoryRow {
  id: string;
  time: string;
  actor: string;
  result: string;
  note: string;
  phone: string;
  pending?: boolean;
  createdById?: string;
  kind?: 'call' | 'schedule' | 'message' | 'email' | 'meeting' | 'note';
}

interface Props {
  phone: string;
  companyName: string;
  subjectKey: string;
  targetType: 'lead_candidate' | 'lead' | 'customer';
  targetId: string;
  auditModule: AuditModule;
  currentUser: UserProfile;
  canRecord: boolean;
  context?: CallWorkspaceContext;
  initialView: 'notes' | 'history';
  history: CallWorkspaceHistoryRow[];
  historyLoading: boolean;
  historyError: string;
  onCallStarted?: () => void | Promise<void>;
  onClose: () => void;
}

type View = 'notes' | 'history';
const RESULTS = (Object.keys(CALL_RESULT_LABELS) as CallResult[]).filter(value => value !== 'pending');
const ACTIONS = Object.keys(CALL_NEXT_ACTION_LABELS) as CallNextAction[];
const RESULT_ICONS: Record<Exclude<CallResult, 'pending'>, LucideIcon> = {
  discussed: MessageCircle,
  no_answer: PhoneMissed,
  busy: PhoneOff,
  callback: RotateCcw,
  wrong_number: PhoneOff,
  not_interested: X
};
const ACTION_ICONS: Record<CallNextAction, LucideIcon> = {
  none: X,
  callback: Phone,
  quote: FileText,
  sample: Package,
  meeting: CalendarDays,
  zalo: MessageCircle,
  email: Mail
};
const HISTORY_ICONS: Record<NonNullable<CallWorkspaceHistoryRow['kind']>, LucideIcon> = {
  call: Phone,
  schedule: CalendarDays,
  message: MessageCircle,
  email: Mail,
  meeting: UserRound,
  note: StickyNote
};
const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
    : 'Chưa rõ';
};
const isMobile = () => window.matchMedia('(max-width: 900px)').matches;

function readSavedDraft(key: string): {
  draft: CallDraft;
  callId: string;
  startedAt: string;
  confirmed: boolean;
  result: CallResult | '';
} {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
    const values = saved.draft && typeof saved.draft === 'object' ? (saved.draft as Record<string, unknown>) : {};
    const draft = { ...EMPTY_CALL_DRAFT };
    (Object.keys(draft) as Array<keyof CallDraft>).forEach(field => {
      if (typeof values[field] === 'string') Object.assign(draft, { [field]: values[field] });
    });
    if (!Object.hasOwn(CALL_NEXT_ACTION_LABELS, draft.nextAction)) draft.nextAction = 'none';
    const savedResult =
      typeof saved.result === 'string' && Object.hasOwn(CALL_RESULT_LABELS, saved.result) && saved.result !== 'pending'
        ? (saved.result as CallResult)
        : '';
    return {
      draft,
      callId: typeof saved.callId === 'string' ? saved.callId : '',
      startedAt: typeof saved.startedAt === 'string' ? saved.startedAt : '',
      confirmed: saved.confirmed === true,
      result: savedResult
    };
  } catch {
    return { draft: { ...EMPTY_CALL_DRAFT }, callId: '', startedAt: '', confirmed: false, result: '' };
  }
}

export function CallWorkspace({
  phone,
  companyName,
  subjectKey,
  targetType,
  targetId,
  auditModule,
  currentUser,
  canRecord,
  context,
  initialView,
  history,
  historyLoading,
  historyError,
  onCallStarted,
  onClose
}: Props) {
  const storageKey = callDraftStorageKey(currentUser.uid, subjectKey, phone);
  const [saved] = useState(() => readSavedDraft(storageKey));
  const [draft, setDraft] = useState<CallDraft>(saved.draft);
  const [callId, setCallId] = useState(saved.callId);
  const [startedAt, setStartedAt] = useState(saved.startedAt);
  const [view, setView] = useState<View>(initialView);
  const [result, setResult] = useState<CallResult | ''>(saved.result);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(saved.confirmed);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const dialNumber = phone.replace(/[^+\d]/g, '');

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'
        ) || []
      );
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls[controls.length - 1].focus();
      }
      if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) {
        event.preventDefault();
        controls[0].focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy]);

  useEffect(() => {
    if (completed) return;
    localStorage.setItem(storageKey, JSON.stringify({ draft, callId, startedAt, confirmed, result }));
  }, [storageKey, draft, callId, startedAt, confirmed, result, completed]);

  useEffect(() => {
    if (!saved.callId) return;
    void dbService
      .getDocument('call_history', saved.callId)
      .then((call: PhoneCallRecord | null) => {
        if (call && call.result !== 'pending' && !saved.confirmed) {
          setCallId('');
          setStartedAt('');
          setView('notes');
        } else if (call && call.result === 'pending' && saved.confirmed) {
          setConfirmed(false);
        }
      })
      .catch(() => {
        /* A saved draft remains available while offline. */
      });
  }, [saved.callId, saved.confirmed]);

  const updateDraft = <K extends keyof CallDraft>(field: K, value: CallDraft[K]) => {
    setDraft(previous => ({ ...previous, [field]: value }));
    setMessage('Bản nháp đã lưu trên trình duyệt này.');
  };

  const startCall = async (openDialer: boolean) => {
    if (!canRecord || busy || callId) return;
    setBusy(true);
    setError('');
    setCompleted(false);
    const now = new Date().toISOString();
    try {
      const call = (await dbService.addDocument('call_history', {
        subjectKey,
        companyName,
        phone,
        startedAt: now,
        source: 'dial',
        createdById: currentUser.uid,
        createdByName: currentUser.displayName,
        result: 'pending',
        note: '',
        confirmedAt: '',
        confirmedById: '',
        confirmedByName: ''
      })) as PhoneCallRecord;
      setCallId(call.id);
      setStartedAt(now);
      setView('notes');
      localStorage.setItem(
        storageKey,
        JSON.stringify({ draft, callId: call.id, startedAt: now, confirmed: false, result: '' })
      );
      auditService.recordSafely(currentUser, {
        category: 'business',
        module: auditModule,
        action: 'phone_call_started',
        summary: `${currentUser.displayName} bấm gọi ${companyName} · ${phone}`,
        targetType,
        targetId,
        targetLabel: companyName,
        changes: [{ field: 'callId', label: 'Mã cuộc gọi', after: call.id }]
      });
      if (openDialer) window.location.assign(`tel:${dialNumber}`);
      else setMessage('Đã ghi nhận thao tác gọi. Vui lòng nhập ghi chú và kết quả.');
      try {
        await onCallStarted?.();
      } catch {
        setMessage('Đã ghi lần bấm gọi nhưng chưa cập nhật được số lần liên hệ.');
      }
    } catch {
      setError('Không ghi được lần bấm gọi. Vui lòng thử lại trước khi ghi kết quả.');
    } finally {
      setBusy(false);
    }
  };

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(phone);
      setMessage('Đã sao chép số. Sau khi thực sự gọi, chọn “Tôi đã gọi bằng điện thoại”.');
    } catch {
      setError('Không sao chép được số. Vui lòng chọn và sao chép số hiển thị ở trên.');
    }
  };

  const saveWrap = async () => {
    return runMutationAction(
      'CallWorkspace.tsx:saveWrap',
      async () => {
        if (!canRecord || !callId || busy) return;
        const validationError = validateCallWrap(result, draft);
        if (validationError) {
          setError(validationError);
          return;
        }
        const selectedResult = result as CallResult;
        const followUpDate = new Date(draft.followUpAt);
        const summary = callSummaryNote(draft);
        setBusy(true);
        setError('');
        let callSaved = confirmed;
        try {
          if (!confirmed) {
            await requireConfirmedMutation(
              dbService.updateDocument('call_history', callId, {
                result: selectedResult,
                note: summary,
                confirmedAt: new Date().toISOString(),
                confirmedById: currentUser.uid,
                confirmedByName: currentUser.displayName
              })
            );
            callSaved = true;
            setConfirmed(true);
            localStorage.setItem(
              storageKey,
              JSON.stringify({ draft, callId, startedAt, confirmed: true, result: selectedResult })
            );
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: auditModule,
              action: 'phone_call_confirmed',
              summary: `${currentUser.displayName} xác nhận cuộc gọi ${companyName}: ${CALL_RESULT_LABELS[selectedResult]}`,
              targetType,
              targetId,
              targetLabel: companyName,
              changes: [
                {
                  field: 'result',
                  label: 'Kết quả cuộc gọi',
                  before: CALL_RESULT_LABELS.pending,
                  after: CALL_RESULT_LABELS[selectedResult]
                }
              ]
            });
          }
          if (draft.nextAction !== 'none') {
            const now = new Date().toISOString();
            const taskId = `call-follow-up-${callId}`;
            await dbService.addDocument('work_schedule_items', {
              id: taskId,
              title: `${CALL_NEXT_ACTION_LABELS[draft.nextAction]} · ${companyName}`,
              description: draft.followUpNote.trim(),
              stage: '',
              assigneeId: currentUser.uid,
              assigneeName: currentUser.displayName,
              department: 'Sale',
              assignedById: currentUser.uid,
              assignedByName: currentUser.displayName,
              requestedById: '',
              requestedByName: '',
              startAt: now,
              endAt: followUpDate.toISOString(),
              status: 'not_started',
              progress: 0,
              referenceType: targetType,
              referenceId: targetId,
              referenceLabel: companyName,
              notes: `Tạo từ cuộc gọi ${callId}`,
              priority: 'normal',
              taskType: 'personal_task',
              groupId: 'self',
              groupName: 'Việc tự tạo cho chính mình',
              workType: 'business',
              createdAt: now,
              updatedAt: now,
              deleted: false
            });
          }
          localStorage.removeItem(storageKey);
          setCompleted(true);
          setCallId('');
          setStartedAt('');
          setDraft({ ...EMPTY_CALL_DRAFT });
          setConfirmed(false);
          setResult('');
          setView('notes');
          setMessage(draft.nextAction === 'none' ? 'Đã lưu kết quả cuộc gọi.' : 'Đã lưu kết quả và tạo lịch làm việc.');

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setError(
            callSaved
              ? 'Đã lưu kết quả nhưng chưa tạo được lịch. Vui lòng thử lại.'
              : 'Không hoàn tất được cuộc gọi. Vui lòng thử lại.'
          );
        } finally {
          setBusy(false);
        }
      },
      undefined
    );
  };

  return (
    <div
      className="phone-call-dialog-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="phone-call-workspace"
        role="dialog"
        aria-modal="true"
        aria-label={`${view === 'history' ? 'Lịch sử' : 'Cuộc gọi'} ${companyName}`}
      >
        <header className="phone-call-workspace__header">
          <div>
            <strong className="phone-call-workspace__title">
              {view === 'history' ? <History aria-hidden="true" /> : <Phone aria-hidden="true" />}
              {view === 'history' ? 'Lịch sử hoạt động' : 'Cuộc gọi'}
            </strong>
            <span>
              {companyName} · {phone}
            </span>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Đóng popup">
            <X aria-hidden="true" /> Đóng
          </button>
        </header>
        {view === 'notes' && (
          <div className="phone-call-workspace__identity">
            <span>
              {[context?.contactPerson, context?.contactPosition, context?.phoneLabel].filter(Boolean).join(' · ') ||
                'Chưa có người liên hệ'}
            </span>
            <strong>{callId ? `Đã bấm gọi lúc ${dateTimeLabel(startedAt)}` : 'Chưa ghi nhận lần gọi'}</strong>
            <small>ERP không tự xác định trạng thái kết nối hoặc thời lượng cuộc gọi.</small>
          </div>
        )}
        <div className="phone-call-workspace__content">
          {error && (
            <p className="phone-call-workspace__error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="phone-call-workspace__message" role="status">
              {message}
            </p>
          )}
          {view === 'notes' && (
            <>
              <h3>
                <StickyNote aria-hidden="true" /> Ghi chú cuộc gọi
              </h3>
              <label>
                Nhu cầu khách hàng
                <textarea
                  maxLength={120}
                  rows={2}
                  value={draft.need}
                  onChange={event => updateDraft('need', event.target.value)}
                />
              </label>
              <div className="phone-call-workspace__form-grid">
                <label>
                  Sản phẩm quan tâm
                  <input
                    maxLength={80}
                    value={draft.product}
                    onChange={event => updateDraft('product', event.target.value)}
                  />
                </label>
                <label>
                  Số lượng dự kiến
                  <input
                    maxLength={40}
                    value={draft.quantity}
                    onChange={event => updateDraft('quantity', event.target.value)}
                  />
                </label>
              </div>
              <div className="phone-call-workspace__form-grid">
                <label>
                  Giá mục tiêu
                  <input
                    maxLength={40}
                    value={draft.targetPrice}
                    onChange={event => updateDraft('targetPrice', event.target.value)}
                  />
                </label>
                <label>
                  Ghi chú khác
                  <textarea
                    maxLength={120}
                    rows={2}
                    value={draft.note}
                    onChange={event => updateDraft('note', event.target.value)}
                  />
                </label>
              </div>
              <h3>
                <ClipboardList aria-hidden="true" /> Kết quả cuộc gọi{' '}
                <span className="phone-call-workspace__required">*</span>
              </h3>
              <div className="phone-call-workspace__choices">
                {RESULTS.map(option => {
                  const Icon = RESULT_ICONS[option as Exclude<CallResult, 'pending'>];
                  return (
                    <button
                      key={option}
                      type="button"
                      className={result === option ? 'is-selected' : ''}
                      onClick={() => setResult(option)}
                      aria-pressed={result === option}
                    >
                      <Icon aria-hidden="true" />
                      {CALL_RESULT_LABELS[option]}
                    </button>
                  );
                })}
              </div>
              <h3>
                <SignalHigh aria-hidden="true" /> Mức độ tiềm năng
              </h3>
              <div className="phone-call-workspace__potential">
                {(['high', 'medium', 'low'] as const).map(level => {
                  const Icon = level === 'high' ? SignalHigh : level === 'medium' ? SignalMedium : SignalLow;
                  return (
                    <button
                      key={level}
                      type="button"
                      className={draft.potentialLevel === level ? 'is-selected' : ''}
                      onClick={() => updateDraft('potentialLevel', level)}
                      aria-pressed={draft.potentialLevel === level}
                    >
                      <Icon aria-hidden="true" />
                      {level === 'high' ? 'Cao' : level === 'medium' ? 'Trung bình' : 'Thấp'}
                    </button>
                  );
                })}
              </div>
              <h3>
                <CheckCircle2 aria-hidden="true" /> Bước tiếp theo
              </h3>
              <div className="phone-call-workspace__actions">
                {ACTIONS.map(action => {
                  const Icon = ACTION_ICONS[action];
                  return (
                    <button
                      key={action}
                      type="button"
                      className={draft.nextAction === action ? 'is-selected' : ''}
                      onClick={() => updateDraft('nextAction', action)}
                      aria-pressed={draft.nextAction === action}
                    >
                      <Icon aria-hidden="true" />
                      {CALL_NEXT_ACTION_LABELS[action]}
                    </button>
                  );
                })}
              </div>
              {draft.nextAction !== 'none' && (
                <div className="phone-call-workspace__follow-up">
                  <h4>
                    <CalendarDays aria-hidden="true" /> Thông tin lịch làm việc
                  </h4>
                  <div className="phone-call-workspace__form-grid">
                    <label>
                      Thời gian thực hiện *
                      <input
                        type="datetime-local"
                        value={draft.followUpAt}
                        onChange={event => updateDraft('followUpAt', event.target.value)}
                      />
                    </label>
                    <label>
                      Nội dung cần làm *
                      <textarea
                        rows={2}
                        maxLength={120}
                        value={draft.followUpNote}
                        onChange={event => updateDraft('followUpNote', event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )}
              <p className="phone-call-workspace__muted">
                Bản nháp được lưu trên trình duyệt này. Chọn kết quả rồi lưu để ghi vào lịch sử.
              </p>
            </>
          )}
          {view === 'history' && (
            <>
              {historyError && <p className="phone-call-workspace__error">{historyError}</p>}
              {historyLoading && <p className="phone-call-workspace__muted">Đang tải lịch sử...</p>}
              {!historyLoading && !historyError && !history.length && (
                <p className="phone-call-workspace__muted">Chưa có hoạt động cuộc gọi.</p>
              )}
              <div className="phone-call-workspace__history">
                {history.map(row => {
                  const Icon = HISTORY_ICONS[row.kind || 'call'];
                  return (
                    <div key={row.id} className={`phone-call-workspace__history-row is-${row.kind || 'call'}`}>
                      <span className="phone-call-workspace__history-icon">
                        <Icon aria-hidden="true" />
                      </span>
                      <time>
                        <Clock3 aria-hidden="true" />
                        {dateTimeLabel(row.time)}
                      </time>
                      <strong>{row.result}</strong>
                      <small>
                        {row.actor}
                        {row.phone && ` · ${row.phone}`}
                      </small>
                      <p>{row.note || 'Chưa có ghi chú.'}</p>
                      {row.pending &&
                        canRecord &&
                        (row.createdById === currentUser.uid || currentUser.role === 'admin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setCallId(row.id);
                              setStartedAt(row.time);
                              setConfirmed(false);
                              setResult('');
                              setView('notes');
                            }}
                          >
                            Ghi kết quả cuộc gọi này
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <footer className="phone-call-workspace__footer">
          {view === 'history' ? (
            <button type="button" onClick={onClose}>
              Đóng
            </button>
          ) : !canRecord ? (
            <span>Chỉ xem thông tin cuộc gọi</span>
          ) : (
            <>
              <span>{callId ? 'Đã ghi nhận thao tác gọi' : 'Chưa ghi nhận thao tác gọi'}</span>
              {!callId && (
                <>
                  <button type="button" onClick={() => void copyNumber()}>
                    Sao chép số
                  </button>
                  <button type="button" onClick={() => void startCall(false)} disabled={busy}>
                    Tôi đã gọi
                  </button>
                  <button type="button" onClick={() => void startCall(true)} disabled={busy || !dialNumber}>
                    {isMobile() ? 'Gọi bằng điện thoại' : 'Mở ứng dụng gọi'}
                  </button>
                </>
              )}
              <button
                type="button"
                className="is-primary"
                onClick={() => void saveWrap()}
                disabled={busy || !callId || !result}
              >
                {busy ? 'Đang lưu...' : draft.nextAction === 'none' ? 'Lưu cuộc gọi' : 'Lưu cuộc gọi và tạo lịch'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
