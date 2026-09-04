import type { UserProfile, UserRole } from '@/shared/types';

export const getDefaultPagesForRole = (role: UserRole): string[] => {
  switch (role) {
    case 'admin':
      return ['dashboard', 'chat', 'work_schedule', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales', 'design', 'purchase', 'suppliers', 'inventory', 'production', 'delivery', 'accounting', 'users', 'recycle_bin'];
    case 'sale':
      return ['dashboard', 'chat', 'work_schedule', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'];
    case 'designer':
      return ['dashboard', 'chat', 'work_schedule', 'design'];
    case 'purchaser':
      return ['dashboard', 'chat', 'work_schedule', 'purchase', 'suppliers', 'inventory'];
    case 'producer':
      return ['dashboard', 'chat', 'work_schedule', 'production'];
    case 'accountant':
      return ['dashboard', 'chat', 'work_schedule', 'accounting'];
  }
};

export const canAccessPage = (
  user: UserProfile | null,
  pageId: string
): boolean => {
  if (!user) return false;
  if (pageId === 'system_configuration') return user.role === 'admin';

  const allowed = user.allowedPages || getDefaultPagesForRole(user.role);
  if (pageId === 'work_schedule') return user.active !== false;
  if (pageId === 'leads') return allowed.includes('leads') || allowed.includes('crm');
  if (pageId === 'customer_data') {
    return allowed.includes('customer_data') || allowed.includes('leads') || allowed.includes('crm');
  }
  if (pageId === 'commercial_map') {
    return user.role === 'admin'
      || allowed.includes('commercial_map')
      || allowed.includes('leads')
      || allowed.includes('crm');
  }
  if (pageId === 'suppliers') {
    return allowed.includes('suppliers') || allowed.includes('purchase');
  }
  return allowed.includes(pageId);
};
