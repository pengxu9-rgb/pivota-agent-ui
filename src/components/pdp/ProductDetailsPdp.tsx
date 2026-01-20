'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  MediaGalleryData,
  PDPPayload,
  PricePromoData,
  ProductDetailsData,
  RecommendationsData,
  ReviewsPreviewData,
  Variant,
} from '@/lib/pdp/types';
import { isBeautyProduct } from '@/lib/pdp/isBeautyProduct';
import { pdpTracking } from '@/lib/pdp/tracking';
import { cn } from '@/lib/utils';

function getModuleData<T>(payload: PDPPayload, type: string): T | null {
  const m = payload.modules.find((x) => x.type === type);
  return (m?.data as T) ?? null;
}

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            'h-4 w-4',
            i < rounded ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
          )}
        />
      ))}
    </div>
  );
}

function VariantSelector({
  variants,
  selectedVariantId,
  onChange,
  mode,
}: {
  variants: Variant[];
  selectedVariantId: string;
  onChange: (variantId: string) => void;
  mode: 'beauty' | 'generic';
}) {
  if (!variants.length) return null;
  if (variants.length === 1) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {mode === 'beauty' ? 'Shade' : 'Options'}
        </div>
        <div className="text-xs text-muted-foreground">{variants.length} variants</div>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {variants.map((v) => {
          const isSelected = v.variant_id === selectedVariantId;
          return (
            <button
              key={v.variant_id}
              onClick={() => onChange(v.variant_id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors whitespace-nowrap',
                isSelected ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/30',
              )}
            >
              {mode === 'beauty' && v.swatch?.hex ? (
                <span
                  className="h-3 w-3 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: v.swatch.hex }}
                />
              ) : null}
              <span className={cn('truncate', isSelected ? 'font-semibold' : 'font-medium')}>
                {v.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DetailsAccordion({ data }: { data: ProductDetailsData }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {data.sections.map((s, idx) => {
        const isOpen = open.has(idx);
        return (
          <div key={`${s.heading}-${idx}`} className="border-b border-border last:border-b-0">
            <button
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(idx)) next.delete(idx);
                  else next.add(idx);
                  return next;
                })
              }
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/20"
            >
              <span className="text-sm font-semibold">{s.heading}</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-muted-foreground transition-transform',
                  isOpen ? 'rotate-180' : '',
                )}
              />
            </button>
            {isOpen ? (
              <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {s.content}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function RecommendationsGrid({ data }: { data: RecommendationsData }) {
  if (!data.items.length) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">You may also like</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.items.slice(0, 6).map((p) => (
          <Link
            key={p.product_id}
            href={`/products/${encodeURIComponent(p.product_id)}${p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''}`}
            className="rounded-2xl bg-card border border-border overflow-hidden hover:shadow-glass-hover transition-shadow"
          >
            <div className="relative aspect-square bg-black/5">
              {p.image_url ? (
                <Image src={p.image_url} alt={p.title} fill className="object-cover" unoptimized />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.title}</div>
              {p.price ? (
                <div className="mt-2 text-sm font-semibold">
                  {formatPrice(p.price.amount, p.price.currency)}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReviewsPreviewBlock({ data }: { data: ReviewsPreviewData }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Reviews</div>
        {data.entry_points?.write_review ? (
          <button className="text-xs font-medium text-primary">Write a review</button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="text-3xl font-bold">{data.rating.toFixed(1)}</div>
        <div>
          <StarRating value={(data.rating / data.scale) * 5} />
          <div className="mt-1 text-xs text-muted-foreground">{data.review_count} reviews</div>
        </div>
      </div>
      {data.preview_items?.length ? (
        <div className="mt-4 space-y-3">
          {data.preview_items.slice(0, 2).map((r) => (
            <div key={r.review_id} className="text-sm text-muted-foreground">
              <div className="text-xs text-foreground font-medium">
                {r.author_label || 'Verified buyer'}
              </div>
              <div className="mt-1 line-clamp-3">{r.text_snippet}</div>
            </div>
          ))}
        </div>
      ) : null}
      {data.open_reviews_url ? (
        <Link href={data.open_reviews_url} className="mt-4 w-full text-sm text-primary font-medium inline-flex justify-center">
          See all reviews
        </Link>
      ) : null}
    </div>
  );
}

export function ProductDetailsPdp({
  payload,
  initialQuantity = 1,
  onAddToCart,
  onBuyNow,
}: {
  payload: PDPPayload;
  initialQuantity?: number;
  onAddToCart: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number }) => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(payload.product.default_variant_id);
  const [quantity, setQuantity] = useState(initialQuantity);

  const selectedVariant = useMemo(() => {
    return payload.product.variants.find((v) => v.variant_id === selectedVariantId) || payload.product.variants[0];
  }, [payload, selectedVariantId]);

  const mode: 'beauty' | 'generic' = isBeautyProduct(payload.product) ? 'beauty' : 'generic';

  const media = getModuleData<MediaGalleryData>(payload, 'media_gallery');
  const pricePromo = getModuleData<PricePromoData>(payload, 'price_promo');
  const details = getModuleData<ProductDetailsData>(payload, 'product_details');
  const reviews = getModuleData<ReviewsPreviewData>(payload, 'reviews_preview');
  const recommendations = getModuleData<RecommendationsData>(payload, 'recommendations');

  useEffect(() => {
    pdpTracking.setBaseContext({
      page_request_id: payload.tracking.page_request_id,
      entry_point: payload.tracking.entry_point,
      experiment: payload.tracking.experiment,
      product_id: payload.product.product_id,
    });
    pdpTracking.track('pdp_view', { pdp_mode: mode });
  }, [payload, mode]);

  const hero = media?.items?.[0];
  const heroUrl = hero?.url || selectedVariant.image_url || '';
  const currency = selectedVariant.price?.current.currency || payload.product.price?.current.currency || 'USD';
  const priceAmount = selectedVariant.price?.current.amount ?? payload.product.price?.current.amount ?? 0;

  return (
    <div className="max-w-md mx-auto pb-28">
      {/* Media gallery */}
      <div className="relative">
        <div className="relative aspect-[6/5] bg-black/5">
          {heroUrl ? (
            <Image src={heroUrl} alt={hero?.alt_text || payload.product.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              No media
            </div>
          )}
        </div>
        {media?.items?.length ? (
          <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto">
            {media.items.slice(0, 6).map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative h-12 w-12 rounded-lg overflow-hidden ring-1 ring-white/30">
                <Image src={item.url} alt={item.alt_text || `Media ${idx + 1}`} fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Title + price */}
      <div className="px-4 py-4">
        <div className="text-xs text-muted-foreground">{mode === 'beauty' ? 'Beauty' : 'Product'}</div>
        <h1 className="mt-1 text-lg font-semibold leading-snug">{payload.product.title}</h1>
        {payload.product.subtitle ? (
          <div className="mt-1 text-sm text-muted-foreground">{payload.product.subtitle}</div>
        ) : null}

        <div className="mt-3 flex items-baseline gap-2">
          <div className="text-2xl font-bold">{formatPrice(priceAmount, currency)}</div>
          {pricePromo?.compare_at?.amount ? (
            <div className="text-sm text-muted-foreground line-through">
              {formatPrice(pricePromo.compare_at.amount, pricePromo.compare_at.currency || currency)}
            </div>
          ) : null}
        </div>

        <div className="mt-2 text-sm">
          {selectedVariant.availability?.in_stock ?? payload.product.availability?.in_stock ? (
            <span className="text-success">✓ In stock</span>
          ) : (
            <span className="text-destructive">Out of stock</span>
          )}
        </div>

        <VariantSelector
          variants={payload.product.variants}
          selectedVariantId={selectedVariant.variant_id}
          onChange={(variantId) => {
            setSelectedVariantId(variantId);
            pdpTracking.track('pdp_action_click', { action_type: 'select_variant', variant_id: variantId });
          }}
          mode={mode}
        />
      </div>

      {/* Trust badges (only if we actually have info) */}
      {(payload.product.shipping?.eta_days_range?.length || payload.product.returns?.return_window_days) ? (
        <div className="mx-4 rounded-2xl bg-card border border-border px-4 py-3 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
          {payload.product.shipping?.eta_days_range?.length ? (
            <span>
              Shipping {payload.product.shipping.eta_days_range[0]}–{payload.product.shipping.eta_days_range[1]} days
            </span>
          ) : null}
          {payload.product.returns?.return_window_days ? (
            <span>
              {payload.product.returns.free_returns ? 'Free returns' : 'Returns'} · {payload.product.returns.return_window_days} days
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Details */}
      {details ? (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-semibold mb-3">Details</h2>
          <DetailsAccordion data={details} />
        </div>
      ) : null}

      {/* Reviews (hide if missing) */}
      {reviews ? (
        <div className="px-4 mt-6">
          <h2 className="text-sm font-semibold mb-3">Reviews</h2>
          <ReviewsPreviewBlock data={reviews} />
        </div>
      ) : null}

      {/* Recommendations */}
      {recommendations ? <div className="px-4"><RecommendationsGrid data={recommendations} /></div> : null}

      {/* Action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t border-border">
        <div className="max-w-md mx-auto px-4 py-3 flex gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Decrease quantity"
            >
              −
            </Button>
            <div className="w-10 text-center text-sm font-semibold">{quantity}</div>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setQuantity((q) => q + 1)}
              aria-label="Increase quantity"
            >
              +
            </Button>
          </div>
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => {
              pdpTracking.track('pdp_action_click', { action_type: 'add_to_cart', variant_id: selectedVariant.variant_id });
              onAddToCart({ variant: selectedVariant, quantity });
            }}
          >
            Add to Cart
          </Button>
          <Button
            variant="gradient"
            className="flex-1 h-12"
            onClick={() => {
              pdpTracking.track('pdp_action_click', { action_type: 'buy_now', variant_id: selectedVariant.variant_id });
              onBuyNow({ variant: selectedVariant, quantity });
            }}
          >
            Buy Now
          </Button>
        </div>
      </div>
    </div>
  );
}
