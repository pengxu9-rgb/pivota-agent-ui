'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  getBrandDiscoveryFeed,
  getBrowseHistory,
  type BrandDiscoverySort,
  type DiscoveryRecentView,
  type ProductResponse,
} from '@/lib/api';
import { normalizeBrandLabel } from '@/lib/brandRoute';
import { buildProductHref } from '@/lib/productHref';
import { appendCurrentPathAsReturn, safeReturnUrl } from '@/lib/returnUrl';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { toast } from 'sonner';

const PAGE_SIZE = 24;
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

function formatPrice(price: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
    }).format(price);
  } catch {
    return `$${Number(price || 0).toFixed(2)}`;
  }
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

function getReviewMeta(product: ProductResponse) {
  const summary = product?.review_summary && typeof product.review_summary === 'object'
    ? product.review_summary
    : null;
  const scale = Number(summary?.scale || summary?.rating_scale || 5) || 5;
  const rawRating = Number(summary?.rating || summary?.average_rating || summary?.avg_rating || 0) || 0;
  const normalizedRating =
    rawRating > 0 ? Math.min(5, scale === 5 ? rawRating : (rawRating / scale) * 5) : null;
  const reviewCount =
    Number(summary?.review_count || summary?.count || summary?.total_reviews || 0) || 0;
  return {
    rating: normalizedRating,
    reviewCount,
  };
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

function inferCategoryLabel(product: ProductResponse): string | null {
  const rawPool = [
    product.product_type,
    product.category,
    product.department,
    ...(Array.isArray(product.tags) ? product.tags : []),
    product.title,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!rawPool.length) return null;

  const haystack = rawPool.join(' ').toLowerCase();
  if (/(fragrance|perfume|parfum|cologne|eau de)/.test(haystack)) return 'Fragrance';
  if (/(lipstick|lip color|lip gloss|lip balm|lip stain|lip liner|\blip\b)/.test(haystack)) {
    return 'Lip';
  }
  if (/(concealer|foundation|powder|skin tint|blush|bronzer|highlighter|primer|corrector)/.test(haystack)) {
    return 'Complexion';
  }
  if (/(mascara|brow|eyeshadow|eyeliner|eye color|lash|kohl)/.test(haystack)) return 'Eyes';
  if (/(brush|tools|tool|sponge|applicator)/.test(haystack)) return 'Tools';
  if (/(serum|cream|cleanser|moisturizer|treatment|mask|skincare|essence|lotion)/.test(haystack)) {
    return 'Skincare';
  }

  const firstSpecific = rawPool.find((value) => {
    const normalized = value.toLowerCase();
    return normalized && !['beauty', 'makeup', 'external'].includes(normalized);
  });

  if (!firstSpecific) return null;
  return formatCategoryLabel(firstSpecific);
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

function resolveCategoryChips(
  products: ProductResponse[],
  metadata: Record<string, any> | null | undefined,
): CategoryChip[] {
  const chipsFromMetadata = readCategoryFacets(metadata);
  if (chipsFromMetadata.length) {
    return chipsFromMetadata
      .sort((left, right) => (right.count || 0) - (left.count || 0))
      .slice(0, 8);
  }

  const counts = new Map<string, number>();
  products.forEach((product) => {
    const label = inferCategoryLabel(product);
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([label, count]) => ({
      key: buildCategoryKey(label),
      label,
      scopeValue: label,
      count,
    }));
}

function resolveProductBadge(product: ProductResponse): string | null {
  const rawTags = Array.isArray(product.tags)
    ? product.tags.map((tag) => String(tag || '').trim().toLowerCase())
    : [];

  if (rawTags.some((tag) => /(best seller|bestseller|iconic|top rated|top-rated)/.test(tag))) {
    return 'Bestseller';
  }
  if (rawTags.some((tag) => /\bnew\b|new arrival|just in/.test(tag))) {
    return 'New';
  }

  const { rating, reviewCount } = getReviewMeta(product);
  if ((rating || 0) >= 4.6 && reviewCount >= 25) return 'Bestseller';
  return null;
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

function BrandProductCard({ product }: { product: ProductResponse }) {
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);
  const openCart = useCartStore((state) => state.open);
  const [imageSrc, setImageSrc] = useState(product.image_url || '/placeholder.svg');

  const href = buildProductHref(product.product_id, product.merchant_id);
  const badge = resolveProductBadge(product);
  const { rating, reviewCount } = getReviewMeta(product);
  const isDirectCartEligible =
    Boolean(product.merchant_id) &&
    product.merchant_id !== 'external_seed' &&
    !product.external_redirect_url;

  useEffect(() => {
    setImageSrc(product.image_url || '/placeholder.svg');
  }, [product.image_url]);

  const handleQuickAction = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (!isDirectCartEligible) {
      router.push(appendCurrentPathAsReturn(href));
      return;
    }

    const resolvedVariantId = String(product.variant_id || product.sku_id || '').trim() || product.product_id;
    const cartItemId = product.merchant_id ? `${product.merchant_id}:${resolvedVariantId}` : resolvedVariantId;

    addItem({
      id: cartItemId,
      product_id: product.product_id,
      variant_id: resolvedVariantId,
      sku: product.sku,
      title: product.title,
      price: product.price,
      currency: product.currency,
      imageUrl: imageSrc,
      merchant_id: product.merchant_id,
      quantity: 1,
    });
    openCart();
    toast.success(`Added ${product.title} to cart`);
  };

  return (
    <div className="group relative">
      <Link href={href} prefetch={false} className="block h-full">
        <article className="h-full overflow-hidden rounded-[20px] border border-[#efe7dc] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.1)]">
          <div className="relative aspect-[4/5] overflow-hidden bg-[#f7f3ee]">
            <Image
              src={imageSrc}
              alt={product.title}
              fill
              unoptimized
              className="object-cover transition duration-300 group-hover:scale-[1.02]"
              onError={() => {
                if (imageSrc !== '/placeholder.svg') setImageSrc('/placeholder.svg');
              }}
            />

            {badge ? (
              <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                {badge}
              </span>
            ) : null}
          </div>

          <div className="space-y-2.5 p-3.5 pr-14 sm:p-4 sm:pr-14">
            <div className="flex min-h-[1.125rem] items-center gap-1.5 text-[12px] text-slate-500">
              <Star className="h-3.5 w-3.5 fill-[#f6c548] text-[#f6c548]" />
              <span className="font-semibold text-slate-700">{rating ? rating.toFixed(1) : 'New'}</span>
              <span className="text-[#8c96a8]">
                {reviewCount > 0 ? `(${reviewCount >= 1000 ? `${(reviewCount / 1000).toFixed(1)}k` : reviewCount})` : ''}
              </span>
            </div>

            <h3 className="min-h-[2.65rem] line-clamp-2 text-[15px] font-semibold leading-5 text-[#202531]">
              {product.title}
            </h3>

            <div className="space-y-0.5">
              <p className="text-[17px] font-bold tracking-tight text-[#111827]">
                {formatPrice(product.price, product.currency)}
              </p>
            </div>
          </div>
        </article>
      </Link>

      <button
        type="button"
        onClick={handleQuickAction}
        className="absolute bottom-4 right-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e6e0d7] bg-white text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.12)] transition hover:scale-105 hover:text-slate-950"
        aria-label={
          isDirectCartEligible ? `Quick add ${product.title}` : `View details for ${product.title}`
        }
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function BrandProductSkeleton() {
  return (
    <div className="overflow-hidden rounded-[24px] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.08)] ring-1 ring-black/5">
      <div className="aspect-[4/5] animate-pulse bg-slate-100" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-3/5 animate-pulse rounded-full bg-slate-100" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
        <div className="h-4 w-2/5 animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
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
  const router = useRouter();
  const pathname = usePathname();
  const brandName = normalizeBrandLabel(initialBrandName || decodeSlugToBrand(slug));
  const subtitle = String(initialSubtitle || '').trim();
  const returnHref = safeReturnUrl(initialReturnUrl || null) || '/';
  const user = useAuthStore((state) => state.user);
  const cartItems = useCartStore((state) => state.items);
  const openCart = useCartStore((state) => state.open);

  const [products, setProducts] = useState<ProductResponse[]>([]);
  const [feedMetadata, setFeedMetadata] = useState<Record<string, any>>({});
  const [queryDraft, setQueryDraft] = useState(initialQuery || '');
  const [activeQuery, setActiveQuery] = useState(initialQuery || '');
  const [sort, setSort] = useState<BrandDiscoverySort>('popular');
  const [activeCategory, setActiveCategory] = useState<string | null>(
    normalizeCategoryScopeValue(initialCategory),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(initialQuery));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const cartItemCount = useMemo(
    () => cartItems.reduce((totalCount, item) => totalCount + item.quantity, 0),
    [cartItems],
  );

  const categoryChips = useMemo(
    () => {
      const resolved = resolveCategoryChips(products, feedMetadata);
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
          count: typeof total === 'number' ? total : products.length,
        },
        ...resolved,
      ];
    },
    [activeCategory, feedMetadata, products, total],
  );

  const visibleProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter((product) => inferCategoryLabel(product) === activeCategory);
  }, [activeCategory, products]);

  const brandCampaign = useMemo(() => resolveBrandCampaign(feedMetadata), [feedMetadata]);
  const brandStory = useMemo(() => resolveBrandStory(feedMetadata), [feedMetadata]);
  const historySignature = useMemo(
    () =>
      recentViews
        .map((item) => `${buildRecentViewKey(item)}:${String(item.viewed_at || '')}`)
        .join('|'),
    [recentViews],
  );
  const brandAvatarUrl = String(
    feedMetadata?.brand_avatar_url || feedMetadata?.brand_logo_url || feedMetadata?.brand_image_url || '',
  ).trim();

  useEffect(() => {
    recentViewsRef.current = recentViews;
  }, [recentViews]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 6);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        // keep local browse context only
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
      category: activeCategory,
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
        setFeedMetadata(result.metadata || {});
        setTotal(result.page_info.total);
        setHasMore(Boolean(result.page_info.has_more));
      })
      .catch(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setProducts([]);
        setFeedMetadata({});
        setTotal(0);
        setHasMore(false);
      })
      .finally(() => {
        if (cancelled || requestSeq !== requestSeqRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeQuery, brandName, historySignature, initialSourceMerchantId, initialSourceProductId, sort]);

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
          category: activeCategory,
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
            setFeedMetadata((current) => ({ ...current, ...(result.metadata || {}) }));
            setTotal(result.page_info.total);
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
    page,
    sort,
  ]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-white text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[220px] bg-[radial-gradient(circle_at_top,_rgba(117,146,255,0.14),_rgba(255,255,255,0)_58%),radial-gradient(circle_at_90%_8%,_rgba(216,127,255,0.12),_rgba(255,255,255,0)_34%)]"
      />
      <header
        className={`sticky top-0 z-50 border-b border-[#eee7dd] bg-white/95 backdrop-blur transition-shadow ${
          isScrolled ? 'shadow-sm' : ''
        }`}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-8">
          <a
            href={returnHref}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:text-slate-950"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </a>

          <Link
            href="/"
            className="absolute left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 text-[22px] font-semibold tracking-[-0.02em] text-[#1f2937]"
          >
            <DollarSign className="h-4 w-4 text-[#4f7cff]" strokeWidth={2.4} />
            <span className="text-[20px] font-semibold tracking-[-0.03em]">Pivota</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen((current) => !current);
                setIsFilterOpen(false);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:text-slate-950"
              aria-label={isSearchOpen ? 'Close brand search' : 'Open brand search'}
            >
              {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={openCart}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:text-slate-950"
              aria-label="Open cart"
            >
              <ShoppingBag className="h-4 w-4" />
              {cartItemCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#c16cf3] px-1 text-[9px] font-semibold text-white">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {isSearchOpen ? (
          <div className="border-t border-[#f1ebe3] bg-white px-4 py-3 sm:px-6 lg:px-8">
            <form
              className="mx-auto flex max-w-6xl items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setActiveQuery(queryDraft.trim());
              }}
            >
              <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-[#ece5dd] bg-[#fcfbf9] px-4 shadow-sm">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  ref={searchInputRef}
                  value={queryDraft}
                  onChange={(event) => setQueryDraft(event.target.value)}
                  placeholder={`Search ${brandName} products`}
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#1f2937] px-4 text-sm font-medium text-white transition hover:bg-[#111827]"
              >
                Search
              </button>
            </form>
          </div>
        ) : null}

      </header>

      <main className="relative mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-5"
        >
          <section className="flex items-start justify-between gap-4 px-1 py-1 sm:items-center">
            <div className="min-w-0 space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#98a2b3]">
                Official Brand
              </p>
              <h1 className="text-[2.15rem] font-semibold tracking-[-0.04em] text-[#111827] sm:text-[2.6rem]">
                {brandName || 'Brand'}
              </h1>
              <p className="text-[15px] text-[#667085]">
                {(typeof total === 'number' ? total : products.length) || 0} products across sellers
              </p>
              {subtitle ? <p className="max-w-2xl text-sm text-[#667085]">{subtitle}</p> : null}
              {activeQuery ? (
                <p className="text-sm text-[#667085]">
                  Showing results for <span className="font-medium text-slate-900">“{activeQuery}”</span>
                </p>
              ) : null}
            </div>

            <div className="relative mt-1 h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[#e5e7eb] bg-[#dfe8db] shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:h-20 sm:w-20">
              {brandAvatarUrl ? (
                <Image src={brandAvatarUrl} alt={brandName} fill unoptimized className="object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-[#334155]">
                  {getBrandInitials(brandName)}
                </div>
              )}
            </div>
          </section>

          <section className="sticky top-14 z-40 -mx-4 border-y border-[#f1ebe3] bg-white/96 px-4 py-3 backdrop-blur sm:top-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="mx-auto flex max-w-6xl items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFilterOpen((current) => !current);
                  setIsSearchOpen(false);
                }}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#ece5dd] bg-[#f8f5f1] px-3.5 text-[15px] font-semibold text-[#4b5563] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-[#f4f0ea]"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </button>

              <div className="flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center gap-2 pr-2">
                  {categoryChips.map((chip) => {
                    const selected =
                      chip.scopeValue === activeCategory || (!chip.scopeValue && !activeCategory);
                    return (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={() => setActiveCategory(chip.scopeValue)}
                        className={`inline-flex h-10 items-center gap-1 rounded-full border px-4 text-[15px] font-semibold transition ${
                          selected
                            ? 'border-transparent bg-gradient-to-r from-[#8f57ff] via-[#a35cff] to-[#4f7cff] text-white shadow-[0_10px_24px_rgba(143,87,255,0.28)]'
                            : 'border-[#e8e1d7] bg-white text-[#667085] hover:border-[#d9d1c6]'
                        }`}
                      >
                        <span>{chip.label}</span>
                        {typeof chip.count === 'number' ? (
                          <span className={selected ? 'text-white/78' : 'text-[#98a2b3]'}>
                            {chip.count}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {isFilterOpen ? (
              <div className="mx-auto mt-3 max-w-6xl rounded-[24px] border border-[#ece5dd] bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Sort products
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSort(option.value);
                        setIsFilterOpen(false);
                      }}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                        sort === option.value
                          ? 'bg-[#1f2937] text-white'
                          : 'border border-[#ece5dd] bg-[#fbf9f6] text-slate-700 hover:border-[#ddd3c8]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {brandCampaign ? (
            <section className="overflow-hidden rounded-[22px] bg-gradient-to-r from-[#8f2df2] via-[#c53cd7] to-[#ef5ca8] px-5 py-5 text-white shadow-[0_16px_32px_rgba(197,60,215,0.24)]">
              <div className="relative overflow-hidden rounded-[18px]">
                <div className="pointer-events-none absolute -right-8 -top-3 h-24 w-24 rounded-full bg-white/10" />
                <div className="pointer-events-none absolute right-4 top-6 h-20 w-20 rounded-full bg-white/12" />
                <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    {brandCampaign.eyebrow ? (
                      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/74">
                        {brandCampaign.eyebrow}
                      </p>
                    ) : null}
                    <h2 className="text-[1.55rem] font-semibold leading-7 tracking-[-0.03em]">
                      {brandCampaign.title}
                    </h2>
                    {brandCampaign.subtitle ? (
                      <p className="max-w-2xl text-sm text-white/88">{brandCampaign.subtitle}</p>
                    ) : null}
                  </div>
                  {brandCampaign.ctaLabel ? (
                    <a
                      href={brandCampaign.ctaHref || '#brand-products'}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-white px-4 text-sm font-semibold text-[#8f2df2] transition hover:bg-white/90"
                    >
                      {brandCampaign.ctaLabel}
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {loading ? (
            <section id="brand-products" className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <BrandProductSkeleton key={index} />
                ))}
              </div>
            </section>
          ) : products.length === 0 ? (
            <section className="rounded-[24px] border border-dashed border-[#ddd3c8] bg-white px-6 py-10 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">No products found for {brandName}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {activeQuery
                  ? 'Try a different keyword within this brand.'
                  : 'This brand does not have matching catalog items yet.'}
              </p>
            </section>
          ) : visibleProducts.length === 0 ? (
            <section className="rounded-[24px] border border-dashed border-[#ddd3c8] bg-white px-6 py-10 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                No {categoryChips.find((chip) => chip.scopeValue === activeCategory)?.label?.toLowerCase() || 'matching'} picks yet
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Try another category or remove the active brand filter to see more products.
              </p>
            </section>
          ) : (
            <section id="brand-products" className="space-y-5">
              <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-3 xl:grid-cols-4">
                {visibleProducts.map((product) => (
                  <BrandProductCard key={buildProductKey(product)} product={product} />
                ))}
              </div>

              <div
                ref={loadMoreRef}
                className="flex h-10 items-center justify-center text-sm text-slate-500"
              >
                {isLoadingMore
                  ? 'Loading more products...'
                  : hasMore
                    ? 'Scroll for more'
                    : 'End of brand catalog'}
              </div>
            </section>
          )}

          {brandStory ? (
            <section className="rounded-[24px] border border-[#efe7dc] bg-white px-5 py-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#98a2b3]">
                {brandStory.title || 'Brand story'}
              </p>
              <blockquote className="mt-3 text-lg leading-8 text-[#111827] sm:text-xl">
                “{brandStory.quote}”
              </blockquote>
              {brandStory.author ? (
                <p className="mt-3 text-sm font-medium text-[#667085]">{brandStory.author}</p>
              ) : null}
            </section>
          ) : null}

          <footer className="flex flex-col gap-3 border-t border-[#eee7dd] pt-6 text-sm text-[#667085] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href={`/brands/${encodeURIComponent(slug)}?name=${encodeURIComponent(brandName)}`}
                className="font-medium text-slate-700 transition hover:text-slate-950"
              >
                Brand Home
              </Link>
              <a
                href="mailto:support@pivota.cc?subject=Brand%20Page%20Support"
                className="font-medium text-slate-700 transition hover:text-slate-950"
              >
                Contact Support
              </a>
            </div>
            <p>Mobile-first browsing, tuned for faster product discovery.</p>
          </footer>
        </motion.section>
      </main>
    </div>
  );
}
