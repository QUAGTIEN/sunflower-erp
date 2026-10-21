import { authService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import type { CatalogItem } from '@/features/catalog/model/itemCatalog';
import type { ProductionCatalogSnapshot } from '../model/productionOrder';

export interface ProductionDraftCatalog { materials: CatalogItem[]; lines: Record<string, { catalog?: ProductionCatalogSnapshot; error?: string }> }
export async function loadProductionDraftCatalog(poId: string): Promise<ProductionDraftCatalog> {
  if (!isFirebaseRuntimeEnabled) throw new Error('Tra cứu mã nội bộ cần kết nối Firebase và API máy chủ.');
  const token = await authService.getIdToken();
  const response = await fetch('/api/production/manage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'catalog', poId }) });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || 'Chưa tải được mã nội bộ. Hãy kiểm tra API máy chủ.');
  return result;
}

/** No unsafe direct-Firestore/local fallback: quantity reservation requires a server transaction. */
export async function mutateProductionOrder(body: Record<string, unknown>) {
  if (!isFirebaseRuntimeEnabled) throw new Error('LSX cần kết nối Firebase thật và API máy chủ để bảo đảm phân bổ số lượng. Chế độ dữ liệu demo chỉ xem được danh sách.');
  const token = await authService.getIdToken();
  const payload = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch('/api/production/manage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: payload });
  } catch { throw new Error('Chưa nhận được phản hồi máy chủ. Hãy thử lại cùng thao tác; hệ thống sẽ không tạo lệnh trùng.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || (response.status === 404 ? 'API lệnh sản xuất chưa được triển khai. Local cần chạy bằng Vercel dev.' : 'Không thể lưu LSX. Hãy kiểm tra kết nối và thử lại.'));
  return result as { success: boolean; id: string; revision: number };
}
