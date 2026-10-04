import { sendMessage, getPdpV2, type ProductResponse } from '@/lib/api';
import { buildDecisionReport, resolveComparison } from './decision';
import { summarizeDecisionItems } from './evidenceFreshness';
import { isDecisionQuery, hasExplicitCategory, discoveryGoal, shoppingTransition, unsupportedShoppingRequest, productKey, queryForBrief, type ShoppingTask, type ShoppingBrief } from './model';
import type { Message } from '@/store/chatStore';

type SendOptions = NonNullable<Parameters<typeof sendMessage>[2]>;
export async function runShoppingTurn(
  query: string,
  task: ShoppingTask,
  brief: ShoppingBrief,
  options: SendOptions,
  dependencies = { search: sendMessage, readPdp: getPdpV2 },
): Promise<{ message: Omit<Message, 'timestamp'>; taskPatch: Partial<ShoppingTask> }> {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  if (unsupportedShoppingRequest(query)) return { message: { id, role: 'assistant', content: 'This shopping task can find products and compare their sourced information. Do you want to start a new product search, or compare products already shown?' }, taskPatch: {} };
  const decisionRequested = isDecisionQuery(query);
  const existing = task.displayedProducts;
  const changedCategory = shoppingTransition(query, task.brief).kind === 'replace';
  const discoveryClause = query.split(/\b(?:compare|which|versus)\b/i)[0];
  const discoverVerb = /\b(?:find|search|recommend|suggest|look for|show\s+(?:me\s+)?(?:new|other|more|alternatives))\b/i.test(discoveryClause);
  const referencesExisting = /\b(?:first|second|third|these|those|both|shown|displayed)\b/i.test(discoveryClause);
  const asksAlternatives = /\b(?:alternatives|new|other|more)\b/i.test(discoveryClause);
  const explicitDiscovery = Boolean(discoveryGoal(query)) || discoverVerb && (!referencesExisting || hasExplicitCategory(discoveryClause) || asksAlternatives);
  const referenceOnly = decisionRequested && existing.length > 0 && !changedCategory && !explicitDiscovery;
  let products: ProductResponse[];
  let searchResult: Awaited<ReturnType<typeof sendMessage>> | undefined;
  if (referenceOnly) {
    const selection = resolveComparison(query, existing);
    if (selection.clarification) return { message: { id, role: 'assistant', content: selection.clarification }, taskPatch: {} };
    products = selection.products;
  } else {
    if (decisionRequested && /\b(first|second|these|those|both|pair|shown)\b/i.test(query) && !brief.category) return { message: { id, role: 'assistant', content: 'There are no products in this task yet. Tell me which products to find first.' }, taskPatch: {} };
    const searchQuery = queryForBrief(brief);
    searchResult = await dependencies.search(searchQuery, undefined, { ...options, pagination: { page: 1, limit: 12 } });
    products = Array.isArray(searchResult.products) ? searchResult.products : [];
    products = products.filter((product, index) => products.findIndex((other) => productKey(other) === productKey(product)) === index);
    if (!products.length) return {
      message: { id, role: 'assistant', kind: searchResult.strict_empty ? 'error' : 'reply', content: searchResult.reply || 'No reliable catalog results were returned. Your brief is saved; try again or change the requirements.' },
      taskPatch: changedCategory ? { displayedProducts: [] } : {}, // Old categories must not become the reference set for a new goal.
    };
    // Hydrate a bounded candidate pool before choosing the requested count.
    // Truncating first would let high-ranked but disqualified rows hide valid options.
    products = products.slice(0, 12);
  }
  const decision = await buildDecisionReport(products, brief, decisionRequested, dependencies.readPdp);
  // Evidence not present in the retrieved modules must remain explicit, including
  // task-specific questions rather than a generic successful-search sentence.
  if (/zinc\s+oxide/i.test(query)) decision.items.forEach((item) => {
    const zinc = item.sources.some((source) => source.label === 'Catalog ingredient source') && item.ingredientEvidence.match(/zinc\s+oxide\s*[:(]?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (zinc) item.tradeoffs.push(`Sourced ingredient field lists zinc oxide ${zinc[1]}%.`);
    else item.missing.push('Verified zinc oxide percentage');
  });
  if (/water[ -]resistan/i.test(query)) decision.items.forEach((item) => item.missing.push('Verified water-resistance duration and test evidence'));
  const eligible = decision.items.filter((item) => item.eligibility !== 'rejected');
  const rankedEligible = [...eligible].sort((a, b) => Number(a.eligibility !== 'candidate') - Number(b.eligibility !== 'candidate'));
  const shown = referenceOnly ? decision.items : rankedEligible.slice(0, brief.requestedCount || (decisionRequested ? 2 : 12));
  const excluded = referenceOnly ? 0 : decision.items.length - eligible.length;
  const content = `${decisionRequested ? `Comparing ${shown.length} ${shown.length === 1 ? 'product' : 'products'} from this task.` : `Found ${shown.length} ${shown.length === 1 ? 'candidate' : 'candidates'} to review.`}${excluded ? ` ${excluded} product${excluded === 1 ? ' was' : 's were'} excluded for a known requirement conflict.` : ''}`;
  return {
    message: { id, role: 'assistant', kind: decisionRequested ? 'comparison' : 'reply', content, products: shown.map((item) => item.product), decision: { ...decision, items: shown, summary: summarizeDecisionItems(shown, brief.fragranceFree) }, recommendation_paging: !decisionRequested && !brief.fragranceFree && !brief.requestedCount && searchResult?.page_info?.has_more ? { query: queryForBrief(brief), page: 1, limit: 12, hasMore: true, isLoadingMore: false, noGrowthCount: 0 } : undefined },
    // Bind ordinal references to the actual displayed order, not an independently
    // re-ranked shortlist. A comparison-only follow-up must keep its own pair.
    taskPatch: { displayedProducts: shown.map((item) => item.product) },
  };
}
