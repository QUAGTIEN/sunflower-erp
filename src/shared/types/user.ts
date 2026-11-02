/**
 * D-PQ1 (02/11/2026): five roles, one per department. `producer` keeps its stored key and is shown as Kỹ thuật;
 * the former purchaser role is gone and purchasing belongs to Kế toán.
 */
export const USER_ROLES = ['admin', 'sale', 'designer', 'producer', 'accountant'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  allowedPages?: string[];
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  sale: 'Sale',
  designer: 'Thiết kế',
  producer: 'Kỹ thuật',
  accountant: 'Kế toán'
};

/** Accounts still carrying a removed role (purchaser) reach nothing until an admin deletes them. */
export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);

export const ERP_PAGE_IDS = [
  'dashboard',
  'chat',
  'work_schedule',
  'attendance',
  'crm',
  'leads',
  'customer_data',
  'commercial_map',
  'sales',
  'sales_management',
  'design',
  'purchase',
  'suppliers',
  'inventory',
  'production',
  'delivery',
  'accounting',
  'users',
  'recycle_bin'
] as const;

const COMMON_PAGES = ['dashboard', 'chat', 'work_schedule', 'attendance'];

/**
 * D-PQ1: every role reaches only the pages of its own department. An admin ticks a subset of these per account;
 * a page outside the role's list can never be granted.
 */
export const ROLE_PAGES: Record<UserRole, readonly string[]> = {
  admin: ERP_PAGE_IDS,
  sale: [...COMMON_PAGES, 'customer_data', 'leads', 'crm', 'sales', 'commercial_map'],
  designer: [...COMMON_PAGES, 'design'],
  producer: [...COMMON_PAGES, 'production', 'inventory', 'delivery'],
  accountant: [...COMMON_PAGES, 'production', 'inventory', 'purchase', 'suppliers', 'delivery', 'accounting']
};
