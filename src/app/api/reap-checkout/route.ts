// POST /api/reap-checkout — open a Reap checkout for ONE PDP item (demo, behind two flags + an arming guard).
//
// The browser never talks to the gateway: this route validates the form, adds the two credentials
// the Reap lane needs (agent key + a buyer token minted here), calls the gateway's UCP door
// `create_checkout`, and answers the browser a READ VIEW of the checkout (lib/reapCheckout/
// checkoutView.ts) — never the raw body, and never a continue_url that is not Reap's.
//
// The SELLER is checked on the gateway's answer, not taken from the browser: the lane buys the row the
// PDP's `sig_` id resolves to, which can be another seller than the offer shown. A Reap checkout whose
// product key names a merchant other than the demo merchant's configured id(s) is answered
// `{ checkout: null, fallback: 'seller_mismatch' }` and its link is never handed out (the purchase the
// lane opened waits for a buyer who never comes; the backend's sweep expires it; nothing is charged).
//
// When the gateway's answer is NOT a Reap checkout (the lane is off, the merchant is not eligible,
// the purchasability gate declined, the backend refused — the door falls through to its storefront
// answer by design), the browser gets `{ checkout: null, fallback: 'not_reap' }` and keeps today's
// "Visit store" path. The storefront answer's own link is NOT forwarded.
import { NextRequest } from 'next/server';
import { canonicalMerchantDomain, readDemoMerchantConfig, reapConsentVersion } from '@/lib/reapCheckout/config';
import { buildCreateCheckoutArgs, validateReapCreateBody } from '@/lib/reapCheckout/createRequest';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { sellerOfReapCheckoutId } from '@/lib/reapCheckout/seller.server';
import {
  disabledResponse,
  json,
  publicView,
  rateKey,
  rateLimited,
  readCappedJson,
  readOrMintBuyerId,
  readServerConfig,
  sameOriginProblem,
  setBuyerCookie,
} from '@/lib/reapCheckout/routeSupport.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const off = disabledResponse();
  if (off) return off;
  const cfg = readServerConfig();
  if ('response' in cfg) return cfg.response;
  const { config } = cfg;

  const crossSite = sameOriginProblem(req);
  if (crossSite) return crossSite;
  // application/json only: a JSON content type also forces a CORS preflight this route never answers.
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }
  const { buyerId, minted } = readOrMintBuyerId(req, config.token);
  const limited = rateLimited('create', rateKey(req, minted ? null : buyerId));
  if (limited) return limited;

  const read = await readCappedJson(req);
  if ('response' in read) return read.response;
  const body = read.body;
  const validated = validateReapCreateBody(body);
  if (!validated.ok) {
    return json({ error: 'invalid_request', field: validated.field, message: validated.message }, 400);
  }

  // DEMO SCOPE: only the merchants Peng listed, and only in the market listed for each.
  const domain = canonicalMerchantDomain((body as Record<string, unknown>)?.merchant_domain);
  const merchant = readDemoMerchantConfig().find((m) => m.domain === domain);
  if (!domain || !merchant) {
    return json({ error: 'merchant_not_in_demo', message: 'This merchant is not part of the Reap demo.' }, 403);
  }
  if (merchant.market !== validated.market) {
    return json(
      {
        error: 'market_not_in_demo',
        field: 'buyer.country',
        message: `In this demo, ${merchant.domain} ships to ${merchant.market} only.`,
      },
      400,
    );
  }

  const toolArgs = buildCreateCheckoutArgs(validated.input, {
    consentVersion: reapConsentVersion(),
    profileUrl: config.profileUrl,
  });
  const outcome = await callUcpTool({
    base: config.base,
    apiKey: config.apiKey,
    userToken: mintBuyerToken(config.token, buyerId),
    tool: 'create_checkout',
    toolArgs,
  });

  let res;
  if (outcome.kind === 'unavailable') {
    res = json({ error: 'gateway_unavailable', detail: outcome.detail }, 502);
  } else if (outcome.kind === 'tool_error') {
    res = json({ checkout: null, fallback: 'refused', code: outcome.code, reason: outcome.reason, message: outcome.message });
  } else {
    const view = readReapCheckout(outcome.checkout);
    if (!view) {
      res = json({ error: 'gateway_unavailable', detail: 'not_a_checkout' }, 502);
    } else if (!view.isReapCheckout) {
      res = json({
        checkout: null,
        fallback: 'not_reap',
        // What the storefront answer said about the code and the buyer block — nothing else of it.
        offer_code_outcome: view.offerCode.outcome,
        available_with_consent: view.messages.some((m) => m.code === 'reap.available_with_consent'),
      });
    } else {
      const seller = sellerOfReapCheckoutId(view.id);
      res =
        seller && merchant.merchantIds.includes(seller)
          ? json({ checkout: publicView(view, { domain: merchant.domain }) })
          : json({ checkout: null, fallback: 'seller_mismatch' });
    }
  }
  if (minted) setBuyerCookie(res, req, config.token, buyerId);
  return res;
}
