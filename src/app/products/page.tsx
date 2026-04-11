'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Search, ShoppingBag } from 'lucide-react';
import {
  CatalogProductCard,
  CatalogProductSkeleton,
} from '@/components/catalog/CatalogProductCard';
import {
  sendMessage,
  getShoppingDiscoveryFeed,
  type ProductResponse,
} from '@/lib/api';
import { mergeUniqueCatalogProducts, buildCatalogProductKey } from '@/lib/catalogProducts';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';

const TRENDING_TAGS = [
  'Vitamin C',
  'Niacinamide',
  'Sunscreen',
  'Serum',
  'Moisturizer',
] as const;

const GRID_INITIAL_PAGE_SIZE = 60;
const NO_GROWTH_STOP_THRESHOLD = 2;

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const searchRequestSeqRef = useRef(0);
  const noGrowthCountRef = useRef(0);
  const activeQueryRef = useRef('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { items, open } = useCartStore();

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const displayTotal =
    typeof total === 'number' ? total : hasLoadedOnce ? products.length : undefined;
  const isInitialLoading = loading && !hasLoadedOnce;

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
      setActiveQuery(trimmed);

      if (append) {
        setIsLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        let fetchedProducts: ProductResponse[] = [];
        let hasMoreFromResponse: boolean | undefined;
        let totalFromResponse: number | undefined;

        if (!trimmed) {
          const result = await getShoppingDiscoveryFeed({
            surface: 'browse_products',
            page: targetPage,
            limit: GRID_INITIAL_PAGE_SIZE,
            // Browse is a full-catalog surface. Do not pass behavior history here:
            // page-1 recent-view suppression can underfill the grid for active users.
            recentViews: [],
            recentQueries: [],
          });
          fetchedProducts = result.products;
          hasMoreFromResponse = result.page_info.has_more;
          totalFromResponse = result.page_info.total;
        } else {
          const result = await sendMessage(trimmed, undefined, {
            signal: controller.signal,
            pagination: {
              page: targetPage,
              limit: GRID_INITIAL_PAGE_SIZE,
            },
          });
          fetchedProducts = Array.isArray(result?.products) ? result.products : [];
          hasMoreFromResponse = Boolean(result?.page_info?.has_more);
          totalFromResponse = Number.isFinite(Number(result?.page_info?.total))
            ? Number(result?.page_info?.total)
            : undefined;
          if (!append && result?.strict_empty && result?.reply) {
            toast.info(result.reply);
          }
        }

        if (requestSeq !== searchRequestSeqRef.current) return;

        if (!append) {
          const deduped = mergeUniqueCatalogProducts([], fetchedProducts).merged;
          setProducts(deduped);
          setPage(targetPage);
          setTotal(totalFromResponse ?? deduped.length);
          setHasLoadedOnce(true);
          noGrowthCountRef.current = 0;
          setHasMore(Boolean(hasMoreFromResponse) && deduped.length > 0);
          return;
        }

        setProducts((prev) => {
          const { merged, added } = mergeUniqueCatalogProducts(prev, fetchedProducts);
          if (added === 0) {
            noGrowthCountRef.current += 1;
          } else {
            noGrowthCountRef.current = 0;
          }

          const stopForNoGrowth = noGrowthCountRef.current >= NO_GROWTH_STOP_THRESHOLD;
          const canContinue = Boolean(hasMoreFromResponse) && !stopForNoGrowth;
          setHasMore(canContinue);
          setTotal(totalFromResponse ?? merged.length);
          if (canContinue) setPage(targetPage);
          return merged;
        });
      } catch (error: any) {
        if (requestSeq !== searchRequestSeqRef.current) return;
        if (error?.name === 'AbortError') return;
        console.error('Search error:', error);
        setHasLoadedOnce(true);
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
    [],
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
    const q = new URLSearchParams(window.location.search).get('q')?.trim() || '';
    if (q) {
      handleSearch(q, { immediate: true });
      return;
    }
    void executeSearch('');
  }, [executeSearch, handleSearch]);

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

  const handleBack = () => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(circle_at_top,_rgba(117,146,255,0.14),_rgba(255,255,255,0)_58%),radial-gradient(circle_at_90%_8%,_rgba(216,127,255,0.12),_rgba(255,255,255,0)_34%)]"
      />

      <main className="relative mx-auto max-w-6xl px-3.5 pb-14 pt-4 sm:px-6 sm:pt-5 lg:px-8">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <section className="flex items-start justify-between gap-3 px-1 py-0.5 sm:items-center">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#ece5dd] bg-white text-slate-600 shadow-[0_6px_16px_rgba(15,23,42,0.05)] transition hover:border-[#ddd3c8] hover:text-slate-950"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
                </button>
                <h1 className="text-[1.6rem] font-semibold tracking-[-0.045em] text-[#111827] sm:text-[1.95rem]">
                  Browse products
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-none text-[#667085]">
                {typeof displayTotal === 'number' ? (
                  <p>{displayTotal} products across brands</p>
                ) : (
                  <div className="h-3.5 w-32 animate-pulse rounded-full bg-[#ece5dd]" aria-hidden />
                )}
                {loading && hasLoadedOnce ? (
                  <span className="inline-flex items-center rounded-full bg-[#f3efff] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#7c3aed]">
                    Updating
                  </span>
                ) : null}
              </div>
              {activeQuery ? (
                <p className="text-[12px] text-[#667085]">
                  Showing results for <span className="font-medium text-slate-900">“{activeQuery}”</span>
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={open}
              className="relative mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#ece5dd] bg-white text-slate-600 shadow-[0_6px_16px_rgba(15,23,42,0.06)] transition hover:border-[#ddd3c8] hover:text-slate-950 sm:h-10 sm:w-10"
              aria-label="Open cart"
            >
              <ShoppingBag className="h-4 w-4" />
              {itemCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#c16cf3] px-1 text-[9px] font-semibold text-white">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              ) : null}
            </button>
          </section>

          <section className="relative rounded-[22px] border border-[#efe7dc] bg-white px-3 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:px-4">
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void executeSearch(searchQuery);
              }}
            >
              <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-[#ece5dd] bg-[#fcfbf9] px-4 shadow-sm">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => handleSearch(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                  placeholder="Search products, brands, or categories"
                  className="w-full bg-transparent text-[13px] text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#1f2937] px-4 text-[13px] font-medium text-white transition hover:bg-[#111827]"
              >
                Search
              </button>
            </form>

            {searchFocused ? (
              <div
                className="absolute left-3 right-3 top-[calc(100%-0.25rem)] z-30 rounded-[18px] border border-[#ece5dd] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.12)] sm:left-4 sm:right-4"
                onMouseDown={(event) => event.preventDefault()}
              >
                <div className="flex flex-wrap gap-1.5">
                  {TRENDING_TAGS.map((trend) => {
                    const selected = activeQuery.toLowerCase() === trend.toLowerCase();
                    return (
                      <button
                        key={trend}
                        type="button"
                        onClick={() => {
                          handleTrendingClick(trend);
                          setSearchFocused(false);
                        }}
                        className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-[-0.01em] transition ${
                          selected
                            ? 'border-transparent bg-gradient-to-r from-[#8f57ff] via-[#a35cff] to-[#4f7cff] text-white shadow-[0_10px_24px_rgba(143,87,255,0.22)]'
                            : 'border-[#e8e1d7] bg-[#fbf9f6] text-[#667085] hover:border-[#d9d1c6]'
                        }`}
                      >
                        {trend}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {isInitialLoading ? (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-3.5 md:gap-x-4 md:gap-y-5 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <CatalogProductSkeleton key={index} />
                ))}
              </div>
            </section>
          ) : products.length === 0 ? (
            <section className="rounded-[24px] border border-dashed border-[#ddd3c8] bg-white px-6 py-10 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">No products found</h2>
              <p className="mt-2 text-sm text-slate-500">
                {activeQuery
                  ? 'Try a different keyword or brand name.'
                  : 'The browse feed is empty right now. Please try again shortly.'}
              </p>
            </section>
          ) : (
            <section className="space-y-4" aria-busy={loading && hasLoadedOnce}>
              <div className={`grid grid-cols-2 gap-x-2.5 gap-y-3.5 md:gap-x-4 md:gap-y-5 lg:grid-cols-3 xl:grid-cols-4 ${loading && hasLoadedOnce ? 'opacity-80 transition-opacity' : ''}`}>
                {products.map((product) => (
                  <CatalogProductCard key={buildCatalogProductKey(product)} product={product} />
                ))}
              </div>

              <div
                ref={loadMoreRef}
                className="flex h-9 items-center justify-center text-[13px] text-slate-500"
              >
                {loading && hasLoadedOnce
                  ? 'Updating products...'
                  : isLoadingMore
                    ? 'Loading more products...'
                    : hasMore
                      ? 'Scroll for more'
                      : 'End of catalog'}
              </div>
            </section>
          )}
        </motion.section>
      </main>
    </div>
  );
}
