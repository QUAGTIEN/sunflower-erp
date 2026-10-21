import { apiErrorResponse, jsonResponse, readJsonBody, AdminApiError } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { manageItemCatalog } from '../../server/itemCatalog.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request);
    const body = await readJsonBody(request);
    try { return jsonResponse(await manageItemCatalog(actor, body)); }
    catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (error instanceof Error && error.constructor === Error) throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}
