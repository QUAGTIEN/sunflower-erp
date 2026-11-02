import { useState, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { PageBackButton } from '@/components/PageBackButton';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { getPOQueueState } from '../../model/poWorkflow';
import { ORDER_STEP_TRIGGERS, actorLabel, orderSteps, type OrderHistoryLog } from '../../model/orderDetail';
import { OrderItemsTable, type OrderLine } from './OrderItemsTable';
import { OrderDesignPanel, type LineFileField, type LineNoteField } from './OrderDesignPanel';
import { OrderProductionPanel } from './OrderProductionPanel';
import { OrderDeliveryPanel } from './OrderDeliveryPanel';
import { OrderFilesPanel, OrderHistoryPanel, OrderNotesPanel, type ChecklistTask } from './OrderRecordPanels';
import './OrderDetail.css';

export interface OrderDetailRecord {
  id: string;
  poCode?: string;
  status?: string;
  customerId?: string;
  customerName?: string;
  customerRank?: string;
  customerPoCode?: string;
  customerSnapshot?: {
    customerCode?: string;
    companyName?: string;
    contactPerson?: string;
    phone?: string;
    address?: string;
    customerRank?: string;
  };
  expectedDeliveryDate?: string;
  orderDate?: string;
  notes?: string;
  items?: OrderLine[];
  links?: Record<string, unknown>;
  internalChecklist?: ChecklistTask[];
  historyLogs?: OrderHistoryLog[];
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

interface OrderDetailViewProps {
  po: OrderDetailRecord;
  /** Live customer record, used only where the order's own snapshot has no value. */
  customer?: { customerCode?: string; customerRank?: string; contactPerson?: string; phone?: string; address?: string };
  saleName: string;
  supplierNames: Record<string, string>;
  canViewFinancials: boolean;
  canViewCosts: boolean;
  canManage: boolean;
  canDelete: boolean;
  canEditSaleBrief: boolean;
  canEditDesignReply: boolean;
  checklistDraft: string;
  onBack: () => void;
  onPrint: () => void;
  onRepeat: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenCustomer?: () => void;
  onPreviewImage: (image: string) => void;
  onUpdateLineNotes: (itemIndex: number, field: LineNoteField, value: string) => void;
  onUploadLineFiles: (itemIndex: number, field: LineFileField, files: FileList | null) => void;
  onRemoveLineFile: (itemIndex: number, field: LineFileField, fileIndex: number) => void;
  onChecklistDraftChange: (value: string) => void;
  onAddChecklistItem: () => void;
  onToggleChecklistItem: (taskId: string) => void;
  onRemoveChecklistItem: (taskId: string) => void;
}

type OrderTab = 'items' | 'design' | 'production' | 'delivery' | 'files' | 'notes' | 'history';
const ORDER_TABS: { id: OrderTab; label: string }[] = [
  { id: 'items', label: 'Hàng tiền' },
  { id: 'design', label: 'Thiết kế' },
  { id: 'production', label: 'Sản xuất' },
  { id: 'delivery', label: 'Giao hàng' },
  { id: 'files', label: 'Tệp và ảnh mẫu' },
  { id: 'notes', label: 'Trao đổi' },
  { id: 'history', label: 'Lịch sử' }
];

function InfoField({ label, value, wide = false }: { label: string; value: ReactNode; wide?: boolean }) {
  const title = typeof value === 'string' ? value : undefined;
  return (
    <div className={wide ? 'order-info__field order-info__field--wide' : 'order-info__field'}>
      <dt>{label}</dt>
      <dd title={title}>{value || <span className="order-muted">Chưa có</span>}</dd>
    </div>
  );
}

/**
 * Order detail laid out like an accounting voucher (mockup C, D-PO1): general data on top, then the lines and
 * everything linked to the order in tabs. The queue step is read-only; it moves only through the workflow.
 */
export function OrderDetailView(props: OrderDetailViewProps) {
  const { po, customer, canManage } = props;
  // The open tab belongs to one order, so another order always opens on its lines.
  const [openTab, setOpenTab] = useState<{ orderId: string; tab: OrderTab }>({ orderId: po.id, tab: 'items' });
  const activeTab = openTab.orderId === po.id ? openTab.tab : 'items';
  const snapshot = po.customerSnapshot || {};
  const queueState = getPOQueueState(po);
  const steps = orderSteps(po);
  const currentStep = steps.find(step => step.state === 'current');
  const items = po.items || [];
  const contact = [snapshot.contactPerson || customer?.contactPerson, snapshot.phone || customer?.phone]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="order-detail">
      <div className="order-detail__toolbar">
        <PageBackButton onClick={props.onBack} />
        <h1 className="order-detail__title">Đơn hàng {po.poCode}</h1>
        <span className="order-status" style={{ color: queueState.color, background: queueState.background }}>
          {queueState.label}
        </span>
        <div className="order-detail__actions">
          <IconButton label="Xuất đơn hàng" icon={<Printer />} onClick={props.onPrint} />
          {canManage && (
            <>
              <button type="button" className="btn btn-outline" onClick={props.onRepeat}>
                Đặt lại từ đơn này
              </button>
              <button type="button" className="btn btn-primary" onClick={props.onEdit}>
                Chỉnh sửa
              </button>
            </>
          )}
          {props.canDelete && (
            <button type="button" className="btn btn-danger" onClick={props.onDelete}>
              Xóa
            </button>
          )}
        </div>
      </div>

      <ol className="order-steps" aria-label="Tiến độ đơn hàng">
        {steps.map((step, index) => (
          <li
            key={step.value}
            className={`order-steps__item order-steps__item--${step.state}`}
            title={
              step.reachedAt
                ? `${formatDateTime(step.reachedAt, 'vi-VN')} · ${actorLabel(step.reachedBy) || 'Không rõ'}`
                : ORDER_STEP_TRIGGERS[step.value]
            }
          >
            <span className="order-steps__index">{index + 1}</span>
            <span className="order-steps__label">{step.label}</span>
          </li>
        ))}
      </ol>
      {currentStep && currentStep.value !== 'completed' && (
        <p className="order-steps__hint">
          Bước tiếp theo tự chuyển {ORDER_STEP_TRIGGERS[steps[steps.indexOf(currentStep) + 1].value].toLowerCase()}.
        </p>
      )}

      <dl className="order-info">
        <InfoField
          label="Khách hàng"
          value={
            props.onOpenCustomer ? (
              <button type="button" className="order-link" onClick={props.onOpenCustomer}>
                {snapshot.companyName || po.customerName}
              </button>
            ) : (
              snapshot.companyName || po.customerName
            )
          }
        />
        <InfoField label="Số đơn hàng" value={po.poCode} />
        <InfoField label="Ngày đặt" value={formatDate(po.orderDate || po.createdAt, 'vi-VN', '')} />
        <InfoField label="Mã khách" value={snapshot.customerCode || customer?.customerCode} />
        <InfoField label="PO của khách" value={po.customerPoCode} />
        <InfoField label="Giao dự kiến" value={formatDate(po.expectedDeliveryDate, 'vi-VN', '')} />
        <InfoField label="Người liên hệ" value={contact} />
        <InfoField label="Sale phụ trách" value={props.saleName} />
        <InfoField label="Hạng khách" value={po.customerRank || snapshot.customerRank || customer?.customerRank} />
        <InfoField label="Địa chỉ" value={snapshot.address || customer?.address} wide />
        <InfoField label="Ghi chú" value={po.notes} />
      </dl>

      <div className="content-tabs content-tabs--segmented" role="tablist" aria-label="Nội dung đơn hàng">
        {ORDER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setOpenTab({ orderId: po.id, tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        className="order-detail__panel"
        role="tabpanel"
        aria-label={ORDER_TABS.find(tab => tab.id === activeTab)?.label}
      >
        {activeTab === 'items' && (
          <OrderItemsTable
            items={items}
            supplierNames={props.supplierNames}
            canViewFinancials={props.canViewFinancials}
            canViewCosts={props.canViewCosts}
            onPreviewImage={props.onPreviewImage}
          />
        )}
        {activeTab === 'design' && (
          <OrderDesignPanel
            poId={po.id}
            items={items}
            canEditSaleBrief={props.canEditSaleBrief}
            canEditDesignReply={props.canEditDesignReply}
            onUpdateNotes={props.onUpdateLineNotes}
            onUploadFiles={props.onUploadLineFiles}
            onRemoveFile={props.onRemoveLineFile}
            onPreviewImage={props.onPreviewImage}
          />
        )}
        {activeTab === 'production' && <OrderProductionPanel poId={po.id} />}
        {activeTab === 'delivery' && <OrderDeliveryPanel poId={po.id} />}
        {activeTab === 'files' && (
          <OrderFilesPanel
            poCode={po.poCode || po.id}
            links={po.links || {}}
            items={items}
            onPreviewImage={props.onPreviewImage}
          />
        )}
        {activeTab === 'notes' && (
          <OrderNotesPanel
            tasks={po.internalChecklist || []}
            draft={props.checklistDraft}
            onDraftChange={props.onChecklistDraftChange}
            onAdd={props.onAddChecklistItem}
            onToggle={props.onToggleChecklistItem}
            onRemove={props.onRemoveChecklistItem}
          />
        )}
        {activeTab === 'history' && (
          <OrderHistoryPanel
            logs={po.historyLogs || []}
            createdBy={po.createdBy}
            createdAt={po.createdAt}
            updatedBy={po.updatedBy}
            updatedAt={po.updatedAt}
          />
        )}
      </section>
    </div>
  );
}
