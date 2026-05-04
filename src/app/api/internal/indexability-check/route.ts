const PUBLIC_BASE_URL = 'https://agent.pivota.cc';

type JsonLdResult = {
  product: boolean;
  offer: boolean;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function normalizeProductEntityId(value: string | null) {
  const id = String(value || '').trim();
  return /^sig_[a-z0-9]+$/i.test(id) ? id : '';
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function extractJsonLd(html: string): JsonLdResult {
  const scripts = Array.from(
    html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ).map((match) => match[1]?.trim() || '');
  let product = false;
  let offer = false;

  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const type = record['@type'];
    const types = Array.isArray(type) ? type.map(String) : [String(type || '')];
    if (types.includes('Product')) product = true;
    if (types.includes('Offer') || types.includes('AggregateOffer')) offer = true;
    if (record.offers) offer = true;
    Object.values(record).forEach((nested) => {
      if (nested && typeof nested === 'object') visit(nested);
    });
  };

  scripts.forEach((script) => {
    try {
      visit(JSON.parse(script));
    } catch {
      // Ignore malformed JSON-LD in the debug endpoint; the boolean result stays false.
    }
  });

  return { product, offer };
}

async function fetchText(url: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    headers,
    cache: 'no-store',
  });
  const text = await response.text().catch(() => '');
  return { response, text };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productEntityId = normalizeProductEntityId(searchParams.get('product_entity_id'));
  if (!productEntityId) {
    return json({ error: 'product_entity_id must be a canonical sig_* ProductEntity ID' }, 400);
  }

  const url = `${PUBLIC_BASE_URL}/products/${productEntityId}`;
  const googlebotHeaders = {
    'user-agent':
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  };
  const [{ response, text: html }, { text: sitemap }, productsPage, indexabilityPage] =
    await Promise.all([
      fetchText(url, googlebotHeaders),
      fetchText(`${PUBLIC_BASE_URL}/sitemap-products.xml`),
      fetchText(`${PUBLIC_BASE_URL}/products`, googlebotHeaders).catch(() => ({
        response: null,
        text: '',
      })),
      fetchText(`${PUBLIC_BASE_URL}/products/indexability`, googlebotHeaders).catch(() => ({
        response: null,
        text: '',
      })),
    ]);

  const canonicalPresent = new RegExp(
    `<link[^>]+rel=["']canonical["'][^>]+href=["']${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
    'i',
  ).test(html);
  const serverRenderedContent = {
    product_name: /data-pivota-product-name/i.test(html) || /<h1[\s>]/i.test(html),
    brand: /data-pivota-product-brand/i.test(html),
    description: /data-pivota-product-overview/i.test(html),
  };
  const jsonld = extractJsonLd(html);
  const sitemapIncluded = sitemap.includes(url);
  const relativeHref = `href="/products/${productEntityId}"`;
  const absoluteHref = `href="${url}"`;
  const internalLinksCount =
    countOccurrences(productsPage.text, relativeHref) +
    countOccurrences(productsPage.text, absoluteHref) +
    countOccurrences(indexabilityPage.text, relativeHref) +
    countOccurrences(indexabilityPage.text, absoluteHref);
  const indexabilityStatus =
    response.status === 200 &&
    canonicalPresent &&
    serverRenderedContent.product_name &&
    jsonld.product &&
    sitemapIncluded
      ? 'ready'
      : 'needs_work';

  return json({
    url,
    http_status: response.status,
    canonical_present: canonicalPresent,
    server_rendered_content: serverRenderedContent,
    jsonld,
    sitemap_included: sitemapIncluded,
    internal_links_count: internalLinksCount,
    indexability_status: indexabilityStatus,
  });
}
