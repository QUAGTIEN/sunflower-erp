import { catalogSources, normalizeCatalogCode } from '../../catalog/model/itemCatalog.js';
import type { WarehouseCustomerUsage } from './warehouse.js';

type Data = Record<string, unknown>;

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
    const customerId = String(cmd.customerId || '');
    const customerName = String(cmd.customerName || '');
    const lsxCode = String(cmd.lsxCode || cmd.id);
    if (!customerName) continue;
    for (const mat of Array.isArray(cmd.materials) ? (cmd.materials as Data[]) : []) {
      const catId = String(mat.catalogItemId || (mat.catalog as Data | undefined)?.id || '');
      if (catId) addUsage(catId, customerId, customerName, `LSX ${lsxCode}`);
    }
    for (const line of Array.isArray(cmd.lines) ? (cmd.lines as Data[]) : []) {
      const catId = String((line.catalog as Data | undefined)?.id || '');
      if (catId) addUsage(catId, customerId, customerName, `LSX ${lsxCode}`);
    }
  }
  for (const voucher of vouchers) {
    if (voucher.reversedBy || voucher.kind === 'reversal') continue;
    const cmd = voucher.sourceType === 'production' ? commandMap.get(String(voucher.sourceId || '')) : undefined;
    const customerId = String(voucher.customerId || cmd?.customerId || '');
    const customerName = String(voucher.customerName || cmd?.customerName || '');
    if (!customerName) continue;
    const label = String(voucher.sourceCode || voucher.code || '');
    for (const line of Array.isArray(voucher.lines) ? (voucher.lines as Data[]) : []) {
      const catId = String(line.catalogItemId || '');
      if (catId) addUsage(catId, customerId, customerName, label);
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
