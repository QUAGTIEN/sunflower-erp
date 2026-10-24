import { useEffect, useState } from 'react';
import { warehouseRequest } from '@/features/inventory/api/warehouseService';
import type { PartnerDebt } from '../model/partnerDebt';
import type { WarehouseActor } from '@/features/inventory/model/warehouse';
import { canReadPartnerSummary } from '../model/reportAccess';
export function usePartnerDebt(actor: WarehouseActor) {
  const [data, setData] = useState<PartnerDebt[] | null>(null),
    [error, setError] = useState(''),
    [refresh, setRefresh] = useState(0);
  const allowed = canReadPartnerSummary(actor);
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void warehouseRequest({ action: 'partner_summary' }, '/api/accounting/reports')
      .then(next => {
        if (!cancelled) {
          setData(next.partners);
          setError('');
        }
      })
      .catch(cause => {
        if (!cancelled) {
          setData(null);
          setError(cause instanceof Error ? cause.message : 'Không tải được công nợ.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, actor.uid, refresh]);
  return {
    allowed,
    loaded: allowed && data !== null,
    error: allowed ? error : 'Bạn không có quyền xem tóm tắt công nợ.',
    rows: data || [],
    reload: () => {
      setData(null);
      setRefresh(v => v + 1);
    },
    get: (side: 'ar' | 'ap', id: string) =>
      data === null
        ? undefined
        : data.find(r => r.side === side && r.partnerId === id) || {
            side,
            partnerId: id,
            debt: 0,
            advance: 0,
            legacyDebt: 0,
            legacyCount: 0
          }
  };
}
