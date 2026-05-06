#!/usr/bin/env node
/**
 * Reads all per-query JSON files under reports/recall_v1/<run_id>/{source}/{bucket}/
 * and produces SUMMARY.md.
 *
 * Usage: node scripts/eval_corpus_recall_summarize.mjs <run_id>
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
  const brands = rec.response_summary?.n_unique_brands ?? 0;
  if (n === 0) return 'EMPTY';
  if (n <= 5) return 'THIN';
  if (n >= 6 && brands <= 1) return 'MONOCULTURE';
  return 'PASS';
}

function dominantReason(records) {
  const counts = new Map();
  for (const r of records) {
    const reason =
      r.metadata?.strict_empty_reason
      || r.metadata?.fallback_reason
      || r.metadata?.external_seed_skip_reason
      || r.metadata?.supplement_skip_reason
      || (r.transport?.ok === false ? `transport:${r.transport?.http_status || r.transport?.error || 'fail'}` : null)
      || 'unknown';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.length ? `${sorted[0][0]} (${sorted[0][1]})` : 'n/a';
}

function pct(n, d) { return d === 0 ? '0%' : `${Math.round((100 * n) / d)}%`; }

function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: eval_corpus_recall_summarize.mjs <run_id>');
    process.exit(2);
  }
  const root = path.resolve(`reports/recall_v1/${runId}`);
  const files = walk(root);
  console.error(`[summarize] found ${files.length} record files under ${root}`);

  // Group by source → bucket → list
  const bySource = new Map();
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
    const source = rec.run?.source || 'unknown';
    const bucket = rec.query?.bucket || 'unbucketed';
    if (!bySource.has(source)) bySource.set(source, new Map());
    const buckets = bySource.get(source);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(rec);
  }

  const sources = [...bySource.keys()].sort();
  const lines = [];
  lines.push(`# Recall probe summary — \`${runId}\``);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Sources: ${sources.join(', ')}`);
  lines.push('');

  // 1) Per-source overall
  lines.push('## Overall by source');
  lines.push('');
  lines.push('| Source | Total | PASS | THIN | EMPTY | MONOCULTURE | FAIL | Pass-rate |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of sources) {
    const all = [...bySource.get(s).values()].flat();
    const counts = { PASS: 0, THIN: 0, EMPTY: 0, MONOCULTURE: 0, FAIL: 0 };
    for (const r of all) counts[scoreVerdict(r)]++;
    lines.push(`| ${s} | ${all.length} | ${counts.PASS} | ${counts.THIN} | ${counts.EMPTY} | ${counts.MONOCULTURE} | ${counts.FAIL} | ${pct(counts.PASS, all.length)} |`);
  }
  lines.push('');

  // 2) Per-bucket per-source
  for (const s of sources) {
    lines.push(`## ${s} — by bucket`);
    lines.push('');
    lines.push('| Bucket | n | PASS | THIN | EMPTY | FAIL | Top failure reason |');
    lines.push('|---|---:|---:|---:|---:|---:|---|');
    const buckets = bySource.get(s);
    const bucketNames = [...buckets.keys()].sort();
    for (const b of bucketNames) {
      const recs = buckets.get(b);
      const counts = { PASS: 0, THIN: 0, EMPTY: 0, MONOCULTURE: 0, FAIL: 0 };
      for (const r of recs) counts[scoreVerdict(r)]++;
      const failures = recs.filter((r) => ['THIN', 'EMPTY', 'FAIL', 'MONOCULTURE'].includes(scoreVerdict(r)));
      lines.push(`| ${b} | ${recs.length} | ${counts.PASS} | ${counts.THIN} | ${counts.EMPTY} | ${counts.FAIL} | ${dominantReason(failures)} |`);
    }
    lines.push('');
  }

  // 3) Per-query detail (sorted: failures first, by source/bucket)
  lines.push('## Per-query detail');
  lines.push('');
  lines.push('| Source | Bucket | Lang | Query | n | brands | merchants | verdict | strict_empty_reason | external_seed_skip | reason_code | latency_ms |');
  lines.push('|---|---|---|---|---:|---:|---:|---|---|---|---|---:|');
  const allRows = [];
  for (const s of sources) {
    for (const recs of bySource.get(s).values()) {
      for (const r of recs) {
        const v = scoreVerdict(r);
        allRows.push({
          source: r.run?.source,
          bucket: r.query?.bucket,
          lang: r.query?.lang || '',
          query: r.query?.text,
          n: r.response_summary?.n_products ?? 0,
          brands: r.response_summary?.n_unique_brands ?? 0,
          merchants: r.response_summary?.n_unique_merchants ?? 0,
          verdict: v,
          strict_empty_reason: r.metadata?.strict_empty_reason || '',
          external_seed_skip: r.metadata?.external_seed_skip_reason || '',
          reason_code: r.metadata?.reason_code || '',
          latency: r.transport?.latency_ms ?? 0,
        });
      }
    }
  }
  // Sort: failures first, then OK, by source/bucket
  const verdictOrder = { FAIL: 0, EMPTY: 1, THIN: 2, MONOCULTURE: 3, PASS: 4 };
  allRows.sort((a, b) =>
    verdictOrder[a.verdict] - verdictOrder[b.verdict]
    || a.source.localeCompare(b.source)
    || a.bucket.localeCompare(b.bucket)
  );
  for (const r of allRows) {
    const cells = [
      r.source, r.bucket, r.lang,
      `\`${r.query.replace(/\|/g, '\\|')}\``,
      r.n, r.brands, r.merchants, r.verdict,
      r.strict_empty_reason || '—',
      r.external_seed_skip || '—',
      r.reason_code || '—',
      r.latency,
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  // 4) Cross-source diff: same query, different verdict
  lines.push('## Cross-source diff (same query, different verdict)');
  lines.push('');
  if (sources.length < 2) {
    lines.push('_Only one source probed; skipping diff._');
  } else {
    const queryMap = new Map(); // text → { [source]: verdict }
    for (const s of sources) {
      for (const recs of bySource.get(s).values()) {
        for (const r of recs) {
          if (!queryMap.has(r.query.text)) queryMap.set(r.query.text, {});
          queryMap.get(r.query.text)[s] = scoreVerdict(r);
        }
      }
    }
    lines.push(`| Query | ${sources.join(' | ')} |`);
    lines.push(`|${'---|'.repeat(sources.length + 1)}`);
    for (const [q, perSource] of queryMap.entries()) {
      const verdicts = sources.map((s) => perSource[s] || '—');
      const distinct = new Set(verdicts.filter((v) => v !== '—')).size;
      if (distinct >= 2) {
        lines.push(`| \`${q.replace(/\|/g, '\\|')}\` | ${verdicts.join(' | ')} |`);
      }
    }
  }
  lines.push('');

  // 5) Top-bucket-of-failure aggregate (helps identify systematic gaps)
  lines.push('## Failure heatmap by (bucket, lang) across all sources');
  lines.push('');
  const heatmap = new Map();
  for (const s of sources) {
    for (const recs of bySource.get(s).values()) {
      for (const r of recs) {
        const key = `${r.query?.bucket || '?'}|${r.query?.lang || ''}`;
        if (!heatmap.has(key)) heatmap.set(key, { total: 0, fail: 0 });
        const h = heatmap.get(key);
        h.total += 1;
        if (['FAIL', 'EMPTY', 'THIN', 'MONOCULTURE'].includes(scoreVerdict(r))) h.fail += 1;
      }
    }
  }
  const heatRows = [...heatmap.entries()].map(([k, v]) => {
    const [bucket, lang] = k.split('|');
    return { bucket, lang, ...v, fail_pct: v.total === 0 ? 0 : v.fail / v.total };
  }).sort((a, b) => b.fail_pct - a.fail_pct);
  lines.push('| Bucket | Lang | Total probes | Failed | Fail rate |');
  lines.push('|---|---|---:|---:|---:|');
  for (const h of heatRows) {
    lines.push(`| ${h.bucket} | ${h.lang || '—'} | ${h.total} | ${h.fail} | ${pct(h.fail, h.total)} |`);
  }
  lines.push('');

  const out = path.join(root, 'SUMMARY.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.error(`[summarize] wrote ${out}`);
}

main();
