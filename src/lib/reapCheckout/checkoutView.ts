// A UCP checkout answered by the gateway's Reap lane, read into what the buyer is shown.
//
// THIS MODULE COMPUTES NO MONEY. Every amount displayed is one of the checkout's own `totals` rows
// (ISO minor units, as the gateway sent them: subtotal, fulfillment, tax, a NEGATIVE discount, a
// Rounding fee/discount, total). No row is added, summed, derived or reordered here; a checkout
// with no usable total shows no total. The offer-code outcome is read from the checkout's own
// `messages`, never inferred from the amounts.
//
// The wire is PIVOTA-Agent docs/reap-agentic-lane.md §4/§5.2 (mcp-server/src/ucpReapAgenticLane.js
// `mapReapPurchaseToCheckout`). What each UCP status means on a `reap_` checkout:
//   incomplete            resolving / quoting (poll), or the page is not ready, the deadline passed,
//                         the view is unavailable (all: keep polling)
//   requires_escalation   the buyer acts on Reap's page at `continue_url` (add a card, or approve)
//   complete_in_progress  approved; Reap is placing the order
//   completed             the order was placed (`reap.order_reference`)
//   canceled              refused / failed / expired (`reap.purchase_<state>`), nothing charged
import { vetReapHostedUrl } from './hostedUrl';

export type ReapTotalRow = {
  type: string;
  amountMinor: number;
  displayText: string | null;
};

export type ReapMessage = {
  type: 'info' | 'warning' | 'error';
  code: string;
  content: string;
  path: string | null;
};

export type ReapPhase =
  | 'preparing'
  | 'needs_card'
  | 'awaiting_approval'
  | 'deadline_passed'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'refused'
  | 'unknown';

export type OfferCodeOutcome = 'pending' | 'applied' | 'no_discount' | 'not_applied_invalid' | 'not_applied_expired';

export type ReapCheckoutView = {
  checkoutDispatchState: 'not_dispatched' | 'dispatch_started' | 'dispatched' | 'unknown';
  contactReentryRequired: boolean;
  reviewRequired: boolean;
  environment?: 'sandbox' | 'live' | 'unknown';
  id: string;
  isReapCheckout: boolean;
  status: string;
  phase: ReapPhase;
  terminal: boolean;
  currency: string | null;
  /** `itemId` is `line_items[i].item.id` as sent: the lane echoes the caller's own item id there. */
  lineItems: Array<{ itemId: string | null; title: string; quantity: number; unitPriceMinor: number | null }>;
  totals: ReapTotalRow[];
  taxIncluded: boolean;
  /** Vetted Reap hosted page, or null. */
  continueUrl: string | null;
  /** A continue_url was present but refused by the host allowlist. */
  continueUrlRefused: boolean;
  expiresAt: string | null;
  approvalDeadline: string | null;
  pollAfterSeconds: number | null;
  orderReference: string | null;
  offerCode: { code: string | null; outcome: OfferCodeOutcome | null };
  terminalReason: string | null;
  viewUnavailable: boolean;
  messages: ReapMessage[];
  /**
   * The seller the gateway PUBLISHED for this purchase (PIVOTA-Agent docs/reap-agentic-lane.md §5.4): the
   * `info` messages `reap.merchant_domain` / `reap.merchant_id` at `$.line_items[0]`, bare values in
   * `content`. Either may be absent (merchant_id is omitted for the shared external-seed placeholder; the
   * degraded `reap.view_unavailable` answer carries neither). Never a guess, never from the browser.
   * `merchantIdUnusable`: a `reap.merchant_id` WAS published, but not as exactly one well-formed value
   * (two that disagree, or a malformed one). That is not "absent": the seller check refuses it.
   */
  publishedSeller: PublishedSeller;
  /** Set by the server route after it checked `publishedSeller` against its own config. */
  seller?: { domain: string };
};

const SELLER_PATH = '$.line_items[0]';
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MERCHANT_ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

/** The gateway's comparison rule: lowercase, then ONE leading `www.` removed. */
export function foldMerchantHost(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  if (!HOST_RE.test(lower)) return null;
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

export type PublishedSeller = { domain: string | null; merchantId: string | null; merchantIdUnusable: boolean };

export function readPublishedSeller(messages: ReapMessage[]): PublishedSeller {
  // Exactly one published value counts; two that disagree are treated as unpublished (fail closed).
  const published = (code: string): string[] => [
    ...new Set(
      messages
        .filter((m) => m.code === code && m.type === 'info' && m.path === SELLER_PATH)
        .map((m) => m.content ?? ''),
    ),
  ];
  const domains = published('reap.merchant_domain');
  const ids = published('reap.merchant_id');
  const d = domains.length === 1 ? domains[0] : '';
  const id = ids.length === 1 && MERCHANT_ID_RE.test(ids[0]) ? ids[0] : null;
  return {
    // As published (lowercase, `www.` kept); compare with foldMerchantHost.
    domain: HOST_RE.test(d) ? d : null,
    merchantId: id,
    // An id is optional, so "none published" is fine; "published, but conflicting or malformed" is not —
    // it fails closed exactly like a conflicting domain (never read as "no id, skip the check").
    merchantIdUnusable: ids.length > 0 && id === null,
  };
}

/**
 * Is this checkout for the item the caller asked for? The lane echoes the caller's own item id at
 * `line_items[0].item.id` (on the degraded read too, from the id's snapshot). Anything else — another id,
 * or none — is not this product's checkout, and is never payable.
 */
export function isCheckoutForItem(view: Pick<ReapCheckoutView, 'lineItems'>, itemId: string): boolean {
  const echoed = view.lineItems[0]?.itemId;
  return typeof echoed === 'string' && echoed !== '' && echoed === itemId;
}

const MESSAGE_TYPES = new Set(['info', 'warning', 'error']);
const MAX_POLL_SECONDS = 600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function minor(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function readMessages(raw: unknown): ReapMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ReapMessage[] = [];
  for (const m of raw) {
    if (!isRecord(m)) continue;
    const type = str(m.type);
    const code = str(m.code);
    if (!type || !MESSAGE_TYPES.has(type) || !code) continue;
    out.push({
      type: type as ReapMessage['type'],
      code,
      content: typeof m.content === 'string' ? m.content : '',
      path: str(m.path),
    });
  }
  return out;
}

function readTotals(raw: unknown): ReapTotalRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ReapTotalRow[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const type = str(row.type);
    const amount = minor(row.amount);
    if (!type || amount === null) continue;
    out.push({ type, amountMinor: amount, displayText: str(row.display_text) });
  }
  return out;
}

function isoOrNull(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const DISCOUNT_CODE_PATH = '$.discounts.codes[0]';

export function readOfferCodeOutcome(messages: ReapMessage[]): OfferCodeOutcome | null {
  for (const m of messages) {
    if (m.code === 'reap.offer_code_applied') return 'applied';
    if (m.code === 'reap.offer_code_no_discount') return 'no_discount';
    if (m.code === 'discount_code_expired') return 'not_applied_expired';
    if (m.code === 'discount_code_invalid') return 'not_applied_invalid';
  }
  return null;
}

/** The checkout, or null when the body is not a UCP checkout at all. Never throws. */
export function readReapCheckout(raw: unknown): ReapCheckoutView | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const status = str(raw.status);
  if (!id || !status) return null;
  const isReapCheckout = id.startsWith('reap_');
  const messages = readMessages(raw.messages);
  const codes = new Set(messages.map((m) => m.code));
  const byCode = (code: string) => messages.find((m) => m.code === code) || null;

  const rawContinue = str(raw.continue_url);
  // A link is only ever opened on a Reap checkout, and only when the allowlist says it is Reap's.
  const continueUrl = isReapCheckout ? vetReapHostedUrl(rawContinue) : null;
  const continueUrlRefused = Boolean(rawContinue) && !continueUrl;

  const lineItems = Array.isArray(raw.line_items)
    ? raw.line_items.filter(isRecord).map((li) => {
        const item = isRecord(li.item) ? li.item : {};
        return {
          itemId: str(item.id),
          title: str(item.title) || str(item.id) || 'Item',
          quantity: minor(li.quantity) ?? 1,
          unitPriceMinor: minor(item.price),
        };
      })
    : [];
  const totals = readTotals(raw.totals);
  const totalRow = totals.find((r) => r.type === 'total') || null;
  const taxIncluded = Boolean(totalRow?.displayText && /tax is included/i.test(totalRow.displayText));

  const pollRaw = byCode('reap.poll_after_seconds')?.content;
  const pollParsed = pollRaw && /^\d{1,4}$/.test(pollRaw) ? Number(pollRaw) : null;
  const pollAfterSeconds = pollParsed && pollParsed > 0 && pollParsed <= MAX_POLL_SECONDS ? pollParsed : null;

  const orderRefMsg = byCode('reap.order_reference');
  const deadlineMsg = byCode('reap.approval_deadline');

  let phase: ReapPhase = 'unknown';
  let terminalReason: string | null = null;
  if (status === 'completed') phase = 'completed';
  else if (status === 'canceled') {
    const terminal = messages.find((m) => /^reap\.purchase_(refused|failed|expired)$/.test(m.code));
    phase = terminal ? (terminal.code.slice('reap.purchase_'.length) as ReapPhase) : 'failed';
    const reason = terminal?.content.match(/Reason: ([a-z0-9_:.\-]{1,80})\./);
    terminalReason = reason ? reason[1] : null;
  } else if (status === 'complete_in_progress') phase = 'processing';
  else if (status === 'requires_escalation') {
    if (codes.has('reap.needs_enrollment')) phase = 'needs_card';
    else if (codes.has('reap.awaiting_approval')) phase = 'awaiting_approval';
    else phase = 'awaiting_approval';
  } else if (status === 'incomplete') {
    phase = codes.has('reap.approval_deadline_passed') ? 'deadline_passed' : 'preparing';
  }

  const discounts = isRecord(raw.discounts) ? raw.discounts : null;
  const echoedCode = discounts && Array.isArray(discounts.codes) ? str(discounts.codes[0]) : null;
  let outcome = readOfferCodeOutcome(messages);
  if (!outcome && echoedCode && !['completed', 'canceled'].includes(status)) outcome = 'pending';
  // A refusal message on a NON-Reap answer (the code was never applied) says so at the code's path.
  if (!outcome && messages.some((m) => m.path === DISCOUNT_CODE_PATH && m.type === 'warning')) {
    outcome = 'not_applied_invalid';
  }

  // Only a single well-formed authoritative value counts. Absence is never no-dispatch proof.
  const dispatchMessages = messages.filter((m) => m.code === 'reap.checkout_dispatch_state');
  const dispatchValues = [...new Set(dispatchMessages.map((m) => m.content))];
  const dispatch = dispatchValues.length === 1 && dispatchMessages.every((m) => m.type === 'info' && m.path === '$.status') &&
    ['not_dispatched', 'dispatch_started', 'dispatched'].includes(dispatchValues[0]) ? dispatchValues[0] : 'unknown';
  const reviewRequired = messages.some((m) => m.code === 'reap.checkout_requires_review' && m.type === 'warning' && m.path === '$.status');
  const contactMessages = messages.filter((m) => m.code === 'reap.contact_reentry_required');
  const contactReentryRequired = !reviewRequired && !['completed', 'canceled'].includes(status) && dispatch === 'not_dispatched' &&
    contactMessages.length > 0 && contactMessages.every((m) => m.type === 'info' && m.path === '$.status' && m.content === 'true');

  return {
    checkoutDispatchState: dispatch as ReapCheckoutView['checkoutDispatchState'],
    contactReentryRequired,
    reviewRequired,
    id,
    isReapCheckout,
    status,
    phase,
    terminal: status === 'completed' || status === 'canceled',
    currency: str(raw.currency),
    lineItems,
    totals,
    taxIncluded,
    continueUrl,
    continueUrlRefused,
    expiresAt: isoOrNull(raw.expires_at),
    approvalDeadline: deadlineMsg ? isoOrNull(deadlineMsg.content) : null,
    pollAfterSeconds,
    orderReference: orderRefMsg ? str(orderRefMsg.content) : null,
    offerCode: { code: echoedCode, outcome },
    terminalReason,
    viewUnavailable: codes.has('reap.view_unavailable'),
    publishedSeller: readPublishedSeller(messages),
    messages,
  };
}
