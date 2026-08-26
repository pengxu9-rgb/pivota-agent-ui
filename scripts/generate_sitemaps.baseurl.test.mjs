// The base URL this cron talks to is the one thing no other test covers, and it
// is the thing that broke.
//
// `PIVOTA_BACKEND_BASE_URL` is set in the Vercel runtime, so every serverless
// caller overrides the default and never exercises it. The scheduled sitemap
// refresh is the sole caller that falls through to it — .github/workflows/
// sitemaps.yml sets no backend env at all. When Railway was decommissioned on
// 2026-08-25 the default became a host that answers 404 to everything and every
// run from 19:48 UTC that day onward failed in the first fetch. The cron went
// red without the published sitemaps going stale — see the note on the constant
// in generate_sitemaps.mjs for why 9,095 feed rows and 8,469 URLs are not a
// freshness gap.
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

  // The NEXT_PUBLIC_ leg is a real fallback, not decoration: deleting it from
  // the resolver used to leave every case in this file green, so a refactor
  // could drop it and silently send a configured caller to the default.
  it('falls back to the NEXT_PUBLIC_ variant when only that one is set', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', 'https://public.example.com')
    expect(getCanonicalProductsBaseUrl()).toBe('https://public.example.com')
  })

  // Order matters when both are set: the server-only var wins.
  it('prefers PIVOTA_BACKEND_BASE_URL over the NEXT_PUBLIC_ variant', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://server.example.com')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', 'https://public.example.com')
    expect(getCanonicalProductsBaseUrl()).toBe('https://server.example.com')
  })

  // A non-URL value (someone exporting a bare hostname) must fall back rather
  // than be handed to `new URL(path, base)`, which throws on it.
  it('ignores a value that is not an absolute http(s) URL', () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'api.pivota.cc')
    vi.stubEnv('NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL', '')
    expect(getCanonicalProductsBaseUrl()).toBe('https://api.pivota.cc')
  })
})
