#!/usr/bin/env node
// Regenerate the committed static sitemaps in public/.
//
//   node scripts/generate_sitemaps.mjs          (or: npm run sitemaps)
//   SITEMAP_FORCE=1 node scripts/generate_sitemaps.mjs   # bypass the shrink guard
//
// Why these are committed files and not a serverless route: GSC reported
// "Couldn't fetch" for ~2 months because the former force-dynamic route
// re-fetched the Railway catalog at request time — cold edge + cold backend
// meant Googlebot regularly hit a slow response or a 503
// (serving_eligible_unavailable). Six PRs (#218/#219/#223/#246/#252/#256)
// tuned budgets and caches around that fetch; none removed it. Static public/
// assets serve in <1s with no function invocation, survive deploys, cold
// starts, and regions. The committed file is the durable last-known-good that
// PR #246's in-memory snapshot could never be.
//
// Regeneration cadence: .github/workflows/sitemaps.yml (every 6h + manual).
// The files carry no generated-at timestamp on purpose — output is
// deterministic (sorted by product id) so the workflow only commits (and
// Vercel only redeploys) when the catalog actually changed; git history is
// the generated-at record.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PIVOTA_CANONICAL_PAGE_SIZE,
  SITEMAP_MAX_URLS,
  buildSitemapIndexXml,
  buildSitemapUrlsetXml,
  countLocs,
  mergeDuplicateProduct,
  parseSitemapProductIds,
  productUrlEntries,
  readCanonicalProduct,
  sitemapCountGuard,
  sitemapCoverageVerdict,
  sitemapIdGuard,
  sitemapIndexEntries,
  staticSitemapEntries,
} from './sitemap_lib.mjs'

const DEFAULT_CANONICAL_PRODUCTS_BASE_URL = 'https://web-production-fedb.up.railway.app'
// CI budgets, not serverless budgets: the first request must survive a
// Railway idle cold start (>30s observed), and the whole run can take minutes.
const PAGE_TIMEOUT_MS = 60000
const PAGE_RETRY_DELAYS_MS = [2000, 8000, 20000]

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

class CanonicalProductsFetchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CanonicalProductsFetchError'
  }
}

function getCanonicalProductsBaseUrl() {
  const configured = (
    process.env.PIVOTA_BACKEND_BASE_URL ||
    process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '')

  if (/^https?:\/\//.test(configured)) return configured
  return DEFAULT_CANONICAL_PRODUCTS_BASE_URL
}

// Returns null for ABSENT/unparseable — never a number standing in for
// "unknown". The distinction is load-bearing for `total`: this feed returns
// `total` ONLY on the first page (offset>0 and cursor pages answer
// `total: null`), so every page after the first hits the absent branch.
//
// The trap this guards, and why the nullish check cannot be dropped:
// `Number(null)` is 0, and 0 passes `Number.isFinite`, and `0 < 0` is false —
// so a plain `Number()` coercion turned an honest "unknown" into a confident
// `total = 0`. Downstream, `offset < total` is then permanently false and the
// intended `items.length >= limit` fallback becomes unreachable, capping the
// walk at one page. `Number('')`, `Number([])`, and `Number(false)` are 0 too,
// hence the type gate rather than a bare `value == null` check.
// (Same shape as the `Number(x ?? 0)` trap in pivota-backend#1819, where an
// honest null collapsing to 0 silently dropped in-stock products.)
function readInteger(value, min) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min) return null
  return Math.floor(n)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchCanonicalProductsPageOnce(baseUrl, { offset = 0, cursor = null }) {
  const url = new URL('/api/canonical/products', baseUrl)
  url.searchParams.set('limit', String(PIVOTA_CANONICAL_PAGE_SIZE))
  if (cursor) {
    url.searchParams.set('cursor', cursor)
  } else {
    url.searchParams.set('offset', String(offset))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout))

  if (!res.ok) {
    throw new CanonicalProductsFetchError(
      `canonical products fetch failed with status ${res.status}`,
    )
  }

  const data = await res.json()
  if (!data || typeof data !== 'object') {
    throw new CanonicalProductsFetchError('canonical products fetch returned invalid JSON')
  }

  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: readInteger(data.total, 0),
    limit: readInteger(data.limit, 1) || PIVOTA_CANONICAL_PAGE_SIZE,
    hasMore: typeof data.has_more === 'boolean' ? data.has_more : null,
    nextCursor:
      typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null,
  }
}

async function fetchCanonicalProductsPage(baseUrl, params) {
  const pageLabel = params.cursor ? `cursor=${params.cursor}` : `offset=${params.offset}`
  let lastError
  for (let attempt = 0; attempt <= PAGE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      const delay = PAGE_RETRY_DELAYS_MS[attempt - 1]
      console.warn(
        `${pageLabel}: attempt ${attempt} failed (${lastError?.message}); retrying in ${delay}ms`,
      )
      await sleep(delay)
    }
    try {
      return await fetchCanonicalProductsPageOnce(baseUrl, params)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function collectSitemapProducts(baseUrl, options = {}) {
  // Ids already advertised by the committed sitemap — they win their
  // content_key's dedup so an indexed URL is never swapped for an equivalent
  // sibling. See preferSitemapId for the full rationale. An empty/absent set
  // reproduces the pre-incumbency ordering exactly.
  //
  // Duck-typed on `.has` to match preferSitemapId exactly. An `instanceof Set`
  // check here would disagree with the one downstream, so passing an Array
  // (the obvious thing a future caller or test writes) would silently disable
  // incumbency on a run that otherwise looks perfectly healthy.
  const incumbentIds =
    options.incumbentIds && typeof options.incumbentIds.has === 'function'
      ? options.incumbentIds
      : new Set()

  // Keyed by content_key — ONE URL per product. Duplicate signatures for the
  // same content_key are merged via mergeDuplicateProduct (deterministic id,
  // max lastmod) instead of each minting their own sitemap entry.
  const productsByContentKey = new Map()
  let offset = 0
  let cursor = null
  let stoppedForCap = false
  let sawInvalidCanonicalItem = false
  let cursorPages = 0
  let offsetPages = 0
  // Coverage bookkeeping: rows the feed PROMISED vs rows we actually consumed.
  // `feedTotal` is read from the FIRST page only, by page index rather than by
  // "first non-null" — this feed computes the COUNT(*) solely on the
  // offset=0/no-cursor branch, so a total arriving later would describe a
  // different window than `rowsSeen` has already accumulated and would make
  // the ratio meaningless (rows_seen=3000/1000).
  let feedTotal = null
  let rowsSeen = 0
  let pageIndex = 0
  // Drop funnel — every row that does not become a URL lands in exactly one
  // bucket, so emitted URLs + drops always reconciles against `rowsSeen`.
  const dropped = { notEligibleOrMalformed: 0, dead: 0, thin: 0, tombstoned: 0, mergedDuplicate: 0, skippedAtCap: 0 }
  // Does the feed carry `content_depth` at all? Distinguishes an inert floor
  // (backend predates the field) from an engaged one that found nothing to
  // drop — see the bucket note below.
  let sawContentDepthField = false

  while (productsByContentKey.size < SITEMAP_MAX_URLS) {
    const usingCursor = Boolean(cursor)
    const page = await fetchCanonicalProductsPage(baseUrl, usingCursor ? { cursor } : { offset })
    if (usingCursor) cursorPages++
    else offsetPages++
    if (pageIndex === 0) feedTotal = page.total
    pageIndex++
    rowsSeen += page.items.length
    if (page.items.length === 0) break

    let consumedThisPage = 0
    for (const item of page.items) {
      consumedThisPage++
      // Presence, not truthiness — an all-true `content_depth` still proves the
      // producer shipped, which is the thing `dropped_thin=0` cannot tell you.
      if (item && typeof item === 'object' && 'content_depth' in item) {
        sawContentDepthField = true
      }
      const product = readCanonicalProduct(item)
      if (!product) {
        // A renderable=false drop is the EXPECTED dead-PDP filter, not a
        // malformed row — don't let it pin feed_health to "partial"
        // forever (that label is the anomaly signal for parse failures).
        //
        // Same reasoning for a ck-only row (valid content_key, no minted sig):
        // readCanonicalProduct now rejects those because /products/{ck} 500s,
        // but they are perfectly well-formed rows, not parse failures. Without
        // this arm every regeneration would report `feed_health=partial`
        // for as long as the feed contains one such row — permanently retiring
        // the very anomaly signal this block exists to protect.
        //
        // …and the same again for content_depth=false, the thin-content floor.
        // That drop fires on 437 rows as of 2026-07-26, the day its producer
        // (pivota-backend#1591) went live. Without this arm the label would read
        // `partial` on every run from that deploy onward and never unpin.
        // Every expected filter in readCanonicalProduct needs an arm here; only
        // a genuinely malformed row may set the flag.
        //
        // …and the same again for serving_eligible=false, the serving-gate
        // drop. That one fires on 77 rows TODAY, so omitting it would pin the
        // label to `partial` on the FIRST cron run after it ships and never
        // unpin it — permanently retiring the only signal that would surface a
        // renamed field, malformed rows, or a truncated payload.
        //
        // Thin rows get their OWN bucket rather than folding into `dead`. The
        // floor sat inert for a full release because nothing in this output
        // distinguished "the floor dropped nothing" from "the floor is not
        // running": both read as the same `dropped_dead` number. Now that the
        // producer is live, `dropped_thin` should sit around 437. A sudden 0 is
        // AMBIGUOUS, and the two readings are opposites: on a feed that still
        // HAS content_depth it means the thin cohort was authored away, which
        // is a win; on a feed without the field it means the producer stopped
        // emitting, which is a regression. The WARNING below fires only in the
        // second case, so its presence or absence is what tells them apart.
        //
        // NOTE ON READING THIS NUMBER: `dropped_thin` counts ROWS, not URLs.
        // Only 8 of the 437 remove a product from the sitemap; the other 429
        // are duplicate sigs whose content_key keeps a deep sibling, so the
        // product stays under a different sig. See the STATUS block in
        // sitemap_lib.mjs — the row count overstates the URL effect ~55x
        // (437/8). Not to be confused with the ~45x elsewhere in this change,
        // which is the unrelated predicted-vs-actual ratio (364/8).
        const isPlainItem = item && typeof item === 'object'
        const droppedAsDead =
          isPlainItem &&
          (item.renderable === false ||
            item.serving_eligible === false ||
            item.is_serving_eligible === false ||
            (String(item.content_key || '').startsWith('ck_') &&
              !String(item.sig_id || '').trim().startsWith('sig_')))
        // Mirror readCanonicalProduct's order: it tests eligibility and
        // `renderable` BEFORE `content_depth`, so a row failing an earlier gate
        // too is attributed to `dead` there and must be attributed to `dead`
        // here too, or the funnel double-counts a single drop.
        const droppedAsThin = !droppedAsDead && isPlainItem && item.content_depth === false
        // Same ordering rule again: readCanonicalProduct tests content_depth
        // BEFORE tombstoned, so a row failing both is attributed to `thin`
        // there and must be attributed to `thin` here, or the funnel
        // double-counts one drop. Its own bucket rather than folding into
        // `dead` for the reason the thin cohort got one: `dropped_tombstoned=0`
        // must be readable as "the row layer retired nothing" and not be
        // indistinguishable from "the backend stopped emitting the field".
        // Unlike `thin`, this bucket is ~1:1 with URLs REMOVED — only 2 of the
        // 187 measured on 2026-07-29 had a clean sibling to take the URL over.
        const droppedAsTombstoned =
          !droppedAsDead && !droppedAsThin && isPlainItem && item.tombstoned === true
        if (droppedAsDead) dropped.dead++
        else if (droppedAsThin) dropped.thin++
        else if (droppedAsTombstoned) dropped.tombstoned++
        else {
          dropped.notEligibleOrMalformed++
          sawInvalidCanonicalItem = true
        }
        continue
      }
      const existing = productsByContentKey.get(product.contentKey)
      if (existing) {
        productsByContentKey.set(
          product.contentKey,
          mergeDuplicateProduct(existing, product, incumbentIds),
        )
        dropped.mergedDuplicate++
        continue
      }
      productsByContentKey.set(product.contentKey, product)
      if (productsByContentKey.size >= SITEMAP_MAX_URLS) {
        // Hitting the cap mid-page IS a truncation, even when this happens to
        // be the last page (has_more=false) and the walk would have ended
        // anyway. Setting the flag here rather than only in the has_more arm
        // below keeps the `truncated` label honest, and bucketing the
        // unvisited remainder keeps the funnel reconciling with rowsSeen.
        stoppedForCap = true
        dropped.skippedAtCap += page.items.length - consumedThisPage
        break
      }
    }

    // Keep `offset` in step as a fallback resume anchor: if the backend
    // stops emitting next_cursor mid-crawl (a widened-sitemap page whose
    // last row has a NULL sig_id, which the backend can't mint a cursor
    // from), the next page pages by offset from where we left off rather
    // than restarting at 0. Advance by ACTUAL rows returned, not the
    // nominal page size: the offset-resume point must equal rows consumed,
    // so a short page (fewer items than `limit`) can't make us skip rows.
    offset += page.items.length
    // PAGING STRATEGY (decided 2026-07-25) — three ranked signals, most authoritative
    // first. Each arm is only consulted when the one above it is genuinely
    // ABSENT, never when it is present-but-zero:
    //
    //   1. `has_more` — the backend's own answer. Today's feed sets it on every
    //      page, so this is the arm that actually runs in production.
    //   2. `offset < total` — only usable on page 1, because this feed returns
    //      `total` on the first page ONLY. Reached whenever a backend omits
    //      has_more. `page.total === null` here means UNKNOWN, and readInteger
    //      guarantees that a missing `total` arrives as null rather than 0 —
    //      without that guarantee this arm swallows the arm below it forever.
    //   3. `items.length >= limit` — the last-resort heuristic: a page filled
    //      to the limit implies another page may exist. Terminates on the
    //      first short page.
    //
    // The walk itself prefers the keyset cursor over offset (see below); this
    // chain only decides WHETHER to fetch another page, not how to address it.
    const hasMore =
      page.hasMore !== null
        ? page.hasMore
        : page.total !== null
          ? offset < page.total
          : page.items.length >= page.limit

    if (productsByContentKey.size >= SITEMAP_MAX_URLS && hasMore) {
      stoppedForCap = true
      break
    }
    if (!hasMore) break

    // Prefer the backend's keyset cursor (pivota-backend PR #1239): it seeks
    // on the sort key, so page cost stays constant instead of growing with
    // OFFSET depth (deep pages could trip the backend's 4s DB timeout).
    // Backends that predate next_cursor keep paging by offset.
    cursor = page.nextCursor
    if (usingCursor && !cursor) {
      // Downgrade cursor→offset (see above). Rare and self-correcting, but
      // loud because a wrong offset anchor here silently truncates the set.
      console.warn(
        `pagination downgraded to offset at offset=${offset} ` +
          `(backend returned has_more with no next_cursor)`,
      )
    }
  }

  console.log(
    `pagination: ${cursorPages + offsetPages} page(s) ` +
      `(cursor=${cursorPages}, offset=${offsetPages})`,
  )
  // The reconciliation line. Every row the feed handed us is accounted for, so
  // a shortfall can be attributed to a filter (expected) or to paging
  // (a bug) by reading one line of cron output instead of re-deriving it.
  console.log(
    `coverage: rows_seen=${rowsSeen}/${feedTotal ?? 'unknown'} ` +
      `urls=${productsByContentKey.size} ` +
      `dropped_dead=${dropped.dead} ` +
      `dropped_thin=${dropped.thin} ` +
      `dropped_tombstoned=${dropped.tombstoned} ` +
      `dropped_ineligible_or_malformed=${dropped.notEligibleOrMalformed} ` +
      `merged_duplicate_sigs=${dropped.mergedDuplicate} ` +
      `skipped_at_cap=${dropped.skippedAtCap}`,
  )
  if (!sawContentDepthField && rowsSeen > 0) {
    // THIS USED TO BE A BENIGN NOTE AND IS NOW A REGRESSION SIGNAL. While the
    // producer was unmerged, an absent field was the expected state — the floor
    // is deliberately built to ship before its backend. Since
    // pivota-backend#1591 deployed on 2026-07-26 the field arrives on every
    // row, so absence now means it STOPPED arriving: a rollback (which already
    // happened once, #1588 → #1590), a renamed field, or a truncated payload.
    //
    // Deliberately a warn, not a throw. The floor failing open is the designed
    // behaviour and the sitemap it produces is still valid — just unfiltered.
    // Being loud is enough; refusing to publish over it would be worse.
    console.warn(
      `WARNING: the feed carries no content_depth field on any of ${rowsSeen} row(s). ` +
        'The thin-content floor is INERT and dropped nothing. It was live as of ' +
        '2026-07-26 (pivota-backend#1591), so this means the field stopped ' +
        'arriving — check for a backend rollback or a renamed field.',
    )
  }
  if (feedTotal === null) {
    // Not fatal — a backend that never reports `total` is a supported shape —
    // but it disables the coverage verdict, and losing a guard should never be
    // silent.
    console.warn(
      'coverage: feed reported no `total` on the first page — the coverage ' +
        'guard is INACTIVE for this run (paging truncation cannot be detected).',
    )
  }

  // Deterministic order: backend pagination order is mutable
  // (content_changed_at DESC), which would produce a different diff — and
  // therefore a commit + deploy — on every run even for an unchanged catalog.
  const products = Array.from(productsByContentKey.values())
  products.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  // Every previously advertised URL that is NOT in this build. Deliberately a
  // set difference against the FINAL output rather than bookkeeping inside the
  // merge loop: it catches all the ways an advertised URL can disappear, not
  // just the one incumbency guards against. A merge-time tally missed two real
  // cases — a row dropped by the eligibility/renderable filter or gone from the
  // feed never enters a merge at all (the COMMON cause), and a break on
  // SITEMAP_MAX_URLS can end the crawl before a late-arriving incumbent sibling
  // is ever merged. It also can't produce the false alarm a merge-time tally
  // can, where a duplicate sig_id wins one content_key and loses another.
  //
  // Not an assertion. Most entries here are correct and expected — a URL whose
  // row went renderable=false SHOULD leave the sitemap (#1583's dead URLs).
  // The point is that losing an advertised URL is never invisible.
  const outputIds = new Set(products.map((p) => p.id))
  const lostIncumbentIds = Array.from(incumbentIds)
    .filter((id) => !outputIds.has(id))
    .sort()

  return {
    products,
    lostIncumbentIds,
    // HEALTH, not provenance. This says whether the WALK was clean — it says
    // nothing about which eligibility gate admitted the rows, and it used to be
    // named `source` and valued `serving_eligible…`, which read as exactly the
    // claim it does not make (see the header construction in generateSitemaps).
    feedHealth: sawInvalidCanonicalItem ? 'partial' : stoppedForCap ? 'truncated' : 'ok',
    // Fed to sitemapCoverageVerdict. `stoppedForCap` is passed through because
    // a cap stop is a LEGITIMATE short walk (already labelled `truncated`) and
    // must not be reported as a paging failure.
    coverage: { rowsSeen, feedTotal, stoppedForCap, dropped },
  }
}

// Reads the committed product sitemap once and derives both things we need
// from it: the shrink guard's previous count and the dedup's incumbent ids.
// A missing file yields `{ count: null, ids: empty }` — first run / fresh
// clone, guard and incumbency both stand down.
async function readExistingProductSitemap(filePath) {
  try {
    const xml = await readFile(filePath, 'utf8')
    return { count: countLocs(xml), ids: parseSitemapProductIds(xml) }
  } catch (error) {
    // ENOENT is routine: first run, fresh clone, or a checkout without public/.
    // ANYTHING ELSE is not, and it now costs more than it used to. Before
    // incumbency this catch only stood the shrink guard down; now the same
    // swallow also silently re-picks every duplicate content_key
    // lexicographically — 183 indexed URLs churned, as measured — on a cron that
    // commits straight to main with no review. Stay non-fatal (a readable
    // catalog with no previous file must still publish) but never silent.
    if (error?.code !== 'ENOENT') {
      console.warn(
        `WARNING: could not read ${filePath} (${error?.code || error?.message}). ` +
          `Proceeding with NO incumbent URLs and NO shrink-guard baseline: the ` +
          `content_key dedup will re-pick winners by sig class + lexicographic ` +
          `order, which can replace already-indexed URLs. Expected only when the ` +
          `file is genuinely absent (ENOENT) — investigate any other cause before ` +
          `trusting this run's output.`,
      )
    }
    return { count: null, ids: new Set() }
  }
}

async function writeIfChanged(filePath, content) {
  try {
    if ((await readFile(filePath, 'utf8')) === content) {
      return false
    }
  } catch {
    // File missing — write it.
  }
  await writeFile(filePath, content, 'utf8')
  return true
}

export async function generateSitemaps() {
  const baseUrl = getCanonicalProductsBaseUrl()
  const productsPath = path.join(PUBLIC_DIR, 'sitemap-products.xml')

  // Read BEFORE fetching: the committed file supplies the dedup's incumbent
  // ids as well as the shrink guard's previous count.
  const previous = await readExistingProductSitemap(productsPath)
  const previousCount = previous.count

  console.log(
    `fetching canonical products from ${baseUrl} ` +
      `(incumbent urls=${previous.ids.size}) ...`,
  )

  const { products, feedHealth, coverage, lostIncumbentIds } = await collectSitemapProducts(
    baseUrl,
    { incumbentIds: previous.ids },
  )
  const urls = productUrlEntries(products)

  // Checked FIRST: a short walk poisons every downstream number, so the other
  // guards would be judging a set that was never fully read. This is also the
  // only guard that can catch truncation on a first run, before there is a
  // committed count to shrink away from.
  const coverageVerdict = sitemapCoverageVerdict(coverage)
  if (coverageVerdict.level === 'refuse') {
    console.error(
      `REFUSING to write sitemaps: ${coverageVerdict.message}.\n` +
        `Publishing it would advertise a fraction of the catalog and let ` +
        `crawlers cache that fraction as THE sitemap. Check the ` +
        `pagination/coverage lines above (has_more, next_cursor, total); ` +
        `SITEMAP_FORCE does NOT bypass this guard.`,
    )
    process.exitCode = 1
    return null
  }
  if (coverageVerdict.level === 'warn') {
    // Loud, but NOT fatal — see sitemapCoverageVerdict for why publishing a
    // ~1%-short build beats freezing the last one.
    console.warn(`coverage WARNING: ${coverageVerdict.message}`)
  }

  const keptIncumbents = products.reduce((n, p) => n + (previous.ids.has(p.id) ? 1 : 0), 0)
  console.log(
    `incumbency: kept=${keptIncumbents}/${previous.ids.size} ` +
      `new=${products.length - keptIncumbents} dropped=${lostIncumbentIds.length}`,
  )
  if (lostIncumbentIds.length > 0) {
    // Usually correct and expected (see lostIncumbentIds), so this is a NOTE,
    // not an alarm — but every dropped URL is a page crawlers will keep asking
    // for, so the count belongs in the run log where the diff can be checked
    // against it. Likely causes, roughly in order: the row went
    // renderable=false or left the feed (correct — #1583's dead URLs); two
    // content_keys merged by re-identification, putting two incumbents in one
    // group; or a committed sitemap that predates the content_key dedup.
    console.warn(
      `NOTE: ${lostIncumbentIds.length} previously advertised URL(s) are not in this ` +
        `build: ${lostIncumbentIds.slice(0, 5).join(', ')}` +
        `${lostIncumbentIds.length > 5 ? ', …' : ''}`,
    )
  }

  // Checked before the shrink guard: a non-sig URL is the more specific and
  // more actionable failure, and it is the one SITEMAP_FORCE must never wave
  // through.
  const idViolation = sitemapIdGuard(urls)
  if (idViolation) {
    console.error(
      `REFUSING to write sitemaps: ${idViolation}.\n` +
        `Advertising a URL that errors is strictly worse than omitting it — it ` +
        `burns crawl budget and teaches crawlers the domain is flaky. Fix ` +
        `readCanonicalProduct (or mint sigs for these rows); SITEMAP_FORCE does ` +
        `NOT bypass this guard.`,
    )
    process.exitCode = 1
    return null
  }

  const guardViolation = sitemapCountGuard(urls.length, previousCount)
  if (guardViolation && process.env.SITEMAP_FORCE !== '1') {
    console.error(
      `REFUSING to write sitemaps: ${guardViolation}.\n` +
        `A truncated sitemap published over the full set gets cached by crawlers ` +
        `as THE sitemap (the PR #219/#223 incident). If the catalog really ` +
        `shrank, re-run with SITEMAP_FORCE=1.`,
    )
    process.exitCode = 1
    return null
  }

  // THE HEADER IS AN AUDIT SURFACE — every token must describe what is in THIS
  // file, because it is the only thing an auditor reading public/ can check
  // without re-running the generator.
  //
  // It used to read `source=serving_eligible urls=N`, which was wrong in the
  // most expensive way available: `source` is the WALK-HEALTH label (values
  // `ok`/`partial`/`truncated`, then named `serving_eligible…`), so the file
  // asserted an eligibility set it had never measured. On 2026-07-26 it carried
  // `source=serving_eligible` over 77 URLs that were index_eligible and NOT
  // serving_eligible — admitted by INDEX_ELIGIBLE_SITEMAP=1 in prod — and all
  // 77 failed to serve. Anyone auditing "did index-only rows get in?" read that
  // label and concluded no.
  //
  // Those 77 are gone (pivota-backend#1589 fixed `renderable`; #289 added the
  // serving-gate drop above), but the LANE is not closed: #289 keys on an
  // explicit `serving_eligible: false`, so a feed that omits the field still
  // ships index-only URLs into a renderer that has no INDEX_ELIGIBLE_READ. So
  // the token is renamed AND the breakdown is measured — `index_only=0` is now
  // a positive statement that the serving gate is holding, and the next
  // widening cannot hide the way the last one did.
  //
  // Counted off the FINAL product list, after the eligibility/renderable/
  // content_depth drops and after the content_key dedup, so the two buckets
  // always sum to `urls` — a breakdown of the rows the feed offered would be a
  // different (and, for this question, useless) number.
  const servingEligibleCount = products.reduce((n, p) => n + (p.servingEligible ? 1 : 0), 0)
  const indexOnlyCount = products.length - servingEligibleCount
  const comment =
    `feed_health=${feedHealth} urls=${urls.length} ` +
    `serving_eligible=${servingEligibleCount} index_only=${indexOnlyCount}`
  const written = []
  if (await writeIfChanged(productsPath, buildSitemapUrlsetXml(urls, comment))) {
    written.push('sitemap-products.xml')
  }
  if (
    await writeIfChanged(
      path.join(PUBLIC_DIR, 'sitemap-static.xml'),
      buildSitemapUrlsetXml(staticSitemapEntries()),
    )
  ) {
    written.push('sitemap-static.xml')
  }
  if (
    await writeIfChanged(
      path.join(PUBLIC_DIR, 'sitemap.xml'),
      buildSitemapIndexXml(sitemapIndexEntries()),
    )
  ) {
    written.push('sitemap.xml')
  }

  console.log(
    `feed_health=${feedHealth} product_urls=${urls.length} ` +
      `serving_eligible=${servingEligibleCount} index_only=${indexOnlyCount} ` +
      `previous=${previousCount ?? 'none'} ` +
      `written=[${written.join(', ') || 'nothing — all unchanged'}]`,
  )
  return {
    urlCount: urls.length,
    feedHealth,
    servingEligibleCount,
    indexOnlyCount,
    written,
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  generateSitemaps().catch((error) => {
    console.error('sitemap generation failed:', error)
    process.exitCode = 1
  })
}
