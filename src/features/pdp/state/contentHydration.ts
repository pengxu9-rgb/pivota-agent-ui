import { normalizeReviewAvailability } from './reviewAvailability';
import type { ReviewsPreviewData } from '../types';
import { projectPublicInsightsPayload } from '../utils/publicProductIntel';
import type { GetPdpV2Response } from '@/lib/api';
import type { Module, PDPPayload } from '@/features/pdp/types';

// This is a descriptive-content allowlist, never a commerce-payload spread.
export const PDP_CONTENT_INCLUDE = [
  'product_intel', 'active_ingredients', 'ingredients_inci', 'how_to_use',
  'product_overview', 'product_facts', 'supplemental_details', 'reviews_preview',
  'materials', 'product_specs', 'size_fit', 'care_instructions', 'usage_safety',
] as const;
export type ContentModuleType = typeof PDP_CONTENT_INCLUDE[number];
export type ContentModuleState =
  | 'not_fetched' | 'loading' | 'ready' | 'empty' | 'unavailable'
  | 'error' | 'withheld' | 'not_applicable';
export type ContentModuleStates = Record<ContentModuleType, ContentModuleState>;

export const CONTENT_MODULE_LABELS: Record<ContentModuleType, string> = {
  product_intel: 'Product insights', active_ingredients: 'Active ingredients',
  ingredients_inci: 'Ingredients', how_to_use: 'How to use',
  product_overview: 'Product overview', product_facts: 'Product facts',
  supplemental_details: 'Additional details', reviews_preview: 'Reviews',
  materials: 'Materials', product_specs: 'Specifications', size_fit: 'Size and fit',
  care_instructions: 'Care instructions', usage_safety: 'Usage and safety',
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const token = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function productRef(value: unknown) {
  const ref = record(value);
  return [token(ref.product_id), token(ref.merchant_id), token(ref.platform)];
}

// Include listing/seller, content scope and default variant, not just route ID.
// A product-group response for another representative is not interchangeable.
export function contentIdentityKey(payload: PDPPayload | null): string {
  if (!payload) return '';
  const product = record(payload.product);
  return JSON.stringify([
    payload.schema_version, ...productRef(product), token(product.default_variant_id),
    token(product.selected_variant_id), token(product.pivota_signature_id || product.signature_id),
    payload.product_group_id || '', payload.sellable_item_group_id || '',
    payload.product_line_id || '', payload.review_family_id || '',
    payload.canonical_scope || '', payload.pdp_content_source || '',
    productRef(payload.canonical_product_ref), productRef(payload.content_base_ref),
    productRef(payload.canonical_payload_product_ref), productRef(payload.selected_commerce_ref),
  ]);
}

export function sameContentIdentity(current: PDPPayload, incoming: PDPPayload | null): incoming is PDPPayload {
  if (!incoming?.product?.product_id || !current.product.merchant_id || !incoming.product.merchant_id) return false;
  if (current.product.product_id !== incoming.product.product_id || current.product.merchant_id !== incoming.product.merchant_id ||
    current.product.default_variant_id !== incoming.product.default_variant_id ||
    (current.product.selected_variant_id || current.product.default_variant_id) !==
      (incoming.product.selected_variant_id || incoming.product.default_variant_id)) return false;
  // Narrow responses may omit optional refs. Any explicit conflict is rejected.
  for (const key of ['product_group_id', 'sellable_item_group_id', 'product_line_id', 'review_family_id', 'canonical_scope'] as const) {
    if (current[key] && incoming[key] && current[key] !== incoming[key]) return false;
  }
  for (const key of ['canonical_product_ref', 'content_base_ref', 'canonical_payload_product_ref', 'selected_commerce_ref'] as const) {
    if (current[key] && incoming[key] && ['product_id', 'merchant_id'].some((field) =>
      record(current[key])[field] && record(incoming[key])[field] && record(current[key])[field] !== record(incoming[key])[field])) return false;
  }
  return true;
}

export function normalizeContentState(value: unknown): ContentModuleState | undefined {
  const raw = typeof value === 'string' ? value : record(value).state || record(value).status;
  if (raw === 'ready') return 'ready';
  if (raw === 'loading') return 'loading';
  return explicitState(raw);
}

function observedTime(pdpModule: Module | undefined, payload?: PDPPayload, type?: string, incoming = false): number {
  const data = record(pdpModule?.data);
  const evidence = record(payload?.x_content_module_states?.[type || pdpModule?.type || '']);
  const captures = [data.source_observed_at, data.captured_at, evidence.source_observed_at]
    .filter((value): value is string => typeof value === 'string' && Boolean(value));
  const values = captures.length ? captures : [record(data.freshness).generated_at];
  const times = values.map((value) => typeof value === 'string' ? Date.parse(value) : NaN).filter(Number.isFinite);
  // Conflicting timestamps cannot make older content look newer via its state.
  return times.length ? (incoming ? Math.min(...times) : Math.max(...times)) : NaN;
}

function explicitState(value: unknown): ContentModuleState | undefined {
  const normalized = token(value).toLowerCase();
  if (['error', 'failed', 'provider_error', 'timeout'].includes(normalized) ||
    /(?:_timeout|_budget_exceeded)$/.test(normalized)) return 'error';
  if (['withheld', 'blocked', 'rejected', 'quarantined'].includes(normalized)) return 'withheld';
  if (['not_applicable', 'inapplicable'].includes(normalized) ||
    normalized.startsWith('not_applicable_') ||
    /^product_family_(?:set_or_collection|non_merch|accessory)$/.test(normalized)) return 'not_applicable';
  if (['empty', 'missing_at_source', 'not_provided', 'no_results'].includes(normalized)) return 'empty';
  if (['unavailable', 'missing', 'not_available'].includes(normalized)) return 'unavailable';
  if (['absent', 'not_fetched', 'deferred', 'pending', 'loading', 'stale'].includes(normalized)) return 'not_fetched';
  return undefined;
}

function hasContent(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim());
  if (typeof value === 'number') return value > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  return Object.entries(record(value)).some(([key, child]) =>
    !['status', 'state', 'reason', 'reason_code', 'title', 'display_name', 'scale',
      'metadata', 'provenance', 'confidence', 'freshness', 'source_coverage',
      'source_origin', 'source_quality_status', 'quality_state', 'evidence_profile',
      'source_refs', 'captured_at', 'schema_version'].includes(key) && hasContent(child));
}

export function readContentModuleState(module: { type?: string; data: unknown; reason?: string } | undefined): ContentModuleState {
  if (!module) return 'not_fetched';
  const data = record(module.data);
  if (module.type === 'reviews_preview') {
    const normalized = normalizeReviewAvailability(data as unknown as ReviewsPreviewData);
    return normalized.availability_state === 'error' ? 'error' : normalized.availability_state === 'empty' ? 'empty' : normalized.review_count == null ? 'unavailable' : 'ready';
  }
  return explicitState(data.status) || explicitState(data.state) || explicitState(module.reason) ||
    (module.data == null || token(module.reason) ? 'unavailable' : hasContent(module.data) ? 'ready' : 'empty');
}

export function initialContentModuleStates(payload: PDPPayload): ContentModuleStates {
  return Object.fromEntries(PDP_CONTENT_INCLUDE.map((type) => {
    const pdpModule = payload.modules.find((item) => item.type === type);
    const explicit = normalizeContentState(payload.x_content_module_states?.[type]);
    // Gateway presence states may describe the pre-projection/full build. A
    // response-owned module omitted from this response still needs hydration.
    return [type, explicit === 'ready' && !pdpModule ? 'not_fetched' : explicit || readContentModuleState(pdpModule)];
  })) as ContentModuleStates;
}

export function completedContentModuleStates(
  requested: readonly ContentModuleType[], incoming: PDPPayload, response: GetPdpV2Response,
): Partial<ContentModuleStates> {
  return Object.fromEntries(requested.map((type) => {
    const rawModule = response.modules?.find((module) => module.type === type);
    const missing = response.missing?.find((module) => module.type === type);
    const mappedModule = incoming.modules.find((module) => module.type === type);
    // A missing response is not proof of missing-at-source. Keep it distinct
    // from an explicit empty module and allow a bounded, user-triggered retry.
    const explicit = normalizeContentState(incoming.x_content_module_states?.[type]);
    const state = (explicit === 'ready' && !mappedModule && !rawModule?.data ? 'unavailable' : explicit) || (missing ? (explicitState(missing.reason) || 'unavailable')
      : rawModule ? readContentModuleState(rawModule)
      : mappedModule ? readContentModuleState(mappedModule) : 'unavailable');
    return [type, state === 'not_fetched' ? 'unavailable' : state];
  })) as Partial<ContentModuleStates>;
}

const DESCRIPTIVE_FIELDS = {
  description: ['product_overview', 'product_facts', 'supplemental_details'],
  subtitle: ['product_overview'], brand_story: ['product_overview', 'supplemental_details'],
  size_guide: ['size_fit'],
} as const;

export function mergeContentPdpPayload(
  current: PDPPayload, incoming: PDPPayload | null,
  requested: readonly ContentModuleType[] = PDP_CONTENT_INCLUDE,
  states?: Partial<ContentModuleStates>,
): PDPPayload {
  if (!sameContentIdentity(current, incoming)) return current;
  // Decide once per module before touching content, empty synthesis, readiness,
  // or provenance. A stale result cannot update any part of that tuple.
  const accepted = new Map<ContentModuleType, { state: ContentModuleState; content?: Module }>();
  for (const type of new Set(requested)) {
    const next = incoming.modules.find((pdpModule) => pdpModule.type === type);
    const explicit = states?.[type] || normalizeContentState(incoming.x_content_module_states?.[type]);
    if (!next && !explicit) continue;
    const previous = current.modules.find((pdpModule) => pdpModule.type === type);
    const oldTime = observedTime(previous, current, type);
    const nextTime = observedTime(next, incoming, type, true);
    if (Number.isFinite(oldTime) && (!Number.isFinite(nextTime) || nextTime < oldTime)) continue;
    accepted.set(type, { state: explicit || readContentModuleState(next), content: next });
  }
  if (!accepted.size) return current;
  const contentStates = { ...current.x_content_module_states };
  const incomingModules: Module[] = [];
  const clearedTypes = new Set<ContentModuleType>();
  for (const [type, update] of accepted) {
    const evidence = incoming.x_content_module_states?.[type];
    contentStates[type] = evidence && typeof evidence === 'object' ? { ...evidence, state: update.state } : update.state;
    if (['empty', 'withheld', 'not_applicable'].includes(update.state)) clearedTypes.add(type);
    if (update.state === 'ready' && update.content) incomingModules.push(update.content);
    if (type === 'reviews_preview' && update.state === 'empty') {
      incomingModules.push(update.content || { module_id: 'reviews_preview', type: 'reviews_preview', priority: 50,
        data: { scale: 5, rating: 0, review_count: 0, availability_state: 'empty', preview_items: [] } });
    }
  }
  const incomingTypes = new Set(incomingModules.map((pdpModule) => pdpModule.type));
  const fieldState = (owners: readonly ContentModuleType[]) => {
    if (owners.some((type) => clearedTypes.has(type))) return 'clear';
    return owners.some((type) => incomingTypes.has(type) && accepted.get(type)?.state === 'ready') ? 'merge' : 'keep';
  };
  const product = { ...current.product };
  for (const [field, owners] of Object.entries(DESCRIPTIVE_FIELDS)) {
    const action = fieldState(owners);
    if (action === 'clear') Object.assign(product, { [field]: field === 'size_guide' ? undefined : '' });
    else if (action === 'merge' && Object.prototype.hasOwnProperty.call(incoming.product, field)) {
      Object.assign(product, { [field]: incoming.product[field as keyof typeof DESCRIPTIVE_FIELDS] });
    }
  }
  // Only descriptive subkeys. configurator/protection/styling prices and options
  // are intentionally excluded along with all top-level commerce metadata.
  for (const [field, fields] of [
    ['fashion_meta', { size_fit_chart: ['size_fit'], model: ['size_fit'], material: ['materials'], origin: ['product_facts'], care: ['care_instructions'] }],
    ['electronics_meta', { in_box: ['product_specs'], spec_groups: ['product_specs'] }],
  ] as const) {
    const next = record(incoming.product[field]);
    const patch: Record<string, unknown> = {};
    for (const [key, owners] of Object.entries(fields)) {
      const action = fieldState(owners as readonly ContentModuleType[]);
      if (action === 'clear') patch[key] = undefined;
      else if (action === 'merge' && Object.prototype.hasOwnProperty.call(next, key)) patch[key] = next[key];
    }
    if (Object.keys(patch).length) Object.assign(product, { [field]: { ...record(current.product[field]), ...patch } });
  }
  const reviewsUpdated = incomingTypes.has('reviews_preview') || clearedTypes.has('reviews_preview');
  return projectPublicInsightsPayload({
    ...current, product, x_content_module_states: contentStates,
    modules: [
      ...current.modules.filter((module) =>
        !incomingTypes.has(module.type) && !clearedTypes.has(module.type as ContentModuleType)),
      ...incomingModules,
    ] as Module[],
    ...(reviewsUpdated ? { x_reviews_state: 'ready' as const } : {}),
    x_source_locks: {
      ...current.x_source_locks,
      ...(reviewsUpdated ? { reviews: true } : {}),
    },
  });
}
