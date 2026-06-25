#!/usr/bin/env node
/**
 * Recall parity harness — Part A / A4.
 *
 * Makes the two-recall-stacks divergence MEASURABLE. Runs a golden query corpus
 * against BOTH recall surfaces and compares them by canonical identity:
 *   - the live agent gateway   → POST {GATEWAY_URL}      find_products_multi  (no auth)
 *   - the backend pivot search → POST {PIVOT_URL}        /v1/pivot/query      (auth-gated)
 *
 * They are NOT meant to be identical (the gateway is a multi-lane orchestrator;
 * /v1/pivot is the citation/PDP search). The point is to TRACK their overlap +
 * rank agreement on the shared canonical-search component over time, so a change
 * that moves one and not the other (V2 → backend, token-match → gateway) shows
 * up as a divergence delta instead of going silently unnoticed. Read-only.
 *
 * Env:
 *   PIVOT_TOKEN   REQUIRED  bearer JWT for /v1/pivot/query (it is auth-gated)
 *   GATEWAY_URL   default   https://agent.pivota.cc/api/gateway
 *   PIVOT_URL     default   https://api.pivota.cc/v1/pivot/query
 *   CORPUS        default   ./eval_corpus_recall_v1.jsonl
 *   LIMIT         default   12      (results requested per surface)
 *   TOP_K         default   10      (top-K compared)
 *   OUT           default   ./reports/recall_parity/<ts>.json   (ts via REPORT_TS or 'latest')
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GATEWAY_URL = (process.env.GATEWAY_URL || 'https://agent.pivota.cc/api/gateway').trim();
const PIVOT_URL = (process.env.PIVOT_URL || 'https://api.pivota.cc/v1/pivot/query').trim();
const PIVOT_TOKEN = (process.env.PIVOT_TOKEN || '').trim();
const CORPUS = (process.env.CORPUS || path.join(__dirname, 'eval_corpus_recall_v1.jsonl')).trim();
const LIMIT = Number(process.env.LIMIT || 12);
const TOP_K = Number(process.env.TOP_K || 10);
const REPORT_TS = (process.env.REPORT_TS || 'latest').trim();
const TIMEOUT_MS = 30000;

function identityOf(item) {
  if (!item || typeof item !== 'object') return null;
  const prod = item.product && typeof item.product === 'object' ? item.product : item;
  const keys = [
    // product_key (prod::merchant::platform::source_id) is the ONE identity both
    // surfaces expose identically; /v1/pivot omits content_key + sig, so prefer it.
    'product_key', 'productKey', 'source_product_id',
    'content_key', 'contentKey', 'pivota_signature_id', 'sig_id', 'id', 'product_id', 'productId',
  ];
  for (const k of keys) {
    const v = prod[k] ?? item[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function postJson(url, body, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: null, error: err?.name === 'AbortError' ? 'TIMEOUT' : String(err?.message || err) };
  } finally {
    clearTimeout(t);
  }
}

async function gatewayKeys(query) {
  const r = await postJson(GATEWAY_URL, {
    operation: 'find_products_multi',
    payload: { search: { query, limit: LIMIT, in_stock_only: false } },
  });
  if (!r.ok || !r.json) return { ok: false, status: r.status, keys: [], n: 0 };
  const prods = r.json.products || r.json.result?.products || [];
  const keys = prods.map(identityOf).filter(Boolean);
  return { ok: true, status: r.status, n: prods.length, keys: keys.slice(0, TOP_K) };
}

async function pivotKeys(query) {
  const r = await postJson(PIVOT_URL, { query, limit: LIMIT }, { authorization: `Bearer ${PIVOT_TOKEN}` });
  if (!r.ok || !r.json) return { ok: false, status: r.status, keys: [], n: 0 };
  const items = r.json.items || r.json.results || [];
  const keys = items.map(identityOf).filter(Boolean);
  return { ok: true, status: r.status, n: items.length, keys: keys.slice(0, TOP_K) };
}

function jaccard(a, b) {
  const sb = new Set(b);
  const inter = [...new Set(a)].filter((x) => sb.has(x)).length;
  const uni = new Set([...a, ...b]).size;
  return uni ? inter / uni : 1;
}

function rankDivergence(a, b) {
  const ra = new Map(a.map((k, i) => [k, i]));
  const rb = new Map(b.map((k, i) => [k, i]));
  const shared = [...ra.keys()].filter((k) => rb.has(k));
  if (!shared.length) return null;
  const sum = shared.reduce((acc, k) => acc + Math.abs(ra.get(k) - rb.get(k)), 0);
  return { shared: shared.length, mean_abs_rank_delta: sum / shared.length };
}

function readCorpus(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && typeof r.query === 'string' && r.query.trim());
}

async function main() {
  if (!PIVOT_TOKEN) {
    console.error('PIVOT_TOKEN is required (a JWT for the auth-gated /v1/pivot/query). Aborting.');
    process.exit(2);
  }
  if (!fs.existsSync(CORPUS)) {
    console.error(`Corpus not found: ${CORPUS}`);
    process.exit(2);
  }
  const rows = readCorpus(CORPUS);
  console.log(`recall-parity: ${rows.length} queries · gateway=${GATEWAY_URL} · pivot=${PIVOT_URL} · top_k=${TOP_K}`);

  const perQuery = [];
  let pivotAuthFailures = 0;
  for (const row of rows) {
    const query = row.query.trim();
    const [g, p] = await Promise.all([gatewayKeys(query), pivotKeys(query)]);
    if (p.status === 401 || p.status === 403) pivotAuthFailures += 1;
    const overlap = g.ok && p.ok ? jaccard(g.keys, p.keys) : null;
    const rank = g.ok && p.ok ? rankDivergence(g.keys, p.keys) : null;
    const top1Agree = g.ok && p.ok && g.keys[0] && p.keys[0] ? g.keys[0] === p.keys[0] : false;
    perQuery.push({
      query,
      bucket: row.bucket ?? null,
      gateway: { ok: g.ok, status: g.status, n: g.n, top_k: g.keys },
      pivot: { ok: p.ok, status: p.status, n: p.n, top_k: p.keys },
      overlap_jaccard: overlap,
      rank: rank,
      top1_agree: top1Agree,
    });
    const ovStr = overlap === null ? 'n/a' : overlap.toFixed(2);
    console.log(`  ${overlap !== null && overlap < 0.34 ? '⚠' : ' '} ${query.slice(0, 48).padEnd(48)} overlap=${ovStr} top1=${top1Agree ? '=' : '×'} g=${g.n}/p=${p.n}`);
  }

  const scored = perQuery.filter((q) => q.overlap_jaccard !== null);
  const meanOverlap = scored.length ? scored.reduce((a, q) => a + q.overlap_jaccard, 0) / scored.length : null;
  const top1AgreeRate = scored.length ? scored.filter((q) => q.top1_agree).length / scored.length : null;
  const sharedRanks = perQuery.map((q) => q.rank?.mean_abs_rank_delta).filter((v) => typeof v === 'number');
  const meanRankDelta = sharedRanks.length ? sharedRanks.reduce((a, b) => a + b, 0) / sharedRanks.length : null;
  const worst = [...scored].sort((a, b) => a.overlap_jaccard - b.overlap_jaccard).slice(0, 10)
    .map((q) => ({ query: q.query, overlap: q.overlap_jaccard }));

  const summary = {
    generated_at_note: 'stamp externally; harness avoids Date.now for determinism',
    corpus: path.basename(CORPUS),
    queries: rows.length,
    scored: scored.length,
    pivot_auth_failures: pivotAuthFailures,
    mean_overlap_jaccard: meanOverlap,
    top1_agreement_rate: top1AgreeRate,
    mean_abs_rank_delta_on_shared: meanRankDelta,
    high_divergence_count: scored.filter((q) => q.overlap_jaccard < 0.34).length,
    worst_overlap: worst,
  };

  const outDir = path.join(__dirname, '..', 'reports', 'recall_parity');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = process.env.OUT || path.join(outDir, `${REPORT_TS}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ summary, perQuery }, null, 2));

  console.log('\n── parity summary ──');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nreport: ${outFile}`);
  if (pivotAuthFailures > 0) {
    console.log(`\nNOTE: ${pivotAuthFailures} pivot calls were ${'401/403'} — check PIVOT_TOKEN (the JWT may be expired or lack scope).`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
