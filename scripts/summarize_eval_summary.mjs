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

function normalizeString(v) {
  return String(v || '').trim();
}

function normalizeLower(v) {
  return String(v || '').trim().toLowerCase();
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
        expected_n: 0,
        expected_hit: 0,
        history_used_n: 0,
        history_used_sum: 0,
        used_recent_queries_count_n: 0,
        used_recent_queries_count_sum: 0,
        used_recent_queries_gt0: 0,
        rewritten_query_n: 0,
        rewritten_query_changed: 0,
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

    const expectedHit = numberOrNull(r?.top1_expected_hit);
    if (expectedHit != null) {
      a.expected_n += 1;
      a.expected_hit += expectedHit === 1 ? 1 : 0;
    }

    const historyUsed = numberOrNull(r?.debug_history_used);
    if (historyUsed != null) {
      a.history_used_n += 1;
      a.history_used_sum += historyUsed === 1 ? 1 : 0;
    }

    const usedCount = numberOrNull(r?.debug_used_recent_queries_count);
    if (usedCount != null) {
      a.used_recent_queries_count_n += 1;
      a.used_recent_queries_count_sum += usedCount;
      if (usedCount > 0) a.used_recent_queries_gt0 += 1;
    }

    const rewritten = normalizeString(r?.debug_rewritten_query);
    if (rewritten) {
      a.rewritten_query_n += 1;
      const q = normalizeLower(r?.query);
      const rw = normalizeLower(rewritten);
      if (q && rw && q !== rw) a.rewritten_query_changed += 1;
    }
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
    'expected_n',
    'top1_expected_hit_rate',
    'history_used_n',
    'history_used_rate',
    'used_recent_queries_count_n',
    'used_recent_queries_count_mean',
    'used_recent_queries_gt0_rate',
    'rewritten_query_n',
    'rewritten_query_changed_rate',
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
        a.expected_n,
        a.expected_n ? rate(a.expected_hit, a.expected_n) : '',
        a.history_used_n,
        a.history_used_n ? rate(a.history_used_sum, a.history_used_n) : '',
        a.used_recent_queries_count_n,
        a.used_recent_queries_count_n
          ? (a.used_recent_queries_count_sum / a.used_recent_queries_count_n).toFixed(2)
          : '',
        a.used_recent_queries_count_n
          ? rate(a.used_recent_queries_gt0, a.used_recent_queries_count_n)
          : '',
        a.rewritten_query_n,
        a.rewritten_query_n ? rate(a.rewritten_query_changed, a.rewritten_query_n) : '',
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
    'expected_n_A',
    'expected_n_B',
    'top1_expected_hit_rate_A',
    'top1_expected_hit_rate_B',
    'top1_expected_hit_rate_delta(B-A)',
    'history_used_rate_A',
    'history_used_rate_B',
    'history_used_rate_delta(B-A)',
    'used_recent_queries_gt0_rate_A',
    'used_recent_queries_gt0_rate_B',
    'used_recent_queries_gt0_rate_delta(B-A)',
    'used_recent_queries_count_mean_A',
    'used_recent_queries_count_mean_B',
    'used_recent_queries_count_mean_delta(B-A)',
    'rewritten_query_changed_rate_A',
    'rewritten_query_changed_rate_B',
    'rewritten_query_changed_rate_delta(B-A)',
    'pair_n',
    'top1_changed_n',
    'top1_changed_rate',
  ].join(',');

  // Pairwise top1 diff: (entry, turn_bucket, suite_id, convo_id, turn_id) join A/B.
  const SEP = '\u001f';
  const joinKey = (parts) => parts.join(SEP);
  const top1A = new Map();
  const top1B = new Map();
  for (const r of rows) {
    const variant = normalizeVariant(r?.variant);
    if (!variant) continue;
    if (!isHttpOk(r)) continue;

    const entry = normalizeEntry(r?.entry);
    const turn_bucket = turnBucketOf(r?.turn_id);
    const suiteId = normalizeString(r?.suite_id);
    const convoId = normalizeString(r?.convo_id);
    const turnId = String(r?.turn_id ?? '').trim();
    const top1Id = normalizeString(r?.top1_product_id);
    if (!top1Id) continue;
    if (!suiteId || !convoId || !turnId) continue;

    const key = joinKey([entry, turn_bucket, suiteId, convoId, turnId]);
    if (variant === 'A') top1A.set(key, top1Id);
    if (variant === 'B') top1B.set(key, top1Id);
  }
  const top1DiffAgg = new Map(); // bucket -> {pair_n, changed_n}
  for (const [key, aId] of top1A.entries()) {
    const bId = top1B.get(key);
    if (!bId) continue;
    const parts = key.split(SEP);
    const entry = parts[0] || 'unknown';
    const turn_bucket = parts[1] || 'turn1';
    const bucket = bucketKey({ entry, turn_bucket });
    if (!top1DiffAgg.has(bucket)) top1DiffAgg.set(bucket, { pair_n: 0, changed_n: 0 });
    const b = top1DiffAgg.get(bucket);
    b.pair_n += 1;
    if (aId !== bId) b.changed_n += 1;
  }

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

    const A_exp_rate = A && A.expected_n ? A.expected_hit / A.expected_n : null;
    const B_exp_rate = B && B.expected_n ? B.expected_hit / B.expected_n : null;
    const deltaExp = A_exp_rate != null && B_exp_rate != null ? B_exp_rate - A_exp_rate : null;

    const A_hist_rate =
      A && A.history_used_n ? A.history_used_sum / A.history_used_n : null;
    const B_hist_rate =
      B && B.history_used_n ? B.history_used_sum / B.history_used_n : null;
    const deltaHist = A_hist_rate != null && B_hist_rate != null ? B_hist_rate - A_hist_rate : null;

    const A_gt0_rate =
      A && A.used_recent_queries_count_n
        ? A.used_recent_queries_gt0 / A.used_recent_queries_count_n
        : null;
    const B_gt0_rate =
      B && B.used_recent_queries_count_n
        ? B.used_recent_queries_gt0 / B.used_recent_queries_count_n
        : null;
    const deltaGt0 = A_gt0_rate != null && B_gt0_rate != null ? B_gt0_rate - A_gt0_rate : null;

    const A_used_mean =
      A && A.used_recent_queries_count_n
        ? A.used_recent_queries_count_sum / A.used_recent_queries_count_n
        : null;
    const B_used_mean =
      B && B.used_recent_queries_count_n
        ? B.used_recent_queries_count_sum / B.used_recent_queries_count_n
        : null;
    const deltaUsedMean =
      A_used_mean != null && B_used_mean != null ? B_used_mean - A_used_mean : null;

    const A_rw_rate =
      A && A.rewritten_query_n ? A.rewritten_query_changed / A.rewritten_query_n : null;
    const B_rw_rate =
      B && B.rewritten_query_n ? B.rewritten_query_changed / B.rewritten_query_n : null;
    const deltaRw = A_rw_rate != null && B_rw_rate != null ? B_rw_rate - A_rw_rate : null;

    const diff = top1DiffAgg.get(b);
    const pairN = diff ? diff.pair_n : 0;
    const changedN = diff ? diff.changed_n : 0;
    const changedRate = pairN ? changedN / pairN : null;

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
        A?.expected_n ?? 0,
        B?.expected_n ?? 0,
        A_exp_rate == null ? '' : A_exp_rate.toFixed(6),
        B_exp_rate == null ? '' : B_exp_rate.toFixed(6),
        deltaExp == null ? '' : deltaExp.toFixed(6),
        A_hist_rate == null ? '' : A_hist_rate.toFixed(6),
        B_hist_rate == null ? '' : B_hist_rate.toFixed(6),
        deltaHist == null ? '' : deltaHist.toFixed(6),
        A_gt0_rate == null ? '' : A_gt0_rate.toFixed(6),
        B_gt0_rate == null ? '' : B_gt0_rate.toFixed(6),
        deltaGt0 == null ? '' : deltaGt0.toFixed(6),
        A_used_mean == null ? '' : A_used_mean.toFixed(2),
        B_used_mean == null ? '' : B_used_mean.toFixed(2),
        deltaUsedMean == null ? '' : deltaUsedMean.toFixed(2),
        A_rw_rate == null ? '' : A_rw_rate.toFixed(6),
        B_rw_rate == null ? '' : B_rw_rate.toFixed(6),
        deltaRw == null ? '' : deltaRw.toFixed(6),
        pairN || '',
        pairN ? changedN : '',
        changedRate == null ? '' : changedRate.toFixed(6),
      ].join(','),
    );
  }

  fs.writeFileSync(liftPath, liftLines.join('\n'));
  console.log(`Wrote: ${liftPath}`);
}

main();
