'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Package, Truck, CheckCircle, Clock, Mail } from 'lucide-react'
import { publicOrderLookup, publicOrderTrack } from '@/lib/api'

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
  created_at: string
  items_summary?: string
  shipping?: { city?: string; country?: string }
  customer?: { name?: string; masked_email?: string }
}

function TrackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialOrderId = searchParams.get('orderId') || ''
  const initialEmail = searchParams.get('email') || ''

  const [orderId, setOrderId] = useState(initialOrderId)
  const [email, setEmail] = useState(initialEmail)
  const [lookup, setLookup] = useState<LookupResult | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
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
    try {
      const summary = await publicOrderLookup(orderSafe, emailSafe)
      setLookup(summary as any)
      const t = await publicOrderTrack(orderSafe, emailSafe)
      const events = ((t as any)?.timeline || []).map((ev: any) => ({
        status: ev.status,
        timestamp: ev.timestamp,
        description: ev.description,
        completed: Boolean(ev.completed),
      }))
      setTimeline(events)
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
      setTimeline([])
    } finally {
      setLoading(false)
    }
  }

  const events = useMemo(() => {
    if (timeline.length) return timeline
    if (!lookup) return []
    return [
      {
        status: lookup.status,
        timestamp: lookup.created_at,
        description: 'Order status update',
        completed: lookup.status === 'paid' || lookup.status === 'completed',
      },
    ]
  }, [timeline, lookup])

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
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center hover:opacity-90">
                <span className="text-white font-bold text-lg">P</span>
              </div>
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
                <p className="text-lg font-bold mt-2">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: lookup.currency || 'USD',
                  }).format((lookup.total_amount_minor || 0) / 100)}
                </p>
              </div>
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-1">
                <p className="text-sm font-medium">Shipping</p>
                <p className="text-sm text-muted-foreground">
                  {lookup.shipping?.city || ''}
                  {lookup.shipping?.city && lookup.shipping?.country ? ', ' : ''}
                  {lookup.shipping?.country || ''}
                </p>
                {lookup.customer?.masked_email && (
                  <p className="text-sm text-muted-foreground">
                    {lookup.customer.masked_email}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {lookup && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Timeline</h2>
            {renderEvents()}
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
