'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowUpDown, Search, ShoppingBag, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Chip,
  DisplayHeading,
  Eyebrow,
  Headline,
  IconButton,
  Mono,
  Num,
  ProductCard,
} from '@/components/ui/editorial';
import {
  getMerchantProductsFeed,
  getShoppingDiscoveryFeed,
  type ProductResponse,
} from '@/lib/api';
import { mergeUniqueCatalogProducts, buildCatalogProductKey } from '@/lib/catalogProducts';
import { deriveEditorialProductCardSignals } from '@/lib/editorialProductCard';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { buildProductHrefForProduct } from '@/lib/productHref';
import { appendCurrentPathAsReturn } from '@/lib/returnUrl';
import { useCartStore } from '@/store/cartStore';
import { cn } from '@/lib/utils';

/** Editorial category chips that sit just under the title block. "All"
 *  clears the query; the rest run an immediate keyword search. */
const CATEGORY_CHIPS: string[] = ['All', 'Womenswear', 'Menswear', 'Home', 'Beauty', 'Objects'];

/** Curated collections — surface as a focus dropdown when the search
 *  pill is active. Replaces the previous trending-tags strip. */
const CURATED_COLLECTIONS: string[] = [
  'Travel edit · Lisbon',
  'Quiet luxury basics',
  'Hostess gifts < $80',
  'Skincare for 30s',
];

// Keep the first browse payload below the live gateway timeout budget.
// Once the page is interactive, infinite scroll can fetch a denser
// follow-up page.
const GRID_INITIAL_PAGE_SIZE = 24;
const GRID_APPEND_PAGE_SIZE = 36;
const GRID_DISCOVERY_TIMEOUT_MS = 15000;
const NO_GROWTH_STOP_THRESHOLD = 2;

function formatPriceLabel(price: unknown, currency?: string): string {
  const amount = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
}

function getIsoWeek(date: Date): number {
  // ISO 8601 week number — Monday-based, "Week 1" contains the first
  // Thursday of the year.
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function chipActive(activeQuery: string, chip: string): boolean {
  if (chip === 'All') return activeQuery.trim() === '';
  return chip.toLowerCase() === activeQuery.trim().toLowerCase();
}

/** Small grid skeleton block while the first page is loading. */
const GridSkeletonCard = memo(function GridSkeletonCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/5] w-full animate-pulse bg-paper-2" />
      <div className="h-3 w-12 animate-pulse bg-paper-2" />
      <div className="h-4 w-full animate-pulse bg-paper-2" />
    </div>
  );
});

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [merchantScope, setMerchantScope] = useState('');
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const searchRequestSeqRef = useRef(0);
  const noGrowthCountRef = useRef(0);
  const activeQueryRef = useRef('');
  const merchantScopeRef = useRef('');
  const nextCursorRef = useRef<string | null>(null);
  const loadMoreInFlightCursorRef = useRef<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { items, open, addItem } = useCartStore();

  const itemCount = items.reduce((acc, item) => acc + item.quantity, 0);
  const isInitialLoading = loading && !hasLoadedOnce;
  const now = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => `Week ${getIsoWeek(now)} · The catalog`, [now]);
  const dateLabel = useMemo(() => `Week ${getIsoWeek(now)} · ${formatLongDate(now)}`, [now]);

  const executeSearchPage = useCallback(
    async (query: string, cursor: string | null, options?: { append?: boolean }) => {
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
        let nextCursorFromResponse: string | null = null;
        let hasMoreFromResponse = false;

        const merchantId = merchantScopeRef.current;
        const pageFromCursor =
          cursor && /^page:\d+$/i.test(cursor)
            ? Math.max(1, Number(cursor.replace(/^page:/i, '')) || 1)
            : 1;
        const result = merchantId
          ? await getMerchantProductsFeed({
              merchant_id: merchantId,
              page: pageFromCursor,
              limit: append ? GRID_APPEND_PAGE_SIZE : GRID_INITIAL_PAGE_SIZE,
              ...(trimmed ? { query: trimmed } : {}),
              signal: controller.signal,
              timeout_ms: GRID_DISCOVERY_TIMEOUT_MS,
            })
          : await getShoppingDiscoveryFeed({
              surface: 'browse_products',
              cursor,
              limit: append ? GRID_APPEND_PAGE_SIZE : GRID_INITIAL_PAGE_SIZE,
              ...(trimmed ? { query: trimmed } : {}),
              signal: controller.signal,
              timeout_ms: GRID_DISCOVERY_TIMEOUT_MS,
              // Browse is a full-catalog surface. Do not pass behavior
              // history here — public browse/search should remain stable
              // and cursor-safe.
              recentViews: [],
              recentQueries: [],
            });
        fetchedProducts = result.products;
        nextCursorFromResponse = result.cursor_info?.next_cursor || null;
        hasMoreFromResponse = result.cursor_info?.has_next_page ?? result.page_info.has_more;

        if (requestSeq !== searchRequestSeqRef.current) return;

        if (!append) {
          const deduped = mergeUniqueCatalogProducts([], fetchedProducts).merged;
          setProducts(deduped);
          setNextCursor(nextCursorFromResponse);
          nextCursorRef.current = nextCursorFromResponse;
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
          setNextCursor(canContinue ? nextCursorFromResponse : null);
          nextCursorRef.current = canContinue ? nextCursorFromResponse : null;
          setHasMore(canContinue);
          return merged;
        });
      } catch (error: any) {
        if (requestSeq !== searchRequestSeqRef.current) return;
        if (error?.name === 'AbortError') return;
        console.error('Search error:', error);
        setHasLoadedOnce(true);
        toast.error(
          error?.code === 'UPSTREAM_TIMEOUT'
            ? 'Search timed out. Please retry.'
            : trimmed
              ? 'Failed to search products'
              : 'Unable to load products. Please try again.',
        );
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
      loadMoreInFlightCursorRef.current = null;
      setNextCursor(null);
      nextCursorRef.current = null;
      setHasMore(true);
      await executeSearchPage(query, null, { append: false });
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
    const params = new URLSearchParams(window.location.search);
    const merchantId = params.get('merchant_id')?.trim() || params.get('merchantId')?.trim() || '';
    merchantScopeRef.current = merchantId;
    setMerchantScope(merchantId);
    const q = params.get('q')?.trim() || '';
    if (q) {
      handleSearch(q, { immediate: true });
      return;
    }
    void executeSearch('');
  }, [executeSearch, handleSearch]);

  const loadMore = useCallback(() => {
    if (loading || isLoadingMore || !hasMore) return;
    const cursor = nextCursorRef.current;
    if (!cursor) return;
    if (loadMoreInFlightCursorRef.current) return;
    loadMoreInFlightCursorRef.current = cursor;
    void executeSearchPage(activeQueryRef.current, cursor, { append: true }).finally(() => {
      if (loadMoreInFlightCursorRef.current === cursor) {
        loadMoreInFlightCursorRef.current = null;
      }
    });
  }, [executeSearchPage, hasMore, isLoadingMore, loading]);

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

  const handleChipClick = useCallback(
    (chip: string) => {
      if (chip === 'All') {
        handleSearch('', { immediate: true });
        return;
      }
      handleSearch(chip, { immediate: true });
    },
    [handleSearch],
  );

  const handleCuratedClick = useCallback(
    (collection: string) => {
      handleSearch(collection, { immediate: true });
      setSearchFocused(false);
    },
    [handleSearch],
  );

  const handleBack = () => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  };

  const titleHeading = merchantScope ? "The merchant's edit." : 'Browse the edit.';
  const resultsLabel =
    products.length > 0
      ? `${products.length.toLocaleString()} ${products.length === 1 ? 'piece' : 'pieces'}${
          hasMore ? '+' : ''
        }`
      : '';

  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-8">
        {/* Header */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconButton label="Go back" size="md" onClick={handleBack}>
              <ArrowLeft size={18} strokeWidth={1.6} />
            </IconButton>
            <Headline as="span" size={18} className="font-editorial-serif italic text-ink">
              Pivota
            </Headline>
          </div>
          <IconButton label="Open bag" size="md" onClick={open} className="relative">
            <ShoppingBag size={18} strokeWidth={1.5} />
            {itemCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-terracotta px-1 font-editorial-mono text-[9px] font-bold text-paper"
              >
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            ) : null}
          </IconButton>
        </header>

        {/* Title block */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <Eyebrow>{weekLabel}</Eyebrow>
            <DisplayHeading size={36} className="mt-3 max-w-[640px] text-balance lg:hidden">
              {titleHeading.split('edit')[0]}
              <em className="font-editorial-serif italic text-ink-muted">edit.</em>
            </DisplayHeading>
            <DisplayHeading size={60} className="mt-4 hidden max-w-[760px] text-balance lg:block">
              {merchantScope ? "The merchant's catalog, " : 'The full catalog, '}
              <em className="font-editorial-serif italic text-ink-muted">edited.</em>
            </DisplayHeading>
            <p className="pv-body mt-3 max-w-prose text-ink-muted">
              {activeQuery
                ? <>Showing results for <span className="font-editorial-serif italic text-ink">“{activeQuery}”</span> — refine with the filter chips below, or search again.</>
                : merchantScope
                  ? "Showing this merchant's catalog. Use the filter chips below to narrow by category, or search by name."
                  : 'A weekly edit of the live catalog — pieces curated for the brands and categories Pivota is watching.'}
            </p>
          </div>

          {resultsLabel ? (
            <div className="flex items-baseline gap-2 lg:flex-col lg:items-end lg:text-right">
              <Mono className="normal-case tracking-[0.04em] text-ink-muted">Showing ·</Mono>
              <Num value={resultsLabel} size={20} />
            </div>
          ) : null}
        </motion.section>

        {/* Search row */}
        <section className="relative">
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void executeSearch(searchQuery);
            }}
          >
            <div className="flex h-[42px] flex-1 items-center gap-2 rounded-full border border-hairline bg-surface px-4 transition-colors focus-within:border-ink/30">
              <Search size={16} strokeWidth={1.5} className="flex-shrink-0 text-ink-muted" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => handleSearch(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                placeholder="Search products, brands, or categories"
                className="w-full bg-transparent font-editorial-sans text-[13px] text-ink outline-none placeholder:text-subtle"
                aria-label="Search"
              />
            </div>
          </form>

          {searchFocused ? (
            <div
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 border border-hairline bg-surface p-3"
              onMouseDown={(event) => event.preventDefault()}
            >
              <Mono className="block">Curated by Pivota</Mono>
              <div className="mt-2 flex flex-col gap-1">
                {CURATED_COLLECTIONS.map((collection) => (
                  <button
                    key={collection}
                    type="button"
                    onClick={() => handleCuratedClick(collection)}
                    className="group flex items-center gap-2 rounded-full px-2 py-1.5 text-left text-[13px] text-ink transition-colors hover:bg-paper-2"
                  >
                    <Sparkles size={14} strokeWidth={1.5} className="flex-shrink-0 text-terracotta" />
                    <span className="font-editorial-sans">{collection}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* Filter chip row */}
        <section className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <div className="flex min-w-max items-center gap-1.5">
            {CATEGORY_CHIPS.map((chip) => {
              const isActive = chipActive(activeQuery, chip);
              return (
                <Chip
                  key={chip}
                  variant={isActive ? 'active' : 'default'}
                  onClick={() => handleChipClick(chip)}
                >
                  {chip}
                </Chip>
              );
            })}
            <div className="ml-auto flex items-center gap-2 pl-3">
              <Mono className="hidden normal-case tracking-[0.04em] text-ink-muted sm:inline">
                Sort
              </Mono>
              <IconButton label="Sort" size="md">
                <ArrowUpDown size={16} strokeWidth={1.5} />
              </IconButton>
            </div>
          </div>
        </section>

        {/* Results count + grid */}
        {isInitialLoading ? (
          <section className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <GridSkeletonCard key={index} />
            ))}
          </section>
        ) : products.length === 0 ? (
          <section className="border border-hairline bg-surface px-6 py-12 text-center">
            <Headline as="h2" size={20}>
              Nothing here yet.
            </Headline>
            <p className="pv-body mt-2 text-ink-muted">
              {activeQuery
                ? 'Try a different keyword, brand, or category — or clear the search to see the full edit.'
                : 'The browse feed is empty right now. Please try again shortly.'}
            </p>
          </section>
        ) : (
          <section
            className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4"
            aria-busy={loading && hasLoadedOnce}
          >
            {products.map((product) => {
              const href = buildProductHrefForProduct(product);
              const hrefWithReturn = appendCurrentPathAsReturn(href);
              const signals = deriveEditorialProductCardSignals(product);

              // Quick-action eligibility — the editorial card surfaces
              // "Add to bag" + "Buy now" icons only when the product can
              // actually transact. External_seed records redirect off-site
              // and identity-grouped products need PDP for seller-pick.
              const isExternalSeed = product.source === 'external_seed';
              const isIdentityGrouped =
                Boolean(product.sellable_item_group_id) ||
                product.canonical_scope === 'synthetic' ||
                (Array.isArray(product.group_members) && product.group_members.length > 1);
              const canQuickTransact =
                !isExternalSeed &&
                !isIdentityGrouped &&
                Boolean(product.merchant_id) &&
                product.merchant_id !== 'external_seed' &&
                !product.external_redirect_url;

              const handleAddToCart = () => {
                const variantId =
                  String(product.variant_id || product.sku_id || '').trim() ||
                  product.product_id;
                const cartItemId = product.merchant_id
                  ? `${product.merchant_id}:${variantId}`
                  : variantId;
                addItem({
                  id: cartItemId,
                  product_id: product.product_id,
                  variant_id: variantId,
                  sku: product.sku,
                  title: product.title,
                  price: product.price,
                  currency: product.currency,
                  imageUrl: normalizeDisplayImageUrl(product.image_url, '/placeholder.svg'),
                  merchant_id: product.merchant_id,
                  merchant_name: product.merchant_name,
                  quantity: 1,
                });
                toast.success(`Added ${product.title} to bag`);
              };

              const handleBuyNow = () => {
                handleAddToCart();
                open();
              };

              return (
                <Link
                  key={buildCatalogProductKey(product)}
                  href={href}
                  prefetch={false}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    router.push(hrefWithReturn);
                  }}
                  className="block"
                >
                  <ProductCard
                    image={normalizeDisplayImageUrl(product.image_url, '/placeholder.svg')}
                    imageAlt={product.title}
                    brand={product.merchant_name || product.brand || null}
                    category={signals.category}
                    title={product.title}
                    priceLabel={formatPriceLabel(product.price, product.currency)}
                    badge={signals.badge}
                    highlight={signals.highlight}
                    summaryBadges={signals.summaryBadges}
                    onAddToCart={canQuickTransact ? handleAddToCart : undefined}
                    onBuyNow={canQuickTransact ? handleBuyNow : undefined}
                    aspect="4/5"
                  />
                </Link>
              );
            })}
          </section>
        )}

        {/* Infinite-scroll sentinel + footer label */}
        <div
          ref={loadMoreRef}
          className={cn(
            'flex items-center justify-center py-6 font-editorial-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted',
          )}
        >
          {loading && hasLoadedOnce
            ? 'Updating the edit…'
            : isLoadingMore
              ? `Loading ${GRID_APPEND_PAGE_SIZE} more…`
              : hasMore
                ? 'Scroll for more'
                : 'End of the edit'}
        </div>
      </main>
    </div>
  );
}

