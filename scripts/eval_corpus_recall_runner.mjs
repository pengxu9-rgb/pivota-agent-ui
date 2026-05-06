#!/usr/bin/env node
/**
 * Cross-agent recall probe runner.
 *
 * Reads a JSONL corpus and probes the Node backend's `find_products_multi`
 * via the gateway. For each query, captures full backend metadata + product
 * fields needed for verdict scoring, and writes one JSON per query under
 * reports/recall_v1/<run_id>/<source>/<bucket>/<query_hash>.json.
 *
 * Usage:
 *   node scripts/eval_corpus_recall_runner.mjs \
 *     --source shopping_agent --entry chat \
 *     scripts/eval_corpus_recall_v1.jsonl
 *
 * Env:
 *   EVAL_INVOKE_URL    Required. e.g. https://agent.pivota.cc/api/gateway
 *   EVAL_AGENT_API_KEY Optional. Used when hitting invoke URL directly.
 *   EVAL_RUN_ID        Optional. Defaults to recall_v1_<unix>.
 *   EVAL_CONCURRENCY   Optional. Default 2.
 *   EVAL_TIMEOUT_MS    Optional. Default 30000.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--source') out.source = argv[++i];
    else if (a === '--entry') out.entry = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Unknown flag ${a}`);
    else out.positional.push(a);
  }
  return out;
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

function hashQuery(q) {
  return crypto.createHash('sha1').update(q).digest('hex').slice(0, 10);
}

function readJsonl(file) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
    rl.on('line', (line) => {
      const t = line.trim();
      if (!t) return;
      try { rows.push(JSON.parse(t)); }
      catch (e) { reject(new Error(`Bad JSONL line: ${t.slice(0, 80)} — ${e.message}`)); }
    });
    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

async function postInvoke({ invokeUrl, apiKey, body, timeoutMs }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { 'X-Agent-API-Key': apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(t);
    return { ok: false, status: 0, error: err?.name === 'AbortError' ? 'TIMEOUT' : (err?.message || 'FETCH_FAILED') };
  }
  clearTimeout(t);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

function pickProducts(resp) {
  return Array.isArray(resp?.products) ? resp.products
    : Array.isArray(resp?.result?.products) ? resp.result.products
    : Array.isArray(resp?.data?.products) ? resp.data.products
    : [];
}

function pickMetadata(resp) {
  return resp?.metadata ?? resp?.result?.metadata ?? resp?.data?.metadata ?? {};
}

function summarizeProduct(p) {
  return {
    product_id: String(p?.product_id ?? p?.productId ?? p?.id ?? '').trim(),
    title: String(p?.title ?? '').trim(),
    brand: String(p?.brand ?? '').trim(),
    merchant_id: String(p?.merchant_id ?? p?.merchantId ?? '').trim(),
    in_stock: p?.in_stock === true || p?.inStock === true,
    price: typeof p?.price === 'number' ? p.price : null,
    canonical_scope: String(p?.canonical_scope ?? '').trim(),
    review_family_id: String(p?.review_family_id ?? '').trim(),
    product_line_id: String(p?.product_line_id ?? '').trim(),
  };
}

function summarizeMetadata(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const psf = (m.proxy_search_fallback && typeof m.proxy_search_fallback === 'object') ? m.proxy_search_fallback : {};
  const sd = (m.search_decision && typeof m.search_decision === 'object') ? m.search_decision : {};
  const pq = (sd.post_quality && typeof sd.post_quality === 'object') ? sd.post_quality : {};
  return {
    query_source: String(m.query_source ?? '').trim() || null,
    final_decision: String(m.final_decision ?? sd.final_decision ?? '').trim() || null,
    decision_node: String(m.decision_node ?? '').trim() || null,
    orchestrator_path: String(m.orchestrator_path ?? '').trim() || null,
    catalog_surface: String(m.catalog_surface ?? '').trim() || null,
    reason_code: String(m.reason_code ?? '').trim() || null,
    route: String(m.route ?? '').trim() || null,
    fallback_route: String(m.fallback_route ?? psf.route ?? '').trim() || null,
    fallback_reason: String(m.fallback_reason ?? '').trim() || null,
    strict_empty: m.strict_empty === true,
    strict_empty_reason: String(m.strict_empty_reason ?? psf.reason ?? '').trim() || null,
    recovered_from: String(m.recovered_from ?? '').trim() || null,
    // Retrieval counts — most diagnostic fields
    internal_raw_count: typeof m.internal_raw_count === 'number' ? m.internal_raw_count : null,
    external_raw_count: typeof m.external_raw_count === 'number' ? m.external_raw_count : null,
    merged_pre_limit_count: typeof m.merged_pre_limit_count === 'number' ? m.merged_pre_limit_count : null,
    final_returned_count: typeof m.final_returned_count === 'number' ? m.final_returned_count : null,
    primary_quality_gate_passed: m.primary_quality_gate_passed === true,
    primary_quality_score: typeof m.primary_quality_score === 'number' ? m.primary_quality_score : null,
    low_quality_nonempty_detected: m.low_quality_nonempty_detected === true,
    // External seed / supplement gates
    external_seed_skip_reason: String(m.external_seed_skip_reason ?? '').trim() || null,
    external_fill_gate_reason: String(m.external_fill_gate_reason ?? '').trim() || null,
    external_seed_executed: m.external_seed_executed === true,
    external_seed_cache_hit: m.external_seed_cache_hit === true,
    external_seed_returned_count: typeof m.external_seed_returned_count === 'number' ? m.external_seed_returned_count : null,
    supplement_skip_reason: String(m.supplement_skip_reason ?? '').trim() || null,
    supplement_attempted: m.supplement_attempted === true,
    domain_filter_dropped_external: typeof m.domain_filter_dropped_external === 'number' ? m.domain_filter_dropped_external : null,
    // Semantic retry
    semantic_retry_applied: m.semantic_retry_applied === true,
    semantic_retry_query: String(m.semantic_retry_query ?? '').trim() || null,
    semantic_retry_hits: typeof m.semantic_retry_hits === 'number' ? m.semantic_retry_hits : null,
    // Brand detection (relevant for makeup queries needing brand anchor)
    brand_query_detected: m.brand_query_detected === true,
    brand_query_bypass_ambiguity: m.brand_query_bypass_ambiguity === true,
    brand_entities: Array.isArray(m.brand_entities) ? m.brand_entities : [],
    brand_scope: String(m.brand_scope ?? '').trim() || null,
    // Search decision summary (flattened key bits)
    sd_query_class: String(sd.query_class ?? '').trim() || null,
    sd_query_semantic_class: String(sd.query_semantic_class ?? '').trim() || null,
    sd_clarify_triggered: sd.clarify_triggered === true,
    sd_strict_empty_triggered: sd.strict_empty_triggered === true,
    sd_ambiguity_score_pre: typeof sd.ambiguity_score_pre === 'number' ? sd.ambiguity_score_pre : null,
    sd_ambiguity_score_post: typeof sd.ambiguity_score_post === 'number' ? sd.ambiguity_score_post : null,
    pq_candidates: typeof pq.candidates === 'number' ? pq.candidates : null,
    pq_candidates_ok: pq.candidates_ok === true,
    pq_anchor_ok: pq.anchor_ok === true,
    pq_entropy_ok: pq.entropy_ok === true,
    pq_context_fail_open_applied: pq.context_fail_open_applied === true,
    // Upstream error/timeout
    upstream_status: typeof m.upstream_status === 'number' ? m.upstream_status : null,
    upstream_error_code: String(m.upstream_error_code ?? '').trim() || null,
    upstream_error_message: String(m.upstream_error_message ?? '').trim() || null,
    proxy_search_fallback: psf,
  };
}

async function probeOne({ row, runRoot, source, entry, invokeUrl, apiKey, timeoutMs }) {
  const query = String(row?.query ?? '').trim();
  if (!query) return null;
  const bucket = String(row?.bucket ?? 'unbucketed').replace(/[^a-zA-Z0-9_-]/g, '_');
  const lang = String(row?.lang ?? '').trim();
  const limit = Math.max(1, Number(row?.limit ?? 12));

  const body = {
    operation: 'find_products_multi',
    payload: {
      search: { query, limit, in_stock_only: false },
      user: { recent_queries: [] },
    },
    metadata: {
      source,
      ...(entry ? { entry } : {}),
      scope: { catalog: 'global' },
      eval: { suite_id: 'recall_v1', bucket, lang },
    },
  };

  const startedAt = Date.now();
  const resp = await postInvoke({ invokeUrl, apiKey, body, timeoutMs });
  const latency_ms = Date.now() - startedAt;

  const data = resp.ok ? resp.json : null;
  const products = pickProducts(data).map(summarizeProduct);
  const metadata = summarizeMetadata(pickMetadata(data));

  const record = {
    run: { source, entry, invokeUrl, timeoutMs, suite: 'recall_v1' },
    query: { text: query, lang, bucket, limit },
    transport: {
      ok: resp.ok,
      http_status: resp.status,
      latency_ms,
      ...(resp.error ? { error: resp.error } : {}),
    },
    response_summary: {
      n_products: products.length,
      n_unique_brands: new Set(products.map((p) => p.brand).filter(Boolean)).size,
      n_unique_merchants: new Set(products.map((p) => p.merchant_id).filter(Boolean)).size,
      n_in_stock: products.filter((p) => p.in_stock).length,
    },
    metadata,
    products,
  };

  const dir = path.join(runRoot, source, bucket);
  ensureDir(dir);
  const file = path.join(dir, `${hashQuery(query)}_${lang || 'xx'}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2));
  return { query, bucket, lang, n_products: products.length, ok: resp.ok, file };
}

async function runConcurrent(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, n) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); }
      catch (err) { out[i] = { error: err?.message || String(err) }; }
    }
  });
  await Promise.all(workers);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const corpusFile = args.positional[0];
  if (!corpusFile) {
    console.error('Usage: eval_corpus_recall_runner.mjs --source <s> --entry <e> <corpus.jsonl>');
    process.exit(2);
  }
  const source = args.source || 'shopping_agent';
  const entry = args.entry || '';

  const invokeUrl = String(process.env.EVAL_INVOKE_URL || '').trim();
  if (!invokeUrl) {
    console.error('EVAL_INVOKE_URL is required (e.g. https://agent.pivota.cc/api/gateway)');
    process.exit(2);
  }
  const apiKey = String(process.env.EVAL_AGENT_API_KEY || '').trim() || null;
  const concurrency = Math.max(1, Number(process.env.EVAL_CONCURRENCY || 2));
  const timeoutMs = Math.max(1000, Number(process.env.EVAL_TIMEOUT_MS || 30000));
  const runId = String(process.env.EVAL_RUN_ID || `recall_v1_${Math.floor(Date.now() / 1000)}`).trim();

  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const runRoot = path.join(repoRoot, 'reports', 'recall_v1', runId);
  ensureDir(runRoot);

  const rows = await readJsonl(path.resolve(corpusFile));
  console.log(`[probe] run=${runId} source=${source} entry=${entry || '(none)'} rows=${rows.length} concurrency=${concurrency}`);
  console.log(`[probe] invoke=${invokeUrl}`);
  console.log(`[probe] writing to ${runRoot}`);

  const startedAt = Date.now();
  let done = 0;
  const results = await runConcurrent(rows, concurrency, async (row) => {
    const r = await probeOne({ row, runRoot, source, entry, invokeUrl, apiKey, timeoutMs });
    done += 1;
    if (r) {
      const flag = r.ok ? (r.n_products === 0 ? 'EMPTY' : r.n_products <= 5 ? 'THIN' : 'OK') : 'FAIL';
      console.log(`[${done}/${rows.length}] [${flag}] ${r.bucket}/${r.lang || 'xx'} ${r.query.slice(0,40)} -> ${r.n_products}`);
    }
    return r;
  });

  const totalMs = Date.now() - startedAt;
  const indexFile = path.join(runRoot, `index_${source}.json`);
  fs.writeFileSync(indexFile, JSON.stringify({
    run_id: runId,
    source,
    entry,
    invoke_url: invokeUrl,
    rows: rows.length,
    duration_ms: totalMs,
    started_at: new Date(startedAt).toISOString(),
    results,
  }, null, 2));

  console.log(`[probe] done in ${(totalMs / 1000).toFixed(1)}s — index: ${indexFile}`);
}

main().catch((err) => {
  console.error('[probe] fatal:', err?.stack || err);
  process.exit(1);
});
