'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Package, Truck, CheckCircle, Clock, Mail } from 'lucide-react'
import { publicOrderResume, publicOrderTrack } from '@/lib/api'
import {
  normalizeOrderDetail,
  type NormalizedOrderDetail,
  type NormalizedRefundPspSnapshot,
} from '@/lib/orders/normalize'

type TimelineEntry = {
  status: string
  timestamp?: string | null
  description?: string | null
  completed?: boolean
}

type LookupResult = {
  order_id: string
  status: string
  currency: string
  total_amount_minor: number
  pricing?: {
    subtotal_minor?: number
    discount_total_minor?: number
    shipping_fee_minor?: number
    tax_minor?: number
    total_amount_minor?: number
  }
  created_at: string
  items_summary?: string
  shipping?: { city?: string; country?: string }
  customer?: { name?: string; masked_email?: string }
}

type LookupPricing = NonNullable<LookupResult['pricing']>

const formatMoney = (minor: number, currency: string): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format((minor || 0) / 100)

const formatLabel = (value: string | null | undefined): string => {
  const normalized = String(value || '').trim()
  if (!normalized) return '—'
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

const formatDateTime = (value: string | null | undefined): string | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asNumeric = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const pickAmountMinor = (
  source: Record<string, unknown>,
  minorKey: string,
  majorKey: string,
): number => {
  const minor = asNumeric(source[minorKey])
  if (minor != null) return Math.max(0, Math.round(minor))
  const major = asNumeric(source[majorKey])
  if (major != null) return Math.max(0, Math.round(major * 100))
  return 0
}

const normalizeLookupPricing = (raw: unknown): LookupPricing | null => {
  if (!isRecord(raw)) return null
  return {
    subtotal_minor: pickAmountMinor(raw, 'subtotal_minor', 'subtotal'),
    discount_total_minor: pickAmountMinor(raw, 'discount_total_minor', 'discount_total'),
    shipping_fee_minor: pickAmountMinor(raw, 'shipping_fee_minor', 'shipping_fee'),
    tax_minor: pickAmountMinor(raw, 'tax_minor', 'tax'),
    total_amount_minor: pickAmountMinor(raw, 'total_amount_minor', 'total'),
  }
}

const hasMeaningfulPricing = (pricing: LookupResult['pricing'] | null | undefined): boolean =>
  Boolean(
    pricing &&
      ((pricing.total_amount_minor || 0) > 0 ||
        (pricing.subtotal_minor || 0) > 0 ||
        (pricing.discount_total_minor || 0) > 0 ||
        (pricing.shipping_fee_minor || 0) > 0 ||
        (pricing.tax_minor || 0) > 0),
  )

const resolveLookupPricing = (
  summary: Record<string, unknown>,
  normalized: NormalizedOrderDetail | null,
): LookupResult['pricing'] | undefined => {
  const orderRaw = isRecord(summary.order) ? summary.order : {}
  const candidates: Array<LookupResult['pricing'] | null> = [
    normalizeLookupPricing(summary.pricing),
    normalizeLookupPricing(orderRaw.pricing),
    normalizeLookupPricing(isRecord(summary.pricing_quote) ? summary.pricing_quote.pricing : null),
    normalizeLookupPricing(
      isRecord(orderRaw.pricing_quote) ? orderRaw.pricing_quote.pricing : null,
    ),
    normalized?.amounts
      ? {
          subtotal_minor: normalized.amounts.subtotalMinor,
          discount_total_minor: normalized.amounts.discountTotalMinor,
          shipping_fee_minor: normalized.amounts.shippingFeeMinor,
          tax_minor: normalized.amounts.taxMinor,
          total_amount_minor: normalized.amounts.totalAmountMinor,
        }
      : null,
  ]

  for (const candidate of candidates) {
    if (hasMeaningfulPricing(candidate)) return candidate || undefined
  }

  return candidates.find(Boolean) || undefined
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
  if (snapshot.reference) {
    return snapshot.trackingReferenceKind
      ? `Use this ${snapshot.trackingReferenceKind} when asking the card issuer to trace the refund.`
      : 'Use this processor reference when asking the card issuer to trace the refund.'
  }
  if (String(snapshot.referenceStatus || '').toLowerCase() === 'pending') {
    return 'Bank-side tracking reference is still pending. Some issuers show this as a reversal rather than a separate refund.'
  }
  if (snapshot.pendingReason) {
    return `Processor is still working on this refund: ${formatLabel(snapshot.pendingReason)}.`
  }
  if (snapshot.failureReason) {
    return `Processor reported ${formatLabel(snapshot.failureReason)}.`
  }
  return null
}

function TrackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialOrderId = searchParams.get('orderId') || ''
  const initialEmail = searchParams.get('email') || ''

  const [orderId, setOrderId] = useState(initialOrderId)
  const [email, setEmail] = useState(initialEmail)
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [detail, setDetail] = useState<NormalizedOrderDetail | null>(null)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Auto-fetch if both query params present
    if (initialOrderId && initialEmail) {
      handleSubmit(new Event('submit') as any, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent, pushQuery = true) => {
    e.preventDefault()
    const orderSafe = orderId.trim()
    const emailSafe = email.trim().toLowerCase()
    if (!orderSafe || !emailSafe) {
      setError('Please enter order ID and email')
      return
    }
    setLoading(true)
    setError(null)
    setTimelineError(null)
    try {
      const summary = await publicOrderResume(orderSafe, emailSafe)
      const normalized = normalizeOrderDetail(summary)
      const summaryRaw = isRecord(summary) ? summary : {}
      const orderRaw = isRecord(summaryRaw.order) ? summaryRaw.order : {}
      const pricing = resolveLookupPricing(summaryRaw, normalized)
      setLookup({
        order_id: normalized?.id || String(orderRaw?.order_id || orderSafe),
        status: normalized?.status || String(orderRaw?.status || ''),
        currency: normalized?.currency || String(orderRaw?.currency || 'USD'),
        total_amount_minor:
          normalized?.totalAmountMinor || Number(orderRaw?.total_amount_minor || 0) || 0,
        pricing,
        created_at:
          normalized?.createdAt || String(orderRaw?.created_at || new Date(0).toISOString()),
        items_summary:
          Array.isArray(normalized?.items) && normalized.items.length > 0
            ? normalized.items.map((item) => `${item.title} x${item.quantity}`).join(', ')
            : undefined,
        shipping: {
          city: normalized?.shippingAddress?.city || undefined,
          country: normalized?.shippingAddress?.country || undefined,
        },
        customer: {
          name: (summary as any)?.customer?.name || undefined,
          masked_email: (summary as any)?.customer?.masked_email || undefined,
        },
      })
      setDetail(normalized)
      setMaskedEmail((summary as any)?.customer?.masked_email || null)
      try {
        const t = await publicOrderTrack(orderSafe, emailSafe)
        const events = ((t as any)?.timeline || []).map((ev: any) => ({
          status: ev.status,
          timestamp: ev.timestamp,
          description: ev.description,
          completed: Boolean(ev.completed),
        }))
        setTimeline(events)
      } catch (trackErr: any) {
        setTimeline([])
        if (trackErr?.code === 'RATE_LIMITED') {
          setTimelineError('Timeline temporarily unavailable. Retry later.')
        } else if (trackErr?.code === 'NOT_FOUND') {
          setTimelineError('Timeline unavailable for this order.')
        } else {
          setTimelineError(trackErr?.message || 'Timeline unavailable.')
        }
      }
      if (pushQuery) {
        const params = new URLSearchParams()
        params.set('orderId', orderSafe)
        params.set('email', emailSafe)
        router.replace(`/order/track?${params.toString()}`)
      }
    } catch (err: any) {
      const code = err?.code
      if (code === 'NOT_FOUND') {
        setError('Order not found or email mismatch')
      } else if (code === 'RATE_LIMITED') {
        setError('Too many requests, please retry later')
      } else {
        setError(err?.message || 'Failed to load order info')
      }
      setLookup(null)
      setDetail(null)
      setMaskedEmail(null)
      setTimeline([])
      setTimelineError(null)
    } finally {
      setLoading(false)
    }
  }

  const events = useMemo(() => {
    if (timeline.length) return timeline
    if (!detail) return []
    return [
      {
        status: detail.status,
        timestamp: detail.createdAt,
        description: 'Order status update',
        completed: detail.paymentStatus === 'paid' || detail.paymentStatus === 'completed',
      },
    ]
  }, [timeline, detail])

  const latestRefundPsp = detail?.refund.psp?.latest || null
  const refundReferenceSummary = getRefundReferenceSummary(latestRefundPsp)
  const refundTelemetryNote = getRefundTelemetryNote(latestRefundPsp)

  const renderEvents = () => {
    if (!lookup) return null
    return (
      <div className="space-y-6">
        {events.map((event, index) => {
          const Icon = event.completed
            ? CheckCircle
            : event.status === 'shipped'
              ? Truck
              : event.status === 'ordered'
                ? Package
                : Clock

          return (
            <div key={index} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    event.completed ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      event.completed ? 'text-white' : 'text-gray-400'
                    }`}
                  />
                </div>
                {index < events.length - 1 && (
                  <div
                    className={`w-0.5 h-16 ${
                      event.completed ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>

              <div className="flex-1">
                <h3
                  className={`font-semibold ${
                    event.completed ? 'text-gray-900' : 'text-gray-500'
                  }`}
                >
                  {event.status}
                </h3>
                <p className="text-sm text-gray-600">
                  {event.description || 'Status update'}
                </p>
                {event.timestamp && (
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
	          <div className="flex items-center gap-2">
	            <Link href="/">
	              <Image
	                src="/pivota-logo-pink.png"
	                alt="Pivota"
	                width={40}
	                height={40}
	                className="w-10 h-10 rounded-lg hover:opacity-90"
	              />
	            </Link>
	            <h1 className="text-2xl font-bold text-gray-800">Track Your Order</h1>
	          </div>
	        </div>
	      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
          <form
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
            onSubmit={handleSubmit}
          >
            <div className="md:col-span-1">
              <label className="text-sm font-medium text-foreground">
                Order ID
              </label>
              <input
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="ORD_..."
              />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <Mail className="h-4 w-4" /> Email
              </label>
              <input
                type="email"
                className="mt-2 w-full rounded-xl border border-border bg-white/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="md:col-span-1 flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow hover:shadow-lg disabled:opacity-60"
              >
                {loading ? 'Loading...' : 'Track order'}
              </button>
            </div>
          </form>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          {lookup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">Order ID</p>
                <p className="font-semibold break-all">{lookup.order_id}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Status: {lookup.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(lookup.created_at).toLocaleString()}
                </p>
                {lookup.items_summary && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {lookup.items_summary}
                  </p>
                )}
                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(lookup.pricing?.subtotal_minor || 0, lookup.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Discount</span>
                    <span className="font-medium text-foreground">
                      {(lookup.pricing?.discount_total_minor || 0) > 0
                        ? `-${formatMoney(lookup.pricing?.discount_total_minor || 0, lookup.currency)}`
                        : formatMoney(0, lookup.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(lookup.pricing?.shipping_fee_minor || 0, lookup.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="font-medium text-foreground">
                      {formatMoney(lookup.pricing?.tax_minor || 0, lookup.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-base font-semibold text-foreground">
                    <span>Total</span>
                    <span>
                      {formatMoney(
                        lookup.pricing?.total_amount_minor || lookup.total_amount_minor || 0,
                        lookup.currency,
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-1">
                <p className="text-sm font-medium">Shipping</p>
                <p className="text-sm text-muted-foreground">
                  {lookup.shipping?.city || ''}
                  {lookup.shipping?.city && lookup.shipping?.country ? ', ' : ''}
                  {lookup.shipping?.country || ''}
                </p>
                {maskedEmail && (
                  <p className="text-sm text-muted-foreground">
                    {maskedEmail}
                  </p>
                )}
                {detail?.refund.totalRefundedMinor ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Refund</p>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Status</span>
                      <span className="font-medium text-foreground">
                        {formatLabel(detail.refund.status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Refunded</span>
                      <span className="font-medium text-foreground">
                        {formatMoney(detail.refund.totalRefundedMinor, detail.refund.currency || detail.currency)}
                      </span>
                    </div>
                    {latestRefundPsp && (
                      <>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Processor</span>
                          <span className="font-medium text-foreground">
                            {formatLabel(latestRefundPsp.provider)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Processor status</span>
                          <span className="font-medium text-foreground">
                            {formatLabel(latestRefundPsp.status)}
                          </span>
                        </div>
                        {refundReferenceSummary && (
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Tracking reference</span>
                            <span className="font-medium text-foreground">
                              {refundReferenceSummary}
                            </span>
                          </div>
                        )}
                        {latestRefundPsp.observedAt && (
                          <div className="flex items-center justify-between text-sm text-muted-foreground">
                            <span>Last checked</span>
                            <span className="font-medium text-foreground">
                              {formatDateTime(latestRefundPsp.observedAt)}
                            </span>
                          </div>
                        )}
                        {refundTelemetryNote && (
                          <p className="pt-1 text-xs text-slate-700">{refundTelemetryNote}</p>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {lookup && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            {timelineError ? (
              <p className="text-sm text-muted-foreground">{timelineError}</p>
            ) : (
              renderEvents()
            )}
          </div>
        )}

        {!lookup && !loading && (
          <div className="bg-white rounded-lg shadow-md p-6 text-muted-foreground text-sm">
            Enter an order ID and email to view status.
          </div>
        )}
      </div>
    </main>
  )
}

export default function TrackOrderPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tracking info...</p>
          </div>
        </main>
      }
    >
      <TrackContent />
    </Suspense>
  )
}
