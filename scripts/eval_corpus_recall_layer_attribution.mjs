#!/usr/bin/env node
/**
 * Layer attribution analyzer — reads probe records under
 * reports/recall_v1/<run_id>/<source>/<bucket>/*.json and tags each EMPTY/THIN
 * query with the most likely failure layer, based on the route_health
 * metadata fields we already capture.
 *
 * Layers (from celestial pivot engine):
 *   A. Resolver-First   — fast exact-title lookup, optional short-circuit
 *   B. Internal Catalog — `internal_raw_count`, `primary_quality_gate_passed`
 *   C. External Seed    — `external_seed_executed`, `external_seed_skip_reason`,
 *                         `external_seed_returned_count`
 *   D. Supplement       — `supplement_attempted`, `supplement_skip_reason`
 *   E. Semantic Retry   — `semantic_retry_applied`, `semantic_retry_hits`
 *
 * Failure attribution rules (first match wins):
 *   - cache_short_circuit: external_seed_executed=false AND external_seed_skip_reason=cache_hit
 *   - external_seed_timeout: external_seed_skip_reason ∈ {query_timeout, external_seed_direct_local_timeout}
 *   - external_seed_no_data: external_seed_executed=true AND (external_seed_returned_count=0 OR external_raw_count=0)
 *   - internal_only_zero: internal_raw_count=0 AND external_seed_executed=false AND skip_reason!=cache_hit
 *   - primary_irrelevant: strict_empty_reason=primary_irrelevant_no_fallback
 *   - no_candidates: strict_empty_reason=no_candidates AND nothing else fits
 *   - supplement_blocked: supplement_attempted=false AND supplement_skip_reason set AND merged_pre_limit_count<6
 *   - semantic_retry_zero: semantic_retry_applied=true AND semantic_retry_hits=0
 *   - other / unknown
 *
 * Usage: node scripts/eval_corpus_recall_layer_attribution.mjs <run_id>
 */

import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('index_')) out.push(p);
  }
  return out;
}

function scoreVerdict(rec) {
  if (!rec.transport?.ok) return 'FAIL';
  const n = rec.response_summary?.n_products ?? 0;
  if (n === 0) return 'EMPTY';
  if (n <= 5) return 'THIN';
  return 'PASS';
}

function attributeFailureLayer(rec) {
  const m = rec.metadata || {};
  const verdict = scoreVerdict(rec);
  if (verdict === 'PASS') return { layer: 'pass', detail: '' };
  if (verdict === 'FAIL') return { layer: 'transport', detail: rec.transport?.error || `http_${rec.transport?.http_status}` };

  const skip = String(m.external_seed_skip_reason || '').trim();
  const internalRaw = Number(m.internal_raw_count ?? -1);
  const externalRaw = Number(m.external_raw_count ?? -1);
  const externalReturned = Number(m.external_seed_returned_count ?? -1);
  const seedExecuted = m.external_seed_executed === true;
  const supplementAttempted = m.supplement_attempted === true;
  const supplementSkip = String(m.supplement_skip_reason || '').trim();
  const semanticRetryApplied = m.semantic_retry_applied === true;
  const semanticRetryHits = Number(m.semantic_retry_hits ?? 0);
  const strictEmptyReason = String(m.strict_empty_reason || '').trim();

  // C: External seed cache short-circuit (the dominant production failure)
  if (!seedExecuted && skip === 'cache_hit') {
    return { layer: 'C-external_seed', detail: 'cache_short_circuit (skip=cache_hit, executed=false)' };
  }

  // C: External seed timeout
  if (skip === 'query_timeout' || skip === 'external_seed_direct_local_timeout') {
    return { layer: 'C-external_seed', detail: `timeout (${skip})` };
  }

  // C: External seed ran but returned nothing usable
  if (seedExecuted && (externalRaw === 0 || externalReturned === 0)) {
    return { layer: 'C-external_seed', detail: `seed_ran_returned_zero (executed=true, raw=${externalRaw}, returned=${externalReturned})` };
  }

  // C: Other seed skip
  if (skip && skip !== 'cache_hit') {
    return { layer: 'C-external_seed', detail: `skipped (${skip})` };
  }

  // E: Semantic retry tried and got 0
  if (semanticRetryApplied && semanticRetryHits === 0) {
    return { layer: 'E-semantic_retry', detail: 'retry_zero_hits' };
  }

  // D: Supplement should have run but was blocked
  if (!supplementAttempted && supplementSkip) {
    return { layer: 'D-supplement', detail: `blocked (${supplementSkip})` };
  }

  // B: Internal catalog returned nothing and no other layer engaged
  if (internalRaw === 0 && !seedExecuted) {
    return { layer: 'B-internal_catalog', detail: 'internal_zero_no_other_layer' };
  }

  // A: primary_irrelevant (force strict)
  if (strictEmptyReason === 'primary_irrelevant_no_fallback') {
    return { layer: 'A-primary_routing', detail: strictEmptyReason };
  }

  // Fallback bucket
  if (strictEmptyReason) {
    return { layer: 'unknown', detail: `strict_empty=${strictEmptyReason}` };
  }
  return { layer: 'unknown', detail: '' };
}

function pct(n, d) { return d === 0 ? '0%' : `${Math.round((100 * n) / d)}%`; }

function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: eval_corpus_recall_layer_attribution.mjs <run_id>');
    process.exit(2);
  }
  const root = path.resolve(`reports/recall_v1/${runId}`);
  const files = walk(root);
  console.error(`[layer-attribution] reading ${files.length} records from ${root}`);

  const all = [];
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    const verdict = scoreVerdict(rec);
    const attr = attributeFailureLayer(rec);
    all.push({
      source: rec.run?.source || 'unknown',
      bucket: rec.query?.bucket || 'unbucketed',
      lang: rec.query?.lang || '',
      query: rec.query?.text,
      n_products: rec.response_summary?.n_products ?? 0,
      verdict,
      layer: attr.layer,
      detail: attr.detail,
      internal_raw: rec.metadata?.internal_raw_count ?? null,
      external_raw: rec.metadata?.external_raw_count ?? null,
      seed_executed: rec.metadata?.external_seed_executed ?? null,
      seed_skip: rec.metadata?.external_seed_skip_reason ?? '',
      supplement_attempted: rec.metadata?.supplement_attempted ?? null,
      supplement_skip: rec.metadata?.supplement_skip_reason ?? '',
      semantic_retry: rec.metadata?.semantic_retry_applied ?? null,
      semantic_hits: rec.metadata?.semantic_retry_hits ?? null,
      strict_reason: rec.metadata?.strict_empty_reason ?? '',
    });
  }

  const lines = [];
  lines.push(`# Per-layer failure attribution — \`${runId}\``);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Total records: ${all.length}`);
  lines.push('');
  lines.push('## Layer attribution rules');
  lines.push('');
  lines.push('Each EMPTY/THIN query is tagged with the **most likely failure layer** based on route_health metadata. Rules are mutually exclusive (first match wins):');
  lines.push('');
  lines.push('- **C-external_seed / cache_short_circuit** — `external_seed_skip_reason=cache_hit` AND `external_seed_executed=false`');
  lines.push('- **C-external_seed / timeout** — skip reason in {`query_timeout`, `external_seed_direct_local_timeout`}');
  lines.push('- **C-external_seed / seed_ran_returned_zero** — seed executed but `external_raw_count=0`');
  lines.push('- **C-external_seed / skipped (other)** — any other non-empty skip reason');
  lines.push('- **E-semantic_retry / retry_zero_hits** — semantic retry ran but returned 0');
  lines.push('- **D-supplement / blocked** — supplement not attempted, skip reason set');
  lines.push('- **B-internal_catalog / internal_zero_no_other_layer** — internal=0 AND no seed/supplement engaged');
  lines.push('- **A-primary_routing / primary_irrelevant_no_fallback** — strict force from primary fallback gate');
  lines.push('- **unknown** — no clear signal');
  lines.push('');

  // Per-layer failure rate by source × bucket
  const sources = [...new Set(all.map((r) => r.source))].sort();
  for (const s of sources) {
    lines.push(`## ${s} — failure layer by bucket`);
    lines.push('');
    lines.push('| Bucket | Lang | n | Pass | C:cache | C:timeout | C:seed_zero | C:other_skip | D:blocked | B:internal_zero | A:primary | E:retry_zero | unknown |');
    lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');

    const buckets = [...new Set(all.filter((r) => r.source === s).map((r) => `${r.bucket}|${r.lang}`))].sort();
    for (const bk of buckets) {
      const [bucket, lang] = bk.split('|');
      const recs = all.filter((r) => r.source === s && r.bucket === bucket && r.lang === lang);
      const counts = {
        pass: 0,
        cache: 0,
        timeout: 0,
        seed_zero: 0,
        other_skip: 0,
        d_blocked: 0,
        internal_zero: 0,
        primary: 0,
        retry_zero: 0,
        unknown: 0,
      };
      for (const r of recs) {
        if (r.layer === 'pass') counts.pass++;
        else if (r.layer === 'C-external_seed' && r.detail.startsWith('cache_short_circuit')) counts.cache++;
        else if (r.layer === 'C-external_seed' && r.detail.startsWith('timeout')) counts.timeout++;
        else if (r.layer === 'C-external_seed' && r.detail.startsWith('seed_ran_returned_zero')) counts.seed_zero++;
        else if (r.layer === 'C-external_seed') counts.other_skip++;
        else if (r.layer === 'D-supplement') counts.d_blocked++;
        else if (r.layer === 'B-internal_catalog') counts.internal_zero++;
        else if (r.layer === 'A-primary_routing') counts.primary++;
        else if (r.layer === 'E-semantic_retry') counts.retry_zero++;
        else counts.unknown++;
      }
      lines.push(`| ${bucket} | ${lang || '—'} | ${recs.length} | ${counts.pass} | ${counts.cache} | ${counts.timeout} | ${counts.seed_zero} | ${counts.other_skip} | ${counts.d_blocked} | ${counts.internal_zero} | ${counts.primary} | ${counts.retry_zero} | ${counts.unknown} |`);
    }
    lines.push('');
  }

  // Aggregate: dominant layer per source
  lines.push('## Dominant failure layer (across all buckets)');
  lines.push('');
  lines.push('| Source | Total | Pass | C:cache | C:timeout | C:seed_zero | C:other | D | B | A | E | unknown |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of sources) {
    const recs = all.filter((r) => r.source === s);
    const c = { pass: 0, cache: 0, timeout: 0, sz: 0, oc: 0, d: 0, b: 0, a: 0, e: 0, u: 0 };
    for (const r of recs) {
      if (r.layer === 'pass') c.pass++;
      else if (r.layer === 'C-external_seed' && r.detail.startsWith('cache')) c.cache++;
      else if (r.layer === 'C-external_seed' && r.detail.startsWith('timeout')) c.timeout++;
      else if (r.layer === 'C-external_seed' && r.detail.startsWith('seed_ran_returned_zero')) c.sz++;
      else if (r.layer === 'C-external_seed') c.oc++;
      else if (r.layer === 'D-supplement') c.d++;
      else if (r.layer === 'B-internal_catalog') c.b++;
      else if (r.layer === 'A-primary_routing') c.a++;
      else if (r.layer === 'E-semantic_retry') c.e++;
      else c.u++;
    }
    lines.push(`| ${s} | ${recs.length} | ${c.pass} (${pct(c.pass, recs.length)}) | ${c.cache} | ${c.timeout} | ${c.sz} | ${c.oc} | ${c.d} | ${c.b} | ${c.a} | ${c.e} | ${c.u} |`);
  }
  lines.push('');

  // Per-failure-query detail with attribution
  lines.push('## Per-query detail (failures only)');
  lines.push('');
  lines.push('| Source | Bucket | Lang | Query | n | Verdict | Layer | Detail | int_raw | ext_raw | seed_exec | seed_skip |');
  lines.push('|---|---|---|---|---:|---|---|---|---:|---:|---|---|');
  const failures = all.filter((r) => r.verdict !== 'PASS');
  failures.sort((a, b) => a.layer.localeCompare(b.layer) || a.source.localeCompare(b.source) || a.bucket.localeCompare(b.bucket));
  for (const r of failures) {
    lines.push(`| ${r.source} | ${r.bucket} | ${r.lang || '—'} | \`${r.query.replace(/\|/g, '\\|')}\` | ${r.n_products} | ${r.verdict} | ${r.layer} | ${r.detail || '—'} | ${r.internal_raw ?? '—'} | ${r.external_raw ?? '—'} | ${r.seed_executed ?? '—'} | ${r.seed_skip || '—'} |`);
  }
  lines.push('');

  const out = path.join(root, 'LAYER_ATTRIBUTION.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.error(`[layer-attribution] wrote ${out}`);
}

main();
