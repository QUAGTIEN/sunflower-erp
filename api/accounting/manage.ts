import { AdminApiError, apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { manageAccountingLedger } from '../../server/accountingLedger.js';
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request),
      body = await readJsonBody(request);
    try {
      return jsonResponse(await manageAccountingLedger(actor, body));
    } catch (error) {
      if (error instanceof Error && ['LedgerValidationError', 'WarehouseValidationError'].includes(error.name))
        throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
