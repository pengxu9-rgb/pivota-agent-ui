import { getIndexableProductSitemapUrls } from '@/app/products/[id]/pdpSeo';

export const metadata = {
  title: 'Pivota ProductEntity Index',
  description:
    'Public index of canonical Pivota ProductEntity product pages for crawl discovery.',
  robots: {
    index: true,
    follow: true,
  },
};

export const revalidate = 3600;

export default async function ProductEntityIndexabilityPage() {
  const productUrls = await getIndexableProductSitemapUrls(200);

  return (
    <main>
      <h1>Pivota ProductEntity Index</h1>
      <p>Canonical Pivota ProductEntity product pages.</p>
      <ul>
        {productUrls.map((url) => (
          <li key={url}>
            <a href={url}>{url}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
