import type { PDPPayload, ProductIntelCoreData, ProductIntelData } from '@/features/pdp/types';

export function productIntelEvidenceLabel(profile?: string, communityAvailable = false): string {
  const key = String(profile || '').trim().toLowerCase();
  if (key === 'seller_only' || key === 'seller_plus_formula') return 'Based on product and brand information';
  if (key === 'community_supported' && communityAvailable) return 'Includes product and community information';
  return 'Based on product data';
}

// Evaluation notes describe our review process, rather than the product. Reject
// the complete field/row so text hidden inside a collapsed <details> stays private.
export function isInternalInsightCopy(value: unknown): boolean {
  const text = normalizeWhitespace(String(value || '').replace(/<[^>]*>/g, ' ')).toLowerCase();
  return [
    /\breviewed\s+(?:[a-z-]+\s+){0,4}(?:cues?|usage context)\b/,
    /\bbefore\s+(?:the\s+)?(?:shopper|user)\s+(?:leaves? pivota|clicks? through)\b/,
    /\b(?:reducing|reduce) ambiguity\b/,
    /\bvariant labels?\s+(?:such as|are visible)\b/,
    /\b(?:lip finish cues are specific|shade and size are explicit|usage instructions available)\b/,
    /\b(?:component pairing is clear|finish role is easy to compare)\b/,
    /\b(?:the pdp identifies (?:the )?paired components|the stored product facts call out)\b/,
    /\b(?:human_standard|strict_human|official_pdp_manual_review|field_sources|quality_improvement|gemini_quality_gate)(?:_[a-z0-9]+)*\b/,
    /\b(?:review criteria|evaluation criteria|internal standards?|quality gate|reviewer kind|selection strategy)\b/,
    /\breviewed (?:pdp|sku|lip|color|scent|nail(?:-polish|-care)?|set|mist|complexion|primer|skincare|shimmer|spf|tool|oral-care) (?:cues|fields)\b/,
    /\breviewed (?:key-ingredient fields|directions)\b/,
    /\b(?:reviewed and normalized by pivota|pivota-reviewed|source-backed (?:scent |ingredient )?cues (?:around|including))\b/,
    /\b(?:available variants clarify|an ingredient list is available for formula review)\b/,
    /\b(?:cues|shade and size|configuration|accessory format|sample format|application sequence|shade selection) (?:are|is) (?:specific|explicit|clear|unambiguous|source-backed)\b/,
    /\b(?:before (?:the shopper|a shopper|leaving).*pivota|before a shopper clicks through)\b/,
    /\b(?:full inci is present for formula-sensitive review|safer to evaluate than a claim-only listing)\b/,
    /\b(?:without (?:inventing unsupported|treating (?:it|the parent row)|turning (?:it|regulated language))|rather than (?:category-only|unsupported benefit) copy)\b/,
    /\b(?:official pdp evidence only|insight is limited to the official product fields|public copy is kept to ingredient-level context|generic (?:color-copy|scent copy|blush\/bronzer\/highlighter card|default variant))\b/,
  ].some((pattern) => pattern.test(text));
}

function shopperText(value: unknown): string {
  return typeof value === 'string' && !isInternalInsightCopy(value) ? normalizeWhitespace(value) : '';
}

function shopperList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(shopperText).filter(Boolean) : [];
}

function shopperCore(core: ProductIntelCoreData): ProductIntelCoreData {
  return {
    what_it_is: {
      headline: shopperText(core.what_it_is?.headline),
      body: shopperText(core.what_it_is?.body),
    },
    best_for: Array.isArray(core.best_for) ? core.best_for
      .map((item) => ({ label: shopperText(item?.label || item?.tag) }))
      .filter((item) => item.label) : [],
    why_it_stands_out: Array.isArray(core.why_it_stands_out) ? core.why_it_stands_out
      .filter((item) => !isInternalInsightCopy(`${item?.headline || ''} ${item?.body || ''}`))
      .map((item) => ({ headline: shopperText(item?.headline), body: shopperText(item?.body) }))
      .filter((item) => item.headline || item.body) : [],
    routine_fit: {
      step: shopperText(core.routine_fit?.step),
      am_pm: shopperList(core.routine_fit?.am_pm),
      pairing_notes: shopperList(core.routine_fit?.pairing_notes),
    },
    watchouts: Array.isArray(core.watchouts) ? core.watchouts
      .map((item) => ({ label: shopperText(item?.label), severity: shopperText(item?.severity) }))
      .filter((item) => item.label) : [],
    quality_state: shopperText(core.quality_state),
    evidence_profile: shopperText(core.evidence_profile),
  };
}

/** Defense for old cached payloads. The gateway remains the public API boundary. */
export function projectPublicProductIntel(data: ProductIntelData): ProductIntelData {
  const core = data.product_intel_core ? shopperCore(data.product_intel_core) : undefined;
  // Compute legacy eligibility before discarding provenance. A gateway flag is
  // retained, with false/blocked/empty taking precedence, making this idempotent.
  const eligible = isDisplayableProductIntelData(data);
  const profile = core?.evidence_profile || data.evidence_profile || data.normalized_pdp?.evidence_profile;
  const community = data.community_signals;
  const claims = eligible && data.public_ready === true && Array.isArray(data.product_intel_core?.public_claims)
    ? data.product_intel_core.public_claims.map((claim) => ({
        claim_text: shopperText(claim?.claim_text),
        source_ref: shopperText(claim?.source_ref),
        concern: shopperText(claim?.concern),
        source_refs: shopperList(claim?.source_refs),
      })).filter((claim) => claim.claim_text)
    : [];
  return {
    display_name: shopperText(data.display_name) || 'Pivota Insights',
    public_display_eligible: eligible,
    public_ready: eligible && data.public_ready === true,
    product_intel_core: core ? { ...core, ...(claims.length ? { public_claims: claims } : {}) } : undefined,
    quality_state: shopperText(data.quality_state),
    evidence_profile: shopperText(profile),
    normalized_pdp: {
      quality_state: shopperText(data.normalized_pdp?.quality_state),
      evidence_profile: shopperText(data.normalized_pdp?.evidence_profile),
    },
    texture_finish: data.texture_finish ? {
      texture: shopperText(data.texture_finish.texture),
      finish: shopperText(data.texture_finish.finish),
    } : null,
    community_signals: profile === 'community_supported' && community?.status === 'available' ? {
      status: 'available',
      top_loves: shopperList(community.top_loves),
      top_complaints: shopperList(community.top_complaints),
    } : null,
  };
}

/** Called before both adapter output and server-to-client RSC serialization. */
export function projectPublicInsightsPayload(payload: PDPPayload): PDPPayload {
  const privateAliases = new Set([
    'raw', 'raw_detail', 'raw_payload', '_raw', 'product_intel', 'productIntel',
    'product_intel_bundle', 'provenance', 'agent_context', 'quality_improvement',
  ]);
  const stateDictionaries = new Set(['x_content_module_states', 'x_module_states', 'x_source_locks', 'x_height_spec']);
  const moduleStates = new Set(['ABSENT', 'LOADING', 'READY', 'EMPTY', 'ERROR']);
  const contentStates = new Set(['not_fetched', 'loading', 'ready', 'empty', 'unavailable', 'error', 'withheld', 'not_applicable']);
  const projectStateDictionary = (name: string, value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const states = name === 'x_module_states' ? moduleStates : contentStates;
    const recognizedState = (state: unknown): state is string => typeof state === 'string' && states.has(state);
    return Object.fromEntries(Object.entries(value).flatMap<[string, unknown]>(([moduleName, state]) => {
      if (name === 'x_source_locks') return typeof state === 'boolean' ? [[moduleName, state]] : [];
      if (name === 'x_height_spec') return typeof state === 'number' && Number.isFinite(state) ? [[moduleName, state]] : [];
      if (recognizedState(state)) return [[moduleName, state]];
      if (!state || typeof state !== 'object' || Array.isArray(state)) return [];
      // Backward-compatible structured readiness; arbitrary dossiers are omitted.
      const fields = Object.fromEntries(Object.entries(state).filter(([key, item]) =>
        (key === 'state' || key === 'status') && recognizedState(item),
      ));
      return Object.keys(fields).length ? [[moduleName, fields]] : [];
    }));
  };
  const stripAliases = <T extends object>(value: T): T => Object.fromEntries(
    Object.entries(value).filter(([key]) => !privateAliases.has(key)),
  ) as T;
  const stripNestedAliases = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const items = value.map(stripNestedAliases);
      return items.every((item, index) => item === value[index]) ? value : items;
    }
    const entries = Object.entries(value);
    const kept = entries.filter(([key]) => !privateAliases.has(key))
      .map(([key, item]) => [key, stateDictionaries.has(key) ? projectStateDictionary(key, item) : stripNestedAliases(item)] as const);
    return kept.length === entries.length && kept.every(([, item], index) => item === entries[index][1])
      ? value : Object.fromEntries(kept);
  };
  const publicPayload = Object.fromEntries(Object.entries(stripAliases(payload)).map(([key, value]) => {
    // Modules need their original provenance until eligibility is computed.
    // State dictionary values follow their scalar/legacy readiness contracts.
    return [key, key === 'modules' ? value : stateDictionaries.has(key) ? projectStateDictionary(key, value) : stripNestedAliases(value)];
  })) as unknown as PDPPayload;
  return {
    ...publicPayload,
    product: stripNestedAliases(payload.product) as PDPPayload['product'],
    modules: Array.isArray(payload.modules) ? payload.modules.map((module) => {
      if (module.type !== 'product_intel') return stripNestedAliases(module) as typeof module;
      const data = projectPublicProductIntel((module.data || {}) as ProductIntelData);
      return {
        module_id: module.module_id,
        type: module.type,
        priority: module.priority,
        title: data.display_name,
        data,
      };
    }) : payload.modules,
  };
}

function normalizeWhitespace(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGenericInsightText(value: unknown): boolean {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return false;
  return [
    /\bpresented through merchant product data\b/,
    /\blisting[-\s]?grounded\b/,
    /\bdefines? the product around the title\b/,
    /\bfocused on .* within a .* routine\b/,
    /\banchors? the product\b/,
    /\bdaytime uv step\b/,
    /\bdaytime skin-?care routines?\b/,
    /\bgeneral .* routine\b/,
    /\bproduct data\b.*\broutine\b/,
    /\broutine context\b/,
  ].some((pattern) => pattern.test(text));
}

function hasProductSpecificInsightText(value: unknown): boolean {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return false;
  return [
    /\bspf\s*\d+\b/,
    /\bzinc oxide\b/,
    /\btinted\b/,
    /\bshade\b/,
    /\bmineral\b/,
    /\bcoverage\b/,
    /\bfinish\b/,
    /\bretinol\b/,
    /\bvitamin\s*c\b/,
    /\bascorb(?:ic|yl)\b/,
    /\bhyaluronic\s+acid\b/,
    /\bniacinamide\b/,
    /\bceramide\b/,
    /\bpeptide\b/,
    /\bsuccinic\s+acid\b/,
    /\bsalicylic\s+acid\b/,
    /\bglycolic\s+acid\b/,
    /\blactic\s+acid\b/,
    /\baha\b/,
    /\bbha\b/,
    /\bpha\b/,
    /\bexfoliat(?:e|ing|ion)\b/,
    /\bcongestion[-\s]?prone\b/,
    /\bcleansing\s+treatment\b/,
    /\balcohol denat\b/,
    /\bbutyloctyl salicylate\b/,
    /\b1,2-hexanediol\b/,
    /\bclinical\b/,
    /\bsebum\b/,
    /\brice[-\s]?infused\b/,
  ].some((pattern) => pattern.test(text));
}

function isHumanReviewedProductIntelData(data: ProductIntelData | null | undefined): boolean {
  const provenance = data?.provenance || {};
  const qualityGate = provenance.gemini_quality_gate || {};
  const fieldSources = provenance.field_sources || {};
  const sourceVersion = normalizeWhitespace(data?.freshness?.source_version || data?.product_intel_core?.freshness?.source_version);
  const reviewStatus = normalizeWhitespace(provenance.review_status).toLowerCase();
  const reviewDecision = normalizeWhitespace(provenance.review_decision).toLowerCase();
  const generator = normalizeWhitespace(provenance.generator).toLowerCase();
  const reviewerKind = normalizeWhitespace(provenance.reviewer_kind).toLowerCase();
  const selectedStrategy = normalizeWhitespace(provenance.selection_strategy).toLowerCase();
  const hasHumanField = Object.values(fieldSources).some(
    (value) => normalizeWhitespace(value).toLowerCase() === 'human_standard',
  );

  if (sourceVersion === 'pilot_selected:strict_human_reviewed') return true;
  if (generator === 'strict_human_manual_rewrite') return true;
  if (hasHumanField && qualityGate.human_standard_rewrite === true) return true;
  return (
    reviewerKind === 'human' &&
    reviewStatus === 'completed' &&
    ['pass', 'rewrite'].includes(reviewDecision) &&
    selectedStrategy.includes('strict_human')
  );
}

function isAssistantReviewedSellerGroundedProductIntelData(data: ProductIntelData | null | undefined): boolean {
  const provenance = data?.provenance || {};
  const reviewStatus = normalizeWhitespace(provenance.review_status).toLowerCase();
  const reviewDecision = normalizeWhitespace(provenance.review_decision).toLowerCase();
  const reviewerKind = normalizeWhitespace(provenance.reviewer_kind).toLowerCase();
  const selectedStrategy = normalizeWhitespace(provenance.selection_strategy).toLowerCase();
  const evidenceProfile = normalizeWhitespace(
    data?.product_intel_core?.evidence_profile || (data as any)?.evidence_profile || (provenance as any).evidence_profile,
  ).toLowerCase();

  return (
    reviewerKind === 'assistant' &&
    reviewStatus === 'completed' &&
    ['pass', 'rewrite', 'seller_only_fallback'].includes(reviewDecision) &&
    selectedStrategy === 'curated_override' &&
    ['seller_only', 'seller_plus_formula'].includes(evidenceProfile)
  );
}

function isGenericBestForLabel(value: unknown): boolean {
  const text = normalizeWhitespace(value).toLowerCase();
  if (!text) return true;
  if (/\bshoppers?\b/.test(text)) return true;
  return /^(daily use|everyday use|daytime wear|daily uv protection|general use|all skin types?)$/.test(text);
}

export function displayableBestForLabels(items: Array<any> | null | undefined): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => normalizeWhitespace(item?.label || item?.tag))
    .filter((item) => item && !isGenericBestForLabel(item))
    .slice(0, 3);
}

export function isDisplayableProductIntelData(data: ProductIntelData | null | undefined): boolean {
  const core = data?.product_intel_core;
  if (!core || data?.public_display_eligible === false) return false;
  if ([core.quality_state, data?.quality_state, data?.normalized_pdp?.quality_state]
    .some((state) => normalizeWhitespace(state).toLowerCase() === 'blocked')) return false;
  const safeCore = shopperCore(core);

  const whyText = Array.isArray(safeCore.why_it_stands_out)
    ? safeCore.why_it_stands_out.map((item) => `${item?.headline || ''} ${item?.body || ''}`).join(' ')
    : '';
  const bestForText = displayableBestForLabels(safeCore.best_for).join(' ');
  const primaryText = [
    safeCore.what_it_is?.headline,
    safeCore.what_it_is?.body,
    bestForText,
    safeCore.routine_fit?.step,
    ...(Array.isArray(safeCore.routine_fit?.pairing_notes) ? safeCore.routine_fit.pairing_notes : []),
  ].join(' ');
  const combined = [primaryText, whyText].join(' ');

  if (!normalizeWhitespace(combined)) return false;
  if (data?.public_display_eligible === true) return true;
  if (isHumanReviewedProductIntelData(data)) return true;
  if (isAssistantReviewedSellerGroundedProductIntelData(data) && hasProductSpecificInsightText(combined)) return true;
  if (isGenericInsightText(primaryText) && !hasProductSpecificInsightText(combined)) return false;
  return false;
}
