import { normalizeCustomerRecords, normalizeLeadRecords } from '@/features/crm/model/crmModels';
import { normalizeLeadCandidateRecords } from '@/features/crm/model/leadCandidateModels';
import { normalizeNotificationRecords } from '@/domain/notificationModels';
import { normalizeProcurementRequests, normalizeSupplierRecords } from '@/features/procurement/model/purchaseModels';
import { normalizeWorkScheduleRecords } from '@/features/work-schedule/model/workScheduleModels';
import { canonicalizeVietnamProvince } from '@/data/vietnamProvinceCatalog';
import {
  DEFAULT_CHANNELS,
  DEFAULT_CUSTOMERS,
  DEFAULT_DELIVERIES,
  DEFAULT_DELIVERY_VEHICLES,
  DEFAULT_DESIGNS,
  DEFAULT_INVENTORY,
  DEFAULT_INVOICES,
  DEFAULT_POS,
  DEFAULT_PRODUCTION_COMMANDS,
  DEFAULT_PRODUCT_CLASSIFICATIONS,
  DEFAULT_PURCHASE_ORDERS,
  DEFAULT_SUPPLIERS,
  DEFAULT_USERS,
  DEFAULT_WIND_DIRECTIONS
} from '@/data/seeds/erpSeedData';

export const initializeLocalStorage = () => {
  if (!localStorage.getItem('erp_users')) {
    localStorage.setItem('erp_users', JSON.stringify(DEFAULT_USERS));
  }

  if (!localStorage.getItem('erp_channels')) {
    localStorage.setItem('erp_channels', JSON.stringify(DEFAULT_CHANNELS));
  }

  if (!localStorage.getItem('erp_reminders')) {
    localStorage.setItem('erp_reminders', JSON.stringify([]));
  }

  let customers = localStorage.getItem('erp_customers') ? JSON.parse(localStorage.getItem('erp_customers')!) : [];
  DEFAULT_CUSTOMERS.forEach(defCust => {
    if (!customers.some((c: any) => c.id === defCust.id)) {
      customers.push(defCust);
    }
  });
  localStorage.setItem('erp_customers', JSON.stringify(normalizeCustomerRecords(customers)));

  const leads = localStorage.getItem('erp_leads') ? JSON.parse(localStorage.getItem('erp_leads')!) : [];
  localStorage.setItem('erp_leads', JSON.stringify(normalizeLeadRecords(leads)));

  const notifications = localStorage.getItem('erp_notifications')
    ? JSON.parse(localStorage.getItem('erp_notifications')!)
    : [];
  localStorage.setItem('erp_notifications', JSON.stringify(normalizeNotificationRecords(notifications)));

  let suppliers = localStorage.getItem('erp_suppliers') ? JSON.parse(localStorage.getItem('erp_suppliers')!) : [];
  DEFAULT_SUPPLIERS.forEach(defSup => {
    if (!suppliers.some((s: any) => s.id === defSup.id)) {
      suppliers.push(defSup);
    }
  });
  localStorage.setItem('erp_suppliers', JSON.stringify(normalizeSupplierRecords(suppliers)));

  const procurementRequests = localStorage.getItem('erp_procurement_requests')
    ? JSON.parse(localStorage.getItem('erp_procurement_requests')!)
    : [];
  localStorage.setItem('erp_procurement_requests', JSON.stringify(normalizeProcurementRequests(procurementRequests)));

  let pos = localStorage.getItem('erp_pos') ? JSON.parse(localStorage.getItem('erp_pos')!) : [];
  DEFAULT_POS.forEach(defPo => {
    if (!pos.some((p: any) => p.id === defPo.id)) {
      pos.push(defPo);
    }
  });
  localStorage.setItem('erp_pos', JSON.stringify(pos));

  let purchaseOrders = localStorage.getItem('erp_purchase_orders')
    ? JSON.parse(localStorage.getItem('erp_purchase_orders')!)
    : [];
  DEFAULT_PURCHASE_ORDERS.forEach(defPur => {
    if (!purchaseOrders.some((p: any) => p.id === defPur.id)) {
      purchaseOrders.push(defPur);
    }
  });
  localStorage.setItem('erp_purchase_orders', JSON.stringify(purchaseOrders));

  if (!localStorage.getItem('erp_designs')) localStorage.setItem('erp_designs', JSON.stringify(DEFAULT_DESIGNS));
  if (!localStorage.getItem('erp_design_requests')) localStorage.setItem('erp_design_requests', '[]');
  if (!localStorage.getItem('erp_inventory')) localStorage.setItem('erp_inventory', JSON.stringify(DEFAULT_INVENTORY));
  if (!localStorage.getItem('erp_production_commands'))
    localStorage.setItem('erp_production_commands', JSON.stringify(DEFAULT_PRODUCTION_COMMANDS));
  if (!localStorage.getItem('erp_deliveries'))
    localStorage.setItem('erp_deliveries', JSON.stringify(DEFAULT_DELIVERIES));
  if (!localStorage.getItem('erp_delivery_vehicles'))
    localStorage.setItem('erp_delivery_vehicles', JSON.stringify(DEFAULT_DELIVERY_VEHICLES));
  if (!localStorage.getItem('erp_invoices')) localStorage.setItem('erp_invoices', JSON.stringify(DEFAULT_INVOICES));

  if (!localStorage.getItem('erp_product_classifications')) {
    localStorage.setItem('erp_product_classifications', JSON.stringify(DEFAULT_PRODUCT_CLASSIFICATIONS));
  }
  if (!localStorage.getItem('erp_wind_directions')) {
    localStorage.setItem('erp_wind_directions', JSON.stringify(DEFAULT_WIND_DIRECTIONS));
  }
};

type CollectionCallback = (data: any[]) => void;

const subscribers: Record<string, CollectionCallback[]> = {};

export const normalizeCollectionRecords = <T>(colName: string, data: T[]): T[] => {
  if (colName === 'customers') {
    return normalizeCustomerRecords(data) as T[];
  }
  if (colName === 'leads') {
    return normalizeLeadRecords(data) as T[];
  }
  if (colName === 'lead_candidates') {
    return normalizeLeadCandidateRecords(data) as T[];
  }
  if (colName === 'suppliers') {
    return normalizeSupplierRecords(data) as T[];
  }
  if (colName === 'procurement_requests') {
    return normalizeProcurementRequests(data) as T[];
  }
  if (colName === 'notifications') {
    return normalizeNotificationRecords(data) as T[];
  }
  if (colName === 'work_schedule_items') {
    return normalizeWorkScheduleRecords(data) as T[];
  }
  return data;
};

const PROVINCE_COLLECTIONS = new Set(['customers', 'leads', 'lead_candidates', 'suppliers']);

export const normalizeCollectionUpdate = <T extends Record<string, unknown>>(colName: string, fields: T): T => {
  if (!PROVINCE_COLLECTIONS.has(colName) || (!('province' in fields) && !('provinceId' in fields))) return fields;
  const canonicalProvince = canonicalizeVietnamProvince(fields.province, fields.provinceId);
  return {
    ...fields,
    ...canonicalProvince
  };
};

export const readLocalCollection = (colName: string): any[] => {
  try {
    const data = localStorage.getItem(`erp_${colName}`);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? normalizeCollectionRecords(colName, parsed) : [];
  } catch (error) {
    console.warn(`[Local data] Could not read collection ${colName}.`, error);
    return [];
  }
};

export const readRawLocalCollection = (colName: string): any[] => {
  try {
    const data = localStorage.getItem(`erp_${colName}`);
    const parsed = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn(`[Local data] Could not read raw collection ${colName}.`, error);
    return [];
  }
};

const triggerSubscribers = (colName: string) => {
  const data = readLocalCollection(colName);
  subscribers[colName]?.forEach(callback => callback(data));
};

export const writeLocalCollection = (colName: string, data: any[], notify = true) => {
  const normalizedData = normalizeCollectionRecords(colName, data);
  localStorage.setItem(`erp_${colName}`, JSON.stringify(normalizedData));
  if (notify) triggerSubscribers(colName);
};

export const upsertLocalDocument = (colName: string, documentData: any) => {
  const list = readLocalCollection(colName);
  const index = list.findIndex((item: any) => item.id === documentData.id);

  if (index === -1) {
    list.unshift(documentData);
  } else {
    list[index] = { ...list[index], ...documentData };
  }

  writeLocalCollection(colName, list);
};

export const updateLocalDocument = (colName: string, docId: string, updatedFields: any): boolean => {
  const list = readLocalCollection(colName);
  const index = list.findIndex((item: any) => item.id === docId);
  if (index === -1) return false;

  list[index] = { ...list[index], ...updatedFields };
  writeLocalCollection(colName, list);
  return true;
};

export const deleteLocalDocument = (colName: string, docId: string): boolean => {
  const list = readLocalCollection(colName);
  const filtered = list.filter((item: any) => item.id !== docId);
  if (filtered.length === list.length) return false;

  writeLocalCollection(colName, filtered);
  return true;
};

export const subscribeLocalCollection = (colName: string, callback: CollectionCallback): (() => void) => {
  if (!subscribers[colName]) {
    subscribers[colName] = [];
  }
  subscribers[colName].push(callback);
  callback(readLocalCollection(colName));

  return () => {
    subscribers[colName] = subscribers[colName].filter(existing => existing !== callback);
  };
};
