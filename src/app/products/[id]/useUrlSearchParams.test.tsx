import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { useUrlSearchParams } from './useUrlSearchParams';

function Probe({ initial }: { initial?: string }) {
  const params = useUrlSearchParams(initial);
  return <span>{params.get('merchant_id') ?? 'none'}|{params.get('pdp') ?? 'none'}</span>;
}

describe('useUrlSearchParams', () => {
  it('renders on the SERVER from the injected snapshot (no window access)', () => {
    // The whole point: this must be renderable without a DOM. next/navigation's
    // useSearchParams() would instead mark the subtree client-only.
    const html = renderToStaticMarkup(<Probe initial="?merchant_id=merch_a&pdp=beauty" />);
    expect(html).toContain('merch_a');
    expect(html).toContain('beauty');
  });

  it('defaults to empty on the anonymous canonical route', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('none|none');
  });
});

describe('PDP prerender guard', () => {
  it('ProductDetailClient must NOT import next/navigation useSearchParams', () => {
    // THE regression guard. Re-adding useSearchParams() to this component (or any
    // component in the PDP tree) emits BAILOUT_TO_CLIENT_SIDE_RENDERING under the
    // static/ISR prerender: an ERRORED Suspense boundary that is never backfilled,
    // so the entire product body vanishes from the HTML and crawlers see only a
    // "Loading products" skeleton (measured: 69 chars). That is what made the AEO
    // citation probe read 0/8. Use useUrlSearchParams instead.
    const src = readFileSync(join(__dirname, 'ProductDetailClient.tsx'), 'utf8');
    // Match the IMPORT (comments legitimately mention the hook by name).
    expect(src).not.toMatch(
      /import\s*\{[^}]*\buseSearchParams\b[^}]*\}\s*from\s*['"]next\/navigation['"]/,
    );
    expect(src).toContain('useUrlSearchParams');
  });
});
