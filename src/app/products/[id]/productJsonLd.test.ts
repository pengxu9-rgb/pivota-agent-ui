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
