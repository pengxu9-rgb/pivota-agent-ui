#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

/**
 * Submit canonical product URLs to IndexNow (Bing, Yandex, and other participating
 * engines — notably Bing, which powers ChatGPT search). This is how our crawlable,
 * schema.org-marked PDPs actually get discovered: the sitemap + robots + JSON-LD are
 * live, but nothing gets crawled until an engine is told the URLs exist.
 *
 * The IndexNow key is a public file already hosted at the site root
 * (public/<key>.txt). IndexNow validates a submission by fetching keyLocation and
 * checking its contents == key, so the key file MUST be deployed before submitting.
 *
 * Google does NOT honor IndexNow — submit the sitemap in Search Console for Google.
 *
 * Usage:
 *   node scripts/submit_indexnow.mjs                 # submit the live product sitemap
 *   node scripts/submit_indexnow.mjs --dry-run       # print what would be submitted
 *
 * Env:
 *   INDEXNOW_HOST      Default agent.pivota.cc
 *   INDEXNOW_KEY       Default read from public/<key>.txt (the hosted key file)
 *   INDEXNOW_SITEMAPS  Comma-separated sitemap URLs. Default the product + static
 *                      sitemaps under https://<host>.
 *   INDEXNOW_ENDPOINT  Default https://api.indexnow.org/indexnow
 *   INDEXNOW_MAX_URLS  Per-request cap (IndexNow allows 10000). Default 10000.
 */

const HOST = process.env.INDEXNOW_HOST || 'agent.pivota.cc';
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
const MAX_URLS = Number(process.env.INDEXNOW_MAX_URLS || 10000);
const DRY_RUN = process.argv.includes('--dry-run');
const SITEMAPS = (process.env.INDEXNOW_SITEMAPS ||
  `https://${HOST}/sitemap-products.xml,https://${HOST}/sitemap-static.xml`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Resolve the IndexNow key: env override, else the single .txt in public/ whose
 *  name matches the IndexNow key convention (32 lowercase hex chars). */
function resolveKey() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY.trim();
  const publicDir = path.join(process.cwd(), 'public');
  const candidates = fs
    .readdirSync(publicDir)
    .filter((f) => /^[0-9a-f]{8,64}\.txt$/.test(f));
  for (const f of candidates) {
    const key = f.replace(/\.txt$/, '');
    const body = fs.readFileSync(path.join(publicDir, f), 'utf8').trim();
    // A valid key file contains exactly the key (== filename without .txt).
    if (body === key) return key;
  }
  throw new Error(
    'No IndexNow key found. Set INDEXNOW_KEY or host public/<key>.txt (content == key).',
  );
}

async function fetchLocs(sitemapUrl) {
  const res = await fetch(sitemapUrl, { headers: { 'User-Agent': 'pivota-indexnow/1.0' } });
  if (!res.ok) {
    console.warn(`  ${sitemapUrl}: HTTP ${res.status} — skipped`);
    return [];
  }
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
  console.log(`  ${sitemapUrl}: ${locs.length} urls`);
  return locs;
}

async function main() {
  const key = resolveKey();
  const keyLocation = `https://${HOST}/${key}.txt`;
  console.log(`IndexNow host=${HOST} key=${key.slice(0, 6)}… keyLocation=${keyLocation}`);

  const seen = new Set();
  const urls = [];
  for (const sm of SITEMAPS) {
    for (const u of await fetchLocs(sm)) {
      if (u.startsWith(`https://${HOST}/`) && !seen.has(u)) {
        seen.add(u);
        urls.push(u);
      }
    }
  }
  console.log(`Collected ${urls.length} same-host urls.`);
  if (urls.length === 0) {
    console.error('Nothing to submit.');
    process.exit(1);
  }

  // IndexNow caps a single submission; chunk if the catalog outgrows one request.
  let submitted = 0;
  for (let i = 0; i < urls.length; i += MAX_URLS) {
    const batch = urls.slice(i, i + MAX_URLS);
    if (DRY_RUN) {
      console.log(`[dry-run] would submit ${batch.length} urls (sample ${batch[0]})`);
      submitted += batch.length;
      continue;
    }
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'pivota-indexnow/1.0',
      },
      body: JSON.stringify({ host: HOST, key, keyLocation, urlList: batch }),
    });
    const text = await res.text();
    console.log(`Submitted ${batch.length} urls → HTTP ${res.status} ${text || '(empty)'}`);
    // 200 = accepted; 202 = accepted, key validation pending. Anything else is a real fail.
    if (res.status !== 200 && res.status !== 202) {
      console.error('IndexNow rejected the submission.');
      process.exit(1);
    }
    submitted += batch.length;
  }
  console.log(`Done. ${submitted} urls ${DRY_RUN ? 'would be ' : ''}submitted.`);
}

main().catch((err) => {
  console.error('IndexNow submit failed:', err?.message || err);
  process.exit(1);
});
