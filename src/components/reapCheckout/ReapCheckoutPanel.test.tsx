import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel, defaultOpenWindow, readActiveCheckoutId, writeActiveCheckoutId } from './ReapCheckoutPanel';
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
  set('postal_code', '94103');
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
    const banner = screen.getByTestId('reap-deadline-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toMatch(/Approve within 5 minutes/);
    expect(banner.textContent).toMatch(/Reap's page may show a longer timer/);
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

  it('B1: failed BEFORE approval (approval window lapsed): "nothing charged" + a new checkout is offered', async () => {
    renderPanel(scriptedFetch(canceledCheckout('failed', 'approval_window_lapsed')));
    await fillAndSubmit();
    const t = await screen.findByTestId('reap-terminal');
    expect(t.textContent).toMatch(/Nothing was charged/);
    expect(screen.getByTestId('reap-restart')).toBeTruthy();
    expect(screen.queryByTestId('reap-terminal-uncertain')).toBeNull();
  });

  it('B1: failed AFTER the buyer approved (processing seen): no "nothing charged", NO one-click retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPanel(scriptedFetch(awaitingApprovalCheckout(), [processingCheckout(), canceledCheckout('failed', 'reap_checkout_failed')]));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    }
    const t = await screen.findByTestId('reap-terminal-uncertain');
    expect(t.textContent).toMatch(/We couldn.t confirm your order/);
    expect(t.textContent).toMatch(/Check your email or card statement before trying again/);
    expect(document.body.textContent).not.toMatch(/Nothing was charged/);
    expect(screen.queryByTestId('reap-restart')).toBeNull();
    expect(screen.queryByTestId('reap-visit-store')).toBeNull();
  });

  it('B1: an ending that is normally "nothing charged" (expired) is NOT, once this browser saw the approval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPanel(scriptedFetch(awaitingApprovalCheckout(), [processingCheckout(), canceledCheckout('expired')]));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    }
    await screen.findByTestId('reap-terminal-uncertain');
    expect(screen.queryByTestId('reap-restart')).toBeNull();
  });

  it.each([
    ['enrollment_dead', canceledCheckout('failed', 'enrollment_dead')],
    ['quote_id_missing', canceledCheckout('failed', 'quote_id_missing')],
    ['an unknown reason', canceledCheckout('failed')],
    ['expired', canceledCheckout('expired')],
    ['refused', canceledCheckout('refused', 'price_changed')],
  ])('R3.1: WITHOUT a hand-off, a %s ending is certain: "nothing was charged" + a new checkout', async (_l, checkout) => {
    renderPanel(scriptedFetch(checkout));
    await fillAndSubmit();
    const t = await screen.findByTestId('reap-terminal');
    expect(t.textContent).toMatch(/Nothing was charged/);
    expect(screen.getByTestId('reap-restart')).toBeTruthy();
    expect(screen.queryByTestId('reap-new-buyer-caution')).toBeNull();
  });

  it.each([
    ['expired', canceledCheckout('expired')],
    ['failed / approval_window_lapsed', canceledCheckout('failed', 'approval_window_lapsed')],
    ['refused', canceledCheckout('refused', 'price_changed')],
  ])('R3.1: AFTER a hand-off to Reap, even %s is uncertain: no "nothing charged", no retry', async (_l, ending) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const openWindow = renderPanel(scriptedFetch(awaitingApprovalCheckout(), [ending]));
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    expect(openWindow).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem('pivota.reapCheckout.active.sig_demo')!).handedOff).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    const t = await screen.findByTestId('reap-terminal-uncertain');
    expect(t.textContent).toMatch(/Check your email or card statement before trying again/);
    expect(document.body.textContent).not.toMatch(/Nothing was charged/);
    expect(screen.queryByTestId('reap-restart')).toBeNull();
    // "Start as a new buyer" stays secondary, AFTER the statement check, and says it is not a retry.
    const reset = screen.getByTestId('reap-new-buyer');
    const caution = screen.getByTestId('reap-new-buyer-caution');
    expect(t.compareDocumentPosition(caution) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caution.compareDocumentPosition(reset) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caution.textContent).toMatch(/does not retry/);
    expect(reset.className).not.toMatch(/bg-foreground/);
  });

  it('U4: an approval seen before a RELOAD still makes a later lapse uncertain (markActive approved)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const first = renderPanel(scriptedFetch(awaitingApprovalCheckout(), [processingCheckout()]));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('processing'));
    cleanup();
    void first;
    // Reload (or the Reap tab coming back to the PDP): only localStorage survives.
    renderPanel(scriptedFetch(canceledCheckout('failed', 'approval_window_lapsed'), [canceledCheckout('failed', 'approval_window_lapsed')]));
    await screen.findByTestId('reap-terminal-uncertain');
    expect(screen.queryByTestId('reap-restart')).toBeNull();
  });

  it('R3.1: a hand-off before a RELOAD still makes a later expiry uncertain (the Reap-return tab)', async () => {
    const openWindow = renderPanel(scriptedFetch(awaitingApprovalCheckout()));
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    expect(openWindow).toHaveBeenCalled();
    cleanup();
    renderPanel(scriptedFetch(canceledCheckout('expired'), [canceledCheckout('expired')]));
    await screen.findByTestId('reap-terminal-uncertain');
  });

  it('R3.4: a 404 while polling AFTER a hand-off keeps the entry and says "couldn\'t confirm", no pay button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: viewOf(awaitingApprovalCheckout()) })
        : jsonResponse({ error: 'not_found' }, 404),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    const gone = await screen.findByTestId('reap-gone-uncertain');
    expect(gone.textContent).toMatch(/We couldn.t confirm your order/);
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(screen.queryByText('Back to checkout')).toBeNull();
    expect(readActiveCheckoutId('sig_demo')).not.toBeNull();
  });

  it('R3.4: a 404 while polling after an APPROVAL (stored) keeps the entry too', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem('pivota.reapCheckout.active.sig_demo', JSON.stringify({ id, at: Date.now(), approved: true }));
    renderPanel(vi.fn(async () => jsonResponse({ error: 'not_found' }, 404)));
    // The restore itself 404s: with money possibly moved, the entry is kept and the answer is uncertain.
    await screen.findByTestId('reap-gone-uncertain');
    expect(readActiveCheckoutId('sig_demo')).toBe(id);
    expect(screen.queryByTestId('reap-form')).toBeNull();
  });

  it('B1: approval seen in ANOTHER tab/reload (stored flag) still blocks the one-click retry', async () => {
    const id = viewOf(canceledCheckout('failed', 'approval_window_lapsed')).id;
    window.localStorage.setItem('pivota.reapCheckout.active.sig_demo', JSON.stringify({ id, at: Date.now(), approved: true }));
    renderPanel(scriptedFetch(canceledCheckout('failed', 'approval_window_lapsed'), [canceledCheckout('failed', 'approval_window_lapsed')]));
    await screen.findByTestId('reap-terminal-uncertain');
  });

  it('C6: a 404 while polling clears the checkout: "no longer available", no live pay button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: viewOf(awaitingApprovalCheckout()) })
        : jsonResponse({ error: 'not_found' }, 404),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect((await screen.findByTestId('reap-gone')).textContent).toMatch(/This checkout is no longer available/);
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(readActiveCheckoutId('sig_demo')).toBeNull();
  });

  it('C4: the consent names the terms link and the version tag that is recorded', async () => {
    render(
      <ReapCheckoutPanel
        productId="sig_demo"
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        terms={{ url: 'https://pivota.cc/terms', version: 'reap-agentic-v1' }}
        fetchImpl={vi.fn() as unknown as typeof fetch}
      />,
    );
    const link = await screen.findByTestId('reap-terms-link');
    expect(link.getAttribute('href')).toBe('https://pivota.cc/terms');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(screen.getByTestId('reap-consent-text').textContent).toMatch(/version reap-agentic-v1/);
  });

  it('A: the PDP quantity is sent to create_checkout (the quote prices it)', async () => {
    const fetchImpl = scriptedFetch(resolvingCheckout());
    render(
      <ReapCheckoutPanel
        productId="sig_demo"
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        quantity={3}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        newIdempotencyKey={() => 'idem-key-0001'}
      />,
    );
    expect(screen.getByTestId('reap-quantity').textContent).toBe('Quantity: 3');
    await fillAndSubmit();
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).quantity).toBe(3);
  });

  it('C5: the postcode is required in the form', async () => {
    renderPanel(vi.fn());
    expect(document.querySelector('input[name="postal_code"]')!.hasAttribute('required')).toBe(true);
  });

  it('C2/D2: "Start as a new buyer" resets the server cookie and forgets open checkouts', async () => {
    writeActiveCheckoutId('sig_other', viewOf(awaitingApprovalCheckout()).id);
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    renderPanel(fetchImpl);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('reap-new-buyer'));
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/reap-checkout/reset', expect.objectContaining({ method: 'POST' }));
    expect(readActiveCheckoutId('sig_other')).toBeNull();
  });

  it('D3: the remembered checkout expires after 6 hours, not before', () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    const t = 1_900_000_000_000;
    writeActiveCheckoutId('sig_ttl', id, t);
    expect(readActiveCheckoutId('sig_ttl', t + 5.9 * 3600_000)).toBe(id);
    expect(readActiveCheckoutId('sig_ttl', t + 6 * 3600_000 + 1)).toBeNull();
  });
});
