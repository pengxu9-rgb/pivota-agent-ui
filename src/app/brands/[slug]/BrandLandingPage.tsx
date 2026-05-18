'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Heart,
  ShoppingBag,
} from 'lucide-react';
import { motion } from 'framer-motion';
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
import { appendCurrentPathAsReturn, safeReturnUrl } from '@/lib/returnUrl';
import { normalizeDisplayImageUrl } from '@/lib/displayImage';
import { buildProductHrefForProduct } from '@/lib/productHref';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { ProductCard } from '@/components/ui/editorial/ProductCard';
import { Button } from '@/components/ui/editorial/Button';
import { Chip } from '@/components/ui/editorial/Chip';
import { Eyebrow, Mono, Headline } from '@/components/ui/editorial/Type';
import { HairlineDivider } from '@/components/ui/editorial/Divider';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Same formatter the chat home uses (`src/app/page.tsx:158`). Inlined for now;
// a follow-up can extract to `@/lib/format` and dedupe both call sites.
function formatPriceLabel(price: unknown, currency?: string): string {
  const amount = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(amount)) return '';
  const symbol = currency && currency.toUpperCase() !== 'USD' ? currency.toUpperCase() + ' ' : '$';
  return `${symbol}${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

// Surface the best promo on a product as the editorial ProductCard `badge` slot
// (top-left pill, terracotta variant). Reads the flat `best_deal` / `all_deals`
// shape that get_discovery_feed returns. Temporary treatment — once the design
// system grows a dedicated promo slot on the card, switch to that.
type DealLike = { label?: string; type?: string; config?: { kind?: string }; free_shipping?: boolean };

function isFreeShippingDeal(deal: DealLike | null | undefined): boolean {
  if (!deal) return false;
  if (deal.free_shipping === true) return true;
  const type = String(deal.type || '').toUpperCase();
  if (type === 'FREE_SHIPPING') return true;
  const kind = String(deal.config?.kind || '').toUpperCase();
  return kind === 'FREE_SHIPPING';
}

// Pick up to two promo chips to surface on the editorial ProductCard:
//   1. The best monetary discount (mirrors backend `best_deal`).
//   2. A free-shipping perk, if one is present in `all_deals` and isn't
//      already the best_deal.
// Solid terracotta `promo` variant for monetary discount, soft `accent`
// for shipping (different tone keeps the two visually distinct at a glance).
function dealBadgesFor(
  product: ProductResponse,
): Array<{ label: string; variant: 'promo' | 'accent' }> {
  const best = product.best_deal as DealLike | null | undefined;
  const deals = product.all_deals as DealLike[] | undefined;
  const out: Array<{ label: string; variant: 'promo' | 'accent' }> = [];
  const seen = new Set<string>();

  const primary = best && typeof best === 'object' ? best : null;
  const primaryLabel = String(primary?.label || '').trim();
  if (primaryLabel) {
    out.push({ label: primaryLabel, variant: 'promo' });
    seen.add(primaryLabel);
  }

  if (Array.isArray(deals)) {
    const shipping = deals.find((d) => isFreeShippingDeal(d));
    const shippingLabel = String(shipping?.label || '').trim();
    if (shippingLabel && !seen.has(shippingLabel)) {
      out.push({ label: shippingLabel, variant: 'accent' });
    }
  }

  return out;
}

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
  const addItem = useCartStore((state) => state.addItem);

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

  // Quick-add affordance on the product card (Plus icon over the image bottom-
  // right). Mirrors the legacy CatalogProductCard eligibility: only true Pivota-
  // internal merchants with a single seller can take a one-click cart-add.
  // Everything else (external_seed, identity-grouped multi-seller, external
  // redirect) routes to PDP so the user picks a seller or follows the
  // brand-direct outbound. Honors the "no execution-layer fallbacks" rule —
  // no fake one-click promise, but the icon always gives a real path.
  const handleQuickAdd = (product: ProductResponse) => {
    const href = buildProductHrefForProduct(product);
    const hrefWithReturn = appendCurrentPathAsReturn(href);

    const isIdentityGrouped =
      Boolean((product as any).sellable_item_group_id) ||
      (product as any).canonical_scope === 'synthetic' ||
      (Array.isArray((product as any).group_members) &&
        (product as any).group_members.length > 1) ||
      Number((product as any).offers_count || 0) > 1;
    const isDirectCartEligible =
      !isIdentityGrouped &&
      Boolean(product.merchant_id) &&
      product.merchant_id !== 'external_seed' &&
      !(product as any).external_redirect_url;

    if (!isDirectCartEligible) {
      router.push(hrefWithReturn);
      return;
    }

    const variantId =
      String((product as any).variant_id || (product as any).sku_id || '').trim() ||
      product.product_id;
    const cartItemId = product.merchant_id
      ? `${product.merchant_id}:${variantId}`
      : variantId;

    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: variantId,
      sku: (product as any).sku,
      title: product.title,
      price: product.price,
      currency: product.currency,
      imageUrl: normalizeDisplayImageUrl(product.image_url, '/placeholder.svg'),
      merchant_id: product.merchant_id,
      quantity: 1,
    });
    openCart();
    toast.success(`Added ${product.title} to bag`);
  };
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

  // When there's a `brandStory` we split the grid in two (mock: 6 products →
  // atelier band → continue grid). Without that mid-content, splitting just
  // leaves a visible gap with empty slots on the 4-col desktop layout, so we
  // render one continuous grid. See PR #184 review.
  const shouldSplitGridForAtelier = Boolean(brandStory);
  const headSplit = shouldSplitGridForAtelier ? 6 : visibleProducts.length;
  const visibleHeadProducts = visibleProducts.slice(0, headSplit);
  const visibleTailProducts = visibleProducts.slice(headSplit);
  const totalCount = Number(feedMetadata?.total_count ?? feedMetadata?.total ?? products.length);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-paper text-ink-2">
      {/* Top bar — sparse: chevron-left · "via Pivota" · bag */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-10">
          <a
            href={returnHref}
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-hairline-2"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
          </a>
          <div className="flex items-center gap-1.5 text-ink-muted">
            <span className="pv-label">via</span>
            <span className="font-serif text-[14px] italic text-ink">Pivota</span>
          </div>
          <button
            type="button"
            onClick={openCart}
            aria-label="Open cart"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition hover:bg-hairline-2"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.75} />
            {cartItemCount > 0 ? (
              <span
                className="absolute right-1 top-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-terracotta px-1 font-mono text-[8.5px] font-medium text-white"
                aria-label={`${cartItemCount} item${cartItemCount === 1 ? '' : 's'} in cart`}
              >
                {cartItemCount > 99 ? '99+' : cartItemCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-10">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col"
        >
          {/* Compact brand band — italic serif wordmark + meta + tagline + CTAs */}
          <section className="pt-7 pb-6 lg:grid lg:grid-cols-[1.4fr_1fr] lg:gap-12 lg:pt-12 lg:pb-10">
            <div>
              <h1 className="font-serif text-[28px] italic font-normal leading-none tracking-[-0.01em] text-ink sm:text-[36px] lg:text-[44px]">
                {brandName || 'Brand'}
              </h1>
              {subtitle ? <Mono className="mt-3 text-ink-muted">{subtitle}</Mono> : null}
              {!subtitle && Number.isFinite(totalCount) && totalCount > 0 ? (
                <Mono className="mt-3 text-ink-muted">{totalCount} pieces</Mono>
              ) : null}
              <p className="mt-4 font-serif text-[19px] font-normal leading-[1.3] text-ink sm:text-[24px] lg:text-[28px] lg:leading-[1.15]">
                Explore the <em className="not-italic text-terracotta">{brandName || 'house'} edit.</em>
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <a href="#brand-products" className="inline-flex">
                  <Button variant="default" size="md">
                    Shop the edit
                    {products.length > 0 ? ` · ${products.length}` : ''}
                  </Button>
                </a>
                <Button variant="ghost" size="md">
                  <Heart className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
                  Follow
                </Button>
                {activeQuery ? (
                  <Mono className="ml-1 text-ink-muted">
                    “{activeQuery}”
                  </Mono>
                ) : null}
              </div>
            </div>
            {/* Right rail reserved for future campaign imagery — left blank until brand metadata flows. */}
          </section>

          <HairlineDivider />

          {/* Filter chips */}
          {categoryChips.length > 1 ? (
            <section className="py-4">
              <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {categoryChips.map((chip) => {
                  const selected =
                    chip.scopeValue === activeCategory ||
                    (!chip.scopeValue && !activeCategory);
                  return (
                    <Chip
                      key={chip.key}
                      variant={selected ? 'active' : 'default'}
                      onClick={() => setActiveCategory(chip.scopeValue)}
                    >
                      {chip.label}
                      {typeof chip.count === 'number' ? ` · ${chip.count}` : ''}
                    </Chip>
                  );
                })}
              </div>
              {isRefreshing ? (
                <Mono className="mt-2 text-ink-muted">Updating products…</Mono>
              ) : null}
            </section>
          ) : null}

          {/* Product grid */}
          {isInitialLoading ? (
            <section id="brand-products" className="py-2">
              <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="flex flex-col gap-3">
                    <div className="aspect-[4/5] animate-pulse bg-paper-2" />
                    <div className="h-3 w-1/3 animate-pulse bg-paper-2" />
                    <div className="h-4 w-4/5 animate-pulse bg-paper-2" />
                    <div className="h-4 w-1/4 animate-pulse bg-paper-2" />
                  </div>
                ))}
              </div>
            </section>
          ) : products.length === 0 ? (
            <section className="py-16 text-center">
              <Headline className="text-[20px]">
                No products found for {brandName}
              </Headline>
              <p className="mt-3 text-[13px] text-ink-muted">
                {activeQuery
                  ? 'Try a different keyword within this brand.'
                  : 'This brand does not have matching catalog items yet.'}
              </p>
            </section>
          ) : visibleProducts.length === 0 ? (
            <section className="py-16 text-center">
              <Headline className="text-[20px]">
                No{' '}
                {categoryChips.find((chip) => chip.scopeValue === activeCategory)?.label?.toLowerCase() ||
                  'matching'}{' '}
                picks yet
              </Headline>
              <p className="mt-3 text-[13px] text-ink-muted">
                Try another category or clear the filter to see more.
              </p>
            </section>
          ) : (
            <section id="brand-products" aria-busy={isRefreshing}>
              <div
                className={cn(
                  'grid grid-cols-2 gap-x-3.5 gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12',
                  isRefreshing && 'opacity-80 transition-opacity',
                )}
              >
                {visibleHeadProducts.map((product) => {
                  const href = buildProductHrefForProduct(product);
                  const hrefWithReturn = appendCurrentPathAsReturn(href);
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
                        brand={product.category || product.brand || product.merchant_name || null}
                        title={product.title}
                        priceLabel={formatPriceLabel(product.price, product.currency)}
                        badge={dealBadgesFor(product)}
                        onQuickAction={() => handleQuickAdd(product)}
                        quickActionLabel={`Quick add ${product.title}`}
                        aspect="4/5"
                      />
                    </Link>
                  );
                })}
              </div>

              {/* Atelier band — only shown when brandStory metadata is present (real data only). */}
              {brandStory ? (
                <section className="my-12 border border-hairline bg-surface px-5 py-6 sm:px-8 sm:py-9">
                  <Eyebrow>{brandStory.title || 'From the atelier'}</Eyebrow>
                  <blockquote className="mt-3 font-serif text-[18px] leading-[1.45] text-ink sm:text-[22px]">
                    “{brandStory.quote}”
                  </blockquote>
                  {brandStory.author ? (
                    <Mono className="mt-3 text-ink-muted">— {brandStory.author}</Mono>
                  ) : null}
                </section>
              ) : null}

              {/* Continue grid — remaining products after the first 6. */}
              {visibleTailProducts.length > 0 ? (
                <div className="mt-10 grid grid-cols-2 gap-x-3.5 gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12">
                  {visibleTailProducts.map((product) => {
                    const href = buildProductHrefForProduct(product);
                    const hrefWithReturn = appendCurrentPathAsReturn(href);
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
                          brand={product.category || product.brand || product.merchant_name || null}
                          title={product.title}
                          priceLabel={formatPriceLabel(product.price, product.currency)}
                          badge={dealBadgesFor(product)}
                          onQuickAction={() => handleQuickAdd(product)}
                          quickActionLabel={`Quick add ${product.title}`}
                          aspect="4/5"
                        />
                      </Link>
                    );
                  })}
                </div>
              ) : null}

              <div
                ref={loadMoreRef}
                className="mt-8 flex h-12 items-center justify-center text-[12px] text-ink-muted"
              >
                {isRefreshing
                  ? 'Updating products…'
                  : isLoadingMore
                    ? 'Loading more…'
                    : hasMore
                      ? 'Scroll for more'
                      : 'End of brand catalog'}
              </div>
            </section>
          )}
        </motion.section>
      </main>
    </div>
  );
}
