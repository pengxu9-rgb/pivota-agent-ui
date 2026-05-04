import ProductsBrowseClient from './ProductsBrowseClient';
import { getProductEntitySitemapEntries } from './[id]/pdpSeo';

export const revalidate = 3600;

export default async function ProductsPage() {
  const productEntities = await getProductEntitySitemapEntries(50);

  return (
    <>
      <ProductsBrowseClient />
      <section className="sr-only" aria-label="Canonical ProductEntity links">
        <h2>Canonical Pivota ProductEntity pages</h2>
        <ul>
          {productEntities.map((entry) => (
            <li key={entry.id}>
              {/* Google relies on internal links to discover pages. */}
              {/* Sitemap alone is not sufficient. */}
              <a href={`/products/${entry.id}`}>{entry.productName || entry.id}</a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
