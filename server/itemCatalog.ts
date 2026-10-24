import { createHash } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  canManageItemCatalog,
  catalogSources,
  conversionFactor,
  normalizeCatalogCode,
  normalizeUnit,
  sourceKey,
  validateCatalogInput,
  validateCatalogUpdate,
  type CatalogActor,
  type CatalogInput,
  type CatalogItem,
  type CatalogLink,
  type CatalogSourceRef
} from '../src/features/catalog/model/itemCatalog.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const itemId = (input: CatalogInput) => `itm-${hash(normalizeCatalogCode(input.code))}`;
export const catalogLinkDocumentId = (source: CatalogSourceRef) => `link-${hash(sourceKey(source))}`;
const revisionMatches = (value: unknown, revision: number) => Number.isInteger(value) && value === revision;
const id = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(value))
    throw new AdminApiError(400, 'Định danh yêu cầu không hợp lệ.');
  return value;
};
function sourceRef(value: unknown): CatalogSourceRef {
  const raw = value as Partial<CatalogSourceRef> | null;
  if (
    !raw ||
    !['inventory', 'customer_product', 'po_item'].includes(String(raw.type)) ||
    typeof raw.documentId !== 'string' ||
    !raw.documentId ||
    raw.documentId.length > 200 ||
    raw.documentId.includes('/') ||
    Array.from(raw.documentId).some(char => char.charCodeAt(0) < 32) ||
    typeof raw.rowKey !== 'string' ||
    raw.rowKey.length > 240
  )
    throw new AdminApiError(400, 'Nguồn liên kết không hợp lệ.');
  return { type: raw.type!, documentId: raw.documentId, rowKey: raw.rowKey };
}
export async function manageItemCatalog(
  actor: CatalogActor & { uid: string; displayName: string },
  body: Record<string, unknown>
) {
  if (!canManageItemCatalog(actor)) throw new AdminApiError(403, 'Bạn không có quyền quản lý danh mục hàng.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 250_000)
    throw new AdminApiError(400, 'Yêu cầu quá lớn. Mỗi đợt tối đa 50 mã hàng.');
  const action = body.action;
  if (!['create', 'update', 'import', 'link'].includes(String(action)))
    throw new AdminApiError(400, 'Thao tác danh mục không hợp lệ.');
  const requestId = id(body.requestId);
  const digest = hash(JSON.stringify(body));
  const { firestore } = getFirebaseAdminServices();
  const requestRef = firestore.collection('catalog_requests').doc(requestId);
  const auditRef = firestore.collection('audit_events').doc();
  const now = new Date().toISOString();
  return firestore.runTransaction(async tx => {
    const acknowledged = await tx.get(requestRef);
    if (acknowledged.exists) {
      if (acknowledged.data()?.digest !== digest || acknowledged.data()?.actorId !== actor.uid)
        throw new AdminApiError(409, 'Mã yêu cầu đã dùng cho nội dung khác.');
      return acknowledged.data()!.result as { success: boolean; ids: string[]; requestId: string };
    }
    let inputs: CatalogInput[] = [];
    if (action === 'import') {
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50)
        throw new AdminApiError(400, 'Mỗi đợt cần 1–50 mã hàng.');
      inputs = body.items.map(value => validateCatalogInput(value as Record<string, unknown>));
    } else if (action !== 'link') inputs = [validateCatalogInput(body.item as Record<string, unknown>)];
    const ids = inputs.map(itemId);
    if (new Set(ids).size !== ids.length) throw new AdminApiError(400, 'Mã nội bộ trùng trong đợt nhập.');
    const targets = await Promise.all(ids.map(key => tx.get(firestore.collection('item_catalog').doc(key))));
    const writes: Array<{ item: CatalogItem; key: string }> = [];
    for (let i = 0; i < inputs.length; i++) {
      const previous = targets[i].exists ? ({ ...targets[i].data(), id: targets[i].id } as CatalogItem) : undefined;
      if (action === 'update') {
        if (body.id !== ids[i] || !previous)
          throw new AdminApiError(404, 'Không tìm thấy mã hàng. Không được thay mã đã tạo.');
        if (!revisionMatches(body.expectedRevision, previous.revision))
          throw new AdminApiError(409, 'Mã hàng vừa thay đổi. Tải lại trước khi lưu.');
        validateCatalogUpdate(previous, inputs[i]);
        if (typeof body.active !== 'boolean') throw new AdminApiError(400, 'Trạng thái mã hàng không hợp lệ.');
      } else if (previous)
        throw new AdminApiError(409, `Mã ${inputs[i].code} đã tồn tại, kể cả mã ngừng sử dụng. Không ghi đè.`);
      const item: CatalogItem = {
        ...inputs[i],
        id: ids[i],
        normalizedCode: normalizeCatalogCode(inputs[i].code),
        active: action === 'update' ? (body.active as boolean) : true,
        revision: (previous?.revision || 0) + 1,
        createdAt: previous?.createdAt || now,
        updatedAt: now
      };
      writes.push({ item, key: ids[i] });
    }
    let linkWrite: { key: string; data: CatalogLink & Record<string, unknown> } | undefined;
    let previousLink: Record<string, unknown> | null = null;
    if (action === 'link' || body.source !== undefined) {
      if (action !== 'link' && action !== 'create')
        throw new AdminApiError(400, 'Chỉ tạo mới hoặc liên kết mới được xác nhận nguồn.');
      const source = sourceRef(body.source);
      const collection = { inventory: 'inventory', customer_product: 'customers', po_item: 'pos' }[source.type];
      const sourceDoc = await tx.get(firestore.collection(collection).doc(source.documentId));
      if (!sourceDoc.exists) throw new AdminApiError(404, 'Hồ sơ nguồn không còn tồn tại.');
      const candidate = catalogSources(source.type, [{ ...sourceDoc.data(), id: source.documentId }]).find(
        row => row.key === sourceKey(source)
      );
      if (!candidate || candidate.problem)
        throw new AdminApiError(400, candidate?.problem || 'Không tìm thấy dòng nguồn đang hoạt động.');
      if (body.sourceFingerprint !== candidate.fingerprint)
        throw new AdminApiError(409, 'Thông tin nguồn đã thay đổi. Tải lại và đối chiếu trước khi liên kết.');
      const key = catalogLinkDocumentId(source);
      const previous = await tx.get(firestore.collection('catalog_links').doc(key));
      previousLink = previous.exists ? previous.data()! : null;
      if (!revisionMatches(body.expectedLinkRevision, previous.exists ? Number(previous.data()!.revision) : 0))
        throw new AdminApiError(409, 'Liên kết vừa thay đổi. Tải lại trước khi xác nhận.');
      const targetId = action === 'create' ? ids[0] : id(body.catalogItemId);
      const targetSnapshot =
        action === 'link' ? await tx.get(firestore.collection('item_catalog').doc(targetId)) : undefined;
      const target =
        action === 'create'
          ? writes[0].item
          : targetSnapshot?.exists
            ? ({ ...targetSnapshot.data(), id: targetId } as CatalogItem)
            : undefined;
      if (!target?.active) throw new AdminApiError(400, 'Chọn mã hàng đang sử dụng.');
      if (source.type === 'inventory' && target.kind !== 'raw_material')
        throw new AdminApiError(400, 'Vật tư kho hiện tại cần liên kết vào mã Nguyên vật liệu.');
      const factor = conversionFactor(target, candidate.unit);
      linkWrite = {
        key,
        data: {
          id: key,
          source,
          sourceKey: candidate.key,
          sourceFingerprint: candidate.fingerprint,
          catalogItemId: target.id,
          sourceUnit: normalizeUnit(candidate.unit),
          baseUnit: target.baseUnit,
          factor,
          sourceCode: candidate.code,
          sourceName: candidate.name,
          sourceLabel: candidate.label,
          revision: previous.exists ? Number(previous.data()!.revision) + 1 : 1,
          updatedAt: now,
          updatedById: actor.uid
        }
      };
      if (action === 'link') ids.push(target.id);
    }
    // Everything above is read/validate only. Duplicate codes or a stale link abort the entire batch.
    for (const write of writes)
      tx.set(firestore.collection('item_catalog').doc(write.key), { ...write.item, updatedById: actor.uid });
    if (linkWrite) tx.set(firestore.collection('catalog_links').doc(linkWrite.key), linkWrite.data);
    const result = { success: true, ids, requestId };
    tx.set(requestRef, {
      action,
      digest,
      actorId: actor.uid,
      actorName: actor.displayName,
      createdAt: now,
      result,
      count: ids.length
    });
    tx.set(auditRef, {
      actorId: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      category: 'catalog',
      module: 'inventory',
      action: `catalog_${action}`,
      summary: `${action}: ${ids.length} mã hàng`,
      targetType: 'item_catalog',
      targetId: ids[0],
      targetLabel: writes[0]?.item.code || ids[0],
      sourceKey: linkWrite?.data.sourceKey || '',
      previousLink,
      nextLink: linkWrite?.data || null,
      requestId,
      createdAt: now,
      occurredAt: now,
      sessionId: 'catalog-api'
    });
    return result;
  });
}
