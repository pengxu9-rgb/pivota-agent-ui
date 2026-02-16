import { beforeEach, describe, expect, it } from 'vitest'
import { getCheckoutTokenFromBrowser, persistCheckoutToken } from './checkoutToken'

describe('checkoutToken helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('uses query token and persists to both storages', () => {
    const token = 'v1.query.payload'
    const got = getCheckoutTokenFromBrowser(`?checkout_token=${encodeURIComponent(token)}`)

    expect(got).toBe(token)
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBe(token)
    expect(window.localStorage.getItem('pivota_checkout_token')).toBe(token)
  })

  it('falls back to localStorage and backfills sessionStorage', () => {
    const token = 'v1.local.payload'
    window.localStorage.setItem('pivota_checkout_token', token)

    const got = getCheckoutTokenFromBrowser('')

    expect(got).toBe(token)
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBe(token)
  })

  it('ignores empty tokens', () => {
    const got = persistCheckoutToken('   ')

    expect(got).toBeNull()
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBeNull()
    expect(window.localStorage.getItem('pivota_checkout_token')).toBeNull()
  })
})
