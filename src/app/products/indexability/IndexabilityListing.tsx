import Link from 'next/link';
import type { Metadata } from 'next';
import {
  buildPaginationLinks,
  fetchIndexabilityPage,
  IndexabilityPageData,
} from './productsIndexability';

/**
 * Server-rendered shared listing component. Both
 *   /products/indexability         (page 1)
 *   /products/indexability/page/N  (page N)
 * delegate to this. No client JS — pure SSR so even non-JS crawlers can
 * follow links into every canonical PDP.
 */

const SITE_BASE = 'https://agent.pivota.cc';

export function buildIndexabilityMetadata(page: number): Metadata {
  const title =
    page === 1
      ? 'Pivota Product Index | Pivota'
      : `Pivota Product Index — Page ${page} | Pivota`;
  return {
    title,
    description:
      'Index of every canonical Pivota product PDP. Built for crawlers — ' +
      'real users should browse via /products with the interactive shopping UI.',
    alternates: {
      canonical:
        page === 1
          ? `${SITE_BASE}/products/indexability`
          : `${SITE_BASE}/products/indexability/page/${page}`,
    },
    robots: {
      // Index the listing itself — we want Google to crawl it. But its
      // links are the actual product surface; canonical preference still
      // belongs to the PDP pages, not the listing.
      index: true,
      follow: true,
    },
  };
}

function pageHref(page: number): string {
  return page === 1 ? '/products/indexability' : `/products/indexability/page/${page}`;
}

function ProductRow({
  product,
}: {
  product: IndexabilityPageData['products'][number];
}) {
  const href = `/products/${product.product_entity_id}`;
  return (
    <li className="border-b border-slate-100 py-3">
      <Link href={href} className="block hover:bg-slate-50 -mx-2 px-2 py-1 rounded">
        <div className="flex items-baseline gap-2">
          {product.brand ? (
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {product.brand}
            </span>
          ) : null}
          {product.category ? (
            <span className="text-xs text-slate-400">· {product.category}</span>
          ) : null}
        </div>
        <div className="text-base text-slate-900">{product.title}</div>
        <div className="mt-1 font-mono text-xs text-slate-400">
          {product.product_entity_id}
        </div>
      </Link>
    </li>
  );
}

function Pagination({
  currentPage,
  totalPages,
  hasMore,
}: {
  currentPage: number;
  totalPages: number | null;
  hasMore: boolean;
}) {
  const links = buildPaginationLinks(currentPage, totalPages);
  const prev = currentPage > 1 ? currentPage - 1 : null;
  const next = hasMore ? currentPage + 1 : null;

  return (
    <nav
      className="mt-8 flex flex-wrap items-center gap-2 text-sm"
      aria-label="Pagination"
    >
      {prev ? (
        <Link
          href={pageHref(prev)}
          rel="prev"
          className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
        >
          ← Previous
        </Link>
      ) : null}

      {links.map((p, idx) =>
        p === null ? (
          <span
            key={`gap-${idx}`}
            className="px-2 text-slate-400"
            aria-hidden="true"
          >
            …
          </span>
        ) : p === currentPage ? (
          <span
            key={p}
            className="rounded bg-slate-900 px-3 py-1 text-white"
            aria-current="page"
          >
            {p}
          </span>
        ) : (
          <Link
            key={p}
            href={pageHref(p)}
            className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
          >
            {p}
          </Link>
        ),
      )}

      {next ? (
        <Link
          href={pageHref(next)}
          rel="next"
          className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50"
        >
          Next →
        </Link>
      ) : null}
    </nav>
  );
}

export default async function IndexabilityListing({ page }: { page: number }) {
  const data = await fetchIndexabilityPage(page);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">
        Pivota Product Index
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Internal-link surface for crawlers — every canonical{' '}
        <code className="rounded bg-slate-100 px-1">sig_*</code> PDP, paginated.
        Real users should browse via{' '}
        <Link href="/products" className="text-blue-600 hover:underline">
          /products
        </Link>
        .
      </p>

      {data.errorMessage ? (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {data.errorMessage}
        </div>
      ) : null}

      <div className="mt-4 text-xs text-slate-500">
        Page {data.page}
        {data.totalPages !== null ? ` of ${data.totalPages}` : ''} · showing{' '}
        {data.products.length} products
      </div>

      {data.products.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">
          No products in the registry feed for this page.
        </p>
      ) : (
        <ul className="mt-4 list-none p-0">
          {data.products.map((p) => (
            <ProductRow key={p.product_entity_id} product={p} />
          ))}
        </ul>
      )}

      <Pagination
        currentPage={data.page}
        totalPages={data.totalPages}
        hasMore={data.hasMore}
      />

      <footer className="mt-12 border-t border-slate-100 pt-4 text-xs text-slate-400">
        Sitemap:{' '}
        <a href="/sitemap-products.xml" className="hover:underline">
          /sitemap-products.xml
        </a>
      </footer>
    </main>
  );
}
