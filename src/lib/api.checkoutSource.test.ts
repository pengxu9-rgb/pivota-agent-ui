import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ensureAuroraSessionMock = vi.fn()
const shouldUseAuroraAutoExchangeMock = vi.fn()

vi.mock('@/lib/auroraOrdersAuth', () => ({
  ensureAuroraSession: (...args: unknown[]) => ensureAuroraSessionMock(...args),
  shouldUseAuroraAutoExchange: (...args: unknown[]) => shouldUseAuroraAutoExchangeMock(...args),
}))

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

describe('checkout source propagation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    window.sessionStorage.clear()
    window.localStorage.clear()
    shouldUseAuroraAutoExchangeMock.mockReturnValue(true)
    ensureAuroraSessionMock.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('keeps creator_agent through persisted checkout context on direct invoke', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DIRECT_CHECKOUT_INVOKE', 'true')
    vi.stubEnv(
      'NEXT_PUBLIC_DIRECT_CHECKOUT_INVOKE_URL',
      'https://direct.example.com/agent/shop/v1/invoke',
    )

    const checkoutTokenModule = await import('@/lib/checkoutToken')
    checkoutTokenModule.getCheckoutContextFromBrowser(
      '?checkout_token=tok_creator_123&source=creator_agent',
    )
    window.history.replaceState({}, '', '/order')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ quote_id: 'quote_direct_123', pricing: { total: 24 }, currency: 'USD' }),
    )

    const { previewQuote } = await import('@/lib/api')
    await previewQuote({
      merchant_id: 'merchant_creator',
      items: [{ product_id: 'prod_123', variant_id: 'var_123', quantity: 1 }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://direct.example.com/agent/shop/v1/invoke')
    expect((init.headers as Record<string, string>)['X-Checkout-Token']).toBe('tok_creator_123')
    const body = JSON.parse(String(init.body || '{}'))
    expect(body.metadata).toMatchObject({
      source: 'creator_agent',
      ui_source: 'shopping-agent-ui',
    })
  })

  it('preserves creator_agent on proxy fallback after direct invoke is rejected', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DIRECT_CHECKOUT_INVOKE', 'true')
    vi.stubEnv(
      'NEXT_PUBLIC_DIRECT_CHECKOUT_INVOKE_URL',
      'https://direct.example.com/agent/shop/v1/invoke',
    )

    const checkoutTokenModule = await import('@/lib/checkoutToken')
    checkoutTokenModule.persistCheckoutContext({
      token: 'tok_creator_456',
      source: 'creator_agent',
    })

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'FORBIDDEN' }, 403))
      .mockResolvedValueOnce(
        jsonResponse({ quote_id: 'quote_proxy_123', pricing: { total: 24 }, currency: 'USD' }),
      )

    const { previewQuote } = await import('@/lib/api')
    await previewQuote({
      merchant_id: 'merchant_creator',
      items: [{ product_id: 'prod_456', variant_id: 'var_456', quantity: 1 }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [directUrl] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [proxyUrl, proxyInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(directUrl).toBe('https://direct.example.com/agent/shop/v1/invoke')
    expect(proxyUrl).toBe('/api/gateway')
    const proxyBody = JSON.parse(String(proxyInit.body || '{}'))
    expect(proxyBody.metadata).toMatchObject({
      source: 'creator_agent',
      ui_source: 'shopping-agent-ui',
    })
  })

  it('canonicalizes create_order metadata for creator checkout tokens on proxy requests', async () => {
    const checkoutTokenModule = await import('@/lib/checkoutToken')
    checkoutTokenModule.persistCheckoutContext({
      token: 'tok_creator_order_123',
      source: 'creator_agent',
    })

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ order_id: 'ord_creator_123', status: 'pending' }),
    )

    const { createOrder } = await import('@/lib/api')
    await createOrder({
      merchant_id: 'merchant_creator',
      customer_email: 'buyer@example.com',
      currency: 'USD',
      items: [
        {
          merchant_id: 'merchant_creator',
          product_id: 'prod_creator_123',
          product_title: 'Creator lounge set',
          variant_id: 'var_creator_123',
          quantity: 1,
          unit_price: 24,
          subtotal: 24,
        },
      ],
      shipping_address: {
        name: 'Buyer Example',
        address_line1: '123 Market St',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postal_code: '94107',
      },
      metadata: {
        source: 'checkout_ui',
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/gateway')
    expect((init.headers as Record<string, string>)['X-Checkout-Token']).toBe('tok_creator_order_123')

    const body = JSON.parse(String(init.body || '{}'))
    expect(body.metadata).toMatchObject({
      source: 'creator_agent',
      ui_source: 'shopping-agent-ui',
    })
    expect(body.payload?.order?.metadata).toMatchObject({
      source: 'creator_agent',
      ui_source: 'checkout_ui',
    })
  })

  it('keeps shopping_agent for native hosted checkout flows', async () => {
    window.history.replaceState({}, '', '/order')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ quote_id: 'quote_shop_123', pricing: { total: 19 }, currency: 'USD' }),
    )

    const { previewQuote } = await import('@/lib/api')
    await previewQuote({
      merchant_id: 'merchant_shop',
      items: [{ product_id: 'prod_shop', variant_id: 'var_shop', quantity: 1 }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/gateway')
    const body = JSON.parse(String(init.body || '{}'))
    expect(body.metadata).toMatchObject({
      source: 'shopping_agent',
      ui_source: 'shopping-agent-ui',
    })
  })

  it('maps raw checkout token/source mismatch responses to a restartable creator error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(
        {
          error: 'FORBIDDEN',
          message:
            'checkout token agent mismatch: creator_agent token cannot be used with shopping_agent',
          operation: 'preview_quote',
        },
        403,
      ),
    )

    const checkoutTokenModule = await import('@/lib/checkoutToken')
    checkoutTokenModule.persistCheckoutContext({
      token: 'tok_creator_restart',
      source: 'creator_agent',
    })

    const { previewQuote } = await import('@/lib/api')

    await expect(
      previewQuote({
        merchant_id: 'merchant_creator',
        items: [{ product_id: 'prod_restart', variant_id: 'var_restart', quantity: 1 }],
      }),
    ).rejects.toMatchObject({
      code: 'CHECKOUT_RESTART_REQUIRED',
      message:
        'This checkout link is invalid or expired. Please restart from the creator entrypoint to continue.',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
