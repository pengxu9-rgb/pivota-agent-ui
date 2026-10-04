import { getPdpV2, type GetPdpV2Response, type ProductResponse } from '@/lib/api';
import { type DecisionProduct, type DecisionReport, type ShoppingBrief, productKey } from './model';
import { reviewedIngredientEvidence } from './reviewedEvidence';
import { isAffirmativeFragranceFreeClaim, isFreshObservation, MAX_EVIDENCE_AGE_MS, summarizeDecisionItems } from './evidenceFreshness';

const string = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
export function safeSourceUrl(value: unknown): string | undefined {
  try { const url = new URL(string(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function money(amount: unknown, currency: unknown): string {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(string(currency)) ? `${currency} ${amount.toFixed(2)}` : 'Price or currency not provided';
}
const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// A colon is punctuation, not proof that its contents name products. Recognize
// a bounded grammar of comparison criteria, then resolve only the remaining
// reference clause. Unknown/mixed clauses still ask rather than substituting IDs.
function isComparisonCriteria(value: string): boolean {
  const criterion = /^(?:(?:their|the|each|verified|sourced|available|current|unit|total|customer|ingredient|fragrance free)\s+)*(?:ingredients?|ingredient evidence|evidence|fragrance free(?: status| evidence)?|sizes?|prices?|costs?|retailers?|sellers?|trade offs?|tradeoffs?|reviews?|ratings?|availability|stock|value|dimensions?|weight|volume|materials?|colou?rs?|shades?|texture|finish|performance|features?|specifications?|specs|battery life|screen sizes?|water resistance|shipping|delivery|returns?|warranty)(?:\s+(?:evidence|status|information|details))?$/i;
  const parts = normalized(value).replace(/\b(?:and|versus|vs)\b/g, ',');
  // Preserve commas before normalization so a list cannot become one vague phrase.
  const segments = value.split(/[,;&]|\b(?:and|versus|vs\.?)\b/i).map(normalized).filter(Boolean);
  return Boolean(parts && segments.length && segments.every((segment) => criterion.test(segment)));
}
function comparisonReferenceClause(query: string): { references: string; namingClause?: string } {
  let references = query.split(/[.!?](?:\s|$)/)[0];
  const criteriaSuffix = /\b(?:using|by|on|with|in terms of|based on)\s+(.+)$/i.exec(references);
  if (criteriaSuffix && isComparisonCriteria(criteriaSuffix[1])) references = references.slice(0, criteriaSuffix.index).trim();
  const colon = references.indexOf(':');
  if (colon < 0) return { references };
  const tail = references.slice(colon + 1).trim();
  if (isComparisonCriteria(tail)) return { references: references.slice(0, colon) };
  return { references, namingClause: tail };
}

/** Resolve references only within the displayed set. Ambiguity is a question,
 * never permission to run another search or choose a different seller. */
export function resolveComparison(query: string, displayed: ProductResponse[]): { products: ProductResponse[]; clarification?: string } {
  const unique = displayed.filter((p, index) => displayed.findIndex((other) => productKey(other) === productKey(p)) === index);
  if (!unique.length) return { products: [], clarification: 'There are no products in this task yet. Tell me which products to find.' };
  const { references, namingClause } = comparisonReferenceClause(query);
  const text = normalized(references);
  const named = unique.filter((p) => {
    const title = normalized(p.title);
    const withoutBrand = title.replace(new RegExp(`^${normalized(p.brand || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`), '');
    return [title, withoutBrand].some((name) => name.length > 4 && text.includes(name));
  });
  // A title shared by multiple seller/variant rows cannot resolve an exact item.
  if (named.length > 1 && new Set(named.map((p) => normalized(p.title))).size < named.length) return { products: [], clarification: 'That name matches more than one seller or variant. Please choose the numbered products to compare.' };
  const ordinalMap: Record<string, number> = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, '1st': 0, '2nd': 1, '3rd': 2 };
  const ordinalTokens = [...references.toLowerCase().matchAll(/\b(first|second|third|fourth|fifth|1st|2nd|3rd)\b/g)];
  let ordinals = ordinalTokens.map((match) => ordinalMap[match[1]]);
  const firstCountMatch = references.match(/\bfirst\s+(two|three|four|five|[2-9]|1[0-2])\b/i);
  const firstCount = firstCountMatch?.[1]?.toLowerCase();
  if (firstCount) ordinals = Array.from({ length: ({ two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[firstCount] || Number(firstCount) }, (_, index) => index);
  const numbered = [...references.matchAll(/(?:#|\b(?:product|option)\s+)(\d+)\b/gi)].map((m) => Number(m[1]) - 1);
  ordinals = [...new Set([...ordinals, ...numbered])];
  if (ordinals.some((index) => !unique[index])) return { products: [], clarification: 'That numbered product is not in the displayed set. Choose one of the products shown in this task.' };
  if (named.length === 1 && /\b(vs\.?|versus)\b/i.test(references)) return { products: [], clarification: 'I could not resolve both named products in the displayed set. Please choose their exact names or numbered positions.' };
  // Every explicit name in a naming clause must resolve. Matching two names
  // must not hide an absent third; ordinal positions cannot fill a missing name.
  const ordinalEnd = Math.max(0, ...ordinalTokens.map((match) => match.index! + match[0].length), firstCountMatch ? firstCountMatch.index! + firstCountMatch[0].length : 0);
  const ordinalTail = ordinalEnd ? references.slice(ordinalEnd).replace(/^[\s,:()\-]+/, '').trim() : '';
  const explicitNames = namingClause ?? (ordinalTail && !/^(?:please|only)$/i.test(ordinalTail) && !isComparisonCriteria(ordinalTail) ? ordinalTail : undefined);
  if (explicitNames !== undefined) {
    let remainder = normalized(explicitNames);
    const names = named.flatMap((product) => {
      const title = normalized(product.title);
      const brand = normalized(product.brand || '');
      return [title, ...(brand && title.startsWith(`${brand} `) ? [title.slice(brand.length + 1)] : [])];
    }).sort((a, b) => b.length - a.length);
    for (const name of names) remainder = remainder.split(name).join(' ');
    remainder = remainder.replace(/\b(?:and|versus|vs|with|the)\b/g, '').trim();
    if (remainder || !named.length || (ordinals.length && named.length !== ordinals.length)) return { products: [], clarification: 'I could not resolve every named product or comparison criterion. Please choose exact displayed names or numbered positions, and list comparison criteria separately.' };
  }
  if (ordinals.length && named.length === 0 && /\b(?:versus|vs\.?)\b/i.test(references)) return { products: [], clarification: 'Those named products are not in the displayed set. Please choose the products shown in this task.' };
  if (named.length === 1 && /\band\b/i.test(references)) return { products: [], clarification: 'I could not resolve both named products in the displayed set. Please choose their exact names or numbered positions.' };
  if (ordinals.length) {
    const selected = ordinals.map((index) => unique[index]);
    if (named.some((p) => !selected.some((s) => productKey(s) === productKey(p)))) return { products: [], clarification: 'The product names and positions refer to different items. Please choose the names or numbered positions to compare.' };
    return { products: selected };
  }
  if (named.length) {
    if (named.length === 1 && /\b(vs\.?|versus|and)\b/i.test(references)) return { products: [], clarification: 'I found one named product in this task, but could not resolve the other. Please choose the other product shown here.' };
    return { products: named };
  }
  if (/\b(versus|vs\.?)\b/i.test(references)) return { products: [], clarification: 'Those names do not uniquely match the products shown here. Please choose their numbered positions.' };
  if (/\b(two|2|both|pair)\b/i.test(references) || unique.length <= 2) return { products: unique.slice(0, 2) };
  return { products: [], clarification: 'Which products should I compare? You can say “the first two” or give their names.' };
}

function canonicalPayload(result: GetPdpV2Response | undefined, product: ProductResponse) {
  const response = record(result);
  const outer = array(response.modules);
  const canonical = record(outer.find((m) => m.type === 'canonical')?.data);
  const payload = record(canonical.pdp_payload || response.pdp_payload || (response.product ? response : undefined));
  const p = record(payload.product);
  // Keep IDs paired with their own seller. An ID from entry_product_ref for
  // another merchant cannot borrow the payload seller to validate foreign facts.
  const seller = string(p.merchant_id);
  const payloadRefs = [p.product_id, p.pivota_signature_id, p.source_product_id]
    .filter((id) => typeof id === 'string').map((id) => ({ product_id: id, merchant_id: seller }));
  const matches = payloadRefs.some((ref) => ref.product_id === product.product_id && Boolean(ref.merchant_id) && (!product.merchant_id || ref.merchant_id === product.merchant_id));
  const declaredRefs = [canonical.entry_product_ref, canonical.canonical_payload_product_ref].map(record);
  const contradictoryRef = Boolean(product.merchant_id) && declaredRefs.some((ref) => ref.product_id === product.product_id && ref.merchant_id && ref.merchant_id !== product.merchant_id);
  const responseAvailable = !response.status || ['success', 'ok'].includes(string(response.status).toLowerCase());
  const valid = matches && !contradictoryRef && responseAvailable;

  return { valid, contentStates: valid ? record(payload.x_content_module_states) : {}, product: valid ? p : {}, modules: valid ? [...outer.filter((m) => m.type !== 'canonical'), ...array(payload.modules)] : [] };
}

export function evaluateProduct(product: ProductResponse, result: GetPdpV2Response | undefined, brief: ShoppingBrief, now = new Date()): DecisionProduct {
  const canonical = canonicalPayload(result, product);
  const p = canonical.product;
  const modules = canonical.modules;
  const sourceUrl = safeSourceUrl(p.source_url || p.destination_url || p.external_redirect_url || product.source_url || product.external_redirect_url || product.product_url);
  const sources: DecisionProduct['sources'] = [];
  const missing: string[] = [];
  if (!canonical.valid) missing.push('Canonical details unavailable or identity could not be verified');
  const ingredientModules = modules.filter((module) => module.type === 'ingredients_inci');
  const ingredientData = record(ingredientModules[0]?.data);
  const rawState = canonical.contentStates.ingredients_inci;
  const ingredientState = record(rawState);
  const availabilityStates = [typeof rawState === 'string' ? rawState : ingredientState.state || ingredientState.status,
    ...ingredientModules.flatMap((module) => [module.data?.availability_state, module.data?.state, module.data?.status])]
    .map(string).filter(Boolean).map((value) => value.toLowerCase());
  const ingredientAvailable = !availabilityStates.some((state) => !['ready', 'available', 'captured', 'success'].includes(state)) && ingredientModules.every((module) => module.data?.available !== false && !/unavailable|timeout|failed|not_captured|not_requested/i.test(string(module.reason)));
  const completeAndUsable = ingredientModules.every((module) => {
    const data = record(module.data);
    const quality = string(data.source_quality_status).toLowerCase();
    const declaredScope = [data.authority_scope, data.authorityScope, data.source_scope, data.sourceScope, data.scope, data.title].map(string).join(' ');
    const partialScope = /not[_ -]full[_ -]inci|partial|key[_ -]ingredients/i.test(declaredScope);
    return !partialScope && data.is_complete !== false && data.partial !== true && data.truncated !== true && !['partial', 'incomplete', 'truncated'].includes(string(data.completeness).toLowerCase()) && (!quality || ['authoritative', 'captured', 'verified', 'ready'].includes(quality));
  });
  const observed = string(ingredientData.source_observed_at || ingredientData.observed_at || ingredientData.captured_at || ingredientState.source_observed_at);
  const allIngredientFields = ingredientModules.flatMap((module) => {
    const data = record(module.data);
    return [string(data.raw_text), array(data.items).map((item) => typeof item === 'string' ? item : string(item?.name || item?.ingredient)).filter(Boolean).join(', ')].filter(Boolean);
  });
  const rawIngredients = string(ingredientData.raw_text) || allIngredientFields[0] || '';
  const contaminated = allIngredientFields.some((field) => /\b(how\s+to\s+use|directions|apply\s+(?:a|to|daily)|morning\s+and\s+night)\b/i.test(field));
  const ingredientText = rawIngredients.split(/\b(?:how\s+to\s+use|directions)\b/i)[0].trim();
  const normalizeIngredients = (field: string) => field.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const consistent = new Set(allIngredientFields.map(normalizeIngredients)).size <= 1;
  const ingredientUrl = safeSourceUrl(ingredientData.source_url || ingredientState.source_url) || sourceUrl;
  if (rawIngredients && ingredientUrl) sources.push({ label: 'Catalog ingredient source', url: ingredientUrl, observedAt: observed || undefined, ...(!ingredientAvailable || !isFreshObservation(observed, now) ? { stale: true } : {}) });
  const reviewed = reviewedIngredientEvidence.find((e) => e.productId === product.product_id && e.merchantId === product.merchant_id && (!sourceUrl || sourceUrl === e.url));
  const reviewedStale = reviewed ? now.getTime() >= new Date(reviewed.recheckAfter).getTime() : false;
  if (reviewed) sources.push({ label: reviewed.excerptOnly ? 'Reviewed retailer ingredient excerpt' : 'Reviewed retailer ingredient panel', url: reviewed.url, observedAt: reviewed.observedAt, stale: reviewedStale });
  // All representations must agree. A clean raw_text cannot hide Parfum in items,
  // and a stale nested module cannot be overruled by a generic positive flag.
  const explicitClaim = string(ingredientData.fragrance_free_claim);
  const conflict = allIngredientFields.some((field) => /\b(?:fragrance|parfum|perfume)\b(?![ -]free)/i.test(field.split(/\b(?:how\s+to\s+use|directions)\b/i)[0])) || reviewed?.conflict;
  const ingredientFieldsAreLists = !allIngredientFields.some((field) => /\b(?:fragrance|parfum|perfume)[ -]free\b/i.test(field));
  const verified = !conflict && !contaminated && ingredientFieldsAreLists && consistent && completeAndUsable && ingredientAvailable && canonical.valid && Boolean(product.merchant_id) &&
    Boolean(ingredientText && ingredientUrl) && ingredientData.is_complete === true &&
    ingredientModules.every((module) => module.data?.is_complete !== false && (!module.data?.fragrance_free_claim || isAffirmativeFragranceFreeClaim(module.data.fragrance_free_claim))) &&
    isAffirmativeFragranceFreeClaim(explicitClaim) && isFreshObservation(observed, now);
  const fragrance = conflict ? 'conflict' : verified ? 'verified' : 'unverified';
  const verification: DecisionProduct['verification'] = verified ? { productId: product.product_id, merchantId: product.merchant_id!, sourceUrl: ingredientUrl!, observedAt: observed, expiresAt: new Date(Date.parse(observed) + MAX_EVIDENCE_AGE_MS).toISOString(), claim: explicitClaim, ingredients: ingredientText, complete: true, available: true } : undefined;
  const excerpt = ingredientText || reviewed?.ingredients;
  let ingredientEvidence = excerpt ? `${ingredientText ? 'Catalog ingredient field' : reviewed?.excerptOnly ? 'Reviewed retailer excerpt' : 'Reviewed retailer ingredient panel'}: ${excerpt}` : 'No full ingredient list is available in the returned product evidence.';
  if (!consistent) {
    ingredientEvidence += ` The ingredient representations disagree. Other returned ingredient fields: ${allIngredientFields.filter((field) => field !== rawIngredients).join(' | ')}`;
    missing.push('A consistent ingredient list across the returned source fields');
  }
  if (!ingredientAvailable) { ingredientEvidence += ' The ingredient module is unavailable; retained content is not current verified evidence.'; missing.push('Available current ingredient evidence'); }
  if (contaminated) { ingredientEvidence += ' The returned field contains usage prose; it is not treated as a complete verified ingredient list.'; missing.push('A clean, complete ingredient list'); }
  if (reviewed?.conflict && !ingredientText.includes(reviewed.ingredients)) ingredientEvidence += ` Reviewed retailer ingredients also list ${reviewed.ingredients}.`;
  if (reviewedStale) ingredientEvidence += ' The reviewed retailer observation is older than 30 days and needs rechecking; the earlier conflict is not assumed resolved.';
  if (brief.fragranceFree && fragrance === 'unverified') missing.push('Verified fragrance-free claim with complete, dated ingredient evidence');

  const variants = array(p.variants);
  const variantId = string(product.variant_id || product.product_ref?.variant_id || p.default_variant_id);
  const variant = variants.find((v) => string(v.variant_id || v.id) === variantId);
  const priceObject = record(record(variant?.price).current || variant?.price);
  const variantUnavailable = variant?.current_own_offer_status === 'unavailable';
  const unresolvedVariant = Boolean(variantId && !variant);
  const zeroInventory = [p.availability?.available_quantity, variant?.availability?.available_quantity, variant?.available_quantity].some((quantity) => typeof quantity === 'number' && quantity <= 0);
  const outOfStock = product.in_stock === false || p.in_stock === false || p.availability?.in_stock === false || variant?.availability?.in_stock === false || variant?.in_stock === false || zeroInventory;
  // An exact requested/default variant must resolve its own current money.
  // Neither listing money nor a sibling variant may fill an absent match.
  const exactAmount = variantUnavailable || unresolvedVariant ? undefined : variant ? priceObject.amount : product.price;
  const exactCurrency = variantUnavailable || unresolvedVariant ? undefined : variant ? priceObject.currency : product.currency;
  const price = variantUnavailable || unresolvedVariant ? 'Price unavailable for this variant' : money(exactAmount, exactCurrency);
  if (variantUnavailable || unresolvedVariant) missing.push('A current sellable offer for this exact variant');
  const size = string(variant?.title) || string(product.attributes?.size) || product.title.match(/\b\d+(?:\.\d+)?\s*(?:ml|g|oz|fl\s*oz|l)\b/i)?.[0] || 'Size not provided';
  const retailer = string(product.merchant_name) || (sourceUrl ? new URL(sourceUrl).hostname : 'Retailer not provided');
  if (size === 'Size not provided') missing.push('Size of the displayed offer');
  if (price === 'Price or currency not provided') missing.push('Price and ISO currency');
  if (!variantId) missing.push('Exact variant ID for the displayed offer');
  const alternatives = variants.filter((v) => string(v.variant_id || v.id) !== variantId).map((v) => {
    const price = record(record(v.price).current || v.price);
    return `${string(v.title) || 'Unnamed variant'}: ${v.current_own_offer_status === 'unavailable' ? 'Price unavailable for this variant' : money(price.amount, price.currency)} (variant ${string(v.variant_id || v.id) || 'unavailable'})`;
  });
  const tradeoffs: string[] = [];
  let eligibility: DecisionProduct['eligibility'] = outOfStock || unresolvedVariant || variantUnavailable || (brief.fragranceFree && fragrance === 'conflict') ? 'rejected' : (brief.fragranceFree && fragrance !== 'verified') || price === 'Price or currency not provided' ? 'unverified' : 'candidate';
  if (outOfStock) tradeoffs.push('Rejected for this brief: the product or exact variant is out of stock.');
  if (unresolvedVariant) tradeoffs.push('Rejected for this brief: the exact variant could not be resolved with its own price.');
  if (variantUnavailable) tradeoffs.push('Rejected for this brief: a current price for this exact variant is unavailable.');
  if (brief.fragranceFree) tradeoffs.push(fragrance === 'conflict' ? 'Rejected for this brief: ingredient evidence lists fragrance, conflicting with the fragrance-free requirement.' : fragrance === 'verified' ? 'Source explicitly supports fragrance-free; review the linked ingredient list.' : 'Fragrance-free is unverified. Absence of a fragrance word in an ingredient list is not a verified free-from claim.');
  if (brief.budget) {
    const amount = exactAmount;
    const currency = exactCurrency;
    if (currency !== brief.budget.currency) {
      if (eligibility !== 'rejected') eligibility = 'unverified';
      tradeoffs.push(`Budget is ${brief.budget.currency}; no currency conversion applied.`);
    } else if (typeof amount === 'number' && amount > 0) {
      const withinBudget = brief.budget.exclusive ? amount < brief.budget.amount : amount <= brief.budget.amount;
      if (!withinBudget) eligibility = 'rejected';
      tradeoffs.push(withinBudget ? 'Listed item price is within budget; shipping and tax are not included.' : 'Rejected for this brief: listed item price does not meet your budget.');
    }
  }
  if (sourceUrl && !sources.some((source) => source.url === sourceUrl)) sources.push({ label: 'Retailer product page', url: sourceUrl });
  return { product, eligibility, fragrance, ...(verification ? { verification } : {}), ingredientEvidence, sources, size, price, retailer, variantId: variantId || undefined, alternatives, tradeoffs, missing };
}

export async function buildDecisionReport(products: ProductResponse[], brief: ShoppingBrief, compared: boolean, readPdp: typeof getPdpV2 = getPdpV2): Promise<DecisionReport> {
  const items = await Promise.all(products.map(async (product) => {
    try {
      const result = await readPdp({ product_id: product.product_id, merchant_id: product.merchant_id, include: ['ingredients_inci', 'active_ingredients', 'product_overview', 'offers', 'variant_selector'], timeout_ms: 12000 });
      return evaluateProduct(product, result, brief);
    } catch { return evaluateProduct(product, undefined, brief); }
  }));
  const summary = summarizeDecisionItems(items, brief.fragranceFree);
  return { summary, items, compared, fragranceRequired: brief.fragranceFree === true, includeIngredients: brief.fragranceFree === true || /moisturi|cleanser|serum|sunscreen|shampoo|conditioner|lipstick|foundation|blush/.test(brief.category || '') };
}
