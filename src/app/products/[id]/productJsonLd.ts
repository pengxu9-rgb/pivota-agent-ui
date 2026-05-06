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

const SCHEMA_CONTEXT = 'https://schema.org/';
const SCHEMA_TYPE_PRODUCT = 'Product';
const SCHEMA_TYPE_OFFER = 'Offer';
const SCHEMA_TYPE_BRAND = 'Brand';

const PIVOTA_SITE_BASE = 'https://agent.pivota.cc';

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
}): string | null {
  const { product, productId } = args;
  const name = _firstString(product.title, product.name);
  if (!name) return null;

  const description = _firstString(
    product.description,
    product.short_description,
    product.subtitle,
    product.summary,
  );
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

  if (description) ldRecord.description = description.slice(0, 5000);
  if (images.length) ldRecord.image = images.length === 1 ? images[0] : images;
  if (brand) {
    ldRecord.brand = { '@type': SCHEMA_TYPE_BRAND, name: brand };
  }
  if (sku) ldRecord.sku = sku;

  // Offers — only emit when we have a real price. Google flags
  // priceless `Offer` blocks as spam.
  if (price !== null && price > 0) {
    const offer: Record<string, any> = {
      '@type': SCHEMA_TYPE_OFFER,
      url,
      priceCurrency: currency,
      price: price.toFixed(2),
    };
    if (availability) offer.availability = availability;
    ldRecord.offers = offer;
  } else if (availability) {
    // No price but availability known — still useful signal.
    ldRecord.offers = {
      '@type': SCHEMA_TYPE_OFFER,
      url,
      availability,
    };
  }

  // Aggregate rating — only if we genuinely have it.
  const ratingValue = _firstNumber(
    product.aggregate_rating?.value,
    product.rating,
    product.average_rating,
  );
  const ratingCount = _firstNumber(
    product.aggregate_rating?.count,
    product.rating_count,
    product.review_count,
  );
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
  _safeJsonForScriptTag,
  _resolveDefaultVariant,
  _resolveOfferFacts,
};
