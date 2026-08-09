// The server-side browse feed: never cache an empty grid, degrade to [] (the
// pre-existing client-only behavior) on any failure, and pass the direct
// upstream base so the fetch works at build/revalidate time.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getShoppingDiscoveryFeedMock = vi.fn();

vi.mock('next/cache', () => ({
  // Identity wrapper: these tests assert the fetch contract, not Next's cache.
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/api', () => ({
  getShoppingDiscoveryFeed: (...args: unknown[]) => getShoppingDiscoveryFeedMock(...args),
}));

import { fetchBrowseFeedForServerRender } from './browseFeedServer';

describe('fetchBrowseFeedForServerRender', () => {
  beforeEach(() => {
    getShoppingDiscoveryFeedMock.mockReset();
  });

  it('returns the feed products and posts to an absolute upstream base', async () => {
    getShoppingDiscoveryFeedMock.mockResolvedValueOnce({
      products: [{ product_id: 'sig_a', title: 'A' }],
    });

    const products = await fetchBrowseFeedForServerRender();

    expect(products).toHaveLength(1);
    const args = getShoppingDiscoveryFeedMock.mock.calls[0][0];
    expect(args.surface).toBe('browse_products');
    // Own /api/gateway proxy (absolute) — the proxy injects the upstream API
    // key, and the relative default cannot answer during the build's own
    // prerender.
    expect(String(args.gatewayBaseUrl)).toMatch(/^https?:\/\/.*\/api\/gateway$/);
    // Public browse stays personalization-free.
    expect(args.recentViews).toEqual([]);
    expect(args.recentQueries).toEqual([]);
  });

  it('retries once on an empty feed (cold-fill), then serves the populated page', async () => {
    getShoppingDiscoveryFeedMock
      .mockResolvedValueOnce({ products: [] }) // cold
      .mockResolvedValueOnce({ products: [{ product_id: 'sig_warm', title: 'Warm' }] });
    await expect(fetchBrowseFeedForServerRender()).resolves.toHaveLength(1);
    expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a THROW too, not only on an empty result', async () => {
    // The dominant failure is a slow/failed call (6.7s and 10.3s measured
    // against a 12s budget), which the first cut never retried.
    getShoppingDiscoveryFeedMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ products: [{ product_id: 'sig_ok', title: 'OK' }] });
    await expect(fetchBrowseFeedForServerRender()).resolves.toHaveLength(1);
    expect(getShoppingDiscoveryFeedMock).toHaveBeenCalledTimes(2);
  });

  it('THROWS when the feed is empty on both tries, so ISR keeps the good page', async () => {
    // Returning [] here rendered a 200 empty grid that Next stored as the
    // route's ISR entry — pinning the defect for a full window and replacing a
    // healthy page on every failed revalidation. Throwing is the PDP's
    // PDP_DEGRADED_RENDER_ERROR contract.
    getShoppingDiscoveryFeedMock
      .mockResolvedValueOnce({ products: [] })
      .mockResolvedValueOnce({ products: [] });
    await expect(fetchBrowseFeedForServerRender()).rejects.toThrow(
      /browse_feed_unavailable_not_cached/,
    );
  });

  it('THROWS on fetch failure rather than caching an empty grid', async () => {
    getShoppingDiscoveryFeedMock
      .mockRejectedValueOnce(new Error('upstream down'))
      .mockRejectedValueOnce(new Error('upstream down'));
    await expect(fetchBrowseFeedForServerRender()).rejects.toThrow(
      /browse_feed_unavailable_not_cached/,
    );
  });

  it('never fetches during a production build (the origin is not live yet)', async () => {
    const prev = process.env.NEXT_PHASE;
    process.env.NEXT_PHASE = 'phase-production-build';
    try {
      await expect(fetchBrowseFeedForServerRender()).resolves.toEqual([]);
      expect(getShoppingDiscoveryFeedMock).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.NEXT_PHASE;
      else process.env.NEXT_PHASE = prev;
    }
  });
});
