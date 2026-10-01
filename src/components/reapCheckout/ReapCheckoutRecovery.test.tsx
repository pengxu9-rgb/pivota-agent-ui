import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel, ACTIVE_KEY_PREFIX, writeActiveCheckoutId } from './ReapCheckoutPanel';
import { ATTEMPT_PREFIX, readAttempt } from '@/lib/reapCheckout/attempt';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { PRODUCT_ID, awaitingApprovalCheckout, completedCheckout, canceledCheckout, needsEnrollmentCheckout, resolvingCheckout } from '@/lib/reapCheckout/__fixtures__/checkouts';
const NOW = Date.parse('2026-09-29T10:00:00Z');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const view = (raw: unknown) => readReapCheckout(raw)!;
const values = { first_name: 'Sandbox', last_name: 'Verifier', email: 'recovery@example.test', phone: '+14155550100', address_line1: '900 Brannan St', city: 'San Francisco', region: 'CA', postal_code: '94103' };
function mount(fetchImpl: typeof fetch, key = vi.fn(() => 'attempt-key-0001'), opts: { now?: () => number; openWindow?: (url: string) => void } = {}) {
  return render(<ReapCheckoutPanel productId={PRODUCT_ID} productTitle="Generic title" merchantDomain="judydoll.com" market="US" storeUrl="https://judydoll.com/products/example" fetchImpl={fetchImpl} now={opts.now || (() => NOW)} openWindow={opts.openWindow} newIdempotencyKey={key} />);
}
function fill(container: HTMLElement, over: Partial<typeof values> = {}) {
  for (const [name, value] of Object.entries({ ...values, ...over })) fireEvent.change(container.querySelector(`input[name="${name}"]`)!, { target: { value } });
  const consent = container.querySelector('input[name="consent"]') as HTMLInputElement;
  if (!consent.checked) fireEvent.click(consent);
}
async function submit(container: HTMLElement, over: Partial<typeof values> = {}) {
  fill(container, over);
  await act(async () => { fireEvent.click(within(container).getByTestId('reap-submit')); });
}
function transport(create: (init: RequestInit) => Promise<Response>, owner = () => 'buyer-one') {
  return vi.fn(async (url: string, init: RequestInit) => url === '/api/reap-checkout/session' ? json({ scope: owner() }) : create(init));
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('durable checkout attempt recovery', () => {
  it('persists before dispatch and replays the same key after response loss/reload without storing buyer fields', async () => {
    const keys: string[] = []; const recoveryFlags: boolean[] = [];
    const fetchImpl = transport(async (init) => {
      const body = JSON.parse(String(init.body)); keys.push(body.idempotency_key); recoveryFlags.push(body.recover_only);
      expect(readAttempt(PRODUCT_ID)?.key).toBe(body.idempotency_key);
      return keys.length === 1 ? json({}, 502) : json({ checkout: view(resolvingCheckout()) });
    });
    const first = mount(fetchImpl as typeof fetch); await submit(first.container); await screen.findByTestId('reap-fallback');
    const stored = localStorage.getItem(ATTEMPT_PREFIX + PRODUCT_ID)!;
    expect(stored).not.toMatch(/recovery@example|Brannan|Verifier|San Francisco|14155550100/);
    expect(JSON.parse(stored).fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(screen.getByTestId('reap-new-buyer')).toBeDisabled(); first.unmount();
    const newKey = vi.fn(() => 'different-key-0002'); const second = mount(fetchImpl as typeof fetch, newKey);
    await screen.findByTestId('reap-attempt-pending'); await submit(second.container); await screen.findByTestId('reap-status');
    expect(keys).toEqual(['attempt-key-0001', 'attempt-key-0001']); expect(recoveryFlags).toEqual([false, true]); expect(newKey).not.toHaveBeenCalled();
  });
  it.each(['edited details', 'rotated buyer scope'])('blocks a second create after %s', async (change) => {
    let scope = 'buyer-one'; let creates = 0;
    const fetchImpl = transport(async () => { creates++; return json({}, 502); }, () => scope);
    const first = mount(fetchImpl as typeof fetch); await submit(first.container); await screen.findByTestId('reap-fallback'); first.unmount();
    if (change === 'rotated buyer scope') scope = 'buyer-two';
    const second = mount(fetchImpl as typeof fetch); await submit(second.container, change === 'edited details' ? { city: 'Oakland' } : {});
    expect((await screen.findByTestId('reap-fallback')).textContent).toMatch(/exactly the same details|Buyer session changed/); expect(creates).toBe(1);
  });
  it('serializes simultaneous tabs so only one idempotency key is minted', async () => {
    const keys: string[] = [];
    const fetchImpl = transport(async (init) => { keys.push(JSON.parse(String(init.body)).idempotency_key); return json({}, 502); });
    const newKey = vi.fn(() => 'one-shared-attempt'); const first = mount(fetchImpl as typeof fetch, newKey); const second = mount(fetchImpl as typeof fetch, newKey);
    fill(first.container); fill(second.container); await act(async () => { fireEvent.click(within(first.container).getByTestId('reap-submit')); fireEvent.click(within(second.container).getByTestId('reap-submit')); }); await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys).toEqual(['one-shared-attempt', 'one-shared-attempt']);
    const sent = fetchImpl.mock.calls.filter(([url]) => url === '/api/reap-checkout').map(([, init]) => JSON.parse(String(init.body)));
    expect(sent.map((body) => body.recover_only)).toEqual([false, true]); expect(newKey).toHaveBeenCalledTimes(1);
  });
  it('does not create when durable storage is unavailable', async () => {
    const fetchImpl = transport(async () => json({ checkout: view(resolvingCheckout()) })); const panel = mount(fetchImpl as typeof fetch);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    await submit(panel.container); await screen.findByTestId('reap-fallback'); expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/reap-checkout/session']);
  });
  it('does not create when Web Locks are unavailable', async () => {
    const locks = navigator.locks; Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    try { const fetchImpl = vi.fn(); const panel = mount(fetchImpl as typeof fetch); await submit(panel.container); expect((await screen.findByTestId('reap-fallback')).textContent).toMatch(/updated browser/); expect(fetchImpl).not.toHaveBeenCalled(); }
    finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: locks }); }
  });
  it.each(['unknown', undefined])('keeps non-Reap fallback unresolved because backend create may have timed out (%s)', async (outcome) => {
    const fetchImpl = transport(async () => json({ checkout: null, fallback: 'not_reap', attempt_outcome: outcome })); const panel = mount(fetchImpl as typeof fetch);
    await submit(panel.container); expect((await screen.findByTestId('reap-fallback')).textContent).toMatch(/whether this checkout was opened/);
    expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false); expect(screen.getByTestId('reap-new-buyer')).toBeDisabled();
    expect(screen.getByText('Recover same attempt')).toBeTruthy();
    expect(screen.queryByTestId('reap-visit-store')).toBeNull();
    expect(screen.queryByTestId('reap-visit-configured-merchant')).toBeNull();
  });
  it('keeps network exceptions unresolved without claiming nothing charged', async () => {
    const fetchImpl = transport(async () => { throw new Error('network lost'); }); const panel = mount(fetchImpl as typeof fetch);
    await submit(panel.container); await screen.findByTestId('reap-fallback'); expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false);
    expect(screen.getByTestId('reap-panel').textContent).not.toMatch(/nothing (?:was|is) charged/i);
  });
  it('does not create when buyer bootstrap fails', async () => {
    const fetchImpl = vi.fn(async () => json({}, 503)); const panel = mount(fetchImpl as typeof fetch); await submit(panel.container); await screen.findByTestId('reap-fallback');
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(readAttempt(PRODUCT_ID)).toBeNull();
  });
  it.each([429, 400, 'seller-refusal'])('lost create then replay %s never clears prior uncertainty', async (result) => {
    let creates = 0;
    const fetchImpl = transport(async () => {
      creates++;
      return creates === 1 ? json({}, 502) : result === 'seller-refusal'
        ? json({ checkout: null, fallback: 'seller_mismatch', attempt_outcome: 'not_created' })
        : json({ field: 'buyer.region', message: 'Retry refused' }, Number(result));
    });
    const first = mount(fetchImpl as typeof fetch); await submit(first.container); await screen.findByTestId('reap-fallback'); first.unmount();
    const second = mount(fetchImpl as typeof fetch); await submit(second.container);
    await waitFor(() => expect(creates).toBe(2));
    expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false);
    expect(screen.getByTestId('reap-new-buyer')).toBeDisabled(); second.unmount();
    const third = mount(fetchImpl as typeof fetch); await submit(third.container, { city: 'Oakland' });
    await screen.findByTestId('reap-fallback'); expect(creates).toBe(2);
  });
  it('a restored 404 preserves the recovery id and offers no fresh checkout', async () => {
    const id = view(resolvingCheckout()).id; writeActiveCheckoutId(PRODUCT_ID, id);
    mount(vi.fn(async () => json({}, 404)) as typeof fetch);
    await screen.findByTestId('reap-gone-uncertain');
    expect(localStorage.getItem(ACTIVE_KEY_PREFIX + PRODUCT_ID)).toContain(id);
    expect(screen.queryByTestId('reap-form')).toBeNull(); expect(screen.queryByText('Back to checkout')).toBeNull();
  });
  it('a stale terminal restart cannot clear a newer attempt created in another tab', async () => {
    const checkout = view(canceledCheckout('failed')); writeActiveCheckoutId(PRODUCT_ID, checkout.id);
    mount(vi.fn(async () => json({ checkout })) as typeof fetch);
    const restart = await screen.findByTestId('reap-restart');
    localStorage.removeItem(ACTIVE_KEY_PREFIX + PRODUCT_ID);
    localStorage.setItem(ATTEMPT_PREFIX + PRODUCT_ID, JSON.stringify({ key: 'newer-attempt-key', fingerprint: 'a'.repeat(64), scope: 'buyer-one', resolved: false }));
    await act(async () => { fireEvent.click(restart); });
    expect(readAttempt(PRODUCT_ID)?.key).toBe('newer-attempt-key');
    expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false);
  });
  it('does not reset the shared buyer while another product has an unresolved checkout', async () => {
    writeActiveCheckoutId('different-product', view(resolvingCheckout()).id);
    const fetchImpl = vi.fn(); mount(fetchImpl as typeof fetch);
    await act(async () => { fireEvent.click(screen.getByTestId('reap-new-buyer')); });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(localStorage.getItem(ACTIVE_KEY_PREFIX + 'different-product')).not.toBeNull();
  });
  it('does not reset while another product has an unresolved create without an id', async () => {
    localStorage.setItem(ATTEMPT_PREFIX + 'different-product', JSON.stringify({ key: 'other-key', fingerprint: 'a'.repeat(64), scope: 'buyer-one', resolved: false }));
    const fetchImpl = vi.fn(); mount(fetchImpl as typeof fetch);
    await act(async () => { fireEvent.click(screen.getByTestId('reap-new-buyer')); });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(localStorage.getItem(ATTEMPT_PREFIX + 'different-product')).not.toBeNull();
  });
  it('retains completed recovery records if the reset request fails', async () => {
    localStorage.setItem(ACTIVE_KEY_PREFIX + 'different-product', JSON.stringify({ id: view(completedCheckout()).id, at: NOW, settled: true }));
    const fetchImpl = vi.fn(async () => json({}, 503)); mount(fetchImpl as typeof fetch);
    await act(async () => { fireEvent.click(screen.getByTestId('reap-new-buyer')); });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ACTIVE_KEY_PREFIX + 'different-product')).not.toBeNull();
  });
  it.each([['phone', '123'], ['region', ''], ['postal_code', 'bad']])('invalid %s sends no server request', async (field, value) => {
    const fetchImpl = vi.fn(); const panel = mount(fetchImpl as typeof fetch); await submit(panel.container, { [field]: value });
    expect(fetchImpl).not.toHaveBeenCalled(); expect(panel.container.querySelector(`input[name="${field}"]`)).toHaveAttribute('aria-invalid', 'true');
  });
});
describe('hosted deadline and environment guards', () => {
  it.each([null, 'bad', '2026-09-29T09:59:00Z'])('does not offer payment with invalid deadline %s', async (deadline) => {
    const checkout = { ...view(awaitingApprovalCheckout()), expiresAt: deadline, approvalDeadline: deadline };
    writeActiveCheckoutId(PRODUCT_ID, checkout.id); const openWindow = vi.fn(); mount(vi.fn(async () => json({ checkout })) as typeof fetch, undefined, { openWindow });
    await screen.findByTestId('reap-link-expired'); expect(screen.queryByTestId('reap-continue')).toBeNull(); expect(openWindow).not.toHaveBeenCalled();
  });
  it('never opens the hosted page if the handoff recovery flag cannot be persisted', async () => {
    const checkout = view(awaitingApprovalCheckout()); writeActiveCheckoutId(PRODUCT_ID, checkout.id);
    const openWindow = vi.fn(); mount(vi.fn(async () => json({ checkout })) as typeof fetch, undefined, { openWindow });
    const button = await screen.findByTestId('reap-continue');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage blocked'); });
    fireEvent.click(button); expect(openWindow).not.toHaveBeenCalled(); expect(screen.getByTestId('reap-handoff-problem')).toBeTruthy();
  });
  it('checks expiry again at click before the render timer fires', async () => {
    let current = NOW; const checkout = view(awaitingApprovalCheckout({ deadline: '2026-09-29T10:01:00Z' }));
    writeActiveCheckoutId(PRODUCT_ID, checkout.id); const openWindow = vi.fn(); mount(vi.fn(async () => json({ checkout })) as typeof fetch, undefined, { now: () => current, openWindow });
    const button = await screen.findByTestId('reap-continue'); current = NOW + 61000; fireEvent.click(button);
    expect(openWindow).not.toHaveBeenCalled(); expect(screen.queryByTestId('reap-continue')).toBeNull();
  });
  it('shows the exact variant before enrollment', async () => {
    const checkout = view(needsEnrollmentCheckout()); checkout.lineItems[0].title = 'Lip Ink — 03 Peach'; writeActiveCheckoutId(PRODUCT_ID, checkout.id);
    mount(vi.fn(async () => json({ checkout })) as typeof fetch); await screen.findByTestId('reap-status');
    expect(screen.getAllByText('Lip Ink — 03 Peach').length).toBeGreaterThan(0); expect(screen.queryByText('Generic title')).toBeNull();
  });
  it('does not claim a merchant receipt or shipment solely from sandbox completion', async () => {
    const checkout = { ...view(completedCheckout()), environment: 'sandbox' }; writeActiveCheckoutId(PRODUCT_ID, checkout.id); mount(vi.fn(async () => json({ checkout })) as typeof fetch);
    expect((await screen.findByTestId('reap-completed')).textContent).toMatch(/Sandbox checkout completed/);
    expect(screen.getByTestId('reap-completed').textContent).not.toMatch(/merchant will email|Order placed/);
  });
});
