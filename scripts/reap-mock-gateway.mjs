#!/usr/bin/env node
// A LOCAL stand-in for the gateway's UCP door (`POST /ucp/mcp`), for demoing and screenshotting the
// Reap checkout UI with no gateway, no backend, no Reap and no secrets. It answers the Reap lane's own
// checkout objects (src/lib/reapCheckout/__fixtures__/checkouts.ts) and never talks to anything.
//
//   node scripts/reap-mock-gateway.mjs            # listens on 127.0.0.1:8787 only
//   REAP_CHECKOUT_GATEWAY_BASE_URL=http://localhost:8787 REAP_CHECKOUT_DEMO_MERCHANTS=judydoll.com:US
//     (plus the demo env) npm run dev:reap-demo
//
// Flow: create_checkout -> resolving; the 2nd get_checkout -> awaiting approval (PEACHIE20 applied,
// any other code "not applied"); then it waits. Drive the rest by hand:
//   curl 'http://127.0.0.1:8787/__mock/state?next=processing'     (the buyer "approved" on Reap)
//   curl 'http://127.0.0.1:8787/__mock/state?next=completed'
//   next = resolving | needs_card | awaiting | processing | completed | failed | failed_unknown | expired | refused
//          | deadline_passed | evil_link
//   curl 'http://127.0.0.1:8787/__mock/scenario?create=not_reap'  (next create answers the storefront)
//   curl 'http://127.0.0.1:8787/__mock/scenario?create=seller_mismatch'     (the door refuses: different_seller)
//   curl 'http://127.0.0.1:8787/__mock/scenario?create=seller_unconfirmed'  (the door refuses: seller_unconfirmed)
//
// Like the real door (PIVOTA-Agent docs/reap-agentic-lane.md §5.4), every good Reap answer publishes the
// seller as `reap.merchant_domain` at $.line_items[0] (judydoll.com, the external-seed demo row: no
// `reap.merchant_id`), and a create whose `checkout.reap.expected_merchant_domain` does not fold to that
// seller is refused `ucp_seller_mismatch`.
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
  sellerMismatchError,
  storefrontEscalation,
} from '../src/lib/reapCheckout/__fixtures__/checkouts.ts';

const MOCK_SELLER = 'judydoll.com';
const fold = (h) => (typeof h === 'string' ? h.trim().toLowerCase().replace(/^www\./, '') : '');

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
    case 'failed_unknown': return canceledCheckout('failed');
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
      console.log(`[mock] create_checkout item=${args?.checkout?.line_items?.[0]?.item?.id} market=${args?.checkout?.context?.address_country} code=${JSON.stringify(code)} expected_seller=${args?.checkout?.reap?.expected_merchant_domain}`);
      if (createScenario === 'not_reap') return send(res, 200, rpcResult(storefrontEscalation({ codeWarning: code != null })));
      if (createScenario === 'seller_mismatch') return send(res, 200, rpcResult(sellerMismatchError('different_seller'), true));
      if (createScenario === 'seller_unconfirmed') return send(res, 200, rpcResult(sellerMismatchError('seller_unconfirmed'), true));
      const expected = args?.checkout?.reap?.expected_merchant_domain;
      if (expected !== undefined && fold(expected) !== fold(MOCK_SELLER)) {
        return send(res, 200, rpcResult(sellerMismatchError('different_seller'), true));
      }
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
