import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel, defaultOpenWindow } from './ReapCheckoutPanel';
import { useEffect, useState } from 'react';
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
  window.localStorage.clear();
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

  it('restores the open checkout after a reload or in ANOTHER tab (id only, from localStorage)', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    // Written by another tab: localStorage is shared across tabs; sessionStorage (empty here) is not.
    window.localStorage.setItem('pivota.reapCheckout.active.sig_demo', JSON.stringify({ id, at: Date.now() }));
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout(), [processingCheckout()]);
    renderPanel(fetchImpl);
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('processing'));
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`/api/reap-checkout/${encodeURIComponent(id)}`);
  });

  it('R4: polling keeps firing while the parent re-renders every 2 s with a NEW fetchImpl each time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const inner = scriptedFetch(resolvingCheckout(), [resolvingCheckout()]); // poll hint: 5 s
    function Parent() {
      const [, setN] = useState(0);
      useEffect(() => {
        const t = setInterval(() => setN((n) => n + 1), 2_000);
        return () => clearInterval(t);
      }, []);
      return (
        <ReapCheckoutPanel
          productId="sig_demo"
          productTitle="Silky Matte Lip Ink"
          merchantDomain="judydoll.com"
          market="US"
          fetchImpl={((...a: Parameters<typeof fetch>) => inner(...(a as [string]))) as typeof fetch}
          openWindow={vi.fn()}
          now={() => NOW}
          newIdempotencyKey={() => 'idem-key-0001'}
        />
      );
    }
    render(<Parent />);
    await fillAndSubmit();
    await screen.findByTestId('reap-status');
    const polls = () => inner.mock.calls.filter(([u]) => String(u).startsWith('/api/reap-checkout/')).length;
    for (let i = 0; i < 12; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
    }
    expect(polls()).toBeGreaterThanOrEqual(3);
  });

  it('R5: the idempotency key rotates when the body changes (Back, edit, resubmit), and is reused for an identical retry', async () => {
    let n = 0;
    const keys: string[] = [];
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      keys.push(JSON.parse(String(init.body)).idempotency_key);
      return jsonResponse({ checkout: null, fallback: 'not_reap' });
    });
    render(
      <ReapCheckoutPanel
        productId="sig_demo"
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        fetchImpl={fetchImpl as unknown as typeof fetch}
        newIdempotencyKey={() => `key-${++n}`}
      />,
    );
    await fillAndSubmit();
    await screen.findByTestId('reap-fallback');
    fireEvent.click(screen.getByText('Back'));
    // Identical body: the same key (a retry replays, never opens a second purchase).
    await act(async () => {
      fireEvent.click(screen.getByTestId('reap-submit'));
    });
    await screen.findByTestId('reap-fallback');
    fireEvent.click(screen.getByText('Back'));
    fireEvent.change(document.querySelector('input[name="city"]')!, { target: { value: 'Oakland' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reap-submit'));
    });
    await screen.findByTestId('reap-fallback');
    fireEvent.click(screen.getByText('Back'));
    fireEvent.change(document.querySelector('input[name="offer_code"]')!, { target: { value: 'PEACHIE20' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('reap-submit'));
    });
    expect(keys).toEqual(['key-1', 'key-1', 'key-2', 'key-3']);
  });

  it('R7: the default opener is a NEW tab with noopener,noreferrer (never the same window)', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    defaultOpenWindow(HOSTED_URL);
    expect(open).toHaveBeenCalledWith(HOSTED_URL, '_blank', 'noopener,noreferrer');
    open.mockClear();
    // And it is what the panel uses when no opener is injected.
    const fetchImpl = scriptedFetch(awaitingApprovalCheckout());
    render(
      <ReapCheckoutPanel
        productId="sig_demo"
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    expect(open).toHaveBeenCalledWith(HOSTED_URL, '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('R7: the client re-checks the link even if the server (or a proxy) handed it over', async () => {
    const forged = { ...viewOf(awaitingApprovalCheckout()), continueUrl: 'https://evil.example/pay' };
    const fetchImpl = vi.fn(async () => jsonResponse({ checkout: forged }));
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-link-refused');
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('R1: "Sold and shipped by" comes from the server\'s verified seller, not the page', async () => {
    const view = { ...viewOf(awaitingApprovalCheckout()), seller: { domain: 'judydoll.com' } };
    renderPanel(vi.fn(async () => jsonResponse({ checkout: view })));
    // Before the gateway answers, no seller is claimed (the prop is not trusted for display).
    expect(screen.queryByTestId('reap-seller')).toBeNull();
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-seller')).textContent).toBe('Sold and shipped by judydoll.com');
  });

  it('R1: a seller mismatch is not offered, and says so', async () => {
    const openWindow = renderPanel(vi.fn(async () => jsonResponse({ checkout: null, fallback: 'seller_mismatch' })));
    await fillAndSubmit();
    const fb = await screen.findByTestId('reap-fallback');
    expect(fb.dataset.kind).toBe('seller_mismatch');
    expect(fb.textContent).toMatch(/Nothing was charged/);
    expect(openWindow).not.toHaveBeenCalled();
  });
});
