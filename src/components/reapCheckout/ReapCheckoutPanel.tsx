'use client';

// The "Checkout with Reap" flow for ONE product: buyer details -> quote -> hand-off to Reap's own page ->
// status. Rendered inside the PDP's ResponsiveSheet by ReapCheckoutEntry.
//
// Guards this component keeps (see lib/reapCheckout/*):
//   - no card field, no iframe, no proxy: the only payment step is a NEW TAB on Reap's hosted page,
//     opened only when vetReapHostedUrl says the link is Reap's (checked on the server AND here)
//   - no price math: the quote is the checkout's own totals rows, formatted, in the order sent
//   - the offer code is sent exactly as typed; what it came to is read from the checkout's messages
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { isCheckoutForItem, type ReapCheckoutView, type ReapTotalRow } from '@/lib/reapCheckout/checkoutView';
import { vetReapHostedUrl } from '@/lib/reapCheckout/hostedUrl';
import { formatMinorAmount } from '@/lib/reapCheckout/formatMinor';
import { MAX_OFFER_CODE_CODE_POINTS } from '@/lib/reapCheckout/createRequest';
import { fetchReapCheckout, useReapCheckoutPoll } from './useReapCheckoutPoll';

// The open checkout for a product survives the sheet closing, a reload, AND a new tab (the buyer may come
// back to the PDP from the Reap tab, whose sessionStorage is empty): its id is kept in localStorage, shared
// by every tab of this origin, for 6 hours. Only the id — no buyer data. Without this, a buyer returning in
// the Reap tab would see an empty form and could open a second purchase without knowing.
export const ACTIVE_KEY_PREFIX = 'pivota.reapCheckout.active.';
const ACTIVE_TTL_MS = 6 * 3600_000;
const REAP_ID_RE = /^reap_rp_[0-9a-f]{24}\.[A-Za-z0-9_-]{1,1000}$/;

export function readActiveCheckoutId(productId: string, now = Date.now()): string | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY_PREFIX + productId);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof v?.id !== 'string' || !REAP_ID_RE.test(v.id) || typeof v.at !== 'number') return null;
    if (now - v.at > ACTIVE_TTL_MS) {
      window.localStorage.removeItem(ACTIVE_KEY_PREFIX + productId);
      return null;
    }
    return v.id;
  } catch {
    return null;
  }
}

// Flags kept beside the open checkout's id (shared by every tab of this origin):
//   handedOff  the buyer clicked "Continue to secure payment" (Reap's page was opened)
//   approved   this browser saw the purchase `processing` (the buyer approved on Reap)
// Either one means money MAY have moved, whatever terminal state the backend reports later: its
// `approval_window_lapsed` is a heuristic (an approval in the last poll interval can get it), and its
// overdue sweep expires awaiting-approval rows on the server clock without asking Reap.
type ActiveFlag = 'approved' | 'handedOff';

export function readActiveFlag(productId: string, flag: ActiveFlag): boolean {
  try {
    const v = JSON.parse(window.localStorage.getItem(ACTIVE_KEY_PREFIX + productId) || 'null');
    return Boolean(v && v[flag] === true);
  } catch {
    return false;
  }
}

export function markActive(productId: string, flag: ActiveFlag) {
  try {
    const key = ACTIVE_KEY_PREFIX + productId;
    const v = JSON.parse(window.localStorage.getItem(key) || 'null');
    if (v && typeof v.id === 'string') window.localStorage.setItem(key, JSON.stringify({ ...v, [flag]: true }));
  } catch {
    // best effort
  }
}

/** Forget every open checkout this browser remembers ("start as a new buyer"). */
export function clearAllActiveCheckouts() {
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(ACTIVE_KEY_PREFIX)) window.localStorage.removeItem(k);
    }
  } catch {
    // storage blocked
  }
}

export function writeActiveCheckoutId(productId: string, id: string | null, now = Date.now()) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY_PREFIX + productId, JSON.stringify({ id, at: now }));
    else window.localStorage.removeItem(ACTIVE_KEY_PREFIX + productId);
  } catch {
    // storage blocked: the flow still works, it just does not survive a reload
  }
}

// A module-level function, so a caller that passes no fetchImpl hands the poll hook the SAME function on
// every render (a fresh closure per render used to re-arm the poll timer on each parent re-render).
const defaultFetch: typeof fetch = (...a) => fetch(...a);

export type ReapCheckoutPanelProps = {
  productId: string;
  productTitle: string;
  merchantDomain: string;
  market: string;
  storeUrl?: string | null;
  storeLabel?: string | null;
  /** The quantity chosen on the PDP; sent to create_checkout so the merchant's quote prices it. 1..10. */
  quantity?: number;
  /** The terms the buyer accepts: shown as a link with its version tag, which is what is recorded. */
  terms?: { url: string; version: string } | null;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  openWindow?: (url: string) => void;
  now?: () => number;
  newIdempotencyKey?: () => string;
};

type FormState = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  postal_code: string;
  offer_code: string;
  consent: boolean;
};

const EMPTY_FORM: FormState = {
  email: '',
  first_name: '',
  last_name: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  region: '',
  postal_code: '',
  offer_code: '',
  consent: false,
};

type Fallback =
  | { kind: 'not_reap'; offerCodeNotApplied: boolean; availableWithConsent: boolean }
  | { kind: 'seller_mismatch'; cause: 'different_seller' | 'seller_unconfirmed' }
  | { kind: 'not_available' }
  | { kind: 'refused' }
  | { kind: 'error'; message: string };

function defaultIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function defaultOpenWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

const ROW_LABELS: Record<string, string> = {
  subtotal: 'Items',
  fulfillment: 'Shipping',
  tax: 'Tax',
  discount: 'Discount',
  fee: 'Fee',
  total: 'Total',
};

function rowLabel(row: ReapTotalRow): string {
  if (row.displayText === 'Rounding') return 'Rounding';
  return ROW_LABELS[row.type] || row.type;
}

export function QuoteSummary({ view }: { view: ReapCheckoutView }) {
  const rows = view.totals;
  if (!rows.length) return null;
  const hasTaxRow = rows.some((r) => r.type === 'tax');
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3" data-testid="reap-quote">
      {view.lineItems.map((li, i) => (
        <div key={i} className="mb-2 text-sm font-medium text-foreground">
          {li.title}
          {li.quantity > 1 ? <span className="text-muted-foreground"> × {li.quantity}</span> : null}
        </div>
      ))}
      <dl className="space-y-1 text-sm">
        {rows.map((row, i) => {
          const isTotal = row.type === 'total';
          return (
            <div
              key={`${row.type}-${i}`}
              className={
                isTotal
                  ? 'mt-1 flex justify-between border-t border-border pt-2 font-semibold text-foreground'
                  : 'flex justify-between text-muted-foreground'
              }
              data-testid={`reap-row-${row.type}`}
            >
              <dt>{rowLabel(row)}</dt>
              <dd className={row.type === 'discount' && row.amountMinor < 0 ? 'text-emerald-700' : undefined}>
                {formatMinorAmount(row.amountMinor, view.currency)}
              </dd>
            </div>
          );
        })}
        {!hasTaxRow && view.taxIncluded ? (
          <div className="text-xs text-muted-foreground" data-testid="reap-tax-included">
            Tax included in prices
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function OfferCodeNote({ view }: { view: ReapCheckoutView }) {
  const { outcome, code } = view.offerCode;
  if (!outcome) return null;
  const text: Record<string, string> = {
    pending: `Offer code ${code ? `“${code}” ` : ''}sent to the merchant — waiting for the price.`,
    applied: 'Offer code applied by the merchant.',
    no_discount: 'Offer code accepted, but it took nothing off this order.',
    not_applied_invalid: 'Code not applied: the merchant did not accept it. The total has no discount.',
    not_applied_expired: 'Code not applied: it has expired. The total has no discount.',
  };
  const warn = outcome === 'not_applied_invalid' || outcome === 'not_applied_expired';
  return (
    <p
      className={warn ? 'text-sm font-medium text-amber-700' : 'text-sm text-emerald-700'}
      data-testid="reap-offer-code"
      data-outcome={outcome}
    >
      {text[outcome]}
    </p>
  );
}

function Deadline({ iso, now, verb = 'Approve by' }: { iso: string | null; now: () => number; verb?: string }) {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const mins = Math.max(0, Math.round((at - now()) / 60000));
  const clock = new Date(at).toLocaleString(undefined, mins < 12 * 60
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  // Minutes only while they are meaningful; a far deadline is shown as a time, not a count.
  const left = mins < 1 ? ' (less than a minute left)' : mins <= 60 ? ` (about ${mins} min left)` : '';
  return (
    <p className="text-xs text-muted-foreground" data-testid="reap-deadline">
      {verb} {clock}{left}. After that this link expires and nothing is charged.
    </p>
  );
}

/**
 * The approval deadline, made prominent. It is the merchant quote's TTL (about five minutes from pricing);
 * Reap's own page may show a longer timer (its page expiry, ~15 min), but after THIS time the purchase fails.
 */
export function DeadlineBanner({ iso, now }: { iso: string | null; now: () => number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const mins = Math.max(0, Math.ceil((at - now()) / 60000));
  const clock = new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    <div role="alert" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3" data-testid="reap-deadline-banner">
      <p className="text-sm font-semibold text-amber-900">
        Approve within {mins <= 1 ? '1 minute' : `${mins} minutes`} — by {clock}
      </p>
      <p className="mt-1 text-xs text-amber-900">
        Reap&apos;s page may show a longer timer. This deadline — the merchant&apos;s quote — is the one that counts:
        after it the purchase fails, nothing is charged, and you would start again.
      </p>
    </div>
  );
}

const PAY_NOTE =
  'Reap, our payment partner, handles your card on its own secure page. Pivota never sees or stores your card details, and nothing is charged until you approve the total there.';

function HandOff({
  view,
  openWindow,
  label,
}: {
  view: ReapCheckoutView;
  openWindow: (url: string) => void;
  label: string;
}) {
  const url = view.continueUrl ? vetReapHostedUrl(view.continueUrl) : null;
  if (!url) {
    return (
      <p className="text-sm font-medium text-red-700" data-testid="reap-link-refused">
        We couldn&apos;t verify this payment link as Reap&apos;s, so we won&apos;t open it. Please try again in a
        moment; if you already approved a payment on Reap, check your email before trying again.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => openWindow(url)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background"
        data-testid="reap-continue"
      >
        <Lock className="h-4 w-4" aria-hidden />
        {label}
        <ExternalLink className="h-4 w-4" aria-hidden />
      </button>
      <p className="flex gap-2 text-xs text-muted-foreground" data-testid="reap-pay-note">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {PAY_NOTE}
      </p>
    </div>
  );
}

const TERMINAL_COPY: Record<string, { title: string; body: string }> = {
  failed: {
    title: 'This purchase did not go through',
    body: 'Nothing was charged. You can start a new checkout.',
  },
  expired: {
    title: 'This checkout expired',
    body: 'Nothing was charged. Start a new checkout to try again.',
  },
  refused: {
    title: 'The merchant could not price this order exactly',
    body: 'Nothing was charged. You can buy it on the store instead, or try again later.',
  },
};

/** Phases past the approval step: the buyer approved on Reap, so money may have moved. */
const PAST_APPROVAL_PHASES: ReadonlySet<string> = new Set(['processing', 'completed']);

/**
 * Could money have moved? Only once the buyer was handed Reap's page (or this browser saw the approval).
 * Then "nothing was charged" would be a guess, and a one-click retry could buy the item twice.
 */
export function outcomeUncertain(view: ReapCheckoutView, mayHavePaid: boolean): boolean {
  // Before the buyer was ever handed Reap's page, no ending can have charged them (enrollment_dead,
  // quote_id_missing, a lapsed window never opened, ...): "nothing was charged" is true. After a hand-off
  // or a seen approval, EVERY non-completed ending is uncertain.
  return mayHavePaid && ['failed', 'expired', 'refused'].includes(view.phase);
}

function retryHint(reason: string | null): string | null {
  if (reason === 'approval_window_lapsed') return 'The total was not approved within the quote window (about five minutes).';
  if (reason === 'offer_code_rejected') return 'The merchant refused the offer code. Try again without it.';
  return null;
}

function StatusView({
  view,
  openWindow,
  now,
  onRestart,
  storeLink,
  paused,
  gaveUp,
  consecutiveErrors,
  onRefresh,
  mayHavePaid,
}: {
  mayHavePaid: boolean;
  view: ReapCheckoutView;
  openWindow: (url: string) => void;
  now: () => number;
  onRestart: (withoutCode: boolean) => void;
  storeLink: ReactNode;
  paused: boolean;
  gaveUp: boolean;
  consecutiveErrors: number;
  onRefresh: () => void;
}) {
  const steps = ['Pricing', 'Approve on Reap', 'Placing order', 'Done'];
  const stepIndex =
    view.phase === 'preparing' ? 0
      : view.phase === 'needs_card' || view.phase === 'awaiting_approval' ? 1
        : view.phase === 'processing' ? 2
          : view.phase === 'completed' ? 3
            : -1;
  return (
    <div className="space-y-4" data-testid="reap-status" data-phase={view.phase}>
      {stepIndex >= 0 ? (
        <ol className="flex gap-1" aria-label="Checkout progress">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`flex-1 border-t-2 pt-1 text-[11px] ${i <= stepIndex ? 'border-foreground text-foreground' : 'border-border text-muted-foreground'}`}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              {s}
            </li>
          ))}
        </ol>
      ) : null}

      {view.phase === 'preparing' ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{' '}
            {mayHavePaid
              ? 'Checking the status of your purchase…'
              : 'Confirming the item and getting your total from the merchant…'}
          </p>
          {/* After a hand-off (e.g. a degraded read once Reap's page was opened) "nothing is charged" is a guess. */}
          <p className="text-xs text-muted-foreground" data-testid="reap-preparing-copy">
            {mayHavePaid ? 'This usually takes under a minute.' : 'This usually takes under a minute. Nothing is charged.'}
          </p>
          <OfferCodeNote view={view} />
          {view.viewUnavailable ? (
            <p className="text-xs text-amber-700" data-testid="reap-view-unavailable">
              Status is temporarily unavailable — still checking. Nothing has been lost.
            </p>
          ) : null}
        </div>
      ) : null}

      {view.phase === 'needs_card' ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Add a card on Reap&apos;s secure page to continue.</p>
          <HandOff view={view} openWindow={openWindow} label="Continue to secure payment" />
          <Deadline iso={view.expiresAt} now={now} verb="Link valid until" />
        </div>
      ) : null}

      {view.phase === 'awaiting_approval' ? (
        <div className="space-y-3">
          <DeadlineBanner iso={view.approvalDeadline || view.expiresAt} now={now} />
          <p className="text-sm font-medium">Your total is ready. Review and approve it on Reap.</p>
          <QuoteSummary view={view} />
          <OfferCodeNote view={view} />
          <HandOff view={view} openWindow={openWindow} label="Continue to secure payment" />
          <p className="text-xs text-muted-foreground">
            After approving, come back to this tab — it updates on its own.
          </p>
        </div>
      ) : null}

      {view.phase === 'deadline_passed' ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">The approval window closed</p>
          <p className="text-sm text-muted-foreground" data-testid="reap-deadline-passed-copy">
            {mayHavePaid
              ? 'Confirming the final status… If you approved on Reap, check your email or card statement before trying again.'
              : 'Nothing was charged. Confirming the final status…'}
          </p>
        </div>
      ) : null}

      {view.phase === 'processing' ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Approved. Reap is placing your order with the
            merchant…
          </p>
          <QuoteSummary view={view} />
        </div>
      ) : null}

      {view.phase === 'completed' ? (
        <div className="space-y-3" data-testid="reap-completed">
          <p className="text-base font-semibold">Order placed</p>
          {view.orderReference ? (
            <p className="text-sm">
              Merchant order reference: <span className="font-mono font-semibold" data-testid="reap-order-ref">{view.orderReference}</span>
            </p>
          ) : null}
          <QuoteSummary view={view} />
          <p className="text-xs text-muted-foreground">
            The merchant will email your confirmation and shipping updates. Payment was handled by Reap.
          </p>
        </div>
      ) : null}

      {['failed', 'expired', 'refused'].includes(view.phase) && outcomeUncertain(view, mayHavePaid) ? (
        <div className="space-y-3" data-testid="reap-terminal-uncertain">
          <p className="text-base font-semibold">We couldn&apos;t confirm your order</p>
          <p className="text-sm text-muted-foreground">
            Check your email or card statement before trying again. If you were charged, the merchant&apos;s
            confirmation email has the details.
          </p>
        </div>
      ) : null}

      {['failed', 'expired', 'refused'].includes(view.phase) && !outcomeUncertain(view, mayHavePaid) ? (
        <div className="space-y-3" data-testid="reap-terminal">
          <p className="text-base font-semibold">{TERMINAL_COPY[view.phase].title}</p>
          <p className="text-sm text-muted-foreground">{TERMINAL_COPY[view.phase].body}</p>
          {retryHint(view.terminalReason) ? (
            <p className="text-sm text-muted-foreground" data-testid="reap-retry-hint">{retryHint(view.terminalReason)}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onRestart(view.terminalReason === 'offer_code_rejected')}
              className="h-10 rounded-full bg-foreground px-4 text-sm font-semibold text-background"
              data-testid="reap-restart"
            >
              Start a new checkout
            </button>
            {storeLink}
          </div>
        </div>
      ) : null}

      {!view.terminal && (paused || gaveUp || consecutiveErrors >= 3) ? (
        <button
          type="button"
          onClick={onRefresh}
          className="text-sm font-medium underline underline-offset-2"
          data-testid="reap-refresh"
        >
          {paused ? 'Paused while you were away — check status now' : 'Check status now'}
        </button>
      ) : null}
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = true,
  autoComplete,
  error,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (name: keyof FormState, value: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string | null;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      {required ? null : <span className="font-normal"> (optional)</span>}
      <input
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? true : undefined}
        className="mt-1 block h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-foreground"
      />
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

export function ReapCheckoutPanel(props: ReapCheckoutPanelProps) {
  const fetchImpl = props.fetchImpl || defaultFetch;
  const openWindow = props.openWindow || defaultOpenWindow;
  const now = props.now || Date.now;
  const newKey = props.newIdempotencyKey || defaultIdempotencyKey;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [fallback, setFallback] = useState<Fallback | null>(null);
  // The idempotency key belongs to ONE request body: a retry of the same body replays the same purchase,
  // and any change (address, code, product) gets a new key — the backend refuses a reused key on a different
  // body (409 idempotency_conflict) rather than opening the purchase the buyer now asked for.
  const keyFor = useRef<{ fingerprint: string; key: string } | null>(null);
  const quantity = Math.min(10, Math.max(1, Math.floor(Number(props.quantity) || 1)));
  // Did this browser see the buyer approve on Reap? Decides whether "nothing was charged" can be said.
  const [sawApproval, setSawApproval] = useState(() => readActiveFlag(props.productId, 'approved'));
  const [handedOff, setHandedOff] = useState(() => readActiveFlag(props.productId, 'handedOff'));
  // Another tab wrote a flag (it opened Reap, or saw the approval): take it now, not at the next poll.
  useEffect(() => {
    const key = ACTIVE_KEY_PREFIX + props.productId;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key && e.key !== null) return;
      if (readActiveFlag(props.productId, 'handedOff')) setHandedOff(true);
      if (readActiveFlag(props.productId, 'approved')) setSawApproval(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [props.productId]);
  // Every hand-off to Reap's page is recorded BEFORE the page opens.
  const handOff = (url: string) => {
    markActive(props.productId, 'handedOff');
    setHandedOff(true);
    openWindow(url);
  };
  const poll = useReapCheckoutPoll(null, { fetchImpl });
  // Could money have moved? ONE rule, decided here and nowhere else:
  //   - this tab handed off or saw the approval (state);
  //   - ANY tab did: the flags are shared, so they are re-read from storage on every render, and no "nothing
  //     charged" copy and no entry wipe can rest on a stale read (a `storage` event re-renders at once);
  //   - the view on screen is itself past the approval step (processing, completed) — even before the
  //     effect below has recorded that, i.e. in the very commit that first shows it.
  const mayHavePaid =
    sawApproval ||
    handedOff ||
    readActiveFlag(props.productId, 'handedOff') ||
    readActiveFlag(props.productId, 'approved') ||
    Boolean(poll.view && PAST_APPROVAL_PHASES.has(poll.view.phase));
  const [restoring, setRestoring] = useState(true);
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [restoredGone, setRestoredGone] = useState(false);
  // The last seller the server verified FOR ONE CHECKOUT ID; a degraded read of that checkout publishes
  // none, and must not blank it. Keyed by id, so a previous checkout's seller never vouches for a new one.
  const [lastSeller, setLastSeller] = useState<{ id: string; domain: string } | null>(null);

  // Restore an open checkout for this product (sheet re-opened, or the buyer came back from Reap).
  // A failed read is NOT "no checkout": offering the form then would invite a second purchase.
  useEffect(() => {
    const id = readActiveCheckoutId(props.productId);
    if (!id) {
      setRestoring(false);
      return undefined;
    }
    let alive = true;
    setRestoring(true);
    setRestoreFailed(false);
    void fetchReapCheckout(id, fetchImpl).then((out) => {
      if (!alive) return;
      if ('view' in out) poll.reset(out.view);
      else if ('notFound' in out) {
        // Gone. Forget it only if the buyer was never handed Reap's page; otherwise keep it and say we
        // couldn't confirm (the same rule as a 404 while polling).
        if (readActiveFlag(props.productId, 'handedOff') || readActiveFlag(props.productId, 'approved')) setRestoredGone(true);
        else writeActiveCheckoutId(props.productId, null);
      }
      else setRestoreFailed(true);
      setRestoring(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.productId, restoreAttempt]);

  const onChange = useCallback((name: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
  }, []);

  const codePoints = useMemo(() => [...form.offer_code].length, [form.offer_code]);

  const storeLink = props.storeUrl ? (
    <a
      href={props.storeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-10 items-center gap-1 rounded-full border border-border px-4 text-sm font-semibold"
      data-testid="reap-visit-store"
    >
      Visit {props.storeLabel || 'store'} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  ) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFieldError(null);
    setFallback(null);
    if (!form.consent) {
      setFieldError({ field: 'consent', message: 'Please accept the terms to continue.' });
      return;
    }
    if (codePoints > MAX_OFFER_CODE_CODE_POINTS) {
      setFieldError({ field: 'offer_code', message: 'Offer codes are at most 128 characters.' });
      return;
    }
    setSubmitting(true);
    try {
      const requestBody = {
          product_id: props.productId,
          merchant_domain: props.merchantDomain,
          quantity,
          consent: form.consent,
          // EXACTLY as typed; an empty field is "no code".
          ...(form.offer_code !== '' ? { offer_code: form.offer_code } : {}),
          buyer: {
            email: form.email,
            first_name: form.first_name,
            last_name: form.last_name,
            phone: form.phone,
            address_line1: form.address_line1,
            address_line2: form.address_line2,
            city: form.city,
            region: form.region,
            postal_code: form.postal_code,
            country: props.market,
          },
      };
      const fingerprint = JSON.stringify(requestBody);
      if (!keyFor.current || keyFor.current.fingerprint !== fingerprint) {
        keyFor.current = { fingerprint, key: newKey() };
      }
      const res = await fetchImpl('/api/reap-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...requestBody, idempotency_key: keyFor.current.key }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 400 && body?.field) {
        setFieldError({ field: String(body.field), message: String(body.message || 'Please check this field.') });
      } else if (!res.ok) {
        setFallback({
          kind: 'error',
          message:
            body?.message ||
            'We could not reach checkout just now. Nothing was charged — please try again in a moment.',
        });
      } else if (body?.checkout && !isCheckoutForItem(body.checkout as ReapCheckoutView, props.productId)) {
        // Opened, but not for THIS product: never payable, never remembered (it is never handed off, so the
        // backend sweeps it uncharged). The buyer gets the honest mismatch copy.
        setFallback({ kind: 'seller_mismatch', cause: 'seller_unconfirmed' });
      } else if (body?.checkout) {
        writeActiveCheckoutId(props.productId, (body.checkout as ReapCheckoutView).id);
        poll.reset(body.checkout as ReapCheckoutView);
      } else if (body?.fallback === 'seller_mismatch') {
        setFallback({ kind: 'seller_mismatch', cause: body.cause === 'different_seller' ? 'different_seller' : 'seller_unconfirmed' });
      } else if (body?.fallback === 'not_available') {
        setFallback({ kind: 'not_available' });
      } else if (body?.fallback === 'not_reap') {
        setFallback({
          kind: 'not_reap',
          offerCodeNotApplied: Boolean(body.offer_code_outcome && String(body.offer_code_outcome).startsWith('not_applied')),
          availableWithConsent: Boolean(body.available_with_consent),
        });
      } else {
        setFallback({ kind: 'refused' });
      }
    } catch {
      setFallback({ kind: 'error', message: 'We could not reach checkout just now. Nothing was charged.' });
    } finally {
      setSubmitting(false);
    }
  }

  const restart = (withoutCode: boolean) => {
    keyFor.current = null;
    if (withoutCode) setForm((f) => ({ ...f, offer_code: '' }));
    writeActiveCheckoutId(props.productId, null);
    setSawApproval(false);
    setHandedOff(false);
    setRestoredGone(false);
    poll.reset(null);
  };

  // "Start as a new buyer": the server clears the buyer cookie, the browser forgets its open checkouts,
  // and the form is emptied — for handing the laptop to the next partner.
  const newBuyer = async () => {
    await fetchImpl('/api/reap-checkout/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: '{}',
    }).catch(() => null);
    clearAllActiveCheckouts();
    keyFor.current = null;
    setForm(EMPTY_FORM);
    setFallback(null);
    setFieldError(null);
    setSawApproval(false);
    setHandedOff(false);
    setRestoredGone(false);
    setRestoreFailed(false);
    poll.reset(null);
  };

  // Seen past the approval step (processing, or already completed): record it, so a later read (a reload, a
  // degraded answer) never says "nothing was charged".
  const viewPhase = poll.view?.phase;
  useEffect(() => {
    if (viewPhase && PAST_APPROVAL_PHASES.has(viewPhase)) {
      setSawApproval(true);
      markActive(props.productId, 'approved');
    }
  }, [viewPhase, props.productId]);

  // A 404 while polling (unknown id, another buyer's, the dial turned off): the checkout is gone. Forget it
  // and never leave a live pay button on screen.
  useEffect(() => {
    // Keep the entry (and so the uncertain answer) when money may have moved; forget it otherwise.
    if (poll.notFound && !mayHavePaid) writeActiveCheckoutId(props.productId, null);
  }, [poll.notFound, props.productId, mayHavePaid]);

  const shownSeller =
    poll.view?.seller?.domain ?? (poll.view && lastSeller?.id === poll.view.id ? lastSeller.domain : null);
  useEffect(() => {
    if (poll.view?.seller?.domain) setLastSeller({ id: poll.view.id, domain: poll.view.seller.domain });
  }, [poll.view?.id, poll.view?.seller?.domain]);

  // A restored or polled checkout whose echoed item is not this product is never payable. Before a
  // hand-off it becomes the (honest) mismatch fallback and is forgotten; after one, we cannot say what
  // happened, so it stays and says so.
  const itemMismatch = Boolean(poll.view && !isCheckoutForItem(poll.view, props.productId));
  useEffect(() => {
    if (!itemMismatch || mayHavePaid) return;
    writeActiveCheckoutId(props.productId, null);
    poll.reset(null);
    setFallback({ kind: 'seller_mismatch', cause: 'seller_unconfirmed' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemMismatch, mayHavePaid, props.productId]);
  // A degraded read is never payable here either, whatever the server sent: no link reaches the hand-off.
  const statusView = poll.view && poll.view.viewUnavailable ? { ...poll.view, continueUrl: null } : poll.view;

  const uncertainNow = Boolean(
    ((poll.notFound || restoredGone || itemMismatch) && mayHavePaid) ||
      (poll.view && outcomeUncertain(poll.view, mayHavePaid)),
  );

  const errFor = (field: string) => (fieldError && fieldError.field.endsWith(field) ? fieldError.message : null);

  return (
    <div className="space-y-4 p-4" data-testid="reap-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Checkout with Reap</p>
          <p className="text-sm font-semibold text-foreground">{props.productTitle}</p>
          {/* The open checkout's own quantity once there is one (a restored checkout may differ from the page). */}
          {/* Another product's checkout: none of ITS details (quantity, seller) are shown as this item's. */}
          {itemMismatch ? null : (
            <p className="text-xs text-muted-foreground" data-testid="reap-quantity">
              Quantity: {poll.view?.lineItems[0]?.quantity ?? quantity}
            </p>
          )}
          {shownSeller && !itemMismatch ? (
            // Published by the gateway and checked by the server — never from the page. Kept from the last
            // good answer when a later (degraded) read publishes none.
            <p className="text-xs text-muted-foreground" data-testid="reap-seller">
              Sold and shipped by {shownSeller}
            </p>
          ) : null}
        </div>
      </div>

      {restoring ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : restoreFailed && !poll.view ? (
        <div className="space-y-2" data-testid="reap-restore-failed">
          <p className="text-sm font-semibold">We couldn&apos;t load your open checkout just now.</p>
          <p className="text-sm text-muted-foreground" data-testid="reap-restore-failed-copy">
            {mayHavePaid
              ? 'Nothing has been lost. If you approved a payment on Reap, check your email or card statement before trying again.'
              : 'Nothing has been lost or charged.'}
          </p>
          <button
            type="button"
            onClick={() => setRestoreAttempt((n) => n + 1)}
            className="h-10 rounded-full bg-foreground px-4 text-sm font-semibold text-background"
          >
            Try again
          </button>
        </div>
      ) : (poll.notFound || restoredGone || itemMismatch) && mayHavePaid ? (
        // Gone (or no longer this product's) after the buyer was handed Reap's page: we cannot say what
        // happened. No retry, no pay link.
        <div className="space-y-3" data-testid="reap-gone-uncertain">
          <p className="text-base font-semibold">We couldn&apos;t confirm your order</p>
          <p className="text-sm text-muted-foreground">
            Check your email or card statement before trying again. If you were charged, the merchant&apos;s
            confirmation email has the details.
          </p>
        </div>
      ) : poll.notFound ? (
        <div className="space-y-3" data-testid="reap-gone">
          <p className="text-base font-semibold">This checkout is no longer available</p>
          <p className="text-sm text-muted-foreground">
            If you approved a payment on Reap, check your email before trying again.
          </p>
          <button
            type="button"
            onClick={() => restart(false)}
            className="h-10 rounded-full border border-border px-4 text-sm font-semibold"
          >
            Back to checkout
          </button>
        </div>
      ) : itemMismatch ? (
        // Never a StatusView (and so never a pay link) for another product's checkout, not even for the
        // render before the effect above swaps in the mismatch fallback.
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="reap-item-mismatch">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking…
        </p>
      ) : statusView ? (
        <StatusView
          mayHavePaid={mayHavePaid}
          view={statusView}
          openWindow={handOff}
          now={now}
          onRestart={restart}
          storeLink={storeLink}
          paused={poll.paused}
          gaveUp={poll.gaveUp}
          consecutiveErrors={poll.consecutiveErrors}
          onRefresh={poll.refreshNow}
        />
      ) : fallback ? (
        <div className="space-y-3" data-testid="reap-fallback" data-kind={fallback.kind}>
          {fallback.kind === 'not_reap' ? (
            <>
              <p className="text-sm font-semibold">Checkout through Reap isn&apos;t available for this item right now.</p>
              {fallback.offerCodeNotApplied ? (
                <p className="text-sm text-amber-700" data-testid="reap-offer-code" data-outcome="not_applied_invalid">
                  Code not applied.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">You can still buy it on the store.</p>
            </>
          ) : fallback.kind === 'seller_mismatch' ? (
            <>
              <p className="text-sm font-semibold">
                This item isn&apos;t available here from {props.merchantDomain}.
              </p>
              <p className="text-sm text-muted-foreground">Nothing was charged.</p>
            </>
          ) : fallback.kind === 'not_available' ? (
            <>
              <p className="text-sm font-semibold">Checkout through Reap isn&apos;t available for this item right now.</p>
              <p className="text-sm text-muted-foreground">You can still buy it on the store.</p>
            </>
          ) : fallback.kind === 'refused' ? (
            <p className="text-sm font-semibold">This checkout could not be opened. Nothing was charged.</p>
          ) : (
            <p className="text-sm font-semibold">{fallback.message}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFallback(null)}
              className="h-10 rounded-full border border-border px-4 text-sm font-semibold"
            >
              Back
            </button>
            {fallback.kind === 'seller_mismatch' ? (
              // ONLY the seller the buyer was shown, built from OUR config (the configured demo merchant) —
              // never a gateway link, never the page's redirect link for this item (§5.4).
              <a
                href={`https://${props.merchantDomain}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1 rounded-full border border-border px-4 text-sm font-semibold"
                data-testid="reap-visit-configured-merchant"
              >
                Visit {props.merchantDomain} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              storeLink
            )}
          </div>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit} noValidate data-testid="reap-form">
          <div className="grid grid-cols-2 gap-2">
            <Field label="First name" name="first_name" value={form.first_name} onChange={onChange} autoComplete="given-name" error={errFor('first_name')} />
            <Field label="Last name" name="last_name" value={form.last_name} onChange={onChange} autoComplete="family-name" error={errFor('last_name')} />
          </div>
          <Field label="Email" name="email" type="email" value={form.email} onChange={onChange} autoComplete="email" error={errFor('email')} />
          <Field label="Phone" name="phone" type="tel" value={form.phone} onChange={onChange} autoComplete="tel" error={errFor('phone')} />
          <Field label="Address" name="address_line1" value={form.address_line1} onChange={onChange} autoComplete="address-line1" error={errFor('address_line1')} />
          <Field label="Apt, suite" name="address_line2" value={form.address_line2} onChange={onChange} required={false} autoComplete="address-line2" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="City" name="city" value={form.city} onChange={onChange} autoComplete="address-level2" error={errFor('city')} />
            <Field label="State" name="region" value={form.region} onChange={onChange} required={false} autoComplete="address-level1" />
            <Field label="Postcode" name="postal_code" value={form.postal_code} onChange={onChange} autoComplete="postal-code" error={errFor('postal_code')} />
          </div>
          <p className="text-xs text-muted-foreground" data-testid="reap-market">
            Ships to: <span className="font-semibold text-foreground">{props.market}</span>
            {errFor('country') ? <span className="block text-red-700">{errFor('country')}</span> : null}
          </p>
          <Field
            label="Offer code"
            name="offer_code"
            value={form.offer_code}
            onChange={onChange}
            required={false}
            autoComplete="off"
            error={errFor('offer_code')}
          />
          <label className="flex gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name="consent"
              checked={form.consent}
              onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
              className="mt-0.5"
            />
            <span data-testid="reap-consent-text">
              I agree to Pivota&apos;s{' '}
              <a
                href={props.terms?.url || 'https://pivota.cc/terms'}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                data-testid="reap-terms-link"
              >
                terms
              </a>
              {props.terms?.version ? <> (version {props.terms.version})</> : null} for purchases completed
              through Reap. Reap handles payment on its own page; Pivota never sees my card.
              {errFor('consent') ? <span className="block text-red-700">{errFor('consent')}</span> : null}
            </span>
          </label>
          {fieldError && !['first_name', 'last_name', 'email', 'phone', 'address_line1', 'city', 'postal_code', 'country', 'offer_code', 'consent'].some((f) => fieldError.field.endsWith(f)) ? (
            <p className="text-sm text-red-700">{fieldError.message}</p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background disabled:opacity-60"
            data-testid="reap-submit"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Get my total
          </button>
          <p className="text-center text-xs text-muted-foreground">No card needed here. Nothing is charged yet.</p>
        </form>
      )}
      <div className="border-t border-border pt-3 text-center">
        {uncertainNow ? (
          // After an uncertain ending the reset is NOT a way to "try again": the statement check comes first.
          <p className="mb-1 text-xs text-muted-foreground" data-testid="reap-new-buyer-caution">
            Handing this device to someone else? Check the statement first — this does not retry the purchase.
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void newBuyer()}
          className="text-xs text-muted-foreground underline underline-offset-2"
          data-testid="reap-new-buyer"
        >
          Not you? Start as a new buyer
        </button>
      </div>
    </div>
  );
}
