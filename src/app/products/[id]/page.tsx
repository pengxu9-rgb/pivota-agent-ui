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
import {
  isProductGroupRouteId,
  isPublicProductGroupRouteId,
  resolveProductRouteId,
} from '@/lib/productHref';

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const DEFAULT_TITLE = 'Pivota Shopping AI';
const METADATA_FETCH_TIMEOUT_MS = 6000;

function readSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
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

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function readCanonicalPdpProduct(response: unknown): Record<string, any> | null {
  const modules = Array.isArray((response as any)?.modules) ? (response as any).modules : [];
  const canonical = modules.find((module: any) => module?.type === 'canonical');
  const pdpPayload = canonical?.data?.pdp_payload;
  const product =
    pdpPayload?.product ||
    canonical?.data?.product ||
    (response as any)?.product ||
    null;
  if (!product || typeof product !== 'object') return null;

  // Stage 3b-2: attach the multi-seller offers array (same array
  // ProductDetailClient renders for the "Multiple sellers match this
  // product. Select one." card) under a namespaced key on the product
  // object so buildProductJsonLd can read it for AggregateOffer
  // emission. The underscore prefix keeps schema.org-emitting code
  // from accidentally treating it as a Product field. Read-only.
  const offers = pdpPayload?.offers;
  if (Array.isArray(offers) && offers.length > 0) {
    product._pivota_offers = offers;
  }
  return product;
}

function readPdpModule(response: unknown, type: string): Record<string, any> | null {
  const modules = Array.isArray((response as any)?.modules) ? (response as any).modules : [];
  const matchedModule = modules.find((item: any) => item?.type === type);
  return matchedModule && typeof matchedModule === 'object' ? matchedModule : null;
}

function readServerCanonicalRouteId(
  response: unknown,
  product: Record<string, any>,
  requestedProductId: string,
): string {
  const canonicalData = readPdpModule(response, 'canonical')?.data || {};
  const offersData = readPdpModule(response, 'offers')?.data || {};
  const subject = (response as any)?.subject || {};
  const groupId = firstString(
    canonicalData.product_group_id,
    (response as any)?.product_group_id,
    subject?.type === 'product_group' ? subject.id : '',
    product.product_group_id,
    product.sellable_item_group_id,
  );
  const canonicalScope = firstString(
    canonicalData.canonical_scope,
    (response as any)?.canonical_scope,
    (response as any)?.metadata?.identity_graph?.canonical_scope,
  );
  const offersCount = Number(offersData.offers_count ?? (response as any)?.offers_count);
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

/**
 * Fetch the canonical product object for server-render. Called twice per
 * PDP render (once from `generateMetadata`, once from the page itself
 * for JSON-LD).
 *
 * Performance note (2026-05-13): each call reads the denormalized
 * agent PDP view through /api/agent/pdp/{id}. Wrapping with React's
 * `cache()` shares the promise across `generateMetadata` + the page
 * render within a single request, avoiding duplicate backend reads.
 *
 * The cache() wrapper is added at module scope below; the inner
 * function stays separate so vitest can still call it directly without
 * needing a React render context. (Vitest tests `vi.stubGlobal('fetch',
 * ...)` to intercept the wire call, not the wrapped function — both
 * forms work the same way for tests.)
 */
async function _fetchProductForServerRenderUncached(
  args: { productId: string; merchantId?: string },
): Promise<{ product: Record<string, any>; canonicalRouteId: string } | null> {
  const productId = args.productId.trim();
  if (!productId) return null;

  const headerList = await headers();
  const baseUrl = resolveServerBaseUrl(headerList);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `${baseUrl}/api/agent/pdp/${encodeURIComponent(productId)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const product = readCanonicalPdpProduct(data);
    return product
      ? {
          product,
          canonicalRouteId: readServerCanonicalRouteId(data, product, productId),
        }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}


/**
 * Request-scoped cached wrapper. React's cache() memoizes the function
 * call within a single server render — multiple invocations with the
 * same arguments share one Promise. Cuts the 2× backend round-trip
 * (generateMetadata + ProductDetailPage) to 1×.
 *
 * The function still accepts merchantId because the callers already
 * derive it from the route, but /api/agent/pdp/{id} is keyed on the
 * canonical product identity and does not carry merchant_id over the
 * wire.
 *
 * Test compatibility: when React.cache() is invoked outside a server
 * render context (e.g. vitest), it falls back to passthrough — the
 * inner function still executes, just without memoization. Tests
 * `vi.stubGlobal('fetch', ...)` intercept the wire call regardless.
 */
const fetchProductForServerRender = cache(
  async (args: { productId: string; merchantId?: string }) => {
    return _fetchProductForServerRenderUncached(args);
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
  const productId = String(resolvedParams.id || '').trim();
  const merchantId = readSearchParam(resolvedSearchParams.merchant_id);
  const renderData = await fetchProductForServerRender({
    productId,
    ...(merchantId ? { merchantId } : {}),
  });

  return renderData
    ? buildMetadataFromProduct(renderData.product, renderData.canonicalRouteId)
    : { title: DEFAULT_TITLE, description: 'Shop products with Pivota Shopping AI.' };
}

export default async function ProductDetailPage(props: Props) {
  // Try to render JSON-LD server-side. Best-effort: when the PDP endpoint
  // call fails we still ship the client component (which fetches its
  // own data on hydration). Schema markup is purely additive.
  const resolvedParams = await props.params;
  const resolvedSearchParams = props.searchParams ? await props.searchParams : {};
  const productId = String(resolvedParams.id || '').trim();
  const merchantId = readSearchParam(resolvedSearchParams.merchant_id);

  const renderData = productId
    ? await fetchProductForServerRender({
        productId,
        ...(merchantId ? { merchantId } : {}),
      })
    : null;

  const jsonLd = renderData
    ? buildProductJsonLd({
        product: renderData.product,
        productId: renderData.canonicalRouteId || productId,
      })
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
      <ProductDetailClient params={props.params} />
    </>
  );
}
