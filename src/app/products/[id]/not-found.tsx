import Link from 'next/link';

/**
 * 404 boundary for the canonical PDP route.
 *
 * Reached when the server render calls notFound() because the gateway gave a
 * settled "this product cannot render" answer — today that means an
 * `external_product_seeds` row whose status is no longer 'active' (127 of the
 * 1,901 sitemap URLs on 2026-07-25).
 *
 * Without this file those URLs fall through to Next's bare built-in 404. They
 * are still in Google's index and still receive real traffic while the sitemap
 * catches up, so the page needs to route a human somewhere useful rather than
 * dead-end them.
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
