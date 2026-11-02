import { ROLE_PAGES, USER_ROLE_LABELS, isUserRole, type UserProfile, type UserRole } from '@/shared/types';

type DirectoryFields = Pick<UserProfile, 'uid' | 'displayName' | 'role' | 'active'>;

export interface AccountPageOption {
  id: string;
  label: string;
}

export interface AccountPageGroup {
  label: string;
  pages: AccountPageOption[];
}

/** Same groups, order and names as the sidebar, so admins tick what staff actually see in the menu. */
export const ACCOUNT_PAGE_GROUPS: AccountPageGroup[] = [
  {
    label: 'Làm việc',
    pages: [
      { id: 'dashboard', label: 'Tổng quan' },
      { id: 'chat', label: 'Kênh chat' },
      { id: 'work_schedule', label: 'Công việc' },
      { id: 'attendance', label: 'Chấm công' }
    ]
  },
  {
    label: 'Kinh doanh',
    pages: [
      { id: 'customer_data', label: 'Dữ liệu thô' },
      { id: 'leads', label: 'Tiềm năng' },
      { id: 'crm', label: 'Khách hàng' },
      { id: 'sales', label: 'Đơn hàng' },
      { id: 'sales_management', label: 'Quản lý Sale' },
      { id: 'commercial_map', label: 'Thương mại' }
    ]
  },
  { label: 'Thiết kế', pages: [{ id: 'design', label: 'Yêu cầu thiết kế, Kho mẫu' }] },
  {
    label: 'Sản xuất',
    pages: [
      { id: 'production', label: 'Lệnh sản xuất, Danh sách máy' },
      { id: 'delivery', label: 'Giao hàng' }
    ]
  },
  {
    label: 'Mua hàng',
    pages: [
      { id: 'inventory', label: 'Kho vật tư, Danh sách dao' },
      { id: 'purchase', label: 'Mua hàng' },
      { id: 'suppliers', label: 'Nhà cung cấp' }
    ]
  },
  { label: 'Kế toán', pages: [{ id: 'accounting', label: 'Kế toán' }] },
  {
    label: 'Hệ thống',
    pages: [
      { id: 'users', label: 'Tài khoản' },
      { id: 'recycle_bin', label: 'Thùng rác' }
    ]
  }
];

/** D-PQ1: only the pages of the chosen role can be ticked. */
export const pageGroupsForRole = (role: UserRole): AccountPageGroup[] =>
  ACCOUNT_PAGE_GROUPS.map(group => ({
    ...group,
    pages: group.pages.filter(page => ROLE_PAGES[role].includes(page.id))
  })).filter(group => group.pages.length > 0);

export const accountRoleLabel = (role: string) => (isUserRole(role) ? USER_ROLE_LABELS[role] : 'Vai trò cũ – cần xóa');

export const formatAccountDate = (value: string | undefined) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export type AccountStatus = 'active' | 'locked';
export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = { active: 'Đang hoạt động', locked: 'Đã khóa' };
export const accountStatus = (account: Pick<UserProfile, 'active'>): AccountStatus =>
  account.active ? 'active' : 'locked';

export interface AccountFilters {
  keyword: string;
  roles: string[];
  statuses: AccountStatus[];
}

export const filterAccounts = (accounts: UserProfile[], filters: AccountFilters) => {
  const keyword = filters.keyword.trim().toLocaleLowerCase('vi-VN');
  return accounts.filter(
    account =>
      (!filters.roles.length || filters.roles.includes(account.role)) &&
      (!filters.statuses.length || filters.statuses.includes(accountStatus(account))) &&
      `${account.displayName} ${account.email}`.toLocaleLowerCase('vi-VN').includes(keyword)
  );
};

/** True when the public directory lists exactly the profiles, with the same name, role and status. */
export const isDirectoryInStep = (profiles: DirectoryFields[], directory: DirectoryFields[]) => {
  const entries = new Map(directory.map(entry => [entry.uid, entry]));
  return (
    entries.size === profiles.length &&
    profiles.every(profile => {
      const entry = entries.get(profile.uid);
      return (
        entry?.displayName === profile.displayName && entry.role === profile.role && entry.active === profile.active
      );
    })
  );
};
