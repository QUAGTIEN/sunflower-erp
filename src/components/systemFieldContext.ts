import { createContext } from 'react';
import type { SystemFieldOverride } from '@/features/crm/model/systemFieldConfig';

export const SystemFieldContext = createContext<SystemFieldOverride[]>([]);
