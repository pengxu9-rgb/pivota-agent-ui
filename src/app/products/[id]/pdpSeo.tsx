import type { Metadata } from 'next';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { Module, Offer, PDPPayload } from '@/features/pdp/types';

const DEFAULT_PUBLIC_BASE_URL = 'https://agent.pivota.cc';
const DEFAULT_GATEWAY_BASE_URL = 'https://pivota-agent-production.up.railway.app';
const SEO_FETCH_TIMEOUT_MS = 6000;
const SITEMAP_FETCH_TIMEOUT_MS = 750;
const SEO_INCLUDE_MODULES = [
  'offers',
  'variant_selector',
  'product_intel',
  'active_ingredients',
  'ingredients_inci',
  'product_overview',
  'supplemental_details',
  'similar',
];
const DEFAULT_EXTERNAL_SEED_ALIASES: Record<string, string> = {
  ext_d7c74bcb380cbc2bdd5d5d90: 'sig_7ad40676c42fb9c96e2a8136',
};
const DEFAULT_INDEXABLE_PRODUCT_ENTITY_IDS = ['sig_7ad40676c42fb9c96e2a8136'];
const DEFAULT_PRODUCT_ENTITY_SOURCE_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_EXTERNAL_SEED_ALIASES).map(([externalSeedId, productEntityId]) => [
    productEntityId,
    externalSeedId,
  ]),
);

export type PivotaProductSeoData = {
  productId: string;
  productEntityId: string;
  canonicalProductSlug?: string;
  externalSeedIds: string[];
  name: string;
  brand: string;
  sku?: string;
  variant?: string;
  category?: string;
  overview?: string;
  intelligenceSummary?: string;
  keyBenefits: string[];
  useCases: string[];
  activeIngredients: string[];
  texture?: string;
  finish?: string;
  skinType?: string;
  differentiators: string[];
  claimEvidence?: string;
  image?: string;
  canonicalUrl: string;
  sourceReferences: Array<{
    sourceType: 'external_seed' | 'official_merchant_pdp' | 'merchant_catalog' | 'manual_mapping';
    sourceId?: string;
    sourceUrl?: string;
    merchantName?: string;
    verifiedAt?: string;
    confidence?: string;
    mapsToProductEntityId?: string;
  }>;
  merchantSource?: {
    merchantName?: string;
    sourceUrl?: string;
    sourceType: 'official_merchant_pdp';
    verifiedAt?: string;
    confidence?: string;
  };
  offers: Array<{
    offerId?: string;
    merchantName?: string;
    sourceUrl?: string;
    price?: number;
    currency?: string;
    availability?: string;
  }>;
  similarHighlights: string[];
  source: 'gateway';
};

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function uniqueStrings(values: unknown[], limit = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = readString(value).replace(/\s+/g, ' ');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function isExternalSeedId(value: unknown): boolean {
  return /^ext_[a-z0-9_]+$/i.test(readString(value));
}

function stripHtml(value: unknown): string {
  return readString(value)
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function publicBaseUrl() {
  const configured =
    process.env.NEXT_PUBLIC_PIVOTA_AGENT_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.PIVOTA_AGENT_PUBLIC_BASE_URL ||
    DEFAULT_PUBLIC_BASE_URL;
  return String(configured || DEFAULT_PUBLIC_BASE_URL).replace(/\/+$/, '');
}

export function canonicalPivotaProductUrl(productId: string) {
  return `${publicBaseUrl()}/products/${encodeURIComponent(String(productId || '').trim())}`;
}

function normalizeSitemapProductEntityId(value: unknown): string {
  const id = readString(value);
  if (!id) return '';
  if (DEFAULT_EXTERNAL_SEED_ALIASES[id]) return DEFAULT_EXTERNAL_SEED_ALIASES[id];
  return isExternalSeedId(id) ? '' : id;
}

export function canonicalPivotaProductEntityUrl(input: {
  productEntityId?: string;
  canonicalProductSlug?: string;
}) {
  const id = readString(input.canonicalProductSlug, input.productEntityId);
  return canonicalPivotaProductUrl(id);
}

function canonicalProductPathId(input: {
  routeProductId: string;
  payload?: PDPPayload;
  canonicalProductSlug?: string;
}) {
  const product = input.payload?.product;
  return readString(
    input.canonicalProductSlug,
    input.payload?.product_group_id,
    input.payload?.sellable_item_group_id,
    (product as any)?.product_group_id,
    (product as any)?.sellable_item_group_id,
    !isExternalSeedId(product?.product_id) ? product?.product_id : '',
    DEFAULT_EXTERNAL_SEED_ALIASES[input.routeProductId],
    !isExternalSeedId(input.routeProductId) ? input.routeProductId : '',
    input.routeProductId,
  );
}

function externalSeedIdsForProduct(routeProductId: string, payload?: PDPPayload) {
  const product = payload?.product;
  const refs = [
    routeProductId,
    product?.product_id,
    (product as any)?.external_seed_id,
    (product as any)?.seed_id,
    payload?.canonical_product_ref?.product_id,
    payload?.canonical_payload_product_ref?.product_id,
  ];
  return uniqueStrings(refs.filter(isExternalSeedId), 12);
}

function seoLookupProductIds(routeProductId: string) {
  return uniqueStrings([routeProductId, DEFAULT_PRODUCT_ENTITY_SOURCE_ALIASES[routeProductId]], 2);
}

function gatewayInvokeUrl() {
  const explicit = readString(process.env.PIVOTA_AGENT_SEO_GATEWAY_URL);
  if (explicit) return explicit;

  const base = readString(
    process.env.SHOP_UPSTREAM_API_URL,
    process.env.SHOP_GATEWAY_UPSTREAM_BASE_URL,
    process.env.SHOP_GATEWAY_AGENT_BASE_URL,
    process.env.NEXT_PUBLIC_AGENT_DIRECT_API_URL,
    process.env.NEXT_PUBLIC_AGENT_API_URL,
    DEFAULT_GATEWAY_BASE_URL,
  ).replace(/\/+$/, '');

  if (/\/agent\/shop\/v1\/invoke$/i.test(base)) return base;
  if (/\/api\/gateway$/i.test(base)) return base;
  return `${base}/agent/shop/v1/invoke`;
}

async function fetchPdpV2ForSeo(productId: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEO_FETCH_TIMEOUT_MS);
  try {
    const apiKey = readString(
      process.env.AGENT_API_KEY,
      process.env.SHOP_GATEWAY_AGENT_API_KEY,
      process.env.PIVOTA_API_KEY,
      process.env.NEXT_PUBLIC_AGENT_API_KEY,
    );
    const response = await fetch(gatewayInvokeUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey
          ? {
              'X-API-Key': apiKey,
              Authorization: `Bearer ${apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify({
        operation: 'get_pdp_v2',
        payload: {
          product_ref: {
            product_id: productId,
          },
          include: SEO_INCLUDE_MODULES,
          capabilities: {
            client: 'public_pdp_seo',
            client_version: process.env.NEXT_PUBLIC_APP_VERSION || null,
          },
        },
        metadata: {
          entry: 'pdp',
          source: 'public_pdp_seo',
          scope: {
            catalog: 'global',
          },
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findModule(payload: PDPPayload | null, type: string): Module | null {
  return payload?.modules.find((module) => module.type === type) || null;
}

function collectText(value: unknown, limit = 12): string[] {
  const out: string[] = [];
  const visit = (item: unknown) => {
    if (out.length >= limit || item == null) return;
    if (typeof item === 'string' || typeof item === 'number') {
      const text = stripHtml(item);
      if (text && text.length > 2) out.push(text);
      return;
    }
    if (Array.isArray(item)) {
      item.slice(0, 12).forEach(visit);
      return;
    }
    if (isRecord(item)) {
      for (const key of [
        'headline',
        'title',
        'label',
        'body',
        'summary',
        'description',
        'text',
        'value',
        'name',
      ]) {
        visit(item[key]);
      }
    }
  };
  visit(value);
  return uniqueStrings(out, limit);
}

function detailSectionText(module: Module | null) {
  if (!module || !isRecord(module.data)) return [];
  const sections = Array.isArray(module.data.sections) ? module.data.sections : [];
  return uniqueStrings(
    sections.flatMap((section) => [
      section?.title,
      section?.body,
      ...(Array.isArray(section?.items)
        ? section.items.flatMap((item: any) => [item?.label, item?.value, item?.body])
        : []),
    ]),
    8,
  );
}

function readPriceAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && Number.isFinite(Number(value))) return Number(value);
  if (isRecord(value)) {
    return readPriceAmount(value.amount ?? value.current?.amount ?? value.value);
  }
  return undefined;
}

function readPriceCurrency(value: unknown): string {
  if (isRecord(value)) {
    return readString(value.currency, value.current?.currency, value.priceCurrency);
  }
  return '';
}

function offerSourceUrl(offer: Offer | undefined): string {
  if (!offer) return '';
  return readString(
    offer.source_url,
    offer.product_url,
    offer.canonical_url,
    offer.purchase_url,
    offer.merchant_checkout_url,
    offer.checkout_url,
    offer.external_redirect_url,
    offer.affiliate_url,
    offer.url,
    offer.action?.url,
    offer.action?.href,
    offer.action?.redirect_url,
  );
}

function productSourceUrl(product: PDPPayload['product']): string {
  return readString(
    product.source_url,
    product.canonical_url,
    product.destination_url,
    product.product_id && product.merchant_id ? '' : '',
    product.external_redirect_url,
    product.affiliate_url,
    product.url,
  );
}

function seoDataFromPayload(productId: string, payload: PDPPayload): PivotaProductSeoData {
  const product = payload.product;
  const firstVariant = product.variants?.[0];
  const offers = Array.isArray(payload.offers) ? payload.offers : [];
  const firstOffer = offers[0];
  const productIntel = findModule(payload, 'product_intel');
  const overview = detailSectionText(findModule(payload, 'product_overview'));
  const supplemental = detailSectionText(findModule(payload, 'supplemental_details'));
  const activeIngredients = detailSectionText(findModule(payload, 'active_ingredients'));
  const ingredientsInci = detailSectionText(findModule(payload, 'ingredients_inci'));
  const productIntelText = collectText(productIntel?.data, 10);
  const similar = findModule(payload, 'recommendations') || findModule(payload, 'similar');
  const similarHighlights = collectText(similar?.data, 5);
  const category = product.category_path?.join(' > ') || product.department || product.tags?.[0] || 'Product';
  const overviewText =
    stripHtml(product.description) ||
    overview.join(' ') ||
    supplemental.join(' ') ||
    productIntelText[0];
  const sourceUrl = productSourceUrl(product) || offerSourceUrl(firstOffer);
  const merchantName = readString(firstOffer?.merchant_name, product.merchant_id);
  const productEntityId = canonicalProductPathId({ routeProductId: productId, payload });
  const canonicalUrl = canonicalPivotaProductEntityUrl({ productEntityId });
  const externalSeedIds = externalSeedIdsForProduct(productId, payload);
  const sourceReferences: PivotaProductSeoData['sourceReferences'] = [
    ...externalSeedIds.map((sourceId) => ({
      sourceType: 'external_seed' as const,
      sourceId,
      mapsToProductEntityId: productEntityId,
      confidence: 'source_alias',
    })),
    ...(sourceUrl
      ? [
          {
            sourceType: 'official_merchant_pdp' as const,
            sourceUrl,
            merchantName,
            mapsToProductEntityId: productEntityId,
            confidence: 'verified_source_reference',
          },
        ]
      : []),
  ];

  return {
    productId,
    productEntityId,
    externalSeedIds,
    name: product.title,
    brand: readString(product.brand?.name, product.merchant_id, merchantName),
    sku: readString(firstVariant?.sku_id),
    variant: readString(firstVariant?.title),
    category,
    overview: overviewText,
    intelligenceSummary:
      productIntelText.join(' ') ||
      overview.join(' '),
    keyBenefits: uniqueStrings([
      ...(product.beauty_meta?.best_for || []),
      ...productIntelText.slice(0, 3),
    ], 5),
    useCases: uniqueStrings([
      ...(product.beauty_meta?.popular_looks || []),
      ...overview,
    ], 5),
    activeIngredients: uniqueStrings([...activeIngredients, ...ingredientsInci], 8),
    texture: readString((productIntel?.data as any)?.texture_finish?.texture),
    finish: readString((productIntel?.data as any)?.texture_finish?.finish),
    skinType: readString((productIntel?.data as any)?.best_for?.[0]?.label),
    differentiators: uniqueStrings(productIntelText, 5),
    claimEvidence: readString((productIntel?.data as any)?.evidence_profile),
    image: product.image_url,
    canonicalUrl,
    sourceReferences,
    merchantSource: sourceUrl
      ? {
          merchantName,
          sourceUrl,
          sourceType: 'official_merchant_pdp',
          confidence: 'verified_source_reference',
        }
      : undefined,
    offers: offers.map((offer) => {
      const amount = readPriceAmount(offer.price);
      const currency = readPriceCurrency(offer.price);
      const inStock =
        offer.inventory?.in_stock === true
          ? 'https://schema.org/InStock'
          : offer.inventory?.in_stock === false
            ? 'https://schema.org/OutOfStock'
            : undefined;
      return {
        offerId: offer.offer_id,
        merchantName: readString(offer.merchant_name, offer.merchant_id),
        sourceUrl: offerSourceUrl(offer) || sourceUrl,
        price: amount,
        currency,
        availability: inStock,
      };
    }),
    similarHighlights,
    source: 'gateway',
  };
}

export async function getPivotaProductSeoData(productId: string): Promise<PivotaProductSeoData | null> {
  for (const lookupProductId of seoLookupProductIds(productId)) {
    const raw = await fetchPdpV2ForSeo(lookupProductId);
    if (!raw) continue;
    const payload = mapPdpV2ToPdpPayload(raw);
    if (payload?.product?.title) return seoDataFromPayload(productId, payload);
  }
  return null;
}

export function buildProductMetaDescription(data: PivotaProductSeoData) {
  return data.overview ? data.overview.slice(0, 220) : undefined;
}

export function buildPivotaProductMetadata(data: PivotaProductSeoData | null): Metadata {
  if (!data) {
    return {
      title: 'Pivota Shopping AI',
      description: 'Pivota product page.',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const description = buildProductMetaDescription(data);
  return {
    title: `${data.name} | Pivota`,
    ...(description ? { description } : {}),
    alternates: {
      canonical: data.canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: `${data.name} | Pivota`,
      url: data.canonicalUrl,
      type: 'website',
      ...(description ? { description } : {}),
      ...(data.image ? { images: [{ url: data.image }] } : {}),
    },
  };
}

export function buildProductJsonLd(data: PivotaProductSeoData | null) {
  if (!data || data.source !== 'gateway') return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    ...(data.brand
      ? {
          brand: {
            '@type': 'Brand',
            name: data.brand,
          },
        }
      : {}),
    ...(data.sku ? { sku: data.sku } : {}),
    url: data.canonicalUrl,
    ...(data.overview ? { description: data.overview } : {}),
    ...(data.category ? { category: data.category } : {}),
    ...(data.image ? { image: data.image } : {}),
  };
}

export function buildOfferJsonLd(data: PivotaProductSeoData | null) {
  if (!data || data.source !== 'gateway') return null;
  const offers = data.offers.filter((offer) => offer.merchantName || offer.sourceUrl);
  if (!offers.length) return null;
  if (offers.length === 1) {
    const offer = offers[0];
    return {
      '@context': 'https://schema.org',
      '@type': 'Offer',
      identifier: offer.offerId,
      url: offer.sourceUrl || data.canonicalUrl,
      ...(offer.availability ? { availability: offer.availability } : {}),
      ...(offer.merchantName || data.merchantSource?.merchantName
        ? {
            seller: {
              '@type': 'Organization',
              name: offer.merchantName || data.merchantSource?.merchantName,
            },
          }
        : {}),
      ...(offer.price != null ? { price: offer.price } : {}),
      ...(offer.currency ? { priceCurrency: offer.currency } : {}),
    };
  }

  const pricedOffers = offers.filter((offer) => offer.price != null);
  return {
    '@context': 'https://schema.org',
    '@type': 'AggregateOffer',
    url: data.canonicalUrl,
    offerCount: offers.length,
    ...(data.merchantSource?.merchantName || offers[0]?.merchantName
      ? {
          seller: {
            '@type': 'Organization',
            name: data.merchantSource?.merchantName || offers[0]?.merchantName,
          },
        }
      : {}),
    offers: offers.map((offer) => ({
      '@type': 'Offer',
      identifier: offer.offerId,
      url: offer.sourceUrl || data.canonicalUrl,
      ...(offer.availability ? { availability: offer.availability } : {}),
      ...(offer.merchantName
        ? {
            seller: {
              '@type': 'Organization',
              name: offer.merchantName,
            },
          }
        : {}),
      ...(offer.price != null ? { price: offer.price } : {}),
      ...(offer.currency ? { priceCurrency: offer.currency } : {}),
    })),
    ...(pricedOffers.length
      ? {
          lowPrice: Math.min(...pricedOffers.map((offer) => Number(offer.price))),
          highPrice: Math.max(...pricedOffers.map((offer) => Number(offer.price))),
          priceCurrency: pricedOffers[0]?.currency,
        }
      : {}),
  };
}

export function JsonLdScript({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown> | null;
}) {
  if (!data) return null;
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function PivotaProductSeoSummary({ data }: { data: PivotaProductSeoData | null }) {
  if (!data || data.source !== 'gateway') return null;

  return (
    <div
      data-pivota-public-product-summary
      aria-hidden="true"
      className="pointer-events-none absolute h-px w-px overflow-hidden whitespace-nowrap border-0 p-0"
      style={{
        clip: 'rect(0 0 0 0)',
        clipPath: 'inset(50%)',
        margin: -1,
      }}
    >
      <span data-pivota-product-name>{data.name}</span>
      {data.brand ? <span data-pivota-product-brand>{data.brand}</span> : null}
      <span data-pivota-product-entity-id>{data.productEntityId}</span>
      {data.category ? <span data-pivota-product-category>{data.category}</span> : null}
      {data.overview ? <span data-pivota-product-overview>{data.overview}</span> : null}
      {data.intelligenceSummary ? (
        <span data-pivota-product-intelligence>{data.intelligenceSummary}</span>
      ) : null}
      <span data-pivota-product-benefits>{data.keyBenefits.join(', ')}</span>
      <span data-pivota-product-use-cases>{data.useCases.join(', ')}</span>
      <span data-pivota-product-active-components>{data.activeIngredients.join(', ')}</span>
      <span data-pivota-product-texture-finish>
        {[data.texture, data.finish].filter(Boolean).join(' / ')}
      </span>
      <span data-pivota-product-skin-type>{data.skinType || ''}</span>
      <span data-pivota-product-differentiators>{data.differentiators.join(', ')}</span>
      {data.externalSeedIds.length ? (
        <span data-pivota-external-seed-aliases>{data.externalSeedIds.join(', ')}</span>
      ) : null}

      {data.sourceReferences.length ? (
        <script
          type="application/json"
          data-pivota-product-source-references
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              data.sourceReferences.map((source) => ({
                source_type: source.sourceType,
                source_id: source.sourceId,
                source_url: source.sourceUrl,
                source_merchant_name: source.merchantName,
                source_verified_at: source.verifiedAt,
                source_confidence: source.confidence,
                maps_to_product_entity_id: source.mapsToProductEntityId,
              })),
            ),
          }}
        />
      ) : null}

      {data.offers.length ? (
        <span data-pivota-offer-summary>
          {data.offers
            .slice(0, 3)
            .map((offer) =>
              [
                offer.offerId,
                offer.merchantName || '',
                offer.price != null && offer.currency ? `${offer.currency} ${offer.price}` : '',
                offer.sourceUrl || '',
              ]
                .filter(Boolean)
                .join(' | '),
            )
            .join(' ; ')}
        </span>
      ) : null}

      <span data-pivota-similar-highlight>{data.similarHighlights.join(' ')}</span>
    </div>
  );
}

export async function getIndexableProductSitemapUrls(limit = 200): Promise<string[]> {
  const configured = readString(
    process.env.PIVOTA_SITEMAP_PRODUCT_IDS,
    process.env.NEXT_PUBLIC_PIVOTA_SITEMAP_PRODUCT_IDS,
  )
    .split(',')
    .map(normalizeSitemapProductEntityId)
    .filter(Boolean);

  const defaults = DEFAULT_INDEXABLE_PRODUCT_ENTITY_IDS.map(normalizeSitemapProductEntityId).filter(
    Boolean,
  );
  const discovered =
    process.env.PIVOTA_SITEMAP_DYNAMIC_PRODUCTS_ENABLED === 'true'
      ? (await fetchProductIdsForSitemap(limit)).map(normalizeSitemapProductEntityId).filter(Boolean)
      : [];

  return uniqueStrings([...configured, ...defaults, ...discovered], limit).map(
    canonicalPivotaProductUrl,
  );
}

async function fetchProductIdsForSitemap(limit: number): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITEMAP_FETCH_TIMEOUT_MS);
  try {
    const apiKey = readString(
      process.env.AGENT_API_KEY,
      process.env.SHOP_GATEWAY_AGENT_API_KEY,
      process.env.PIVOTA_API_KEY,
      process.env.NEXT_PUBLIC_AGENT_API_KEY,
    );
    const response = await fetch(gatewayInvokeUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey
          ? {
              'X-API-Key': apiKey,
              Authorization: `Bearer ${apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify({
        operation: 'get_discovery_feed',
        payload: {
          surface: 'browse_products',
          page: 1,
          limit,
        },
        metadata: {
          entry: 'plp',
          source: 'public_sitemap',
          scope: {
            catalog: 'global',
          },
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = await response.json();
    const products = Array.isArray(json?.products) ? json.products : [];
    return products
      .map((product: unknown) =>
        isRecord(product)
          ? canonicalProductPathId({
              routeProductId: readString(product.product_id, product.id),
              payload: undefined,
              canonicalProductSlug: readString(
                product.canonical_product_slug,
                product.canonicalProductSlug,
                product.product_group_id,
                product.productGroupId,
                product.sellable_item_group_id,
                product.sellableItemGroupId,
                product.product_entity_id,
                product.productEntityId,
              ),
            })
          : ''
      )
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
