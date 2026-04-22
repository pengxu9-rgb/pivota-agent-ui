'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  ShoppingCart,
  CreditCard,
  Check,
  ChevronRight,
  ChevronDown,
  Info,
  Lock,
} from 'lucide-react'
import Image from 'next/image'
import {
  createOrder,
  processPayment,
  getMerchantId,
  accountsLogin,
  accountsLoginWithPassword,
  accountsVerify,
  previewQuote,
  confirmOrderPayment,
  recordPaymentOfferEvidence,
} from '@/lib/api'
import { buildSavingsPresentation } from '@/lib/savingsPresentation'
import {
  isBackendSettledPaymentStatus,
  resolveCheckoutPaymentContract,
} from '@/lib/checkoutPaymentContract'
import { confirmPaymentWithRetry } from '@/lib/checkoutFinalization'
import { useCartStore } from '@/store/cartStore'
import { toast } from 'sonner'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  loadStripe,
  type Stripe,
  type StripeExpressCheckoutElementConfirmEvent,
  type StripeExpressCheckoutElementReadyEvent,
} from '@stripe/stripe-js'
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { useAuthStore } from '@/store/authStore'
import '@adyen/adyen-web/dist/adyen.css'

interface OrderItem {
  product_id: string
  variant_id?: string
  sku?: string
  selected_options?: Record<string, string>
  merchant_id?: string
  offer_id?: string
  title: string
  quantity: number
  unit_price: number
  currency?: string
  image_url?: string
}

interface ShippingInfo {
  name: string
  email: string
  address_line1: string
  address_line2?: string
  city: string
  state?: string
  postal_code: string
  country: string
  phone?: string
}

type ResumeOrderState = {
  orderId: string
  shipping?: Partial<ShippingInfo> | null
  quote?: QuotePreview | null
  paymentResponse?: any
}

type OrderCompletionOptions = {
  finalizing?: boolean
}

interface OrderFlowProps {
  items: OrderItem[]
  onComplete?: (orderId: string, options?: OrderCompletionOptions) => void
  onCancel?: () => void
  onFailure?: (args: { reason: 'payment_failed' | 'system_error' | 'action_required'; stage: 'payment' | 'shipping' }) => void
  skipEmailVerification?: boolean
  buyerRef?: string | null
  jobId?: string | null
  market?: string | null
  locale?: string | null
  checkoutToken?: string | null
  returnUrl?: string | null
  resumeOrder?: ResumeOrderState | null
  entryMode?: string | null
  fallbackReason?: string | null
}

type QuotePricing = {
  subtotal: number
  discount_total?: number
  shipping_fee: number
  tax: number
  total: number
}

type QuotePreview = {
  quote_id: string
  currency: string
  pricing: QuotePricing
  promotion_lines?: Array<{
    id?: string
    label?: string
    amount?: number | string
    discount_class?: string
    method?: string
    code?: string | null
  }>
  line_items?: Array<{
    variant_id: string
    unit_price_effective: number
  }>
  delivery_options?: any[]
  discount_evidence?: Record<string, any>
  store_discount_evidence?: Record<string, any>
  payment_offer_evidence?: Record<string, any>
  payment_pricing?: Record<string, any>
}

type PrefetchedPaymentInit = {
  orderId: string
  quoteId: string
  paymentResponse: any
}

type CheckoutTimingMarks = Partial<{
  shipping_submit_started_at_ms: number
  quote_ready_at_ms: number
  payment_step_visible_at_ms: number
  payment_init_started_at_ms: number
  create_order_started_at_ms: number
  create_order_completed_at_ms: number
  submit_payment_started_at_ms: number
  submit_payment_completed_at_ms: number
  wallets_ready_at_ms: number
  payment_element_ready_at_ms: number
}>

type CheckoutTimingSnapshot = {
  marks: CheckoutTimingMarks
  durations_ms: {
    shipping_to_quote_ms: number | null
    shipping_to_payment_step_ms: number | null
    shipping_to_payment_init_ms: number | null
    quote_to_payment_init_ms: number | null
    payment_init_to_create_order_ms: number | null
    create_order_ms: number | null
    submit_payment_ms: number | null
    payment_step_to_wallets_ready_ms: number | null
    payment_step_to_payment_element_ready_ms: number | null
    shipping_to_payment_element_ready_ms: number | null
  }
}

function diffMs(
  end: number | null | undefined,
  start: number | null | undefined,
): number | null {
  if (!Number.isFinite(Number(end)) || !Number.isFinite(Number(start))) return null
  return Math.max(0, Math.round(Number(end) - Number(start)))
}

export function buildCheckoutTimingSnapshot(
  marks: CheckoutTimingMarks,
): CheckoutTimingSnapshot {
  return {
    marks: { ...marks },
    durations_ms: {
      shipping_to_quote_ms: diffMs(
        marks.quote_ready_at_ms,
        marks.shipping_submit_started_at_ms,
      ),
      shipping_to_payment_step_ms: diffMs(
        marks.payment_step_visible_at_ms,
        marks.shipping_submit_started_at_ms,
      ),
      shipping_to_payment_init_ms: diffMs(
        marks.payment_init_started_at_ms,
        marks.shipping_submit_started_at_ms,
      ),
      quote_to_payment_init_ms: diffMs(
        marks.payment_init_started_at_ms,
        marks.quote_ready_at_ms,
      ),
      payment_init_to_create_order_ms: diffMs(
        marks.create_order_started_at_ms,
        marks.payment_init_started_at_ms,
      ),
      create_order_ms: diffMs(
        marks.create_order_completed_at_ms,
        marks.create_order_started_at_ms,
      ),
      submit_payment_ms: diffMs(
        marks.submit_payment_completed_at_ms,
        marks.submit_payment_started_at_ms,
      ),
      payment_step_to_wallets_ready_ms: diffMs(
        marks.wallets_ready_at_ms,
        marks.payment_step_visible_at_ms,
      ),
      payment_step_to_payment_element_ready_ms: diffMs(
        marks.payment_element_ready_at_ms,
        marks.payment_step_visible_at_ms,
      ),
      shipping_to_payment_element_ready_ms: diffMs(
        marks.payment_element_ready_at_ms,
        marks.shipping_submit_started_at_ms,
      ),
    },
  }
}

function buildPaymentInitKeyForQuote(
  quote: QuotePreview | null | undefined,
  fallbackCurrency: string,
): string | null {
  const quoteId = String(quote?.quote_id || '').trim()
  if (!quoteId) return null
  const currency = String(quote?.currency || fallbackCurrency || 'USD').trim().toUpperCase()
  const amountMinor = Number.isFinite(Number(quote?.pricing?.total))
    ? Math.round(Number(quote?.pricing?.total) * 100)
    : null
  if (!currency || amountMinor == null) return null
  return `${quoteId}:${currency}:${amountMinor}`
}

type CreatedOrderPaymentSnapshot = {
  orderId: string
  paymentResponse: any
  action: any
  psp: string | null
}

type CheckoutStep = 'shipping' | 'payment' | 'confirm'

const DEFAULT_STRIPE_PUBLISHABLE_KEY =
  process.env.NODE_ENV === 'production'
    ? ''
    : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const ADYEN_CLIENT_KEY =
  process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY ||
  'test_RMFUADZPQBBYJIWI56KVOQSNUUT657ML' // public test key; replace in env for prod
const FORCE_PSP = process.env.NEXT_PUBLIC_FORCE_PSP
const stripePromiseCache = new Map<string, Promise<Stripe | null>>()
const UNSUPPORTED_PIVOTA_HOSTED_CHECKOUT_MESSAGE =
  'Merchant checkout must render the merchant PSP payment form. Pivota hosted checkout is disabled.'

type StripeConfirmationResult = {
  error?: string
  status?: string
  paymentIntentId?: string
}

type StripePaymentSectionHandle = {
  confirm: (args: {
    clientSecret: string
    returnUrl: string
    shipping?: Partial<ShippingInfo> | null
  }) => Promise<StripeConfirmationResult>
}

function readStripeAccount(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  return null
}

function getStripePromiseForKey(
  publishableKey: string,
  stripeAccount: string | null = null,
): Promise<Stripe | null> {
  const normalized = String(publishableKey || '').trim()
  if (!normalized) return Promise.resolve(null)
  const normalizedStripeAccount = readStripeAccount(stripeAccount)
  const cacheKey = normalizedStripeAccount ? `${normalized}::${normalizedStripeAccount}` : normalized
  if (!stripePromiseCache.has(cacheKey)) {
    stripePromiseCache.set(
      cacheKey,
      loadStripe(
        normalized,
        normalizedStripeAccount ? { stripeAccount: normalizedStripeAccount } : undefined,
      ),
    )
  }
  return stripePromiseCache.get(cacheKey) || Promise.resolve(null)
}

export function clearStripePromiseCacheForTests() {
  stripePromiseCache.clear()
}

function readPublicKey(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  return null
}

export function prewarmStripeRuntime(
  publishableKey: string | null | undefined,
  stripeAccount: string | null = null,
): Promise<Stripe | null> | null {
  const normalizedPublishableKey = readPublicKey(publishableKey)
  if (!normalizedPublishableKey) return null
  return getStripePromiseForKey(normalizedPublishableKey, stripeAccount).catch(() => null)
}

export function resolveStripePublishableKey(paymentResponse: any, fallbackAction: any = null): string | null {
  const candidates = [
    fallbackAction?.public_key,
    fallbackAction?.raw?.public_key,
    paymentResponse?.payment_action?.public_key,
    paymentResponse?.payment_action?.raw?.public_key,
    paymentResponse?.payment?.payment_action?.public_key,
    paymentResponse?.payment?.payment_action?.raw?.public_key,
    paymentResponse?.public_key,
    paymentResponse?.payment?.public_key,
  ]

  for (const candidate of candidates) {
    const resolved = readPublicKey(candidate)
    if (resolved) return resolved
  }

  return DEFAULT_STRIPE_PUBLISHABLE_KEY || null
}

export function resolveStripeAccount(paymentResponse: any, fallbackAction: any = null): string | null {
  const candidates = [
    fallbackAction?.stripe_account,
    fallbackAction?.raw?.stripe_account,
    fallbackAction?.raw?.stripeAccount,
    fallbackAction?.raw?.account_id,
    paymentResponse?.payment_action?.stripe_account,
    paymentResponse?.payment_action?.raw?.stripe_account,
    paymentResponse?.payment_action?.raw?.stripeAccount,
    paymentResponse?.payment_action?.raw?.account_id,
    paymentResponse?.payment?.payment_action?.stripe_account,
    paymentResponse?.payment?.payment_action?.raw?.stripe_account,
    paymentResponse?.payment?.payment_action?.raw?.stripeAccount,
    paymentResponse?.payment?.payment_action?.raw?.account_id,
    paymentResponse?.stripe_account,
    paymentResponse?.payment?.stripe_account,
  ]

  for (const candidate of candidates) {
    const resolved = readStripeAccount(candidate)
    if (resolved) return resolved
  }

  return null
}

function normalizePaymentPspToken(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    return trimmed || null
  }
  if (value == null) return null
  const normalized = String(value).trim().toLowerCase()
  return normalized || null
}

export function isUnsupportedPivotaHostedCheckout(
  paymentResponse: any,
  action: any = null,
  detectedPsp: string | null = null,
): boolean {
  const paymentObj = paymentResponse?.payment || {}
  const checkoutSession = paymentResponse?.checkout_session || paymentObj?.checkout_session || null
  const candidates = [
    detectedPsp,
    action?.psp,
    paymentResponse?.psp,
    paymentResponse?.psp_used,
    paymentObj?.psp,
    paymentObj?.psp_used,
    checkoutSession?.provider,
  ]

  return candidates.some((candidate) => normalizePaymentPspToken(candidate) === 'pivota_hosted_checkout')
}

function assertSupportedPaymentSurface(
  paymentResponse: any,
  action: any = null,
  detectedPsp: string | null = null,
): void {
  if (isUnsupportedPivotaHostedCheckout(paymentResponse, action, detectedPsp)) {
    throw new Error(UNSUPPORTED_PIVOTA_HOSTED_CHECKOUT_MESSAGE)
  }
}

function isReusablePaymentAction(action: any): boolean {
  if (!action || typeof action !== 'object') return false
  const type = String(action.type || '').trim().toLowerCase()
  if (type === 'redirect_url') return typeof action.url === 'string' && action.url.trim().length > 0
  if (type === 'stripe_client_secret' || type === 'adyen_session' || type === 'checkout_session') {
    return typeof action.client_secret === 'string' && action.client_secret.trim().length > 0
  }
  return false
}

export function shouldHydrateCreatedOrderPaymentSurface(
  action: any,
  psp: unknown,
): boolean {
  if (!isReusablePaymentAction(action)) return false
  const normalizedPsp = normalizePaymentPspToken(psp)
  return normalizedPsp !== 'pivota_hosted_checkout'
}

export function resolveCheckoutPaymentMethodHint(methodType: string | null | undefined): string {
  const normalized = String(methodType || '').trim().toLowerCase()
  return normalized || 'dynamic'
}

function parseBooleanToken(value: string | null | undefined): boolean | null {
  const token = String(value || '').trim().toLowerCase()
  if (!token) return null
  if (['1', 'true', 'yes', 'y', 'on'].includes(token)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(token)) return false
  return null
}

function normalizeStripePaymentCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (!normalized) return null
  return normalized.slice(0, 2) || null
}

export function resolveStripePaymentMethodOrder(
  countryCode: string | null | undefined,
): string[] | null {
  const normalized = normalizeStripePaymentCountry(countryCode)
  if (!normalized) return null
  return null
}

function buildStripeBillingDetails(shipping?: Partial<ShippingInfo> | null) {
  const country = normalizeStripePaymentCountry(shipping?.country)
  return {
    ...(shipping?.name ? { name: shipping.name } : {}),
    ...(shipping?.email ? { email: shipping.email } : {}),
    ...(shipping?.phone ? { phone: shipping.phone } : {}),
    address: {
      ...(country ? { country } : {}),
      ...(shipping?.postal_code ? { postal_code: shipping.postal_code } : {}),
      ...(shipping?.state ? { state: shipping.state } : {}),
      ...(shipping?.city ? { city: shipping.city } : {}),
      ...(shipping?.address_line1 ? { line1: shipping.address_line1 } : {}),
      ...(shipping?.address_line2 ? { line2: shipping.address_line2 } : {}),
    },
  }
}

function buildStripePaymentElementOptions(shipping?: Partial<ShippingInfo> | null) {
  const paymentMethodOrder = resolveStripePaymentMethodOrder(shipping?.country || null)
  return {
    defaultValues: {
      billingDetails: buildStripeBillingDetails(shipping),
    },
    layout: {
      type: 'accordion' as const,
      defaultCollapsed: false,
      radios: true,
      spacedAccordionItems: false,
    },
    wallets: {
      applePay: 'never' as const,
      googlePay: 'never' as const,
    },
    ...(paymentMethodOrder ? { paymentMethodOrder } : {}),
  }
}

function buildStripeExpressCheckoutOptions(shipping?: Partial<ShippingInfo> | null) {
  const paymentMethodOrder = resolveStripePaymentMethodOrder(shipping?.country || null)
  return {
    buttonHeight: 48,
    buttonTheme: {
      applePay: 'black' as const,
      googlePay: 'black' as const,
    },
    buttonType: {
      applePay: 'buy' as const,
      googlePay: 'buy' as const,
    },
    layout: {
      maxColumns: 2,
      maxRows: 1,
      overflow: 'auto' as const,
    },
    paymentMethods: {
      applePay: 'always' as const,
      googlePay: 'always' as const,
      link: 'never' as const,
      paypal: 'never' as const,
    },
    ...(paymentMethodOrder ? { paymentMethodOrder } : {}),
  }
}

export function hasAvailableStripeExpressWallets(
  availablePaymentMethods:
    | StripeExpressCheckoutElementReadyEvent['availablePaymentMethods']
    | null
    | undefined,
): boolean {
  return Boolean(availablePaymentMethods?.applePay || availablePaymentMethods?.googlePay)
}

function normalizeStripeAvailablePaymentMethods(
  availablePaymentMethods:
    | StripeExpressCheckoutElementReadyEvent['availablePaymentMethods']
    | null
    | undefined,
): string[] {
  if (!availablePaymentMethods) return []
  const methods: string[] = []
  if (availablePaymentMethods.applePay) methods.push('apple_pay')
  if (availablePaymentMethods.googlePay) methods.push('google_pay')
  if ((availablePaymentMethods as any).link) methods.push('link')
  if ((availablePaymentMethods as any).paypal) methods.push('paypal')
  return methods
}

function normalizeStripeWalletType(methodType: string | null | undefined): string | null {
  const normalized = String(methodType || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'apple_pay' || normalized === 'applepay') return 'apple_pay'
  if (normalized === 'google_pay' || normalized === 'googlepay') return 'google_pay'
  if (normalized === 'link') return 'link'
  if (normalized === 'paypal') return 'paypal'
  return null
}

type PaymentOfferContextFallbacks = {
  psp?: unknown
  payment_method_type?: unknown
  wallet_type?: unknown
  card_network?: unknown
  issuer_name?: unknown
  installment_provider?: unknown
}

function normalizedPaymentOfferValue(value: unknown): string | null {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || null
}

export function buildPaymentOfferContextFromEvidence(
  evidence?: Record<string, any> | null,
  fallbacks: PaymentOfferContextFallbacks = {},
): Record<string, string> | null {
  const psp = normalizedPaymentOfferValue(evidence?.psp ?? fallbacks.psp)
  const methodTypeRaw = normalizedPaymentOfferValue(
    evidence?.payment_method_type ??
      evidence?.selected_payment_method_type ??
      fallbacks.payment_method_type,
  )
  const walletType =
    normalizedPaymentOfferValue(evidence?.wallet_type ?? fallbacks.wallet_type) ||
    normalizeStripeWalletType(methodTypeRaw)
  const cardNetwork = normalizedPaymentOfferValue(evidence?.card_network ?? fallbacks.card_network)
  const issuerName = normalizedPaymentOfferValue(evidence?.issuer_name ?? fallbacks.issuer_name)
  const installmentProvider = normalizedPaymentOfferValue(
    evidence?.installment_provider ?? fallbacks.installment_provider,
  )
  const context = {
    ...(psp ? { psp } : {}),
    ...(methodTypeRaw ? { payment_method_type: walletType ? 'wallet' : methodTypeRaw } : {}),
    ...(walletType ? { wallet_type: walletType } : {}),
    ...(cardNetwork ? { card_network: cardNetwork } : {}),
    ...(issuerName ? { issuer_name: issuerName } : {}),
    ...(installmentProvider ? { installment_provider: installmentProvider } : {}),
  }
  return Object.keys(context).length ? context : null
}

export function paymentOfferMatchesCurrentEvidence(
  offer: any,
  context?: Record<string, any> | null,
): boolean {
  if (!offer || typeof offer !== 'object' || !context) return false
  const requirements =
    offer.requirements && typeof offer.requirements === 'object' ? offer.requirements : {}
  const requiredKeys = Object.keys(requirements).filter((key) =>
    Boolean(normalizedPaymentOfferValue(requirements[key])),
  )
  if (!requiredKeys.length) return false
  return requiredKeys.every((key) => {
    const required = normalizedPaymentOfferValue(requirements[key])
    const actual = normalizedPaymentOfferValue(context[key])
    return Boolean(required && actual && required === actual)
  })
}

export function pickSelectedPaymentOfferIdFromEvidence(
  paymentOfferEvidence?: Record<string, any> | null,
  evidence?: Record<string, any> | null,
  fallbacks: PaymentOfferContextFallbacks = {},
): string | null {
  const offers = Array.isArray(paymentOfferEvidence?.offers) ? paymentOfferEvidence.offers : []
  if (!offers.length || !evidence) return null
  const context = buildPaymentOfferContextFromEvidence(evidence, fallbacks)
  const explicitOfferId = normalizedPaymentOfferValue(evidence.selected_payment_offer_id)

  if (explicitOfferId) {
    const explicit = offers.find((offer: any) => {
      const offerId = normalizedPaymentOfferValue(offer?.payment_offer_id)
      return offerId === explicitOfferId && paymentOfferMatchesCurrentEvidence(offer, context)
    })
    if (explicit?.payment_offer_id) return String(explicit.payment_offer_id)
  }

  const matched = offers.find((offer: any) => paymentOfferMatchesCurrentEvidence(offer, context))
  return matched?.payment_offer_id ? String(matched.payment_offer_id) : null
}

function formatStripePaymentMethodLabel(methodType: string | null | undefined): string | null {
  const normalized = String(methodType || '').trim().toLowerCase()
  if (!normalized) return null
  const labels: Record<string, string> = {
    apple_pay: 'Apple Pay',
    google_pay: 'Google Pay',
    link: 'Link',
    klarna: 'Klarna',
    affirm: 'Affirm',
    afterpay_clearpay: 'Afterpay/Clearpay',
    us_bank_account: 'US bank account',
    cashapp: 'Cash App Pay',
    cashapp_pay: 'Cash App Pay',
    paypal: 'PayPal',
    card: 'Card',
  }
  if (labels[normalized]) return labels[normalized]
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const StripePaymentSectionInner = forwardRef<
  StripePaymentSectionHandle,
  {
    clientSecret: string
    returnUrl?: string | null
    shipping?: Partial<ShippingInfo> | null
    onPaymentError: (message: string) => void
    onPaymentMethodChange: (methodType: string | null) => void
    onWalletsReady?: (
      availablePaymentMethods?: StripeExpressCheckoutElementReadyEvent['availablePaymentMethods'],
    ) => void
    onPaymentElementReady?: () => void
    onPaymentMethodEvidence?: (evidence: Record<string, any>, eventType: string) => void
    onConfirmationResult?: (result: { status?: string; paymentIntentId?: string }) => Promise<void> | void
  }
>(function StripePaymentSectionInner(
  {
    clientSecret,
    returnUrl = null,
    shipping = null,
    onPaymentError,
    onPaymentMethodChange,
    onWalletsReady,
    onPaymentElementReady,
    onPaymentMethodEvidence,
    onConfirmationResult,
  },
  ref,
) {
  const stripe = useStripe()
  const elements = useElements()
  const [localPaymentError, setLocalPaymentError] = useState('')
  const [expressWalletsReady, setExpressWalletsReady] = useState(false)
  const [expressWalletsAvailable, setExpressWalletsAvailable] = useState(false)

  const setPaymentError = useCallback((message: string) => {
    setLocalPaymentError(message)
    onPaymentError(message)
  }, [onPaymentError])

  const runStripeConfirmation = useCallback(async ({
    confirmClientSecret,
    confirmShipping,
    confirmReturnUrl,
    skipSubmit = false,
  }: {
    confirmClientSecret?: string
    confirmShipping?: Partial<ShippingInfo> | null
    confirmReturnUrl?: string | null
    skipSubmit?: boolean
  }) => {
    if (!stripe || !elements) {
      return { error: 'Payment form is not ready. Please refresh and try again.' }
    }

    const resolvedReturnUrl = String(confirmReturnUrl || returnUrl || '').trim()
    if (!resolvedReturnUrl) {
      return { error: 'Payment return URL is missing. Please refresh and try again.' }
    }

    if (!skipSubmit) {
      const submitResult = await elements.submit()
      if (submitResult.error) {
        const message = submitResult.error.message || 'Please complete the payment form.'
        setPaymentError(message)
        return { error: message }
      }
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret: confirmClientSecret || clientSecret,
      confirmParams: {
        return_url: resolvedReturnUrl,
        payment_method_data: {
          billing_details: buildStripeBillingDetails(confirmShipping || shipping),
        },
      },
      redirect: 'if_required',
    })

    if (result.error) {
      const message = result.error.message || 'Payment failed'
      setPaymentError(message)
      return { error: message }
    }

    setPaymentError('')
    return {
      status: result.paymentIntent?.status,
      paymentIntentId: result.paymentIntent?.id,
    }
  }, [clientSecret, elements, returnUrl, setPaymentError, shipping, stripe])

  useImperativeHandle(
    ref,
    () => ({
      async confirm({ clientSecret: confirmClientSecret, returnUrl, shipping: confirmShipping }) {
        return runStripeConfirmation({
          confirmClientSecret,
          confirmShipping,
          confirmReturnUrl: returnUrl,
        })
      },
    }),
    [runStripeConfirmation],
  )

  return (
    <div className="space-y-3">
      <div
        className={
          expressWalletsReady && expressWalletsAvailable
            ? 'rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4'
            : 'hidden'
        }
      >
        <label className="text-[13px] font-medium text-slate-700 sm:text-sm">Wallets</label>
        <div className="mt-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
          <ExpressCheckoutElement
            options={buildStripeExpressCheckoutOptions(shipping)}
            onReady={(event) => {
              setExpressWalletsReady(true)
              setExpressWalletsAvailable(hasAvailableStripeExpressWallets(event.availablePaymentMethods))
              onWalletsReady?.(event.availablePaymentMethods)
              onPaymentMethodEvidence?.(
                {
                  psp: 'stripe',
                  available_payment_methods: normalizeStripeAvailablePaymentMethods(event.availablePaymentMethods),
                },
                'payment_offer.available',
              )
            }}
            onClick={(event: any) => {
              const methodType = String(event?.expressPaymentType || '').trim() || null
              onPaymentMethodChange(methodType)
              onPaymentMethodEvidence?.(
                {
                  psp: 'stripe',
                  payment_method_type: 'wallet',
                  wallet_type: normalizeStripeWalletType(methodType),
                  selected_payment_method_type: methodType,
                },
                'payment_offer.selected',
              )
              setPaymentError('')
            }}
            onLoadError={(event) => {
              const message =
                String(event?.error?.message || '').trim() ||
                'Wallet buttons could not be loaded in this browser.'
              setExpressWalletsReady(true)
              setExpressWalletsAvailable(false)
              setPaymentError(message)
            }}
            onConfirm={async (event: StripeExpressCheckoutElementConfirmEvent) => {
              const methodType = String(event.expressPaymentType || '').trim() || null
              onPaymentMethodChange(methodType)
              onPaymentMethodEvidence?.(
                {
                  psp: 'stripe',
                  payment_method_type: 'wallet',
                  wallet_type: normalizeStripeWalletType(methodType),
                  selected_payment_method_type: methodType,
                },
                'payment_offer.selected',
              )
              const result = await runStripeConfirmation({
                confirmReturnUrl: returnUrl,
                confirmShipping: shipping,
                skipSubmit: true,
              })
              if (result.error) {
                event.paymentFailed({ reason: 'fail' })
                return
              }
              try {
                await onConfirmationResult?.(result)
              } catch (error: any) {
                const message = String(error?.message || '').trim() || 'Payment failed'
                setPaymentError(message)
                event.paymentFailed({ reason: 'fail' })
              }
            }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Apple Pay and Google Pay appear here when Stripe marks them available for this device,
          browser, domain, and merchant account.
        </p>
      </div>

      <div className="rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4">
        <label className="text-[13px] font-medium text-slate-700 sm:text-sm">Payment Details</label>
        <div className="mt-2 rounded-[16px] border border-slate-200 bg-slate-50 p-3">
        <PaymentElement
          options={buildStripePaymentElementOptions(shipping)}
          onReady={() => {
            onPaymentElementReady?.()
          }}
          onChange={(event: any) => {
            const message = String(event?.error?.message || '').trim()
            setLocalPaymentError(message)
            onPaymentError(message)
            const methodType = String(event?.value?.type || '').trim() || null
            onPaymentMethodChange(methodType)
            onPaymentMethodEvidence?.(
              {
                psp: 'stripe',
                payment_method_type: methodType || undefined,
                selected_payment_method_type: methodType || undefined,
              },
              'payment_offer.psp_evidence_received',
            )
          }}
        />
      </div>
      {localPaymentError && <p className="mt-2 text-sm text-red-600">{localPaymentError}</p>}
      </div>
    </div>
  )
})

const StripePaymentSection = forwardRef<
  StripePaymentSectionHandle,
  {
    clientSecret: string
    publishableKey: string
    stripeAccount?: string | null
    returnUrl?: string | null
    shipping?: Partial<ShippingInfo> | null
    onPaymentError: (message: string) => void
    onPaymentMethodChange: (methodType: string | null) => void
    onWalletsReady?: (
      availablePaymentMethods?: StripeExpressCheckoutElementReadyEvent['availablePaymentMethods'],
    ) => void
    onPaymentElementReady?: () => void
    onPaymentMethodEvidence?: (evidence: Record<string, any>, eventType: string) => void
    onConfirmationResult?: (result: { status?: string; paymentIntentId?: string }) => Promise<void> | void
  }
>(function StripePaymentSection(
  {
    clientSecret,
    publishableKey,
    stripeAccount = null,
    returnUrl = null,
    shipping = null,
    onPaymentError,
    onPaymentMethodChange,
    onWalletsReady,
    onPaymentElementReady,
    onPaymentMethodEvidence,
    onConfirmationResult,
  },
  ref,
) {
  const stripePromise = useMemo(
    () => getStripePromiseForKey(publishableKey, stripeAccount),
    [publishableKey, stripeAccount],
  )
  const billingKey = JSON.stringify(buildStripeBillingDetails(shipping))
  const sectionKey = [publishableKey, stripeAccount || '', clientSecret, billingKey].join('::')

  return (
    <Elements key={sectionKey} stripe={stripePromise} options={{ clientSecret }}>
      <StripePaymentSectionInner
        ref={ref}
        clientSecret={clientSecret}
        returnUrl={returnUrl}
        shipping={shipping}
        onPaymentError={onPaymentError}
        onPaymentMethodChange={onPaymentMethodChange}
        onWalletsReady={onWalletsReady}
        onPaymentElementReady={onPaymentElementReady}
        onPaymentMethodEvidence={onPaymentMethodEvidence}
        onConfirmationResult={onConfirmationResult}
      />
    </Elements>
  )
})

const SHIPPING_COUNTRY_GROUPS: Array<{
  label: string
  countries: Array<{ code: string; name: string }>
}> = [
  {
    label: 'North America',
    countries: [
      { code: 'US', name: 'United States' },
      { code: 'CA', name: 'Canada' },
      { code: 'MX', name: 'Mexico' },
    ],
  },
  {
    label: 'Europe',
    countries: [
      { code: 'GB', name: 'United Kingdom' },
      { code: 'IE', name: 'Ireland' },
      { code: 'FR', name: 'France' },
      { code: 'DE', name: 'Germany' },
      { code: 'ES', name: 'Spain' },
      { code: 'IT', name: 'Italy' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'BE', name: 'Belgium' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'AT', name: 'Austria' },
      { code: 'SE', name: 'Sweden' },
      { code: 'NO', name: 'Norway' },
      { code: 'DK', name: 'Denmark' },
      { code: 'FI', name: 'Finland' },
      { code: 'PL', name: 'Poland' },
      { code: 'PT', name: 'Portugal' },
    ],
  },
  {
    label: 'Asia Pacific',
    countries: [
      { code: 'JP', name: 'Japan' },
      { code: 'KR', name: 'South Korea' },
      { code: 'SG', name: 'Singapore' },
      { code: 'HK', name: 'Hong Kong' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'CN', name: 'China' },
      { code: 'IN', name: 'India' },
      { code: 'AU', name: 'Australia' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'TH', name: 'Thailand' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'PH', name: 'Philippines' },
    ],
  },
  {
    label: 'Middle East & Africa',
    countries: [
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'IL', name: 'Israel' },
      { code: 'ZA', name: 'South Africa' },
    ],
  },
  {
    label: 'South America',
    countries: [
      { code: 'BR', name: 'Brazil' },
      { code: 'AR', name: 'Argentina' },
      { code: 'CL', name: 'Chile' },
      { code: 'CO', name: 'Colombia' },
    ],
  },
]

const SHIPPING_COUNTRY_CODE_SET = new Set(
  SHIPPING_COUNTRY_GROUPS.flatMap((g) => g.countries.map((c) => String(c.code).toUpperCase())),
)

const SHIPPING_COUNTRY_NAME_TO_CODE = new Map<string, string>(
  SHIPPING_COUNTRY_GROUPS.flatMap((g) =>
    g.countries.flatMap((c) => {
      const code = String(c.code).toUpperCase()
      const name = String(c.name).toUpperCase()
      const compact = name.replace(/[^A-Z]/g, '')
      return [
        [name, code] as const,
        [compact, code] as const,
      ]
    }),
  ),
)

const COUNTRY_ALIASES: Record<string, string> = {
  UK: 'GB',
  'UNITED KINGDOM': 'GB',
  'GREAT BRITAIN': 'GB',
  ENGLAND: 'GB',
  SCOTLAND: 'GB',
  WALES: 'GB',
  'UNITED STATES': 'US',
  USA: 'US',
  'UNITED STATES OF AMERICA': 'US',
  CHINA: 'CN',
  PRC: 'CN',
  'HONG KONG': 'HK',
  HONGKONG: 'HK',
  MACAU: 'MO',
  'SOUTH KOREA': 'KR',
  'KOREA, REPUBLIC OF': 'KR',
  KOREA: 'KR',
  TAIWAN: 'TW',
  VIETNAM: 'VN',
  'UNITED ARAB EMIRATES': 'AE',
  UAE: 'AE',
}

function normalizeCountryCode(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const upper = raw.toUpperCase()

  if (upper.length === 2 && (SHIPPING_COUNTRY_CODE_SET.has(upper) || upper === 'ZZ')) {
    return upper
  }
  if (upper.length === 3 && upper === 'USA') return 'US'

  const alias = COUNTRY_ALIASES[upper]
  if (alias) return alias

  const byName = SHIPPING_COUNTRY_NAME_TO_CODE.get(upper)
  if (byName) return byName

  const compact = upper.replace(/[^A-Z]/g, '')
  const byCompact = SHIPPING_COUNTRY_NAME_TO_CODE.get(compact)
  if (byCompact) return byCompact

  return null
}

function getCountryFlagEmoji(value: unknown): string {
  const normalized = normalizeCountryCode(value)
  if (!normalized || normalized.length !== 2) return '🌍'
  return Array.from(normalized)
    .map((char) => String.fromCodePoint(char.charCodeAt(0) + 127397))
    .join('')
}

function collapseWhitespace(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizePostalCodeValue(value: unknown): string {
  return collapseWhitespace(value).toUpperCase()
}

const CHECKOUT_STEPS: Array<{ id: CheckoutStep; label: string }> = [
  { id: 'shipping', label: 'Shipping' },
  { id: 'payment', label: 'Payment' },
  { id: 'confirm', label: 'Review' },
]

function getVariantIdForItem(item: {
  product_id: string
  variant_id?: string
}): string {
  return String(item.variant_id || '').trim()
}

function extractMerchantIdFromOfferId(offerId: unknown): string | null {
  const raw = String(offerId || '').trim()
  if (!raw) return null
  const prefix = 'of:v1:'
  if (!raw.startsWith(prefix)) return null
  const rest = raw.slice(prefix.length)
  const idx = rest.indexOf(':')
  if (idx <= 0) return null
  const merchantId = rest.slice(0, idx).trim()
  return merchantId || null
}

function isTemporaryUnavailable(err: any): boolean {
  const code = String(err?.code || '').trim().toUpperCase()
  if (code === 'TEMPORARY_UNAVAILABLE' || code === 'UPSTREAM_UNAVAILABLE') return true
  const message = String(err?.message || '').toUpperCase()
  return (
    message.includes('TEMPORARY_UNAVAILABLE') ||
    message.includes('UPSTREAM_UNAVAILABLE') ||
    message.includes('DATABASE BUSY')
  )
}

function isRetryableQuoteError(err: any): boolean {
  if (isTemporaryUnavailable(err)) return true
  const code = String(err?.code || '').trim().toUpperCase()
  if (code === 'UPSTREAM_TIMEOUT') return true
  const message = String(err?.message || '').toUpperCase()
  return (
    message.includes('UPSTREAM_TIMEOUT') ||
    message.includes('GATEWAY TIMEOUT') ||
    message.includes('TIMED OUT')
  )
}

function isQuoteDrift(err: any): boolean {
  const code = String(err?.code || '').trim().toUpperCase()
  return code === 'QUOTE_EXPIRED' || code === 'QUOTE_MISMATCH'
}

function isInventoryUnavailable(err: any): boolean {
  const code = String(err?.code || '').trim().toUpperCase()
  return code === 'OUT_OF_STOCK' || code === 'INSUFFICIENT_INVENTORY'
}

function isCheckoutRestartRequired(err: any): boolean {
  const code = String(err?.code || '').trim().toUpperCase()
  return code === 'CHECKOUT_RESTART_REQUIRED'
}

function extractInventoryIssue(err: any): {
  variant_id?: string
  requested_quantity?: number
  available_quantity?: number
} | null {
  const d = err?.detail || null
  const meta =
    d?.error?.details?.details ||
    d?.error?.details ||
    d?.detail?.error?.details?.details ||
    d?.detail?.error?.details ||
    d?.details?.details ||
    d?.details ||
    null
  if (!meta || typeof meta !== 'object') return null
  const variant_id = String((meta as any)?.variant_id || '').trim() || undefined
  const rqRaw = (meta as any)?.requested_quantity
  const aqRaw = (meta as any)?.available_quantity
  const requested_quantity =
    typeof rqRaw === 'number' ? rqRaw : typeof rqRaw === 'string' ? Number(rqRaw) : undefined
  const available_quantity =
    typeof aqRaw === 'number' ? aqRaw : typeof aqRaw === 'string' ? Number(aqRaw) : undefined
  if (!variant_id && requested_quantity == null && available_quantity == null) return null
  return { variant_id, requested_quantity, available_quantity }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function OrderFlowInner({
  items,
  onComplete,
  onCancel,
  onFailure,
  skipEmailVerification,
  buyerRef,
  jobId,
  market,
  locale,
  checkoutToken,
  returnUrl,
  resumeOrder,
  entryMode,
  fallbackReason,
}: OrderFlowProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, setSession } = useAuthStore()
  const clearCart = useCartStore(state => state.clearCart)
  const [step, setStep] = useState<CheckoutStep>('shipping')
  const [shipping, setShipping] = useState<ShippingInfo>({
    name: '',
    email: '',
    address_line1: '',
    city: '',
    postal_code: '',
    country: 'US',
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [createdOrderId, setCreatedOrderId] = useState<string>('')
  const [paymentId, setPaymentId] = useState<string>('')
  const [cardError, setCardError] = useState<string>('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [showAddressLine2Mobile, setShowAddressLine2Mobile] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const [authMethod, setAuthMethod] = useState<'otp' | 'password'>('otp')
  const [loginPassword, setLoginPassword] = useState('')
  const adyenContainerRef = useRef<HTMLDivElement>(null)
  const [adyenMounted, setAdyenMounted] = useState(false)
  const [paymentActionType, setPaymentActionType] = useState<string | null>(null)
  const [pspUsed, setPspUsed] = useState<string | null>(null)
  const [initialPaymentAction, setInitialPaymentAction] = useState<any>(null)
  const [quote, setQuote] = useState<QuotePreview | null>(null)
  const [selectedDeliveryOption, setSelectedDeliveryOption] = useState<any>(null)
  const [quotePending, setQuotePending] = useState(false)
  const [checkoutFailure, setCheckoutFailure] = useState<{ message: string } | null>(null)
  const [orderDebug, setOrderDebug] = useState<{
    order_id?: string | null
    resolved_offer_id?: string | null
    resolved_merchant_id?: string | null
    order_lines?: any[] | null
  } | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)
  const createdOrderPaymentRef = useRef<CreatedOrderPaymentSnapshot | null>(null)
  const checkoutTimingMarksRef = useRef<CheckoutTimingMarks>({})
  const resumeHydratingRef = useRef(false)
  const paymentInitPromiseRef = useRef<Promise<PrefetchedPaymentInit> | null>(null)
  const paymentInitKeyRef = useRef<string | null>(null)
  const paymentInitRunIdRef = useRef(0)
  const [prefetchedPaymentRes, setPrefetchedPaymentRes] = useState<PrefetchedPaymentInit | null>(null)
  const [paymentInitLoading, setPaymentInitLoading] = useState(false)
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null)
  const [stripePublishableKey, setStripePublishableKey] = useState<string>(
    DEFAULT_STRIPE_PUBLISHABLE_KEY,
  )
  const [stripeAccount, setStripeAccount] = useState<string | null>(null)
  const [stripeSelectedMethodType, setStripeSelectedMethodType] = useState<string | null>(null)
  const [paymentMethodEvidence, setPaymentMethodEvidence] = useState<Record<string, any> | null>(null)
  const stripePaymentSectionRef = useRef<StripePaymentSectionHandle | null>(null)
  const [checkoutTimingSnapshot, setCheckoutTimingSnapshot] = useState<CheckoutTimingSnapshot>(
    () => buildCheckoutTimingSnapshot({}),
  )

  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const normalized = normalizeCountryCode(shipping.country)
    if (normalized && normalized !== shipping.country) {
      setShipping((prev) => ({ ...prev, country: normalized }))
    }
  }, [shipping.country])

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      if (String(process.env.NEXT_PUBLIC_CHECKOUT_DEBUG || '').trim() !== '1') return
    }
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const raw = String(params.get('checkout_debug') || params.get('debug') || '').trim().toLowerCase()
    if (!raw || raw === '0' || raw === 'false') return
    setDebugEnabled(true)
  }, [])

  const resetCheckoutTiming = useCallback(() => {
    checkoutTimingMarksRef.current = {}
    setCheckoutTimingSnapshot(buildCheckoutTimingSnapshot({}))
  }, [])

  const markCheckoutTiming = useCallback((
    key: keyof CheckoutTimingMarks,
    options: { onlyIfMissing?: boolean } = {},
  ) => {
    const existing = checkoutTimingMarksRef.current[key]
    if (options.onlyIfMissing && typeof existing === 'number') {
      return existing
    }
    const nextMarks = {
      ...checkoutTimingMarksRef.current,
      [key]: Date.now(),
    }
    checkoutTimingMarksRef.current = nextMarks
    setCheckoutTimingSnapshot(buildCheckoutTimingSnapshot(nextMarks))
    return nextMarks[key]
  }, [])

  const estimatedSubtotal = items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0,
  )
  const marketCurrency =
    String(market || '').toUpperCase() === 'JP'
      ? 'JPY'
      : String(market || '').toUpperCase() === 'US'
        ? 'USD'
        : null
  const currency =
    (quote as any)?.presentment_currency ||
    (quote as any)?.charge_currency ||
    quote?.currency ||
    items[0]?.currency ||
    marketCurrency ||
    'USD'
  const hasQuote = Boolean(quote?.quote_id)
  const subtotal = quote?.pricing?.subtotal ?? estimatedSubtotal
  const discount_total = quote?.pricing?.discount_total ?? 0
  const shipping_cost = quote?.pricing?.shipping_fee ?? 0
  const tax = quote?.pricing?.tax ?? 0
  const total = quote?.pricing?.total ?? estimatedSubtotal
  const savingsPresentation = useMemo(
    () =>
      buildSavingsPresentation({
        pricing: { ...(quote?.pricing || {}), total, currency },
        promotion_lines: quote?.promotion_lines || [],
        discount_evidence: quote?.discount_evidence,
        store_discount_evidence: quote?.store_discount_evidence,
        payment_offer_evidence: quote?.payment_offer_evidence,
        payment_pricing: quote?.payment_pricing,
        currency,
      }),
    [currency, quote, total],
  )
  const estimatedPaymentBenefit = savingsPresentation.totals.estimatedPaymentBenefit || 0
  const paymentInitKey = useMemo(() => {
    return buildPaymentInitKeyForQuote(quote, currency)
  }, [currency, quote])
  const requestedPreferredPsp = useMemo(() => {
    const raw = searchParams?.get('preferred_psp') || searchParams?.get('psp') || ''
    const normalized = raw.trim().toLowerCase()
    return ['stripe', 'adyen', 'checkout'].includes(normalized) ? normalized : null
  }, [searchParams])
  const enforceLiveReadiness = useMemo(() => {
    const explicit = parseBooleanToken(searchParams?.get('enforce_live_readiness'))
    if (explicit != null) return explicit
    const allowTest = parseBooleanToken(searchParams?.get('allow_test_psp_surfaces'))
    if (allowTest != null) return !allowTest
    const mode = String(
      searchParams?.get('payment_mode') || searchParams?.get('psp_mode') || '',
    )
      .trim()
      .toLowerCase()
    if (['test', 'sandbox', 'test_surface', 'allow_test_surfaces'].includes(mode)) {
      return false
    }
    return true
  }, [searchParams])

  const syncStripeRuntime = (paymentResponse: any, action: any, detectedPsp?: string | null) => {
    const resolvedPsp = detectedPsp || action?.psp || pspUsed || null
    const isStripeRuntime =
      action?.type === 'stripe_client_secret' || !resolvedPsp || resolvedPsp === 'stripe'
    if (!isStripeRuntime) {
      setStripePublishableKey('')
      setStripeAccount(null)
      setStripeSelectedMethodType(null)
      return
    }
    const resolvedPublishableKey = resolveStripePublishableKey(paymentResponse, action) || ''
    const resolvedStripeAccount = resolveStripeAccount(paymentResponse, action)
    setStripePublishableKey(resolvedPublishableKey)
    setStripeAccount(resolvedStripeAccount)
    void prewarmStripeRuntime(resolvedPublishableKey, resolvedStripeAccount)
  }

  const formatAmount = (amount: number) => {
    const code = String(currency || 'USD').toUpperCase()
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'symbol',
        minimumFractionDigits: code === 'JPY' ? 0 : 2,
        maximumFractionDigits: code === 'JPY' ? 0 : 2,
      }).format(Number(amount) || 0)
    } catch {
      const decimals = code === 'JPY' ? 0 : 2
      return `${code} ${(Number(amount) || 0).toFixed(decimals)}`
    }
  }

  const deliveryOptions = Array.isArray(quote?.delivery_options) ? quote?.delivery_options : []
  const clearCreatedOrderPaymentSnapshot = () => {
    createdOrderPaymentRef.current = null
  }
  const getReusableCreatedOrderPayment = (
    orderId: string,
  ): CreatedOrderPaymentSnapshot | null => {
    const snapshot = createdOrderPaymentRef.current
    if (!snapshot || snapshot.orderId !== orderId) return null
    return shouldHydrateCreatedOrderPaymentSurface(snapshot.action, snapshot.psp) ? snapshot : null
  }

  const offerIdsInCart = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => String(item.offer_id || '').trim())
          .filter(Boolean),
      ),
    )
  }, [items])
  const offerIdForOrder = offerIdsInCart.length === 1 ? offerIdsInCart[0] : null
  // Do not memoize: `getMerchantId()` may rely on runtime overrides (e.g., localStorage) that can
  // change independently from React deps.
  const merchantIdForOrder = (() => {
    const merchantIds = Array.from(
      new Set(items.map((item) => String(item.merchant_id || '').trim()).filter(Boolean)),
    )
    if (merchantIds.length === 1) return merchantIds[0]

    const fromItems = String(items[0]?.merchant_id || '').trim()
    if (fromItems) return fromItems
    const fromOffer = offerIdForOrder ? extractMerchantIdFromOfferId(offerIdForOrder) : null
    if (fromOffer) return fromOffer
    try {
      return getMerchantId()
    } catch {
      return null
    }
  })()

  const buildCurrentPaymentContext = useCallback(
    (evidence?: Record<string, any> | null): Record<string, any> | null => {
      return buildPaymentOfferContextFromEvidence(evidence, {
        psp: pspUsed || requestedPreferredPsp || FORCE_PSP || 'stripe',
        payment_method_type: stripeSelectedMethodType,
      })
    },
    [pspUsed, requestedPreferredPsp, stripeSelectedMethodType],
  )

  const pickSelectedPaymentOfferId = useCallback(
    (evidence?: Record<string, any> | null): string | null => {
      return pickSelectedPaymentOfferIdFromEvidence(quote?.payment_offer_evidence, evidence, {
        psp: pspUsed || requestedPreferredPsp || FORCE_PSP || 'stripe',
        payment_method_type: stripeSelectedMethodType,
      })
    },
    [pspUsed, quote?.payment_offer_evidence, requestedPreferredPsp, stripeSelectedMethodType],
  )

  const recordPaymentMethodEvidence = useCallback(
    async (evidence: Record<string, any>, eventType = 'payment_offer.psp_evidence_received') => {
      const normalizedEvidence = {
        ...(paymentMethodEvidence || {}),
        ...(evidence || {}),
      }
      setPaymentMethodEvidence(normalizedEvidence)
      const orderId = createdOrderId || createdOrderPaymentRef.current?.orderId || ''
      if (!orderId && !quote?.quote_id) return
      try {
        await recordPaymentOfferEvidence({
          ...(orderId ? { order_id: orderId } : {}),
          ...(quote?.quote_id ? { quote_id: quote.quote_id } : {}),
          ...(merchantIdForOrder ? { merchant_id: merchantIdForOrder } : {}),
          selected_payment_offer_id: pickSelectedPaymentOfferId(normalizedEvidence) || undefined,
          payment_method_evidence: normalizedEvidence,
          payment_offer_evidence: quote?.payment_offer_evidence,
          surface: 'checkout',
          event_type: eventType,
          idempotency_key: [orderId, quote?.quote_id, eventType].filter(Boolean).join(':') || undefined,
        })
      } catch {
        // Evidence is analytics-only in display-only mode; never block checkout.
      }
    },
    [
      createdOrderId,
      merchantIdForOrder,
      paymentMethodEvidence,
      pickSelectedPaymentOfferId,
      quote?.payment_offer_evidence,
      quote?.quote_id,
    ],
  )

  const itemCurrencies = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      const c = String(item.currency || '').trim()
      if (c) set.add(c.toUpperCase())
    }
    return Array.from(set).sort()
  }, [items])

  const quoteLineItemByVariantId = useMemo(() => {
    const map = new Map<string, any>()
    for (const li of quote?.line_items || []) {
      const variantId = String((li as any)?.variant_id || '').trim()
      if (!variantId) continue
      map.set(variantId, li)
    }
    return map
  }, [quote?.line_items])

  // Prefill shipping details:
  // 1) Prefer Buyer Vault defaults (/api/buyer/me) when available.
  // 2) Then merge checkout-intent prefill (/api/checkout/prefill) if token exists.
  // User-entered values always win (we only fill empty fields).
  useEffect(() => {
    if (step !== 'shipping') return
    const token = String(checkoutToken || '').trim() || null

    let cancelled = false

    const applyShippingPrefill = (args: {
      email?: string | null
      name?: string | null
      phone?: string | null
      addressLine1?: string | null
      addressLine2?: string | null
      city?: string | null
      state?: string | null
      postalCode?: string | null
      country?: string | null
    }) => {
      const email = String(args.email || '').trim() || null
      const country = normalizeCountryCode(args.country) || null

      setShipping((prev) => ({
        ...prev,
        ...(email && !prev.email ? { email } : {}),
        ...(args.name && !prev.name ? { name: String(args.name) } : {}),
        ...(args.phone && !prev.phone ? { phone: String(args.phone) } : {}),
        ...(args.addressLine1 && !prev.address_line1 ? { address_line1: String(args.addressLine1) } : {}),
        ...(args.addressLine2 && !prev.address_line2 ? { address_line2: String(args.addressLine2) } : {}),
        ...(args.city && !prev.city ? { city: String(args.city) } : {}),
        ...(args.state && !prev.state ? { state: String(args.state) } : {}),
        ...(args.postalCode && !prev.postal_code ? { postal_code: String(args.postalCode) } : {}),
        ...(country && (!prev.country || prev.country === 'US') ? { country } : {}),
      }))
    }

    ;(async () => {
      try {
        // Prefer Buyer Vault defaults first.
        const meRes = await fetch('/api/buyer/me', { cache: 'no-store' })
        if (meRes.ok) {
          const meJson = await meRes.json().catch(() => null)
          const addr = meJson?.default_address || null
          const email = String(meJson?.buyer?.primary_email || '').trim() || null

          if (!cancelled && (addr || email)) {
            applyShippingPrefill({
              email,
              name: addr?.recipient_name,
              phone: addr?.phone,
              addressLine1: addr?.line1,
              addressLine2: addr?.line2,
              city: addr?.city,
              state: addr?.region,
              postalCode: addr?.postal_code,
              country: addr?.country,
            })
          }
        }

        // Then merge checkout intent prefill if token exists.
        if (!token || cancelled) return

        const res = await fetch('/api/checkout/prefill', {
          headers: { 'X-Checkout-Token': token },
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        const prefill = json?.prefill || null
        const addr = prefill?.shipping_address || null
        const email = String(prefill?.customer_email || '').trim() || null

        if (cancelled || (!addr && !email)) return

        applyShippingPrefill({
          email,
          name: addr?.name,
          phone: addr?.phone,
          addressLine1: addr?.address_line1,
          addressLine2: addr?.address_line2,
          city: addr?.city,
          state: addr?.state,
          postalCode: addr?.postal_code,
          country: addr?.country,
        })
      } catch (err) {
        // Best-effort: ignore prefill errors.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkoutToken, step, user?.email, user?.id])

  const buildQuoteRequest = (deliveryOptionOverride?: any) => {
    const normalizedCountry = normalizeCountryCode(shipping.country)
    if (!normalizedCountry) {
      throw new Error('Please select a valid country.')
    }
    if (offerIdsInCart.length > 1) {
      throw new Error('Multiple offers in one checkout are not supported yet.')
    }
    const offerId = offerIdForOrder || null

    if (!merchantIdForOrder && !offerId) {
      throw new Error('Missing seller selection. Please go back and choose a seller.')
    }

    const quoteItems = items
      .map((item) => {
        const productId = String(item.product_id || '').trim()
        const variantId = getVariantIdForItem(item)
        const sku = String(item.sku || '').trim() || undefined
        const selectedOptions =
          item.selected_options && typeof item.selected_options === 'object'
            ? item.selected_options
            : undefined
        return {
          product_id: productId,
          variant_id: variantId,
          quantity: item.quantity,
          ...(sku ? { sku } : {}),
          ...(selectedOptions ? { selected_options: selectedOptions } : {}),
        }
      })
      .filter((it) => Boolean(it.product_id) && Boolean(it.variant_id))
    const paymentContext = buildCurrentPaymentContext(paymentMethodEvidence) || undefined

    return {
      ...(offerId ? { offer_id: offerId } : {}),
      ...(merchantIdForOrder ? { merchant_id: merchantIdForOrder } : {}),
      items: quoteItems,
      customer_email: shipping.email,
      shipping_address: {
        name: shipping.name,
        address_line1: shipping.address_line1,
        address_line2: shipping.address_line2 || undefined,
        city: shipping.city,
        ...(shipping.state ? { state: shipping.state } : {}),
        country: normalizedCountry,
        postal_code: shipping.postal_code,
        phone: shipping.phone || undefined,
      },
      ...(deliveryOptionOverride ? { selected_delivery_option: deliveryOptionOverride } : {}),
      ...(paymentContext ? { payment_context: paymentContext } : {}),
    }
  }

  const normalizeQuote = (quoteResp: any): QuotePreview | null => {
    const pricing = quoteResp?.pricing || null
    const quoteId = quoteResp?.quote_id || quoteResp?.quoteId || null
    const qCurrency =
      quoteResp?.presentment_currency ||
      quoteResp?.charge_currency ||
      quoteResp?.currency ||
      'USD'
    const deliveryOptionsRaw = quoteResp?.delivery_options || null

    if (!quoteId || !pricing) return null
    return {
      quote_id: String(quoteId),
      currency: String(qCurrency),
      pricing: {
        subtotal: Number(pricing.subtotal) || 0,
        discount_total: Number(pricing.discount_total) || 0,
        shipping_fee: Number(pricing.shipping_fee) || 0,
        tax: Number(pricing.tax) || 0,
        total: Number(pricing.total) || 0,
      },
      promotion_lines: Array.isArray(quoteResp?.promotion_lines) ? quoteResp.promotion_lines : [],
      line_items: quoteResp?.line_items || [],
      delivery_options: Array.isArray(deliveryOptionsRaw) ? deliveryOptionsRaw : undefined,
      discount_evidence: quoteResp?.discount_evidence || undefined,
      store_discount_evidence: quoteResp?.store_discount_evidence || undefined,
      payment_offer_evidence: quoteResp?.payment_offer_evidence || undefined,
      payment_pricing: quoteResp?.payment_pricing || undefined,
    }
  }

  const refreshQuote = async (deliveryOptionOverride?: any): Promise<QuotePreview> => {
    const quoteReq = buildQuoteRequest(deliveryOptionOverride ?? selectedDeliveryOption)
    if (!Array.isArray(quoteReq.items) || quoteReq.items.length !== items.length) {
      throw new Error('Some items are missing variant information and cannot be priced.')
    }
    if (!quoteReq.items.length) {
      throw new Error('No items to quote.')
    }
    const quoteResp = await previewQuote(quoteReq)
    const normalized = normalizeQuote(quoteResp)
    if (!normalized) throw new Error('Failed to calculate pricing. Please try again.')
    setQuote(normalized)
    const opts = Array.isArray(normalized.delivery_options) ? normalized.delivery_options : []
    if (opts.length > 0) {
      if (deliveryOptionOverride) setSelectedDeliveryOption(deliveryOptionOverride)
      else setSelectedDeliveryOption((prev: any) => prev || opts[0] || null)
    } else {
      setSelectedDeliveryOption(null)
    }
    return normalized
  }

  const refreshQuoteWithRetry = async (
    deliveryOptionOverride?: any,
  ): Promise<QuotePreview> => {
    try {
      setQuotePending(true)
      return await refreshQuote(deliveryOptionOverride)
    } catch (err: any) {
      const code = String(err?.code || '').trim().toUpperCase()

      if (isInventoryUnavailable(err)) {
        const meta = extractInventoryIssue(err)
        const itemTitle =
          meta?.variant_id
            ? items.find((it) => String(it.variant_id || '').trim() === meta.variant_id)?.title ||
              null
            : null
        if (code === 'OUT_OF_STOCK') {
          toast.error('Item is out of stock', {
            description: itemTitle
              ? `${itemTitle} is no longer available. Please update your cart.`
              : 'Some items are no longer available. Please update your cart.',
          })
        } else {
          const rq = meta?.requested_quantity
          const aq = meta?.available_quantity
          toast.error('Not enough stock available', {
            description: itemTitle
              ? `${itemTitle}${
                  Number.isFinite(aq) ? ` (available: ${aq})` : ''
                }${
                  Number.isFinite(rq) ? ` (requested: ${rq})` : ''
                }. Please adjust quantity and try again.`
              : 'Please adjust quantity and try again.',
          })
        }
        throw err
      }

      if (isRetryableQuoteError(err)) {
        const msg =
          code === 'UPSTREAM_TIMEOUT'
            ? 'Store took too long to respond. Retrying…'
            : code === 'TEMPORARY_UNAVAILABLE'
              ? 'Checkout is busy. Retrying…'
              : 'Retrying…'
        toast.message(msg)
        await sleep(1200)
        return await refreshQuote(deliveryOptionOverride)
      }

      throw err
    } finally {
      setQuotePending(false)
    }
  }

  // Helper to create order once and hydrate PSP/payment_action state
  const createOrderIfNeeded = async (
    quoteForOrder: QuotePreview,
    options: { forceNew?: boolean; allowRedirect?: boolean } = {},
  ): Promise<string> => {
    let orderId = options.forceNew ? '' : createdOrderId
    if (orderId) return orderId

    if (offerIdsInCart.length > 1) {
      throw new Error('Multiple offers in one checkout are not supported yet.')
    }
    const offerId = offerIdForOrder || null
    const merchantIdFromOffer = offerId ? extractMerchantIdFromOfferId(offerId) : null
    const merchantId = String(items[0]?.merchant_id || '').trim() || merchantIdForOrder || merchantIdFromOffer
    if (!merchantId && !offerId) {
      throw new Error('Missing seller selection. Please go back and choose a seller.')
    }

    const normalizedCountry = normalizeCountryCode(shipping.country)
    if (!normalizedCountry) {
      throw new Error('Please select a valid country.')
    }

    const lineItemPriceByVariant = new Map<string, number>()
    for (const li of quoteForOrder?.line_items || []) {
      if (!li?.variant_id) continue
      const price = Number((li as any).unit_price_effective)
      if (Number.isFinite(price)) lineItemPriceByVariant.set(li.variant_id, price)
    }

    markCheckoutTiming('create_order_started_at_ms', { onlyIfMissing: true })
    const orderResponse = await createOrder({
      // Keep backwards compatibility: merchant_id is still sent even when offer_id is present.
      merchant_id: merchantId || 'unknown',
      customer_email: shipping.email,
      currency: quoteForOrder.currency || currency,
      ...(offerId ? { offer_id: offerId } : {}),
      ...(quoteForOrder?.quote_id ? { quote_id: quoteForOrder.quote_id } : {}),
      ...(selectedDeliveryOption ? { selected_delivery_option: selectedDeliveryOption } : {}),
      metadata: {
        ...(buyerRef ? { buyer_ref: buyerRef } : {}),
        ...(jobId ? { job_id: jobId } : {}),
        ...(market ? { market } : {}),
        ...(locale ? { locale } : {}),
        ...(entryMode ? { checkout_entry_mode: entryMode } : {}),
        ...(fallbackReason ? { checkout_fallback_reason: fallbackReason } : {}),
        ui_source: 'checkout_ui',
        ...(enforceLiveReadiness
          ? {}
          : {
              enforce_live_readiness: false,
              allow_test_psp_surfaces: true,
            }),
      },
      items: items.map((item) => {
        const variantId = getVariantIdForItem(item)
        const effectiveUnitPrice =
          variantId && lineItemPriceByVariant.has(variantId)
            ? Number(lineItemPriceByVariant.get(variantId))
            : item.unit_price
        return {
          merchant_id: item.merchant_id || merchantId || 'unknown',
          product_id: item.product_id,
          product_title: item.title,
          ...(variantId ? { variant_id: variantId } : {}),
          ...(item.sku ? { sku: item.sku } : {}),
          ...(item.selected_options ? { selected_options: item.selected_options } : {}),
          quantity: item.quantity,
          unit_price: effectiveUnitPrice,
          subtotal: effectiveUnitPrice * item.quantity,
        }
      }),
      shipping_address: {
        name: shipping.name,
        address_line1: shipping.address_line1,
        address_line2: shipping.address_line2,
        city: shipping.city,
        ...(shipping.state ? { state: shipping.state } : {}),
        country: normalizedCountry,
        postal_code: shipping.postal_code,
        phone: shipping.phone
      },
      ...((requestedPreferredPsp || FORCE_PSP)
        ? { preferred_psp: requestedPreferredPsp || FORCE_PSP }
        : {}),
      ...(pickSelectedPaymentOfferId(paymentMethodEvidence)
        ? { selected_payment_offer_id: pickSelectedPaymentOfferId(paymentMethodEvidence) as string }
        : {}),
      ...(paymentMethodEvidence ? { payment_method_evidence: paymentMethodEvidence } : {}),
    })
    markCheckoutTiming('create_order_completed_at_ms')

    // Minimal, token-safe debug logging (do not print payment client secrets / tokens).
    // eslint-disable-next-line no-console
    console.log('[checkout] createOrder', {
      order_id: (orderResponse as any)?.order_id || null,
      resolved_offer_id: (orderResponse as any)?.resolved_offer_id || null,
      resolved_merchant_id: (orderResponse as any)?.resolved_merchant_id || null,
    })
    const nextOrderDebug = {
      order_id: (orderResponse as any)?.order_id || null,
      resolved_offer_id: (orderResponse as any)?.resolved_offer_id || null,
      resolved_merchant_id: (orderResponse as any)?.resolved_merchant_id || null,
      order_lines: Array.isArray((orderResponse as any)?.order_lines)
        ? (orderResponse as any).order_lines
        : null,
    }
    setOrderDebug(nextOrderDebug)

    orderId = orderResponse.order_id
    setCreatedOrderId(orderId)
    if (paymentMethodEvidence) {
      try {
        await recordPaymentOfferEvidence({
          order_id: orderId,
          ...(quoteForOrder?.quote_id ? { quote_id: quoteForOrder.quote_id } : {}),
          ...(merchantId ? { merchant_id: merchantId } : {}),
          selected_payment_offer_id: pickSelectedPaymentOfferId(paymentMethodEvidence) || undefined,
          payment_method_evidence: paymentMethodEvidence,
          payment_offer_evidence: quoteForOrder?.payment_offer_evidence,
          surface: 'checkout',
          event_type: 'payment_offer.psp_evidence_received',
          idempotency_key: [orderId, quoteForOrder?.quote_id, 'create_order'].filter(Boolean).join(':'),
        })
      } catch {
        // Evidence logging is non-mutating and must not block order creation.
      }
    }

    const orderPayment = (orderResponse as any)?.payment || {}
    let orderPaymentAction: any =
      (orderResponse as any)?.payment_action || orderPayment?.payment_action

    let orderPsp: string | null =
      (orderResponse as any)?.psp ||
      orderPayment?.psp ||
      (orderPaymentAction && orderPaymentAction.psp) ||
      null

    const paymentIntentId = orderPayment?.payment_intent_id as string | undefined
    const paymentClientSecret = orderPayment?.client_secret as string | undefined

    // Heuristic: if intent looks like an Adyen session, treat as Adyen even
    // when the backend hasn't populated unified PSP fields yet.
    if (!orderPsp && paymentIntentId?.startsWith('adyen_session')) {
      orderPsp = 'adyen'
      if (!orderPaymentAction && paymentClientSecret) {
        orderPaymentAction = {
          type: 'adyen_session',
          client_secret: paymentClientSecret,
          url: null,
          raw: null,
        }
      }
    }

    assertSupportedPaymentSurface(orderResponse, orderPaymentAction, orderPsp)

    createdOrderPaymentRef.current = {
      orderId,
      paymentResponse: orderResponse,
      action: orderPaymentAction,
      psp: orderPsp,
    }

    if (shouldHydrateCreatedOrderPaymentSurface(orderPaymentAction, orderPsp)) {
      setInitialPaymentAction(orderPaymentAction)
      setPaymentActionType(orderPaymentAction?.type || null)
      if (orderPsp) {
        setPspUsed(orderPsp)
      }
      syncStripeRuntime(orderResponse, orderPaymentAction, orderPsp)
    }

    const allowRedirect = options.allowRedirect !== false
    if (allowRedirect && orderPaymentAction?.type === 'redirect_url' && orderPaymentAction?.url) {
      window.location.href = orderPaymentAction.url
      return orderId
    }

    return orderId
  }

  const buildOrderSuccessPath = (
    orderId: string,
    options: OrderCompletionOptions = {},
  ): string | undefined => {
    if (typeof window === 'undefined') return undefined
    const url = new URL('/order/success', window.location.origin)
    url.searchParams.set('orderId', orderId)
    if (options.finalizing) url.searchParams.set('finalizing', '1')
    if (returnUrl) url.searchParams.set('return', returnUrl)
    const current = new URL(window.location.href)
    const passthrough = ['entry', 'embed', 'lang', 'aurora_uid', 'parent_origin']
    for (const key of passthrough) {
      const value = (current.searchParams.get(key) || '').trim()
      if (value) url.searchParams.set(key, value)
    }
    if (checkoutToken) url.searchParams.set('checkout_token', checkoutToken)
    return `${url.pathname}${url.search}`
  }

  const buildPostPayReturnUrl = (orderId: string): string | undefined => {
    const successPath = buildOrderSuccessPath(orderId, { finalizing: true })
    if (!successPath || typeof window === 'undefined') return undefined
    return new URL(successPath, window.location.origin).toString()
  }

  const stripeClientSecretForRender =
    initialPaymentAction?.type === 'stripe_client_secret' &&
    typeof initialPaymentAction?.client_secret === 'string'
      ? initialPaymentAction.client_secret
      : null
  const stripeReturnUrlForRender = createdOrderId
    ? buildPostPayReturnUrl(createdOrderId) || null
    : null
  const stripeMethodLabel = formatStripePaymentMethodLabel(stripeSelectedMethodType)
  const isExternalRedirectPayment = paymentActionType === 'redirect_url'
  const paymentProviderLabel =
    pspUsed === 'adyen'
      ? 'Adyen (hosted card form)'
      : paymentActionType === 'checkout_session'
        ? 'Checkout.com (session)'
      : pspUsed === 'stripe' || paymentActionType === 'stripe_client_secret'
          ? stripeMethodLabel
            ? `Stripe (${stripeMethodLabel})`
            : 'Stripe (payment methods)'
          : isExternalRedirectPayment
            ? 'Redirect checkout'
            : 'Card payment'
  const paymentButtonLabel = isProcessing
    ? 'Processing...'
    : paymentInitLoading
      ? 'Preparing payment...'
      : isExternalRedirectPayment
          ? 'Continue to merchant payment'
          : `Pay ${formatAmount(total)}`

  const finalizeOrderAfterPayment = async (orderId: string): Promise<OrderCompletionOptions> => {
    const confirmation = await confirmPaymentWithRetry({
      orderId,
      confirmPayment: confirmOrderPayment,
      maxAttempts: 3,
      retryDelayMs: 220,
    })
    return {
      finalizing: confirmation.status !== 'confirmed',
    }
  }

  const completeCheckoutForOrder = async (targetOrderId: string, paymentIdValue?: string) => {
    setPaymentId(paymentIdValue || '')
    setStep('confirm')
    toast.success('Payment completed successfully.')
    clearCart()
    const completionOptions = await finalizeOrderAfterPayment(targetOrderId)
    if (onComplete) {
      onComplete(targetOrderId, completionOptions)
      return
    }
    const successPath = buildOrderSuccessPath(targetOrderId, completionOptions)
    router.push(successPath || `/orders/${targetOrderId}?paid=1`)
  }

  const continuePendingPaymentConfirmationForOrder = async (
    targetOrderId: string,
    paymentIdValue?: string,
  ) => {
    setPaymentId(paymentIdValue || '')
    setStep('confirm')
    const completionOptions = { finalizing: true }
    toast.message('Confirming payment status…', {
      description: 'Your order was created. We are waiting for the final paid confirmation.',
    })
    clearCart()
    if (onComplete) {
      onComplete(targetOrderId, completionOptions)
      return
    }
    const successPath = buildOrderSuccessPath(targetOrderId, completionOptions)
    router.push(successPath || `/orders/${targetOrderId}?paid=1`)
  }

  const handleStripeConfirmationResult = async (result: {
    error?: string
    status?: string
    paymentIntentId?: string
  }) => {
    if (!result) {
      throw new Error('Payment form is not ready. Please refresh and try again.')
    }
    if (result.error) {
      setCardError(result.error)
      throw new Error('Payment failed. Please check the payment details or try again.')
    }

    const activeOrderId = String(createdOrderId || '').trim()
    if (!activeOrderId) {
      throw new Error('Order is missing. Please refresh and try again.')
    }

    const status = result.status
    if (status === 'succeeded') {
      await recordPaymentMethodEvidence(
        {
          ...(paymentMethodEvidence || {}),
          psp: 'stripe',
          verification_status: 'psp_verified',
          eligible: true,
        },
        'payment_offer.psp_verified',
      )
      await completeCheckoutForOrder(activeOrderId, result.paymentIntentId || '')
      return
    }
    if (status === 'processing' || status === 'requires_capture') {
      await continuePendingPaymentConfirmationForOrder(activeOrderId, result.paymentIntentId || '')
      return
    }
    if (status === 'requires_action') {
      toast.message('Additional authentication required', {
        description: 'Continue in the verification window or redirected page to finish payment.',
      })
      return
    }
    throw new Error(
      'Payment could not be completed. Please try again or choose a different payment method.',
    )
  }

  const extractPaymentAction = (paymentResponse: any, fallbackAction: any = null) => {
    const paymentObj = (paymentResponse as any)?.payment || {}
    let action: any =
      (paymentResponse as any)?.payment_action ||
      paymentObj?.payment_action ||
      fallbackAction ||
      null
    if (!action) {
      const responseIntentId =
        (paymentResponse as any)?.payment_intent_id ||
        paymentObj?.payment_intent_id
      const responseClientSecret =
        (paymentResponse as any)?.client_secret ||
        paymentObj?.client_secret
      const responsePsp =
        (paymentResponse as any)?.psp ||
        paymentObj?.psp ||
        pspUsed ||
        null
      if (
        typeof responseIntentId === 'string' &&
        responseIntentId.startsWith('adyen_session') &&
        typeof responseClientSecret === 'string' &&
        responseClientSecret
      ) {
        action = {
          type: 'adyen_session',
          client_secret: responseClientSecret,
          url: null,
          raw: null,
        }
      } else if (typeof responseClientSecret === 'string' && responseClientSecret) {
        if (/^https?:\/\//i.test(responseClientSecret)) {
          action = {
            type: 'redirect_url',
            url: responseClientSecret,
            client_secret: null,
            raw: null,
          }
        } else if (
          responsePsp === 'stripe' ||
          !responsePsp ||
          responseClientSecret.includes('_secret_')
        ) {
          action = {
            type: 'stripe_client_secret',
            client_secret: responseClientSecret,
            url: null,
            raw: null,
          }
        }
      }
    }
    return action
  }

  const detectPaymentPsp = (paymentResponse: any, action: any) => {
    const paymentObj = (paymentResponse as any)?.payment || {}
    let detectedPsp: string | null =
      (paymentResponse as any)?.psp ||
      paymentObj?.psp ||
      action?.psp ||
      pspUsed ||
      null
    if (!detectedPsp) {
      const responseIntentId =
        paymentObj?.payment_intent_id ||
        (paymentResponse as any)?.payment_intent_id
      if (
        typeof responseIntentId === 'string' &&
        responseIntentId.startsWith('adyen_session')
      ) {
        detectedPsp = 'adyen'
      }
    }
    return detectedPsp
  }

  const mountAdyenDropIn = async (args: { orderId: string; action: any; paymentResponse: any }) => {
    const { orderId, action, paymentResponse } = args
    const sessionData = action?.client_secret
    let sessionId =
      action?.raw?.id ||
      paymentResponse?.payment_intent_id ||
      paymentResponse?.payment?.payment_intent_id ||
      ''

    if (sessionId && sessionId.startsWith('adyen_session_')) {
      sessionId = sessionId.replace('adyen_session_', '')
    }

    const clientKey = action?.raw?.clientKey || ADYEN_CLIENT_KEY
    if (!sessionData || !clientKey) {
      throw new Error('Adyen session is missing required data. Please try again.')
    }

    if (adyenMounted && adyenContainerRef.current) {
      return
    }

    const { default: AdyenCheckout } = await import('@adyen/adyen-web')
    const checkout = await AdyenCheckout({
      clientKey,
      environment: 'test', // use 'live' in production with proper key
      session: {
        id: sessionId,
        sessionData,
      },
      analytics: { enabled: false },
      onPaymentCompleted: () => {
        void (async () => {
          setStep('confirm')
          toast.success('Payment completed successfully.')
          clearCart()
          const completionOptions = await finalizeOrderAfterPayment(orderId)
          if (onComplete) {
            onComplete(orderId, completionOptions)
            return
          }
          const successPath = buildOrderSuccessPath(orderId, completionOptions)
          router.push(successPath || `/orders/${orderId}?paid=1`)
        })()
      },
      onError: (err: any) => {
        console.error('Adyen error:', err)
        toast.error('Payment failed with Adyen. Please check your card details or try again.')
        if (onFailure) onFailure({ reason: 'payment_failed', stage: 'payment' })
      },
    })

    if (!adyenContainerRef.current) {
      throw new Error('Payment form is not ready. Please refresh the page and try again.')
    }
    checkout.create('dropin').mount(adyenContainerRef.current)
    setAdyenMounted(true)
  }

  const runTimedProcessPayment = async (payload: {
    order_id: string
    total_amount: number
    currency: string
    payment_method: { type: string }
    return_url?: string
  }) => {
    markCheckoutTiming('submit_payment_started_at_ms', { onlyIfMissing: true })
    try {
      return await processPayment(payload)
    } finally {
      markCheckoutTiming('submit_payment_completed_at_ms')
    }
  }

  const primePaymentForStep = async (quoteForPayment: QuotePreview): Promise<PrefetchedPaymentInit> => {
    let workingQuote = quoteForPayment
    let orderId = await createOrderIfNeeded(workingQuote, { allowRedirect: false })
    const buildPayload = (quoteArg: QuotePreview, orderIdArg: string) => ({
      order_id: orderIdArg,
      total_amount: Number(quoteArg.pricing.total) || total,
      currency: String(quoteArg.currency || currency || 'USD'),
      payment_method: { type: resolveCheckoutPaymentMethodHint(stripeSelectedMethodType) },
      return_url: buildPostPayReturnUrl(orderIdArg),
    })

    let paymentResponse: any
    const createdOrderPayment = getReusableCreatedOrderPayment(orderId)
    if (createdOrderPayment) {
      paymentResponse = createdOrderPayment.paymentResponse
    }
    try {
      if (!paymentResponse) {
        paymentResponse = await runTimedProcessPayment(buildPayload(workingQuote, orderId))
      }
    } catch (err: any) {
      if (isQuoteDrift(err)) {
        clearCreatedOrderPaymentSnapshot()
        setCreatedOrderId('')
        setInitialPaymentAction(null)
        setPaymentActionType(null)
        setPspUsed(null)
        workingQuote = await refreshQuoteWithRetry()
        orderId = await createOrderIfNeeded(workingQuote, { forceNew: true, allowRedirect: false })
        const nextCreatedOrderPayment = getReusableCreatedOrderPayment(orderId)
        paymentResponse =
          nextCreatedOrderPayment?.paymentResponse ||
          (await runTimedProcessPayment(buildPayload(workingQuote, orderId)))
      } else {
        throw err
      }
    }

    return {
      orderId,
      quoteId: String(workingQuote.quote_id),
      paymentResponse,
    }
  }

  const startPaymentInitForQuote = (quoteForPayment: QuotePreview): Promise<PrefetchedPaymentInit> | null => {
    const nextPaymentInitKey = buildPaymentInitKeyForQuote(quoteForPayment, currency)
    if (!nextPaymentInitKey) return null
    if (paymentInitKeyRef.current === nextPaymentInitKey && paymentInitPromiseRef.current) {
      return paymentInitPromiseRef.current
    }

    const runId = paymentInitRunIdRef.current + 1
    paymentInitRunIdRef.current = runId
    markCheckoutTiming('payment_init_started_at_ms', { onlyIfMissing: true })
    setPaymentInitLoading(true)
    setPaymentInitError(null)
    setPrefetchedPaymentRes(null)
    // Pre-warm Adyen SDK to reduce first-render jitter.
    void import('@adyen/adyen-web').catch(() => null)

    const initPromise = primePaymentForStep(quoteForPayment)
    paymentInitKeyRef.current = nextPaymentInitKey
    paymentInitPromiseRef.current = initPromise

    initPromise
      .then((prefetched) => {
        if (paymentInitRunIdRef.current !== runId) return
        const action = extractPaymentAction(prefetched.paymentResponse, initialPaymentAction)
        const detectedPsp = detectPaymentPsp(prefetched.paymentResponse, action)
        assertSupportedPaymentSurface(prefetched.paymentResponse, action, detectedPsp)
        setPrefetchedPaymentRes(prefetched)
        setPaymentInitError(null)
        setInitialPaymentAction(action)
        setPaymentActionType(action?.type || null)
        setPspUsed(detectedPsp)
        syncStripeRuntime(prefetched.paymentResponse, action, detectedPsp)
      })
      .catch((err: any) => {
        if (paymentInitRunIdRef.current !== runId) return
        if (isCheckoutRestartRequired(err)) {
          setCheckoutFailure({
            message:
              String(err?.message || '').trim() ||
              'This checkout link is invalid or expired. Please restart checkout to continue.',
          })
          setPaymentInitError(null)
          return
        }
        const msg = String(err?.message || '').trim() || 'Failed to prepare payment'
        setPaymentInitError(msg)
      })
      .finally(() => {
        if (paymentInitPromiseRef.current === initPromise) {
          paymentInitPromiseRef.current = null
        }
        if (paymentInitRunIdRef.current === runId) {
          setPaymentInitLoading(false)
        }
      })

    return initPromise
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!resumeOrder?.orderId) return
    resumeHydratingRef.current = true

    const nextShipping = resumeOrder.shipping || null
    if (nextShipping) {
      setShipping((prev) => ({
        ...prev,
        ...nextShipping,
        country: normalizeCountryCode(nextShipping.country || prev.country) || prev.country,
      }))
      if (nextShipping.email) {
        setVerifiedEmail((prev) => prev || nextShipping.email || null)
      }
    }

    if (resumeOrder.quote) {
      setQuote(resumeOrder.quote)
    }

    setCreatedOrderId(resumeOrder.orderId)

    const paymentResponse = resumeOrder.paymentResponse
    if (paymentResponse) {
      const action = extractPaymentAction(paymentResponse, null)
      const detectedPsp = detectPaymentPsp(paymentResponse, action)
      createdOrderPaymentRef.current = {
        orderId: resumeOrder.orderId,
        paymentResponse,
        action,
        psp: detectedPsp,
      }
      setInitialPaymentAction(action)
      setPaymentActionType(action?.type || null)
      setPspUsed(detectedPsp || null)
      syncStripeRuntime(paymentResponse, action, detectedPsp)
    }

    setStep('payment')
    setCheckoutFailure(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeOrder])

  useEffect(() => {
    if (resumeHydratingRef.current) {
      if (step === 'payment') {
        resumeHydratingRef.current = false
      }
      return
    }
    if (step === 'payment') return
    paymentInitRunIdRef.current += 1
    paymentInitPromiseRef.current = null
    paymentInitKeyRef.current = null
    setPrefetchedPaymentRes(null)
    setPaymentInitLoading(false)
    setPaymentInitError(null)
    clearCreatedOrderPaymentSnapshot()
    resetCheckoutTiming()
    setStripePublishableKey(DEFAULT_STRIPE_PUBLISHABLE_KEY)
    setStripeAccount(null)
    setStripeSelectedMethodType(null)
  }, [resetCheckoutTiming, step])

  useEffect(() => {
    if (step !== 'payment') return
    if (!quote?.quote_id || !paymentInitKey) return
    if (
      paymentInitKeyRef.current === paymentInitKey &&
      (paymentInitPromiseRef.current || prefetchedPaymentRes)
    ) {
      return
    }
    startPaymentInitForQuote(quote)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentInitKey,
    quote?.quote_id,
    step,
  ])

  useEffect(() => {
    if (step !== 'payment') return
    markCheckoutTiming('payment_step_visible_at_ms', { onlyIfMissing: true })
  }, [markCheckoutTiming, step])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      sessionStorage.setItem(
        'pivota_checkout_debug',
        JSON.stringify(
          {
            selected_offer_id: offerIdForOrder || null,
            selected_merchant_id: merchantIdForOrder || null,
            entry_mode: entryMode || null,
            fallback_reason: fallbackReason || null,
            ...(orderDebug || {}),
            timing: checkoutTimingSnapshot,
          },
          null,
          2,
        ),
      )
    } catch {
      // ignore storage errors
    }
  }, [checkoutTimingSnapshot, entryMode, fallbackReason, merchantIdForOrder, offerIdForOrder, orderDebug])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step !== 'payment') return
    if (paymentActionType !== 'adyen_session') return
    if (adyenMounted) return
    if (!prefetchedPaymentRes) return

    const action = extractPaymentAction(prefetchedPaymentRes.paymentResponse, initialPaymentAction)
    if (action?.type !== 'adyen_session') return

    void mountAdyenDropIn({
      orderId: prefetchedPaymentRes.orderId,
      action,
      paymentResponse: prefetchedPaymentRes.paymentResponse,
    }).catch((err: any) => {
      const msg = String(err?.message || '').trim() || 'Failed to initialize Adyen payment form.'
      setPaymentInitError(msg)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    adyenMounted,
    initialPaymentAction,
    paymentActionType,
    prefetchedPaymentRes,
    step,
  ])

  // If already logged in, prefill email and skip verification UI
  useEffect(() => {
    if (user?.email) {
      setShipping((prev) => ({ ...prev, email: prev.email || user.email! }))
      setVerifiedEmail(user.email || null)
    }
  }, [user])

  const handlePasswordSignIn = async () => {
    setOtpLoading(true)
    try {
      const data = await accountsLoginWithPassword(
        shipping.email.trim(),
        loginPassword,
      )
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      })
      setVerifiedEmail(shipping.email.trim())
      setLoginPassword('')
      toast.success('Signed in')
    } catch (err: any) {
      const code = err?.code
      if (code === 'NO_PASSWORD') {
        toast.error('No password is set. Use email code once, then set a password.')
        setAuthMethod('otp')
      } else if (code === 'INVALID_CREDENTIALS') {
        toast.error('Email or password is incorrect')
      } else {
        toast.error(err?.message || 'Sign in failed')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  const handleSendOtp = async () => {
    setOtpLoading(true)
    try {
      await accountsLogin(shipping.email.trim())
      setOtpSent(true)
      toast.success('Code sent to your email')
    } catch (err: any) {
      const code = err?.code
      if (code === 'INVALID_INPUT') toast.error('Please enter a valid email')
      else if (code === 'RATE_LIMITED') {
        toast.error('Too many requests, please retry later')
      } else {
        toast.error(err?.message || 'Failed to send code')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    setOtpLoading(true)
    try {
      const data = await accountsVerify(shipping.email.trim(), otp.trim())
      setSession({
        user: (data as any).user,
        memberships: (data as any).memberships || [],
        active_merchant_id: (data as any).active_merchant_id,
      })
      setVerifiedEmail(shipping.email.trim())
      toast.success('Email verified and logged in')
    } catch (err: any) {
      const code = err?.code
      if (code === 'INVALID_OTP') toast.error('Code invalid or expired')
      else if (code === 'RATE_LIMITED') {
        toast.error('Too many attempts, please retry later')
      } else {
        toast.error(err?.message || 'Verification failed')
      }
    } finally {
      setOtpLoading(false)
    }
  }

  const cardClassName =
    'rounded-[24px] border border-white/80 bg-white/95 px-4 py-4 shadow-[0_16px_40px_rgba(56,88,162,0.1)] backdrop-blur sm:px-5 sm:py-5 md:px-6 md:py-6 lg:rounded-[28px]'
  const fieldClassName =
    'w-full rounded-[18px] border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100'
  const helperTextClassName = 'text-[13px] leading-5 text-slate-500'
  const stepIndex = CHECKOUT_STEPS.findIndex((item) => item.id === step)

  const hasSellerSelection = Boolean(merchantIdForOrder || offerIdForOrder)
  if (items.length > 0 && !hasSellerSelection) {
    return (
      <div className="min-h-[70vh] bg-background flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 backdrop-blur p-6">
          <div className="text-lg font-semibold">Choose a seller to continue</div>
          <div className="mt-1 text-sm text-muted-foreground">
            This checkout requires an explicit seller selection. Please go back and choose a seller/offer, then retry.
          </div>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-2xl border border-border bg-white/70 hover:bg-white/90 transition-colors px-4 py-2 text-sm font-semibold"
              onClick={() => router.back()}
            >
              Go back
            </button>
            <button
              type="button"
              className="flex-1 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-4 py-2 text-sm font-semibold"
              onClick={() => router.push('/products')}
            >
              Browse products
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleShippingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!skipEmailVerification && !user && verifiedEmail !== shipping.email.trim()) {
      toast.error('Please verify your email to continue.')
      return
    }
    try {
      resetCheckoutTiming()
      markCheckoutTiming('shipping_submit_started_at_ms')
      void prewarmStripeRuntime(stripePublishableKey || DEFAULT_STRIPE_PUBLISHABLE_KEY, stripeAccount)
      setCheckoutFailure(null)
      setIsProcessing(true)
      // Reset any existing order if shipping changes.
      setCreatedOrderId('')
      setInitialPaymentAction(null)
      setPaymentActionType(null)
      setPspUsed(null)
      setInitialPaymentAction(null)
      setStripeSelectedMethodType(null)
      clearCreatedOrderPaymentSnapshot()
      setAdyenMounted(false)
      paymentInitRunIdRef.current += 1
      paymentInitPromiseRef.current = null
      paymentInitKeyRef.current = null
      setPrefetchedPaymentRes(null)
      setPaymentInitLoading(false)
      setPaymentInitError(null)

      try {
        const nextQuote = await refreshQuoteWithRetry()
        markCheckoutTiming('quote_ready_at_ms')
        void startPaymentInitForQuote(nextQuote)
      } catch (err: any) {
        if (isInventoryUnavailable(err)) {
          if (onFailure) onFailure({ reason: 'action_required', stage: 'shipping' })
          return
        }
        throw err
      }
      setStep('payment')
    } catch (err: any) {
      console.error('Create order error:', err)
      if (isCheckoutRestartRequired(err)) {
        const message =
          String(err?.message || '').trim() ||
          'This checkout link is invalid or expired. Please restart checkout to continue.'
        setCheckoutFailure({ message })
        toast.error(message)
        return
      }
      const code = String(err?.code || '').trim().toUpperCase()
      const fallback =
        code === 'TEMPORARY_UNAVAILABLE'
          ? 'Service is temporarily busy. Please retry in a few seconds.'
          : code === 'UPSTREAM_TIMEOUT'
            ? 'The store took too long to respond. Please try again.'
            : err?.message || 'Failed to calculate pricing'
      toast.error(fallback)
      if (onFailure) onFailure({ reason: 'system_error', stage: 'shipping' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    setCardError('')
    setPaymentInitError(null)
    setCheckoutFailure(null)
    
    try {
      if (!skipEmailVerification && !user && verifiedEmail !== shipping.email.trim()) {
        throw new Error('Please verify your email before paying.')
      }
      if (!quote?.quote_id) {
        throw new Error('Please enter your shipping address to calculate totals before paying.')
      }

      const runPayment = async (quoteOverride?: QuotePreview) => {
        let quoteForPayment = quoteOverride || quote
        if (!quoteForPayment || !quoteForPayment.quote_id) {
          throw new Error('Please enter your shipping address to calculate totals before paying.')
        }

        let quoteDriftFixed = false
        const resetForRequote = () => {
          setCreatedOrderId('')
          setInitialPaymentAction(null)
          setPaymentActionType(null)
          setPspUsed(null)
          clearCreatedOrderPaymentSnapshot()
        }

        // Step 1: Create order if not already created
        let orderId = ''
        try {
          orderId = await createOrderIfNeeded(quoteForPayment)
        } catch (err: any) {
          if (isInventoryUnavailable(err)) {
            if (onFailure) onFailure({ reason: 'action_required', stage: 'payment' })
            throw err
          }
          if (isQuoteDrift(err) && !quoteDriftFixed) {
            quoteDriftFixed = true
            toast.message('Pricing updated. Refreshing totals…')
            resetForRequote()
            quoteForPayment = await refreshQuoteWithRetry()
            orderId = await createOrderIfNeeded(quoteForPayment, { forceNew: true })
          } else {
            throw err
          }
        }
        
        // Step 2: Create/confirm payment intent via gateway (prefer prefetched result).
        const quoteKeyForRun = buildPaymentInitKeyForQuote(quoteForPayment, currency)
        let paymentResponse: any
        const canReusePrefetch =
          quoteKeyForRun &&
          paymentInitKeyRef.current === quoteKeyForRun
        if (canReusePrefetch) {
          if (prefetchedPaymentRes?.quoteId === quoteForPayment.quote_id) {
            orderId = prefetchedPaymentRes.orderId || orderId
            paymentResponse = prefetchedPaymentRes.paymentResponse
          } else if (paymentInitPromiseRef.current) {
            try {
              const prefetched = await paymentInitPromiseRef.current
              if (prefetched?.quoteId === quoteForPayment.quote_id) {
                orderId = prefetched.orderId || orderId
                paymentResponse = prefetched.paymentResponse
                setPrefetchedPaymentRes(prefetched)
              }
            } catch {
              paymentResponse = null
            }
          }
        }
        if (!paymentResponse) {
          const createdOrderPayment = getReusableCreatedOrderPayment(orderId)
          if (createdOrderPayment) {
            paymentResponse = createdOrderPayment.paymentResponse
          }
        }
        if (!paymentResponse) {
          try {
            paymentResponse = await runTimedProcessPayment({
              order_id: orderId,
              total_amount: Number(quoteForPayment.pricing.total) || total,
              currency: String(quoteForPayment.currency || currency || 'USD'),
              payment_method: {
                type: resolveCheckoutPaymentMethodHint(stripeSelectedMethodType),
              },
              return_url: buildPostPayReturnUrl(orderId),
            })
          } catch (err: any) {
            if (isInventoryUnavailable(err)) {
              if (onFailure) onFailure({ reason: 'action_required', stage: 'payment' })
              throw err
            }
            if (isQuoteDrift(err) && !quoteDriftFixed) {
              quoteDriftFixed = true
              toast.message('Pricing updated. Refreshing totals…')
              resetForRequote()
              quoteForPayment = await refreshQuoteWithRetry()
              orderId = await createOrderIfNeeded(quoteForPayment, { forceNew: true })
              const nextCreatedOrderPayment = getReusableCreatedOrderPayment(orderId)
                paymentResponse =
                nextCreatedOrderPayment?.paymentResponse ||
                (await runTimedProcessPayment({
                  order_id: orderId,
                  total_amount: Number(quoteForPayment.pricing.total) || total,
                  currency: String(quoteForPayment.currency || currency || 'USD'),
                  payment_method: {
                    type: resolveCheckoutPaymentMethodHint(stripeSelectedMethodType),
                  },
                  return_url: buildPostPayReturnUrl(orderId),
                }))
            } else {
              throw err
            }
          }
        }

        // Token-safe debug logging: do not print client secrets / tokens.
        // eslint-disable-next-line no-console
        console.log('[checkout] submitPayment', {
          payment_id: (paymentResponse as any)?.payment_id || (paymentResponse as any)?.payment?.payment_id || null,
          payment_intent_id:
            (paymentResponse as any)?.payment_intent_id ||
            (paymentResponse as any)?.payment?.payment_intent_id ||
            null,
          payment_action_type:
            (paymentResponse as any)?.payment_action?.type ||
            (paymentResponse as any)?.payment?.payment_action?.type ||
            null,
        })
        const action = extractPaymentAction(paymentResponse, initialPaymentAction)
        const detectedPsp = detectPaymentPsp(paymentResponse, action)
        assertSupportedPaymentSurface(paymentResponse, action, detectedPsp)
        setPaymentActionType(action?.type || null)
        setPspUsed(detectedPsp || pspUsed || null)
        syncStripeRuntime(paymentResponse, action, detectedPsp || pspUsed || null)

        const redirectUrl =
          action?.url ||
          paymentResponse.redirect_url ||
          paymentResponse.payment?.redirect_url ||
          paymentResponse.next_action?.redirect_url

        const clientSecret =
          action?.client_secret ||
          paymentResponse.client_secret ||
          paymentResponse.payment?.client_secret
        const paymentContract = resolveCheckoutPaymentContract({
          paymentResponse,
          action,
        })
        if (!paymentContract.requiresClientConfirmation) {
          const paymentIdValue = String(
            (paymentResponse as any)?.payment_id ||
              (paymentResponse as any)?.payment?.payment_id ||
              '',
          )
          if (isBackendSettledPaymentStatus(paymentContract.paymentStatus)) {
            await completeCheckoutForOrder(orderId, paymentIdValue)
            return
          }
          await continuePendingPaymentConfirmationForOrder(orderId, paymentIdValue)
          return
        }

        // Client-owned confirmation paths.
        if (action?.type === 'redirect_url') {
          if (redirectUrl) {
            window.location.href = redirectUrl
            return
          }
          throw new Error('Payment requires redirect, but no URL provided')
        }

        if (action?.type === 'adyen_session') {
          await mountAdyenDropIn({ orderId, action, paymentResponse })
          setIsProcessing(false)
          return
        }

        if (action?.type === 'checkout_session') {
          throw new Error(
            'Checkout.com payment sessions are not yet supported in shopping UI. Route this checkout to Stripe or Adyen.',
          )
        }

        const isStripePsp = !detectedPsp || detectedPsp === 'stripe'
        if (clientSecret && isStripePsp) {
          if (!stripePublishableKey) {
            throw new Error(
              'Stripe public key is missing for this merchant. Reconnect Stripe and try again.',
            )
          }
          const stripeReturnUrl = buildPostPayReturnUrl(orderId)
          if (!stripeReturnUrl) {
            throw new Error('Payment return URL is missing. Please refresh and try again.')
          }
          const stripeResult = await stripePaymentSectionRef.current?.confirm({
            clientSecret,
            returnUrl: stripeReturnUrl,
            shipping,
          })
          await handleStripeConfirmationResult(
            stripeResult || { error: 'Payment form is not ready. Please refresh and try again.' },
          )
          return
        }

        throw new Error(
          'Payment confirmation requires client action, but no supported action was provided.',
        )
      }

      try {
        await runPayment()
      } catch (err: any) {
        if (isTemporaryUnavailable(err)) {
          toast.message('Checkout is busy. Retrying…')
          await sleep(1500)
          await runPayment()
        } else {
          throw err
        }
      }
    } catch (error: any) {
      console.error('Payment error:', error)
      if (isCheckoutRestartRequired(error)) {
        const message =
          String(error?.message || '').trim() ||
          'This checkout link is invalid or expired. Please restart checkout to continue.'
        setCheckoutFailure({ message })
        toast.error(message)
        return
      }
      const code = String(error?.code || '').trim().toUpperCase()
      const isActionRequired = isInventoryUnavailable(error)
      const isSystem =
        code === 'TEMPORARY_UNAVAILABLE' ||
        code === 'UPSTREAM_TIMEOUT' ||
        code === 'SHOPIFY_PRICING_UNAVAILABLE'
      toast.error(
        error?.message ||
          (isActionRequired
            ? 'Some items are no longer available. Please update your cart.'
            : isSystem
              ? 'Checkout service is temporarily unavailable. Please try again.'
              : 'Payment failed. Please try again.'),
      )
      if (onFailure) {
        onFailure({
          reason: isActionRequired
            ? 'action_required'
            : isSystem
              ? 'system_error'
              : 'payment_failed',
          stage: 'payment',
        })
      }
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-3 pb-3 sm:px-4 lg:max-w-6xl lg:px-5">
      <div className="mb-4 border-b border-slate-200/80">
        <div className="flex items-end gap-2 overflow-x-auto pb-0.5 lg:gap-4">
          {CHECKOUT_STEPS.map((item, index) => {
            const isActive = item.id === step
            const isComplete = index < stepIndex

            return (
              <div key={item.id} className="flex min-w-fit items-center gap-2 lg:gap-3">
                <div
                  className={`relative pb-3 text-[0.95rem] font-semibold transition-colors md:text-[1.35rem] md:leading-none ${
                    isActive
                      ? 'text-slate-900'
                      : isComplete
                        ? 'text-blue-600'
                        : 'text-slate-400'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
                  ) : null}
                </div>
                {index < CHECKOUT_STEPS.length - 1 ? (
                  <ChevronRight className="mb-3 h-4 w-4 flex-none text-slate-300" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {checkoutFailure ? (
        <div className="mb-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold text-amber-900">Checkout needs to be restarted</p>
          <p className="mt-1 text-amber-800">{checkoutFailure.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (onCancel) {
                  onCancel()
                  return
                }
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back()
                  return
                }
                router.push('/')
              }}
              className="rounded-[16px] bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
            >
              Restart checkout
            </button>
            <button
              type="button"
              onClick={() => setCheckoutFailure(null)}
              className="rounded-[16px] border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
            >
              Stay here
            </button>
          </div>
        </div>
      ) : null}

      {/* Step Content */}
      {step === 'shipping' && (
        <div className={cardClassName}>
          <form onSubmit={handleShippingSubmit} className="space-y-6 lg:space-y-0">
            <div className="lg:grid lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-5">
              <div className="space-y-4 lg:self-start lg:rounded-[24px] lg:border lg:border-slate-200 lg:bg-[linear-gradient(180deg,rgba(246,250,255,0.96),rgba(255,255,255,0.92))] lg:p-5 lg:shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <section className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <h2 className="text-[1.45rem] font-semibold tracking-tight text-slate-900 md:text-[1.6rem]">
                      Contact
                    </h2>
                    <p className={`${helperTextClassName} hidden sm:block`}>
                      For order confirmation and shipping updates.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[13px] font-semibold text-slate-900 sm:text-sm">Email</label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={shipping.email}
                      onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                      className={fieldClassName}
                    />
                    <p className={`${helperTextClassName} hidden sm:block`}>
                      We only use this for your receipt, shipping updates, and secure sign-in.
                    </p>
                  </div>

                  {!user && !skipEmailVerification && (
                    <>
                      <div className="space-y-2 rounded-[18px] border border-slate-200 bg-slate-50/80 p-3 sm:hidden">
                        {authMethod === 'password' ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-700">Sign in to continue</p>
                              <button
                                type="button"
                                disabled={otpLoading}
                                onClick={() => setAuthMethod('otp')}
                                className="text-xs font-medium text-blue-600 disabled:opacity-60"
                              >
                                Use email code
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                placeholder="Password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                className={`${fieldClassName} min-w-0 text-sm`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  void handlePasswordSignIn()
                                }}
                                className="shrink-0 rounded-[16px] bg-blue-600 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                                disabled={otpLoading || !loginPassword || !shipping.email}
                              >
                                {otpLoading ? '...' : 'Sign in'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-medium text-slate-700">
                                {otpSent ? 'Enter the 6-digit code' : 'Verify email to continue'}
                              </p>
                              <button
                                type="button"
                                disabled={otpLoading}
                                onClick={() => setAuthMethod('password')}
                                className="text-xs font-medium text-slate-500 disabled:opacity-60"
                              >
                                Password
                              </button>
                            </div>
                            {otpSent ? (
                              <div className="flex items-center gap-2">
                                <input
                                  placeholder="6-digit code"
                                  value={otp}
                                  onChange={(e) => setOtp(e.target.value)}
                                  className={`${fieldClassName} min-w-0 text-sm`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleVerifyOtp()
                                  }}
                                  className="shrink-0 rounded-[16px] bg-blue-600 px-3.5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                                  disabled={otpLoading || !otp || !shipping.email}
                                >
                                  Verify
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleSendOtp()
                                }}
                                className="w-full rounded-[16px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                                disabled={otpLoading || !shipping.email}
                              >
                                {otpLoading ? 'Sending...' : 'Send code'}
                              </button>
                            )}
                          </>
                        )}
                        {verifiedEmail === shipping.email.trim() ? (
                          <p className="text-xs text-green-600">Email verified.</p>
                        ) : null}
                      </div>

                      <div className="hidden rounded-[20px] border border-slate-200 bg-slate-50/80 p-3.5 sm:block">
                        <div className="flex flex-wrap gap-1.5 text-[11px] sm:text-xs">
                          <button
                            type="button"
                            disabled={otpLoading}
                            onClick={() => setAuthMethod('password')}
                            className={`rounded-full border px-2.5 py-1 font-medium transition ${
                              authMethod === 'password'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700'
                            } disabled:opacity-60`}
                          >
                            Password
                          </button>
                          <button
                            type="button"
                            disabled={otpLoading}
                            onClick={() => setAuthMethod('otp')}
                            className={`rounded-full border px-3 py-1.5 font-medium transition ${
                              authMethod === 'otp'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700'
                            } disabled:opacity-60`}
                          >
                            Email code
                          </button>
                        </div>

                        <div className="mt-2.5 space-y-2.5">
                          {authMethod === 'password' ? (
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                type="password"
                                placeholder="Password"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                className={`${fieldClassName} text-sm`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  void handlePasswordSignIn()
                                }}
                                className="rounded-[18px] bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                                disabled={otpLoading || !loginPassword || !shipping.email}
                              >
                                {otpLoading ? 'Signing in...' : 'Sign in'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleSendOtp()
                                  }}
                                  className="rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                                  disabled={otpLoading || !shipping.email}
                                >
                                  {otpLoading ? 'Sending...' : otpSent ? 'Resend code' : 'Send code'}
                                </button>
                                {!otpSent ? (
                                  <p className="flex items-center text-xs text-slate-500">
                                    Send a 6-digit code to verify this email.
                                  </p>
                                ) : null}
                              </div>

                              {otpSent ? (
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <input
                                    placeholder="6-digit code"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    className={`${fieldClassName} text-sm`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleVerifyOtp()
                                    }}
                                    className="rounded-[18px] bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                                    disabled={otpLoading || !otp || !shipping.email}
                                  >
                                    Verify
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}
                          {verifiedEmail === shipping.email.trim() ? (
                            <p className="text-xs text-green-600">Email verified.</p>
                          ) : null}
                        </div>
                      </div>
                    </>
                  )}
                </section>

                <div className="hidden lg:block rounded-[20px] border border-blue-100/80 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 h-4 w-4 flex-none text-blue-500" />
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-semibold text-slate-900">Quotes use region fields, not street validation</p>
                      <p className="text-[13px] leading-5 text-slate-600">
                        Country, state or region, city, and postal code drive the estimate. Street address stays fully manual for delivery details.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-4 lg:mt-0 lg:space-y-4 lg:rounded-[24px] lg:border lg:border-slate-200 lg:bg-white/92 lg:p-5 lg:shadow-[0_14px_30px_rgba(15,23,42,0.05)]">
                <section className="space-y-3 sm:space-y-4 border-t border-slate-200 pt-4 sm:pt-5 lg:border-t-0 lg:pt-0">
                  <div className="space-y-2">
                    <h3 className="text-[1.45rem] font-semibold tracking-tight text-slate-900 md:text-[1.6rem]">
                      Shipping address
                    </h3>
                    <p className={helperTextClassName}>
                      <span className="sm:hidden">Quote uses country, region, city, and postal code.</span>
                      <span className="hidden sm:inline">
                        Shipping and tax estimates rely on country, region, city, and postal code. Street address is collected for delivery.
                      </span>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">Full name</label>
                      <input
                        type="text"
                        required
                        autoComplete="name"
                        value={shipping.name}
                        onChange={(e) => setShipping({ ...shipping, name: e.target.value })}
                        onBlur={() => setShipping((prev) => ({ ...prev, name: collapseWhitespace(prev.name) }))}
                        className={fieldClassName}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">
                        <span className="sm:hidden">Country</span>
                        <span className="hidden sm:inline">Country / Region</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
                          {getCountryFlagEmoji(shipping.country)}
                        </span>
                        <select
                          value={shipping.country}
                          autoComplete="country"
                          onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                          className={`${fieldClassName} appearance-none pl-12 pr-10`}
                        >
                          {SHIPPING_COUNTRY_GROUPS.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.countries.map((country) => (
                                <option key={country.code} value={country.code}>
                                  {country.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>

                    <div className="relative col-span-2">
                      <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">Street address</label>
                      <div>
                        <input
                          type="text"
                          required
                          autoComplete="address-line1"
                          placeholder="Street address"
                          value={shipping.address_line1}
                          onChange={(e) => setShipping({ ...shipping, address_line1: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({
                              ...prev,
                              address_line1: collapseWhitespace(prev.address_line1),
                            }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                    </div>

                    {showAddressLine2Mobile || shipping.address_line2 ? (
                      <div className="col-span-2">
                        <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">
                          Apt, suite, etc. <span className="font-normal text-slate-400">(optional)</span>
                        </label>
                        <input
                          type="text"
                          autoComplete="address-line2"
                          value={shipping.address_line2 || ''}
                          onChange={(e) => setShipping({ ...shipping, address_line2: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({
                              ...prev,
                              address_line2: collapseWhitespace(prev.address_line2),
                            }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="col-span-2 sm:hidden">
                          <button
                            type="button"
                            onClick={() => setShowAddressLine2Mobile(true)}
                            className="text-[13px] font-medium text-slate-500 transition hover:text-slate-700"
                          >
                            + Add apt, suite, etc. (optional)
                          </button>
                        </div>
                        <div className="col-span-2 hidden sm:block">
                          <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">
                            Apt, suite, etc. <span className="font-normal text-slate-400">(optional)</span>
                          </label>
                          <input
                            type="text"
                            autoComplete="address-line2"
                            value={shipping.address_line2 || ''}
                            onChange={(e) => setShipping({ ...shipping, address_line2: e.target.value })}
                            onBlur={() =>
                              setShipping((prev) => ({
                                ...prev,
                                address_line2: collapseWhitespace(prev.address_line2),
                              }))
                            }
                            className={fieldClassName}
                          />
                        </div>
                      </>
                    )}

                    <div className="col-span-2 grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] gap-3">
                      <div>
                        <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">City</label>
                        <input
                          type="text"
                          required
                          autoComplete="address-level2"
                          value={shipping.city}
                          onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                          onBlur={() => setShipping((prev) => ({ ...prev, city: collapseWhitespace(prev.city) }))}
                          className={fieldClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">State</label>
                        <input
                          type="text"
                          autoComplete="address-level1"
                          value={shipping.state || ''}
                          onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({
                              ...prev,
                              state: collapseWhitespace(prev.state),
                            }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[13px] font-semibold text-slate-900 sm:text-sm">
                          <span className="sm:hidden">Postal</span>
                          <span className="hidden sm:inline">Postal code</span>
                        </label>
                        <input
                          type="text"
                          required
                          autoComplete="postal-code"
                          value={shipping.postal_code}
                          onChange={(e) => setShipping({ ...shipping, postal_code: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({
                              ...prev,
                              postal_code: normalizePostalCodeValue(prev.postal_code),
                            }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3 pt-1 lg:pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-[20px] bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-3 text-base font-semibold text-white shadow-[0_12px_24px_rgba(59,130,246,0.24)] transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300"
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Continue to payment'}
                  </button>

                  <div className="flex items-center justify-between gap-3 text-[13px] text-slate-500">
                    <button
                      type="button"
                      onClick={() => onCancel?.()}
                      className="font-medium text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
                      disabled={isProcessing}
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" />
                      <span>Secure checkout</span>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </form>
        </div>
      )}

      {step === 'payment' && (
        <div className={cardClassName}>
          <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,360px)] lg:items-start lg:gap-5 lg:space-y-0">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <h2 className="text-[1.45rem] font-semibold tracking-tight text-slate-900 md:text-[1.6rem]">
                  Payment Method
                </h2>
                <div className="text-[13px] text-slate-500">
                  <span>Payment provider: </span>
                  <span className="font-medium text-slate-900">
                    {paymentProviderLabel}
                  </span>
                </div>
                {paymentInitLoading && (
                  <p className="text-xs text-slate-500">
                    Preparing payment session…
                  </p>
                )}
                {(pspUsed === 'stripe' || paymentActionType === 'stripe_client_secret') && !isExternalRedirectPayment && (
                  <p className="text-xs text-slate-500">
                    Available methods are decided by the merchant Stripe setup and the current payment context.
                  </p>
                )}
                {paymentInitError && (
                  <p className="text-xs text-red-600">
                    {paymentInitError}
                  </p>
                )}
              </div>

              {hasQuote && (
                <div className="rounded-[18px] border border-blue-200 bg-blue-50 p-3 text-[13px] text-blue-900">
                  <div className="flex gap-2">
                    <Info className="mt-0.5 h-4 w-4 flex-none text-blue-700" />
                    <div className="space-y-1">
                      <p>
                        Prices shown and charged in{' '}
                        <span className="font-medium">{String(currency).toUpperCase()}</span>.
                      </p>
                      <details className="text-xs text-blue-900/90">
                        <summary className="cursor-pointer select-none">
                          {itemCurrencies.length === 1 && itemCurrencies[0] !== String(currency).toUpperCase()
                            ? 'Currency & conversion details'
                            : 'Currency details'}
                        </summary>
                        <div className="mt-1 space-y-1">
                          <p>Amounts are based on the merchant&apos;s store quote for your shipping address.</p>
                          {itemCurrencies.length === 1 &&
                            itemCurrencies[0] !== String(currency).toUpperCase() && (
                              <p>
                                This merchant lists items in{' '}
                                <span className="font-medium">{itemCurrencies[0]}</span>; amounts are converted
                                for checkout.
                              </p>
                            )}
                          <p>
                            Your bank may apply additional FX fees if your card/account uses a different currency.
                          </p>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4">
                  <div className="mb-2.5 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                    <p className="text-sm font-medium sm:text-base">Items</p>
                  </div>
                  <div className="space-y-2.5">
                    {items.map((item, index) => (
                      <div key={index} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center">
                          {item.image_url && (
                            <Image
                              src={item.image_url}
                              alt={item.title}
                              width={40}
                              height={40}
                              className="mr-3 h-10 w-10 rounded object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-slate-500">Qty: {item.quantity}</p>
                          </div>
                        </div>
                        <p className="shrink-0 text-sm font-medium">
                          {(() => {
                            const variantId = getVariantIdForItem(item)
                            const li = variantId ? quoteLineItemByVariantId.get(variantId) : null
                            const unitPriceEffective = Number((li as any)?.unit_price_effective)
                            const qty = Number((li as any)?.quantity ?? item.quantity)
                            if (hasQuote && Number.isFinite(unitPriceEffective)) {
                              return formatAmount(unitPriceEffective * (Number.isFinite(qty) ? qty : item.quantity))
                            }
                            return formatAmount(item.unit_price * item.quantity)
                          })()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {deliveryOptions.length > 1 ? (
                  <div className="rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4">
                    <label className="mb-1.5 block text-[13px] font-medium text-slate-900 sm:text-sm">
                      Shipping method
                    </label>
                    <select
                      className="w-full rounded-[16px] border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100"
                      disabled={quotePending || isProcessing}
                      value={Math.max(
                        0,
                        deliveryOptions.findIndex(
                          (o) => JSON.stringify(o) === JSON.stringify(selectedDeliveryOption),
                        ),
                      )}
                      onChange={async (e) => {
                        const idx = Number(e.target.value) || 0
                        const opt = deliveryOptions[idx]
                        if (!opt) return
                        try {
                          await refreshQuoteWithRetry(opt)
                        } catch (err: any) {
                          console.error('refreshQuote failed', err)
                          if (isInventoryUnavailable(err)) {
                            if (onFailure) onFailure({ reason: 'action_required', stage: 'payment' })
                            return
                          }
                          toast.error(err?.message || 'Failed to update shipping option')
                        }
                      }}
                    >
                      {deliveryOptions.map((opt, idx) => {
                        const label =
                          opt?.title ||
                          opt?.name ||
                          opt?.label ||
                          opt?.code ||
                          opt?.id ||
                          `Option ${idx + 1}`
                        const price =
                          opt?.price ??
                          opt?.amount ??
                          opt?.cost ??
                          opt?.shipping_fee ??
                          null
                        const priceNum = price != null ? Number(price) : NaN
                        const suffix = Number.isFinite(priceNum) ? ` (${formatAmount(priceNum)})` : ''
                        return (
                          <option key={String(opt?.id || idx)} value={idx}>
                            {String(label)}
                            {suffix}
                          </option>
                        )
                      })}
                    </select>
                    {quotePending && (
                      <p className="mt-2 text-xs text-slate-500">Updating totals…</p>
                    )}
                  </div>
                ) : null}

                {paymentActionType === 'adyen_session' ? (
                  <div className="rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4">
                    <p className="mb-2 text-sm font-medium sm:text-base">Adyen payment</p>
                    <div ref={adyenContainerRef} className="mt-2" />
                    {!adyenMounted && (
                      <p className="text-xs text-slate-500">
                        The secure Adyen payment form is initializing…
                      </p>
                    )}
                  </div>
                ) : paymentActionType === 'checkout_session' ? (
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-3 sm:p-4">
                    <p className="text-sm font-medium text-amber-900">
                      Checkout.com embedded payment is not available in shopping UI yet.
                    </p>
                    <p className="mt-1 text-xs text-amber-800">
                      Route this checkout to Stripe or Adyen, or use an internal canary path for PSP-only testing.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="cursor-pointer rounded-[20px] border border-slate-200 bg-white p-3 transition-colors hover:border-blue-500 sm:p-4">
                      <div className="flex items-center">
                        <input type="radio" name="payment" defaultChecked className="mr-3" />
                        <CreditCard className="mr-3 h-5 w-5 sm:h-6 sm:w-6" />
                        <div>
                          <p className="text-sm font-medium sm:text-base">Secure payment methods</p>
                          <p className="text-xs text-slate-500 sm:text-sm">
                            Cards, wallets, and other supported merchant payment methods
                          </p>
                        </div>
                      </div>
                    </div>

                    {isExternalRedirectPayment ? (
                      <div className="rounded-[20px] border border-slate-200 bg-white p-3 sm:p-4">
                        <p className="text-sm font-medium text-slate-900">
                          Continue to the merchant payment page
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          We will redirect you to finish payment on the merchant payment surface.
                        </p>
                      </div>
                    ) : stripePublishableKey && stripeClientSecretForRender ? (
                      <StripePaymentSection
                        ref={stripePaymentSectionRef}
                        clientSecret={stripeClientSecretForRender}
                        publishableKey={stripePublishableKey}
                        stripeAccount={stripeAccount}
                        returnUrl={stripeReturnUrlForRender}
                        shipping={shipping}
                        onPaymentError={setCardError}
                        onPaymentMethodChange={setStripeSelectedMethodType}
                        onWalletsReady={() => {
                          markCheckoutTiming('wallets_ready_at_ms', { onlyIfMissing: true })
                        }}
                        onPaymentElementReady={() => {
                          markCheckoutTiming('payment_element_ready_at_ms', { onlyIfMissing: true })
                        }}
                        onPaymentMethodEvidence={recordPaymentMethodEvidence}
                        onConfirmationResult={handleStripeConfirmationResult}
                      />
                    ) : paymentActionType === 'stripe_client_secret' || pspUsed === 'stripe' ? (
                      <div className="rounded-[20px] border border-red-200 bg-red-50 p-3 sm:p-4">
                        <p className="text-sm font-medium text-red-700">
                          Stripe payment setup is incomplete for this merchant.
                        </p>
                        <p className="mt-1 text-xs text-red-600">
                          Refresh the payment session or reconnect Stripe, then retry checkout.
                        </p>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3 lg:sticky lg:top-4">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/90 p-4">
                <h3 className="mb-3 text-sm font-medium text-slate-900 sm:text-base">Order Summary</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatAmount(subtotal)}</span>
                  </div>
                  {discount_total > 0 ? (
                    <div className="flex justify-between">
                      <span>Store discounts</span>
                      <span className="text-green-700">-{formatAmount(discount_total)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>{formatAmount(shipping_cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>{formatAmount(tax)}</span>
                  </div>
                  <div className="flex justify-between pt-1 text-base font-semibold">
                    <span>Total charged now</span>
                    <span>{formatAmount(total)}</span>
                  </div>
                  {estimatedPaymentBenefit > 0 ? (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <div className="flex justify-between text-[13px] text-slate-600">
                        <span>Estimated payment benefit</span>
                        <span className="text-emerald-700">-{formatAmount(estimatedPaymentBenefit)}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">
                        Estimated payment benefit depends on selected payment method and is not deducted from today&apos;s charge.
                      </p>
                    </div>
                  ) : null}
                </div>
                {discount_total > 0 && (quote?.promotion_lines?.length || 0) > 0 ? (
                  <div className="mt-2 text-xs text-slate-600">
                    {(quote?.promotion_lines || [])
                      .map((p) => String(p?.label || '').trim())
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((label) => (
                        <div key={label} className="truncate">
                          {label}
                        </div>
                      ))}
                  </div>
                ) : null}
                <div className="mt-3 text-[13px] leading-5 text-slate-500">
                  <p>Ship to: {shipping.name}</p>
                  <p>
                    {shipping.address_line1}, {shipping.city}
                    {shipping.state ? ` ${shipping.state}` : ''} {shipping.postal_code}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-stretch">
                <button
                  onClick={() => setStep('shipping')}
                  className="rounded-[18px] border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  disabled={isProcessing}
                >
                  Back
                </button>
                <button
                  onClick={handlePayment}
                  disabled={isProcessing || paymentInitLoading}
                  className="rounded-[18px] bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300 lg:w-full"
                >
                  {paymentButtonLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className={`${cardClassName} text-center`}>
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Order Confirmed!</h2>
          <p className="text-gray-600 mb-6">
            Thank you for your purchase. Your order has been received and is being processed.
          </p>
          <p className="text-lg font-medium">
            Order Total: <span className="text-green-600">{formatAmount(total)}</span>
          </p>
          <p className="mt-4 text-gray-600">
            You will receive an order confirmation email shortly.
          </p>
        </div>
      )}
      {debugEnabled ? (
        <div className="mt-6 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground mb-2">Checkout Debug</div>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(
              {
                selected_offer_id: offerIdForOrder || null,
                selected_merchant_id: merchantIdForOrder || null,
                ...(orderDebug || {}),
                timing: checkoutTimingSnapshot,
              },
              null,
              2,
            )}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

export default function OrderFlow(props: OrderFlowProps) {
  return <OrderFlowInner {...props} />
}
