import { getProductEntitySitemapEntries } from '@/app/products/[id]/pdpSeo';

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
