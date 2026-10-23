import { roundStock, type WarehouseBalance } from '../../inventory/model/warehouse.js';
import { overdueDays } from './accountingReports.js';

export interface GoodsReportRow {
  id: string; side: 'ar' | 'ap'; partnerId: string; partnerName: string; orderId: string; orderCode: string;
  lineId: string; catalogItemId: string; code: string; name: string; unit: string; required: number | null;
  received: number | null; transit: number | null; returned: number | null; closedShort: number | null;
  remaining: number | null; toDispatch: number | null; dueDate: string; reconciliation: string;
  vouchers: { id: string; code: string; kind: string; label?: string; postingDate: string; quantity: number; unit: string; reversedBy: string }[];
}
export type StockAlert = 'Tồn âm' | 'Cần nhập hàng' | 'Chưa thiết lập ngưỡng' | 'Trong ngưỡng';
export function stockAlert(quantity: number, minimum: number | null | undefined): StockAlert {
  return quantity < 0 ? 'Tồn âm' : minimum == null ? 'Chưa thiết lập ngưỡng' : quantity < minimum ? 'Cần nhập hàng' : 'Trong ngưỡng';
}
export interface StockReportRow extends WarehouseBalance { warehouseId: 'raw_main' | 'finished_main'; catalogItemId: string; alert: StockAlert; vouchers?: { id: string; code: string; postingDate: string; delta: number; unit: string }[] }
export function deadlineAlert(dueDate: string, at: string, leadDays: number, outstanding: number | null) {
  if (outstanding === null) return 'Cần đối soát';
  if (outstanding <= 0) return 'Hoàn tất';
  const days = overdueDays(dueDate, at);
  return days === null ? 'Chưa có hạn' : days > 0 ? 'Quá hạn' : days === 0 ? 'Đến hạn hôm nay' : -days <= leadDays ? 'Sắp đến hạn' : 'Chưa đến hạn';
}
export const goodsReportAlert = (row:GoodsReportRow, at:string, leadDays:number) => row.reconciliation ? 'Cần đối soát' : deadlineAlert(row.dueDate,at,leadDays,row.remaining);
export const safeStock = (value: number, factor: number) => Number.isFinite(value) && Number.isFinite(factor) && factor > 0 ? roundStock(value / factor) : null;
