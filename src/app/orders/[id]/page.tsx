'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Clock,
  LifeBuoy,
  Loader2,
  Package,
  ReceiptText,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react'
import {
  cancelAccountOrder,
  getAccountOrder,
  getAccountOrderTracking,
  requestAccountOrderRefund,
} from '@/lib/api'
import { isAuroraEmbedMode } from '@/lib/auroraEmbed'
import {
  normalizeOrderDetail,
  type NormalizedOrderDetail,
  type NormalizedRefundPspSnapshot,
} from '@/lib/orders/normalize'
import {
  buildOrderItemPdpHref,
  buildOrderListHref,
  resolveAuroraOrderScope,
} from '@/lib/orders/navigationContext'
import {
  canShowCancel,
  canShowContinuePayment,
  getOrderDisplayStatus,
  getOrderTone,
} from '@/lib/orders/status'
import { safeReturnUrl } from '@/lib/returnUrl'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

const toneClasses: Record<'success' | 'warning' | 'danger' | 'neutral', string> = {
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border border-slate-200 bg-slate-100 text-slate-700',
}

const formatMoney = (minor: number, currency: string): string => {
  const value = (minor || 0) / 100
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`
  }
}

const formatDateTime = (raw: string): string => {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatLabel = (value: string | null | undefined): string => {
  const normalized = String(value || '').trim()
  if (!normalized) return '—'
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const getRefundReferenceSummary = (snapshot: NormalizedRefundPspSnapshot | null): string | null => {
  if (!snapshot) return null
  if (snapshot.reference) {
    return snapshot.trackingReferenceKind
      ? `${snapshot.trackingReferenceKind} ${snapshot.reference}`
      : snapshot.reference
  }
  if (String(snapshot.referenceStatus || '').toLowerCase() === 'pending') {
    return snapshot.trackingReferenceKind
      ? `${snapshot.trackingReferenceKind} pending`
      : 'Pending'
  }
  return snapshot.referenceStatus ? formatLabel(snapshot.referenceStatus) : null
}

const getRefundTelemetryNote = (snapshot: NormalizedRefundPspSnapshot | null): string | null => {
  if (!snapshot) return null
  if (snapshot.failureReason) {
    return `Processor reported ${formatLabel(snapshot.failureReason)}.`
  }
  if (snapshot.pendingReason) {
    return `Processor is still working on this refund: ${formatLabel(snapshot.pendingReason)}.`
  }
  if (snapshot.reference) {
    return snapshot.trackingReferenceKind
      ? `Use this ${snapshot.trackingReferenceKind} when asking the card issuer to trace the refund.`
      : 'Use this processor reference when asking the card issuer to trace the refund.'
  }
  if (String(snapshot.referenceStatus || '').toLowerCase() === 'pending') {
    return 'Bank-side tracking reference is still pending. Some issuers show this as a reversal rather than a separate refund.'
  }
  if (snapshot.isReversal) {
    return 'This refund may appear as the original charge disappearing instead of a separate refund entry.'
  }
  return null
}

type ProgressStep = {
  key: string
  label: string
  description: string
  done: boolean
  current: boolean
}

const buildProgressSteps = (order: NormalizedOrderDetail): ProgressStep[] => {
  const status = String(order.status || '').toLowerCase()
  const paymentStatus = String(order.paymentStatus || '').toLowerCase()
  const fulfillmentStatus = String(order.fulfillmentStatus || '').toLowerCase()
  const deliveryStatus = String(order.deliveryStatus || '').toLowerCase()

  const isCancelled = status === 'cancelled' || status === 'canceled' || status === 'refunded'
  if (isCancelled) {
    return [
      {
        key: 'placed',
        label: 'Order placed',
        description: 'We received your order',
        done: true,
        current: false,
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        description: 'This order was cancelled or refunded',
        done: true,
        current: true,
      },
    ]
  }

  const isPaid = paymentStatus === 'paid' || paymentStatus === 'succeeded' || paymentStatus === 'completed'
  const isShipped =
    deliveryStatus === 'in_transit' ||
    deliveryStatus === 'shipped' ||
    fulfillmentStatus === 'shipped' ||
    fulfillmentStatus === 'fulfilled'
  const isDelivered = deliveryStatus === 'delivered' || fulfillmentStatus === 'delivered'

  return [
    {
      key: 'placed',
      label: 'Order placed',
      description: 'We received your order',
      done: true,
      current: !isPaid,
    },
    {
      key: 'paid',
      label: 'Payment confirmed',
      description: 'Payment has been captured',
      done: isPaid,
      current: isPaid && !isShipped,
    },
    {
      key: 'processing',
      label: 'Processing',
      description: 'Items are being prepared',
      done: isPaid || isShipped || isDelivered,
      current: isPaid && !isShipped,
    },
    {
      key: 'shipped',
      label: 'Shipped',
      description: 'Package handed to carrier',
      done: isShipped || isDelivered,
      current: isShipped && !isDelivered,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      description: 'Delivered to destination',
      done: isDelivered,
      current: isDelivered,
    },
  ]
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { clear, activeMerchantId } = useAuthStore()
  const [order, setOrder] = useState<NormalizedOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundDialogOpen, setRefundDialogOpen] = useState(false)
  const [refundAmountInput, setRefundAmountInput] = useState('')
  const [refundReasonInput, setRefundReasonInput] = useState('')
  const [refundValidationError, setRefundValidationError] = useState<string | null>(null)
  const searchParamsString = searchParams.toString()
  const scopeMerchantId = useMemo(
    () => resolveAuroraOrderScope(searchParams, activeMerchantId),
    [activeMerchantId, searchParams],
  )
  const scopedSearchParams = useMemo(() => {
    const next = new URLSearchParams(searchParamsString)
    if (scopeMerchantId) {
      next.set('merchant_id', scopeMerchantId)
    }
    return next
  }, [scopeMerchantId, searchParamsString])
  const scopedSearchParamsString = scopedSearchParams.toString()
  const currentDetailUrl = useMemo(() => {
    const path = `/orders/${encodeURIComponent(id)}`
    return scopedSearchParamsString ? `${path}?${scopedSearchParamsString}` : path
  }, [id, scopedSearchParamsString])
  const backToOrdersHref = useMemo(() => {
    const explicitReturnRaw = String(
      searchParams.get('return') ||
        searchParams.get('return_url') ||
        searchParams.get('returnUrl') ||
        '',
    ).trim()
    const safeReturn = safeReturnUrl(explicitReturnRaw)
    if (safeReturn) return safeReturn
    return buildOrderListHref(scopedSearchParams)
  }, [scopedSearchParams, searchParams])
  const onBackToOrders = () => {
    if (/^https?:\/\//i.test(backToOrdersHref)) {
      window.location.assign(backToOrdersHref)
      return
    }
    router.push(backToOrdersHref)
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const raw = await getAccountOrder(id)
        const normalized = normalizeOrderDetail(raw)
        if (!normalized) {
          setError('Unable to parse order response.')
          setOrder(null)
        } else {
          setOrder(normalized)
          setError(null)
        }
      } catch (err: any) {
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          clear()
          router.replace(`/login?redirect=${encodeURIComponent(currentDetailUrl)}`)
          return
        }
        setError(err?.message || 'Failed to load order')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [id, clear, currentDetailUrl, router])

  useEffect(() => {
    if (!refundDialogOpen) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || refundLoading) return
      setRefundDialogOpen(false)
      setRefundValidationError(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [refundDialogOpen, refundLoading])

  const progressSteps = useMemo(() => (order ? buildProgressSteps(order) : []), [order])
  const isEmbed = useMemo(() => isAuroraEmbedMode(), [])

  const onContinuePayment = () => {
    if (!order) return
    router.push(
      `/order?orderId=${encodeURIComponent(order.id)}&return=${encodeURIComponent(currentDetailUrl)}`,
    )
  }

  const onCancel = async () => {
    if (!order) return
    if (!canShowCancel(order.permissions, order.status, order.paymentStatus)) return

    const confirmed = window.confirm(`Cancel order ${order.id}?`)
    if (!confirmed) return
    const reason = window.prompt('Optional: tell us why you are cancelling this order (leave empty to skip).', '')

    setCancelLoading(true)
    try {
      const result = (await cancelAccountOrder(order.id, reason || undefined)) as any
      toast.success('Order cancelled')
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: String(result?.status || 'cancelled'),
              paymentStatus: String(result?.payment_status || prev.paymentStatus),
              fulfillmentStatus: String(result?.fulfillment_status || prev.fulfillmentStatus),
              deliveryStatus: String(result?.delivery_status || prev.deliveryStatus),
              updatedAt: String(result?.updated_at || prev.updatedAt),
            }
          : prev,
      )
    } catch (err: any) {
      if (err?.code === 'INVALID_STATE') {
        toast.error('Order cannot be cancelled in its current state.')
        try {
          const raw = await getAccountOrder(id)
          const normalized = normalizeOrderDetail(raw)
          if (normalized) setOrder(normalized)
        } catch {
          // Keep current UI state; user can manually refresh.
        }
      } else if (err?.code === 'NOT_FOUND') {
        toast.error('Order not found or no permission.')
      } else {
        toast.error(err?.message || 'Failed to cancel order')
      }
    } finally {
      setCancelLoading(false)
    }
  }

  const onRefreshTracking = async () => {
    if (!order) return
    setTrackingLoading(true)
    try {
      const tracking = (await getAccountOrderTracking(order.id)) as any
      setOrder((prev) => {
        if (!prev) return prev
        const events = Array.isArray(tracking?.events)
          ? tracking.events.map((event: any) => ({
              status: event?.status ? String(event.status) : null,
              description: event?.description ? String(event.description) : null,
              timestamp:
                event?.timestamp || event?.occurred_at
                  ? String(event?.timestamp || event?.occurred_at)
                  : null,
            }))
          : []

        const nextShipment = {
          trackingNumber: tracking?.tracking_number ? String(tracking.tracking_number) : null,
          carrier: tracking?.carrier ? String(tracking.carrier) : null,
          status: tracking?.status ? String(tracking.status) : prev.deliveryStatus,
          estimatedDelivery: null,
          trackingUrl: tracking?.tracking_url ? String(tracking.tracking_url) : null,
          events,
        }

        return {
          ...prev,
          deliveryStatus: nextShipment.status || prev.deliveryStatus,
          shipments:
            nextShipment.trackingNumber || nextShipment.events.length > 0 || nextShipment.trackingUrl
              ? [nextShipment]
              : prev.shipments,
        }
      })
      toast.success('Tracking updated')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to refresh tracking')
    } finally {
      setTrackingLoading(false)
    }
  }

  const onRequestRefund = () => {
    if (!order) return
    const refundableMinor = Math.max(0, order.totalAmountMinor - order.refund.totalRefundedMinor)
    if (refundableMinor <= 0) {
      toast.error('No refundable balance remaining.')
      return
    }
    setRefundAmountInput((refundableMinor / 100).toFixed(2))
    setRefundReasonInput('')
    setRefundValidationError(null)
    setRefundDialogOpen(true)
  }

  const closeRefundDialog = () => {
    if (refundLoading) return
    setRefundDialogOpen(false)
    setRefundValidationError(null)
  }

  const submitRefundRequest = async (event: any) => {
    event.preventDefault()
    if (!order) return
    const refundableMinor = Math.max(0, order.totalAmountMinor - order.refund.totalRefundedMinor)
    if (refundableMinor <= 0) {
      setRefundValidationError('No refundable balance remaining.')
      return
    }

    const parsedAmount = Number(refundAmountInput.trim())
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setRefundValidationError('Please enter a valid amount.')
      return
    }
    const amountMinor = Math.round(parsedAmount * 100)
    if (amountMinor <= 0) {
      setRefundValidationError('Amount must be greater than 0.')
      return
    }
    if (amountMinor > refundableMinor) {
      setRefundValidationError(
        `Amount exceeds refundable balance (${formatMoney(refundableMinor, order.currency)}).`,
      )
      return
    }

    const reason = refundReasonInput.trim() || undefined
    setRefundLoading(true)
    setRefundValidationError(null)
    try {
      const result = (await requestAccountOrderRefund(order.id, {
        currency: order.currency,
        amount_minor: amountMinor,
        ...(reason ? { reason } : {}),
      })) as any

      toast.success('Refund request submitted')
      let refreshed = false
      try {
        const raw = await getAccountOrder(order.id)
        const normalized = normalizeOrderDetail(raw)
        if (normalized) {
          setOrder(normalized)
          refreshed = true
        }
      } catch {
        // Fall back to local optimistic state below.
      }
      if (!refreshed) {
        setOrder((prev) =>
          prev
            ? {
                ...prev,
                status:
                  typeof result?.total_refunded_minor === 'number' &&
                  result.total_refunded_minor >= prev.totalAmountMinor
                    ? 'refunded'
                    : prev.status,
                refund: {
                  ...prev.refund,
                  status: result?.refund_status ? String(result.refund_status) : 'requested',
                  caseId: result?.case_id ? String(result.case_id) : prev.refund.caseId,
                  updatedAt: result?.updated_at
                    ? String(result.updated_at)
                    : new Date().toISOString(),
                  totalRefundedMinor:
                    typeof result?.total_refunded_minor === 'number'
                      ? Number(result.total_refunded_minor)
                      : prev.refund.totalRefundedMinor + amountMinor,
                  currency:
                    result?.currency ? String(result.currency) : prev.refund.currency || prev.currency,
                  requests: [
                    ...prev.refund.requests,
                    {
                      caseId: result?.case_id ? String(result.case_id) : null,
                      status: result?.refund_status ? String(result.refund_status) : 'requested',
                      amountMinor,
                      currency: result?.currency ? String(result.currency) : prev.currency,
                      reason: reason || null,
                      createdAt: result?.updated_at ? String(result.updated_at) : new Date().toISOString(),
                    },
                  ],
                  requestsCount: (prev.refund.requestsCount || 0) + 1,
                },
              }
            : prev,
        )
      }
      setRefundDialogOpen(false)
      setRefundAmountInput('')
      setRefundReasonInput('')
      setRefundValidationError(null)
    } catch (err: any) {
      const message = err?.message || 'Failed to submit refund request'
      setRefundValidationError(message)
      toast.error(message)
    } finally {
      setRefundLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading order...
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-white/80 p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-9 w-9 text-rose-500" />
          <h2 className="mt-3 text-lg font-semibold">Unable to load order</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Order not found'}</p>
          <button
            type="button"
            onClick={onBackToOrders}
            className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
          >
            Back to orders
          </button>
        </div>
      </div>
    )
  }

  const displayStatus = getOrderDisplayStatus({
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryStatus: order.deliveryStatus,
  })
  const statusTone = getOrderTone({
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    deliveryStatus: order.deliveryStatus,
  })
  const canPay = canShowContinuePayment(order.permissions, order.status)
  const canCancel = canShowCancel(order.permissions, order.status, order.paymentStatus)
  const canRefund =
    !['cancelled', 'canceled', 'refunded'].includes(String(order.status || '').toLowerCase()) &&
    ['paid', 'succeeded', 'completed', 'partial'].includes(
      String(order.paymentStatus || '').toLowerCase(),
    ) &&
    String(order.refund.status || '').toLowerCase() !== 'requested'
  const refundableMinor = Math.max(0, order.totalAmountMinor - order.refund.totalRefundedMinor)
  const primaryPayment = order.paymentRecords[0] || null
  const latestRefundPsp = order.refund.psp?.latest || null
  const refundReferenceSummary = getRefundReferenceSummary(latestRefundPsp)
  const refundTelemetryNote = getRefundTelemetryNote(latestRefundPsp)
  const paymentMethodText = [
    primaryPayment?.method,
    primaryPayment?.brand,
    primaryPayment?.last4 ? `•••• ${primaryPayment.last4}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const showScopeMismatch = Boolean(
    scopeMerchantId &&
      order.merchantId &&
      scopeMerchantId.trim() !== String(order.merchantId || '').trim(),
  )

  return (
    <main className="min-h-screen bg-gradient-mesh">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Order details</h1>
          </div>
          <button
            type="button"
            onClick={onBackToOrders}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </header>

        <div className="mb-4 rounded-2xl border border-border bg-card/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Order #{order.id}</div>
              <div className="text-xs text-muted-foreground">Placed {formatDateTime(order.createdAt)}</div>
            </div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[statusTone]}`}>
              {displayStatus}
            </span>
          </div>
        </div>
        {showScopeMismatch && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Scope merchant <span className="font-medium">{scopeMerchantId}</span> does not match this order&apos;s
            merchant <span className="font-medium">{order.merchantId}</span>. You can continue viewing this order.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Order actions</h2>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => window.location.assign(`mailto:support@pivota.cc?subject=${encodeURIComponent(`Order support: ${order.id}`)}`)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
                >
                  <LifeBuoy className="h-4 w-4" />
                  Contact support
                </button>
                {canPay && (
                  <button
                    type="button"
                    onClick={onContinuePayment}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-xs font-medium text-white shadow hover:shadow-lg"
                  >
                    Continue payment
                  </button>
                )}
              </div>
              <div className="mt-2">
                {canCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={cancelLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {cancelLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" />
                        Cancel order
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-xs text-muted-foreground">Order cannot be cancelled in its current state.</div>
                )}
              </div>
              <div className="mt-2">
                {canRefund ? (
                  <button
                    type="button"
                    onClick={onRequestRefund}
                    disabled={refundLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                  >
                    {refundLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting refund...
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4" />
                        Request refund
                      </>
                    )}
                  </button>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {String(order.refund.status || '').toLowerCase() === 'requested'
                      ? 'Refund request submitted. We are processing it.'
                      : 'Refund is unavailable in the current order state.'}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Order progress</h2>
              <div className="mt-4 space-y-3">
                {progressSteps.map((step, index) => (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                          step.done ? 'bg-emerald-500 text-white' : step.current ? 'bg-slate-700 text-white' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {step.done ? '✓' : index + 1}
                      </div>
                      {index < progressSteps.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{step.label}</div>
                      <div className="text-xs text-muted-foreground">{step.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Tracking</h2>
                <button
                  type="button"
                  onClick={onRefreshTracking}
                  disabled={trackingLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  {trackingLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <Truck className="h-3.5 w-3.5" />
                      Refresh
                    </>
                  )}
                </button>
              </div>
              {order.shipments.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No tracking information yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {order.shipments.map((shipment, index) => (
                    <div key={`${shipment.trackingNumber || index}`} className="rounded-xl border border-border bg-background/50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 text-sm">
                          <Truck className="h-4 w-4 text-muted-foreground" />
                          <span>{shipment.status || 'In transit'}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shipment.carrier || 'Carrier unknown'}
                          {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
                        </div>
                      </div>
                      {shipment.trackingUrl && (
                        <div className="mt-2">
                          <a
                            href={shipment.trackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Open carrier tracking
                          </a>
                        </div>
                      )}
                      {shipment.events.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {shipment.events.slice(0, 5).map((event, eventIndex) => (
                            <div key={`${event.status || event.description}-${eventIndex}`} className="flex items-start justify-between gap-3 text-xs">
                              <div>
                                <div className="font-medium">{event.status || 'Update'}</div>
                                {event.description && <div className="text-muted-foreground">{event.description}</div>}
                              </div>
                              {event.timestamp && <div className="text-muted-foreground">{formatDateTime(event.timestamp)}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Items</h2>
              <div className="mt-3 divide-y divide-border">
                {order.items.length === 0 && <p className="py-3 text-xs text-muted-foreground">No items attached to this order.</p>}
                {order.items.map((item, index) => (
                  <div key={`${item.id || item.title}-${index}`} className="flex items-start gap-3 py-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {item.productId ? (
                        <Link
                          href={buildOrderItemPdpHref(
                            item.productId,
                            item.merchantId,
                            scopedSearchParams,
                            currentDetailUrl,
                          )}
                          className="truncate text-sm font-medium text-foreground hover:underline"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <div className="truncate text-sm font-medium">{item.title}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Qty {item.quantity}
                        {item.unitPriceMinor > 0 ? ` · ${formatMoney(item.unitPriceMinor, order.currency)}` : ''}
                      </div>
                      {item.optionsText && <div className="truncate text-xs text-muted-foreground">{item.optionsText}</div>}
                    </div>
                    <div className="text-sm font-semibold">{formatMoney(item.subtotalMinor, order.currency)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:col-span-4">
            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Summary</h2>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(order.amounts.subtotalMinor, order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="font-medium text-foreground">
                    {order.amounts.discountTotalMinor > 0
                      ? `-${formatMoney(order.amounts.discountTotalMinor, order.currency)}`
                      : formatMoney(0, order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(order.amounts.shippingFeeMinor, order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(order.amounts.taxMinor, order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Total</span>
                  <span className="font-semibold text-foreground">{formatMoney(order.totalAmountMinor, order.currency)}</span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Shipping address</h2>
              {order.shippingAddress ? (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {order.shippingAddress.name && <div className="font-medium text-foreground">{order.shippingAddress.name}</div>}
                  {order.shippingAddress.addressLine1 && <div>{order.shippingAddress.addressLine1}</div>}
                  {order.shippingAddress.addressLine2 && <div>{order.shippingAddress.addressLine2}</div>}
                  <div>
                    {order.shippingAddress.city || '—'}
                    {order.shippingAddress.province ? `, ${order.shippingAddress.province}` : ''}
                    {order.shippingAddress.postalCode ? ` ${order.shippingAddress.postalCode}` : ''}
                  </div>
                  {order.shippingAddress.country && <div>{order.shippingAddress.country}</div>}
                  {order.shippingAddress.phone && <div>{order.shippingAddress.phone}</div>}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No shipping address on file.</p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Payment</h2>
              <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-medium text-foreground">{displayStatus}</span>
                </div>
                {primaryPayment?.provider && (
                  <div className="flex items-center justify-between">
                    <span>Provider</span>
                    <span className="font-medium text-foreground">{primaryPayment.provider}</span>
                  </div>
                )}
                {paymentMethodText && (
                  <div className="flex items-center justify-between">
                    <span>Method</span>
                    <span className="font-medium text-foreground">{paymentMethodText}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Amount</span>
                  <span className="font-medium text-foreground">{formatMoney(order.totalAmountMinor, order.currency)}</span>
                </div>
                {order.refund.status && order.refund.status !== 'none' && (
                  <div className="flex items-center justify-between">
                    <span>Refund status</span>
                    <span className="font-medium text-foreground">{order.refund.status}</span>
                  </div>
                )}
                {order.refund.totalRefundedMinor > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Refunded</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(order.refund.totalRefundedMinor, order.refund.currency || order.currency)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span>Refundable balance</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(refundableMinor, order.currency)}
                  </span>
                </div>
              </div>
              {latestRefundPsp && (
                <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  <div className="mb-2 font-medium text-foreground">Processor refund</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span>Status</span>
                      <span className="text-right font-medium text-foreground">
                        {formatLabel(latestRefundPsp.status)}
                      </span>
                    </div>
                    {latestRefundPsp.provider && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Provider</span>
                        <span className="text-right font-medium text-foreground">
                          {formatLabel(latestRefundPsp.provider)}
                        </span>
                      </div>
                    )}
                    {refundReferenceSummary && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Tracking reference</span>
                        <span className="text-right font-medium text-foreground">
                          {refundReferenceSummary}
                        </span>
                      </div>
                    )}
                    {latestRefundPsp.referenceType && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Reference type</span>
                        <span className="text-right font-medium text-foreground">
                          {formatLabel(latestRefundPsp.referenceType)}
                        </span>
                      </div>
                    )}
                    {latestRefundPsp.observedAt && (
                      <div className="flex items-center justify-between gap-3">
                        <span>Last checked</span>
                        <span className="text-right font-medium text-foreground">
                          {formatDateTime(latestRefundPsp.observedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                  {refundTelemetryNote && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-5 text-slate-700">
                      {refundTelemetryNote}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card/60 p-4">
              <h2 className="text-sm font-semibold">Refund requests</h2>
              {order.refund.requests.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No refund requests yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {order.refund.requests
                    .slice()
                    .reverse()
                    .map((request, index) => (
                      <div
                        key={`${request.caseId || index}`}
                        className="rounded-xl border border-border bg-background/50 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-foreground">
                            {request.status || 'requested'}
                            {request.caseId ? ` · ${request.caseId}` : ''}
                          </div>
                          <div className="text-muted-foreground">
                            {formatMoney(request.amountMinor, request.currency || order.currency)}
                          </div>
                        </div>
                        {request.reason && (
                          <div className="mt-1 text-muted-foreground">Reason: {request.reason}</div>
                        )}
                        {request.createdAt && (
                          <div className="mt-1 text-muted-foreground">
                            Submitted {formatDateTime(request.createdAt)}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </section>

            <div className="flex gap-2">
              {!isEmbed && (
                <Link href="/" className="inline-flex flex-1">
                  <button className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                    Continue shopping
                  </button>
                </Link>
              )}
              <button
                type="button"
                onClick={onBackToOrders}
                className={`${isEmbed ? 'w-full' : 'flex-1'} rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/80`}
              >
                Back to orders
              </button>
            </div>
          </aside>
        </div>

        {order.shipments.length === 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            Tracking details will appear once shipment updates are available.
          </div>
        )}
        {order.status.toLowerCase() === 'cancelled' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <XCircle className="h-4 w-4" />
            This order has been cancelled.
          </div>
        )}
        {order.status.toLowerCase() === 'refunded' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <CheckCircle2 className="h-4 w-4" />
            This order has been refunded.
          </div>
        )}
        {order.paymentStatus.toLowerCase() === 'pending' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <Package className="h-4 w-4" />
            Payment is pending. You can continue payment from the actions panel.
          </div>
        )}
      </div>
      {refundDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRefundDialog()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="refund-dialog-title"
            className="w-full max-w-md rounded-2xl border border-border bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="refund-dialog-title" className="text-sm font-semibold text-foreground">
                Request refund
              </h2>
              <button
                type="button"
                onClick={closeRefundDialog}
                disabled={refundLoading}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Refundable balance: {formatMoney(refundableMinor, order.currency)}
            </p>
            <form className="mt-4 space-y-3" onSubmit={submitRefundRequest}>
              <label className="block text-xs font-medium text-foreground">
                Refund amount ({order.currency})
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={refundAmountInput}
                  onChange={(event) => setRefundAmountInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-indigo-400"
                  placeholder="0.00"
                  disabled={refundLoading}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-foreground">
                Reason (optional)
                <textarea
                  rows={3}
                  value={refundReasonInput}
                  onChange={(event) => setRefundReasonInput(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-0 focus:border-indigo-400"
                  placeholder="Briefly tell us why you need a refund"
                  disabled={refundLoading}
                />
              </label>
              {refundValidationError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {refundValidationError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeRefundDialog}
                  disabled={refundLoading}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={refundLoading}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {refundLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit request'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
