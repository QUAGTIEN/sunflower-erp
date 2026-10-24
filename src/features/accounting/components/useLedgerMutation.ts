import { useRef, useState } from 'react';
import { mutateAccountingLedger } from '../api/accountingLedgerService';
import { WarehouseRequestError } from '@/features/inventory/api/warehouseService';
import { warehouseDate } from '@/features/inventory/model/warehouse';
import { showErrorToast, showSuccessToast } from '@/shared/feedback/mutationFeedback';

export function useLedgerMutation(onSaved: () => void) {
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false),
    frozen = useRef<Record<string, unknown> | null>(null);
  const execute = async (body: Record<string, unknown>) => {
    if (
      pending.current ||
      (!uncertain && !window.confirm('Ghi sổ chứng từ này? Chứng từ đã ghi chỉ được đảo/điều chỉnh theo quyền.'))
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      frozen.current ||= { ...body, requestId: crypto.randomUUID(), postingDate: warehouseDate() };
      const result = await mutateAccountingLedger(frozen.current);
      frozen.current = null;
      setUncertain(false);
      showSuccessToast(result.code ? `Đã ghi ${result.code}` : 'Đã cập nhật kỳ kế toán');
      onSaved();
    } catch (cause) {
      const unknown = cause instanceof WarehouseRequestError && cause.uncertain;
      setUncertain(unknown);
      if (!unknown) frozen.current = null;
      const message = cause instanceof Error ? cause.message : 'Không ghi được chứng từ.';
      setError(message);
      showErrorToast(message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, uncertain, error, pending, execute };
}
