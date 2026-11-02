import {
  AdminApiError,
  apiErrorResponse,
  createManagedUser,
  deleteManagedUser,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  resetManagedUserPassword,
  setManagedUserActive,
  updateManagedUser,
  validateCreateUserBody,
  validateDeleteUserBody,
  validateResetPasswordBody,
  validateSetActiveBody,
  validateUpdateUserBody
} from '../../server/adminUsers.js';
import { manageRecycledItem, validateRecycleBody } from '../../server/recycleBin.js';

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
      case 'reset_password':
        return jsonResponse(await resetManagedUserPassword(caller, validateResetPasswordBody(body)));
      // D-TR1: the recycle bin is admin-only, so it shares the admin account endpoint instead of a new function.
      case 'recycle_restore':
      case 'recycle_purge':
        return jsonResponse(await manageRecycledItem(caller, validateRecycleBody(body)));
      default:
        throw new AdminApiError(400, 'Thao tác tài khoản không hợp lệ.', 'users/invalid-action');
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
