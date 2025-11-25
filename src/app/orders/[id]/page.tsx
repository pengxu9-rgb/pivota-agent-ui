'use client'

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, AlertCircle, Package, Truck, Clock } from 'lucide-react'
import { getAccountOrder } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

interface OrderDetailResponse {
  order: any
  items: any[]
  payment?: { records?: any[] }
  fulfillment?: { shipments?: any[] }
  permissions?: { can_pay: boolean; can_cancel: boolean; can_reorder: boolean }
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { clear } = useAuthStore()
  const [data, setData] = useState<OrderDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await getAccountOrder(id)
        setData(res as OrderDetailResponse)
        setError(null)
      } catch (err: any) {
        if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
          clear()
          router.replace(`/login?redirect=/orders/${id}`)
          return
        }
        setError(err?.message || 'Failed to load order')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, clear, router])

  const formatMoney = (minor: number, currency: string) => {
    const value = (minor || 0) / 100
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
  }

  const timeline = useMemo(() => {
    const shipments = data?.fulfillment?.shipments || []
    const events = shipments.flatMap((s: any) => s.events || [])
    return events.length ? events : []
  }, [data])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading order...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-6 text-center border border-border">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-2">Unable to load order</h2>
          <p className="text-muted-foreground mb-4">{error || 'Order not found'}</p>
          <Link href="/my-orders" className="text-indigo-600 hover:underline">Back to orders</Link>
        </div>
      </div>
    )
  }

  const { order, items, payment, permissions } = data

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid':
      case 'completed':
      case 'shipped':
        return 'text-green-700 bg-green-100'
      case 'pending':
      case 'processing':
        return 'text-amber-700 bg-amber-100'
      case 'cancelled':
      case 'refunded':
        return 'text-red-700 bg-red-100'
      default:
        return 'text-gray-700 bg-gray-100'
    }
  }

  const onAction = (type: 'pay' | 'cancel' | 'reorder') => {
    toast.message(`${type === 'pay' ? 'Continue payment' : type === 'cancel' ? 'Cancel order' : 'Reorder'} not implemented`, {
      description: `Order ${order.order_id}`,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-mesh flex items-center justify-center px-4 py-8">
      <div className="max-w-5xl w-full bg-white/80 backdrop-blur-md rounded-3xl shadow-lg p-8 space-y-6 border border-border">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Order #{order.order_id}</h1>
            <p className="text-sm text-muted-foreground">Created at {new Date(order.created_at).toLocaleString()}</p>
          </div>
          <span className={`ml-auto text-xs px-2 py-1 rounded-full ${statusBadge(order.status)}`}>
            {order.status}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div className="rounded-2xl border border-border p-4 bg-muted/40">
              <h3 className="font-semibold mb-3">Items</h3>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={`${it.product_id}-${idx}`} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{it.title}</p>
                      <p className="text-muted-foreground">
                        Qty {it.quantity} • {formatMoney(it.unit_price_minor, order.currency)}
                      </p>
                    </div>
                    <div className="font-semibold">{formatMoney(it.subtotal_minor, order.currency)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border p-4 bg-muted/40">
              <h3 className="font-semibold mb-3">Shipping</h3>
              <p className="text-sm text-muted-foreground">{order.shipping_address?.name}</p>
              <p className="text-sm text-muted-foreground">{order.shipping_address?.city}{order.shipping_address?.country ? `, ${order.shipping_address?.country}` : ''}</p>
              <p className="text-sm text-muted-foreground">{order.shipping_address?.postal_code}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border p-4 bg-muted/30 space-y-2">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{formatMoney(order.total_amount_minor, order.currency)}</p>
              <p className="text-sm text-muted-foreground">Payment: {order.payment_status}</p>
              <p className="text-sm text-muted-foreground">Delivery: {order.delivery_status}</p>
            </div>

            <div className="rounded-2xl border border-border p-4 bg-muted/30 space-y-2">
              <h3 className="font-semibold">Actions</h3>
              {permissions?.can_pay && (
                <button
                  onClick={() => onAction('pay')}
                  className="w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg"
                >
                  Continue payment
                </button>
              )}
              {permissions?.can_cancel && (
                <button
                  onClick={() => onAction('cancel')}
                  className="w-full py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                >
                  Cancel order
                </button>
              )}
              {permissions?.can_reorder && (
                <button
                  onClick={() => onAction('reorder')}
                  className="w-full py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                >
                  Reorder
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border p-4 bg-muted/40">
          <h3 className="font-semibold mb-3">Timeline</h3>
          {timeline.length === 0 && (
            <p className="text-sm text-muted-foreground">No timeline events yet.</p>
          )}
          <div className="space-y-4">
            {timeline.map((event, idx) => {
              const Icon = event.completed
                ? CheckCircle2
                : event.status === 'shipped'
                ? Truck
                : event.status === 'ordered'
                ? Package
                : Clock
              return (
                <div key={idx} className="flex gap-3 items-start">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.completed ? 'bg-green-500' : 'bg-gray-200'}`}>
                    <Icon className={`w-5 h-5 ${event.completed ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className="font-medium">{event.status}</p>
                    <p className="text-sm text-muted-foreground">{event.description || 'Status update'}</p>
                    {event.timestamp && (
                      <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Link href="/" className="inline-flex">
            <button className="px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium">Continue shopping</button>
          </Link>
          <Link href="/my-orders" className="inline-flex">
            <button className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm font-medium">Back to orders</button>
          </Link>
        </div>
      </div>
    </div>
  )
}
