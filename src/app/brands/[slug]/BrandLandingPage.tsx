'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import ProductCard from '@/components/product/ProductCard';
import { Button } from '@/components/ui/button';
import {
  type BrandDiscoveryFacet,
  getBrandDiscoveryFeed,
  getBrowseHistory,
  type BrandDiscoverySort,
  type DiscoveryRecentView,
  type ProductResponse,
} from '@/lib/api';
import { normalizeBrandLabel } from '@/lib/brandRoute';
import { safeReturnUrl } from '@/lib/returnUrl';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 24;
const NO_GROWTH_STOP_THRESHOLD = 2;
const LOCAL_HISTORY_KEY = 'browse_history';

const SORT_OPTIONS: Array<{ value: BrandDiscoverySort; label: string }> = [
  { value: 'popular', label: 'Popular First' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
];

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

function normalizeSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

function decodeSlugToBrand(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategoryValue(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildRecentViewKey(item: DiscoveryRecentView): string {
  return `${String(item.merchant_id || '').trim()}::${String(item.product_id || '').trim()}`;
}

function mergeRecentViews(primary: DiscoveryRecentView[], secondary: DiscoveryRecentView[]) {
  const map = new Map<string, DiscoveryRecentView>();
  [...primary, ...secondary].forEach((item) => {
    const key = buildRecentViewKey(item);
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
  return Array.from(map.values()).slice(0, 16);
}

function readLocalRecentViews(): DiscoveryRecentView[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        const productId = String(item?.product_id || '').trim();
        if (!productId) return null;
        return {
          product_id: productId,
          merchant_id:
            item?.merchant_id == null ? null : String(item.merchant_id).trim() || null,
          title: String(item?.title || '').trim() || null,
          description: String(item?.description || '').trim() || null,
          viewed_at:
            Number(item?.timestamp) > 0
              ? new Date(Number(item.timestamp)).toISOString()
              : undefined,
          history_source: 'local',
        } satisfies DiscoveryRecentView;
      })
      .filter(Boolean) as DiscoveryRecentView[];
  } catch {
    return [];
  }
}

function mapRemoteHistory(items: any[]): DiscoveryRecentView[] {
  return items
    .map((item) => {
      const productId = String(item?.product_id || '').trim();
      if (!productId) return null;
      return {
        product_id: productId,
        merchant_id:
          item?.merchant_id == null ? null : String(item.merchant_id).trim() || null,
        title: String(item?.title || '').trim() || null,
        description: String(item?.description || '').trim() || null,
        viewed_at: item?.viewed_at ? String(item.viewed_at) : undefined,
        history_source: 'account',
      } satisfies DiscoveryRecentView;
    })
    .filter(Boolean) as DiscoveryRecentView[];
}

function syncBrandLandingUrlState({ query, category }: { query: string; category: string }) {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const normalizedQuery = String(query || '').trim();
  const normalizedCategory = normalizeCategoryValue(category);
  if (normalizedQuery) {
    params.set('q', normalizedQuery);
  } else {
    params.delete('q');
  }
  if (normalizedCategory) {
    params.set('category', normalizedCategory);
  } else {
    params.delete('category');
  }
  const nextQuery = params.toString();
  const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
}

export function BrandLandingPage({
  slug,
  initialBrandName,
  initialSubtitle,
  initialReturnUrl,
  initialSourceProductId,
  initialSourceMerchantId,
  initialQuery,
  initialCategory,
}: {
  slug: string;
  initialBrandName?: string;
  initialSubtitle?: string;
  initialReturnUrl?: string;
  initialSourceProductId?: string;
  initialSourceMerchantId?: string;
  initialQuery?: string;
  initialCategory?: string;
}) {
  const brandName = normalizeBrandLabel(initialBrandName || decodeSlugToBrand(slug));
  const subtitle = String(initialSubtitle || '').trim();
  const returnHref = safeReturnUrl(initialReturnUrl || null) || '/';
  const user = useAuthStore((state) => state.user);

  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [queryDraft, setQueryDraft] = useState(initialQuery || '');
  const [activeQuery, setActiveQuery] = useState(initialQuery || '');
  const [sort, setSort] = useState<BrandDiscoverySort>('popular');
  const [selectedCategory, setSelectedCategory] = useState(normalizeCategoryValue(initialCategory || ''));
  const [categoryFacets, setCategoryFacets] = useState<BrandDiscoveryFacet[]>([]);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [recentViews, setRecentViews] = useState<DiscoveryRecentView[]>([]);

  const requestSeqRef = useRef(0);
  const noGrowthCountRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const recentViewsRef = useRef<DiscoveryRecentView[]>([]);

  const historySignature = useMemo(
    () =>
      recentViews
        .map((item) => `${buildRecentViewKey(item)}:${String(item.viewed_at || '')}`)
        .join('|'),
    [recentViews],
  );
  const totalFacetCount = useMemo(
    () => categoryFacets.reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0),
    [categoryFacets],
  );

  useEffect(() => {
    recentViewsRef.current = recentViews;
  }, [recentViews]);

  useEffect(() => {
    syncBrandLandingUrlState({
      query: activeQuery,
      category: selectedCategory,
    });
  }, [activeQuery, selectedCategory]);

  useEffect(() => {
    const local = readLocalRecentViews();
    setRecentViews(local);

    if (!user?.id) return;

    let cancelled = false;
    void getBrowseHistory(40)
      .then((result) => {
        if (cancelled) return;
        const remoteViews = mapRemoteHistory(result?.items || []);
        if (!remoteViews.length) return;
        setRecentViews((current) => mergeRecentViews(remoteViews, current));
      })
      .catch(() => {
        // local history remains the fallback context
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!brandName) return;
    let cancelled = false;
    const requestSeq = ++requestSeqRef.current;
    noGrowthCountRef.current = 0;
    setLoading(true);
    setHasMore(true);
    setPage(1);

    void getBrandDiscoveryFeed({
      brandName,
      query: activeQuery,
      category: selectedCategory,
      sort,
      page: 1,
      limit: PAGE_SIZE,
      recentViews: recentViewsRef.current,
      sourceProductRef: {
        product_id: initialSourceProductId || null,
        merchant_id: initialSourceMerchantId || null,
      },
    })
      .then((result) => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setProducts(result.products);
        setTotal(result.page_info.total);
        setHasMore(Boolean(result.page_info.has_more));
        setCategoryFacets(Array.isArray(result.facets?.categories) ? result.facets.categories : []);
      })
      .catch(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setProducts([]);
        setTotal(0);
        setHasMore(false);
        setCategoryFacets([]);
      })
      .finally(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeQuery,
    brandName,
    historySignature,
    initialSourceMerchantId,
    initialSourceProductId,
    selectedCategory,
    sort,
  ]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loading || isLoadingMore) return;

        const nextPage = page + 1;
        const requestSeq = ++requestSeqRef.current;
        setIsLoadingMore(true);

        void getBrandDiscoveryFeed({
          brandName,
          query: activeQuery,
          category: selectedCategory,
          sort,
          page: nextPage,
          limit: PAGE_SIZE,
          recentViews: recentViewsRef.current,
          sourceProductRef: {
            product_id: initialSourceProductId || null,
            merchant_id: initialSourceMerchantId || null,
          },
        })
          .then((result) => {
            if (requestSeq !== requestSeqRef.current) return;
            setTotal(result.page_info.total);
            setCategoryFacets(Array.isArray(result.facets?.categories) ? result.facets.categories : []);
            setProducts((current) => {
              const { merged, added } = mergeUniqueProducts(current, result.products);
              if (added === 0) {
                noGrowthCountRef.current += 1;
              } else {
                noGrowthCountRef.current = 0;
              }
              const stopForNoGrowth = noGrowthCountRef.current >= NO_GROWTH_STOP_THRESHOLD;
              setHasMore(Boolean(result.page_info.has_more) && !stopForNoGrowth);
              if (!stopForNoGrowth) setPage(nextPage);
              return merged;
            });
          })
          .catch(() => {
            if (requestSeq !== requestSeqRef.current) return;
            setHasMore(false);
          })
          .finally(() => {
            if (requestSeq !== requestSeqRef.current) return;
            setIsLoadingMore(false);
          });
      },
      { root: null, rootMargin: '280px 0px', threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeQuery,
    brandName,
    hasMore,
    initialSourceMerchantId,
    initialSourceProductId,
    isLoadingMore,
    loading,
    page,
    selectedCategory,
    sort,
  ]);

  return (
    <div className="min-h-screen bg-gradient-mesh overflow-x-hidden relative">
      <div className="absolute top-1/4 left-1/4 h-80 w-80 bg-gradient-to-r from-cyan-400/15 via-sky-500/15 to-indigo-500/10 blur-3xl -z-10 animate-pulse" />

      <header className="sticky top-0 z-40 bg-card/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-3">
          <a href={returnHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </a>
          <Link href="/" className="flex items-center gap-2 group">
            <Sparkles className="h-5 w-5 text-cyan-400 group-hover:rotate-12 transition-transform" />
            <span className="text-lg font-semibold gradient-text">Pivota</span>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          <section className="rounded-3xl border border-border bg-card/70 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Brand
                </p>
                <h1 className="text-3xl font-semibold tracking-tight">{brandName || 'Brand'}</h1>
                {subtitle ? (
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {(typeof total === 'number' ? total : products.length) || 0} products across sellers
                </p>
              </div>

              <form
                className="flex w-full max-w-xl items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setActiveQuery(queryDraft.trim());
                }}
              >
                <div className="flex h-11 flex-1 items-center gap-2 rounded-2xl border border-border bg-background px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={queryDraft}
                    onChange={(event) => setQueryDraft(event.target.value)}
                    placeholder={`Search within ${brandName}`}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <Button type="submit" variant="gradient">
                  Search
                </Button>
              </form>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={sort === option.value ? 'gradient' : 'outline'}
                  onClick={() => setSort(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            {categoryFacets.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Categories
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedCategory ? 'outline' : 'gradient'}
                    onClick={() => setSelectedCategory('')}
                  >
                    All
                    <span className="text-[11px] opacity-80">{totalFacetCount || total || products.length}</span>
                  </Button>
                  {categoryFacets.map((facet) => (
                    <Button
                      key={facet.value}
                      type="button"
                      size="sm"
                      variant={selectedCategory === facet.value ? 'gradient' : 'outline'}
                      onClick={() => setSelectedCategory(facet.value)}
                    >
                      {facet.label}
                      <span className="text-[11px] opacity-80">{facet.count}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {loading ? (
            <section className="rounded-2xl border border-border bg-card/70 p-6 text-sm text-muted-foreground">
              Loading brand products...
            </section>
          ) : products.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
              <h2 className="text-lg font-semibold">
                No products found
                {selectedCategory ? ` in ${selectedCategory}` : ''} for {brandName}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeQuery
                  ? 'Try a different keyword or category within this brand.'
                  : selectedCategory
                    ? 'Try another category within this brand.'
                    : 'This brand does not have matching catalog items yet.'}
              </p>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {products.map((product) => (
                  <ProductCard
                    key={buildProductKey(product)}
                    product_id={product.product_id}
                    merchant_id={product.merchant_id}
                    merchant_name={product.merchant_name}
                    variant_id={product.variant_id}
                    sku={product.sku}
                    external_redirect_url={product.external_redirect_url}
                    title={product.title}
                    price={product.price}
                    currency={product.currency}
                    image={product.image_url || '/placeholder.svg'}
                    description={product.description}
                    compact
                  />
                ))}
              </div>

              <div ref={loadMoreRef} className="h-10 flex items-center justify-center text-sm text-muted-foreground">
                {isLoadingMore
                  ? 'Loading more products...'
                  : hasMore
                    ? 'Scroll for more'
                    : 'End of brand catalog'}
              </div>
            </section>
          )}
        </motion.div>
      </main>
    </div>
  );
}
