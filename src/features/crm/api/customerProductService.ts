import { doc, runTransaction } from 'firebase/firestore';
import { getFirebaseDatabase } from '@/infrastructure/firebase/client';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import type { UserProfile } from '@/shared/types';
import { normalizeCustomerProduct, type CustomerProductRecord, type CustomerRecord } from '../model/crmModels';
import { appendCustomerProduct, buildCustomerProduct, replaceCustomerProduct, type CustomerProductInput } from '../model/customerProductCatalog';

const readCatalogCustomer = (data: Record<string, unknown>, id: string) => ({
  ...data, id, products: Array.isArray(data.products) ? data.products.map(normalizeCustomerProduct) : []
}) as CustomerRecord;

export async function createCustomerProduct(customerId: string, input: CustomerProductInput, user: UserProfile) {
  if (user.active !== true || !['admin', 'sale'].includes(user.role)) throw new Error('Bạn không có quyền tạo mã sản phẩm.');
  const now = new Date().toISOString();
  const product = buildCustomerProduct(input, `prod-${crypto.randomUUID()}`, now);
  const database = await getFirebaseDatabase('creating customer product');
  if (database) {
    // Read and append atomically: simultaneous saves cannot overwrite the catalog or create duplicate codes.
    return runTransaction(database, async transaction => {
      const ref = doc(database, 'customers', customerId);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Không tìm thấy khách hàng.');
      const customer = readCatalogCustomer(snapshot.data(), snapshot.id);
      const products = appendCustomerProduct(customer, product, user);
      transaction.update(ref, { products, updatedAt: now, updatedBy: user.displayName, updatedById: user.uid });
      return { product, products };
    });
  }
  const customer = await dbService.getDocument('customers', customerId) as CustomerRecord | null;
  if (!customer) throw new Error('Không tìm thấy khách hàng.');
  const products = appendCustomerProduct(customer, product, user);
  const saved = await dbService.updateDocument('customers', customerId, { products, updatedBy: user.displayName, updatedById: user.uid });
  if (!saved) throw new Error('Không thể lưu mã sản phẩm.');
  return { product, products };
}

export async function updateCustomerProduct(customerId: string, product: CustomerProductRecord, user: UserProfile, expectedVersion = '') {
  if (user.active !== true || user.role !== 'admin') throw new Error('Chỉ Admin được duyệt chỉnh sửa sản phẩm.');
  const now = new Date().toISOString();
  const updated = { ...product, updatedAt: now };
  const database = await getFirebaseDatabase('updating customer product');
  if (database) return runTransaction(database, async transaction => {
    const ref = doc(database, 'customers', customerId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Không tìm thấy khách hàng.');
    const customer = readCatalogCustomer(snapshot.data(), snapshot.id);
    const products = replaceCustomerProduct(customer, updated, user, expectedVersion);
    transaction.update(ref, { products, updatedAt: now, updatedBy: user.displayName, updatedById: user.uid });
    return products;
  });
  const customer = await dbService.getDocument('customers', customerId) as CustomerRecord | null;
  if (!customer) throw new Error('Không tìm thấy khách hàng.');
  const products = replaceCustomerProduct(customer, updated, user, expectedVersion);
  if (!await dbService.updateDocument('customers', customerId, { products, updatedBy: user.displayName, updatedById: user.uid })) throw new Error('Không thể lưu sản phẩm.');
  return products;
}
