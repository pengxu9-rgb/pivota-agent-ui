import { afterEach, describe, expect, it } from 'vitest'
import {
  buildOrderDetailHref,
  buildOrderItemPdpHref,
  buildOrderListHref,
  resolveAuroraOrderScope,
} from './navigationContext'

const ORIGIN = 'https://agent.pivota.cc'
const ORIGINAL_AURORA_SCOPE = process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID

afterEach(() => {
  if (typeof ORIGINAL_AURORA_SCOPE === 'string') {
    process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID = ORIGINAL_AURORA_SCOPE
  } else {
    delete process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID
  }
})

describe('resolveAuroraOrderScope', () => {
  it('uses env merchant when aurora entry is present and query merchant is missing', () => {
    process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID = 'merchant_env'
    const searchParams = new URLSearchParams('entry=aurora_chatbox&embed=1')

    expect(resolveAuroraOrderScope(searchParams, 'merchant_active')).toBe('merchant_env')
  })

  it('query merchant_id overrides env merchant', () => {
    process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID = 'merchant_env'
    const searchParams = new URLSearchParams('entry=aurora_chatbox&merchant_id=merchant_query')

    expect(resolveAuroraOrderScope(searchParams, 'merchant_active')).toBe('merchant_query')
  })

  it('does not inject merchant filtering for non-aurora entry', () => {
    process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID = 'merchant_env'
    const searchParams = new URLSearchParams('entry=shopping_agent&embed=1')

    expect(resolveAuroraOrderScope(searchParams, 'merchant_active')).toBeNull()
    const listHref = buildOrderListHref(searchParams)
    const parsed = new URL(listHref, ORIGIN)
    expect(parsed.searchParams.get('merchant_id')).toBeNull()
  })
})

describe('order navigation href builders', () => {
  it('includes return and passthrough params for detail and pdp links', () => {
    process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID = 'merchant_env'
    const searchParams = new URLSearchParams({
      embed: '1',
      entry: 'aurora_chatbox',
      parent_origin: 'https://aurora.pivota.cc',
      aurora_uid: 'aurora_uid_1',
      lang: 'zh-CN',
      source: 'aurora_orders',
    })

    const detailHref = buildOrderDetailHref(
      'ord_123',
      searchParams,
      '/my-orders?embed=1&entry=aurora_chatbox',
    )
    const detailParsed = new URL(detailHref, ORIGIN)
    expect(detailParsed.pathname).toBe('/orders/ord_123')
    expect(detailParsed.searchParams.get('return')).toBe('/my-orders?embed=1&entry=aurora_chatbox')
    expect(detailParsed.searchParams.get('embed')).toBe('1')
    expect(detailParsed.searchParams.get('entry')).toBe('aurora_chatbox')
    expect(detailParsed.searchParams.get('parent_origin')).toBe('https://aurora.pivota.cc')
    expect(detailParsed.searchParams.get('aurora_uid')).toBe('aurora_uid_1')
    expect(detailParsed.searchParams.get('lang')).toBe('zh-CN')
    expect(detailParsed.searchParams.get('source')).toBe('aurora_orders')
    expect(detailParsed.searchParams.get('merchant_id')).toBe('merchant_env')

    const pdpHref = buildOrderItemPdpHref(
      'prod_456',
      'merchant_item',
      searchParams,
      '/orders/ord_123?embed=1&entry=aurora_chatbox',
    )
    const pdpParsed = new URL(pdpHref, ORIGIN)
    expect(pdpParsed.pathname).toBe('/products/prod_456')
    expect(pdpParsed.searchParams.get('return')).toBe('/orders/ord_123?embed=1&entry=aurora_chatbox')
    expect(pdpParsed.searchParams.get('embed')).toBe('1')
    expect(pdpParsed.searchParams.get('entry')).toBe('aurora_chatbox')
    expect(pdpParsed.searchParams.get('parent_origin')).toBe('https://aurora.pivota.cc')
    expect(pdpParsed.searchParams.get('aurora_uid')).toBe('aurora_uid_1')
    expect(pdpParsed.searchParams.get('lang')).toBe('zh-CN')
    expect(pdpParsed.searchParams.get('source')).toBe('aurora_orders')
    expect(pdpParsed.searchParams.get('merchant_id')).toBe('merchant_item')
  })
})
