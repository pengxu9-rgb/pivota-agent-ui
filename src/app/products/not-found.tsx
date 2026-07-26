import Link from 'next/link';

/**
 * 404 boundary for the product routes.
 *
 * Reached when the server render calls notFound() because the gateway gave a
 * settled "this product cannot render" answer: an `external_product_seeds` row
 * no longer 'active', or an index-gated product (`serving_eligible=false`,
 * ~6,400 content_keys as of 2026-07-26). Those URLs are still in Google's
 * index and still take real traffic while the sitemap catches up, so a human
 * landing here needs somewhere to go rather than a dead end.
 *
 * WHY IT LIVES AT `products/` AND NOT `products/[id]/`. #287 moved the
 * notFound() decision into `products/[id]/layout.tsx`, because that is the
 * only place on this route where the status code can still be set (the page
 * body runs after the shell has flushed — see that layout's docblock). A
 * not-found boundary cannot render inside the very layout that threw, so this
 * copy sat one segment too deep and Next silently fell through to its bare
 * built-in 404. Measured on the #287 branch before this move: HTTP 404 with
 * ZERO occurrences of "no longer available".
 *
 * Moving it UP one segment is the minimum that works. A root
 * `app/not-found.tsx` would also catch it, but would restyle every 404 on the
 * site; this stays scoped to `/products/*`. The tradeoff is that a 404 under a
 * sibling product route (`/products/indexability`) now shows product-flavoured
 * copy — accepted, as the alternative is a site-wide change and nothing else
 * under `/products/` 404s today.
 *
 * The status code is what matters for crawlers, and Next sets it to 404 for
 * this boundary regardless of what is rendered here.
 */
export default function ProductNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
        404
      </p>
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
        This product is no longer available
      </h1>
      <p className="text-base text-neutral-600 dark:text-neutral-300">
        It may have been discontinued or delisted by the retailer. Browse the
        catalog to find something similar.
      </p>
      <Link
        href="/products"
        className="mt-2 rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        Browse products
      </Link>
    </main>
  );
}
