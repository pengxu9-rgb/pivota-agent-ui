'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import ProductDetailClient from './ProductDetailClient';

/**
 * Segment error boundary for the static/ISR canonical PDP route.
 *
 * A degraded server render (gateway hiccup / empty payload) THROWS on this
 * route instead of shipping a 200 shell — a shell would be stored by the
 * full-route cache for `revalidate` seconds (see PDP_DEGRADED_RENDER_ERROR in
 * pdpServerPage). The throw keeps caches clean (failed fills store nothing;
 * failed background revalidations keep serving the last healthy page) and
 * lands here on CLIENT-SIDE navigations (the common human path: listing →
 * PDP), where this boundary renders the client PDP with no initial payload so
 * it refetches through the gateway on hydration — the same recovery behavior
 * the degraded shell used to provide. Hard navigations to a not-yet-cached
 * path during a hiccup get Next's generic 500 page instead (a failed ISR fill
 * cannot render boundaries); crawlers see the 500 status and simply retry
 * later, which is strictly better than indexing (or caching) an empty shell.
 */
export default function ProductDetailErrorBoundary({
  error: _error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const routeParams = useParams<{ id: string }>();
  const id = String(routeParams?.id ?? '');
  // ProductDetailClient expects the Next 15 promise-shaped params prop.
  // Memoized so re-renders (including suspense resumes) reuse one promise.
  const params = useMemo(() => Promise.resolve({ id }), [id]);

  return (
    <ProductDetailClient
      key={id}
      params={params}
      initialPayload={null}
      serviceRecommendations={[]}
    />
  );
}
