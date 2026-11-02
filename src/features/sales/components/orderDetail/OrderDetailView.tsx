import { Fragment, useState, type ReactNode } from 'react';
import { PageBackButton } from '@/components/PageBackButton';
import { formatDate, formatDateTime } from '@/shared/utils/dateFormatting';
import { getPOQueueState } from '../../model/poWorkflow';
import {
  ORDER_STEP_TRIGGERS,
  actorLabel,
  orderSteps,
  orderTotals,
  type OrderHistoryLog
} from '../../model/orderDetail';
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
  customerSnapshot?: {
    customerCode?: string;
    companyName?: string;
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
  customer?: { customerCode?: string; customerRank?: string; address?: string };
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

const amount = (value: number) => Math.round(value).toLocaleString('vi-VN');

function InfoField({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="order-info__field">
      <dt>{label}</dt>
      <dd className={strong ? 'is-strong' : undefined} title={typeof value === 'string' ? value : undefined}>
        {value || <span className="order-muted">Chưa nhập</span>}
      </dd>
    </div>
  );
}

/**
 * Order detail laid out like the accounting voucher of mockup C (D-PO1): a command bar with the read-only queue,
 * the general data, the lines and linked records in tabs, then the totals. The queue moves only through the flow.
 */
export function OrderDetailView(props: OrderDetailViewProps) {
  const { po, customer, canManage, canViewFinancials } = props;
  // The open tab belongs to one order, so another order always opens on its lines.
  const [openTab, setOpenTab] = useState<{ orderId: string; tab: OrderTab }>({ orderId: po.id, tab: 'items' });
  const activeTab = openTab.orderId === po.id ? openTab.tab : 'items';
  const snapshot = po.customerSnapshot || {};
  const queueState = getPOQueueState(po);
  const steps = orderSteps(po);
  const items = po.items || [];
  const totals = orderTotals(items);
  const customerName = snapshot.companyName || po.customerName;

  return (
    <div className="order-detail" data-erp-table-layout="content">
      <div className="order-commandbar">
        <PageBackButton onClick={props.onBack} />
        <h1 className="order-commandbar__title">Đơn hàng bán</h1>
        <span className="order-status" style={{ color: queueState.color, background: queueState.background }}>
          {queueState.label}
        </span>
        <span className="order-commandbar__divider" aria-hidden="true" />
        {canManage && (
          <>
            <button type="button" className="btn btn-outline" onClick={props.onEdit}>
              Sửa
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={props.onRepeat}
              title="Tạo đơn hàng mới từ đơn này"
            >
              Nhân bản
            </button>
          </>
        )}
        <button type="button" className="btn btn-outline" onClick={props.onPrint} title="Xuất đơn hàng gửi khách">
          In
        </button>
        {props.canDelete && (
          <button type="button" className="btn btn-outline order-commandbar__delete" onClick={props.onDelete}>
            Xóa
          </button>
        )}
        <ol className="order-progress" aria-label="Tiến độ đơn hàng">
          <li className="order-progress__lead">Tiến độ:</li>
          {steps.map((step, index) => (
            <Fragment key={step.value}>
              {index > 0 && (
                <li className="order-progress__arrow" aria-hidden="true">
                  →
                </li>
              )}
              <li
                className={`order-progress__step order-progress__step--${step.state}`}
                aria-current={step.state === 'current' ? 'step' : undefined}
                title={
                  step.reachedAt
                    ? `${formatDateTime(step.reachedAt, 'vi-VN')} · ${actorLabel(step.reachedBy) || 'Không rõ'}`
                    : ORDER_STEP_TRIGGERS[step.value]
                }
              >
                {step.label}
              </li>
            </Fragment>
          ))}
        </ol>
      </div>

      <dl className="order-card order-info">
        <InfoField
          label="Khách hàng"
          value={
            props.onOpenCustomer ? (
              <button type="button" className="order-link" onClick={props.onOpenCustomer} title={customerName}>
                {customerName}
              </button>
            ) : (
              customerName
            )
          }
        />
        <InfoField label="Số đơn hàng" value={po.poCode} strong />
        <InfoField label="Ngày đặt" value={formatDate(po.orderDate || po.createdAt, 'vi-VN', '')} />
        <InfoField label="Mã khách" value={snapshot.customerCode || customer?.customerCode} />
        <InfoField label="Hạng khách" value={po.customerRank || snapshot.customerRank || customer?.customerRank} />
        <InfoField label="Giao dự kiến" value={formatDate(po.expectedDeliveryDate, 'vi-VN', '')} />
        <InfoField label="Địa chỉ giao" value={snapshot.address || customer?.address} />
        <InfoField label="Nhân viên bán" value={props.saleName} />
        <InfoField label="Diễn giải" value={po.notes} />
      </dl>

      <section className="order-card order-tabs">
        <div className="content-tabs order-tabs__bar" role="tablist" aria-label="Nội dung đơn hàng">
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
        <div
          className="order-tabs__panel"
          role="tabpanel"
          aria-label={ORDER_TABS.find(tab => tab.id === activeTab)?.label}
        >
          {activeTab === 'items' && (
            <OrderItemsTable
              items={items}
              supplierNames={props.supplierNames}
              canViewFinancials={canViewFinancials}
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
          {activeTab === 'history' && <OrderHistoryPanel logs={po.historyLogs || []} />}
        </div>
      </section>

      <div className="order-footer">
        <p className="order-audit-line">
          Người lập: {actorLabel(po.createdBy) || 'Không rõ'}
          {po.createdAt ? ` · ${formatDateTime(po.createdAt, 'vi-VN')}` : ''} · Người sửa:{' '}
          {po.updatedBy
            ? `${actorLabel(po.updatedBy)}${po.updatedAt ? ` · ${formatDateTime(po.updatedAt, 'vi-VN')}` : ''}`
            : 'chưa có'}
        </p>
        {canViewFinancials && items.length > 0 && (
          <dl className="order-card order-totals">
            <dt>Tổng tiền hàng</dt>
            <dd>{amount(totals.grossAmount)}</dd>
            <dt>Tiền chiết khấu</dt>
            <dd>{amount(totals.discountAmount)}</dd>
            <dt>Tiền thuế GTGT</dt>
            <dd>{amount(totals.vatAmount)}</dd>
            <dt className="order-totals__grand">Tổng tiền thanh toán</dt>
            <dd className="order-totals__grand">{amount(totals.amountWithVat)}</dd>
            <dt>KPI đơn</dt>
            <dd>{totals.kpi.toFixed(1)} %</dd>
          </dl>
        )}
      </div>
    </div>
  );
}
