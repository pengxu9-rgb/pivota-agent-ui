import type { PDPPayload, ReadOnlyCommerce, VerifiedCommerce } from '../types';

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

function canonicalData(source: Record<string, any> | null): Record<string, any> | null {
  const modules = Array.isArray(source?.modules) ? source.modules : [];
  return record(modules.find((module: any) => module?.type === 'canonical')?.data);
}

/** Only this explicit gateway contract establishes a successful read-only PDP. */
export function isReadOnlyCommerce(value: unknown): value is ReadOnlyCommerce {
  const commerce = record(value);
  return commerce?.state === 'unavailable' && commerce.read_only === true &&
    commerce.purchase_eligible === false && commerce.reason_code === 'CURRENT_OWN_OFFER_UNAVAILABLE';
}

function validVerificationWindow(commerce: Record<string, any>): boolean {
  const observed = Date.parse(commerce.verified_at), expires = Date.parse(commerce.expires_at);
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  return typeof commerce.verified_at === 'string' && typeof commerce.expires_at === 'string' &&
    iso.test(commerce.verified_at) && iso.test(commerce.expires_at) &&
    Number.isFinite(observed) && Number.isFinite(expires) && expires > observed && expires - observed <= 60000;
}

/**
 * The proof's lifetime is measured on this browser's clock from when the reply
 * arrived, never by comparing the server's timestamps with Date.now(): a device
 * clock a few seconds slow would otherwise reject every proof on first render,
 * and one a minute fast would never accept one. Only `getPdpV2` in the browser
 * stamps `client_received_at`; an unstamped proof (server render, cache) is not
 * yet current here and needs a browser read.
 */
export function stampVerifiedCommerce<T>(value: T, receivedAt: number): T {
  return isVerifiedCommerce(value) ? { ...value, client_received_at: receivedAt } : value;
}

/** Stamp all three envelopes of a get_pdp_v2 reply with one receipt time. */
export function stampPdpResponseCommerce<T>(response: T, receivedAt: number): T {
  const source = record(response);
  if (!source) return response;
  return {
    ...source,
    ...(source.metadata ? { metadata: { ...source.metadata, commerce: stampVerifiedCommerce(source.metadata.commerce, receivedAt) } } : {}),
    ...(Array.isArray(source.modules) ? { modules: source.modules.map((module: any) => {
      if (module?.type !== 'canonical' || !record(module.data)) return module;
      const data = module.data;
      return { ...module, data: {
        ...data,
        ...(data.commerce ? { commerce: stampVerifiedCommerce(data.commerce, receivedAt) } : {}),
        ...(record(data.pdp_payload) ? { pdp_payload: { ...data.pdp_payload, commerce: stampVerifiedCommerce(data.pdp_payload.commerce, receivedAt) } } : {}),
      } };
    }) } : {}),
  } as T;
}

/** Browser-clock instant this proof stops authorizing purchase, or null if it was never received here. */
export function verifiedCommerceExpiresAt(value: unknown): number | null {
  if (!isVerifiedCommerce(value)) return null;
  const receivedAt = (value as VerifiedCommerce & { client_received_at?: unknown }).client_received_at;
  if (typeof receivedAt !== 'number' || !Number.isFinite(receivedAt)) return null;
  return receivedAt + (Date.parse(value.expires_at) - Date.parse(value.verified_at));
}

export function isFreshVerifiedCommerce(value: unknown, now = Date.now()): value is VerifiedCommerce {
  const expiresAt = verifiedCommerceExpiresAt(value);
  const receivedAt = (value as { client_received_at?: number } | null)?.client_received_at;
  return expiresAt !== null && typeof receivedAt === 'number' && receivedAt <= now && now < expiresAt;
}

export function isVerifiedCommerce(value: unknown): value is VerifiedCommerce {
  const commerce = record(value);
  return commerce?.state === 'ready' && commerce.read_only === false &&
    commerce.purchase_eligible === true && commerce.reason_code === 'CURRENT_OWN_OFFER_VERIFIED' &&
    validVerificationWindow(commerce) &&
    typeof commerce.product_ref?.merchant_id === 'string' && Boolean(commerce.product_ref.merchant_id.trim()) &&
    typeof commerce.product_ref?.product_id === 'string' && Boolean(commerce.product_ref.product_id.trim()) &&
    typeof commerce.selected_variant_id === 'string' && Boolean(commerce.selected_variant_id.trim()) &&
    Array.isArray(commerce.verified_variants) && commerce.verified_variants.length > 0 && commerce.verified_variants.length <= 100 &&
    commerce.verified_variants.every((entry: any) => typeof entry?.variant_id === 'string' && entry.variant_id.trim() &&
      typeof entry.amount === 'number' && Number.isFinite(entry.amount) && entry.amount > 0 && /^[A-Z]{3}$/.test(entry.currency)) &&
    new Set(commerce.verified_variants.map((entry: any) => entry.variant_id)).size === commerce.verified_variants.length;
}

/** Fail closed for purchase actions even if a stale/partial payload is passed directly. */
export function isPurchaseUnavailable(value: unknown): boolean {
  const product = record(value);
  return Boolean(product && (product.purchase_eligible === false || product.commerce_mode === 'read_only' ||
    product.current_own_offer_status === 'unavailable' || isReadOnlyCommerce(product.commerce)));
}

export function hasReadOnlyPdpSignal(response: unknown): boolean {
  const source = record(response);
  const canonical = canonicalData(source);
  return [source?.metadata?.commerce, canonical?.commerce, canonical?.pdp_payload?.commerce]
    .some((value) => value != null) || canonical?.pdp_payload?.product?.commerce_mode === 'read_only';
}

export function isValidReadOnlyPdpResponse(response: unknown): boolean {
  const source = record(response);
  const canonical = canonicalData(source);
  const payload = canonical?.pdp_payload;
  const product = record(payload?.product);
  return [source?.metadata?.commerce, canonical?.commerce, payload?.commerce].every(isReadOnlyCommerce) &&
    Boolean(product && typeof product.product_id === 'string' && product.product_id.trim() &&
      typeof product.title === 'string' && product.title.trim() && Array.isArray(product.variants) &&
      product.commerce_mode === 'read_only' && product.purchase_eligible === false &&
      product.current_own_offer_status === 'unavailable');
}

/** Current proof must describe the exact rendered seller, source product and variant. */
export function isValidVerifiedPdpResponse(response: unknown): boolean {
  const source = record(response);
  const canonical = canonicalData(source);
  const payload = canonical?.pdp_payload;
  const product = record(payload?.product);
  const proofs = [source?.metadata?.commerce, canonical?.commerce, payload?.commerce];
  if (!proofs.every(isVerifiedCommerce) || !product || isPurchaseUnavailable(product)) return false;
  const proof = proofs[0];
  if (!proofs.every((item) => item.product_ref.merchant_id === proof.product_ref.merchant_id &&
      item.product_ref.product_id === proof.product_ref.product_id && item.selected_variant_id === proof.selected_variant_id &&
      item.verified_at === proof.verified_at && item.expires_at === proof.expires_at &&
      JSON.stringify(item.verified_variants) === JSON.stringify(proof.verified_variants))) return false;
  const selectedRef = record(canonical?.selected_commerce_ref);
  if (!selectedRef || selectedRef.merchant_id !== proof.product_ref.merchant_id ||
      selectedRef.product_id !== proof.product_ref.product_id || product.merchant_id !== proof.product_ref.merchant_id ||
      (product.source_product_id || product.product_id) !== proof.product_ref.product_id ||
      product.default_variant_id !== proof.selected_variant_id ||
      (product.selected_variant_id && product.selected_variant_id !== proof.selected_variant_id)) return false;
  const variant = Array.isArray(product.variants)
    ? product.variants.find((item: any) => item?.variant_id === proof.selected_variant_id) : null;
  const money = variant?.price?.current;
  if (!variant || isPurchaseUnavailable(variant) || typeof money?.amount !== 'number' ||
      !Number.isFinite(money.amount) || money.amount <= 0 || typeof money.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(money.currency)) return false;
  if (!proof.verified_variants.some((entry: any) => entry.variant_id === proof.selected_variant_id) ||
      !proof.verified_variants.every((entry: any) => {
        const matches = product.variants.filter((item: any) => item?.variant_id === entry.variant_id);
        return matches.length === 1 && matches[0].price?.current?.amount === entry.amount &&
          matches[0].price?.current?.currency === entry.currency && !isPurchaseUnavailable(matches[0]) &&
          (!matches[0].merchant_id || matches[0].merchant_id === proof.product_ref.merchant_id) &&
          (!matches[0].source_product_id || matches[0].source_product_id === proof.product_ref.product_id) &&
          (!matches[0].product_id || [proof.product_ref.product_id, product.product_id].includes(matches[0].product_id));
      })) return false;
  const productMoney = product.price?.current;
  return !productMoney || (productMoney.amount === money.amount && productMoney.currency === money.currency);
}

const PURCHASE_FIELDS = [
  'price', 'price_amount', 'price_currency', 'offer_price', 'currency', 'compare_at_price', 'compare_at',
  'inventory', 'in_stock', 'stock_status', 'stock', 'availability', 'shipping', 'returns',
  'checkout_handoff', 'purchase_route', 'checkout_url', 'merchant_checkout_url', 'purchase_url',
  'external_redirect_url', 'externalRedirectUrl', 'affiliate_url', 'external_url', 'redirect_url',
  'merchantCheckoutUrl', 'checkoutUrl', 'redirectUrl', 'buyUrl', 'buy_url',
  'url', 'canonical_url', 'destination_url', 'source_url', 'product_url', 'action', 'actions',
  'store_discount_evidence', 'store_discount_summary', 'store_discount_badges',
  'payment_offer_evidence', 'payment_offer_summary', 'payment_offer_badges', 'payment_pricing',
  '_pivota_offers', 'offers', 'product_group_members', 'recent_purchases',
];

function stripPurchaseFields<T extends Record<string, any>>(value: T): T {
  const next = { ...value };
  for (const field of PURCHASE_FIELDS) delete next[field];
  return { ...next, availability: {}, purchase_eligible: false };
}

/** Preserve evidence but discard stale commerce merged by an older cache or caller. */
export function enforceReadOnlyPdp(payload: PDPPayload, now = Date.now()): PDPPayload {
  const readOnly = isReadOnlyCommerce(payload.commerce);
  // Never received by this browser (server render): check, don't fail.
  const unreceived = isVerifiedCommerce(payload.commerce) && verifiedCommerceExpiresAt(payload.commerce) === null;
  const expired = isVerifiedCommerce(payload.commerce) && !unreceived && !isFreshVerifiedCommerce(payload.commerce, now);
  if (!readOnly && !payload.commerce_verification && !expired && !unreceived) return payload;
  return {
    ...payload,
    ...(!payload.commerce_verification && (expired || unreceived)
      ? { commerce_verification: unreceived ? 'refresh_required' as const : 'failed' as const } : {}),
    ...(!readOnly ? { commerce: { state: 'unverified' as const, read_only: true as const,
      purchase_eligible: false as const, reason_code: 'CURRENT_OFFER_REFRESH_REQUIRED' as const } } : {}),
    ...(payload.quality_signals ? { quality_signals: { ...payload.quality_signals,
      coverage_by_module: { ...payload.quality_signals.coverage_by_module, price_promo: 0, buy_box: 0 },
      gating: { ...payload.quality_signals.gating, buy_box_ok: false } } } : {}),
    product: {
      ...stripPurchaseFields(payload.product), commerce_mode: readOnly ? 'read_only' : 'verification_pending',
      ...(readOnly ? { current_own_offer_status: 'unavailable' as const } : {}),
      variants: (payload.product.variants || []).map(stripPurchaseFields),
    },
    offers: [], offers_count: 0, default_offer_id: undefined, best_price_offer_id: undefined,
    x_offers_state: 'ready', actions: [],
    modules: payload.modules.filter((module) => module.type !== 'price_promo').map((module) => {
      if (module.type !== 'variant_selector' || !record(module.data)) return module;
      const data = stripPurchaseFields(module.data as Record<string, any>);
      return { ...module, data: { ...data,
        ...(Array.isArray(data.variants) ? { variants: data.variants.map(stripPurchaseFields) } : {}),
      } };
    }),
  };
}

/** Content-only hydration may revoke commerce, but can never grant it. */
export function restrictPdpCommerce(current: PDPPayload, incoming: PDPPayload | null): PDPPayload {
  if (!incoming || !isReadOnlyCommerce(incoming.commerce) ||
      incoming.product.product_id !== current.product.product_id ||
      incoming.product.merchant_id !== current.product.merchant_id) return current;
  return enforceReadOnlyPdp({ ...current, commerce: incoming.commerce });
}

/**
 * Apply a fresh browser read of the same product to an open page. A current
 * proof replaces the selected listing's money, variants and offers while the
 * content the page already loaded (reviews, similar, details) is kept. A
 * read-only reply revokes purchase. Anything else leaves the page unchanged,
 * so a failed re-read lets the old proof lapse rather than extending it.
 */
export function refreshPdpCommerce(current: PDPPayload, fresh: PDPPayload | null, now = Date.now()): PDPPayload {
  if (!fresh || fresh.product.product_id !== current.product.product_id ||
      fresh.product.merchant_id !== current.product.merchant_id) return current;
  if (isReadOnlyCommerce(fresh.commerce)) return restrictPdpCommerce(current, fresh);
  if (fresh.commerce_verification || !isFreshVerifiedCommerce(fresh.commerce, now)) return current;
  const freshProduct = fresh.product as Record<string, any>;
  const commerceProductFields = ['price', 'variants', 'availability', 'default_variant_id', 'selected_variant_id',
    'purchase_eligible', 'commerce_mode', 'current_own_offer_status', '_pivota_offers'];
  const product: Record<string, any> = { ...current.product };
  for (const field of commerceProductFields) {
    if (field in freshProduct) product[field] = freshProduct[field];
    else delete product[field];
  }
  const commerceModules = new Set(['price_promo', 'variant_selector']);
  const freshModules = new Map(fresh.modules.filter((module) => commerceModules.has(module.type)).map((module) => [module.type, module]));
  const modules = current.modules
    .filter((module) => !commerceModules.has(module.type) || freshModules.has(module.type))
    .map((module) => freshModules.get(module.type) || module);
  for (const [type, module] of freshModules) if (!modules.some((item) => item.type === type)) modules.push(module);
  return {
    ...current,
    commerce: fresh.commerce,
    commerce_verification: undefined,
    ...(fresh.quality_signals ? { quality_signals: fresh.quality_signals } : {}),
    product: product as PDPPayload['product'],
    offers: fresh.offers,
    offers_count: fresh.offers_count,
    default_offer_id: fresh.default_offer_id,
    best_price_offer_id: fresh.best_price_offer_id,
    x_offers_state: fresh.x_offers_state ?? current.x_offers_state,
    actions: fresh.actions,
    modules,
  };
}

/** A receipt for one seller/variant never authorizes a later different selection. */
export function hasVerifiedSelectedCommerce(payload: Pick<PDPPayload, 'product' | 'commerce' | 'commerce_verification'>, variant: any,
  selected: { merchantId?: string | null; productId?: string | null; offer?: any } = {}): boolean {
  if (!payload.commerce) return !payload.commerce_verification; // Existing legacy path retains its own gates.
  const proof = payload.commerce;
  if (payload.commerce_verification || !isFreshVerifiedCommerce(proof) || isPurchaseUnavailable(payload.product) ||
      isPurchaseUnavailable(variant) || variant?.availability?.in_stock === false || variant?.in_stock === false) return false;
  const product = payload.product;
  const seller = selected.merchantId || selected.offer?.merchant_id || product.merchant_id;
  const productId = selected.productId || selected.offer?.product_id || product.source_product_id || product.product_id;
  if (seller !== proof.product_ref.merchant_id || product.merchant_id !== proof.product_ref.merchant_id ||
      (product.source_product_id || product.product_id) !== proof.product_ref.product_id ||
      ![proof.product_ref.product_id, product.product_id].includes(String(productId))) return false;
  const entry = proof.verified_variants.find((item) => item.variant_id === variant?.variant_id);
  const money = variant?.price?.current;
  if (!entry || money?.amount !== entry.amount || money?.currency !== entry.currency ||
      (variant.merchant_id && variant.merchant_id !== proof.product_ref.merchant_id) ||
      (variant.source_product_id && variant.source_product_id !== proof.product_ref.product_id) ||
      (variant.product_id && ![proof.product_ref.product_id, product.product_id].includes(variant.product_id))) return false;
  if (selected.offer) {
    const offer = selected.offer;
    if (offer.merchant_id !== proof.product_ref.merchant_id ||
        ![proof.product_ref.product_id, product.product_id].includes(String(offer.product_id || ''))) return false;
    const rows = Array.isArray(offer.variants) ? offer.variants : [];
    const matches = rows.filter((row: any) => row?.variant_id === entry.variant_id);
    let own = offer;
    if (rows.length) {
      if (matches.length !== 1) return false;
      own = matches[0];
      // Exact raw option axes must agree; normalized title/currency fallbacks
      // from presentation matching do not establish seller evidence.
      const options = exactOptions(own.options), target = exactOptions(variant.options);
      if (!options || !target || JSON.stringify(options) !== JSON.stringify(target)) return false;
    } else {
      const offerVariant = offer.selected_variant_id || offer.variant_id;
      if (offerVariant ? String(offerVariant) !== entry.variant_id : product.variants.length !== 1) return false;
    }
    if ((own.merchant_id && own.merchant_id !== proof.product_ref.merchant_id) ||
        (own.source_product_id && own.source_product_id !== proof.product_ref.product_id) ||
        (own.product_id && ![proof.product_ref.product_id, product.product_id].includes(own.product_id)) ||
        isPurchaseUnavailable(own) || own.availability?.in_stock === false || own.in_stock === false) return false;
    const offerMoney = own.price?.current || own.price;
    if (typeof offerMoney?.amount !== 'number' || offerMoney.currency !== entry.currency || offerMoney.amount !== entry.amount) return false;
  }
  return true;
}

function exactOptions(value: unknown): Array<[string, string]> | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const entries: Array<[string, string]> = [];
  for (const item of value) {
    if (typeof item?.name !== 'string' || typeof item?.value !== 'string' || !item.name.trim() || !item.value.trim()) return null;
    const name = item.name.trim().toLowerCase(), option = item.value.trim().toLowerCase();
    if (entries.some(([key]) => key === name)) return null;
    entries.push([name, option]);
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

export type PdpRequestIdentity = {
  product_id: string;
  merchant_id?: string | null;
  subject?: { type: string; id: string } | null;
};

/** Bind a new commerce contract to its caller, not merely to itself. */
export function matchesPdpRequestIdentity(response: unknown, expected: PdpRequestIdentity): boolean {
  if (!hasReadOnlyPdpSignal(response)) return true; // Existing legacy contracts retain their own gates.
  const source = record(response), canonical = canonicalData(source);
  const product = canonical?.pdp_payload?.product, resolution = source?.metadata?.identity_resolution;
  if (!product || !resolution || !expected.product_id) return false;
  const expectedId = expected.subject?.id || expected.product_id;
  const group = expected.subject?.type === 'product_group';
  if (group) {
    if (resolution.requested_product_group_id !== expectedId &&
        !(source?.subject?.id === expectedId && resolution.requested_product_id === expectedId)) return false;
  } else if (resolution.requested_product_id !== expectedId) return false;
  const sourceId = product.source_product_id || product.product_id;
  if (resolution.resolved_product_id !== sourceId || resolution.resolved_merchant_id !== product.merchant_id) return false;
  if (expected.merchant_id && (product.merchant_id !== expected.merchant_id ||
      (resolution.requested_merchant_id && resolution.requested_merchant_id !== expected.merchant_id))) return false;
  // A signature is an exact canonical product identity, never a seller alias.
  if (/^sig_[a-f0-9]{32}$/.test(expectedId) && (product.product_id !== expectedId || source?.subject?.id !== expectedId)) return false;
  if (!group && !/^sig_[a-f0-9]{32}$/.test(expectedId) &&
      expectedId !== sourceId && expectedId !== product.product_id) return false;
  return true;
}
