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
  syncUserDirectory,
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
      // The first administrator's profile is created inside requireAdmin; this only returns it to the client.
      case 'bootstrap':
        return jsonResponse({ user: caller.profile });
      case 'create':
        return jsonResponse({ user: await createManagedUser(caller, validateCreateUserBody(body)) }, 201);
      case 'update':
        return jsonResponse({ user: await updateManagedUser(caller, validateUpdateUserBody(body)) });
      case 'set_active':
        return jsonResponse(await setManagedUserActive(caller, validateSetActiveBody(body)));
      case 'delete':
        return jsonResponse(await deleteManagedUser(caller, validateDeleteUserBody(body)));
      case 'sync_directory':
        return jsonResponse(await syncUserDirectory());
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
