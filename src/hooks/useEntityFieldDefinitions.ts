import { useEffect, useMemo, useState } from 'react';
import {
  canViewEntityField,
  normalizeEntityFieldDefinitions,
  type EntityFieldDefinition,
  type EntityFieldRole,
  type EntityFieldTable
} from '@/features/crm/model/entityFieldConfig';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';

export const useEntityFieldDefinitions = (table?: EntityFieldTable, role?: EntityFieldRole) => {
  const [allDefinitions, setAllDefinitions] = useState<EntityFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection(
      'entity_field_definitions',
      data => {
        setAllDefinitions(normalizeEntityFieldDefinitions(data));
        setLoading(false);
        setError('');
      },
      {
        onError: () => {
          setError('Không tải được danh sách trường. Kiểm tra quyền Firebase và thử lại.');
          setLoading(false);
        }
      }
    );
    return unsubscribe;
  }, [revision]);

  const definitions = useMemo(
    () =>
      allDefinitions.filter(
        definition =>
          !definition.removed &&
          (!table || definition.table === table) &&
          (!role || canViewEntityField(definition, role))
      ),
    [allDefinitions, role, table]
  );

  return {
    definitions,
    allDefinitions,
    loading,
    error,
    retry: () => {
      setLoading(true);
      setError('');
      setRevision(value => value + 1);
    }
  };
};
