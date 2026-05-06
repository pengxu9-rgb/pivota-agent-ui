import { describe, expect, it } from 'vitest';
import {
  applyKnownHostWidthHint,
  normalizePdpImageUrl,
  shouldBypassNextImageOptimizer,
} from './pdpImageUrls';

describe('normalizePdpImageUrl', () => {
  it('canonicalizes Tom Ford tfb_sku assets onto official Shopify files URLs without stripping valid hash suffixes', () => {
    expect(
      normalizePdpImageUrl(
        'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tfb_sku_TC7Y09_2000x2000_0_74c2dfd9-3f5f-4832-af13-85e0ec7891c9.png?v=1774387551',
      ),
    ).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tfb_sku_TC7Y09_2000x2000_0_74c2dfd9-3f5f-4832-af13-85e0ec7891c9.png',
    );
  });

  it('keeps official Shopify Tom Ford assets on Shopify instead of rewriting them to sdcdn', () => {
    expect(
      normalizePdpImageUrl(
        'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_TC7Y09_3000x3000_4.jpg?v=1774387551',
      ),
    ).toBe(
      'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_TC7Y09_3000x3000_4.jpg',
    );
  });

  it('keeps Tom Ford sdcdn SKU assets on sdcdn instead of rewriting them to Shopify', () => {
    expect(
      normalizePdpImageUrl(
        'https://sdcdn.io/tf/tf_sku_TC7Y09_3000x3000_4.jpg?height=1400px&width=1400px',
      ),
    ).toBe('https://sdcdn.io/tf/tf_sku_TC7Y09_3000x3000_4.jpg');
  });

  it('does not rewrite Tom Ford sdcdn regional assets that are absent from Shopify files', () => {
    expect(
      normalizePdpImageUrl('https://sdcdn.io/tf/tf_sku_TE1634_NA_3000x3000_0.png'),
    ).toBe('https://sdcdn.io/tf/tf_sku_TE1634_NA_3000x3000_0.png');
  });

  it('keeps Dr.Jart product media on the official remote host instead of routing through the local proxy', () => {
    expect(
      normalizePdpImageUrl(
        'https://www.drjart.com/media/export/cms/products/1000x1000/dj_sku_H7T901_1000x1000_0.jpg',
      ),
    ).toBe(
      'https://www.drjart.com/media/export/cms/products/1000x1000/dj_sku_H7T901_1000x1000_0.jpg',
    );
  });

  it('keeps Guerlain Demandware product media on the official remote host instead of routing through the local proxy', () => {
    expect(
      normalizePdpImageUrl(
        'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png?sw=655&sh=655',
      ),
    ).toBe(
      'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png?sw=655&sh=655',
    );
  });

  it('adds square Demandware width hints for Guerlain product media without overriding existing sizing', () => {
    expect(
      applyKnownHostWidthHint(
        'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png',
        720,
      ),
    ).toBe(
      'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png?sw=720&sh=720',
    );

    expect(
      applyKnownHostWidthHint(
        'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png?sw=655&sh=655',
        720,
      ),
    ).toBe(
      'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw6179c233/ABR_YEUX_15ML_F24_G061758_E01_hi-res.png?sw=655&sh=655',
    );
  });

  it('keeps Guerlain Demandware product media on the Next image optimizer path', () => {
    expect(
      shouldBypassNextImageOptimizer(
        'https://www.guerlain.com/dw/image/v2/BDCZ_PRD/on/demandware.static/-/Sites-GSA_master_catalog/default/dw0da3bbae/01-ProductsViewer/P062209/P062209_G062209_E01_hi-res.png?sw=655&sh=655',
      ),
    ).toBe(false);

    expect(
      shouldBypassNextImageOptimizer(
        'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/tf_sku_TC7Y09_3000x3000_4.jpg',
      ),
    ).toBe(false);
  });

  it('bypasses the Next image optimizer for Pivota catalog image cache assets', () => {
    expect(
      shouldBypassNextImageOptimizer(
        'https://pivota-agent-production.up.railway.app/catalog-image-cache/4f/4f5867bf9011ada573a9d7ed588a76f63617aa39828d962deeeef0a82d512d92.avif',
      ),
    ).toBe(true);
  });
});
