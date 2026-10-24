import type { Firestore, Transaction, DocumentSnapshot } from 'firebase-admin/firestore';
import { isDeepStrictEqual } from 'node:util';
import {
  catalogSources,
  conversionFactor,
  normalizeUnit,
  type CatalogItem,
  type CatalogLink,
  type CatalogSource
} from '../src/features/catalog/model/itemCatalog.js';
import {
  itemIdentity,
  type PlannedMaterial,
  type ProductionCatalogSnapshot,
  type ProductionLine,
  type ProductionPO
} from '../src/features/production/model/productionOrder.js';
import { catalogLinkDocumentId } from './itemCatalog.js';

export function productionCatalogReader(tx: Transaction, firestore: Firestore, po: ProductionPO) {
  const cache = new Map<string, Promise<DocumentSnapshot>>();
  const read = (collection: string, id: string) => {
    const key = `${collection}/${id}`;
    if (!cache.has(key)) cache.set(key, tx.get(firestore.collection(collection).doc(id)));
    return cache.get(key)!;
  };
  const sources = catalogSources('po_item', [po]);
  const snapshot = (item: CatalogItem, unit: string, link?: CatalogLink): ProductionCatalogSnapshot => ({
    id: item.id,
    code: item.code,
    name: item.name,
    baseUnit: item.baseUnit,
    sourceUnit: normalizeUnit(unit),
    factor: conversionFactor(item, unit),
    revision: item.revision,
    ...(link ? { linkId: link.id, linkRevision: link.revision } : {})
  });
  const target = async (id: string): Promise<CatalogItem> => {
    if (!/^itm-[a-f0-9]{64}$/.test(id)) throw new Error('Định danh mã nội bộ không hợp lệ.');
    const doc = await read('item_catalog', id);
    if (!doc.exists || doc.data()?.active !== true)
      throw new Error('Mã nội bộ không còn hoạt động. Cần đối chiếu danh mục trước khi lưu/phát hành.');
    return { ...doc.data(), id: doc.id } as CatalogItem;
  };
  const linked = async (source: CatalogSource, unit: string) => {
    const doc = await read('catalog_links', catalogLinkDocumentId(source.ref));
    if (!doc.exists) return undefined;
    const link = { ...doc.data(), id: doc.id } as CatalogLink;
    if (
      source.problem ||
      link.sourceFingerprint !== source.fingerprint ||
      link.sourceKey !== source.key ||
      link.sourceUnit !== normalizeUnit(unit)
    )
      throw new Error(`Liên kết mã của ${source.name} đã thay đổi hoặc cần đối chiếu lại trong Danh mục hàng.`);
    return snapshot(await target(link.catalogItemId), unit, link);
  };
  const lineCatalog = async (index: number) => {
    const row = po.items![index];
    const source = sources.find(source => source.ref.rowKey === (row.itemId ? `id:${row.itemId}` : `index:${index}`));
    if (!source) return undefined;
    const direct = await linked(source, String(row.unit || ''));
    if (direct) return direct;
    // Only inherit a customer-product mapping when the PO still carries the exact catalog version.
    // Manual rows and older snapshots without a version need an explicit per-PO mapping.
    if (!row.customerProductId || !row.customerProductVersion || !po.customerId) return undefined;
    const doc = await read('customers', String(po.customerId));
    if (!doc.exists || doc.data()?.deleted) return undefined;
    const product = (Array.isArray(doc.data()?.products) ? doc.data()!.products : []).find(
      (entry: Record<string, unknown>) => entry.id === row.customerProductId && !entry.deleted
    ) as Record<string, unknown> | undefined;
    if (
      !product ||
      String(row.customerProductVersion) !==
        String(product.catalogRevision || product.updatedAt || product.createdAt || '0')
    )
      return undefined;
    if (
      ['productCode', 'productName', 'productType', 'unit', 'material', 'size'].some(
        key => String(row[key] || '') !== String(product[key] || '')
      ) ||
      !isDeepStrictEqual(row.specifications || {}, product.specifications || {})
    )
      return undefined;
    const customerSource = catalogSources('customer_product', [{ ...doc.data(), id: String(po.customerId) }]).find(
      source => source.ref.rowKey === `id:${row.customerProductId}`
    );
    return customerSource ? linked(customerSource, String(row.unit || '')) : undefined;
  };
  return {
    async line(line: ProductionLine): Promise<ProductionLine> {
      const index = (po.items || []).findIndex((row, index) => itemIdentity(row, index) === line.itemId);
      const catalog = await lineCatalog(index);
      const next = { ...line };
      delete next.catalog;
      return { ...next, ...(catalog ? { catalog } : {}) };
    },
    async material(material: PlannedMaterial): Promise<PlannedMaterial> {
      if (!material.catalogItemId) return material;
      const item = await target(material.catalogItemId);
      if (item.kind !== 'raw_material') throw new Error('Vật tư dự kiến phải chọn mã Nguyên vật liệu.');
      return { ...material, code: item.code, name: item.name, catalog: snapshot(item, material.unit) };
    },
    async options() {
      const materials = await tx.get(firestore.collection('item_catalog').where('kind', '==', 'raw_material'));
      const lines: Record<string, { catalog?: ProductionCatalogSnapshot; error?: string }> = {};
      for (let index = 0; index < (po.items || []).length; index++) {
        try {
          lines[itemIdentity(po.items![index], index)] = { catalog: await lineCatalog(index) };
        } catch (cause) {
          lines[itemIdentity(po.items![index], index)] = {
            error: cause instanceof Error ? cause.message : 'Cần đối chiếu liên kết mã.'
          };
        }
      }
      return {
        materials: materials.docs
          .filter(doc => doc.data().active === true)
          .map(doc => ({ ...doc.data(), id: doc.id }) as CatalogItem),
        lines
      };
    }
  };
}
