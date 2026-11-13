// THE PDP ASYNC LIVE REFRESH, BROWSER HALF (contract: PIVOTA-Agent pdpLiveRefresh v1, section 6).
//
// Why. The storefront PDP is ISR-cached for an hour, so get_pdp_v2 runs about once per hour per
// product and the gateway's server-side next-view overlay almost never reaches a visit (prod
// 2026-10-15/16: ~1000 PDP builds, 0 overlaid pages). So after the page renders, the browser hands the
// page's `live_refresh` token back to the gateway (`pdp_live_read`) and receives the merchant's live
// price and stock as a patch.
//
// What this file owns, and what it never does:
//   - It never re-implements the overlay rules. They live in ONE place, the gateway's
//     `applyPdpLiveOverlay`. This file only rebuilds the raw module slice the overlay reads
//     (`buildLiveRefreshPage`) and applies the patch it answers (`applyLiveRefreshPatch`).
//   - It never enables a purchase the server withheld. A patch that would change a purchase verdict
//     (`purchase_eligible`, `current_own_offer_status`, `commerce_mode`, `actions`), touch a withheld or
//     purchase-unavailable variant or offer, add or drop a variant or offer, or name a key outside the
//     allowlist is rejected WHOLE: the stored page stays as it is.
//   - It never touches SEO: JSON-LD and the server HTML are built from the server payload, before any of
//     this runs.
import type {
  LivePdpRefreshDescriptor,
  LivePdpRefreshPage,
  LivePdpRefreshPatch,
  Module,
  PDPPayload,
} from '../types';
import { isPurchaseUnavailable } from './commerceAvailability';

/** The browser's whole budget for one refresh. A slower answer is dropped and the stored page stays. */
export const PDP_LIVE_REFRESH_TIMEOUT_MS = 4500;

const TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const TOKEN_MAX_BYTES = 4096;

/**
 * `NEXT_PUBLIC_PDP_LIVE_REFRESH` = on|off, default off. Inlined at build time (the literal reference is
 * what Next inlines), so the Dockerfile's build arg decides it for a deployed image.
 */
export function isPdpLiveRefreshEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(String(process.env.NEXT_PUBLIC_PDP_LIVE_REFRESH ?? '').trim());
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The descriptor exactly as contract v1 shapes it, or null. Never trusted for anything but "ask". */
export function readLiveRefreshDescriptor(raw: unknown): LivePdpRefreshDescriptor | null {
  if (!isRecord(raw) || raw.v !== 1) return null;
  const token = raw.token;
  // The token is base64url ASCII, so its length is its byte count.
  if (typeof token !== 'string' || token.length > TOKEN_MAX_BYTES || !TOKEN_PATTERN.test(token)) return null;
  const market = typeof raw.market === 'string' ? raw.market.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(market)) return null;
  return { v: 1, token, market };
}

// Crawlers, preview fetchers and automated browsers never trigger a merchant read (Peng 2026-10-16).
// A false positive only costs that visitor the refresh; the stored page is still correct-as-cached.
const CRAWLER_UA_PATTERN = new RegExp(
  [
    'bot', 'crawl', 'spider', 'slurp', 'headless', 'lighthouse', 'pagespeed', 'google-inspectiontool',
    'googleother', 'google-extended', 'chatgpt-user', 'oai-searchbot', 'gptbot', 'claude-web', 'anthropic-ai',
    'perplexity', 'facebookexternalhit', 'meta-externalagent', 'bytespider', 'baiduspider', 'yandex',
    'duckduckgo', 'applebot', 'amazonbot', 'ccbot', 'petalbot', 'semrush', 'ahrefs', 'mj12', 'dotbot',
    'prerender', 'phantomjs', 'puppeteer', 'playwright', 'selenium', 'cypress', 'python-requests', 'curl/',
    'wget', 'httpclient', 'okhttp', 'axios/', 'node-fetch',
  ].map((part) => part.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|'),
  'i',
);

/** `nav` defaults to the browser's navigator; with none (server, or `null`), the caller is not a visitor. */
export function isLikelyCrawler(nav?: { userAgent?: string; webdriver?: boolean } | null): boolean {
  if (nav === undefined) nav = typeof navigator !== 'undefined' ? navigator : null;
  if (!nav) return true;
  if (nav.webdriver === true) return true;
  return CRAWLER_UA_PATTERN.test(String(nav.userAgent || ''));
}

/** Card keys that are content, not commerce: the overlay never reads them, so they never travel. */
function isContentKey(key: string): boolean {
  return key.startsWith('description') || key.startsWith('media') || key === 'images' || key === 'image_urls';
}

function findModule(modules: unknown, type: string): Module | null {
  if (!Array.isArray(modules)) return null;
  return (modules.find((m) => isRecord(m) && m.type === type) as Module | undefined) || null;
}

/**
 * The raw get_pdp_v2 module slice `pdp_live_read` overlays, rebuilt from the MAPPED payload (the inverse of
 * mapPdpV2ToPdpPayload for the fields the overlay reads): the canonical card minus content keys, its
 * actions, its nested price_promo and variant_selector, the top-level variant_selector, the offers with
 * their best-price/default ids, and product_intel's offer_pointers.
 *
 * Where the mapping is lossy (see the PR): the mapped payload keeps ONE module per type, so the nested
 * and the top-level variant_selector are both rebuilt from it; empty `actions` are left out (the mapper
 * turns a missing array into `[]`, and a page whose actions really were empty carries no descriptor).
 */
export function buildLiveRefreshPage(payload: PDPPayload | null | undefined): LivePdpRefreshPage | null {
  if (!payload || !isRecord(payload.product)) return null;
  const product = Object.fromEntries(Object.entries(payload.product).filter(([key]) => !isContentKey(key)));
  const pricePromo = findModule(payload.modules, 'price_promo');
  const selector = findModule(payload.modules, 'variant_selector');
  const nested: LivePdpRefreshPage['modules'] = [];
  if (pricePromo && isRecord(pricePromo.data)) nested.push({ type: 'price_promo', data: pricePromo.data });
  if (selector && isRecord(selector.data)) nested.push({ type: 'variant_selector', data: selector.data });
  const pdpPayload: Record<string, unknown> = { product, modules: nested };
  if (Array.isArray(payload.actions) && payload.actions.length > 0) pdpPayload.actions = payload.actions;

  const modules: LivePdpRefreshPage['modules'] = [{ type: 'canonical', data: { pdp_payload: pdpPayload } }];
  if (selector && isRecord(selector.data)) modules.push({ type: 'variant_selector', data: selector.data });
  if (Array.isArray(payload.offers)) {
    modules.push({
      type: 'offers',
      data: {
        offers: payload.offers,
        ...(typeof payload.best_price_offer_id === 'string' ? { best_price_offer_id: payload.best_price_offer_id } : {}),
        ...(typeof payload.default_offer_id === 'string' ? { default_offer_id: payload.default_offer_id } : {}),
      },
    });
  }
  const intel = findModule(payload.modules, 'product_intel');
  const pointers = isRecord(intel?.data) ? (intel!.data as Record<string, unknown>).offer_pointers : null;
  if (isRecord(pointers)) modules.push({ type: 'product_intel', data: { offer_pointers: pointers } });
  return { modules };
}

// ---------------------------------------------------------------------------------------------------
// Applying the answer.

/** The card keys the overlay may set (pdpLiveOverlay: the card's money, stock and its read stamp). */
const PRODUCT_SET_KEYS = new Set([
  'variants', 'price', 'price_amount', 'priceAmount', 'currency', 'price_source', 'availability', 'in_stock',
  'live_read', 'best_price_offer_id',
]);
/** The card keys the overlay may drop: savings copy computed against the stored price (SAVINGS_PRESENTATION_FIELDS). */
const PRODUCT_UNSET_KEYS = new Set([
  'payment_offer_evidence', 'payment_offer_summary', 'payment_offer_badges', 'payment_pricing',
  'store_discount_evidence', 'store_discount_summary', 'store_discount_badges', 'discount_evidence',
  'promotion_lines',
]);
const PATCH_KEYS = new Set(['product', 'modules', 'offers', 'product_intel']);
const PATCH_MODULE_TYPES = new Set(['price_promo', 'variant_selector']);
/** Purchase verdicts and identity: a live answer never changes them, anywhere. */
const VERDICT_KEYS = ['purchase_eligible', 'current_own_offer_status', 'commerce_mode', 'actions', 'action'];
const PRODUCT_PROTECTED_KEYS = [...VERDICT_KEYS, 'product_id', 'merchant_id', 'source_product_id', 'default_variant_id'];
const VARIANT_PROTECTED_KEYS = [...VERDICT_KEYS, 'variant_id', 'merchant_id', 'product_id', 'source_product_id'];
const OFFER_PROTECTED_KEYS = [
  ...VERDICT_KEYS, 'offer_id', 'merchant_id', 'product_id', 'purchase_route', 'checkout_handoff', 'url',
  'external_redirect_url', 'merchant_checkout_url', 'checkout_url', 'selected_variant_id', 'variant_id',
  'default_variant_id', 'price_verification',
];

/** What the browser sent: the token and the page identity it was sent for. */
export interface LiveRefreshSent {
  token: string;
  product_id: string;
  merchant_id?: string | null;
}

class PatchRejected extends Error {}
function reject(reason: string): never {
  throw new PatchRejected(reason);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (!deepEqual(a[key], b[key])) return false;
  return true;
}

function sameAt(before: Record<string, any>, after: Record<string, any>, keys: readonly string[]): boolean {
  return keys.every((key) => deepEqual(before[key], after[key]));
}

/** Every spelling of a variant id the gateway's numericVariantId could read (raw, gid, `variant=N`). */
function variantIdForms(raw: unknown): string[] {
  const id = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!id) return [];
  const forms = new Set([id]);
  const gid = /^(?:gid:\/\/shopify\/ProductVariant\/)?(\d{1,20})$/.exec(id);
  if (gid) forms.add(gid[1]);
  const named = /[?&#]variant=(\d{1,20})/.exec(id);
  if (named) forms.add(named[1]);
  return [...forms];
}

function isWithheldVariant(variant: unknown): boolean {
  return isRecord(variant) && (variant.current_own_offer_status === 'unavailable' || isPurchaseUnavailable(variant));
}

/** Ids whose money the server withheld on the card: their copies elsewhere lost the marker, not the verdict. */
function withheldIdsOf(product: Record<string, any>): Set<string> {
  const ids = new Set<string>();
  for (const v of Array.isArray(product.variants) ? product.variants : []) {
    if (isWithheldVariant(v)) for (const form of variantIdForms(v.variant_id)) ids.add(form);
  }
  return ids;
}

function touchesWithheldId(raw: unknown, withheld: Set<string>): boolean {
  return variantIdForms(raw).some((form) => withheld.has(form));
}

/** A patched variant list: the same variants in the same order, verdicts kept, withheld ones untouched. */
function checkVariants(before: unknown, after: unknown, withheld: Set<string>, where: string): void {
  if (after === undefined) return;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) reject(`${where}: variant list changed shape`);
  before.forEach((b, i) => {
    const a = after[i];
    if (!isRecord(b) || !isRecord(a)) {
      if (!deepEqual(b, a)) reject(`${where}: variant ${i} changed shape`);
      return;
    }
    if (String(b.variant_id ?? '') !== String(a.variant_id ?? '')) reject(`${where}: variant ${i} changed id`);
    if (isWithheldVariant(b) || touchesWithheldId(b.variant_id, withheld)) {
      if (!deepEqual(b, a)) reject(`${where}: withheld variant ${String(b.variant_id)} touched`);
      return;
    }
    if (!sameAt(b, a, VARIANT_PROTECTED_KEYS)) reject(`${where}: variant ${String(b.variant_id)} verdict changed`);
  });
}

function offerSelectedId(offer: Record<string, any>): unknown {
  return offer.selected_variant_id || offer.variant_id || offer.default_variant_id;
}

function checkOffers(before: unknown, after: unknown, withheld: Set<string>): void {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) reject('offers: list changed shape');
  const byId = new Map<string, Record<string, any>>();
  for (const offer of before) {
    if (!isRecord(offer) || typeof offer.offer_id !== 'string' || !offer.offer_id || byId.has(offer.offer_id)) reject('offers: stored rows are not uniquely keyed');
    byId.set(offer.offer_id, offer);
  }
  const seen = new Set<string>();
  for (const offer of after) {
    if (!isRecord(offer) || typeof offer.offer_id !== 'string' || seen.has(offer.offer_id)) reject('offers: patched rows are not uniquely keyed');
    seen.add(offer.offer_id);
    const stored = byId.get(offer.offer_id);
    if (!stored) reject(`offers: unknown offer ${offer.offer_id}`);
    if (isWithheldVariant(stored) || touchesWithheldId(offerSelectedId(stored), withheld)) {
      if (!deepEqual(stored, offer)) reject(`offers: withheld offer ${offer.offer_id} touched`);
      continue;
    }
    if (!sameAt(stored, offer, OFFER_PROTECTED_KEYS)) reject(`offers: offer ${offer.offer_id} verdict changed`);
    if (offer.variants !== undefined || stored.variants !== undefined) {
      checkVariants(stored.variants, offer.variants, withheld, `offers ${offer.offer_id}`);
    }
  }
}

/** The patch, when the answer is an applied one; null for every other outcome (or an older gateway). */
function appliedPatchOf(res: unknown): LivePdpRefreshPatch | null {
  if (!isRecord(res) || !isRecord(res.live_refresh) || !isRecord(res.patch)) return null;
  if (res.status !== undefined && res.status !== 'success') return null;
  if (res.live_refresh.mode !== 'on' || res.live_refresh.outcome !== 'applied') return null;
  return res.patch as LivePdpRefreshPatch;
}

/**
 * Apply one `pdp_live_read` answer to the open page, as a functional setState: returns `cur` itself
 * (nothing changes) unless every guard holds and every part of the patch passes. Pure; never mutates.
 *
 * Guards: the page still carries the token that was sent, for the same product and seller; it is a
 * served legacy-contract page (no `commerce` envelope, no pending verification); its product is not
 * purchase-unavailable.
 */
export function applyLiveRefreshPatch<T extends PDPPayload | null>(cur: T, sent: LiveRefreshSent, res: unknown): T {
  if (!cur) return cur;
  const patch = appliedPatchOf(res);
  if (!patch) return cur;
  if (!sent || !sent.token || cur.live_refresh?.token !== sent.token) return cur;
  if (String(cur.product?.product_id ?? '') !== String(sent.product_id ?? '')) return cur;
  if (String(cur.product?.merchant_id ?? '') !== String(sent.merchant_id ?? '')) return cur;
  if (cur.commerce || cur.commerce_verification) return cur;
  if (isPurchaseUnavailable(cur.product)) return cur;
  try {
    return applyChecked(cur, patch) as T;
  } catch (err) {
    if (err instanceof PatchRejected) return cur;
    throw err;
  }
}

function applyChecked(cur: PDPPayload, patch: LivePdpRefreshPatch): PDPPayload {
  for (const key of Object.keys(patch)) if (!PATCH_KEYS.has(key)) reject(`unknown patch part ${key}`);
  const curProduct = cur.product as unknown as Record<string, any>;
  const withheld = withheldIdsOf(curProduct);
  let changed = false;
  let next: PDPPayload = { ...cur };

  if (patch.product !== undefined) {
    if (!isRecord(patch.product)) reject('product: not an object');
    const set = patch.product.set ?? {};
    const unset = patch.product.unset ?? [];
    if (!isRecord(set) || !Array.isArray(unset)) reject('product: malformed set/unset');
    for (const key of Object.keys(set)) if (!PRODUCT_SET_KEYS.has(key)) reject(`product: key ${key} is not allowlisted`);
    for (const key of unset) if (typeof key !== 'string' || !PRODUCT_UNSET_KEYS.has(key)) reject(`product: unset ${String(key)} is not allowlisted`);
    if ('variants' in set) checkVariants(curProduct.variants, set.variants, withheld, 'product');
    const product: Record<string, any> = { ...curProduct, ...set };
    for (const key of unset) delete product[key];
    if (!sameAt(curProduct, product, PRODUCT_PROTECTED_KEYS)) reject('product: verdict changed');
    if (isPurchaseUnavailable(product)) reject('product: would become purchase-unavailable');
    next = { ...next, product: product as PDPPayload['product'] };
    changed = true;
  }

  if (patch.modules !== undefined) {
    if (!isRecord(patch.modules)) reject('modules: not an object');
    let modules = next.modules;
    for (const [type, data] of Object.entries(patch.modules)) {
      if (!PATCH_MODULE_TYPES.has(type)) reject(`modules: type ${type} is not allowlisted`);
      if (!isRecord(data)) reject(`modules: ${type} data is not an object`);
      const index = modules.findIndex((m) => m?.type === type);
      if (index < 0) reject(`modules: the page has no ${type}`);
      const stored = isRecord(modules[index].data) ? (modules[index].data as Record<string, any>) : {};
      if (!sameAt(stored, data, VERDICT_KEYS)) reject(`modules: ${type} verdict changed`);
      if (type === 'variant_selector') checkVariants(stored.variants, data.variants, withheld, 'variant_selector');
      modules = modules.map((m, i) => (i === index ? { ...m, data } : m));
    }
    next = { ...next, modules };
    changed = true;
  }

  if (patch.offers !== undefined) {
    if (!isRecord(patch.offers)) reject('offers: not an object');
    const offers = patch.offers.offers;
    if (offers !== undefined) checkOffers(cur.offers, offers, withheld);
    const finalOffers = (offers ?? cur.offers ?? []) as unknown[];
    // `null` is the gateway saying the page sent none: nothing to move.
    const best = patch.offers.best_price_offer_id ?? undefined;
    if (best !== undefined) {
      if (typeof best !== 'string' || !finalOffers.some((o) => isRecord(o) && o.offer_id === best)) reject('offers: best price names no offer');
    }
    next = {
      ...next,
      ...(offers !== undefined ? { offers: offers as PDPPayload['offers'] } : {}),
      ...(best !== undefined ? { best_price_offer_id: best } : {}),
    };
    changed = true;
  }

  const productBest = (next.product as unknown as Record<string, any>).best_price_offer_id;
  if (productBest !== curProduct.best_price_offer_id) {
    const finalOffers = Array.isArray(next.offers) ? next.offers : [];
    if (typeof productBest !== 'string' || !finalOffers.some((o) => o?.offer_id === productBest)) reject('product: best price names no offer');
  }

  if (patch.product_intel !== undefined) {
    if (!isRecord(patch.product_intel) || !isRecord(patch.product_intel.offer_pointers)) reject('product_intel: malformed');
    const index = next.modules.findIndex((m) => m?.type === 'product_intel');
    const stored = index >= 0 && isRecord(next.modules[index].data) ? (next.modules[index].data as Record<string, any>) : null;
    // Only pointers the page sent can come back; the public projection usually drops them.
    if (!stored || !isRecord(stored.offer_pointers)) reject('product_intel: the page sent no offer_pointers');
    const offer_pointers = patch.product_intel.offer_pointers;
    next = {
      ...next,
      modules: next.modules.map((m, i) => (i === index ? { ...m, data: { ...stored, offer_pointers } } : m)),
    };
    changed = true;
  }

  return changed ? next : cur;
}
