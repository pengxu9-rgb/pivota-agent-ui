import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_PAUSE_MS, nextPollDelayMs, useReapCheckoutPoll } from './useReapCheckoutPoll';
import { readReapCheckout } from '@/lib/reapCheckout/checkoutView';
import { awaitingApprovalCheckout, completedCheckout, resolvingCheckout } from '@/lib/reapCheckout/__fixtures__/checkouts';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('nextPollDelayMs', () => {
  it('follows the checkout hint, at least 3 s and honoring server hints; backs off on errors up to 60 s', () => {
    const v5 = readReapCheckout(resolvingCheckout())!; // hint 5
    expect(nextPollDelayMs(v5, 0)).toBe(5_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 1 }, 0)).toBe(3_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 60 }, 0)).toBe(60_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 30 }, 0)).toBe(30_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 30 }, 1)).toBe(30_000);
    for (const invalid of [NaN, Infinity, -1, 0, 3601]) expect(nextPollDelayMs({ ...v5, pollAfterSeconds: invalid }, 0)).toBe(5_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: null }, 0)).toBe(5_000);
    expect([1, 2, 3, 4, 5, 9].map((n) => nextPollDelayMs(v5, n))).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000]);
  });
});

function Probe({ fetchImpl, onState }: { fetchImpl: typeof fetch; onState: (s: ReturnType<typeof useReapCheckoutPoll>) => void }) {
  const s = useReapCheckoutPoll(readReapCheckout(awaitingApprovalCheckout())!, { fetchImpl });
  onState(s);
  return null;
}

describe('useReapCheckoutPoll visibility', () => {
  it('pauses after the tab is hidden for 2 minutes, and refreshes at once when visible again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const body = { checkout: readReapCheckout(awaitingApprovalCheckout()) };
    // A plain object, not a Response: a Response body stream does not settle under fake timers.
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
    let last: ReturnType<typeof useReapCheckoutPoll> | null = null;
    render(<Probe fetchImpl={fetchImpl as unknown as typeof fetch} onState={(s) => (last = s)} />);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // One act per step: React flushes the re-scheduling effect when each act exits.
    for (let t = 0; t < HIDDEN_PAUSE_MS + 30_000; t += 5_000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
    }
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(5);
    expect(last!.paused).toBe(true);
    const callsWhilePaused = fetchImpl.mock.calls.length;
    for (let t = 0; t < 120_000; t += 5_000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
    }
    expect(fetchImpl.mock.calls.length).toBe(callsWhilePaused);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(fetchImpl.mock.calls.length).toBe(callsWhilePaused + 1);
    expect(last!.paused).toBe(false);
  });
});

function Bare({ view }: { view: ReturnType<typeof readReapCheckout> }) {
  useReapCheckoutPoll(view, { fetchImpl: vi.fn() as unknown as typeof fetch });
  return null;
}

describe('useReapCheckoutPoll scheduling', () => {
  it('schedules no timer at all for a terminal checkout, and exactly one for a live one', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const done = render(<Bare view={readReapCheckout(completedCheckout())} />);
    expect(vi.getTimerCount()).toBe(0);
    done.unmount();
    render(<Bare view={readReapCheckout(awaitingApprovalCheckout())} />);
    expect(vi.getTimerCount()).toBe(1);
  });
});

it('does not poll a thirty-second server hint after fifteen seconds', async () => {
  vi.useFakeTimers();
  const initial = { ...readReapCheckout(awaitingApprovalCheckout())!, pollAfterSeconds: 30 };
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ checkout: initial }) }));
  function ThirtySecondProbe() { useReapCheckoutPoll(initial, { fetchImpl: fetchImpl as unknown as typeof fetch }); return null; }
  render(<ThirtySecondProbe />);
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(fetchImpl).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it('a late same-id response or reset never resurrects a terminal checkout', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  const fetchImpl = vi.fn(() => new Promise((done) => { resolve = done; }));
  let last!: ReturnType<typeof useReapCheckoutPoll>;
  render(<Probe fetchImpl={fetchImpl as unknown as typeof fetch} onState={(s) => { last = s; }} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  const terminal = readReapCheckout(completedCheckout())!;
  await act(async () => { last.reset(terminal); });
  await act(async () => { resolve({ ok: true, status: 200, json: async () => ({ checkout: readReapCheckout(resolvingCheckout()) }) }); });
  expect(last.view?.phase).toBe('completed');
  await act(async () => { last.reset(readReapCheckout(resolvingCheckout())!); });
  expect(last.view?.phase).toBe('completed');
  expect(vi.getTimerCount()).toBe(0);
});
