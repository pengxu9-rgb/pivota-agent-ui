import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// An order created under a checkout token is bound to that token's intent by the backend; createOrder
// records it so the resume entry for that order keeps the token (checkoutToken.isCheckoutTokenBoundToOrder).

vi.mock('@/lib/auroraOrdersAuth', () => ({
  ensureAuroraSession: vi.fn().mockResolvedValue({ ok: true }),
  shouldUseAuroraAutoExchange: vi.fn().mockReturnValue(false),
}))

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function mintToken(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `v1.${b64}.${'s'.repeat(43)}`
}

const ORDER = {
  merchant_id: 'merch_1',
  customer_email: 'buyer@example.com',
  items: [
    {
      merchant_id: 'merch_1',
      product_id: 'prod_1',
      product_title: 'Item',
      quantity: 1,
      unit_price: 10,
      subtotal: 10,
    },
  ],
  shipping_address: {
    name: 'Buyer',
    address_line1: '1 Main St',
    city: 'SF',
    country: 'US',
    postal_code: '94105',
  },
}

describe('createOrder under a checkout token', () => {
  beforeEach(() => {
    vi.resetModules()
    window.sessionStorage.clear()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/order')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the created order as bound to the token', async () => {
    const token = mintToken({ agent_id: 'agent_a', intent_id: 'ci_page' })
    const checkoutTokenModule = await import('@/lib/checkoutToken')
    checkoutTokenModule.persistCheckoutContext({ token, source: 'creator_agent' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ order_id: 'ORD_NEW_1' }))

    const { createOrder } = await import('@/lib/api')
    await createOrder(ORDER)

    expect(checkoutTokenModule.isCheckoutTokenBoundToOrder(token, 'ORD_NEW_1')).toBe(true)
    expect(checkoutTokenModule.isCheckoutTokenBoundToOrder(token, 'ORD_OTHER')).toBe(false)
  })

  it('records nothing without a token', async () => {
    const checkoutTokenModule = await import('@/lib/checkoutToken')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ order_id: 'ORD_NEW_2' }))

    const { createOrder } = await import('@/lib/api')
    await createOrder(ORDER)

    expect(window.localStorage.getItem('pivota_checkout_token_orders')).toBeNull()
    expect(checkoutTokenModule.isCheckoutTokenBoundToOrder(null, 'ORD_NEW_2')).toBe(false)
  })
})
