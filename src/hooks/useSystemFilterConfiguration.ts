import { useEffect, useMemo, useState } from 'react';
import {
  mergeSystemFilterDefinitions,
  type SystemFilterDefinition
} from '../domain/systemFilterConfig';
import type { LeadFilterDefinition } from '../domain/crmModels';
import type { CustomerFilterDefinition } from '../domain/customerFilterConfig';
import { dbService } from '../services/firebaseService';

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
