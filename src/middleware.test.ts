// The 410 boundary: retired sigs answer Gone with a cacheable body; everything
// else — live sigs, alias routes, the listing — falls through untouched.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../public/retired-sigs.json', () => ({
  default: { sigs: ['sig_retired1'] },
}));

import { middleware } from './middleware';

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
});
