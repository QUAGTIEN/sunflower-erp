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

interface OrderHeaderActionsProps {
  canDelete: boolean;
  onPrint: () => void;
  onDelete: () => void;
}

/** Header tools of an open order; "Lưu" follows them in the form when the order is editable. */
export function OrderHeaderActions({ canDelete, onPrint, onDelete }: OrderHeaderActionsProps) {
  return (
    <>
      <IconButton label="Xuất phiếu đơn hàng" icon={<Printer size={16} />} onClick={onPrint} />
      {canDelete && (
        <button type="button" className="btn btn-outline" onClick={onDelete}>
          Xóa
        </button>
      )}
    </>
  );
}
