import {
  AdminApiError,
  apiErrorResponse,
  createManagedUser,
  deleteManagedUser,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  setManagedUserActive,
  updateManagedUser,
  validateCreateUserBody,
  validateDeleteUserBody,
  validateSetActiveBody,
  validateUpdateUserBody
} from '../../server/adminUsers.js';

// One function for every account action keeps the deployment under the Vercel Hobby function limit.
export async function POST(request: Request): Promise<Response> {
  try {
    const caller = await requireAdmin(request);
    const body = await readJsonBody(request);
    switch (body.action) {
      case 'create':
        return jsonResponse({ user: await createManagedUser(caller, validateCreateUserBody(body)) }, 201);
      case 'update':
        return jsonResponse({ user: await updateManagedUser(caller, validateUpdateUserBody(body)) });
      case 'set_active':
        return jsonResponse(await setManagedUserActive(caller, validateSetActiveBody(body)));
      case 'delete':
        return jsonResponse(await deleteManagedUser(caller, validateDeleteUserBody(body)));
      default:
        throw new AdminApiError(400, 'Thao tác tài khoản không hợp lệ.', 'users/invalid-action');
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
