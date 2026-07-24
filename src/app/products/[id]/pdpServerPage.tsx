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
import { unstable_noStore } from 'next/cache';
import ProductDetailClient from './ProductDetailClient';
import { buildProductDescription } from './productDescription';
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

async function _fetchPdpForServerRenderUncached(
  productIdInput: string,
  merchantIdInput: string,
  revalidateSeconds?: number,
): Promise<ServerPdpRenderData | null> {
  const productId = String(productIdInput || '').trim();
  if (!productId) {
    return null;
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
  let renderData: ServerPdpRenderData | null = null;
  try {
    const v2 = cacheable
      ? await getPdpV2Cached({ ...fetchArgs, revalidateSeconds })
      : await getPdpV2(fetchArgs);
    const initialPayload = mapPdpV2ToPdpPayload(v2);
    if (initialPayload?.product) {
      renderData = {
        initialPayload,
        product: buildJsonLdProduct(initialPayload),
        canonicalRouteId: readServerCanonicalRouteId(v2, initialPayload, productId),
      };
    }
  } catch {
    renderData = null;
  }
  return renderData;
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
  const renderData = await fetchPdpForServerRender(
    productId,
    merchantId,
    personalizeThisRequest ? undefined : PDP_ROUTE_REVALIDATE_S,
  );

  if (renderData) {
    return buildMetadataFromProduct(renderData.product, renderData.canonicalRouteId);
  }
  // Server-side PDP fetch failed. For a route we publish in the product
  // sitemap (sig_ canonical signatures AND the ck_ content-key fallback for
  // store-less brands), a get_pdp_v2 failure is often transient (backend
  // cold-start / timeout) — emitting a hard `noindex` here actively
  // de-indexes a sitemap URL on a hiccup, and revalidate=3600 caches that
  // noindex for up to an hour. Omit the robots directive so Google can
  // retry/crawl; the client component still hydrates the product on the
  // page. Non-sitemap/alias routes keep the defensive noindex.
  const isSitemapRoute = isCanonicalCrawlRoute;
  return {
    title: DEFAULT_TITLE,
    description: 'Shop products with Pivota Shopping AI.',
    ...(isSitemapRoute ? {} : { robots: { index: false, follow: false } }),
  };
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

  const renderData = productId
    ? await fetchPdpForServerRender(productId, merchantId, fetchRevalidateSeconds)
    : null;
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
  const jsonLd = renderData
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
      />
    </>
  );
}
