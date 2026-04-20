import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('direct Agent read routing', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('routes get_pdp_v2 directly to Agent when a public Agent key is configured', async () => {
    const agentKey = `dummy_public_agent_key_${'a'.repeat(24)}`;
    vi.stubEnv('NEXT_PUBLIC_AGENT_API_KEY', agentKey);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'success',
        modules: [],
      }),
    );

    const { getPdpV2 } = await import('./api');

    await getPdpV2({
      product_id: 'prod_123',
      merchant_id: 'merch_123',
      include: ['offers'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke');
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${agentKey}`,
        'X-Agent-API-Key': agentKey,
      }),
    );
  });

  it('falls back to the same-origin proxy when direct Agent auth is rejected', async () => {
    vi.stubEnv('NEXT_PUBLIC_AGENT_API_KEY', `dummy_public_agent_key_${'b'.repeat(24)}`);

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'UNAUTHORIZED' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'success',
          modules: [],
        }),
      );

    const { getPdpV2 } = await import('./api');

    await getPdpV2({
      product_id: 'prod_123',
      merchant_id: 'merch_123',
      include: ['offers'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke',
    );
    expect(fetchMock.mock.calls[1][0]).toBe('/api/gateway');
  });

  it('keeps checkout-token requests on the same-origin proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_AGENT_API_KEY', `dummy_public_agent_key_${'c'.repeat(24)}`);
    window.localStorage.setItem('pivota_checkout_token', 'checkout_token_123');
    window.localStorage.setItem('pivota_checkout_source', 'creator_agent');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 'success',
        modules: [],
      }),
    );

    const { getPdpV2 } = await import('./api');

    await getPdpV2({
      product_id: 'prod_123',
      merchant_id: 'merch_123',
      include: ['offers'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/gateway');
    expect(init.headers).toEqual(
      expect.objectContaining({
        'X-Checkout-Token': 'checkout_token_123',
      }),
    );
  });
});
