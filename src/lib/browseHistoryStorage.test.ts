import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mergeDiscoveryRecentViews,
  readLocalDiscoveryRecentViews,
  readLocalBrowseHistory,
  upsertLocalBrowseHistory,
} from './browseHistoryStorage';

describe('browseHistoryStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('dedupes local browse history writes by product and merchant', () => {
    upsertLocalBrowseHistory({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Older title',
      timestamp: 1000,
    });
    upsertLocalBrowseHistory({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Newer title',
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

  it('derives discovery recent views from local browse history only', () => {
    upsertLocalBrowseHistory({
      product_id: 'prod_1',
      merchant_id: 'merchant_1',
      title: 'Newest local title',
      category: 'Serum',
      timestamp: Date.parse('2026-04-07T11:00:00.000Z'),
    });
    upsertLocalBrowseHistory({
      product_id: 'prod_2',
      merchant_id: 'merchant_2',
      title: 'Older local title',
      category: 'Moisturizer',
      timestamp: Date.parse('2026-04-07T10:00:00.000Z'),
    });

    expect(readLocalDiscoveryRecentViews(2)).toEqual([
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'merchant_1',
        category: 'Serum',
        history_source: 'local',
      }),
      expect.objectContaining({
        product_id: 'prod_2',
        merchant_id: 'merchant_2',
        category: 'Moisturizer',
        history_source: 'local',
      }),
    ]);
  });
});
