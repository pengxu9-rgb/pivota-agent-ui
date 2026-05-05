import { describe, expect, it } from 'vitest';

import { mergeHistoryItems } from './historyItems';

describe('mergeHistoryItems', () => {
  it('keeps remote account history but fills zero prices from matching local history', () => {
    const merged = mergeHistoryItems(
      [
        {
          product_id: 'prod_1',
          merchant_id: 'merchant_1',
          title: 'Barrier Serum',
          price: 0,
          image: '/remote.png',
          timestamp: 2000,
        },
      ],
      [
        {
          product_id: 'prod_1',
          merchant_id: 'merchant_1',
          title: 'Barrier Serum',
          price: 28,
          image: '/local.png',
          timestamp: 1000,
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        product_id: 'prod_1',
        merchant_id: 'merchant_1',
        price: 28,
        image: '/remote.png',
      }),
    );
  });

  it('keeps local-only items when account history exists', () => {
    const merged = mergeHistoryItems(
      [
        {
          product_id: 'remote_prod',
          title: 'Remote Product',
          price: 14,
          image: '/remote.png',
          timestamp: 1000,
        },
      ],
      [
        {
          product_id: 'local_prod',
          title: 'Local Product',
          price: 20,
          image: '/local.png',
          timestamp: 2000,
        },
      ],
    );

    expect(merged.map((item) => item.product_id)).toEqual(['local_prod', 'remote_prod']);
  });
});
