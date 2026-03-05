import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearAuroraOrdersScopeHint,
  readAuroraOrdersScopeHint,
  writeAuroraOrdersScopeHint,
} from './scopeHint'

describe('aurora orders scope hint', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns null when no hint is stored', () => {
    expect(readAuroraOrdersScopeHint()).toBeNull()
  })

  it('writes and reads a valid merchant hint', () => {
    writeAuroraOrdersScopeHint('merchant_aurora')
    expect(readAuroraOrdersScopeHint()).toBe('merchant_aurora')
  })

  it('ignores expired hints', () => {
    window.localStorage.setItem(
      'aurora_orders_scope_hint_v1',
      JSON.stringify({
        merchantId: 'merchant_aurora',
        savedAt: Date.now() - 7 * 60 * 60 * 1000,
      }),
    )
    expect(readAuroraOrdersScopeHint()).toBeNull()
  })

  it('clears hint explicitly', () => {
    writeAuroraOrdersScopeHint('merchant_aurora')
    clearAuroraOrdersScopeHint()
    expect(readAuroraOrdersScopeHint()).toBeNull()
  })
})
