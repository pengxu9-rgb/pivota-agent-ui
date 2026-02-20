import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronRight } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';

const IMAGE_PROXY_PATH = '/api/image-proxy';
const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function isAbsoluteUrl(url: string): boolean {
  return ABSOLUTE_URL_RE.test(url);
}

function toRelativePathWithQuery(url: URL): string {
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ''}${url.hash || ''}`;
}

function unwrapNestedProxy(url: URL): void {
  const inner = url.searchParams.get('url');
  if (!inner) return;
  try {
    const innerParsed = new URL(inner, 'http://localhost');
    if (innerParsed.pathname !== IMAGE_PROXY_PATH) return;
    const nested = innerParsed.searchParams.get('url');
    if (nested) {
      url.searchParams.set('url', nested);
    }
  } catch {
    // Ignore malformed nested URL.
  }
}

function applyKnownHostWidthHint(rawUrl: string, width: number): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('cdn.shopify.com') || host.includes('shopifycdn.com')) {
      if (!parsed.searchParams.has('width')) {
        parsed.searchParams.set('width', String(width));
      }
      return parsed.toString();
    }
    if (host.includes('wixstatic.com') || host.includes('images.unsplash.com')) {
      if (!parsed.searchParams.has('w')) {
        parsed.searchParams.set('w', String(width));
      }
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

export function optimizeRecommendationImageUrl(rawUrl: string, width = 480): string {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const absolute = isAbsoluteUrl(rawUrl);

    if (parsed.pathname === IMAGE_PROXY_PATH) {
      unwrapNestedProxy(parsed);
      const innerUrl = parsed.searchParams.get('url');
      if (innerUrl) {
        parsed.searchParams.set('url', applyKnownHostWidthHint(innerUrl, width));
      }
      parsed.searchParams.delete('width');
      if (!parsed.searchParams.has('w')) {
        parsed.searchParams.set('w', String(width));
      }
      return absolute ? parsed.toString() : toRelativePathWithQuery(parsed);
    }

    if (!absolute) return rawUrl;
    return applyKnownHostWidthHint(parsed.toString(), width);
  } catch {
    return rawUrl;
  }
}

export function RecommendationsGrid({
  data,
  onItemClick,
  onOpenAll,
}: {
  data: RecommendationsData;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
  onOpenAll?: () => void;
}) {
  if (!data.items.length) return null;
  return (
    <div className="py-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">You May Also Like</h3>
        <button
          type="button"
          onClick={onOpenAll}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
        >
          View all <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 grid grid-cols-2 gap-3">
        {data.items.slice(0, 6).map((p, idx) => (
          <Link
            key={p.product_id}
            href={`/products/${encodeURIComponent(p.product_id)}${p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''}`}
            prefetch={false}
            className="rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
            onClick={() => onItemClick?.(p, idx)}
          >
            <div className="relative aspect-square bg-muted">
              {p.image_url ? (
                <Image
                  src={optimizeRecommendationImageUrl(p.image_url)}
                  alt={p.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                  loading={idx < 2 ? 'eager' : 'lazy'}
                  fetchPriority={idx < 2 ? 'high' : 'auto'}
                  quality={idx < 2 ? 72 : 65}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.title}</div>
              {p.rating ? (
                <div className="flex items-center gap-1 mt-2">
                  <Star className="h-3 w-3 fill-gold text-gold" />
                  <span className="text-xs">{p.rating.toFixed(1)}</span>
                  {p.review_count ? (
                    <span className="text-xs text-muted-foreground">({p.review_count})</span>
                  ) : null}
                </div>
              ) : null}
              {p.price ? (
                <div className="mt-2 text-sm font-bold">
                  {formatPrice(p.price.amount, p.price.currency)}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      <button className="w-full mt-4 py-3 text-sm text-muted-foreground hover:text-foreground">
        Load more recommendations
      </button>
    </div>
  );
}

export function RecommendationsSkeleton() {
  return (
    <div className="py-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <div className="h-4 w-32 rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/20 animate-pulse" />
      </div>
      <div className="px-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-card border border-border overflow-hidden"
          >
            <div className="aspect-square bg-muted/25 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-full rounded bg-muted/25 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted/20 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
