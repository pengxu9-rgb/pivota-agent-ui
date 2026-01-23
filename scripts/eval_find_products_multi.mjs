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

  const res = await fetch(invokeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

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

async function main() {
  const inputFile = process.argv[2];
  const invokeUrl = resolveInvokeUrl(process.env.EVAL_INVOKE_URL);
  const agentApiKey = process.env.EVAL_AGENT_API_KEY || '';
  const checkoutToken = process.env.EVAL_CHECKOUT_TOKEN || '';
  const limit = Number(process.env.EVAL_LIMIT || 50);

  if (!inputFile) {
    console.error('Usage: node scripts/eval_find_products_multi.mjs <suite.jsonl>');
    process.exit(1);
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    console.error('EVAL_LIMIT must be a positive number');
    process.exit(1);
  }

  const runId = String(process.env.EVAL_RUN_ID || `run_${Date.now()}`);
  const suiteIdFallback = path.basename(inputFile).replace(/\.[^.]+$/, '');
  const outDir = path.join('eval_out', safeFilePart(runId));
  ensureDir(outDir);

  const turns = await readJsonlTurns(inputFile);
  const byConvo = groupTurnsByConvo(turns);

  const variants = ['A', 'B'];
  const summary = [];

  for (const variant of variants) {
    for (const [convoId, convoTurns] of byConvo) {
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
        let candidatesCount = 0;
        let noResult = true;
        let fallbackReason = null;
        let querySource = '';

        if (resp.ok) {
          const candidates = extractCandidates(resp.json);
          candidatesCount = candidates.length;
          noResult = candidatesCount === 0;
          fallbackReason = extractFallbackReason(resp.json);
          querySource = String(resp.json?.metadata?.query_source || '').trim();

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
          ok: resp.ok ? 1 : 0,
          status: resp.status,
          no_result: noResult ? 1 : 0,
          candidates_count: candidatesCount,
          fallback: fallbackReason ? 1 : 0,
          fallback_reason: fallbackReason || '',
          query_source: querySource,
        });

        // B variant: request uses history first, then we enqueue the current query.
        if (variant === 'B') {
          history = uniqPush(history, query, 8);
        }
      }
    }
  }

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

