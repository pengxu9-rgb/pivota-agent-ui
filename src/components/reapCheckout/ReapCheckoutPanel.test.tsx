import { ATTEMPT_PREFIX } from '@/lib/reapCheckout/attempt';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel, ACTIVE_KEY_PREFIX, defaultOpenWindow, readActiveCheckoutId, writeActiveCheckoutId } from './ReapCheckoutPanel';
import { useEffect, useState } from 'react';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import {
  HOSTED_URL,
  PRODUCT_ID,
  awaitingApprovalCheckout,
  canceledCheckout,
  completedCheckout,
  deadlinePassedCheckout,
  needsEnrollmentCheckout,
  processingCheckout,
  resolvingCheckout,
  viewUnavailableCheckout,
} from '@/lib/reapCheckout/__fixtures__/checkouts';

const NOW = Date.parse('2026-09-29T10:00:00Z');
// The fixtures echo PRODUCT_ID at line_items[0].item.id, as the lane echoes the caller's own item id.
const ACTIVE_KEY = `pivota.reapCheckout.active.${PRODUCT_ID}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function viewOf(checkout: unknown) {
  return readReapCheckout(checkout)!;
}

function renderPanel(fetchImpl: ReturnType<typeof vi.fn>, openWindow = vi.fn(), itemSource?: "reap_variant" | "cart_link", variantId?: string) {
  render(
    <ReapCheckoutPanel
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
      productId={PRODUCT_ID}
      variantId={variantId}
      productTitle="Silky Matte Lip Ink"
      merchantDomain="judydoll.com"
      market="US"
      itemSource={itemSource}
      storeUrl="https://judydoll.com/products/silky-matte-lip-ink"
      storeLabel="Judydoll"
      fetchImpl={((url: string, init: RequestInit) => url === '/api/reap-checkout/session' ? Promise.resolve(jsonResponse({ scope: 'test-buyer-scope' })) : (fetchImpl as unknown as typeof fetch)(url, init)) as typeof fetch}
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
  set('region', 'CA');
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
    if (url === '/api/reap-checkout/session') return jsonResponse({ scope: 'test-buyer-scope' });
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
  it('sends the offer code exactly as typed, with consent, the market and the original displayed price constraint', async () => {
    const fetchImpl = scriptedFetch(resolvingCheckout({ code: ' PeachIE20 ' }));
    renderPanel(fetchImpl);
    await fillAndSubmit(' PeachIE20 ');
    await screen.findByTestId('reap-status');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reap-checkout');
    const sent = JSON.parse(String(init.body));
    expect(sent.offer_code).toBe(' PeachIE20 ');
    expect(sent.consent).toBe(true);
    expect(sent.buyer.country).toBe('US');
    expect(sent.idempotency_key).toBe('idem-key-0001');
    expect(sent.expected_unit_price_minor).toBe(1399);
    expect(sent.expected_currency).toBe("USD");
    expect(JSON.stringify(sent)).not.toMatch(/card/i);
    await screen.findByTestId('reap-status');
    expect(screen.getByTestId('reap-status').dataset.phase).toBe('preparing');
    expect(screen.getByTestId('reap-offer-code').dataset.outcome).toBe('pending');
  });

  it('an empty code field sends no code', async () => {
    const fetchImpl = scriptedFetch(resolvingCheckout());
    renderPanel(fetchImpl);
    await fillAndSubmit('');
    await screen.findByTestId('reap-status');
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

  it('card setup marks an "Add card" step, never "Approve on Reap"', async () => {
    renderPanel(scriptedFetch(needsEnrollmentCheckout()));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    const current = screen.getByRole('list', { name: 'Checkout progress' }).querySelector('[aria-current="step"]');
    expect(current?.textContent).toBe('Add card');
    expect(screen.getByRole('list', { name: 'Checkout progress' }).textContent).not.toMatch(/Approve on Reap/);
  });

  it('the approval phase marks the "Approve on Reap" step', async () => {
    renderPanel(scriptedFetch(awaitingApprovalCheckout()));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    expect(screen.getByRole('list', { name: 'Checkout progress' }).querySelector('[aria-current="step"]')?.textContent)
      .toBe('Approve on Reap');
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
    expect(terminal.querySelector('[data-testid="reap-visit-store"]')).toBeNull();
    expect(terminal.textContent).not.toMatch(/store/i);
    fireEvent.click(screen.getByTestId('reap-restart'));
    expect(await screen.findByTestId('reap-form')).toBeTruthy();
  });

  it('a legacy non-Reap refusal shows the code outcome without offering the store', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ checkout: null, fallback: 'not_reap', attempt_outcome: 'not_created', offer_code_outcome: 'not_applied_invalid', available_with_consent: false }),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit('PEACHIE20');
    const fb = await screen.findByTestId('reap-fallback');
    expect(fb.dataset.kind).toBe('not_reap');
    expect(fb.textContent).toMatch(/Code not applied/);
    expect(screen.queryByTestId('reap-visit-store')).toBeNull();
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
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
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
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
          productId={PRODUCT_ID}
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
      return jsonResponse({ checkout: null, fallback: 'not_reap', attempt_outcome: 'not_created' });
    });
    render(
      <ReapCheckoutPanel
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
        productId={PRODUCT_ID}
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        fetchImpl={((url: string, init: RequestInit) => url === '/api/reap-checkout/session' ? Promise.resolve(jsonResponse({ scope: 'test-buyer-scope' })) : (fetchImpl as unknown as typeof fetch)(url, init)) as typeof fetch}
        newIdempotencyKey={() => `key-0000${++n}`}
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
    await waitFor(() => expect(keys).toHaveLength(4));
    expect(keys).toEqual(['key-00001', 'key-00001', 'key-00002', 'key-00003']);
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
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
        productId={PRODUCT_ID}
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        fetchImpl={((url: string, init: RequestInit) => url === '/api/reap-checkout/session' ? Promise.resolve(jsonResponse({ scope: 'test-buyer-scope' })) : (fetchImpl as unknown as typeof fetch)(url, init)) as typeof fetch}
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

  it.each([['different_seller'], ['seller_unconfirmed']])(
    'SELLER CONTRACT: a seller mismatch (%s) blocks without any alternate merchant/store link',
    async (cause) => {
      const openWindow = renderPanel(vi.fn(async () => jsonResponse({ checkout: null, fallback: 'seller_mismatch', attempt_outcome: 'not_created', cause })));
      await fillAndSubmit();
      const fb = await screen.findByTestId('reap-fallback');
      expect(fb.dataset.kind).toBe('seller_mismatch');
      expect(fb.textContent).toMatch(/isn.t available here from judydoll\.com/);
      expect(screen.queryByTestId('reap-visit-configured-merchant')).toBeNull();
      // The page's own redirect link for this item (props.storeUrl) is NOT offered here.
      expect(screen.queryByTestId('reap-visit-store')).toBeNull();
      expect(fb.innerHTML).not.toContain('silky-matte-lip-ink');
      const links = Array.from(fb.querySelectorAll('a')).map((x) => x.getAttribute('href'));
      expect(links).toEqual([]);
      expect(openWindow).not.toHaveBeenCalled();
    },
  );

  it('SELLER CONTRACT: not_available (server config bug) shows the generic not-available copy', async () => {
    renderPanel(vi.fn(async () => jsonResponse({ checkout: null, fallback: 'not_available', attempt_outcome: 'not_created' })));
    await fillAndSubmit();
    const fb = await screen.findByTestId('reap-fallback');
    expect(fb.dataset.kind).toBe('not_available');
    expect(fb.textContent).toMatch(/isn.t available for this item right now/);
  });

  it('an unclassified refusal preserves recovery and never claims a known no-charge outcome', async () => {
    renderPanel(vi.fn(async () => jsonResponse({ checkout: null, fallback: 'refused', code: 'QUOTE_REQUIRED', reason: 'x' })));
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-fallback')).textContent).toMatch(/whether this checkout was opened.*Recover the same attempt/);
  });

  it('the seller shown is the server-verified one, KEPT when a degraded read publishes none', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const good = { ...viewOf(awaitingApprovalCheckout()), seller: { domain: 'judydoll.com' } };
    const degraded = viewOf(viewUnavailableCheckout());
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout' ? jsonResponse({ checkout: good }) : jsonResponse({ checkout: degraded }),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-seller')).textContent).toBe('Sold and shipped by judydoll.com');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await waitFor(() => expect(screen.getByTestId('reap-view-unavailable')).toBeTruthy());
    expect(screen.getByTestId('reap-seller').textContent).toBe('Sold and shipped by judydoll.com');
  });

  it('P2: deadline_passed after a hand-off does NOT say "nothing was charged"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPanel(scriptedFetch(awaitingApprovalCheckout(), [deadlinePassedCheckout()]));
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    const copy = await screen.findByTestId('reap-deadline-passed-copy');
    expect(copy.textContent).not.toMatch(/Nothing was charged/);
    expect(copy.textContent).toMatch(/check your email or card statement/);
  });

  it('P2: deadline_passed WITHOUT a hand-off keeps "nothing was charged"', async () => {
    renderPanel(scriptedFetch(deadlinePassedCheckout()));
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-deadline-passed-copy')).textContent).toMatch(/Nothing was charged/);
  });

  it('P2: a failed restore after a hand-off does NOT say "nothing charged"; without one it does', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now(), handedOff: true }));
    const first = renderPanel(vi.fn(async () => jsonResponse({ error: 'gateway_unavailable' }, 502)));
    const copy = await screen.findByTestId('reap-restore-failed-copy');
    expect(copy.textContent).not.toMatch(/charged\./);
    expect(copy.textContent).toMatch(/check your email or card statement/);
    void first;
    cleanup();
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    renderPanel(vi.fn(async () => jsonResponse({ error: 'gateway_unavailable' }, 502)));
    expect((await screen.findByTestId('reap-restore-failed-copy')).textContent).toMatch(/Do not start another checkout/);
  });

  it('P3: the refused-link copy does not claim nothing was charged', async () => {
    renderPanel(scriptedFetch(awaitingApprovalCheckout({ continueUrl: 'https://evilreap.global/pay' })));
    await fillAndSubmit();
    const t = (await screen.findByTestId('reap-link-refused')).textContent || '';
    expect(t).not.toMatch(/Nothing has been charged/);
    expect(t).toMatch(/won.t open it/);
  });

  it('P3: after a restore, the header shows the OPEN checkout\'s quantity, not the page\'s', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    const view3 = viewOf(awaitingApprovalCheckout());
    view3.lineItems = [{ ...view3.lineItems[0], quantity: 3 }];
    render(
      <ReapCheckoutPanel
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
        productId={PRODUCT_ID}
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        quantity={1}
        fetchImpl={vi.fn(async () => jsonResponse({ checkout: view3 })) as unknown as typeof fetch}
      />,
    );
    await screen.findByTestId('reap-continue');
    expect(screen.getByTestId('reap-quantity').textContent).toBe('Quantity: 3');
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
    expect(JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!).handedOff).toBe(true);
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
    expect(readActiveCheckoutId(PRODUCT_ID)).not.toBeNull();
  });

  it('R3.4: a 404 while polling after an APPROVAL (stored) keeps the entry too', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now(), approved: true }));
    renderPanel(vi.fn(async () => jsonResponse({ error: 'not_found' }, 404)));
    // The restore itself 404s: with money possibly moved, the entry is kept and the answer is uncertain.
    await screen.findByTestId('reap-gone-uncertain');
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(id);
    expect(screen.queryByTestId('reap-form')).toBeNull();
  });

  it('B1: approval seen in ANOTHER tab/reload (stored flag) still blocks the one-click retry', async () => {
    const id = viewOf(canceledCheckout('failed', 'approval_window_lapsed')).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now(), approved: true }));
    renderPanel(scriptedFetch(canceledCheckout('failed', 'approval_window_lapsed'), [canceledCheckout('failed', 'approval_window_lapsed')]));
    await screen.findByTestId('reap-terminal-uncertain');
  });

  it('C6: a 404 while polling preserves recovery and never offers a new attempt', async () => {
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
    expect((await screen.findByTestId('reap-gone-uncertain')).textContent).toMatch(/couldn't confirm/);
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(readActiveCheckoutId(PRODUCT_ID)).not.toBeNull();
  });

  it('C4: the consent names the terms link and the version tag that is recorded', async () => {
    render(
      <ReapCheckoutPanel
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
        productId={PRODUCT_ID}
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
      expectedMoney={{expected_unit_price_minor:1399,expected_currency:"USD"}}
        productId={PRODUCT_ID}
        productTitle="Silky Matte Lip Ink"
        merchantDomain="judydoll.com"
        market="US"
        quantity={3}
        fetchImpl={((url: string, init: RequestInit) => url === '/api/reap-checkout/session' ? Promise.resolve(jsonResponse({ scope: 'test-buyer-scope' })) : (fetchImpl as unknown as typeof fetch)(url, init)) as typeof fetch}
        newIdempotencyKey={() => 'idem-key-0001'}
      />,
    );
    expect(screen.getByTestId('reap-quantity').textContent).toBe('Quantity: 3');
    await fillAndSubmit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).quantity).toBe(3);
  });

  it('C5: the postcode is required in the form', async () => {
    renderPanel(vi.fn());
    expect(document.querySelector('input[name="postal_code"]')!.hasAttribute('required')).toBe(true);
  });

  it('C2/D2: "Start as a new buyer" resets the server cookie and forgets open checkouts', async () => {
    localStorage.setItem(ACTIVE_KEY_PREFIX + 'sig_other', JSON.stringify({ id: viewOf(completedCheckout()).id, at: Date.now(), settled: true }));
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    renderPanel(fetchImpl);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('reap-new-buyer'));
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/reap-checkout/reset', expect.objectContaining({ method: 'POST' }));
    expect(readActiveCheckoutId('sig_other')).toBeNull();
  });

  it('D3: clock age never forgets an unresolved checkout', () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    const t = 1_900_000_000_000;
    writeActiveCheckoutId('sig_ttl', id, t);
    expect(readActiveCheckoutId('sig_ttl', t + 5.9 * 3600_000)).toBe(id);
    expect(readActiveCheckoutId('sig_ttl', t + 6 * 3600_000 + 1)).toBe(id);
  });

  // ---- P3 follow-ups of #384 ------------------------------------------------------------------------------

  /** A server-verified view of `checkout`, optionally for another item id (or none). */
  function verified(checkout: unknown, over: { itemId?: string | null; id?: string } = {}) {
    const v = viewOf(checkout);
    return {
      ...v,
      ...(over.id ? { id: over.id } : {}),
      lineItems: 'itemId' in over ? [{ ...v.lineItems[0], itemId: over.itemId ?? null }] : v.lineItems,
      seller: { domain: 'judydoll.com' },
    };
  }
  const OTHER_ID = viewOf(awaitingApprovalCheckout()).id.replace('0123456789abcdef01234567', 'ffffffffffffffffffffffff');
  /** Records whether a pay button was EVER put in the DOM, even for one commit that a later effect undoes. */
  function watchForPayButton() {
    let seen = false;
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of Array.from(r.addedNodes)) {
          if (n instanceof Element && (n.matches('[data-testid="reap-continue"]') || n.querySelector('[data-testid="reap-continue"]'))) seen = true;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.takeRecords();
      obs.disconnect();
      return seen;
    };
  }

  it.each([
    ['another product', 'sig_other'],
    ['a near-miss of this product', `${PRODUCT_ID}x`],
    ['no echoed item id', null],
  ])('ITEM: a created checkout for %s is not payable: honest mismatch copy, not remembered', async (_l, itemId) => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId }) })
        : jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId }) }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const payButtonSeen = watchForPayButton();
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit();
    const fb = await screen.findByTestId('reap-fallback');
    expect(fb.dataset.kind).toBe('seller_mismatch');
    expect(fb.textContent).toMatch(/isn.t available here from judydoll\.com/);
    expect(fb.textContent).toMatch(/Nothing was charged/);
    // Never remembered, not even for a moment; never shown as payable, not even for one render.
    expect(setItem.mock.calls.filter(([k]) => k === ACTIVE_KEY)).toEqual([]);
    setItem.mockRestore();
    expect(payButtonSeen()).toBe(false);
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(screen.queryByTestId('reap-status')).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).startsWith('/api/reap-checkout/'))).toHaveLength(0);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('ITEM accepting: a created checkout echoing THIS product is payable and remembered', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId: PRODUCT_ID }) }));
    const payButtonSeen = watchForPayButton();
    renderPanel(fetchImpl);
    await fillAndSubmit();
    expect(await screen.findByTestId('reap-continue')).toBeTruthy();
    expect(payButtonSeen()).toBe(true); // the watcher's positive control
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(viewOf(awaitingApprovalCheckout()).id);
  });

  it('ITEM: a poll (before any hand-off) answering another product -> the mismatch copy, forgotten, no pay link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: verified(resolvingCheckout()) })
        : jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId: 'sig_other' }) }),
    );
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-status');
    expect(readActiveCheckoutId(PRODUCT_ID)).not.toBeNull();
    const payButtonSeen = watchForPayButton();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    const fb = await screen.findByTestId('reap-fallback');
    expect(payButtonSeen()).toBe(false);
    expect(fb.dataset.kind).toBe('seller_mismatch');
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(readActiveCheckoutId(PRODUCT_ID)).toBeNull();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('ITEM: a RESTORED checkout for another product -> the mismatch copy, forgotten, no pay link', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    const payButtonSeen = watchForPayButton();
    renderPanel(vi.fn(async () => jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId: 'sig_other' }) })));
    const fb = await screen.findByTestId('reap-fallback');
    expect(payButtonSeen()).toBe(false);
    expect(fb.dataset.kind).toBe('seller_mismatch');
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it('ITEM: AFTER a hand-off, another product\'s answer says "couldn\'t confirm" (no "nothing charged"), keeps the entry, no pay link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: verified(awaitingApprovalCheckout()) })
        : jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId: 'sig_other' }) }),
    );
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    expect(openWindow).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    const gone = await screen.findByTestId('reap-gone-uncertain');
    expect(gone.textContent).not.toMatch(/Nothing was charged/);
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(screen.queryByTestId('reap-fallback')).toBeNull();
    expect(screen.getByTestId('reap-new-buyer-caution')).toBeTruthy();
    expect(readActiveCheckoutId(PRODUCT_ID)).not.toBeNull();
  });

  it('SELLER: a previous checkout\'s verified seller never vouches for a NEW checkout id', async () => {
    let creates = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === '/api/reap-checkout/session') return jsonResponse({ scope: 'test-buyer-scope' });
    if (url === '/api/reap-checkout') {
        creates += 1;
        // First: checkout A, verified seller, ends at once. Second: checkout B, answered with NO seller.
        return creates === 1
          ? jsonResponse({ checkout: verified(canceledCheckout('failed')) })
          : jsonResponse({ checkout: { ...viewOf(resolvingCheckout({ id: OTHER_ID })) } });
      }
      return jsonResponse({ checkout: { ...viewOf(resolvingCheckout({ id: OTHER_ID })) } });
    });
    renderPanel(fetchImpl);
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-seller')).textContent).toBe('Sold and shipped by judydoll.com');
    await act(async () => { fireEvent.click(await screen.findByTestId('reap-restart')); });
    const submit = await screen.findByTestId('reap-submit');
    await act(async () => { fireEvent.click(submit); });
    await waitFor(() => expect(screen.getByTestId('reap-status').dataset.phase).toBe('preparing'));
    expect(creates).toBe(2);
    expect(screen.queryByTestId('reap-seller')).toBeNull();
  });

  it('DEGRADED: a degraded view never shows a pay link, even one that reached the panel with a link', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const good = verified(awaitingApprovalCheckout());
    const base = awaitingApprovalCheckout() as any;
    const degradedWithLink = viewOf({
      ...base,
      messages: [
        { type: 'warning', code: 'reap.view_unavailable', path: '$', content: 'x', content_type: 'plain' },
        ...base.messages,
      ],
    });
    expect(degradedWithLink).toMatchObject({ viewUnavailable: true, phase: 'awaiting_approval', continueUrl: HOSTED_URL });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout' ? jsonResponse({ checkout: good }) : jsonResponse({ checkout: degradedWithLink }),
    );
    const openWindow = renderPanel(fetchImpl);
    await fillAndSubmit();
    expect(await screen.findByTestId('reap-continue')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await waitFor(() => expect(screen.queryByTestId('reap-continue')).toBeNull());
    expect(screen.getByTestId('reap-status').dataset.phase).toBe('awaiting_approval');
    expect(document.body.innerHTML).not.toContain('prava.space');
    expect(openWindow).not.toHaveBeenCalled();
  });

  // ---- honest copy follow-ups of #385 ---------------------------------------------------------------------

  it.each([
    ['processing', processingCheckout],
    ['completed', completedCheckout],
  ])('ITEM: a RESTORED %s checkout for another item with NO stored flag says "couldn\'t confirm", keeps the entry, no pay link', async (_l, build) => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    const other = verified(build(), { itemId: 'sig_other' });
    other.lineItems = [{ ...other.lineItems[0], quantity: 3 }];
    const payButtonSeen = watchForPayButton();
    renderPanel(vi.fn(async () => jsonResponse({ checkout: other })));
    const gone = await screen.findByTestId('reap-gone-uncertain');
    expect(gone.textContent).toMatch(/couldn.t confirm your order/);
    expect(document.body.textContent).not.toMatch(/Nothing was charged/i);
    expect(screen.queryByTestId('reap-fallback')).toBeNull();
    expect(screen.queryByTestId('reap-continue')).toBeNull();
    expect(payButtonSeen()).toBe(false);
    // The entry (and the approval record) survive.
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(id);
    expect(screen.getByTestId('reap-new-buyer-caution')).toBeTruthy();
    // Neutral header: none of the OTHER checkout's details.
    expect(screen.queryByTestId('reap-seller')).toBeNull();
    expect(screen.queryByTestId('reap-quantity')).toBeNull();
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/judydoll\.com|Quantity: 3/);
  });

  it('ITEM accepting: a restored checkout for another item still AT the approval step (no flag) is the mismatch fallback', async () => {
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    renderPanel(vi.fn(async () => jsonResponse({ checkout: verified(awaitingApprovalCheckout(), { itemId: 'sig_other' }) })));
    expect((await screen.findByTestId('reap-fallback')).dataset.kind).toBe('seller_mismatch');
    expect(screen.queryByTestId('reap-gone-uncertain')).toBeNull();
    expect(readActiveCheckoutId(PRODUCT_ID)).toBeNull();
    // Back on this product's own form: its own quantity line is shown again.
    expect(screen.getByTestId('reap-quantity').textContent).toBe('Quantity: 1');
  });

  it('DEGRADED after a hand-off: the preparing copy never says "Nothing is charged"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout'
        ? jsonResponse({ checkout: verified(awaitingApprovalCheckout()) })
        : jsonResponse({ checkout: viewOf(viewUnavailableCheckout()) }),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit();
    fireEvent.click(await screen.findByTestId('reap-continue'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await screen.findByTestId('reap-view-unavailable');
    const status = screen.getByTestId('reap-status');
    expect(status.dataset.phase).toBe('preparing');
    expect(status.textContent).not.toMatch(/Nothing is charged/i);
    expect(status.textContent).not.toMatch(/getting your total/);
    expect(status.textContent).toMatch(/Checking the status of your purchase/);
  });

  it('DEGRADED accepting: WITHOUT a hand-off, preparing still says "Nothing is charged"', async () => {
    renderPanel(scriptedFetch(resolvingCheckout()));
    await fillAndSubmit();
    const copy = await screen.findByTestId('reap-preparing-copy');
    expect(copy.textContent).toMatch(/Nothing is charged/);
    expect(screen.getByTestId('reap-status').textContent).toMatch(/getting your total/);
  });

  // ---- review of #387: a seen completion is recorded; flags written by ANOTHER tab count --------------------

  it('a restored COMPLETED checkout (another item, no flags) saves `approved`; after a reload a degraded read never says "nothing charged"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const id = viewOf(awaitingApprovalCheckout()).id;
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id, at: Date.now() }));
    renderPanel(vi.fn(async () => jsonResponse({ checkout: verified(completedCheckout(), { itemId: 'sig_other' }) })));
    await screen.findByTestId('reap-gone-uncertain');
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!).approved).toBe(true));
    cleanup();
    // Reload: the next read is degraded (for this item), then one for another item (a mismatch).
    let reads = 0;
    renderPanel(
      vi.fn(async () => {
        reads += 1;
        return jsonResponse({
          checkout: reads === 1 ? viewOf(viewUnavailableCheckout()) : verified(awaitingApprovalCheckout(), { itemId: 'sig_other' }),
        });
      }),
    );
    await screen.findByTestId('reap-view-unavailable');
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/nothing (is|was) charged/i);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000); // the degraded read's poll hint is 30 s
    });
    await screen.findByTestId('reap-gone-uncertain');
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/nothing (is|was) charged/i);
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(id);
  });

  it('a completed checkout for THIS item also records `approved` (accepting: the order screen is unchanged)', async () => {
    renderPanel(scriptedFetch(completedCheckout()));
    await fillAndSubmit();
    await screen.findByTestId('reap-completed');
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!).approved).toBe(true));
  });

  it.each(['handedOff', 'approved'])('ANOTHER TAB wrote %s (no event reached this tab): a later failed read is uncertain, never "nothing charged"', async (flag) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPanel(scriptedFetch(awaitingApprovalCheckout(), [canceledCheckout('failed', 'approval_window_lapsed')]));
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    // Tab A opens Reap (or sees the approval): it writes the shared flag. This tab never clicked.
    const v = JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!);
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...v, [flag]: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await screen.findByTestId('reap-terminal-uncertain');
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/Nothing was charged/);
    expect(screen.queryByTestId('reap-restart')).toBeNull();
  });

  it('ANOTHER TAB: a 404 after its hand-off keeps the entry (never wiped on a stale read)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/reap-checkout' ? jsonResponse({ checkout: verified(awaitingApprovalCheckout()) }) : jsonResponse({ error: 'not_found' }, 404),
    );
    renderPanel(fetchImpl);
    await fillAndSubmit();
    await screen.findByTestId('reap-continue');
    const v = JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!);
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...v, handedOff: true }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    await screen.findByTestId('reap-gone-uncertain');
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(v.id);
  });

  it.each(['handedOff', 'approved'])('ANOTHER TAB: its `storage` event (%s) turns an already-shown "nothing charged" into the uncertain answer at once', async (flag) => {
    renderPanel(scriptedFetch(canceledCheckout('failed', 'approval_window_lapsed')));
    await fillAndSubmit();
    expect((await screen.findByTestId('reap-terminal')).textContent).toMatch(/Nothing was charged/);
    const v = JSON.parse(window.localStorage.getItem(ACTIVE_KEY)!);
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...v, [flag]: true }));
    // Another product's key is not this checkout's: it does not re-read (the next render will, anyway).
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'pivota.reapCheckout.active.sig_other' }));
    });
    expect(screen.getByTestId('reap-terminal')).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACTIVE_KEY }));
    });
    expect(screen.getByTestId('reap-terminal-uncertain')).toBeTruthy();
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/Nothing was charged/);
    expect(screen.queryByTestId('reap-restart')).toBeNull();
  });
});

it.each(['not_reap','not_available','seller_mismatch'])('PRIMARY PANEL: legacy %s refusal cannot offer another spending link',async(kind)=>{
 const fetchImpl=vi.fn(async()=>jsonResponse({checkout:null,fallback:kind,attempt_outcome:'not_created'}));const open=renderPanel(fetchImpl);await fillAndSubmit();const pane=await screen.findByTestId('reap-fallback');expect(pane.querySelectorAll('a')).toHaveLength(0);expect(pane.textContent).not.toMatch(/buy it on the store/);expect(open).not.toHaveBeenCalled();expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it.each(['failed','expired','refused'])('PRIMARY PANEL: final %s result offers only selected Reap checkout controls',async(phase)=>{
 const fetchImpl=scriptedFetch(canceledCheckout(phase as any));const open=renderPanel(fetchImpl);await fillAndSubmit();const pane=await screen.findByTestId('reap-terminal');expect(pane.querySelectorAll('a')).toHaveLength(0);expect(open).not.toHaveBeenCalled();
});
it.each(['not_available','refused'])('PRIMARY PANEL: new blocked outcome %s cannot offer another spending link',async(kind)=>{
 const open=renderPanel(vi.fn(async()=>jsonResponse({checkout:null,blocked:kind,attempt_outcome:'not_created'})));await fillAndSubmit();const pane=await screen.findByTestId('reap-fallback');expect(pane.querySelectorAll('a')).toHaveLength(0);expect(open).not.toHaveBeenCalled();
});

it('an unresolved attempt preserves its original cart source across a new configured source and uses only recovery',async()=>{
 const fetchImpl=vi.fn(async()=>jsonResponse({error:'checkout_outcome_unknown'},502));
 renderPanel(fetchImpl,vi.fn(),'cart_link');await fillAndSubmit();await screen.findByTestId('reap-fallback');cleanup();
 renderPanel(fetchImpl,vi.fn(),'reap_variant');await fillAndSubmit();await screen.findByTestId('reap-fallback');
 expect(fetchImpl).toHaveBeenCalledTimes(2);
 const calls=fetchImpl.mock.calls as unknown as [string,RequestInit][];const [first,recovered]=calls.map(([,init])=>JSON.parse(String(init.body)));
 expect(first.item_source).toBe('cart_link');expect(recovered.item_source).toBe('cart_link');expect(recovered.idempotency_key).toBe(first.idempotency_key);expect(recovered.recover_only).toBe(true);expect(screen.queryByTestId('reap-visit-store')).toBeNull();
});

describe('selected variant and legacy recovery', () => {
  it.each(['677289689108', '42199434526795'])('sends the PDP selector %s', async (variantId) => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({checkout:null, fallback:'not_available', attempt_outcome:'not_created'}));
    renderPanel(fetchImpl, vi.fn(), undefined, variantId);
    await fillAndSubmit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    const request = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(request.variant_id).toBe(variantId);
  });
  it('recovers a pre-variant unknown attempt without changing its body or key', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => jsonResponse({error:'checkout_outcome_unknown'}, 502));
    renderPanel(fetchImpl);
    await fillAndSubmit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    const original = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    cleanup();
    renderPanel(fetchImpl, vi.fn(), undefined, '677289689108');
    await fillAndSubmit();
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const recovery = JSON.parse(String(fetchImpl.mock.calls[1][1].body));
    expect(recovery).toEqual({...original, recover_only:true});
  });
});

it('prepares and persists canonical selection before one create, then recovers it without preparation after current source and variant changes', async () => {
  const selection={product_key:'prod::external_seed::external_seed::ext_real',variant_id:'677289689108',variant_key:'prod::external_seed::external_seed::ext_real::sku_hash',merchant_domain:'judydoll.com',market:'US',currency:'USD',unit_price_minor:1399,quantity:1,item_source:'cart_link'};
  const fetchImpl=vi.fn(async (url:string,_init:RequestInit) => url.endsWith('/prepare') ? jsonResponse({selection}) : jsonResponse({error:'checkout_outcome_unknown'},502));
  renderPanel(fetchImpl,vi.fn(),'cart_link','677289689108');
  await fillAndSubmit();
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
  expect(fetchImpl.mock.calls[0][0]).toBe('/api/reap-checkout/prepare');
  const original=JSON.parse(String(fetchImpl.mock.calls[1][1].body));
  expect(original.selection).toEqual(selection);
  expect(original.item_source).toBe('cart_link');
  expect(original.variant_id).toBe('677289689108');
  expect(JSON.parse(localStorage.getItem(ATTEMPT_PREFIX+PRODUCT_ID)!).selection).toEqual(selection);
  cleanup();
  renderPanel(fetchImpl,vi.fn(),'reap_variant','999999999999');
  await fillAndSubmit();
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
  expect(fetchImpl.mock.calls[2][0]).toBe('/api/reap-checkout');
  expect(JSON.parse(String(fetchImpl.mock.calls[2][1].body))).toEqual({...original,recover_only:true});
  expect(fetchImpl.mock.calls.filter(([url])=>url.endsWith('/prepare'))).toHaveLength(1);
  expect(screen.queryByTestId('reap-visit-store')).toBeNull();
});

it('original displayed1399 rejects fresh preparation1499 before saving any key or create request',async()=>{
 const selection={product_key:'prod::external_seed::external_seed::ext_real',variant_id:'677289689108',variant_key:'prod::external_seed::external_seed::ext_real::sku_hash',merchant_domain:'judydoll.com',market:'US',currency:'USD',unit_price_minor:1499,quantity:1,item_source:'cart_link'};const fetchImpl=vi.fn(async(_url:string,_init:RequestInit)=>jsonResponse({selection}));renderPanel(fetchImpl,vi.fn(),'cart_link',selection.variant_id);await fillAndSubmit();await screen.findByTestId('reap-fallback');expect(fetchImpl).toHaveBeenCalledTimes(1);expect(fetchImpl.mock.calls[0][0]).toBe('/api/reap-checkout/prepare');expect(localStorage.getItem(ATTEMPT_PREFIX+PRODUCT_ID)).toBeNull();expect(screen.queryByTestId('reap-visit-store')).toBeNull();
});
