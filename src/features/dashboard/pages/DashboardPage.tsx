import { confirmDelete } from '@/shared/feedback/deleteConfirmation';
import { requireConfirmedMutation, showErrorToast, showSuccessToast, runMutationAction } from '@/shared/feedback/mutationFeedback';
import React, { useEffect, useMemo, useState } from 'react';
import { dbService, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { useLanguage } from '@/context/LanguageContext';
import { DonutChart } from '@/components/VisualCharts';
import { ensureReceivableInvoice } from '@/features/sales/api/poWorkflowService';
import { calculatePOItemFinancials } from '@/domain/poFinancials';
import { DesignRequest } from '@/features/design/model/designWorkflow';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { productionQuantityLabel, PRODUCTION_STATUSES, type ProductionStatus } from '@/features/production/model/productionOrder';
import {
  Bell, ChevronDown, ChevronUp, ClipboardList, Clock, Plus, Sliders, Trash2
} from 'lucide-react';
import {
  getPOBadgeClass,
  getPOHistoryStatusLabel,
  getPOQueueLabel,
  getPOQueueStatus,
  getPOQueueUpdate,
  isPOCompleted,
  isPOInQueue,
  PO_QUEUE_STATES,
  POQueueStatus
} from '@/features/sales/model/poWorkflow';
import { PageBackButton } from '@/components/PageBackButton';
import { PageContextHeader } from '@/components/PageContextHeader';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import type { CustomerInsightModule } from '@/features/crm/model/customerInsightCatalog';
import {
  WORK_SCHEDULE_PRIORITY_LABELS,
  DEFAULT_WORK_SCHEDULE_GROUPS,
  inferWorkScheduleGroupId,
  normalizeWorkScheduleRecords,
  type WorkScheduleRecord
} from '@/features/work-schedule/model/workScheduleModels';
import { CustomerInsightDashboard } from '@/features/dashboard/components/CustomerInsightDashboard';
import './Dashboard.css';

interface DashboardProps {
  user: UserProfile;
  users: UserProfile[];
  pos: any[];
  designRequests: DesignRequest[];
  customers: CustomerRecord[];
  leads: LeadRecord[];
  candidates: LeadCandidateRecord[];
  inventory: any[];
  purchaseOrders: any[];
  productionCommands: any[];
  invoices: any[];
  onNavigate: (page: string) => void;
  onNavigateInsight: (module: CustomerInsightModule, itemId: string) => void;
  onNavigateWorkGroup: (groupId: string) => void;
  onOpenPO: (poId: string) => void;
}

interface PORevenueMetrics {
  gross: number;
  directDiscount: number;
  net: number;
}

interface RevenueTrendPoint extends PORevenueMetrics {
  label: string;
}

type SalePoFilter = 'all' | 'waiting_design' | 'waiting_production' | 'waiting_delivery';

const SALE_ACTIVE_TASK_STATUSES = new Set([
  'not_started',
  'in_progress',
  'waiting_customer',
  'support_requested',
  'awaiting_confirmation',
  'paused'
]);

const SALE_FUNNEL_STAGES = [
  { id: 'new', label: 'Mới tiếp nhận', color: '#2f6edb' },
  { id: 'contacted', label: 'Đã liên hệ', color: '#2fb5ca' },
  { id: 'quoted', label: 'Đã báo giá', color: '#e6a23c' },
  { id: 'negotiating', label: 'Đang đàm phán', color: '#43a978' }
] as const;

const nonnegativeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const calculatePORevenueMetrics = (po: Record<string, unknown>): PORevenueMetrics => {
  const items: Record<string, unknown>[] = Array.isArray(po.items)
    ? po.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
  const itemFinancials: ReturnType<typeof calculatePOItemFinancials>[] = items
    .map((item: Record<string, unknown>) => calculatePOItemFinancials(item));
  const itemGross = itemFinancials.reduce((sum, item) => sum + item.grossAmount, 0);
  const itemDiscount = itemFinancials.reduce((sum, item) => sum + item.discountAmount, 0);
  const itemNet = itemFinancials.reduce((sum, item) => sum + item.amountBeforeVat, 0);
  const storedTotal = nonnegativeNumber(po.totalAmount);
  const storedNet = nonnegativeNumber(po.netAmount);
  const storedDiscount = Math.max(nonnegativeNumber(po.discountAmount), itemDiscount);
  const hasModernItemFinancials = items.some(item => (
    item.discountType !== undefined || item.discountRate !== undefined || item.discountAmount !== undefined
  ));

  if (storedDiscount > 0 || hasModernItemFinancials) {
    const net = storedTotal || itemNet;
    return {
      gross: net + storedDiscount,
      directDiscount: storedDiscount,
      net
    };
  }

  // Legacy POs stored totalAmount before discount and netAmount after discount.
  if (storedTotal > 0 && storedNet > 0 && storedNet < storedTotal) {
    return {
      gross: storedTotal,
      directDiscount: storedTotal - storedNet,
      net: storedNet
    };
  }

  const gross = itemGross || storedTotal || storedNet;
  const net = itemNet || storedTotal || storedNet;
  return { gross, directDiscount: Math.max(0, gross - net), net };
};

const getPayableDiscountAmount = (po: Record<string, unknown>) => Math.max(
  nonnegativeNumber(po.discountPayableAmount),
  nonnegativeNumber(po.rebateAmount),
  nonnegativeNumber(po.discountSettlementAmount)
);

const formatCompactMoney = (value: number) => {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tỷ`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return value.toLocaleString('vi-VN');
};

const RevenueTrendChart: React.FC<{ data: RevenueTrendPoint[] }> = ({ data }) => {
  const width = 620;
  const height = 174;
  const paddingLeft = 52;
  const paddingRight = 20;
  const plotTop = 22;
  const plotBottom = 136;
  const plotHeight = plotBottom - plotTop;
  const step = (width - paddingLeft - paddingRight) / Math.max(data.length, 1);
  const rawMaxValue = Math.max(...data.map(point => point.gross), 0);
  const magnitude = rawMaxValue > 0 ? 10 ** Math.floor(Math.log10(rawMaxValue)) : 1;
  const normalizedMax = rawMaxValue / magnitude;
  const scaleMax = rawMaxValue === 0
    ? 1
    : (normalizedMax <= 1 ? 1 : normalizedMax <= 2 ? 2 : normalizedMax <= 5 ? 5 : 10) * magnitude;
  const tickRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="dashboard-revenue-trend">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Giá trị PO trước và sau chiết khấu trong sáu tháng gần nhất">
        <desc>Phần navy là doanh thu sau chiết khấu. Phần champagne là chiết khấu trực tiếp. Tổng chiều cao cột là giá trị trước chiết khấu.</desc>
        {tickRatios.map(ratio => {
          const y = plotBottom - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} className="dashboard-revenue-trend__grid" />
              <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="dashboard-revenue-trend__axis-label">
                {ratio === 0 ? '0' : formatCompactMoney(scaleMax * ratio)}
              </text>
            </g>
          );
        })}
        {data.map((point, index) => {
          const grossHeight = (point.gross / scaleMax) * plotHeight;
          const netHeight = (point.net / scaleMax) * plotHeight;
          const discountHeight = Math.max(0, grossHeight - netHeight);
          const x = paddingLeft + (index * step) + (step / 2) - 16;
          return (
            <g key={`${point.label}-${index}`}>
              <title>{`${point.label}: trước chiết khấu ${point.gross.toLocaleString('vi-VN')} đ; sau chiết khấu ${point.net.toLocaleString('vi-VN')} đ; chiết khấu trực tiếp ${point.directDiscount.toLocaleString('vi-VN')} đ`}</title>
              {point.net > 0 && <rect x={x} y={plotBottom - netHeight} width="32" height={netHeight} rx={discountHeight > 0 ? 0 : 3} className="dashboard-revenue-trend__net" />}
              {discountHeight > 0 && <rect x={x} y={plotBottom - grossHeight} width="32" height={discountHeight} rx="3" className="dashboard-revenue-trend__discount" />}
              {point.gross > 0 && (
                <text x={x + 16} y={Math.max(12, plotBottom - grossHeight - 6)} textAnchor="middle" className="dashboard-revenue-trend__value">
                  {formatCompactMoney(point.gross)}
                </text>
              )}
              <text x={x + 16} y={plotBottom + 19} textAnchor="middle" className="dashboard-revenue-trend__label">{point.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="dashboard-revenue-trend__legend" aria-hidden="true">
        <span><i className="is-net" />Sau chiết khấu</span>
        <span><i className="is-discount" />Chiết khấu trực tiếp</span>
      </div>
    </div>
  );
};

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  pos,
  designRequests,
  customers,
  leads,
  candidates,
  inventory,
  purchaseOrders,
  productionCommands,
  onNavigate,
  onNavigateInsight,
  onNavigateWorkGroup,
  onOpenPO
}) => {
  const { t } = useLanguage();

  // Filter out deleted documents
  const activePOsList = (pos || []).filter(po => !po.deleted);
  const activeDesignRequests = (designRequests || []).filter(request => (
    request.archived !== true
    && (user.role !== 'designer' || !request.assignedDesignerId || request.assignedDesignerId === user.uid)
  ));
  const activeCustomersList = (customers || []).filter(c => !c.deleted);
  const activeInventoryList = (inventory || []).filter(i => !i.deleted);
  const activePurchaseOrdersList = (purchaseOrders || []).filter(pur => !pur.deleted);
  const activeProductionCommandsList = (productionCommands || []).filter(cmd => !cmd.deleted);

  // Timeframe states
  const [filterMode, setFilterMode] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Drill-down sub-view state
  const [selectedProgressCategory, setSelectedProgressCategory] = useState<POQueueStatus | null>(null);
  const [salePoFilter, setSalePoFilter] = useState<SalePoFilter>('all');
  const [expandedPoId, setExpandedPoId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Reminders DB state
  const [reminders, setReminders] = useState<any[]>([]);
  const [newReminderText, setNewReminderText] = useState('');
  const [newReminderDate, setNewReminderDate] = useState('');
  const [workScheduleItems, setWorkScheduleItems] = useState<WorkScheduleRecord[]>([]);
  const workScheduleGroups = DEFAULT_WORK_SCHEDULE_GROUPS;

  // Load reminders
  useEffect(() => {
    const fetchReminders = async () => {
      try {
        const data = await dbService.getCollection('reminders');
        setReminders(data);
      } catch (err) {
        console.error("Error loading reminders:", err);
      }
    };
    fetchReminders();
  }, []);

  useEffect(() => {
    const loadWorkSchedule = async () => {
      try {
        const items = user.role === 'admin'
          ? await dbService.getCollection('work_schedule_items')
          : await dbService.getCollectionByField('work_schedule_items', 'assigneeId', user.uid);
        setWorkScheduleItems(normalizeWorkScheduleRecords(items).filter(item => !item.deleted));
      } catch (error) {
        console.error('Error loading work schedule overview:', error);
      }
    };
    void loadWorkSchedule();
  }, [user.role, user.uid]);

  const matchesTimeframe = (dateString?: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    if (filterMode === 'range') {
      if (!startDate && !endDate) return true;
      const start = startDate ? new Date(startDate + 'T00:00:00') : new Date('1970-01-01');
      const end = endDate ? new Date(endDate + 'T23:59:59') : new Date('2100-01-01');
      return date >= start && date <= end;
    } else {
      const yearMatch = date.getFullYear().toString() === selectedYear;
      const monthMatch = selectedMonth === 'all' || (date.getMonth() + 1).toString() === selectedMonth;
      return yearMatch && monthMatch;
    }
  };

  const filteredPOs = activePOsList.filter(po => matchesTimeframe(po.orderDate || po.createdAt));
  const filteredPurchaseOrders = activePurchaseOrdersList.filter(pur => matchesTimeframe(pur.createdAt));
  const filteredProductionCommands = activeProductionCommandsList.filter(cmd => matchesTimeframe(cmd.startedAt || cmd.createdAt));

  // Calculations helper
  const activePOs = filteredPOs.filter(po => !isPOCompleted(po));

  // Revenue is reported before VAT. Cash collection remains a separate accounting measure.
  const revenueMetrics = filteredPOs.reduce<PORevenueMetrics>((summary, po) => {
    const metrics = calculatePORevenueMetrics(po);
    summary.gross += metrics.gross;
    summary.directDiscount += metrics.directDiscount;
    summary.net += metrics.net;
    return summary;
  }, { gross: 0, directDiscount: 0, net: 0 });

  const newCustomerIds = new Set(
    activeCustomersList.filter(customer => matchesTimeframe(customer.convertedAt || customer.createdAt)).map(customer => customer.id)
  );
  const newCustomerRevenue = filteredPOs
    .filter(po => newCustomerIds.has(po.customerId))
    .reduce((sum, po) => sum + calculatePORevenueMetrics(po).net, 0);
  const payableDiscount = filteredPOs
    .filter(po => getPOQueueStatus(po) === 'waiting_discount' && po.discountSettlementStatus !== 'paid')
    .reduce((sum, po) => sum + getPayableDiscountAmount(po), 0);

  const trendEndMonth = selectedMonth === 'all' ? 11 : Math.max(0, Number(selectedMonth) - 1);
  const trendEndYear = Number(selectedYear);
  const revenueTrendData: RevenueTrendPoint[] = Array.from({ length: 6 }, (_, offset) => {
    const period = new Date(trendEndYear, trendEndMonth - (5 - offset), 1);
    const periodPOs = activePOsList.filter(po => {
      const date = new Date(po.orderDate || po.createdAt || '');
      return !Number.isNaN(date.getTime())
        && date.getFullYear() === period.getFullYear()
        && date.getMonth() === period.getMonth();
    });
    const metrics = periodPOs.reduce<PORevenueMetrics>((summary, po) => {
      const values = calculatePORevenueMetrics(po);
      summary.gross += values.gross;
      summary.directDiscount += values.directDiscount;
      summary.net += values.net;
      return summary;
    }, { gross: 0, directDiscount: 0, net: 0 });
    return { ...metrics, label: `T${period.getMonth() + 1}` };
  });

  // Warning for low stock materials
  const lowStockMaterials = activeInventoryList.filter(item => item.qtyInStock < item.minQtyAlert);

  // Category filters mapping for clicking
  const getCategoryPOs = (category: POQueueStatus) => filteredPOs.filter(po => isPOInQueue(po, category));

  const categoryLabels = Object.fromEntries(
    PO_QUEUE_STATES.map(state => [state.value, t(state.label)])
  ) as Record<POQueueStatus, string>;

  const poQueueChartData = PO_QUEUE_STATES
    .filter(state => state.value !== 'completed')
    .map(state => ({
      status: state.value,
      label: t(state.label),
      color: state.color,
      value: filteredPOs.filter(po => isPOInQueue(po, state.value)).length
    }));

  // Reminder managers
  const handleAddReminderSubmit = async (poId: string, poCode: string) => {
    return runMutationAction("DashboardPage.tsx:handleAddReminderSubmit", async () => {
      if (!newReminderText.trim() || !newReminderDate) return;
      const newRem = {
        poId,
        poCode,
        message: newReminderText.trim(),
        date: newReminderDate,
        completed: false,
        createdBy: user.displayName,
        createdAt: new Date().toISOString()
      };
      try {
        const created = await dbService.addDocument('reminders', newRem);
        setReminders(prev => [...prev, created]);
        setNewReminderText('');
        setNewReminderDate('');
        showSuccessToast("Đã thêm thành công");
      } catch (err) {
        showErrorToast();
        console.error(err);
      }
    }, poId);
  };

  const handleDeleteReminder = async (remId: string) => {
    return runMutationAction("DashboardPage.tsx:handleDeleteReminder", async () => {
      if ((await confirmDelete(t('Bạn có chắc chắn muốn xóa nhắc nhở này?')))) {
        try {
          await requireConfirmedMutation(dbService.deleteDocument('reminders', remId));
          setReminders(prev => prev.filter(r => r.id !== remId));

          showSuccessToast("Đã xóa thành công");
        } catch (err) {
          showErrorToast('Không thể xóa. Vui lòng thử lại.');
          console.error(err);
        }
      }
    }, remId);
  };

  const handleToggleReminder = async (remId: string, completed: boolean) => {
    return runMutationAction("DashboardPage.tsx:handleToggleReminder", async () => {
      try {
        await requireConfirmedMutation(dbService.updateDocument('reminders', remId, { completed }));
        setReminders(prev => prev.map(r => r.id === remId ? { ...r, completed } : r));

        showSuccessToast("Đã lưu thành công");
      } catch (err) {
        showErrorToast();
        console.error(err);
      }
    }, remId);
  };

  const handleUpdateStatus = async (poId: string, status: POQueueStatus) => {
    return runMutationAction("DashboardPage.tsx:handleUpdateStatus", async () => {
      try {
        const targetPo = pos.find(p => p.id === poId);
        if (!targetPo) return;

        const updatedLogs = [
          ...targetPo.historyLogs,
          {
            status,
            updatedBy: user.displayName,
            updatedAt: new Date().toISOString(),
            note: `Thay đổi hàng đợi từ Bảng Điều Khiển sang: ${getPOQueueLabel(status)}`
          }
        ];

        await requireConfirmedMutation(dbService.updateDocument('pos', poId, {
          ...getPOQueueUpdate(status, status === 'waiting_delivery'
            ? { deliveryStage: targetPo.deliveryStage || 'customer_outbound' }
            : {}),
          updatedBy: `${user.displayName} (${user.role.toUpperCase()})`,
          updatedAt: new Date().toISOString(),
          historyLogs: updatedLogs
        }));
        if (status === 'waiting_receivable') {
          await ensureReceivableInvoice(targetPo, `${user.displayName} (${user.role.toUpperCase()})`);
        }
        showSuccessToast("Đã lưu thành công");
      } catch (err) {
        showErrorToast();
        console.error(err);
      }
    }, poId);
  };

  const workGroupSummaries = useMemo(() => {
    const activeStatuses = new Set(['not_started', 'in_progress', 'waiting_customer', 'support_requested', 'awaiting_confirmation', 'paused']);
    const priorityRank = { urgent: 0, high: 1, normal: 2 } as const;
    return workScheduleGroups.map(group => {
      const tasks = workScheduleItems
        .filter(item => activeStatuses.has(item.status) && inferWorkScheduleGroupId(item) === group.id)
        .sort((left, right) => {
          const leftDate = new Date(left.endAt).getTime();
          const rightDate = new Date(right.endAt).getTime();
          if (!Number.isFinite(leftDate)) return 1;
          if (!Number.isFinite(rightDate)) return -1;
          return leftDate - rightDate;
        });
      const priority = [...tasks].sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority])[0]?.priority || 'normal';
      return { group, tasks, priority, nearestDue: tasks[0]?.endAt || '' };
    });
  }, [workScheduleGroups, workScheduleItems]);

  const salePOs = filteredPOs.filter(po => po.saleId === user.uid);
  const saleCustomers = activeCustomersList.filter(customer => customer.assignedSaleId === user.uid);
  const saleLeads = leads.filter(lead => !lead.deleted && lead.assignedSaleId === user.uid);
  const saleNewLeads = saleLeads.filter(lead => matchesTimeframe(lead.createdAt));
  const saleActiveTasks = workScheduleItems
    .filter(item => item.assigneeId === user.uid && SALE_ACTIVE_TASK_STATUSES.has(item.status))
    .sort((left, right) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2 } as const;
      const leftTime = new Date(left.endAt).getTime();
      const rightTime = new Date(right.endAt).getTime();
      const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER;
      const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER;
      return normalizedLeftTime - normalizedRightTime
        || priorityOrder[left.priority] - priorityOrder[right.priority];
    });
  const saleNow = new Date();
  const saleTodayStart = new Date(saleNow.getFullYear(), saleNow.getMonth(), saleNow.getDate()).getTime();
  const saleTodayEnd = saleTodayStart + (24 * 60 * 60 * 1000) - 1;
  const saleTodayTaskCount = saleActiveTasks.filter(item => {
    const dueAt = new Date(item.endAt).getTime();
    return Number.isFinite(dueAt) && dueAt >= saleTodayStart && dueAt <= saleTodayEnd;
  }).length;
  const saleOverdueTaskCount = saleActiveTasks.filter(item => {
    const dueAt = new Date(item.endAt).getTime();
    return Number.isFinite(dueAt) && dueAt < saleTodayStart;
  }).length;
  const salePriorityTasks = saleActiveTasks.slice(0, 4);
  const saleFunnelRows = SALE_FUNNEL_STAGES.map(stage => ({
    ...stage,
    count: saleLeads.filter(lead => lead.stage === stage.id).length
  }));
  const saleFunnelTotal = saleFunnelRows.reduce((total, row) => total + row.count, 0);
  let saleFunnelCursor = 0;
  const saleFunnelBackground = saleFunnelTotal > 0
    ? `conic-gradient(${saleFunnelRows.map(row => {
      const start = saleFunnelCursor;
      saleFunnelCursor += (row.count / saleFunnelTotal) * 100;
      return `${row.color} ${start}% ${saleFunnelCursor}%`;
    }).join(', ')})`
    : '#e5eaf2';
  const salePriorityLeadCount = saleLeads.filter(lead => {
    if (['won', 'lost', 'converted'].includes(lead.stage) || !lead.nextFollowUpAt) return false;
    const nextFollowUpAt = new Date(lead.nextFollowUpAt).getTime();
    return Number.isFinite(nextFollowUpAt) && nextFollowUpAt <= saleTodayEnd;
  }).length;
  const recentSalePOs = salePOs
    .filter(po => salePoFilter === 'all' || isPOInQueue(po, salePoFilter))
    .sort((left, right) => (
      new Date(right.updatedAt || right.orderDate || right.createdAt || '').getTime()
      - new Date(left.updatedAt || left.orderDate || left.createdAt || '').getTime()
    ))
    .slice(0, 5);

  const getSaleTaskState = (endAt: string, priority: WorkScheduleRecord['priority']) => {
    const dueAt = new Date(endAt).getTime();
    if (Number.isFinite(dueAt) && dueAt < saleTodayStart) return { label: t('Quá hạn'), tone: 'danger' };
    if (Number.isFinite(dueAt) && dueAt <= saleTodayEnd) return { label: t('Hôm nay'), tone: 'warning' };
    if (priority === 'urgent') return { label: t('Khẩn cấp'), tone: 'danger' };
    if (priority === 'high') return { label: t('Ưu tiên'), tone: 'warning' };
    return { label: t('Đang xử lý'), tone: 'info' };
  };

  // DRILL-DOWN SUB-VIEW RENDERING
  if (selectedProgressCategory) {
    const categoryPOs = getCategoryPOs(selectedProgressCategory);

    return (
      <div className="dashboard-view dashboard-po-drilldown" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="app-detail-heading-row">
          <PageBackButton
            onClick={() => {
              setSelectedProgressCategory(null);
              setExpandedPoId(null);
            }}
          />
          <div>
            <h1 className="page-title">{t('Chi tiết tiến độ đơn hàng')}</h1>
            <p className="page-subtitle">
              {t('Phân nhóm:')} <strong>{categoryLabels[selectedProgressCategory]}</strong> ({categoryPOs.length} {t('đơn hàng')})
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>{t('Mã PO')}</th>
                  <th>{t('Tên Khách Hàng')}</th>
                  <th>{t('Ngày Đặt')}</th>
                  <th>{t('Hạn Giao Hàng')}</th>
                  <th style={{ textAlign: 'right' }}>{t('Tổng Tiền (gồm VAT)')}</th>
                  <th>{t('Trạng Thái Hiện Tại')}</th>
                  <th>{t('Người Phụ Trách')}</th>
                  <th>{t('Thao Tác')}</th>
                </tr>
              </thead>
              <tbody>
                {categoryPOs.map(po => {
                  const isExpanded = expandedPoId === po.id;
                  const poReminders = reminders.filter(r => r.poId === po.id);

                  return (
                    <React.Fragment key={po.id}>
                      <tr
                        onClick={() => setExpandedPoId(isExpanded ? null : po.id)}
                        style={{ cursor: 'pointer', backgroundColor: isExpanded ? 'var(--color-bg-light)' : 'transparent' }}
                      >
                        <td style={{ textAlign: 'center' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                        <td style={{ fontWeight: 'bold', color: 'var(--color-primary-dark)' }}>{po.poCode}</td>
                        <td>{po.customerName}</td>
                        <td>{formatDate(po.orderDate, 'vi-VN', '')}</td>
                        <td>{formatDate(po.expectedDeliveryDate, 'vi-VN', '')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{(po.netAmount || po.totalAmount || 0).toLocaleString()} đ</td>
                        <td>
                          <span className={`badge ${getPOBadgeClass(po)}`}>
                            {t(getPOQueueLabel(po))}
                          </span>
                        </td>
                        <td>{po.createdBy || t('Không rõ')}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenPO(po.id);
                            }}
                          >
                            {t('Mở PO')}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: '20px', backgroundColor: '#f8fafc', borderBottom: '2px solid var(--color-border)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }} className="po-details-expand-grid">
                              {/* Left: Items list & Calculations */}
                              <div>
                                <h4 style={{ color: 'var(--color-primary-dark)', fontSize: '14px', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Sliders size={16} />
                                  <span>{t('Danh Sách Sản Phẩm & Quy Cách')}</span>
                                </h4>

                                <div className="po-inline-grid-container" style={{ marginBottom: '14px' }}>
                                  <table className="po-inline-grid" style={{ minWidth: '1250px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ padding: '6px 8px' }}>STT</th>
                                        <th style={{ padding: '6px 8px' }}>Mã hàng</th>
                                        <th style={{ padding: '6px 8px' }}>Tên hàng</th>
                                        <th style={{ padding: '6px 8px' }}>Quy cách / Chất liệu</th>
                                        <th style={{ padding: '6px 8px' }}>ĐVT</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>SL</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Đơn giá</th>
                                        <th style={{ padding: '6px 8px' }}>Nhà cung cấp</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Thuế (%)</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Chiết khấu</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Thành tiền (gồm VAT)</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>KPI PO</th>
                                        <th style={{ padding: '6px 8px' }}>File liên quan</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(po.items || []).map((item: any, idx: number) => {
                                        const financials = calculatePOItemFinancials(item);

                                        const images = item.previewImages || (item.previewImage ? [item.previewImage] : []);

                                        return (
                                          <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td style={{ fontWeight: 'bold' }}>{item.productCode}</td>
                                            <td>{item.productName}</td>
                                            <td>{item.size || '—'} · {item.material || '—'}</td>
                                            <td>{item.unit || 'cái'}</td>
                                            <td style={{ textAlign: 'right' }}>{financials.quantity.toLocaleString()}</td>
                                            <td style={{ textAlign: 'right' }}>{financials.unitPrice.toLocaleString()} đ</td>
                                            <td>{item.supplierName || 'Chưa chọn'}</td>
                                            <td style={{ textAlign: 'right' }}>{financials.vatRate}%</td>
                                            <td style={{ textAlign: 'right' }}>
                                              {financials.discountType === 'amount'
                                                ? `${Math.round(financials.discountAmount).toLocaleString()} đ`
                                                : `${financials.discountRate}%`}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-primary-dark)' }}>{Math.round(financials.amountWithVat).toLocaleString()} đ</td>
                                            <td style={{ textAlign: 'right' }}>{financials.kpiPo.toFixed(1)}%</td>
                                            <td>
                                              <div style={{ display: 'flex', gap: '4px' }}>
                                                {images.map((img: string, iIdx: number) => (
                                                  <img
                                                    key={iIdx}
                                                    src={img}
                                                    alt="layout"
                                                    style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: '1px solid var(--color-border)' }}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setPreviewImage(img);
                                                    }}
                                                  />
                                                ))}
                                                {images.length === 0 && <span className="po-empty-value">{t('Chưa có')}</span>}
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Quick transition status */}
                                {(user.role === 'admin' || user.role === 'sale' || user.role === 'producer') && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'white', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--color-border-light)' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{t('Cập nhật nhanh trạng thái PO:')}</span>
                                    <select
                                      value={getPOQueueStatus(po)}
                                      onChange={(e) => handleUpdateStatus(po.id, e.target.value as POQueueStatus)}
                                      style={{ padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                    >
                                      {PO_QUEUE_STATES.map(state => (
                                        <option key={state.value} value={state.value}>{state.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>

                              {/* Right: Vertical Timeline & Reminders */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* REMINDERS MANAGER */}
                                <div style={{ backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px' }}>
                                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-dark)', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Bell size={14} />
                                    <span>{t('Lời Nhắc Nhở Đơn Hàng')} ({poReminders.length})</span>
                                  </h4>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflowY: 'auto', marginBottom: '10px' }}>
                                    {poReminders.map(rem => (
                                      <div key={rem.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', borderBottom: '1px solid #f1f5f9', fontSize: '12.5px' }}>
                                        <input
                                          type="checkbox"
                                          checked={rem.completed}
                                          onChange={(e) => handleToggleReminder(rem.id, e.target.checked)}
                                        />
                                        <span style={{
                                          flex: 1,
                                          textDecoration: rem.completed ? 'line-through' : 'none',
                                          color: rem.completed ? 'var(--color-text-muted)' : 'var(--color-text-main)'
                                        }}>
                                          {rem.message}
                                        </span>
                                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                          ({formatDate(rem.date)})
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteReminder(rem.id)}
                                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      </div>
                                    ))}
                                    {poReminders.length === 0 && (
                                      <span style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--color-text-muted)', padding: '6px 0' }}>
                                        {t('Chưa có lời nhắc nhở nào cho đơn này.')}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <input
                                      type="text"
                                      placeholder={t('Nội dung nhắc...')}
                                      value={newReminderText}
                                      onChange={(e) => setNewReminderText(e.target.value)}
                                      style={{ flex: 1, padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                                    />
                                    <input
                                      type="date"
                                      value={newReminderDate}
                                      onChange={(e) => setNewReminderDate(e.target.value)}
                                      style={{ padding: '4px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--color-border)', width: '120px' }}
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-primary"
                                      onClick={() => handleAddReminderSubmit(po.id, po.poCode)}
                                      style={{ padding: '4px 10px' }}
                                    >
                                      <Plus size={12} />
                                    </button>
                                  </div>
                                </div>

                                {/* Compact queue timeline; legacy log labels remain readable. */}
                                <div style={{ backgroundColor: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '14px' }}>
                                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-dark)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} />
                                    <span>{t('Nhật Ký & Timeline Tiến Độ')}</span>
                                  </h4>

                                  <div className="timeline" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                    {(po.historyLogs || []).map((log: any, lIdx: number) => (
                                      <div key={lIdx} className="timeline-item" style={{ paddingBottom: '10px' }}>
                                        <div className="timeline-marker" style={{ width: '8px', height: '8px', top: '4px' }}></div>
                                        <div className="timeline-content" style={{ marginLeft: '16px' }}>
                                          <span className="timeline-title" style={{ fontSize: '12px', fontWeight: 700 }}>
                                            {t(getPOHistoryStatusLabel(log.status))}
                                          </span>
                                          <span className="timeline-date" style={{ fontSize: '10.5px', color: 'var(--color-text-muted)', display: 'block' }}>
                                            {formatDateTime(log.updatedAt)} - {t('Nhân sự:')} {log.updatedBy}
                                          </span>
                                          {log.note && <span style={{ fontSize: '11.5px', display: 'block', color: 'var(--color-text-main)' }}>{log.note}</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

              </tbody>
            </table>
          </div>
        </div>

        {/* LIGHTBOX LAYOUT ZOOM */}
        {previewImage && (
          <div
            className="modal-overlay"
            onClick={() => setPreviewImage(null)}
            style={{ zIndex: 1300, background: 'rgba(0,0,0,0.8)' }}
          >
            <div
              className="modal-content"
              style={{ maxWidth: '90%', maxHeight: '90%', padding: '10px', position: 'relative', background: 'transparent', boxShadow: 'none' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-10px',
                  backgroundColor: 'white',
                  color: 'black',
                  border: 'none',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onClick={() => setPreviewImage(null)}
              >
                ×
              </button>
              <img
                src={previewImage}
                alt="Layout Zoom"
                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: '4px', border: '2px solid white' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const adminRevenueContent = (
    <section className="customer-overview-panel dashboard-revenue-panel" aria-labelledby="dashboard-revenue-title">
      <header className="customer-overview-panel__header">
        <h3 id="dashboard-revenue-title">{t('Doanh thu')}</h3>
        <small>{t('Giá trị chưa bao gồm VAT')}</small>
      </header>
      <div className="dashboard-revenue-metrics">
        <article><span>{t('Doanh thu tổng')}</span><strong>{revenueMetrics.gross.toLocaleString('vi-VN')} đ</strong></article>
        <article><span>{t('Sau chiết khấu')}</span><strong>{revenueMetrics.net.toLocaleString('vi-VN')} đ</strong></article>
        <article><span>{t('Khách hàng mới')}</span><strong>{newCustomerRevenue.toLocaleString('vi-VN')} đ</strong></article>
        <article><span>{t('Chiết khấu phải trả')}</span><strong>{payableDiscount.toLocaleString('vi-VN')} đ</strong></article>
      </div>
      <div className="dashboard-revenue-chart-heading">
        <span>{t('Giá trị PO 6 tháng gần nhất')}</span>
        <small>{t('Tổng cột = trước chiết khấu')}</small>
      </div>
      <RevenueTrendChart data={revenueTrendData} />
    </section>
  );

  const adminQueueContent = (
    <section className="customer-overview-panel dashboard-po-queue-panel" aria-labelledby="dashboard-po-queue-title">
      <header className="customer-overview-panel__header">
        <h3 id="dashboard-po-queue-title">{t('Hàng đợi xử lý PO')}</h3>
      </header>
      <div className="dashboard-po-queue-content">
        <div className="dashboard-po-queue-chart">
          <DonutChart data={poQueueChartData} />
          <span className="dashboard-po-queue-total"><strong>{activePOs.length}</strong><small>{t('đang xử lý')}</small></span>
        </div>
        <div className="dashboard-po-queue-actions">
          {poQueueChartData.map(state => (
            <button
              key={state.status}
              type="button"
              onClick={() => setSelectedProgressCategory(state.status)}
              title={t('Xem danh sách đơn hàng chi tiết')}
              style={{ borderLeftColor: state.color }}
            >
              <span>{t(state.label)}</span>
              <strong style={{ color: state.color }}>{state.value}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );

  const adminTasksContent = (
    <section className="customer-overview-panel dashboard-task-panel" aria-labelledby="dashboard-task-title">
      <header className="customer-overview-panel__header">
        <h3 id="dashboard-task-title">{t('Việc cần xử lý')}</h3>
      </header>
      <div className="dashboard-task-list">
        {workGroupSummaries.map((summary, index) => (
          <article key={summary.group.id} className={`is-tone-${(index % 4) + 1}`}>
            <span className="dashboard-task-list__icon"><ClipboardList size={17} aria-hidden="true" /></span>
            <strong title={summary.group.name}>{summary.group.name}</strong>
            <span className="dashboard-task-list__count">{summary.tasks.length} {t('việc')}</span>
            <span className={`dashboard-task-list__priority is-${summary.priority}`}>{t(WORK_SCHEDULE_PRIORITY_LABELS[summary.priority])}</span>
            <time>{summary.nearestDue ? `${t('Hạn')}: ${formatDate(summary.nearestDue)}` : t('Chưa có việc')}</time>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => onNavigateWorkGroup(summary.group.id)}>{t('Xem')}</button>
          </article>
        ))}
      </div>
    </section>
  );

  // STANDARD DASHBOARD VIEW
  return (
    <div className="dashboard-view" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      <PageContextHeader section={t('Tổng quan')}>
        {/* TIME RANGE & DATE FILTERS */}
        <div className="dashboard-overview-toolbar">
          {user.role === 'admin' && <h2>{t('Tổng quan khách hàng')}</h2>}
          {user.role === 'sale' && <div className="sale-dashboard__heading">
            <h2>{t('Tổng quan công việc')}</h2>
            <p>{t('Xin chào')}, {user.displayName}</p>
          </div>}
          <div className="dashboard-overview-toolbar__actions">
          <div className="dashboard-date-filters">
          {/* Toggle filter mode */}
          <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden', marginRight: '6px' }}>
            <button
              className={`btn btn-sm ${filterMode === 'month' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: 0, border: 'none' }}
              onClick={() => setFilterMode('month')}
            >
              {t('Theo Tháng')}
            </button>
            <button
              className={`btn btn-sm ${filterMode === 'range' ? 'btn-primary' : 'btn-outline'}`}
              style={{ padding: '4px 10px', fontSize: '12px', borderRadius: 0, border: 'none' }}
              onClick={() => setFilterMode('range')}
            >
              {t('Khoảng Ngày')}
            </button>
          </div>

          {filterMode === 'month' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', backgroundColor: '#fff' }}
                >
                  <option value="all">{t('Tất cả tháng')}</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={(i + 1).toString()}>{t('Tháng')} {i + 1}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px', backgroundColor: '#fff' }}
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2024">2024</option>
                </select>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{t('đến')}</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '12.5px' }}
              />
            </div>
          )}
          </div>
          {user.role === 'sale' && <button type="button" className="btn btn-primary sale-dashboard__create-button" onClick={() => onNavigate('sales')}>{t('Tạo đơn hàng mới')}</button>}
          </div>
        </div>
      </PageContextHeader>

      {/* ADMIN / GIÁM ĐỐC VIEW */}
      {user.role === 'admin' && (
        <>
          <CustomerInsightDashboard
            candidates={candidates}
            leads={leads}
            customers={customers}
            onNavigateInsight={onNavigateInsight}
            activeOrdersCount={activePOs.length}
            revenueContent={adminRevenueContent}
            queueContent={adminQueueContent}
            tasksContent={adminTasksContent}
          />

        </>
      )}

      {/* SALE VIEW */}
      {user.role === 'sale' && (
        <div className="sale-dashboard">
          <section className="sale-dashboard__metrics" aria-label={t('Chỉ số công việc của Sale')}>
            <article className="sale-dashboard__metric is-primary">
              <span>{t('Việc cần xử lý')}</span>
              <strong>{saleTodayTaskCount}</strong>
              <small>{t('Trong hôm nay')}</small>
            </article>
            <article className="sale-dashboard__metric is-danger">
              <span>{t('Lịch quá hạn')}</span>
              <strong>{saleOverdueTaskCount}</strong>
              <small>{t('Cần xử lý ngay')}</small>
            </article>
            <article className="sale-dashboard__metric is-success">
              <span>{t('Tiềm năng mới')}</span>
              <strong>{saleNewLeads.length}</strong>
              <small>{t('Trong kỳ đã chọn')}</small>
            </article>
            <article className="sale-dashboard__metric is-violet">
              <span>{t('Khách hàng của tôi')}</span>
              <strong>{saleCustomers.length}</strong>
              <small>{t('Đang chăm sóc')}</small>
            </article>
            <article className="sale-dashboard__metric is-warning">
              <span>{t('Đơn hàng trong kỳ')}</span>
              <strong>{salePOs.length}</strong>
              <small>{salePOs.reduce((total, po) => total + Number(po.netAmount || po.totalAmount || 0), 0).toLocaleString('vi-VN')} đ</small>
            </article>
          </section>

          <div className="sale-dashboard__focus-grid">
            <section className="sale-dashboard__panel sale-dashboard__tasks" aria-labelledby="sale-priority-tasks-title">
              <header className="sale-dashboard__panel-header">
                <h2 id="sale-priority-tasks-title">{t('Công việc ưu tiên hôm nay')}</h2>
                <button type="button" className="sale-dashboard__text-action" onClick={() => onNavigate('work_schedule')}>{t('Xem tất cả')}</button>
              </header>
              <div className="sale-dashboard__task-table">
                <div className="sale-dashboard__task-head" aria-hidden="true">
                  <span>{t('Công việc')}</span>
                  <span>{t('Liên quan')}</span>
                  <span>{t('Thời gian')}</span>
                  <span>{t('Trạng thái')}</span>
                </div>
                {salePriorityTasks.map(task => {
                  const state = getSaleTaskState(task.endAt, task.priority);
                  return <article key={task.id} className="sale-dashboard__task-row">
                    <strong title={task.title}>{task.title || t('Công việc chưa đặt tên')}</strong>
                    <span title={task.referenceLabel || task.groupName}>{task.referenceLabel || task.groupName || t('Công việc cá nhân')}</span>
                    <time>{task.endAt ? formatDateTime(task.endAt) : t('Chưa đặt hạn')}</time>
                    <span className={`sale-dashboard__status is-${state.tone}`}>{state.label}</span>
                  </article>;
                })}
                {!salePriorityTasks.length && <p className="sale-dashboard__empty">{t('Không có công việc đang chờ xử lý.')}</p>}
              </div>
            </section>

            <section className="sale-dashboard__panel sale-dashboard__funnel" aria-labelledby="sale-funnel-title">
              <header className="sale-dashboard__panel-header">
                <h2 id="sale-funnel-title">{t('Phễu khách hàng của tôi')}</h2>
                <button type="button" className="sale-dashboard__text-action" onClick={() => onNavigate('leads')}>{t('Xem chi tiết')}</button>
              </header>
              <div className="sale-dashboard__funnel-content">
                <div className="sale-dashboard__funnel-rows">
                  {saleFunnelRows.map(row => <div key={row.id} className="sale-dashboard__funnel-row">
                    <span>{t(row.label)}</span>
                    <div><i style={{ width: `${saleFunnelTotal ? (row.count / saleFunnelTotal) * 100 : 0}%`, background: row.color }} /></div>
                    <strong>{row.count}</strong>
                  </div>)}
                </div>
                <div className="sale-dashboard__funnel-summary">
                  <div className="sale-dashboard__donut" style={{ background: saleFunnelBackground }}>
                    <span><strong>{saleFunnelTotal}</strong><small>{t('Hồ sơ phụ trách')}</small></span>
                  </div>
                  <p>{salePriorityLeadCount} {t('cần ưu tiên')}</p>
                </div>
              </div>
            </section>
          </div>

          <section className="sale-dashboard__panel sale-dashboard__orders" aria-labelledby="sale-orders-title">
            <header className="sale-dashboard__panel-header sale-dashboard__orders-header">
              <h2 id="sale-orders-title">{t('Theo dõi đơn hàng PO gần đây')}</h2>
              <div className="sale-dashboard__filters" role="group" aria-label={t('Lọc tiến độ đơn hàng')}>
                {([
                  ['all', 'Tất cả'],
                  ['waiting_design', 'Chờ thiết kế'],
                  ['waiting_production', 'Chờ sản xuất'],
                  ['waiting_delivery', 'Chờ giao']
                ] as Array<[SalePoFilter, string]>).map(([value, label]) => <button
                  key={value}
                  type="button"
                  className={salePoFilter === value ? 'is-active' : ''}
                  aria-pressed={salePoFilter === value}
                  onClick={() => setSalePoFilter(value)}
                >{t(label)}</button>)}
              </div>
            </header>
            <div className="table-container sale-dashboard__orders-table">
              <table>
                <thead>
                  <tr>
                    <th>{t('Mã PO')}</th>
                    <th>{t('Khách hàng')}</th>
                    <th>{t('Ngày đặt')}</th>
                    <th className="is-number">{t('Trị giá')}</th>
                    <th>{t('Tiến độ')}</th>
                    <th>{t('Cập nhật')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSalePOs.map(po => <tr key={po.id}>
                    <td><button type="button" className="sale-dashboard__po-link" onClick={() => onOpenPO(po.id)}>{po.poCode}</button></td>
                    <td title={po.customerName}>{po.customerName}</td>
                    <td>{formatDate(po.orderDate)}</td>
                    <td className="is-number">{Number(po.netAmount || po.totalAmount || 0).toLocaleString('vi-VN')} đ</td>
                    <td><span className={`badge ${getPOBadgeClass(po)}`}>{t(getPOQueueLabel(po))}</span></td>
                    <td>{formatDateTime(po.updatedAt || po.orderDate || po.createdAt)}</td>
                  </tr>)}
                  {!recentSalePOs.length && <tr><td colSpan={6} className="sale-dashboard__table-empty">{t('Không có đơn hàng phù hợp trong kỳ đã chọn.')}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* DESIGNER VIEW */}
      {user.role === 'designer' && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-title">{t('Yêu Cầu Chờ Thiết Kế')}</span>
              <span className="metric-value" style={{ color: 'var(--color-danger)' }}>
                {activeDesignRequests.filter(request => request.workStatus !== 'completed').length} {t('yêu cầu')}
              </span>
              <span className="metric-sub">{t('Mỗi mặt hàng là một yêu cầu độc lập')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('Mẫu Đang Chờ Khách Duyệt')}</span>
              <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
                {activeDesignRequests.filter(request => request.approvalStatus === 'waiting_client').length} {t('yêu cầu')}
              </span>
              <span className="metric-sub">{t('Đang chờ khách duyệt layout/màu')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('Mẫu Đã Duyệt Chốt')}</span>
              <span className="metric-value" style={{ color: 'var(--color-success)' }}>
                {activeDesignRequests.filter(request => request.approvalStatus === 'approved').length} {t('yêu cầu')}
              </span>
              <span className="metric-sub">{t('Đã bàn giao để mua hàng/sản xuất')}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">{t('Nhiệm Vụ Thiết Kế Chờ Xử Lý')}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm btn-primary" onClick={() => onNavigate('design')}>{t('Vào trang thiết kế')}</button>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('Mã PO')}</th>
                    <th>{t('Sản Phẩm')}</th>
                    <th>{t('Quy Cách/Kích Thước')}</th>
                    <th>{t('Ghi Chú Yêu Cầu')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDesignRequests.filter(request => request.workStatus !== 'completed').map(request => (
                    <tr key={request.id}>
                      <td style={{ fontWeight: 600 }}>{request.customerReferenceCode || request.poCode}</td>
                      <td>{request.productName || t('Chưa đặt tên')}</td>
                      <td>{request.size || '—'}{request.material ? ` (${request.material})` : ''}</td>
                      <td style={{ color: 'var(--color-text-muted)' }}>{request.designBrief || t('Chưa có ghi chú')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* PURCHASER VIEW */}
      {user.role === 'purchaser' && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-title">{t('Vật Tư Cảnh Báo Sắp Thiếu')}</span>
              <span className="metric-value" style={{ color: 'var(--color-danger)' }}>{lowStockMaterials.length} loại</span>
              <span className="metric-sub">{t('Dưới định mức tồn kho tối thiểu')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('Đơn Mua Hàng Đã Gửi NCC')}</span>
              <span className="metric-value">
                {filteredPurchaseOrders.filter(pur => pur.status === 'ordered' || pur.status === 'confirmed').length} {t('đơn')}
              </span>
              <span className="metric-sub">{t('Chờ NCC giao hàng/xác nhận')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('Đơn Mua Chờ Nhập Kho')}</span>
              <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
                {filteredPurchaseOrders.filter(pur => pur.status === 'shipping').length} {t('đơn')}
              </span>
              <span className="metric-sub">{t('Đang trên đường vận chuyển')}</span>
            </div>
          </div>

          <div className="details-grid">
            <div className="card">
              <div className="card-header">
                <span className="card-title">{t('Cảnh Báo Tồn Kho Thấp')}</span>
                <button className="btn btn-sm btn-outline" onClick={() => onNavigate('inventory')}>{t('Vào Kho')}</button>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Tên Vật Tư')}</th>
                      <th>{t('Hiện Có')}</th>
                      <th>{t('Ngưỡng Cảnh Báo')}</th>
                      <th>{t('Đơn Vị')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockMaterials.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{item.materialName}</td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{item.qtyInStock}</td>
                        <td>{item.minQtyAlert}</td>
                        <td>{item.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title">{t('Đơn Mua Hàng Gần Đây')}</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: '11px' }} onClick={() => setSelectedProgressCategory('waiting_delivery')}>{t('Theo dõi hàng PO')}</button>
                  <button className="btn btn-sm btn-primary" onClick={() => onNavigate('purchase')}>{t('Mua Vật Tư')}</button>
                </div>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>{t('Mã Đơn Mua')}</th>
                      <th>{t('Nhà Cung Cấp')}</th>
                      <th>{t('Tổng Giá Trị')}</th>
                      <th>{t('Trạng Thái')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchaseOrders.slice(0, 5).map(pur => (
                      <tr key={pur.id}>
                        <td style={{ fontWeight: 600 }}>{pur.purCode}</td>
                        <td>{pur.supplierName}</td>
                        <td>{pur.totalPrice.toLocaleString()} đ</td>
                        <td>
                          <span className={`badge ${
                            pur.status === 'received' ? 'badge-success' : 'badge-warning'
                          }`}>{pur.status.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* PRODUCER VIEW */}
      {user.role === 'producer' && (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-title">{t('LSX Đang Sản Xuất')}</span>
              <span className="metric-value" style={{ color: 'var(--color-info)' }}>
                {filteredProductionCommands.filter(cmd => cmd.status === 'producing').length} lệnh
              </span>
              <span className="metric-sub">{t('Đang chạy trên các máy in')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('Đơn Chờ Sản Xuất')}</span>
              <span className="metric-value" style={{ color: 'var(--color-warning)' }}>
                {filteredPOs.filter(po => isPOInQueue(po, 'waiting_production')).length} {t('đơn')}
              </span>
              <span className="metric-sub">{t('Đã duyệt layout, đủ vật tư')}</span>
            </div>
            <div className="metric-card">
              <span className="metric-title">{t('LSX Đã Hoàn Thành')}</span>
              <span className="metric-value">
                {filteredProductionCommands.filter(cmd => cmd.status === 'completed').length} lệnh
              </span>
              <span className="metric-sub">{t('Đã hoàn thành bàn giao QC')}</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title">{t('Tiến Độ Lệnh Sản Xuất Hiện Tại')}</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: '11px' }} onClick={() => setSelectedProgressCategory('waiting_production')}>{t('Theo dõi hàng PO')}</button>
                <button className="btn btn-sm btn-primary" onClick={() => onNavigate('production')}>{t('Vào Xưởng')}</button>
              </div>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('Mã LSX')}</th>
                    <th>{t('Sản Phẩm')}</th>
                    <th>{t('Máy In')}</th>
                    <th>{t('Ca Làm')}</th>
                    <th>{t('SL Yêu Cầu')}</th>
                    <th>{t('Trạng Thái')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProductionCommands.map(cmd => (
                    <tr key={cmd.id}>
                      <td style={{ fontWeight: 600 }}>{cmd.lsxCode}</td>
                      <td>{cmd.productName}</td>
                      <td>{cmd.machineId}</td>
                      <td>{cmd.shift}</td>
                      <td title={productionQuantityLabel(cmd)}>{productionQuantityLabel(cmd)}</td>
                      <td>
                        <span className={`badge ${
                          cmd.status === 'completed' ? 'badge-success' : 'badge-info'
                        }`}>{PRODUCTION_STATUSES[cmd.status as ProductionStatus] || (cmd.status === 'transfer_pending' ? 'Chờ bàn giao' : 'Lệnh cũ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
