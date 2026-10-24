import { AdminApiError, apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { manageFinishedGoods } from '../../server/finishedGoods.js';
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request),
      body = await readJsonBody(request);
    try {
      return jsonResponse(await manageFinishedGoods(actor, body));
    } catch (error) {
      if (
        error instanceof Error &&
        !(error instanceof AdminApiError) &&
        (error.name === 'WarehouseValidationError' ||
          /quy đổi|liên kết|mã nội bộ|số lượng vượt|định danh/i.test(error.message))
      )
        throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
