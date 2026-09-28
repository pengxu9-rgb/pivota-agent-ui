import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel } from './ReapCheckoutPanel';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import {
  HOSTED_URL,
  awaitingApprovalCheckout,
  canceledCheckout,
  completedCheckout,
  deadlinePassedCheckout,
  needsEnrollmentCheckout,
  processingCheckout,
  resolvingCheckout,
} from '@/lib/reapCheckout/__fixtures__/checkouts';

const NOW = Date.parse('2026-09-29T10:00:00Z');

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function viewOf(checkout: unknown) {
  return readReapCheckout(checkout)!;
}

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, openWindow = vi.fn()) {
  render(
    <ReapCheckoutPanel
      productId="sig_demo"
      productTitle="Silky Matte Lip Ink"
      merchantDomain="judydoll.com"
      market="US"
      storeUrl="https://judydoll.com/products/silky-matte-lip-ink"
      storeLabel="Judydoll"
      fetchImpl={fetchImpl as unknown as typeof fetch}
      openWindow={openWindow}
      now={() => NOW}
      newIdempotencyKey={() => 'idem-key-0001'}
    />,
  );
  return openWindow;
}

async function fillAndSubmit(code?: string) {
  const set = (name: string, value: string) =>
    fireEvent.change(document.querySelector(`input[name="${name}"]`)!, { target: { value } });
  set('first_name', 'Ada');
  set('last_name', 'Lovelace');
  set('email', 'ada@example.test');
  set('phone', '+15550100');
  set('address_line1', '900 Brannan St');
  set('city', 'San Francisco');
  if (code !== undefined) set('offer_code', code);
  fireEvent.click(document.querySelector('input[name="consent"]')!);
  await act(async () => {
    fireEvent.click(screen.getByTestId('reap-submit'));
  });
}

/** A fetch that answers the create with `created` and every poll with the next of `polls`. */
function scriptedFetch(created: unknown, polls: unknown[] = []) {
  const queue = [...polls];
  return vi.fn(async (url: string) => {
    if (url === '/api/reap-checkout') return jsonResponse({ checkout: viewOf(created) });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return next ? jsonResponse({ checkout: viewOf(next) }) : jsonResponse({ error: 'gateway_unavailable' }, 502);
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ReapCheckoutPanel', () => {
  it('sends the offer code exactly as typed, with consent, the market and no price', async () => {
    const fetchImpl = scriptedFetch(resolvingCheckout({ code: ' PeachIE20 ' }));
    renderPanel(fetchImpl);
    await fillAndSubmit(' PeachIE20 ');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reap-checkout');
    const sent = JSON.parse(String(init.body));
    expect(sent.offer_code).toBe(' PeachIE20 ');
    expect(sent.consent).toBe(true);
    expect(sent.buyer.country).toBe('US');
    expect(sent.idempotency_key).toBe('idem-key-0001');
    expect(JSON.stringify(sent)).not.toMatch(/price|amount|card/i);
    await screen.findByTestId('reap-status');
    expect(screen.getByTestId('reap-status').dataset.phase).toBe('preparing');
    expect(screen.getByTestId('reap-offer-code').dataset.outcome).toBe('pending');
  });

  it('an empty code field sends no code', async () => {
    const fetchImpl = scriptedFetch(resolvingCheckout());
    renderPanel(fetchImpl);
    await fillAndSubmit('');
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body))).not.toHaveProperty('offer_code');
  });

  it('will not submit without consent', async () => {
    const fetchImpl = vi.fn();
    renderPanel(fetchImpl);
    await act(async () => {
      fireEvent.click(screen.getByTestId('reap-submit'));
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByText('Please accept the terms to continue.')).toBeTruthy();
  });

  it('awaiting approval: the checkout\'s own rows incl. negative discount, deadline, and a Reap-only hand-off', async () => {
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout({ outcome: 'applied', deadline: '2026-09-29T10:05:00Z' }));
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit('PEACHIE20');
    await screen.findByTestId('reap-quote');
    expect(screen.getByTestId('reap-row-subtotal').textContent).toContain('$16.00');
    expect(screen.getByTestId('reap-row-fulfillment').textContent).toContain('$5.00');
    expect(screen.getByTestId('reap-row-tax').textContent).toContain('$1.04');
    expect(screen.getByTestId('reap-row-discount').textContent).toContain('−$3.20');
    expect(screen.getByTestId('reap-row-total').textContent).toContain('$18.84');
    expect(screen.getByTestId('reap-offer-code').dataset.outcome).toBe('applied');
    expect(screen.getByTestId('reap-deadline').textContent).toMatch(/about 5 min/);
    expect(screen.getByTestId('reap-pay-note').textContent).toMatch(/Pivota never sees or stores your card/);
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('input[autocomplete^="cc-"]')).toBeNull();
    fireEvent.click(screen.getByTestId('reap-continue'));
    expect(openWindow).toHaveBeenCalledWith(HOSTED_URL);
  });

  it('a dropped code says "code not applied" before approval', async () => {
    renderPanel(scriptedFetch(awaitingApprovalCheckout({ outcome: 'dropped_invalid' })));
    await fillAndSubmit('NOPE');
    expect((await screen.findByTestId('reap-offer-code')).textContent).toMatch(/Code not applied/);
  });

  it('tax included in prices is shown as such, with no tax row', async () => {
    renderPanel(scriptedFetch(awaitingApprovalCheckout({ taxIncluded: true })));
    await fillAndSubmit();
    await screen.findByTestId('reap-tax-included');
    expect(screen.queryByTestId('reap-row-tax')).toBeNull();
    expect(screen.getByTestId('reap-row-total').textContent).toMatch(/24\.00/);
  });

  it('a link that is not Reap\'s is refused and never opened', async () => {
    const openWindow = renderPanel(scriptedFetch(awaitingApprovalCheckout({ continueUrl: 'https://evilreap.global/pay' })));
    await fillAndSubmit();
    await screen.findByTestId('reap-link-refused');
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('a far deadline is shown as a time, never as a huge minute count', async () => {
    renderPanel(scriptedFetch(needsEnrollmentCheckout({ expiresAt: '2099-01-01T00:00:00Z' })));
    await fillAndSubmit();
    const text = (await screen.findByTestId('reap-deadline')).textContent || '';
    expect(text).toMatch(/^Link valid until/);
    expect(text).not.toMatch(/min left/);
  });

  it('needs a card: hand-off to Reap\'s card page', async () => {
    const openWindow = renderPanel(scriptedFetch(needsEnrollmentCheckout()));
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    expect(openWindow).toHaveBeenCalledWith('https://pay.prava.space/enroll/3fa85f64');
  });

  it.each([
    ['processing', processingCheckout(), /Reap is placing your order/],
    ['deadline_passed', deadlinePassedCheckout(), /approval window closed/],
  ])('%s', async (phase, checkout, text) => {
    renderPanel(scriptedFetch(checkout));
    await fillAndSubmit();
    const status = await screen.findByTestId('reap-status');
    expect(status.dataset.phase).toBe(phase);
    expect(status.textContent).toMatch(text);
  });

  it('completed: the merchant order reference', async () => {
    renderPanel(scriptedFetch(completedCheckout()));
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-order-ref')).textContent).toBe('#JD1042');
  });

  it.each([
    ['failed', canceledCheckout('failed', 'approval_window_lapsed'), /quote window/],
    ['expired', canceledCheckout('expired'), null],
    ['refused', canceledCheckout('refused', 'price_changed'), null],
  ])('canceled as %s: retry guidance and a fresh checkout', async (phase, checkout, hint) => {
    const fetchImpl = scriptedFetch(checkout);
    renderPanel(fetchImpl);
    await fillAndSubmit();
    const terminal = await screen.findByTestId('reap-terminal');
    expect(screen.getByTestId('reap-status').dataset.phase).toBe(phase);
    if (hint) expect(screen.getByTestId('reap-retry-hint').textContent).toMatch(hint);
    expect(terminal.querySelector('[data-testid="reap-visit-store"]')?.getAttribute('rel')).toMatch(/noopener/);
    fireEvent.click(screen.getByTestId('reap-restart'));
    expect(await screen.findByTestId('reap-form')).toBeTruthy();
  });

  it('a non-Reap answer offers the store and says the code was not applied', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ checkout: null, fallback: 'not_reap', offer_code_outcome: 'not_applied_invalid', available_with_consent: false }),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit('PEACHIE20');
    const fb = await screen.findByTestId('reap-fallback');
    expect(fb.dataset.kind).toBe('not_reap');
    expect(fb.textContent).toMatch(/Code not applied/);
    expect(screen.getByTestId('reap-visit-store').getAttribute('href')).toBe('https://judydoll.com/products/silky-matte-lip-ink');
  });

  it('polls to completion: awaiting approval -> processing -> completed, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout(), [processingCheckout(), completedCheckout()]);
    renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('processing'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('completed'));
    const calls = fetchImpl.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it('refreshes at once when the buyer comes back to the tab', async () => {
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout(), [completedCheckout()]);
    renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('completed'));
  });

  it('restores the open checkout after a reload (id only, from sessionStorage)', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.sessionStorage.setItem('pivota.reapCheckout.active.sig_demo', id);
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout(), [processingCheckout()]);
    renderPanel(fetchImpl);
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('processing'));
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`/api/reap-checkout/${encodeURIComponent(id)}`);
  });
});
