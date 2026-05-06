import { describe, expect, it } from 'vitest';
import { buildProductJsonLd, __forTesting } from './productJsonLd';

const { _normalizeAvailability, _readImages, _safeJsonForScriptTag } = __forTesting;

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
