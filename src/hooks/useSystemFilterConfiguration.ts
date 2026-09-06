import { useMemo } from 'react';
import {
  mergeSystemFilterDefinitions,
  type SystemFilterDefinition
} from '../domain/systemFilterConfig';
import type { LeadFilterDefinition } from '@/features/crm/model/crmModels';
import type { CustomerFilterDefinition } from '@/features/crm/model/customerFilterConfig';

export const useSystemFilterConfiguration = (
  leadDefinitions: LeadFilterDefinition[] = [],
  customerDefinitions: CustomerFilterDefinition[] = []
): SystemFilterDefinition[] => {
  return useMemo(
    () => mergeSystemFilterDefinitions([], leadDefinitions, customerDefinitions),
    [customerDefinitions, leadDefinitions]
  );
};
