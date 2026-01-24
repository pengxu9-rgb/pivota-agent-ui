'use client';

import { useEffect, useMemo, useState, useRef, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import {
  getAllProducts,
  getProductDetail,
  resolveProductCandidates,
  resolveProductGroup,
  type ProductResponse,
} from '@/lib/api';
import { mapToPdpPayload } from '@/features/pdp/adapter/mapToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import type { Variant } from '@/features/pdp/types';
import { pdpTracking } from '@/features/pdp/tracking';

interface Props {
  params: Promise<{ id: string }>;
}

function normalizeVariantOptionToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeVariantOptionName(name: string): string {
  const normalized = normalizeVariantOptionToken(name);
  if (!normalized) return '';
  if (normalized.includes('colour') || normalized.includes('color') || normalized.includes('shade') || normalized.includes('tone')) {
    return 'color';
  }
  if (normalized.includes('size') || normalized.includes('fit')) {
    return 'size';
  }
  return normalized;
}

function normalizeVariantOptionValue(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function variantOptionSignature(options?: Array<{ name: string; value: string }>): string {
  if (!Array.isArray(options) || options.length === 0) return '';
  const pairs = options
    .map((opt) => {
      const key = normalizeVariantOptionName(opt?.name || '');
      const val = normalizeVariantOptionValue(opt?.value || '');
      if (!key || !val) return null;
      return [key, val] as const;
    })
    .filter(Boolean) as Array<readonly [string, string]>;
  if (!pairs.length) return '';
  pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return pairs.map(([k, v]) => `${k}=${v}`).join('|');
}

function getNormalizedVariantOptionValue(
  options: Array<{ name: string; value: string }> | undefined,
  normalizedKey: string,
): string | null {
  if (!Array.isArray(options) || !options.length) return null;
  const wanted = String(normalizedKey || '').trim().toLowerCase();
  if (!wanted) return null;
  const match = options.find((opt) => normalizeVariantOptionName(opt?.name || '') === wanted);
  const value = normalizeVariantOptionValue(match?.value || '');
  return value || null;
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
  const offerProductDetailCacheRef = useRef<Map<string, ProductResponse>>(new Map());

  const { addItem, open } = useCartStore();

  useEffect(() => {
    let cancelled = false;
    const groupResolveTimeoutMs = 8000;
    const detailTimeoutMs = 15000;
    const quickAttemptTimeoutMs = 2500;
    const offersResolveTimeoutMs = 25000;

    const loadProduct = async () => {
      const explicitMerchantId = merchantIdParam ? String(merchantIdParam).trim() : null;

      setLoading(true);
      setLoadingStage(explicitMerchantId ? 'detail' : 'resolve');
      setError(null);
      setSellerCandidates(null);
      if (lastProductIdRef.current !== id) {
        lastProductIdRef.current = id;
        setRelatedProducts([]);
      }
      setRecommendationsLoading(false);
      let groupResolved: any = null;
      let resolvedCanonicalRef: { merchant_id: string; product_id: string } | null = null;
      let resolvedOffersPayload: any = null;
      let loadedProductRef: { merchant_id: string; product_id: string } | null = null;

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

      const offersUpdate = (offersPayload: any) => {
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
      };

      const writeSessionCache = (key: string | null, value: ProductResponse) => {
        if (!key || typeof window === 'undefined') return;
        try {
          window.sessionStorage.setItem(key, JSON.stringify(value));
        } catch {
          // ignore cache failures
        }
      };

      const groupResolvePromise = resolveProductGroup({
        product_id: id,
        ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
        timeout_ms: groupResolveTimeoutMs,
      }).catch(() => null);

      let data: ProductResponse | null = null;
      let detailError: unknown = null;
      let targetProductId: string = id;
      let targetMerchantId: string | null = explicitMerchantId;

      if (explicitMerchantId) {
        const gr = await groupResolvePromise;
        if (cancelled) return;
        groupResolved = gr;

        if (
          gr?.canonical_product_ref?.merchant_id &&
          gr?.canonical_product_ref?.product_id
        ) {
          resolvedCanonicalRef = {
            merchant_id: String(gr.canonical_product_ref.merchant_id),
            product_id: String(gr.canonical_product_ref.product_id),
          };
          targetMerchantId = resolvedCanonicalRef.merchant_id;
          targetProductId = resolvedCanonicalRef.product_id;
        }
      }

      try {
        data = explicitMerchantId
          ? await getProductDetail(targetProductId, targetMerchantId || undefined, {
              useConfiguredMerchantId: false,
              allowBroadScan: false,
              timeout_ms: detailTimeoutMs,
              throwOnError: true,
            })
          : await getProductDetail(id, undefined, {
              useConfiguredMerchantId: true,
              allowBroadScan: false,
              timeout_ms: quickAttemptTimeoutMs,
              throwOnError: true,
            });
      } catch (err) {
        detailError = err;
      }

      if (!explicitMerchantId && !data) {
        const gr = await groupResolvePromise;
        if (cancelled) return;
        groupResolved = gr;
        const canonical =
          gr?.canonical_product_ref?.merchant_id && gr?.canonical_product_ref?.product_id
            ? {
                merchant_id: String(gr.canonical_product_ref.merchant_id),
                product_id: String(gr.canonical_product_ref.product_id),
              }
            : resolvedCanonicalRef;

        if (canonical) {
          resolvedCanonicalRef = canonical;
          setLoadingStage('detail');

          try {
            data = await getProductDetail(canonical.product_id, canonical.merchant_id, {
              useConfiguredMerchantId: false,
              allowBroadScan: false,
              timeout_ms: detailTimeoutMs,
              throwOnError: true,
            });
          } catch (err) {
            detailError = err;
          }
        }
      }

      if (
        !explicitMerchantId &&
        !data &&
        (detailError as any)?.code === 'AMBIGUOUS_PRODUCT_ID' &&
        Array.isArray((detailError as any)?.candidates)
      ) {
        if (!cancelled) {
          setProduct(null);
          setRelatedProducts([]);
          setError(null);
          setSellerCandidates((detailError as any).candidates as ProductResponse[]);
          setLoading(false);
          setLoadingStage(null);
          setRecommendationsLoading(false);
        }
        return;
      }

      if (!data) {
        const message =
          detailError && (detailError as Error).message ? (detailError as Error).message : 'Failed to load product';
        if (!cancelled) {
          setError(message);
          setProduct(null);
          setSellerCandidates(null);
          setLoading(false);
          setLoadingStage(null);
          setRecommendationsLoading(false);
        }
        return;
      }
      if (cancelled) return;

      loadedProductRef = {
        merchant_id: String(data.merchant_id || ''),
        product_id: String(data.product_id || ''),
      };

      const baseRawDetail = {
        ...(data as any).raw_detail,
        ...(groupResolved?.product_group_id ? { product_group_id: groupResolved.product_group_id } : {}),
        ...(resolvedCanonicalRef ? { canonical_product_ref: resolvedCanonicalRef } : {}),
        entry_product_ref: {
          product_id: id,
          ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
        },
      };

      const merged: ProductResponse = {
        ...data,
        ...(resolvedOffersPayload ? { ...resolvedOffersPayload } : {}),
        raw_detail: {
          ...baseRawDetail,
          ...(resolvedOffersPayload ? { ...resolvedOffersPayload } : {}),
        },
      };

      setProduct(merged);
      setLoading(false);
      setLoadingStage(null);
      const resolvedFromData = String(data.merchant_id || '').trim() || null;
      if (resolvedFromData) {
        lastLoadedKeyRef.current = `${resolvedFromData}:${data.product_id}`;
      }
      writeSessionCache(
        resolvedFromData && data.product_id
          ? `pdp-cache:${resolvedFromData}:${data.product_id}`
          : null,
        merged,
      );

      const offersRef = explicitMerchantId
        ? resolvedCanonicalRef
          ? {
              product_id: resolvedCanonicalRef.product_id,
              merchant_id: resolvedCanonicalRef.merchant_id,
            }
          : { product_id: id, merchant_id: explicitMerchantId }
        : loadedProductRef?.merchant_id
          ? { product_id: loadedProductRef.product_id, merchant_id: loadedProductRef.merchant_id }
          : { product_id: id };

      void resolveProductCandidates({
        ...offersRef,
        limit: 10,
        include_offers: true,
        timeout_ms: offersResolveTimeoutMs,
      })
        .then((resolved) => {
          if (!resolved || cancelled) return;
          const offers = Array.isArray(resolved?.offers) ? resolved.offers : [];
          const offersCount =
            typeof resolved?.offers_count === 'number'
              ? resolved.offers_count
              : offers.length;

          pdpTracking.track('pdp_candidates_resolved', {
            product_id: id,
            ...(explicitMerchantId ? { merchant_id: explicitMerchantId } : {}),
            offers_count: offersCount,
          });

          resolvedOffersPayload = buildResolvedOffersPayload(resolved);
          offersUpdate(resolvedOffersPayload);

          const canonical =
            resolved?.canonical_product_ref &&
            typeof resolved.canonical_product_ref === 'object' &&
            resolved.canonical_product_ref.merchant_id &&
            resolved.canonical_product_ref.product_id
              ? {
                  merchant_id: String(resolved.canonical_product_ref.merchant_id),
                  product_id: String(resolved.canonical_product_ref.product_id),
                }
              : null;

          if (canonical) {
            resolvedCanonicalRef = resolvedCanonicalRef || canonical;
          }
        })
        .catch(() => null);

      void groupResolvePromise;

      const isExternalProduct =
        Boolean((data as any).external_redirect_url) ||
        String((data as any).product_type || '').toLowerCase() === 'external' ||
        String((data as any).platform || '').toLowerCase() === 'external' ||
        (data as any).source === 'external_seed';

      const relatedKey = `${resolvedFromData || 'unknown'}:${data.product_id || id}`;
      if (lastRelatedKeyRef.current !== relatedKey) {
        lastRelatedKeyRef.current = relatedKey;
        setRecommendationsLoading(true);
        const scheduleRelated = () => {
          void (async () => {
            try {
              const all = await getAllProducts(6, isExternalProduct ? undefined : data.merchant_id);
              if (!cancelled) {
                setRelatedProducts(all.filter((p) => p.product_id !== data.product_id));
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
        const filtered = history.filter((item: any) => item.product_id !== data.product_id);
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

  const resolveVariantForPurchase = async (args: {
    merchant_id: string;
    product_id: string;
    desired_variant: Variant;
  }): Promise<Variant | null> => {
    try {
      const merchantId = String(args.merchant_id || '').trim();
      const productId = String(args.product_id || '').trim();
      if (!merchantId || !productId) return null;

      const cacheKey = `${merchantId}:${productId}`;
      let detail = offerProductDetailCacheRef.current.get(cacheKey) || null;
      if (!detail) {
        detail = await getProductDetail(productId, merchantId, {
          useConfiguredMerchantId: false,
          allowBroadScan: false,
          throwOnError: false,
        });
        if (detail) {
          offerProductDetailCacheRef.current.set(cacheKey, detail);
        }
      }
      if (!detail) return null;

      const detailPayload = mapToPdpPayload({
        product: detail,
        rawDetail: detail.raw_detail,
        relatedProducts: [],
        recommendationsLoading: false,
        entryPoint: 'product_detail',
      });
      const variants = Array.isArray(detailPayload?.product?.variants)
        ? detailPayload.product.variants
        : [];
      if (!variants.length) return null;

      const desiredSig = variantOptionSignature(args.desired_variant.options);
      if (desiredSig) {
        const exact = variants.find((v) => variantOptionSignature(v.options) === desiredSig) || null;
        if (exact) return exact;
      }

      const desiredColor = getNormalizedVariantOptionValue(args.desired_variant.options, 'color');
      const desiredSize = getNormalizedVariantOptionValue(args.desired_variant.options, 'size');
      if (desiredColor || desiredSize) {
        const partial =
          variants.find((v) => {
            const color = getNormalizedVariantOptionValue(v.options, 'color');
            const size = getNormalizedVariantOptionValue(v.options, 'size');
            const colorMatch = desiredColor ? color === desiredColor : true;
            const sizeMatch = desiredSize ? size === desiredSize : true;
            return colorMatch && sizeMatch;
          }) || null;
        if (partial) return partial;
      }

      if (variants.length === 1) return variants[0];
      return null;
    } catch {
      return null;
    }
  };

  const handleAddToCart = ({
    variant,
    quantity,
    merchant_id,
    product_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => {
    if (!product) return;
    void (async () => {
      if (product.external_redirect_url) {
        window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
        return;
      }

      const resolvedMerchantId =
        String(merchant_id || product.merchant_id || '').trim() || product.merchant_id;
      const resolvedProductId =
        String(product_id || '').trim() || String(product.product_id || '').trim();

      if (!resolvedMerchantId || !resolvedProductId) {
        toast.error('This offer is missing merchant/product info.');
        return;
      }

      const needsVariantMapping =
        resolvedMerchantId !== String(product.merchant_id || '').trim() ||
        resolvedProductId !== String(product.product_id || '').trim();
      const purchaseVariant = needsVariantMapping
        ? await resolveVariantForPurchase({
            merchant_id: resolvedMerchantId,
            product_id: resolvedProductId,
            desired_variant: variant,
          })
        : variant;

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offers = Array.isArray((product as any)?.raw_detail?.offers)
        ? ((product as any).raw_detail.offers as any[])
        : Array.isArray((product as any)?.offers)
          ? ((product as any).offers as any[])
          : [];
      const offer =
        offer_id && offers.length
          ? offers.find((o) => String(o?.offer_id || o?.offerId || '').trim() === String(offer_id))
          : null;
      const offerItemPrice = offer
        ? Number(offer?.price?.amount ?? offer?.price_amount ?? offer?.price ?? 0)
        : undefined;
      const offerCurrency = offer
        ? String(offer?.price?.currency || offer?.currency || product.currency || 'USD')
        : undefined;
      const offerShipping = offer
        ? Number(offer?.shipping?.cost?.amount ?? offer?.shipping_cost ?? offer?.shippingFee ?? 0)
        : 0;
      const displayPrice =
        offerItemPrice != null ? offerItemPrice + offerShipping : purchaseVariant.price?.current.amount ?? product.price;

      const resolvedVariantId = String(purchaseVariant.variant_id || '').trim() || resolvedProductId;
      const cartItemId = `${resolvedMerchantId}:${resolvedVariantId}`;

      addItem({
        id: cartItemId,
        product_id: resolvedProductId,
        variant_id: resolvedVariantId,
        sku: purchaseVariant.sku_id,
        selected_options: selectedOptions,
        title: product.title,
        price: displayPrice,
        currency: offerCurrency || purchaseVariant.price?.current.currency || product.currency,
        imageUrl: purchaseVariant.image_url || product.image_url || '/placeholder.svg',
        merchant_id: resolvedMerchantId,
        offer_id: offer_id ? String(offer_id) : undefined,
        quantity,
      });
      toast.success(`✓ Added ${quantity}x ${product.title} to cart!`);
      open();
    })();
  };

  const handleBuyNow = ({
    variant,
    quantity,
    merchant_id,
    product_id,
    offer_id,
  }: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => {
    if (!product) return;
    void (async () => {
      if (product.external_redirect_url) {
        window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
        return;
      }

      const resolvedMerchantId =
        String(merchant_id || product.merchant_id || '').trim() || product.merchant_id;
      const resolvedProductId =
        String(product_id || '').trim() || String(product.product_id || '').trim();

      if (!resolvedMerchantId || !resolvedProductId) {
        toast.error('This offer is missing merchant/product info.');
        return;
      }

      const needsVariantMapping =
        resolvedMerchantId !== String(product.merchant_id || '').trim() ||
        resolvedProductId !== String(product.product_id || '').trim();
      const purchaseVariant = needsVariantMapping
        ? await resolveVariantForPurchase({
            merchant_id: resolvedMerchantId,
            product_id: resolvedProductId,
            desired_variant: variant,
          })
        : variant;

      if (!purchaseVariant) {
        toast.error('This seller doesn’t have the selected options. Try another offer.');
        return;
      }

      const selectedOptions =
        Array.isArray(purchaseVariant.options) && purchaseVariant.options.length > 0
          ? Object.fromEntries(purchaseVariant.options.map((o) => [o.name, o.value]))
          : undefined;

      const offers = Array.isArray((product as any)?.raw_detail?.offers)
        ? ((product as any).raw_detail.offers as any[])
        : Array.isArray((product as any)?.offers)
          ? ((product as any).offers as any[])
          : [];
      const offer =
        offer_id && offers.length
          ? offers.find((o) => String(o?.offer_id || o?.offerId || '').trim() === String(offer_id))
          : null;
      const offerItemPrice = offer
        ? Number(offer?.price?.amount ?? offer?.price_amount ?? offer?.price ?? 0)
        : undefined;

      const checkoutItems = [
        {
          product_id: resolvedProductId,
          merchant_id: resolvedMerchantId,
          title: product.title,
          quantity,
          unit_price: offerItemPrice != null ? offerItemPrice : purchaseVariant.price?.current.amount ?? product.price,
          currency:
            String(offer?.price?.currency || offer?.currency || purchaseVariant.price?.current.currency || product.currency || 'USD'),
          image_url: purchaseVariant.image_url || product.image_url || '/placeholder.svg',
          variant_id: purchaseVariant.variant_id,
          sku: purchaseVariant.sku_id,
          selected_options: selectedOptions,
          offer_id: offer_id ? String(offer_id) : undefined,
        },
      ];
      const encoded = encodeURIComponent(JSON.stringify(checkoutItems));
      router.push(`/order?items=${encoded}`);
    })();
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
