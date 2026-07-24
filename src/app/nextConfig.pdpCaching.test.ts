import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.mjs';

// PDP caching contract at the next.config layer (crawl-collapse fix):
//
// 1. Merchant-personalized PDP requests (?merchant_id=...) MUST be rewritten
//    (beforeFiles — i.e. before the filesystem match) to the force-dynamic
//    /products/m/[id] alias route. The canonical /products/[id] route is
//    static/ISR and can never read searchParams: a dynamic-API touch during
//    on-demand static generation is a hard 500, not a fallback.
// 2. There must be NO static Cache-Control header for /products/*. A config
//    header is stamped on every response for the path — including degraded
//    shells that bailed out of static generation via unstable_noStore — so a
//    `public, s-maxage` header would tell CDNs to cache the empty shell even
//    though Next stored nothing. Next emits the correct header per render
//    outcome (s-maxage from `revalidate` on healthy ISR renders, no-store on
//    dynamic bail-outs).
describe('next config PDP caching contract', () => {
  it('rewrites merchant-personalized PDP requests to the dynamic alias route before the filesystem match', async () => {
    const rewrites = await nextConfig.rewrites();

    expect(Array.isArray(rewrites)).toBe(false);
    expect(rewrites.beforeFiles).toContainEqual({
      source: '/products/:id',
      has: [{ type: 'query', key: 'merchant_id' }],
      destination: '/products/m/:id',
    });
  });

  it('keeps the legacy proxy rewrites in afterFiles', async () => {
    const rewrites = await nextConfig.rewrites();
    const afterFileSources = (rewrites.afterFiles || []).map((rewrite) => rewrite.source);

    expect(afterFileSources).toEqual([
      '/agent/shop/v1/review-media/:path*',
      '/ucp/v1/:path*',
      '/.well-known/ucp',
      '/ucp/capabilities',
    ]);
  });

  it('sets no static Cache-Control header for /products/* (header must follow render outcome)', async () => {
    const headersFn = (nextConfig as { headers?: () => Promise<Array<{ source?: string }>> })
      .headers;
    const headerRules = headersFn ? await headersFn() : [];
    const productHeaderRules = headerRules.filter((rule) =>
      String(rule.source || '').startsWith('/products'),
    );

    expect(productHeaderRules).toEqual([]);
  });
});
