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
// Those specific 77 are now gone twice over — pivota-backend#1589 fixed the
// `renderable` predicate, and #289 added an agent-side serving-gate drop that
// withholds any row carrying an explicit `serving_eligible: false`. Neither
// touched the LABEL, and neither closed the lane: #289 keys on an explicit
// false, so a feed that simply omits the field still ships index-only URLs into
// a renderer with no INDEX_ELIGIBLE_READ. That population is what `index_only=`
// counts, and this file is the only thing standing between the next widening
// and the same silent misreport.
//
// The tests therefore assert against a fixture that deliberately contains
// index-only rows in the shape that can still reach the file, and they run the
// REAL readCanonicalProduct end to end through generateSitemaps() — a unit test
// of the counting expression would not have caught the original bug either
// (the expression was right; the name was wrong).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SITEMAP_MIN_PRODUCT_URLS } from './sitemap_lib.mjs'

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

// The index-only cohort AS IT CAN STILL REACH THE FILE after #289: admitted by
// `index_eligible`, with no `serving_eligible` field at all.
//
// The explicit `serving_eligible: false` shape — what the live feed emitted for
// all 77 — is no longer an index-only row in the sitemap, because #289's
// serving-gate drop removes it in readCanonicalProduct before it can be
// counted. That shape is covered separately below, where it must land in
// NEITHER bucket.
//
// The lane itself is NOT retired (see "keeps an index_eligible row the serving
// gate has NOT rejected" in sitemap_lib.test.mjs): the drop keys on an explicit
// false, so a feed that omits the field still ships index-only URLs — into a
// renderer that has no INDEX_ELIGIBLE_READ. That is precisely the population
// this header's `index_only=` exists to count.
function indexOnlyRow(i) {
  return {
    sig_id: `sig_indexonly${String(i).padStart(5, '0')}`,
    content_key: `ck_indexonly${String(i).padStart(5, '0')}`,
    index_eligible: true,
    renderable: true,
  }
}

// Must clear SITEMAP_MIN_PRODUCT_URLS, or the count guard refuses to write and
// nothing reaches writeFile to assert on. Derived from the constant rather than
// hardcoded at 1,500 so that raising the floor cannot silently turn every test
// in this file into "sitemap-products.xml was never written".
const SERVING_ROWS = SITEMAP_MIN_PRODUCT_URLS + 500
const INDEX_ONLY_ROWS = 77

function productSitemapXml() {
  const call = writeFile.mock.calls.find(([p]) => String(p).endsWith('sitemap-products.xml'))
  if (!call) {
    throw new Error(
      'sitemap-products.xml was never written — a guard refused the build ' +
        '(coverage, id or count). Check the fixture size against ' +
        `SITEMAP_MIN_PRODUCT_URLS (${SITEMAP_MIN_PRODUCT_URLS}).`,
    )
  }
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
      //
      // Indices are deliberately OUTSIDE the fixture ranges above. At
      // servingRow(900) this row shared a content_key with a row already in the
      // set, so if the content_depth filter stopped firing it would merge into
      // that product instead of adding a URL and every assertion here would
      // still pass — an inert fixture that looked like coverage.
      { ...indexOnlyRow(9001), renderable: false },
      { ...servingRow(9002), content_depth: false },
      // #289's serving-gate drop. This one is the reason the breakdown has to
      // be counted off the EMITTED set rather than the feed: it is the exact
      // cohort the old `source=serving_eligible` label was wrong about, it is
      // still index_eligible, and it must now show up in neither bucket
      // because it is no longer in the file.
      { ...indexOnlyRow(9003), serving_eligible: false },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(items)),
    )

    const xml = await generateSitemaps().then(() => productSitemapXml())
    const line = header(xml)
    const read = (key) => Number(line.match(new RegExp(`\\b${key}=(\\d+)`))[1])

    // The sum is structural (index_only is a subtraction), so this line is a
    // consistency check, not the teeth. The teeth are the two below: `urls`
    // has to match the file's OWN content, and the dropped rows must not have
    // landed in either bucket.
    expect(read('serving_eligible') + read('index_only')).toBe(read('urls'))
    expect(read('urls')).toBe((xml.match(/<loc>/g) || []).length)
    expect(read('index_only')).toBe(INDEX_ONLY_ROWS)
    expect(read('serving_eligible')).toBe(SERVING_ROWS)
  })

  // The subtle way the breakdown could go wrong: two sigs share a content_key,
  // the index-only one wins the ordering, and the flag is taken from the wrong
  // side — either OR'd across the group, or read off whichever row happened to
  // arrive last. Both report the emitted URL as serving_eligible on the
  // strength of a buyable sibling that is NOT in the file: the 2026-07-26 lie,
  // rebuilt one layer down.
  //
  // Swept across BOTH dimensions, because each one alone leaves a mutant alive:
  //
  //   emission order — with the serving row first, "follows the winning id" and
  //   "follows the incoming row" give the same answer, so one order pins
  //   neither.
  //
  //   which side wins — when only the index-only row ever wins, "correctly
  //   false" is indistinguishable from "flag dropped entirely" (both are
  //   falsy). The serving-wins case is what forces the flag to be carried.
  //
  // ~482 minted/mirror pairs share a content_key today, so this path is
  // load-bearing, not a curiosity.
  //
  // 32-hex beats 24-hex (preferSitemapId layer 2), so the winner is chosen by
  // which side gets the long sig — asserted below rather than assumed, since a
  // change to the ordering would otherwise turn this into a test of nothing.
  for (const indexOnlyWins of [true, false]) {
    for (const servingFirst of [true, false]) {
      const winner = indexOnlyWins ? 'index-only' : 'serving'
      it(`the dedup winner decides the bucket: ${winner} wins, serving row ${
        servingFirst ? 'first' : 'last'
      }`, async () => {
        const shared = 'ck_contested00000'
        const longSig = `sig_${'a'.repeat(32)}`
        const shortSig = `sig_${'b'.repeat(24)}`
        const indexOnlySig = indexOnlyWins ? longSig : shortSig
        const servingSig = indexOnlyWins ? shortSig : longSig
        const contested = [
          { sig_id: servingSig, content_key: shared, serving_eligible: true, renderable: true },
          // No `serving_eligible` field — the shape that survives #289's
          // serving gate (an explicit false would be dropped before the dedup
          // and this contest would never happen).
          { sig_id: indexOnlySig, content_key: shared, index_eligible: true, renderable: true },
        ]
        const items = [
          ...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)),
          ...(servingFirst ? contested : [...contested].reverse()),
        ]
        vi.stubGlobal(
          'fetch',
          vi.fn(async () => page(items)),
        )

        const xml = await generateSitemaps().then(() => productSitemapXml())

        expect(xml).toContain(`/products/${longSig}<`)
        expect(xml).not.toContain(`/products/${shortSig}<`)
        expect(header(xml)).toBe(
          `feed_health=ok urls=${SERVING_ROWS + 1} ` +
            `serving_eligible=${SERVING_ROWS + (indexOnlyWins ? 0 : 1)} ` +
            `index_only=${indexOnlyWins ? 1 : 0}`,
        )
      })
    }
  }

  // The health token has to be READ from the walk, not baked into the string.
  // Every other test here runs a clean walk, so `feed_health=ok` hardcoded into
  // the comment would satisfy all of them — and then a truncated or malformed
  // walk would publish a clean bill of health, which is the original bug with a
  // different subject.
  it('a malformed row reaches the file as feed_health=partial', async () => {
    const items = [
      ...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)),
      ...Array.from({ length: INDEX_ONLY_ROWS }, (_, i) => indexOnlyRow(i)),
      // Not one of the EXPECTED filters (renderable / content_depth / ck-only),
      // which are exempted so they cannot pin the label — this is a genuine
      // parse failure, the anomaly the signal exists for.
      'not-an-object',
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => page(items)),
    )

    await generateSitemaps()

    expect(header(productSitemapXml())).toBe(
      `feed_health=partial urls=${SERVING_ROWS + INDEX_ONLY_ROWS} ` +
        `serving_eligible=${SERVING_ROWS} index_only=${INDEX_ONLY_ROWS}`,
    )
  })

  // Every fixture above states `serving_eligible` explicitly as a boolean, so
  // none of them exercise the other shapes the predicate deliberately accepts.
  // Each row below is admitted to the sitemap by isSitemapEligibleProduct, so
  // each MUST land in one bucket or the other — and a predicate that mishandled
  // any of them would misreport a URL that is really in the file.
  it('counts the eligibility shapes the predicate actually accepts', async () => {
    const extras = [
      // The alias. isSitemapEligibleProduct admits on it, so the breakdown has
      // to read it too — dropping this arm is otherwise invisible.
      { sig_id: 'sig_alias0000', content_key: 'ck_alias0000', is_serving_eligible: true },
      // isTruthyEligibility accepts 1 and 'true', not just boolean true.
      { sig_id: 'sig_numeric000', content_key: 'ck_numeric000', serving_eligible: 1 },
      { sig_id: 'sig_stringy000', content_key: 'ck_stringy000', serving_eligible: 'true' },
      // Both flags — a row can be buyable AND citation-eligible. It is buyable,
      // so it belongs in serving_eligible, not index_only.
      {
        sig_id: 'sig_both00000',
        content_key: 'ck_both00000',
        serving_eligible: true,
        index_eligible: true,
      },
      // No serving flag at all (not merely false): admitted by index_eligible
      // alone, so it is index_only. The absent case and the explicit-false case
      // are different branches and both occur in the wild.
      { sig_id: 'sig_absent000', content_key: 'ck_absent000', index_eligible: true },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        page([...Array.from({ length: SERVING_ROWS }, (_, i) => servingRow(i)), ...extras]),
      ),
    )

    const xml = await generateSitemaps().then(() => productSitemapXml())

    // All five are advertised…
    expect((xml.match(/<loc>/g) || []).length).toBe(SERVING_ROWS + extras.length)
    // …four of them as buyable, one as citation-only.
    expect(header(xml)).toBe(
      `feed_health=ok urls=${SERVING_ROWS + 5} ` +
        `serving_eligible=${SERVING_ROWS + 4} index_only=1`,
    )
  })
})
