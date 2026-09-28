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
  id: string;
  isReapCheckout: boolean;
  status: string;
  phase: ReapPhase;
  terminal: boolean;
  currency: string | null;
  lineItems: Array<{ title: string; quantity: number; unitPriceMinor: number | null }>;
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
};

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

  return {
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
    messages,
  };
}
