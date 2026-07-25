import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mergeDiscoveryRecentViews,
  readLocalBrowseHistory,
  upsertLocalBrowseHistory,
} from './browseHistoryStorage';

describe('browseHistoryStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('dedupes local browse history writes by product and merchant', () => {
    // `price` is required: upsertLocalBrowseHistory drops anything without a
    // positive one (see the drop test below). This fixture predated that gate,
    // so the test had been FAILING loudly — not silently passing. Nobody ran
    // it: there was no CI, so a red test stayed invisible rather than vacuous.
    upsertLocalBrowseHistory({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Older title',
      price: 19.99,
      timestamp: 1000,
    });
    upsertLocalBrowseHistory({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Newer title',
      price: 19.99,
      timestamp: 2000,
    });

    const history = readLocalBrowseHistory(10);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Newer title',
      timestamp: 2000,
    });
  });

  it('drops items with no positive price (the "real price chain" gate)', () => {
    // Deliberate behaviour from d6f5add "Fix browse history real price chain":
    // the recency rail must not render price-less cards. Asserted explicitly so
    // it reads as intent rather than as the accident that broke the test above.
    //
    // Note this also drops price: null — an honest "unknown", not "free". If
    // that ever needs to change, it is a product decision, not a bug fix.
    for (const price of [undefined, null, 0, -1]) {
      upsertLocalBrowseHistory({
        product_id: 'prod_nopricecheck',
        merchant_id: 'merchant_1',
        title: 'No price',
        price: price as number | null | undefined,
        timestamp: 1000,
      });
    }

    expect(readLocalBrowseHistory(10)).toHaveLength(0);
  });

  it('merges account and local recent views in recency order without duplicates', () => {
    const merged = mergeDiscoveryRecentViews({
      accountItems: [
        {
          product_id: 'prod_1',
          merchant_id: 'merchant_1',
          title: 'Account title',
          viewed_at: '2026-04-07T10:00:00.000Z',
          history_source: 'account',
        },
      ],
      localItems: [
        {
          product_id: 'prod_1',
          merchant_id: 'merchant_1',
          title: 'Older local title',
          timestamp: Date.parse('2026-04-07T09:00:00.000Z'),
        },
        {
          product_id: 'prod_2',
          merchant_id: 'merchant_2',
          title: 'Newest local title',
          timestamp: Date.parse('2026-04-07T11:00:00.000Z'),
        },
      ],
      limit: 10,
    });

    expect(merged).toEqual([
      expect.objectContaining({
        product_id: 'prod_2',
        merchant_id: 'merchant_2',
        history_source: 'local',
      }),
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'merchant_1',
        title: 'Account title',
        history_source: 'account',
      }),
    ]);
  });
});
