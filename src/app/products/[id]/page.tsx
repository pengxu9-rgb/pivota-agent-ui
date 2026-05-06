import { headers } from 'next/headers';
import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { buildProductJsonLd } from './productJsonLd';

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
): Promise<Record<string, any> | null> {
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
    return readCanonicalPdpProduct(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

const SITE_BASE = 'https://agent.pivota.cc';

function buildMetadataFromProduct(
  product: Record<string, any>,
  productId: string,
): Metadata {
  const title = buildProductTitle(product);
  const description = buildProductDescription(product);
  const image = readProductImage(product);
  const images = image ? [{ url: image, alt: firstString(product.title, product.name) || title }] : [];
  const canonicalUrl = `${SITE_BASE}/products/${productId}`;

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
    // og:type=product is what Gemini's product extractor + Facebook /
    // LinkedIn / Twitter card scrapers expect for PDPs. `website`
    // (the previous value) gets down-weighted as a generic landing
    // page. Next.js 15.5's OpenGraphType union doesn't include
    // 'product' (only article/book/profile/website/music/video), but
    // the OG spec does, and Next.js renders the string verbatim into
    // <meta property="og:type" content="...">. The cast is a known
    // workaround until Next bumps the union; flagged in the
    // pivota-pdp-indexing-discoverability runbook.
    openGraph: {
      title,
      description,
      type: 'product',
      url: canonicalUrl,
      ...(images.length ? { images } : {}),
    } as Metadata['openGraph'],
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
  const product = await fetchProductForServerRender({
    productId,
    ...(merchantId ? { merchantId } : {}),
  });

  return product
    ? buildMetadataFromProduct(product, productId)
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

  const product = productId
    ? await fetchProductForServerRender({
        productId,
        ...(merchantId ? { merchantId } : {}),
      })
    : null;

  const jsonLd = product ? buildProductJsonLd({ product, productId }) : null;

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
