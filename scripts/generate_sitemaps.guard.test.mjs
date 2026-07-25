// Tests the WIRING, not the guard function.
//
// sitemap_lib.test.mjs covers sitemapIdGuard as a pure function, but that
// leaves the thing that actually protects production untested: whether
// generateSitemaps() still calls it before writing. Deleting the call block
// from generate_sitemaps.mjs kept every other test green — exactly the silent
// regression this PR exists to prevent, so it gets its own coverage.
//
// The guard is unreachable through normal data (readCanonicalProduct drops
// sig-less rows), so these tests mock that function to simulate a future
// regression there — the only way a bad URL can reach the writer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writeFile = vi.hoisted(() => vi.fn(async () => {}))
// Deliberately ENOENT. With no committed sitemap there is no previous count, so
// the shrink guard stands down and cannot mask the id guard these tests are
// about (the 1,500-row fixtures below are well under 50% of the real
// public/sitemap-products.xml). The count-guard and incumbency wiring — which
// DO need a previous file — live in generate_sitemaps.incumbency.test.mjs.
//
// This used to be implicit and accidental: the mock restated only `writeFile`,
// and `{ ...actual }` on a node builtin does NOT carry named exports through
// (vitest: `No "readFile" export is defined on the "node:fs/promises" mock`).
// Every readFile call threw a TypeError that the surrounding try/catch
// swallowed — same observable outcome, reached by a bug, and it left the ratio
// arm of sitemapCountGuard with no wiring coverage anywhere. Restate every
// named export the module under test imports.
const readFile = vi.hoisted(() =>
  vi.fn(async () => {
    const err = new Error('ENOENT: no such file or directory')
    err.code = 'ENOENT'
    throw err
  }),
)

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  // node builtins need `default` restated explicitly — spreading the namespace
  // does not carry it, and generate_sitemaps.mjs's importer resolves it.
  return { ...actual, default: { ...actual.default, readFile, writeFile }, readFile, writeFile }
})

// Partial mock: everything real except readCanonicalProduct, which we make
// permissive again (the pre-#274 ck fallback).
vi.mock('./sitemap_lib.mjs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    // A plain function, not vi.fn: restoreAllMocks() in afterEach would strip a
    // vi.fn's implementation and silently turn this into a row-dropping stub.
    readCanonicalProduct: (item) => {
      const sig = String(item?.sig_id || '').trim()
      const contentKey = String(item?.content_key || '').trim()
      const id = sig.startsWith('sig_') ? sig : contentKey
      // contentKey is the dedup key downstream — omitting it collapses every
      // row into one product and the count guard fires instead of the id guard.
      return id ? { id, contentKey, lastmod: undefined } : null
    },
  }
})

const { generateSitemaps } = await import('./generate_sitemaps.mjs')

function page(items) {
  return new Response(
    JSON.stringify({ items, total: items.length, limit: items.length, has_more: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function rows({ sigCount, ckCount }) {
  const out = []
  for (let i = 0; i < sigCount; i++) {
    out.push({
      sig_id: `sig_wired${String(i).padStart(5, '0')}`,
      content_key: `ck_wired${String(i).padStart(5, '0')}`,
      serving_eligible: true,
      renderable: true,
    })
  }
  for (let i = 0; i < ckCount; i++) {
    out.push({
      sig_id: '',
      content_key: `ck_offerfree${String(i).padStart(3, '0')}`,
      serving_eligible: true,
      renderable: true,
    })
  }
  return out
}

let previousExitCode

beforeEach(() => {
  previousExitCode = process.exitCode
  writeFile.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  // The refusal path logs to stderr by design; keep the suite output readable.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // Never let a deliberate failure leak into the runner's own exit status.
  process.exitCode = previousExitCode
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('generateSitemaps wiring — the id guard is actually called before writing', () => {
  it('refuses to write and exits non-zero when a non-sig URL reaches the writer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(rows({ sigCount: 1500, ckCount: 5 }))),
    )

    const result = await generateSitemaps()

    expect(result).toBeNull()
    expect(process.exitCode).toBe(1)
    // The whole point: nothing hit disk, so the last-known-good stays served.
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is not bypassable by SITEMAP_FORCE (unlike the shrink guard)', async () => {
    vi.stubEnv('SITEMAP_FORCE', '1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(rows({ sigCount: 1500, ckCount: 5 }))),
    )

    const result = await generateSitemaps()

    expect(result).toBeNull()
    expect(process.exitCode).toBe(1)
    expect(writeFile).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('writes normally when every row is sig-keyed (no false positive)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(rows({ sigCount: 1500, ckCount: 0 }))),
    )

    const result = await generateSitemaps()

    expect(result).not.toBeNull()
    expect(result.urlCount).toBe(1500)
    expect(process.exitCode).not.toBe(1)
    expect(writeFile).toHaveBeenCalled()
    const productsWrite = writeFile.mock.calls.find(([p]) =>
      String(p).endsWith('sitemap-products.xml'),
    )
    expect(productsWrite).toBeDefined()
    expect(productsWrite[1]).not.toContain('/products/ck_')
  })
})

describe('generateSitemaps wiring — the coverage guard is called before writing', () => {
  // A page that CLAIMS a large catalog but ends the walk immediately. This is
  // the shape a paging bug produces: the feed says 5,887 rows exist, the walk
  // consumed 1,500, and every other guard is happy — 1,500 clears the absolute
  // floor and (on a first run) there is no committed count to shrink from.
  function shortWalkPage(items, claimedTotal) {
    return new Response(
      JSON.stringify({ items, total: claimedTotal, limit: 1000, has_more: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  it('refuses to write when the walk consumed far fewer rows than the feed promised', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => shortWalkPage(rows({ sigCount: 1500, ckCount: 0 }), 5887)),
    )

    const result = await generateSitemaps()

    expect(result).toBeNull()
    expect(process.exitCode).toBe(1)
    // The whole point: the last-known-good sitemap keeps serving.
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('is not bypassable by SITEMAP_FORCE (a paging bug is never a catalog shrink)', async () => {
    vi.stubEnv('SITEMAP_FORCE', '1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => shortWalkPage(rows({ sigCount: 1500, ckCount: 0 }), 5887)),
    )

    const result = await generateSitemaps()

    expect(result).toBeNull()
    expect(process.exitCode).toBe(1)
    expect(writeFile).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('writes normally when the walk consumed everything the feed promised', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => shortWalkPage(rows({ sigCount: 1500, ckCount: 0 }), 1500)),
    )

    const result = await generateSitemaps()

    expect(result).not.toBeNull()
    expect(result.urlCount).toBe(1500)
    expect(process.exitCode).not.toBe(1)
    expect(writeFile).toHaveBeenCalled()
  })

  it('does not fire on a legitimate shortfall from filters (rows consumed, URLs dropped)', async () => {
    // 1,600 rows consumed against a promised 1,600, of which 100 are dropped
    // downstream. Coverage measures ROWS, so filter drops must not trip it.
    const items = [
      ...rows({ sigCount: 1500, ckCount: 0 }),
      ...Array.from({ length: 100 }, (_, i) => ({
        sig_id: `sig_dead${i}`,
        content_key: `ck_dead${i}`,
        serving_eligible: true,
        renderable: false,
      })),
    ]
    vi.stubGlobal('fetch', vi.fn(async () => shortWalkPage(items, 1600)))

    const result = await generateSitemaps()

    expect(result).not.toBeNull()
    expect(process.exitCode).not.toBe(1)
    expect(writeFile).toHaveBeenCalled()
  })
})

describe('generateSitemaps — a page that never succeeds aborts the whole run', () => {
  // The static-file analogue of the deleted route's "budget exhausted" path.
  // The route emitted a 503 (no sitemap at all); here the committed
  // last-known-good keeps serving, which is strictly better — but only if the
  // run refuses to write a partial set. Retries are driven with fake timers so
  // the test doesn't sit through the real 30s backoff ladder.
  it('propagates the failure and writes nothing when a mid-walk page exhausts its retries', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (input) => {
      const offset = Number(new URL(String(input)).searchParams.get('offset') || 0)
      if (offset === 0) {
        return new Response(
          JSON.stringify({
            items: rows({ sigCount: 1000, ckCount: 0 }),
            total: 3000,
            limit: 1000,
            has_more: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw new Error('backend unavailable')
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const run = generateSitemaps()
    const assertion = expect(run).rejects.toThrow('backend unavailable')
    await vi.runAllTimersAsync()
    await assertion

    // 1 good page + 4 attempts (initial + 3 retries) at the failing page.
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(writeFile).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
