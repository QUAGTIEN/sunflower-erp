const CLEAN_SLATE_STORAGE_KEY = 'erp_clean_slate_reset_v2';

const STALE_LOCAL_DATA_KEYS = [
  'erp_customers',
  'erp_pos',
  'erp_designs',
  'erp_suppliers',
  'erp_purchase_orders',
  'erp_production_commands',
  'erp_deliveries',
  'erp_delivery_vehicles',
  'erp_invoices',
  'erp_inventory',
  'erp_users',
  'erp_current_user'
] as const;

export const resetStaleLocalDataOnce = (): void => {
  if (localStorage.getItem(CLEAN_SLATE_STORAGE_KEY)) return;

  STALE_LOCAL_DATA_KEYS.forEach(key => localStorage.removeItem(key));
  localStorage.setItem(CLEAN_SLATE_STORAGE_KEY, 'true');
};
