import React from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TrackPage from './page'

const replaceMock = vi.fn()
const publicOrderResumeMock = vi.fn()
const publicOrderTrackMock = vi.fn()
const normalizeOrderDetailMock = vi.fn()

let searchParamsValue = 'orderId=ORD_TRACK_1&email=buyer@example.com'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => new URLSearchParams(searchParamsValue),
}))

vi.mock('next/image', () => ({
  default: (props: any) => <img {...props} alt={props.alt || ''} />,
}))

vi.mock('next/link', () => ({
  default: (props: any) => <a href={props.href}>{props.children}</a>,
}))

vi.mock('@/lib/api', () => ({
  publicOrderResume: (...args: unknown[]) => publicOrderResumeMock(...args),
  publicOrderTrack: (...args: unknown[]) => publicOrderTrackMock(...args),
}))

vi.mock('@/lib/orders/normalize', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders/normalize')>(
    '@/lib/orders/normalize',
  )
  return {
    ...actual,
    normalizeOrderDetail: (...args: unknown[]) => normalizeOrderDetailMock(...args),
  }
})

describe('Public order tracking pricing', () => {
  beforeEach(() => {
    searchParamsValue = 'orderId=ORD_TRACK_1&email=buyer@example.com'
    replaceMock.mockReset()
    publicOrderResumeMock.mockReset()
    publicOrderTrackMock.mockReset()
    normalizeOrderDetailMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('prefers pricing_quote pricing when normalized amounts are empty', async () => {
    publicOrderResumeMock.mockResolvedValue({
      order: {
        order_id: 'ORD_TRACK_1',
        currency: 'USD',
        status: 'refunded',
        created_at: '2026-04-21T18:58:43Z',
      },
      items: [
        {
          title: 'Winona Soothing Repair Serum',
          quantity: 1,
        },
      ],
      pricing_quote: {
        quote_id: 'q_track_1',
        currency: 'USD',
        pricing: {
          subtotal: '1.69',
          discount_total: '0.16',
          shipping_fee: '8.00',
          tax: '0.00',
          total: '9.53',
        },
      },
      customer: {
        masked_email: 'j***s@chydan.com',
      },
    })

    normalizeOrderDetailMock.mockReturnValue({
      id: 'ORD_TRACK_1',
      merchantId: 'merch_1',
      currency: 'USD',
      totalAmountMinor: 953,
      amounts: {
        subtotalMinor: 0,
        discountTotalMinor: 0,
        shippingFeeMinor: 0,
        taxMinor: 0,
        totalAmountMinor: 953,
      },
      status: 'refunded',
      paymentStatus: 'paid',
      fulfillmentStatus: '',
      deliveryStatus: '',
      createdAt: '2026-04-21T18:58:43Z',
      updatedAt: '2026-04-22T07:59:17Z',
      items: [
        {
          id: 'item_1',
          productId: 'prod_1',
          merchantId: 'merch_1',
          title: 'Winona Soothing Repair Serum',
          quantity: 1,
          unitPriceMinor: 169,
          subtotalMinor: 169,
          sku: null,
          imageUrl: null,
          optionsText: null,
        },
      ],
      shippingAddress: {
        name: null,
        addressLine1: null,
        addressLine2: null,
        city: 'San Francisco',
        province: null,
        country: 'US',
        postalCode: null,
        phone: null,
      },
      paymentRecords: [],
      shipments: [],
      refund: {
        status: 'refunded',
        caseId: null,
        updatedAt: '2026-04-22T07:59:17Z',
        totalRefundedMinor: 953,
        currency: 'USD',
        requestsCount: 0,
        requests: [],
        psp: {
          provider: 'stripe',
          latest: {
            provider: 'stripe',
            refundId: 're_test_1',
            status: 'succeeded',
            amountMinor: 953,
            currency: 'USD',
            paymentIntentId: 'pi_test_1',
            destinationType: 'card',
            destinationEntryType: null,
            isReversal: false,
            reference: null,
            referenceStatus: 'pending',
            referenceType: 'acquirer_reference_number',
            trackingReferenceKind: 'ARN',
            pendingReason: null,
            failureReason: null,
            sourceEvent: 'refund.updated',
            observedAt: '2026-04-22T07:59:17Z',
          },
          history: [],
        },
      },
      permissions: {
        canPay: false,
        canCancel: false,
        canReorder: false,
      },
    })

    publicOrderTrackMock.mockResolvedValue({
      timeline: [],
    })

    render(<TrackPage />)

    await waitFor(() => {
      expect(screen.getByText('Subtotal')).toBeInTheDocument()
    })

    expect(screen.getByText('$1.69')).toBeInTheDocument()
    expect(screen.getByText('-$0.16')).toBeInTheDocument()
    expect(screen.getByText('$8.00')).toBeInTheDocument()
    expect(screen.getAllByText('$9.53').length).toBeGreaterThan(0)
    expect(screen.getByText('Processor status')).toBeInTheDocument()
    expect(screen.getByText('ARN pending')).toBeInTheDocument()
  })
})
