import { useMemo } from 'react';
import { useLiveCollections, type LiveQuery } from '@/hooks/useLiveCollections';
import { EMPTY_WAREHOUSE_LIVE_DATA, splitWarehouseLedgers, type WarehouseSnapshots } from '../model/warehouseLiveData';

/** Every collection here is readable by canReadWarehouse in firestore.rules; none needs a per-user filter. */
export const WAREHOUSE_LIVE_QUERIES: LiveQuery<keyof WarehouseSnapshots>[] = [
  { name: 'catalog', collection: 'item_catalog' },
  { name: 'balances', collection: 'warehouse_balances' },
  { name: 'vouchers', collection: 'warehouse_vouchers' },
  { name: 'commands', collection: 'production_commands' },
  { name: 'customers', collection: 'customers' },
  { name: 'links', collection: 'catalog_links' }
];
const NO_QUERIES: LiveQuery<keyof WarehouseSnapshots>[] = [];
const MESSAGES = {
  readError: 'Không tải được sổ kho. Kiểm tra kết nối và thử lại.',
  unavailable: 'Sổ kho cần kết nối Firebase; chế độ dữ liệu local không hỗ trợ kho.'
};

/** Reads both stores straight from Firestore; posting still goes through the warehouse APIs. */
export function useWarehouseLiveData(permitted: boolean) {
  const live = useLiveCollections(permitted ? WAREHOUSE_LIVE_QUERIES : NO_QUERIES, MESSAGES);
  const data = useMemo(
    () => (live.snapshots && permitted ? splitWarehouseLedgers(live.snapshots) : EMPTY_WAREHOUSE_LIVE_DATA),
    [live.snapshots, permitted]
  );
  return {
    data,
    loaded: Boolean(live.snapshots) && permitted,
    loading: live.loading,
    error: live.error,
    reload: live.reload
  };
}
