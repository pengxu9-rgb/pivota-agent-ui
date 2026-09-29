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
  it('follows the checkout hint, clamped to 3..15 s; backs off on errors up to 60 s', () => {
    const v5 = readReapCheckout(resolvingCheckout())!; // hint 5
    expect(nextPollDelayMs(v5, 0)).toBe(5_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 1 }, 0)).toBe(3_000);
    expect(nextPollDelayMs({ ...v5, pollAfterSeconds: 60 }, 0)).toBe(15_000);
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
