import {
  apiErrorResponse,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  setManagedUserActive,
  validateSetActiveBody
} from '../../server/adminUsers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const input = validateSetActiveBody(await readJsonBody(request));
    const result = await setManagedUserActive(caller, input);
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
