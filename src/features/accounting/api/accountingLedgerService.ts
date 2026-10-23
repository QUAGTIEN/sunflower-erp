import { warehouseRequest } from '@/features/inventory/api/warehouseService';
import type { LedgerData } from '../model/accountingLedger';
export const loadAccountingLedger = (): Promise<LedgerData> => warehouseRequest({ action: 'load' }, '/api/accounting/manage');
export const mutateAccountingLedger = (body: Record<string, unknown>): Promise<{ success: boolean; id?: string; code?: string }> => warehouseRequest(body, '/api/accounting/manage');
