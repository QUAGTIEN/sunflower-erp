import type { LeadCandidateRecord } from './leadCandidateModels';

export type RawProvinceCount = { label: string; count: number };

export function countRawDataByProvince(candidates: Pick<LeadCandidateRecord, 'province'>[]): RawProvinceCount[] {
  const counts = new Map<string, number>();
  candidates.forEach(candidate => {
    const province = candidate.province.trim() || 'Chưa xác định';
    counts.set(province, (counts.get(province) || 0) + 1);
  });
  const known = [...counts]
    .filter(([label]) => label !== 'Chưa xác định')
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'vi-VN'));
  const rows = known.slice(0, 6).map(([label, count]) => ({ label, count }));
  const others = known.slice(6).reduce((total, [, count]) => total + count, 0);
  if (others) rows.push({ label: 'Tỉnh khác', count: others });
  const unknown = counts.get('Chưa xác định') || 0;
  if (unknown) rows.push({ label: 'Chưa xác định', count: unknown });
  return rows;
}
