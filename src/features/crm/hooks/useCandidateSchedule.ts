import type React from 'react';
import { useState } from 'react';
import {
  type ScheduleFormState,
  tomorrowAtNine,
  toDateTimeLocal,
  CONTACT_RESULT_OUTCOMES,
  CONTACT_STATUS_LABELS,
  formatShortDateTime
} from '../components/leadCandidateWorkspace/leadCandidateWorkspaceConfig';
import type {
  LeadCandidateContactLog,
  LeadCandidateContactResult,
  LeadCandidateRecord
} from '@/features/crm/model/leadCandidateModels';
import {
  runMutationAction,
  requireConfirmedMutation,
  showSuccessToast,
  showErrorToast
} from '@/shared/feedback/mutationFeedback';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';

export interface CandidateScheduleInputs {
  accessibleCandidates: LeadCandidateRecord[];
  canManageCandidate: (candidate: LeadCandidateRecord) => boolean;
  buildCandidateLog: (
    candidate: LeadCandidateRecord,
    details: Partial<LeadCandidateContactLog> & Pick<LeadCandidateContactLog, 'eventType' | 'description'>
  ) => LeadCandidateContactLog;
  buildTaskAssignment: (
    candidate?: LeadCandidateRecord | null | undefined,
    assignedAt?: string
  ) => Pick<LeadCandidateRecord, 'taskSource' | 'taskAssignedAt' | 'taskAssignedById' | 'taskAssignedByName'>;
  prependCandidateLog: (candidate: LeadCandidateRecord, log: LeadCandidateContactLog) => LeadCandidateContactLog[];
  currentUser: UserProfile;
}

/** Next-contact scheduling dialog state and save for raw-data candidates. */
export const useCandidateSchedule = ({
  accessibleCandidates,
  canManageCandidate,
  buildCandidateLog,
  buildTaskAssignment,
  prependCandidateLog,
  currentUser
}: CandidateScheduleInputs) => {
  const [scheduleCandidateId, setScheduleCandidateId] = useState('');

  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({ nextContactAt: tomorrowAtNine(), note: '' });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleContactResult, setScheduleContactResult] = useState<LeadCandidateContactResult | ''>('');

  const scheduleCandidate = scheduleCandidateId
    ? accessibleCandidates.find(candidate => candidate.id === scheduleCandidateId) || null
    : null;

  const openScheduleForm = (candidate: LeadCandidateRecord, contactResult: LeadCandidateContactResult | '' = '') => {
    if (!canManageCandidate(candidate)) return;
    setScheduleCandidateId(candidate.id);
    setScheduleForm({
      nextContactAt: toDateTimeLocal(candidate.nextContactAt) || tomorrowAtNine(),
      note: ''
    });
    setScheduleContactResult(contactResult);
    setScheduleError('');
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:handleSaveSchedule',
      async () => {
        event.preventDefault();
        if (!scheduleCandidate || !scheduleForm.nextContactAt) return;
        const nextContactAt = new Date(scheduleForm.nextContactAt).toISOString();
        setSavingSchedule(true);
        setScheduleError('');
        try {
          const contactResult = scheduleContactResult || scheduleCandidate.contactResult;
          const log = buildCandidateLog(scheduleCandidate, {
            eventType: 'schedule',
            outcome: CONTACT_RESULT_OUTCOMES[contactResult],
            contactResult: scheduleContactResult || '',
            description:
              scheduleContactResult === 'callback'
                ? `Trạng thái: ${CONTACT_STATUS_LABELS.callback} · ${formatShortDateTime(nextContactAt)}`
                : `Đặt lịch liên hệ: ${formatShortDateTime(nextContactAt)}`,
            note: scheduleForm.note.trim(),
            nextContactAt
          });
          await requireConfirmedMutation(
            dbService.updateDocument('lead_candidates', scheduleCandidate.id, {
              nextContactAt,
              ...buildTaskAssignment(scheduleCandidate),
              queuedNextContactAt: '',
              taskStatus: 'pending',
              workStatus: 'pending',
              workQueueHidden: false,
              taskCompletedAt: '',
              taskCompletedById: '',
              taskCompletedByName: '',
              taskDismissedAt: '',
              ...(scheduleContactResult
                ? {
                    contactResult: scheduleContactResult,
                    lastContactAt: log.occurredAt,
                    lastContactOutcome: CONTACT_RESULT_OUTCOMES[scheduleContactResult],
                    lastContactNote: scheduleForm.note.trim(),
                    contactAttempts: scheduleCandidate.contactAttempts + 1
                  }
                : {}),
              contactLogs: prependCandidateLog(scheduleCandidate, log),
              updatedBy: currentUser.displayName
            })
          );
          setScheduleCandidateId('');
          setScheduleContactResult('');
          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'lead_candidates',
            action: 'follow_up_scheduled',
            summary: `Đặt lịch liên hệ ${scheduleCandidate.companyName}`,
            targetType: 'lead_candidate',
            targetId: scheduleCandidate.id,
            targetLabel: scheduleCandidate.companyName,
            changes: [{ field: 'nextContactAt', label: 'Lịch hẹn', after: nextContactAt }]
          });

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
          setScheduleError(
            code.includes('permission-denied')
              ? 'Firebase chưa cấp quyền đặt lịch. Admin cần xuất bản Firestore Rules mới nhất.'
              : 'Không thể lưu lịch hẹn. Vui lòng thử lại.'
          );
        } finally {
          setSavingSchedule(false);
        }
      },
      event
    );
  };

  return {
    setScheduleCandidateId,
    scheduleForm,
    setScheduleForm,
    scheduleError,
    savingSchedule,
    scheduleContactResult,
    setScheduleContactResult,
    scheduleCandidate,
    openScheduleForm,
    handleSaveSchedule
  };
};
