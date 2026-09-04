import { useEffect, useState } from 'react';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';
import type { EntityFieldTable } from '@/features/crm/model/entityFieldConfig';
import { resolveSystemFields } from '@/features/crm/model/systemFieldConfig';

export function useSystemFieldConfiguration(table: EntityFieldTable) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    return dbService.subscribeCollection('entity_system_field_overrides', data => {
      setRecords(data);
      setLoading(false);
      setError('');
    }, { onError: () => { setError('Không tải được cấu hình trường. Kiểm tra kết nối và quyền truy cập.'); setLoading(false); } });
  }, [revision]);
  const record = records.find(item => item.id === table);
  return { fields: resolveSystemFields(table, record?.fields), updatedAt: String(record?.updatedAt || ''), loading, error, retry: () => { setLoading(true); setError(''); setRevision(value => value + 1); } };
}
