import { doc, setDoc } from 'firebase/firestore';
import { dbService, isDocumentAlreadyExistsError, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { getFirebaseDatabase } from '@/infrastructure/firebase/client';
import {
  canEditTableColumns,
  mergeTableColumnLayout,
  normalizeColumnSelection,
  normalizeColumnWidths,
  normalizeTableColumnLayout,
  type TableColumnLayoutPatch
} from '@/domain/tableColumnLayout';

export const TABLE_COLUMN_LAYOUT_COLLECTION = 'table_column_layouts';

export async function saveTableColumnLayout(user: UserProfile, id: string, patch: TableColumnLayoutPatch, onlyIfAbsent = false) {
  if (!canEditTableColumns(user)) throw new Error('Chỉ Admin được thiết lập cột.');
  if (!/^[a-zA-Z0-9:_-]{1,180}$/.test(id)) throw new Error('Bảng không hợp lệ.');
  const selectedIds = patch.selectedIds === undefined ? undefined : normalizeColumnSelection(patch.selectedIds);
  const fields = {
    id,
    schemaVersion: 1 as const,
    ...(selectedIds !== undefined ? { selectedIds } : {}),
    ...(patch.widths !== undefined ? { widths: normalizeColumnWidths(patch.widths) } : {}),
    updatedAt: new Date().toISOString(),
    updatedById: user.uid
  };
  if (onlyIfAbsent) {
    try {
      return await dbService.addDocumentIfAbsent(TABLE_COLUMN_LAYOUT_COLLECTION, id, fields);
    } catch (error) {
      if (!isDocumentAlreadyExistsError(error)) throw error;
      const existing = normalizeTableColumnLayout((error as { existingDocument: unknown }).existingDocument);
      if (!existing) throw error;
      return existing;
    }
  }
  const database = await getFirebaseDatabase('saving shared table columns');
  if (database) {
    // Firestore Rules authorize the authenticated administrator. Merging keeps
    // a visibility/order edit from overwriting widths saved by another admin.
    await setDoc(doc(database, TABLE_COLUMN_LAYOUT_COLLECTION, id), fields, { merge: true });
  } else {
    const previous = normalizeTableColumnLayout(await dbService.getDocument(TABLE_COLUMN_LAYOUT_COLLECTION, id));
    await dbService.addDocument(TABLE_COLUMN_LAYOUT_COLLECTION, {
      ...mergeTableColumnLayout(id, previous || undefined, patch),
      updatedAt: fields.updatedAt,
      updatedById: fields.updatedById
    });
  }
  return fields;
}
