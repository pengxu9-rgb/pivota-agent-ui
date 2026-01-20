'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { listSkuReviews } from '@/lib/api';
import { cn } from '@/lib/utils';

type ReviewRow = {
  review_id: number | string;
  rating: number;
  title?: string | null;
  body?: string | null;
  snippet?: string | null;
  created_at?: string | null;
  verification?: string | null;
};

function StarDisplay({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, idx) => {
        const active = idx < clamped;
        return (
          <Star
            key={`star-${idx}`}
            className={cn('h-4 w-4', active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')}
          />
        );
      })}
      <span className="text-xs text-muted-foreground">{clamped.toFixed(1)}</span>
    </div>
  );
}

export default function ReviewsListPage() {
  const params = useSearchParams();

  const merchantId = params.get('merchant_id') || '';
  const platform = params.get('platform') || '';
  const platformProductId = params.get('platform_product_id') || '';
  const variantId = params.get('variant_id') || '';

  const canQuery = Boolean(merchantId && platform && platformProductId);

  const [items, setItems] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avgRating = useMemo(() => {
    if (!items.length) return 0;
    const sum = items.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return sum / Math.max(1, items.length);
  }, [items]);

  useEffect(() => {
    if (!canQuery) return;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const resp = await listSkuReviews({
          sku: {
            merchant_id: merchantId,
            platform,
            platform_product_id: platformProductId,
            variant_id: variantId || null,
          },
          filters: { limit: 50 },
        });
        if (!cancelled) {
          setItems(Array.isArray((resp as any)?.items) ? (resp as any).items : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load reviews');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [canQuery, merchantId, platform, platformProductId, variantId]);

  return (
    <div className="min-h-screen bg-gradient-mesh px-4 py-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Reviews</h1>
            <p className="text-sm text-muted-foreground">
              {platform ? `${platform} · ${platformProductId}` : 'Product reviews'}
            </p>
          </div>
          <Link href="/products" className="text-sm text-primary font-medium">
            Back to products
          </Link>
        </div>

        {!canQuery && (
          <div className="rounded-2xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
            Missing product context. Open this page from a PDP “See all reviews” link.
          </div>
        )}

        {canQuery && (
          <div className="rounded-2xl border border-border bg-card/70 p-5 flex items-center justify-between">
            <div>
              <div className="text-2xl font-semibold">{avgRating.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">{items.length} reviews</div>
            </div>
            <StarDisplay value={avgRating} />
          </div>
        )}

        {loading && <div className="text-sm text-muted-foreground">Loading reviews...</div>}
        {error && <div className="text-sm text-red-600">{error}</div>}

        {canQuery && !loading && !error && (
          <div className="space-y-4">
            {items.length ? (
              items.map((r) => (
                <div key={String(r.review_id)} className="rounded-2xl border border-border bg-white/70 p-5">
                  <div className="flex items-center justify-between">
                    <StarDisplay value={Number(r.rating) || 0} />
                    <span className="text-xs text-muted-foreground">
                      {(r.verification || '') === 'verified_buyer' ? 'Verified buyer' : 'Buyer'}
                    </span>
                  </div>
                  <div className="mt-2 font-medium">{r.title || 'Review'}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {r.body || r.snippet || '—'}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm text-muted-foreground">
                No reviews yet.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

