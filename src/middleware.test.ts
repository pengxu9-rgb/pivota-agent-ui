// The 410 boundary: retired sigs answer Gone with a cacheable body; everything
// else — live sigs, alias routes, the listing — falls through untouched.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../public/retired-sigs.json', () => ({
  default: { sigs: ['sig_retired1'] },
}));

import { config, middleware } from './middleware';

function req(pathname: string) {
  return { nextUrl: { pathname } } as never;
}

describe('retired-sig middleware', () => {
  it('answers 410 for a retired sig with a cacheable HTML body', async () => {
    const res = middleware(req('/products/sig_retired1'));
    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toContain('s-maxage');
    expect(await res.text()).toContain('retired');
  });

  it('passes live sigs, alias routes, and the listing through', () => {
    expect(middleware(req('/products/sig_live')).status).toBe(200);
    expect(middleware(req('/products/m/sig_retired1')).status).toBe(200);
    expect(middleware(req('/products')).status).toBe(200);
  });

  it('does not 410 a deeper path that never existed', () => {
    // segments[2] matches at any depth, so this used to answer 410 for a URL
    // that should 404. The matcher is now a single segment, and the handler
    // must agree.
    expect(middleware(req('/products/sig_retired1/reviews')).status).toBe(200);
  });

  it('keeps the browser cache purgeable', () => {
    const cc = middleware(req('/products/sig_retired1')).headers.get('cache-control');
    // s-maxage is purged by a deploy; a browser max-age is not reachable by any
    // deploy, so a mistaken 410 must not be pinned client-side.
    expect(cc).toContain('s-maxage=');
    expect(cc).toContain('max-age=0');
  });

  it('the single-segment matcher is what ships', () => {
    expect(config.matcher).toBe('/products/:id');
  });
});
