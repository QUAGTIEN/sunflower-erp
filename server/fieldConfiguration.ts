import { AdminApiError, type requireAdmin } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { ENTITY_FIELD_TABLE_LABELS, ENTITY_FIELD_TYPE_LABELS, normalizeEntityFieldDefinition, isEntityCustomFieldValueEmpty, type EntityFieldTable } from '../src/features/crm/model/entityFieldConfig.js';
import { SYSTEM_FIELD_CATALOG, resolveSystemFields, validateSystemFieldOverrides } from '../src/features/crm/model/systemFieldConfig.js';

type Caller = Awaited<ReturnType<typeof requireAdmin>>;
const fail = (message: string): never => { throw new AdminApiError(400, message, 'fields/invalid'); };

export async function manageFieldConfiguration(caller: Caller, body: Record<string, unknown>) {
  const { firestore } = getFirebaseAdminServices();
  const table = body.table as EntityFieldTable;
  if (!Object.hasOwn(ENTITY_FIELD_TABLE_LABELS, table)) fail('Bảng không hợp lệ.');
  const now = new Date().toISOString();
  const actor = { updatedAt: now, updatedById: caller.uid, updatedByName: caller.profile.displayName };
  const action = body.action;
  const auditRef = firestore.collection('audit_events').doc();
  const audit = (targetId: string, label: string) => ({
    id: auditRef.id, actorId: caller.uid, actorName: caller.profile.displayName, actorRole: 'admin',
    category: 'administration', module: 'system', action: `field_${String(action)}`,
    summary: `Cấu hình trường: ${label} (${ENTITY_FIELD_TABLE_LABELS[table]})`,
    targetType: 'field_configuration', targetId, targetLabel: label, createdAt: now, occurredAt: now, sessionId: 'admin-api'
  });

  const purgeRecordField = async (fieldKey: string, custom: boolean) => {
    const records = await firestore.collection(table).get();
    const writer = firestore.bulkWriter();
    for (const record of records.docs) {
      const data = record.data();
      if (custom ? Object.hasOwn(data.customFieldValues || {}, fieldKey) : Object.hasOwn(data, fieldKey)) {
        writer.update(record.ref, { [custom ? `customFieldValues.${fieldKey}` : fieldKey]: FieldValue.delete() });
      }
    }
    await writer.close();
  };

  if (action === 'system') {
    let fields;
    try { fields = validateSystemFieldOverrides(table, body.fields); }
    catch (error) { return fail(error instanceof Error ? error.message : 'Cấu hình không hợp lệ.'); }
    const ref = firestore.collection('entity_system_field_overrides').doc(table);
    await firestore.runTransaction(async transaction => {
      const previous = await transaction.get(ref);
      const customFields = await transaction.get(firestore.collection('entity_field_definitions').where('table', '==', table));
      if (customFields.docs.some(doc => !doc.data().removed && Object.values(fields).some(field => field.label.toLocaleLowerCase('vi') === String(doc.data().name).trim().toLocaleLowerCase('vi')))) fail('Tên hiển thị bị trùng với một trường tùy chỉnh.');
      // A revision prevents two editors from silently overwriting one another.
      if ((previous.data()?.updatedAt || '') !== (body.expectedUpdatedAt || '')) throw new AdminApiError(409, 'Cấu hình vừa được người khác cập nhật. Hãy tải lại trước khi lưu.', 'fields/conflict');
      transaction.set(ref, { id: table, table, fields, ...actor });
      transaction.set(auditRef, audit(table, 'Trường hệ thống'));
    });
    return { success: true };
  }

  if (action === 'purge_system') {
    const key = String(body.key || '');
    const spec = SYSTEM_FIELD_CATALOG[table].find(field => field.key === key);
    if (!spec) return fail('Không thể xóa trường không tồn tại.');
    if (spec.protected) return fail('Không thể xóa trường bắt buộc hoặc trường nhận diện hồ sơ.');
    const configRef = firestore.collection('entity_system_field_overrides').doc(table);
    await firestore.runTransaction(async transaction => {
      const previous = await transaction.get(configRef);
      if ((previous.data()?.updatedAt || '') !== (body.expectedUpdatedAt || '')) throw new AdminApiError(409, 'Cấu hình vừa được người khác cập nhật. Hãy tải lại trước khi xóa.', 'fields/conflict');
      const fields = Object.fromEntries(resolveSystemFields(table, previous.data()?.fields).map(field => [field.key, field]));
      fields[key] = { ...fields[key], visible: false, removed: true };
      transaction.set(configRef, { id: table, table, fields: validateSystemFieldOverrides(table, fields), ...actor });
      transaction.set(auditRef, audit(key, spec.label));
    });
    await purgeRecordField(key, false);
    return { success: true };
  }

  const raw = body.definition && typeof body.definition === 'object' && !Array.isArray(body.definition) ? body.definition as Record<string, unknown> : {};
  const id = (body.id || raw.id) as string;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(id)) fail('Mã trường không hợp lệ.');
  const ref = firestore.collection('entity_field_definitions').doc(id);
  let purgeCustom = false;
  await firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? normalizeEntityFieldDefinition({ ...snapshot.data(), id: snapshot.id }) : null;
    if (previous && previous.table !== table) fail('Không thể chuyển trường sang bảng khác.');
    if (previous && (previous.updatedAt || '') !== (body.expectedUpdatedAt || '')) throw new AdminApiError(409, 'Trường vừa được cập nhật. Hãy tải lại rồi thử lại.', 'fields/conflict');
    if (action === 'save') {
      if (!Object.hasOwn(ENTITY_FIELD_TYPE_LABELS, String(raw.type))) fail('Kiểu dữ liệu không được hỗ trợ.');
      if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100) fail('Tên trường cần từ 1 đến 100 ký tự.');
      if (typeof raw.description !== 'string' || raw.description.length > 500) fail('Mô tả tối đa 500 ký tự.');
      if (previous && (raw.type !== previous.type || raw.fieldKey !== previous.fieldKey || raw.table !== previous.table || raw.section !== previous.section)) fail('Không thể đổi mã, bảng, khung thông tin hoặc kiểu dữ liệu của trường đã tạo.');
      const allowedProperties = ['fieldKey', 'name', 'description', 'type', 'section', 'options', 'required', 'active', 'defaultVisible', 'searchable', 'filterable', 'viewRoles', 'editRoles', 'order'];
      const safeInput = Object.fromEntries(Object.entries(raw).filter(([key]) => allowedProperties.includes(key)));
      const definition = normalizeEntityFieldDefinition({ ...safeInput, name: String(raw.name).trim(), description: String(raw.description).trim(), id, table, ...actor,
        createdAt: previous?.createdAt || now, createdById: previous?.createdById || caller.uid,
        createdByName: previous?.createdByName || caller.profile.displayName, removed: false
      });
      if (previous?.removed) fail('Hãy khôi phục trường trước khi chỉnh sửa.');
      const siblings = await transaction.get(firestore.collection('entity_field_definitions').where('table', '==', table));
      const systemOverrides = await transaction.get(firestore.collection('entity_system_field_overrides').doc(table));
      const name = definition.name.toLocaleLowerCase('vi');
      if (siblings.docs.some(doc => doc.id !== id && !doc.data().removed && String(doc.data().name).trim().toLocaleLowerCase('vi') === name)
        || Object.values(systemOverrides.data()?.fields || {}).some(field => String((field as { label?: unknown }).label).trim().toLocaleLowerCase('vi') === name)
        || SYSTEM_FIELD_CATALOG[table].some(field => [field.label, ...(field.aliases || [])].some(label => label.toLocaleLowerCase('vi') === name))) fail('Tên trường đã tồn tại trong bảng.');
      if (['single_select', 'multi_select'].includes(definition.type)) {
        const active = definition.options.filter(option => option.active);
        if (!active.length || active.length > 200) fail('Danh sách cần từ 1 đến 200 lựa chọn.');
        if (new Set(active.map(option => option.label.toLocaleLowerCase('vi'))).size !== active.length) fail('Các lựa chọn không được trùng tên.');
        if (new Set(definition.options.map(option => option.id)).size !== definition.options.length) fail('Mã lựa chọn bị trùng.');
        // Preserve retired options so existing records remain readable.
        for (const option of previous?.options || []) {
          if (!definition.options.some(item => item.id === option.id)) definition.options.push({ ...option, active: false });
        }
      }
      transaction.set(ref, definition);
      transaction.set(auditRef, audit(id, definition.name));
      return;
    }
    if (!previous) return fail('Không tìm thấy trường.');
    if (action === 'purge') {
      if (previous.required) fail('Không thể xóa trường bắt buộc.');
      transaction.update(ref, { active: false, removed: true, purgedAt: now, ...actor });
      transaction.set(auditRef, audit(id, previous.name));
      purgeCustom = true;
      return;
    }
    if (action === 'move') {
      if (body.direction !== -1 && body.direction !== 1) fail('Hướng sắp xếp không hợp lệ.');
      const siblings = await transaction.get(firestore.collection('entity_field_definitions').where('table', '==', table));
      const ordered = siblings.docs.map(doc => normalizeEntityFieldDefinition({ ...doc.data(), id: doc.id })).filter(item => !item.removed)
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'));
      const index = ordered.findIndex(item => item.id === id);
      const targetIndex = index + Number(body.direction);
      if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
      [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
      ordered.forEach((item, position) => transaction.update(firestore.collection('entity_field_definitions').doc(item.id), { order: position * 10, ...actor }));
      transaction.set(auditRef, audit(id, previous!.name));
      return;
    }
    if (action === 'remove') {
      if (previous!.active) fail('Hãy ngừng sử dụng trường trước khi xóa.');
      const records = await transaction.get(firestore.collection(table));
      if (records.docs.some(doc => !isEntityCustomFieldValueEmpty(doc.data().customFieldValues?.[id]))) fail('Trường đã có dữ liệu nên không thể xóa. Hãy giữ trạng thái Ngừng sử dụng để bảo toàn lịch sử.');
      // Reversible removal: retain metadata even if an older/offline client later writes a value.
      transaction.update(ref, { removed: true, active: false, ...actor });
    } else if (action === 'archive' || action === 'restore') {
      transaction.update(ref, { active: action === 'restore', removed: false, ...actor });
    } else fail('Thao tác không được hỗ trợ.');
    transaction.set(auditRef, audit(id, previous!.name));
  });
  if (purgeCustom) await purgeRecordField(id, true);
  return { success: true };
}
