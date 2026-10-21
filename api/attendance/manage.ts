import { AdminApiError, apiErrorResponse, jsonResponse, readJsonBody } from '../../server/adminUsers.js';
import { requireActiveErpCaller } from '../../server/erpCaller.js';
import { manageAttendance } from '../../server/attendance.js';
import { AttendanceValidationError } from '../../src/features/attendance/model/attendance.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActiveErpCaller(request);
    const body = await readJsonBody(request);
    try { return jsonResponse(await manageAttendance(actor, body)); }
    catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (error instanceof AttendanceValidationError) throw new AdminApiError(400, error.message);
      throw error;
    }
  } catch (error) { return apiErrorResponse(error); }
}
