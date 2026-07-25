import type { ReactNode } from 'react';
import { buildCanonicalPdpJsonLd, type PdpRouteProps } from './pdpServerPage';

/**
 * Emits the PDP's schema.org JSON-LD into the SERVER-RENDERED SHELL.
 *
 * `loading.tsx` in this segment puts an implicit Suspense boundary around the
 * PAGE, so everything the page returns — including its `<script
 * type="application/ld+json">` — is streamed as an RSC flight chunk and only
 * materializes once React hydrates. Non-JS crawlers (GPTBot, ClaudeBot, most LLM
 * grounding fetchers) never run that step, so before this layout they received a
 * loading skeleton: 69 characters of readable text, zero product facts.
 *
 * A layout renders OUTSIDE that boundary, so markup emitted here lands in the raw
 * HTML every crawler can read. `buildCanonicalPdpJsonLd` reuses the page's
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
