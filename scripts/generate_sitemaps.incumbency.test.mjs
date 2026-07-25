// Wiring coverage for the incumbency layer of the content_key dedup.
//
// sitemap_lib.test.mjs covers preferSitemapId/parseSitemapProductIds as pure
// functions. That leaves the part that actually protects production untested:
// whether generateSitemaps() READS the committed sitemap and threads its ids
// into the dedup. Both halves can be deleted independently and every pure test
// stays green.
//
// This suite mocks node:fs/promises so the "committed" sitemap is a fixture
// rather than public/sitemap-products.xml — the real file changes every 6h on
// the cron, and a test whose expectations move with the live catalog is not a
// test.
//
// MOCK GOTCHA, and it was hiding a real gap: `{ ...await importOriginal() }`
// on a node builtin does NOT carry the named exports through
// (vitest throws `No "readFile" export is defined on the "node:fs/promises"
// mock`). generate_sitemaps.guard.test.mjs restated only `writeFile`, so under
// that mock every readFile call threw and got swallowed by the surrounding
// try/catch — previousCount was permanently null there, meaning the shrink
// guard's wiring was never actually exercised and its third case passed only
// because the guard had stood down. Restate every named export you use.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writeFile = vi.hoisted(() => vi.fn(async () => {}))
const readFile = vi.hoisted(() =>
  vi.fn(async () => {
    const err = new Error('ENOENT: no such file or directory')
    err.code = 'ENOENT'
    throw err
  }),
)

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, default: { ...actual.default, readFile, writeFile }, readFile, writeFile }
})

const { generateSitemaps } = await import('./generate_sitemaps.mjs')
const { buildSitemapUrlsetXml, productUrlEntries } = await import('./sitemap_lib.mjs')

// The measured P3 pair: a Path-C minted sig and the external_seed mirror sig it
// was minted from, sharing one content_key and rendering byte-equivalent PDPs.
// The mirror is the incumbent (it was the only renderable sig when the
// committed sitemap was generated).
//
// The hex values are chosen so the MINTED sig wins the pure hex/lexicographic
// ordering — that is the 183-of-441 direction where the pure rule replaces an
// indexed URL, and the only direction in which these tests can fail if the
// incumbency layer is removed. A fixture where the incumbent also happened to
// win lexicographically would pass with the whole feature deleted.
const MIRROR_SIG = `sig_${'f'.repeat(32)}`
const MINTED_SIG = `sig_${'0'.repeat(32)}`
const SHARED_CK = 'ck_p3_pair'

function filler(count, { renderable = true } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    sig_id: `sig_fill${String(i).padStart(28, '0')}`,
    content_key: `ck_fill${String(i).padStart(5, '0')}`,
    serving_eligible: true,
    renderable,
  }))
}

function row(sig, contentKey, extra = {}) {
  return { sig_id: sig, content_key: contentKey, serving_eligible: true, renderable: true, ...extra }
}

function stubFeed(items) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ items, total: items.length, limit: items.length, has_more: false }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  )
}

// Make the fixture the answer for sitemap-products.xml and ENOENT for the rest
// (so writeIfChanged always writes and we can read the bytes back).
function stubCommittedSitemap(ids) {
  const xml =
    ids === null
      ? null
      : buildSitemapUrlsetXml(productUrlEntries(ids.map((id) => ({ id, lastmod: null }))))
  readFile.mockImplementation(async (filePath) => {
    if (xml !== null && String(filePath).endsWith('sitemap-products.xml')) return xml
    const err = new Error('ENOENT: no such file or directory')
    err.code = 'ENOENT'
    throw err
  })
  return xml
}

function writtenProductIds() {
  const call = writeFile.mock.calls.find(([p]) => String(p).endsWith('sitemap-products.xml'))
  if (!call) return null
  return (String(call[1]).match(/<loc>https:\/\/agent\.pivota\.cc\/products\/([^<]+)<\/loc>/g) || [])
    .map((m) => decodeURIComponent(m.replace(/^<loc>https:\/\/agent\.pivota\.cc\/products\//, '').replace(/<\/loc>$/, '')))
}

let previousExitCode

beforeEach(() => {
  previousExitCode = process.exitCode
  writeFile.mockClear()
  readFile.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.exitCode = previousExitCode
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('incumbency wiring — the committed sitemap decides the dedup winner', () => {
  it('keeps the advertised mirror URL when P3 makes the minted sibling eligible', async () => {
    const previousIds = [...filler(1400).map((r) => r.sig_id), MIRROR_SIG]
    stubCommittedSitemap(previousIds)
    stubFeed([...filler(1400), row(MIRROR_SIG, SHARED_CK), row(MINTED_SIG, SHARED_CK)])

    const result = await generateSitemaps()

    expect(result).not.toBeNull()
    const ids = writtenProductIds()
    // Still ONE url for the shared content_key — the dedup is intact.
    expect(ids.filter((id) => id === MIRROR_SIG || id === MINTED_SIG)).toEqual([MIRROR_SIG])
    // And nothing else moved: same URL count as before, no product lost.
    expect(ids).toHaveLength(previousIds.length)
    expect(new Set(ids)).toEqual(new Set(previousIds))
    expect(result.urlCount).toBe(previousIds.length)
  })

  it('without the incumbency signal the minted sig takes the URL (the regression this prevents)', async () => {
    // Same feed, no committed file. This is the pre-fix behavior and it is what
    // would ship on the next cron tick: the URL silently changes.
    stubCommittedSitemap(null)
    stubFeed([...filler(1400), row(MIRROR_SIG, SHARED_CK), row(MINTED_SIG, SHARED_CK)])

    await generateSitemaps()

    const ids = writtenProductIds()
    expect(ids.filter((id) => id === MIRROR_SIG || id === MINTED_SIG)).toEqual([MINTED_SIG])
  })

  it('converges: a second run over its own output is a fixed point (no flip-flop)', async () => {
    const feed = [...filler(1400), row(MIRROR_SIG, SHARED_CK), row(MINTED_SIG, SHARED_CK)]

    stubCommittedSitemap(null)
    stubFeed(feed)
    await generateSitemaps()
    const firstRun = writtenProductIds()

    writeFile.mockClear()
    stubCommittedSitemap(firstRun)
    stubFeed(feed)
    await generateSitemaps()

    expect(writtenProductIds()).toEqual(firstRun)
  })

  it('never drops a product: a non-incumbent with no surviving duplicate keeps its URL', async () => {
    const lonely = `sig_${'9'.repeat(32)}`
    stubCommittedSitemap(filler(1400).map((r) => r.sig_id))
    stubFeed([...filler(1400), row(lonely, 'ck_lonely')])

    await generateSitemaps()

    const ids = writtenProductIds()
    expect(ids).toContain(lonely)
    expect(ids).toHaveLength(1401)
  })

  it('preserves the filter-before-dedup ordering: a renderable=false incumbent loses to its sibling', async () => {
    // #276's documented contract. Incumbency ORDERS candidates, it cannot
    // resurrect one: the renderable filter runs first, so a dead incumbent is
    // gone before the dedup sees it and the URL correctly rotates to the
    // sibling. If incumbency ran first this row would keep advertising a dead
    // URL forever — the #1583 bug with a lock on it.
    stubCommittedSitemap([...filler(1400).map((r) => r.sig_id), MIRROR_SIG])
    stubFeed([
      ...filler(1400),
      row(MIRROR_SIG, SHARED_CK, { renderable: false }),
      row(MINTED_SIG, SHARED_CK),
    ])

    await generateSitemaps()

    const ids = writtenProductIds()
    expect(ids).toContain(MINTED_SIG)
    expect(ids).not.toContain(MIRROR_SIG)
  })

  it('reports (does not hide) an incumbent displaced by a legacy pre-dedup sitemap', async () => {
    // A committed file that predates the dedup can carry BOTH sigs. Collapsing
    // to one is the correct outcome, but it drops an advertised URL, so it must
    // be logged rather than silent.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubCommittedSitemap([...filler(1400).map((r) => r.sig_id), MIRROR_SIG, MINTED_SIG])
    stubFeed([...filler(1400), row(MIRROR_SIG, SHARED_CK), row(MINTED_SIG, SHARED_CK)])

    await generateSitemaps()

    // Both were incumbents, so the pure ordering breaks the tie: exactly one
    // survives and the displaced one is named in the warning.
    const survivors = writtenProductIds().filter((id) => id === MIRROR_SIG || id === MINTED_SIG)
    expect(survivors).toEqual([MINTED_SIG])
    expect(warn.mock.calls.flat().join(' ')).toContain(MIRROR_SIG)
  })

  it('the committed file is really read: the shrink guard still refuses a genuine collapse', async () => {
    // Coverage the broken fs mock in generate_sitemaps.guard.test.mjs was
    // silently withholding — previousCount was always null there, so the
    // ratio arm of sitemapCountGuard had no wiring test at all.
    stubCommittedSitemap(filler(4000).map((r) => r.sig_id))
    stubFeed(filler(1200))

    const result = await generateSitemaps()

    expect(result).toBeNull()
    expect(process.exitCode).toBe(1)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('a missing committed file degrades to the pure ordering instead of throwing', async () => {
    stubCommittedSitemap(null)
    stubFeed(filler(1200))

    const result = await generateSitemaps()

    expect(result).not.toBeNull()
    expect(result.urlCount).toBe(1200)
  })
})
