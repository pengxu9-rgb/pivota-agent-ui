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
 * throws — the page keeps sole ownership of the degraded-render decision.
 */
export default async function ProductDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: PdpRouteProps['params'];
}) {
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
