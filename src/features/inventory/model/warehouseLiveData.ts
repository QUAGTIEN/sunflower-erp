import type { CatalogItem } from '../../catalog/model/itemCatalog.js';
import type { GoodsBalance, GoodsVoucher } from './finishedGoods.js';
import { buildItemUsers } from './itemUsers.js';
import type { WarehouseBalance, WarehouseCustomerUsage, WarehouseVoucher } from './warehouse.js';

type StoredDocument = Record<string, unknown> & { id: string };

export interface WarehouseSnapshots {
  catalog: StoredDocument[];
  balances: StoredDocument[];
  vouchers: StoredDocument[];
  commands: StoredDocument[];
  customers: StoredDocument[];
  links: StoredDocument[];
}

export interface WarehouseLiveData {
  items: CatalogItem[];
  rawBalances: WarehouseBalance[];
  goodsBalances: GoodsBalance[];
  rawVouchers: WarehouseVoucher[];
  goodsVouchers: GoodsVoucher[];
  itemUsers: Record<string, WarehouseCustomerUsage[]>;
}

export const EMPTY_WAREHOUSE_LIVE_DATA: WarehouseLiveData = {
  items: [],
  rawBalances: [],
  goodsBalances: [],
  rawVouchers: [],
  goodsVouchers: [],
  itemUsers: {}
};

/**
 * Both stores share one balance and one voucher collection; balances written before the finished-goods
 * store existed carry no warehouseId and belong to the NVL store.
 */
export function splitWarehouseLedgers(snapshots: WarehouseSnapshots): WarehouseLiveData {
  const inStore = (row: StoredDocument, warehouseId: string) =>
    row.warehouseId === warehouseId || (warehouseId === 'raw_main' && !row.warehouseId);
  return {
    items: snapshots.catalog as unknown as CatalogItem[],
    rawBalances: snapshots.balances.filter(row => inStore(row, 'raw_main')) as unknown as WarehouseBalance[],
    goodsBalances: snapshots.balances.filter(row => inStore(row, 'finished_main')) as unknown as GoodsBalance[],
    rawVouchers: snapshots.vouchers.filter(row => row.warehouseId === 'raw_main') as unknown as WarehouseVoucher[],
    goodsVouchers: snapshots.vouchers.filter(row => row.warehouseId === 'finished_main') as unknown as GoodsVoucher[],
    itemUsers: buildItemUsers(
      snapshots.catalog,
      snapshots.vouchers,
      snapshots.commands,
      snapshots.customers,
      snapshots.links
    )
  };
}
