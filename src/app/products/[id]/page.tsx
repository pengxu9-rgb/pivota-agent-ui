import { cache as _reactCache } from 'react';
import { headers } from 'next/headers';

// React's cache() needs a server-component runtime. Vitest doesn't
// provide one — the named export becomes undefined and calling it
// throws. Detect and fall back to an identity wrapper (no memoization,
// but tests still call through correctly).
type _CacheFn = <T extends (...args: any[]) => any>(fn: T) => T;
const cache: _CacheFn = typeof _reactCache === 'function'
  ? (_reactCache as unknown as _CacheFn)
  : ((fn) => fn);
import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { buildProductDescription } from './productDescription';
import { buildProductJsonLd } from './productJsonLd';
import { getPdpV2 } from '@/lib/api';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { PDPPayload } from '@/features/pdp/types';
import {
  inferCanonicalPdpMerchantId,
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
export const revalidate = 3600;
const PDP_SERVER_FETCH_TIMEOUT_MS = 9000;
const PDP_SERVER_INCLUDE = [
  'offers',
  'variant_selector',
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'how_to_use',
  'product_overview',
  'supplemental_details',
  'reviews_preview',
  'similar',
] as const;

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

function resolveServerBaseUrl(headerList: Headers): string {
  const host =
    headerList.get('x-forwarded-host') ||
    headerList.get('host') ||
    '';
  const proto =
    headerList.get('x-forwarded-proto') ||
    (host.includes('localhost') ? 'http' : 'https');

  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (host) return `${proto}://${host}`;
  return 'https://agent.pivota.cc';
}

function resolveServerGatewayBaseUrl(headerList: Headers): string {
  return `${resolveServerBaseUrl(headerList).replace(/\/+$/, '')}/api/gateway`;
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

type ServerPdpRenderData = {
  initialPayload: PDPPayload;
  product: Record<string, any>;
  canonicalRouteId: string;
};

async function _fetchPdpForServerRenderUncached(
  productIdInput: string,
  merchantIdInput: string,
): Promise<ServerPdpRenderData | null> {
  const productId = String(productIdInput || '').trim();
  if (!productId) return null;

  const headerList = await headers();
  const normalizedMerchantId = normalizeProductRouteMerchantId(merchantIdInput, productId);
  const explicitMerchantId = inferCanonicalPdpMerchantId(productId, normalizedMerchantId);
  const routeIsProductGroup = isProductGroupRouteId(productId);

  try {
    const v2 = await getPdpV2({
      product_id: productId,
      ...(routeIsProductGroup
        ? { subject: { type: 'product_group' as const, id: productId } }
        : explicitMerchantId
          ? { merchant_id: explicitMerchantId }
          : {}),
      include: [...PDP_SERVER_INCLUDE],
      timeout_ms: PDP_SERVER_FETCH_TIMEOUT_MS,
      gatewayBaseUrl: resolveServerGatewayBaseUrl(headerList),
    });
    const initialPayload = mapPdpV2ToPdpPayload(v2);
    if (!initialPayload?.product) return null;
    const product = buildJsonLdProduct(initialPayload);
    return {
      initialPayload,
      product,
      canonicalRouteId: readServerCanonicalRouteId(v2, initialPayload, productId),
    };
  } catch {
    return null;
  }
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
  async (productId: string, merchantId: string) => {
    return _fetchPdpForServerRenderUncached(productId, merchantId);
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
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const productId = decodeProductIdParam(resolvedParams.id);
  const merchantId = readSearchParam(resolvedSearchParams.merchant_id);
  const renderData = await fetchPdpForServerRender(productId, merchantId);

  return renderData
    ? buildMetadataFromProduct(renderData.product, renderData.canonicalRouteId)
    : {
        title: DEFAULT_TITLE,
        description: 'Shop products with Pivota Shopping AI.',
        robots: { index: false, follow: false },
      };
}

export default async function ProductDetailPage(props: Props) {
  // Try to render JSON-LD server-side. Best-effort: when the PDP endpoint
  // call fails we still ship the client component (which fetches its
  // own data on hydration). Schema markup is purely additive.
  const resolvedParams = await props.params;
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const productId = decodeProductIdParam(resolvedParams.id);
  const merchantId = readSearchParam(resolvedSearchParams.merchant_id);

  const renderData = productId
    ? await fetchPdpForServerRender(productId, merchantId)
    : null;

  const reviewsModule = renderData
    ? readPdpModule(renderData.initialPayload, 'reviews_preview')?.data || null
    : null;
  const recommendationsModule = renderData
    ? readPdpModule(renderData.initialPayload, 'recommendations')?.data || null
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
      />
    </>
  );
}
