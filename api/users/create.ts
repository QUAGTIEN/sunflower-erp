import {
  apiErrorResponse,
  createManagedUser,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  validateCreateUserBody
} from '../../server/adminUsers';

export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const input = validateCreateUserBody(await readJsonBody(request));
    const user = await createManagedUser(caller, input);
    return jsonResponse({ user }, 201);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
