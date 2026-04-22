'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import OrderFlow from '@/components/order/OrderFlow'
import { ArrowLeft } from 'lucide-react'
import { safeReturnUrl, withReturnParams } from '@/lib/returnUrl'
import { getAccountOrder, publicOrderResume, setMerchantId } from '@/lib/api'
import {
  getCheckoutContextFromBrowser,
  normalizeCheckoutSource,
} from '@/lib/checkoutToken'

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

type ResumeOrderState = {
  orderId: string
  shipping: {
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
  quote: {
    quote_id: string
    currency: string
    pricing: {
      subtotal: number
      discount_total: number
      shipping_fee: number
      tax: number
      total: number
    }
    line_items: Array<{
      variant_id: string
      unit_price_effective: number
    }>
  }
  paymentResponse: any
}

type ResumeOrderLoadResult = {
  items: OrderItem[]
  resumeOrder: ResumeOrderState
}

type UcpFailure = {
  reason: 'payment_failed' | 'system_error' | 'action_required'
  stage: 'payment' | 'shipping'
}

function toMinorAmount(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric)
}

function toMajorAmount(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return numeric
}

function isUcpOfferToken(value: unknown): boolean {
  return String(value || '').trim().startsWith('offer_v1.')
}

function buildResumeOrderState(raw: any): ResumeOrderLoadResult | null {
  const order = raw?.order && typeof raw.order === 'object' ? raw.order : raw
  const orderId = String(order?.order_id || order?.id || '').trim()
  if (!orderId) return null

  const currency = String(order?.currency || 'USD').trim().toUpperCase() || 'USD'
  const orderMerchantId = String(order?.merchant_id || '').trim() || undefined
  const shippingRaw = order?.shipping_address && typeof order.shipping_address === 'object'
    ? order.shipping_address
    : {}
  const itemsRaw = Array.isArray(raw?.items) ? raw.items : Array.isArray(order?.items) ? order.items : []
  const items = itemsRaw
    .map((item: any) => {
      const productId = String(item?.product_id || '').trim()
      if (!productId) return null
      const quantity = Number(item?.quantity) || 1
      const unitPriceMinor = toMinorAmount(item?.unit_price_minor)
      return {
        product_id: productId,
        variant_id: String(item?.variant_id || '').trim() || undefined,
        sku: String(item?.sku || '').trim() || undefined,
        merchant_id: String(item?.merchant_id || orderMerchantId || '').trim() || undefined,
        offer_id: String(item?.offer_id || '').trim() || undefined,
        title: String(item?.title || item?.product_title || productId),
        quantity,
        unit_price: unitPriceMinor / 100,
        currency,
        image_url: String(item?.image_url || '').trim() || undefined,
      }
    })
    .filter(Boolean) as OrderItem[]

  if (!items.length) return null

  const pricingQuote =
    raw?.pricing_quote && typeof raw.pricing_quote === 'object'
      ? raw.pricing_quote
      : order?.pricing_quote && typeof order.pricing_quote === 'object'
        ? order.pricing_quote
        : null
  const pricingQuotePricing =
    pricingQuote?.pricing && typeof pricingQuote.pricing === 'object' ? pricingQuote.pricing : null
  const subtotalMinor = itemsRaw.reduce((sum: number, item: any) => {
    const subtotal = toMinorAmount(item?.subtotal_minor)
    if (subtotal > 0) return sum + subtotal
    return sum + toMinorAmount(item?.unit_price_minor) * (Number(item?.quantity) || 1)
  }, 0)
  const totalMinor = toMinorAmount(order?.total_amount_minor)
  const fallbackPricing = {
    subtotal: subtotalMinor / 100,
    discount_total: 0,
    shipping_fee: Math.max(totalMinor - subtotalMinor, 0) / 100,
    tax: 0,
    total: totalMinor / 100,
  }
  const pricing = pricingQuotePricing
    ? {
        subtotal: toMajorAmount(pricingQuotePricing?.subtotal),
        discount_total: toMajorAmount(pricingQuotePricing?.discount_total),
        shipping_fee: toMajorAmount(pricingQuotePricing?.shipping_fee),
        tax: toMajorAmount(pricingQuotePricing?.tax),
        total: toMajorAmount(pricingQuotePricing?.total),
      }
    : fallbackPricing
  const paymentCurrent =
    raw?.payment && typeof raw.payment === 'object' && raw.payment.current && typeof raw.payment.current === 'object'
      ? raw.payment.current
      : null
  const paymentResponse = paymentCurrent
    ? {
        order_id: orderId,
        psp: paymentCurrent.psp || null,
        payment_intent_id: paymentCurrent.payment_intent_id || null,
        payment_action: paymentCurrent.payment_action || null,
        payment: {
          psp: paymentCurrent.psp || null,
          payment_intent_id: paymentCurrent.payment_intent_id || null,
          payment_action: paymentCurrent.payment_action || null,
        },
      }
    : null

  return {
    items,
    resumeOrder: {
      orderId,
      shipping: {
        name: String(shippingRaw?.name || ''),
        email: String(raw?.customer?.email || order?.customer_email || ''),
        address_line1: String(shippingRaw?.address_line1 || ''),
        address_line2: String(shippingRaw?.address_line2 || ''),
        city: String(shippingRaw?.city || ''),
        state: String(shippingRaw?.province || shippingRaw?.state || ''),
        postal_code: String(shippingRaw?.postal_code || ''),
        country: String(shippingRaw?.country || 'US'),
        phone: String(shippingRaw?.phone || ''),
      },
      quote: {
        quote_id: String(pricingQuote?.quote_id || `resume:${orderId}`),
        currency: String(pricingQuote?.currency || currency).trim().toUpperCase() || currency,
        pricing,
        line_items: items.map((item) => ({
          variant_id: item.variant_id || item.product_id,
          unit_price_effective: Number(item.unit_price) || 0,
        })),
      },
      paymentResponse,
    },
  }
}

function OrderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [resumeOrder, setResumeOrder] = useState<ResumeOrderState | null>(null)
  const [resumeOrderLoading, setResumeOrderLoading] = useState(false)
  const [resumeOrderError, setResumeOrderError] = useState<string | null>(null)
  const [ucpFailure, setUcpFailure] = useState<UcpFailure | null>(null)
  const hasAutoReturnedRef = useRef(false)
  const ucpCheckoutSessionId =
    (searchParams.get('ucp_checkout_session_id') ||
      searchParams.get('ucpCheckoutSessionId') ||
      '').trim() || null
  const [sellerName, setSellerName] = useState<string | null>(
    (searchParams.get('seller_name') || searchParams.get('sellerName') || '').trim() || null,
  )
  const [sellerDomain, setSellerDomain] = useState<string | null>(
    (searchParams.get('seller_domain') || searchParams.get('sellerDomain') || '').trim() || null,
  )
  const [billingDescriptor, setBillingDescriptor] = useState<string | null>(
    (searchParams.get('billing_descriptor') || searchParams.get('billingDescriptor') || '').trim() ||
      null,
  )
  const returnUrl = safeReturnUrl(
    searchParams.get('return') ||
      searchParams.get('returnUrl') ||
      searchParams.get('return_url'),
  )
  const [checkoutSource, setCheckoutSource] = useState<string | null>(
    normalizeCheckoutSource(
      searchParams.get('source') || searchParams.get('src') || searchParams.get('entry'),
    ),
  )
  const source = checkoutSource || ''
  const entryParam = (searchParams.get('entry') || '').trim() || null
  const embedParam = (searchParams.get('embed') || '').trim() || null
  const parentOriginParam =
    (searchParams.get('parent_origin') || searchParams.get('parentOrigin') || '').trim() ||
    null
  const auroraUidParam = (searchParams.get('aurora_uid') || '').trim() || null
  const langParam = (searchParams.get('lang') || '').trim() || null
  const checkoutTokenFromQuery =
    (searchParams.get('checkout_token') || searchParams.get('checkoutToken') || '').trim() || null
  const [checkoutToken, setCheckoutToken] = useState<string | null>(checkoutTokenFromQuery)
  const hasCheckoutToken = Boolean(checkoutToken)
  const skipEmailVerification =
    hasCheckoutToken || source === 'look_replicator' || source === 'lookreplicator'
  const buyerRef =
    (searchParams.get('buyer_ref') || searchParams.get('buyerRef') || '').trim() ||
    null
  const jobId =
    (searchParams.get('job_id') || searchParams.get('jobId') || '').trim() ||
    null
  const market =
    (searchParams.get('market') || '').trim().toUpperCase() || null
  const locale = (searchParams.get('locale') || '').trim().toLowerCase() || null
  const checkoutDebug =
    (searchParams.get('checkout_debug') || searchParams.get('debug') || '').trim() || null
  const resumeOrderId =
    (searchParams.get('orderId') || searchParams.get('order_id') || '').trim() || null
  const resumeOrderEmail =
    (searchParams.get('email') ||
      searchParams.get('customer_email') ||
      searchParams.get('customerEmail') ||
      '')
      .trim() || null
  const itemsParam = searchParams.get('items')
  const entryModeFromQuery =
    (searchParams.get('entry_mode') || searchParams.get('entryMode') || '').trim() || null
  const fallbackReasonFromQuery =
    (searchParams.get('fallback_reason') || searchParams.get('fallbackReason') || '').trim() ||
    null
  const entryMode =
    entryModeFromQuery ||
    (ucpCheckoutSessionId
      ? 'ucp_session'
      : resumeOrderId
        ? 'resume_order'
        : checkoutTokenFromQuery
          ? 'creator_token'
          : itemsParam
            ? 'legacy_items'
            : null)
  const fallbackReason =
    fallbackReasonFromQuery || (itemsParam && !entryModeFromQuery ? 'legacy_deeplink' : null)

  const markUcpCheckoutSessionFailure = async (
    checkoutId: string,
    reason: 'payment_failed' | 'system_error' | 'action_required',
    stage: 'payment' | 'shipping',
  ) => {
    if (!checkoutId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 2000)
    try {
      await fetch(
        `/api/ucp/checkout-sessions/${encodeURIComponent(checkoutId)}/mark-failure`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason, stage }),
          signal: controller.signal,
          cache: 'no-store',
        },
      )
    } catch {
      // Best-effort: do not block buyer flow.
    } finally {
      window.clearTimeout(timeout)
    }
  }

  useEffect(() => {
    const rawSearch = searchParams.toString()
    const context = getCheckoutContextFromBrowser(rawSearch ? `?${rawSearch}` : '')
    setCheckoutToken(context.token)
    setCheckoutSource(context.source)
  }, [checkoutTokenFromQuery, searchParams])

  useEffect(() => {
    // In a real app, this would come from cart state or API
    // For demo, we'll parse from URL params or use mock data
    const checkoutId = ucpCheckoutSessionId
    if (checkoutId) {
      ;(async () => {
        try {
          const res = await fetch(`/ucp/v1/checkout-sessions/${encodeURIComponent(checkoutId)}`, {
            cache: 'no-store',
          })
          const json = await res.json().catch(() => null)
          const ui = json?.pivota?.ui || null
          const itemsFromUi = ui?.items
          const merchantId = (ui?.merchant_id || ui?.merchantId || '').trim() || null
          const seller = ui?.seller || null

          if (merchantId) {
            setMerchantId(merchantId)
          }
          if (seller && typeof seller === 'object') {
            const name = String(seller?.name || '').trim() || null
            const domain = String(seller?.domain || '').trim() || null
            if (name && !sellerName) setSellerName(name)
            if (domain && !sellerDomain) setSellerDomain(domain)
          }
          const bd = String(ui?.billing_descriptor || ui?.billingDescriptor || '').trim() || null
          if (bd && !billingDescriptor) setBillingDescriptor(bd)

          if (Array.isArray(itemsFromUi) && itemsFromUi.length > 0) {
            setOrderItems(itemsFromUi)
            return
          }

          // Fallback: derive minimal items from UCP response line_items only when the
          // session already contains concrete product identifiers. In the UCP
          // session-first path, `line_items[].item.id` is typically an `offer_v1`
          // token, which downstream quote/create-order APIs cannot consume.
          const ucpLineItems = Array.isArray(json?.line_items) ? json.line_items : []
          const currency =
            String(json?.currency || ui?.currency || '').trim().toUpperCase() || 'USD'
          const derived = ucpLineItems
            .map((li: any) => {
              const item = li?.item || {}
              const itemId = String(item?.id || '').trim()
              if (!itemId || isUcpOfferToken(itemId)) return null
              const priceMinor = Number(item?.price)
              const qty = Number(li?.quantity) || 1
              return {
                product_id: itemId,
                merchant_id: merchantId || undefined,
                title: String(item?.title || itemId || ''),
                quantity: qty,
                unit_price: Number.isFinite(priceMinor) ? priceMinor / 100.0 : 0,
                currency,
              }
            })
            .filter((it: any) => Boolean(it.product_id))
          if (derived.length > 0) setOrderItems(derived)
        } catch {
          // Best-effort: if fetch fails, keep page empty.
        }
      })()
    } else if (itemsParam) {
      try {
        // `URLSearchParams.get()` already returns a decoded string. Calling `decodeURIComponent`
        // again will throw for common product titles like "10%".
        // Still, some callers may pass an already-encoded payload, so we try both.
        const parsed =
          (() => {
            try {
              return JSON.parse(itemsParam)
            } catch {
              // ignore
            }
            try {
              return JSON.parse(decodeURIComponent(itemsParam))
            } catch {
              // ignore
            }
            return null
          })() || null

        if (!Array.isArray(parsed)) {
          throw new Error('items param is not an array')
        }

        setOrderItems(parsed as OrderItem[])

        // Best-effort: persist a merchant override so checkout can recover seller selection
        // even if an item payload is missing merchant_id.
        const merchantId =
          parsed
            .map((it: any) => String(it?.merchant_id || '').trim())
            .find(Boolean) || null
        if (merchantId) {
          setMerchantId(merchantId)
        }
      } catch (e) {
        console.error('[Order] Failed to parse items query param:', e)
        setOrderItems([])
      }
    } else if (resumeOrderId) {
        ;(async () => {
          setResumeOrderLoading(true)
          setResumeOrderError(null)
          try {
            let raw: any
            try {
              raw = await getAccountOrder(resumeOrderId)
            } catch (error) {
              if (!resumeOrderEmail) throw error
              raw = await publicOrderResume(resumeOrderId, resumeOrderEmail)
            }
            const loaded = buildResumeOrderState(raw)
            if (!loaded) {
              setOrderItems([])
              setResumeOrder(null)
              setResumeOrderError('This payment link is missing order details. Reopen the full payment link and retry.')
              return
            }
            setOrderItems(loaded.items)
            setResumeOrder(loaded.resumeOrder)
            setResumeOrderError(null)
            const merchantId =
              loaded.items
                .map((item) => String(item.merchant_id || '').trim())
                .find(Boolean) || null
            if (merchantId) {
              setMerchantId(merchantId)
            }
          } catch (error) {
            console.error('[Order] Failed to load resumable order:', error)
            setOrderItems([])
            setResumeOrder(null)
            setResumeOrderError(
              resumeOrderEmail
                ? 'We could not verify this payment link. Reopen the latest link and retry.'
                : 'This payment link needs buyer verification. Sign in or open the full link that includes your email.',
            )
          } finally {
            setResumeOrderLoading(false)
          }
        })()
    } else {
      // Mock data for testing
      setOrderItems([
        {
          product_id: 'BOTTLE_001',
          merchant_id: undefined,
          title: 'Stainless Steel Water Bottle - 24oz',
          quantity: 1,
          unit_price: 24.99,
          image_url: 'https://m.media-amazon.com/images/I/61CGHv1V7AL._AC_SL1500_.jpg'
        }
      ])
    }
  }, [itemsParam, resumeOrderId, resumeOrderEmail, sellerName, sellerDomain, billingDescriptor, ucpCheckoutSessionId])

  useEffect(() => {
    if (!ucpFailure || !returnUrl) return
    if (ucpFailure.reason === 'action_required') return
    if (hasAutoReturnedRef.current) return

    const autoReturnEnabled = ['1', 'true', 'yes', 'on'].includes(
      (process.env.NEXT_PUBLIC_UCP_AUTO_RETURN_ON_FAIL || '').trim().toLowerCase(),
    )
    if (!autoReturnEnabled) return

    hasAutoReturnedRef.current = true

    const url = withReturnParams(returnUrl, {
      checkout: 'fail',
      reason: ucpFailure.reason,
      ...(ucpCheckoutSessionId ? { ucp_checkout_session_id: ucpCheckoutSessionId } : {}),
      ...(entryMode ? { entry_mode: entryMode } : {}),
      ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
    })

    window.setTimeout(() => {
      window.location.assign(url)
    }, 50)
  }, [fallbackReason, entryMode, ucpFailure, returnUrl, ucpCheckoutSessionId])

  const linkUcpCheckoutSessionOrder = async (checkoutId: string, orderId: string) => {
    if (!checkoutId || !orderId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 2000)
    try {
      await fetch(
        `/api/ucp/checkout-sessions/${encodeURIComponent(checkoutId)}/link-order`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ order_id: orderId }),
          signal: controller.signal,
          cache: 'no-store',
        },
      )
    } catch {
      // Best-effort: do not block buyer flow.
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const cancelUcpCheckoutSession = async (checkoutId: string) => {
    if (!checkoutId) return
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 2000)
    try {
      await fetch(`/ucp/v1/checkout-sessions/${encodeURIComponent(checkoutId)}/cancel`, {
        method: 'POST',
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch {
      // Best-effort: do not block buyer flow.
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const handleComplete = (orderId: string, options?: { finalizing?: boolean }) => {
    // In production, this would save order to backend
    console.log('Order completed:', orderId)

    if (ucpCheckoutSessionId) {
      void linkUcpCheckoutSessionOrder(ucpCheckoutSessionId, orderId)
    }

    const sellerParams = new URLSearchParams()
    if (sellerName) sellerParams.set('seller_name', sellerName)
    if (sellerDomain) sellerParams.set('seller_domain', sellerDomain)
    if (billingDescriptor) sellerParams.set('billing_descriptor', billingDescriptor)
    if (ucpCheckoutSessionId) sellerParams.set('ucp_checkout_session_id', ucpCheckoutSessionId)
    if (checkoutDebug) sellerParams.set('checkout_debug', checkoutDebug)
    if (checkoutToken) sellerParams.set('checkout_token', checkoutToken)
    if (entryMode) sellerParams.set('entry_mode', entryMode)
    if (fallbackReason) sellerParams.set('fallback_reason', fallbackReason)
    if (entryParam) sellerParams.set('entry', entryParam)
    if (embedParam) sellerParams.set('embed', embedParam)
    if (parentOriginParam) sellerParams.set('parent_origin', parentOriginParam)
    if (auroraUidParam) sellerParams.set('aurora_uid', auroraUidParam)
    if (langParam) sellerParams.set('lang', langParam)
    if (source) sellerParams.set('source', source)
    if (options?.finalizing) sellerParams.set('finalizing', '1')
    const sellerSuffix = sellerParams.toString() ? `&${sellerParams.toString()}` : ''

    router.push(
      `/order/success?orderId=${encodeURIComponent(orderId)}${
        returnUrl ? `&return=${encodeURIComponent(returnUrl)}` : ''
      }${sellerSuffix}`,
    )
  }

  const handleCancel = () => {
    if (ucpCheckoutSessionId) {
      void cancelUcpCheckoutSession(ucpCheckoutSessionId)
    }
    if (returnUrl) {
      const url = withReturnParams(returnUrl, {
        checkout: 'cancel',
        ...(ucpCheckoutSessionId ? { ucp_checkout_session_id: ucpCheckoutSessionId } : {}),
        ...(entryMode ? { entry_mode: entryMode } : {}),
        ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
      })
      window.location.assign(url)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 py-1.5 sm:px-4 sm:py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (returnUrl) {
                  handleCancel()
                  return
                }
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back()
                  return
                }
                router.push('/')
              }}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
		            </button>
	            <div className="flex items-center gap-2">
	              <Image
	                src="/pivota-logo-pink.png"
	                alt="Pivota"
	                width={32}
	                height={32}
	                className="w-8 h-8 rounded-lg sm:w-9 sm:h-9"
	              />
	              <h1 className="text-lg md:text-xl font-bold text-gray-800">Pivota Checkout</h1>
	            </div>
	          </div>
	        </div>
	      </header>

      <div className="py-3 md:py-4">
        {ucpFailure && (returnUrl || ucpCheckoutSessionId) && (
          <div className="max-w-4xl mx-auto px-4 mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-gray-800">
              <p className="font-medium text-gray-900 mb-1">Checkout needs attention</p>
              <p className="text-gray-700">
                Payment was not completed. You can retry here, or return to the agent to try another merchant.
              </p>
              {returnUrl && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      const url = withReturnParams(returnUrl, {
                        checkout: 'fail',
                        reason: ucpFailure.reason,
                        ...(ucpCheckoutSessionId ? { ucp_checkout_session_id: ucpCheckoutSessionId } : {}),
                        ...(entryMode ? { entry_mode: entryMode } : {}),
                        ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
                      })
                      window.location.assign(url)
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
                  >
                    Return to agent
                  </button>
                  <button
                    onClick={() => setUcpFailure(null)}
                    className="px-4 py-2 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    Retry here
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {(sellerName || sellerDomain) && (
          <div className="max-w-4xl mx-auto px-4 mb-4">
            <div className="bg-white border border-blue-100 rounded-xl p-4 text-sm text-gray-700">
              <p className="font-medium text-gray-900 mb-1">Seller disclosure</p>
              <p>
                Sold by{' '}
                <span className="font-medium">
                  {sellerName || 'Merchant'}
                </span>
                {sellerDomain ? (
                  <>
                    {' '}
                    (<span className="font-mono">{sellerDomain}</span>)
                  </>
                ) : null}
                . Pivota provides the checkout experience but is not the seller of record.
              </p>
              {billingDescriptor ? (
                <p className="mt-2">
                  Billing descriptor (expected):{' '}
                  <span className="font-mono">{billingDescriptor}</span>
                </p>
              ) : null}
            </div>
          </div>
        )}
        {orderItems.length > 0 ? (
          <OrderFlow 
            items={orderItems}
            onComplete={handleComplete}
            onCancel={handleCancel}
            onFailure={(args) => {
              setUcpFailure(args)
              if (ucpCheckoutSessionId) {
                void markUcpCheckoutSessionFailure(ucpCheckoutSessionId, args.reason, args.stage)
              }
            }}
            skipEmailVerification={skipEmailVerification || Boolean(resumeOrder?.orderId)}
            buyerRef={buyerRef}
            jobId={jobId}
            market={market}
            locale={locale}
            checkoutToken={checkoutToken}
            returnUrl={returnUrl}
            resumeOrder={resumeOrder}
            entryMode={entryMode}
            fallbackReason={fallbackReason}
          />
        ) : resumeOrderId && resumeOrderLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading your order…</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">
              {resumeOrderId ? resumeOrderError || 'We could not load this order.' : 'No items in your order'}
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function OrderPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order...</p>
        </div>
      </main>
    }>
      <OrderContent />
    </Suspense>
  )
}
