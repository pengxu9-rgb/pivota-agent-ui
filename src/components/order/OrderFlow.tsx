'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, CreditCard, Check, ChevronRight, Info } from 'lucide-react'
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
} from '@/lib/api'
import { useCartStore } from '@/store/cartStore'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
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

interface OrderFlowProps {
  items: OrderItem[]
  onComplete?: (orderId: string) => void
  onCancel?: () => void
  onFailure?: (args: { reason: 'payment_failed' | 'system_error' | 'action_required'; stage: 'payment' | 'shipping' }) => void
  skipEmailVerification?: boolean
  buyerRef?: string | null
  jobId?: string | null
  market?: string | null
  locale?: string | null
  checkoutToken?: string | null
  returnUrl?: string | null
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
}

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)
const ADYEN_CLIENT_KEY =
  process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY ||
  'test_RMFUADZPQBBYJIWI56KVOQSNUUT657ML' // public test key; replace in env for prod
const FORCE_PSP = process.env.NEXT_PUBLIC_FORCE_PSP

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
  if (code === 'TEMPORARY_UNAVAILABLE') return true
  const message = String(err?.message || '').toUpperCase()
  return message.includes('TEMPORARY_UNAVAILABLE') || message.includes('DATABASE BUSY')
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
}: OrderFlowProps) {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const { user, setSession } = useAuthStore()
  const clearCart = useCartStore(state => state.clearCart)
  const [step, setStep] = useState<'shipping' | 'payment' | 'confirm'>('shipping')
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
  const [orderDebug, setOrderDebug] = useState<{
    order_id?: string | null
    resolved_offer_id?: string | null
    resolved_merchant_id?: string | null
    order_lines?: any[] | null
  } | null>(null)
  const [debugEnabled, setDebugEnabled] = useState(false)

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

  // Prefill shipping details from a server-stored checkout intent (PII is never put into URL params).
  useEffect(() => {
    if (step !== 'shipping') return
    const token = String(checkoutToken || '').trim() || null
    if (!token) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/checkout/prefill', {
          headers: { 'X-Checkout-Token': token },
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        const prefill = json?.prefill || null
        const addr = prefill?.shipping_address || null
        const email = String(prefill?.customer_email || '').trim() || null

        if (cancelled) return
        if (!addr && !email) return

        const prefCountry = normalizeCountryCode((addr as any)?.country) || null

        setShipping((prev) => ({
          ...prev,
          ...(email && !prev.email ? { email } : {}),
          ...(addr && typeof addr === 'object'
            ? {
                ...(addr.name && !prev.name ? { name: String(addr.name) } : {}),
                ...(addr.phone && !prev.phone ? { phone: String(addr.phone) } : {}),
                ...(addr.address_line1 && !prev.address_line1 ? { address_line1: String(addr.address_line1) } : {}),
                ...(addr.address_line2 && !prev.address_line2 ? { address_line2: String(addr.address_line2) } : {}),
                ...(addr.city && !prev.city ? { city: String(addr.city) } : {}),
                ...(addr.state && !prev.state ? { state: String(addr.state) } : {}),
                ...(addr.postal_code && !prev.postal_code ? { postal_code: String(addr.postal_code) } : {}),
                ...(prefCountry && (!prev.country || prev.country === 'US') ? { country: prefCountry } : {}),
              }
            : {}),
        }))
      } catch (err) {
        // Best-effort: ignore prefill errors.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [checkoutToken, step])

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
    options: { forceNew?: boolean } = {},
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
        source: 'checkout_ui',
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
      ...(FORCE_PSP ? { preferred_psp: FORCE_PSP } : {})
    })

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
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pivota_checkout_debug', JSON.stringify(nextOrderDebug))
      }
    } catch {
      // ignore storage errors
    }

    orderId = orderResponse.order_id
    setCreatedOrderId(orderId)

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

    if (orderPaymentAction) {
      setInitialPaymentAction(orderPaymentAction)
      setPaymentActionType(orderPaymentAction?.type || null)
    }

    if (orderPsp) {
      setPspUsed(orderPsp)
    }

    if (orderPaymentAction?.type === 'redirect_url' && orderPaymentAction?.url) {
      window.location.href = orderPaymentAction.url
      return orderId
    }

    return orderId
  }

  // If already logged in, prefill email and skip verification UI
  useEffect(() => {
    if (user?.email) {
      setShipping((prev) => ({ ...prev, email: prev.email || user.email! }))
      setVerifiedEmail(user.email || null)
    }
  }, [user])

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
      setIsProcessing(true)
      // Reset any existing order if shipping changes.
      setCreatedOrderId('')
      setInitialPaymentAction(null)
      setPaymentActionType(null)
      setPspUsed(null)

      try {
        await refreshQuoteWithRetry()
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
        
        // Step 2: Create/confirm payment intent via gateway
        const postPayReturnUrl =
          typeof window !== 'undefined'
            ? `${window.location.origin}/order/success?orderId=${encodeURIComponent(orderId)}${
                returnUrl ? `&return=${encodeURIComponent(returnUrl)}` : ''
              }`
            : undefined
        let paymentResponse: any
        try {
          paymentResponse = await processPayment({
            order_id: orderId,
            total_amount: Number(quoteForPayment.pricing.total) || total,
            currency: String(quoteForPayment.currency || currency || 'USD'),
            payment_method: {
              type: 'card',
            },
            return_url: postPayReturnUrl,
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
            paymentResponse = await processPayment({
              order_id: orderId,
              total_amount: Number(quoteForPayment.pricing.total) || total,
              currency: String(quoteForPayment.currency || currency || 'USD'),
              payment_method: { type: 'card' },
              return_url: postPayReturnUrl,
            })
          } else {
            throw err
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

        const paymentObj = (paymentResponse as any)?.payment || {}
        let action: any =
          (paymentResponse as any)?.payment_action ||
          paymentObj?.payment_action ||
          initialPaymentAction ||
          null

        // Heuristic: synthesize Adyen payment_action when intent id indicates
        // adyen_session but backend hasn't sent unified fields yet.
        if (!action) {
          const responseIntentId =
            (paymentResponse as any)?.payment_intent_id ||
            paymentObj?.payment_intent_id
          const responseClientSecret =
            (paymentResponse as any)?.client_secret ||
            paymentObj?.client_secret

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
          }
        }

        setPaymentActionType(action?.type || null)

        let detectedPsp: string | null =
          (paymentResponse as any)?.psp ||
          paymentObj?.psp ||
          action?.psp ||
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

        setPspUsed(detectedPsp || pspUsed || null)

        const redirectUrl =
          action?.url ||
          paymentResponse.redirect_url ||
          paymentResponse.payment?.redirect_url ||
          paymentResponse.next_action?.redirect_url

        const clientSecret =
          action?.client_secret ||
          paymentResponse.client_secret ||
          paymentResponse.payment?.client_secret

        // New unified payment handling
        if (action?.type === 'redirect_url') {
          if (redirectUrl) {
            window.location.href = redirectUrl
            return
          }
          throw new Error('Payment requires redirect, but no URL provided')
        }

        if (action?.type === 'adyen_session') {
          const sessionData = action?.client_secret
          // Normalize Adyen session id: prefer raw.id; otherwise strip "adyen_session_" prefix.
          let sessionId =
            action?.raw?.id ||
            paymentResponse.payment_intent_id ||
            paymentResponse.payment?.payment_intent_id ||
            ''

          if (sessionId && sessionId.startsWith('adyen_session_')) {
            sessionId = sessionId.replace('adyen_session_', '')
          }

          const clientKey = action?.raw?.clientKey || ADYEN_CLIENT_KEY

          if (!sessionData || !clientKey) {
            throw new Error('Adyen session is missing required data. Please try again.')
          }

          if (adyenMounted && adyenContainerRef.current) {
            // Already mounted; do nothing
            setIsProcessing(false)
            return
          }

          try {
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
                void confirmOrderPayment(orderId).catch((err) => {
                  console.warn('confirmOrderPayment failed', err)
                })
                setStep('confirm')
                toast.success('Payment completed successfully.')
                clearCart()
                if (onComplete) {
                  onComplete(orderId)
                  return
                }
                router.push(`/orders/${orderId}?paid=1`)
              },
              onError: (err: any) => {
                console.error('Adyen error:', err)
                toast.error('Payment failed with Adyen. Please check your card details or try again.')
                if (onFailure) onFailure({ reason: 'payment_failed', stage: 'payment' })
              },
            })

            if (adyenContainerRef.current) {
              checkout.create('dropin').mount(adyenContainerRef.current)
              setAdyenMounted(true)
              setIsProcessing(false)
              return
            } else {
              throw new Error('Payment form is not ready. Please refresh the page and try again.')
            }
          } catch (err: any) {
            console.error('Adyen init failed:', err)
            throw err
          }
        }

        // Default / Stripe flow
        if (clientSecret && stripe && elements) {
          const cardElement = elements.getElement(CardElement)
          if (!cardElement) {
            throw new Error('Please enter your card details to pay.')
          }

          const result = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
              card: cardElement,
            },
          })

          if (result.error) {
            setCardError(result.error.message || 'Payment failed')
            throw new Error('Payment failed. Please check your card details or try again.')
          }

          const status = result.paymentIntent?.status
          if (status === 'succeeded' || status === 'processing') {
            void confirmOrderPayment(orderId).catch((err) => {
              console.warn('confirmOrderPayment failed', err)
            })
            setPaymentId(result.paymentIntent?.id || '')
            setStep('confirm')
            toast.success('Payment completed successfully.')
            clearCart()
            if (onComplete) {
              onComplete(orderId)
              return
            }
            router.push(`/orders/${orderId}?paid=1`)
          } else if (status === 'requires_action') {
            // Stripe will handle 3DS in confirmCardPayment; keep user on page
            toast.message('Additional authentication required', {
              description: 'Please complete the 3D Secure flow in the popup window if prompted.',
            })
          } else {
            throw new Error('Payment could not be completed. Please try again or use a different card.')
          }
        } else if (redirectUrl) {
          window.location.href = redirectUrl
        } else {
          setPaymentId(paymentResponse.payment_id || '')
          setStep('confirm')
          toast.success('Payment processed successfully!')
          clearCart()
          if (onComplete) {
            onComplete(orderId)
            return
          }
          router.push(`/orders/${orderId}?paid=1`)
        }
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
    <div className="max-w-4xl mx-auto px-4 pb-4">
      {/* Progress Bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs">
          <div className={`flex items-center ${step === 'shipping' ? 'text-blue-600' : 'text-gray-400'}`}>
            <CreditCard className="w-4 h-4" />
            <span className="ml-2 font-medium">Shipping</span>
          </div>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <div className={`flex items-center ${step === 'payment' ? 'text-blue-600' : 'text-gray-400'}`}>
            <CreditCard className="w-4 h-4" />
            <span className="ml-2 font-medium">Payment</span>
          </div>
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <div className={`flex items-center ${step === 'confirm' ? 'text-blue-600' : 'text-gray-400'}`}>
            <Check className="w-4 h-4" />
            <span className="ml-2 font-medium">Confirm</span>
          </div>
        </div>
      </div>

      {/* Step Content */}
      {step === 'shipping' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Shipping Information</h2>
          
          <form onSubmit={handleShippingSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={shipping.name}
                  onChange={(e) => setShipping({...shipping, name: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={shipping.email}
                  onChange={(e) => setShipping({...shipping, email: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {!user && !skipEmailVerification && (
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        disabled={otpLoading}
                        onClick={() => setAuthMethod('password')}
                        className={`px-3 py-1.5 rounded-lg border ${
                          authMethod === 'password'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200'
                        } disabled:opacity-60`}
                      >
                        Password
                      </button>
                      <button
                        type="button"
                        disabled={otpLoading}
                        onClick={() => setAuthMethod('otp')}
                        className={`px-3 py-1.5 rounded-lg border ${
                          authMethod === 'otp'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200'
                        } disabled:opacity-60`}
                      >
                        Email code
                      </button>
                    </div>

                    {authMethod === 'password' ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="password"
                          placeholder="Password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={async () => {
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
                          }}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
                          disabled={otpLoading || !loginPassword || !shipping.email}
                        >
                          {otpLoading ? 'Signing in...' : 'Sign in'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setOtpLoading(true)
                            try {
                              await accountsLogin(shipping.email.trim())
                              setOtpSent(true)
                              toast.success('Code sent to your email')
                            } catch (err: any) {
                              const code = err?.code
                              if (code === 'INVALID_INPUT') toast.error('Please enter a valid email')
                              else if (code === 'RATE_LIMITED')
                                toast.error('Too many requests, please retry later')
                              else toast.error(err?.message || 'Failed to send code')
                            } finally {
                              setOtpLoading(false)
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm"
                          disabled={otpLoading || !shipping.email}
                        >
                          {otpLoading ? 'Sending...' : otpSent ? 'Resend code' : 'Send code'}
                        </button>
                        <input
                          placeholder="6-digit code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                        <button
                          type="button"
                          onClick={async () => {
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
                              else if (code === 'RATE_LIMITED')
                                toast.error('Too many attempts, please retry later')
                              else toast.error(err?.message || 'Verification failed')
                            } finally {
                              setOtpLoading(false)
                            }
                          }}
                          className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
                          disabled={otpLoading || !otp || !shipping.email}
                        >
                          Verify
                        </button>
                      </div>
                    )}
                    {verifiedEmail === shipping.email.trim() && (
                      <p className="text-xs text-green-600">Email verified</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 1</label>
              <input
                type="text"
                required
                value={shipping.address_line1}
                onChange={(e) => setShipping({...shipping, address_line1: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Address Line 2 (Optional)</label>
              <input
                type="text"
                value={shipping.address_line2}
                onChange={(e) => setShipping({...shipping, address_line2: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">City</label>
                <input
                  type="text"
                  required
                  value={shipping.city}
                  onChange={(e) => setShipping({...shipping, city: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  type="text"
                  value={shipping.state || ''}
                  onChange={(e) => setShipping({...shipping, state: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Postal Code</label>
                <input
                  type="text"
                  required
                  value={shipping.postal_code}
                  onChange={(e) => setShipping({...shipping, postal_code: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <select
                  value={shipping.country}
                  onChange={(e) => setShipping({...shipping, country: e.target.value})}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
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
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={() => onCancel?.()}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : 'Continue to Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'payment' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-6">Payment Method</h2>
          <div className="mb-3 text-sm text-muted-foreground">
            <span>Payment provider: </span>
            <span className="font-medium text-foreground">
              {pspUsed === 'adyen'
                ? 'Adyen (hosted card form)'
                : 'Stripe (card payment)'}
            </span>
          </div>
          {hasQuote && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
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
          
          <div className="space-y-4">
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <ShoppingCart className="w-5 h-5" />
                <p className="font-medium">Items</p>
              </div>
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center">
                      {item.image_url && (
                        <Image
                          src={item.image_url}
                          alt={item.title}
                          width={48}
                          height={48}
                          className="w-12 h-12 object-cover rounded mr-3"
                        />
                      )}
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <p className="text-sm font-medium">
                      {(() => {
                        const variantId = getVariantIdForItem(item)
                        const li = variantId ? quoteLineItemByVariantId.get(variantId) : null
                        const unitPriceEffective = Number((li as any)?.unit_price_effective)
                        const qty = Number((li as any)?.quantity ?? item.quantity)
                        if (hasQuote && Number.isFinite(unitPriceEffective)) {
                          return formatAmount(unitPriceEffective * (Number.isFinite(qty) ? qty : item.quantity))
                        }
                        // Fallback: best-effort estimate (legacy flows / quote failures).
                        return formatAmount(item.unit_price * item.quantity)
                      })()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {deliveryOptions.length > 1 ? (
              <div className="border rounded-lg p-4">
                <label className="block text-sm font-medium mb-2">Shipping method</label>
                <select
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  disabled={quotePending || isProcessing}
                  value={Math.max(0, deliveryOptions.findIndex((o) => JSON.stringify(o) === JSON.stringify(selectedDeliveryOption)))}
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
                        {String(label)}{suffix}
                      </option>
                    )
                  })}
                </select>
                {quotePending && (
                  <p className="text-xs text-muted-foreground mt-2">Updating totals…</p>
                )}
              </div>
            ) : null}
            {paymentActionType === 'adyen_session' ? (
              <div className="border rounded-lg p-4">
                <p className="font-medium mb-2">Adyen payment</p>
                <div ref={adyenContainerRef} className="mt-2" />
                {!adyenMounted && (
                  <p className="text-xs text-muted-foreground">
                    The secure Adyen payment form will appear here after you click Pay.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 transition-colors">
                  <div className="flex items-center">
                    <input type="radio" name="payment" defaultChecked className="mr-3" />
                    <CreditCard className="w-6 h-6 mr-3" />
                    <div>
                      <p className="font-medium">Credit/Debit Card</p>
                      <p className="text-sm text-gray-600">Secure payment</p>
                    </div>
                  </div>
                </div>

                {publishableKey && (
                  <div className="border rounded-lg p-4">
                    <label className="text-sm font-medium text-gray-700">Card Details</label>
                    <div className="mt-2 p-3 border rounded bg-gray-50">
                      <CardElement options={{ hidePostalCode: true }} />
                    </div>
                    {cardError && <p className="text-sm text-red-600 mt-2">{cardError}</p>}
                  </div>
                )}
              </>
            )}
            
            <div className="mt-6">
              <h3 className="font-medium mb-4">Order Summary</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatAmount(subtotal)}</span>
                  </div>
                  {discount_total > 0 ? (
                    <div className="flex justify-between">
                      <span>Discounts</span>
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
                  <div className="flex justify-between font-semibold text-base pt-1">
                    <span>Total</span>
                    <span>{formatAmount(total)}</span>
                  </div>
                </div>
                {discount_total > 0 && (quote?.promotion_lines?.length || 0) > 0 ? (
                  <div className="mt-2 text-xs text-gray-600">
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
                <div className="text-sm text-gray-600">
                  <p>Ship to: {shipping.name}</p>
                  <p>
                    {shipping.address_line1}, {shipping.city}
                    {shipping.state ? ` ${shipping.state}` : ''} {shipping.postal_code}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep('shipping')}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                disabled={isProcessing}
              >
                Back
              </button>
              <button
                onClick={handlePayment}
                disabled={isProcessing}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Processing...' : `Pay ${formatAmount(total)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
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
  // Always provide Elements context so useStripe/useElements hooks don't throw.
  return (
    <Elements stripe={stripePromise}>
      <OrderFlowInner {...props} />
    </Elements>
  )
}
