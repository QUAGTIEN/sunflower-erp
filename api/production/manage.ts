import { apiErrorResponse, jsonResponse, readJsonBody, AdminApiError } from '../../server/adminUsers.js';
import { manageProductionOrder, requireProductionCaller } from '../../server/productionOrders.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireProductionCaller(request);
    const body = await readJsonBody(request);
    try { return jsonResponse(await manageProductionOrder(caller, body)); }
    catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (error instanceof Error && error.constructor === Error) throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}
