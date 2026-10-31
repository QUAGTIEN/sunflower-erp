import {
  Archive,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardList,
  Cog,
  DollarSign,
  Factory,
  FileText,
  FolderOpen,
  Handshake,
  LayoutDashboard,
  ListTodo,
  MapPinned,
  MessageSquare,
  Palette,
  Scissors,
  Settings2,
  ShoppingBag,
  Target,
  Trash2,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon
} from 'lucide-react';

export interface SidebarMenuItem {
  kind: 'item';
  id: string;
  /** The page the item opens; several items may open the same page on different tabs. */
  page: string;
  /** The page permission that shows the item, when it differs from `page`. */
  accessPage?: string;
  label: string;
  title: string;
  icon: LucideIcon;
  /** Tab of `page` this item stands for. */
  tab?: string;
  /** Tab to open when the page currently shows a tab that another item stands for. */
  resetTab?: string;
  translateLabel?: boolean;
  danger?: boolean;
}

export interface SidebarMenuGroup {
  kind: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  items: SidebarMenuItem[];
}

export type SidebarMenuEntry = SidebarMenuItem | SidebarMenuGroup;

const item = (fields: Omit<SidebarMenuItem, 'kind'>): SidebarMenuItem => ({ kind: 'item', ...fields });

/** Sidebar order follows the business flow; pages and permissions are unchanged, only grouped. */
export const SIDEBAR_MENU: SidebarMenuEntry[] = [
  item({
    id: 'dashboard',
    page: 'dashboard',
    label: 'Tổng quan',
    title: 'Tổng Quan Dashboards',
    icon: LayoutDashboard
  }),
  {
    kind: 'group',
    id: 'work',
    label: 'Làm việc',
    icon: Briefcase,
    items: [
      item({ id: 'chat', page: 'chat', label: 'Kênh chat', title: 'Kênh Thảo Luận', icon: MessageSquare }),
      item({ id: 'work_schedule', page: 'work_schedule', label: 'Công việc', title: 'Công việc', icon: ListTodo }),
      item({ id: 'attendance', page: 'attendance', label: 'Chấm công', title: 'Chấm công', icon: CalendarCheck })
    ]
  },
  {
    kind: 'group',
    id: 'business',
    label: 'Kinh doanh',
    icon: Handshake,
    items: [
      item({ id: 'customer_data', page: 'customer_data', label: 'Dữ liệu thô', title: 'Dữ liệu thô', icon: Archive }),
      item({ id: 'leads', page: 'leads', label: 'Tiềm năng', title: 'Khách Hàng Tiềm Năng (Lead)', icon: Target }),
      item({ id: 'crm', page: 'crm', label: 'Khách hàng', title: 'Khách Hàng Hợp Tác', icon: Users }),
      item({
        id: 'sales',
        page: 'sales',
        label: 'Đơn hàng',
        title: 'Đơn hàng',
        icon: FileText,
        translateLabel: true
      }),
      item({
        id: 'sales_management',
        page: 'sales_management',
        label: 'Quản lý Sale',
        title: 'Quản lý Sale',
        icon: UserCog
      }),
      item({ id: 'commercial_map', page: 'commercial_map', label: 'Thương mại', title: 'Thương mại', icon: MapPinned })
    ]
  },
  {
    kind: 'group',
    id: 'design',
    label: 'Thiết kế',
    icon: Palette,
    items: [
      item({ id: 'design', page: 'design', label: 'Yêu cầu thiết kế', title: 'Yêu Cầu Thiết Kế', icon: Palette }),
      item({
        id: 'design_library',
        page: 'design_library',
        accessPage: 'design',
        label: 'Kho mẫu',
        title: 'Kho Thiết Kế & Layout',
        icon: FolderOpen
      })
    ]
  },
  {
    kind: 'group',
    id: 'production',
    label: 'Sản xuất',
    icon: Factory,
    items: [
      item({
        id: 'production_orders',
        page: 'production',
        tab: 'commands',
        label: 'Lệnh sản xuất',
        title: 'Lệnh Sản Xuất (LSX)',
        icon: ClipboardList
      }),
      item({
        id: 'production_machines',
        page: 'production',
        tab: 'machines',
        label: 'Danh sách máy',
        title: 'Danh sách máy',
        icon: Cog
      }),
      item({
        id: 'production_dies',
        page: 'inventory',
        tab: 'dies',
        label: 'Danh sách dao',
        title: 'Danh mục dao',
        icon: Scissors
      }),
      item({ id: 'delivery', page: 'delivery', label: 'Giao hàng', title: 'Kế Hoạch Giao Hàng', icon: Truck })
    ]
  },
  {
    kind: 'group',
    id: 'warehouse',
    label: 'Mua hàng',
    icon: Warehouse,
    items: [
      item({
        id: 'inventory',
        page: 'inventory',
        resetTab: 'catalog',
        label: 'Kho vật tư',
        title: 'Kho vật tư',
        icon: Archive
      }),
      item({ id: 'purchase', page: 'purchase', label: 'Mua hàng', title: 'Mua Hàng', icon: ShoppingBag }),
      item({
        id: 'suppliers',
        page: 'suppliers',
        label: 'Nhà cung cấp',
        title: 'Danh Sách Nhà Cung Cấp',
        icon: Building2
      })
    ]
  },
  item({ id: 'accounting', page: 'accounting', label: 'Kế toán', title: 'Kế Toán & Lãi Gộp', icon: DollarSign }),
  {
    kind: 'group',
    id: 'system',
    label: 'Hệ thống',
    icon: Settings2,
    items: [
      item({ id: 'users', page: 'users', label: 'Tài khoản', title: 'Quản Lý Tài Khoản', icon: UserCog }),
      item({
        id: 'recycle_bin',
        page: 'recycle_bin',
        label: 'Thùng rác',
        title: 'Thùng Rác',
        icon: Trash2,
        danger: true
      })
    ]
  }
];

const menuItems = (entries: SidebarMenuEntry[]) =>
  entries.flatMap(entry => (entry.kind === 'group' ? entry.items : [entry]));

/** The item to highlight: the one standing for the page's current tab, else the page's plain item. */
export function findActiveMenuItem(entries: SidebarMenuEntry[], page: string, pageTab?: string) {
  const candidates = menuItems(entries).filter(entry => entry.page === page);
  return (
    candidates.find(entry => entry.tab && entry.tab === pageTab) ??
    candidates.find(entry => !entry.tab) ??
    candidates[0]
  );
}

export function findMenuGroupOf(entries: SidebarMenuEntry[], itemId: string) {
  return entries.find(
    (entry): entry is SidebarMenuGroup =>
      entry.kind === 'group' && entry.items.some(groupItem => groupItem.id === itemId)
  );
}

/** Tab to request when an item is clicked; a plain item leaves the page on its tab unless a sibling owns it. */
export function menuItemTab(entries: SidebarMenuEntry[], target: SidebarMenuItem, pageTab?: string) {
  if (target.tab) return target.tab;
  const tabOwnedElsewhere = menuItems(entries).some(
    entry => entry.page === target.page && entry.tab !== undefined && entry.tab === pageTab
  );
  return tabOwnedElsewhere ? target.resetTab : undefined;
}
