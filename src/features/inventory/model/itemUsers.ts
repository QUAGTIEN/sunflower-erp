import { catalogSources, normalizeCatalogCode } from '../../catalog/model/itemCatalog.js';
import type { WarehouseCustomerUsage } from './warehouse.js';

type Data = Record<string, unknown>;
interface UsageCustomer {
  id: string;
  name: string;
}

const linesOf = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);
const customerOf = (record: Data | undefined): UsageCustomer => ({
  id: String(record?.customerId || ''),
  name: String(record?.customerName || '')
});
/** An order may mix customers (D-LSX2): its lines name their own, older orders only the order's. */
function orderCustomers(cmd: Data): UsageCustomer[] {
  const fromLines = linesOf(cmd.lines)
    .map(customerOf)
    .filter(customer => customer.name);
  const customers = fromLines.length ? fromLines : [customerOf(cmd)];
  return [...new Map(customers.map(customer => [customer.id || customer.name, customer])).values()];
}

/**
 * Customers shown as using a catalog item: from LSX materials and lines, posted stock vouchers, confirmed
 * customer-product links and the customer's own product declarations. Shared by the server and the live page.
 */
export function buildItemUsers(
  catalogItems: (Data & { id: string })[],
  vouchers: (Data & { id: string })[],
  commands: (Data & { id: string })[],
  customers: (Data & { id: string })[],
  links: (Data & { id: string })[]
): Record<string, WarehouseCustomerUsage[]> {
  const usageMap = new Map<string, Map<string, { customerId: string; customerName: string; sources: Set<string> }>>();
  const addUsage = (catalogItemId: string, customerId: string, customerName: string, sourceLabel: string) => {
    const cleanId = catalogItemId.trim();
    const cleanName = customerName.trim();
    const custKey = customerId.trim() || cleanName;
    if (!cleanId || !custKey || !cleanName) return;
    let byCustomer = usageMap.get(cleanId);
    if (!byCustomer) {
      byCustomer = new Map();
      usageMap.set(cleanId, byCustomer);
    }
    let entry = byCustomer.get(custKey);
    if (!entry) {
      entry = { customerId: customerId.trim(), customerName: cleanName, sources: new Set() };
      byCustomer.set(custKey, entry);
    }
    if (sourceLabel) entry.sources.add(sourceLabel);
  };
  const commandMap = new Map(commands.map(cmd => [cmd.id, cmd]));
  const codeToCatalogId = new Map<string, string>();
  for (const item of catalogItems) {
    if (typeof item.code === 'string' && item.code.trim()) {
      codeToCatalogId.set(normalizeCatalogCode(item.code), item.id);
    }
  }
  for (const cmd of commands) {
    if (cmd.deleted || cmd.status === 'cancelled') continue;
    const lsxCode = String(cmd.lsxCode || cmd.id);
    const customers = orderCustomers(cmd);
    // Planned materials serve the whole order, so they count for every customer in it.
    for (const mat of linesOf(cmd.materials)) {
      const catId = String(mat.catalogItemId || (mat.catalog as Data | undefined)?.id || '');
      for (const customer of customers) if (catId) addUsage(catId, customer.id, customer.name, `LSX ${lsxCode}`);
    }
    for (const line of linesOf(cmd.lines)) {
      const catId = String((line.catalog as Data | undefined)?.id || '');
      const customer = line.customerName ? customerOf(line) : customerOf(cmd);
      if (catId) addUsage(catId, customer.id, customer.name, `LSX ${lsxCode}`);
    }
  }
  for (const voucher of vouchers) {
    if (voucher.reversedBy || voucher.kind === 'reversal') continue;
    const cmd = voucher.sourceType === 'production' ? commandMap.get(String(voucher.sourceId || '')) : undefined;
    // A material voucher of a mixed-customer order names no single customer; it serves each of them.
    const customers =
      cmd && !voucher.customerId
        ? orderCustomers(cmd)
        : [{ id: String(voucher.customerId || ''), name: String(voucher.customerName || cmd?.customerName || '') }];
    const label = String(voucher.sourceCode || voucher.code || '');
    for (const line of linesOf(voucher.lines)) {
      const catId = String(line.catalogItemId || '');
      for (const customer of customers) if (catId) addUsage(catId, customer.id, customer.name, label);
    }
  }
  const activeCustomers = customers.filter(c => !c.deleted);
  const customerMap = new Map(activeCustomers.map(c => [c.id, c]));
  const customerProductSources = catalogSources('customer_product', activeCustomers);
  for (const link of links) {
    const source = link.source as Data | undefined;
    if (source?.type !== 'customer_product') continue;
    const matched = customerProductSources.find(s => s.key === link.sourceKey);
    const cust = customerMap.get(String(source.documentId || ''));
    if (!matched || !cust) continue;
    const customerName = String(cust.companyName || cust.customerName || cust.name || '');
    addUsage(String(link.catalogItemId || ''), cust.id, customerName, `SP ${matched.code || matched.name}`);
  }
  for (const cust of activeCustomers) {
    const customerName = String(cust.companyName || cust.customerName || cust.name || '');
    if (!customerName || !Array.isArray(cust.products)) continue;
    for (const prod of cust.products as Data[]) {
      if (!prod || prod.deleted) continue;
      const specs = prod.specifications && typeof prod.specifications === 'object' ? (prod.specifications as Data) : {};
      const candidates = [prod.productCode, prod.material, specs.paperCode].filter(
        v => typeof v === 'string' && v.trim()
      ) as string[];
      for (const code of candidates) {
        const catId = codeToCatalogId.get(normalizeCatalogCode(code));
        if (catId)
          addUsage(catId, cust.id, customerName, `Khai báo SP ${prod.productCode || prod.productName || code}`);
      }
    }
  }
  return Object.fromEntries(
    [...usageMap.entries()].map(([catId, byCust]) => [
      catId,
      [...byCust.values()].map(entry => ({
        customerId: entry.customerId,
        customerName: entry.customerName,
        sources: [...entry.sources]
      }))
    ])
  );
}
