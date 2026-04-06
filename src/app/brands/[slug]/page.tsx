import { headers } from 'next/headers';
import type { BrandDiscoveryFeedResult } from '@/lib/api';
import { normalizeProduct } from '@/lib/api';
import { BrandLandingPage } from './BrandLandingPage';

const INITIAL_BRAND_FEED_TIMEOUT_MS = 1500;

function readSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function decodeSlugToBrand(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

async function fetchInitialBrandFeed(args: {
  brandName: string;
  query?: string;
  category?: string;
  sourceProductId?: string;
  sourceMerchantId?: string;
}): Promise<BrandDiscoveryFeedResult | null> {
  const brandName = readSearchParam(args.brandName);
  if (!brandName) return null;

  const query = readSearchParam(args.query);
  const category = readSearchParam(args.category).toLowerCase();
  const sourceProductId = readSearchParam(args.sourceProductId);
  const sourceMerchantId = readSearchParam(args.sourceMerchantId);
  const shouldServerPrefetch = Boolean(query || category || sourceProductId);
  if (!shouldServerPrefetch) return null;
  const headerList = await headers();
  const baseUrl = resolveServerBaseUrl(headerList);
  const limit = 12;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INITIAL_BRAND_FEED_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        operation: 'get_discovery_feed',
        payload: {
          surface: 'browse_products',
          page: 1,
          limit,
          sort: 'popular',
          query: {
            text: query,
          },
          scope: {
            brand_names: [brandName],
            ...(category ? { categories: [category] } : {}),
          },
          context: {
            recent_views: [],
            recent_queries: [],
            locale: 'en-US',
          },
          ...(sourceProductId
            ? {
                source_product_ref: {
                  product_id: sourceProductId,
                  ...(sourceMerchantId ? { merchant_id: sourceMerchantId } : {}),
                },
              }
            : {}),
        },
      }),
    });

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;

    const products = Array.isArray((data as any).products)
      ? (data as any).products.map(normalizeProduct)
      : [];
    const metadata =
      (data as any).metadata && typeof (data as any).metadata === 'object'
        ? ((data as any).metadata as Record<string, any>)
        : {};
    const rawPage = Number((data as any).page);
    const rawPageSize = Number((data as any).page_size ?? (data as any).pageSize);
    const rawTotal = Number((data as any).total);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const pageSize =
      Number.isFinite(rawPageSize) && rawPageSize >= 0 ? Math.floor(rawPageSize) : products.length;
    const total =
      Number.isFinite(rawTotal) && rawTotal >= 0 ? Math.floor(rawTotal) : undefined;
    const hasMore =
      typeof metadata.has_more === 'boolean'
        ? metadata.has_more
        : typeof total === 'number'
          ? page * limit < total
          : products.length >= limit;

    return {
      products,
      metadata,
      facets: { categories: [] },
      query_text: query,
      page_info: {
        page,
        page_size: pageSize,
        ...(typeof total === 'number' ? { total } : {}),
        has_more: hasMore,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const initialBrandName = readSearchParam(resolvedSearchParams.name);
  const initialSourceProductId = readSearchParam(resolvedSearchParams.source_product_id);
  const initialSourceMerchantId = readSearchParam(resolvedSearchParams.source_merchant_id);
  const initialQuery = readSearchParam(resolvedSearchParams.q);
  const initialCategory = readSearchParam(resolvedSearchParams.category);
  const initialFeed = await fetchInitialBrandFeed({
    brandName: initialBrandName || decodeSlugToBrand(resolvedParams.slug),
    query: initialQuery,
    category: initialCategory,
    sourceProductId: initialSourceProductId,
    sourceMerchantId: initialSourceMerchantId,
  });

  return (
    <BrandLandingPage
      slug={resolvedParams.slug}
      initialBrandName={initialBrandName}
      initialSubtitle={readSearchParam(resolvedSearchParams.subtitle)}
      initialReturnUrl={readSearchParam(resolvedSearchParams.return)}
      initialSourceProductId={initialSourceProductId}
      initialSourceMerchantId={initialSourceMerchantId}
      initialQuery={initialQuery}
      initialCategory={initialCategory}
      initialFeed={initialFeed}
    />
  );
}
