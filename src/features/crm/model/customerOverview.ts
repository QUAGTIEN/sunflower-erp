import type { CustomerRecord } from './crmModels';

export interface CustomerOverviewOrder {
  customerId?: string;
  deleted?: boolean;
  orderDate?: string;
  createdAt?: string;
  netAmount?: number;
  totalAmount?: number;
}

export interface CustomerOverviewInvoice {
  customerId?: string;
  deleted?: boolean;
  type?: string;
  amount?: number;
  paidAmount?: number;
}

export interface CustomerOverviewRow {
  customer: CustomerRecord;
  orderCount: number;
  orderValue: number;
  lastOrderAt: Date | null;
  daysSinceLastOrder: number | null;
  debt: number;
}

export interface CustomerOverviewProvince {
  label: string;
  rows: CustomerOverviewRow[];
}

const validDate = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const nonnegative = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export function buildCustomerOverview(
  customers: CustomerRecord[],
  orders: CustomerOverviewOrder[],
  invoices: CustomerOverviewInvoice[],
  now = new Date(),
  provinceByCustomerId: ReadonlyMap<string, string> = new Map()
) {
  const visibleIds = new Set(customers.map(customer => customer.id));
  const ordersByCustomer = new Map<string, CustomerOverviewOrder[]>();
  orders.forEach(order => {
    if (!order.customerId || !visibleIds.has(order.customerId) || order.deleted === true) return;
    const customerOrders = ordersByCustomer.get(order.customerId) || [];
    customerOrders.push(order);
    ordersByCustomer.set(order.customerId, customerOrders);
  });

  const debtByCustomer = new Map<string, number>();
  invoices.forEach(invoice => {
    if (!invoice.customerId || !visibleIds.has(invoice.customerId) || invoice.deleted === true || invoice.type !== 'receivable') return;
    const balance = Math.max(0, nonnegative(invoice.amount) - nonnegative(invoice.paidAmount));
    debtByCustomer.set(invoice.customerId, (debtByCustomer.get(invoice.customerId) || 0) + balance);
  });

  const rows: CustomerOverviewRow[] = customers.map(customer => {
    const customerOrders = ordersByCustomer.get(customer.id) || [];
    const datedOrders = customerOrders.map(order => validDate(order.orderDate) || validDate(order.createdAt))
      .filter((date): date is Date => date !== null && date.getTime() <= now.getTime());
    const lastOrderAt = datedOrders.length ? new Date(Math.max(...datedOrders.map(date => date.getTime()))) : null;
    return {
      customer,
      orderCount: customerOrders.length,
      orderValue: customerOrders.reduce((sum, order) => sum + nonnegative(order.netAmount ?? order.totalAmount), 0),
      lastOrderAt,
      daysSinceLastOrder: lastOrderAt ? Math.floor((now.getTime() - lastOrderAt.getTime()) / 86_400_000) : null,
      debt: debtByCustomer.get(customer.id) || 0
    };
  });

  const purchased = rows.filter(row => row.orderCount > 0);
  const active = purchased.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder <= 90);
  const inactive = purchased.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder > 90)
    .sort((a, b) => (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0));
  const provinceMap = new Map<string, CustomerOverviewRow[]>();
  rows.forEach(row => {
    const label = provinceByCustomerId.get(row.customer.id)?.trim() || 'Chưa xác định';
    const provinceRows = provinceMap.get(label) || [];
    provinceRows.push(row);
    provinceMap.set(label, provinceRows);
  });
  const provinces: CustomerOverviewProvince[] = [...provinceMap].map(([label, provinceRows]) => ({ label, rows: provinceRows }))
    .sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label, 'vi-VN'));

  return {
    rows,
    customerCount: rows.length,
    purchasedCount: purchased.length,
    neverOrderedCount: rows.length - purchased.length,
    activeCount: active.length,
    inactiveCount: inactive.length,
    unknownLastOrderCount: purchased.length - active.length - inactive.length,
    debtCount: rows.filter(row => row.debt > 0).length,
    inactiveAgeCounts: [
      inactive.filter(row => (row.daysSinceLastOrder || 0) <= 180).length,
      inactive.filter(row => (row.daysSinceLastOrder || 0) >= 181 && (row.daysSinceLastOrder || 0) <= 365).length,
      inactive.filter(row => (row.daysSinceLastOrder || 0) > 365).length
    ],
    inactive,
    provinces,
    highestValue: [...purchased].sort((a, b) => b.orderValue - a.orderValue || a.customer.companyName.localeCompare(b.customer.companyName, 'vi-VN')).slice(0, 5),
    mostOrders: [...purchased].sort((a, b) => b.orderCount - a.orderCount || b.orderValue - a.orderValue).slice(0, 5)
  };
}
