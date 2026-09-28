// GET /api/reap-checkout/:checkoutId — the checkout's current state, for the status poll.
//
// Same door, same credentials as create, with the SAME buyer (the HttpOnly cookie set on create): the
// backend answers a purchase only to the buyer that opened it. A browser without that cookie gets 404,
// as does an id that is not a Reap checkout id.
import { NextRequest } from 'next/server';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import {
  disabledResponse,
  json,
  publicView,
  readBuyerId,
  readServerConfig,
} from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REAP_ID_RE = /^reap_rp_[0-9a-f]{24}\.[A-Za-z0-9_-]{1,480}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ checkoutId: string }> }) {
  const off = disabledResponse();
  if (off) return off;
  const cfg = readServerConfig();
  if ('response' in cfg) return cfg.response;
  const { config } = cfg;

  const { checkoutId } = await ctx.params;
  const id = decodeURIComponent(String(checkoutId || ''));
  const buyerId = readBuyerId(req);
  if (!REAP_ID_RE.test(id) || !buyerId) return json({ error: 'not_found' }, 404);

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
  return json({ checkout: publicView(view) });
}
