import { authService, dbService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import { catalogSources, type CatalogItem, type CatalogLink, type CatalogSourceRef } from '../model/itemCatalog';

export async function loadItemCatalog() {
  const [items, links, requests] = await Promise.all(['item_catalog', 'catalog_links', 'catalog_requests'].map(collection => dbService.getCollection(collection)));
  return { items: items as CatalogItem[], links: links as CatalogLink[], imports: requests.filter(request => request.action === 'import') as Array<{ id: string; createdAt: string; actorName: string; count: number }> };
}
export async function loadLegacyCatalogSources(type: CatalogSourceRef['type']) {
  const collection = { inventory: 'inventory', customer_product: 'customers', po_item: 'pos' }[type];
  // Do not normalize missing source IDs or units into fabricated defaults during migration.
  return catalogSources(type, await dbService.getRawCollection(collection));
}
export async function mutateItemCatalog(body: Record<string, unknown>) {
  if (!isFirebaseRuntimeEnabled) throw new Error('Danh mục mới cần Firebase và API máy chủ. Chế độ demo chỉ xem dữ liệu.');
  const token = await authService.getIdToken();
  let response: Response;
  try {
    response = await fetch('/api/catalog/manage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new Error('Chưa nhận được phản hồi máy chủ. Hãy gửi lại cùng thao tác để tránh tạo trùng.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) throw new Error(result?.error || (response.status === 404 ? 'API danh mục chưa được triển khai. Local cần chạy Vercel dev.' : 'Không thể lưu danh mục. Hãy kiểm tra kết nối.'));
  return result as { success: boolean; ids: string[]; requestId: string };
}
