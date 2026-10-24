import { VIETNAM_ADMINISTRATIVE_UNITS, type VietnamAdministrativeProvince } from './vietnamAdministrativeUnits';

export interface ResolvedVietnamProvince {
  id: string;
  label: string;
  province: VietnamAdministrativeProvince;
}

export const normalizeVietnameseLocationText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
    .replace(/\b(tinh|thanh pho|tp|city)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PROVINCES_BY_ID = new Map(VIETNAM_ADMINISTRATIVE_UNITS.map(province => [province.id, province]));

const PROVINCES_BY_NORMALIZED_LABEL = new Map(
  VIETNAM_ADMINISTRATIVE_UNITS.map(province => [normalizeVietnameseLocationText(province.label), province])
);

const COMPATIBLE_PROVINCE_IDS: Record<string, string> = {
  hue: 'thua_thien_hue'
};

export const getVietnamProvinceById = (provinceId: string): VietnamAdministrativeProvince | undefined =>
  PROVINCES_BY_ID.get(provinceId.trim());

export const resolveVietnamProvince = (value: unknown, provinceId: unknown = ''): ResolvedVietnamProvince | null => {
  const id = typeof provinceId === 'string' ? provinceId.trim() : '';
  const byId = getVietnamProvinceById(id);
  if (byId) return { id: byId.id, label: byId.label, province: byId };

  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const normalized = normalizeVietnameseLocationText(text);
  const direct =
    PROVINCES_BY_NORMALIZED_LABEL.get(normalized) ||
    getVietnamProvinceById(text) ||
    getVietnamProvinceById(normalized.replace(/ /g, '_'));
  if (direct) return { id: direct.id, label: direct.label, province: direct };

  const compatible = getVietnamProvinceById(COMPATIBLE_PROVINCE_IDS[normalized] || '');
  return compatible ? { id: compatible.id, label: compatible.label, province: compatible } : null;
};

export const resolveVietnamProvinceFromText = (...values: Array<unknown>): ResolvedVietnamProvince | null => {
  const source = normalizeVietnameseLocationText(
    values.filter(value => typeof value === 'string' && value.trim()).join(' ')
  );
  if (!source) return null;

  const direct = VIETNAM_ADMINISTRATIVE_UNITS.find(province => {
    const normalizedName = normalizeVietnameseLocationText(province.label);
    return (
      source === normalizedName ||
      source.includes(` ${normalizedName} `) ||
      source.startsWith(`${normalizedName} `) ||
      source.endsWith(` ${normalizedName}`)
    );
  });
  if (direct) return { id: direct.id, label: direct.label, province: direct };

  const compatibleName = Object.keys(COMPATIBLE_PROVINCE_IDS).find(
    name =>
      source === name || source.startsWith(`${name} `) || source.endsWith(` ${name}`) || source.includes(` ${name} `)
  );
  return compatibleName ? resolveVietnamProvince('', COMPATIBLE_PROVINCE_IDS[compatibleName]) : null;
};

export const canonicalizeVietnamProvince = (value: unknown, provinceId: unknown = '') => {
  const resolved = resolveVietnamProvince(value, provinceId);
  return {
    provinceId: resolved?.id || '',
    province: resolved?.label || (typeof value === 'string' ? value.trim() : '')
  };
};
