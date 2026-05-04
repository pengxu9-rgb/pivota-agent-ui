import { describe, expect, it } from 'vitest';
import { POST } from './route';

describe('internal indexing request helper', () => {
  it('prepares the canonical PDP URL for manual Search Console submission', async () => {
    const response = await POST(
      new Request('https://agent.pivota.cc/api/internal/indexing/request', {
        method: 'POST',
        body: JSON.stringify({
          product_entity_id: 'sig_7ad40676c42fb9c96e2a8136',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      message: 'Use Google Search Console URL Inspection to request indexing',
      url: 'https://agent.pivota.cc/products/sig_7ad40676c42fb9c96e2a8136',
    });
  });

  it('rejects external seed aliases', async () => {
    const response = await POST(
      new Request('https://agent.pivota.cc/api/internal/indexing/request', {
        method: 'POST',
        body: JSON.stringify({
          product_entity_id: 'ext_d7c74bcb380cbc2bdd5d5d90',
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
