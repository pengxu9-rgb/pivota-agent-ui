'use client'

import { useEffect, useMemo, useState } from 'react'
import { Package, Clock, CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { listMyOrders } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

interface OrderListItem {
  order_id: string
  currency: string
  total_amount_minor: number
  status: string
  payment_status: string
  fulfillment_status: string
  delivery_status: string
  created_at: string
  shipping_city?: string | null
  shipping_country?: string | null
  items_summary?: string
  permissions?: {
    can_pay: boolean
    can_cancel: boolean
    can_reorder: boolean
  }
}

export default function OrdersPage() {
  const router = useRouter()
  const { user, setSession, clear } = useAuthStore()
  const [orders, setOrders] = useState<OrderListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = async (next?: string | null) => {
    try {
      const data = await listMyOrders(next || undefined)
      setOrders((prev) => (next ? [...prev, ...(data as any).orders] : (data as any).orders || []))
      setCursor((data as any).next_cursor || null)
      setHasMore(Boolean((data as any).has_more))
      // If /auth/me info is present in response (optional), sync user state
      if ((data as any).user) {
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
        router.replace(`/login?redirect=/my-orders`)
        return
      }
      if (err?.status === 403) {
        setError('You do not have permission to view orders.')
      } else {
        setError(err?.message || 'Failed to load orders')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
      case 'shipped':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'processing':
      case 'pending':
        return <Clock className="h-5 w-5 text-warning" />
      case 'cancelled':
      case 'refunded':
        return <XCircle className="h-5 w-5 text-destructive" />
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      completed: 'default',
      paid: 'default',
      shipped: 'default',
      processing: 'secondary',
      pending: 'secondary',
      cancelled: 'destructive',
      refunded: 'destructive',
    }
    return variants[status] || 'secondary'
  }

  const formatMoney = (minor: number, currency: string) => {
    const value = (minor || 0) / 100
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
  }

  const loadMore = () => {
    if (cursor) {
      loadOrders(cursor)
    }
  }

  const onAction = (type: 'pay' | 'cancel' | 'reorder', orderId: string) => {
    toast.message(`${type === 'pay' ? 'Continue payment' : type === 'cancel' ? 'Cancel' : 'Reorder'} not implemented`, {
      description: `Order ${orderId}`,
    })
  }

  const subtitle = (order: OrderListItem) => {
    if (order.shipping_city || order.shipping_country) {
      return `${order.shipping_city || ''}${order.shipping_city && order.shipping_country ? ', ' : ''}${order.shipping_country || ''}`
    }
    return new Date(order.created_at).toLocaleDateString()
  }

  const isEmpty = useMemo(() => !loading && orders.length === 0, [loading, orders.length])

  return (
    <div className="min-h-screen bg-gradient-mesh">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Orders</h1>
              <p className="text-muted-foreground">Track and manage your orders</p>
            </div>
            {user?.email && <Badge variant="secondary">{user.email}</Badge>}
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading orders...</div>
          )}
          {error && (
            <div className="text-red-600 text-sm mb-4">{error}</div>
          )}

          {isEmpty ? (
            <div className="text-center py-16 bg-card/50 backdrop-blur-xl rounded-3xl border border-border">
              <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-4">Start shopping to see your orders here</p>
              <Link href="/products">
                <button className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:shadow-lg transition-all">
                  Browse Products
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order, index) => (
                <motion.div
                  key={order.order_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-card/50 backdrop-blur-xl rounded-2xl border border-border p-6 hover:shadow-glass-hover transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(order.status)}
                      <div>
                        <h3 className="font-semibold">Order #{order.order_id}</h3>
                        <p className="text-sm text-muted-foreground">{subtitle(order)}</p>
                      </div>
                    </div>
                    <Badge variant={getStatusBadge(order.status)}>{order.status}</Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {order.items_summary || 'Items'}
                    </div>
                    <div className="text-lg font-bold text-primary">
                      {formatMoney(order.total_amount_minor, order.currency)}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Link href={`/orders/${order.order_id}`} className="col-span-1">
                      <button className="w-full py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-medium transition-colors inline-flex items-center justify-center gap-2">
                        View details
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </Link>
                    {order.permissions?.can_pay && (
                      <button
                        onClick={() => onAction('pay', order.order_id)}
                        className="w-full py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg"
                      >
                        Continue payment
                      </button>
                    )}
                    {order.permissions?.can_cancel && (
                      <button
                        onClick={() => onAction('cancel', order.order_id)}
                        className="w-full py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                      >
                        Cancel order
                      </button>
                    )}
                    {order.permissions?.can_reorder && (
                      <button
                        onClick={() => onAction('reorder', order.order_id)}
                        className="w-full py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                      >
                        Reorder
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}

              {hasMore && (
                <div className="flex justify-center">
                  <button
                    onClick={loadMore}
                    className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted"
                  >
                    Load more
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
