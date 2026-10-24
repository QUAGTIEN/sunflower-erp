import { apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { loadAccountingReports, loadPartnerSummary } from '../../server/accountingReports.js';
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request),
      body = await readJsonBody(request);
    return jsonResponse(
      body.action === 'partner_summary' ? await loadPartnerSummary(actor) : await loadAccountingReports(actor)
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
