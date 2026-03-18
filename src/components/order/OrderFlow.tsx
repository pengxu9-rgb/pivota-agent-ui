'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ShoppingCart,
  CreditCard,
  Check,
  ChevronRight,
  ChevronDown,
  Info,
  Search,
  MapPin,
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
} from '@/lib/api'
import {
  isBackendSettledPaymentStatus,
  resolveCheckoutPaymentContract,
} from '@/lib/checkoutPaymentContract'
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

type PrefetchedPaymentInit = {
  orderId: string
  quoteId: string
  paymentResponse: any
}

type CheckoutStep = 'shipping' | 'payment' | 'confirm'

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

const SHIPPING_COUNTRIES = SHIPPING_COUNTRY_GROUPS.flatMap((group) => group.countries)

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

const REGION_UPPERCASE_COUNTRIES = new Set(['US', 'CA', 'AU'])

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

function getCountryName(value: unknown): string {
  const normalized = normalizeCountryCode(value)
  if (!normalized) return 'United States'
  return SHIPPING_COUNTRIES.find((country) => country.code === normalized)?.name || normalized
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

function titleCaseWord(word: string): string {
  if (!word) return word
  if (!/[a-z]/i.test(word)) return word
  if (word === word.toUpperCase() && word.length <= 3) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function titleCasePreservingSeparators(value: unknown): string {
  return collapseWhitespace(value)
    .split(/([ '-])/)
    .map((part) => (part === ' ' || part === '-' || part === "'" ? part : titleCaseWord(part)))
    .join('')
}

function normalizeAddressLine(value: unknown): string {
  const collapsed = collapseWhitespace(value)
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')

  return titleCasePreservingSeparators(collapsed)
}

function normalizeRegionValue(value: unknown, country: unknown): string {
  const collapsed = collapseWhitespace(value)
  if (!collapsed) return ''
  const normalizedCountry = normalizeCountryCode(country)
  if (normalizedCountry && REGION_UPPERCASE_COUNTRIES.has(normalizedCountry) && collapsed.length <= 3) {
    return collapsed.toUpperCase()
  }
  return titleCasePreservingSeparators(collapsed)
}

function normalizePostalCodeValue(value: unknown): string {
  return collapseWhitespace(value).toUpperCase()
}

function buildAddressSuggestion(shipping: ShippingInfo) {
  const addressLine1 = normalizeAddressLine(shipping.address_line1)
  if (!addressLine1) return null

  const city = titleCasePreservingSeparators(shipping.city)
  const state = normalizeRegionValue(shipping.state, shipping.country)
  const postalCode = normalizePostalCodeValue(shipping.postal_code)
  const location = [city, [state, postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  return {
    addressLine1,
    city,
    state,
    postalCode,
    country: normalizeCountryCode(shipping.country) || shipping.country,
    title: addressLine1,
    detail: location,
  }
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
  const paymentInitPromiseRef = useRef<Promise<PrefetchedPaymentInit> | null>(null)
  const paymentInitKeyRef = useRef<string | null>(null)
  const paymentInitRunIdRef = useRef(0)
  const [prefetchedPaymentRes, setPrefetchedPaymentRes] = useState<PrefetchedPaymentInit | null>(null)
  const [paymentInitLoading, setPaymentInitLoading] = useState(false)
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null)
  const [isAddressSuggestionOpen, setIsAddressSuggestionOpen] = useState(false)
  const addressSuggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const paymentInitKey = useMemo(() => {
    const quoteId = String(quote?.quote_id || '').trim()
    if (!quoteId) return null
    const cur = String(currency || 'USD').trim().toUpperCase()
    const amountMinor = Number.isFinite(total) ? Math.round(Number(total) * 100) : null
    if (!cur || amountMinor == null) return null
    return `${quoteId}:${cur}:${amountMinor}`
  }, [currency, quote?.quote_id, total])

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

    const allowRedirect = options.allowRedirect !== false
    if (allowRedirect && orderPaymentAction?.type === 'redirect_url' && orderPaymentAction?.url) {
      window.location.href = orderPaymentAction.url
      return orderId
    }

    return orderId
  }

  const buildPostPayReturnUrl = (orderId: string): string | undefined => {
    if (typeof window === 'undefined') return undefined
    const url = new URL('/order/success', window.location.origin)
    url.searchParams.set('orderId', orderId)
    if (returnUrl) url.searchParams.set('return', returnUrl)
    const current = new URL(window.location.href)
    const passthrough = ['entry', 'embed', 'lang', 'aurora_uid', 'parent_origin']
    for (const key of passthrough) {
      const value = (current.searchParams.get(key) || '').trim()
      if (value) url.searchParams.set(key, value)
    }
    if (checkoutToken) url.searchParams.set('checkout_token', checkoutToken)
    return url.toString()
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

    if (!adyenContainerRef.current) {
      throw new Error('Payment form is not ready. Please refresh the page and try again.')
    }
    checkout.create('dropin').mount(adyenContainerRef.current)
    setAdyenMounted(true)
  }

  const primePaymentForStep = async (quoteForPayment: QuotePreview): Promise<PrefetchedPaymentInit> => {
    let workingQuote = quoteForPayment
    let orderId = await createOrderIfNeeded(workingQuote, { allowRedirect: false })
    const buildPayload = (quoteArg: QuotePreview, orderIdArg: string) => ({
      order_id: orderIdArg,
      total_amount: Number(quoteArg.pricing.total) || total,
      currency: String(quoteArg.currency || currency || 'USD'),
      payment_method: { type: 'card' },
      return_url: buildPostPayReturnUrl(orderIdArg),
    })

    let paymentResponse: any
    try {
      paymentResponse = await processPayment(buildPayload(workingQuote, orderId))
    } catch (err: any) {
      if (isQuoteDrift(err)) {
        setCreatedOrderId('')
        setInitialPaymentAction(null)
        setPaymentActionType(null)
        setPspUsed(null)
        workingQuote = await refreshQuoteWithRetry()
        orderId = await createOrderIfNeeded(workingQuote, { forceNew: true, allowRedirect: false })
        paymentResponse = await processPayment(buildPayload(workingQuote, orderId))
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

  useEffect(() => {
    if (step === 'payment') return
    paymentInitRunIdRef.current += 1
    paymentInitPromiseRef.current = null
    paymentInitKeyRef.current = null
    setPrefetchedPaymentRes(null)
    setPaymentInitLoading(false)
    setPaymentInitError(null)
  }, [step])

  useEffect(() => {
    if (step !== 'payment') return
    if (!quote?.quote_id || !paymentInitKey) return
    if (
      paymentInitKeyRef.current === paymentInitKey &&
      (paymentInitPromiseRef.current || prefetchedPaymentRes)
    ) {
      return
    }

    const runId = paymentInitRunIdRef.current + 1
    paymentInitRunIdRef.current = runId
    setPaymentInitLoading(true)
    setPaymentInitError(null)
    setPrefetchedPaymentRes(null)
    // Pre-warm Adyen SDK to reduce first-render jitter.
    void import('@adyen/adyen-web').catch(() => null)

    const initPromise = primePaymentForStep(quote)
    paymentInitKeyRef.current = paymentInitKey
    paymentInitPromiseRef.current = initPromise

    initPromise
      .then((prefetched) => {
        if (paymentInitRunIdRef.current !== runId) return
        const action = extractPaymentAction(prefetched.paymentResponse, initialPaymentAction)
        setPrefetchedPaymentRes(prefetched)
        setPaymentActionType(action?.type || null)
        setPspUsed(detectPaymentPsp(prefetched.paymentResponse, action))
      })
      .catch((err: any) => {
        if (paymentInitRunIdRef.current !== runId) return
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentInitKey,
    quote?.quote_id,
    step,
  ])

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

  useEffect(() => {
    return () => {
      if (addressSuggestionCloseTimerRef.current) {
        clearTimeout(addressSuggestionCloseTimerRef.current)
      }
    }
  }, [])

  const cardClassName =
    'rounded-[28px] border border-white/80 bg-white/95 px-5 py-6 shadow-[0_20px_55px_rgba(56,88,162,0.12)] backdrop-blur md:px-8 md:py-8 lg:rounded-[36px] lg:px-4 lg:py-4'
  const fieldClassName =
    'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 lg:text-base'
  const helperTextClassName = 'text-sm leading-6 text-slate-500'
  const stepIndex = CHECKOUT_STEPS.findIndex((item) => item.id === step)
  const addressSuggestion = useMemo(() => buildAddressSuggestion(shipping), [shipping])
  const showAddressSuggestion = Boolean(
    isAddressSuggestionOpen && addressSuggestion && shipping.address_line1.trim(),
  )

  const closeAddressSuggestionSoon = () => {
    if (addressSuggestionCloseTimerRef.current) {
      clearTimeout(addressSuggestionCloseTimerRef.current)
    }
    addressSuggestionCloseTimerRef.current = setTimeout(() => {
      setIsAddressSuggestionOpen(false)
    }, 120)
  }

  const openAddressSuggestion = () => {
    if (addressSuggestionCloseTimerRef.current) {
      clearTimeout(addressSuggestionCloseTimerRef.current)
      addressSuggestionCloseTimerRef.current = null
    }
    setIsAddressSuggestionOpen(true)
  }

  const applyAddressSuggestion = () => {
    if (!addressSuggestion) return
    setShipping((prev) => ({
      ...prev,
      address_line1: addressSuggestion.addressLine1,
      city: addressSuggestion.city || prev.city,
      state: addressSuggestion.state || prev.state,
      postal_code: addressSuggestion.postalCode || prev.postal_code,
      country: String(addressSuggestion.country || prev.country),
    }))
    setIsAddressSuggestionOpen(false)
  }

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
      setAdyenMounted(false)
      paymentInitRunIdRef.current += 1
      paymentInitPromiseRef.current = null
      paymentInitKeyRef.current = null
      setPrefetchedPaymentRes(null)
      setPaymentInitLoading(false)
      setPaymentInitError(null)

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
    setPaymentInitError(null)
    
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
        
        // Step 2: Create/confirm payment intent via gateway (prefer prefetched result).
        const quoteKeyForRun = (() => {
          const qid = String(quoteForPayment?.quote_id || '').trim()
          if (!qid) return null
          const cur = String(quoteForPayment?.currency || currency || 'USD').trim().toUpperCase()
          const amountMinor = Number.isFinite(Number(quoteForPayment?.pricing?.total))
            ? Math.round(Number(quoteForPayment?.pricing?.total) * 100)
            : null
          if (!cur || amountMinor == null) return null
          return `${qid}:${cur}:${amountMinor}`
        })()
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
          try {
            paymentResponse = await processPayment({
              order_id: orderId,
              total_amount: Number(quoteForPayment.pricing.total) || total,
              currency: String(quoteForPayment.currency || currency || 'USD'),
              payment_method: {
                type: 'card',
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
              paymentResponse = await processPayment({
                order_id: orderId,
                total_amount: Number(quoteForPayment.pricing.total) || total,
                currency: String(quoteForPayment.currency || currency || 'USD'),
                payment_method: { type: 'card' },
                return_url: buildPostPayReturnUrl(orderId),
              })
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
        setPaymentActionType(action?.type || null)
        const detectedPsp = detectPaymentPsp(paymentResponse, action)
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
        const paymentContract = resolveCheckoutPaymentContract({
          paymentResponse,
          action,
        })
        const completeCheckout = (paymentIdValue?: string) => {
          void confirmOrderPayment(orderId).catch((err) => {
            console.warn('confirmOrderPayment failed', err)
          })
          setPaymentId(paymentIdValue || '')
          setStep('confirm')
          toast.success('Payment completed successfully.')
          clearCart()
          if (onComplete) {
            onComplete(orderId)
            return
          }
          router.push(`/orders/${orderId}?paid=1`)
        }

        if (!paymentContract.requiresClientConfirmation) {
          if (isBackendSettledPaymentStatus(paymentContract.paymentStatus)) {
            completeCheckout(
              String(
                (paymentResponse as any)?.payment_id ||
                  (paymentResponse as any)?.payment?.payment_id ||
                  '',
              ),
            )
            return
          }
          throw new Error(
            'Your order was created, but payment is still pending. Please check your orders page shortly.',
          )
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

        const isStripePsp = !detectedPsp || detectedPsp === 'stripe'
        if (clientSecret && isStripePsp) {
          if (!stripe || !elements) {
            throw new Error('Payment form is not ready. Please refresh and try again.')
          }
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
            completeCheckout(result.paymentIntent?.id || '')
            return
          }
          if (status === 'requires_action') {
            // Stripe will handle 3DS in confirmCardPayment; keep user on page
            toast.message('Additional authentication required', {
              description: 'Please complete the 3D Secure flow in the popup window if prompted.',
            })
            return
          }
          throw new Error('Payment could not be completed. Please try again or use a different card.')
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
    <div className="mx-auto max-w-4xl px-4 pb-4 lg:max-w-6xl">
      <div className="mb-6 border-b border-slate-200/80">
        <div className="flex items-end gap-3 overflow-x-auto pb-0.5 lg:gap-5">
          {CHECKOUT_STEPS.map((item, index) => {
            const isActive = item.id === step
            const isComplete = index < stepIndex

            return (
              <div key={item.id} className="flex min-w-fit items-center gap-3">
                <div
                  className={`relative pb-4 text-lg font-semibold transition-colors md:text-[2rem] md:leading-none ${
                    isActive
                      ? 'text-slate-900'
                      : isComplete
                        ? 'text-blue-600'
                        : 'text-slate-400'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive ? (
                    <span className="absolute inset-x-0 -bottom-px h-1 rounded-full bg-blue-500" />
                  ) : null}
                </div>
                {index < CHECKOUT_STEPS.length - 1 ? (
                  <ChevronRight className="mb-4 h-5 w-5 flex-none text-slate-300" />
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      {step === 'shipping' && (
        <div className={cardClassName}>
          <form onSubmit={handleShippingSubmit} className="space-y-8 lg:space-y-0">
            <div className="lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-7 xl:gap-8">
              <div className="space-y-8 lg:space-y-6 lg:self-start lg:rounded-[28px] lg:border lg:border-slate-200 lg:bg-[linear-gradient(180deg,rgba(246,250,255,0.96),rgba(255,255,255,0.92))] lg:p-7 lg:shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <section className="space-y-5">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[2.1rem]">
                      Contact
                    </h2>
                    <p className={helperTextClassName}>
                      For order confirmation and shipping updates.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-slate-900">Email</label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={shipping.email}
                      onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                      className={fieldClassName}
                    />
                    <p className={helperTextClassName}>
                      We only use this for your receipt, shipping updates, and secure sign-in.
                    </p>
                  </div>

                  {!user && !skipEmailVerification && (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <button
                          type="button"
                          disabled={otpLoading}
                          onClick={() => setAuthMethod('password')}
                          className={`rounded-full border px-3 py-1.5 font-medium transition ${
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

                      <div className="mt-3 space-y-3">
                        {authMethod === 'password' ? (
                          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                            <input
                              type="password"
                              placeholder="Password"
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              className={`${fieldClassName} text-sm`}
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
                              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                              disabled={otpLoading || !loginPassword || !shipping.email}
                            >
                              {otpLoading ? 'Signing in...' : 'Sign in'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
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
                                  else if (code === 'RATE_LIMITED') {
                                    toast.error('Too many requests, please retry later')
                                  } else {
                                    toast.error(err?.message || 'Failed to send code')
                                  }
                                } finally {
                                  setOtpLoading(false)
                                }
                              }}
                              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                              disabled={otpLoading || !shipping.email}
                            >
                              {otpLoading ? 'Sending...' : otpSent ? 'Resend code' : 'Send code'}
                            </button>
                            <input
                              placeholder="6-digit code"
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                              className={`${fieldClassName} text-sm`}
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
                                  else if (code === 'RATE_LIMITED') {
                                    toast.error('Too many attempts, please retry later')
                                  } else {
                                    toast.error(err?.message || 'Verification failed')
                                  }
                                } finally {
                                  setOtpLoading(false)
                                }
                              }}
                              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                              disabled={otpLoading || !otp || !shipping.email}
                            >
                              Verify
                            </button>
                          </div>
                        )}
                        {verifiedEmail === shipping.email.trim() ? (
                          <p className="text-sm text-green-600">Email verified.</p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </section>

                <div className="hidden lg:block rounded-[24px] border border-blue-100/80 bg-gradient-to-br from-blue-50 via-white to-sky-50 p-5">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-5 w-5 flex-none text-blue-500" />
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-slate-900">Desktop checkout keeps inputs lighter</p>
                      <p className="text-sm leading-6 text-slate-600">
                        Contact details stay grouped on the left, while the full shipping form and address suggestion stay in the main column.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 space-y-8 lg:mt-0 lg:space-y-6 lg:rounded-[28px] lg:border lg:border-slate-200 lg:bg-white/92 lg:p-7 lg:shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <section className="space-y-5 border-t border-slate-200 pt-8 lg:border-t-0 lg:pt-0">
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[2.1rem]">
                      Shipping address
                    </h3>
                    <p className={helperTextClassName}>
                      Start with your street address and apply the suggested format as you fill it in.
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-900">Full name</label>
                      <input
                        type="text"
                        required
                        autoComplete="name"
                        value={shipping.name}
                        onChange={(e) => setShipping({ ...shipping, name: e.target.value })}
                        onBlur={() =>
                          setShipping((prev) => ({ ...prev, name: titleCasePreservingSeparators(prev.name) }))
                        }
                        className={fieldClassName}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-slate-900">Country / Region</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                          {getCountryFlagEmoji(shipping.country)}
                        </span>
                        <select
                          value={shipping.country}
                          autoComplete="country"
                          onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                          className={`${fieldClassName} appearance-none pl-14 pr-12`}
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
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      </div>
                    </div>

                    <div className="relative lg:col-span-2">
                      <label className="mb-2 block text-sm font-semibold text-slate-900">Address</label>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          required
                          autoComplete="address-line1"
                          placeholder="Start typing your street address"
                          value={shipping.address_line1}
                          onFocus={openAddressSuggestion}
                          onBlur={() => {
                            closeAddressSuggestionSoon()
                            setShipping((prev) => ({
                              ...prev,
                              address_line1: normalizeAddressLine(prev.address_line1),
                            }))
                          }}
                          onChange={(e) => {
                            if (!isAddressSuggestionOpen) {
                              openAddressSuggestion()
                            }
                            setShipping({ ...shipping, address_line1: e.target.value })
                          }}
                          className={`${fieldClassName} pl-12 pr-4`}
                        />
                      </div>

                      {showAddressSuggestion && addressSuggestion ? (
                        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)] lg:mt-3 lg:max-w-[44rem]">
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              applyAddressSuggestion()
                            }}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 lg:px-5 lg:py-4"
                          >
                            <MapPin className="mt-1 h-5 w-5 flex-none text-blue-500" />
                            <div className="min-w-0">
                              <p className="text-base font-medium text-slate-900">{addressSuggestion.title}</p>
                              <p className="text-sm text-slate-500">
                                {[addressSuggestion.detail, getCountryName(shipping.country)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div className="lg:col-span-2">
                      <label className="mb-2 block text-sm font-semibold text-slate-900">
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
                            address_line2: titleCasePreservingSeparators(prev.address_line2),
                          }))
                        }
                        className={fieldClassName}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr_0.8fr] lg:col-span-2">
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">City</label>
                        <input
                          type="text"
                          required
                          autoComplete="address-level2"
                          value={shipping.city}
                          onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({ ...prev, city: titleCasePreservingSeparators(prev.city) }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">State</label>
                        <input
                          type="text"
                          autoComplete="address-level1"
                          value={shipping.state || ''}
                          onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                          onBlur={() =>
                            setShipping((prev) => ({
                              ...prev,
                              state: normalizeRegionValue(prev.state, prev.country),
                            }))
                          }
                          className={fieldClassName}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-slate-900">Postal code</label>
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

                <section className="space-y-4 pt-2 lg:pt-4">
                  <button
                    type="submit"
                    className="w-full rounded-[24px] bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4 text-lg font-semibold text-white shadow-[0_18px_35px_rgba(59,130,246,0.3)] transition hover:from-blue-600 hover:to-blue-700 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300"
                    disabled={isProcessing}
                  >
                    {isProcessing ? 'Processing...' : 'Continue to payment'}
                  </button>

                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-slate-200" />
                    <button
                      type="button"
                      onClick={() => onCancel?.()}
                      className="text-sm font-medium text-slate-500 transition hover:text-slate-700 disabled:opacity-60"
                      disabled={isProcessing}
                    >
                      Back
                    </button>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Lock className="h-4 w-4" />
                    <span>Secure checkout</span>
                  </div>
                </section>
              </div>
            </div>
          </form>
        </div>
      )}

      {step === 'payment' && (
        <div className={cardClassName}>
          <h2 className="text-2xl font-bold mb-6">Payment Method</h2>
          <div className="mb-3 text-sm text-muted-foreground">
            <span>Payment provider: </span>
            <span className="font-medium text-foreground">
              {pspUsed === 'adyen'
                ? 'Adyen (hosted card form)'
                : 'Stripe (card payment)'}
            </span>
          </div>
          {paymentInitLoading && (
            <p className="mb-3 text-xs text-muted-foreground">
              Preparing payment session…
            </p>
          )}
          {paymentInitError && (
            <p className="mb-3 text-xs text-red-600">
              {paymentInitError}
            </p>
          )}
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
                    The secure Adyen payment form is initializing…
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
                disabled={isProcessing || paymentInitLoading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isProcessing
                  ? 'Processing...'
                  : paymentInitLoading
                    ? 'Preparing payment...'
                    : `Pay ${formatAmount(total)}`}
              </button>
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
