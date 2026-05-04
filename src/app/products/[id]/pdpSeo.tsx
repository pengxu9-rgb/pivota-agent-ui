import type { Metadata } from 'next';
import { mapPdpV2ToPdpPayload } from '@/features/pdp/adapter/mapPdpV2ToPdpPayload';
import type { Module, Offer, PDPPayload } from '@/features/pdp/types';

const DEFAULT_PUBLIC_BASE_URL = 'https://agent.pivota.cc';
const DEFAULT_GATEWAY_BASE_URL = 'https://pivota-agent-production.up.railway.app';
const SEO_FETCH_TIMEOUT_MS = 6000;
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
const DEFAULT_INDEXABLE_PILOT_PRODUCT_IDS = ['ext_d7c74bcb380cbc2bdd5d5d90'];

export type PivotaProductSeoData = {
  productId: string;
  name: string;
  brand: string;
  sku?: string;
  variant?: string;
  category?: string;
  overview: string;
  intelligenceSummary: string;
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
  source: 'gateway' | 'fallback';
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

function buildFallbackSeoData(productId: string): PivotaProductSeoData {
  if (productId === 'ext_d7c74bcb380cbc2bdd5d5d90') {
    return {
      productId,
      name: 'Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml',
      brand: 'Isntree',
      sku: 'isntree_watery_sun_gel_50ml',
      variant: '50ml',
      category: 'Skincare > Sunscreen',
      overview:
        'Agent-facing Pivota product page for Isntree Hyaluronic Acid Watery Sun Gel SPF50+ PA++++ 50ml, a lightweight daily sunscreen with hydrating watery gel texture.',
      intelligenceSummary:
        'Daily hydrating sunscreen positioned for lightweight UV protection, hyaluronic acid hydration, and all-skin-type wear.',
      keyBenefits: ['SPF50+ PA++++ protection', 'hydrating watery gel texture', 'lightweight daily finish'],
      useCases: ['daily sunscreen', 'hydrating UV protection', 'K-beauty sunscreen comparison'],
      activeIngredients: ['hyaluronic acid', 'UV filters'],
      texture: 'watery gel',
      finish: 'lightweight hydrated finish',
      skinType: 'all skin types',
      differentiators: ['hydrating sunscreen texture', 'K-beauty daily SPF positioning'],
      claimEvidence:
        'Fallback pilot SEO data is used only when the live PDP API is unavailable; source references should be replaced by verified upstream PDP data when present.',
      canonicalUrl: canonicalPivotaProductUrl(productId),
      merchantSource: {
        merchantName: 'Isntree Official',
        sourceUrl: 'https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml',
        sourceType: 'official_merchant_pdp',
        confidence: 'pilot_seed',
      },
      offers: [
        {
          offerId: 'offer_isntree_direct_50ml',
          merchantName: 'Isntree Official',
          sourceUrl: 'https://isntree-global.com/products/isntree-hyaluronic-acid-watery-sun-gel-50ml',
          availability: 'https://schema.org/InStock',
        },
      ],
      similarHighlights: [
        'Comparable sunscreen searches may include Beauty of Joseon, COSRX, Laneige, and Anua products.',
      ],
      source: 'fallback',
    };
  }

  return {
    productId,
    name: `Pivota product ${productId}`,
    brand: 'Pivota',
    sku: productId,
    category: 'Product',
    overview:
      'Agent-facing Pivota product page with product identity, source, offer, and readiness signals when upstream product data is available.',
    intelligenceSummary:
      'Pivota product intelligence is generated from verified product and merchant source data when available.',
    keyBenefits: [],
    useCases: [],
    activeIngredients: [],
    differentiators: [],
    canonicalUrl: canonicalPivotaProductUrl(productId),
    offers: [],
    similarHighlights: [],
    source: 'fallback',
  };
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
    productIntelText[0] ||
    `Agent-facing Pivota product page for ${product.title}.`;
  const sourceUrl = productSourceUrl(product) || offerSourceUrl(firstOffer);
  const merchantName = readString(firstOffer?.merchant_name, product.merchant_id);

  return {
    productId,
    name: product.title,
    brand: readString(product.brand?.name, product.merchant_id, merchantName, 'Pivota'),
    sku: readString(firstVariant?.sku_id, product.product_id, productId),
    variant: readString(firstVariant?.title),
    category,
    overview: overviewText,
    intelligenceSummary:
      productIntelText.join(' ') ||
      overview.join(' ') ||
      `Pivota product intelligence summary for ${product.title}.`,
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
    canonicalUrl: canonicalPivotaProductUrl(productId),
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
        offer.inventory?.in_stock === false
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock';
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

export async function getPivotaProductSeoData(productId: string): Promise<PivotaProductSeoData> {
  const fallback = buildFallbackSeoData(productId);
  const raw = await fetchPdpV2ForSeo(productId);
  if (!raw) return fallback;
  const payload = mapPdpV2ToPdpPayload(raw);
  if (!payload?.product?.title) return fallback;
  return seoDataFromPayload(productId, payload);
}

export function buildProductMetaDescription(data: PivotaProductSeoData) {
  return (
    `Agent-facing Pivota product page for ${data.name}, with verified merchant source` +
    ' and offer readiness signals.'
  ).slice(0, 220);
}

export function buildPivotaProductMetadata(data: PivotaProductSeoData): Metadata {
  return {
    title: `${data.name} | Pivota`,
    description: buildProductMetaDescription(data),
    alternates: {
      canonical: data.canonicalUrl,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: `${data.name} | Pivota`,
      description: buildProductMetaDescription(data),
      url: data.canonicalUrl,
      type: 'website',
      ...(data.image ? { images: [{ url: data.image }] } : {}),
    },
  };
}

export function buildProductJsonLd(data: PivotaProductSeoData) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    brand: {
      '@type': 'Brand',
      name: data.brand,
    },
    sku: data.sku || data.productId,
    url: data.canonicalUrl,
    description: data.overview,
    category: data.category,
    ...(data.image ? { image: data.image } : {}),
  };
}

export function buildOfferJsonLd(data: PivotaProductSeoData) {
  const offers = data.offers.filter((offer) => offer.merchantName || offer.sourceUrl);
  if (!offers.length) return null;
  if (offers.length === 1) {
    const offer = offers[0];
    return {
      '@context': 'https://schema.org',
      '@type': 'Offer',
      url: offer.sourceUrl || data.canonicalUrl,
      availability: offer.availability || 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: offer.merchantName || data.merchantSource?.merchantName || 'Pivota merchant',
      },
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
    seller: {
      '@type': 'Organization',
      name: data.merchantSource?.merchantName || offers[0]?.merchantName || 'Pivota merchant',
    },
    offers: offers.map((offer) => ({
      '@type': 'Offer',
      url: offer.sourceUrl || data.canonicalUrl,
      availability: offer.availability || 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: offer.merchantName || 'Pivota merchant',
      },
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

export function PivotaProductSeoSummary({ data }: { data: PivotaProductSeoData }) {
  return (
    <section
      data-pivota-public-product-summary
      className="border-b border-slate-200 bg-white px-4 py-5 text-slate-950"
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pivota verified product page
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
            {data.name}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            {data.overview}
          </p>
        </div>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-slate-500">Brand</dt>
            <dd>{data.brand}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">SKU / variant</dt>
            <dd>{[data.sku, data.variant].filter(Boolean).join(' / ') || data.productId}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Category</dt>
            <dd>{data.category || 'Product'}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Product object ID</dt>
            <dd>{data.productId}</dd>
          </div>
        </dl>

        <div data-pivota-product-intelligence>
          <h2 className="text-base font-semibold">Product intelligence</h2>
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {data.intelligenceSummary}
          </p>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="font-medium text-slate-500">Key benefits</dt>
              <dd>{data.keyBenefits.join(', ') || 'Product benefit signals available when verified.'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Use cases</dt>
              <dd>{data.useCases.join(', ') || 'Use-case mapping available when verified.'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Active components</dt>
              <dd>{data.activeIngredients.join(', ') || 'Ingredient signals available when verified.'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Texture / finish</dt>
              <dd>{[data.texture, data.finish].filter(Boolean).join(' / ') || 'Not specified'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Target customer / skin type</dt>
              <dd>{data.skinType || 'Not specified'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Differentiators</dt>
              <dd>{data.differentiators.join(', ') || 'Differentiation evidence available when verified.'}</dd>
            </div>
          </dl>
        </div>

        {data.merchantSource?.sourceUrl ? (
          <div data-pivota-source-reference>
            <h2 className="text-base font-semibold">Verified merchant source</h2>
            <p className="mt-1 text-sm text-slate-700">
              {data.merchantSource.merchantName || 'Official merchant PDP'} · source type ={' '}
              {data.merchantSource.sourceType} · confidence ={' '}
              {data.merchantSource.confidence || 'verified'}
            </p>
            <a
              className="mt-1 block break-all text-sm text-blue-700 underline"
              href={data.merchantSource.sourceUrl}
            >
              {data.merchantSource.sourceUrl}
            </a>
            <script
              type="application/json"
              data-pivota-source-reference-payload
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  source_url: data.merchantSource.sourceUrl,
                  source_type: data.merchantSource.sourceType,
                  source_merchant_name: data.merchantSource.merchantName,
                  source_verified_at: data.merchantSource.verifiedAt,
                  source_confidence: data.merchantSource.confidence,
                }),
              }}
            />
          </div>
        ) : null}

        {data.offers.length ? (
          <div data-pivota-offer-summary>
            <h2 className="text-base font-semibold">Offer summary</h2>
            <ul className="mt-1 space-y-1 text-sm text-slate-700">
              {data.offers.slice(0, 3).map((offer, index) => (
                <li key={offer.offerId || `${offer.merchantName}-${index}`}>
                  {offer.merchantName || 'Pivota merchant offer'}
                  {offer.price != null && offer.currency
                    ? ` · ${offer.currency} ${offer.price}`
                    : ''}
                  {offer.sourceUrl ? ` · ${offer.sourceUrl}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div data-pivota-similar-highlight>
          <h2 className="text-base font-semibold">Similar / substitute highlight</h2>
          <p className="mt-1 text-sm text-slate-700">
            {data.similarHighlights.join(' ') ||
              'Pivota uses related product and query mapping signals when verified data is available.'}
          </p>
        </div>
      </div>
    </section>
  );
}

export async function getIndexableProductSitemapUrls(limit = 200): Promise<string[]> {
  const configured = readString(
    process.env.PIVOTA_SITEMAP_PRODUCT_IDS,
    process.env.NEXT_PUBLIC_PIVOTA_SITEMAP_PRODUCT_IDS,
  )
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const discovered = await fetchProductIdsForSitemap(limit);
  return uniqueStrings(
    [...configured, ...discovered, ...DEFAULT_INDEXABLE_PILOT_PRODUCT_IDS],
    limit,
  ).map(canonicalPivotaProductUrl);
}

async function fetchProductIdsForSitemap(limit: number): Promise<string[]> {
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
        isRecord(product) ? readString(product.product_id, product.id) : ''
      )
      .filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
