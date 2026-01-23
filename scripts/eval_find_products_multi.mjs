#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

/**
 * Evaluate find_products_multi across a JSONL "golden query suite" with A/B variants:
 * - A: recent_queries = []
 * - B: recent_queries = history queue (dedupe + max 8), updated after each turn
 *
 * Usage:
 *   node scripts/eval_find_products_multi.mjs data/suite.jsonl
 *
 * Env:
 *   EVAL_INVOKE_URL   Required. Examples:
 *     - https://agent.pivota.cc/api/gateway              (recommended; uses UI proxy)
 *     - https://web-production-fedb.up.railway.app/agent/shop/v1/invoke
 *     - http://localhost:3000/agent/shop/v1/invoke
 *   EVAL_AGENT_API_KEY     Optional. Used when hitting invoke directly.
 *   EVAL_CHECKOUT_TOKEN    Optional. Used when hitting invoke directly.
 *   EVAL_LIMIT             Optional. Default 50.
 *   EVAL_CONCURRENCY       Optional. Default 1. Parallel convos (turns remain sequential per convo).
 *   EVAL_RUN_ID            Optional. Default run_<timestamp>.
 */

function uniqPush(queue, q, max = 8) {
  const trimmed = String(q || '').trim();
  if (!trimmed) return queue;
  const next = queue.filter((x) => x !== trimmed);
  next.unshift(trimmed);
  return next.slice(0, max);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 80);
}

function resolveInvokeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Missing EVAL_INVOKE_URL');
  return raw.replace(/\/$/, '');
}

async function callInvoke({
  invokeUrl,
  agentApiKey,
  checkoutToken,
  query,
  entry,
  recentQueries,
  evalMeta,
  limit,
}) {
  const body = {
    operation: 'find_products_multi',
    payload: {
      search: {
        query,
        limit,
        in_stock_only: false,
      },
      user: { recent_queries: recentQueries },
    },
    metadata: {
      source: 'shopping_agent',
      scope: { catalog: 'global' },
      ...(entry ? { entry } : {}),
      eval: evalMeta,
    },
  };

  const headers = {
    'content-type': 'application/json',
    ...(checkoutToken ? { 'X-Checkout-Token': checkoutToken } : {}),
    ...(!checkoutToken && agentApiKey ? { 'X-Agent-API-Key': agentApiKey } : {}),
  };

  let res;
  try {
    res = await fetch(invokeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err && typeof err === 'object' && 'cause' in err ? err.cause : undefined;
    return {
      ok: false,
      status: 0,
      error: {
        type: 'FETCH_FAILED',
        message: msg,
        cause: cause ? String(cause) : undefined,
      },
    };
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: json };
  }
  return { ok: true, status: res.status, json };
}

function extractCandidates(resp) {
  if (Array.isArray(resp?.products)) return resp.products;
  if (Array.isArray(resp?.result?.products)) return resp.result.products;
  if (Array.isArray(resp?.data?.products)) return resp.data.products;
  return [];
}

function extractFallbackReason(resp) {
  const direct =
    resp?.debug?.fallback_reason ??
    resp?.result?.debug?.fallback_reason ??
    resp?.data?.debug?.fallback_reason ??
    null;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  // Best-effort fallback inference using existing metadata (until backend ships debug.fallback_reason).
  const querySource =
    resp?.metadata?.query_source ??
    resp?.result?.metadata?.query_source ??
    resp?.data?.metadata?.query_source ??
    null;
  if (typeof querySource === 'string' && /fallback/i.test(querySource)) return querySource;
  return null;
}

function extractTop1(products) {
  const p = Array.isArray(products) ? products[0] : null;
  if (!p || typeof p !== 'object') {
    return { product_id: '', title: '', merchant_id: '' };
  }

  const productId = p?.product_id ?? p?.productId ?? p?.id ?? '';
  const title = p?.title ?? p?.name ?? '';
  const merchantId = p?.merchant_id ?? p?.merchantId ?? '';

  return {
    product_id: String(productId || '').trim(),
    title: String(title || '').trim(),
    merchant_id: String(merchantId || '').trim(),
  };
}

function normalizeExpectedKeywords(turn) {
  const kws = turn?.expected?.must_include_keywords;
  const arr = Array.isArray(kws) ? kws : [];
  return arr
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function expectedHitForTop1Title({ expectedKeywords, top1Title }) {
  if (!expectedKeywords || expectedKeywords.length === 0) return null;
  if (!top1Title) return 0;
  const hay = String(top1Title).toLowerCase();
  return expectedKeywords.every((kw) => hay.includes(String(kw).toLowerCase())) ? 1 : 0;
}

async function readJsonlTurns(filePath) {
  const turns = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const s = String(line || '').trim();
    if (!s) continue;
    turns.push(JSON.parse(s));
  }
  return turns;
}

function groupTurnsByConvo(turns) {
  const byConvo = new Map();
  for (const t of turns) {
    const convoId = String(t.convo_id || '').trim();
    if (!convoId) continue;
    if (!byConvo.has(convoId)) byConvo.set(convoId, []);
    byConvo.get(convoId).push(t);
  }
  for (const [cid, arr] of byConvo) {
    arr.sort((a, b) => Number(a.turn_id) - Number(b.turn_id));
    byConvo.set(cid, arr);
  }
  return byConvo;
}

async function runWithConcurrency(items, concurrency, worker) {
  const n = Math.max(1, Math.floor(Number(concurrency || 1)));
  let cursor = 0;

  const runners = Array.from({ length: n }, async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) break;
      await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
}

async function main() {
  const inputFile = process.argv[2];
  const invokeUrl = resolveInvokeUrl(process.env.EVAL_INVOKE_URL);
  const agentApiKey = process.env.EVAL_AGENT_API_KEY || '';
  const checkoutToken = process.env.EVAL_CHECKOUT_TOKEN || '';
  const limit = Number(process.env.EVAL_LIMIT || 50);
  const concurrency = Number(process.env.EVAL_CONCURRENCY || 1);

  if (!inputFile) {
    console.error('Usage: node scripts/eval_find_products_multi.mjs <suite.jsonl>');
    process.exit(1);
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    console.error('EVAL_LIMIT must be a positive number');
    process.exit(1);
  }
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    console.error('EVAL_CONCURRENCY must be a positive number');
    process.exit(1);
  }

  const runId = String(process.env.EVAL_RUN_ID || `run_${Date.now()}`);
  const suiteIdFallback = path.basename(inputFile).replace(/\.[^.]+$/, '');
  const outDir = path.join('eval_out', safeFilePart(runId));
  ensureDir(outDir);

  const turns = await readJsonlTurns(inputFile);
  const byConvo = groupTurnsByConvo(turns);
  const convoEntries = [...byConvo.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)));

  const variants = ['A', 'B'];
  const summary = [];

  for (const variant of variants) {
    await runWithConcurrency(convoEntries, concurrency, async ([convoId, convoTurns]) => {
      let history = [];

      for (const t of convoTurns) {
        const suite_id = String(t.suite_id || suiteIdFallback);
        const turn_id = Number(t.turn_id);
        const entry = t.entry ? String(t.entry) : undefined;
        const query = String(t.query || '').trim();
        const recentQueries = variant === 'A' ? [] : history;

        const evalMeta = {
          run_id: runId,
          variant,
          suite_id,
          convo_id: convoId,
          turn_id,
        };

        const resp = await callInvoke({
          invokeUrl,
          agentApiKey,
          checkoutToken,
          query,
          entry,
          recentQueries,
          evalMeta,
          limit,
        });

        const fileBase = `${variant}_${safeFilePart(convoId)}_t${turn_id}`;
        let candidatesCount = null;
        let noResult = null;
        let fallbackReason = null;
        let querySource = '';
        let total = null;
        let top1ProductId = '';
        let top1Title = '';
        let top1MerchantId = '';
        let debugRewrittenQuery = '';
        let debugHistoryUsed = null;
        let debugUsedRecentQueriesCount = null;
        const expectedKeywords = normalizeExpectedKeywords(t);
        let top1ExpectedHit = null;

        if (resp.ok) {
          const candidates = extractCandidates(resp.json);
          candidatesCount = candidates.length;
          noResult = candidatesCount === 0;
          fallbackReason = extractFallbackReason(resp.json);
          querySource = String(resp.json?.metadata?.query_source || '').trim();
          total = Number.isFinite(Number(resp.json?.total)) ? Number(resp.json?.total) : null;

          const top1 = extractTop1(candidates);
          top1ProductId = top1.product_id;
          top1Title = top1.title;
          top1MerchantId = top1.merchant_id;
          top1ExpectedHit = expectedHitForTop1Title({ expectedKeywords, top1Title });

          debugRewrittenQuery = String(resp.json?.debug?.rewritten_query || '').trim();
          debugHistoryUsed =
            typeof resp.json?.debug?.history_used === 'boolean'
              ? resp.json.debug.history_used
                ? 1
                : 0
              : null;
          debugUsedRecentQueriesCount = Number.isFinite(
            Number(resp.json?.debug?.used_recent_queries_count),
          )
            ? Number(resp.json.debug.used_recent_queries_count)
            : null;

          fs.writeFileSync(
            path.join(outDir, `${fileBase}.json`),
            JSON.stringify(resp.json, null, 2),
          );
        } else {
          fs.writeFileSync(
            path.join(outDir, `${fileBase}.error.json`),
            JSON.stringify(resp, null, 2),
          );
        }

        summary.push({
          run_id: runId,
          variant,
          suite_id,
          convo_id: convoId,
          turn_id,
          entry: entry || '',
          query,
          http_ok: resp.ok ? 1 : 0,
          http_status: resp.status,
          ok: resp.ok ? 1 : 0,
          status: resp.status,
          no_result: resp.ok ? (noResult ? 1 : 0) : null,
          candidates_count: candidatesCount,
          total,
          fallback: resp.ok ? (fallbackReason ? 1 : 0) : null,
          fallback_reason: fallbackReason || '',
          query_source: querySource,
          top1_product_id: resp.ok ? top1ProductId : null,
          top1_title: resp.ok ? top1Title : null,
          top1_merchant_id: resp.ok ? top1MerchantId : null,
          expected_must_include_keywords: expectedKeywords.length ? expectedKeywords : null,
          top1_expected_hit: resp.ok ? top1ExpectedHit : null,
          debug_rewritten_query: resp.ok ? debugRewrittenQuery : null,
          debug_history_used: resp.ok ? debugHistoryUsed : null,
          debug_used_recent_queries_count: resp.ok ? debugUsedRecentQueriesCount : null,
        });

        // B variant: request uses history first, then we enqueue the current query.
        if (variant === 'B') {
          history = uniqPush(history, query, 8);
        }
      }
    });
  }

  summary.sort((a, b) => {
    const av = String(a.variant || '');
    const bv = String(b.variant || '');
    if (av !== bv) return av.localeCompare(bv);
    const ac = String(a.convo_id || '');
    const bc = String(b.convo_id || '');
    if (ac !== bc) return ac.localeCompare(bc);
    return Number(a.turn_id || 0) - Number(b.turn_id || 0);
  });

  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
  );
  console.log(`Done. Output: ${outDir}/summary.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
