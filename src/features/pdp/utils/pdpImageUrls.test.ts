import { describe, expect, it } from 'vitest';
import { normalizePdpImageUrl } from './pdpImageUrls';

describe('normalizePdpImageUrl', () => {
  it('rewrites Tom Ford tfb_sku Shopify assets onto sdcdn mirrors', () => {
    expect(
      normalizePdpImageUrl(
        'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tfb_sku_TC7Y09_2000x2000_0_74c2dfd9-3f5f-4832-af13-85e0ec7891c9.png?v=1774387551',
      ),
    ).toBe(
      'https://sdcdn.io/tf/tfb_sku_TC7Y09_2000x2000_0.png?height=1400px&width=1400px',
    );
  });
});
