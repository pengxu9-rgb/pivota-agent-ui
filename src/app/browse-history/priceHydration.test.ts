import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrateZeroPriceItems, resolveHistoryItemPrice } from './priceHydration';

const getPdpV2Mock = vi.fn();
const resolveProductCandidatesMock = vi.fn();

vi.mock('@/lib/api', () => ({
  getPdpV2: (...args: unknown[]) => getPdpV2Mock(...args),
  resolveProductCandidates: (...args: unknown[]) => resolveProductCandidatesMock(...args),
}));

describe('browse history price hydration', () => {
  beforeEach(() => {
    getPdpV2Mock.mockReset();
    resolveProductCandidatesMock.mockReset();
  });

  it('does not send external_seed as a real merchant id when resolving price', async () => {
    resolveProductCandidatesMock.mockResolvedValue({ offers: [] });
    getPdpV2Mock.mockResolvedValue({
      modules: [
        {
          type: 'canonical',
          data: {
            pdp_payload: {
              product: {
                price: { current: { amount: 28, currency: 'USD' } },
              },
              offers: [],
            },
          },
        },
      ],
    });

    await expect(
      resolveHistoryItemPrice({
        product_id: 'ext_1',
        merchant_id: 'external_seed',
        title: 'External serum',
        price: 0,
        image: '/placeholder.svg',
        timestamp: 1000,
      }),
    ).resolves.toBe(28);

    expect(resolveProductCandidatesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'ext_1',
        merchant_id: undefined,
      }),
    );
    expect(getPdpV2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: 'ext_1',
        merchant_id: undefined,
      }),
    );
  });

  it('hydrates zero price history items before rendering', async () => {
    resolveProductCandidatesMock.mockResolvedValue({
      offers: [{ merchant_id: 'merchant_1', price: { amount: 32, currency: 'USD' } }],
    });

    const hydrated = await hydrateZeroPriceItems([
      {
        product_id: 'prod_1',
        merchant_id: 'merchant_1',
        title: 'Barrier cream',
        price: 0,
        image: '/placeholder.svg',
        timestamp: 1000,
      },
    ]);

    expect(hydrated[0].price).toBe(32);
  });
});
