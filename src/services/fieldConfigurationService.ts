import { authService, dbService, isFirebaseRuntimeEnabled, type UserProfile } from '@/infrastructure/firebase/erpDataGateway';
import { isEntityCustomFieldValueEmpty } from '@/features/crm/model/entityFieldConfig';
import { SYSTEM_FIELD_CATALOG, validateSystemFieldOverrides } from '@/features/crm/model/systemFieldConfig';
import type { EntityFieldTable } from '@/features/crm/model/entityFieldConfig';

export async function manageFieldConfiguration(user: UserProfile, body: Record<string, unknown>) {
  if (user.role !== 'admin' || !user.active) throw new Error('Chỉ Giám đốc/Admin được cấu hình trường.');
  if (isFirebaseRuntimeEnabled) {
    const token = await authService.getIdToken();
    const response = await fetch('/api/fields/manage', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('API cấu hình chưa sẵn sàng. Cần triển khai code API cùng giao diện.'); }
    if (!response.ok) throw new Error(result.error || 'Không thể lưu cấu hình.');
    return;
  }
  // Explicit local demo only. Failed production requests must never fall back to local storage.
  const table = body.table as EntityFieldTable;
  const actor = { updatedAt: new Date().toISOString(), updatedById: user.uid, updatedByName: user.displayName };
  if (body.action === 'system') {
    await dbService.addDocument('entity_system_field_overrides', { id: table, table, fields: validateSystemFieldOverrides(table, body.fields), ...actor });
    return;
  }
  if (body.action === 'purge_system') {
    const key = String(body.key || '');
    const current = await dbService.getDocument('entity_system_field_overrides', table);
    const fields = validateSystemFieldOverrides(table, current?.fields || {});
    const spec = SYSTEM_FIELD_CATALOG[table].find(field => field.key === key);
    if (!spec || spec.protected) throw new Error('Không thể xóa trường bắt buộc hoặc trường nhận diện hồ sơ.');
    fields[key] = { ...fields[key], visible: false, removed: true };
    await dbService.addDocument('entity_system_field_overrides', { id: table, table, fields, ...actor });
    const records = await dbService.getCollection(table);
    await Promise.all(records.map(record => {
      const updates: Record<string, unknown> = { [key]: '' };
      if (table === 'customers' && key === 'discountType') {
        updates.discountRate = 0;
        updates.discountAmount = 0;
      }
      if (table === 'customers' && ['contactPerson', 'phone', 'email'].includes(key) && Array.isArray(record.contacts)) {
        const contactProperty = key === 'contactPerson' ? 'name' : key;
        updates.contacts = record.contacts.map((contact: Record<string, unknown>) => (
          contact.role === 'primary' || contact.id === 'primary' ? { ...contact, [contactProperty]: '' } : contact
        ));
      }
      return dbService.updateDocument(table, record.id, updates);
    }));
    return;
  }
  if (body.action === 'save') {
    await dbService.addDocument('entity_field_definitions', { ...(body.definition as object), ...actor });
    return;
  }
  const id = String(body.id);
  if (body.action === 'purge') {
    const definition = await dbService.getDocument('entity_field_definitions', id);
    if (!definition) throw new Error('Không tìm thấy trường.');
    if (definition.required) throw new Error('Không thể xóa trường bắt buộc.');
    const records = await dbService.getCollection(table);
    await Promise.all(records.map(record => {
      const values = { ...(record.customFieldValues || {}) };
      delete values[id];
      return dbService.updateDocument(table, record.id, { customFieldValues: values });
    }));
    await dbService.updateDocument('entity_field_definitions', id, { active: false, removed: true, purgedAt: actor.updatedAt, ...actor });
    return;
  }
  if (body.action === 'move') {
    const definitions = (await dbService.getCollection('entity_field_definitions')).filter(item => item.table === table && !item.removed).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'vi'));
    const index = definitions.findIndex(item => item.id === id);
    const target = index + Number(body.direction);
    if (index < 0 || target < 0 || target >= definitions.length) return;
    [definitions[index], definitions[target]] = [definitions[target], definitions[index]];
    await Promise.all(definitions.map((item, position) => dbService.updateDocument('entity_field_definitions', item.id, { order: position * 10, ...actor })));
    return;
  }
  if (body.action === 'remove') {
    const definition = await dbService.getDocument('entity_field_definitions', id);
    if (!definition || definition.active) throw new Error('Hãy ngừng sử dụng trường trước khi xóa.');
    const records = await dbService.getCollection(table);
    if (records.some(record => !isEntityCustomFieldValueEmpty(record.customFieldValues?.[id]))) throw new Error('Trường đã có dữ liệu, chỉ có thể ngừng sử dụng.');
  }
  await dbService.updateDocument('entity_field_definitions', id, { active: body.action === 'restore', removed: body.action === 'remove', ...actor });
}
