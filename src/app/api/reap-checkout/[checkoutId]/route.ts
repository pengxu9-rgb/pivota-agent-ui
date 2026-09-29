// GET /api/reap-checkout/:checkoutId — the checkout's current state, for the status poll.
//
// Same door, same credentials as create, with the SAME buyer (the signed cookie set on create): the
// backend answers a purchase only to the buyer that opened it. A browser without a valid cookie gets 404,
// as does an id that is not a Reap checkout id, and an answer whose PUBLISHED seller is not a demo merchant.
import { NextRequest } from 'next/server';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { readDemoMerchantConfig } from '@/lib/reapCheckout/config';
import {
  disabledResponse,
  hostProblem,
  json,
  publicView,
  rateLimited,
  readBuyerId,
  readServerConfig,
  sellerMatches,
} from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The gateway's own bounds: snapshot <= 1000 base64url chars (ucpReapAgenticLane.js SNAPSHOT_RE).
const REAP_ID_RE = /^reap_rp_[0-9a-f]{24}\.[A-Za-z0-9_-]{1,1000}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ checkoutId: string }> }) {
  const off = disabledResponse();
  if (off) return off;
  const wrongHost = hostProblem(req);
  if (wrongHost) return wrongHost;
  const cfg = readServerConfig();
  if ('response' in cfg) return cfg.response;
  const { config } = cfg;

  // Next has already decoded the path segment once; decoding again turns `%25` into a URIError.
  const { checkoutId } = await ctx.params;
  const id = String(checkoutId || '');
  const buyerId = readBuyerId(req, config.token);
  if (!REAP_ID_RE.test(id) || !buyerId) return json({ error: 'not_found' }, 404);
  const limited = rateLimited('read', buyerId);
  if (limited) return limited;

  const outcome = await callUcpTool({
    base: config.base,
    apiKey: config.apiKey,
    userToken: mintBuyerToken(config.token, buyerId),
    tool: 'get_checkout',
    toolArgs: {
      meta: config.profileUrl ? { 'ucp-agent': { profile: config.profileUrl } } : {},
      id,
    },
    timeoutMs: 8_000,
  });
  if (outcome.kind === 'unavailable') return json({ error: 'gateway_unavailable', detail: outcome.detail }, 502);
  if (outcome.kind === 'tool_error') {
    // QUOTE_NOT_FOUND = unknown id, or another buyer's. Anything else: not terminal, poll again.
    if (outcome.code === 'QUOTE_NOT_FOUND') return json({ error: 'not_found' }, 404);
    return json({ error: 'gateway_unavailable', detail: 'tool_error' }, 502);
  }
  const view = readReapCheckout(outcome.checkout);
  if (!view || !view.isReapCheckout || view.id !== id) {
    return json({ error: 'gateway_unavailable', detail: 'not_this_checkout' }, 502);
  }
  // The id is opaque, so the seller is read from the answer. A good read publishes `reap.merchant_domain`:
  // it must be a configured demo merchant, else this is not a demo purchase (404, nothing shown). The
  // degraded read (`reap.view_unavailable`) publishes no seller by design: answer it WITHOUT a seller, and
  // the browser keeps the seller from its last good answer.
  if (!view.publishedSeller.domain) {
    if (view.viewUnavailable) return json({ checkout: view });
    return json({ error: 'gateway_unavailable', detail: 'seller_unpublished' }, 502);
  }
  const merchant = readDemoMerchantConfig().find((m) => sellerMatches(view, m));
  if (!merchant) return json({ error: 'not_found' }, 404);
  return json({ checkout: publicView(view, { domain: merchant.domain }) });
}
