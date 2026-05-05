import type { Metadata } from 'next';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { Module, Offer, PDPPayload } from '@/features/pdp/types';

const DEFAULT_PUBLIC_BASE_URL = 'https://agent.pivota.cc';
const DEFAULT_GATEWAY_BASE_URL = 'https://pivota-agent-production.up.railway.app';
const DEFAULT_PRODUCT_ENTITY_INDEX_REGISTRY_URL =
  'https://pivota-merchants-portal-clean.vercel.app/api/agent-center/product-entity-index/public';
const SEO_FETCH_TIMEOUT_MS = 12000;
const SITEMAP_FETCH_TIMEOUT_MS = 750;
const PRODUCT_ENTITY_REGISTRY_FETCH_TIMEOUT_MS = 12000;
const SEO_DATA_CACHE_TTL_MS = 60 * 60 * 1000;
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
  ext_e4ad75bd225e370109c9adc9: 'sig_1bf9aa542630047f9b2f9f28',
  ext_7d1ec8eed3a596dc5b03f435: 'sig_65c65851414613cc2df011ff',
  ext_6421a5db3f2487dd74467ae4: 'sig_5edc907cefce71341747b10b',
  ext_842fba29a0f549a326251957: 'sig_edfe833076a1233453822732',
  ext_d51b678d1ffdff2ae544d053: 'sig_2ecfc6d1c4db7257ab5657e6',
  ext_2b9e46d72a4d44b852a7a314: 'sig_0ccfed641401e390afc8d63d',
  ext_595c852f615409c46226bd25: 'sig_992ce329d6a76c023980e299',
  ext_91754eebe482933314201680: 'sig_259c7d68bfa29d935389abba',
  ext_765470731d733687d200eaa2: 'sig_811f33f384281924b5a0738a',
  ext_431fc8ff6539a0ebf3dad995: 'sig_452a9c8f57c8e0d16200e6b2',
  ext_cd940cb0c891522f2b806d9b: 'sig_84b24b2d59174ea5fbf02d63',
  ext_5d99f9da04f496bb844dcc05: 'sig_800f2a8dbf693323e63b7378',
  ext_a60b4cd8b8316b22fea02e1c: 'sig_3bf3dcd770a6c99c396b57c8',
  ext_f4fdbf6f77685c3a80a4fe96: 'sig_96502b0ca1c750d783af5ade',
  ext_ee9bba934ff7dee557752a93: 'sig_c740a6bd7bce668c5f4f4271',
  ext_adf54c1f4075889a95acf8b5: 'sig_7c81fc301d8d19e6d8871ba1',
  ext_b46bad8dd8605cdd0642ab76: 'sig_69c6e2cd7a8375d30c409f32',
  ext_b5becc2f19292f002368f3c3: 'sig_17bae2f30258e4acce50d1f9',
  ext_b3db87a2f0832cd4815d77c2: 'sig_3e59da719f621d22e833145b',
};
const DEFAULT_PRODUCT_ENTITY_LASTMOD = '2026-05-04T18:00:39Z';
const DEFAULT_PUBLISHED_PRODUCT_ENTITIES = [
  {
    id: 'sig_7ad40676c42fb9c96e2a8136',
    externalSeedId: 'ext_d7c74bcb380cbc2bdd5d5d90',
    productName: 'The Ordinary Multi-Peptide Lash and Brow Serum',
  },
  {
    id: 'sig_5edc907cefce71341747b10b',
    externalSeedId: 'ext_6421a5db3f2487dd74467ae4',
    productName: 'Always an Optimist 4-In-1 Mist',
  },
  {
    id: 'sig_edfe833076a1233453822732',
    externalSeedId: 'ext_842fba29a0f549a326251957',
    productName: 'Vitamin-C Tonic Travel Size',
  },
  {
    id: 'sig_2ecfc6d1c4db7257ab5657e6',
    externalSeedId: 'ext_d51b678d1ffdff2ae544d053',
    productName: 'Rose Tonic Travel Size',
  },
  {
    id: 'sig_0ccfed641401e390afc8d63d',
    externalSeedId: 'ext_2b9e46d72a4d44b852a7a314',
    productName: 'Retinol Tonic Travel Size',
  },
  {
    id: 'sig_992ce329d6a76c023980e299',
    externalSeedId: 'ext_595c852f615409c46226bd25',
    productName: 'Mini Glow Mist',
  },
  {
    id: 'sig_259c7d68bfa29d935389abba',
    externalSeedId: 'ext_91754eebe482933314201680',
    productName: 'Rose Tonic Mini Size',
  },
  {
    id: 'sig_811f33f384281924b5a0738a',
    externalSeedId: 'ext_765470731d733687d200eaa2',
    productName: 'Mini Hydrating Milky Mist',
  },
  {
    id: 'sig_452a9c8f57c8e0d16200e6b2',
    externalSeedId: 'ext_431fc8ff6539a0ebf3dad995',
    productName: 'Glow Tonic Travel Size',
  },
  {
    id: 'sig_84b24b2d59174ea5fbf02d63',
    externalSeedId: 'ext_cd940cb0c891522f2b806d9b',
    productName: 'Milky Tonic Mini Size',
  },
  {
    id: 'sig_800f2a8dbf693323e63b7378',
    externalSeedId: 'ext_5d99f9da04f496bb844dcc05',
    productName: 'Milky Tonic Travel Size',
  },
  {
    id: 'sig_3bf3dcd770a6c99c396b57c8',
    externalSeedId: 'ext_a60b4cd8b8316b22fea02e1c',
    productName: 'Glow Tonic Mini Size',
  },
  {
    id: 'sig_96502b0ca1c750d783af5ade',
    externalSeedId: 'ext_f4fdbf6f77685c3a80a4fe96',
    productName: 'Botanical Collagen Tonic Travel Size',
  },
] as const;
const DEFAULT_PRODUCT_ENTITY_SOURCE_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_EXTERNAL_SEED_ALIASES).map(([externalSeedId, productEntityId]) => [
    productEntityId,
    externalSeedId,
  ]),
);
const seoDataCache = new Map<
  string,
  { expiresAt: number; promise: Promise<PivotaProductSeoData | null> }
>();

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

export type ProductEntitySitemapEntry = {
  id: string;
  canonicalUrl: string;
  productName?: string;
  hasPdpContent: boolean;
  isIndexable: boolean;
  updatedAt?: string;
  sourceProductId?: string;
};

type ProductEntityIndexRegistryRecord = {
  id?: string;
  product_entity_id?: string;
  canonicalUrl?: string;
  canonical_url?: string;
  productName?: string;
  product_name?: string;
  brand?: string;
  category?: string;
  updatedAt?: string;
  source_updated_at?: string;
  updated_at?: string;
  externalSeedId?: string;
  external_seed_id?: string;
};

type ProductEntityRegistryLookupInput = {
  productEntityId?: string;
  externalSeedId?: string;
  limit?: number;
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

export function canonicalProductEntityIdForRoute(productId: string) {
  const id = readString(productId);
  return DEFAULT_EXTERNAL_SEED_ALIASES[id] || id;
}

export async function canonicalProductEntityIdForRouteAsync(productId: string) {
  const id = readString(productId);
  const staticCanonicalId = canonicalProductEntityIdForRoute(id);
  if (staticCanonicalId !== id || !isExternalSeedId(id)) return staticCanonicalId;
  const registryEntries = await fetchProductEntitiesFromRegistry(5000);
  const match = registryEntries.find((entry) => entry.sourceProductId === id);
  if (match?.id) return match.id;
  const resolverEntries = await fetchProductEntityResolverEntries({
    externalSeedId: id,
    limit: 5,
  });
  return resolverEntries[0]?.id || id;
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

async function seoLookupProductIdsAsync(routeProductId: string) {
  const ids = seoLookupProductIds(routeProductId);
  if (ids.length > 1 || isExternalSeedId(routeProductId)) return ids;
  const registryEntries = await fetchProductEntitiesFromRegistry(5000);
  const match = registryEntries.find((entry) => entry.id === routeProductId);
  if (match?.sourceProductId) {
    return uniqueStrings([routeProductId, match.sourceProductId], 2);
  }
  const resolverEntries = await fetchProductEntityResolverEntries({
    productEntityId: routeProductId,
    limit: 5,
  });
  const resolverMatch = resolverEntries.find((entry) => entry.id === routeProductId);
  return uniqueStrings([routeProductId, resolverMatch?.sourceProductId], 2);
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
      cache: 'force-cache',
      next: { revalidate: 3600 },
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

async function getPivotaProductSeoDataUncached(
  productId: string,
): Promise<PivotaProductSeoData | null> {
  for (const lookupProductId of await seoLookupProductIdsAsync(productId)) {
    const raw = await fetchPdpV2ForSeo(lookupProductId);
    if (!raw) continue;
    const payload = mapPdpV2ToPdpPayload(raw);
    if (payload?.product?.title) return seoDataFromPayload(productId, payload);
  }
  return null;
}

export async function getPivotaProductSeoData(
  productId: string,
): Promise<PivotaProductSeoData | null> {
  const key = readString(productId);
  if (!key) return null;
  const now = Date.now();
  const cached = seoDataCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = getPivotaProductSeoDataUncached(key).then(
    (data) => {
      if (!data) seoDataCache.delete(key);
      return data;
    },
    (error) => {
      seoDataCache.delete(key);
      throw error;
    },
  );
  seoDataCache.set(key, {
    expiresAt: now + SEO_DATA_CACHE_TTL_MS,
    promise,
  });
  return promise;
}

export function buildProductMetaDescription(data: PivotaProductSeoData) {
  return data.overview ? data.overview.slice(0, 220) : undefined;
}

function displayProductName(data: PivotaProductSeoData) {
  const name = readString(data.name);
  const brand = readString(data.brand);
  if (!brand) return name;
  return name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
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
  const title = displayProductName(data);
  return {
    title: `${title} | Pivota`,
    ...(description ? { description } : {}),
    alternates: {
      canonical: data.canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: `${title} | Pivota`,
      url: data.canonicalUrl,
      type: 'website',
      ...(description ? { description } : {}),
      ...(data.image ? { images: [{ url: data.image }] } : {}),
    },
  };
}

export function buildProductJsonLd(data: PivotaProductSeoData | null) {
  if (!data || data.source !== 'gateway') return null;
  const offerJsonLd = buildOfferJsonLd(data);
  const productOfferJsonLd =
    offerJsonLd && typeof offerJsonLd === 'object'
      ? Object.fromEntries(
          Object.entries(offerJsonLd).filter(([key]) => key !== '@context'),
        )
      : null;

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
    ...(productOfferJsonLd ? { offers: productOfferJsonLd } : {}),
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
  const payload = {
    product_entity_id: data.productEntityId,
    canonical_url: data.canonicalUrl,
    product_name: displayProductName(data),
    brand: data.brand || undefined,
    sku: data.sku,
    variant: data.variant,
    category: data.category,
    overview: data.overview,
    product_intelligence_summary: data.intelligenceSummary,
    key_benefits: data.keyBenefits,
    use_cases: data.useCases,
    active_ingredients: data.activeIngredients,
    texture: data.texture,
    finish: data.finish,
    skin_type: data.skinType,
    differentiators: data.differentiators,
    external_seed_ids: data.externalSeedIds,
    source_references: data.sourceReferences.map((source) => ({
      source_type: source.sourceType,
      source_id: source.sourceId,
      source_url: source.sourceUrl,
      source_merchant_name: source.merchantName,
      source_verified_at: source.verifiedAt,
      source_confidence: source.confidence,
      maps_to_product_entity_id: source.mapsToProductEntityId,
    })),
    offers: data.offers.slice(0, 10).map((offer) => ({
      offer_id: offer.offerId,
      merchant_name: offer.merchantName,
      source_url: offer.sourceUrl,
      price: offer.price,
      currency: offer.currency,
      availability: offer.availability,
    })),
    similar_highlights: data.similarHighlights,
  };

  return (
    <script
      type="application/json"
      data-pivota-product-seo-signals
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload) }}
    />
  );
}

export async function getIndexableProductSitemapUrls(limit = 200): Promise<string[]> {
  const entries = await getProductEntitySitemapEntries(limit);
  return entries.map((entry) => entry.canonicalUrl);
}

export async function getProductEntitySitemapEntries(
  limit = 200,
): Promise<ProductEntitySitemapEntry[]> {
  const configured = readString(
    process.env.PIVOTA_SITEMAP_PRODUCT_IDS,
    process.env.NEXT_PUBLIC_PIVOTA_SITEMAP_PRODUCT_IDS,
  )
    .split(',')
    .map(normalizeSitemapProductEntityId)
    .filter(Boolean);

  const configuredEntries = configured.map((id) =>
    productEntitySitemapEntry({
      id,
      hasPdpContent: true,
      isIndexable: true,
      updatedAt: DEFAULT_PRODUCT_ENTITY_LASTMOD,
    }),
  );
  const registryEntries = await fetchProductEntitiesFromRegistry(limit);
  const staticAllowlistEntries =
    process.env.PIVOTA_SITEMAP_STATIC_ALLOWLIST_ENABLED === 'true'
      ? DEFAULT_PUBLISHED_PRODUCT_ENTITIES.map((product) =>
          productEntitySitemapEntry({
            id: product.id,
            productName: product.productName,
            sourceProductId: product.externalSeedId,
            hasPdpContent: true,
            isIndexable: true,
            updatedAt: DEFAULT_PRODUCT_ENTITY_LASTMOD,
          }),
        )
      : [];

  return uniqueProductEntityEntries(
    [...configuredEntries, ...registryEntries, ...staticAllowlistEntries],
    limit,
  );
}

function productEntityResolverEntryFromRegistryRecord(
  record: ProductEntityIndexRegistryRecord,
): ProductEntitySitemapEntry | null {
  const id = normalizeSitemapProductEntityId(readString(record.product_entity_id, record.id));
  if (!id || !/^sig_[a-z0-9]+$/i.test(id)) return null;
  const canonicalUrl = readString(record.canonical_url, record.canonicalUrl) || canonicalPivotaProductUrl(id);
  if (!/^https:\/\/agent\.pivota\.cc\/products\/sig_[a-z0-9]+$/i.test(canonicalUrl)) return null;
  if (canonicalUrl.includes('/products/ext_') || canonicalUrl.includes('?')) return null;
  return {
    id,
    canonicalUrl,
    productName: readString(record.product_name, record.productName),
    hasPdpContent: true,
    isIndexable: false,
    updatedAt: readString(record.updated_at, record.updatedAt, record.source_updated_at) || DEFAULT_PRODUCT_ENTITY_LASTMOD,
    sourceProductId: readString(record.external_seed_id, record.externalSeedId),
  };
}

function productEntitySitemapEntry(input: {
  id: string;
  productName?: string;
  hasPdpContent: boolean;
  isIndexable: boolean;
  updatedAt?: string;
  canonicalUrl?: string;
  sourceProductId?: string;
}): ProductEntitySitemapEntry | null {
  const id = normalizeSitemapProductEntityId(input.id);
  if (!id || !/^sig_[a-z0-9]+$/i.test(id)) return null;
  const canonicalUrl = readString(input.canonicalUrl) || canonicalPivotaProductUrl(id);
  if (!/^https:\/\/agent\.pivota\.cc\/products\/sig_[a-z0-9]+$/i.test(canonicalUrl)) return null;
  if (canonicalUrl.includes('/products/ext_') || canonicalUrl.includes('?')) return null;
  if (!input.hasPdpContent || !input.isIndexable) return null;
  return {
    id,
    canonicalUrl,
    productName: input.productName,
    hasPdpContent: true,
    isIndexable: true,
    updatedAt: input.updatedAt || DEFAULT_PRODUCT_ENTITY_LASTMOD,
    sourceProductId: input.sourceProductId,
  };
}

function uniqueProductEntityEntries(
  entries: Array<ProductEntitySitemapEntry | null>,
  limit: number,
): ProductEntitySitemapEntry[] {
  const seen = new Set<string>();
  const out: ProductEntitySitemapEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function productEntitySitemapEntryFromGatewayProduct(product: Record<string, any>) {
  const id = normalizeSitemapProductEntityId(
    readString(
      product.product_entity_id,
      product.productEntityId,
      product.product_group_id,
      product.productGroupId,
      product.sellable_item_group_id,
      product.sellableItemGroupId,
    ),
  );
  const sourceProductId = readString(product.product_id, product.id);
  const explicitHasPdpContent =
    typeof product.has_pdp_content === 'boolean'
      ? product.has_pdp_content
      : typeof product.hasPdpContent === 'boolean'
        ? product.hasPdpContent
        : Boolean(readString(product.title, product.name, product.description));
  const explicitIndexable =
    typeof product.is_indexable === 'boolean'
      ? product.is_indexable
      : typeof product.isIndexable === 'boolean'
        ? product.isIndexable
        : true;

  return productEntitySitemapEntry({
    id,
    productName: readString(product.title, product.name),
    sourceProductId: isExternalSeedId(sourceProductId) ? sourceProductId : undefined,
    hasPdpContent: explicitHasPdpContent,
    isIndexable: explicitIndexable,
    updatedAt: readString(product.updated_at, product.updatedAt, product.last_modified, product.lastModified),
    canonicalUrl: readString(product.canonical_url, product.canonicalUrl),
  });
}

async function fetchProductEntitiesForSitemap(limit: number): Promise<ProductEntitySitemapEntry[]> {
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
    return uniqueProductEntityEntries(
      products.map((product: unknown) =>
        isRecord(product) ? productEntitySitemapEntryFromGatewayProduct(product) : null,
      ),
      limit,
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

function productEntitySitemapEntryFromRegistryRecord(
  record: ProductEntityIndexRegistryRecord,
) {
  return productEntitySitemapEntry({
    id: readString(record.product_entity_id, record.id),
    productName: readString(record.product_name, record.productName),
    sourceProductId: readString(record.external_seed_id, record.externalSeedId),
    hasPdpContent: true,
    isIndexable: true,
    updatedAt: readString(record.updated_at, record.updatedAt, record.source_updated_at),
    canonicalUrl: readString(record.canonical_url, record.canonicalUrl),
  });
}

function productEntityIndexRegistryUrl(limit: number) {
  const configured = readString(
    process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL,
    process.env.PIVOTA_AGENT_CENTER_PRODUCT_ENTITY_INDEX_URL,
    process.env.NEXT_PUBLIC_PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL,
  );
  const base = configured || DEFAULT_PRODUCT_ENTITY_INDEX_REGISTRY_URL;
  const url = new URL(base);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('shape', 'sitemap');
  return url.toString();
}

function productEntityIndexResolverUrl(input: ProductEntityRegistryLookupInput) {
  const configured = readString(
    process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL,
    process.env.PIVOTA_AGENT_CENTER_PRODUCT_ENTITY_INDEX_URL,
    process.env.NEXT_PUBLIC_PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL,
  );
  const base = configured || DEFAULT_PRODUCT_ENTITY_INDEX_REGISTRY_URL;
  const url = new URL(base);
  url.searchParams.set('limit', String(input.limit || 5));
  url.searchParams.set('shape', 'resolver');
  if (input.productEntityId) url.searchParams.set('product_entity_id', input.productEntityId);
  if (input.externalSeedId) url.searchParams.set('external_seed_id', input.externalSeedId);
  return url.toString();
}

async function fetchProductEntitiesFromRegistry(
  limit: number,
): Promise<ProductEntitySitemapEntry[]> {
  if (process.env.NODE_ENV === 'test' && !process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL) {
    return [];
  }
  if (process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_ENABLED === 'false') return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCT_ENTITY_REGISTRY_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(productEntityIndexRegistryUrl(limit), {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = await response.json();
    const records = Array.isArray(json?.product_entity_sitemap_entries)
      ? json.product_entity_sitemap_entries
      : Array.isArray(json?.product_entity_index_records)
      ? json.product_entity_index_records
      : [];
    return uniqueProductEntityEntries(
      records.map((record: unknown) =>
        isRecord(record)
          ? productEntitySitemapEntryFromRegistryRecord(
              record as ProductEntityIndexRegistryRecord,
            )
          : null,
      ),
      limit,
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchProductEntityResolverEntries(
  input: ProductEntityRegistryLookupInput,
): Promise<ProductEntitySitemapEntry[]> {
  if (process.env.NODE_ENV === 'test' && !process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_URL) {
    return [];
  }
  if (process.env.PIVOTA_PRODUCT_ENTITY_INDEX_REGISTRY_ENABLED === 'false') return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCT_ENTITY_REGISTRY_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(productEntityIndexResolverUrl(input), {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const json = await response.json();
    const records = Array.isArray(json?.product_entity_resolver_records)
      ? json.product_entity_resolver_records
      : [];
    return uniqueProductEntityEntries(
      records.map((record: unknown) =>
        isRecord(record)
          ? productEntityResolverEntryFromRegistryRecord(
              record as ProductEntityIndexRegistryRecord,
            )
          : null,
      ),
      input.limit || 5,
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
