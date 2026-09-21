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
  ordersLast12Months: number;
  orderValue: number;
  lastOrderAt: Date | null;
  daysSinceLastOrder: number | null;
  debt: number;
}

export interface CustomerOverviewMonth {
  key: string;
  label: string;
  orderCount: number;
  customerCount: number;
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
  now = new Date()
) {
  const startOfLast12Months = new Date(now);
  startOfLast12Months.setFullYear(startOfLast12Months.getFullYear() - 1);
  const months: CustomerOverviewMonth[] = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, label: `T${date.getMonth() + 1}`, orderCount: 0, customerCount: 0 };
  });
  const monthByKey = new Map(months.map(month => [month.key, month]));
  const customersByMonth = new Map(months.map(month => [month.key, new Set<string>()]));
  const visibleIds = new Set(customers.map(customer => customer.id));
  const ordersByCustomer = new Map<string, CustomerOverviewOrder[]>();
  orders.forEach(order => {
    if (!order.customerId || !visibleIds.has(order.customerId) || order.deleted === true) return;
    const customerOrders = ordersByCustomer.get(order.customerId) || [];
    customerOrders.push(order);
    ordersByCustomer.set(order.customerId, customerOrders);
    const orderDate = validDate(order.orderDate) || validDate(order.createdAt);
    if (!orderDate || orderDate.getTime() > now.getTime()) return;
    const key = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    const month = monthByKey.get(key);
    if (!month) return;
    month.orderCount += 1;
    customersByMonth.get(key)?.add(order.customerId);
  });
  months.forEach(month => { month.customerCount = customersByMonth.get(month.key)?.size || 0; });
  const debtByCustomer = new Map<string, number>();
  invoices.forEach(invoice => {
    if (!invoice.customerId || !visibleIds.has(invoice.customerId) || invoice.deleted === true || invoice.type !== 'receivable') return;
    const balance = Math.max(0, nonnegative(invoice.amount) - nonnegative(invoice.paidAmount));
    debtByCustomer.set(invoice.customerId, (debtByCustomer.get(invoice.customerId) || 0) + balance);
  });

  const rows: CustomerOverviewRow[] = customers.map(customer => {
    const customerOrders = ordersByCustomer.get(customer.id) || [];
    const dates = customerOrders.map(order => validDate(order.orderDate) || validDate(order.createdAt))
      .filter((date): date is Date => date !== null && date.getTime() <= now.getTime());
    const lastOrderAt = dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))) : null;
    return {
      customer,
      orderCount: customerOrders.length,
      ordersLast12Months: dates.filter(date => date >= startOfLast12Months).length,
      orderValue: customerOrders.reduce((sum, order) => sum + nonnegative(order.netAmount ?? order.totalAmount), 0),
      lastOrderAt,
      daysSinceLastOrder: lastOrderAt ? Math.floor((now.getTime() - lastOrderAt.getTime()) / 86_400_000) : null,
      debt: debtByCustomer.get(customer.id) || 0
    };
  });
  const purchased = rows.filter(row => row.orderCount > 0);
  const byValue = [...purchased].sort((a, b) => b.orderValue - a.orderValue || a.customer.companyName.localeCompare(b.customer.companyName, 'vi-VN'));
  const datedPurchases = rows.filter(row => row.orderCount > 0 && row.daysSinceLastOrder !== null);
  return {
    rows,
    months,
    customerCount: rows.length,
    purchasedCount: purchased.length,
    neverOrderedCount: rows.length - purchased.length,
    totalOrderValue: rows.reduce((sum, row) => sum + row.orderValue, 0),
    activeCount: datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder <= 90).length,
    inactiveCount: datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder > 90).length,
    purchaseAgeBuckets: [
      datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder <= 30).length,
      datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder >= 31 && row.daysSinceLastOrder <= 60).length,
      datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder >= 61 && row.daysSinceLastOrder <= 90).length,
      datedPurchases.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder > 90).length
    ],
    unknownLastOrderCount: purchased.length - datedPurchases.length,
    debtCount: rows.filter(row => row.debt > 0).length,
    totalDebt: rows.reduce((sum, row) => sum + row.debt, 0),
    frequentCount: rows.filter(row => row.ordersLast12Months >= 3).length,
    occasionalCount: rows.filter(row => row.ordersLast12Months >= 1 && row.ordersLast12Months <= 2).length,
    noRecentOrdersCount: rows.filter(row => row.ordersLast12Months === 0).length,
    highestValue: byValue.slice(0, 5),
    lowestValue: byValue.slice(-5).reverse(),
    highestDebt: [...rows].filter(row => row.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 3),
    frequent: [...rows].sort((a, b) => b.ordersLast12Months - a.ordersLast12Months || b.orderCount - a.orderCount),
    inactive: rows.filter(row => row.daysSinceLastOrder !== null && row.daysSinceLastOrder > 90)
      .sort((a, b) => (b.daysSinceLastOrder || 0) - (a.daysSinceLastOrder || 0))
  };
}
