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

export const NOTIFICATION_MODULE_LABELS: Record<NotificationModule, string> = {
  dashboard: 'Tổng quan',
  customer_data: 'Dữ liệu thô',
  crm: 'Khách hàng',
  leads: 'Khách hàng tiềm năng',
  sales: 'Đơn hàng',
  design: 'Thiết kế',
  purchase: 'Mua hàng',
  inventory: 'Kho vật tư',
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
