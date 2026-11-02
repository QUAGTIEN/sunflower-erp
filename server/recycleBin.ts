import { AdminApiError, type AdminCaller } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import {
  CUSTOMER_PRODUCTS,
  RECYCLE_KIND_LABELS,
  isRecycleCollection,
  purgeBlockReason,
  restoreBlockReason,
  type RecycleKind
} from '../src/features/administration/model/recycleBin.js';

export type RecycleAction = 'restore' | 'purge';

export interface RecycleInput {
  action: RecycleAction;
  kind: RecycleKind;
  id: string;
}

const IDENTIFIER = /^[A-Za-z0-9_-]{1,200}$/;

export const validateRecycleBody = (body: Record<string, unknown>): RecycleInput => {
  const action = body.action === 'recycle_restore' ? 'restore' : body.action === 'recycle_purge' ? 'purge' : null;
  const kind = body.kind;
  const id = typeof body.id === 'string' ? body.id : '';
  if (!action) throw new AdminApiError(400, 'Thao tác thùng rác không hợp lệ.', 'recycle/invalid-action');
  if (!isRecycleCollection(kind) && kind !== CUSTOMER_PRODUCTS)
    throw new AdminApiError(400, 'Loại tài liệu không thuộc thùng rác.', 'recycle/invalid-kind');
  const parts = kind === CUSTOMER_PRODUCTS ? id.split('::') : [id];
  if (parts.length !== (kind === CUSTOMER_PRODUCTS ? 2 : 1) || !parts.every(part => IDENTIFIER.test(part)))
    throw new AdminApiError(400, 'Mã tài liệu không hợp lệ.', 'recycle/invalid-id');
  return { action, kind, id };
};

const notInBin = () =>
  new AdminApiError(409, 'Mục này không còn trong thùng rác. Hãy tải lại danh sách.', 'recycle/not-deleted');

/**
 * D-TR1: only admins restore or purge, through one transaction that re-reads the record, so a record that is no
 * longer deleted (or was changed meanwhile) is never purged and nothing posted to a ledger is ever removed.
 */
export async function manageRecycledItem(caller: AdminCaller, input: RecycleInput) {
  const { firestore } = getFirebaseAdminServices();
  const [documentId, productId] = input.kind === CUSTOMER_PRODUCTS ? input.id.split('::') : [input.id, ''];
  const collection = input.kind === CUSTOMER_PRODUCTS ? 'customers' : input.kind;
  const reference = firestore.collection(collection).doc(documentId);
  const eventReference = firestore.collection('audit_events').doc();
  const now = new Date().toISOString();
  const actorName = caller.profile.displayName;

  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    const record = snapshot.data();
    if (!snapshot.exists || !record) throw notInBin();
    let label: string;

    if (input.kind === CUSTOMER_PRODUCTS) {
      if (record.deleted === true) throw notInBin();
      const products = Array.isArray(record.products) ? (record.products as Record<string, unknown>[]) : [];
      const product = products.find(entry => entry?.id === productId);
      if (!product || product.deleted !== true) throw notInBin();
      label = String(product.productCode || productId);
      const nextProducts =
        input.action === 'purge'
          ? products.filter(entry => entry !== product)
          : products.map(entry => {
              if (entry !== product) return entry;
              const restored = { ...entry };
              delete restored.deleted;
              return { ...restored, restoredAt: now, restoredByName: actorName };
            });
      transaction.update(reference, { products: nextProducts, updatedAt: now, updatedBy: actorName });
    } else {
      if (record.deleted !== true) throw notInBin();
      const reason =
        input.action === 'purge' ? purgeBlockReason(input.kind, record) : restoreBlockReason(input.kind, record);
      if (reason) throw new AdminApiError(409, reason, 'recycle/protected');
      label = String(record.poCode || record.lsxCode || record.companyName || record.name || documentId);
      if (input.action === 'purge') transaction.delete(reference);
      else
        transaction.update(reference, {
          deleted: false,
          restoredAt: now,
          restoredById: caller.uid,
          restoredByName: actorName,
          updatedAt: now,
          updatedBy: actorName
        });
    }

    const verb = input.action === 'purge' ? 'Xóa vĩnh viễn' : 'Khôi phục';
    transaction.set(eventReference, {
      actorId: caller.uid,
      actorName,
      actorRole: caller.profile.role,
      category: 'administration',
      module: 'system',
      action: input.action === 'purge' ? 'recycle_purged' : 'recycle_restored',
      summary: `${verb} ${RECYCLE_KIND_LABELS[input.kind].toLocaleLowerCase('vi-VN')} ${label}`,
      targetType: input.kind,
      targetId: input.id,
      targetLabel: label,
      createdAt: now,
      occurredAt: now,
      sessionId: 'recycle-bin-api'
    });
    return { success: true, id: input.id };
  });
}
