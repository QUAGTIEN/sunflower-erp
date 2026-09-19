import React, { useCallback, useState, useEffect, useRef } from 'react';
import { authService, dbService, isFirebaseRuntimeEnabled, UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { auditService } from '@/services/auditService';
import { Dashboard } from '@/features/dashboard';
import { Crm, CustomerData, Leads } from '@/features/crm';
import { Sales } from '@/features/sales';
import { Design, DesignLibrary } from '@/features/design';
import { Purchase, Suppliers } from '@/features/procurement';
import { Inventory } from '@/features/inventory';
import { Production } from '@/features/production';
import { Delivery } from '@/features/delivery';
import { Accounting } from '@/features/accounting';
import { RecycleBin, UserManagement } from '@/features/administration';
import { ChatPage } from '@/features/chat';
import { useLanguage } from '@/context/LanguageContext';
import { PageContextProvider } from '@/context/PageContext';
import type { AppPageContext } from '@/context/PageContextState';
import { CommercialMap } from '@/features/commercial-map';
import { WorkSchedule } from '@/features/work-schedule';
import {
  APP_LOGO_PATH,
  AUDIT_PAGE_LABELS,
  formatNotificationTime,
  getInitials,
  NOTIFICATION_MODULE_LABELS
} from '@/app/config/appConfig';
import { canAccessPage, getDefaultPagesForRole } from '@/app/navigation/accessControl';
import '@/styles/ErpUiStandards.css';
import '@/styles/Theme.css';
import '@/styles/ContentTabs.css';
import { DesignRequest } from '@/features/design/model/designWorkflow';
import { sortNewestFirst } from '@/shared/utils/recordOrdering';
import { useGlobalTableColumnResize } from '@/hooks/useGlobalTableColumnResize';
import { useAdaptiveTableText } from '@/hooks/useAdaptiveTableText';
import { normalizePORecords } from '@/domain/poCompatibility';
import type { CustomerRecord, LeadRecord } from '@/features/crm/model/crmModels';
import type { LeadCandidateRecord } from '@/features/crm/model/leadCandidateModels';
import type { ProcurementRequestRecord } from '@/features/procurement/model/purchaseModels';
import type { UserNotificationRecord } from '@/domain/notificationModels';
import {
  markAllNotificationsRead,
  markNotificationRead
} from '@/services/notificationService';
import { synchronizeProvinceData } from '@/features/crm/api/provinceDataSynchronization';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  FileText,
  Palette,
  ShoppingBag,
  Building2,
  Archive,
  FolderOpen,
  Settings,
  Truck,
  DollarSign,
  Trash2,
  UserCog,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Target,
  Bell,
  CheckCheck,
  MapPinned,
  CalendarDays
} from 'lucide-react';

const DEFAULT_PAGE_CONTEXTS: Record<string, AppPageContext> = {
  dashboard: { section: 'Tổng quan' },
  chat: { section: 'Kênh chat' },
  work_schedule: { section: 'Lịch làm việc', current: 'Hôm nay' },
  commercial_map: { section: 'Thương mại', current: 'Tỉnh thành' },
  customer_data: { section: 'Dữ liệu thô', current: 'Tất cả dữ liệu' },
  leads: { section: 'Tiềm năng', current: 'Tổng quan' },
  crm: { section: 'Khách hàng', current: 'Tất cả' },
  sales: { section: 'Tạo đơn hàng', current: 'Danh sách PO' },
  design: { section: 'Thiết kế', current: 'Danh sách yêu cầu thiết kế' },
  design_library: { section: 'Kho mẫu', current: 'Danh sách mẫu thiết kế' },
  purchase: { section: 'Mua hàng', current: 'Yêu cầu từ Sale PO' },
  suppliers: { section: 'Nhà cung cấp', current: 'Danh sách nhà cung cấp' },
  inventory: { section: 'Vật liệu', current: 'Tồn kho hiện tại' },
  production: { section: 'Sản xuất', current: 'Danh sách LSX' },
  delivery: { section: 'Giao hàng', current: 'Bảng điều phối' },
  accounting: { section: 'Kế toán', current: 'Công nợ phải thu & phải trả' },
  recycle_bin: { section: 'Thùng rác' },
  users: { section: 'Tài khoản', current: 'Danh sách người dùng' }
};

function AppShell() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [reportedPageContext, setReportedPageContext] = useState<(AppPageContext & { pageId: string }) | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('erp_sidebar_collapsed') === 'true';
  });
  const { t, language, setLanguage } = useLanguage();

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
    localStorage.setItem('erp_color_theme', 'light');
  }, []);

  const handlePageContextChange = useCallback((context: AppPageContext) => {
    setReportedPageContext({ ...context, pageId: activePage });
  }, [activePage]);

  const pageContext = reportedPageContext?.pageId === activePage
    ? reportedPageContext
    : (DEFAULT_PAGE_CONTEXTS[activePage] ?? { section: activePage });

  const isPageAllowed = (pageId: string): boolean => canAccessPage(user, pageId);
  useGlobalTableColumnResize(activePage, user?.uid || '');
  useAdaptiveTableText(activePage, user?.uid || '');

  // Dynamic channels state
  const [channels, setChannels] = useState<any[]>([]);

  // Real-time synchronization states
  const [users, setUsers] = useState<UserProfile[]>([]);
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
  const [supportNavigationTarget, setSupportNavigationTarget] = useState<{ module: 'customer_data' | 'leads' | 'crm'; entityId: string } | null>(null);
  const [customerInsightNavigation, setCustomerInsightNavigation] = useState<{ module: 'customer_data' | 'leads' | 'crm' | 'sales'; itemId: string } | null>(null);

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
    const unsubAuth = authService.onAuthStateChanged((currUser) => {
      setUser(currUser);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    auditService.recordNavigation(user, activePage, AUDIT_PAGE_LABELS[activePage] || activePage);
  }, [activePage, user]);

  useEffect(() => {
    if (!user) return;
    const heartbeat = window.setInterval(() => {
      auditService.updatePresenceSafely(user, 'online', activePage);
    }, 90_000);
    const markOffline = () => auditService.updatePresenceSafely(user, 'offline', activePage);
    window.addEventListener('beforeunload', markOffline);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('beforeunload', markOffline);
      auditService.updatePresenceSafely(user, 'offline', activePage);
    };
  }, [activePage, user]);

  // Keep only session-wide data live for the whole authenticated session.
  useEffect(() => {
    if (!user) return;

    const unsubUsers = dbService.subscribeCollection('users', (data) => setUsers(data as UserProfile[]));
    const unsubMessages = dbService.subscribeCollection('messages', data => {
      setMessages([...data].sort((left, right) => (
        String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      )));
    }, {
      orderByField: 'createdAt',
      orderDirection: 'desc',
      maxResults: 250
    });
    const unsubChannels = dbService.subscribeCollection('channels', setChannels);
    let unsubNotifications: () => void = () => undefined;
    if (user.role === 'admin') {
      unsubNotifications = dbService.subscribeCollection('notifications', (data) => {
        setNotifications(sortNewestFirst(
          (data as UserNotificationRecord[]).filter(notification => notification.recipientId === user.uid),
          notification => [notification.createdAt]
        ));
      }, {
        fieldName: 'eventType',
        fieldValue: 'support_request',
        maxResults: 100,
        onError: () => setNotifications([])
      });
    } else {
      window.setTimeout(() => setNotifications([]), 0);
    }

    return () => {
      unsubUsers();
      unsubMessages();
      unsubChannels();
      unsubNotifications();
    };
  }, [user]);

  // Business collections are live only while the current page needs them.
  useEffect(() => {
    const stopAllBusinessSubscriptions = () => {
      businessSubscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      businessSubscriptionsRef.current.clear();
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

    const pageNeeds = (...pages: string[]) => pages.includes(activePage);
    const syncSubscription = (
      collectionName: string,
      needed: boolean,
      subscribe: () => () => void
    ) => {
      const existing = businessSubscriptionsRef.current.get(collectionName);
      if (needed && !existing) {
        businessSubscriptionsRef.current.set(collectionName, subscribe());
      } else if (!needed && existing) {
        existing();
        businessSubscriptionsRef.current.delete(collectionName);
      }
    };

    syncSubscription(
      'customers',
      pageNeeds('dashboard', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'),
      () => dbService.subscribeCollection('customers', data => {
        setCustomers(data as CustomerRecord[]);
      })
    );
    syncSubscription(
      'leads',
      pageNeeds('dashboard', 'crm', 'leads', 'customer_data', 'commercial_map', 'sales'),
      () => dbService.subscribeCollection('leads', data => {
        setLeads(sortNewestFirst(data as LeadRecord[], lead => [lead.createdAt, lead.updatedAt]));
      })
    );
    syncSubscription(
      'lead_candidates',
      pageNeeds('dashboard'),
      () => dbService.subscribeCollection('lead_candidates', data => {
        setLeadCandidates(sortNewestFirst(data as LeadCandidateRecord[], candidate => [candidate.createdAt, candidate.updatedAt]));
      })
    );
    syncSubscription(
      'pos',
      pageNeeds('dashboard', 'crm', 'commercial_map', 'sales', 'design', 'design_library', 'purchase', 'production', 'delivery', 'accounting', 'chat'),
      () => dbService.subscribeCollection('pos', data => {
        setPOs(sortNewestFirst(normalizePORecords(data), po => [po.createdAt, po.orderDate]));
      })
    );
    syncSubscription(
      'purchase_orders',
      pageNeeds('dashboard', 'purchase', 'suppliers'),
      () => dbService.subscribeCollection('purchase_orders', data => {
        setPurchaseOrders(sortNewestFirst(data, purchaseOrder => [purchaseOrder.createdAt]));
      })
    );
    syncSubscription(
      'procurement_requests',
      pageNeeds('dashboard', 'purchase'),
      () => dbService.subscribeCollection('procurement_requests', data => {
        setProcurementRequests(sortNewestFirst(
          data as ProcurementRequestRecord[],
          request => [request.createdAt, request.updatedAt]
        ));
      })
    );
    syncSubscription(
      'production_commands',
      pageNeeds('dashboard', 'production', 'chat'),
      () => dbService.subscribeCollection('production_commands', data => {
        setProductionCommands(sortNewestFirst(data, command => [command.createdAt, command.startedAt]));
      })
    );
    syncSubscription(
      'deliveries',
      pageNeeds('dashboard', 'commercial_map'),
      () => dbService.subscribeCollection('deliveries', data => {
        setDeliveries(sortNewestFirst(data, delivery => [delivery.createdAt]));
      })
    );
    syncSubscription(
      'invoices',
      pageNeeds('dashboard', 'crm'),
      () => dbService.subscribeCollection('invoices', data => {
        setInvoices(sortNewestFirst(data, invoice => [invoice.createdAt]));
      })
    );
    syncSubscription(
      'inventory',
      pageNeeds('dashboard'),
      () => dbService.subscribeCollection('inventory', setInventory)
    );
    syncSubscription(
      'design_requests',
      pageNeeds('dashboard', 'design'),
      () => dbService.subscribeCollection('design_requests', data => {
        setDesignRequests(sortNewestFirst(
          data as DesignRequest[],
          request => [request.createdAt]
        ));
      })
    );
  }, [activePage, user]);

  useEffect(() => () => {
    businessSubscriptionsRef.current.forEach(unsubscribe => unsubscribe());
    businessSubscriptionsRef.current.clear();
  }, []);

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
    setActivePage('dashboard');
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
        total += messages.filter(msg => msg.type === 'channel' && msg.targetId === ch.id && msg.senderId !== user.uid).length;
      } else {
        const lastReadTime = new Date(lastReadStr).getTime();
        total += messages.filter(
          msg => msg.type === 'channel' && msg.targetId === ch.id && msg.senderId !== user.uid && new Date(msg.createdAt).getTime() > lastReadTime
        ).length;
      }
    }
    return total;
  };

  const allUserNotifications = user
    ? notifications.filter(notification => notification.recipientId === user.uid)
    : [];
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
      notification.eventType === 'support_request'
      && (notification.module === 'customer_data' || notification.module === 'leads' || notification.module === 'crm')
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

  // View routing rendering selector
  const renderPageContent = () => {
    if (!user) return null;

    switch (activePage) {
      case 'crm':
        if (!isPageAllowed('crm')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
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
            initialInsightFilterId={customerInsightNavigation?.module === 'crm' ? customerInsightNavigation.itemId : ''}
          />
        );
      case 'leads':
        if (!isPageAllowed('leads')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
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
            initialInsightFilterId={customerInsightNavigation?.module === 'leads' ? customerInsightNavigation.itemId : ''}
          />
        );
      case 'customer_data':
        if (!isPageAllowed('customer_data')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return (
          <CustomerData
            customers={customers}
            leads={leads}
            users={users}
            currentUser={user}
            initialCandidateId={supportNavigationTarget?.module === 'customer_data' ? supportNavigationTarget.entityId : ''}
            onInitialCandidateOpened={() => setSupportNavigationTarget(null)}
            initialInsightFilterId={customerInsightNavigation?.module === 'customer_data' ? customerInsightNavigation.itemId : ''}
            onStartConversion={candidate => {
              setCandidateLeadConversion(candidate);
              setActivePage('leads');
            }}
          />
        );
      case 'commercial_map':
        if (!isPageAllowed('commercial_map')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
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
      case 'work_schedule':
        if (!isPageAllowed('work_schedule')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <WorkSchedule currentUser={user} users={users} />;
      case 'sales':
        if (!isPageAllowed('sales')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
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
            initialInsightFilterId={customerInsightNavigation?.module === 'sales' ? customerInsightNavigation.itemId : ''}
            messages={messages}
            users={users}
          />
        );
      case 'design':
        if (!isPageAllowed('design')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Design pos={pos} designRequests={designRequests} users={users} currentUser={user} onRefresh={refreshData} />;
      case 'design_library':
        if (!isPageAllowed('design')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <DesignLibrary pos={pos} currentUser={user} />;
      case 'purchase':
        if (!isPageAllowed('purchase')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Purchase pos={pos} purchaseOrders={purchaseOrders} procurementRequests={procurementRequests} currentUser={user} onRefresh={refreshData} users={users} />;
      case 'suppliers':
        if (!isPageAllowed('suppliers')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Suppliers purchaseOrders={purchaseOrders} currentUser={user} users={users} />;
      case 'inventory':
        if (!isPageAllowed('inventory')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Inventory currentUser={user} onRefresh={refreshData} />;
      case 'production':
        if (!isPageAllowed('production')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return (
          <Production
            pos={pos}
            productionCommands={productionCommands}
            currentUser={user}
            onRefresh={refreshData}
            initialSelectedLsxId={selectedLsxId}
            messages={messages}
            users={users}
          />
        );
      case 'delivery':
        if (!isPageAllowed('delivery')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Delivery pos={pos} currentUser={user} onRefresh={refreshData} />;
      case 'accounting':
        if (!isPageAllowed('accounting')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <Accounting pos={pos} currentUser={user} onRefresh={refreshData} users={users} />;
      case 'chat':
        if (!isPageAllowed('chat')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return (
          <ChatPage
            currentUser={user}
            messages={messages}
            pos={pos}
            productionCommands={productionCommands}
            onNavigateToPO={(poId) => {
              setSelectedPoId(poId);
              setActivePage('sales');
            }}
            onNavigateToLSX={(lsxId) => {
              setSelectedLsxId(lsxId);
              setActivePage('production');
            }}
            users={users}
            channels={channels}
          />
        );
      case 'recycle_bin':
        if (!isPageAllowed('recycle_bin')) { setTimeout(() => setActivePage('dashboard'), 0); return null; }
        return <RecycleBin currentUser={user} onRefresh={refreshData} />;
      case 'users':
        if (!isPageAllowed('users')) {
          setTimeout(() => setActivePage('dashboard'), 0);
          return null;
        }
        return <UserManagement users={users} currentUser={user} onRefresh={refreshData} />;
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
            inventory={inventory}
            purchaseOrders={purchaseOrders}
            productionCommands={productionCommands}
            deliveries={deliveries}
            invoices={invoices}
            onNavigate={(page) => setActivePage(page)}
            onNavigateInsight={(module, itemId) => {
              setCustomerInsightNavigation({ module, itemId });
              setActivePage(module);
            }}
            onOpenPO={(poId) => {
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
              <div className="login-hero-badge">{t('SUNFLOWER LABEL ERP')}</div>
              <h1 className="login-hero-title">{t('SUNFLOWER LABEL ERP')}</h1>
              <p className="login-hero-sub">{t('Hệ thống quản trị sản xuất tem nhãn chuyên nghiệp')}</p>
              <div className="login-hero-divider"></div>
              <p className="login-hero-desc">
                {t('Giải pháp ERP toàn diện giúp tối ưu quy trình sản xuất tem nhãn từ nhận PO đến giao hàng và quản lý công nợ hiệu quả.')}
              </p>
              <div className="login-hero-flow">
                <span>PO</span>
                <span className="flow-arrow">→</span>
                <span>{t('Thiết kế')}</span>
                <span className="flow-arrow">→</span>
                <span>{t('Sản xuất')}</span>
                <span className="flow-arrow">→</span>
                <span>QC</span>
                <span className="flow-arrow">→</span>
                <span>{t('Giao hàng')}</span>
                <span className="flow-arrow">→</span>
                <span>{t('Thu công nợ')}</span>
              </div>
              <div className="login-hero-modules">
                <div className="hero-module">{t('Quản lý PO')}</div>
                <div className="hero-module">{t('Thiết kế & Duyệt mẫu')}</div>
                <div className="hero-module">{t('Theo dõi Sản xuất')}</div>
                <div className="hero-module">{t('Quản lý Nguyên vật liệu')}</div>
                <div className="hero-module">{t('Kiểm soát Chất lượng')}</div>
                <div className="hero-module">{t('Giao nhận & Giao hàng')}</div>
                <div className="hero-module">{t('Công nợ Khách hàng')}</div>
                <div className="hero-module">{t('Báo cáo & Phân tích')}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Floating Login Card */}
        <div className="login-form-panel">
          <div className="login-card-glass">
            <div className="login-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <img
                src={APP_LOGO_PATH}
                alt="Sunflower"
                style={{ width: '260px', maxWidth: '100%', height: 'auto', marginBottom: '18px', objectFit: 'contain' }}
              />
              <h2 className="login-card-title">{t('Chào mừng trở lại')}</h2>
              <p className="login-card-subtitle">{t('Đăng nhập để tiếp tục làm việc')}</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label className="login-label">{t('Tên đăng nhập')}</label>
                <div className="input-wrapper">
                  <input
                    type="text"
                    placeholder={t('Nhập tên đăng nhập hoặc email')}
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="login-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="login-label">{t('Mật khẩu')}</label>
                <div className="input-wrapper password-input-wrapper">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={t('Nhập mật khẩu')}
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
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="login-options">
                <label className="remember-me">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                  />
                  <span>{t('Ghi nhớ đăng nhập')}</span>
                </label>
              </div>

              {errorMsg && (
                <div className="login-error-alert">{errorMsg}</div>
              )}

              <button type="submit" className="login-btn-submit">
                {t('Đăng Nhập Hệ Thống')}
              </button>
            </form>

            <div className="login-card-footer">
              <button
                className="lang-toggle-btn"
                onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span>{language === 'vi' ? 'English' : 'Tiếng Việt'}</span>
              </button>
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

  return (
    <PageContextProvider onChange={handlePageContextChange}>
    <div className={`app-container ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile backdrop overlay */}
      <div
        className={`sidebar-overlay-mobile ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      />

      {/* APP SIDEBAR NAVIGATION (Strictly Text Links, No Icons) */}
      <aside className={`app-sidebar ${isSidebarOpen ? 'sidebar-open' : ''}`}>
        <nav className="sidebar-menu">
          {isPageAllowed('dashboard') && (
            <button
              className={`sidebar-item ${activePage === 'dashboard' ? 'active' : ''}`}
              onClick={() => { setActivePage('dashboard'); setIsSidebarOpen(false); }}
              title={t('Tổng Quan Dashboards')}
            >
              <div className="sidebar-item-content">
                <LayoutDashboard size={16} />
                <span className="sidebar-item-label">Tổng quan</span>
              </div>
            </button>
          )}

          {isPageAllowed('chat') && (
            <button
              className={`sidebar-item ${activePage === 'chat' ? 'active' : ''}`}
              onClick={() => { setActivePage('chat'); setIsSidebarOpen(false); }}
              title={t('Kênh Thảo Luận')}
            >
              <div className="sidebar-item-content">
                <MessageSquare size={16} />
                <span className="sidebar-item-label">Kênh chat</span>
              </div>
              {unreadChannelCount > 0 && <span className="sidebar-badge">{unreadChannelCount}</span>}
            </button>
          )}

          {isPageAllowed('work_schedule') && (
            <button
              className={`sidebar-item ${activePage === 'work_schedule' ? 'active' : ''}`}
              onClick={() => { setActivePage('work_schedule'); setIsSidebarOpen(false); }}
              title={t('Lịch làm việc')}
            >
              <div className="sidebar-item-content">
                <CalendarDays size={16} />
                <span className="sidebar-item-label">Lịch làm việc</span>
              </div>
            </button>
          )}

          {isPageAllowed('commercial_map') && (
            <button
              className={`sidebar-item ${activePage === 'commercial_map' ? 'active' : ''}`}
              onClick={() => { setActivePage('commercial_map'); setIsSidebarOpen(false); }}
              title={t('Thương mại')}
            >
              <div className="sidebar-item-content">
                <MapPinned size={16} />
                <span className="sidebar-item-label">Thương mại</span>
              </div>
            </button>
          )}

          {isPageAllowed('customer_data') && (
            <button
              className={`sidebar-item ${activePage === 'customer_data' ? 'active' : ''}`}
              onClick={() => { setActivePage('customer_data'); setIsSidebarOpen(false); }}
              title={t('Dữ liệu thô')}
            >
              <div className="sidebar-item-content">
                <Archive size={16} />
                <span className="sidebar-item-label">Dữ liệu thô</span>
              </div>
            </button>
          )}

          {isPageAllowed('leads') && (
            <button
              className={`sidebar-item ${activePage === 'leads' ? 'active' : ''}`}
              onClick={() => { setActivePage('leads'); setIsSidebarOpen(false); }}
              title={t('Khách Hàng Tiềm Năng (Lead)')}
            >
              <div className="sidebar-item-content">
                <Target size={16} />
                <span className="sidebar-item-label">Tiềm năng</span>
              </div>
            </button>
          )}

          {isPageAllowed('crm') && (
            <button
              className={`sidebar-item ${activePage === 'crm' ? 'active' : ''}`}
              onClick={() => { setActivePage('crm'); setIsSidebarOpen(false); }}
              title={t('Khách Hàng Hợp Tác')}
            >
              <div className="sidebar-item-content">
                <Users size={16} />
                <span className="sidebar-item-label">Khách hàng</span>
              </div>
            </button>
          )}

          {isPageAllowed('sales') && (
            <button
              className={`sidebar-item ${activePage === 'sales' ? 'active' : ''}`}
              onClick={() => { setActivePage('sales'); setIsSidebarOpen(false); }}
              title={t('Tạo đơn hàng')}
            >
              <div className="sidebar-item-content">
                <FileText size={16} />
                <span className="sidebar-item-label">Tạo đơn hàng</span>
              </div>
            </button>
          )}

          {isPageAllowed('design') && (
            <>
              <button
                className={`sidebar-item ${activePage === 'design' ? 'active' : ''}`}
                onClick={() => { setActivePage('design'); setIsSidebarOpen(false); }}
                title={t('Yêu Cầu Thiết Kế')}
              >
                <div className="sidebar-item-content">
                  <Palette size={16} />
                  <span className="sidebar-item-label">Thiết kế</span>
                </div>
              </button>
              <button
                className={`sidebar-item ${activePage === 'design_library' ? 'active' : ''}`}
                onClick={() => { setActivePage('design_library'); setIsSidebarOpen(false); }}
                title={t('Kho Thiết Kế & Layout')}
              >
                <div className="sidebar-item-content">
                  <FolderOpen size={16} />
                  <span className="sidebar-item-label">Kho mẫu</span>
                </div>
              </button>
            </>
          )}

          {isPageAllowed('purchase') && (
            <button
              className={`sidebar-item ${activePage === 'purchase' ? 'active' : ''}`}
              onClick={() => { setActivePage('purchase'); setIsSidebarOpen(false); }}
              title={t('Mua Hàng')}
            >
              <div className="sidebar-item-content">
                <ShoppingBag size={16} />
                <span className="sidebar-item-label">Mua hàng</span>
              </div>
            </button>
          )}

          {isPageAllowed('suppliers') && (
            <button
              className={`sidebar-item ${activePage === 'suppliers' ? 'active' : ''}`}
              onClick={() => { setActivePage('suppliers'); setIsSidebarOpen(false); }}
              title={t('Danh Sách Nhà Cung Cấp')}
            >
              <div className="sidebar-item-content">
                <Building2 size={16} />
                <span className="sidebar-item-label">Nhà cung cấp</span>
              </div>
            </button>
          )}

          {isPageAllowed('inventory') && (
            <button
              className={`sidebar-item ${activePage === 'inventory' ? 'active' : ''}`}
              onClick={() => { setActivePage('inventory'); setIsSidebarOpen(false); }}
              title={t('Kho Nguyên Vật Tư')}
            >
              <div className="sidebar-item-content">
                <Archive size={16} />
                <span className="sidebar-item-label">Vật liệu</span>
              </div>
            </button>
          )}

          {isPageAllowed('production') && (
            <button
              className={`sidebar-item ${activePage === 'production' ? 'active' : ''}`}
              onClick={() => { setActivePage('production'); setIsSidebarOpen(false); }}
              title={t('Lệnh Sản Xuất (LSX)')}
            >
              <div className="sidebar-item-content">
                <Settings size={16} />
                <span className="sidebar-item-label">Sản xuất</span>
              </div>
            </button>
          )}

          {isPageAllowed('delivery') && (
            <button
              className={`sidebar-item ${activePage === 'delivery' ? 'active' : ''}`}
              onClick={() => { setActivePage('delivery'); setIsSidebarOpen(false); }}
              title={t('Kế Hoạch Giao Hàng')}
            >
              <div className="sidebar-item-content">
                <Truck size={16} />
                <span className="sidebar-item-label">Giao hàng</span>
              </div>
            </button>
          )}

          {isPageAllowed('accounting') && (
            <button
              className={`sidebar-item ${activePage === 'accounting' ? 'active' : ''}`}
              onClick={() => { setActivePage('accounting'); setIsSidebarOpen(false); }}
              title={t('Kế Toán & Lãi Gộp')}
            >
              <div className="sidebar-item-content">
                <DollarSign size={16} />
                <span className="sidebar-item-label">Kế toán</span>
              </div>
            </button>
          )}

          {isPageAllowed('recycle_bin') && (
            <button
              className={`sidebar-item ${activePage === 'recycle_bin' ? 'active' : ''}`}
              onClick={() => { setActivePage('recycle_bin'); setIsSidebarOpen(false); }}
              title={t('Thùng Rác')}
            >
              <div className="sidebar-item-content sidebar-item-content-danger">
                <Trash2 size={16} />
                <span className="sidebar-item-label">Thùng rác</span>
              </div>
            </button>
          )}

          {isPageAllowed('users') && (
            <button
              className={`sidebar-item ${activePage === 'users' ? 'active' : ''}`}
              onClick={() => { setActivePage('users'); setIsSidebarOpen(false); }}
              title={t('Quản Lý Tài Khoản')}
            >
              <div className="sidebar-item-content">
                <UserCog size={16} />
                <span className="sidebar-item-label">Tài khoản</span>
              </div>
            </button>
          )}
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
            onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
          >
            <LogOut size={16} />
            <span>{t('Đăng Xuất')}</span>
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
          <img
            src={APP_LOGO_PATH}
            alt="Sunflower"
            className="sidebar-logo-image"
          />
        </div>
        <div className="header-title-container">
          {/* Hamburger menu toggle button for mobile */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setIsSidebarOpen((currentValue) => !currentValue)}
            aria-label={isSidebarOpen ? 'Đóng thanh menu' : 'Mở thanh menu'}
            aria-expanded={isSidebarOpen}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
            <span>Menu</span>
          </button>
          <div className="header-page-context" aria-label="Vị trí hiện tại">
            <span className="header-page-context__section">{t(pageContext.section)}</span>
            {pageContext.current && (
              <>
                <span className="header-page-context__separator" aria-hidden="true">›</span>
                <span className="header-page-context__current">{t(pageContext.current)}</span>
              </>
            )}
          </div>
        </div>

        <div className="header-actions">
          {/* Globe Language Toggle */}
          <button
            className="lang-toggle-btn"
            onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
            title={language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>{language === 'vi' ? 'EN' : 'VI'}</span>
          </button>

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
                    <span>{unreadNotificationTotal > 0 ? `${unreadNotificationTotal} thông báo chưa đọc` : 'Bạn đã xem tất cả thông báo'}</span>
                  </div>
                  <button type="button" onClick={readAllNotifications} disabled={unreadNotificationTotal === 0} title="Đánh dấu tất cả đã đọc">
                    <CheckCheck size={17} /> <span>Đã đọc tất cả</span>
                  </button>
                </header>
                <div className="header-notification-list">
                  {userNotifications.map(notification => {
                    const actorName = users.find(candidate => candidate.uid === notification.createdById)?.displayName || 'Sunflower ERP';
                    return (
                      <button
                        type="button"
                        key={notification.id}
                        className={notification.readAt === null ? 'is-unread' : ''}
                        onClick={() => openNotification(notification)}
                      >
                        <span className="header-notification-avatar">{getInitials(actorName)}</span>
                        <span className="header-notification-content">
                          <span><strong>{notification.title || 'Thông báo mới'}</strong>{notification.readAt === null && <i aria-label="Chưa đọc" />}</span>
                          <span>{notification.message || notification.entityCode}</span>
                          <small>{formatNotificationTime(notification.createdAt)} · {NOTIFICATION_MODULE_LABELS[notification.module]}</small>
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
              <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-muted)', display: 'inline-block' }}>{t('Chuyển nhanh vai trò:')}</span>
              <select
                value={user.role}
                onChange={e => handleSwitchRole(e.target.value)}
                style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px', width: '115px' }}
              >
                <option value="admin">{t('Giám Đốc')}</option>
                <option value="sale">{t('Nhân Viên Sale')}</option>
                <option value="designer">{t('Thiết Kế')}</option>
                <option value="purchaser">{t('Mua Vật Tư')}</option>
                <option value="producer">{t('Sản Xuất')}</option>
                <option value="accountant">{t('Kế Toán')}</option>
              </select>
            </div>
          )}

          <div className="header-user-badge">
            <span style={{ fontWeight: 600 }}>{user.displayName}</span>
          </div>
        </div>
      </header>

      {/* APP MAIN CONTENT PORTAL */}
      <main className="app-main">
        {renderPageContent()}
      </main>
    </div>
    </PageContextProvider>
  );
}

export default AppShell;
