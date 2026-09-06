import { VIETNAM_ADMINISTRATIVE_UNITS, type VietnamAdministrativeProvince } from './vietnamAdministrativeUnits';

export interface ResolvedVietnamProvince {
  id: string;
  label: string;
  province: VietnamAdministrativeProvince;
}

// Names used before the 2025 administrative consolidation. Keeping the aliases
// in one catalog prevents CRM lists, filters and the commercial map from
// applying different province mappings.
export const LEGACY_VIETNAM_PROVINCE_ALIASES: Record<string, string> = {
  'bac giang': 'bac_ninh',
  'bac kan': 'thai_nguyen',
  'binh duong': 'tp_ho_chi_minh',
  'ba ria vung tau': 'tp_ho_chi_minh',
  'binh dinh': 'gia_lai',
  'binh phuoc': 'dong_nai',
  'binh thuan': 'lam_dong',
  'ben tre': 'vinh_long',
  'hau giang': 'can_tho',
  'hai duong': 'hai_phong',
  'hoa binh': 'phu_tho',
  'kien giang': 'an_giang',
  'kon tum': 'quang_ngai',
  'long an': 'tay_ninh',
  'nam dinh': 'ninh_binh',
  'ninh thuan': 'khanh_hoa',
  'phu yen': 'dak_lak',
  'quang nam': 'da_nang',
  'quang binh': 'quang_tri',
  'soc trang': 'can_tho',
  'thai binh': 'hung_yen',
  'tra vinh': 'vinh_long',
  'yen bai': 'lao_cai'
};

export const normalizeVietnameseLocationText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLocaleLowerCase('vi-VN')
  .replace(/\b(tinh|thanh pho|tp|city)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const PROVINCES_BY_ID = new Map(
  VIETNAM_ADMINISTRATIVE_UNITS.map(province => [province.id, province])
);

const PROVINCES_BY_NORMALIZED_LABEL = new Map(
  VIETNAM_ADMINISTRATIVE_UNITS.map(province => [normalizeVietnameseLocationText(province.label), province])
);

export const getVietnamProvinceById = (provinceId: string): VietnamAdministrativeProvince | undefined => (
  PROVINCES_BY_ID.get(provinceId.trim())
);

export const resolveVietnamProvince = (
  value: unknown,
  provinceId: unknown = ''
): ResolvedVietnamProvince | null => {
  const id = typeof provinceId === 'string' ? provinceId.trim() : '';
  const byId = getVietnamProvinceById(id);
  if (byId) return { id: byId.id, label: byId.label, province: byId };

  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const normalized = normalizeVietnameseLocationText(text);
  const direct = PROVINCES_BY_NORMALIZED_LABEL.get(normalized)
    || getVietnamProvinceById(text)
    || getVietnamProvinceById(normalized.replace(/ /g, '_'));
  if (direct) return { id: direct.id, label: direct.label, province: direct };

  const aliasedId = LEGACY_VIETNAM_PROVINCE_ALIASES[normalized];
  const aliased = aliasedId ? getVietnamProvinceById(aliasedId) : undefined;
  return aliased ? { id: aliased.id, label: aliased.label, province: aliased } : null;
};

export const resolveVietnamProvinceFromText = (...values: Array<unknown>): ResolvedVietnamProvince | null => {
  const source = normalizeVietnameseLocationText(values
    .filter(value => typeof value === 'string' && value.trim())
    .join(' '));
  if (!source) return null;

  const direct = VIETNAM_ADMINISTRATIVE_UNITS.find(province => {
    const normalizedName = normalizeVietnameseLocationText(province.label);
    return source === normalizedName
      || source.includes(` ${normalizedName} `)
      || source.startsWith(`${normalizedName} `)
      || source.endsWith(` ${normalizedName}`);
  });
  if (direct) return { id: direct.id, label: direct.label, province: direct };

  const alias = Object.entries(LEGACY_VIETNAM_PROVINCE_ALIASES)
    .find(([legacyName]) => source === legacyName
      || source.includes(` ${legacyName} `)
      || source.startsWith(`${legacyName} `)
      || source.endsWith(` ${legacyName}`));
  return alias ? resolveVietnamProvince('', alias[1]) : null;
};

export const canonicalizeVietnamProvince = (value: unknown, provinceId: unknown = '') => {
  const resolved = resolveVietnamProvince(value, provinceId);
  return {
    provinceId: resolved?.id || '',
    province: resolved?.label || (typeof value === 'string' ? value.trim() : '')
  };
};
