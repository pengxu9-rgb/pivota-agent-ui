import { getProductEntitySitemapEntries } from '@/app/products/[id]/pdpSeo';

const PUBLIC_SITEMAP_URL = 'https://agent.pivota.cc/sitemap.xml';
const GOOGLE_SITEMAP_PING_URL = `https://www.google.com/ping?sitemap=${encodeURIComponent(
  PUBLIC_SITEMAP_URL,
)}`;
const PING_THROTTLE_MS = 60 * 60 * 1000;

let lastSitemapPingAt = 0;

export const revalidate = 3600;

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function maybePingGoogleSitemap() {
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const now = Date.now();
  if (now - lastSitemapPingAt < PING_THROTTLE_MS) return;
  lastSitemapPingAt = now;

  void fetch(GOOGLE_SITEMAP_PING_URL, { cache: 'no-store' })
    .then((response) => {
      console.info({
        ping_status: 'sent',
        timestamp: new Date().toISOString(),
        status: response.status,
      });
    })
    .catch((error) => {
      console.warn({
        ping_status: 'failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export async function GET() {
  const entries = await getProductEntitySitemapEntries(5000);
  const urls = entries.map((entry) =>
    [
      '  <url>',
      `    <loc>${escapeXml(entry.canonicalUrl)}</loc>`,
      `    <lastmod>${escapeXml(entry.updatedAt || new Date().toISOString())}</lastmod>`,
      '  </url>',
    ].join('\n'),
  );
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');

  maybePingGoogleSitemap();

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
