#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function quantile(arr, q) {
  if (!arr.length) return '';
  const xs = [...arr].sort((a, b) => a - b);
  const pos = (xs.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (xs[base + 1] === undefined) return xs[base];
  return xs[base] + rest * (xs[base + 1] - xs[base]);
}

function rate(num, den) {
  if (!den) return '';
  return (num / den).toFixed(6);
}

function normalizeEntry(v) {
  const s = String(v || '').trim();
  return s || 'unknown';
}

function normalizeVariant(v) {
  const s = String(v || '').trim().toUpperCase();
  return s === 'A' || s === 'B' ? s : null;
}

function turnBucketOf(turnId) {
  const n = Number(turnId || 0);
  return n >= 2 ? 'turn2plus' : 'turn1';
}

function bucketKey({ entry, turn_bucket }) {
  return `${entry}||${turn_bucket}`;
}

function keyOf({ variant, entry, turn_bucket }) {
  return `${variant}||${entry}||${turn_bucket}`;
}

function isHttpOk(row) {
  if (row && typeof row === 'object') {
    if (row.http_ok !== undefined) return Boolean(Number(row.http_ok));
    if (row.ok !== undefined) return Boolean(Number(row.ok));
  }
  return true;
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/summarize_eval_summary.mjs <summary.json>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.rows) ? raw.rows : [];

  // Aggregate: variant + entry + turnBucket
  const agg = new Map();
  for (const r of rows) {
    const variant = normalizeVariant(r?.variant);
    if (!variant) continue;
    const entry = normalizeEntry(r?.entry);
    const turn_bucket = turnBucketOf(r?.turn_id);

    const k = keyOf({ variant, entry, turn_bucket });
    if (!agg.has(k)) {
      agg.set(k, {
        variant,
        entry,
        turn_bucket,
        n_total: 0,
        n_ok: 0,
        no_result: 0,
        fallback: 0,
        candidates: [],
      });
    }
    const a = agg.get(k);
    a.n_total += 1;

    const ok = isHttpOk(r);
    if (!ok) continue;

    a.n_ok += 1;
    a.no_result += Number(r?.no_result || 0) ? 1 : 0;
    a.fallback += Number(r?.fallback || 0) ? 1 : 0;
    const c = numberOrNull(r?.candidates_count);
    if (c != null) a.candidates.push(c);
  }

  const outDir = path.dirname(input);
  const byBucketPath = path.join(outDir, 'summary_by_bucket.csv');
  const liftPath = path.join(outDir, 'lift_B_minus_A.csv');

  const header = [
    'variant',
    'entry',
    'turn_bucket',
    'n_total',
    'n_ok',
    'ok_rate',
    'no_result_rate',
    'fallback_rate',
    'candidates_p50',
    'candidates_p90',
    'candidates_mean',
  ].join(',');

  const lines = [header];
  const orderedAgg = [...agg.values()].sort((a, b) => {
    if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
    if (a.entry !== b.entry) return a.entry.localeCompare(b.entry);
    return a.turn_bucket.localeCompare(b.turn_bucket);
  });
  for (const a of orderedAgg) {
    const mean = a.candidates.length
      ? a.candidates.reduce((s, x) => s + x, 0) / a.candidates.length
      : null;

    lines.push(
      [
        a.variant,
        a.entry,
        a.turn_bucket,
        a.n_total,
        a.n_ok,
        rate(a.n_ok, a.n_total),
        rate(a.no_result, a.n_ok),
        rate(a.fallback, a.n_ok),
        quantile(a.candidates, 0.5),
        quantile(a.candidates, 0.9),
        mean == null ? '' : mean.toFixed(2),
      ].join(','),
    );
  }
  fs.writeFileSync(byBucketPath, lines.join('\n'));
  console.log(`Wrote: ${byBucketPath}`);

  const mapA = new Map();
  const mapB = new Map();
  for (const a of agg.values()) {
    const bKey = bucketKey({ entry: a.entry, turn_bucket: a.turn_bucket });
    if (a.variant === 'A') mapA.set(bKey, a);
    if (a.variant === 'B') mapB.set(bKey, a);
  }

  const liftHeader = [
    'entry',
    'turn_bucket',
    'A_n_ok',
    'B_n_ok',
    'no_result_rate_A',
    'no_result_rate_B',
    'no_result_rate_delta(B-A)',
    'no_result_rate_rel_improve((A-B)/A)',
    'fallback_rate_A',
    'fallback_rate_B',
    'fallback_rate_delta(B-A)',
    'candidates_p50_A',
    'candidates_p50_B',
    'candidates_p50_delta(B-A)',
  ].join(',');

  const liftLines = [liftHeader];
  const buckets = new Set([...mapA.keys(), ...mapB.keys()]);
  const orderedBuckets = [...buckets].sort((a, b) => a.localeCompare(b));
  for (const b of orderedBuckets) {
    const A = mapA.get(b);
    const B = mapB.get(b);
    const [entry, turn_bucket] = String(b).split('||');

    const A_no = A && A.n_ok ? A.no_result / A.n_ok : null;
    const B_no = B && B.n_ok ? B.no_result / B.n_ok : null;
    const deltaNo = A_no != null && B_no != null ? B_no - A_no : null;
    const relImprove = A_no != null && B_no != null && A_no > 0 ? (A_no - B_no) / A_no : null;

    const A_fb = A && A.n_ok ? A.fallback / A.n_ok : null;
    const B_fb = B && B.n_ok ? B.fallback / B.n_ok : null;
    const deltaFb = A_fb != null && B_fb != null ? B_fb - A_fb : null;

    const A_p50 = A ? quantile(A.candidates, 0.5) : '';
    const B_p50 = B ? quantile(B.candidates, 0.5) : '';
    const deltaP50 = A_p50 !== '' && B_p50 !== '' ? Number(B_p50) - Number(A_p50) : null;

    liftLines.push(
      [
        entry,
        turn_bucket,
        A?.n_ok ?? '',
        B?.n_ok ?? '',
        A_no == null ? '' : A_no.toFixed(6),
        B_no == null ? '' : B_no.toFixed(6),
        deltaNo == null ? '' : deltaNo.toFixed(6),
        relImprove == null ? '' : relImprove.toFixed(6),
        A_fb == null ? '' : A_fb.toFixed(6),
        B_fb == null ? '' : B_fb.toFixed(6),
        deltaFb == null ? '' : deltaFb.toFixed(6),
        A_p50,
        B_p50,
        deltaP50 == null ? '' : String(deltaP50),
      ].join(','),
    );
  }

  fs.writeFileSync(liftPath, liftLines.join('\n'));
  console.log(`Wrote: ${liftPath}`);
}

main();
