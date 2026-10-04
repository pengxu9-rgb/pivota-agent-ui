// Same-purchase contact re-entry. An error is never permission to create a replacement.
import { NextRequest } from 'next/server';
import { canonicalMerchantDomain, readDemoMerchantConfig, reapCheckoutProfile, reapConsentVersion } from '@/lib/reapCheckout/config';
import { buildCreateCheckoutArgs, validateReapCreateBody } from '@/lib/reapCheckout/createRequest';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { isCheckoutForItem, readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { REAP_ID_RE } from '@/lib/reapCheckout/recoveryMarkers';
import { buyerScope, disabledResponse, hostProblem, json, publicView, rateLimited, readBuyerId, readCappedJson, readServerConfig, sameOriginProblem, sellerMatches } from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ checkoutId: string }> }) {
  const off = disabledResponse(); if (off) return off;
  const wrongHost = hostProblem(req); if (wrongHost) return wrongHost;
  const crossSite = sameOriginProblem(req); if (crossSite) return crossSite;
  const cfg = readServerConfig(); if ('response' in cfg) return cfg.response;
  const { config } = cfg;
  const { checkoutId } = await context.params;
  if (!REAP_ID_RE.test(checkoutId)) return json({ error: 'not_found' }, 404);
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return json({ error: 'unsupported_media_type' }, 415);
  const read = await readCappedJson(req); if ('response' in read) return read.response;
  const body = read.body as Record<string, unknown> | null;
  const validated = validateReapCreateBody(body);
  if (!validated.ok) return json({ error: 'invalid_request', field: validated.field, message: validated.message }, 400);
  // Do not mint/rotate a buyer while recovering an existing purchase.
  const buyerId = readBuyerId(req, config.token);
  if (!buyerId || body?.buyer_scope !== buyerScope(config.token, buyerId)) return json({ error: 'buyer_session_changed' }, 409);
  const domain = canonicalMerchantDomain(body?.merchant_domain);
  const merchant = readDemoMerchantConfig().find((m) => m.domain === domain);
  if (!merchant || merchant.market !== validated.market) return json({ error: 'continuation_not_available' }, 403);
  const source = validated.input.item_source;
  if (reapCheckoutProfile() === 'pilot' && (!merchant.itemSource || source !== merchant.itemSource ||
      !merchant.productIds?.includes(validated.input.product_id))) return json({ error: 'continuation_not_available' }, 403);
  const limited = rateLimited('create', buyerId); if (limited) return limited;
  const toolArgs = buildCreateCheckoutArgs(validated.input, {
    consentVersion: reapConsentVersion(), profileUrl: config.profileUrl,
    expectedMerchantDomain: merchant.domain, itemSource: source,
  });
  const outcome = await callUcpTool({ base: config.base, apiKey: config.apiKey, userToken: mintBuyerToken(config.token, buyerId),
    tool: 'resume_checkout', toolArgs: { ...toolArgs, checkout_id: checkoutId } });
  if (outcome.kind !== 'checkout') return json({ error: 'continuation_outcome_unknown', attempt_outcome: 'unknown' }, 502);
  const view = readReapCheckout(outcome.checkout);
  if (!view || !view.isReapCheckout || view.id !== checkoutId || !isCheckoutForItem(view, validated.input.product_id) ||
      (!view.viewUnavailable && !sellerMatches(view, merchant)) || view.lineItems[0]?.quantity !== validated.input.quantity) {
    return json({ error: 'continuation_outcome_unknown', attempt_outcome: 'unknown' }, 502);
  }
  return json({ checkout: publicView(view.viewUnavailable ? { ...view, continueUrl: null } : view, { domain: merchant.domain }) });
}
