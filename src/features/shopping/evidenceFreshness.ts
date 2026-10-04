import type { DecisionProduct, DecisionReport, FragranceVerification } from './model';

export const MAX_EVIDENCE_AGE_MS = 30 * 86400000;
export const isFreshObservation = (value: string | undefined, now: Date): boolean => {
  const observed = Date.parse(value || '');
  return Number.isFinite(observed) && observed <= now.getTime() && now.getTime() - observed < MAX_EVIDENCE_AGE_MS;
};

/** A tightly affirmative source claim, never a substring match in a negative,
 * uncertain, quoted, or conditional statement. Unsupported wording stays unknown. */
export function isAffirmativeFragranceFreeClaim(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase().trim().replace(/[–—]/g, '-').replace(/[.!]$/, '').trim();
  return /^(?:(?:this (?:product|formula)|the (?:product|formula)|it) is |(?:claim|fragrance status):\s*)?(?:100%\s+)?fragrance[ -]free$/.test(normalized);
}

export function summarizeDecisionItems(items: DecisionProduct[], fragranceRequired?: boolean): string {
  if (!items.length) return 'No candidates with usable offers satisfy the known requirements. Change your brief or try another search; missing evidence is not a confirmed match.';
  if (!fragranceRequired) return 'Compare the sourced details below. Missing evidence is called out rather than assumed.';
  const verified = items.filter((item) => item.fragrance === 'verified');
  const conflicts = items.filter((item) => item.fragrance === 'conflict');
  return `${verified.length ? `${verified.length} ${verified.length === 1 ? 'product has' : 'products have'} sourced fragrance-free evidence.` : 'None of these products has verified fragrance-free evidence.'}${conflicts.length ? ` ${conflicts.map((item) => item.product.title).join(', ')} ${conflicts.length === 1 ? 'conflicts' : 'conflict'} with that requirement.` : ''} ${verified.length ? 'Compare the evidence and exact sizes below before choosing.' : 'I can’t call these confirmed matches for that requirement; check the missing evidence below.'}`;
}

export function validVerification(value: unknown, item: DecisionProduct, now = new Date()): value is FragranceVerification {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as FragranceVerification;
  const expires = Date.parse(evidence.expiresAt || '');
  const observed = Date.parse(evidence.observedAt || '');
  return evidence.productId === item.product.product_id && Boolean(item.product.merchant_id) && evidence.merchantId === item.product.merchant_id &&
    evidence.complete === true && evidence.available === true && isAffirmativeFragranceFreeClaim(evidence.claim) &&
    typeof evidence.ingredients === 'string' && evidence.ingredients.length > 0 && !/\b(?:fragrance|parfum|perfume)\b/i.test(evidence.ingredients) &&
    isFreshObservation(evidence.observedAt, now) && Number.isFinite(expires) && expires > now.getTime() && expires <= observed + MAX_EVIDENCE_AGE_MS &&
    item.sources.some((source) => source.label === 'Catalog ingredient source' && source.url === evidence.sourceUrl && source.observedAt === evidence.observedAt && !source.stale);
}

/** Used both on persisted hydration and rendering. Stored summaries and badges
 * are derived views; they never extend the lifetime of source verification. */
export function refreshDecisionReport(report: DecisionReport, now = new Date()): DecisionReport {
  let changed = false;
  const items = report.items.map((item): DecisionProduct => {
    const sources = item.sources.map((source) => {
      const stale = source.stale === true || Boolean(source.observedAt && !isFreshObservation(source.observedAt, now));
      if (stale === Boolean(source.stale)) return source;
      changed = true;
      return { ...source, stale };
    });
    const updated = { ...item, sources };
    if (item.fragrance !== 'verified' || validVerification(item.verification, updated, now)) return updated;
    changed = true;
    const warning = 'Fragrance-free verification needs fresh, complete identity-matched source evidence';
    return {
      ...updated,
      verification: undefined,
      fragrance: 'unverified',
      eligibility: item.eligibility === 'rejected' ? 'rejected' : 'unverified',
      tradeoffs: [...item.tradeoffs.filter((line) => !/source explicitly supports fragrance-free|sourced fragrance-free|fragrance-free.*verif/i.test(line)), 'Fragrance-free verification has expired or could not be restored; recheck the source.'],
      missing: [...new Set([...item.missing, warning])],
    };
  });
  return changed ? { ...report, items, summary: summarizeDecisionItems(items, report.fragranceRequired) } : report;
}
