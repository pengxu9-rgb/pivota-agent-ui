'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShoppingCart, Sparkles, Package } from 'lucide-react';
import Link from 'next/link';
import ProductCard from '@/components/product/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import {
  sendMessage,
  getShoppingDiscoveryFeed,
  getBrowseHistory,
  type DiscoveryRecentView,
  type ProductResponse,
} from '@/lib/api';
import { mergeDiscoveryRecentViews, readLocalBrowseHistory } from '@/lib/browseHistoryStorage';
import { resolveProductCardPresentation } from '@/lib/productCardPresentation';
import { toast } from 'sonner';

const TRENDING_TAGS = [
  'Sportswear',
  'Lingerie',
  'Makeup',
  'Camping Gear',
  'Pet Toys',
] as const;

const GRID_INITIAL_PAGE_SIZE = 24;
const GRID_PAGE_STEP = 24;
const NO_GROWTH_STOP_THRESHOLD = 2;

function buildProductKey(product: ProductResponse): string {
  return `${String(product?.merchant_id || '').trim()}::${String(product?.product_id || '').trim()}`;
}

function mergeUniqueProducts(current: ProductResponse[], incoming: ProductResponse[]) {
  const map = new Map<string, ProductResponse>();
  current.forEach((item) => map.set(buildProductKey(item), item));
  const before = map.size;
  incoming.forEach((item) => map.set(buildProductKey(item), item));
  return {
    merged: Array.from(map.values()),
    added: map.size - before,
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [recentViews, setRecentViews] = useState<DiscoveryRecentView[]>([]);
  const [recentViewsReady, setRecentViewsReady] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const searchRequestSeqRef = useRef(0);
  const noGrowthCountRef = useRef(0);
  const activeQueryRef = useRef('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { items, open } = useCartStore();
  const { user } = useAuthStore();

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id || null;
    const localRecentViews = mergeDiscoveryRecentViews({
      localItems: readLocalBrowseHistory(50),
      limit: 50,
    }) as DiscoveryRecentView[];
    if (!userId) {
      setRecentViews(localRecentViews);
      setRecentViewsReady(true);
      return;
    }

    setRecentViewsReady(false);
    getBrowseHistory(50)
      .then((history) => {
        if (!cancelled) {
          setRecentViews(
            mergeDiscoveryRecentViews({
              accountItems: history.items || [],
              localItems: readLocalBrowseHistory(50),
              limit: 50,
            }) as DiscoveryRecentView[],
          );
        }
      })
      .catch((error) => {
        console.warn('Failed to load shopping behavior history:', error);
        if (!cancelled) setRecentViews(localRecentViews);
      })
      .finally(() => {
        if (!cancelled) setRecentViewsReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const executeSearchPage = useCallback(
    async (query: string, targetPage: number, options?: { append?: boolean }) => {
      const append = Boolean(options?.append);
      const requestSeq = ++searchRequestSeqRef.current;
      const trimmed = query.trim();

      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }

      const controller = new AbortController();
      searchAbortRef.current = controller;
      activeQueryRef.current = trimmed;

      if (append) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        let fetchedProducts: ProductResponse[] = [];
        let hasMoreFromResponse: boolean | undefined;

        if (!trimmed) {
          const result = await getShoppingDiscoveryFeed({
            surface: 'browse_products',
            page: targetPage,
            limit: GRID_INITIAL_PAGE_SIZE,
            userId: user?.id || null,
            recentViews,
          });
          fetchedProducts = result.products;
          hasMoreFromResponse = result.page_info.has_more;
        } else {
          const result = await sendMessage(trimmed, undefined, {
            signal: controller.signal,
            pagination: {
              page: targetPage,
              limit: GRID_INITIAL_PAGE_SIZE,
            },
            userId: user?.id || null,
          });
          fetchedProducts = Array.isArray(result?.products) ? result.products : [];
          hasMoreFromResponse = Boolean(result?.page_info?.has_more);
          if (!append && result?.strict_empty && result?.reply) {
            toast.info(result.reply);
          }
        }

        if (requestSeq !== searchRequestSeqRef.current) return;

        if (!append) {
          const deduped = mergeUniqueProducts([], fetchedProducts).merged;
          setProducts(deduped);
          setPage(targetPage);
          noGrowthCountRef.current = 0;
          setHasMore(Boolean(hasMoreFromResponse) && deduped.length > 0);
          return;
        }

        setProducts((prev) => {
          const { merged, added } = mergeUniqueProducts(prev, fetchedProducts);
          if (added === 0) {
            noGrowthCountRef.current += 1;
          } else {
            noGrowthCountRef.current = 0;
          }

          const stopForNoGrowth = noGrowthCountRef.current >= NO_GROWTH_STOP_THRESHOLD;
          const canContinue = Boolean(hasMoreFromResponse) && !stopForNoGrowth;
          setHasMore(canContinue);
          if (canContinue) setPage(targetPage);
          return merged;
        });
      } catch (error: any) {
        if (requestSeq !== searchRequestSeqRef.current) return;
        if (error?.name === 'AbortError') return;
        console.error('Search error:', error);
        toast.error(trimmed ? 'Failed to search products' : 'Unable to load products. Please try again.');
      } finally {
        if (requestSeq !== searchRequestSeqRef.current) return;
        if (append) {
          setIsLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [recentViews, user?.id],
  );

  const executeSearch = useCallback(
    async (query: string) => {
      noGrowthCountRef.current = 0;
      setPage(1);
      setHasMore(true);
      await executeSearchPage(query, 1, { append: false });
    },
    [executeSearchPage],
  );

  const handleSearch = useCallback(
    (query: string, options?: { immediate?: boolean }) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (options?.immediate) {
        void executeSearch(query);
        return;
      }
      searchDebounceRef.current = window.setTimeout(() => {
        searchDebounceRef.current = null;
        void executeSearch(query);
      }, 300);
    },
    [executeSearch],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!recentViewsReady) return;
    const q = new URLSearchParams(window.location.search).get('q')?.trim() || '';
    if (q) {
      handleSearch(q, { immediate: true });
      return;
    }
    void executeSearch('');
  }, [executeSearch, handleSearch, recentViewsReady]);

  const loadMore = useCallback(() => {
    if (loading || isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    void executeSearchPage(activeQueryRef.current, nextPage, { append: true });
  }, [executeSearchPage, hasMore, isLoadingMore, loading, page]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    if (!hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        loadMore();
      },
      { root: null, rootMargin: '280px 0px', threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
    };
  }, []);

  const handleTrendingClick = (trend: string) => {
    handleSearch(trend, { immediate: true });
  };

  return (
    <div className="min-h-screen bg-gradient-mesh overflow-x-hidden relative">
      {/* Animated background */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 sm:w-96 sm:h-96 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-cyan-400/10 blur-3xl -z-10 animate-pulse" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-6 w-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-xl font-semibold gradient-text">Pivota</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="icon" size="icon">
                <Package className="h-5 w-5 text-muted-foreground" />
              </Button>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-3xl md:text-4xl font-semibold mb-2">
            Browse Products
          </h1>
          <p className="text-muted-foreground mb-4">
            Discover our curated collection of premium products
          </p>

          {/* Search */}
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 bg-secondary border border-border rounded-2xl px-4 py-3">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search products..."
                className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Trending */}
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Trending:</span>
            {TRENDING_TAGS.map((trend) => (
              <Badge
                key={trend}
                variant="gradient"
                className="cursor-pointer hover:scale-105 transition-transform"
                onClick={() => handleTrendingClick(trend)}
              >
                {trend}
              </Badge>
            ))}
          </div>
        </motion.div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="flex gap-2">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground">
              No products found matching your search.
            </p>
          </div>
        ) : (
          <div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
            >
              <AnimatePresence>
                {products.map((product, index) => {
                const defaultVariant =
                  Array.isArray(product.variants) && product.variants.length > 0
                    ? product.variants[0]
                    : null;
                const variantId =
                  String(
                    (product as any).variant_id ||
                      (defaultVariant as any)?.variant_id ||
                      (defaultVariant as any)?.id ||
                      (product as any).product_ref?.variant_id ||
                      '',
                  ).trim() || undefined;
                const sku =
                  String(
                    (defaultVariant as any)?.sku ||
                      (defaultVariant as any)?.sku_id ||
                      (product as any).sku ||
                      (product as any).sku_id ||
                      '',
                  ).trim() || undefined;
                const card = resolveProductCardPresentation(product);

                return (
                  <motion.div
                    key={buildProductKey(product)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <ProductCard
                      product_id={product.product_id}
                      merchant_id={product.merchant_id}
                      merchant_name={product.merchant_name}
                      variant_id={variantId}
                      sku={sku}
                      external_redirect_url={product.external_redirect_url}
                      title={card.title}
                      subtitle={card.highlight || card.subtitle || undefined}
                      badge={card.badge || undefined}
                      price={product.price}
                      currency={product.currency}
                      image={product.image_url || '/placeholder.svg'}
                      description={product.description}
                    />
                  </motion.div>
                );
                })}
              </AnimatePresence>
            </motion.div>
            <div ref={loadMoreRef} className="h-12" />
            {isLoadingMore ? (
              <div className="text-center py-4 text-sm text-muted-foreground">Loading more products…</div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
