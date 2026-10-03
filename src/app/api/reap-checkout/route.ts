import { readExpectedMoney } from '@/lib/reapCheckout/expectedMoney';
// POST /api/reap-checkout — open a Reap checkout for ONE PDP item (demo, behind two flags + an arming guard).
//
// The browser never talks to the gateway: this route validates the form, adds the two credentials
// the Reap lane needs (agent key + a buyer token minted here), calls the gateway's UCP door
// `create_checkout`, and answers the browser a READ VIEW of the checkout (lib/reapCheckout/
// checkoutView.ts) — never the raw body, and never a continue_url that is not Reap's.
//
// The SELLER is pinned by the gateway's seller contract (PIVOTA-Agent docs/reap-agentic-lane.md §5.4):
// the create sends `checkout.reap.expected_merchant_domain` = the configured demo merchant, and the door
// REFUSES (`ucp_seller_mismatch`) any item that would be sold by another seller or whose seller it cannot
// confirm — nothing is opened then. On a Reap answer the route re-checks the published
// `reap.merchant_domain`. The browser gets no gateway link in either case.
//
// A selected Reap checkout never offers another rail or storefront. A legacy non-Reap
// answer remains unknown and retains its exact attempt for read-only recovery.
import { NextRequest, NextResponse } from 'next/server';
import { canonicalMerchantDomain, readDemoMerchantConfig, reapConsentVersion, reapCheckoutProfile } from '@/lib/reapCheckout/config';
import { buildCreateCheckoutArgs, validateReapCreateBody } from '@/lib/reapCheckout/createRequest';
import { mintBuyerToken } from '@/lib/reapCheckout/buyerToken.server';
import { callUcpTool } from '@/lib/reapCheckout/gatewayClient.server';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import {
  buyerScope,
  disabledResponse,
  hostProblem,
  json,
  publicView,
  rateLimited,
  readCappedJson,
  sellerMatches,
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
  if ((body as Record<string, unknown>)?.recover_only !== undefined && typeof (body as Record<string, unknown>).recover_only !== 'boolean') {
    return finish(json({ error: 'invalid_request', field: 'recover_only', message: 'recover_only must be a boolean.' }, 400));
  }
  const recoverOnly = (body as Record<string, unknown>)?.recover_only === true;
  const validated = validateReapCreateBody(body);
  if (!validated.ok) {
    return finish(json({ error: 'invalid_request', field: validated.field, message: validated.message }, 400));
  }

  if (!recoverOnly && !readExpectedMoney(validated.input)) return finish(json({error:"invalid_request",field:"expected_unit_price_minor",message:"The original displayed unit price and currency are required.",attempt_outcome:"not_created"},400));

  // New creates use the current configured scope. Recovery submits the original domain/market
  // to the owner-bound read-only door; changing new-create scope must not rewrite its fingerprint.
  const domain = canonicalMerchantDomain((body as Record<string, unknown>)?.merchant_domain);
  const merchant = recoverOnly && domain
    ? { domain, market: validated.market, merchantIds: [] }
    : readDemoMerchantConfig().find((m) => m.domain === domain);
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

  const requestedSource = validated.input.item_source;
  if (!recoverOnly && reapCheckoutProfile() === 'pilot' && (!merchant.itemSource || requestedSource !== merchant.itemSource
    || !merchant.productIds?.includes(validated.input.product_id))) {
    return finish(json({ error: 'not_available_on_this_rail', attempt_outcome: 'not_created' }, 403));
  }

  // The cookie must have been established before the create was dispatched. If it rotated or was
  // lost, do not replay an old key under a different buyer identity.
  if (minted || (body as Record<string, unknown>).buyer_scope !== buyerScope(config.token, buyerId)) {
    return finish(json({ error: 'buyer_session_changed', message: 'Buyer session changed. Check the previous checkout before starting again.' }, 409));
  }

  // Reads used for recovery are separately capped; create quota must not block lost-id recovery.
  const limited = rateLimited(recoverOnly ? 'read' : 'create', buyerId);
  if (limited) return finish(limited);

  const toolArgs = buildCreateCheckoutArgs(validated.input, {
    consentVersion: reapConsentVersion(),
    profileUrl: config.profileUrl,
    // From server config only: the browser's merchant_domain merely selected this entry.
    expectedMerchantDomain: merchant.domain,
    itemSource: recoverOnly ? requestedSource : (merchant.itemSource ?? requestedSource),
  });
  const outcome = await callUcpTool({
    base: config.base,
    apiKey: config.apiKey,
    userToken: mintBuyerToken(config.token, buyerId),
    // A distinct tool fails closed on older gateways; an optional metadata flag could be ignored
    // and accidentally open a new purchase after the backend's idempotency replay TTL.
    tool: recoverOnly ? 'recover_checkout' : 'create_checkout',
    toolArgs,
  });

  if (outcome.kind === 'unavailable') return finish(json({ error: 'gateway_unavailable', detail: outcome.detail }, 502));
  if (outcome.kind === 'tool_error') {
    // A read-only recovery error cannot establish that the original create made nothing.
    // Keep the owned attempt unresolved regardless of the upstream reason vocabulary.
    if (recoverOnly) return finish(json({ error: 'checkout_outcome_unknown', attempt_outcome: 'unknown' }, 502));
    if (!recoverOnly && outcome.reason === 'reap_create_paused') {
      return finish(json({ checkout: null, attempt_outcome: 'not_created', blocked: 'paused' }));
    }
    if (!recoverOnly && outcome.reason === 'ucp_reap_price_not_created') return finish(json({checkout:null,attempt_outcome:'not_created',blocked:'not_available',message:'The displayed price changed or could not be confirmed. Checkout was not created.'}));
    if (!recoverOnly && outcome.reason === 'ucp_reap_variant_not_created') {
      return finish(json({ checkout: null, attempt_outcome: 'not_created', blocked: 'not_available', message: 'Checkout was not created. The selected variant could not be verified.' }));
    }
    if (outcome.reason === 'ucp_seller_mismatch') {
      // The gateway refused: this item would be sold by someone else, or its seller cannot be confirmed.
      // Nothing was opened. The browser gets NO gateway text and NO gateway link — only the cause; the
      // panel stops the selected route and offers no alternate store link.
      return finish(json({ checkout: null, attempt_outcome: 'not_created', blocked: 'seller_mismatch', cause: outcome.cause === 'different_seller' ? 'different_seller' : 'seller_unconfirmed' }));
    }
    if (outcome.reason === 'ucp_expected_merchant_domain_invalid') {
      // Our own configured domain was refused: a server config bug, not the buyer's.
      console.error('[reap-checkout] gateway refused REAP_CHECKOUT_DEMO_MERCHANTS domain as expected_merchant_domain', {
        domain: merchant.domain,
      });
      return finish(json({ checkout: null, attempt_outcome: 'not_created', blocked: 'not_available' }));
    }
    if (!recoverOnly && ['ucp_reap_create_refused', 'ucp_reap_create_not_available', 'reap_create_paused'].includes(outcome.reason || '')) {
      return finish(json({ checkout: null, attempt_outcome: 'not_created', blocked: 'not_available' }));
    }
    // Any other refusal: generic copy. Gateway text is not forwarded.
    return finish(json({ error: 'checkout_outcome_unknown', code: outcome.code, reason: outcome.reason }, 502));
  }
  const view = readReapCheckout(outcome.checkout);
  if (!view) return finish(json({ error: 'gateway_unavailable', detail: 'not_a_checkout' }, 502));
  if (!view.isReapCheckout) {
    return finish(json({ error: 'checkout_outcome_unknown', attempt_outcome: 'unknown' }, 502));
  }
  // BELT AND BRACES on the gateway's own seller check: the PUBLISHED seller (`reap.merchant_domain`,
  // www.-folded) must be the configured merchant; a configured merchant id must match a published one
  // (the gateway omits the id for the shared external-seed placeholder, so an absent id is fine); and the
  // quote must be for the quantity asked. The checkout id is opaque and is not decoded.
  if (!sellerMatches(view, merchant) || view.lineItems[0]?.quantity !== validated.input.quantity) {
    return finish(json({ checkout: null, attempt_outcome: 'unknown', blocked: 'seller_mismatch', cause: 'seller_unconfirmed' }));
  }
  return finish(json({ checkout: publicView(view, { domain: merchant.domain }) }));
}
