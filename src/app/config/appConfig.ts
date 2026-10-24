import type { NotificationModule } from '@/domain/notificationModels';

export const APP_LOGO_PATH = '/sunflower-logo-horizontal-transparent.png';
export const PAGE_NOTIFICATION_MODULES: Partial<Record<string, NotificationModule>> = {
  dashboard: 'dashboard',
  crm: 'crm',
  leads: 'leads',
  work_schedule: 'system',
  attendance: 'system',
  sales: 'sales',
  design: 'design',
  purchase: 'purchase',
  inventory: 'inventory',
  production: 'production',
  delivery: 'delivery',
  accounting: 'accounting'
};

export const AUDIT_PAGE_LABELS: Record<string, string> = {
  dashboard: 'Tổng quan',
  chat: 'Kênh trao đổi',
  crm: 'Khách hàng hợp tác',
  leads: 'Khách hàng tiềm năng',
  customer_data: 'Dữ liệu thô',
  commercial_map: 'Thương mại',
  work_schedule: 'Công việc',
  attendance: 'Chấm công',
  sales: 'Đơn hàng',
  sales_management: 'Quản lý Sale',
  design: 'Yêu cầu thiết kế',
  design_library: 'Kho mẫu thiết kế',
  purchase: 'Mua hàng',
  suppliers: 'Nhà cung cấp',
  inventory: 'Kho nguyên vật tư',
  production: 'Lệnh sản xuất',
  delivery: 'Kế hoạch giao hàng',
  accounting: 'Kế toán',
  users: 'Quản lý tài khoản',
  recycle_bin: 'Thùng rác'
};

export const NOTIFICATION_MODULE_LABELS: Record<NotificationModule, string> = {
  dashboard: 'Tổng quan',
  customer_data: 'Dữ liệu thô',
  crm: 'Khách hàng',
  leads: 'Khách hàng tiềm năng',
  sales: 'Đơn hàng',
  design: 'Thiết kế',
  purchase: 'Mua hàng',
  inventory: 'Kho nguyên vật tư',
  production: 'Sản xuất',
  delivery: 'Giao hàng',
  accounting: 'Kế toán',
  system: 'Hệ thống'
};

export const formatNotificationTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Vừa xong';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'Vừa xong';
  if (elapsedMinutes < 60) return `${elapsedMinutes} phút trước`;
  if (elapsedMinutes < 1_440) return `${Math.floor(elapsedMinutes / 60)} giờ trước`;
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getInitials = (value: string): string =>
  value
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase() || 'SF';
