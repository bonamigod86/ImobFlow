/**
 * Pure lead-routing evaluation (no I/O — unit-testable in isolation).
 *
 * The persisted `RoutingRule` rows are passed in as candidates; this module
 * only decides which one wins. Tenant-specific rules are preferred over
 * platform defaults; ties break by `priority` (lower wins); a rule with no
 * filters matches everything — order expresses intent.
 */

export interface RoutingCandidate {
  id: string;
  tenantId: string | null; // null = platform-global rule
  name: string;
  priority: number;
  endpointId: string;
  city?: string | null;
  state?: string | null;
  minMonthlyIncome?: number | string | null;
  maxMonthlyIncome?: number | string | null;
  minPropertyValue?: number | string | null;
  maxPropertyValue?: number | string | null;
  minTermMonths?: number | null;
  maxTermMonths?: number | null;
}

export interface FinancialProfileInput {
  city?: string | null;
  state?: string | null;
  /** Monthly income in BRL. */
  monthlyIncome?: number | null;
  /** Target property value in BRL. */
  propertyValue?: number | null;
  /** Requested term in months. */
  termMonths?: number | null;
}

const toNumber = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const normalize = (v: string | null | undefined): string | null =>
  v ? v.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : null;

function matches(candidate: RoutingCandidate, profile: FinancialProfileInput): boolean {
  // Geographic dimension.
  const ruleCity = normalize(candidate.city);
  const profileCity = normalize(profile.city);
  if (ruleCity && profileCity !== ruleCity) return false;

  const ruleState = normalize(candidate.state);
  const profileState = normalize(profile.state);
  if (ruleState && profileState !== ruleState) return false;

  // Income tier.
  const minIncome = toNumber(candidate.minMonthlyIncome);
  const maxIncome = toNumber(candidate.maxMonthlyIncome);
  const income = toNumber(profile.monthlyIncome);
  if (minIncome !== null && (income === null || income < minIncome)) return false;
  if (maxIncome !== null && (income === null || income > maxIncome)) return false;

  // Property value threshold.
  const minValue = toNumber(candidate.minPropertyValue);
  const maxValue = toNumber(candidate.maxPropertyValue);
  const value = toNumber(profile.propertyValue);
  if (minValue !== null && (value === null || value < minValue)) return false;
  if (maxValue !== null && (value === null || value > maxValue)) return false;

  // Term length.
  const minTerm = toNumber(candidate.minTermMonths);
  const maxTerm = toNumber(candidate.maxTermMonths);
  const term = toNumber(profile.termMonths);
  if (minTerm !== null && (term === null || term < minTerm)) return false;
  if (maxTerm !== null && (term === null || term > maxTerm)) return false;

  return true;
}

/**
 * Pick the best routing rule:
 *   1. `tenantId` matches the lead's tenant first (most specific),
 *   2. then platform defaults (`tenantId = null`),
 *   3. within each group ascending `priority`,
 *   4. among equal priorities, insertion order (stable).
 */
export function selectRoutingEndpoint(
  candidates: RoutingCandidate[],
  tenantId: string,
  profile: FinancialProfileInput,
): RoutingCandidate | null {
  const tenantRules = candidates
    .filter((c) => c.tenantId === tenantId)
    .sort((a, b) => a.priority - b.priority);
  const platformRules = candidates
    .filter((c) => c.tenantId === null)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of [...tenantRules, ...platformRules]) {
    if (matches(rule, profile)) return rule;
  }
  return null;
}