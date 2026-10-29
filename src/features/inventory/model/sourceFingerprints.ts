import { itemIdentity } from '../../production/model/productionOrder.js';

type Data = Record<string, unknown>;
const rows = (value: unknown): Data[] => (Array.isArray(value) ? (value as Data[]) : []);

/*
 * The fields that make up a source fingerprint. The servers hash them when they record state; reports hash them again
 * to tell whether an order or purchase changed after its goods were counted, so both sides must build the same input.
 */

export const sourceRows = (type: 'purchase' | 'production', data: Data): Data[] =>
  Array.isArray(data[type === 'purchase' ? 'items' : 'materials'])
    ? (data[type === 'purchase' ? 'items' : 'materials'] as Data[])
    : [];
export const sourceLine = (type: 'purchase' | 'production', row: Data, index: number) =>
  type === 'purchase' ? `line-${index}` : String(row.id || '');
export const rawSourceFingerprintInput = (type: 'purchase' | 'production', data: Data) => ({
  type,
  supplierId: data.supplierId || '',
  poId: data.poId || data.linkedPoId || '',
  requestId: data.procurementRequestId || '',
  rows: sourceRows(type, data).map((row, index) => ({
    id: sourceLine(type, row, index),
    name: row.materialName || row.productName || row.name || '',
    sourceItemId: row.poItemId || row.itemId || '',
    code: row.productCode || row.code || '',
    width: row.width || '',
    size: row.size || '',
    specifications: row.specifications || null,
    allowancePercent: row.allowancePercent || 0,
    unit: row.unit,
    quantity: row.quantity,
    catalogItemId: row.catalogItemId || '',
    catalog: row.catalog || null
  }))
});

export const poFingerprintInput = (po: Data) => ({
  customerId: po.customerId || '',
  rows: rows(po.items).map((row, index) => ({
    id: itemIdentity(row, index),
    name: row.productName || '',
    code: row.productCode || '',
    quantity: row.quantity,
    unit: row.unit,
    size: row.size || '',
    material: row.material || '',
    specifications: row.specifications || {}
  }))
});
export const goodsSourceFingerprintInput = (source: Data, type: 'production' | 'purchase') => ({
  type,
  poId: source.poId || source.linkedPoId || '',
  supplierId: source.supplierId || '',
  lines: rows(source[type === 'production' ? 'lines' : 'items']).map((row, index) => ({
    id: type === 'production' ? row.lineId || row.itemId : `line-${index}`,
    ...(type === 'production' && row.poId ? { linePoId: row.poId } : {}),
    poItemId: row.poItemId || '',
    name: row.productName || '',
    unit: row.unit,
    quantity: row.quantity,
    goodQuantity: row.goodQuantity ?? null,
    ...(type === 'production' && Number(row.surplusQuantity) > 0
      ? { surplusQuantity: Number(row.surplusQuantity) }
      : {}),
    catalog: type === 'production' ? row.catalog || null : null,
    size: row.size || ''
  }))
});
