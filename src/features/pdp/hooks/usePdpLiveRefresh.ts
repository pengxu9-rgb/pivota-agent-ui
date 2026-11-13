'use client';

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { getPdpLiveRefresh } from '@/lib/api';
import { resolveBuyerMarket } from '@/lib/buyerMarket';
import type { PDPPayload } from '@/features/pdp/types';
import {
  PDP_LIVE_REFRESH_TIMEOUT_MS,
  applyLiveRefreshPatch,
  buildLiveRefreshPage,
  isLikelyCrawler,
  isPdpLiveRefreshEnabled,
} from '@/features/pdp/utils/liveRefresh';

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * PDP async live refresh (contract v1, section 6): after the page renders, ask the gateway once for the
 * merchant's live price and stock and apply the answer silently (values change in place, no highlight).
 *
 * One call per token per page view, and only when ALL hold: the flag is on, the page carries a
 * descriptor, the visitor is not a crawler, the descriptor's market is the buyer's market, the page is
 * not loading, and the tab is visible (a hidden tab waits for visibilitychange). The call runs at idle,
 * with a 4.5 s budget. Failure, timeout, a non-applied outcome or an older gateway's 400: the stored
 * page stays, and there is no retry.
 */
export function usePdpLiveRefresh({
  payload,
  loading,
  setPayload,
}: {
  payload: PDPPayload | null;
  loading: boolean;
  setPayload: Dispatch<SetStateAction<PDPPayload | null>>;
}): void {
  const token = payload?.live_refresh?.token ?? null;
  const market = payload?.live_refresh?.market ?? null;
  const attemptedRef = useRef(new Set<string>());
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (!token || !market || loading) return;
    if (!isPdpLiveRefreshEnabled()) return;
    if (attemptedRef.current.has(token)) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (isLikelyCrawler()) return;
    if (market !== resolveBuyerMarket()) return;

    const win = window as IdleWindow;
    let cancelled = false;
    let idleHandle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = () => {
      idleHandle = null;
      timer = null;
      if (cancelled || attemptedRef.current.has(token)) return;
      const current = payloadRef.current;
      if (!current || current.live_refresh?.token !== token) return;
      attemptedRef.current.add(token);
      const page = buildLiveRefreshPage(current);
      if (!page) return;
      const sent = {
        token,
        product_id: String(current.product.product_id ?? ''),
        merchant_id: current.product.merchant_id ?? null,
      };
      getPdpLiveRefresh({ token, page, timeout_ms: PDP_LIVE_REFRESH_TIMEOUT_MS })
        .then((res) => setPayload((cur) => applyLiveRefreshPatch(cur, sent, res)))
        .catch(() => {
          // Timeout, transport failure, or an older gateway that does not know pdp_live_read: keep the
          // stored page. No retry.
        });
    };

    const schedule = () => {
      if (typeof win.requestIdleCallback === 'function') {
        idleHandle = win.requestIdleCallback(run, { timeout: 2000 });
      } else {
        timer = setTimeout(run, 1);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      schedule();
    };

    if (document.visibilityState === 'hidden') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    } else {
      schedule();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (idleHandle !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleHandle);
      if (timer !== null) clearTimeout(timer);
    };
  }, [token, market, loading, setPayload]);
}
