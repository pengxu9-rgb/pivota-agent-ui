'use client';

import { useEffect, useMemo, useState, useRef, use } from 'react';
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

function ProductDetailLoading({ label }: { label: string }) {
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
          {label}
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
  const [loadingStage, setLoadingStage] = useState<'resolve' | 'detail' | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastLoadedKeyRef = useRef<string | null>(null);
  const lastRelatedKeyRef = useRef<string | null>(null);
  const lastProductIdRef = useRef<string | null>(null);

  const { addItem, open } = useCartStore();

  useEffect(() => {
    let cancelled = false;
    const cacheKey = merchantIdParam ? `pdp-cache:${merchantIdParam}:${id}` : null;
    const isNumericProductId = /^\d+$/.test(id);
    const fastTimeoutMs = 2500;
    const offersResolveTimeoutMs = 25000;
    const sellerResolveTimeoutMs = isNumericProductId ? fastTimeoutMs : offersResolveTimeoutMs;

    const loadProduct = async () => {
      const explicitMerchantId = merchantIdParam ? String(merchantIdParam).trim() : null;
      const explicitLoadedKey = explicitMerchantId ? `${explicitMerchantId}:${id}` : null;
      if (explicitLoadedKey && lastLoadedKeyRef.current === explicitLoadedKey) {
        setLoading(false);
        setError(null);
        setSellerCandidates(null);
        setLoadingStage(null);
        setRecommendationsLoading(false);
        return;
      }

      setLoading(true);
      setLoadingStage(merchantIdParam ? 'detail' : 'resolve');
      setError(null);
      setSellerCandidates(null);
      if (lastProductIdRef.current !== id) {
        lastProductIdRef.current = id;
        setRelatedProducts([]);
      }
      setRecommendationsLoading(false);
      let resolvedMerchantId: string | null = explicitMerchantId;
      let resolvedOffersPayload: any = null;

      const buildResolvedOffersPayload = (resolved: any) => {
        if (!resolved || typeof resolved !== 'object') return null;
        return {
          ...(typeof (resolved as any)?.product_group_id === 'string'
            ? { product_group_id: (resolved as any).product_group_id }
            : {}),
          ...(Array.isArray((resolved as any)?.offers) ? { offers: (resolved as any).offers } : {}),
          ...((resolved as any)?.offers_count != null
            ? { offers_count: Number((resolved as any).offers_count) }
            : {}),
          ...(typeof (resolved as any)?.default_offer_id === 'string'
            ? { default_offer_id: (resolved as any).default_offer_id }
            : {}),
          ...(typeof (resolved as any)?.best_price_offer_id === 'string'
            ? { best_price_offer_id: (resolved as any).best_price_offer_id }
            : {}),
        };
      };

      // When merchant_id is present, we can still fetch offers/product_group_id so PDP can show multi-seller offers.
      const offersResolvePromise = explicitMerchantId
        ? resolveProductCandidates({
            product_id: id,
            merchant_id: explicitMerchantId,
            limit: 10,
            include_offers: true,
            // Offers resolution can involve backend group lookups + per-merchant detail fetches.
            // Keep it best-effort and non-blocking, but allow a longer timeout than the fast-path.
            timeout_ms: offersResolveTimeoutMs,
          })
            .then((resolved) => {
              if (!resolved) return null;
              const offers = Array.isArray(resolved?.offers) ? resolved.offers : [];
              const offersCount =
                typeof resolved?.offers_count === 'number'
                  ? resolved.offers_count
                  : offers.length;

              pdpTracking.track('pdp_candidates_resolved', {
                product_id: id,
                merchant_id: explicitMerchantId,
                offers_count: offersCount,
              });

              return buildResolvedOffersPayload(resolved);
            })
            .catch(() => null)
        : null;

      // Fast path: resolve candidates/offers when merchant_id is missing.
      // This avoids expensive empty-query multi-merchant scans.
      if (!merchantIdParam) {
        try {
          const resolved = await resolveProductCandidates({
            product_id: id,
            limit: 10,
            include_offers: true,
            timeout_ms: sellerResolveTimeoutMs,
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

          resolvedOffersPayload = buildResolvedOffersPayload(resolved);

          if (offersCount === 1 && offers.length === 1) {
            const merchantId = String(offers[0]?.merchant_id || '').trim();
            if (merchantId) {
              resolvedMerchantId = merchantId;
              setLoadingStage('detail');
            }
          }

          if (!resolvedMerchantId && offersCount > 1 && offers.length > 0) {
            const defaultOfferId =
              String((resolved as any)?.default_offer_id || (resolved as any)?.best_price_offer_id || '').trim() ||
              null;
            const pickPrice = (offer: any) =>
              typeof offer?.price === 'number'
                ? Number(offer.price) || 0
                : Number(offer?.price?.amount || 0);
            const chosen =
              (defaultOfferId
                ? offers.find((o: any) => String(o?.offer_id || o?.offerId || '').trim() === defaultOfferId)
                : null) ||
              [...offers].sort((a: any, b: any) => pickPrice(a) - pickPrice(b))[0] ||
              null;
            const merchantId = String(chosen?.merchant_id || '').trim() || null;
            if (merchantId) {
              resolvedMerchantId = merchantId;
              setLoadingStage('detail');
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
              setLoadingStage(null);
              setRecommendationsLoading(false);
            }
            return;
          }
        }
      }

      try {
        const resolvedCacheKey = resolvedMerchantId ? `pdp-cache:${resolvedMerchantId}:${id}` : null;
        const cacheToRead = resolvedCacheKey || cacheKey;
        if (cacheToRead) {
          const cached = sessionStorage.getItem(cacheToRead);
          if (cached) {
            const parsed = JSON.parse(cached) as ProductResponse;
            if (!cancelled) {
              setProduct(parsed);
              setLoading(false);
              setLoadingStage(null);
              if (resolvedMerchantId) {
                lastLoadedKeyRef.current = `${resolvedMerchantId}:${id}`;
              } else if (merchantIdParam) {
                lastLoadedKeyRef.current = `${merchantIdParam}:${id}`;
              }
              setRecommendationsLoading(false);
            }
          }
        }
      } catch {
        // ignore cache failures
      }
      try {
        setLoadingStage('detail');
        const data = await getProductDetail(id, resolvedMerchantId || undefined, {
          useConfiguredMerchantId: Boolean(resolvedMerchantId),
          allowBroadScan: Boolean(merchantIdParam),
          timeout_ms: resolvedMerchantId ? undefined : fastTimeoutMs,
          throwOnError: true,
        });
        if (!data) {
          if (!cancelled) {
            setProduct(null);
            setError('Product not found');
            setSellerCandidates(null);
            setLoading(false);
            setLoadingStage(null);
            setRecommendationsLoading(false);
          }
          return;
        }
        if (cancelled) return;

        const merged = resolvedOffersPayload
          ? {
              ...data,
              ...resolvedOffersPayload,
              raw_detail: {
                ...(data as any).raw_detail,
                ...resolvedOffersPayload,
              },
            }
          : data;

        setProduct(merged);
        setLoading(false);
        setLoadingStage(null);
        const resolvedFromData = String(data.merchant_id || '').trim() || null;
        if (resolvedFromData) {
          lastLoadedKeyRef.current = `${resolvedFromData}:${id}`;
        }
        try {
          const resolvedCacheKey = resolvedFromData
            ? `pdp-cache:${resolvedFromData}:${id}`
            : null;
          if (resolvedCacheKey) {
            sessionStorage.setItem(resolvedCacheKey, JSON.stringify(data));
          } else if (cacheKey) {
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
          }
        } catch {
          // ignore cache failures
        }

        if (offersResolvePromise) {
          void offersResolvePromise.then((offersPayload) => {
            if (!offersPayload || cancelled) return;
            setProduct((current) => {
              if (!current) return current;
              return {
                ...current,
                ...offersPayload,
                raw_detail: {
                  ...(current as any).raw_detail,
                  ...offersPayload,
                },
              };
            });
          });
        }

        const isExternalProduct =
          Boolean((data as any).external_redirect_url) ||
          String((data as any).product_type || '').toLowerCase() === 'external' ||
          String((data as any).platform || '').toLowerCase() === 'external' ||
          (data as any).source === 'external_seed';

        const hasMultipleOffers =
          resolvedOffersPayload &&
          typeof resolvedOffersPayload.offers_count === 'number' &&
          resolvedOffersPayload.offers_count > 1;

        if (!merchantIdParam && resolvedFromData && !isExternalProduct && !hasMultipleOffers) {
          router.replace(
            `/products/${encodeURIComponent(id)}?merchant_id=${encodeURIComponent(resolvedFromData)}`,
          );
          return;
        }

        const relatedKey = `${resolvedFromData || 'unknown'}:${id}`;
        if (lastRelatedKeyRef.current !== relatedKey) {
          lastRelatedKeyRef.current = relatedKey;
          setRecommendationsLoading(true);
          const scheduleRelated = () => {
            void (async () => {
              try {
                const all = await getAllProducts(6, isExternalProduct ? undefined : data.merchant_id);
                if (!cancelled) {
                  setRelatedProducts(all.filter((p) => p.product_id !== id));
                }
              } catch (relError) {
                // eslint-disable-next-line no-console
                console.error('Failed to load related products:', relError);
              } finally {
                if (!cancelled) {
                  setRecommendationsLoading(false);
                }
              }
            })();
          };

          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            (window as any).requestIdleCallback(scheduleRelated, { timeout: 1200 });
          } else {
            setTimeout(scheduleRelated, 400);
          }
        } else {
          setRecommendationsLoading(false);
        }

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
            setLoadingStage(null);
            setRecommendationsLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setError((err as Error).message || 'Failed to load product');
          setProduct(null);
          setSellerCandidates(null);
          setLoading(false);
          setLoadingStage(null);
          setRecommendationsLoading(false);
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
      recommendationsLoading,
      entryPoint: 'product_detail',
    });
  }, [product, relatedProducts, recommendationsLoading]);

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
    const selectedOptions =
      Array.isArray(variant.options) && variant.options.length > 0
        ? Object.fromEntries(variant.options.map((o) => [o.name, o.value]))
        : undefined;
    const cartItemId = resolvedMerchantId
      ? `${resolvedMerchantId}:${resolvedVariantId}`
      : resolvedVariantId;
    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: resolvedVariantId,
      sku: variant.sku_id,
      selected_options: selectedOptions,
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
    const selectedOptions =
      Array.isArray(variant.options) && variant.options.length > 0
        ? Object.fromEntries(variant.options.map((o) => [o.name, o.value]))
        : undefined;
    const checkoutItems = [
      {
        product_id: product.product_id,
        merchant_id: resolvedMerchantId,
        title: product.title,
        quantity,
        unit_price: variant.price?.current.amount ?? product.price,
        image_url: variant.image_url || product.image_url || '/placeholder.svg',
        variant_id: variant.variant_id,
        sku: variant.sku_id,
        selected_options: selectedOptions,
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
    const label =
      loadingStage === 'resolve'
        ? 'Resolving sellers…'
        : loadingStage === 'detail'
          ? 'Loading product details…'
          : merchantIdParam
            ? 'Loading product details…'
            : 'Resolving sellers and loading product…';
    return <ProductDetailLoading label={label} />;
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
