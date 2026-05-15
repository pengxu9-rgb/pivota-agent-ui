'use client';

import { useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

function getMql(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(DESKTOP_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = getMql();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return getMql()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the viewport is at/above the 1024px desktop breakpoint.
 *
 * Backed by `useSyncExternalStore`: the media query is read **synchronously
 * on the first client render**, not via a post-mount `useEffect`. The effect
 * version could intermittently leave desktop users on the mobile PDP tree
 * (the flip never landed); reading during render removes that failure mode.
 * Server render returns `false` — the beauty PDP SSRs as mobile, then the
 * first client render reconciles to desktop on wide viewports.
 */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
