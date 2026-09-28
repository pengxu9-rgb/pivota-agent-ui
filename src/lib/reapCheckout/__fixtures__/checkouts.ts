// UCP checkouts as the gateway's Reap lane builds them (PIVOTA-Agent mcp-server/src/ucpReapAgenticLane.js
// `mapReapPurchaseToCheckout` + ucpCheckoutEscalation.js `buildUcpCheckoutEnvelope`), one per state.
// Message codes, paths, row types and display texts are the lane's own; used by the tests and by the
// local mock gateway (scripts/reap-mock-gateway.mjs imports the JSON twin of this file's builder).
export const REAP_ID = 'reap_rp_0123456789abcdef01234567.eyJ2IjoxLCJpIjoic2lnX2RlbW8ifQ';
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
        item: { id: 'sig_demo', title: 'Silky Matte Lip Ink — 01 Rosy', price: 1600 },
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
    messages: o.messages,
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

export function resolvingCheckout(opts: { code?: string } = {}) {
  return envelope({
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
