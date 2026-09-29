// UCP checkouts as the gateway's Reap lane builds them (PIVOTA-Agent mcp-server/src/ucpReapAgenticLane.js
// `mapReapPurchaseToCheckout` + ucpCheckoutEscalation.js `buildUcpCheckoutEnvelope`), one per state.
// Message codes, paths, row types and display texts are the lane's own; used by the tests and by the
// local mock gateway (scripts/reap-mock-gateway.mjs imports the JSON twin of this file's builder).
// Ids as the lane mints them. They are OPAQUE to the UI (§5.2): nothing decodes them.
export const PRODUCT_ID = 'sig_6433c8107859a484fb72d14861e84690';
export const REAP_ID =
  'reap_rp_0123456789abcdef01234567.eyJ2IjoxLCJpIjoic2lnXzY0MzNjODEwNzg1OWE0ODRmYjcyZDE0ODYxZTg0NjkwIiwiayI6InByb2Q6Om1lcmNoX2p1ZHlkb2xsX2RlbW86OnNob3BpZnk6OjgxMjM0NTY3ODkiLCJxIjoxLCJjIjoiVVNEIiwidSI6MTYwMH0';

/**
 * The seller the gateway publishes on a good Reap answer (§5.4): `info` messages at `$.line_items[0]`,
 * bare values. The DEFAULT is the live judydoll demo row: an external-seed row whose catalog key is the
 * shared placeholder, so `reap.merchant_id` is OMITTED and only `reap.merchant_domain` is published.
 */
export type SellerOpt = { domain?: string | null; merchantId?: string | null };
const DEFAULT_SELLER: SellerOpt = { domain: 'judydoll.com', merchantId: null };
let currentSeller: SellerOpt = DEFAULT_SELLER;

function sellerMessages(seller: SellerOpt) {
  const out: unknown[] = [];
  if (seller.domain) out.push(info('reap.merchant_domain', seller.domain, '$.line_items[0]'));
  if (seller.merchantId) out.push(info('reap.merchant_id', seller.merchantId, '$.line_items[0]'));
  return out;
}

/** Run `fn` with every fixture built in it publishing `seller` (e.g. `{ domain: 'www.other.com' }`). */
export function withSeller<T>(seller: SellerOpt, fn: () => T): T {
  const prev = currentSeller;
  currentSeller = seller;
  try {
    return fn();
  } finally {
    currentSeller = prev;
  }
}

/** The door's refusal when the item would be sold by someone else (§5.4, byte-shaped like the wire). */
export function sellerMismatchError(cause: 'different_seller' | 'seller_unconfirmed' = 'different_seller') {
  return {
    error: {
      code: 'QUOTE_REQUIRED',
      message: 'The item at checkout.line_items[0] is sold by www.other.com, not the expected merchant.',
      detail: {
        reason: 'ucp_seller_mismatch',
        dialect: 'ucp',
        rejected_field: 'checkout.reap.expected_merchant_domain',
        cause,
        ...(cause === 'different_seller'
          ? { line_item: '$.line_items[0]', merchant_domain: 'www.other.com', merchant_id: 'm_other' }
          : {}),
      },
    },
  };
}

export function expectedDomainInvalidError() {
  return {
    error: {
      code: 'QUOTE_REQUIRED',
      message: 'checkout.reap.expected_merchant_domain must be a bare host.',
      detail: { reason: 'ucp_expected_merchant_domain_invalid', dialect: 'ucp' },
    },
  };
}
export const HOSTED_URL = 'https://pay.prava.space/checkout/chk_7f3a';

const LANE = {
  type: 'info',
  code: 'reap.lane',
  path: '$',
  content:
    "This checkout is fulfilled through Reap, a payment partner: the buyer enters a card and approves the total on Reap's own pages, and Reap places the order with the merchant. Pivota never receives card details and does not hold or move money.",
  content_type: 'plain',
};

const info = (code: string, content: string, path = '$.status') => ({ type: 'info', code, path, content, content_type: 'plain' });
const warning = (code: string, content: string, path = '$.status') => ({ type: 'warning', code, path, content, content_type: 'plain' });

type Opts = {
  status: string;
  messages: unknown[];
  continueUrl?: string;
  expiresAt?: string;
  totals?: unknown[];
  discounts?: unknown;
  currency?: string;
  id?: string;
};

function envelope(o: Opts) {
  return {
    ucp: { version: '2026-01-23', status: 'success', payment_handlers: {} },
    id: o.id ?? REAP_ID,
    status: o.status,
    ...(o.continueUrl ? { continue_url: o.continueUrl } : {}),
    currency: o.currency ?? 'USD',
    line_items: [
      {
        id: 'li_1',
        item: { id: PRODUCT_ID, title: 'Silky Matte Lip Ink — 01 Rosy', price: 1600 },
        quantity: 1,
        totals: [
          { type: 'subtotal', amount: 1600 },
          { type: 'total', amount: 1600 },
        ],
      },
    ],
    totals: o.totals ?? [
      { type: 'subtotal', amount: 1600, display_text: "Subtotal at Pivota's catalog price" },
      { type: 'total', amount: 1600, display_text: 'Expected total' },
    ],
    links: [{ type: 'terms_of_service', url: 'https://pivota.cc/terms', title: 'Pivota Terms of Service' }],
    expires_at: o.expiresAt ?? '2099-01-01T00:00:00.000Z',
    // Every good Reap answer publishes its seller; the degraded one (reap.view_unavailable) does not.
    messages: (o.messages as Array<{ code?: string }>).some((m) => m && m.code === 'reap.view_unavailable')
      ? o.messages
      : [...sellerMessages(currentSeller), ...o.messages],
    ...(o.discounts ? { discounts: o.discounts } : {}),
  };
}

const PRICED_WITH_DISCOUNT = [
  { type: 'subtotal', amount: 1600, display_text: "Subtotal at Pivota's catalog price" },
  { type: 'fulfillment', amount: 500, display_text: 'Shipping, as quoted by the merchant' },
  { type: 'tax', amount: 104, display_text: 'Tax, as quoted by the merchant' },
  { type: 'discount', amount: -320, display_text: 'Offer code discount applied by the merchant' },
  { type: 'total', amount: 1884, display_text: 'Total quoted by the merchant through the payment partner' },
];

export function resolvingCheckout(opts: { code?: string; id?: string } = {}) {
  return envelope({
    ...(opts.id ? { id: opts.id } : {}),
    status: 'incomplete',
    messages: [
      info('reap.resolving', 'Pivota has opened this purchase with the payment partner (Reap) and is confirming the item with the merchant. Nothing is charged. Poll get_checkout for the next step.'),
      info('reap.poll_after_seconds', '5'),
      LANE,
    ],
    ...(opts.code ? { discounts: { codes: [opts.code] } } : {}),
  });
}

export function awaitingApprovalCheckout(opts: { deadline?: string; continueUrl?: string; outcome?: 'applied' | 'dropped_invalid' | 'dropped_expired'; taxIncluded?: boolean } = {}) {
  const deadline = opts.deadline ?? '2099-01-01T00:05:00.000Z';
  const offerMsg =
    opts.outcome === 'applied'
      ? info('reap.offer_code_applied', 'The merchant accepted the buyer\'s offer code; the discount is in discounts.applied and in totals as a discount row, and is already in the total.', '$.discounts')
      : opts.outcome === 'dropped_invalid'
        ? warning('discount_code_invalid', 'The merchant did not accept the buyer\'s offer code. The purchase continued WITHOUT it: the total has no discount. Tell the buyer before they approve.', '$.discounts.codes[0]')
        : opts.outcome === 'dropped_expired'
          ? warning('discount_code_expired', 'The buyer\'s offer code has expired. The purchase continued WITHOUT it: the total has no discount. Tell the buyer before they approve.', '$.discounts.codes[0]')
          : null;
  const totals = opts.taxIncluded
    ? [
        { type: 'subtotal', amount: 2400, display_text: "Subtotal at Pivota's catalog price" },
        { type: 'fulfillment', amount: 0, display_text: 'Shipping, as quoted by the merchant' },
        { type: 'total', amount: 2400, display_text: 'Total quoted by the merchant through the payment partner (tax is included in the prices)' },
      ]
    : opts.outcome === 'applied'
      ? PRICED_WITH_DISCOUNT
      : [
          { type: 'subtotal', amount: 1600, display_text: "Subtotal at Pivota's catalog price" },
          { type: 'fulfillment', amount: 500, display_text: 'Shipping, as quoted by the merchant' },
          { type: 'tax', amount: 130, display_text: 'Tax, as quoted by the merchant' },
          { type: 'total', amount: 2230, display_text: 'Total quoted by the merchant through the payment partner' },
        ];
  return envelope({
    status: 'requires_escalation',
    continueUrl: opts.continueUrl ?? HOSTED_URL,
    expiresAt: deadline,
    currency: opts.taxIncluded ? 'SGD' : 'USD',
    totals,
    messages: [
      info('reap.awaiting_approval', 'The order is priced. The buyer must review the total and approve it on the payment partner\'s page at continue_url before expires_at.', '$.continue_url'),
      info('reap.approval_deadline', deadline, '$.expires_at'),
      ...(offerMsg ? [offerMsg] : []),
      info('reap.poll_after_seconds', '10'),
      LANE,
    ],
    ...(opts.outcome === 'applied'
      ? { discounts: { codes: ['PEACHIE20'], applied: [{ code: 'PEACHIE20', amount: 320 }] } }
      : opts.outcome
        ? { discounts: { codes: ['PEACHIE20'] } }
        : {}),
  });
}

export function needsEnrollmentCheckout(opts: { expiresAt?: string } = {}) {
  return envelope({
    status: 'requires_escalation',
    ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
    continueUrl: 'https://pay.prava.space/enroll/3fa85f64',
    messages: [
      info('reap.needs_enrollment', 'The buyer must add a card on the payment partner\'s secure page at continue_url. Pivota never sees the card. Poll get_checkout afterwards.', '$.continue_url'),
      info('reap.poll_after_seconds', '10'),
      LANE,
    ],
  });
}

export function deadlinePassedCheckout() {
  return envelope({
    status: 'incomplete',
    messages: [
      warning('reap.approval_deadline_passed', 'The approval window closed before the buyer approved; the link is no longer valid and nothing was charged. Poll get_checkout once more for the final state, then create a new checkout to try again. Closed at 2026-09-29T10:05:00.000Z.'),
      info('reap.poll_after_seconds', '10'),
      LANE,
    ],
  });
}

export function processingCheckout() {
  return envelope({
    status: 'complete_in_progress',
    totals: PRICED_WITH_DISCOUNT,
    messages: [
      info('reap.processing', 'The buyer approved; the payment partner is placing the order with the merchant. Poll get_checkout for the outcome.'),
      info('reap.offer_code_applied', 'The merchant accepted the buyer\'s offer code.', '$.discounts'),
      info('reap.poll_after_seconds', '10'),
      LANE,
    ],
    discounts: { codes: ['PEACHIE20'], applied: [{ code: 'PEACHIE20', amount: 320 }] },
  });
}

export function completedCheckout() {
  return envelope({
    status: 'completed',
    totals: PRICED_WITH_DISCOUNT,
    messages: [
      info('reap.completed', 'The order was placed with the merchant through the payment partner.'),
      info('reap.order_reference', '#JD1042'),
      info('reap.offer_code_applied', 'The merchant accepted the buyer\'s offer code.', '$.discounts'),
      LANE,
    ],
  });
}

export function canceledCheckout(state: 'failed' | 'expired' | 'refused', reason?: string) {
  const base: Record<string, string> = {
    failed: 'This purchase could not be completed. Nothing further will happen on it.',
    expired: 'This purchase expired before the buyer finished it. Nothing was charged. Create a new checkout to try again.',
    refused: 'This purchase was not placed: it could not be matched or priced exactly for this merchant. Nothing was charged.',
  };
  return envelope({
    status: 'canceled',
    messages: [warning(`reap.purchase_${state}`, `${base[state]}${reason ? ` Reason: ${reason}.` : ''}`), LANE],
  });
}

/** What the door answers when the Reap lane declines: the storefront escalation, not a Reap checkout. */
export function storefrontEscalation(opts: { codeWarning?: boolean; consentHint?: boolean } = {}) {
  return {
    ucp: { version: '2026-01-23', status: 'success', payment_handlers: {} },
    id: 'esc_abc123',
    status: 'requires_escalation',
    continue_url: 'https://judydoll.com/cart/49819267301653:1',
    currency: 'USD',
    line_items: [],
    totals: [
      { type: 'subtotal', amount: 1600 },
      { type: 'total', amount: 1600 },
    ],
    messages: [
      ...(opts.codeWarning
        ? [warning('discount_code_invalid', 'Not applied.', '$.discounts.codes[0]')]
        : []),
      ...(opts.consentHint ? [info('reap.available_with_consent', 'Resend with consent.', '$')] : []),
    ],
  };
}

/** A JSON-RPC tools/call result wrapping `value` the way the door does (text content). */
export function rpcResult(value: unknown, isError = false) {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) },
  };
}

/** The degraded read: the backend view could not be read; the gateway names no seller (§5.4). */
export function viewUnavailableCheckout() {
  return envelope({
    status: 'incomplete',
    messages: [
      warning('reap.view_unavailable', "The purchase's current state could not be read just now; nothing has been lost.", '$'),
      info('reap.poll_after_seconds', '30'),
      LANE,
    ],
  });
}
