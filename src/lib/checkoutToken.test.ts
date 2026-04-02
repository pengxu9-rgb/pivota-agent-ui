import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCheckoutContextFromBrowser,
  getCheckoutSourceFromBrowser,
  getCheckoutTokenFromBrowser,
  persistCheckoutContext,
  persistCheckoutToken,
} from './checkoutToken'

describe('checkoutToken helpers', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('uses query token/source and persists both to both storages', () => {
    const token = 'v1.query.payload'
    const got = getCheckoutContextFromBrowser(
      `?checkout_token=${encodeURIComponent(token)}&source=creator_agent`,
    )

    expect(got).toEqual({
      token,
      source: 'creator_agent',
    })
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBe(token)
    expect(window.localStorage.getItem('pivota_checkout_token')).toBe(token)
    expect(window.sessionStorage.getItem('pivota_checkout_source')).toBe('creator_agent')
    expect(window.localStorage.getItem('pivota_checkout_source')).toBe('creator_agent')
  })

  it('falls back to localStorage and backfills sessionStorage for token and source', () => {
    const token = 'v1.local.payload'
    window.localStorage.setItem('pivota_checkout_token', token)
    window.localStorage.setItem('pivota_checkout_source', 'creator_agent')

    const got = getCheckoutContextFromBrowser('')

    expect(got).toEqual({
      token,
      source: 'creator_agent',
    })
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBe(token)
    expect(window.sessionStorage.getItem('pivota_checkout_source')).toBe('creator_agent')
  })

  it('ignores empty tokens', () => {
    const got = persistCheckoutToken('   ')

    expect(got).toBeNull()
    expect(window.sessionStorage.getItem('pivota_checkout_token')).toBeNull()
    expect(window.localStorage.getItem('pivota_checkout_token')).toBeNull()
  })

  it('clears stale source when a new query token arrives without creator context', () => {
    persistCheckoutContext({
      token: 'v1.old.payload',
      source: 'creator_agent',
    })

    const got = getCheckoutContextFromBrowser('?checkout_token=v1.new.payload')

    expect(got).toEqual({
      token: 'v1.new.payload',
      source: null,
    })
    expect(getCheckoutSourceFromBrowser('')).toBeNull()
  })

  it('keeps creator source after navigation once it has been persisted', () => {
    getCheckoutContextFromBrowser('?checkout_token=v1.creator.payload&source=creator_agent')

    window.history.replaceState({}, '', '/order')

    expect(getCheckoutTokenFromBrowser('')).toBe('v1.creator.payload')
    expect(getCheckoutSourceFromBrowser('')).toBe('creator_agent')
  })
})
