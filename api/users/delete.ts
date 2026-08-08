import {
  apiErrorResponse,
  deleteManagedUser,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  validateDeleteUserBody
} from '../../server/adminUsers';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const input = validateDeleteUserBody(await readJsonBody(request));
    const result = await deleteManagedUser(caller, input);
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
