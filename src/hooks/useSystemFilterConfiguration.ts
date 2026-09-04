import { useEffect, useMemo, useState } from 'react';
import {
  mergeSystemFilterDefinitions,
  type SystemFilterDefinition
} from '../domain/systemFilterConfig';
import type { LeadFilterDefinition } from '@/features/crm/model/crmModels';
import type { CustomerFilterDefinition } from '@/features/crm/model/customerFilterConfig';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';

export const useSystemFilterConfiguration = (
  leadDefinitions: LeadFilterDefinition[] = [],
  customerDefinitions: CustomerFilterDefinition[] = []
): SystemFilterDefinition[] => {
  const [storedDefinitions, setStoredDefinitions] = useState<SystemFilterDefinition[]>([]);

  useEffect(() => dbService.subscribeCollection('system_filter_definitions', data => {
    setStoredDefinitions(data as SystemFilterDefinition[]);
  }), []);

  return useMemo(
    () => mergeSystemFilterDefinitions(storedDefinitions, leadDefinitions, customerDefinitions),
    [customerDefinitions, leadDefinitions, storedDefinitions]
  );
};
