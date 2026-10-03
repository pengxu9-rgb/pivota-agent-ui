// Read-only selection preparation. Browser credentials stay server-side; no purchase is dispatched.
import { NextRequest } from 'next/server';
import { canonicalMerchantDomain, readDemoMerchantConfig, reapCheckoutProfile, reapConsentVersion } from '@/lib/reapCheckout/config';
import { validateReapCreateBody, buildCreateCheckoutArgs } from '@/lib/reapCheckout/createRequest';
import { readSelection } from '@/lib/reapCheckout/selection';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { disabledResponse, hostProblem, readServerConfig, sameOriginProblem, readCappedJson, readOrMintBuyerId, buyerScope, rateLimited, json } from '@/lib/reapCheckout/routeSupport.server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const off = disabledResponse(); if (off) return off;
  const host = hostProblem(req); if (host) return host;
  const cfg = readServerConfig(); if ('response' in cfg) return cfg.response;
  const crossSite = sameOriginProblem(req); if (crossSite) return crossSite;
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) return json({ error:'unsupported_media_type' },415);
  const read = await readCappedJson(req); if ('response' in read) return read.response;
  const body = read.body as Record<string, unknown>;
  if (body.recover_only !== undefined || body.selection !== undefined) return json({error:'invalid_request'},400);
  const validated = validateReapCreateBody(body);
  if (!validated.ok) return json({error:'invalid_request',field:validated.field},400);
  const domain=canonicalMerchantDomain(body.merchant_domain);
  const merchant=readDemoMerchantConfig().find(m => m.domain===domain);
  if (!merchant || merchant.market!==validated.market || validated.input.item_source!=='cart_link' || !validated.input.variant_id) return json({error:'selection_not_available'},403);
  if (reapCheckoutProfile()==='pilot' && (merchant.itemSource!=='cart_link' || !merchant.productIds?.includes(validated.input.product_id))) return json({error:'selection_not_available'},403);
  const {config}=cfg;
  const {buyerId,minted}=readOrMintBuyerId(req,config.token);
  // Only bootstrap may mint an owner. Activity on prepare/create/recover never renews the four-hour cookie.
  if (minted || body.buyer_scope!==buyerScope(config.token,buyerId)) return json({error:'buyer_session_changed'},409);
  const limit=rateLimited('read',buyerId); if (limit) return limit;
  const outcome=await callUcpTool({base:config.base,apiKey:config.apiKey,userToken:mintBuyerToken(config.token,buyerId),tool:'prepare_checkout',
    toolArgs:buildCreateCheckoutArgs(validated.input,{consentVersion:reapConsentVersion(),profileUrl:config.profileUrl,expectedMerchantDomain:merchant.domain,itemSource:'cart_link'})});
  if (outcome.kind!=='checkout') return json({error:'selection_not_prepared',attempt_outcome:'not_created'},502);
  const value=outcome.checkout as {selection?:unknown};
  const selection=readSelection(value?.selection);
  if (!selection || canonicalMerchantDomain(selection.merchant_domain)!==merchant.domain || selection.market!==validated.market
    || selection.quantity!==validated.input.quantity || selection.variant_id!==validated.input.variant_id) return json({error:'selection_not_prepared',attempt_outcome:'not_created'},502);
  return json({selection});
}
