import { resolveVietnamProvince } from '@/data/vietnamProvinceCatalog';
import { dbService } from '@/infrastructure/firebase/erpDataGateway';

const PROVINCE_COLLECTIONS = ['lead_candidates', 'leads', 'customers', 'suppliers'] as const;

type ProvinceSourceRecord = Record<string, unknown> & {
  id?: unknown;
  province?: unknown;
  provinceId?: unknown;
  filterValues?: unknown;
};

export interface ProvinceSynchronizationResult {
  inspected: number;
  updated: number;
  unresolved: number;
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

export const synchronizeProvinceData = async (): Promise<ProvinceSynchronizationResult> => {
  const result: ProvinceSynchronizationResult = { inspected: 0, updated: 0, unresolved: 0 };

  for (const collectionName of PROVINCE_COLLECTIONS) {
    const records = await dbService.getRawCollection(collectionName) as ProvinceSourceRecord[];
    for (const record of records) {
      const id = typeof record.id === 'string' ? record.id : '';
      const currentProvince = typeof record.province === 'string' ? record.province.trim() : '';
      const currentProvinceId = typeof record.provinceId === 'string' ? record.provinceId.trim() : '';
      if (!id || (!currentProvince && !currentProvinceId)) continue;
      result.inspected += 1;

      const resolved = resolveVietnamProvince(currentProvince, currentProvinceId);
      if (!resolved) {
        result.unresolved += 1;
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (currentProvince !== resolved.label) patch.province = resolved.label;
      if (currentProvinceId !== resolved.id) patch.provinceId = resolved.id;

      if (collectionName === 'leads') {
        const filterValues = asRecord(record.filterValues);
        const provinceValues = Array.isArray(filterValues.province)
          ? filterValues.province.filter(value => typeof value === 'string')
          : [];
        if (provinceValues.length !== 1 || provinceValues[0] !== resolved.id) {
          patch.filterValues = { ...filterValues, province: [resolved.id] };
        }
      }

      if (Object.keys(patch).length === 0) continue;
      await dbService.synchronizeDocumentFields(collectionName, id, patch);
      result.updated += 1;
    }
  }

  return result;
};
