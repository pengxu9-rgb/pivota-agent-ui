// The base URL this cron talks to is the one thing no other test covers, and it
// is the thing that broke.
//
// `PIVOTA_BACKEND_BASE_URL` is set in the Vercel runtime, so every serverless
// caller overrides the default and never exercises it. The scheduled sitemap
// refresh is the sole caller that falls through to it — .github/workflows/
// sitemaps.yml sets no backend env at all. When Railway was decommissioned on
// 2026-08-25 the default became a host that answers 404 to everything, every
// run from 19:48 UTC that day onward failed in the first fetch, and the
// committed sitemaps froze at 8,469 URLs against a catalog past 9,000.
//
// So these assertions are deliberately about the CONSTANT, not about the
// resolution logic: the logic was never wrong.
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getCanonicalProductsBaseUrl } = await import('./generate_sitemaps.mjs')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getCanonicalProductsBaseUrl', () => {
  it('defaults to the production backend when no env override is set', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', '')
    expect(getCanonicalProductsBaseUrl()).toBe('https://api.pivota.cc')
  })

  // The specific failure, stated as its own case: any *.railway.app default is
  // dead by definition now, and so is a bare *.run.app URL — a Cloud Run
  // service URL moves when the service is recreated, which is exactly the kind
  // of silent rot this file exists to stop. Go through the load balancer.
  it('does not default to a decommissioned or unstable host', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', '')
    const base = getCanonicalProductsBaseUrl()
    expect(base).not.toMatch(/railway\.app/)
    expect(base).not.toMatch(/\.run\.app/)
  })

  it('still lets an explicit override win, so staging runs stay possible', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://staging.example.com/')
    expect(getCanonicalProductsBaseUrl()).toBe('https://staging.example.com')
  })

  // A non-URL value (someone exporting a bare hostname) must fall back rather
  // than be handed to `new URL(path, base)`, which throws on it.
  it('ignores a value that is not an absolute http(s) URL', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'api.pivota.cc')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', '')
    expect(getCanonicalProductsBaseUrl()).toBe('https://api.pivota.cc')
  })
})
