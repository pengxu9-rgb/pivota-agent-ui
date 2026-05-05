import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProductEntitySitemapEntries } from '@/app/products/[id]/pdpSeo';

const INDEXABILITY_PAGE_SIZE = 200;

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  return {
    title: `Pivota ProductEntity Index Page ${page}`,
    description: 'Paginated public links to canonical Pivota ProductEntity product pages.',
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ProductEntityIndexabilityPaginatedPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 2) notFound();

  const take = pageNumber * INDEXABILITY_PAGE_SIZE + 1;
  const productEntities = await getProductEntitySitemapEntries(take);
  const start = (pageNumber - 1) * INDEXABILITY_PAGE_SIZE;
  const visibleProducts = productEntities.slice(start, start + INDEXABILITY_PAGE_SIZE);
  const hasNextPage = productEntities.length > start + INDEXABILITY_PAGE_SIZE;
  if (!visibleProducts.length) notFound();

  return (
    <main>
      <h1>Pivota ProductEntity Index Page {pageNumber}</h1>
      <p>Canonical Pivota ProductEntity product pages.</p>
      <nav aria-label="ProductEntity index pagination">
        <Link
          href={
            pageNumber === 2
              ? '/products/indexability'
              : `/products/indexability/page/${pageNumber - 1}`
          }
        >
          Previous ProductEntity page
        </Link>
        {hasNextPage ? (
          <Link href={`/products/indexability/page/${pageNumber + 1}`}>
            Next ProductEntity page
          </Link>
        ) : null}
      </nav>
      <ul>
        {visibleProducts.map((entry) => (
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
