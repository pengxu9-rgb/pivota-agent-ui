/**
 * Schema.org Product JSON-LD builder for Pivota PDP server-render.
 *
 * Why server-side schema matters:
 *   - Google's rich-results parser reads JSON-LD before JavaScript runs.
 *     Client-side hydration of schema is too late to influence search
 *     snippets, "Available from {merchant}" widgets, etc.
 *   - Gemini's grounding pipeline parses both prose AND structured data.
 *     A page with valid Product schema is significantly easier for the
 *     model to extract { name, brand, price, availability } from than
 *     prose-only HTML.
 *   - The Demand Test Agent's positive baseline (PR 18 + PR 19) needs
 *     Gemini to be able to identify our PDP confidently from a search
 *     query. Schema markup is one of the strongest signals for that.
 *
 * The shape produced here is conservative — only fields we can defend
 * with real data. Don't add fake reviews / ratings / inventory; Google
 * penalizes spam-flagged JSON-LD by removing rich snippets sitewide.
 */

import { buildProductDescription } from './productDescription';
import { buildProductHrefForProduct } from '@/lib/productHref';

const SCHEMA_CONTEXT = 'https://schema.org/';
const SCHEMA_TYPE_PRODUCT = 'Product';
const SCHEMA_TYPE_OFFER = 'Offer';
const SCHEMA_TYPE_BRAND = 'Brand';

const PIVOTA_SITE_BASE = 'https://agent.pivota.cc';
const PRODUCT_JSON_LD_DESCRIPTION_MAX_LENGTH = 5000;
// Default locale country for Pivota Product Rich Results. Replace with
// offer-level shipping and return zones when the gateway exposes them.
// US is Pivota's primary market today, so this prevents Google Search
// Console from flagging every Product while preserving per-offer overrides.
const DEFAULT_LOCALE_COUNTRY = 'US';

type ProductJsonLdContext = {
  reviewsModule?: Record<string, any> | null;
  recommendationsModule?: Record<string, any> | null;
};

// Schema.org availability vocabulary the major search engines understand.
const AVAILABILITY_VOCAB: Record<string, string> = {
  in_stock: 'https://schema.org/InStock',
  instock: 'https://schema.org/InStock',
  out_of_stock: 'https://schema.org/OutOfStock',
  outofstock: 'https://schema.org/OutOfStock',
  preorder: 'https://schema.org/PreOrder',
  pre_order: 'https://schema.org/PreOrder',
  backorder: 'https://schema.org/BackOrder',
  back_order: 'https://schema.org/BackOrder',
  discontinued: 'https://schema.org/Discontinued',
};

function _firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function _firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function _firstPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = _firstNumber(value);
    if (n !== null && n > 0) return n;
  }
  return null;
}

function _asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

/**
 * The gateway's get_pdp_v2 response stores price + availability under the
 * default variant (`variants[default_variant_id].price.current.amount`),
 * not at the top-level product. Earlier versions of this builder only
 * read top-level fields and silently dropped the Offer block on every
 * real PDP. This helper resolves the right variant.
 *
 * Order:
 *   1. Variant whose `variant_id` equals `product.default_variant_id`
 *   2. First variant in `variants[]`
 *   3. null
 */
function _resolveDefaultVariant(product: Record<string, any>): Record<string, any> | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) return null;
  const defaultId = typeof product.default_variant_id === 'string'
    ? product.default_variant_id.trim()
    : '';
  if (defaultId) {
    const match = variants.find(
      (v: any) => v && typeof v === 'object' && String(v.variant_id || '') === defaultId,
    );
    if (match && typeof match === 'object') return match;
  }
  const first = variants[0];
  return first && typeof first === 'object' ? first : null;
}

/**
 * Extract a normalized { price, currency, availability } triple from a
 * product. Reads the default variant first, then top-level fields as a
 * fallback for non-variant catalog shapes.
 */
function _resolveOfferFacts(product: Record<string, any>): {
  price: number | null;
  currency: string;
  availability: string | null;
} {
  const variant = _resolveDefaultVariant(product);

  // Variant-style: variants[].price.current.amount + .currency + .availability.in_stock
  const variantPrice = _firstNumber(
    variant?.price?.current?.amount,
    variant?.price?.amount,
    variant?.price_amount,
  );
  const variantCurrency = _firstString(
    variant?.price?.current?.currency,
    variant?.price?.currency,
    variant?.currency,
  );
  const variantAvailability = variant?.availability?.in_stock ?? variant?.in_stock;

  // Top-level fallbacks for non-variant shapes (legacy / external seeds).
  const price = variantPrice ?? _firstNumber(product.price, product.price_amount, product.offer_price);
  const currency = variantCurrency || _firstString(product.currency, product.price_currency, 'USD');
  const availabilityRaw =
    variantAvailability !== undefined
      ? variantAvailability
      : (product.availability ?? product.in_stock ?? product.stock_status);

  return {
    price,
    currency,
    availability: _normalizeAvailability(availabilityRaw),
  };
}

function _readImages(product: Record<string, any>): string[] {
  const out: string[] = [];
  const main = _firstString(product.image_url);
  if (main) out.push(main);
  const arr = Array.isArray(product.image_urls) ? product.image_urls : [];
  for (const u of arr) {
    if (typeof u === 'string' && u.trim() && !out.includes(u.trim())) {
      out.push(u.trim());
    }
  }
  return out;
}

function _normalizeAvailability(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    if (raw === true) return AVAILABILITY_VOCAB.in_stock;
    if (raw === false) return AVAILABILITY_VOCAB.out_of_stock;
    return null;
  }
  const key = raw.trim().toLowerCase().replace(/-/g, '_');
  return AVAILABILITY_VOCAB[key] || null;
}

function _readBrand(product: Record<string, any>): string {
  return _firstString(
    product.brand?.name,
    product.brand_name,
    typeof product.brand === 'string' ? product.brand : '',
    product.vendor,
  );
}

/**
 * Extract a positive price number from a Pivota offer's price field.
 * The gateway's offer.price can be:
 *   - a number (rare; legacy)
 *   - a string (current Path B mirror shape: "95.00")
 *   - a Money-like object: {amount, currency} or {current:{amount,currency}}
 * Returns null for missing / zero / negative values.
 */
function _readOfferPrice(price: unknown): number | null {
  if (typeof price === 'number' && Number.isFinite(price) && price > 0) return price;
  if (typeof price === 'string') {
    const n = Number(price);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (price && typeof price === 'object') {
    const p = price as Record<string, unknown>;
    // {current: {amount, currency}}
    if (p.current && typeof p.current === 'object') {
      const cur = p.current as Record<string, unknown>;
      const amt = _firstNumber(cur.amount);
      if (amt !== null && amt > 0) return amt;
    }
    // {amount, currency}
    const amt = _firstNumber(p.amount);
    if (amt !== null && amt > 0) return amt;
  }
  return null;
}


function _readOfferCurrency(price: unknown): string {
  if (price && typeof price === 'object') {
    const p = price as Record<string, unknown>;
    if (p.current && typeof p.current === 'object') {
      const cur = _firstString((p.current as Record<string, unknown>).currency);
      if (cur) return cur;
    }
    const cur = _firstString(p.currency);
    if (cur) return cur;
  }
  return '';
}


function _readOfferAvailability(offer: Record<string, any>): string | null {
  // Inventory shape from get_pdp_v2 offers: {availability: "in_stock", ...}
  // or top-level {in_stock: true} on legacy rows.
  const inv = offer.inventory && typeof offer.inventory === 'object'
    ? offer.inventory as Record<string, unknown>
    : null;
  const raw =
    inv?.availability ??
    inv?.in_stock ??
    offer.availability ??
    offer.in_stock;
  return _normalizeAvailability(raw);
}

function _readOfferDeepLink(offer: Record<string, any>, parentUrl: string): string {
  return _firstString(
    offer.merchant_checkout_url,
    offer.checkout_url,
    offer.purchase_url,
    offer.external_redirect_url,
    offer.externalRedirectUrl,
    offer.external_url,
    offer.affiliate_url,
    offer.affiliateUrl,
    offer.canonical_url,
    offer.url,
    offer.product_url,
    offer.destination_url,
    offer.redirect_url,
  ) || parentUrl;
}

function _readDayRange(value: unknown): { minValue: number; maxValue: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = _firstNumber(value[0]);
  const second = _firstNumber(value[1]);
  if (first === null || second === null || first < 0 || second < 0) return null;
  return {
    minValue: Math.min(first, second),
    maxValue: Math.max(first, second),
  };
}

function _buildShippingDuration(range: { minValue: number; maxValue: number }): Record<string, any> {
  return {
    '@type': 'QuantitativeValue',
    minValue: range.minValue,
    maxValue: range.maxValue,
    unitCode: 'DAY',
  };
}

function _buildOfferShippingDetails(
  offer: Record<string, any>,
  currency: string,
): Record<string, any> | null {
  const shipping = _asRecord(offer.shipping);
  if (!shipping) return null;

  const etaRange = _readDayRange(shipping.eta_days_range);
  const methodLabel = _firstString(shipping.method_label);
  const cost = _asRecord(shipping.cost);
  const costAmount = _firstNumber(cost?.amount);
  if (costAmount === null || costAmount < 0) return null;

  const node: Record<string, any> = {
    '@type': 'OfferShippingDetails',
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: DEFAULT_LOCALE_COUNTRY,
    },
  };
  if (methodLabel) node.shippingLabel = methodLabel;
  if (etaRange) {
    node.deliveryTime = {
      '@type': 'ShippingDeliveryTime',
      transitTime: _buildShippingDuration(etaRange),
    };
  }
  node.shippingRate = {
    '@type': 'MonetaryAmount',
    value: costAmount === 0 ? '0' : costAmount.toFixed(2),
    currency: _firstString(cost?.currency, currency),
  };

  return node;
}

function _buildMerchantReturnPolicy(offer: Record<string, any>): Record<string, any> | null {
  const returns = _asRecord(offer.returns);
  const returnWindow = _firstNumber(returns?.return_window_days);
  if (returnWindow === null || returnWindow <= 0) return null;

  const node: Record<string, any> = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: DEFAULT_LOCALE_COUNTRY,
    merchantReturnDays: returnWindow,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  };
  if (returns?.free_returns === true) {
    node.returnFees = 'https://schema.org/FreeReturn';
  } else if (returns?.free_returns === false) {
    node.returnFees = 'https://schema.org/ReturnFeesCustomerResponsibility';
  }

  return node;
}


/**
 * Build a single Offer node within an AggregateOffer.offers array.
 * Each multi-seller offer becomes one Offer with a typed Organization
 * seller — Google's Product rich-results renders this as the
 * "Available at: {merchant1}, {merchant2}..." widget. LLMs use it to
 * answer "where can I buy X?" with concrete seller attribution.
 */
function _buildSellerOfferNode(
  offer: Record<string, any>,
  parentUrl: string,
): Record<string, any> | null {
  const price = _readOfferPrice(offer.price);
  // No-price offers can still serve a useful purpose for LLM grounding
  // (the seller IS the answer to "who carries this") but Google's
  // structured-data linter rejects priceless Offer blocks. Drop them.
  if (price === null) return null;

  const currency = _readOfferCurrency(offer.price) || 'USD';
  const merchantId = _firstString(offer.merchant_id);
  const merchantName = _firstString(offer.merchant_name);
  const availability = _readOfferAvailability(offer);

  const node: Record<string, any> = {
    '@type': SCHEMA_TYPE_OFFER,
    url: _readOfferDeepLink(offer, parentUrl),
    priceCurrency: currency,
    price: price.toFixed(2),
    itemCondition: 'https://schema.org/NewCondition',
  };
  if (availability) node.availability = availability;
  if (merchantName) {
    node.seller = { '@type': 'Organization', name: merchantName };
    if (merchantId) node.seller.identifier = merchantId;
  } else if (merchantId) {
    // Fall back to the merchant_id when display name is missing; better
    // than no seller attribution at all.
    node.seller = { '@type': 'Organization', name: merchantId, identifier: merchantId };
  }
  const shippingDetails = _buildOfferShippingDetails(offer, currency);
  if (shippingDetails) node.shippingDetails = shippingDetails;
  const returnPolicy = _buildMerchantReturnPolicy(offer);
  if (returnPolicy) node.hasMerchantReturnPolicy = returnPolicy;
  return node;
}


/**
 * Build a schema.org/AggregateOffer node when product has multiple
 * sellers. Returns null when offers array is empty, has 0 priced
 * entries, or has only 1 priced entry (in which case the caller
 * should keep the regular single-Offer block).
 *
 * Why AggregateOffer matters: Google's Product rich-results uses it
 * to render the "Available from N sellers, starting at $X" widget
 * — visually distinct from single-seller listings and biases LLM
 * citations toward the canonical Pivota PDP over individual merchant
 * pages. Stage 2b-i's product_group_members data finally makes this
 * possible (pre-2b-i, multi-seller groups were 100% operator-curated).
 */
function _buildAggregateOffer(
  product: Record<string, any>,
  parentUrl: string,
): Record<string, any> | null {
  const rawOffers = product._pivota_offers;
  if (!Array.isArray(rawOffers) || rawOffers.length < 2) return null;

  const sellerNodes: Array<Record<string, any>> = [];
  for (const offer of rawOffers) {
    if (!offer || typeof offer !== 'object') continue;
    const node = _buildSellerOfferNode(offer, parentUrl);
    if (node) sellerNodes.push(node);
  }
  // Need ≥2 priced sellers to justify AggregateOffer
  if (sellerNodes.length < 2) return null;

  // Currency normalization (codex review 2026-05-12 P1): if the
  // sellers span multiple currencies, the previous behavior was to
  // pick the first arbitrarily and compute low/high across mixed
  // currencies — semantically wrong (a $12 USD offer and a €15 EUR
  // offer aren't comparable). The correct move is to filter to the
  // most-common currency cohort and drop the rest. If even the
  // dominant cohort has only 1 seller after filtering, fall back to
  // single Offer at the caller (return null here).
  const currencyCounts = new Map<string, number>();
  for (const n of sellerNodes) {
    const c = String(n.priceCurrency || '').toUpperCase();
    if (!c) continue;
    currencyCounts.set(c, (currencyCounts.get(c) || 0) + 1);
  }
  if (currencyCounts.size === 0) return null;
  // Pick the currency with the most sellers (deterministic tiebreak
  // by lexicographic order to keep output stable across renders).
  const dominantCurrency = Array.from(currencyCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  const cohort = sellerNodes.filter(
    (n) => String(n.priceCurrency || '').toUpperCase() === dominantCurrency,
  );
  if (cohort.length < 2) return null;

  // Compute lowPrice / highPrice from the (now single-currency)
  // cohort — keeps the aggregate consistent with the offers array
  // we're emitting.
  const prices = cohort.map((n) => Number(n.price)).filter((p) => Number.isFinite(p));
  const lowPrice = prices.length ? Math.min(...prices) : null;
  const highPrice = prices.length ? Math.max(...prices) : null;

  const aggregate: Record<string, any> = {
    '@type': 'AggregateOffer',
    url: parentUrl,
    priceCurrency: dominantCurrency,
    offerCount: cohort.length,
    offers: cohort,
  };
  if (lowPrice !== null) aggregate.lowPrice = lowPrice.toFixed(2);
  if (highPrice !== null) aggregate.highPrice = highPrice.toFixed(2);
  return aggregate;
}

/**
 * GTIN-13 (and friends) lookup. Schema.org accepts gtin / gtin8 / gtin12
 * / gtin13 / gtin14 / mpn. Backend stores under `barcode` (catalog_skus
 * column from the Phase 7d mirror) or sometimes `gtin13` directly when
 * the agent enrichment pipeline normalized it. Read both.
 *
 * Stripped of non-digit characters so "0773-602-443796" surfaces as
 * "0773602443796" — matches the canonical GTIN form the search engines
 * recognize.
 */
function _readGtin(record: Record<string, any>): string {
  const raw = _firstString(record.gtin13, record.gtin, record.barcode);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Real GTIN lengths: 8, 12, 13, 14. Reject obviously-bad values to
  // avoid emitting a spam-flagged structured-data field. Google's
  // structured-data linter rejects sub-8-digit "GTINs" — better to
  // omit than emit garbage.
  if (digits.length < 8 || digits.length > 14) return '';
  return digits;
}

/**
 * Flatten variant.options into a {color, size, shade, ...} dict so we
 * can map to schema.org Product's typed properties. Path B options
 * shape: [{name, value, axis_kind}, ...]. Path A shape: {Title: "..."}.
 * Both handled.
 *
 * Returns lowercase-keyed structured options; caller decides which keys
 * map to Product#color / Product#size / additionalProperty.
 */
function _flattenVariantOptions(options: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(options)) {
    for (const opt of options) {
      if (!opt || typeof opt !== 'object') continue;
      const key = _firstString(
        (opt as any).axis_kind,
        (opt as any).name,
      ).toLowerCase();
      const value = _firstString((opt as any).value);
      if (key && value) out[key] = value;
    }
  } else if (options && typeof options === 'object') {
    for (const [k, v] of Object.entries(options as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        out[String(k).toLowerCase()] = v.trim();
      }
    }
  }
  return out;
}

/**
 * Build one schema.org Product node for a variant. Used by the parent's
 * `hasVariant` array — Google's Product Variants feature reads this to
 * render the shade/size selector on rich result cards. Each variant
 * gets its own gtin13 + sku + offers when available.
 *
 * Why a flat Product type (not ProductModel / ProductGroup): keeps the
 * parent ProductGroup-vs-Product decision out of this layer. Google
 * accepts `Product#hasVariant: [Product, Product]` and renders it the
 * same way as `ProductGroup#hasVariant`.
 */
function _buildVariantNode(args: {
  variant: Record<string, any>;
  parentName: string;
  parentBrand: string;
  parentUrl: string;
}): Record<string, any> | null {
  const { variant, parentName, parentBrand, parentUrl } = args;
  if (!variant || typeof variant !== 'object') return null;

  // Variant must have either a meaningful title or non-default options.
  // Skip Shopify Default-Title placeholders — see Stage 2b-ii filter.
  const variantTitle = _firstString(variant.title);
  const titleIsMeaningful = variantTitle && variantTitle.toLowerCase() !== 'default title';
  const opts = _flattenVariantOptions(variant.options);
  const optsMeaningful = Object.values(opts).some(
    (v) => v && v.toLowerCase() !== 'default title' && v.toLowerCase() !== 'default',
  );
  if (!titleIsMeaningful && !optsMeaningful) return null;

  const variantId = _firstString(variant.variant_id, variant.id);
  if (!variantId) return null;

  const variantUrl = parentUrl + (parentUrl.includes('?') ? '&' : '?') + 'variant=' + encodeURIComponent(variantId);
  const node: Record<string, any> = {
    '@type': SCHEMA_TYPE_PRODUCT,
    name: titleIsMeaningful ? variantTitle : `${parentName} (${Object.values(opts).join(' / ')})`,
    url: variantUrl,
    sku: _firstString(variant.sku, variantId),
  };
  if (parentBrand) {
    node.brand = { '@type': SCHEMA_TYPE_BRAND, name: parentBrand };
  }
  const variantImage = _firstString(variant.image_url, variant.image);
  if (variantImage) node.image = variantImage;

  // Map structured options to schema.org typed fields where possible.
  if (opts.color) node.color = opts.color;
  if (opts.size) node.size = opts.size;
  // shade isn't a standard schema.org property — surface via
  // additionalProperty so Google can still index it.
  const additionalProps: Array<Record<string, any>> = [];
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'color' || k === 'size' || k === 'title') continue;
    additionalProps.push({ '@type': 'PropertyValue', name: k, value: v });
  }
  if (additionalProps.length) node.additionalProperty = additionalProps;

  const gtin = _readGtin(variant);
  if (gtin) node.gtin13 = gtin;

  // Per-variant Offer
  const price = _firstNumber(
    variant.price?.current?.amount,
    variant.price?.amount,
    variant.price_amount,
  );
  if (price !== null && price > 0) {
    const offer: Record<string, any> = {
      '@type': SCHEMA_TYPE_OFFER,
      url: variantUrl,
      priceCurrency: _firstString(
        variant.price?.current?.currency,
        variant.price?.currency,
        variant.currency,
        'USD',
      ),
      price: price.toFixed(2),
    };
    const availability = _normalizeAvailability(
      variant.availability?.in_stock ?? variant.in_stock ?? variant.availability,
    );
    if (availability) offer.availability = availability;
    node.offers = offer;
  }

  return node;
}

/**
 * Build the parent's hasVariant array. Drops Default-Title placeholders
 * — same filter as Stage 2b-ii's variant promoter. Returns [] when:
 *   - no real variants exist, OR
 *   - only 1 real variant remains (Google's Product Variants feature
 *     and Rich Results Test flag single-element hasVariant arrays as
 *     partial Product Variants markup; the seed PDPs we shipped on
 *     2026-05-12 each had 1 size variant like "5ml" / "110g" and
 *     Rich Results Test reported "2 items detected: Some are invalid"
 *     because of this).
 *
 * Caller is responsible for promoting the parent's @type from "Product"
 * to "ProductGroup" when nodes.length >= 2 (Google's blessed pattern
 * for variant markup — see _addProductGroupShape).
 */
function _buildHasVariant(args: {
  product: Record<string, any>;
  parentName: string;
  parentBrand: string;
  parentUrl: string;
}): Array<Record<string, any>> {
  const { product, parentName, parentBrand, parentUrl } = args;
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const nodes: Array<Record<string, any>> = [];
  for (const v of variants) {
    const node = _buildVariantNode({ variant: v, parentName, parentBrand, parentUrl });
    if (node) nodes.push(node);
  }
  // Require >=2 real variants. A lone "5ml" or "110g" variant doesn't
  // produce a useful shade/size selector and trips Google's validator.
  if (nodes.length < 2) return [];
  return nodes;
}


/**
 * When hasVariant is non-empty, the parent SHOULD use ProductGroup
 * @type rather than Product, with productGroupID + variesBy +
 * inProductGroupWithID on children. Per Google's Product Variants
 * docs (developers.google.com/search/docs/appearance/structured-data
 * /product-variants), this is the blessed pattern; using Product +
 * hasVariant works at schema.org level but Rich Results Test flags
 * it as a warning. Mutates ldRecord and variantNodes in place.
 */
function _addProductGroupShape(
  ldRecord: Record<string, any>,
  variantNodes: Array<Record<string, any>>,
  product: Record<string, any>,
  productId: string,
): void {
  if (variantNodes.length === 0) return;

  ldRecord['@type'] = 'ProductGroup';

  // productGroupID — prefer the backend's product_group_id (set by
  // Stage 2b-i autogrouper for clustered products). Fall back to a
  // signature-derived pg_<hex> form so single-merchant variant
  // products without a group still get a valid productGroupID.
  //
  // Defensive against the codex-flagged 2026-05-12 edge case: if
  // productId is ALREADY a pg_-prefixed identifier (e.g. when the
  // frontend renders /products/pg_catalog_abc directly), don't
  // double-prefix to pg_pg_catalog_abc. Strip any leading sig_ or
  // pg_ before applying the pg_ prefix exactly once.
  const groupIdFromBackend = _firstString(product.product_group_id);
  const groupIdFallback = `pg_${productId.replace(/^(sig_|pg_)/, '')}`;
  const groupId = groupIdFromBackend || groupIdFallback;
  ldRecord.productGroupID = groupId;

  // variesBy — union of axis kinds across variants. Required by
  // ProductGroup for the variant selector to render correctly.
  const axes = new Set<string>();
  for (const v of variantNodes) {
    if (v.color) axes.add('color');
    if (v.size) axes.add('size');
    const props = Array.isArray(v.additionalProperty) ? v.additionalProperty : [];
    for (const p of props) {
      const axisName = _firstString(p?.name);
      if (axisName) axes.add(axisName);
    }
  }
  if (axes.size) ldRecord.variesBy = Array.from(axes);

  // Each child Product carries inProductGroupWithID linking back to
  // the parent.
  for (const v of variantNodes) {
    v.inProductGroupWithID = groupId;
  }
}

function _scaleRatingToFivePoint(rating: number, scale: number | null): number {
  if (scale !== null && scale > 0 && scale !== 5) {
    return (rating / scale) * 5;
  }
  return rating;
}

function _resolveAggregateRating(
  product: Record<string, any>,
  reviewsModule?: Record<string, any> | null,
): { ratingValue: number | null; ratingCount: number | null } {
  const moduleRatingRaw = _firstNumber(reviewsModule?.rating);
  const moduleScale = _firstNumber(reviewsModule?.scale);
  const moduleRating = moduleRatingRaw !== null
    ? _scaleRatingToFivePoint(moduleRatingRaw, moduleScale)
    : null;

  return {
    ratingValue: _firstPositiveNumber(
      product.aggregate_rating?.value,
      product.rating,
      product.average_rating,
      moduleRating,
    ),
    ratingCount: _firstPositiveNumber(
      product.aggregate_rating?.count,
      product.rating_count,
      product.review_count,
      reviewsModule?.review_count,
    ),
  };
}

function _buildRecommendationsItemList(
  recommendationsModule?: Record<string, any> | null,
): Record<string, any> | null {
  const items = Array.isArray(recommendationsModule?.items)
    ? recommendationsModule.items
    : [];
  if (!items.length) return null;

  const itemListElement: Array<Record<string, any>> = [];
  for (const item of items) {
    const record = _asRecord(item);
    if (!record) continue;

    const productId = _firstString(record.product_id, record.productId);
    const name = _firstString(record.title, record.name, record.card_title);
    if (!productId || !name) continue;
    const href = buildProductHrefForProduct(record);

    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      url: `${PIVOTA_SITE_BASE}${href}`,
      name,
    });
    if (itemListElement.length >= 20) break;
  }

  if (!itemListElement.length) return null;
  return {
    '@type': 'ItemList',
    name: 'Similar products',
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}

/**
 * Build the JSON-LD payload as a serialized string ready to drop into a
 * `<script type="application/ld+json">{...}</script>` block.
 *
 * Sanitization strategy: serialize via JSON.stringify (escapes quotes,
 * backslashes, control chars) then escape `</` so an attacker-crafted
 * description can't break out of the script tag. This is the standard
 * technique used by Next.js's `<Script>` recommendations.
 */
export function buildProductJsonLd(args: {
  product: Record<string, any>;
  productId: string;
}, context: ProductJsonLdContext = {}): string | null {
  const { product, productId } = args;
  const name = _firstString(product.title, product.name);
  if (!name) return null;

  const description = buildProductDescription(product, {
    maxLength: PRODUCT_JSON_LD_DESCRIPTION_MAX_LENGTH,
  });
  const images = _readImages(product);
  const brand = _readBrand(product);
  const sku = _firstString(product.sku, product.platform_product_id, productId);
  const url = `${PIVOTA_SITE_BASE}/products/${productId}`;

  const { price, currency, availability } = _resolveOfferFacts(product);

  const ldRecord: Record<string, any> = {
    '@context': SCHEMA_CONTEXT,
    '@type': SCHEMA_TYPE_PRODUCT,
    name,
    url,
  };

  ldRecord.description = description;
  if (images.length) ldRecord.image = images.length === 1 ? images[0] : images;
  if (brand) {
    ldRecord.brand = { '@type': SCHEMA_TYPE_BRAND, name: brand };
  }
  if (sku) ldRecord.sku = sku;

  // GTIN at the parent level (Stage 3b-1). Used by Google Shopping
  // for product matching across merchants — same GTIN across stores
  // → same canonical product in their dedup graph. Read from
  // product.gtin13 (preferred) or product.barcode.
  const parentGtin = _readGtin(product);
  if (parentGtin) ldRecord.gtin13 = parentGtin;

  // Offers — Stage 3b-2 added AggregateOffer for multi-seller groups.
  //
  // Order of preference:
  //   1. AggregateOffer (≥2 priced sellers from product_group_members)
  //      — Google renders this as "Available from N sellers, from $X".
  //   2. Single Offer with price (legacy + single-seller path)
  //   3. Single Offer with only availability (no-price + known-stock)
  //
  // Google's structured-data linter prefers AggregateOffer for
  // multi-seller products and downranks pages that ship N separate
  // Product nodes for the same canonical SKU. Pre-3b-2 we were the
  // latter — the same physical product appeared as 4 separate
  // Pivota PDPs across the 4 group members. This unifies the signal.
  const aggregate = _buildAggregateOffer(product, url);
  if (aggregate) {
    ldRecord.offers = aggregate;
  } else if (price !== null && price > 0) {
    const offer: Record<string, any> = {
      '@type': SCHEMA_TYPE_OFFER,
      url,
      priceCurrency: currency,
      price: price.toFixed(2),
    };
    if (availability) offer.availability = availability;
    ldRecord.offers = offer;
  } else if (availability) {
    ldRecord.offers = {
      '@type': SCHEMA_TYPE_OFFER,
      url,
      availability,
    };
  }

  // Aggregate rating — only if we genuinely have it.
  const { ratingValue, ratingCount } = _resolveAggregateRating(product, context.reviewsModule);
  if (
    ratingValue !== null &&
    ratingValue > 0 &&
    ratingCount !== null &&
    ratingCount > 0
  ) {
    ldRecord.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: ratingValue.toFixed(1),
      reviewCount: Math.round(ratingCount),
    };
  }

  // BreadcrumbList — helps Gemini grounding + Google rich results
  // categorize the product. The breadcrumb chain is what lets the model
  // answer "best {category}" queries correctly: it knows this PDP is
  // a {category_path[0]}, not just a generic page. We always emit a
  // 3-step crumb (Home → Products[/category] → Product) when name is
  // present; the category step is omitted only if no category is known.
  const categoryName = _firstString(
    Array.isArray(product.category_path) && product.category_path[0],
    product.product_type,
    product.category,
  );
  const breadcrumbItems: Array<Record<string, any>> = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: PIVOTA_SITE_BASE,
    },
  ];
  if (categoryName) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: breadcrumbItems.length + 1,
      name: categoryName,
      item: `${PIVOTA_SITE_BASE}/products`,
    });
  } else {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: breadcrumbItems.length + 1,
      name: 'Products',
      item: `${PIVOTA_SITE_BASE}/products`,
    });
  }
  breadcrumbItems.push({
    '@type': 'ListItem',
    position: breadcrumbItems.length + 1,
    name,
    item: url,
  });
  ldRecord.breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  const recommendationsItemList = _buildRecommendationsItemList(context.recommendationsModule);

  // hasVariant + ProductGroup shape (Stage 3b-1 + 2026-05-12 fix).
  // Emit one Product node per real variant so Google's Product
  // Variants feature can render the shade/size selector. Skipped
  // when product has <2 real variants — single-variant arrays trip
  // Rich Results Test ("Some are invalid"). When >=2 variants do
  // qualify, promote the parent from Product to ProductGroup with
  // productGroupID + variesBy + inProductGroupWithID per child
  // (Google's blessed pattern).
  const variantNodes = _buildHasVariant({
    product,
    parentName: name,
    parentBrand: brand,
    parentUrl: url,
  });
  if (variantNodes.length > 0) {
    _addProductGroupShape(ldRecord, variantNodes, product, productId);
    ldRecord.hasVariant = variantNodes;
  }

  if (recommendationsItemList) {
    const productNode = { ...ldRecord };
    delete productNode['@context'];
    return _safeJsonForScriptTag({
      '@context': SCHEMA_CONTEXT,
      '@graph': [productNode, recommendationsItemList],
    });
  }

  return _safeJsonForScriptTag(ldRecord);
}

/**
 * Produce a JSON string that's safe to embed inside a
 * `<script type="application/ld+json">` block. Two protections:
 *   1. JSON.stringify escapes quotes / backslashes / control chars
 *   2. Replace `</` with `<\/` so an attacker can't terminate the
 *      script tag by sneaking `</script>` into a product description
 *      or any other field.
 *
 * Also escapes `<!--` / `-->` for the same defense-in-depth reason
 * even though Schema.org parsers don't care about HTML comments.
 */
function _safeJsonForScriptTag(record: Record<string, any>): string {
  return JSON.stringify(record)
    .replace(/<\/(?=[a-zA-Z!])/g, '<\\/')
    .replace(/<!--/g, '<\\!--')
    .replace(/-->/g, '--\\>');
}

// Test-only export.
export const __forTesting = {
  _normalizeAvailability,
  _readImages,
  _readBrand,
  _readGtin,
  _safeJsonForScriptTag,
  _resolveDefaultVariant,
  _resolveOfferFacts,
  _flattenVariantOptions,
  _buildVariantNode,
  _buildHasVariant,
  _addProductGroupShape,
  _readOfferPrice,
  _readOfferCurrency,
  _readOfferAvailability,
  _readOfferDeepLink,
  _buildOfferShippingDetails,
  _buildMerchantReturnPolicy,
  _buildSellerOfferNode,
  _buildAggregateOffer,
  _resolveAggregateRating,
  _buildRecommendationsItemList,
};
