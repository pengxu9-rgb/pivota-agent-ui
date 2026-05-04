import { getProductEntitySitemapEntries } from '@/app/products/[id]/pdpSeo';

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
  const productEntities = await getProductEntitySitemapEntries(50);

  return (
    <main>
      <h1>Pivota ProductEntity Index</h1>
      <p>Canonical Pivota ProductEntity product pages.</p>
      <ul>
        {productEntities.map((entry) => (
          <li key={entry.id}>
            {/* Google relies on internal links to discover pages. */}
            {/* Sitemap alone is not sufficient. */}
            <a href={`/products/${entry.id}`}>{entry.productName || entry.canonicalUrl}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
