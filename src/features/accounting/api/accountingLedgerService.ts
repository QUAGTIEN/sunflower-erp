import { warehouseRequest } from '@/features/inventory/api/warehouseService';
export const mutateAccountingLedger = (
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: string; code?: string }> => warehouseRequest(body, '/api/accounting/manage');
