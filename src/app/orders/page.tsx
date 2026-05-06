'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, ChevronLeft, Loader2, Package, ShoppingCart, XCircle } from 'lucide-react'
import { cancelAccountOrder, listMyOrders } from '@/lib/api'
import { ensureAuroraSession, shouldUseAuroraAutoExchange } from '@/lib/auroraOrdersAuth'
import { isAuroraEmbedMode } from '@/lib/auroraEmbed'
import {
  buildOrderDetailHref,
  buildOrderListHref,
  resolveAuroraOrderScope,
} from '@/lib/orders/navigationContext'
import {
  readAuroraOrdersScopeHint,
  writeAuroraOrdersScopeHint,
} from '@/lib/orders/scopeHint'
import { normalizeOrderListItem, type NormalizedOrderListItem } from '@/lib/orders/normalize'
import {
  canShowCancel,
  canShowContinuePayment,
  getOrderDisplayStatus,
  getOrderTone,
} from '@/lib/orders/status'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

const toneStyles: Record<'success' | 'warning' | 'danger' | 'neutral', { bg: string; fg: string }> = {
  success: { bg: '#E1F5EE', fg: '#1D9E75' },
  warning: { bg: '#FAEEDA', fg: '#633806' },
  danger:  { bg: '#FAECE7', fg: '#993C1D' },
  neutral: { bg: '#F4F4F2', fg: '#2C2C2A99' },
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

type OrdersLoadState = 'idle' | 'loading' | 'recovering' | 'ready' | 'failed'

type OrdersCachePayload = {
  savedAt: number
  orders: NormalizedOrderListItem[]
  cursor: string | null
  hasMore: boolean
}

const ORDERS_CACHE_KEY_PREFIX = 'orders_list_cache_v1'
const ORDERS_CACHE_TTL_MS = 60_000

const parseTimeoutMs = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(250, Math.round(parsed))
}

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.max(1, Math.round(parsed))
}

const ORDERS_LIST_TIMEOUT_MS = parseTimeoutMs(process.env.NEXT_PUBLIC_ORDERS_LIST_TIMEOUT_MS, 3500)
const ORDERS_RECOVERY_RETRY_TIMEOUT_MS = parseTimeoutMs(
  process.env.NEXT_PUBLIC_ORDERS_RECOVERY_RETRY_TIMEOUT_MS,
  3500,
)
const ORDERS_RECOVERY_BOOTSTRAP_TIMEOUT_MS = parseTimeoutMs(
  process.env.NEXT_PUBLIC_ORDERS_RECOVERY_BOOTSTRAP_TIMEOUT_MS,
  1800,
)
const ORDERS_UNSCOPED_PRIME_LIMIT = parsePositiveInt(
  process.env.NEXT_PUBLIC_ORDERS_UNSCOPED_PRIME_LIMIT,
  6,
)

const buildOrdersCacheKey = (pathname: string, scopeMerchantId: string | null): string =>
  `${ORDERS_CACHE_KEY_PREFIX}:${pathname || '/orders'}:${scopeMerchantId || '__none__'}`

const readOrdersCache = (cacheKey: string): OrdersCachePayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OrdersCachePayload
    if (!parsed || typeof parsed.savedAt !== 'number') return null
    if (!Array.isArray(parsed.orders)) return null
    const ageMs = Date.now() - parsed.savedAt
    if (ageMs < 0 || ageMs > ORDERS_CACHE_TTL_MS) return null
    return {
      savedAt: parsed.savedAt,
      orders: parsed.orders.filter((item) => Boolean(item?.id)),
      cursor: parsed.cursor ? String(parsed.cursor) : null,
      hasMore: Boolean(parsed.hasMore),
    }
  } catch {
    return null
  }
}

const writeOrdersCache = (
  cacheKey: string,
  payload: Omit<OrdersCachePayload, 'savedAt'>,
) => {
  if (typeof window === 'undefined') return
  try {
    const nextPayload: OrdersCachePayload = {
      savedAt: Date.now(),
      orders: payload.orders,
      cursor: payload.cursor,
      hasMore: payload.hasMore,
    }
    window.sessionStorage.setItem(cacheKey, JSON.stringify(nextPayload))
  } catch {
    // ignore cache write failures
  }
}

const trackOrders = (event: string, payload: Record<string, unknown>) => {
  // eslint-disable-next-line no-console
  console.log('[TRACK]', event, {
    ...payload,
    ts: new Date().toISOString(),
  })
}

function OrdersPageContent() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, setSession, clear, activeMerchantId } = useAuthStore()
  const isEmbed = useMemo(() => isAuroraEmbedMode(), [])
  const [orders, setOrders] = useState<NormalizedOrderListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadState, setLoadState] = useState<OrdersLoadState>('idle')
  const [loadingMore, setLoadingMore] = useState(false)
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scopeHint, setScopeHint] = useState<string | null>(() => readAuroraOrdersScopeHint())
  const requestCountRef = useRef(0)
  const loadRunIdRef = useRef(0)
  const scopeRefineAttemptedRef = useRef(false)
  const searchParamsString = searchParams.toString()
  const baseLoadKey = useMemo(
    () => `${pathname || '/my-orders'}?${searchParamsString}`,
    [pathname, searchParamsString],
  )
  const resolvedScopeMerchantId = useMemo(
    () => resolveAuroraOrderScope(searchParams, activeMerchantId),
    [activeMerchantId, searchParams],
  )
  const canAttemptAuroraRecovery = useMemo(
    () => shouldUseAuroraAutoExchange(pathname),
    [pathname],
  )
  const scopeMerchantId = useMemo(
    () => resolvedScopeMerchantId || scopeHint,
    [resolvedScopeMerchantId, scopeHint],
  )
  useEffect(() => {
    if (!canAttemptAuroraRecovery) return
    if (!resolvedScopeMerchantId) return
    if (scopeHint === resolvedScopeMerchantId) return
    setScopeHint(resolvedScopeMerchantId)
    writeAuroraOrdersScopeHint(resolvedScopeMerchantId)
  }, [canAttemptAuroraRecovery, resolvedScopeMerchantId, scopeHint])
  const scopedSearchParams = useMemo(() => {
    const next = new URLSearchParams(searchParamsString)
    if (scopeMerchantId) {
      next.set('merchant_id', scopeMerchantId)
    }
    return next
  }, [scopeMerchantId, searchParamsString])
  const scopedSearchParamsString = scopedSearchParams.toString()
  const currentListUrl = useMemo(() => {
    const path = pathname || '/my-orders'
    return scopedSearchParamsString ? `${path}?${scopedSearchParamsString}` : path
  }, [pathname, scopedSearchParamsString])

  const setTrackedLoadState = (nextState: OrdersLoadState) => {
    setLoadState((prevState) => {
      if (prevState !== nextState) {
        trackOrders('orders_ui_state_change', {
          from: prevState,
          to: nextState,
        })
      }
      return nextState
    })
  }

  const loadOrders = async (options?: {
    next?: string | null
    allowRecovery?: boolean
    trigger?: 'initial' | 'manual_retry' | 'recovery_retry' | 'load_more' | 'scope_refine'
    scopeMerchantId?: string | null
  }) => {
    const nextCursor = options?.next || null
    const allowRecovery = options?.allowRecovery !== false
    const trigger =
      options?.trigger || (nextCursor ? 'load_more' : 'initial')
    const isLoadMore = Boolean(nextCursor)
    const requestedScopeMerchantId = String(options?.scopeMerchantId || scopeMerchantId || '').trim() || null
    const runId = ++loadRunIdRef.current
    requestCountRef.current += 1
    const requestCount = requestCountRef.current
    const startedAt = performance.now()
    const timeoutMs =
      trigger === 'recovery_retry'
        ? ORDERS_RECOVERY_RETRY_TIMEOUT_MS
        : ORDERS_LIST_TIMEOUT_MS
    const requestLimit = isLoadMore
      ? 20
      : requestedScopeMerchantId
        ? 20
        : canAttemptAuroraRecovery
          ? ORDERS_UNSCOPED_PRIME_LIMIT
          : 20
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setTrackedLoadState(trigger === 'recovery_retry' ? 'recovering' : 'loading')
      setError(null)
    }

    trackOrders('orders_load_start', {
      trigger,
      is_load_more: isLoadMore,
      request_count: requestCount,
      scope_merchant_id: requestedScopeMerchantId,
      timeout_ms: timeoutMs,
      request_limit: requestLimit,
    })

    try {
      const data = await listMyOrders(
        nextCursor || undefined,
        requestLimit,
        requestedScopeMerchantId ? { merchant_id: requestedScopeMerchantId } : undefined,
        {
          timeout_ms: timeoutMs,
          aurora_recovery: 'off',
        },
      )
      if (runId !== loadRunIdRef.current) return

      const rawOrders: unknown[] = Array.isArray((data as any)?.orders) ? (data as any).orders : []
      const normalizedOrders = rawOrders
        .map((raw) => normalizeOrderListItem(raw))
        .filter((order: NormalizedOrderListItem) => Boolean(order.id))
      const responseActiveMerchantId = String((data as any)?.active_merchant_id || '').trim() || null
      if (canAttemptAuroraRecovery && responseActiveMerchantId) {
        if (scopeHint !== responseActiveMerchantId) {
          setScopeHint(responseActiveMerchantId)
        }
        writeAuroraOrdersScopeHint(responseActiveMerchantId)
      }
      const effectiveScopeMerchantId =
        requestedScopeMerchantId || (canAttemptAuroraRecovery ? responseActiveMerchantId : null)
      const nextOrders = effectiveScopeMerchantId
        ? normalizedOrders.filter((order) => order.merchantId === effectiveScopeMerchantId)
        : normalizedOrders
      const scopedCacheKey = buildOrdersCacheKey(pathname || '/my-orders', effectiveScopeMerchantId)

      setOrders((prev) => {
        const merged = isLoadMore ? [...prev, ...nextOrders] : nextOrders
        writeOrdersCache(scopedCacheKey, {
          orders: merged,
          cursor: (data as any)?.next_cursor || null,
          hasMore: Boolean((data as any)?.has_more),
        })
        return merged
      })
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
      setTrackedLoadState('ready')
      trackOrders('orders_load_result', {
        result: 'ok',
        source: 'network',
        trigger,
        is_load_more: isLoadMore,
        latency_ms: Math.round(performance.now() - startedAt),
        request_count: requestCount,
        loaded_count: nextOrders.length,
        scope_merchant_id: effectiveScopeMerchantId,
        request_limit: requestLimit,
      })
      const shouldRefineScope =
        trigger === 'initial' &&
        !isLoadMore &&
        !requestedScopeMerchantId &&
        Boolean(responseActiveMerchantId) &&
        !scopeRefineAttemptedRef.current
      if (shouldRefineScope) {
        scopeRefineAttemptedRef.current = true
        void loadOrders({
          next: null,
          allowRecovery: false,
          trigger: 'scope_refine',
          scopeMerchantId: responseActiveMerchantId,
        })
      }
    } catch (err: any) {
      if (runId !== loadRunIdRef.current) return
      const isUnauthenticated =
        err?.status === 401 ||
        err?.code === 'UNAUTHENTICATED' ||
        err?.code === 'NOT_AUTHENTICATED'

      trackOrders('orders_load_result', {
        result: 'failed',
        source: 'network',
        trigger,
        is_load_more: isLoadMore,
        latency_ms: Math.round(performance.now() - startedAt),
        request_count: requestCount,
        reason: String(err?.code || err?.status || err?.message || 'UNKNOWN'),
      })

      if (isUnauthenticated && canAttemptAuroraRecovery && allowRecovery && !isLoadMore) {
        setTrackedLoadState('recovering')
        const recoveryStartedAt = performance.now()
        trackOrders('orders_recovery_start', {
          request_count: requestCount,
          path: pathname || null,
        })

        const recovered = await ensureAuroraSession(pathname, {
          bootstrapTimeoutMs: ORDERS_RECOVERY_BOOTSTRAP_TIMEOUT_MS,
        })
        if (runId !== loadRunIdRef.current) return

        trackOrders('orders_recovery_result', {
          ok: recovered.ok,
          reason: recovered.ok ? null : recovered.reason,
          latency_ms: Math.round(performance.now() - recoveryStartedAt),
          request_count: requestCount,
        })

        if (recovered.ok) {
          await loadOrders({
            next: null,
            allowRecovery: false,
            trigger: 'recovery_retry',
            scopeMerchantId: requestedScopeMerchantId,
          })
          return
        }

        setError('Session recovery failed. Please retry or log in again.')
        setTrackedLoadState('failed')
        return
      }

      if (isUnauthenticated) {
        clear()
        router.replace(`/login?redirect=${encodeURIComponent(currentListUrl)}`)
        return
      }
      if (err?.status === 403) {
        setError('You do not have permission to view orders.')
      } else {
        setError(err?.message || 'Failed to load orders')
      }
      setTrackedLoadState('failed')
    } finally {
      if (runId !== loadRunIdRef.current) return
      if (isLoadMore) setLoadingMore(false)
    }
  }

  useEffect(() => {
    requestCountRef.current = 0
    scopeRefineAttemptedRef.current = false
    const cacheKey = buildOrdersCacheKey(pathname || '/my-orders', scopeMerchantId)
    const cached = readOrdersCache(cacheKey)
    if (cached) {
      setOrders(cached.orders)
      setCursor(cached.cursor)
      setHasMore(cached.hasMore)
      setError(null)
      setTrackedLoadState('ready')
      trackOrders('orders_load_result', {
        result: 'ok',
        source: 'cache',
        trigger: 'initial',
        is_load_more: false,
        latency_ms: 0,
        request_count: 0,
        loaded_count: cached.orders.length,
        scope_merchant_id: scopeMerchantId,
      })
    } else {
      setOrders([])
      setCursor(null)
      setHasMore(false)
      setTrackedLoadState('idle')
    }

    void loadOrders({
      next: null,
      allowRecovery: true,
      trigger: 'initial',
      scopeMerchantId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLoadKey])

  useEffect(() => {
    return () => {
      loadRunIdRef.current += 1
    }
  }, [])

  const onContinuePayment = (order: NormalizedOrderListItem) => {
    const returnPath = buildOrderListHref(scopedSearchParams)
    router.push(
      `/order?orderId=${encodeURIComponent(order.id)}&return=${encodeURIComponent(returnPath)}`,
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
        void loadOrders({
          next: null,
          allowRecovery: true,
          trigger: 'manual_retry',
        })
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

  const isLoading = loadState === 'loading'
  const isRecovering = loadState === 'recovering'
  const isBusy = isLoading || isRecovering
  const isEmpty = useMemo(
    () => loadState === 'ready' && orders.length === 0,
    [loadState, orders.length],
  )

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      {!isEmbed && (
        <header
          className="sticky top-0 z-40 flex items-center justify-between bg-white px-3"
          style={{
            height: '54px',
            borderBottomWidth: '0.5px',
            borderColor: 'rgba(44,44,42,0.08)',
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="h-9 w-9 rounded-full flex items-center justify-center transition-opacity active:opacity-60"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" style={{ color: '#2C2C2A' }} />
          </button>
          <h1 className="text-[14px] font-semibold" style={{ color: '#2C2C2A' }}>My orders</h1>
          <div className="w-9" />
        </header>
      )}

      <main className="flex-1 mx-auto w-full max-w-5xl px-3 py-4">
        {!isEmbed && user?.email && (
          <p className="mb-3 text-[11px]" style={{ color: '#2C2C2A99' }}>{user.email}</p>
        )}

        {isBusy && (
          <div className="flex items-center gap-2 text-[12px] mb-3" style={{ color: '#2C2C2A99' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {isRecovering ? 'Recovering session…' : 'Loading orders…'}
          </div>
        )}
        {error && (
          <div
            className="mb-3 rounded-xl px-3 py-2 text-[12px]"
            style={{
              backgroundColor: '#FAECE7',
              color: '#993C1D',
              borderWidth: '0.5px',
              borderColor: 'rgba(216,90,48,0.3)',
            }}
          >
            {error}
          </div>
        )}
        {loadState === 'failed' && (
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              onClick={() =>
                void loadOrders({
                  next: null,
                  allowRecovery: true,
                  trigger: 'manual_retry',
                })
              }
              className="rounded-full bg-[#F4F4F2] px-3 py-1.5 text-[12px] font-medium transition-colors active:bg-[#EEEDFE]"
              style={{ color: '#2C2C2A' }}
            >
              Retry
            </button>
            <button
              onClick={() =>
                router.replace(`/login?redirect=${encodeURIComponent(currentListUrl)}`)
              }
              className="rounded-full bg-[#F4F4F2] px-3 py-1.5 text-[12px] font-medium transition-colors active:bg-[#EEEDFE]"
              style={{ color: '#2C2C2A' }}
            >
              Log in again
            </button>
          </div>
        )}

        {isEmpty ? (
          <div
            className="rounded-2xl bg-white p-10 text-center space-y-3"
            style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
          >
            <span
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
              style={{ backgroundColor: '#EEEDFE' }}
            >
              <Package className="h-6 w-6" style={{ color: '#534AB7' }} strokeWidth={1.6} />
            </span>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold" style={{ color: '#2C2C2A' }}>No orders yet</p>
              <p className="text-[12px]" style={{ color: '#2C2C2A99' }}>
                Start shopping to see your order history here.
              </p>
            </div>
            {!isEmbed && (
              <Link
                href="/products"
                className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-semibold text-white transition-opacity active:opacity-85"
                style={{ backgroundColor: '#534AB7' }}
              >
                Browse products
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
              const normalizedRefundStatus = String(order.refundStatus || '').trim().toLowerCase()
              const hasRefundSummary =
                normalizedRefundStatus !== '' &&
                normalizedRefundStatus !== 'none' &&
                order.totalRefundedMinor > 0
              const refundSummaryLabel =
                normalizedRefundStatus === 'partially_refunded'
                  ? 'Partially refunded'
                  : normalizedRefundStatus === 'requested'
                    ? 'Refund requested'
                    : 'Refunded'

              const tone = toneStyles[statusTone]
              return (
                <div
                  key={order.id}
                  className="rounded-2xl bg-white p-3 sm:p-4"
                  style={{ borderWidth: '0.5px', borderColor: 'rgba(44,44,42,0.08)' }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div
                        className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"
                        style={{
                          backgroundColor: '#F4F4F2',
                          borderWidth: '0.5px',
                          borderColor: 'rgba(44,44,42,0.08)',
                        }}
                      >
                        {order.firstItemImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={order.firstItemImageUrl}
                            alt={order.itemsSummary || 'Order preview'}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center" style={{ color: '#2C2C2A66' }}>
                            <ShoppingCart className="h-5 w-5" strokeWidth={1.6} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13px] font-semibold sm:text-[14px]" style={{ color: '#2C2C2A' }}>
                            Order #{order.id}
                          </h3>
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: tone.bg, color: tone.fg }}
                          >
                            {displayStatus}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px]" style={{ color: '#2C2C2A99' }}>{formatDate(order.createdAt)}</p>
                        <p className="mt-1 truncate text-[12px]" style={{ color: '#2C2C2A' }}>
                          {order.itemsSummary || 'Order from shopping agent'}
                        </p>
                        {order.creatorName && (
                          <p className="mt-0.5 text-[11px]" style={{ color: '#2C2C2A99' }}>Creator: {order.creatorName}</p>
                        )}
                        {locationText && <p className="mt-0.5 text-[11px]" style={{ color: '#2C2C2A99' }}>{locationText}</p>}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <div className="text-[16px] font-semibold" style={{ color: '#2C2C2A' }}>
                        {formatMoney(order.totalAmountMinor, order.currency)}
                      </div>
                      {hasRefundSummary && (
                        <div className="text-[11px] font-medium" style={{ color: '#993C1D' }}>
                          {refundSummaryLabel} {formatMoney(order.totalRefundedMinor, order.currency)}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5 sm:justify-end">
                        <Link href={buildOrderDetailHref(order.id, scopedSearchParams, currentListUrl)}>
                          <button
                            className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] px-3 py-1.5 text-[11px] font-medium transition-colors active:bg-[#EEEDFE]"
                            style={{ color: '#2C2C2A' }}
                          >
                            View details
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </Link>
                        {canPay && (
                          <button
                            onClick={() => onContinuePayment(order)}
                            className="rounded-full px-3 py-1.5 text-[11px] font-medium text-white transition-opacity active:opacity-85"
                            style={{ backgroundColor: '#534AB7' }}
                          >
                            Continue payment
                          </button>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => onCancelOrder(order)}
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors active:bg-[#FAECE7] disabled:opacity-50"
                            style={{
                              color: '#993C1D',
                              borderWidth: '0.5px',
                              borderColor: 'rgba(216,90,48,0.3)',
                            }}
                            disabled={cancellingOrderId === order.id}
                          >
                            {cancellingOrderId === order.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Cancelling…
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3 w-3" />
                                Cancel
                              </>
                            )}
                          </button>
                        )}
                        {order.permissions.canReorder && (
                          <button
                            onClick={() => onReorder(order)}
                            disabled
                            className="rounded-full bg-[#F4F4F2] px-3 py-1.5 text-[11px] font-medium opacity-60"
                            style={{ color: '#2C2C2A' }}
                          >
                            Reorder (soon)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() =>
                    void loadOrders({
                      next: cursor,
                      allowRecovery: false,
                      trigger: 'load_more',
                    })
                  }
                  disabled={loadingMore || isRecovering}
                  className="rounded-full bg-[#F4F4F2] px-4 py-2 text-[12px] font-medium transition-colors active:bg-[#EEEDFE] disabled:opacity-50"
                  style={{ color: '#2C2C2A' }}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageContent />
    </Suspense>
  )
}
