import type { ProductResponse } from '@/lib/api';

export type ShoppingBrief = {
  intent: string;
  category?: string;
  fragranceFree?: boolean;
  budget?: { amount: number; currency: string; exclusive: boolean };
  requestedCount?: number;
};
export type RequestIdentity = { conversationId: string; requestId: string; ownerEpoch: string };
export type EvidenceSource = { label: string; url: string; observedAt?: string; stale?: boolean };
export type FragranceVerification = { productId: string; merchantId: string; sourceUrl: string; observedAt: string; expiresAt: string; claim: string; ingredients: string; complete: true; available: true };
export type DecisionProduct = {
  verification?: FragranceVerification;
  product: ProductResponse;
  eligibility?: 'candidate' | 'rejected' | 'unverified';
  fragrance: 'conflict' | 'verified' | 'unverified';
  ingredientEvidence: string;
  sources: EvidenceSource[];
  size: string;
  price: string;
  retailer: string;
  variantId?: string;
  alternatives: string[];
  tradeoffs: string[];
  missing: string[];
};
export type DecisionReport = { summary: string; items: DecisionProduct[]; compared: boolean; fragranceRequired?: boolean; includeIngredients?: boolean };
export type ShoppingTask = {
  brief: ShoppingBrief;
  displayedProducts: ProductResponse[];
  savedProducts: ProductResponse[];
  request?: { id: string; status: 'pending' | 'complete' | 'error' | 'interrupted'; query: string };
  draft: string;
};
export const newShoppingTask = (): ShoppingTask => ({ brief: { intent: '' }, displayedProducts: [], savedProducts: [], draft: '' });

const categoryPattern = /\b(moisturi[sz]ers?|cleansers?|serums?|sunscreens?|shampoos?|conditioners?|lipsticks?|foundations?|blush|dresses?|jackets?|jeans|sneakers?|shoes|headphones|earbuds|laptops?|phones?)\b/i;
const budgetPattern = /\b(under|below|less than|up to|at most|budget(?: of)?|maximum(?: of)?)\s*(?:(USD|EUR|GBP|CAD|AUD)\s*|([$€£])\s*)?(\d+(?:\.\d{1,2})?)\s*(USD|EUR|GBP|CAD|AUD|dollars?|euros?|pounds?)?\b/i;
const fragrancePattern = /\b(fragrance[ -]free|without fragrance|no fragrance)\b/i;
const countPattern = /\b(?:show|find|suggest|recommend|compare)(?:\s+(?:me|the|only|first|best))*\s+(\d+|one|two|three|four|five)\b|\b(\d+|one|two|three|four|five)\s+(?:(?:good|best|suitable)\s+)?(?:options|products|alternatives)\b/i;
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

// A product goal and its constraints have separate lifecycles. Asking for more
// candidates is discovery, but is not by itself permission to discard requirements.
const discoveryPrefix = /^(?:(?:please|actually|instead|now|then)\s+)*(?:(?:can|could|would)\s+you\s+)?(?:find|show|suggest|recommend|search(?:\s+for)?|look\s+for|i\s+(?:want|need)(?:\s+to\s+buy)?)\b\s*/i;
const resetTaskPattern = /\b(?:start\s+over|start\s+(?:a\s+)?new\s+(?:search|task)|forget\s+(?:the\s+)?(?:previous|old)\s+(?:search|task|requirements|constraints))\b/i;
const removeBudgetPattern = /\b(?:remove|drop|ignore|clear)\s+(?:the\s+)?(?:budget|price limit)\b|\b(?:no|without)\s+(?:a\s+)?(?:budget|price limit)\b/i;
const removeFragrancePattern = /\b(?:remove|drop|ignore|clear)\s+(?:the\s+)?fragrance(?:[ -]free)?\s+(?:requirement|constraint)\b|\b(?:not|don't|don’t|no longer)\s+(?:need|require)\s+fragrance[ -]free|\bfragrance[ -]free\s+(?:is\s+)?(?:not|no longer)\s+(?:required|necessary)\b/i;
const goalCategory = (value: string) => value.match(categoryPattern)?.[1]?.toLowerCase().replace('moisturiser', 'moisturizer');
const categoryKey = (value?: string) => value?.replace(/s$/, '');

// The vocabulary above is only for UI category hints. Arbitrary nouns are kept
// verbatim and compared lexically, not rejected or substituted by an allowlist.
export function discoveryGoal(query: string): string | undefined {
  const clauses = query.split(/(?:[.!?;]\s*|\bcompare\b|\bwhich\b|\bversus\b)/i);
  const clause = clauses.find((part) => discoveryPrefix.test(part.trim()))?.trim();
  if (!clause) return undefined;
  const goal = clause.replace(discoveryPrefix, '').replace(budgetPattern, '').replace(fragrancePattern, '')
    .replace(/\b(?:keep|retain|using|with)\s+(?:the\s+)?(?:same\s+)?(?:budget|constraints|requirements|preferences)\b.*$/i, '')
    .replace(removeBudgetPattern, '').replace(removeFragrancePattern, '')
    .replace(/^(?:me\s+)?(?:(?:a|an|the|only|first|best|new|other|more|another|some|same|one|two|three|four|five|\d+)\s+)*/i, '')
    .replace(/\b(?:again|please)\s*$/i, '').replace(/(?:\s+(?:and|with|but|for)|[,;])\s*$/i, '').replace(/\s+/g, ' ').trim();
  if (/\b(?:first|second|third|these|those|both|shown|displayed)\b/i.test(goal) && /\b(?:evidence|ingredients?|prices?|sizes?|details|retailers?|reviews?)\b/i.test(goal)) return undefined;
  if (!goal || /^(?:more|another|other|same|something else)$/i.test(goal) || /^(?:options?|products?|alternatives?|ones?|items?|results?)(?:\s+(?:for|from|like|in|of|to)\b.*)?$/i.test(goal) || /^(?:(?:of\s+)?(?:these|those|them)|my brief|the same|something cheaper|cheaper alternatives?)\b/i.test(goal)) return undefined;
  return goal;
}

export type ShoppingTransition = { kind: 'replace' | 'continue'; goal?: string; category?: string };
export function shoppingTransition(query: string, previous: ShoppingBrief): ShoppingTransition {
  const goal = discoveryGoal(query);
  // Comparison titles are references, not new category declarations.
  const category = goalCategory(goal || (!isDecisionQuery(query) ? query : ''));
  const goalWords = (value: string) => value.toLowerCase().split(/\b(?:for|with|without|from|like|in)\b/)[0].replace(/^(?:a|an|the)\s+/, '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean).map((word) => word.replace(/s$/, ''));
  const nextWords = goalWords(goal || '');
  const oldWords = goalWords(previous.intent);
  const sameWords = nextWords.join(' ') === oldWords.join(' ');
  const addsModifiers = oldWords.length > 0 && nextWords.slice(-oldWords.length).join(' ') === oldWords.join(' ');
  const explicitlyContinues = /\b(?:more|other|another|same|again)\b/i.test(query);
  const sameHeadContinuation = explicitlyContinues && nextWords.length > 0 && oldWords.length > 0 && nextWords[nextWords.length - 1] === oldWords[oldWords.length - 1];
  const sameGoal = Boolean(goal && (sameWords || addsModifiers || sameHeadContinuation || (category && categoryKey(category) === categoryKey(previous.category))));
  const changedCategory = Boolean(category && previous.category && categoryKey(category) !== categoryKey(previous.category));
  const replace = resetTaskPattern.test(query) || Boolean(goal && !sameGoal) || (!goal && changedCategory);
  return { kind: replace ? 'replace' : 'continue', goal, category };
}

export function unsupportedShoppingRequest(query: string): boolean {
  const text = query.trim();
  // Explicit product discovery is supported; a medical explanation or a
  // different kind of task must not silently execute the prior product search.
  const requestedGoal = discoveryGoal(text);
  if (requestedGoal && /^(?:(?:a|an|the)\s+)?(?:diagnosis|cause|reason|treatment(?:\s+plan)?|medical advice|prescription)\b/i.test(requestedGoal) && !categoryPattern.test(requestedGoal)) return true;
  if (requestedGoal) return false;
  if (/^(?:diagnose|prescribe|treat|write|draft|email|send|translate|calculate|book|cancel|play|code)\b/i.test(text)) return true;
  if (/^(?:what|why|how|can|could|should|does|is|explain|tell me)\b/i.test(text)) {
    if (/\b(?:diagnose|prescribe|treat|cure|symptoms?|side effects?|use|apply|take|safe|mix|combine)\b/i.test(text)) return true;
    return !/\b(?:compare|comparison|first|second|third|these|those|both|shown|displayed|which of|this product|that product)\b/i.test(text);
  }
  return false;
}

export function deriveBrief(query: string, previous: ShoppingBrief = { intent: '' }): ShoppingBrief {
  const transition = shoppingTransition(query, previous);
  const retainAll = /\b(?:keep|retain|same|previous)\s+(?:(?:the|same|previous)\s+)?(?:constraints|requirements|preferences)\b/i.test(query);
  const retainBudget = /\b(?:keep|retain|same|previous)\s+(?:(?:the|same|previous)\s+)?budget\b/i.test(query);
  const retainFragrance = /\b(?:keep|retain)\s+(?:the\s+)?fragrance[ -]free\s+(?:constraint|requirement)\b/i.test(query);
  const base: ShoppingBrief = transition.kind === 'replace'
    ? { intent: '', ...(retainAll || retainFragrance ? { fragranceFree: previous.fragranceFree } : {}), ...(retainAll || retainBudget ? { budget: previous.budget } : {}) }
    : previous;
  const budgetMatch = query.match(budgetPattern);
  let budget = base.budget;
  if (budgetMatch) {
    const currency = (budgetMatch[2] || budgetMatch[5] || ({ '$': 'USD', '€': 'EUR', '£': 'GBP' }[budgetMatch[3]]) || base.budget?.currency || '').toUpperCase().replace(/^DOLLARS?$/, 'USD').replace(/^EUROS?$/, 'EUR').replace(/^POUNDS?$/, 'GBP');
    if (currency && Number(budgetMatch[4]) > 0) budget = { currency, amount: Number(budgetMatch[4]), exclusive: /under|below|less than/i.test(budgetMatch[1]) };
  }
  if (removeBudgetPattern.test(query)) budget = undefined;
  let fragranceFree = base.fragranceFree;
  if (removeFragrancePattern.test(query)) fragranceFree = undefined;
  else if (fragrancePattern.test(query)) fragranceFree = true;
  const countMatch = query.match(countPattern);
  const countText = countMatch?.[1] || countMatch?.[2];
  const requestedCount = countText ? Math.min(12, numberWords[countText.toLowerCase()] || Number(countText)) : base.requestedCount;
  // Constraint and comparison language never becomes part of the search goal.
  const intent = transition.goal || base.intent || transition.category || '';
  return { ...base, ...(transition.category ? { category: transition.category } : {}), budget, fragranceFree, requestedCount, intent };
}

export function queryForBrief(brief: ShoppingBrief): string {
  return [brief.intent || brief.category || 'products', brief.fragranceFree ? 'fragrance-free required' : '', brief.budget ? `${brief.budget.exclusive ? 'under' : 'up to'} ${brief.budget.currency} ${brief.budget.amount}` : ''].filter(Boolean).join('. ');
}
export function productKey(product: ProductResponse): string {
  return JSON.stringify([product.product_id, product.merchant_id || '', product.variant_id || product.product_ref?.variant_id || '', product.default_offer_id || '', product.currency || '']);
}
export function hasExplicitCategory(query: string): boolean {
  return categoryPattern.test(query);
}
export function isDecisionQuery(query: string): boolean {
  return /\b(compare|comparison|versus|vs\.?|first|second|third|trade[ -]?offs?|which|ingredients?|evidence|water resistance|zinc oxide)\b/i.test(query);
}
export function contextualSuggestions(brief: ShoppingBrief, hasProducts: boolean): string[] {
  if (!hasProducts) return brief.category ? ['Find options for my brief', 'Change my budget'] : ['Find a moisturizer under $30', 'Help me compare two products'];
  const beauty = /moisturi|cleanser|serum|sunscreen|shampoo|conditioner|lipstick|foundation|blush/.test(brief.category || '');
  return beauty ? ['Compare the first two', 'Check ingredient evidence', 'Find alternatives'] : ['Compare the first two', 'Compare sizes and prices', 'Find alternatives'];
}
