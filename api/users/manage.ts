import {
  AdminApiError,
  apiErrorResponse,
  changeOwnPassword,
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
  validateOwnPasswordBody,
  validateResetPasswordBody,
  validateSetActiveBody,
  validateUpdateUserBody
} from '../../server/adminUsers.js';
import {
  deleteAccountPassword,
  revealAccountPassword,
  storeAccountPassword,
  type PasswordSource
} from '../../server/passwordVault.js';
import { manageRecycledItem, validateRecycleBody } from '../../server/recycleBin.js';

/**
 * D-BM2: the password is already changed in Firebase when this runs. If sealing fails the stale copy is dropped,
 * so an admin never sees an old password; the response says whether the copy was kept.
 */
const keepPasswordCopy = async (uid: string, password: string, source: PasswordSource, actorName: string) => {
  try {
    return await storeAccountPassword(uid, password, source, actorName);
  } catch {
    await deleteAccountPassword(uid).catch(() => undefined);
    return false;
  }
};

// One function for every account action keeps the deployment under the Vercel Hobby function limit.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    // The only action open to every active account; all others below require an admin.
    if (body.action === 'change_own_password') {
      const changed = await changeOwnPassword(request, validateOwnPasswordBody(body));
      const passwordStored = await keepPasswordCopy(changed.uid, changed.password, 'self_change', changed.displayName);
      return jsonResponse({ uid: changed.uid, passwordStored });
    }
    const caller = await requireAdmin(request);
    switch (body.action) {
      // The first administrator's profile is created inside requireAdmin; this only returns it to the client.
      case 'bootstrap':
        return jsonResponse({ user: caller.profile });
      case 'create': {
        const input = validateCreateUserBody(body);
        const user = await createManagedUser(caller, input);
        const passwordStored = await keepPasswordCopy(
          user.uid,
          input.password,
          'admin_create',
          caller.profile.displayName
        );
        return jsonResponse({ user, passwordStored }, 201);
      }
      case 'update':
        return jsonResponse({ user: await updateManagedUser(caller, validateUpdateUserBody(body)) });
      case 'set_active':
        return jsonResponse(await setManagedUserActive(caller, validateSetActiveBody(body)));
      case 'delete': {
        const result = await deleteManagedUser(caller, validateDeleteUserBody(body));
        await deleteAccountPassword(result.uid);
        return jsonResponse(result);
      }
      case 'sync_directory':
        return jsonResponse(await syncUserDirectory());
      case 'reset_password': {
        const input = validateResetPasswordBody(body);
        const result = await resetManagedUserPassword(caller, input);
        const passwordStored = await keepPasswordCopy(
          input.uid,
          input.password,
          'admin_reset',
          caller.profile.displayName
        );
        return jsonResponse({ ...result, passwordStored });
      }
      case 'reveal_password':
        return jsonResponse(await revealAccountPassword(caller, validateDeleteUserBody(body).uid));
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
