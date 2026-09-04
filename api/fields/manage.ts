import { apiErrorResponse, jsonResponse, readJsonBody, requireAdmin } from '../../server/adminUsers.js';
import { manageFieldConfiguration } from '../../server/fieldConfiguration.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    return jsonResponse(await manageFieldConfiguration(caller, await readJsonBody(request)));
  } catch (error) { return apiErrorResponse(error); }
}
