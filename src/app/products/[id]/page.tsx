'use client';

import { useState, useEffect, use } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useCartStore } from '@/store/cartStore';
import { getProductDetail, getAllProducts, listGroupReviews, listSkuReviews } from '@/lib/api';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductDetailsPdp } from '@/components/pdp/ProductDetailsPdp';
import { mapProductToPdpViewModel } from '@/lib/pdp/mapProductToPdpViewModel';
import type { ReviewsPreviewData } from '@/lib/pdp/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const merchantIdParam = searchParams.get('merchant_id') || undefined;
  const pdpOverride = (searchParams.get('pdp') || '').toLowerCase(); // beauty | generic
  const router = useRouter();
  const [product, setProduct] = useState<any>(null);
  const [relatedProducts, setRelatedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [reviewsPreview, setReviewsPreview] = useState<ReviewsPreviewData | null>(null);

  const { addItem, items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    const loadProduct = async () => {
      setError(null);
      setReviewsPreview(null);
      try {
        const data = await getProductDetail(id, merchantIdParam);
        if (!data) {
          notFound();
        }
        setProduct(data);
        try {
          const summary = (data as any).review_summary;
          const hasGroup = Boolean(summary?.has_group);
          const countRaw = hasGroup ? summary?.group_total_review_count : summary?.merchant_review_count;
          const reviewCount = Number(countRaw || 0);

          if (reviewCount > 0 && data.merchant_id && (data as any).platform && (data as any).platform_product_id) {
            let resp: any = null;
            if (hasGroup && summary?.default_view === 'group' && summary?.group_id) {
              resp = await listGroupReviews({ group_id: Number(summary.group_id), filters: { limit: 6 } });
            } else {
              resp = await listSkuReviews({
                sku: {
                  merchant_id: String(data.merchant_id),
                  platform: String((data as any).platform),
                  platform_product_id: String((data as any).platform_product_id),
                  variant_id: null,
                },
                filters: { limit: 6 },
              });
            }

            const items = Array.isArray(resp?.items) ? resp.items : [];
            if (items.length) {
              const avg =
                items.reduce((acc: number, r: any) => acc + (Number(r?.rating) || 0), 0) / Math.max(1, items.length);

              const preview: ReviewsPreviewData = {
                scale: 5,
                rating: Number.isFinite(avg) ? avg : 0,
                review_count: reviewCount,
                preview_items: items.slice(0, 3).map((r: any) => ({
                  review_id: String(r.review_id),
                  rating: Number(r.rating) || 0,
                  author_label: (r.verification || 'verified_buyer') === 'verified_buyer' ? 'Verified buyer' : undefined,
                  text_snippet: String(r.snippet || r.body || '').trim() || '—',
                  media: Array.isArray(r.media)
                    ? r.media.slice(0, 1).map((m: any) => ({ type: 'image', url: String(m.url) }))
                    : undefined,
                })),
              };

              setReviewsPreview(preview);
            }
          }
        } catch (e) {
          console.error('Failed to load reviews preview:', e);
          setReviewsPreview(null);
        }

        // Save to browse history with full product data
        try {
          const history = JSON.parse(
            localStorage.getItem('browse_history') || '[]',
          );
          // Remove existing entry if present
          const filtered = history.filter(
            (item: any) => item.product_id !== id,
          );
          // Add current product to the beginning
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
          ].slice(0, 50); // Keep max 50 items
          localStorage.setItem('browse_history', JSON.stringify(newHistory));
        } catch (error) {
          console.error('Failed to save browse history:', error);
        }

        // Load related products
        const all = await getAllProducts(6);
        setRelatedProducts(all.filter((p) => p.product_id !== id));
      } catch (error) {
        console.error('Failed to load product:', error);
        setError(error instanceof Error ? error.message : 'Failed to load product');
      } finally {
        setLoading(false);
      }
    };
    loadProduct();
  }, [id, merchantIdParam, reloadKey]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-mesh">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted/20" />
          <div className="h-4 w-32 rounded bg-muted/20" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-mesh px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6 text-center">
          <div className="text-lg font-semibold">Failed to load product</div>
          <div className="mt-2 text-sm text-muted-foreground">{error}</div>
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

  if (!product) return null;

  const productUrl = `https://agent.pivota.cc/products/${product.product_id}`;

  const payloadBase = mapProductToPdpViewModel({
    product,
    relatedProducts,
    entryPoint: 'product_detail',
    experiment: 'lovable_pdp_mvp',
  });

  const payload = reviewsPreview
    ? {
        ...payloadBase,
        modules: [
          ...payloadBase.modules,
          { module_id: 'm_reviews', type: 'reviews_preview', priority: 60, data: reviewsPreview },
        ],
      }
    : payloadBase;

  // Optional override for validation (does not change default selection logic).
  // - `?pdp=beauty` forces beauty
  // - `?pdp=generic` forces generic
  if (pdpOverride === 'beauty') payload.product.category_path = ['Beauty'];
  if (pdpOverride === 'generic') payload.product.category_path = ['General'];

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: String(product.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    image: product.image_url || '/placeholder.svg',
    sku: product.product_id,
    url: productUrl,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency || 'USD',
      availability: product.in_stock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: productUrl,
    },
  };

  return (
    <div className="min-h-screen bg-gradient-mesh">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      {/* Animated background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-400/10 blur-3xl -z-10 animate-pulse" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-semibold gradient-text">Pivota</span>
          </Link>

          <button
            onClick={open}
            className="relative h-10 w-10 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 transition-colors"
          >
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold text-white">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/products" className="hover:text-foreground transition-colors">
            Products
          </Link>
          <span>/</span>
          <span>{product.title}</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <ProductDetailsPdp
            payload={payload}
            onAddToCart={({ quantity }) => {
              addItem({
                id: product.product_id,
                title: product.title,
                price: product.price,
                imageUrl: product.image_url || '/placeholder.svg',
                merchant_id: product.merchant_id,
                quantity,
              });
              toast.success(`✓ Added ${quantity}x ${product.title} to cart!`);
            }}
            onBuyNow={({ quantity }) => {
              const checkoutItems = [
                {
                  product_id: product.product_id,
                  merchant_id: product.merchant_id,
                  title: product.title,
                  quantity,
                  unit_price: product.price,
                  image_url: product.image_url || '/placeholder.svg',
                },
              ];
              const encoded = encodeURIComponent(JSON.stringify(checkoutItems));
              router.push(`/order?items=${encoded}`);
            }}
          />
        </motion.div>
      </main>
    </div>
  );
}
