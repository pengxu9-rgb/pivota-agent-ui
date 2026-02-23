'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, Package, ShoppingCart, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cancelAccountOrder, listMyOrders } from '@/lib/api'
import { isAuroraEmbedMode } from '@/lib/auroraEmbed'
import { normalizeOrderListItem, type NormalizedOrderListItem } from '@/lib/orders/normalize'
import {
  canShowCancel,
  canShowContinuePayment,
  getOrderDisplayStatus,
  getOrderTone,
} from '@/lib/orders/status'
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

const formatDate = (raw: string): string => {
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function OrdersPage() {
  const router = useRouter()
  const { user, setSession, clear } = useAuthStore()
  const [orders, setOrders] = useState<NormalizedOrderListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = async (next?: string | null) => {
    const isLoadMore = Boolean(next)
    if (isLoadMore) setLoadingMore(true)
    else setLoading(true)

    try {
      const data = await listMyOrders(next || undefined)
      const rawOrders: unknown[] = Array.isArray((data as any)?.orders) ? (data as any).orders : []
      const nextOrders = rawOrders
        .map((raw) => normalizeOrderListItem(raw))
        .filter((order: NormalizedOrderListItem) => Boolean(order.id))

      setOrders((prev) => (isLoadMore ? [...prev, ...nextOrders] : nextOrders))
      setCursor((data as any)?.next_cursor || null)
      setHasMore(Boolean((data as any)?.has_more))

      if ((data as any)?.user) {
        setSession({
          user: (data as any).user,
          memberships: (data as any).memberships || [],
          active_merchant_id: (data as any).active_merchant_id,
        })
      }

      setError(null)
    } catch (err: any) {
      if (err?.status === 401 || err?.code === 'UNAUTHENTICATED') {
        clear()
        router.replace('/login?redirect=/my-orders')
        return
      }
      if (err?.status === 403) {
        setError('You do not have permission to view orders.')
      } else {
        setError(err?.message || 'Failed to load orders')
      }
    } finally {
      if (isLoadMore) setLoadingMore(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onContinuePayment = (order: NormalizedOrderListItem) => {
    router.push(
      `/checkout?orderId=${encodeURIComponent(order.id)}&amount_minor=${order.totalAmountMinor}&currency=${encodeURIComponent(order.currency)}`,
    )
  }

  const onCancelOrder = async (order: NormalizedOrderListItem) => {
    if (!canShowCancel(order.permissions, order.status, order.paymentStatus)) return
    const confirmed = window.confirm(`Cancel order ${order.id}?`)
    if (!confirmed) return

    const reason = window.prompt('Optional: tell us why you are cancelling this order (leave empty to skip).', '')
    setCancellingOrderId(order.id)
    try {
      const result = (await cancelAccountOrder(order.id, reason || undefined)) as any
      toast.success('Order cancelled')
      setOrders((prev) =>
        prev.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: String(result?.status || 'cancelled'),
                paymentStatus: String(result?.payment_status || item.paymentStatus),
                fulfillmentStatus: String(result?.fulfillment_status || item.fulfillmentStatus),
                deliveryStatus: String(result?.delivery_status || item.deliveryStatus),
              }
            : item,
        ),
      )
    } catch (err: any) {
      if (err?.code === 'INVALID_STATE') {
        toast.error('Order cannot be cancelled in its current state.')
        void loadOrders(null)
      } else if (err?.code === 'NOT_FOUND') {
        toast.error('Order not found or no permission.')
      } else {
        toast.error(err?.message || 'Failed to cancel order')
      }
    } finally {
      setCancellingOrderId(null)
    }
  }

  const onReorder = (order: NormalizedOrderListItem) => {
    toast.info('Reorder is coming soon. Please add items from the catalog for now.', {
      description: `Order ${order.id}`,
    })
  }

  const isEmbed = useMemo(() => isAuroraEmbedMode(), [])
  const isEmpty = useMemo(() => !loading && orders.length === 0, [loading, orders.length])

  return (
    <div className="min-h-screen bg-gradient-mesh">
      <div className="mx-auto max-w-5xl px-4 py-8">
        {!isEmbed && (
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">My Orders</h1>
              <p className="text-sm text-muted-foreground">Track and manage your purchases</p>
            </div>
            <div className="flex items-center gap-3">
              {user?.email && <Badge variant="secondary">{user.email}</Badge>}
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading orders...
          </div>
        )}
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {isEmpty ? (
          <div className="rounded-3xl border border-border bg-card/60 p-12 text-center">
            <Package className="mx-auto mb-4 h-14 w-14 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No orders yet</h2>
            <p className="mt-2 text-muted-foreground">Start shopping to see your order history here.</p>
            {!isEmbed && (
              <Link href="/products">
                <button className="mt-5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-3 text-sm font-medium text-white shadow transition hover:shadow-lg">
                  Browse Products
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
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

              const locationText =
                order.shippingCity || order.shippingCountry
                  ? `${order.shippingCity || ''}${order.shippingCity && order.shippingCountry ? ', ' : ''}${order.shippingCountry || ''}`
                  : null

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-border bg-card/60 p-4 transition hover:shadow-glass-hover sm:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                        {order.firstItemImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={order.firstItemImageUrl}
                            alt={order.itemsSummary || 'Order preview'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            <ShoppingCart className="h-5 w-5" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-foreground sm:text-base">Order #{order.id}</h3>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[statusTone]}`}>
                            {displayStatus}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                        <p className="mt-1 truncate text-sm text-muted-foreground">
                          {order.itemsSummary || 'Order from shopping agent'}
                        </p>
                        {order.creatorName && (
                          <p className="mt-1 text-xs text-muted-foreground">Creator: {order.creatorName}</p>
                        )}
                        {locationText && <p className="mt-1 text-xs text-muted-foreground">{locationText}</p>}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <div className="text-lg font-semibold text-foreground">{formatMoney(order.totalAmountMinor, order.currency)}</div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Link href={`/orders/${encodeURIComponent(order.id)}`}>
                          <button className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
                            View details
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                        {canPay && (
                          <button
                            onClick={() => onContinuePayment(order)}
                            className="rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-xs font-medium text-white shadow hover:shadow-lg"
                          >
                            Continue payment
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => onCancelOrder(order)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                            disabled={cancellingOrderId === order.id}
                          >
                            {cancellingOrderId === order.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Cancelling...
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5" />
                                Cancel order
                              </>
                            )}
                          </button>
                        )}
                        {order.permissions.canReorder && (
                          <button
                            onClick={() => onReorder(order)}
                            disabled
                            className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-60"
                          >
                            Reorder (coming soon)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {hasMore && (
              <div className="flex justify-center">
                <button
                  onClick={() => void loadOrders(cursor)}
                  disabled={loadingMore}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                >
                  {loadingMore ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
