import { describe, expect, it } from 'vitest';
import { buildProductJsonLd, __forTesting } from './productJsonLd';

const {
  _normalizeAvailability,
  _readImages,
  _safeJsonForScriptTag,
  _resolveDefaultVariant,
  _resolveOfferFacts,
} = __forTesting;

const PRODUCT_ID = 'sig_7ad40676c42fb9c96e2a8136';
const URL = `https://agent.pivota.cc/products/${PRODUCT_ID}`;

describe('buildProductJsonLd — minimum viable schema', () => {
  it('returns null when product has no title/name', () => {
    expect(buildProductJsonLd({ product: {}, productId: PRODUCT_ID })).toBeNull();
  });

  it('emits Product schema with name + url + sku as a baseline', () => {
    const out = buildProductJsonLd({
      product: { title: 'Multi-Peptide Lash and Brow Serum' },
      productId: PRODUCT_ID,
    });
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!);
    expect(parsed['@context']).toBe('https://schema.org/');
    expect(parsed['@type']).toBe('Product');
    expect(parsed.name).toBe('Multi-Peptide Lash and Brow Serum');
    expect(parsed.url).toBe(URL);
    // sku falls back to productId when no explicit sku/platform_product_id.
    expect(parsed.sku).toBe(PRODUCT_ID);
  });

  it('falls back to a branded description when catalog description fields are absent', () => {
    const out = buildProductJsonLd({
      product: { title: 'Multi-Peptide Lash and Brow Serum' },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(typeof parsed.description).toBe('string');
    expect(parsed.description).toBe('Shop Multi-Peptide Lash and Brow Serum on Pivota.');
  });

  it('uses the catalog description before the branded fallback', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'X',
        description: 'Real catalog description.',
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.description).toBe('Real catalog description.');
  });

  it('caps fallback descriptions at the JSON-LD description limit', () => {
    const out = buildProductJsonLd({
      product: { title: 'A'.repeat(6000) },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.description).toHaveLength(5000);
    expect(parsed.description.startsWith('Shop ')).toBe(true);
  });

  it('includes brand block when brand name is available', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', brand: { name: 'the ordinary' } },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.brand).toEqual({ '@type': 'Brand', name: 'the ordinary' });
  });

  it('reads brand from various legacy fields', () => {
    const a = buildProductJsonLd({
      product: { title: 'X', brand_name: 'Acme' },
      productId: PRODUCT_ID,
    });
    expect(JSON.parse(a!).brand).toEqual({ '@type': 'Brand', name: 'Acme' });

    const b = buildProductJsonLd({
      product: { title: 'X', vendor: 'VendorY' },
      productId: PRODUCT_ID,
    });
    expect(JSON.parse(b!).brand).toEqual({ '@type': 'Brand', name: 'VendorY' });
  });
});

describe('buildProductJsonLd — offers', () => {
  it('emits offer with price when price is a positive number', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', price: 19.99, currency: 'USD', in_stock: true },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers).toMatchObject({
      '@type': 'Offer',
      url: URL,
      priceCurrency: 'USD',
      price: '19.99',
      availability: 'https://schema.org/InStock',
    });
  });

  it('omits offers entirely when price is missing or zero', () => {
    // Google penalizes priceless Offer blocks as spam; we'd rather have
    // no `offers` key than a fake one.
    const noPrice = buildProductJsonLd({
      product: { title: 'X' },
      productId: PRODUCT_ID,
    });
    expect(JSON.parse(noPrice!).offers).toBeUndefined();

    const zeroPrice = buildProductJsonLd({
      product: { title: 'X', price: 0 },
      productId: PRODUCT_ID,
    });
    expect(JSON.parse(zeroPrice!).offers).toBeUndefined();
  });

  it('emits offers with only availability when price is missing but stock is known', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', availability: 'out_of_stock' },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers).toEqual({
      '@type': 'Offer',
      url: URL,
      availability: 'https://schema.org/OutOfStock',
    });
    expect(parsed.offers.price).toBeUndefined();
  });
});

describe('buildProductJsonLd — aggregateRating', () => {
  it('emits aggregateRating when both value and count are present and positive', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'X',
        aggregate_rating: { value: 4.5, count: 120 },
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: '4.5',
      reviewCount: 120,
    });
  });

  it('omits aggregateRating when count is missing — Google rejects partial ratings', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', rating: 4.5 },
      productId: PRODUCT_ID,
    });
    expect(JSON.parse(out!).aggregateRating).toBeUndefined();
  });
});

describe('buildProductJsonLd — security: script-tag escape', () => {
  it('escapes </script> in description so an attacker cannot break out', () => {
    const malicious = '</script><script>alert(1)</script>';
    const out = buildProductJsonLd({
      product: { title: 'Legit Title', description: malicious },
      productId: PRODUCT_ID,
    });
    expect(out).not.toBeNull();
    // The dangerous pattern must not appear unescaped in the serialized
    // output that goes between <script> tags.
    expect(out!).not.toContain('</script>');
    expect(out!).toContain('<\\/script>');
    // The string should still parse as JSON (the escape is a JSON-string
    // escape, not a structural one).
    expect(() => JSON.parse(out!)).not.toThrow();
  });

  it('escapes <!-- comment markers', () => {
    const malicious = 'X <!-- bad --> Y';
    const out = buildProductJsonLd({
      product: { title: 'T', description: malicious },
      productId: PRODUCT_ID,
    });
    expect(out!).not.toContain('<!--');
    expect(out!).not.toContain('-->');
  });
});

describe('buildProductJsonLd — variant-nested price (gateway shape)', () => {
  // Critical: the live get_pdp_v2 response stores price under
  // variants[default_variant_id].price.current.amount. PR 20 only read
  // top-level product.price and silently dropped the Offer block on
  // every real PDP. This whole describe block exists to lock that fix.

  const liveLikeProduct = {
    title: 'Multi-Peptide Lash and Brow Serum',
    brand: { name: 'the ordinary' },
    default_variant_id: 'e3cf79a9b040',
    variants: [
      {
        variant_id: 'e3cf79a9b040',
        sku_id: '769915233636',
        title: '5ml',
        price: { current: { amount: 11.47, currency: 'USD' } },
        availability: { in_stock: true },
      },
    ],
  };

  it('extracts price from variants[default].price.current.amount', () => {
    const out = buildProductJsonLd({ product: liveLikeProduct, productId: PRODUCT_ID });
    const parsed = JSON.parse(out!);
    expect(parsed.offers).toMatchObject({
      '@type': 'Offer',
      url: URL,
      price: '11.47',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    });
  });

  it('falls back to first variant when default_variant_id is missing', () => {
    const product = {
      title: 'X',
      variants: [
        { variant_id: 'v1', price: { current: { amount: 9.99, currency: 'EUR' } }, availability: { in_stock: false } },
        { variant_id: 'v2', price: { current: { amount: 14.99, currency: 'EUR' } } },
      ],
    };
    const parsed = JSON.parse(buildProductJsonLd({ product, productId: PRODUCT_ID })!);
    expect(parsed.offers.price).toBe('9.99');
    expect(parsed.offers.priceCurrency).toBe('EUR');
    expect(parsed.offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('matches by default_variant_id even when not first in list', () => {
    const product = {
      title: 'X',
      default_variant_id: 'v2',
      variants: [
        { variant_id: 'v1', price: { current: { amount: 5.00, currency: 'USD' } } },
        { variant_id: 'v2', price: { current: { amount: 25.00, currency: 'USD' } } },
      ],
    };
    const parsed = JSON.parse(buildProductJsonLd({ product, productId: PRODUCT_ID })!);
    expect(parsed.offers.price).toBe('25.00');
  });

  it('still works for non-variant top-level product shape', () => {
    // Backward compat for legacy / external_seed shapes that put price
    // at the root.
    const product = {
      title: 'X',
      price: 7.50,
      currency: 'USD',
      in_stock: true,
    };
    const parsed = JSON.parse(buildProductJsonLd({ product, productId: PRODUCT_ID })!);
    expect(parsed.offers.price).toBe('7.50');
    expect(parsed.offers.priceCurrency).toBe('USD');
    expect(parsed.offers.availability).toBe('https://schema.org/InStock');
  });

  it('reads sku_id from default variant when product.sku is missing', () => {
    // Bonus consistency: variants carry SKUs too; `_firstString` covers it
    // via `product.platform_product_id` fallback already, but real PDPs
    // expose sku_id under the variant. We don't read that today;
    // just locking the current behavior so we know what to add next.
    const out = buildProductJsonLd({ product: liveLikeProduct, productId: PRODUCT_ID });
    const parsed = JSON.parse(out!);
    expect(parsed.sku).toBe(PRODUCT_ID); // currently falls through to productId
  });
});

describe('_resolveDefaultVariant + _resolveOfferFacts', () => {
  it('_resolveDefaultVariant returns null on empty / non-array variants', () => {
    expect(_resolveDefaultVariant({})).toBeNull();
    expect(_resolveDefaultVariant({ variants: [] })).toBeNull();
    expect(_resolveDefaultVariant({ variants: 'oops' as any })).toBeNull();
  });

  it('_resolveOfferFacts returns nulls when neither variant nor top-level price exists', () => {
    const facts = _resolveOfferFacts({ title: 'X' });
    expect(facts.price).toBeNull();
    expect(facts.availability).toBeNull();
    expect(facts.currency).toBe('USD'); // default fallback
  });
});

describe('helpers', () => {
  it('_normalizeAvailability handles common variants', () => {
    expect(_normalizeAvailability('in_stock')).toBe('https://schema.org/InStock');
    expect(_normalizeAvailability('InStock')).toBe('https://schema.org/InStock');
    expect(_normalizeAvailability('out-of-stock')).toBe('https://schema.org/OutOfStock');
    expect(_normalizeAvailability('preorder')).toBe('https://schema.org/PreOrder');
    expect(_normalizeAvailability('discontinued')).toBe('https://schema.org/Discontinued');
    expect(_normalizeAvailability(true)).toBe('https://schema.org/InStock');
    expect(_normalizeAvailability(false)).toBe('https://schema.org/OutOfStock');
    expect(_normalizeAvailability('weird-state')).toBeNull();
    expect(_normalizeAvailability(null)).toBeNull();
  });

  it('_readImages dedupes between image_url + image_urls and trims whitespace', () => {
    const out = _readImages({
      image_url: 'https://x.com/a.jpg',
      image_urls: ['https://x.com/a.jpg', '  https://x.com/b.jpg  ', ''],
    });
    expect(out).toEqual(['https://x.com/a.jpg', 'https://x.com/b.jpg']);
  });

  it('_safeJsonForScriptTag escapes script-end + html comments', () => {
    const out = _safeJsonForScriptTag({ s: '</script>' });
    expect(out).toContain('<\\/script>');
    expect(out).not.toContain('</script>');
  });
});

describe('buildProductJsonLd — BreadcrumbList', () => {
  // Why we always emit a breadcrumb: Gemini grounding + Google rich
  // results use the chain to answer "best {category}" queries. Without
  // BreadcrumbList the model can't easily decide which category bucket
  // this PDP belongs to — even when category_path is present in the
  // gateway response.

  it('emits 3-step BreadcrumbList with category from category_path', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', category_path: ['Serum', 'Eye'] },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.breadcrumb).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://agent.pivota.cc' },
        { '@type': 'ListItem', position: 2, name: 'Serum', item: 'https://agent.pivota.cc/products' },
        { '@type': 'ListItem', position: 3, name: 'X', item: URL },
      ],
    });
  });

  it('falls back to product_type when category_path is missing', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', product_type: 'serum' },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.breadcrumb.itemListElement[1].name).toBe('serum');
  });

  it('uses generic "Products" when no category info is available', () => {
    const out = buildProductJsonLd({
      product: { title: 'X' },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.breadcrumb.itemListElement[1].name).toBe('Products');
    expect(parsed.breadcrumb.itemListElement).toHaveLength(3);
  });

  it('breadcrumb ListItem positions are sequential 1..N', () => {
    const out = buildProductJsonLd({
      product: { title: 'X', category_path: ['Y'] },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    const positions = parsed.breadcrumb.itemListElement.map((i: any) => i.position);
    expect(positions).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Stage 3b-1 additions: gtin13 + hasVariant
// ---------------------------------------------------------------------------

const { _readGtin, _flattenVariantOptions, _buildVariantNode } = __forTesting;

describe('Stage 3b-1: _readGtin', () => {
  it('reads gtin13 directly when present', () => {
    expect(_readGtin({ gtin13: '0773602443796' })).toBe('0773602443796');
  });

  it('reads barcode as a fallback (Path B mirror shape)', () => {
    expect(_readGtin({ barcode: '0773602443796' })).toBe('0773602443796');
  });

  it('strips non-digit separators', () => {
    expect(_readGtin({ barcode: '0773-602-443796' })).toBe('0773602443796');
    expect(_readGtin({ barcode: '  0773 602 443796  ' })).toBe('0773602443796');
  });

  it('rejects sub-8-digit garbage (Google rich-results linter rule)', () => {
    expect(_readGtin({ barcode: '123' })).toBe('');
    expect(_readGtin({ barcode: 'abc' })).toBe('');
  });

  it('rejects 15+ digit oversize (malformed)', () => {
    expect(_readGtin({ barcode: '123456789012345' })).toBe('');
  });

  it('returns empty string when neither field present', () => {
    expect(_readGtin({})).toBe('');
    expect(_readGtin({ gtin13: '', barcode: '' })).toBe('');
  });
});

describe('Stage 3b-1: _flattenVariantOptions', () => {
  it('handles Path B options shape (list of {name, value, axis_kind})', () => {
    const out = _flattenVariantOptions([
      { name: 'Shade', value: '8.5N Vellum', axis_kind: 'shade' },
      { name: 'Size', value: '30.0 ml', axis_kind: 'size' },
    ]);
    expect(out).toEqual({ shade: '8.5N Vellum', size: '30.0 ml' });
  });

  it('handles Path A options shape (flat dict)', () => {
    const out = _flattenVariantOptions({ Color: 'Red', Size: '30ml' });
    expect(out).toEqual({ color: 'Red', size: '30ml' });
  });

  it('returns empty for malformed input (defensive)', () => {
    expect(_flattenVariantOptions(null as any)).toEqual({});
    expect(_flattenVariantOptions('garbage' as any)).toEqual({});
    expect(_flattenVariantOptions([])).toEqual({});
  });
});

describe('Stage 3b-1: _buildVariantNode', () => {
  const PARENT = {
    parentName: 'Architecture Radiance Foundation',
    parentBrand: 'Tom Ford Beauty',
    parentUrl: URL,
  };

  it('rejects Default-Title placeholders (matches Stage 2b-ii filter)', () => {
    const node = _buildVariantNode({
      variant: {
        variant_id: 'x',
        title: 'Default Title',
        options: { Title: 'Default Title' },
      },
      ...PARENT,
    });
    expect(node).toBeNull();
  });

  it('accepts a real Tom Ford shade variant with full schema fields', () => {
    const node = _buildVariantNode({
      variant: {
        variant_id: '53059916267733',
        sku: 'TCT117',
        title: '8.5N Vellum / 30.0 ml',
        barcode: '0773602443796',
        image_url: 'https://cdn/.../tf_TCT117.png',
        options: [
          { name: 'Shade', value: '8.5N Vellum', axis_kind: 'shade' },
          { name: 'Size', value: '30.0 ml', axis_kind: 'size' },
        ],
        price: { current: { amount: '95.00', currency: 'USD' } },
        availability: { in_stock: true },
      },
      ...PARENT,
    });
    expect(node).not.toBeNull();
    expect(node!.name).toBe('8.5N Vellum / 30.0 ml');
    expect(node!.sku).toBe('TCT117');
    expect(node!.gtin13).toBe('0773602443796');
    expect(node!.image).toBe('https://cdn/.../tf_TCT117.png');
    expect(node!.size).toBe('30.0 ml');
    // shade isn't a typed schema.org field → additionalProperty
    expect(node!.additionalProperty).toEqual([
      { '@type': 'PropertyValue', name: 'shade', value: '8.5N Vellum' },
    ]);
    expect(node!.offers.price).toBe('95.00');
    expect(node!.offers.priceCurrency).toBe('USD');
    expect(node!.offers.availability).toBe('https://schema.org/InStock');
    // url carries variant=<id> so LLMs cite a deep-link instead of
    // the canonical parent URL when a shade is the target.
    expect(node!.url).toContain('variant=53059916267733');
  });

  it('returns null when variant has no variant_id (can\'t build deep link)', () => {
    const node = _buildVariantNode({
      variant: { title: 'Real shade', options: [{ name: 'shade', value: 'Red', axis_kind: 'shade' }] },
      ...PARENT,
    });
    expect(node).toBeNull();
  });

  it('omits offers when variant has no price (avoids Google spam flag for priceless Offer)', () => {
    const node = _buildVariantNode({
      variant: {
        variant_id: 'v1',
        title: 'Real shade',
        options: [{ name: 'shade', value: 'Red', axis_kind: 'shade' }],
      },
      ...PARENT,
    });
    expect(node!.offers).toBeUndefined();
  });
});

describe('Stage 3b-1: buildProductJsonLd with hasVariant + gtin13', () => {
  it('emits hasVariant + ProductGroup shape for a Tom Ford-style 40-shade product', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Architecture Radiance Foundation',
        brand: 'Tom Ford Beauty',
        variants: [
          {
            variant_id: 'V1', sku: 'TCT117', title: '8.5N Vellum / 30.0 ml',
            options: [{ name: 'Shade', value: '8.5N Vellum', axis_kind: 'shade' }],
            price: { current: { amount: '95.00', currency: 'USD' } },
            barcode: '0773602443796',
          },
          {
            variant_id: 'V2', sku: 'TCT118', title: '9.0N Beech / 30.0 ml',
            options: [{ name: 'Shade', value: '9.0N Beech', axis_kind: 'shade' }],
            price: { current: { amount: '95.00', currency: 'USD' } },
            barcode: '0773602443797',
          },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    // Parent @type promoted to ProductGroup (Google's blessed pattern
    // for variant markup; fixes the 2026-05-12 Rich Results Test
    // "Some are invalid" warning).
    expect(parsed['@type']).toBe('ProductGroup');
    expect(parsed.productGroupID).toBeDefined();
    expect(parsed.variesBy).toContain('shade');
    expect(parsed.hasVariant).toHaveLength(2);
    expect(parsed.hasVariant[0].gtin13).toBe('0773602443796');
    expect(parsed.hasVariant[1].gtin13).toBe('0773602443797');
    // Each child carries inProductGroupWithID matching parent
    expect(parsed.hasVariant[0].inProductGroupWithID).toBe(parsed.productGroupID);
    expect(parsed.hasVariant[1].inProductGroupWithID).toBe(parsed.productGroupID);
  });

  it('omits hasVariant when only ONE real variant exists (regression fix 2026-05-12)', () => {
    // The 6 seed PDPs each had 1 size variant like "5ml" or "110g".
    // Google's Rich Results Test flagged this as "2 items detected:
    // Some are invalid" because Product#hasVariant with one element
    // is partial Product Variants markup. Drop the singleton — a
    // single size variant doesn't render a useful selector anyway.
    const out = buildProductJsonLd({
      product: {
        title: 'Multi-Peptide Lash and Brow Serum',
        brand: 'the ordinary',
        variants: [
          {
            variant_id: 'e3cf79a9b040', title: '5ml',
            price: { current: { amount: 11.47, currency: 'USD' } },
          },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.hasVariant).toBeUndefined();
    // @type stays Product (no ProductGroup promotion when no variants)
    expect(parsed['@type']).toBe('Product');
  });

  it('omits hasVariant when only Default-Title placeholders exist (MOYU foundation brush)', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Foundation Brush',
        brand: 'MOYU',
        variants: [
          { variant_id: 'V1', title: 'Default Title', options: { Title: 'Default Title' } },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    // hasVariant key absent (not empty array — Google flags empties)
    expect(parsed.hasVariant).toBeUndefined();
    expect(parsed['@type']).toBe('Product');
  });

  it('uses backend product_group_id as productGroupID when present (Stage 2b-i link)', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'X', brand: 'Y',
        product_group_id: 'pg_real_backend_groupid_abc',
        variants: [
          { variant_id: 'V1', title: 'Red 30ml', options: [{ name: 'color', value: 'Red' }, { name: 'size', value: '30ml' }] },
          { variant_id: 'V2', title: 'Blue 30ml', options: [{ name: 'color', value: 'Blue' }, { name: 'size', value: '30ml' }] },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.productGroupID).toBe('pg_real_backend_groupid_abc');
    expect(parsed.variesBy).toContain('color');
    expect(parsed.variesBy).toContain('size');
  });

  it('falls back to sig-derived productGroupID when backend group_id missing', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'X', brand: 'Y',
        // No product_group_id from backend
        variants: [
          { variant_id: 'V1', title: 'A', options: [{ name: 'shade', value: 'A' }] },
          { variant_id: 'V2', title: 'B', options: [{ name: 'shade', value: 'B' }] },
        ],
      },
      productId: PRODUCT_ID,  // sig_7ad40676c42fb9c96e2a8136
    });
    const parsed = JSON.parse(out!);
    expect(parsed.productGroupID).toBe('pg_7ad40676c42fb9c96e2a8136');
  });

  it('emits parent-level gtin13 when product has a barcode', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Lipstick Russian Red',
        brand: 'MAC',
        barcode: '0773602443796',
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.gtin13).toBe('0773602443796');
  });
});

// ---------------------------------------------------------------------------
// Stage 3b-2 additions: AggregateOffer for multi-seller product_groups
// ---------------------------------------------------------------------------

const {
  _readOfferPrice,
  _readOfferAvailability,
  _buildSellerOfferNode,
  _buildAggregateOffer,
} = __forTesting;

describe('Stage 3b-2: _readOfferPrice', () => {
  it('reads numeric price directly', () => {
    expect(_readOfferPrice(95.0)).toBe(95.0);
  });

  it('parses string price (mirror script shape)', () => {
    expect(_readOfferPrice('95.00')).toBe(95.0);
  });

  it('reads price.current.amount Money shape', () => {
    expect(_readOfferPrice({ current: { amount: 95.0, currency: 'USD' } })).toBe(95.0);
  });

  it('reads flat {amount, currency} Money shape', () => {
    expect(_readOfferPrice({ amount: 95.0, currency: 'USD' })).toBe(95.0);
  });

  it('rejects zero, negative, missing, garbage', () => {
    expect(_readOfferPrice(0)).toBeNull();
    expect(_readOfferPrice(-5)).toBeNull();
    expect(_readOfferPrice(null)).toBeNull();
    expect(_readOfferPrice(undefined)).toBeNull();
    expect(_readOfferPrice('not_a_number')).toBeNull();
    expect(_readOfferPrice({})).toBeNull();
  });
});

describe('Stage 3b-2: _readOfferAvailability', () => {
  it('reads inventory.availability string', () => {
    expect(_readOfferAvailability({ inventory: { availability: 'in_stock' } })).toBe(
      'https://schema.org/InStock',
    );
  });

  it('reads inventory.in_stock boolean', () => {
    expect(_readOfferAvailability({ inventory: { in_stock: true } })).toBe(
      'https://schema.org/InStock',
    );
    expect(_readOfferAvailability({ inventory: { in_stock: false } })).toBe(
      'https://schema.org/OutOfStock',
    );
  });

  it('falls back to top-level availability', () => {
    expect(_readOfferAvailability({ availability: 'out_of_stock' })).toBe(
      'https://schema.org/OutOfStock',
    );
  });

  it('returns null when no availability signal present', () => {
    expect(_readOfferAvailability({})).toBeNull();
  });
});

describe('Stage 3b-2: _buildSellerOfferNode', () => {
  it('rejects priceless offers (Google rich-results spam flag)', () => {
    expect(
      _buildSellerOfferNode({ merchant_id: 'm', merchant_name: 'Sephora' }, URL),
    ).toBeNull();
  });

  it('emits Offer with Organization seller from merchant_name', () => {
    const node = _buildSellerOfferNode(
      {
        merchant_id: 'm_sephora',
        merchant_name: 'Sephora',
        price: { current: { amount: 95.0, currency: 'USD' } },
        inventory: { availability: 'in_stock' },
      },
      URL,
    );
    expect(node).not.toBeNull();
    expect(node!.seller).toEqual({ '@type': 'Organization', name: 'Sephora' });
    expect(node!.price).toBe('95.00');
    expect(node!.priceCurrency).toBe('USD');
    expect(node!.availability).toBe('https://schema.org/InStock');
  });

  it('falls back to merchant_id as seller name when display name missing', () => {
    const node = _buildSellerOfferNode(
      { merchant_id: 'merch_anonymous', price: '12.50' },
      URL,
    );
    expect(node!.seller).toEqual({ '@type': 'Organization', name: 'merch_anonymous' });
  });
});

describe('Stage 3b-2: _buildAggregateOffer', () => {
  it('returns null when product has no _pivota_offers attached', () => {
    expect(_buildAggregateOffer({}, URL)).toBeNull();
  });

  it('returns null when only 1 seller offer present (single-Offer path takes over)', () => {
    const product = {
      _pivota_offers: [
        {
          merchant_id: 'm1',
          merchant_name: 'Sephora',
          price: { current: { amount: 95, currency: 'USD' } },
        },
      ],
    };
    expect(_buildAggregateOffer(product, URL)).toBeNull();
  });

  it('returns null when 2 offers present but only 1 has a price', () => {
    const product = {
      _pivota_offers: [
        { merchant_id: 'm1', merchant_name: 'Sephora', price: '95.00' },
        { merchant_id: 'm2', merchant_name: 'Ulta' },  // priceless → dropped
      ],
    };
    expect(_buildAggregateOffer(product, URL)).toBeNull();
  });

  it('emits AggregateOffer with lowPrice/highPrice/offerCount for 3 sellers', () => {
    const product = {
      _pivota_offers: [
        {
          merchant_id: 'm_sephora', merchant_name: 'Sephora',
          price: { current: { amount: 95.0, currency: 'USD' } },
          inventory: { availability: 'in_stock' },
        },
        {
          merchant_id: 'm_ulta', merchant_name: 'Ulta',
          price: { current: { amount: 92.0, currency: 'USD' } },
          inventory: { availability: 'in_stock' },
        },
        {
          merchant_id: 'm_nordstrom', merchant_name: 'Nordstrom',
          price: { current: { amount: 99.0, currency: 'USD' } },
        },
      ],
    };
    const agg = _buildAggregateOffer(product, URL);
    expect(agg).not.toBeNull();
    expect(agg!['@type']).toBe('AggregateOffer');
    expect(agg!.offerCount).toBe(3);
    expect(agg!.lowPrice).toBe('92.00');
    expect(agg!.highPrice).toBe('99.00');
    expect(agg!.priceCurrency).toBe('USD');
    expect(agg!.offers).toHaveLength(3);
    expect(agg!.offers[0].seller.name).toBe('Sephora');
  });

  it('integrates with buildProductJsonLd: multi-seller → AggregateOffer replaces single Offer', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Architecture Radiance Foundation',
        brand: 'Tom Ford Beauty',
        price: 95.0,
        currency: 'USD',
        _pivota_offers: [
          { merchant_id: 'm_a', merchant_name: 'Sephora', price: '95.00' },
          { merchant_id: 'm_b', merchant_name: 'Ulta', price: '92.00' },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers['@type']).toBe('AggregateOffer');
    expect(parsed.offers.offerCount).toBe(2);
    expect(parsed.offers.price).toBeUndefined();
    expect(parsed.offers.offers[0].price).toBeDefined();
  });

  it('falls back to single Offer when _pivota_offers absent (single-seller path)', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Single-Seller Product',
        price: 19.99,
        currency: 'USD',
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers['@type']).toBe('Offer');
    expect(parsed.offers.price).toBe('19.99');
  });
});

// ---------------------------------------------------------------------------
// Codex review followup (2026-05-12 P1):
// AggregateOffer mixed-currency must NOT pick-first; ProductGroup ID
// fallback must not double-prefix.
// ---------------------------------------------------------------------------

describe('Codex P1 followup: AggregateOffer single-currency cohort', () => {
  it('drops mixed-currency offers and keeps the dominant cohort', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Cross-Currency Product',
        brand: 'X',
        _pivota_offers: [
          { merchant_id: 'm_us1', merchant_name: 'Sephora US', price: { current: { amount: 95, currency: 'USD' } } },
          { merchant_id: 'm_us2', merchant_name: 'Ulta US', price: { current: { amount: 92, currency: 'USD' } } },
          { merchant_id: 'm_eu', merchant_name: 'Sephora EU', price: { current: { amount: 88, currency: 'EUR' } } },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers['@type']).toBe('AggregateOffer');
    expect(parsed.offers.priceCurrency).toBe('USD');
    expect(parsed.offers.offerCount).toBe(2);
    expect(parsed.offers.lowPrice).toBe('92.00');
    expect(parsed.offers.highPrice).toBe('95.00');
    for (const child of parsed.offers.offers) {
      expect(child.priceCurrency).toBe('USD');
    }
  });

  it('falls back to single Offer when no currency cohort has >=2 sellers', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Three-Currency Product',
        brand: 'X',
        price: 50.0,
        currency: 'USD',
        _pivota_offers: [
          { merchant_id: 'a', merchant_name: 'A', price: { current: { amount: 95, currency: 'USD' } } },
          { merchant_id: 'b', merchant_name: 'B', price: { current: { amount: 88, currency: 'EUR' } } },
          { merchant_id: 'c', merchant_name: 'C', price: { current: { amount: 75, currency: 'GBP' } } },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers['@type']).toBe('Offer');
  });

  it('tie-breaks cohort selection lexicographically on currency code', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Tied Cohorts',
        brand: 'X',
        _pivota_offers: [
          { merchant_id: 'a', merchant_name: 'A', price: { current: { amount: 95, currency: 'EUR' } } },
          { merchant_id: 'b', merchant_name: 'B', price: { current: { amount: 88, currency: 'EUR' } } },
          { merchant_id: 'c', merchant_name: 'C', price: { current: { amount: 75, currency: 'USD' } } },
          { merchant_id: 'd', merchant_name: 'D', price: { current: { amount: 72, currency: 'USD' } } },
        ],
      },
      productId: PRODUCT_ID,
    });
    const parsed = JSON.parse(out!);
    expect(parsed.offers.priceCurrency).toBe('EUR');
    expect(parsed.offers.offerCount).toBe(2);
  });
});

describe('Codex P1 followup: ProductGroup ID does not double-prefix pg_', () => {
  it('strips existing pg_ prefix before applying the fallback pg_', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Product Group Direct Render',
        brand: 'X',
        variants: [
          { variant_id: 'V1', title: 'A', options: [{ name: 'shade', value: 'A' }] },
          { variant_id: 'V2', title: 'B', options: [{ name: 'shade', value: 'B' }] },
        ],
      },
      productId: 'pg_catalog_already_prefixed_abc',
    });
    const parsed = JSON.parse(out!);
    expect(parsed.productGroupID).toBe('pg_catalog_already_prefixed_abc');
    expect(parsed.productGroupID).not.toMatch(/^pg_pg_/);
  });

  it('strips sig_ prefix before applying the fallback pg_ (canonical case)', () => {
    const out = buildProductJsonLd({
      product: {
        title: 'Sig Direct Render',
        brand: 'X',
        variants: [
          { variant_id: 'V1', title: 'A', options: [{ name: 'shade', value: 'A' }] },
          { variant_id: 'V2', title: 'B', options: [{ name: 'shade', value: 'B' }] },
        ],
      },
      productId: 'sig_abcdef0123456789abcdef0123456789',
    });
    const parsed = JSON.parse(out!);
    expect(parsed.productGroupID).toBe('pg_abcdef0123456789abcdef0123456789');
  });
});
