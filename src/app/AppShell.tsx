import React, { lazy, Suspense, useCallback, useState, useEffect, useLayoutEffect, useRef, useTransition } from 'react';
import { IconButton } from '@/components/IconButton';
import { KeepAlivePage } from './KeepAlivePage';
import { rememberPage, SUBSCRIPTION_LINGER_MS } from './navigation/pageKeepAlive';
import { PageLoadingFallback, PageProgressBar } from '@/components/LoadingStates';
import {
  authService,
  dbService,
  isFirebaseRuntimeEnabled,
  UserProfile
} from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { Dashboard } from '@/features/dashboard';
import { PageContextProvider } from '@/context/PageContext';
import { TableColumnLayoutContext, useTableColumnLayoutManager } from '@/context/TableColumnLayoutContext';
import type { AppPageContext } from '@/context/PageContextState';
import { APP_LOGO_PATH, formatNotificationTime, getInitials, NOTIFICATION_MODULE_LABELS } from '@/app/config/appConfig';
import { canAccessPage, getDefaultPagesForRole } from '@/app/navigation/accessControl';
import { USER_DIRECTORY_COLLECTION, USER_ROLES, USER_ROLE_LABELS, type UserDirectoryEntry } from '@/shared/types';
import {
  SIDEBAR_MENU,
  findActiveMenuItem,
  findMenuGroupOf,
  menuItemTab,
  type SidebarMenuItem
} from '@/app/navigation/sidebarMenu';
import type { PageTabRequest } from '@/shared/types/pageTabRequest';
import { canReadWarehouse } from '@/features/inventory/model/warehouse';
import { confirmAppNavigation } from '@/shared/feedback/navigationGuard';
import '@/styles/ErpUiStandards.css';
import '@/styles/Theme.css';
import '@/styles/ContentTabs.css';
import { DesignRequest } from '@/features/design/model/designWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { useGlobalTableColumnResize } from '@/hooks/useGlobalTableColumnResize';
import { useAdaptiveTableText } from '@/hooks/useAdaptiveTableText';
import { normalizePORecords } from '@/domain/poCompatibility';
import { normalizeLeadRecords, type CustomerRecord, type LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import type { ProcurementRequestRecord } from '@/features/procurement/model/purchaseModels';
import type { UserNotificationRecord } from '@/domain/notificationModels';
import { markAllNotificationsRead, markNotificationRead } from '@/services/notificationService';
import { synchronizeProvinceData } from '@/features/crm/api/provinceDataSynchronization';
import { Bell, CheckCheck, KeyRound, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

const loadSalesManagementModule = () => import('@/features/sales-management');
const loadCrmModule = () => import('@/features/crm');
const loadSalesModule = () => import('@/features/sales');
const loadDesignModule = () => import('@/features/design');
const loadProcurementModule = () => import('@/features/procurement');
const loadInventoryModule = () => import('@/features/inventory');
const loadProductionModule = () => import('@/features/production');
const loadDeliveryModule = () => import('@/features/delivery');
const loadAccountingModule = () => import('@/features/accounting');
const loadAdministrationModule = () => import('@/features/administration');
const loadChatModule = () => import('@/features/chat');
const loadCommercialMapModule = () => import('@/features/commercial-map');
const loadWorkScheduleModule = () => import('@/features/work-schedule');
const loadAttendanceModule = () => import('@/features/attendance');

const SalesManagementPage = lazy(() =>
  loadSalesManagementModule().then(module => ({ default: module.SalesManagementPage }))
);
const Crm = lazy(() => loadCrmModule().then(module => ({ default: module.Crm })));
const CustomerData = lazy(() => loadCrmModule().then(module => ({ default: module.CustomerData })));
const Leads = lazy(() => loadCrmModule().then(module => ({ default: module.Leads })));
const Sales = lazy(() => loadSalesModule().then(module => ({ default: module.Sales })));
const Design = lazy(() => loadDesignModule().then(module => ({ default: module.Design })));
const DesignLibrary = lazy(() => loadDesignModule().then(module => ({ default: module.DesignLibrary })));
const Purchase = lazy(() => loadProcurementModule().then(module => ({ default: module.Purchase })));
const Suppliers = lazy(() => loadProcurementModule().then(module => ({ default: module.Suppliers })));
const Inventory = lazy(() => loadInventoryModule().then(module => ({ default: module.Inventory })));
const Production = lazy(() => loadProductionModule().then(module => ({ default: module.Production })));
const Delivery = lazy(() => loadDeliveryModule().then(module => ({ default: module.Delivery })));
const Accounting = lazy(() => loadAccountingModule().then(module => ({ default: module.Accounting })));
const RecycleBin = lazy(() => loadAdministrationModule().then(module => ({ default: module.RecycleBin })));
const UserManagement = lazy(() => loadAdministrationModule().then(module => ({ default: module.UserManagement })));
const ChangePasswordDialog = lazy(() =>
  loadAdministrationModule().then(module => ({ default: module.ChangePasswordDialog }))
);
const ChatPage = lazy(() => loadChatModule().then(module => ({ default: module.ChatPage })));
const CommercialMap = lazy(() => loadCommercialMapModule().then(module => ({ default: module.CommercialMap })));
const WorkSchedule = lazy(() => loadWorkScheduleModule().then(module => ({ default: module.WorkSchedule })));

const AttendancePage = lazy(() => loadAttendanceModule().then(module => ({ default: module.AttendancePage })));

const PAGE_MODULE_PRELOADERS: Record<string, () => Promise<unknown>> = {
  chat: loadChatModule,
  work_schedule: loadWorkScheduleModule,
  attendance: loadAttendanceModule,
  commercial_map: loadCommercialMapModule,
  customer_data: loadCrmModule,
  leads: loadCrmModule,
  crm: loadCrmModule,
  sales: loadSalesModule,
  sales_management: loadSalesManagementModule,
  design: loadDesignModule,
  design_library: loadDesignModule,
  purchase: loadProcurementModule,
  suppliers: loadProcurementModule,
  inventory: loadInventoryModule,
  production: loadProductionModule,
  delivery: loadDeliveryModule,
  accounting: loadAccountingModule,
  recycle_bin: loadAdministrationModule,
  users: loadAdministrationModule
};

const DEFAULT_PAGE_CONTEXTS: Record<string, AppPageContext> = {
  dashboard: { section: 'Tổng quan' },
  chat: { section: 'Kênh chat' },
  work_schedule: { section: 'Công việc', current: 'Danh sách' },
  attendance: { section: 'Chấm công', current: 'Chấm công' },
  commercial_map: { section: 'Thương mại', current: 'Tỉnh thành' },
  customer_data: { section: 'Dữ liệu thô', current: 'Tất cả dữ liệu' },
  leads: { section: 'Tiềm năng', current: 'Tổng quan' },
  crm: { section: 'Khách hàng', current: 'Tất cả' },
  sales: { section: 'Đơn hàng', current: 'Danh sách đơn hàng' },
  sales_management: { section: 'Quản lý Sale', current: 'Tổng quan' },
  design: { section: 'Thiết kế', current: 'Danh sách yêu cầu thiết kế' },
  design_library: { section: 'Kho mẫu', current: 'Danh sách mẫu thiết kế' },
  purchase: { section: 'Mua hàng', current: 'Yêu cầu từ đơn hàng' },
  suppliers: { section: 'Nhà cung cấp', current: 'Danh sách nhà cung cấp' },
  inventory: { section: 'Kho vật tư', current: 'Tồn kho' },
  production: { section: 'Sản xuất', current: 'Danh sách LSX' },
  delivery: { section: 'Giao hàng', current: 'Bảng điều phối' },
  accounting: { section: 'Kế toán', current: 'Công nợ phải thu & phải trả' },
  recycle_bin: { section: 'Thùng rác' },
  users: { section: 'Tài khoản', current: 'Danh sách người dùng' }
};

/** Business collections and the pages that read them; a collection stays live while one of its pages is open. */
const COLLECTION_PAGES: Record<string, string[]> = {
  customers: ['dashboard', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'],
  leads: ['dashboard', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'],
  lead_candidates: ['dashboard'],
  pos: [
    'dashboard',
    'crm',
    'commercial_map',
    'sales',
    'design',
    'design_library',
    'purchase',
    'production',
    'delivery',
    'accounting',
    'chat'
  ],
  purchase_orders: ['dashboard', 'purchase', 'suppliers'],
  procurement_requests: ['dashboard', 'purchase'],
  production_commands: ['dashboard', 'production', 'chat'],
  deliveries: ['commercial_map'],
  invoices: ['dashboard', 'crm'],
  inventory: ['dashboard'],
  design_requests: ['dashboard', 'design']
};

const isPageWaitingForData = (pageId: string, pendingCollections: ReadonlySet<string>) =>
  [...pendingCollections].some(collectionName => COLLECTION_PAGES[collectionName]?.includes(pageId));

function AppShell() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activePage, setActivePageState] = useState<string>('dashboard');
  // The sidebar highlight follows the click at once; the page itself renders in a transition.
  const [highlightedPage, setHighlightedPage] = useState<string>('dashboard');
  const [mountedPages, setMountedPages] = useState<string[]>(['dashboard']);
  const [isPageTransitionPending, startPageTransition] = useTransition();
  const showPage = useCallback((page: string) => {
    setHighlightedPage(page);
    startPageTransition(() => {
      setActivePageState(page);
      setMountedPages(previous => rememberPage(previous, page));
    });
  }, []);
  const setActivePage = useCallback(
    (page: string) => {
      if (confirmAppNavigation()) showPage(page);
    },
    [showPage]
  );
  // Tabs that sidebar sub-items stand for: what each kept-alive page shows, and the last tab the sidebar asked for.
  const [pageTabs, setPageTabs] = useState<Record<string, string>>({});
  const [pageTabRequest, setPageTabRequest] = useState<(PageTabRequest & { page: string }) | null>(null);
  // Groups start folded and open one at a time, so the menu stays short.
  const rememberPageTab = useCallback((page: string, tab: string) => {
    setPageTabs(previous => (previous[page] === tab ? previous : { ...previous, [page]: tab }));
  }, []);
  const [reportedPageContext, setReportedPageContext] = useState<(AppPageContext & { pageId: string }) | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('erp_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
    localStorage.setItem('erp_color_theme', 'light');
  }, []);

  const handlePageContextChange = useCallback(
    (context: AppPageContext) => {
      setReportedPageContext(previous => {
        if (
          previous?.pageId === activePage &&
          previous.section === context.section &&
          previous.current === context.current
        ) {
          return previous;
        }
        return { ...context, pageId: activePage };
      });
    },
    [activePage]
  );

  const pageContext =
    reportedPageContext?.pageId === activePage
      ? reportedPageContext
      : (DEFAULT_PAGE_CONTEXTS[activePage] ?? { section: activePage });

  const isPageAllowed = (pageId: string): boolean => canAccessPage(user, pageId);
  const isMenuItemAllowed = (menuItem: SidebarMenuItem) => isPageAllowed(menuItem.accessPage || menuItem.page);
  const tableColumnLayouts = useTableColumnLayoutManager(user);
  useGlobalTableColumnResize(activePage, user?.uid || '', tableColumnLayouts);
  useAdaptiveTableText(activePage, user?.uid || '');

  // Dynamic channels state
  const [channels, setChannels] = useState<any[]>([]);

  // Real-time synchronization states
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accountProfiles, setAccountProfiles] = useState<UserProfile[]>([]);
  const [changingPassword, setChangingPassword] = useState(false);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [leadCandidates, setLeadCandidates] = useState<LeadCandidateRecord[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [procurementRequests, setProcurementRequests] = useState<ProcurementRequestRecord[]>([]);
  const [productionCommands, setProductionCommands] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>([]);
  const [notifications, setNotifications] = useState<UserNotificationRecord[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const notificationCenterRef = useRef<HTMLDivElement>(null);
  const provinceSynchronizationStartedRef = useRef(false);
  const businessSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const businessSubscriptionUserIdRef = useRef('');
  const businessSubscriptionTimersRef = useRef<Map<string, number>>(new Map());
  const [pendingCollections, setPendingCollections] = useState<ReadonlySet<string>>(() => new Set());
  const activePageRef = useRef(activePage);
  const pageScrollPositionsRef = useRef<Map<string, number>>(new Map());

  // Each kept-alive page restores its own scroll position inside the shared .app-main container.
  useLayoutEffect(() => {
    activePageRef.current = activePage;
    const root = document.querySelector<HTMLElement>('.app-main');
    if (root) root.scrollTop = pageScrollPositionsRef.current.get(activePage) ?? 0;
  }, [activePage]);

  const preloadPageModule = useCallback((pageId: string) => {
    const preload = PAGE_MODULE_PRELOADERS[pageId];
    if (preload) void preload().catch(() => undefined);
  }, []);

  const handleSidebarPreload = useCallback(
    (event: React.SyntheticEvent<HTMLElement>) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;
      const pageId = eventTarget.closest<HTMLButtonElement>('button[data-page-id]')?.dataset.pageId;
      if (pageId) preloadPageModule(pageId);
    },
    [preloadPageModule]
  );

  useEffect(() => {
    if (!user) return;
    const allowedPages = user.allowedPages || getDefaultPagesForRole(user.role);
    const preferredOrder = [
      'customer_data',
      'leads',
      'crm',
      'sales',
      'work_schedule',
      'chat',
      'commercial_map',
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
    ];
    const preloaders = Array.from(
      new Set(
        preferredOrder
          .filter(pageId => allowedPages.includes(pageId))
          .map(pageId => PAGE_MODULE_PRELOADERS[pageId])
          .filter((preload): preload is () => Promise<unknown> => Boolean(preload))
      )
    );
    let cancelled = false;
    let preloadIndex = 0;
    let preloadTimer = 0;
    const preloadNext = () => {
      if (cancelled || preloadIndex >= preloaders.length) return;
      const preload = preloaders[preloadIndex++];
      void preload()
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) preloadTimer = window.setTimeout(preloadNext, 250);
        });
    };
    preloadTimer = window.setTimeout(preloadNext, 1_200);
    return () => {
      cancelled = true;
      window.clearTimeout(preloadTimer);
    };
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'admin' || provinceSynchronizationStartedRef.current) return;
    const synchronizationKey = `erp:province-catalog-synchronized:v1:${user.uid}`;
    if (localStorage.getItem(synchronizationKey) === 'complete') return;
    provinceSynchronizationStartedRef.current = true;
    void synchronizeProvinceData()
      .then(result => {
        localStorage.setItem(synchronizationKey, 'complete');
        if (result.updated > 0 || result.unresolved > 0) {
          console.info('[Province synchronization] Completed.', result);
        }
      })
      .catch(error => {
        provinceSynchronizationStartedRef.current = false;
        console.warn('[Province synchronization] Could not complete.', error);
      });
  }, [user]);

  // Navigation state links
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [selectedLsxId, setSelectedLsxId] = useState<string>('');
  const [repeatSourcePoId, setRepeatSourcePoId] = useState<string>('');
  const [preparedCustomerId, setPreparedCustomerId] = useState<string>('');
  const [leadOnboarding, setLeadOnboarding] = useState<LeadRecord | null>(null);
  const [candidateLeadConversion, setCandidateLeadConversion] = useState<LeadCandidateRecord | null>(null);
  const [supportNavigationTarget, setSupportNavigationTarget] = useState<{
    module: 'customer_data' | 'leads' | 'crm';
    entityId: string;
  } | null>(null);
  const [customerInsightNavigation, setCustomerInsightNavigation] = useState<{
    module: 'customer_data' | 'leads' | 'crm' | 'sales';
    itemId: string;
  } | null>(null);
  const [workScheduleGroupNavigation, setWorkScheduleGroupNavigation] = useState('');

  const handleRepeatOrderRequest = (poId: string) => {
    setSelectedPoId('');
    setRepeatSourcePoId(poId);
    setActivePage('sales');
  };

  const handlePreparedOrderCreated = (customerId: string) => {
    setSelectedPoId('');
    setRepeatSourcePoId('');
    setPreparedCustomerId(customerId);
    setActivePage('sales');
  };

  const handleOpenPORequest = (poId: string) => {
    setRepeatSourcePoId('');
    setPreparedCustomerId('');
    setSelectedPoId(poId);
    setActivePage('sales');
  };

  const handlePreparedOrderOpened = useCallback(() => {
    setPreparedCustomerId('');
  }, []);

  const handleLeadConversionRequest = (lead: LeadRecord) => {
    setLeadOnboarding(lead);
    setActivePage('crm');
  };

  const handleCandidateLeadConversionConsumed = useCallback(() => {
    setCandidateLeadConversion(null);
  }, []);

  // Login form states
  const [username, setUsername] = useState(() => {
    return localStorage.getItem('erp_remembered_username') || '';
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('erp_remember_me') === 'true';
  });
  const [errorMsg, setErrorMsg] = useState('');

  // Handle Authentication State Change
  useEffect(() => {
    const unsubAuth = authService.onAuthStateChanged(currUser => {
      setUser(currUser);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const pagePresenceTimer = window.setTimeout(() => {
      auditService.updatePresenceSafely(user, 'online', activePage);
    }, 750);
    return () => window.clearTimeout(pagePresenceTimer);
  }, [activePage, user]);

  useEffect(() => {
    if (!user) return;
    auditService.updatePresenceSafely(user, 'online', activePageRef.current);
    const heartbeat = window.setInterval(() => {
      auditService.updatePresenceSafely(user, 'online', activePageRef.current);
    }, 90_000);
    const markOffline = () => auditService.updatePresenceSafely(user, 'offline', activePageRef.current);
    window.addEventListener('beforeunload', markOffline);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('beforeunload', markOffline);
      auditService.updatePresenceSafely(user, 'offline', activePageRef.current);
    };
  }, [user]);

  // Keep only session-wide data live for the whole authenticated session.
  useEffect(() => {
    if (!user) return;

    // Colleagues come from the public directory; only admins load the private profiles (login email, page grants).
    const unsubUsers = dbService.subscribeCollection(
      isFirebaseRuntimeEnabled ? USER_DIRECTORY_COLLECTION : 'users',
      data => setUsers((data as UserDirectoryEntry[]).map(entry => ({ ...entry, email: '', createdAt: '' })))
    );
    const unsubProfiles =
      user.role === 'admin'
        ? dbService.subscribeCollection('users', data => setAccountProfiles(data as UserProfile[]))
        : () => undefined;
    const unsubMessages = dbService.subscribeCollection(
      'messages',
      data => {
        setMessages(
          [...data].sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
        );
      },
      {
        orderByField: 'createdAt',
        orderDirection: 'desc',
        maxResults: 250
      }
    );
    const unsubChannels = dbService.subscribeCollection('channels', setChannels);
    let unsubNotifications: () => void = () => undefined;
    if (user.role === 'admin') {
      unsubNotifications = dbService.subscribeCollection(
        'notifications',
        data => {
          setNotifications(
            sortNewestFirst(
              (data as UserNotificationRecord[]).filter(notification => notification.recipientId === user.uid),
              notification => [notification.createdAt]
            )
          );
        },
        {
          fieldName: 'eventType',
          fieldValue: 'support_request',
          maxResults: 100,
          onError: () => setNotifications([])
        }
      );
    } else {
      window.setTimeout(() => setNotifications([]), 0);
    }

    return () => {
      unsubUsers();
      unsubProfiles();
      unsubMessages();
      unsubChannels();
      unsubNotifications();
    };
  }, [user]);

  // Business collections are live only while the current page needs them.
  useEffect(() => {
    const stopAllBusinessSubscriptions = () => {
      businessSubscriptionTimersRef.current.forEach(timer => window.clearTimeout(timer));
      businessSubscriptionTimersRef.current.clear();
      businessSubscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      businessSubscriptionsRef.current.clear();
      setPendingCollections(previous => (previous.size ? new Set() : previous));
    };
    if (!user) {
      stopAllBusinessSubscriptions();
      businessSubscriptionUserIdRef.current = '';
      return;
    }
    if (businessSubscriptionUserIdRef.current !== user.uid) {
      stopAllBusinessSubscriptions();
      businessSubscriptionUserIdRef.current = user.uid;
    }

    const pageNeeds = (...pages: string[]) => pages.some(page => mountedPages.includes(page));
    let trackedCollectionName = '';
    const markCollectionReady = (collectionName: string) =>
      setPendingCollections(previous => {
        if (!previous.has(collectionName)) return previous;
        const next = new Set(previous);
        next.delete(collectionName);
        return next;
      });
    // Marks a collection ready on its first snapshot (or error) so pages can show a skeleton until then.
    const subscribeTracked = (...[name, callback, options]: Parameters<typeof dbService.subscribeCollection>) => {
      const collectionName = trackedCollectionName;
      return dbService.subscribeCollection(
        name,
        data => {
          markCollectionReady(collectionName);
          callback(data);
        },
        options?.onError
          ? {
              ...options,
              onError: error => {
                markCollectionReady(collectionName);
                options.onError?.(error);
              }
            }
          : options
      );
    };
    const syncSubscription = (collectionName: string, needed: boolean, subscribe: () => () => void) => {
      const subscriptions = businessSubscriptionsRef.current;
      const timers = businessSubscriptionTimersRef.current;
      const pendingStop = timers.get(collectionName);
      if (needed) {
        if (pendingStop !== undefined) {
          window.clearTimeout(pendingStop);
          timers.delete(collectionName);
        }
        if (!subscriptions.has(collectionName)) {
          trackedCollectionName = collectionName;
          setPendingCollections(previous => new Set(previous).add(collectionName));
          subscriptions.set(collectionName, subscribe());
        }
        return;
      }
      if (!subscriptions.has(collectionName) || pendingStop !== undefined) return;
      // Keep the live connection briefly so returning to a module does not reload its data.
      timers.set(
        collectionName,
        window.setTimeout(() => {
          timers.delete(collectionName);
          subscriptions.get(collectionName)?.();
          subscriptions.delete(collectionName);
        }, SUBSCRIPTION_LINGER_MS)
      );
    };

    syncSubscription('customers', pageNeeds(...COLLECTION_PAGES.customers), () =>
      subscribeTracked(
        'customers',
        data => {
          setCustomers(data as CustomerRecord[]);
        },
        user.role === 'sale'
          ? {
              fieldName: 'assignedSaleId',
              fieldValue: user.uid
            }
          : undefined
      )
    );
    syncSubscription('leads', pageNeeds(...COLLECTION_PAGES.leads), () =>
      subscribeTracked(
        'leads',
        data => {
          setLeads(sortNewestFirst(normalizeLeadRecords(data), lead => [lead.createdAt, lead.updatedAt]));
        },
        user.role === 'sale'
          ? {
              fieldName: 'assignedSaleId',
              fieldValue: user.uid
            }
          : undefined
      )
    );
    syncSubscription('lead_candidates', pageNeeds(...COLLECTION_PAGES.lead_candidates), () =>
      subscribeTracked(
        'lead_candidates',
        data => {
          setLeadCandidates(
            sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt])
          );
        },
        user.role === 'sale'
          ? {
              fieldName: 'assignedSaleId',
              fieldValue: user.uid
            }
          : undefined
      )
    );
    syncSubscription('pos', pageNeeds(...COLLECTION_PAGES.pos), () =>
      subscribeTracked('pos', data => {
        setPOs(sortNewestFirst(normalizePORecords(data), po => [po.createdAt, po.orderDate]));
      })
    );
    syncSubscription('purchase_orders', pageNeeds(...COLLECTION_PAGES.purchase_orders), () =>
      subscribeTracked('purchase_orders', data => {
        setPurchaseOrders(sortNewestFirst(data, purchaseOrder => [purchaseOrder.createdAt]));
      })
    );
    syncSubscription('procurement_requests', pageNeeds(...COLLECTION_PAGES.procurement_requests), () =>
      subscribeTracked('procurement_requests', data => {
        setProcurementRequests(
          sortNewestFirst(data as ProcurementRequestRecord[], request => [request.createdAt, request.updatedAt])
        );
      })
    );
    syncSubscription('production_commands', pageNeeds(...COLLECTION_PAGES.production_commands), () =>
      subscribeTracked('production_commands', data => {
        setProductionCommands(sortNewestFirst(data, command => [command.createdAt, command.startedAt]));
      })
    );
    syncSubscription('deliveries', pageNeeds(...COLLECTION_PAGES.deliveries), () =>
      subscribeTracked('deliveries', data => {
        setDeliveries(sortNewestFirst(data, delivery => [delivery.createdAt]));
      })
    );
    syncSubscription('invoices', pageNeeds(...COLLECTION_PAGES.invoices), () =>
      subscribeTracked('invoices', data => {
        setInvoices(sortNewestFirst(data, invoice => [invoice.createdAt]));
      })
    );
    syncSubscription(
      'inventory',
      pageNeeds(...COLLECTION_PAGES.inventory) && !!user && canReadWarehouse(user) && isFirebaseRuntimeEnabled,
      () =>
        subscribeTracked(
          'warehouse_balances',
          rows =>
            setInventory(
              rows
                .filter(row => row.warehouseId !== 'finished_main')
                .map(row => ({
                  ...row,
                  materialName: row.name,
                  qtyInStock: row.quantity,
                  minQtyAlert: row.minQuantity ?? null
                }))
            ),
          { onError: () => setInventory([]) }
        )
    );
    syncSubscription('design_requests', pageNeeds(...COLLECTION_PAGES.design_requests), () =>
      subscribeTracked('design_requests', data => {
        setDesignRequests(sortNewestFirst(data as DesignRequest[], request => [request.createdAt]));
      })
    );
  }, [mountedPages, user]);

  useEffect(
    () => () => {
      businessSubscriptionTimersRef.current.forEach(timer => window.clearTimeout(timer));
      businessSubscriptionTimersRef.current.clear();
      businessSubscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      businessSubscriptionsRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!isNotificationPanelOpen) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!notificationCenterRef.current?.contains(event.target as Node)) {
        setIsNotificationPanelOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsNotificationPanelOpen(false);
    };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isNotificationPanelOpen]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const signedInUser = await authService.login(username, password);
      auditService.recordSafely(signedInUser, {
        category: 'session',
        module: 'authentication',
        action: 'signed_in',
        summary: 'Đăng nhập vào Sunflower ERP'
      });
      auditService.updatePresenceSafely(signedInUser, 'online', 'dashboard');
      if (rememberMe) {
        localStorage.setItem('erp_remembered_username', username);
        localStorage.setItem('erp_remember_me', 'true');
      } else {
        localStorage.removeItem('erp_remembered_username');
        localStorage.removeItem('erp_remember_me');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đăng nhập không thành công.');
    }
  };

  const handleLogout = async () => {
    if (!confirmAppNavigation()) return;
    if (user) {
      auditService.recordSafely(user, {
        category: 'session',
        module: 'authentication',
        action: 'signed_out',
        summary: 'Đăng xuất khỏi Sunflower ERP'
      });
      auditService.updatePresenceSafely(user, 'offline', activePage);
    }
    await authService.logout();
    setActivePageState('dashboard');
    setHighlightedPage('dashboard');
    setMountedPages(['dashboard']);
    pageScrollPositionsRef.current.clear();
  };

  // Demo Switch Role Utility (Changes role on-the-fly for testing/reviewing)
  const handleSwitchRole = (newRole: any) => {
    if (!user) return;
    const updatedUser = {
      ...user,
      role: newRole,
      allowedPages: getDefaultPagesForRole(newRole),
      displayName: `Đóng vai: ${newRole.toUpperCase()} - ${user.displayName.replace(/Đóng vai: [A-Z]+ - /, '')}`
    };
    setUser(updatedUser);
    localStorage.setItem('erp_current_user', JSON.stringify(updatedUser));
  };

  const getUnreadChannelMessagesTotal = () => {
    if (!user) return 0;

    // Filter channels based on current user role or explicit membership
    const userChannels = channels.filter(ch => {
      const hasRoleAccess = ch.roles ? ch.roles.includes(user.role) : false;
      const hasMemberAccess = ch.members ? ch.members.includes(user.uid) : false;
      const isCreator = ch.createdBy === user.uid;
      const isAdmin = user.role === 'admin';
      return hasRoleAccess || hasMemberAccess || isCreator || isAdmin;
    });

    let total = 0;
    for (const ch of userChannels) {
      const lastReadStr = localStorage.getItem(`erp_last_read_ch_${user.uid}_${ch.id}`);
      if (!lastReadStr) {
        total += messages.filter(
          msg => msg.type === 'channel' && msg.targetId === ch.id && msg.senderId !== user.uid
        ).length;
      } else {
        const lastReadTime = new Date(lastReadStr).getTime();
        total += messages.filter(
          msg =>
            msg.type === 'channel' &&
            msg.targetId === ch.id &&
            msg.senderId !== user.uid &&
            new Date(msg.createdAt).getTime() > lastReadTime
        ).length;
      }
    }
    return total;
  };

  const allUserNotifications = user ? notifications.filter(notification => notification.recipientId === user.uid) : [];
  const userNotifications = allUserNotifications.slice(0, 20);
  const unreadNotificationTotal = allUserNotifications.filter(notification => notification.readAt === null).length;

  const openNotification = (notification: UserNotificationRecord) => {
    if (!user) return;
    setIsNotificationPanelOpen(false);
    void markNotificationRead(notification, user.uid).catch(error => {
      console.error('Unable to mark notification as read:', error);
    });
    const targetPage = notification.module === 'system' ? 'dashboard' : notification.module;
    if (
      notification.eventType === 'support_request' &&
      (notification.module === 'customer_data' || notification.module === 'leads' || notification.module === 'crm')
    ) {
      setSupportNavigationTarget({ module: notification.module, entityId: notification.entityId });
    }
    if (isPageAllowed(targetPage)) setActivePage(targetPage);
  };

  const readAllNotifications = () => {
    if (!user || unreadNotificationTotal === 0) return;
    void markAllNotificationsRead(allUserNotifications, user.uid).catch(error => {
      console.error('Unable to mark all notifications as read:', error);
    });
  };

  const refreshData = () => {
    // Triggers local list updates (Mock DB callbacks already trigger, this forces refresh where needed)
  };

  // First visit to a data page shows a skeleton until its collections deliver a snapshot (cache or server).
  const renderPageWhenReady = (pageId: string) =>
    isPageWaitingForData(pageId, pendingCollections) ? <PageLoadingFallback /> : renderPageContent(pageId);

  // View routing rendering selector
  const renderPageContent = (pageId: string) => {
    if (!user) return null;

    switch (pageId) {
      case 'crm':
        if (!isPageAllowed('crm')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Crm
            customers={customers}
            leads={leads}
            pos={pos}
            invoices={invoices}
            users={users}
            currentUser={user}
            onRefresh={refreshData}
            onRepeatOrder={handleRepeatOrderRequest}
            onOpenPO={handleOpenPORequest}
            onPreparedOrderCreated={handlePreparedOrderCreated}
            initialLead={leadOnboarding}
            onLeadOnboardingClosed={() => setLeadOnboarding(null)}
            initialCustomerId={supportNavigationTarget?.module === 'crm' ? supportNavigationTarget.entityId : ''}
            onInitialCustomerOpened={() => setSupportNavigationTarget(null)}
          />
        );
      case 'leads':
        if (!isPageAllowed('leads')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Leads
            customers={customers}
            leads={leads}
            users={users}
            currentUser={user}
            onNavigateToCrm={() => setActivePage('crm')}
            onNavigateToCustomerData={() => setActivePage('customer_data')}
            onConvertLead={handleLeadConversionRequest}
            initialCandidate={candidateLeadConversion}
            onInitialCandidateConsumed={handleCandidateLeadConversionConsumed}
            initialLeadId={supportNavigationTarget?.module === 'leads' ? supportNavigationTarget.entityId : ''}
            onInitialLeadOpened={() => setSupportNavigationTarget(null)}
            initialInsightFilterId={
              customerInsightNavigation?.module === 'leads' ? customerInsightNavigation.itemId : ''
            }
          />
        );
      case 'customer_data':
        if (!isPageAllowed('customer_data')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <CustomerData
            customers={customers}
            leads={leads}
            users={users}
            currentUser={user}
            initialCandidateId={
              supportNavigationTarget?.module === 'customer_data' ? supportNavigationTarget.entityId : ''
            }
            onInitialCandidateOpened={() => setSupportNavigationTarget(null)}
            initialInsightFilterId={
              customerInsightNavigation?.module === 'customer_data' ? customerInsightNavigation.itemId : ''
            }
            onStartConversion={candidate => {
              setCandidateLeadConversion(candidate);
              setActivePage('leads');
            }}
          />
        );
      case 'commercial_map':
        if (!isPageAllowed('commercial_map')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <CommercialMap
            customers={customers}
            leads={leads}
            orders={pos}
            deliveries={deliveries}
            users={users}
            currentUser={user}
            onNavigateToCrm={() => setActivePage('crm')}
            onNavigateToLeads={() => setActivePage('leads')}
          />
        );
      case 'attendance':
        if (!isPageAllowed('attendance')) return null;
        return <AttendancePage currentUser={user} />;
      case 'work_schedule':
        if (!isPageAllowed('work_schedule')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <WorkSchedule
            currentUser={user}
            users={users}
            candidates={leadCandidates}
            leads={leads}
            customers={customers}
            initialGroupId={workScheduleGroupNavigation}
            onInitialGroupConsumed={() => setWorkScheduleGroupNavigation('')}
            onOpenRecord={(module, id) => {
              setSupportNavigationTarget({ module, entityId: id });
              setActivePage(module);
            }}
          />
        );
      case 'sales':
        if (!isPageAllowed('sales')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Sales
            pos={pos}
            customers={customers}
            leads={leads}
            currentUser={user}
            onRefresh={refreshData}
            initialSelectedPoId={selectedPoId}
            initialRepeatPoId={repeatSourcePoId}
            initialPreparedCustomerId={preparedCustomerId}
            onRepeatOrderOpened={() => setRepeatSourcePoId('')}
            onPreparedOrderOpened={handlePreparedOrderOpened}
            onOpenCustomerDetails={customerId => {
              setSupportNavigationTarget({ module: 'crm', entityId: customerId });
              setActivePage('crm');
            }}
            messages={messages}
            users={users}
          />
        );
      case 'sales_management':
        if (!isPageAllowed('sales_management')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <SalesManagementPage
            users={users}
            candidates={leadCandidates}
            leads={leads}
            customers={customers}
            currentUser={user}
            onOpenRecord={(module, id) => {
              setSupportNavigationTarget({ module, entityId: id });
              setActivePage(module);
            }}
          />
        );
      case 'design':
        if (!isPageAllowed('design')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Design pos={pos} designRequests={designRequests} users={users} currentUser={user} onRefresh={refreshData} />
        );
      case 'design_library':
        if (!isPageAllowed('design')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <DesignLibrary pos={pos} currentUser={user} />;
      case 'purchase':
        if (!isPageAllowed('purchase')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Purchase
            pos={pos}
            purchaseOrders={purchaseOrders}
            procurementRequests={procurementRequests}
            currentUser={user}
            onRefresh={refreshData}
            users={users}
          />
        );
      case 'suppliers':
        if (!isPageAllowed('suppliers')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <Suppliers purchaseOrders={purchaseOrders} currentUser={user} users={users} />;
      case 'inventory':
        if (!isPageAllowed('inventory')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Inventory
            currentUser={user}
            onRefresh={refreshData}
            tabRequest={pageTabRequest?.page === 'inventory' ? pageTabRequest : undefined}
          />
        );
      case 'production':
        if (!isPageAllowed('production')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <Production
            pos={pos}
            productionCommands={productionCommands}
            currentUser={user}
            onRefresh={refreshData}
            initialSelectedLsxId={selectedLsxId}
            tabRequest={pageTabRequest?.page === 'production' ? pageTabRequest : undefined}
            messages={messages}
            users={users}
          />
        );
      case 'delivery':
        if (!isPageAllowed('delivery')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <Delivery pos={pos} currentUser={user} onRefresh={refreshData} />;
      case 'accounting':
        if (!isPageAllowed('accounting')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <Accounting pos={pos} currentUser={user} onRefresh={refreshData} users={users} />;
      case 'chat':
        if (!isPageAllowed('chat')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return (
          <ChatPage
            currentUser={user}
            messages={messages}
            pos={pos}
            productionCommands={productionCommands}
            onNavigateToPO={poId => {
              setSelectedPoId(poId);
              setActivePage('sales');
            }}
            onNavigateToLSX={lsxId => {
              setSelectedLsxId(lsxId);
              rememberPageTab('production', 'commands');
              setActivePage('production');
            }}
            users={users}
            channels={channels}
          />
        );
      case 'recycle_bin':
        if (!isPageAllowed('recycle_bin')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <RecycleBin currentUser={user} onRefresh={refreshData} />;
      case 'users':
        if (!isPageAllowed('users')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <UserManagement users={accountProfiles} directory={users} currentUser={user} onRefresh={refreshData} />;
      default:
        return (
          <Dashboard
            user={user}
            users={users}
            pos={pos}
            designRequests={designRequests}
            customers={customers}
            leads={leads}
            candidates={leadCandidates}
            inventory={canReadWarehouse(user) && isFirebaseRuntimeEnabled ? inventory : []}
            purchaseOrders={purchaseOrders}
            productionCommands={productionCommands}
            invoices={invoices}
            onNavigate={page => setActivePage(page)}
            onNavigateInsight={(module, itemId) => {
              setCustomerInsightNavigation({ module, itemId });
              setActivePage(module);
            }}
            onNavigateWorkGroup={groupId => {
              setWorkScheduleGroupNavigation(groupId);
              setActivePage('work_schedule');
            }}
            onOpenPO={poId => {
              setSelectedPoId(poId);
              setActivePage('sales');
            }}
          />
        );
    }
  };

  // Render Login Page
  if (!user) {
    return (
      <div className="login-full-page">
        {/* Left Panel: Full-height Background Image + Overlay Text */}
        <div className="login-hero-panel">
          <div className="login-hero-overlay">
            <div className="login-hero-content">
              <div className="login-hero-badge">SUNFLOWER LABEL ERP</div>
              <h1 className="login-hero-title">SUNFLOWER LABEL ERP</h1>
              <p className="login-hero-sub">Hệ thống quản trị sản xuất tem nhãn chuyên nghiệp</p>
              <div className="login-hero-divider"></div>
              <p className="login-hero-desc">
                Giải pháp ERP toàn diện giúp tối ưu quy trình sản xuất tem nhãn từ nhận đơn hàng đến giao hàng và quản
                lý công nợ hiệu quả.
              </p>
              <div className="login-hero-flow">
                <span>Đơn hàng</span>
                <span className="flow-arrow">→</span>
                <span>Thiết kế</span>
                <span className="flow-arrow">→</span>
                <span>Sản xuất</span>
                <span className="flow-arrow">→</span>
                <span>QC</span>
                <span className="flow-arrow">→</span>
                <span>Giao hàng</span>
                <span className="flow-arrow">→</span>
                <span>Thu công nợ</span>
              </div>
              <div className="login-hero-modules">
                <div className="hero-module">Quản lý đơn hàng</div>
                <div className="hero-module">Thiết kế & Duyệt mẫu</div>
                <div className="hero-module">Theo dõi Sản xuất</div>
                <div className="hero-module">Quản lý Nguyên vật liệu</div>
                <div className="hero-module">Kiểm soát Chất lượng</div>
                <div className="hero-module">Giao nhận & Giao hàng</div>
                <div className="hero-module">Công nợ Khách hàng</div>
                <div className="hero-module">Báo cáo & Phân tích</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Floating Login Card */}
        <div className="login-form-panel">
          <div className="login-card-glass">
            <div
              className="login-header"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
            >
              <img
                src={APP_LOGO_PATH}
                alt="Sunflower"
                style={{ width: '260px', maxWidth: '100%', height: 'auto', marginBottom: '18px', objectFit: 'contain' }}
              />
              <h2 className="login-card-title">Chào mừng trở lại</h2>
              <p className="login-card-subtitle">Đăng nhập để tiếp tục làm việc</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label className="login-label">Tên đăng nhập</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder="Nhập tên đăng nhập hoặc email"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="login-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="login-label">Mật khẩu</label>
                <div className="input-wrapper password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="login-input"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="login-options">
                <label className="remember-me">
                  <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
              </div>

              {errorMsg && <div className="login-error-alert">{errorMsg}</div>}

              <button type="submit" className="login-btn-submit">
                Đăng Nhập Hệ Thống
              </button>
            </form>

            <div className="login-card-footer">
              <div className="login-footer-brand">
                <span>SUNFLOWER LABEL ERP v1.0</span>
                <span>© 2026 Sunflower Printing Solutions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Dashboard Layout
  const unreadChannelCount = getUnreadChannelMessagesTotal();
  const activeMenuItem = findActiveMenuItem(SIDEBAR_MENU, highlightedPage, pageTabs[highlightedPage]);
  const activeMenuGroupId = activeMenuItem ? findMenuGroupOf(SIDEBAR_MENU, activeMenuItem.id)?.id : undefined;
  const openMenuItem = (menuItem: SidebarMenuItem) => {
    if (!confirmAppNavigation()) return;
    const tab = menuItemTab(SIDEBAR_MENU, menuItem, pageTabs[menuItem.page]);
    if (tab) {
      rememberPageTab(menuItem.page, tab);
      setPageTabRequest(previous => ({ page: menuItem.page, tab, requestId: (previous?.requestId ?? 0) + 1 }));
    }
    showPage(menuItem.page);
    setIsSidebarOpen(false);
  };
  const renderMenuItem = (menuItem: SidebarMenuItem, nested = false) => {
    const ItemIcon = menuItem.icon;
    const isActive = activeMenuItem?.id === menuItem.id;
    return (
      <button
        key={menuItem.id}
        type="button"
        data-page-id={menuItem.page}
        className={`sidebar-item${isActive ? ' active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => openMenuItem(menuItem)}
        title={menuItem.title}
      >
        <div className={`sidebar-item-content${menuItem.danger ? ' sidebar-item-content-danger' : ''}`}>
          {!nested && <ItemIcon size={16} />}
          <span className="sidebar-item-label">{menuItem.translateLabel ? menuItem.label : menuItem.label}</span>
        </div>
        {menuItem.id === 'chat' && unreadChannelCount > 0 && (
          <span className="sidebar-badge">{unreadChannelCount}</span>
        )}
      </button>
    );
  };

  return (
    <TableColumnLayoutContext.Provider value={tableColumnLayouts}>
      <PageContextProvider onChange={handlePageContextChange}>
        <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
          {/* Mobile backdrop overlay */}
          <div
            className={`sidebar-overlay-mobile ${isSidebarOpen ? 'show' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* APP SIDEBAR NAVIGATION (Strictly Text Links, No Icons) */}
          <aside className={`app-sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
            <nav className="sidebar-menu" onPointerOver={handleSidebarPreload} onFocusCapture={handleSidebarPreload}>
              {SIDEBAR_MENU.map(entry => {
                if (entry.kind === 'item') return isMenuItemAllowed(entry) ? renderMenuItem(entry) : null;
                const groupItems = entry.items.filter(isMenuItemAllowed);
                if (!groupItems.length) return null;
                const GroupIcon = entry.icon;
                // Groups are always open (no folding); the heading is a label, not a button.
                return (
                  <div key={entry.id} className="sidebar-group">
                    <div
                      id={`sidebar-group-${entry.id}`}
                      className={`sidebar-group-heading${activeMenuGroupId === entry.id ? ' has-active' : ''}`}
                    >
                      <GroupIcon size={15} aria-hidden="true" />
                      <span>{entry.label}</span>
                    </div>
                    <div className="sidebar-group-items" role="group" aria-labelledby={`sidebar-group-${entry.id}`}>
                      {groupItems.map(groupItem => renderMenuItem(groupItem, true))}
                    </div>
                  </div>
                );
              })}
            </nav>
            <div className="sidebar-footer">
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => {
                  setIsSidebarCollapsed(true);
                  localStorage.setItem('erp_sidebar_collapsed', 'true');
                }}
                aria-label="Thu gọn thanh menu"
                title="Thu gọn thanh menu"
              >
                <PanelLeftClose size={17} aria-hidden="true" />
              </button>
              <button
                className="btn btn-outline sidebar-logout-btn"
                onClick={() => {
                  handleLogout();
                  setIsSidebarOpen(false);
                }}
              >
                <LogOut size={16} />
                <span>Đăng Xuất</span>
              </button>
            </div>
          </aside>

          <button
            type="button"
            className="sidebar-collapsed-toggle"
            onClick={() => {
              setIsSidebarCollapsed(false);
              localStorage.setItem('erp_sidebar_collapsed', 'false');
            }}
            aria-label="Mở thanh menu"
            title="Mở thanh menu"
          >
            <PanelLeftOpen size={17} aria-hidden="true" />
          </button>

          {/* APP HEADER */}
          <header className="app-header">
            <div className="sidebar-logo">
              <img src={APP_LOGO_PATH} alt="Sunflower" className="sidebar-logo-image" />
            </div>
            <div className="header-title-container">
              {/* Hamburger menu toggle button for mobile */}
              <button
                type="button"
                className="mobile-menu-btn"
                onClick={() => setIsSidebarOpen(currentValue => !currentValue)}
                aria-label={isSidebarOpen ? 'Đóng thanh menu' : 'Mở thanh menu'}
                aria-expanded={isSidebarOpen}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}
                >
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span>Menu</span>
              </button>
              <div className="header-page-context" aria-label="Vị trí hiện tại">
                <span className="header-page-context__section">{pageContext.section}</span>
                {pageContext.current && (
                  <>
                    <span className="header-page-context__separator" aria-hidden="true">
                      ›
                    </span>
                    <span className="header-page-context__current">{pageContext.current}</span>
                  </>
                )}
              </div>
            </div>

            <div className="header-actions">
              <div className="header-notification-center" ref={notificationCenterRef}>
                <button
                  type="button"
                  className={`header-notification-button ${isNotificationPanelOpen ? 'is-active' : ''}`}
                  onClick={() => setIsNotificationPanelOpen(open => !open)}
                  aria-label={`Thông báo${unreadNotificationTotal > 0 ? `, ${unreadNotificationTotal} chưa đọc` : ''}`}
                  aria-expanded={isNotificationPanelOpen}
                  title="Thông báo"
                >
                  <Bell size={19} aria-hidden="true" />
                  {unreadNotificationTotal > 0 && (
                    <span>{unreadNotificationTotal > 99 ? '99+' : unreadNotificationTotal}</span>
                  )}
                </button>

                {isNotificationPanelOpen && (
                  <section className="header-notification-panel" aria-label="Thông báo mới nhất">
                    <header>
                      <div>
                        <strong>Thông báo</strong>
                        <span>
                          {unreadNotificationTotal > 0
                            ? `${unreadNotificationTotal} thông báo chưa đọc`
                            : 'Bạn đã xem tất cả thông báo'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={readAllNotifications}
                        disabled={unreadNotificationTotal === 0}
                        title="Đánh dấu tất cả đã đọc"
                      >
                        <CheckCheck size={17} /> <span>Đã đọc tất cả</span>
                      </button>
                    </header>
                    <div className="header-notification-list">
                      {userNotifications.map(notification => {
                        const actorName =
                          users.find(candidate => candidate.uid === notification.createdById)?.displayName ||
                          'Sunflower ERP';
                        return (
                          <button
                            type="button"
                            key={notification.id}
                            className={notification.readAt === null ? 'is-unread' : ''}
                            onClick={() => openNotification(notification)}
                          >
                            <span className="header-notification-avatar">{getInitials(actorName)}</span>
                            <span className="header-notification-content">
                              <span>
                                <strong>{notification.title || 'Thông báo mới'}</strong>
                                {notification.readAt === null && <i aria-label="Chưa đọc" />}
                              </span>
                              <span>{notification.message || notification.entityCode}</span>
                              <small>
                                {formatNotificationTime(notification.createdAt)} ·{' '}
                                {NOTIFICATION_MODULE_LABELS[notification.module]}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                      {userNotifications.length === 0 && (
                        <div className="header-notification-empty">
                          <Bell size={24} />
                          <strong>Chưa có thông báo</strong>
                          <span>Yêu cầu hỗ trợ từ Sale sẽ xuất hiện tại đây.</span>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </div>

              {!isFirebaseRuntimeEnabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                      display: 'inline-block'
                    }}
                  >
                    Chuyển nhanh vai trò:
                  </span>
                  <select
                    value={user.role}
                    onChange={e => handleSwitchRole(e.target.value)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      width: '115px'
                    }}
                  >
                    {USER_ROLES.map(role => (
                      <option key={role} value={role}>
                        {USER_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isFirebaseRuntimeEnabled && (
                <IconButton
                  label="Đổi mật khẩu"
                  icon={<KeyRound size={16} />}
                  onClick={() => setChangingPassword(true)}
                />
              )}
              <div className="header-user-badge">
                <span style={{ fontWeight: 600 }}>{user.displayName}</span>
              </div>
            </div>
          </header>

          {/* APP MAIN CONTENT PORTAL */}
          <main
            className="app-main"
            aria-busy={isPageTransitionPending}
            onScroll={event => pageScrollPositionsRef.current.set(activePageRef.current, event.currentTarget.scrollTop)}
          >
            <PageProgressBar active={isPageTransitionPending} />
            {tableColumnLayouts.error && (
              <div className="erp-column-layout-error" role="alert">
                <span>{tableColumnLayouts.error}</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={tableColumnLayouts.retry}>
                  Thử lại
                </button>
              </div>
            )}
            {user &&
              mountedPages.map(pageId => (
                <KeepAlivePage
                  key={pageId}
                  pageId={pageId}
                  active={pageId === activePage}
                  render={renderPageWhenReady}
                />
              ))}
          </main>
          {changingPassword && (
            <Suspense fallback={null}>
              <ChangePasswordDialog onClose={() => setChangingPassword(false)} />
            </Suspense>
          )}
        </div>
      </PageContextProvider>
    </TableColumnLayoutContext.Provider>
  );
}

export default AppShell;
