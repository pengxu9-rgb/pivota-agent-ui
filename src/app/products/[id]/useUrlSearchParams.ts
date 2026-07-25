'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

// Live URL query string. Read on EVERY render (a string, so React's value
// comparison makes this stable), which means a router.replace/push that
// re-renders the tree is picked up even though it fires no popstate.
function getClientSnapshot(): string {
  return window.location.search;
}

/**
 * Drop-in replacement for Next's `useSearchParams()` that does NOT opt the route
 * out of static rendering.
 *
 * `useSearchParams()` marks its whole subtree client-only: during a static/ISR
 * prerender Next emits `BAILOUT_TO_CLIENT_SIDE_RENDERING` (`<!--$!-->`), an
 * ERRORED Suspense boundary whose fallback is permanent and never backfilled. On
 * the canonical PDP that meant the entire product body never reached the HTML —
 * crawlers saw 69 characters of "Loading products" and nothing else, which is the
 * mechanical reason the AEO citation probe measured 0/8.
 *
 * `useSyncExternalStore` avoids the bailout because the SERVER snapshot is a
 * plain value passed in by the server render (no `window`, no dynamic API), so
 * the tree prerenders; React then swaps to the live client snapshot during
 * hydration. That transition is the hook's designed behaviour, not a mismatch.
 *
 * Returns a `URLSearchParams`, so existing `.get()` / `.toString()` call sites
 * are unchanged.
 *
 * @param initialSearch query string the SERVER rendered with — `''` on the
 *   anonymous canonical route (which is anonymous by contract; merchant
 *   personalization lives on the force-dynamic /products/m/[id] alias).
 */
export function useUrlSearchParams(initialSearch = ''): URLSearchParams {
  const getServerSnapshot = useCallback(() => initialSearch, [initialSearch]);
  const search = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  return useMemo(() => new URLSearchParams(search), [search]);
}
