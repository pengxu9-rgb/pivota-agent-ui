// The sitemap header is an AUDIT SURFACE, and it lied for months.
//
// public/sitemap-products.xml carried `source=serving_eligible urls=N`, where
// `source` was in fact the walk-HEALTH label (`ok`/`partial`/`truncated`, then
// spelled `serving_eligible…`). On 2026-07-26 the live file wore that label
// over 77 URLs that were index_eligible and NOT serving_eligible — admitted by
// INDEX_ELIGIBLE_SITEMAP=1 in prod — and all 77 returned a hard 500. Anyone
// auditing "did index-only rows get into the sitemap?" read the label and
// concluded no.
//
// pivota-backend#1589 fixed the `renderable` predicate and removed those
// specific 77, so the ONLY thing standing between the next widening and the
// same silent misreport is this file. These tests therefore assert against a
// fixture that deliberately contains index-only rows — the exact condition the
// old label got wrong — and they run the REAL readCanonicalProduct end to end
// through generateSitemaps(), because a unit test of the counting expression
// would not have caught the original bug either (the expression was right; the
// name was wrong).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writeFile = vi.hoisted(() => vi.fn(async () => {}))
// ENOENT: no committed sitemap, so the shrink guard and incumbency both stand
// down and cannot interfere with the header these tests are about. Every named
// export the module under test imports has to be restated — spreading a node
// builtin's namespace does not carry them (see generate_sitemaps.guard.test.mjs).
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

function page(items) {
  return new Response(
    JSON.stringify({ items, total: items.length, limit: items.length, has_more: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

// A buyable row: the backend says it is serving_eligible.
function servingRow(i) {
  return {
    sig_id: `sig_serving${String(i).padStart(5, '0')}`,
    content_key: `ck_serving${String(i).padStart(5, '0')}`,
    serving_eligible: true,
    renderable: true,
  }
}

// The cohort the old label hid: admitted by index_eligible ALONE. Explicitly
// `serving_eligible: false` rather than absent — that is the shape the live
// feed emitted for all 77 (renderable=true, serving_eligible=false,
// blocker_code='no_price'), and a test that only covered the absent case would
// pass against a predicate that read the field as "missing means index-only".
function indexOnlyRow(i) {
  return {
    sig_id: `sig_indexonly${String(i).padStart(5, '0')}`,
    content_key: `ck_indexonly${String(i).padStart(5, '0')}`,
    serving_eligible: false,
    index_eligible: true,
    renderable: true,
  }
}

// 1,500 clears SITEMAP_MIN_PRODUCT_URLS (1,000); below it the count guard
// refuses to write and nothing reaches writeFile to assert on.
const SERVING_ROWS = 1500
const INDEX_ONLY_ROWS = 77

function productSitemapXml() {
  const call = writeFile.mock.calls.find(([p]) => String(p).endsWith('sitemap-products.xml'))
  if (!call) throw new Error('sitemap-products.xml was never written')
  return String(call[1])
}

function header(xml) {
  const m = xml.match(/<!-- (.*?) -->/)
  if (!m) throw new Error(`no header comment in: ${xml.slice(0, 200)}`)
  return m[1]
}

let previousExitCode

beforeEach(() => {
  previousExitCode = process.exitCode
  writeFile.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.exitCode = previousExitCode
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sitemap header — the eligibility breakdown is measured, not asserted', () => {
  it('reports index-only rows as index_only, not as serving_eligible', async () => {
    const items = [
      ...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)),
      ...Array.from({ length: INDEX_ONLY_ROWS }, (_, i) => indexOnlyRow(i)),
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(items)),
    )

    const result = await generateSitemaps()

    // THE REGRESSION PIN. The old header would have read
    // `source=serving_eligible urls=1577` here — a clean bill of health over a
    // file that is 77 URLs of a different eligibility class.
    expect(header(productSitemapXml())).toBe(
      `feed_health=ok urls=${SERVING_ROWS + INDEX_ONLY_ROWS} ` +
        `serving_eligible=${SERVING_ROWS} index_only=${INDEX_ONLY_ROWS}`,
    )
    expect(result).toMatchObject({
      urlCount: SERVING_ROWS + INDEX_ONLY_ROWS,
      feedHealth: 'ok',
      servingEligibleCount: SERVING_ROWS,
      indexOnlyCount: INDEX_ONLY_ROWS,
    })
  })

  it('no longer claims an eligibility set in the health token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)))),
    )

    await generateSitemaps()

    const line = header(productSitemapXml())
    // `source=` is gone, and the health token can never again take an
    // eligibility-set name as its VALUE (`feed_health=serving_eligible` would
    // re-tell the same lie with a new key).
    expect(line).not.toMatch(/\bsource=/)
    expect(line).toMatch(/^feed_health=(ok|partial|truncated) /)
  })

  it('the two buckets always sum to the advertised url count', async () => {
    const items = [
      ...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)),
      ...Array.from({ length: INDEX_ONLY_ROWS }, (_, i) => indexOnlyRow(i)),
      // Dropped by the filters, so they must appear in NEITHER bucket: the
      // breakdown describes the file, not the feed.
      { ...indexOnlyRow(900), renderable: false },
      { ...servingRow(900), content_depth: false },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(items)),
    )

    const xml = await generateSitemaps().then(() => productSitemapXml())
    const line = header(xml)
    const read = (key) => Number(line.match(new RegExp(`\\b${key}=(\\d+)`))[1])

    expect(read('serving_eligible') + read('index_only')).toBe(read('urls'))
    // …and `urls` is the file's own truth, not a number carried alongside it.
    expect(read('urls')).toBe((xml.match(/<loc>/g) || []).length)
    expect(read('index_only')).toBe(INDEX_ONLY_ROWS)
  })

  it('an index-only URL that WINS the dedup is counted as index_only', async () => {
    // The subtle way the breakdown could go wrong: two sigs share a
    // content_key, the index-only one wins the ordering, and an OR across the
    // group would report the emitted URL as serving_eligible on the strength of
    // a buyable sibling that is not in the file.
    //
    // 32-hex beats 24-hex (preferSitemapId layer 2), so the index-only sig wins
    // — assert that below rather than trusting it, since a change to the
    // ordering would otherwise turn this into a test of nothing.
    const shared = 'ck_contested00000'
    const indexOnlyWinner = `sig_${'a'.repeat(32)}`
    const servingLoser = `sig_${'b'.repeat(24)}`
    const items = [
      ...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)),
      { sig_id: servingLoser, content_key: shared, serving_eligible: true, renderable: true },
      {
        sig_id: indexOnlyWinner,
        content_key: shared,
        serving_eligible: false,
        index_eligible: true,
        renderable: true,
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(items)),
    )

    const xml = await generateSitemaps().then(() => productSitemapXml())

    expect(xml).toContain(`/products/${indexOnlyWinner}<`)
    expect(xml).not.toContain(`/products/${servingLoser}<`)
    expect(header(xml)).toBe(
      `feed_health=ok urls=${SERVING_ROWS + 1} ` +
        `serving_eligible=${SERVING_ROWS} index_only=1`,
    )
  })
})
