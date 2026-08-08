import {
  apiErrorResponse,
  jsonResponse,
  readJsonBody,
  rejectNonPostRequest,
  requireAdmin,
  updateManagedUser,
  validateUpdateUserBody
} from '../../server/adminUsers';

export default {
  async fetch(request: Request): Promise<Response> {
    const methodError = rejectNonPostRequest(request);
    if (methodError) return methodError;

    try {
      const caller = await requireAdmin(request);
      const input = validateUpdateUserBody(await readJsonBody(request));
      const user = await updateManagedUser(caller, input);
      return jsonResponse({ user });
    } catch (error) {
      return apiErrorResponse(error);
    }
  }
};
