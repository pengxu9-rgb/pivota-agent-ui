import { safeReturnUrl } from '@/lib/returnUrl'

type SearchParamsLike = {
  get: (key: string) => string | null
}

const AURORA_ENTRY = 'aurora_chatbox'
const AURORA_PARENT_ORIGIN = 'https://aurora.pivota.cc'
const PASSTHROUGH_KEYS = [
  'embed',
  'entry',
  'parent_origin',
  'parentOrigin',
  'aurora_uid',
  'lang',
  'source',
  'merchant_id',
] as const

const readParam = (
  searchParams: SearchParamsLike | null | undefined,
  key: string,
): string => String(searchParams?.get(key) || '').trim()

const isAuroraOrdersEntry = (
  searchParams: SearchParamsLike | null | undefined,
): boolean => readParam(searchParams, 'entry').toLowerCase() === AURORA_ENTRY

const hasAuroraSourceMarker = (
  searchParams: SearchParamsLike | null | undefined,
): boolean => readParam(searchParams, 'source').toLowerCase().startsWith('aurora')

const hasAuroraParentOriginMarker = (
  searchParams: SearchParamsLike | null | undefined,
): boolean => {
  const rawOrigin =
    readParam(searchParams, 'parent_origin') || readParam(searchParams, 'parentOrigin')
  if (!rawOrigin) return false
  try {
    return new URL(rawOrigin).origin === AURORA_PARENT_ORIGIN
  } catch {
    return false
  }
}

const hasAuroraEmbedUidMarker = (
  searchParams: SearchParamsLike | null | undefined,
): boolean => {
  const embed = readParam(searchParams, 'embed')
  const auroraUid = readParam(searchParams, 'aurora_uid')
  return embed === '1' && Boolean(auroraUid)
}

const isAuroraOrdersContext = (
  searchParams: SearchParamsLike | null | undefined,
): boolean =>
  isAuroraOrdersEntry(searchParams) ||
  hasAuroraSourceMarker(searchParams) ||
  hasAuroraParentOriginMarker(searchParams) ||
  hasAuroraEmbedUidMarker(searchParams)

const maybeAddScopeMerchant = (
  params: URLSearchParams,
  searchParams: SearchParamsLike | null | undefined,
) => {
  if (params.get('merchant_id')) return
  const scopeMerchantId = resolveAuroraOrderScope(searchParams)
  if (scopeMerchantId) params.set('merchant_id', scopeMerchantId)
}

const maybeAddReturn = (params: URLSearchParams, currentUrl: string) => {
  const safeCurrentUrl = safeReturnUrl(String(currentUrl || '').trim())
  if (!safeCurrentUrl) return
  params.set('return', safeCurrentUrl)
}

const toHref = (pathname: string, params: URLSearchParams): string => {
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function resolveAuroraOrderScope(
  searchParams: SearchParamsLike | null | undefined,
  activeMerchantId?: string | null,
): string | null {
  const queryMerchantId = readParam(searchParams, 'merchant_id')
  if (!isAuroraOrdersContext(searchParams)) {
    return queryMerchantId || null
  }

  const envMerchantId = String(process.env.NEXT_PUBLIC_AURORA_ORDERS_MERCHANT_ID || '').trim()
  if (envMerchantId) return envMerchantId

  if (queryMerchantId) return queryMerchantId

  const activeMerchant = String(activeMerchantId || '').trim()
  return activeMerchant || null
}

export function collectEmbedPassthrough(
  searchParams: SearchParamsLike | null | undefined,
): URLSearchParams {
  const params = new URLSearchParams()
  for (const key of PASSTHROUGH_KEYS) {
    const value = readParam(searchParams, key)
    if (!value) continue
    if (!params.has(key)) params.set(key, value)
  }
  return params
}

export function buildOrderDetailHref(
  orderId: string,
  searchParams: SearchParamsLike | null | undefined,
  currentListUrl: string,
): string {
  const params = collectEmbedPassthrough(searchParams)
  maybeAddScopeMerchant(params, searchParams)
  maybeAddReturn(params, currentListUrl)
  return toHref(`/orders/${encodeURIComponent(orderId)}`, params)
}

export function buildOrderListHref(
  searchParams: SearchParamsLike | null | undefined,
): string {
  const params = collectEmbedPassthrough(searchParams)
  maybeAddScopeMerchant(params, searchParams)
  return toHref('/my-orders', params)
}

export function buildOrderItemPdpHref(
  productId: string,
  merchantId: string | null | undefined,
  searchParams: SearchParamsLike | null | undefined,
  currentDetailUrl: string,
): string {
  const params = collectEmbedPassthrough(searchParams)
  const itemMerchantId = String(merchantId || '').trim()
  if (itemMerchantId) {
    params.set('merchant_id', itemMerchantId)
  } else {
    maybeAddScopeMerchant(params, searchParams)
  }
  maybeAddReturn(params, currentDetailUrl)
  return toHref(`/products/${encodeURIComponent(productId)}`, params)
}
