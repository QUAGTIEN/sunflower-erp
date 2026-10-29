import { AdminApiError, apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { loadPartnerSummary } from '../../server/accountingReports.js';
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request),
      body = await readJsonBody(request);
    // Báo cáo is read in the browser; this endpoint only serves the partner summary filtered per caller.
    if (body.action !== 'partner_summary') throw new AdminApiError(400, 'Thao tác báo cáo không hợp lệ.');
    return jsonResponse(await loadPartnerSummary(actor));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
