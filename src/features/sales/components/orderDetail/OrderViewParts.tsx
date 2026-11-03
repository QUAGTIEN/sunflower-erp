import { Printer } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { formatDateTime } from '@/shared/utils/dateFormatting';
import { getPOQueueState } from '../../model/poWorkflow';
import { actorLabel, orderSteps, type OrderHistoryLog } from '../../model/orderDetail';
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
 * The seven queue steps on one line under the voucher header, read-only (D-PO1). When and by whom a step was
 * reached stays in the tooltip so the strip carries no extra text.
 */
export function OrderProgressStrip({ po }: { po: OrderStatusSource }) {
  return (
    <nav className="order-progress-strip" aria-label="Tiến độ đơn hàng">
      <span className="order-progress-strip__label">Tiến độ</span>
      <ol>
        {orderSteps(po).map(step => (
          <li
            key={step.value}
            className={`order-progress-strip__step order-progress-strip__step--${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
            title={
              step.reachedAt
                ? `${formatDateTime(step.reachedAt, 'vi-VN')} · ${actorLabel(step.reachedBy) || 'Không rõ'}`
                : undefined
            }
          >
            {step.label}
          </li>
        ))}
      </ol>
    </nav>
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
      <IconButton label="In đơn hàng" icon={<Printer size={16} />} onClick={onPrint} />
      {canManage && (
        <button type="button" className="btn btn-outline" onClick={onRepeat} title="Tạo đơn hàng mới từ đơn này">
          Nhân bản
        </button>
      )}
      {canDelete && <span className="po-view-actions-divider" aria-hidden="true" />}
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
