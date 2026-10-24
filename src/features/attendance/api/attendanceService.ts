import { authService, isFirebaseRuntimeEnabled } from '@/infrastructure/firebase/erpDataGateway';
import type { AttendanceMonth, AttendanceWorkspace } from '../model/attendance';

async function request(body: Record<string, unknown>) {
  if (!isFirebaseRuntimeEnabled)
    throw new Error('Chấm công cần kết nối Firebase và API máy chủ. Chế độ dữ liệu local chưa hỗ trợ chấm công.');
  const token = await authService.getIdToken();
  let response: Response;
  try {
    response = await fetch('/api/attendance/manage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('Chưa nhận được phản hồi máy chủ. Tải lại để kiểm tra dữ liệu trước khi thử lại.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success)
    throw new Error(
      data?.error ||
        (response.status === 404
          ? 'API chấm công chưa được triển khai. Local cần chạy bằng Vercel dev.'
          : 'Không thể xử lý chấm công. Kiểm tra kết nối và thử lại.')
    );
  return data;
}
export const loadAttendance = (month: string): Promise<AttendanceWorkspace> => request({ action: 'load', month });
export const saveAttendanceSettings = (changes: Record<string, unknown>[]) => request({ action: 'settings', changes });
export const mutateAttendance = async (body: Record<string, unknown>): Promise<AttendanceMonth> =>
  (await request(body)).record;
