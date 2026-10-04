import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReapCheckoutPanel, ACTIVE_KEY_PREFIX, readActiveCheckoutId, writeActiveCheckoutId } from './ReapCheckoutPanel';
import { ATTEMPT_PREFIX, readAttempt, requestFingerprint } from '@/lib/reapCheckout/attempt';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { PRODUCT_ID, awaitingApprovalCheckout, completedCheckout, canceledCheckout, needsEnrollmentCheckout, resolvingCheckout } from '@/lib/reapCheckout/__fixtures__/checkouts';
const NOW = Date.parse('2026-09-29T10:00:00Z');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const view = (raw: unknown) => readReapCheckout(raw)!;
const values = { first_name: 'Sandbox', last_name: 'Verifier', email: 'recovery@example.test', phone: '+14155550100', address_line1: '900 Brannan St', city: 'San Francisco', region: 'CA', postal_code: '94103' };
function mount(fetchImpl: typeof fetch, key = vi.fn(() => 'attempt-key-0001'), opts: { now?: () => number; openWindow?: (url: string) => void; money?: {expected_unit_price_minor:number;expected_currency:string} } = {}) {
  return render(<ReapCheckoutPanel expectedMoney={opts.money || {expected_unit_price_minor:1399,expected_currency:"USD"}} productId={PRODUCT_ID} productTitle="Generic title" merchantDomain="judydoll.com" market="US" storeUrl="https://judydoll.com/products/example" fetchImpl={fetchImpl} now={opts.now || (() => NOW)} openWindow={opts.openWindow} newIdempotencyKey={key} />);
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
describe('independent retirement persistence fault injection', () => {
  it.each(['throw', 'drop'])('keeps the original unresolved attempt when the receipt storage write will %s', async (failure) => {
    const sent: Array<{ idempotency_key: string; recover_only: boolean }> = [];
    const fetchImpl = transport(async (init) => {
      sent.push(JSON.parse(String(init.body)));
      return sent.length === 1 ? json({}, 502) : json({checkout: null, attempt_outcome: 'not_created', recovery_status: 'retired', reconciliation_id: 'a'.repeat(32)});
    });
    const first = mount(fetchImpl as typeof fetch);
    await submit(first.container); await screen.findByTestId('reap-fallback'); first.unmount();
    const original = readAttempt(PRODUCT_ID);
    expect(original).not.toBeNull();
    const second = mount(fetchImpl as typeof fetch);
    const originalSet = Storage.prototype.setItem;
    const receiptWriteIntercepted = vi.fn();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key: string, value: string) {
      if (key === ATTEMPT_PREFIX + PRODUCT_ID && JSON.parse(value).retirementReceipt) {
        receiptWriteIntercepted(JSON.parse(value));
        if (failure === 'throw') throw new Error('synthetic persistence failure');
        return;
      }
      originalSet.call(this, key, value);
    });
    await submit(second.container); await screen.findByTestId('reap-fallback');
    expect(sent.map(({idempotency_key, recover_only}) => ({idempotency_key, recover_only}))).toEqual([
      {idempotency_key: original!.key, recover_only: false},
      {idempotency_key: original!.key, recover_only: true},
    ]);
    expect(receiptWriteIntercepted).toHaveBeenCalledTimes(1);
    expect(receiptWriteIntercepted).toHaveBeenCalledWith({...original, resolved: true, retirementReceipt: 'a'.repeat(32)});
    expect(readAttempt(PRODUCT_ID)).toEqual(original);
    expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false);
    expect(screen.queryByTestId('reap-attempt-retired')).toBeNull();
    expect(screen.queryByText('Start a new checkout')).toBeNull();
  });
  it('refuses a matching retirement response if an active checkout appears before it arrives', async () => {
    const sent: Array<{ idempotency_key: string; recover_only: boolean }> = [];
    const concurrentCheckoutId = view(resolvingCheckout()).id;
    let concurrentActiveRecord: string | null = null;
    const fetchImpl = transport(async (init) => {
      sent.push(JSON.parse(String(init.body)));
      if (sent.length === 1) return json({}, 502);
      writeActiveCheckoutId(PRODUCT_ID, concurrentCheckoutId);
      concurrentActiveRecord = localStorage.getItem(ACTIVE_KEY_PREFIX + PRODUCT_ID);
      return json({checkout: null, attempt_outcome: 'not_created', recovery_status: 'retired', reconciliation_id: 'a'.repeat(32)});
    });
    const first = mount(fetchImpl as typeof fetch);
    await submit(first.container); await screen.findByTestId('reap-fallback'); first.unmount();
    const original = readAttempt(PRODUCT_ID);
    expect(original).not.toBeNull();
    const second = mount(fetchImpl as typeof fetch);
    await submit(second.container); await screen.findByTestId('reap-fallback');
    expect(sent.map(({idempotency_key, recover_only}) => ({idempotency_key, recover_only}))).toEqual([
      {idempotency_key: original!.key, recover_only: false},
      {idempotency_key: original!.key, recover_only: true},
    ]);
    expect(concurrentActiveRecord).not.toBeNull();
    expect(readActiveCheckoutId(PRODUCT_ID)).toBe(concurrentCheckoutId);
    expect(localStorage.getItem(ACTIVE_KEY_PREFIX + PRODUCT_ID)).toBe(concurrentActiveRecord);
    expect(readAttempt(PRODUCT_ID)).toEqual(original);
    expect(readAttempt(PRODUCT_ID)?.resolved).toBe(false);
    expect(screen.queryByTestId('reap-attempt-retired')).toBeNull();
    expect(screen.queryByText('Start a new checkout')).toBeNull();
  });
});
