import { headers } from 'next/headers';
import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';

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

async function fetchProductMetadata(args: {
  productId: string;
  merchantId?: string;
}): Promise<Metadata | null> {
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
    if (!product) return null;

    const title = buildProductTitle(product);
    const description = buildProductDescription(product);
    const image = readProductImage(product);
    const images = image ? [{ url: image, alt: firstString(product.title, product.name) || title }] : [];

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        ...(images.length ? { images } : {}),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const productId = String(resolvedParams.id || '').trim();
  const merchantId = readSearchParam(resolvedSearchParams.merchant_id);
  const metadata = await fetchProductMetadata({
    productId,
    ...(merchantId ? { merchantId } : {}),
  });

  return metadata || {
    title: DEFAULT_TITLE,
    description: 'Shop products with Pivota Shopping AI.',
  };
}

export default function ProductDetailPage(props: Props) {
  return <ProductDetailClient params={props.params} />;
}
