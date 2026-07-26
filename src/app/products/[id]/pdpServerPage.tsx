import { cache as _reactCache } from 'react';

// React's cache() needs a server-component runtime. Vitest doesn't
// provide one — the named export becomes undefined and calling it
// throws. Detect and fall back to an identity wrapper (no memoization,
// but tests still call through correctly).
type _CacheFn = <T extends (...args: any[]) => any>(fn: T) => T;
const cache: _CacheFn = typeof _reactCache === 'function'
  ? (_reactCache as unknown as _CacheFn)
  : ((fn) => fn);
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { unstable_noStore } from 'next/cache';
import ProductDetailClient from './ProductDetailClient';
import { buildProductDescription } from './productDescription';
import { unstable_rethrow } from 'next/navigation';
import { buildProductJsonLd } from './productJsonLd';
import { getPdpV2, getPdpV2Cached, getServicesBrowse } from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { getProviderListings, type ServiceCardData } from '@/features/services/lib/types';
import { inferAnchorServiceTypesFromProduct, pickAnchorListing } from '@/features/services/lib/pick-anchor-listing';
import {
  inferCanonicalPdpMerchantId,
  isPivotaSignatureRouteId,
  isProductGroupRouteId,
  isPublicProductGroupRouteId,
  normalizeProductRouteMerchantId,
  resolveProductRouteId,
} from '@/lib/productHref';

export interface PdpRouteProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Which physical route is rendering this PDP.
 *
 * - `personalized: false` — the canonical `/products/[id]` route. It is
 *   static/ISR (revalidate + generateStaticParams) and must NEVER touch
 *   searchParams or any other dynamic API: during on-demand static generation
 *   of a dynamic-segment path, a dynamic-API read is a hard 500
 *   (DYNAMIC_SERVER_USAGE), not a graceful fallback to dynamic rendering.
 *   Every server fetch on this route therefore goes through the cached read,
 *   for non-canonical ids too (the fetch is anonymous either way).
 * - `personalized: true` — the force-dynamic `/products/m/[id]` alias route,
 *   reached via the next.config `beforeFiles` rewrite whenever the request
 *   carries a `?merchant_id` query. It preserves the merchant-scoped SSR
 *   fetch for non-canonical ids (uncached, per-request).
 *
 * Canonical crawlable ids (sig_/ck_/pg_) behave identically in both modes:
 * anonymous, cached, no searchParams.
 */
export interface PdpRouteMode {
  personalized: boolean;
}

const DEFAULT_TITLE = 'Pivota Shopping AI';
const PDP_ROUTE_REVALIDATE_S = 3600;
const PDP_SERVER_FETCH_TIMEOUT_MS = 9000;
// Budget for the single transient-only retry (see _fetchPdpForServerRenderUncached).
// Kept well under the first-attempt budget so a retry cannot double worst-case
// ISR fill latency: 9s + 3s = 12s, which still leaves render headroom inside
// the platform's default serverless function limit (vercel.json sets no
// maxDuration). Raising either budget needs that ceiling re-checked — an ISR
// fill that gets killed mid-render is a 504, which is worse than the 500 the
// retry exists to avoid.
const PDP_SERVER_RETRY_TIMEOUT_MS = 3000;

// The anonymous, crawlable, sitemap-published PDP route ids: Pivota signatures
// (sig_), content-key canonicals (ck_) for store-less brands, and product groups
// (pg_). These render identically for every visitor — no searchParams, no per-user
// merchant — so they skip the dynamic-render triggers and are data-cached.
function isCanonicalCrawlableRoute(productId: string): boolean {
  return (
    isPivotaSignatureRouteId(productId) ||
    isProductGroupRouteId(productId) ||
    String(productId || '').toLowerCase().startsWith('ck_')
  );
}
const PDP_SERVER_INCLUDE = [
  'offers',
  'variant_selector',
  'product_overview',
  'reviews_preview',
] as const;

// When on, also fetch product_intel server-side and emit its public-safe grounded claims
// into the JSON-LD (rendering is additionally gated by the backend's public_ready, set by
// the same flag on the gateway). Default off → SSR fetch + JSON-LD unchanged.
const PDP_GROUNDED_CLAIMS_JSONLD_ENABLED = /^(1|true|yes|on)$/i.test(
  (process.env.PDP_PUBLIC_GROUNDED_CLAIMS_ENABLED ?? '').trim(),
);

function readSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

// Next.js dynamic-route params keep the URL-encoded form (`%3A` etc.) — the
// gateway needs the decoded product_id to match `external_product_id`.
function decodeProductIdParam(raw: unknown): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

function resolveServerBaseUrl(): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(explicit)) return explicit;
  const vercel = (process.env.VERCEL_URL || '').trim().replace(/\/+$/, '');
  if (vercel) return `https://${vercel}`;
  return 'https://agent.pivota.cc';
}

function resolveServerGatewayBaseUrl(): string {
  return `${resolveServerBaseUrl()}/api/gateway`;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function readPdpModule(response: unknown, type: string): Record<string, any> | null {
  const modules = Array.isArray((response as any)?.modules) ? (response as any).modules : [];
  const matchedModule = modules.find((item: any) => item?.type === type);
  return matchedModule && typeof matchedModule === 'object' ? matchedModule : null;
}

function readServerCanonicalRouteId(
  response: unknown,
  payload: PDPPayload,
  requestedProductId: string,
): string {
  const canonicalData = readPdpModule(response, 'canonical')?.data || {};
  const offersData = readPdpModule(response, 'offers')?.data || {};
  const subject = (response as any)?.subject || {};
  const product = payload.product as Record<string, any>;
  const groupId = firstString(
    canonicalData.product_group_id,
    payload.product_group_id,
    (response as any)?.product_group_id,
    subject?.type === 'product_group' ? subject.id : '',
    product.product_group_id,
    product.sellable_item_group_id,
  );
  const canonicalScope = firstString(
    canonicalData.canonical_scope,
    payload.canonical_scope,
    (response as any)?.canonical_scope,
    (response as any)?.metadata?.identity_graph?.canonical_scope,
  );
  const offersCount = Number(offersData.offers_count ?? payload.offers_count ?? (response as any)?.offers_count);
  const requestedIsGroup = isProductGroupRouteId(requestedProductId);
  const shouldUseGroup =
    isPublicProductGroupRouteId(groupId) &&
    (
      requestedIsGroup ||
      canonicalScope === 'multi_merchant_canonical' ||
      (Number.isFinite(offersCount) && offersCount > 1)
    );
  if (shouldUseGroup) return groupId;

  // SAME-CONTENT duplicates, one rung narrower than the group above.
  //
  // 474 content_keys serve identical content — same title, same Product
  // JSON-LD, verified by live probes — under 2 to 7 sig URLs. Until now every
  // one of those pages emitted a SELF-referential canonical, so two URLs each
  // declared themselves canonical for the same content and Google was free to
  // index the one the sitemap omits. #280 made the sitemap advertise exactly
  // one; this makes the OTHER pages point at it.
  //
  // The value is the gateway's, not ours. It has to be the same sig the
  // sitemap advertises, and that winner is sticky on index equity (#280 seeded
  // it from the URLs already indexed) rather than derivable from the row — so
  // both surfaces read one stored answer from pivota-backend rather than each
  // applying a rule. Recomputing it here would let this tag name sig A while
  // the sitemap submits sig B, which tells the crawler to drop the URL we just
  // submitted: strictly worse than the duplicate.
  //
  // Ranked BELOW the group: a multi-merchant group is the wider
  // canonicalisation and already subsumes this one. Absent (null, or an
  // unelected content_key) falls through to self, exactly as before.
  //
  // The validation is `/^sig_.+/` — CASE-SENSITIVE, and deliberately not
  // `isPivotaSignatureRouteId`.
  //
  // Two traps, both of which end in this page naming a URL the sitemap does
  // not, which is the invariant break:
  //
  //  1. `isPivotaSignatureRouteId` is a lowercasing startsWith, so it accepts
  //     "SIG_ABC" while scripts/sitemap_lib.mjs's `/^sig_.+/` rejects it. The
  //     two halves would then validate the same stored field with different
  //     predicates — and this PR's whole thesis is one stored answer read
  //     identically by both surfaces.
  //  2. startsWith alone accepts a bare "sig_" with no body, and
  //     /products/sig_ errors in production exactly like a ck_ URL does (the
  //     same trap sitemap_lib.mjs documents at its own sig gate).
  //
  // Canonicalising a live page at a URL that 500s is worse than leaving the
  // duplicate: it hands the crawler an error page as the preferred version.
  // A step-5 DEDUPE KEEPER outranks the content-key election.
  //
  // PIVOTA-Agent#1833 points a tombstoned dedupe loser at its keeper and
  // signals it with canonical_route_basis='dedupe_keeper'. That keeper lives in
  // the SAME content_key, so both mechanisms canonicalise one group — and the
  // row layer decided this one on 2026-07-10 with an explicit
  // suppression_metadata.keeper_product_key, which is strictly better evidence
  // than an election seeded from whichever URL happened to be indexed. Letting
  // the election win here would point a live keeper back at the tombstone it
  // replaced and silently undo a fix already in production.
  //
  // The backend refuses to elect a tombstoned row at all, so in a healthy
  // system the two agree and this branch never has to arbitrate. It is here
  // because "the two agree" is exactly the assumption that failed once.
  const dedupeKeeperSigId = firstString(
    (product as any)?.canonical_route_basis === 'dedupe_keeper'
      ? (product as any)?.canonical_route_sig_id
      : '',
  );
  if (/^sig_.+/.test(dedupeKeeperSigId)) return dedupeKeeperSigId;

  const contentCanonicalRouteId = firstString(canonicalData.content_canonical_route_id);
  if (/^sig_.+/.test(contentCanonicalRouteId)) {
    return contentCanonicalRouteId;
  }

  return resolveProductRouteId(product) || requestedProductId;
}

function buildProductTitle(product: Record<string, any>): string {
  const title = firstString(product.title, product.name);
  if (!title) return DEFAULT_TITLE;
  const brand = firstString(product.brand?.name, product.brand_name, product.brand);
  const titleLower = title.toLowerCase();
  const brandLower = brand.toLowerCase();
  const productTitle = brand && brandLower && !titleLower.includes(brandLower)
    ? `${brand} ${title}`
    : title;
  return `${productTitle} | Pivota`;
}

function readProductImage(product: Record<string, any>): string {
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
  return firstString(product.image_url, imageUrls[0]);
}

function buildJsonLdProduct(payload: PDPPayload): Record<string, any> {
  const product = payload.product as Record<string, any>;
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  return offers.length > 0
    ? { ...product, _pivota_offers: offers }
    : product;
}

async function fetchSeoulServicesForAnchor(
  product: PDPPayload['product'],
  revalidateSeconds?: number,
): Promise<ServiceCardData[]> {
  const inferredTypes = inferAnchorServiceTypesFromProduct(product);
  const primaryType = inferredTypes[0];
  const response = await getServicesBrowse(
    {
      service_type: primaryType ? [primaryType] : undefined,
      limit: 3,
    },
    // On a canonical crawlable route the supplementary services fetch MUST be
    // cacheable too — otherwise its no-store GET forces the whole beauty PDP
    // dynamic and silently re-collapses the caching fix (the exact recurrence
    // this change is meant to end).
    typeof revalidateSeconds === 'number' && revalidateSeconds > 0
      ? { revalidateSeconds }
      : undefined,
  );

  return (response.results || [])
    .filter((provider) => getProviderListings(provider).length > 0)
    .slice(0, 3)
    .map((provider) => ({
      provider,
      listing: pickAnchorListing(provider, product),
      usdRate: response.usd_per_won_rate || provider.usd_per_won_rate,
    }));
}

type ServerPdpRenderData = {
  initialPayload: PDPPayload;
  product: Record<string, any>;
  canonicalRouteId: string;
};

/**
 * Degraded-render handling (S1 follow-up to the crawl-collapse fix, revised
 * for the static/ISR flip).
 *
 * A degraded PDP render — gateway read failed or returned an empty payload —
 * must NEVER be stored by any full-route / CDN cache: on the static/ISR route
 * (`revalidate = 3600`) a single backend hiccup would pin an empty shell for
 * an hour on exactly the URLs we publish in the sitemap. The CDN
 * Cache-Control is deliberately left to Next (no static next.config header):
 * a config header is stamped on every response for the path, including
 * degraded ones, which would tell CDNs to cache the shell anyway.
 *
 * The mechanism differs by route, because `unstable_noStore()` CANNOT
 * gracefully bail an on-demand static generation pass out to dynamic
 * rendering — empirically (Next 15.5, `next start`) any DynamicServerError
 * thrown while filling an ISR path surfaces as an unstyled hard 500:
 *
 * - Static/ISR route (`personalized: false`): the degraded render THROWS
 *   `PDP_DEGRADED_RENDER_ERROR`. The fill fails → nothing is stored → the
 *   next request re-renders from scratch; during background revalidation the
 *   throw makes Next KEEP SERVING the last healthy cached page instead of
 *   replacing it with a shell. Crawlers see an honest, uncacheable 500 and
 *   retry later. For human visitors arriving via client-side navigation the
 *   route's error.tsx boundary renders the client-recovery PDP
 *   (ProductDetailClient refetches on hydration); a hard navigation to a
 *   not-yet-cached path during a hiccup gets Next's generic 500 page — the
 *   boundary cannot render inside a failed fill pass.
 * - Force-dynamic alias route (`personalized: true`): renders the graceful
 *   200 shell exactly as before. `unstable_noStore()` is a no-op marker in an
 *   already-dynamic render — kept as a tripwire: if the alias route ever
 *   loses `force-dynamic`, degraded fills fail loudly instead of caching a
 *   personalized view.
 *
 * Successful renders must never reach either path — caching healthy canonical
 * PDPs is the whole point of the crawl-collapse fix.
 */
export const PDP_DEGRADED_RENDER_ERROR = 'PDP_DEGRADED_RENDER_UNCACHEABLE';

function markDegradedPdpRenderUncacheable(): void {
  unstable_noStore();
}

/**
 * Why a server-side PDP read produced no renderable product.
 *
 * The static/ISR flip made this distinction load-bearing. Before it, every
 * failure rendered the same 200 shell; after it, every failure THREW, so
 * ~127 of the 1,901 sitemap URLs (6.7%) started serving HTTP 500 — products
 * the gateway hard-404s because their `external_product_seeds.status` is
 * `inactive`. Those will never render, and a repeated 5xx on a sitemap URL
 * burns Google crawl budget instead of retiring the URL.
 *
 * - `unbuildable` — PERMANENT. The gateway named a specific, settled reason
 *   this product cannot render. Retrying cannot change the outcome →
 *   `notFound()` (404).
 * - `degraded` — TRANSIENT. Everything else: timeout, network failure, 5xx,
 *   throttling, an unrecognized 4xx. Keep the honest 500 so the crawler comes
 *   back and nothing broken is cached.
 *
 * THE CLASSIFIER IS A STRICT ALLOWLIST, AND MUST STAY ONE.
 *
 * The asymmetry is severe. A wrong `degraded` costs a 500 that self-heals on
 * the next crawl. A wrong `unbuildable` costs a 404 that Next STORES in the
 * ISR/CDN cache with the route's `s-maxage` (plus a long
 * stale-while-revalidate), so it outlives the incident that caused it and
 * actively de-indexes a healthy product.
 *
 * Blast radius is what rules out the tempting general rules:
 *
 * - "any 4xx is permanent" — the gateway's serving-eligibility gate FAILS
 *   CLOSED to `404 PRODUCT_NOT_SERVABLE` whenever it cannot read eligibility,
 *   including on any DB error (the read returns null and is only warn-logged).
 *   One Postgres hiccup would therefore 404 the ENTIRE catalog, and cache it.
 * - "PRODUCT_NOT_FOUND is permanent" — also reachable from identity-resolution
 *   misses, which flap.
 * - "INVALID_REQUEST is permanent" — that is the invoke-envelope schema
 *   rejection, raised for EVERY operation. agent-ui and PIVOTA-Agent deploy
 *   independently, so a request-shape drift would 404 every PDP at once.
 * - "200 with no mappable product is permanent" — `getPdpV2Cached` documents
 *   the opposite: an empty payload means mid-ingestion or a serving-eligibility
 *   flap, which is exactly the transient case.
 *
 * So only reasons we have empirically confirmed to be terminal qualify, and
 * each must be matched on the gateway's own `details.reason`, not on a status
 * class.
 */
export type PdpFetchOutcome =
  | { status: 'ok'; data: ServerPdpRenderData }
  | { status: 'unbuildable' }
  | { status: 'degraded' };

/**
 * The allowlist: gateway `details.reason` values that are settled facts about
 * the product, not about the health of the read path.
 *
 * `external_seed_not_active` — the seed-status precheck runs BEFORE identity
 * resolution and hard-404s any `external_product_seeds` row whose status is
 * not 'active'. Nothing downstream can make such a row render, and the status
 * only changes via a deliberate seed-lifecycle write. This is the measured
 * cohort: 127 of 1,901 sitemap URLs on 2026-07-25, 100% of the 500s found in
 * a 60-URL sample.
 *
 * Adding an entry here is a load-bearing decision. Require evidence that the
 * reason cannot be produced by a transient infrastructure failure.
 */
const PERMANENTLY_UNBUILDABLE_GATEWAY_REASONS = new Set([
  'external_seed_not_active',
]);

function readGatewayFailureReason(err: unknown): string {
  // callGateway parks the whole parsed error body on `err.detail`.
  const detail = (err as any)?.detail;
  const reason =
    detail?.details?.reason ??
    detail?.error?.details?.reason ??
    detail?.detail?.details?.reason;
  return String(reason || '').trim().toLowerCase();
}

/**
 * Classify a thrown gateway error as permanently unbuildable vs transient.
 *
 * `callGateway` attaches `status`, `code`, and the parsed body (`detail`) to
 * the Error it throws, which is what makes this distinction possible without
 * re-probing.
 */
export function classifyPdpFetchFailure(err: unknown): 'unbuildable' | 'degraded' {
  const code = String((err as any)?.code || '').trim().toUpperCase();
  // Guard the allowlist behind the not-found code as well as the reason, so a
  // reason string echoed on some unrelated 5xx cannot 404 a live product.
  if (code === 'PRODUCT_NOT_FOUND') {
    const reason = readGatewayFailureReason(err);
    if (PERMANENTLY_UNBUILDABLE_GATEWAY_REASONS.has(reason)) return 'unbuildable';
  }
  // Everything else — including bare 4xx, PRODUCT_NOT_SERVABLE, and
  // INVALID_REQUEST — is treated as a possibly-transient read failure.
  return 'degraded';
}

/**
 * Is this failure worth exactly one more attempt?
 *
 * An ALLOWLIST, for the same reason the classifier is one: every retry is a
 * second gateway POST inside an ISR fill, so a loose predicate turns a
 * backend wobble into amplified load on the backend that is already wobbling.
 *
 * Retryable = our own client-side timeout, plus genuine transport failures
 * (fetch rejects with a TypeError; aborts surface as AbortError).
 *
 * Deliberately NOT retried:
 * - 5xx — the gateway is explicitly reporting distress; doubling cold-fill
 *   traffic makes the outage worse.
 * - `pdp_empty_payload_not_cached` — getPdpV2Cached's sentinel for a
 *   mid-ingestion product. It carries no status, so a "no status means
 *   network error" rule would retry every one of them.
 * - Anything thrown by our own mapping code (mapPdpV2ToPdpPayload,
 *   buildJsonLdProduct, readServerCanonicalRouteId all run inside the try).
 *   A programming error is perfectly reproducible; retrying it just doubles
 *   the cost of the crash.
 */
const RETRYABLE_ERROR_NAMES = new Set(['TypeError', 'AbortError', 'FetchError']);

function shouldRetryPdpFetchFailure(err: unknown): boolean {
  const code = String((err as any)?.code || '').trim().toUpperCase();
  if (code === 'UPSTREAM_TIMEOUT') return true;
  // A transport failure never reaches the response-parsing branch that would
  // have attached a status, so require BOTH: no status, and an error shaped
  // like a fetch/abort rejection.
  if (Number.isFinite(Number((err as any)?.status))) return false;
  return RETRYABLE_ERROR_NAMES.has(String((err as any)?.name || ''));
}

async function _fetchPdpForServerRenderUncached(
  productIdInput: string,
  merchantIdInput: string,
  revalidateSeconds?: number,
): Promise<PdpFetchOutcome> {
  const productId = String(productIdInput || '').trim();
  if (!productId) {
    // No id at all — there is nothing to retry into existence.
    return { status: 'unbuildable' };
  }

  const normalizedMerchantId = normalizeProductRouteMerchantId(merchantIdInput, productId);
  const explicitMerchantId = inferCanonicalPdpMerchantId(productId, normalizedMerchantId);
  const routeIsProductGroup = isProductGroupRouteId(productId);

  // Anonymous loads go through the unstable_cache-backed read so the render has
  // no dynamic POST fetch → the route can render static and the CDN/ISR cache
  // serves crawlers a warm page. Personalized loads (merchant searchParams on the
  // force-dynamic alias route) stay on the raw uncached read. The caller passes
  // revalidateSeconds for every render of the static route (canonical AND
  // non-canonical ids — both are anonymous there) and never for personalized ones.
  const cacheable = typeof revalidateSeconds === 'number' && revalidateSeconds > 0;
  const fetchArgs = {
    product_id: productId,
    ...(routeIsProductGroup
      ? { subject: { type: 'product_group' as const, id: productId } }
      : explicitMerchantId
        ? { merchant_id: explicitMerchantId }
        : {}),
    include: [
      ...PDP_SERVER_INCLUDE,
      ...(PDP_GROUNDED_CLAIMS_JSONLD_ENABLED ? ['product_intel'] : []),
    ],
    timeout_ms: PDP_SERVER_FETCH_TIMEOUT_MS,
    gatewayBaseUrl: resolveServerGatewayBaseUrl(),
  };
  type Attempt = { outcome: PdpFetchOutcome; retryable: boolean };

  const attempt = async (timeoutMs: number): Promise<Attempt> => {
    const args = { ...fetchArgs, timeout_ms: timeoutMs };
    try {
      const v2 = cacheable
        ? await getPdpV2Cached({ ...args, revalidateSeconds })
        : await getPdpV2(args);
      const initialPayload = mapPdpV2ToPdpPayload(v2);
      if (initialPayload?.product) {
        return {
          outcome: {
            status: 'ok',
            data: {
              initialPayload,
              product: buildJsonLdProduct(initialPayload),
              canonicalRouteId: readServerCanonicalRouteId(v2, initialPayload, productId),
            },
          },
          retryable: false,
        };
      }
      // HTTP 200 whose payload carries no mappable product. This is NOT
      // treated as permanent: getPdpV2Cached documents an empty payload as a
      // product mid-ingestion or a serving-eligibility flap — transient by
      // construction. It stays a degraded 500 exactly as it was before the
      // static/ISR flip. (On the canonical route this branch is largely
      // academic: getPdpV2Cached rejects an empty payload rather than caching
      // it, so the throw lands in the catch below and classifies the same way.)
      return { outcome: { status: 'degraded' }, retryable: false };
    } catch (err) {
      return {
        outcome: { status: classifyPdpFetchFailure(err) },
        retryable: shouldRetryPdpFetchFailure(err),
      };
    }
  };

  const first = await attempt(PDP_SERVER_FETCH_TIMEOUT_MS);
  // One short retry, narrowly scoped: only our own timeout and status-less
  // network errors. It buys back the single-hiccup case that would otherwise
  // 500 a healthy sitemap URL, without re-asking a question the gateway has
  // already answered, and without adding load to a gateway that is explicitly
  // reporting distress (a 5xx is NOT retried — doubling cold-fill traffic on
  // an overloaded backend makes the outage worse).
  //
  // The retry runs on a DELIBERATELY SMALLER budget. The dominant transient
  // failure is the 9s timeout, so a full-budget retry would push worst-case
  // ISR fill to ~18s — slower than the cold SSR this whole workstream exists
  // to kill. Capped at PDP_SERVER_RETRY_TIMEOUT_MS, worst case stays ~13s and
  // a gateway that is merely slow (rather than briefly down) still fails fast.
  if (!first.retryable) return first.outcome;
  return (await attempt(PDP_SERVER_RETRY_TIMEOUT_MS)).outcome;
}


/**
 * Request-scoped cached wrapper. React's cache() memoizes this full PDP
 * fetch within a single server render, so generateMetadata and the page
 * share one get_pdp_v2 operation.
 *
 * Keep the cache key primitive. Passing fresh object literals would miss
 * React.cache's argument identity map and could reintroduce duplicate
 * backend reads.
 *
 * Test compatibility: when React.cache() is invoked outside a server
 * render context (e.g. vitest), it falls back to passthrough — the
 * inner function still executes, just without memoization.
 */
const fetchPdpForServerRender = cache(
  async (productId: string, merchantId: string, revalidateSeconds?: number) => {
    return _fetchPdpForServerRenderUncached(productId, merchantId, revalidateSeconds);
  },
);

const SITE_BASE = 'https://agent.pivota.cc';

function buildMetadataFromProduct(
  product: Record<string, any>,
  canonicalRouteId: string,
): Metadata {
  const title = buildProductTitle(product);
  const description = buildProductDescription(product);
  const image = readProductImage(product);
  const images = image ? [{ url: image, alt: firstString(product.title, product.name) || title }] : [];
  const canonicalUrl = `${SITE_BASE}/products/${canonicalRouteId}`;

  return {
    title,
    description,
    // Canonical link prevents Gemini / Google from conflating ext_*
    // alias URLs with the canonical sig_* PDP. Without it the same
    // product can split index signal across multiple URLs.
    alternates: {
      canonical: canonicalUrl,
    },
    // Defense-in-depth on top of robots.txt — explicit page-level
    // permission for crawlers like GoogleOther / Google-Extended that
    // sometimes treat robots.txt as advisory.
    robots: { index: true, follow: true },
    // Keep this on a Next-supported OpenGraph type. The Product-specific
    // indexing signal lives in the server-rendered Product JSON-LD below;
    // forcing `product` here can break Next's metadata resolver at runtime.
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      ...(images.length ? { images } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export async function generatePdpMetadata(
  { params, searchParams }: PdpRouteProps,
  mode: PdpRouteMode,
): Promise<Metadata> {
  const resolvedParams = await params;
  const productId = decodeProductIdParam(resolvedParams.id);
  // Canonical crawlable routes (sig_ signatures, ck_ content-keys, and product
  // groups) are anonymous sitemap URLs — identical for every visitor. They must
  // NOT await searchParams (a dynamic-render trigger) and CAN be data-cached.
  // On the static/ISR route (personalized: false) that applies to EVERY id:
  // awaiting searchParams there would 500 on-demand generation, so non-canonical
  // ids render anonymously and merchant personalization happens on the
  // force-dynamic /products/m/[id] alias route (personalized: true).
  const isCanonicalCrawlRoute = isCanonicalCrawlableRoute(productId);
  const personalizeThisRequest = mode.personalized && !isCanonicalCrawlRoute;
  const resolvedSearchParams =
    personalizeThisRequest && searchParams ? await searchParams : {};
  const merchantId = personalizeThisRequest
    ? readSearchParam(resolvedSearchParams.merchant_id)
    : '';
  const outcome = await fetchPdpForServerRender(
    productId,
    merchantId,
    personalizeThisRequest ? undefined : PDP_ROUTE_REVALIDATE_S,
  );

  if (outcome.status === 'ok') {
    return buildMetadataFromProduct(outcome.data.product, outcome.data.canonicalRouteId);
  }
  // PERMANENTLY unbuildable on the route that 404s: renderPdpPage calls
  // notFound() for this same id, so this metadata only ever decorates the 404.
  // Emit the defensive noindex — there is no product here to index, and unlike
  // the transient case below there is no hiccup to protect against.
  //
  // Scoped to `!mode.personalized` on purpose. The alias route does NOT 404 an
  // unbuildable id; it renders the 200 shell and lets the client hydrate a real
  // product. Stamping noindex on that page would be a live 200 telling crawlers
  // to drop a product that renders fine.
  if (outcome.status === 'unbuildable' && !mode.personalized) {
    return {
      title: DEFAULT_TITLE,
      description: 'Shop products with Pivota Shopping AI.',
      robots: { index: false, follow: false },
    };
  }
  // TRANSIENT failure. For a route we publish in the product sitemap (sig_
  // canonical signatures AND the ck_ content-key fallback for store-less
  // brands), a get_pdp_v2 failure is often transient (backend cold-start /
  // timeout) — emitting a hard `noindex` here actively de-indexes a sitemap
  // URL on a hiccup, and revalidate=3600 caches that noindex for up to an
  // hour. Omit the robots directive so Google can retry/crawl; the client
  // component still hydrates the product on the page. Non-sitemap/alias
  // routes keep the defensive noindex.
  const isSitemapRoute = isCanonicalCrawlRoute;
  return {
    title: DEFAULT_TITLE,
    description: 'Shop products with Pivota Shopping AI.',
    ...(isSitemapRoute ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * Build the canonical route's JSON-LD for emission from `layout.tsx`, i.e.
 * OUTSIDE the Suspense boundary that `loading.tsx` puts around the page.
 *
 * Why this exists: `ProductDetailClient` calls `useSearchParams()` (see
 * ProductDetailClient.tsx) with no enclosing Suspense, so under a static/ISR
 * prerender Next emits `BAILOUT_TO_CLIENT_SIDE_RENDERING` for that subtree —
 * `<!--$!-->`, an ERRORED boundary whose fallback is permanent. The page's
 * output, including its own `<script type="application/ld+json">`, therefore
 * NEVER reaches the HTML; only the skeleton does. Measured on prod 2026-07-25:
 * strip the `<script>` tags from a live PDP and the readable text is 69
 * characters — `"<title> | Pivota  Loading products"`. Googlebot executes JS so
 * it recovers; GPTBot/ClaudeBot and most LLM grounding crawlers do NOT.
 *
 * NOTE this is NOT ordinary Suspense streaming (a *pending* boundary does get
 * backfilled into the byte stream, so deleting `loading.tsx` would not help) and
 * it is not a regression from the ISR flip per se — the ISR flip is simply what
 * turned an always-dynamic render into a prerender, where the bailout bites. The
 * force-dynamic /products/m/[id] alias has no bailout and renders its full body.
 *
 * A LAYOUT renders outside that bailed subtree, so markup emitted here does reach
 * the raw HTML.
 *
 * Cost: none extra. `fetchPdpForServerRender` is React-`cache()`d, so the page's
 * own call in the same render pass reuses this promise — one backend read.
 *
 * NEVER THROWS. The canonical route deliberately throws on a degraded render so
 * ISR won't store a 200 shell (see PDP_DEGRADED_RENDER_ERROR); that decision
 * belongs to the page. If the layout threw first we'd 500 before the page could
 * choose, so failures here degrade to "no markup" and the page still decides.
 * (The underlying fetch swallows its own errors and resolves to `null` for BOTH
 * callers, so the page still sees the degraded result and throws — one backend
 * read, behaviour intact.)
 */
function serializeSearchParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      for (const v of value) if (v != null) out.append(key, String(v));
    } else if (value != null) {
      out.append(key, String(value));
    }
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

export async function buildCanonicalPdpJsonLd(
  params: PdpRouteProps['params'],
): Promise<string | null> {
  try {
    const resolvedParams = await params;
    const productId = decodeProductIdParam(resolvedParams.id);
    if (!productId) return null;

    // #270 turned this into a discriminated union: only `ok` carries data, and
    // `unbuildable`/`degraded` mean there is no product to describe. Emitting
    // markup for either would put schema on a 404 or an error shell.
    const outcome = await fetchPdpForServerRender(productId, '', PDP_ROUTE_REVALIDATE_S);
    if (outcome.status !== 'ok') return null;
    const renderData = outcome.data;

    return buildProductJsonLd(
      {
        product: renderData.product,
        productId: renderData.canonicalRouteId || productId,
      },
      {
        reviewsModule: readPdpModule(renderData.initialPayload, 'reviews_preview')?.data || null,
        recommendationsModule:
          readPdpModule(renderData.initialPayload, 'recommendations')?.data || null,
        productIntelModule: readPdpModule(renderData.initialPayload, 'product_intel')?.data || null,
      },
    );
  } catch (err) {
    // Never swallow Next's control-flow signals (notFound/redirect/PPR postpone)
    // — a bare catch would silently degrade those to "no JSON-LD".
    unstable_rethrow(err);
    return null;
  }
}

export async function renderPdpPage(props: PdpRouteProps, mode: PdpRouteMode) {
  // Try to render JSON-LD server-side. Best-effort: when the PDP endpoint
  // call fails we still ship the client component (which fetches its
  // own data on hydration). Schema markup is purely additive.
  const resolvedParams = await props.params;
  const productId = decodeProductIdParam(resolvedParams.id);
  const isCanonicalCrawlRoute = isCanonicalCrawlableRoute(productId);
  // See generatePdpMetadata: searchParams/merchant personalization exists only
  // on the force-dynamic alias route; the static/ISR route always renders the
  // anonymous, data-cached view (dynamic-API reads there 500 on-demand ISR).
  const personalizeThisRequest = mode.personalized && !isCanonicalCrawlRoute;
  const resolvedSearchParams =
    personalizeThisRequest && props.searchParams ? await props.searchParams : {};
  const merchantId = personalizeThisRequest
    ? readSearchParam(resolvedSearchParams.merchant_id)
    : '';
  const fetchRevalidateSeconds = personalizeThisRequest ? undefined : PDP_ROUTE_REVALIDATE_S;

  const outcome: PdpFetchOutcome = productId
    ? await fetchPdpForServerRender(productId, merchantId, fetchRevalidateSeconds)
    : { status: 'unbuildable' };

  // PERMANENTLY unbuildable → 404, on the crawlable static/ISR route only.
  //
  // This is the regression #269 introduced: the gateway hard-404s these ids
  // (`external_seed_not_active`), the fetch threw, and the throw below turned
  // every one of them into a 500 — ~127 sitemap URLs repeatedly serving 5xx,
  // which throttles crawl budget instead of retiring the URL. A 404 tells
  // Google to drop it, and Next stores the 404 rather than a bogus 200 shell,
  // so nothing broken gets cached as valid.
  //
  // Scoped to the canonical route deliberately. On the personalized alias
  // route a 4xx can mean "not visible to THIS merchant scope" rather than
  // "does not exist", so it keeps rendering the graceful 200 shell exactly as
  // before — that route is force-dynamic and no-store, so it is never cached
  // and never crawled.
  if (outcome.status === 'unbuildable' && !mode.personalized) {
    notFound();
  }

  const renderData = outcome.status === 'ok' ? outcome.data : null;
  if (!renderData) {
    // See PDP_DEGRADED_RENDER_ERROR doc above: on the static/ISR route a 200
    // shell would be STORED for `revalidate` seconds, so the render must fail
    // instead (error.tsx serves the client-recovery UI); on the force-dynamic
    // alias route the shell is safe (never stored) and noStore is a tripwire.
    if (!mode.personalized) {
      throw new Error(PDP_DEGRADED_RENDER_ERROR);
    }
    markDegradedPdpRenderUncacheable();
  }
  const beautyServicesEnabled = process.env.NEXT_PUBLIC_BEAUTY_SERVICES_RECS_ENABLED === '1';
  const serviceRecommendations: ServiceCardData[] =
    renderData && beautyServicesEnabled && isBeautyProduct(renderData.initialPayload.product)
      ? await fetchSeoulServicesForAnchor(
          renderData.initialPayload.product,
          fetchRevalidateSeconds,
        ).catch(() => [])
      : [];

  const reviewsModule = renderData
    ? readPdpModule(renderData.initialPayload, 'reviews_preview')?.data || null
    : null;
  const recommendationsModule = renderData
    ? readPdpModule(renderData.initialPayload, 'recommendations')?.data || null
    : null;
  const productIntelModule = renderData
    ? readPdpModule(renderData.initialPayload, 'product_intel')?.data || null
    : null;
  // On the CANONICAL route the JSON-LD is emitted by layout.tsx instead, so it
  // lands in the SSR shell rather than the (crawler-invisible) streamed flight
  // payload — see buildCanonicalPdpJsonLd. Emitting it here too would duplicate
  // the block. The force-dynamic /products/m/[id] alias has no such layout, so
  // it keeps rendering its own markup here.
  const jsonLd = mode.personalized && renderData
    ? buildProductJsonLd(
        {
          product: renderData.product,
          productId: renderData.canonicalRouteId || productId,
        },
        {
          reviewsModule,
          recommendationsModule,
          productIntelModule,
        },
      )
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // Pre-serialized + sanitized inside buildProductJsonLd; we use
          // dangerouslySetInnerHTML so Next.js doesn't escape the angle
          // brackets that schema validators expect to see literally.
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      <ProductDetailClient
        key={JSON.stringify([productId || null, merchantId || null])}
        params={props.params}
        initialPayload={renderData?.initialPayload ?? null}
        serviceRecommendations={serviceRecommendations}
        // Server snapshot for useUrlSearchParams. '' on the canonical route
        // (anonymous by contract), the real query on the force-dynamic alias.
        // Reading searchParams here on the canonical route would 500 the
        // on-demand ISR render, which is why personalizeThisRequest gates it.
        initialSearch={serializeSearchParams(resolvedSearchParams)}
      />
    </>
  );
}
