#!/usr/bin/env node
// A LOCAL stand-in for the gateway's UCP door (`POST /ucp/mcp`), for demoing and screenshotting the
// Reap checkout UI with no gateway, no backend, no Reap and no secrets. It answers the Reap lane's own
// checkout objects (src/lib/reapCheckout/__fixtures__/checkouts.ts) and never talks to anything.
//
//   node scripts/reap-mock-gateway.mjs            # listens on 127.0.0.1:8787 only
//   REAP_CHECKOUT_GATEWAY_BASE_URL=http://localhost:8787 (plus the demo env) npm run dev
//
// Flow: create_checkout -> resolving; the 2nd get_checkout -> awaiting approval (PEACHIE20 applied,
// any other code "not applied"); then it waits. Drive the rest by hand:
//   curl 'http://127.0.0.1:8787/__mock/state?next=processing'     (the buyer "approved" on Reap)
//   curl 'http://127.0.0.1:8787/__mock/state?next=completed'
//   next = resolving | needs_card | awaiting | processing | completed | failed | expired | refused
//          | deadline_passed | evil_link
//   curl 'http://127.0.0.1:8787/__mock/scenario?create=not_reap'  (next create answers the storefront)
//
// Requires Node >= 23.6 (imports the TypeScript fixture with native type stripping).
import http from 'node:http';
import {
  awaitingApprovalCheckout,
  canceledCheckout,
  completedCheckout,
  deadlinePassedCheckout,
  needsEnrollmentCheckout,
  processingCheckout,
  resolvingCheckout,
  rpcResult,
  storefrontEscalation,
} from '../src/lib/reapCheckout/__fixtures__/checkouts.ts';

const PORT = Number(process.env.REAP_MOCK_PORT || 8787);
let state = 'resolving';
let gets = 0;
let code = null;
let createScenario = 'reap';

function outcomeFor(c) {
  if (c == null) return undefined;
  return c === 'PEACHIE20' ? 'applied' : 'dropped_invalid';
}

function checkoutFor(name) {
  const deadline = new Date(Date.now() + 5 * 60_000).toISOString();
  switch (name) {
    case 'resolving': return resolvingCheckout(code ? { code } : {});
    case 'needs_card': return needsEnrollmentCheckout({ expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() });
    case 'awaiting': return awaitingApprovalCheckout({ deadline, outcome: outcomeFor(code) });
    case 'awaiting_tax_included': return awaitingApprovalCheckout({ deadline, taxIncluded: true });
    case 'evil_link': return awaitingApprovalCheckout({ deadline, continueUrl: 'https://reap.global.evil.com/pay' });
    case 'processing': return processingCheckout();
    case 'completed': return completedCheckout();
    case 'deadline_passed': return deadlinePassedCheckout();
    case 'failed': return canceledCheckout('failed', 'approval_window_lapsed');
    case 'expired': return canceledCheckout('expired');
    case 'refused': return canceledCheckout('refused', 'price_changed');
    default: return resolvingCheckout();
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/__mock/state') {
    state = url.searchParams.get('next') || state;
    return send(res, 200, { state });
  }
  if (req.method === 'GET' && url.pathname === '/__mock/scenario') {
    createScenario = url.searchParams.get('create') || 'reap';
    return send(res, 200, { createScenario });
  }
  if (req.method !== 'POST' || url.pathname !== '/ucp/mcp') return send(res, 404, { error: 'not_found' });
  // The door's two credentials must be PRESENT (the mock does not verify them).
  if (!req.headers['x-agent-api-key'] || !req.headers['x-agent-user-jwt']) {
    return send(res, 401, { error: 'UNAUTHORIZED' });
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let rpc;
    try { rpc = JSON.parse(raw); } catch { return send(res, 400, { error: 'bad json' }); }
    const name = rpc?.params?.name;
    const args = rpc?.params?.arguments || {};
    if (name === 'create_checkout') {
      const codes = args?.checkout?.discounts?.codes;
      code = Array.isArray(codes) ? codes[0] : null;
      gets = 0;
      state = 'resolving';
      console.log(`[mock] create_checkout item=${args?.checkout?.line_items?.[0]?.item?.id} market=${args?.checkout?.context?.address_country} code=${JSON.stringify(code)}`);
      if (createScenario === 'not_reap') return send(res, 200, rpcResult(storefrontEscalation({ codeWarning: code != null })));
      return send(res, 200, rpcResult(checkoutFor('resolving')));
    }
    if (name === 'get_checkout') {
      gets += 1;
      if (state === 'resolving' && gets >= 2) state = 'awaiting';
      console.log(`[mock] get_checkout -> ${state}`);
      return send(res, 200, rpcResult(checkoutFor(state)));
    }
    return send(res, 200, rpcResult({ error: { code: 'OPERATION_NOT_ALLOWED' } }, true));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock] Reap UCP door mock on http://127.0.0.1:${PORT}/ucp/mcp`);
});
