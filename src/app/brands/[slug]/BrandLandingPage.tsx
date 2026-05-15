'use client';

import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Heart,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  CatalogProductCard,
  CatalogProductSkeleton,
} from '@/components/catalog/CatalogProductCard';
import {
  Button as EdButton,
  Chip,
  DisplayHeading,
  Eyebrow,
  Headline,
  IconButton,
  InsightBlock,
  Mono,
  Num,
} from '@/components/ui/editorial';
import { cn } from '@/lib/utils';
import {
  type BrandDiscoveryFeedResult,
  getBrandDiscoveryFeed,
  getBrowseHistory,
  type BrandDiscoverySort,
  type DiscoveryRecentView,
  type ProductResponse,
} from '@/lib/api';
import { normalizeBrandLabel } from '@/lib/brandRoute';
import { buildCatalogProductKey, mergeUniqueCatalogProducts } from '@/lib/catalogProducts';
import { safeReturnUrl } from '@/lib/returnUrl';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';

const PAGE_SIZE = 12;
const NO_GROWTH_STOP_THRESHOLD = 2;
const LOCAL_HISTORY_KEY = 'browse_history';
const ALL_CATEGORY_KEY = 'all';

const SORT_OPTIONS: Array<{ value: BrandDiscoverySort; label: string }> = [
  { value: 'popular', label: 'Popular First' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
];

type CategoryChip = {
  key: string;
  label: string;
  scopeValue: string | null;
  count?: number;
};

type BrandCampaign = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

type BrandStory = {
  title?: string;
  quote: string;
  author?: string;
};

function decodeSlugToBrand(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function getBrandInitials(brandName: string): string {
  const parts = String(brandName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'PB';
  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function formatCategoryLabel(label: string): string {
  return label
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeCategoryScopeValue(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return formatCategoryLabel(trimmed);
}

function buildCategoryKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function readCategoryFacets(metadata: Record<string, any> | null | undefined): CategoryChip[] {
  const rawFacets = metadata?.facets?.categories;
  if (!rawFacets) return [];

  if (Array.isArray(rawFacets)) {
    return rawFacets
      .map((item) => {
        const rawValue = String(item?.value || item?.category || item?.label || item?.name || '').trim();
        const label = formatCategoryLabel(rawValue);
        if (!label) return null;
        const count = Number(item?.count || item?.total || 0);
        return {
          key: buildCategoryKey(label),
          label,
          scopeValue: normalizeCategoryScopeValue(rawValue) || label,
          ...(count > 0 ? { count } : {}),
        } satisfies CategoryChip;
      })
      .filter(Boolean) as CategoryChip[];
  }

  if (rawFacets && typeof rawFacets === 'object') {
    return Object.entries(rawFacets)
      .map(([key, value]) => {
        const label = formatCategoryLabel(String(key || '').trim());
        if (!label) return null;
        const count =
          typeof value === 'number'
            ? value
            : Number((value as any)?.count || (value as any)?.total || 0);
        return {
          key: buildCategoryKey(label),
          label,
          scopeValue: normalizeCategoryScopeValue(String((value as any)?.value || key || '')) || label,
          ...(count > 0 ? { count } : {}),
        } satisfies CategoryChip;
      })
      .filter(Boolean) as CategoryChip[];
  }

  return [];
}

function resolveCategoryChips(metadata: Record<string, any> | null | undefined): CategoryChip[] {
  const chipsFromMetadata = readCategoryFacets(metadata);
  if (chipsFromMetadata.length) {
    return chipsFromMetadata
      .sort((left, right) => (right.count || 0) - (left.count || 0))
      .slice(0, 8);
  }
  return [];
}

function resolveBrandCampaign(metadata: Record<string, any> | null | undefined): BrandCampaign | null {
  const candidate =
    metadata?.brand_campaign ||
    metadata?.campaign_banner ||
    metadata?.promo_banner ||
    metadata?.campaign ||
    null;

  if (!candidate || typeof candidate !== 'object') return null;
  if (candidate.enabled === false || candidate.visible === false) return null;

  const title = String(candidate.title || candidate.headline || candidate.name || '').trim();
  if (!title) return null;

  const subtitle = String(candidate.subtitle || candidate.body || candidate.description || '').trim();
  const ctaLabel = String(candidate.cta_label || candidate.ctaLabel || candidate.button_label || '').trim();
  const ctaHref = String(candidate.cta_href || candidate.ctaHref || candidate.href || '').trim();
  const eyebrow = String(candidate.eyebrow || candidate.label || '').trim();

  return {
    ...(eyebrow ? { eyebrow } : {}),
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(ctaLabel ? { ctaLabel } : {}),
    ...(ctaHref ? { ctaHref } : {}),
  };
}

function resolveBrandStory(metadata: Record<string, any> | null | undefined): BrandStory | null {
  const candidate =
    metadata?.brand_story ||
    metadata?.story ||
    metadata?.brand_editorial ||
    null;

  if (!candidate) return null;

  if (typeof candidate === 'string') {
    const quote = candidate.trim();
    return quote ? { quote } : null;
  }

  if (typeof candidate !== 'object') return null;

  const quote = String(candidate.quote || candidate.body || candidate.text || '').trim();
  if (!quote) return null;

  const title = String(candidate.title || candidate.label || '').trim();
  const author = String(candidate.author || candidate.attribution || candidate.byline || '').trim();

  return {
    ...(title ? { title } : {}),
    quote,
    ...(author ? { author } : {}),
  };
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
  initialFeed,
}: {
  slug: string;
  initialBrandName?: string;
  initialSubtitle?: string;
  initialReturnUrl?: string;
  initialSourceProductId?: string;
  initialSourceMerchantId?: string;
  initialQuery?: string;
  initialCategory?: string;
  initialFeed?: BrandDiscoveryFeedResult | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const brandName = normalizeBrandLabel(initialBrandName || decodeSlugToBrand(slug));
  const subtitle = String(initialSubtitle || '').trim();
  const returnHref = safeReturnUrl(initialReturnUrl || null) || '/';
  const user = useAuthStore((state) => state.user);
  const cartItems = useCartStore((state) => state.items);
  const openCart = useCartStore((state) => state.open);

  const hasInitialFeed = Boolean(initialFeed);
  const [products, setProducts] = useState<ProductResponse[]>(() =>
    mergeUniqueCatalogProducts([], initialFeed?.products || []).merged,
  );
  const [feedMetadata, setFeedMetadata] = useState<Record<string, any>>(
    () => initialFeed?.metadata || {},
  );
  const [queryDraft, setQueryDraft] = useState(initialQuery || '');
  const [activeQuery, setActiveQuery] = useState(initialQuery || '');
  const [sort, setSort] = useState<BrandDiscoverySort>('popular');
  const [activeCategory, setActiveCategory] = useState<string | null>(
    normalizeCategoryScopeValue(initialCategory),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(initialQuery));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    () => initialFeed?.cursor_info?.next_cursor || null,
  );
  const [hasMore, setHasMore] = useState(() => {
    if (!hasInitialFeed) return true;
    return Boolean(initialFeed?.cursor_info?.has_next_page ?? initialFeed?.page_info.has_more);
  });
  const [recentViews, setRecentViews] = useState<DiscoveryRecentView[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasInitialFeed);

  const requestSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(hasInitialFeed);
  const skipInitialClientFetchRef = useRef(hasInitialFeed);
  const noGrowthCountRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const recentViewsRef = useRef<DiscoveryRecentView[]>([]);
  const activeRecentViewsRef = useRef<DiscoveryRecentView[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const cartItemCount = useMemo(
    () => cartItems.reduce((totalCount, item) => totalCount + item.quantity, 0),
    [cartItems],
  );

  const categoryChips = useMemo(
    () => {
      const resolved = resolveCategoryChips(feedMetadata);
      if (
        activeCategory &&
        !resolved.some((chip) => chip.scopeValue === activeCategory)
      ) {
        resolved.unshift({
          key: buildCategoryKey(activeCategory),
          label: activeCategory,
          scopeValue: activeCategory,
        });
      }
      return [
        {
          key: ALL_CATEGORY_KEY,
          label: 'All',
          scopeValue: null,
        },
        ...resolved,
      ];
    },
    [activeCategory, feedMetadata],
  );
  const filterCategoryChips = useMemo(
    () => categoryChips.filter((chip) => chip.scopeValue),
    [categoryChips],
  );
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeCategory) count += 1;
    if (sort !== 'popular') count += 1;
    return count;
  }, [activeCategory, sort]);

  const visibleProducts = useMemo(() => products, [products]);
  const isInitialLoading = loading && !hasLoadedOnce;
  const brandCampaign = useMemo(() => resolveBrandCampaign(feedMetadata), [feedMetadata]);
  const brandStory = useMemo(() => resolveBrandStory(feedMetadata), [feedMetadata]);
  const brandAvatarUrl = String(
    feedMetadata?.brand_avatar_url || feedMetadata?.brand_logo_url || feedMetadata?.brand_image_url || '',
  ).trim();

  useEffect(() => {
    recentViewsRef.current = recentViews;
  }, [recentViews]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (activeQuery) {
      params.set('q', activeQuery);
    } else {
      params.delete('q');
    }
    if (activeCategory) {
      params.set('category', activeCategory);
    } else {
      params.delete('category');
    }
    const nextSearch = params.toString();
    const nextUrl = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl === nextUrl) return;
    router.replace(nextUrl, { scroll: false });
  }, [activeCategory, activeQuery, pathname, router]);

  useEffect(() => {
    setRecentViews(readLocalRecentViews());
  }, []);

  useEffect(() => {
    if (!user?.id || !hasLoadedOnce) return;

    let cancelled = false;
    void getBrowseHistory(40)
      .then((result) => {
        if (cancelled) return;
        const remoteViews = mapRemoteHistory(result?.items || []);
        if (!remoteViews.length) return;
        setRecentViews((current) => mergeRecentViews(remoteViews, current));
      })
      .catch(() => {
        // keep local browse context only
      });

    return () => {
      cancelled = true;
    };
  }, [hasLoadedOnce, user?.id]);

  useEffect(() => {
    if (!brandName) return;
    if (skipInitialClientFetchRef.current) {
      skipInitialClientFetchRef.current = false;
      return;
    }
    let cancelled = false;
    const requestSeq = ++requestSeqRef.current;
    noGrowthCountRef.current = 0;
    const requestRecentViews = [...recentViewsRef.current];
    activeRecentViewsRef.current = requestRecentViews;
    const coldStart = !hasLoadedOnceRef.current;
    if (coldStart) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setHasMore(true);
    setNextCursor(null);

    void getBrandDiscoveryFeed({
      brandName,
      query: activeQuery,
      ...(activeCategory ? { category: activeCategory } : {}),
      sort,
      limit: PAGE_SIZE,
      recentViews: requestRecentViews,
      sourceProductRef: {
        product_id: initialSourceProductId || null,
        merchant_id: initialSourceMerchantId || null,
      },
    })
      .then((result) => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setProducts(mergeUniqueCatalogProducts([], result.products).merged);
        setFeedMetadata(result.metadata || {});
        setNextCursor(result.cursor_info?.next_cursor || null);
        setHasMore(Boolean(result.cursor_info?.has_next_page ?? result.page_info.has_more));
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      })
      .catch(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setProducts([]);
        setFeedMetadata({});
        setNextCursor(null);
        setHasMore(false);
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      })
      .finally(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeQuery, brandName, initialSourceMerchantId, initialSourceProductId, sort]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || !nextCursor) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loading || isLoadingMore) return;

        const requestSeq = ++requestSeqRef.current;
        setIsLoadingMore(true);

        void getBrandDiscoveryFeed({
          brandName,
          query: activeQuery,
          ...(activeCategory ? { category: activeCategory } : {}),
          sort,
          cursor: nextCursor,
          limit: PAGE_SIZE,
          recentViews: activeRecentViewsRef.current,
          sourceProductRef: {
            product_id: initialSourceProductId || null,
            merchant_id: initialSourceMerchantId || null,
          },
        })
          .then((result) => {
            if (requestSeq !== requestSeqRef.current) return;
            setFeedMetadata((current) => ({ ...current, ...(result.metadata || {}) }));
            setProducts((current) => {
              const { merged, added } = mergeUniqueCatalogProducts(current, result.products);
              if (added === 0) {
                noGrowthCountRef.current += 1;
              } else {
                noGrowthCountRef.current = 0;
              }
              const stopForNoGrowth = noGrowthCountRef.current >= NO_GROWTH_STOP_THRESHOLD;
              const canContinue =
                Boolean(result.cursor_info?.has_next_page ?? result.page_info.has_more) &&
                !stopForNoGrowth;
              setNextCursor(canContinue ? result.cursor_info?.next_cursor || null : null);
              setHasMore(canContinue);
              return merged;
            });
          })
          .catch(() => {
            if (requestSeq !== requestSeqRef.current) return;
            setNextCursor(null);
            setHasMore(false);
          })
          .finally(() => {
            if (requestSeq !== requestSeqRef.current) return;
            setIsLoadingMore(false);
          });
      },
      { root: null, rootMargin: '320px 0px', threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    activeCategory,
    activeQuery,
    brandName,
    hasMore,
    initialSourceMerchantId,
    initialSourceProductId,
    isLoadingMore,
    loading,
    nextCursor,
    sort,
  ]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-paper text-ink">
      <main className="relative mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-4 pb-16 pt-4 sm:px-6 lg:px-8 lg:pt-6">
        {/* Lightweight top bar — chevron-left + "via Pivota" attribution +
            cart. Editorial replacement for the legacy hero chrome. */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <a
              href={returnHref}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-hairline-2"
              aria-label="Back"
            >
              <ArrowLeft size={18} strokeWidth={1.6} />
            </a>
            <Mono className="normal-case tracking-[0.06em] text-ink-muted">via Pivota</Mono>
          </div>
          <IconButton label="Open cart" size="md" onClick={openCart} className="relative">
            <ShoppingBag size={18} strokeWidth={1.5} />
            {cartItemCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-terracotta px-1 font-editorial-mono text-[9px] font-bold text-paper"
              >
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </span>
            ) : null}
          </IconButton>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="flex flex-col gap-6"
        >
          {/* Compact brand band — italic-serif wordmark + monogram + meta
              + tagline + 2 CTAs (Shop the edit terracotta · Follow ghost
              with heart). */}
          <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-end gap-4">
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-hairline bg-paper-2">
                {brandAvatarUrl ? (
                  <Image src={brandAvatarUrl} alt={brandName} fill unoptimized className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-editorial-serif text-[16px] italic text-ink">
                    {getBrandInitials(brandName)}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Mono className="block">Official brand</Mono>
                <DisplayHeading as="h1" size={40} className="mt-1 font-editorial-serif italic">
                  {brandName || 'Brand'}
                </DisplayHeading>
                {subtitle ? (
                  <p className="pv-body mt-1 text-ink-muted">
                    {subtitle}
                  </p>
                ) : null}
                {isRefreshing ? (
                  <Mono className="mt-2 inline-block text-terracotta-ink">Updating</Mono>
                ) : null}
                {activeQuery ? (
                  <p className="pv-body mt-2 text-ink-muted">
                    Showing results for{' '}
                    <span className="font-editorial-serif italic text-ink">“{activeQuery}”</span>
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <EdButton
                variant="accent"
                size="md"
                onClick={() => {
                  const target = document.getElementById('brand-products');
                  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                Shop the edit
              </EdButton>
              <EdButton variant="ghost" size="md" aria-label="Follow house">
                <Heart size={14} strokeWidth={1.6} />
                Follow
              </EdButton>
              <IconButton
                label={isSearchOpen ? 'Close brand search' : 'Open brand search'}
                size="md"
                onClick={() => {
                  setIsSearchOpen((current) => !current);
                  setIsFilterOpen(false);
                }}
              >
                {isSearchOpen ? <X size={18} strokeWidth={1.5} /> : <Search size={18} strokeWidth={1.5} />}
              </IconButton>
            </div>
          </section>

          {isSearchOpen ? (
            <section className="border border-hairline bg-surface p-3 sm:p-4">
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setActiveQuery(queryDraft.trim());
                }}
              >
                <div className="flex h-[42px] flex-1 items-center gap-2 rounded-full border border-hairline bg-paper-2 px-4 transition-colors focus-within:border-ink/30">
                  <Search size={16} strokeWidth={1.5} className="flex-shrink-0 text-ink-muted" />
                  <input
                    ref={searchInputRef}
                    value={queryDraft}
                    onChange={(event) => setQueryDraft(event.target.value)}
                    placeholder={`Search ${brandName} products`}
                    className="w-full bg-transparent font-editorial-sans text-[13px] text-ink outline-none placeholder:text-subtle"
                  />
                </div>
                <EdButton type="submit" variant="default" size="md">
                  Search
                </EdButton>
              </form>
            </section>
          ) : null}

          <section className="sticky top-0 z-40 -mx-4 border-y border-hairline bg-paper/96 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="mx-auto flex max-w-[1180px] items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsFilterOpen((current) => !current);
                  setIsSearchOpen(false);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 font-editorial-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink transition-colors hover:border-ink/30"
              >
                <SlidersHorizontal size={13} strokeWidth={1.6} />
                Filter
                {activeFilterCount > 0 ? (
                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-terracotta-bg px-1 text-[9px] font-bold text-terracotta-ink">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>

              <div className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-1.5 pr-1">
                  {categoryChips.map((chip) => {
                    const selected =
                      chip.scopeValue === activeCategory || (!chip.scopeValue && !activeCategory);
                    return (
                      <Chip
                        key={chip.key}
                        variant={selected ? 'active' : 'default'}
                        size="md"
                        onClick={() => setActiveCategory(chip.scopeValue)}
                      >
                        {chip.label}
                        {typeof chip.count === 'number' ? (
                          <span
                            className={cn(
                              'ml-1 font-editorial-mono text-[9px]',
                              selected ? 'text-paper/80' : 'text-ink-muted',
                            )}
                          >
                            {chip.count}
                          </span>
                        ) : null}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </div>

            {isFilterOpen ? (
              <div
                aria-label="Brand filters"
                className="mx-auto mt-3 max-w-[1180px] border border-hairline bg-surface p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Mono className="block">Filter products</Mono>
                    <p className="pv-body mt-1 text-ink-muted">
                      Narrow this brand feed with real category scope and sort.
                    </p>
                  </div>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory(null);
                        setSort('popular');
                      }}
                      className="font-editorial-sans text-[12px] font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>

                {filterCategoryChips.length ? (
                  <div className="mt-5">
                    <Mono className="block">Category</Mono>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Chip
                        variant={!activeCategory ? 'active' : 'default'}
                        size="md"
                        onClick={() => setActiveCategory(null)}
                      >
                        All categories
                      </Chip>
                      {filterCategoryChips.map((chip) => {
                        const selected = chip.scopeValue === activeCategory;
                        return (
                          <Chip
                            key={`filter-${chip.key}`}
                            variant={selected ? 'active' : 'default'}
                            size="md"
                            onClick={() => setActiveCategory(chip.scopeValue)}
                          >
                            {chip.label}
                            {typeof chip.count === 'number' ? ` ${chip.count}` : ''}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5">
                  <Mono className="block">Sort products</Mono>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {SORT_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        variant={sort === option.value ? 'active' : 'default'}
                        size="md"
                        onClick={() => setSort(option.value)}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <EdButton variant="default" size="sm" onClick={() => setIsFilterOpen(false)}>
                    Done
                  </EdButton>
                </div>
              </div>
            ) : null}
          </section>

          {brandCampaign ? (
            <section className="border border-hairline bg-surface-2 px-5 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1.5">
                  {brandCampaign.eyebrow ? (
                    <Mono className="block text-terracotta-ink">{brandCampaign.eyebrow}</Mono>
                  ) : null}
                  <Headline as="h2" size={22} className="leading-tight">
                    {brandCampaign.title}
                  </Headline>
                  {brandCampaign.subtitle ? (
                    <p className="pv-body max-w-2xl text-ink-muted">{brandCampaign.subtitle}</p>
                  ) : null}
                </div>
                {brandCampaign.ctaLabel ? (
                  <a
                    href={brandCampaign.ctaHref || '#brand-products'}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-terracotta px-5 font-editorial-sans text-[13px] font-medium text-paper transition-colors hover:bg-terracotta-ink"
                  >
                    {brandCampaign.ctaLabel}
                    <ArrowUpRight size={14} strokeWidth={1.6} />
                  </a>
                ) : null}
              </div>
            </section>
          ) : null}

          {isInitialLoading ? (
            <section id="brand-products" className="space-y-4">
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <CatalogProductSkeleton key={index} />
                ))}
              </div>
            </section>
          ) : products.length === 0 ? (
            <section className="border border-hairline bg-surface px-6 py-12 text-center">
              <Headline as="h2" size={20}>
                Nothing under {brandName} yet.
              </Headline>
              <p className="pv-body mt-2 text-ink-muted">
                {activeQuery
                  ? 'Try a different keyword within this brand.'
                  : "This brand doesn't have matching catalog items yet."}
              </p>
            </section>
          ) : visibleProducts.length === 0 ? (
            <section className="border border-hairline bg-surface px-6 py-12 text-center">
              <Headline as="h2" size={20}>
                No{' '}
                {categoryChips.find((chip) => chip.scopeValue === activeCategory)?.label?.toLowerCase() ||
                  'matching'}{' '}
                picks yet.
              </Headline>
              <p className="pv-body mt-2 text-ink-muted">
                Try another category or remove the active brand filter to see more pieces.
              </p>
            </section>
          ) : (
            <section id="brand-products" className="space-y-6" aria-busy={isRefreshing}>
              <div
                className={cn(
                  'grid grid-cols-2 gap-x-3.5 gap-y-6 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4',
                  isRefreshing ? 'opacity-80 transition-opacity' : '',
                )}
              >
                {visibleProducts.map((product) => (
                  <CatalogProductCard key={buildCatalogProductKey(product)} product={product} />
                ))}
              </div>

              <div
                ref={loadMoreRef}
                className="flex h-9 items-center justify-center font-editorial-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted"
              >
                {isRefreshing
                  ? 'Updating the edit…'
                  : isLoadingMore
                    ? 'Loading more pieces…'
                    : hasMore
                      ? 'Scroll for more'
                      : 'End of the edit'}
              </div>
            </section>
          )}

          {/* Atelier card — mid-page editorial block, gated on real
              brand-story metadata. Title falls back to "From the atelier"
              so the legacy "Brand story" copy is no longer rendered
              (tests assert its absence when brand-story data is missing). */}
          {brandStory ? (
            <section className="border border-hairline bg-surface px-5 py-8 sm:px-7">
              <Eyebrow>{brandStory.title || 'From the atelier'}</Eyebrow>
              <blockquote className="font-editorial-serif mt-4 max-w-3xl text-[18px] italic leading-[1.45] text-ink sm:text-[22px]">
                “{brandStory.quote}”
              </blockquote>
              {brandStory.author ? (
                <Mono className="mt-3 block normal-case tracking-[0.04em] text-ink-muted">
                  {brandStory.author}
                </Mono>
              ) : null}

              {/* Three-stat row — pulls from feedMetadata where available;
                  skipped silently if the brand record doesn't expose
                  these fields. */}
              {(() => {
                const stats: Array<{ label: string; value: string }> = [];
                const pieces = Number(feedMetadata?.product_count ?? 0);
                if (Number.isFinite(pieces) && pieces > 0) {
                  stats.push({ label: 'Pieces', value: pieces.toLocaleString() });
                }
                const seasons = Number(feedMetadata?.seasons_count ?? 0);
                if (Number.isFinite(seasons) && seasons > 0) {
                  stats.push({ label: 'Seasons', value: String(seasons) });
                }
                const returnRate = Number(feedMetadata?.return_rate ?? 0);
                if (Number.isFinite(returnRate) && returnRate > 0) {
                  stats.push({
                    label: 'Returns',
                    value: returnRate < 1 ? `${Math.round(returnRate * 100)}%` : `${returnRate}%`,
                  });
                }
                if (!stats.length) return null;
                return (
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-hairline pt-5">
                    {stats.map((stat) => (
                      <div key={stat.label} className="flex flex-col gap-1">
                        <Mono>{stat.label}</Mono>
                        <Num value={stat.value} size={26} />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </section>
          ) : null}

          {/* Editor's note — desktop-only band when brand-story content
              is present. Gives the "From Pivota" pull-quote with a
              quick prompt CTA. */}
          {brandStory ? (
            <InsightBlock label="Editor's note · from Pivota">
              <p className="pv-body">
                {brandStory.quote}
                {brandStory.author ? <span className="text-ink-muted"> — {brandStory.author}</span> : null}
              </p>
            </InsightBlock>
          ) : null}
        </motion.section>
      </main>
    </div>
  );
}
