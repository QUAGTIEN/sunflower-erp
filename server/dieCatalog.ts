import { createHash } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  canManageItemCatalog,
  formatCatalogCode,
  type CatalogActor
} from '../src/features/catalog/model/itemCatalog.js';
import { DIE_CODE_SERIES, validateDieInput, type DieRecord } from '../src/features/catalog/model/dieCatalog.js';

const requestIdOf = (value: unknown) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,180}$/.test(value))
    throw new AdminApiError(400, 'Định danh yêu cầu không hợp lệ.');
  return value;
};

/**
 * Creates or edits a die (D-DAO1) through the catalog API. Same guarantees as item writes: one transaction, the
 * request id answers a retry without writing twice, the revision blocks overwriting a newer edit, codes never change.
 */
export async function manageDie(
  actor: CatalogActor & { uid: string; displayName: string },
  body: Record<string, unknown>
) {
  if (!canManageItemCatalog(actor)) throw new AdminApiError(403, 'Bạn không có quyền quản lý danh mục dao.');
  const action = String(body.action);
  const input = validateDieInput(body.die as Record<string, unknown>);
  const requestId = requestIdOf(body.requestId);
  const digest = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const { firestore } = getFirebaseAdminServices();
  const requestRef = firestore.collection('catalog_requests').doc(requestId);
  const now = new Date().toISOString();
  return firestore.runTransaction(async tx => {
    const acknowledged = await tx.get(requestRef);
    if (acknowledged.exists) {
      if (acknowledged.data()?.digest !== digest || acknowledged.data()?.actorId !== actor.uid)
        throw new AdminApiError(409, 'Mã yêu cầu đã dùng cho nội dung khác.');
      return acknowledged.data()!.result as { success: boolean; id: string; code: string };
    }
    let die: DieRecord;
    let counterWrite: { sequence: number } | undefined;
    if (action === 'die_update') {
      const id = requestIdOf(body.id);
      const previous = await tx.get(firestore.collection('die_catalog').doc(id));
      if (!previous.exists) throw new AdminApiError(404, 'Không tìm thấy dao.');
      const stored = { ...previous.data(), id } as DieRecord;
      if (body.expectedRevision !== stored.revision)
        throw new AdminApiError(409, 'Dao vừa được cập nhật. Tải lại trước khi lưu.');
      if (typeof body.active !== 'boolean') throw new AdminApiError(400, 'Trạng thái dao không hợp lệ.');
      die = { ...stored, ...input, active: body.active, revision: stored.revision + 1, updatedAt: now };
    } else {
      const counterRef = firestore.collection('catalog_counters').doc(DIE_CODE_SERIES.key);
      const sequence = Number((await tx.get(counterRef)).data()?.sequence || 0) + 1;
      const code = formatCatalogCode(DIE_CODE_SERIES, sequence);
      counterWrite = { sequence };
      die = { ...input, id: code, code, active: true, revision: 1, createdAt: now, updatedAt: now };
    }
    const result = { success: true, id: die.id, code: die.code };
    if (counterWrite)
      tx.set(firestore.collection('catalog_counters').doc(DIE_CODE_SERIES.key), { ...counterWrite, updatedAt: now });
    tx.set(firestore.collection('die_catalog').doc(die.id), { ...die, updatedById: actor.uid });
    tx.set(requestRef, { action, digest, actorId: actor.uid, actorName: actor.displayName, createdAt: now, result });
    tx.set(firestore.collection('audit_events').doc(), {
      actorId: actor.uid,
      actorName: actor.displayName,
      actorRole: actor.role,
      category: 'catalog',
      module: 'inventory',
      action: `catalog_${action}`,
      summary: `${action}: ${die.code}`,
      targetType: 'die_catalog',
      targetId: die.id,
      targetLabel: die.code,
      requestId,
      createdAt: now,
      occurredAt: now,
      sessionId: 'catalog-api'
    });
    return result;
  });
}
