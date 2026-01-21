'use client';

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShoppingCart, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCartStore } from '@/store/cartStore';
import { getAllProducts, getProductDetail, type ProductResponse } from '@/lib/api';
import { mapToPdpPayload } from '@/features/pdp/adapter/mapToPdpPayload';
import { isBeautyProduct } from '@/features/pdp/utils/isBeautyProduct';
import { BeautyPDPContainer } from '@/features/pdp/containers/BeautyPDPContainer';
import { GenericPDPContainer } from '@/features/pdp/containers/GenericPDPContainer';
import type { Variant } from '@/features/pdp/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: Props) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const merchantIdParam = searchParams.get('merchant_id') || undefined;
  const pdpOverride = (searchParams.get('pdp') || '').toLowerCase();
  const router = useRouter();

  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<ProductResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const { addItem, items, open } = useCartStore();
  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getProductDetail(id, merchantIdParam);
        if (!data) {
          if (!cancelled) {
            setProduct(null);
            setError('Product not found');
          }
          return;
        }
        if (cancelled) return;
        setProduct(data);

        try {
          const all = await getAllProducts(6, data.merchant_id);
          if (!cancelled) {
            setRelatedProducts(all.filter((p) => p.product_id !== id));
          }
        } catch (relError) {
          // eslint-disable-next-line no-console
          console.error('Failed to load related products:', relError);
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
        if (!cancelled) {
          setError((err as Error).message || 'Failed to load product');
          setProduct(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id, merchantIdParam, reloadKey]);

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

  const handleAddToCart = ({ variant, quantity }: { variant: Variant; quantity: number }) => {
    if (!product) return;
    if (product.external_redirect_url) {
      window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
      return;
    }
    addItem({
      id: product.product_id,
      title: product.title,
      price: variant.price?.current.amount ?? product.price,
      imageUrl: variant.image_url || product.image_url || '/placeholder.svg',
      merchant_id: product.merchant_id,
      quantity,
    });
    toast.success(`✓ Added ${quantity}x ${product.title} to cart!`);
    open();
  };

  const handleBuyNow = ({ variant, quantity }: { variant: Variant; quantity: number }) => {
    if (!product) return;
    if (product.external_redirect_url) {
      window.open(product.external_redirect_url, '_blank', 'noopener,noreferrer');
      return;
    }
    const checkoutItems = [
      {
        product_id: product.product_id,
        merchant_id: product.merchant_id,
        title: product.title,
        quantity,
        unit_price: variant.price?.current.amount ?? product.price,
        image_url: variant.image_url || product.image_url || '/placeholder.svg',
        variant_id: variant.variant_id,
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

  if (error || !pdpPayload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-mesh px-6">
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
    <div className="min-h-screen bg-gradient-mesh">
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

      <main className="px-4 py-6">
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
