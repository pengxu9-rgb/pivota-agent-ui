'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import OrderFlow from '@/components/order/OrderFlow'
import { ArrowLeft } from 'lucide-react'
import { safeReturnUrl, withReturnParams } from '@/lib/returnUrl'
import { setMerchantId } from '@/lib/api'

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

type UcpFailure = {
  reason: 'payment_failed' | 'system_error' | 'action_required'
  stage: 'payment' | 'shipping'
}

function OrderContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
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
  const source =
    (searchParams.get('source') || searchParams.get('src') || '').trim().toLowerCase()
  const hasCheckoutToken = Boolean(
    (searchParams.get('checkout_token') || searchParams.get('checkoutToken') || '').trim(),
  )
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
  const checkoutToken =
    (searchParams.get('checkout_token') || searchParams.get('checkoutToken') || '').trim() ||
    null
  const checkoutDebug =
    (searchParams.get('checkout_debug') || searchParams.get('debug') || '').trim() || null

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
    // In a real app, this would come from cart state or API
    // For demo, we'll parse from URL params or use mock data
    const items = searchParams.get('items')
    if (items) {
      try {
        setOrderItems(JSON.parse(decodeURIComponent(items)))
      } catch (e) {
        // Use mock data if parsing fails
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
    } else {
      // If this order page was opened via UCP `continue_url`, fetch server-side UI payload.
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

            // Fallback: derive minimal items from UCP response line_items.
            const ucpLineItems = Array.isArray(json?.line_items) ? json.line_items : []
            const currency =
              String(json?.currency || ui?.currency || '').trim().toUpperCase() || 'USD'
            const derived = ucpLineItems
              .map((li: any) => {
                const item = li?.item || {}
                const priceMinor = Number(item?.price)
                const qty = Number(li?.quantity) || 1
                return {
                  product_id: String(item?.id || ''),
                  merchant_id: merchantId || undefined,
                  title: String(item?.title || item?.id || ''),
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
    }
  }, [searchParams, ucpCheckoutSessionId, sellerName, sellerDomain, billingDescriptor])

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
    })

    window.setTimeout(() => {
      window.location.assign(url)
    }, 50)
  }, [ucpFailure, returnUrl, ucpCheckoutSessionId])

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

  const handleComplete = (orderId: string) => {
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
      })
      window.location.assign(url)
      return
    }
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (returnUrl) {
                  handleCancel()
                  return
                }
                router.push('/')
              }}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Back to chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-base">P</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-gray-800">Pivota Checkout</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="py-4 md:py-6">
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
            skipEmailVerification={skipEmailVerification}
            buyerRef={buyerRef}
            jobId={jobId}
            market={market}
            locale={locale}
            checkoutToken={checkoutToken}
            returnUrl={returnUrl}
          />
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">No items in your order</p>
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
