import { USER_ROLE_LABELS, isUserRole } from '@/shared/types';
import { PO_QUEUE_STATES, getPOQueueStatus, type POQueueStatus } from './poWorkflow';

export interface OrderHistoryLog {
  status?: string;
  updatedAt?: string;
  updatedBy?: string;
  note?: string;
}

export interface OrderStep {
  value: POQueueStatus;
  label: string;
  state: 'done' | 'current' | 'pending';
  /** First time the order reached this step, from its history; empty when unknown. */
  reachedAt: string;
  reachedBy: string;
}

export const orderSteps = (po: { status?: string; historyLogs?: OrderHistoryLog[] }): OrderStep[] => {
  const currentIndex = PO_QUEUE_STATES.findIndex(state => state.value === getPOQueueStatus(po));
  const logs = Array.isArray(po.historyLogs) ? po.historyLogs : [];
  return PO_QUEUE_STATES.map((state, index) => {
    const reached = logs.find(log => getPOQueueStatus(log.status) === state.value);
    return {
      value: state.value,
      label: state.label,
      state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending',
      reachedAt: index <= currentIndex ? reached?.updatedAt || '' : '',
      reachedBy: index <= currentIndex ? reached?.updatedBy || '' : ''
    };
  });
};

/** Older records store the actor as "Name (ROLE)"; show the Vietnamese role name instead of the code. */
export const actorLabel = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = text.match(/^(.*)\s\(([A-Z_]+)\)$/);
  if (!match) return text;
  const role = match[2].toLowerCase();
  return isUserRole(role) ? `${match[1]} (${USER_ROLE_LABELS[role]})` : text;
};
