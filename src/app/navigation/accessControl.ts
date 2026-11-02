import { ROLE_PAGES, isUserRole } from '@/shared/types';
import type { UserProfile, UserRole } from '@/shared/types';

export const getDefaultPagesForRole = (role: UserRole): string[] => (isUserRole(role) ? [...ROLE_PAGES[role]] : []);

// The CRM screens share one customer workflow and suppliers belong to purchasing, so a sibling tick opens them.
const PAGE_ALIASES: Record<string, string[]> = {
  leads: ['crm'],
  customer_data: ['leads', 'crm'],
  commercial_map: ['leads', 'crm'],
  suppliers: ['purchase']
};

/** D-PQ1: a page opens only when it belongs to the account's role and the admin ticked it (admins see everything). */
export const canAccessPage = (user: UserProfile | null, pageId: string): boolean => {
  if (!user || !isUserRole(user.role) || user.active === false) return false;
  if (pageId === 'attendance' && user.active !== true) return false;
  if (user.role === 'admin') return true;
  if (!ROLE_PAGES[user.role].includes(pageId)) return false;
  if (pageId === 'work_schedule' || pageId === 'attendance') return true;
  const allowed = user.allowedPages || ROLE_PAGES[user.role];
  return [pageId, ...(PAGE_ALIASES[pageId] || [])].some(page => allowed.includes(page));
};
