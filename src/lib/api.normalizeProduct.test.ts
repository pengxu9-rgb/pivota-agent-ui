import { describe, expect, it } from 'vitest';

import { normalizeProduct } from './api';

describe('normalizeProduct', () => {
  it('strips HTML tags from descriptions before product cards consume them', () => {
    const normalized = normalizeProduct({
      product_id: 'ext_1',
      merchant_id: 'external_seed',
      title: 'External serum',
      price: { amount: 28, currency: 'USD' },
      image_url: 'https://example.com/serum.png',
      description:
        '<p>Barrier support <strong>serum</strong></p><ul><li>Niacinamide</li><li>Panthenol</li></ul>',
    } as any);

    expect(normalized.description).not.toContain('<p>');
    expect(normalized.description).not.toContain('<strong>');
    expect(normalized.description).toContain('Barrier support serum');
    expect(normalized.description).toContain('Niacinamide');
    expect(normalized.description).toContain('Panthenol');
  });
});
