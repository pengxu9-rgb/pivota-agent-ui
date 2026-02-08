'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Package, ArrowRight } from 'lucide-react'
import { safeReturnUrl, withReturnParams } from '@/lib/returnUrl'

function decodeCheckoutTokenPayload(token: string | null): any | null {
  const raw = String(token || '').trim()
  if (!raw) return null
  const parts = raw.split('.')
  const payloadB64 =
    parts.length === 3 && parts[0] === 'v1' ? parts[1] : parts.length === 2 ? parts[0] : null
  if (!payloadB64) return null

  try {
    const padded = payloadB64 + '==='.slice((payloadB64.length + 3) % 4)
    const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(b64))
    return json && typeof json === 'object' ? json : null
  } catch {
    return null
  }
}

function SuccessContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const orderId =
    (searchParams.get('orderId') ||
      searchParams.get('order_id') ||
      searchParams.get('orderID') ||
      searchParams.get('order') ||
      '').trim() || null
  const saveTokenFromUrl = (searchParams.get('save_token') || '').trim() || null
  const ucpCheckoutSessionId =
    (searchParams.get('ucp_checkout_session_id') ||
      searchParams.get('ucpCheckoutSessionId') ||
      '').trim() || null
  const sellerName = (searchParams.get('seller_name') || searchParams.get('sellerName') || '').trim() || null
  const sellerDomain =
    (searchParams.get('seller_domain') || searchParams.get('sellerDomain') || '').trim() || null
  const billingDescriptor =
    (searchParams.get('billing_descriptor') ||
      searchParams.get('billingDescriptor') ||
      '').trim() || null
  const rawReturn =
    searchParams.get('return') ||
    searchParams.get('returnUrl') ||
    searchParams.get('return_url')
  const returnUrl = safeReturnUrl(rawReturn)
  const hasReturnHint = Boolean(rawReturn && !returnUrl)

  const [checkoutToken, setCheckoutToken] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'step_up' | 'error'>(
    'idle',
  )
  const [saveLoginUrl, setSaveLoginUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const tokenFromUrl = (params.get('checkout_token') || params.get('checkoutToken') || '').trim()
      if (tokenFromUrl) {
        window.sessionStorage.setItem('pivota_checkout_token', tokenFromUrl)
        setCheckoutToken(tokenFromUrl)
        return
      }

      const token = window.sessionStorage.getItem('pivota_checkout_token')
      setCheckoutToken(token ? String(token).trim() : null)
    } catch {
      setCheckoutToken(null)
    }
  }, [])

  const intentId = useMemo(() => {
    const payload = decodeCheckoutTokenPayload(checkoutToken)
    const id = String(payload?.intent_id || payload?.intentId || '').trim()
    return id || null
  }, [checkoutToken])

  const attemptSave = async (args: { save_token?: string; intent_id?: string; order_id?: string }) => {
    setSaveStatus('saving')
    setSaveError(null)
    setSaveLoginUrl(null)
    try {
      const res = await fetch('/api/buyer/save_from_checkout', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(checkoutToken ? { 'X-Checkout-Token': checkoutToken } : {}),
        },
        body: JSON.stringify({
          ...(args.save_token ? { save_token: args.save_token } : {}),
          ...(args.intent_id ? { intent_id: args.intent_id } : {}),
          ...(args.order_id ? { order_id: args.order_id } : {}),
          save_email: true,
          save_address: true,
        }),
        cache: 'no-store',
      })
      const json = await res.json().catch(() => null)
      if (res.ok) {
        setSaveStatus('saved')
        return
      }
      const code = json?.error?.code || json?.detail?.error?.code
      if (code === 'STEP_UP_REQUIRED') {
        setSaveStatus('step_up')
        setSaveLoginUrl(String(json?.login_url || json?.detail?.login_url || '').trim() || null)
        return
      }
      setSaveStatus('error')
      setSaveError(String(json?.error?.message || json?.detail?.error?.message || 'Failed to save').trim())
    } catch (err: any) {
      setSaveStatus('error')
      setSaveError(err?.message || String(err))
    }
  }

  useEffect(() => {
    if (!saveTokenFromUrl) return
    if (saveStatus !== 'idle') return
    void attemptSave({ save_token: saveTokenFromUrl })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTokenFromUrl])

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Check className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Order Successful!</h1>
        <p className="text-gray-600 mb-6">
          Thank you for shopping with Pivota. Your order has been confirmed.
        </p>

        {(sellerName || sellerDomain) && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Sold by:</span>{' '}
              {sellerName || 'Merchant'}
              {sellerDomain ? (
                <>
                  {' '}
                  (<span className="font-mono">{sellerDomain}</span>)
                </>
              ) : null}
            </p>
            {billingDescriptor ? (
              <p className="text-sm text-gray-700 mt-2">
                <span className="font-medium">Billing descriptor (expected):</span>{' '}
                <span className="font-mono">{billingDescriptor}</span>
              </p>
            ) : null}
            <p className="text-xs text-gray-600 mt-2">
              Pivota provides the checkout experience but is not the seller of record.
            </p>
          </div>
        )}
        
        {orderId && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">Order Number</p>
            <p className="font-mono font-bold text-lg">{orderId}</p>
          </div>
        )}

        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-gray-800 font-medium">Save for next time</p>
          <p className="text-xs text-gray-600 mt-1">
            Save your email and shipping address to your Pivota Buyer account so future checkouts can be auto-filled.
          </p>
          <div className="mt-3">
            {saveStatus === 'saved' ? (
              <p className="text-sm text-green-700">Saved. Next time checkout will auto-fill.</p>
            ) : saveStatus === 'step_up' ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-700">Login required to save.</p>
                {saveLoginUrl ? (
                  <button
                    onClick={() => window.location.assign(saveLoginUrl)}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Login to save
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void attemptSave({ intent_id: intentId || undefined, order_id: orderId || undefined })}
                disabled={!checkoutToken || saveStatus === 'saving'}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {saveStatus === 'saving' ? 'Saving…' : 'Save'}
              </button>
            )}
            {saveStatus === 'error' && saveError ? <p className="text-xs text-red-700 mt-2">{saveError}</p> : null}
            {!checkoutToken ? (
              <p className="text-xs text-gray-600 mt-2">
                Missing checkout session. Please return to the app and retry checkout.
              </p>
            ) : null}
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 text-gray-600">
            <Package className="w-5 h-5" />
            <span>Estimated delivery: 3-5 business days</span>
          </div>
          
          <p className="text-sm text-gray-500">
            You&apos;ll receive a confirmation email with tracking information.
          </p>
        </div>
        
        <div className="mt-8 space-y-3">
          {(returnUrl || hasReturnHint) && (
            <button
              onClick={() => {
                if (!returnUrl) {
                  // When a return param exists but is not allowed, avoid routing into Pivota Shopping.
                  // Best-effort: close tab/window; otherwise user can manually go back.
                  window.close()
                  return
                }
                const url = orderId
                  ? withReturnParams(returnUrl, {
                      checkout: 'success',
                      orderId,
                      ...(ucpCheckoutSessionId ? { ucp_checkout_session_id: ucpCheckoutSessionId } : {}),
                    })
                  : returnUrl
                window.location.assign(url)
              }}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Return to previous page
            </button>
          )}
          {!returnUrl && !hasReturnHint && (
            <>
              <button
                onClick={() => router.push(`/order/track?orderId=${orderId}`)}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                Track Your Order
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Continue Shopping
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    }>
      <SuccessContent />
    </Suspense>
  )
}
