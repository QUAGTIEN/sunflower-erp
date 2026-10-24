import { AdminApiError, apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { manageWarehouse } from '../../server/warehouse.js';
import { WarehouseValidationError } from '../../src/features/inventory/model/warehouse.js';
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request),
      body = await readJsonBody(request);
    try {
      return jsonResponse(await manageWarehouse(actor, body));
    } catch (error) {
      if (error instanceof WarehouseValidationError) throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
