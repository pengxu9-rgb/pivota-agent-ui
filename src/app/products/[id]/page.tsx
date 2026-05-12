import { headers } from 'next/headers';
import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
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
  const product =
    canonical?.data?.pdp_payload?.product ||
    canonical?.data?.product ||
    (response as any)?.product ||
    null;
  return product && typeof product === 'object' ? product : null;
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

function buildProductDescription(product: Record<string, any>): string {
  const rawDescription = firstString(
    product.description,
    product.short_description,
    product.subtitle,
    product.summary,
  );
  const normalized = rawDescription.replace(/\s+/g, ' ').trim();
  if (normalized) return normalized.slice(0, 220);

  const title = firstString(product.title, product.name, 'this product');
  return `Shop ${title} on Pivota.`;
}

function readProductImage(product: Record<string, any>): string {
  const imageUrls = Array.isArray(product.image_urls) ? product.image_urls : [];
  return firstString(product.image_url, imageUrls[0]);
}

/**
 * Fetch the canonical product object for server-render. Called twice per
 * PDP render (once from `generateMetadata`, once from the page itself
 * for JSON-LD). The downstream `/api/gateway` has its own short-TTL
 * cache so the second hit is cheap. We don't use React's `cache()`
 * because it's a server-component-only API that breaks vitest SSR.
 *
 * Returns the raw product object (or null) — callers shape it into
 * Metadata, Schema.org, or whatever they need.
 */
async function fetchProductForServerRender(
  args: { productId: string; merchantId?: string },
): Promise<{ product: Record<string, any>; canonicalRouteId: string } | null> {
  const productId = args.productId.trim();
  if (!productId) return null;

  const headerList = await headers();
  const baseUrl = resolveServerBaseUrl(headerList);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: {
            product_id: productId,
            ...(args.merchantId ? { merchant_id: args.merchantId } : {}),
          },
          include: [],
          options: {
            cache_bypass: false,
          },
          capabilities: {
            client: 'metadata',
            client_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
          },
        },
      }),
    });

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
  // Try to render JSON-LD server-side. Best-effort: when the gateway
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
