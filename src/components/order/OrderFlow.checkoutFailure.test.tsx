import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrderFlow from './OrderFlow'

const previewQuoteMock = vi.fn()
const createOrderMock = vi.fn()
const processPaymentMock = vi.fn()
const confirmOrderPaymentMock = vi.fn()
const getMerchantIdMock = vi.fn()
const pushMock = vi.fn()
const backMock = vi.fn()
const toastErrorMock = vi.fn()
const toastMessageMock = vi.fn()
const toastSuccessMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => <div data-testid="card-element" />,
  useStripe: () => null,
  useElements: () => null,
}))

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: () => Promise.resolve(null),
}))

vi.mock('@/lib/api', () => ({
  createOrder: (...args: unknown[]) => createOrderMock(...args),
  processPayment: (...args: unknown[]) => processPaymentMock(...args),
  getMerchantId: (...args: unknown[]) => getMerchantIdMock(...args),
  accountsLogin: vi.fn(),
  accountsLoginWithPassword: vi.fn(),
  accountsVerify: vi.fn(),
  previewQuote: (...args: unknown[]) => previewQuoteMock(...args),
  confirmOrderPayment: (...args: unknown[]) => confirmOrderPaymentMock(...args),
}))

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (state: { clearCart: () => void }) => unknown) =>
    selector({ clearCart: vi.fn() }),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    user: null,
    setSession: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    message: (...args: unknown[]) => toastMessageMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}))

describe('OrderFlow checkout restart state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMerchantIdMock.mockReturnValue('merchant_checkout')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response)
  })

  it('renders a recoverable restart state instead of leaking raw mismatch text', async () => {
    const mismatchError = new Error(
      'This checkout link is invalid or expired. Please restart from the creator entrypoint to continue.',
    ) as Error & { code?: string }
    mismatchError.code = 'CHECKOUT_RESTART_REQUIRED'
    previewQuoteMock.mockRejectedValueOnce(mismatchError)

    const onCancel = vi.fn()

    const { container } = render(
      <OrderFlow
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Creator serum',
            quantity: 1,
            unit_price: 24,
            currency: 'USD',
          },
        ]}
        onCancel={onCancel}
        skipEmailVerification
        checkoutToken="tok_creator_123"
      />,
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
      target: { value: 'Buyer One' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement, {
      target: { value: '123 Market St' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement, {
      target: { value: 'San Francisco' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement, {
      target: { value: '94107' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    expect(
      await screen.findByText('Checkout needs to be restarted'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'This checkout link is invalid or expired. Please restart from the creator entrypoint to continue.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/token cannot be used with shopping_agent/i),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /restart checkout/i }))

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  it('passes UI provenance without overriding checkout source in create_order metadata', async () => {
    previewQuoteMock.mockResolvedValueOnce({
      quote_id: 'quote_123',
      currency: 'USD',
      pricing: {
        subtotal: 24,
        shipping_fee: 0,
        tax: 0,
        total: 24,
      },
      line_items: [
        {
          variant_id: 'var_123',
          unit_price_effective: 24,
        },
      ],
      delivery_options: [],
    })
    createOrderMock.mockRejectedValueOnce(new Error('stop after payload capture'))

    const { container } = render(
      <OrderFlow
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Creator serum',
            quantity: 1,
            unit_price: 24,
            currency: 'USD',
          },
        ]}
        skipEmailVerification
        checkoutToken="tok_creator_123"
      />,
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
      target: { value: 'Buyer One' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement, {
      target: { value: '123 Market St' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement, {
      target: { value: 'San Francisco' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement, {
      target: { value: '94107' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    await waitFor(() => {
      expect(createOrderMock).toHaveBeenCalledTimes(1)
    })

    const orderPayload = createOrderMock.mock.calls[0]?.[0] as Record<string, any>
    expect(orderPayload?.metadata).toMatchObject({
      ui_source: 'checkout_ui',
    })
    expect(orderPayload?.metadata?.source).toBeUndefined()
  })

  it('blocks unsupported pivota hosted checkout payment surfaces', async () => {
    previewQuoteMock.mockResolvedValueOnce({
      quote_id: 'quote_123',
      currency: 'USD',
      pricing: {
        subtotal: 24,
        shipping_fee: 0,
        tax: 0,
        total: 24,
      },
      line_items: [
        {
          variant_id: 'var_123',
          unit_price_effective: 24,
        },
      ],
      delivery_options: [],
    })
    createOrderMock.mockResolvedValueOnce({
      order_id: 'ord_123',
    })
    processPaymentMock.mockResolvedValueOnce({
      status: 'requires_action',
      psp: 'pivota_hosted_checkout',
      payment_action: {
        type: 'redirect_url',
        url: 'https://checkout.example.com/session/csess_123',
      },
    })

    const { container } = render(
      <OrderFlow
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Creator serum',
            quantity: 1,
            unit_price: 24,
            currency: 'USD',
          },
        ]}
        skipEmailVerification
      />,
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
      target: { value: 'Buyer One' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement, {
      target: { value: '123 Market St' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement, {
      target: { value: 'San Francisco' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement, {
      target: { value: '94107' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    expect(
      await screen.findByText(
        'Merchant checkout must render the merchant PSP payment form. Pivota hosted checkout is disabled.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Pivota hosted checkout')).not.toBeInTheDocument()
  })

  it('reuses create_order redirect actions instead of calling submit_payment again', async () => {
    previewQuoteMock.mockResolvedValueOnce({
      quote_id: 'quote_123',
      currency: 'USD',
      pricing: {
        subtotal: 24,
        shipping_fee: 0,
        tax: 0,
        total: 24,
      },
      line_items: [
        {
          variant_id: 'var_123',
          unit_price_effective: 24,
        },
      ],
      delivery_options: [],
    })
    createOrderMock.mockResolvedValueOnce({
      order_id: 'ord_redirect_123',
      payment_action: {
        type: 'redirect_url',
        url: 'https://merchant.example.com/checkout/session_123',
      },
      payment: {
        psp: 'checkout',
      },
      psp: 'checkout',
    })

    const { container } = render(
      <OrderFlow
        items={[
          {
            product_id: 'prod_123',
            variant_id: 'var_123',
            merchant_id: 'merchant_checkout',
            title: 'Creator serum',
            quantity: 1,
            unit_price: 24,
            currency: 'USD',
          },
        ]}
        skipEmailVerification
      />,
    )

    fireEvent.change(container.querySelector('input[type="email"]') as HTMLInputElement, {
      target: { value: 'buyer@example.com' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="name"]') as HTMLInputElement, {
      target: { value: 'Buyer One' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-line1"]') as HTMLInputElement, {
      target: { value: '123 Market St' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="address-level2"]') as HTMLInputElement, {
      target: { value: 'San Francisco' },
    })
    fireEvent.change(container.querySelector('input[autocomplete="postal-code"]') as HTMLInputElement, {
      target: { value: '94107' },
    })

    fireEvent.click(screen.getAllByRole('button', { name: /continue to payment/i })[0])

    expect(
      await screen.findByText('Continue to the merchant payment page'),
    ).toBeInTheDocument()
    expect(processPaymentMock).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: /continue to merchant payment/i }),
    ).toBeInTheDocument()
  })
})
