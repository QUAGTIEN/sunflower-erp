import { useEffect, useMemo, useState } from 'react';
import {
  canViewEntityField,
  normalizeEntityFieldDefinitions,
  type EntityFieldDefinition,
  type EntityFieldRole,
  type EntityFieldTable
} from '../domain/entityFieldConfig';
import { dbService } from '../services/firebaseService';

export const useEntityFieldDefinitions = (table?: EntityFieldTable, role?: EntityFieldRole) => {
  const [allDefinitions, setAllDefinitions] = useState<EntityFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = dbService.subscribeCollection('entity_field_definitions', data => {
      setAllDefinitions(normalizeEntityFieldDefinitions(data));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const definitions = useMemo(() => allDefinitions.filter(definition => (
    (!table || definition.table === table)
    && (!role || canViewEntityField(definition, role))
  )), [allDefinitions, role, table]);

  return { definitions, allDefinitions, loading };
};

