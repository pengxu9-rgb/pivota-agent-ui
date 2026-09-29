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
import { NextRequest, NextResponse } from 'next/server';
import { canonicalMerchantDomain, readDemoMerchantConfig, reapConsentVersion } from '@/lib/reapCheckout/config';
import { buildCreateCheckoutArgs, validateReapCreateBody } from '@/lib/reapCheckout/createRequest';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { itemIdOfReapCheckoutId, quantityOfReapCheckoutId, sellerOfReapCheckoutId } from '@/lib/reapCheckout/seller.server';
import {
  disabledResponse,
  hostProblem,
  json,
  publicView,
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
  const wrongHost = hostProblem(req);
  if (wrongHost) return wrongHost;
  const cfg = readServerConfig();
  if ('response' in cfg) return cfg.response;
  const { config } = cfg;

  const crossSite = sameOriginProblem(req);
  if (crossSite) return crossSite;
  // application/json only: a JSON content type also forces a CORS preflight this route never answers.
  if (!/^application\/json\b/i.test(req.headers.get('content-type') || '')) {
    return json({ error: 'unsupported_media_type' }, 415);
  }
  // The buyer is minted (server-side only) BEFORE anything can be refused, and its cookie rides on every
  // answer, so a refused first request still leaves the browser with its own buyer.
  const { buyerId, minted } = readOrMintBuyerId(req, config.token);
  const finish = (res: NextResponse) => {
    if (minted) setBuyerCookie(res, req, config.token, buyerId);
    return res;
  };

  const read = await readCappedJson(req);
  if ('response' in read) return finish(read.response);
  const body = read.body;
  const validated = validateReapCreateBody(body);
  if (!validated.ok) {
    return finish(json({ error: 'invalid_request', field: validated.field, message: validated.message }, 400));
  }

  // DEMO SCOPE: only the merchants Peng listed, and only in the market listed for each.
  const domain = canonicalMerchantDomain((body as Record<string, unknown>)?.merchant_domain);
  const merchant = readDemoMerchantConfig().find((m) => m.domain === domain);
  if (!domain || !merchant) {
    return finish(json({ error: 'merchant_not_in_demo', message: 'This merchant is not part of the Reap demo.' }, 403));
  }
  if (merchant.market !== validated.market) {
    return finish(
      json(
        {
          error: 'market_not_in_demo',
          field: 'buyer.country',
          message: `In this demo, ${merchant.domain} ships to ${merchant.market} only.`,
        },
        400,
      ),
    );
  }

  // Only a request that will reach the gateway is counted (per buyer and globally).
  const limited = rateLimited('create', buyerId);
  if (limited) return finish(limited);

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

  if (outcome.kind === 'unavailable') return finish(json({ error: 'gateway_unavailable', detail: outcome.detail }, 502));
  if (outcome.kind === 'tool_error') {
    return finish(json({ checkout: null, fallback: 'refused', code: outcome.code, reason: outcome.reason, message: outcome.message }));
  }
  const view = readReapCheckout(outcome.checkout);
  if (!view) return finish(json({ error: 'gateway_unavailable', detail: 'not_a_checkout' }, 502));
  if (!view.isReapCheckout) {
    return finish(
      json({
        checkout: null,
        fallback: 'not_reap',
        // What the storefront answer said about the code and the buyer block — nothing else of it.
        offer_code_outcome: view.offerCode.outcome,
        available_with_consent: view.messages.some((m) => m.code === 'reap.available_with_consent'),
      }),
    );
  }
  // SELLER + ITEM + QUANTITY BINDING, from the gateway's own answer: the purchase must be for the product
  // and quantity the buyer asked for (the lane echoes both in the id) AND sold by the demo merchant shown.
  const seller = sellerOfReapCheckoutId(view.id);
  const item = itemIdOfReapCheckoutId(view.id);
  const quantity = quantityOfReapCheckoutId(view.id);
  if (
    !seller ||
    !merchant.merchantIds.includes(seller) ||
    item !== validated.input.product_id ||
    quantity !== validated.input.quantity
  ) {
    return finish(json({ checkout: null, fallback: 'seller_mismatch' }));
  }
  return finish(json({ checkout: publicView(view, { domain: merchant.domain }) }));
}
