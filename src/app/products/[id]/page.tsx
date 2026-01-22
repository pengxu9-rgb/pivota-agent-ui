'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { getAllProducts, getProductDetail, resolveProductCandidates, type ProductResponse } from '@/lib/api';
import { mapToPdpPayload } from '@/features/pdp/adapter/mapToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import type { Variant } from '@/features/pdp/types';
import { pdpTracking } from '@/features/pdp/tracking';

interface Props {
  params: Promise<{ id: string }>;
}

function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
          <div className="h-10 flex-1 rounded-full bg-muted/20 animate-pulse" />
          <div className="h-10 w-10 rounded-full bg-muted/25 animate-pulse" />
        </div>

        <div className="mt-4 aspect-[3/4] rounded-3xl bg-muted/20 animate-pulse" />

        <div className="mt-5 space-y-2">
          <div className="h-8 w-32 rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-full rounded bg-muted/20 animate-pulse" />
          <div className="h-5 w-3/4 rounded bg-muted/20 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted/20 animate-pulse" />
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Loading product details…
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const merchantIdParam = searchParams.get('merchant_id') || undefined;
  const pdpOverride = (searchParams.get('pdp') || '').toLowerCase();
  const router = useRouter();

  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<ProductResponse[]>([]);
  const [sellerCandidates, setSellerCandidates] = useState<ProductResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { addItem, open } = useCartStore();

  useEffect(() => {
    let cancelled = false;
    const cacheKey = merchantIdParam ? `pdp-cache:${merchantIdParam}:${id}` : null;
    const isNumericProductId = /^\d+$/.test(id);
    const fastTimeoutMs = 2500;

    const loadProduct = async () => {
      setLoading(true);
      setError(null);
      setSellerCandidates(null);

      // Fast path: resolve candidates/offers when merchant_id is missing.
      // This avoids expensive empty-query multi-merchant scans.
      if (!merchantIdParam) {
        try {
          const resolved = await resolveProductCandidates({
            product_id: id,
            limit: 10,
            include_offers: true,
            timeout_ms: fastTimeoutMs,
          });
          const offers = Array.isArray(resolved?.offers) ? resolved!.offers! : [];
          const offersCount =
            typeof resolved?.offers_count === 'number'
              ? resolved.offers_count
              : offers.length;

          pdpTracking.track('pdp_candidates_resolved', {
            product_id: id,
            offers_count: offersCount,
          });

          if (offersCount > 1 && offers.length > 0) {
            const candidates: ProductResponse[] = offers
              .map((offer) => {
                const merchantId = String(offer?.merchant_id || '').trim();
                if (!merchantId) return null;
                const priceAmount =
                  typeof offer?.price === 'number'
                    ? Number(offer.price) || 0
                    : Number((offer as any)?.price?.amount || 0);
                const priceCurrency =
                  typeof offer?.price === 'number'
                    ? 'USD'
                    : String((offer as any)?.price?.currency || 'USD');

                return {
                  product_id: id,
                  merchant_id: merchantId,
                  merchant_name: (offer as any)?.merchant_name || undefined,
                  title: '',
                  description: '',
                  price: priceAmount,
                  currency: priceCurrency,
                  in_stock: (offer as any)?.inventory?.in_stock !== false,
                } satisfies ProductResponse;
              })
              .filter(Boolean) as ProductResponse[];

            if (!cancelled) {
              setProduct(null);
              setRelatedProducts([]);
              setError(null);
              setSellerCandidates(candidates);
              setLoading(false);
            }
            return;
          }

          if (offersCount === 1 && offers.length === 1) {
            const merchantId = String(offers[0]?.merchant_id || '').trim();
            if (merchantId) {
              router.replace(
                `/products/${encodeURIComponent(id)}?merchant_id=${encodeURIComponent(merchantId)}`,
              );
              return;
            }
          }
        } catch {
          // Fallback (safe + fast): avoid broad empty-query scans.
          // - numeric product ids: try an ID-targeted lookup
          // - non-numeric ids: show retry UI (can’t safely resolve sellers)
          if (!isNumericProductId) {
            if (!cancelled) {
              setProduct(null);
              setRelatedProducts([]);
              setSellerCandidates(null);
              setError('Can’t load sellers for this product right now. Please retry.');
              setLoading(false);
            }
            return;
          }
        }
      }

      try {
        if (cacheKey) {
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as ProductResponse;
            if (!cancelled) {
              setProduct(parsed);
              setLoading(false);
            }
          }
        }
      } catch {
        // ignore cache failures
      }
      try {
        const data = await getProductDetail(id, merchantIdParam, {
          useConfiguredMerchantId: Boolean(merchantIdParam),
          allowBroadScan: Boolean(merchantIdParam),
          timeout_ms: merchantIdParam ? undefined : fastTimeoutMs,
        });
        if (!data) {
          if (!cancelled) {
            setProduct(null);
            setError('Product not found');
            setSellerCandidates(null);
            setLoading(false);
          }
          return;
        }
        if (cancelled) return;

        if (!merchantIdParam && data.merchant_id) {
          router.replace(
            `/products/${encodeURIComponent(id)}?merchant_id=${encodeURIComponent(String(data.merchant_id))}`,
          );
          return;
        }

        setProduct(data);
        setLoading(false);
        try {
          if (cacheKey) {
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
          }
        } catch {
          // ignore cache failures
        }

        void (async () => {
          try {
            const all = await getAllProducts(6, data.merchant_id);
            if (!cancelled) {
              setRelatedProducts(all.filter((p) => p.product_id !== id));
            }
          } catch (relError) {
            // eslint-disable-next-line no-console
            console.error('Failed to load related products:', relError);
          }
        })();

        try {
          const history = JSON.parse(localStorage.getItem('browse_history') || '[]');
          const filtered = history.filter((item: any) => item.product_id !== id);
          const newHistory = [
            {
              product_id: data.product_id,
              merchant_id: data.merchant_id,
              title: data.title,
              price: data.price,
              image: data.image_url || '/placeholder.svg',
              description: data.description,
              timestamp: Date.now(),
            },
            ...filtered,
          ].slice(0, 50);
          localStorage.setItem('browse_history', JSON.stringify(newHistory));
        } catch (browseError) {
          // eslint-disable-next-line no-console
          console.error('Failed to save browse history:', browseError);
        }
      } catch (err) {
        if ((err as any)?.code === 'AMBIGUOUS_PRODUCT_ID' && Array.isArray((err as any)?.candidates)) {
          if (!cancelled) {
            setProduct(null);
            setRelatedProducts([]);
            setError(null);
            setSellerCandidates((err as any).candidates as ProductResponse[]);
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setError((err as Error).message || 'Failed to load product');
          setProduct(null);
          setSellerCandidates(null);
          setLoading(false);
        }
      }
    };

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id, merchantIdParam, reloadKey, router]);

  useEffect(() => {
    if (!sellerCandidates?.length) return;
    pdpTracking.track('pdp_choose_seller_impression', {
      product_id: id,
      candidates_count: sellerCandidates.length,
    });
  }, [id, sellerCandidates]);

  const pdpPayload = useMemo(() => {
    if (!product) return null;
    return mapToPdpPayload({
      product,
      rawDetail: product.raw_detail,
      relatedProducts,
      entryPoint: 'product_detail',
    });
  }, [product, relatedProducts]);

  const resolvedMode = useMemo(() => {
    if (pdpOverride === 'beauty') return 'beauty';
    if (pdpOverride === 'generic') return 'generic';
    if (!pdpPayload) return 'generic';
    return isBeautyProduct(pdpPayload.product) ? 'beauty' : 'generic';
  }, [pdpOverride, pdpPayload]);

  const handleAddToCart = ({
    variant,
    quantity,
    merchant_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    offer_id?: string;
  }) => {
    if (!product) return;
    if (product.external_redirect_url) {
      window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const resolvedMerchantId = String(merchant_id || product.merchant_id || '').trim() || product.merchant_id;
    const resolvedVariantId = String(variant.variant_id || '').trim() || product.product_id;
    const cartItemId = resolvedMerchantId
      ? `${resolvedMerchantId}:${resolvedVariantId}`
      : resolvedVariantId;
    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: resolvedVariantId,
      sku: variant.sku_id,
      title: product.title,
      price: variant.price?.current.amount ?? product.price,
      currency: variant.price?.current.currency || product.currency,
      imageUrl: variant.image_url || product.image_url || '/placeholder.svg',
      merchant_id: resolvedMerchantId,
      offer_id: offer_id ? String(offer_id) : undefined,
      quantity,
    });
    toast.success(`✓ Added ${quantity}x ${product.title} to cart!`);
    open();
  };

  const handleBuyNow = ({
    variant,
    quantity,
    merchant_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    offer_id?: string;
  }) => {
    if (!product) return;
    if (product.external_redirect_url) {
      window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const resolvedMerchantId = String(merchant_id || product.merchant_id || '').trim() || product.merchant_id;
    const checkoutItems = [
      {
        product_id: product.product_id,
        merchant_id: resolvedMerchantId,
        title: product.title,
        quantity,
        unit_price: variant.price?.current.amount ?? product.price,
        image_url: variant.image_url || product.image_url || '/placeholder.svg',
        variant_id: variant.variant_id,
        offer_id: offer_id ? String(offer_id) : undefined,
      },
    ];
    const encoded = encodeURIComponent(JSON.stringify(checkoutItems));
    router.push(`/order?items=${encoded}`);
  };

  const handleWriteReview = () => {
    if (!product) return;
    const params = new URLSearchParams();
    params.set('product_id', product.product_id);
    if (product.merchant_id) params.set('merchant_id', product.merchant_id);
    router.push(`/reviews/write?${params.toString()}`);
  };

  if (loading && !product) {
    return <ProductDetailLoading />;
  }

  if (!loading && !product && sellerCandidates?.length) {
    const sorted = [...sellerCandidates].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6">
          <div className="text-lg font-semibold">Choose a seller</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Multiple sellers match this product. Select one to continue.
          </div>
          <div className="mt-4 space-y-3">
            {sorted.map((candidate) => {
              const merchantId = String(candidate.merchant_id || '').trim();
              const label = candidate.merchant_name || merchantId || 'Unknown seller';
              return (
                <button
                  key={`${merchantId}:${candidate.product_id}`}
                  type="button"
                  className="w-full rounded-2xl border border-border bg-white/60 hover:bg-white/80 transition-colors px-4 py-3 text-left disabled:opacity-60"
                  onClick={() => {
                    if (!merchantId) return;
                    pdpTracking.track('pdp_choose_seller_select', {
                      product_id: id,
                      merchant_id: merchantId,
                    });
                    router.push(`/products/${encodeURIComponent(id)}?merchant_id=${encodeURIComponent(merchantId)}`);
                  }}
                  disabled={!merchantId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{merchantId}</div>
                    </div>
                    <div className="text-sm font-semibold">
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: candidate.currency || 'USD',
                      }).format(Number(candidate.price) || 0)}
                    </div>
                  </div>
                  {candidate.in_stock === false ? (
                    <div className="mt-2 text-xs text-red-600">Out of stock</div>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            This prevents selecting the wrong seller when <code>merchant_id</code> is missing.
          </div>
        </div>
      </div>
    );
  }

  if (error || !pdpPayload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6 text-center">
          <div className="text-lg font-semibold">Failed to load product</div>
          <div className="mt-2 text-sm text-muted-foreground">{error || 'Product unavailable'}</div>
          <div className="mt-4">
            <button
              className="text-sm font-medium text-primary"
              onClick={() => {
                setLoading(true);
                setProduct(null);
                setRelatedProducts([]);
                setError(null);
                setReloadKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const Container = resolvedMode === 'beauty' ? BeautyPDPContainer : GenericPDPContainer;

  return (
    <div className="min-h-screen bg-background">
      <main className="px-0 py-0">
        <Container
          payload={pdpPayload}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          onWriteReview={handleWriteReview}
        />
      </main>
    </div>
  );
}
