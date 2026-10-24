import { useEffect, useMemo, useState } from 'react';
import { dbService, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import type { AuditEvent, UserPresence } from '@/services/auditService';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import {
  getEmployeeActivityGroup,
  getSalesReportWindow,
  isVisibleTask,
  RAW_DATA_EMPLOYEE_ACTIONS,
  REPORT_WORK_ACTIONS,
  toDateInputValue,
  type EmployeeActivityCard,
  type EmployeeActivityGroup,
  type EmployeeActivityRange,
  type SalesReportPeriod,
  type SalesReportSummary
} from '../components/leadCandidateWorkspace/leadCandidateWorkspaceConfig';

interface EmployeeActivityMonitorInputs {
  /** Subscriptions run only while an admin has the management view open. */
  enabled: boolean;
  saleUsers: UserProfile[];
  accessibleCandidates: LeadCandidateRecord[];
  referenceTime: number;
}

/** Live presence, recent raw-data activity and period reports for the admin employee monitor. */
export const useEmployeeActivityMonitor = ({
  enabled,
  saleUsers,
  accessibleCandidates,
  referenceTime
}: EmployeeActivityMonitorInputs) => {
  const [employeeActivityEvents, setEmployeeActivityEvents] = useState<AuditEvent[]>([]);
  const [employeePresences, setEmployeePresences] = useState<UserPresence[]>([]);
  const [selectedManagedSaleId, setSelectedManagedSaleId] = useState('');
  const [employeeActivityRange, setEmployeeActivityRange] = useState<EmployeeActivityRange>('today');
  const [employeeActivityGroup, setEmployeeActivityGroup] = useState<EmployeeActivityGroup>('all');
  const [salesReportPeriod, setSalesReportPeriod] = useState<SalesReportPeriod>('week');
  const [salesReportStart, setSalesReportStart] = useState(() =>
    toDateInputValue(new Date(referenceTime - 6 * 24 * 60 * 60 * 1000))
  );
  const [salesReportEnd, setSalesReportEnd] = useState(() => toDateInputValue(new Date(referenceTime)));
  const [salesReportEvents, setSalesReportEvents] = useState<AuditEvent[]>([]);
  const [salesReportLoading, setSalesReportLoading] = useState(false);
  const [salesReportError, setSalesReportError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    const unsubscribeEvents = dbService.subscribeCollection(
      'audit_events',
      data => {
        setEmployeeActivityEvents(
          (data as AuditEvent[])
            .filter(
              event =>
                event.module === 'lead_candidates' &&
                event.category === 'business' &&
                RAW_DATA_EMPLOYEE_ACTIONS.has(event.action)
            )
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        );
      },
      {
        orderByField: 'occurredAt',
        orderDirection: 'desc',
        maxResults: 250
      }
    );
    const unsubscribePresence = dbService.subscribeCollection(
      'user_presence',
      data => {
        setEmployeePresences(data as UserPresence[]);
      },
      {
        fieldName: 'role',
        fieldValue: 'sale'
      }
    );
    return () => {
      unsubscribeEvents();
      unsubscribePresence();
    };
  }, [enabled]);

  const employeeCards = useMemo((): EmployeeActivityCard[] => {
    const now = referenceTime;
    const today = new Date(referenceTime).toLocaleDateString('vi-VN');
    return saleUsers
      .map(sale => {
        const presence = employeePresences.find(item => item.userId === sale.uid);
        const lastSeenAt = presence?.lastSeenAt || '';
        const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
        const minutesSinceSeen = lastSeenTime
          ? Math.max(0, Math.floor((now - lastSeenTime) / 60_000))
          : Number.MAX_SAFE_INTEGER;
        const isInRawData = presence?.lastPageId === 'customer_data';
        const presenceStatus: 'active' | 'idle' | 'offline' =
          isInRawData && presence?.status === 'online' && minutesSinceSeen <= 3
            ? 'active'
            : isInRawData && presence?.status === 'online' && minutesSinceSeen <= 15
              ? 'idle'
              : 'offline';
        const activities = employeeActivityEvents.filter(event => event.actorId === sale.uid);
        const todayActivities = activities.filter(
          event => new Date(event.occurredAt).toLocaleDateString('vi-VN') === today
        );
        const assignedCandidates = accessibleCandidates
          .filter(candidate => candidate.assignedSaleId === sale.uid && isVisibleTask(candidate))
          .sort((left, right) =>
            String(right.updatedAt || right.createdAt).localeCompare(String(left.updatedAt || left.createdAt))
          );
        return {
          sale,
          presence,
          presenceStatus,
          minutesSinceSeen,
          activities,
          todayActivities,
          currentCandidate: assignedCandidates[0] || null,
          assignedCount: assignedCandidates.length,
          touchedCount: new Set(todayActivities.map(event => event.targetId).filter(Boolean)).size,
          callCount: todayActivities.filter(event =>
            ['candidate_phone_called', 'phone_call_started', 'phone_call_manual_recorded'].includes(event.action)
          ).length,
          scheduleCount: todayActivities.filter(event => event.action === 'follow_up_scheduled').length
        };
      })
      .sort((left, right) => {
        const statusOrder = { active: 0, idle: 1, offline: 2 } as const;
        return (
          statusOrder[left.presenceStatus] - statusOrder[right.presenceStatus] ||
          left.sale.displayName.localeCompare(right.sale.displayName, 'vi-VN')
        );
      });
  }, [accessibleCandidates, employeeActivityEvents, employeePresences, referenceTime, saleUsers]);

  const selectedEmployeeCard = employeeCards.find(card => card.sale.uid === selectedManagedSaleId) || null;
  const salesReportWindow = useMemo(
    () => getSalesReportWindow(salesReportPeriod, referenceTime, salesReportStart, salesReportEnd),
    [referenceTime, salesReportEnd, salesReportPeriod, salesReportStart]
  );

  useEffect(() => {
    if (!enabled || !selectedManagedSaleId) return undefined;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setSalesReportLoading(true);
      setSalesReportError('');
      try {
        const data = await dbService.getCollectionByField('audit_events', 'actorId', selectedManagedSaleId, {
          orderByField: 'occurredAt',
          direction: 'desc',
          maxResults: 5000
        });
        if (!active) return;
        setSalesReportEvents(
          (data as AuditEvent[]).filter(
            event =>
              event.module === 'lead_candidates' &&
              event.category === 'business' &&
              RAW_DATA_EMPLOYEE_ACTIONS.has(event.action)
          )
        );
      } catch {
        if (active) setSalesReportError('Không tải được dữ liệu báo cáo. Vui lòng thử lại.');
      } finally {
        if (active) setSalesReportLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [enabled, selectedManagedSaleId]);

  const selectedSalesReport = useMemo((): SalesReportSummary | null => {
    if (!salesReportWindow) return null;
    const events = salesReportEvents.filter(event => {
      const occurredAt = new Date(event.occurredAt).getTime();
      return occurredAt >= salesReportWindow.startAt && occurredAt <= salesReportWindow.endAt;
    });
    const calls = events.filter(event =>
      ['phone_call_started', 'phone_call_manual_recorded', 'candidate_phone_called'].includes(event.action)
    );
    const confirmedCalls = events.filter(event => event.action === 'phone_call_confirmed');
    const processedCandidateIds = new Set(
      events
        .filter(event => REPORT_WORK_ACTIONS.has(event.action))
        .map(event => event.targetId)
        .filter(Boolean)
    );
    const convertedCandidateIds = new Set(
      events
        .filter(event => event.action === 'candidate_converted_to_lead')
        .map(event => event.targetId)
        .filter(Boolean)
    );
    const scheduled = events.filter(event => event.action === 'follow_up_scheduled');
    const created = events.filter(event => event.action === 'candidate_created');
    const activityByDate = new Map<string, AuditEvent[]>();
    events.forEach(event => {
      const key = new Date(event.occurredAt).toLocaleDateString('vi-VN');
      activityByDate.set(key, [...(activityByDate.get(key) || []), event]);
    });
    return {
      events,
      calls,
      confirmedCalls,
      processedCandidateIds,
      convertedCandidateIds,
      scheduled,
      created,
      activityByDate: Array.from(activityByDate.entries())
        .map(([date, dailyEvents]) => ({
          date,
          processed: new Set(
            dailyEvents
              .filter(event => REPORT_WORK_ACTIONS.has(event.action))
              .map(event => event.targetId)
              .filter(Boolean)
          ).size,
          calls: dailyEvents.filter(event =>
            ['phone_call_started', 'phone_call_manual_recorded', 'candidate_phone_called'].includes(event.action)
          ).length,
          schedules: dailyEvents.filter(event => event.action === 'follow_up_scheduled').length,
          converted: new Set(
            dailyEvents
              .filter(event => event.action === 'candidate_converted_to_lead')
              .map(event => event.targetId)
              .filter(Boolean)
          ).size
        }))
        .sort((left, right) => {
          const [leftDay, leftMonth, leftYear] = left.date.split('/').map(Number);
          const [rightDay, rightMonth, rightYear] = right.date.split('/').map(Number);
          return (
            new Date(rightYear, rightMonth - 1, rightDay).getTime() -
            new Date(leftYear, leftMonth - 1, leftDay).getTime()
          );
        })
    };
  }, [salesReportEvents, salesReportWindow]);

  const selectedEmployeeActivities = useMemo(() => {
    if (!selectedEmployeeCard) return [];
    const startOfToday = new Date(referenceTime);
    startOfToday.setHours(0, 0, 0, 0);
    const rangeStart =
      employeeActivityRange === 'today'
        ? startOfToday.getTime()
        : employeeActivityRange === '7days'
          ? referenceTime - 7 * 24 * 60 * 60 * 1000
          : 0;
    return selectedEmployeeCard.activities
      .filter(
        event =>
          new Date(event.occurredAt).getTime() >= rangeStart &&
          (employeeActivityGroup === 'all' || getEmployeeActivityGroup(event.action) === employeeActivityGroup)
      )
      .slice(0, 50);
  }, [employeeActivityGroup, employeeActivityRange, referenceTime, selectedEmployeeCard]);

  return {
    employeeCards,
    selectedManagedSaleId,
    setSelectedManagedSaleId,
    selectedEmployeeCard,
    salesReportWindow,
    salesReportPeriod,
    setSalesReportPeriod,
    salesReportStart,
    salesReportEnd,
    setSalesReportStart,
    setSalesReportEnd,
    salesReportLoading,
    salesReportError,
    selectedSalesReport,
    employeeActivityRange,
    setEmployeeActivityRange,
    employeeActivityGroup,
    setEmployeeActivityGroup,
    selectedEmployeeActivities
  };
};
