import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { History, Phone } from 'lucide-react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService, type AuditModule } from '@/services/auditService';
import { CALL_RESULT_LABELS, type PhoneCallRecord } from '@/features/crm/model/callHistory';
import { callDraftStorageKey, EMPTY_CALL_DRAFT } from '@/features/crm/model/callWorkspace';
import type { LeadCandidateContactLog } from '@/features/crm/model/leadCandidateModels';
import type { LeadActivityRecord } from '@/features/crm/model/crmModels';
import { CallWorkspace, type CallWorkspaceContext, type CallWorkspaceHistoryRow } from './CallWorkspace';
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
  onOpenDetails?: () => void;
  toolbar?: boolean;
}

const isPermissionError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'permission-denied';

export const PhoneCallCell = ({
  phone,
  companyName,
  subjectKey,
  historyKeys = [],
  auditModule,
  targetType,
  targetId,
  currentUser,
  canRecord,
  context,
  onCallStarted,
  onOpenDetails,
  toolbar = false
}: PhoneCallCellProps) => {
  const [dialog, setDialog] = useState<'notes' | 'history' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(false);
  const [callsByKey, setCallsByKey] = useState<Record<string, PhoneCallRecord[]>>({});
  const [legacyByKey, setLegacyByKey] = useState<Record<string, LeadCandidateContactLog[]>>({});
  const [leadActivitiesByKey, setLeadActivitiesByKey] = useState<Record<string, LeadActivityRecord[]>>({});
  const instanceId = useId();
  const phoneRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const keySignature = [...new Set([subjectKey, ...historyKeys])].sort().join('|');
  const visibleKeys = keySignature.split('|').filter(Boolean);
  const dialNumber = phone.replace(/[^+\d]/g, '');

  useEffect(() => {
    if (!dialog) return undefined;
    const keys = keySignature.split('|').filter(Boolean);
    const pendingKeys = new Set(keys);
    const unsubscribers = keys.map(key =>
      dbService.subscribeCollection(
        'call_history',
        data => {
          setCallsByKey(previous => ({
            ...previous,
            [key]: (data as PhoneCallRecord[]).filter(call => call.subjectKey === key)
          }));
          pendingKeys.delete(key);
          if (pendingKeys.size === 0) setLoading(false);
        },
        {
          fieldName: 'subjectKey',
          fieldValue: key,
          onError: error => {
            setHistoryError(
              isPermissionError(error)
                ? 'Tài khoản chưa được cấp quyền xem lịch sử cuộc gọi. Vui lòng báo quản trị viên.'
                : 'Không tải được lịch sử cuộc gọi. Vui lòng thử lại.'
            );
            pendingKeys.delete(key);
            setLoading(false);
          }
        }
      )
    );
    const candidateKey = keys.find(key => key.startsWith('candidate:'));
    if (candidateKey) {
      void dbService
        .getDocument('lead_candidates', candidateKey.slice('candidate:'.length))
        .then(candidate =>
          setLegacyByKey(previous => ({
            ...previous,
            [candidateKey]: (candidate?.contactLogs || []) as LeadCandidateContactLog[]
          }))
        )
        .catch(() => setLegacyByKey(previous => ({ ...previous, [candidateKey]: [] })));
    }
    const leadKey = keys.find(key => key.startsWith('lead:'));
    if (leadKey) {
      void dbService
        .getDocument('leads', leadKey.slice('lead:'.length))
        .then(lead =>
          setLeadActivitiesByKey(previous => ({
            ...previous,
            [leadKey]: (lead?.activities || []) as LeadActivityRecord[]
          }))
        )
        .catch(() => setLeadActivitiesByKey(previous => ({ ...previous, [leadKey]: [] })));
    }
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [dialog, keySignature]);

  useEffect(() => {
    if (!dialog) return undefined;
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) setDialog(null);
    };
    document.addEventListener('sunflower:call-dialog-open', closeOther);
    return () => document.removeEventListener('sunflower:call-dialog-open', closeOther);
  }, [dialog, instanceId]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('button')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!phoneRef.current?.contains(target) && !menuRef.current?.contains(target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        phoneRef.current?.focus();
      }
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
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = phoneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuHeight = 82;
    setMenuPosition({
      top: rect.bottom + menuHeight + 8 < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 196))
    });
    setActionError('');
    setMenuOpen(true);
  };

  const openDialog = (view: 'notes' | 'history') => {
    setHistoryError('');
    setLoading(true);
    document.dispatchEvent(new CustomEvent('sunflower:call-dialog-open', { detail: instanceId }));
    setDialog(view);
  };

  const startCall = async () => {
    if (!dialNumber || busy) return;
    if (!canRecord) {
      window.location.assign(`tel:${dialNumber}`);
      return;
    }
    setBusy(true);
    setActionError('');
    const startedAt = new Date().toISOString();
    try {
      const call = (await dbService.addDocument('call_history', {
        subjectKey,
        companyName,
        phone,
        startedAt,
        source: 'dial',
        createdById: currentUser.uid,
        createdByName: currentUser.displayName,
        result: 'pending',
        note: '',
        confirmedAt: '',
        confirmedById: '',
        confirmedByName: ''
      })) as PhoneCallRecord;
      const storageKey = callDraftStorageKey(currentUser.uid, subjectKey, phone);
      let savedDraft = EMPTY_CALL_DRAFT;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        savedDraft = { ...EMPTY_CALL_DRAFT, ...(saved.draft || {}) };
      } catch {
        /* A new call can still be recorded if a browser draft is unavailable. */
      }
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ draft: savedDraft, callId: call.id, startedAt, confirmed: false, result: '' })
        );
      } catch {
        /* The call was recorded even if this browser cannot retain its draft. */
      }
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
      setMenuOpen(false);
      window.location.assign(`tel:${dialNumber}`);
      try {
        void Promise.resolve(onCallStarted?.()).catch(() => {});
      } catch {
        /* The call event remains saved if a counter update fails. */
      }
    } catch (error) {
      setActionError(
        isPermissionError(error)
          ? 'Tài khoản chưa được cấp quyền ghi nhận cuộc gọi.'
          : 'Không ghi được lần bấm gọi. Vui lòng thử lại.'
      );
    } finally {
      setBusy(false);
    }
  };

  const timeline = [
    ...visibleKeys
      .flatMap(key => callsByKey[key] || [])
      .map(call => ({
        id: call.id,
        time: call.startedAt,
        actor: call.createdByName,
        result: CALL_RESULT_LABELS[call.result] || CALL_RESULT_LABELS.pending,
        note: call.note,
        phone: call.phone,
        pending: call.result === 'pending',
        createdById: call.createdById,
        kind: 'call' as const
      })),
    ...visibleKeys
      .flatMap(key => legacyByKey[key] || [])
      .map(call => ({
        id: `legacy:${call.id}`,
        time: call.occurredAt,
        actor: call.createdByName || 'Chưa rõ',
        result:
          call.eventType === 'schedule'
            ? 'Đặt lịch liên hệ'
            : call.eventType === 'potential_level'
              ? 'Đánh giá tiềm năng'
              : call.activityType === 'call'
                ? 'Cuộc gọi trước đây'
                : call.activityType === 'message'
                  ? 'Tin nhắn'
                  : call.activityType === 'email'
                    ? 'Email'
                    : call.activityType === 'meeting'
                      ? 'Cuộc hẹn'
                      : 'Ghi chú',
        note: [call.description, call.note].filter(Boolean).join(' · '),
        phone: call.activityType === 'call' ? phone : '',
        kind: (call.eventType === 'schedule'
          ? 'schedule'
          : call.activityType === 'call'
            ? 'call'
            : call.activityType === 'message'
              ? 'message'
              : call.activityType === 'email'
                ? 'email'
                : call.activityType === 'meeting'
                  ? 'meeting'
                  : 'note') as CallWorkspaceHistoryRow['kind']
      })),
    ...visibleKeys
      .flatMap(key => leadActivitiesByKey[key] || [])
      .map(activity => ({
        id: `lead-activity:${activity.id}`,
        time: activity.occurredAt,
        actor: typeof activity.createdByName === 'string' ? activity.createdByName : 'Sale',
        result:
          activity.type === 'schedule'
            ? 'Lịch chăm sóc'
            : activity.type === 'filter_tag'
              ? 'Cập nhật phân loại'
              : 'Hoạt động Tiềm năng',
        note: activity.note,
        phone: '',
        kind: (activity.type === 'schedule' ? 'schedule' : 'note') as CallWorkspaceHistoryRow['kind']
      }))
  ].sort((a, b) => b.time.localeCompare(a.time));

  return (
    <span className={toolbar ? 'phone-call-toolbar' : 'phone-call-cell'} onClick={event => event.stopPropagation()}>
      {toolbar ? (
        <>
          <button
            type="button"
            className="btn btn-outline"
            aria-haspopup="dialog"
            onClick={() => openDialog('notes')}
            disabled={!phone.trim()}
          >
            <Phone size={15} /> Cuộc gọi
          </button>
          <button
            type="button"
            className="btn btn-outline"
            aria-haspopup="dialog"
            onClick={() => openDialog('history')}
          >
            <History size={15} /> Lịch sử
          </button>
        </>
      ) : phone.trim() ? (
        <button
          ref={phoneRef}
          type="button"
          className="phone-call-cell__number"
          title={phone}
          aria-label={`Thao tác với số ${phone}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={busy}
          onClick={toggleMenu}
        >
          <span className="erp-adaptive-table-value">{phone}</span>
        </button>
      ) : (
        <span className="phone-call-cell__empty">Chưa cập nhật</span>
      )}
      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="phone-call-cell__menu"
            role="menu"
            style={menuPosition}
            onClick={event => event.stopPropagation()}
          >
            <button type="button" role="menuitem" disabled={busy || !dialNumber} onClick={() => void startCall()}>
              Gọi
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenDetails?.();
              }}
            >
              Chi tiết
            </button>
            {actionError && (
              <p className="phone-call-cell__menu-error" role="alert">
                {actionError}
              </p>
            )}
          </div>,
          document.body
        )}
      {dialog &&
        createPortal(
          <CallWorkspace
            key={`${subjectKey}:${phone}:${dialog}`}
            phone={phone}
            companyName={companyName}
            subjectKey={subjectKey}
            targetType={targetType}
            targetId={targetId}
            auditModule={auditModule}
            currentUser={currentUser}
            canRecord={canRecord}
            context={context}
            initialView={dialog}
            history={timeline}
            historyLoading={loading}
            historyError={historyError}
            onCallStarted={onCallStarted}
            onClose={() => {
              setDialog(null);
              phoneRef.current?.focus();
            }}
          />,
          document.body
        )}
    </span>
  );
};
