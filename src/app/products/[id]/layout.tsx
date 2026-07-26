import type { ReactNode } from 'react';
import { buildCanonicalPdpJsonLd, type PdpRouteProps } from './pdpServerPage';

/**
 * Emits the PDP's schema.org JSON-LD into the SERVER-RENDERED SHELL.
 *
 * `ProductDetailClient` calls `useSearchParams()` with no enclosing Suspense, so
 * under a static/ISR prerender Next emits `BAILOUT_TO_CLIENT_SIDE_RENDERING` for
 * the page subtree — an ERRORED boundary (`<!--$!-->`) that is never backfilled
 * into the HTML. So the page's own `<script type="application/ld+json">` never
 * reaches the raw bytes; non-JS crawlers (GPTBot, ClaudeBot, most LLM grounding
 * fetchers) saw only a skeleton: 69 characters of text, zero product facts.
 *
 * This is NOT ordinary Suspense streaming — a *pending* boundary does get
 * backfilled, so removing `loading.tsx` would not fix it. A LAYOUT renders
 * outside the bailed subtree, so markup emitted here does reach the raw HTML. `buildCanonicalPdpJsonLd` reuses the page's
 * React-`cache()`d fetch, so this costs no additional backend call, and it never
 * throws — the page keeps sole ownership of the DEGRADED-render decision.
 *
 * The NOT-FOUND decision is different, and it has to happen on this side of
 * the boundary. The same bail-out that keeps the page's markup off the wire
 * also means the shell — and HTTP 200 with it — is flushed before the page's
 * `notFound()` runs, so that call can only stream not-found UI into an
 * already-committed 200. Measured in production 2026-07-26: every gated PDP
 * served a CACHED SOFT-404 (200 + noindex + "This page could not be found"),
 * and #270's cohort had been doing so since it merged. So
 * `buildCanonicalPdpJsonLd` now owns it — it already has the outcome, and
 * running here means the 404 lands before the flush.
 */
export default async function ProductDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: PdpRouteProps['params'];
}) {
  // Also 404s an unbuildable id, before any markup is flushed.
  const jsonLd = await buildCanonicalPdpJsonLd(params);

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // Pre-serialized + sanitized inside buildProductJsonLd; dangerouslySet
          // so Next doesn't escape characters schema validators expect literally.
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      ) : null}
      {children}
    </>
  );
}
