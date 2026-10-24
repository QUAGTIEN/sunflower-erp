import type React from 'react';
import { useState } from 'react';
import {
  runMutationAction,
  requireConfirmedMutation,
  showSuccessToast,
  showErrorToast
} from '@/shared/feedback/mutationFeedback';
import {
  LEAD_CANDIDATE_SCHEMA_VERSION,
  type LeadCandidateContactLog,
  type LeadCandidateRecord,
  type LeadCandidateTaskSource
} from '@/features/crm/model/leadCandidateModels';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { CandidateWorkspaceView } from '../components/leadCandidateWorkspace/leadCandidateWorkspaceConfig';
import { auditService } from '@/services/auditService';

export interface CandidateBatchQueueInputs {
  workspaceView: CandidateWorkspaceView;
  displayedCandidates: LeadCandidateRecord[];
  canManageCandidate: (candidate: LeadCandidateRecord) => boolean;
  accessibleCandidates: LeadCandidateRecord[];
  currentUser: UserProfile;
  buildCandidateLog: (
    candidate: LeadCandidateRecord,
    details: Partial<LeadCandidateContactLog> & Pick<LeadCandidateContactLog, 'eventType' | 'description'>
  ) => LeadCandidateContactLog;
  buildTaskAssignment: (
    candidate?: LeadCandidateRecord | null | undefined,
    assignedAt?: string
  ) => Pick<LeadCandidateRecord, 'taskSource' | 'taskAssignedAt' | 'taskAssignedById' | 'taskAssignedByName'>;
  prependCandidateLog: (candidate: LeadCandidateRecord, log: LeadCandidateContactLog) => LeadCandidateContactLog[];
  saleUsers: UserProfile[];
  createAdminAssignmentNotification: (
    candidate: LeadCandidateRecord,
    assignee: UserProfile,
    assignedAt: string
  ) => Promise<unknown>;
  setWorkspaceView: React.Dispatch<React.SetStateAction<CandidateWorkspaceView>>;
}

/** Row selection and bulk moves of raw-data candidates into a work queue or to another sale. */
export const useCandidateBatchQueue = ({
  workspaceView,
  displayedCandidates,
  canManageCandidate,
  accessibleCandidates,
  currentUser,
  buildCandidateLog,
  buildTaskAssignment,
  prependCandidateLog,
  saleUsers,
  createAdminAssignmentNotification,
  setWorkspaceView
}: CandidateBatchQueueInputs) => {
  const [selectedQueueCandidateIds, setSelectedQueueCandidateIds] = useState<string[]>([]);
  const [batchAssigneeId, setBatchAssigneeId] = useState('');
  const [batchQueueError, setBatchQueueError] = useState('');
  const [savingBatchQueue, setSavingBatchQueue] = useState(false);

  const selectedQueueCandidateSet = new Set(selectedQueueCandidateIds);
  const queueSelectableDisplayedCandidates =
    workspaceView === 'all'
      ? displayedCandidates.filter(
          candidate => (candidate.status === 'new' || candidate.status === 'retry') && canManageCandidate(candidate)
        )
      : [];
  const allDisplayedQueueCandidatesSelected =
    queueSelectableDisplayedCandidates.length > 0 &&
    queueSelectableDisplayedCandidates.every(candidate => selectedQueueCandidateSet.has(candidate.id));

  const toggleQueueCandidateSelection = (candidateId: string) => {
    setBatchQueueError('');
    setSelectedQueueCandidateIds(previous =>
      previous.includes(candidateId) ? previous.filter(id => id !== candidateId) : [...previous, candidateId]
    );
  };

  const toggleDisplayedQueueCandidates = () => {
    setBatchQueueError('');
    const displayedIds = queueSelectableDisplayedCandidates.map(candidate => candidate.id);
    setSelectedQueueCandidateIds(previous => {
      if (allDisplayedQueueCandidatesSelected) {
        return previous.filter(id => !displayedIds.includes(id));
      }
      return Array.from(new Set([...previous, ...displayedIds]));
    });
  };

  const getSelectedCandidates = () =>
    accessibleCandidates.filter(
      candidate =>
        selectedQueueCandidateSet.has(candidate.id) &&
        (candidate.status === 'new' || candidate.status === 'retry') &&
        canManageCandidate(candidate)
    );

  const addSelectedCandidatesToWorkQueue = async () => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:addSelectedCandidatesToWorkQueue',
      async () => {
        const candidatesToQueue = getSelectedCandidates();
        if (candidatesToQueue.length === 0) return;
        const assignedAt = new Date().toISOString();

        setSavingBatchQueue(true);
        setBatchQueueError('');
        try {
          await Promise.all(
            candidatesToQueue.map(candidate => {
              const targetTaskSource: LeadCandidateTaskSource =
                currentUser.role === 'admin' ? 'admin_assigned' : 'sale_created';
              if (!candidate.workQueueHidden && candidate.taskSource === targetTaskSource) {
                return Promise.resolve(true);
              }
              const log = buildCandidateLog(candidate, {
                eventType: 'activity',
                activityType: 'note',
                description: 'Đưa vào Công việc cần xử lý'
              });
              return requireConfirmedMutation(
                dbService.updateDocument('lead_candidates', candidate.id, {
                  schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
                  ...buildTaskAssignment(candidate, assignedAt),
                  workQueueHidden: false,
                  taskStatus: 'pending',
                  taskDismissedAt: '',
                  contactLogs: prependCandidateLog(candidate, log),
                  updatedBy: currentUser.displayName
                })
              );
            })
          );
          if (currentUser.role === 'admin') {
            const notificationOperations = candidatesToQueue.flatMap(candidate => {
              const assignee = saleUsers.find(user => user.uid === candidate.assignedSaleId);
              return assignee ? [createAdminAssignmentNotification(candidate, assignee, assignedAt)] : [];
            });
            await Promise.all(notificationOperations);
          }
          setSelectedQueueCandidateIds([]);
          setWorkspaceView('tasks');
          candidatesToQueue.forEach(candidate =>
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: 'lead_candidates',
              action: 'candidate_added_to_work_queue',
              summary: `Đưa ${candidate.companyName} vào Công việc cần xử lý`,
              targetType: 'lead_candidate',
              targetId: candidate.id,
              targetLabel: candidate.companyName
            })
          );

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setBatchQueueError(
            'Không thể chuyển một số dữ liệu sang Công việc cần xử lý. Vui lòng kiểm tra quyền Firebase và thử lại.'
          );
        } finally {
          setSavingBatchQueue(false);
        }
      },
      undefined
    );
  };

  const assignSelectedCandidatesToSale = async () => {
    return runMutationAction(
      'LeadCandidateWorkspace.tsx:assignSelectedCandidatesToSale',
      async () => {
        const assignee = saleUsers.find(user => user.uid === batchAssigneeId);
        if (!assignee) {
          setBatchQueueError('Vui lòng chọn Sale nhận bàn giao.');
          return;
        }

        const candidatesToAssign = getSelectedCandidates();
        if (candidatesToAssign.length === 0) return;
        const assignedAt = new Date().toISOString();

        setSavingBatchQueue(true);
        setBatchQueueError('');
        try {
          await Promise.all(
            candidatesToAssign.map(candidate => {
              if (
                !candidate.workQueueHidden &&
                candidate.assignedSaleId === assignee.uid &&
                candidate.taskSource === 'admin_assigned'
              ) {
                return Promise.resolve(true);
              }
              const log = buildCandidateLog(candidate, {
                eventType: 'activity',
                activityType: 'note',
                description: `Bàn giao cho Sale · Phụ trách: ${assignee.displayName}`
              });
              return requireConfirmedMutation(
                dbService.updateDocument('lead_candidates', candidate.id, {
                  schemaVersion: LEAD_CANDIDATE_SCHEMA_VERSION,
                  assignedSaleId: assignee.uid,
                  assignedSaleName: assignee.displayName,
                  ...buildTaskAssignment(candidate, assignedAt),
                  workQueueHidden: false,
                  taskStatus: 'pending',
                  taskDismissedAt: '',
                  contactLogs: prependCandidateLog(candidate, log),
                  updatedBy: currentUser.displayName
                })
              );
            })
          );
          await Promise.all(
            candidatesToAssign.map(candidate => createAdminAssignmentNotification(candidate, assignee, assignedAt))
          );
          setSelectedQueueCandidateIds([]);
          setBatchAssigneeId('');
          setWorkspaceView('tasks');
          candidatesToAssign.forEach(candidate =>
            auditService.recordSafely(currentUser, {
              category: 'business',
              module: 'lead_candidates',
              action: 'candidate_assigned_to_sale',
              summary: `Bàn giao ${candidate.companyName} cho ${assignee.displayName}`,
              targetType: 'lead_candidate',
              targetId: candidate.id,
              targetLabel: candidate.companyName,
              changes: [
                {
                  field: 'assignedSale',
                  label: 'Sale phụ trách',
                  before: candidate.assignedSaleName || 'Chưa phân công',
                  after: assignee.displayName
                }
              ]
            })
          );

          showSuccessToast('Đã lưu thành công');
        } catch {
          showErrorToast();
          setBatchQueueError(
            'Không thể bàn giao một số dữ liệu cho Sale. Vui lòng kiểm tra quyền Firebase và thử lại.'
          );
        } finally {
          setSavingBatchQueue(false);
        }
      },
      undefined
    );
  };

  return {
    selectedQueueCandidateIds,
    setSelectedQueueCandidateIds,
    batchAssigneeId,
    setBatchAssigneeId,
    batchQueueError,
    setBatchQueueError,
    savingBatchQueue,
    selectedQueueCandidateSet,
    queueSelectableDisplayedCandidates,
    allDisplayedQueueCandidatesSelected,
    toggleQueueCandidateSelection,
    toggleDisplayedQueueCandidates,
    addSelectedCandidatesToWorkQueue,
    assignSelectedCandidatesToSale
  };
};
