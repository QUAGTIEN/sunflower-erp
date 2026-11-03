import { formatDateTime } from '@/shared/utils/dateFormatting';
import { getPOQueueState } from '../../model/poWorkflow';
import { ORDER_STEP_TRIGGERS, actorLabel, orderSteps, type OrderHistoryLog } from '../../model/orderDetail';
import './OrderDetail.css';

interface OrderStatusSource {
  status?: string;
  historyLogs?: OrderHistoryLog[];
}

export function OrderStatusBadge({ po }: { po: OrderStatusSource }) {
  const state = getPOQueueState(po);
  return (
    <span className="order-status" style={{ color: state.color, background: state.background }}>
      {state.label}
    </span>
  );
}

/**
 * The seven queue steps, read-only (D-PO1): a reached step shows when and by whom, the others say what moves the
 * order there. Laid out like the other collapsible panels of the order form's sidebar.
 */
export function OrderProgressPanel({ po }: { po: OrderStatusSource }) {
  const steps = orderSteps(po);
  return (
    <section className="order-progress-panel" aria-label="Tiến độ đơn hàng">
      <h3>Tiến độ đơn hàng</h3>
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.value}
            className={`order-progress-panel__step order-progress-panel__step--${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="order-progress-panel__index">{index + 1}</span>
            <span className="order-progress-panel__text">
              <strong>{step.label}</strong>
              <small>
                {step.reachedAt
                  ? `${formatDateTime(step.reachedAt, 'vi-VN')} · ${actorLabel(step.reachedBy) || 'Không rõ'}`
                  : ORDER_STEP_TRIGGERS[step.value]}
              </small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface OrderViewActionsProps {
  canManage: boolean;
  canDelete: boolean;
  onPrint: () => void;
  onRepeat: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Toolbar of the order voucher in view mode; it takes the place of "Lưu Đơn Hàng" of the editable form. */
export function OrderViewActions({ canManage, canDelete, onPrint, onRepeat, onEdit, onDelete }: OrderViewActionsProps) {
  return (
    <>
      <button type="button" className="btn btn-outline" onClick={onPrint} title="Xuất đơn hàng gửi khách">
        In
      </button>
      {canManage && (
        <button type="button" className="btn btn-outline" onClick={onRepeat} title="Tạo đơn hàng mới từ đơn này">
          Nhân bản
        </button>
      )}
      {canDelete && (
        <button type="button" className="btn btn-outline" onClick={onDelete}>
          Xóa
        </button>
      )}
      {canManage && (
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          Sửa
        </button>
      )}
    </>
  );
}

export function OrderAuditLine({
  createdBy,
  createdAt,
  updatedBy,
  updatedAt
}: {
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}) {
  return (
    <p className="order-audit-line">
      Người lập: {actorLabel(createdBy) || 'Không rõ'}
      {createdAt ? ` · ${formatDateTime(createdAt, 'vi-VN')}` : ''} · Người sửa:{' '}
      {updatedBy ? `${actorLabel(updatedBy)}${updatedAt ? ` · ${formatDateTime(updatedAt, 'vi-VN')}` : ''}` : 'chưa có'}
    </p>
  );
}
