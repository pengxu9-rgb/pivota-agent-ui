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
  productUrlEntries,
  readCanonicalProduct,
  sitemapCountGuard,
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

function readInteger(value, min) {
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

export async function collectSitemapProducts(baseUrl) {
  const products = []
  const seenIds = new Set()
  let offset = 0
  let cursor = null
  let stoppedForCap = false
  let sawInvalidCanonicalItem = false

  while (products.length < SITEMAP_MAX_URLS) {
    const page = await fetchCanonicalProductsPage(baseUrl, cursor ? { cursor } : { offset })
    if (page.items.length === 0) break

    for (const item of page.items) {
      const product = readCanonicalProduct(item)
      if (!product) {
        sawInvalidCanonicalItem = true
        continue
      }
      if (seenIds.has(product.id)) continue
      seenIds.add(product.id)
      products.push(product)
      if (products.length >= SITEMAP_MAX_URLS) break
    }

    // Keep the offset in step even while paging by cursor, so a backend
    // that stops emitting next_cursor mid-crawl degrades to offset paging
    // instead of restarting from 0.
    offset += page.limit
    const hasMore =
      page.hasMore !== null
        ? page.hasMore
        : page.total !== null
          ? offset < page.total
          : page.items.length >= page.limit

    if (products.length >= SITEMAP_MAX_URLS && hasMore) {
      stoppedForCap = true
      break
    }
    if (!hasMore) break

    // Prefer the backend's keyset cursor (pivota-backend PR #1239): it seeks
    // on the sort key, so page cost stays constant instead of growing with
    // OFFSET depth (deep pages could trip the backend's 4s DB timeout).
    // Backends that predate next_cursor keep paging by offset.
    cursor = page.nextCursor
  }

  // Deterministic order: backend pagination order is mutable
  // (content_changed_at DESC), which would produce a different diff — and
  // therefore a commit + deploy — on every run even for an unchanged catalog.
  products.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  return {
    products,
    source: sawInvalidCanonicalItem
      ? 'serving_eligible_partial'
      : stoppedForCap
        ? 'serving_eligible_truncated'
        : 'serving_eligible',
  }
}

async function readExistingLocCount(filePath) {
  try {
    return countLocs(await readFile(filePath, 'utf8'))
  } catch {
    return null
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
  console.log(`fetching canonical products from ${baseUrl} ...`)

  const { products, source } = await collectSitemapProducts(baseUrl)
  const urls = productUrlEntries(products)

  const productsPath = path.join(PUBLIC_DIR, 'sitemap-products.xml')
  const previousCount = await readExistingLocCount(productsPath)
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

  const comment = `source=${source} urls=${urls.length}`
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
    `source=${source} product_urls=${urls.length} previous=${previousCount ?? 'none'} ` +
      `written=[${written.join(', ') || 'nothing — all unchanged'}]`,
  )
  return { urlCount: urls.length, source, written }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  generateSitemaps().catch((error) => {
    console.error('sitemap generation failed:', error)
    process.exitCode = 1
  })
}
