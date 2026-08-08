import {
  apiErrorResponse,
  createManagedUser,
  jsonResponse,
  readJsonBody,
  rejectNonPostRequest,
  requireAdmin,
  validateCreateUserBody
} from '../../server/adminUsers';

export default {
  async fetch(request: Request): Promise<Response> {
    const methodError = rejectNonPostRequest(request);
    if (methodError) return methodError;

    try {
      const caller = await requireAdmin(request);
      const input = validateCreateUserBody(await readJsonBody(request));
      const user = await createManagedUser(caller, input);
      return jsonResponse({ user }, 201);
    } catch (error) {
      return apiErrorResponse(error);
    }
  }
};
