const PUBLIC_BASE_URL = 'https://agent.pivota.cc';

export const revalidate = 3600;

export async function GET() {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <sitemap>',
    `    <loc>${PUBLIC_BASE_URL}/sitemap-products.xml</loc>`,
    '  </sitemap>',
    '</sitemapindex>',
  ].join('\n');

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
