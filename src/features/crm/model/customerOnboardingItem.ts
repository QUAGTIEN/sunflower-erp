import type { CustomerPendingOrderItem } from './crmModels';
import type { PODiscountType } from '@/domain/poFinancials';

export const createCustomerOnboardingItem = (
  index: number,
  deliveryDate: string,
  discountType: PODiscountType,
  discountRate: number,
  discountAmount: number
): CustomerPendingOrderItem => ({
  itemId: `draft-item-${Date.now()}-${index}`,
  productCode: '',
  productName: '',
  productType: 'tem_trang_cuon',
  size: '',
  material: '',
  unit: 'cái',
  quantity: 1000,
  price: 0,
  vatRate: 8,
  discountType,
  discountRate,
  discountAmount,
  deliveryDate,
  supplierId: '',
  supplierName: '',
  purchasePrice: 0,
  leadTimeDays: 0,
  workType: 'gia_cong',
  specifications: {},
  files: [],
  previewImages: []
});

/**
 * Splits the onboarding rows: a lead becomes a customer without a first order, so untouched rows are dropped, rows with
 * a code and a name become the customer's product codes, and only those with a quantity go into the first order.
 */
export function splitOnboardingItems(items: CustomerPendingOrderItem[]) {
  const filled = items.filter(item => item.productCode.trim() || item.productName.trim());
  return {
    products: filled,
    orderItems: filled.filter(item => Number(item.quantity) > 0),
    incomplete: filled.some(item => !item.productCode.trim() || !item.productName.trim())
  };
}
