import { authService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import type { WarehouseData } from '../model/warehouse';
export class WarehouseRequestError extends Error { uncertain: boolean; constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain; } }
async function request(body: Record<string, unknown>) {
  if (!isFirebaseRuntimeEnabled) throw new Error('Sổ kho cần Firebase và API máy chủ; không ghi kho vào dữ liệu local.');
  const token = await authService.getIdToken();
  let response: Response;
  try { response = await fetch('/api/warehouse/manage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new WarehouseRequestError('Mất kết nối, chưa xác định kết quả. Gửi lại đúng yêu cầu để kiểm tra; hệ thống không ghi trùng.', true); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new WarehouseRequestError(data?.error || 'Không xử lý được sổ kho. Kiểm tra API đã được triển khai và thử lại.', response.status >= 500 || !data);
  return data;
}
export const loadWarehouse = (): Promise<WarehouseData> => request({ action: 'load' });
export const mutateWarehouse = (body: Record<string, unknown>): Promise<{ success: boolean; id?: string; code?: string }> => request(body);
