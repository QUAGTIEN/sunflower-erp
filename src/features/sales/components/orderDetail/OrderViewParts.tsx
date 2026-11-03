import { Printer } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { getPOQueueState } from '../../model/poWorkflow';
import './OrderDetail.css';

interface OrderStatusSource {
  status?: string;
}

export function OrderStatusBadge({ po }: { po: OrderStatusSource }) {
  const state = getPOQueueState(po);
  return (
    <span className="order-status" style={{ color: state.color, background: state.background }}>
      {state.label}
    </span>
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
