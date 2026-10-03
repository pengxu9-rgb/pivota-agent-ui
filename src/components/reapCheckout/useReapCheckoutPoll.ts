'use client';

// Polls one Reap checkout until it is terminal.
//
//   - cadence: the checkout's own `reap.poll_after_seconds` hint, at least 3 seconds; valid hints are honored; 5 s when there is no hint
//   - errors (gateway 5xx, network): exponential backoff 5 -> 10 -> 20 -> 40 -> 60 s, never terminal
//     (a transient read failure must not look like a dead purchase — that invites a second one)
//   - terminal (`completed` / `canceled`): stop
//   - tab hidden: keep the schedule for up to 2 minutes, then PAUSE; when the tab is visible or
//     focused again, refresh AT ONCE and resume. The Reap return page tells the buyer to go back to
//     their assistant — this is what makes the result be here when they do.
//   - 30 minutes without reaching terminal: stop, and offer a manual refresh
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReapCheckoutView } from '@/lib/reapCheckout/checkoutView';

export const HIDDEN_PAUSE_MS = 120_000;
export const MAX_POLL_MS = 30 * 60_000;
const MIN_DELAY_MS = 3_000;
const DEFAULT_DELAY_MS = 5_000;
const ERROR_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000];

export function nextPollDelayMs(view: ReapCheckoutView | null, consecutiveErrors: number): number {
  const seconds = view?.pollAfterSeconds;
  const hint = typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 && seconds <= 3600
    ? seconds * 1000 : DEFAULT_DELAY_MS;
  const backoff = consecutiveErrors > 0 ? ERROR_BACKOFF_MS[Math.min(consecutiveErrors, ERROR_BACKOFF_MS.length) - 1] : 0;
  return Math.max(MIN_DELAY_MS, hint, backoff);
}

export type PollState = {
  view: ReapCheckoutView | null;
  consecutiveErrors: number;
  paused: boolean;
  gaveUp: boolean;
  notFound: boolean;
};

export async function fetchReapCheckout(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ view: ReapCheckoutView } | { notFound: true } | { error: true }> {
  try {
    const res = await fetchImpl(`/api/reap-checkout/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return { error: true };
    const body = await res.json().catch(() => null);
    return body?.checkout ? { view: body.checkout as ReapCheckoutView } : { error: true };
  } catch {
    return { error: true };
  }
}

export function useReapCheckoutPoll(initial: ReapCheckoutView | null, opts: { fetchImpl?: typeof fetch } = {}) {
  const [state, setState] = useState<PollState>({
    view: initial,
    consecutiveErrors: 0,
    paused: false,
    gaveUp: false,
    notFound: false,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiddenSince = useRef<number | null>(null);
  const startedAt = useRef<number>(Date.now());
  const inflight = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Held in a ref so `tick` is stable: a new fetchImpl identity (a parent re-render) must not re-arm the timer.
  const fetchRef = useRef(opts.fetchImpl);
  fetchRef.current = opts.fetchImpl;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const tick = useCallback(async () => {
    const current = stateRef.current;
    const id = current.view?.id;
    if (!id || current.view?.terminal || current.notFound || inflight.current) return;
    if (Date.now() - startedAt.current > MAX_POLL_MS) {
      setState((s) => ({ ...s, gaveUp: true }));
      return;
    }
    if (hiddenSince.current !== null && Date.now() - hiddenSince.current > HIDDEN_PAUSE_MS) {
      setState((s) => ({ ...s, paused: true }));
      return;
    }
    inflight.current = true;
    const out = await fetchReapCheckout(id, fetchRef.current);
    inflight.current = false;
    setState((s) => {
      if (s.view?.id !== id) return s;
      if ('view' in out) return { ...s, view: out.view, consecutiveErrors: 0, paused: false };
      if ('notFound' in out) return { ...s, notFound: true };
      return { ...s, consecutiveErrors: s.consecutiveErrors + 1 };
    });
  }, []);

  // (Re)schedule after every state change.
  useEffect(() => {
    clear();
    const { view, consecutiveErrors, paused, gaveUp, notFound } = state;
    if (!view || view.terminal || paused || gaveUp || notFound) return clear;
    timer.current = setTimeout(() => {
      void tick();
    }, nextPollDelayMs(view, consecutiveErrors));
    return clear;
  }, [state, tick]);

  // Visibility / focus: refresh at once when the buyer comes back.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenSince.current === null) hiddenSince.current = Date.now();
        return;
      }
      hiddenSince.current = null;
      setState((s) => (s.paused ? { ...s, paused: false } : s));
      void tick();
    };
    const onFocus = () => {
      hiddenSince.current = null;
      setState((s) => (s.paused ? { ...s, paused: false } : s));
      void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [tick]);

  const refreshNow = useCallback(() => {
    startedAt.current = Date.now();
    setState((s) => ({ ...s, gaveUp: false, paused: false }));
    void tick();
  }, [tick]);

  const reset = useCallback((view: ReapCheckoutView | null) => {
    startedAt.current = Date.now();
    hiddenSince.current = null;
    setState({ view, consecutiveErrors: 0, paused: false, gaveUp: false, notFound: false });
  }, []);

  return { ...state, refreshNow, reset };
}
