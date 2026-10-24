import type { UserProfile } from '@/shared/types/user';
import type React from 'react';
import { useState } from 'react';
import {
  type LeadScheduleFormState,
  tomorrowAtNine,
  toDateTimeLocal,
  formatDateTime
} from '../pages/leadsPage/leadsPageConfig';
import { type LeadRecord } from '@/features/crm/model/crmModels';
import {
  runMutationAction,
  requireConfirmedMutation,
  showSuccessToast,
  showErrorToast
} from '@/shared/feedback/mutationFeedback';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import { getNotificationDocumentId, NOTIFICATION_SCHEMA_VERSION } from '@/domain/notificationModels';
import { auditService } from '@/services/auditService';

export interface LeadScheduleInputs {
  leads: LeadRecord[];
  currentUser: UserProfile;
}

/** Follow-up scheduling dialog state and save for leads. */
export const useLeadSchedule = ({ leads, currentUser }: LeadScheduleInputs) => {
  const [scheduleLeadId, setScheduleLeadId] = useState('');
  const [scheduleForm, setScheduleForm] = useState<LeadScheduleFormState>({
    nextFollowUpAt: tomorrowAtNine()
  });
  const [scheduleError, setScheduleError] = useState('');
  const [savingSchedule, setSavingSchedule] = useState(false);

  const scheduleLead = scheduleLeadId ? leads.find(lead => lead.id === scheduleLeadId) || null : null;

  const openScheduleForm = (lead: LeadRecord) => {
    setScheduleLeadId(lead.id);
    setScheduleForm({
      nextFollowUpAt: toDateTimeLocal(lead.nextFollowUpAt) || tomorrowAtNine()
    });
    setScheduleError('');
  };

  const closeScheduleForm = () => {
    setScheduleLeadId('');
    setScheduleError('');
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    return runMutationAction(
      'LeadsPage.tsx:handleSaveSchedule',
      async () => {
        event.preventDefault();
        if (!scheduleLead || !scheduleForm.nextFollowUpAt) return;
        if (!scheduleLead.assignedSaleId) {
          setScheduleError('Vui lòng phân công Sale phụ trách trước khi đặt lịch hẹn.');
          return;
        }

        const nextFollowUpAt = new Date(scheduleForm.nextFollowUpAt).toISOString();
        const now = new Date().toISOString();
        const eventKey = `leads:scheduled:${scheduleLead.id}`;
        const activityNote = `Đặt lịch chăm sóc: ${formatDateTime(nextFollowUpAt)}`;

        setSavingSchedule(true);
        setScheduleError('');
        try {
          await Promise.all([
            requireConfirmedMutation(
              dbService.updateDocument('leads', scheduleLead.id, {
                reminderTime: nextFollowUpAt,
                nextFollowUpAt,
                followUpHandledAt: '',
                followUpHandledById: '',
                followUpHandledByName: '',
                activities: [
                  {
                    id: `activity-schedule-${now}`,
                    type: 'schedule',
                    note: activityNote,
                    occurredAt: now,
                    createdById: currentUser.uid,
                    createdByName: currentUser.displayName
                  },
                  ...(scheduleLead.activities || [])
                ],
                updatedAt: now,
                updatedBy: currentUser.displayName
              })
            ),
            dbService.addDocument('notifications', {
              id: getNotificationDocumentId(scheduleLead.assignedSaleId, eventKey),
              schemaVersion: NOTIFICATION_SCHEMA_VERSION,
              recipientId: scheduleLead.assignedSaleId,
              module: 'leads',
              eventType: 'lead_follow_up_scheduled',
              eventKey,
              entityId: scheduleLead.id,
              entityCode: scheduleLead.companyName,
              title: 'Lịch chăm sóc Lead mới',
              message: `${scheduleLead.companyName} được hẹn chăm sóc vào ${formatDateTime(nextFollowUpAt)}.`,
              createdAt: now,
              createdById: currentUser.uid,
              source: 'manual',
              readAt: null
            })
          ]);

          auditService.recordSafely(currentUser, {
            category: 'business',
            module: 'leads',
            action: 'lead_follow_up_scheduled',
            summary: `Đặt lịch chăm sóc Lead ${scheduleLead.companyName}`,
            targetType: 'lead',
            targetId: scheduleLead.id,
            targetLabel: scheduleLead.companyName,
            changes: [
              {
                field: 'nextFollowUpAt',
                label: 'Lịch chăm sóc',
                before: scheduleLead.nextFollowUpAt,
                after: nextFollowUpAt
              }
            ]
          });
          closeScheduleForm();

          showSuccessToast('Đã lưu thành công');
        } catch (error) {
          showErrorToast();
          console.error('[Leads] Could not save follow-up schedule.', error);
          setScheduleError('Không thể lưu lịch hẹn. Vui lòng thử lại.');
        } finally {
          setSavingSchedule(false);
        }
      },
      event
    );
  };

  return {
    scheduleForm,
    setScheduleForm,
    scheduleError,
    savingSchedule,
    scheduleLead,
    openScheduleForm,
    closeScheduleForm,
    handleSaveSchedule
  };
};
