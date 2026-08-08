import {
  apiErrorResponse,
  jsonResponse,
  readJsonBody,
  rejectNonPostRequest,
  requireAdmin,
  setManagedUserActive,
  validateSetActiveBody
} from '../../server/adminUsers';

export default {
  async fetch(request: Request): Promise<Response> {
    const methodError = rejectNonPostRequest(request);
    if (methodError) return methodError;

    try {
      const caller = await requireAdmin(request);
      const input = validateSetActiveBody(await readJsonBody(request));
      const result = await setManagedUserActive(caller, input);
      return jsonResponse(result);
    } catch (error) {
      return apiErrorResponse(error);
    }
  }
};
