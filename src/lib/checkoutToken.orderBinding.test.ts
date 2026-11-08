import { beforeEach, describe, expect, it } from 'vitest'
import {
  decodeCheckoutTokenClaims,
  getCheckoutContextForOrder,
  isCheckoutTokenBoundToOrder,
  persistCheckoutContext,
  rememberCheckoutTokenOrder,
} from './checkoutToken'

// Shaped like pivota-backend mint_checkout_token: `v1.<base64url JSON claims>.<signature>`.
function mintToken(claims: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(claims)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `v1.${b64}.${'s'.repeat(43)}`
}

const RESUME_TOKEN = mintToken({ agent_id: 'agent_a', intent_id: 'ci_resume', order_id: 'ORD_1' })
const PAGE_TOKEN = mintToken({ agent_id: 'agent_a', intent_id: 'ci_page' })
const OTHER_TOKEN = mintToken({ agent_id: 'agent_a', intent_id: 'ci_other' })

describe('checkout token order binding', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('decodes the claims of a minted token and nothing else', () => {
    expect(decodeCheckoutTokenClaims(RESUME_TOKEN)).toMatchObject({ intent_id: 'ci_resume', order_id: 'ORD_1' })
    expect(decodeCheckoutTokenClaims('tok_opaque')).toBeNull()
    expect(decodeCheckoutTokenClaims('v1.!!!.sig')).toBeNull()
    expect(decodeCheckoutTokenClaims(null)).toBeNull()
  })

  it('a token minted for an order is bound to that order only', () => {
    expect(isCheckoutTokenBoundToOrder(RESUME_TOKEN, 'ORD_1')).toBe(true)
    expect(isCheckoutTokenBoundToOrder(RESUME_TOKEN, 'ORD_2')).toBe(false)
    expect(isCheckoutTokenBoundToOrder(RESUME_TOKEN, '')).toBe(false)
  })

  it('an order created under a token is bound to it through the token intent', () => {
    expect(isCheckoutTokenBoundToOrder(PAGE_TOKEN, 'ORD_9')).toBe(false)
    rememberCheckoutTokenOrder(PAGE_TOKEN, 'ORD_9')
    expect(isCheckoutTokenBoundToOrder(PAGE_TOKEN, 'ORD_9')).toBe(true)
    // Another intent's token does not inherit the binding, and the order binds nothing else.
    expect(isCheckoutTokenBoundToOrder(OTHER_TOKEN, 'ORD_9')).toBe(false)
    expect(isCheckoutTokenBoundToOrder(PAGE_TOKEN, 'ORD_10')).toBe(false)
  })

  it('an opaque token is never treated as bound', () => {
    rememberCheckoutTokenOrder('tok_opaque', 'ORD_9')
    expect(isCheckoutTokenBoundToOrder('tok_opaque', 'ORD_9')).toBe(false)
  })

  it('remembers a bounded number of bindings', () => {
    for (let i = 0; i < 30; i += 1) rememberCheckoutTokenOrder(PAGE_TOKEN, `ORD_${i}`)
    expect(isCheckoutTokenBoundToOrder(PAGE_TOKEN, 'ORD_29')).toBe(true)
    expect(isCheckoutTokenBoundToOrder(PAGE_TOKEN, 'ORD_0')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem('pivota_checkout_token_orders') || '[]')).toHaveLength(20)
  })

  it('drops a stored token that is not bound to the resumed order, from the page and from storage', () => {
    persistCheckoutContext({ token: OTHER_TOKEN, source: 'creator_agent' })

    expect(getCheckoutContextForOrder('ORD_1', '?orderId=ORD_1')).toEqual({
      token: null,
      source: 'creator_agent',
    })
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBeNull()
    expect(window.localStorage.getItem('pivota_checkout_token')).toBeNull()
    expect(window.localStorage.getItem('pivota_checkout_source')).toBe('creator_agent')
  })

  it('keeps a stored token that is bound to the resumed order', () => {
    persistCheckoutContext({ token: RESUME_TOKEN, source: 'creator_agent' })
    expect(getCheckoutContextForOrder('ORD_1', '?orderId=ORD_1')).toEqual({
      token: RESUME_TOKEN,
      source: 'creator_agent',
    })
    expect(window.localStorage.getItem('pivota_checkout_token')).toBe(RESUME_TOKEN)
  })

  it('drops a query token that is for another order too', () => {
    const got = getCheckoutContextForOrder('ORD_2', `?orderId=ORD_2&checkout_token=${encodeURIComponent(RESUME_TOKEN)}`)
    expect(got.token).toBeNull()
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBeNull()
  })
})
