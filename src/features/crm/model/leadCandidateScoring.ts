import { CUSTOMER_INSIGHT_GROUPS, CUSTOMER_INSIGHT_ITEM_BY_ID } from './customerInsightCatalog';

export type LeadCandidateScoringMode = 'automatic' | 'manual';
export type LeadCandidatePriorityLevel = 'very_high' | 'high' | 'medium' | 'low';

export interface LeadCandidateScoreBreakdownItem {
  itemId: string;
  label: string;
  points: number;
}

export interface LeadCandidateScoreResult {
  automaticScore: number;
  rawScore: number;
  breakdown: LeadCandidateScoreBreakdownItem[];
}

export interface LeadCandidateScoringRules {
  points: Record<string, number>;
  groupCaps: Record<string, number>;
}

export const LEAD_CANDIDATE_SCORE_STEP = 5;
export const LEAD_CANDIDATE_SCORE_MAX = 100;

export const LEAD_CANDIDATE_GROUP_CAPS: Record<string, number> = {
  order_progress: 30,
  commercial_price: 20,
  contact_interaction: 15,
  usage_scale: 15,
  supplier_competition: 5,
  special_requirements: 5,
  product_needs: 5,
  industry: 5
};

export const LEAD_CANDIDATE_SCORE_POINTS: Record<string, number> = {
  po_promised: 25,
  sample_reviewing: 10,
  sample_test_ok: 15,
  sample_test_not_ok: -10,
  sample_planning: 5,
  sample_promised_not_received: 5,
  sample_sent: 10,
  product_info_provided: 10,
  target_price_provided: 15,
  target_price_promised: 5,
  price_low: 5,
  price_high: -10,
  price_surveying: 5,
  no_information: -15,
  no_buyer_contact: -10,
  asks_email: 5,
  zalo_connected_no_interaction: -5,
  zalo_unconfirmed: -5,
  zalo_interacting: 10,
  enthusiastic: 10,
  indifferent: -5,
  contact_later: 5,
  meeting_agreed: 15,
  onsite_required: 10,
  remote_possible: 5,
  contact_left_company: -15,
  sale_quote_sent: 10,
  usage_low: 0,
  usage_5_10m: 5,
  usage_10_20m: 5,
  usage_tens_millions: 10,
  usage_near_100m: 15,
  usage_100m_plus: 20,
  supplier_designated: -5,
  supplier_change_refused: -10,
  uses_company_products: 5,
  sold_by_company: 5,
  sold_by_close_partner: 5,
  handled_by_other_sale: -5,
  hard_to_source_material: 5,
  certificate_required: 5,
  schedule_required: 5,
  strict_quality_required: 5,
  nearby_supplier_required: 0,
  industry_reference_required: 0,
  factory_audit_required: 5,
  buys_machinery: 5,
  buys_labels: 5,
  buys_ink: 5,
  design_file_provided: 5,
  industry_garment: 5,
  industry_electronics: 5,
  industry_food_beverage: 5,
  industry_packaging: 5,
  industry_medical: 5,
  industry_logistics: 5,
  industry_pharma_cosmetics: 5,
  industry_agriculture: 5,
  industry_household_metal: 5,
  industry_automotive: 5,
  industry_chemicals_paint: 5
};

export const DEFAULT_LEAD_CANDIDATE_SCORING_RULES: LeadCandidateScoringRules = {
  points: LEAD_CANDIDATE_SCORE_POINTS,
  groupCaps: LEAD_CANDIDATE_GROUP_CAPS
};

const clampScore = (value: number) => Math.max(0, Math.min(LEAD_CANDIDATE_SCORE_MAX, value));

export const normalizeLeadCandidateScore = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clampScore(Math.round(numeric / LEAD_CANDIDATE_SCORE_STEP) * LEAD_CANDIDATE_SCORE_STEP);
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const normalizeRuleValue = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric / LEAD_CANDIDATE_SCORE_STEP) * LEAD_CANDIDATE_SCORE_STEP));
};

export const normalizeLeadCandidateScoringRules = (value: unknown): LeadCandidateScoringRules => {
  const source = asRecord(value);
  const pointSource = asRecord(source.points);
  const capSource = asRecord(source.groupCaps);
  return {
    points: Object.fromEntries(Object.keys(LEAD_CANDIDATE_SCORE_POINTS).map(itemId => [
      itemId,
      normalizeRuleValue(pointSource[itemId], LEAD_CANDIDATE_SCORE_POINTS[itemId], -100, 100)
    ])),
    groupCaps: Object.fromEntries(Object.keys(LEAD_CANDIDATE_GROUP_CAPS).map(groupId => [
      groupId,
      normalizeRuleValue(capSource[groupId], LEAD_CANDIDATE_GROUP_CAPS[groupId], 0, 100)
    ]))
  };
};

export const calculateLeadCandidateAutomaticScore = (
  values: string[],
  rules: LeadCandidateScoringRules = DEFAULT_LEAD_CANDIDATE_SCORING_RULES
): LeadCandidateScoreResult => {
  const selected = new Set(values);
  const breakdown: LeadCandidateScoreBreakdownItem[] = [];
  let rawScore = 0;

  CUSTOMER_INSIGHT_GROUPS.forEach(group => {
    const entries = group.items
      .filter(item => selected.has(item.id))
      .map(item => ({ itemId: item.id, label: item.label, points: rules.points[item.id] || 0 }));
    const positive = entries.filter(entry => entry.points > 0);
    const negative = entries.filter(entry => entry.points < 0);
    const positiveTotal = positive.reduce((sum, entry) => sum + entry.points, 0);
    const cappedPositive = Math.min(positiveTotal, rules.groupCaps[group.id] ?? positiveTotal);
    const negativeTotal = negative.reduce((sum, entry) => sum + entry.points, 0);
    rawScore += cappedPositive + negativeTotal;
    breakdown.push(...entries);
  });

  return { automaticScore: normalizeLeadCandidateScore(rawScore), rawScore, breakdown };
};

export const getLeadCandidatePriorityLevel = (score: number): LeadCandidatePriorityLevel => {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
};

export const LEAD_CANDIDATE_PRIORITY_LABELS: Record<LeadCandidatePriorityLevel, string> = {
  very_high: 'Rất cao',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp'
};

export const getLeadCandidateEffectiveScore = (candidate: {
  customerInsightValues?: string[];
  scoringMode?: LeadCandidateScoringMode;
  manualScore?: number;
}, rules: LeadCandidateScoringRules = DEFAULT_LEAD_CANDIDATE_SCORING_RULES) => {
  const automatic = calculateLeadCandidateAutomaticScore(candidate.customerInsightValues || [], rules).automaticScore;
  return candidate.scoringMode === 'manual' ? normalizeLeadCandidateScore(candidate.manualScore) : automatic;
};

export const getLeadCandidateScoringItem = (itemId: string) => CUSTOMER_INSIGHT_ITEM_BY_ID.get(itemId);
