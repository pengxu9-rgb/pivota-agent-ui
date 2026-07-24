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

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const DEFAULT_TITLE = 'Pivota Shopping AI';
// Next route segment config exports MUST be statically-analyzable literals — a
// const reference here breaks `next build` ("invalid segment configuration").
// Keep this literal in lockstep with PDP_ROUTE_REVALIDATE_S below.
export const revalidate = 3600;
const PDP_ROUTE_REVALIDATE_S = 3600;
const PDP_SERVER_FETCH_TIMEOUT_MS = 9000;

// THE KEYSTONE of the crawl-collapse fix (#266/#267 fixed the data-fetch layer;
// this fixes the ROUTE layer they sat above). A dynamic `[id]` route with only
// `revalidate` and NO `generateStaticParams` is classified `ƒ (Dynamic)`: it
// renders on-demand PER REQUEST and emits `cache-control: private, no-store`, so
// every crawl of the ~1,901 sitemap PDPs is a cold SSR and the CDN never caches
// (verified in prod post-#266: `x-nextjs-cache` absent, always MISS, and the
// framework's dynamic `no-store` overrides the next.config `s-maxage` header).
// Providing generateStaticParams — even empty, with the default
// `dynamicParams = true` — flips the route to `●` ISR: params are generated on
// first hit and CACHED for `revalidate` (verified locally: build `● /products/[id]`,
// runtime x-nextjs-cache MISS then HIT, cached body carries the real product).
// We return [] so the build prerenders none (fast build); all PDPs generate on
// demand then cache. Personalized renders (searchParams/merchant) still opt into
// dynamic per-request, which is correct.
export const dynamicParams = true;
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

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

// Seconds to cache the canonical (crawlable, anonymous) PDP server fetch in
// Next's data cache. Matches the route-level `revalidate` above. Only applied to
// the canonical sitemap path — the personalized (searchParams/merchant) path stays
// uncached. Without this the get_pdp_v2 POST is uncacheable, which forces the whole
// route to render dynamically (`private, no-store`) and every crawl of the ~1,900
// sitemap URLs is a cold multi-second SSR → Google/AI crawl budget collapse.
const PDP_CANONICAL_REVALIDATE_S = 3600;

/**
 * Degraded-shell cache opt-out (S1 follow-up to the crawl-collapse fix).
 *
 * A degraded PDP render — gateway read failed or returned an empty payload —
 * ships a thin 200 shell: DEFAULT_TITLE, no JSON-LD, robots omitted on sitemap
 * routes so crawlers can retry. That shell must NEVER be stored by any
 * full-route / CDN cache: on a caching route (`revalidate = 3600` + the
 * next.config s-maxage header) a single backend hiccup would pin the empty
 * shell for an hour (+ a day of stale-while-revalidate) on exactly the URLs we
 * publish in the sitemap.
 *
 * `unstable_noStore()` is the per-render opt-out with the differential
 * behavior we need in Next 15:
 * - In a request-time static/ISR generation pass it marks the pending route
 *   entry uncacheable (revalidate 0) and throws DynamicServerError, bailing
 *   the render out to dynamic rendering — Next serves the request dynamically
 *   and stores nothing, so the next request re-renders from scratch. This is
 *   why callers MUST invoke it outside their own try/catch: the bail-out
 *   error has to propagate to the framework.
 * - In an already-dynamic render it is a harmless no-op marker.
 * - Outside a Next render runtime (vitest) it returns silently.
 *
 * Successful renders must never reach this call — caching healthy canonical
 * PDPs is the whole point of the crawl-collapse fix.
 */
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
    markDegradedPdpRenderUncacheable();
    return null;
  }

  const normalizedMerchantId = normalizeProductRouteMerchantId(merchantIdInput, productId);
  const explicitMerchantId = inferCanonicalPdpMerchantId(productId, normalizedMerchantId);
  const routeIsProductGroup = isProductGroupRouteId(productId);

  // Canonical crawlable routes (no personalization) go through the unstable_cache-
  // backed read so the render has no dynamic POST fetch → the route can render
  // static and the CDN/ISR cache serves crawlers a warm page. Personalized loads
  // (searchParams / explicit merchant on a non-canonical id) stay on the raw
  // uncached read. The caller passes revalidateSeconds only for the canonical path.
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
  if (!renderData) {
    // Degraded outcome (gateway error OR 200-but-empty payload): opt this
    // render out of full-route/CDN caching. Deliberately OUTSIDE the
    // try/catch above — unstable_noStore's DynamicServerError bail-out must
    // propagate to Next, not be swallowed by the gateway-error handling.
    markDegradedPdpRenderUncacheable();
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

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const productId = decodeProductIdParam(resolvedParams.id);
  // Canonical crawlable routes (sig_ signatures, ck_ content-keys, and product
  // groups) are anonymous sitemap URLs — identical for every visitor. They must
  // NOT await searchParams (a dynamic-render trigger) and CAN be data-cached.
  const isCanonicalCrawlRoute = isCanonicalCrawlableRoute(productId);
  const resolvedSearchParams = !isCanonicalCrawlRoute && searchParams ? await searchParams : {};
  const merchantId = isCanonicalCrawlRoute ? '' : readSearchParam(resolvedSearchParams.merchant_id);
  const renderData = await fetchPdpForServerRender(
    productId,
    merchantId,
    isCanonicalCrawlRoute ? PDP_ROUTE_REVALIDATE_S : undefined,
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

export default async function ProductDetailPage(props: Props) {
  // Try to render JSON-LD server-side. Best-effort: when the PDP endpoint
  // call fails we still ship the client component (which fetches its
  // own data on hydration). Schema markup is purely additive.
  const resolvedParams = await props.params;
  const productId = decodeProductIdParam(resolvedParams.id);
  const isCanonicalCrawlRoute = isCanonicalCrawlableRoute(productId);
  const resolvedSearchParams =
    !isCanonicalCrawlRoute && props.searchParams ? await props.searchParams : {};
  const merchantId = isCanonicalCrawlRoute ? '' : readSearchParam(resolvedSearchParams.merchant_id);

  const renderData = productId
    ? await fetchPdpForServerRender(
        productId,
        merchantId,
        isCanonicalCrawlRoute ? PDP_ROUTE_REVALIDATE_S : undefined,
      )
    : null;
  const beautyServicesEnabled = process.env.NEXT_PUBLIC_BEAUTY_SERVICES_RECS_ENABLED === '1';
  const serviceRecommendations: ServiceCardData[] =
    renderData && beautyServicesEnabled && isBeautyProduct(renderData.initialPayload.product)
      ? await fetchSeoulServicesForAnchor(
          renderData.initialPayload.product,
          isCanonicalCrawlRoute ? PDP_ROUTE_REVALIDATE_S : undefined,
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
