import { useRef, useState } from 'react';
import { mutateFinishedGoods } from '../api/finishedGoodsService';
import { WarehouseRequestError } from '../api/warehouseService';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';
import { warehouseDate } from '../model/warehouse';

export function useGoodsMutation(onSaved: () => void) {
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), sent = useRef<Record<string, unknown> | null>(null);
  const execute = async (body: Record<string, unknown>) => {
    if (pending.current) return;
    if (!uncertain && !window.confirm('Ghi nghiệp vụ này? Phiếu đã ghi chỉ Admin được đảo.')) return;
    pending.current = true; setBusy(true); setError('');
    try {
      sent.current ||= { ...body, requestId: crypto.randomUUID(), postingDate: warehouseDate() };
      const result = await mutateFinishedGoods(sent.current);
      sent.current = null; setUncertain(false); showSuccessToast(result.code ? `Đã ghi ${result.code}` : 'Đã cập nhật chuyến'); onSaved();
    } catch (cause) {
      const unknown = cause instanceof WarehouseRequestError && cause.uncertain;
      setUncertain(unknown); if (!unknown) sent.current = null;
      const message = cause instanceof Error ? cause.message : 'Không thể ghi nghiệp vụ.'; setError(message); showErrorToast(message);
    } finally { pending.current = false; setBusy(false); }
  };
  return { busy, uncertain, error, execute, pending };
}
