import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('/api/checkout/session legacy route', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('logs legacy hits and tags the response header while proxying upstream', async () => {
    vi.stubEnv('PIVOTA_BACKEND_BASE_URL', 'https://checkout.example.com')
    vi.stubEnv('AGENT_API_KEY', 'ak_test_legacy_checkout')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ checkout_token: 'tok_legacy_123' }),
    )
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { POST } = await import('@/app/api/checkout/session/route')

    const req = new Request('http://localhost/api/checkout/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        referer: 'https://agent.pivota.cc/order',
        origin: 'https://agent.pivota.cc',
        'user-agent': 'vitest',
      },
      body: JSON.stringify({
        items: [
          {
            product_id: 'prod_123',
            merchant_id: 'merchant_123',
            variant_id: 'var_123',
            quantity: 1,
          },
        ],
        source: 'shopping_agent',
        return_url: 'https://agent.pivota.cc/order/success?orderId=ord_123',
      }),
    })

    const res = await POST(req as any)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(res.headers.get('x-pivota-legacy-route')).toBe('checkout-session')
    expect(data).toMatchObject({ checkout_token: 'tok_legacy_123' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledWith(
      '[shopping][legacy-checkout-session-hit]',
      expect.objectContaining({
        route: '/api/checkout/session',
        item_count: 1,
        source: 'shopping_agent',
        has_return_url: true,
        referer: 'https://agent.pivota.cc/order',
        origin: 'https://agent.pivota.cc',
      }),
    )
  })
})
