#!/usr/bin/env node
// Pre-warm the ISR cache for URLs that are NEW in this sitemap build.
//
//   node scripts/prewarm_sitemap.mjs --base <previous.xml> --head <current.xml>
//
// WHY. PDPs are ISR with revalidate=3600, and a cold fill costs 3-5s (measured
// 2026-07-28: serial median 4.18s, p90 4.83s, 25/25 sampled URLs over 3s; at
// 12-way concurrency ~15% blew a 45s timeout — all recovered serially, i.e.
// cold fill, not dead URLs). Googlebot crawls concurrently and does not retry
// politely. Every sitemap refresh that ADDS urls therefore publishes a cohort
// whose first visitor — usually the crawler — pays the cold fill and sometimes
// eats a 500. The 2026-07-29 build added 3,165 URLs in one cron tick.
//
// This fetches each ADDED url once, right after the build commits, so the first
// crawler hit lands on a warm cache. Added-only on purpose: URLs already in the
// sitemap have organic traffic keeping them warm, and re-fetching ~8k URLs every
// 6h from CI is load the serving path does not need.
//
// BEST-EFFORT BY DESIGN — this must NEVER fail the workflow:
//   * a timeout still warms: the fetch triggers the ISR fill and the fill
//     completes server-side after the client goes away (same behaviour the
//     admin-rescore edge drops showed);
//   * a 500 here is the exact cold-fill failure we are pre-paying so the
//     crawler doesn't see it;
//   * so every outcome is counted, logged, and exit code is ALWAYS 0.
//
// No silent caps: if the added set exceeds PREWARM_MAX_URLS the truncation is
// printed with the number left cold.

import { readFileSync } from 'node:fs'

const CONCURRENCY = intEnv('PREWARM_CONCURRENCY', 4, 1, 16)
const MAX_URLS = intEnv('PREWARM_MAX_URLS', 800, 1, 20000)
const TIMEOUT_MS = intEnv('PREWARM_TIMEOUT_MS', 25000, 1000, 120000)

function intEnv(name, fallback, floor, ceil) {
  const raw = Number.parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(ceil, Math.max(floor, raw))
}

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

export function parseLocs(xml) {
  return new Set(
    Array.from(String(xml).matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1].trim()),
  )
}

export function addedLocs(baseXml, headXml) {
  const base = parseLocs(baseXml)
  return Array.from(parseLocs(headXml))
    .filter((u) => !base.has(u))
    .sort()
}

async function warmOne(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'pivota-sitemap-prewarm/1.0' },
      signal: controller.signal,
    })
    // Drain so the connection is reusable; body content is irrelevant.
    await res.arrayBuffer().catch(() => {})
    return String(res.status)
  } catch (err) {
    return err?.name === 'AbortError' ? 'timeout' : 'error'
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const basePath = argValue('--base')
  const headPath = argValue('--head')
  if (!basePath || !headPath) {
    console.error('usage: prewarm_sitemap.mjs --base <previous.xml> --head <current.xml>')
    return // exit 0 — never fail the workflow over wiring
  }

  let baseXml = ''
  try {
    baseXml = readFileSync(basePath, 'utf8')
  } catch {
    // No previous file (first run) — warming the entire sitemap from CI would
    // be a self-inflicted load spike, and every URL is equally cold; skip.
    console.log(`prewarm: no base file at ${basePath}; skipping (nothing to diff against)`)
    return
  }
  const headXml = readFileSync(headPath, 'utf8')

  const added = addedLocs(baseXml, headXml)
  if (added.length === 0) {
    console.log('prewarm: 0 added URLs — nothing to warm')
    return
  }

  const target = added.slice(0, MAX_URLS)
  if (added.length > target.length) {
    console.log(
      `prewarm: NOTE — ${added.length} added URLs exceeds PREWARM_MAX_URLS=${MAX_URLS}; ` +
        `${added.length - target.length} will stay cold until first crawl`,
    )
  }

  const started = Date.now()
  const counts = {}
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, target.length) }, async () => {
      while (cursor < target.length) {
        const url = target[cursor++]
        const outcome = await warmOne(url)
        counts[outcome] = (counts[outcome] || 0) + 1
      }
    }),
  )

  const secs = ((Date.now() - started) / 1000).toFixed(0)
  console.log(
    `prewarm: warmed ${target.length}/${added.length} added URLs in ${secs}s — ` +
      Object.entries(counts)
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
  )
  // A non-200 here is the cold-fill cost we just pre-paid for the crawler.
  // Logged, never fatal.
}

const isDirectRun =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isDirectRun) {
  main().catch((err) => {
    console.log(`prewarm: aborted (${err?.message || err}) — best-effort, not failing the run`)
  })
}
