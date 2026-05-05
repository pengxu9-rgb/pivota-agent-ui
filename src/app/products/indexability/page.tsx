import Link from 'next/link';
import { getProductEntitySitemapEntries } from '@/app/products/[id]/pdpSeo';

const INDEXABILITY_PAGE_SIZE = 200;

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
  const productEntities = await getProductEntitySitemapEntries(INDEXABILITY_PAGE_SIZE + 1);
  const visibleProducts = productEntities.slice(0, INDEXABILITY_PAGE_SIZE);
  const hasNextPage = productEntities.length > INDEXABILITY_PAGE_SIZE;

  return (
    <main>
      <h1>Pivota ProductEntity Index</h1>
      <p>Canonical Pivota ProductEntity product pages.</p>
      <ul>
        {visibleProducts.map((entry) => (
          <li key={entry.id}>
            {/* Google relies on internal links to discover pages. */}
            {/* Sitemap alone is not sufficient. */}
            <a href={`/products/${entry.id}`}>{entry.productName || entry.canonicalUrl}</a>
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <Link href="/products/indexability/page/2">Next ProductEntity page</Link>
      ) : null}
    </main>
  );
}
