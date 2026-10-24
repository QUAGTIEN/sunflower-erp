import { warehouseRequest } from './warehouseService';
import type { GoodsData } from '../model/finishedGoods';
export const loadFinishedGoods = (): Promise<GoodsData> =>
  warehouseRequest({ action: 'load' }, '/api/warehouse/finished');
export const mutateFinishedGoods = (
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: string; code?: string }> => warehouseRequest(body, '/api/warehouse/finished');
