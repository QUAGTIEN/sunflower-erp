import {
  apiErrorResponse,
  deleteManagedUser,
  jsonResponse,
  readJsonBody,
  rejectNonPostRequest,
  requireAdmin,
  validateDeleteUserBody
} from '../../server/adminUsers';

export default {
  async fetch(request: Request): Promise<Response> {
    const methodError = rejectNonPostRequest(request);
    if (methodError) return methodError;

    try {
      const caller = await requireAdmin(request);
      const input = validateDeleteUserBody(await readJsonBody(request));
      const result = await deleteManagedUser(caller, input);
      return jsonResponse(result);
    } catch (error) {
      return apiErrorResponse(error);
    }
  }
};
