'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Package, ArrowRight, LoaderCircle, AlertCircle } from 'lucide-react'
import { confirmOrderPayment, getOrderStatus } from '@/lib/api'
import { resolveExternalAgentHomeUrl, safeReturnUrl, withReturnParams } from '@/lib/returnUrl'
import { isAuroraEmbedMode, postRequestCloseToParent } from '@/lib/auroraEmbed'
import { getCheckoutContextFromBrowser } from '@/lib/checkoutToken'
import {
  confirmPaymentWithRetry,
  pollOrderStatusUntilSettled,
} from '@/lib/checkoutFinalization'

type BuyerVaultSnapshot = {
  email: string | null
  hasAddress: boolean
}

const EMPTY_BUYER_VAULT_SNAPSHOT: BuyerVaultSnapshot = {
  email: null,
  hasAddress: false,
}

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

function resolveTrackingEmail(args: {
  explicitEmail: string | null
  vaultEmail: string | null
  checkoutTokenPayload: any | null
}): string | null {
  const fromExplicit = String(args.explicitEmail || '').trim().toLowerCase()
  if (fromExplicit) return fromExplicit

  const fromVault = String(args.vaultEmail || '').trim().toLowerCase()
  if (fromVault) return fromVault

  const payload = args.checkoutTokenPayload
  if (!payload || typeof payload !== 'object') return null
  const candidateKeys = [
    'email',
    'customer_email',
    'customerEmail',
    'buyer_email',
    'buyerEmail',
  ]
  for (const key of candidateKeys) {
    const value = String(payload?.[key] || '').trim().toLowerCase()
    if (value) return value
  }
  return null
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
  const trackingEmailFromQuery =
    (searchParams.get('email') ||
      searchParams.get('customer_email') ||
      searchParams.get('customerEmail') ||
      '').trim() || null
  const checkoutTokenFromQuery =
    (searchParams.get('checkout_token') || searchParams.get('checkoutToken') || '').trim() || null
  const shouldFinalizeOnLoad = ['1', 'true', 'yes', 'on'].includes(
    String(searchParams.get('finalizing') || '').trim().toLowerCase(),
  )
  const returnUrl = safeReturnUrl(rawReturn)
  const entryParam = (searchParams.get('entry') || '').trim() || null
  const sourceParam =
    (searchParams.get('source') || searchParams.get('src') || '').trim() || null
  const parentOriginParam =
    (searchParams.get('parent_origin') || searchParams.get('parentOrigin') || '').trim() || null
  const externalContinueUrl = useMemo(
    () =>
      safeReturnUrl(parentOriginParam) ||
      resolveExternalAgentHomeUrl(entryParam || sourceParam),
    [entryParam, sourceParam, parentOriginParam],
  )
  const hasReturnHint = Boolean(rawReturn && !returnUrl)
  const isEmbedMode = useMemo(() => isAuroraEmbedMode(), [])

  const [checkoutToken, setCheckoutToken] = useState<string | null>(null)
  const [finalizationState, setFinalizationState] = useState<'idle' | 'running' | 'delayed' | 'failed'>(
    shouldFinalizeOnLoad ? 'running' : 'idle',
  )
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'step_up' | 'error'>(
    'idle',
  )
  const [saveLoginUrl, setSaveLoginUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [buyerVaultSnapshot, setBuyerVaultSnapshot] = useState<BuyerVaultSnapshot>(EMPTY_BUYER_VAULT_SNAPSHOT)
  const hasBuyerVaultPrefill = Boolean(buyerVaultSnapshot.email || buyerVaultSnapshot.hasAddress)
  const canSave = Boolean(checkoutToken || orderId || saveTokenFromUrl || hasBuyerVaultPrefill)
  const isAwaitingConfirmedPayment =
    shouldFinalizeOnLoad && finalizationState !== 'idle' && finalizationState !== 'failed'

  useEffect(() => {
    const rawSearch = searchParams.toString()
    const context = getCheckoutContextFromBrowser(rawSearch ? `?${rawSearch}` : '')
    setCheckoutToken(context.token)
  }, [checkoutTokenFromQuery, searchParams])

  const loadBuyerVaultSnapshot = useCallback(async (): Promise<BuyerVaultSnapshot> => {
    try {
      const res = await fetch('/api/buyer/me', { cache: 'no-store' })
      if (!res.ok) {
        setBuyerVaultSnapshot(EMPTY_BUYER_VAULT_SNAPSHOT)
        return EMPTY_BUYER_VAULT_SNAPSHOT
      }
      const json = await res.json().catch(() => null)
      const email = String(json?.buyer?.primary_email || '').trim() || null
      const addr = json?.default_address
      const hasAddress = Boolean(
        addr &&
          typeof addr === 'object' &&
          (addr.line1 || addr.recipient_name || addr.postal_code || addr.country || addr.city),
      )
      const snapshot: BuyerVaultSnapshot = { email, hasAddress }
      setBuyerVaultSnapshot(snapshot)
      return snapshot
    } catch {
      setBuyerVaultSnapshot(EMPTY_BUYER_VAULT_SNAPSHOT)
      return EMPTY_BUYER_VAULT_SNAPSHOT
    }
  }, [])

  useEffect(() => {
    void loadBuyerVaultSnapshot()
  }, [loadBuyerVaultSnapshot])

  const intentId = useMemo(() => {
    const payload = decodeCheckoutTokenPayload(checkoutToken)
    const id = String(payload?.intent_id || payload?.intentId || '').trim()
    return id || null
  }, [checkoutToken])
  const checkoutTokenPayload = useMemo(
    () => decodeCheckoutTokenPayload(checkoutToken),
    [checkoutToken],
  )
  const trackingEmail = useMemo(
    () =>
      resolveTrackingEmail({
        explicitEmail: trackingEmailFromQuery,
        vaultEmail: buyerVaultSnapshot.email,
        checkoutTokenPayload,
      }),
    [buyerVaultSnapshot.email, checkoutTokenPayload, trackingEmailFromQuery],
  )

  const attemptSave = useCallback(
    async (args: { save_token?: string; intent_id?: string; order_id?: string }) => {
      setSaveStatus('saving')
      setSaveError(null)
      setSaveLoginUrl(null)
      try {
        // Buyer Vault first: when available, treat it as canonical defaults.
        // Still proceed with save_from_checkout when checkout context exists,
        // so order/intent linkage and audit trails remain intact.
        const vault = await loadBuyerVaultSnapshot()
        const hasVaultPrefill = Boolean(vault.email || vault.hasAddress)
        const hasCheckoutContext = Boolean(checkoutToken || args.save_token || args.intent_id || args.order_id)
        if (!hasCheckoutContext && hasVaultPrefill) {
          setSaveStatus('saved')
          return
        }

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
        // If checkout context is unavailable but Buyer Vault already has defaults,
        // allow a graceful success state.
        const message = String(json?.error?.message || json?.detail?.error?.message || '').trim().toLowerCase()
        if (!hasCheckoutContext && hasVaultPrefill && message.includes('checkout')) {
          setSaveStatus('saved')
          return
        }
        setSaveStatus('error')
        setSaveError(String(json?.error?.message || json?.detail?.error?.message || 'Failed to save').trim())
      } catch (err: any) {
        setSaveStatus('error')
        setSaveError(err?.message || String(err))
      }
    },
    [checkoutToken, loadBuyerVaultSnapshot],
  )

  useEffect(() => {
    if (!saveTokenFromUrl) return
    if (saveStatus !== 'idle') return
    if (!checkoutToken && !orderId) return
    void attemptSave({
      save_token: saveTokenFromUrl,
      ...(orderId ? { order_id: orderId } : {}),
    })
  }, [saveTokenFromUrl, checkoutToken, orderId, saveStatus, attemptSave])

  useEffect(() => {
    if (!shouldFinalizeOnLoad || !orderId) return

    let active = true
    setFinalizationState('running')

    const run = async () => {
      const confirmation = await confirmPaymentWithRetry({
        orderId,
        confirmPayment: confirmOrderPayment,
        maxAttempts: 1,
        retryDelayMs: 220,
      })

      if (!active) return
      if (confirmation.status === 'confirmed') {
        setFinalizationState('idle')
        return
      }
      if (confirmation.status === 'failed') {
        setFinalizationState('failed')
        return
      }

      const pollResult = await pollOrderStatusUntilSettled({
        orderId,
        getOrderStatus,
        timeoutMs: 4000,
        intervalMs: 500,
      })

      if (!active) return
      setFinalizationState(
        pollResult.status === 'confirmed'
          ? 'idle'
          : pollResult.status === 'failed'
            ? 'failed'
            : 'delayed',
      )
    }

    void run()

    return () => {
      active = false
    }
  }, [orderId, shouldFinalizeOnLoad])

  useEffect(() => {
    if (!shouldFinalizeOnLoad || !orderId || finalizationState !== 'delayed') return

    let active = true

    const runFollowUpPolling = async () => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 1200)
        })
        if (!active) return

        const pollResult = await pollOrderStatusUntilSettled({
          orderId,
          getOrderStatus,
          timeoutMs: 2500,
          intervalMs: 500,
        })

        if (!active) return
        if (pollResult.status === 'confirmed') {
          setFinalizationState('idle')
          return
        }
        if (pollResult.status === 'failed') {
          setFinalizationState('failed')
          return
        }
      }
    }

    void runFollowUpPolling()

    return () => {
      active = false
    }
  }, [finalizationState, orderId, shouldFinalizeOnLoad])

  const continueShopping = () => {
    if (externalContinueUrl) {
      window.location.assign(externalContinueUrl)
      return
    }
    if (isEmbedMode || (typeof window !== 'undefined' && window.parent !== window)) {
      const posted = postRequestCloseToParent({ reason: 'order_success_continue' })
      if (posted) return
      try {
        window.history.back()
        return
      } catch {
        // ignore
      }
    }
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-100 flex items-center justify-center px-4 py-6">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full text-center">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
            finalizationState === 'failed'
              ? 'bg-amber-100'
              : isAwaitingConfirmedPayment
                ? 'bg-blue-100'
                : 'bg-green-100'
          }`}
        >
          {finalizationState === 'failed' ? (
            <AlertCircle className="w-7 h-7 text-amber-600" />
          ) : isAwaitingConfirmedPayment ? (
            <LoaderCircle className="w-7 h-7 text-blue-600 animate-spin" />
          ) : (
            <Check className="w-7 h-7 text-green-600" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {finalizationState === 'failed'
            ? 'Payment failed'
            : isAwaitingConfirmedPayment
              ? 'Confirming payment'
              : 'Order Successful!'}
        </h1>
        <p className="text-sm text-gray-600 mb-5">
          {finalizationState === 'failed'
            ? 'This payment attempt did not complete. Restart checkout to try again.'
            : finalizationState === 'running'
              ? 'Payment received. Confirming your order now.'
              : finalizationState === 'delayed'
                ? 'Payment received. Final confirmation is taking a little longer than usual.'
                : 'Thank you for shopping with Pivota. Your order has been confirmed.'}
        </p>

        {finalizationState === 'failed' ? (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-800"
          >
            <p className="text-sm font-medium">This order cannot continue from the same payment link.</p>
            <p className="mt-1 text-xs">Return to the merchant or restart checkout to create a new order.</p>
          </div>
        ) : finalizationState === 'delayed' ? (
          <div
            className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-amber-800"
          >
            <p className="text-sm font-medium">Still syncing payment status</p>
            <p className="mt-1 text-xs">You can stay here. We&apos;ll update this page automatically.</p>
          </div>
        ) : null}

        {orderId && (
          <div className="bg-gray-50 rounded-lg p-3 mb-5">
            <p className="text-xs text-gray-600 mb-1">Order Number</p>
            <p className="font-mono font-bold text-base">{orderId}</p>
          </div>
        )}

        <div className="mb-5 space-y-2.5">
          {(returnUrl || hasReturnHint) && (
            <button
              onClick={() => {
                if (!returnUrl) {
                  const posted = postRequestCloseToParent({ reason: 'order_success_return_invalid' })
                  if (posted) return
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
              className="w-full px-4 py-2.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Return to previous page
            </button>
          )}
          {!returnUrl && !hasReturnHint && (
            <>
              <button
                onClick={() => {
                  const params = new URLSearchParams()
                  if (orderId) params.set('orderId', orderId)
                  if (trackingEmail) params.set('email', trackingEmail)
                  router.push(`/order/track?${params.toString()}`)
                }}
                className="w-full px-4 py-2.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                Track Your Order
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={continueShopping}
                className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Continue Shopping
              </button>
            </>
          )}
        </div>

        <div className="text-left bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 space-y-3.5">
          <div className="text-sm font-medium text-slate-800">Order details & settings</div>
            {(sellerName || sellerDomain) && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-gray-700">
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
                  <p className="text-xs text-gray-700 mt-2">
                    <span className="font-medium">Billing descriptor (expected):</span>{' '}
                    <span className="font-mono">{billingDescriptor}</span>
                  </p>
                ) : null}
                <p className="text-[11px] text-gray-600 mt-2">
                  Pivota provides the checkout experience but is not the seller of record.
                </p>
              </div>
            )}

            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3">
              <p className="text-xs text-gray-800 font-medium">
                Save address for next time so future checkouts can be auto-filled
              </p>
              <div className="mt-2.5">
                {saveStatus === 'saved' ? (
                  <p className="text-xs text-green-700">Saved. Next time checkout will auto-fill.</p>
                ) : saveStatus === 'step_up' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-700">Login required to save.</p>
                    {saveLoginUrl ? (
                      <button
                        onClick={() => window.location.assign(saveLoginUrl)}
                        className="w-full px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        Login to save
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void attemptSave({ intent_id: intentId || undefined, order_id: orderId || undefined })}
                    disabled={!canSave || saveStatus === 'saving'}
                    className="w-full px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60"
                  >
                    {saveStatus === 'saving' ? 'Saving…' : 'Save'}
                  </button>
                )}
                {saveStatus === 'error' && saveError ? <p className="text-[11px] text-red-700 mt-2">{saveError}</p> : null}
                {saveStatus === 'idle' && hasBuyerVaultPrefill ? (
                  <p className="text-[11px] text-gray-600 mt-2">
                    Buyer Vault defaults detected. Future checkout will prioritize your saved email and address.
                  </p>
                ) : null}
                {!canSave ? (
                  <p className="text-[11px] text-gray-600 mt-2">
                    Missing checkout session. Please return to the app and retry checkout.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
                <Package className="w-4 h-4" />
                <span>Estimated delivery: 3-5 business days</span>
              </div>
              <p className="text-xs text-gray-500 text-center">
                You&apos;ll receive a confirmation email with tracking information.
              </p>
            </div>
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
