import {
  apiErrorResponse,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  updateManagedUser,
  validateUpdateUserBody
} from '../../server/adminUsers.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const input = validateUpdateUserBody(await readJsonBody(request));
    const user = await updateManagedUser(caller, input);
    return jsonResponse({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
