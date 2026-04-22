type AnyRecord = Record<string, unknown>

export type NormalizedOrderPermissions = {
  canPay: boolean
  canCancel: boolean
  canReorder: boolean
}

export type NormalizedOrderAmounts = {
  subtotalMinor: number
  discountTotalMinor: number
  shippingFeeMinor: number
  taxMinor: number
  totalAmountMinor: number
}

export type NormalizedOrderListItem = {
  id: string
  merchantId: string | null
  currency: string
  totalAmountMinor: number
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  deliveryStatus: string
  createdAt: string
  shippingCity: string | null
  shippingCountry: string | null
  itemsSummary: string | null
  creatorId: string | null
  creatorName: string | null
  creatorSlug: string | null
  firstItemImageUrl: string | null
  permissions: NormalizedOrderPermissions
}

export type NormalizedOrderItem = {
  id: string | null
  productId: string | null
  merchantId: string | null
  title: string
  quantity: number
  unitPriceMinor: number
  subtotalMinor: number
  sku: string | null
  imageUrl: string | null
  optionsText: string | null
}

export type NormalizedShippingAddress = {
  name: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  province: string | null
  country: string | null
  postalCode: string | null
  phone: string | null
}

export type NormalizedPaymentRecord = {
  paymentId: string | null
  paymentIntentId: string | null
  provider: string | null
  status: string | null
  amountMinor: number
  currency: string | null
  method: string | null
  brand: string | null
  last4: string | null
}

export type NormalizedShipmentEvent = {
  status: string | null
  description: string | null
  timestamp: string | null
}

export type NormalizedShipment = {
  trackingNumber: string | null
  carrier: string | null
  status: string | null
  estimatedDelivery: string | null
  trackingUrl: string | null
  events: NormalizedShipmentEvent[]
}

export type NormalizedRefundInfo = {
  status: string | null
  caseId: string | null
  updatedAt: string | null
  totalRefundedMinor: number
  currency: string | null
  requestsCount: number
  requests: NormalizedRefundRequest[]
  psp: NormalizedRefundPspInfo | null
}

export type NormalizedRefundRequest = {
  caseId: string | null
  status: string | null
  amountMinor: number
  currency: string | null
  reason: string | null
  createdAt: string | null
}

export type NormalizedRefundPspSnapshot = {
  provider: string | null
  refundId: string | null
  status: string | null
  amountMinor: number
  currency: string | null
  paymentIntentId: string | null
  destinationType: string | null
  destinationEntryType: string | null
  isReversal: boolean | null
  reference: string | null
  referenceStatus: string | null
  referenceType: string | null
  trackingReferenceKind: string | null
  pendingReason: string | null
  failureReason: string | null
  sourceEvent: string | null
  observedAt: string | null
}

export type NormalizedRefundPspInfo = {
  provider: string | null
  latest: NormalizedRefundPspSnapshot | null
  history: NormalizedRefundPspSnapshot[]
}

export type NormalizedOrderDetail = {
  id: string
  merchantId: string | null
  currency: string
  totalAmountMinor: number
  amounts: NormalizedOrderAmounts
  status: string
  paymentStatus: string
  fulfillmentStatus: string
  deliveryStatus: string
  createdAt: string
  updatedAt: string
  items: NormalizedOrderItem[]
  shippingAddress: NormalizedShippingAddress | null
  paymentRecords: NormalizedPaymentRecord[]
  shipments: NormalizedShipment[]
  refund: NormalizedRefundInfo
  permissions: NormalizedOrderPermissions
}

const isRecord = (value: unknown): value is AnyRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return null
}

const pickString = (source: AnyRecord, keys: string[]): string | null => {
  for (const key of keys) {
    const value = asString(source[key])
    if (value) return value
  }
  return null
}

const toMinorFromMajor = (major: number): number => Math.max(0, Math.round(major * 100))

const pickAmountMinor = (source: AnyRecord, minorKeys: string[], majorKeys: string[]): number => {
  for (const key of minorKeys) {
    const value = asNumber(source[key])
    if (value != null) return Math.max(0, Math.round(value))
  }
  for (const key of majorKeys) {
    const value = asNumber(source[key])
    if (value != null) return toMinorFromMajor(value)
  }
  return 0
}

const normalizePermissions = (raw: unknown): NormalizedOrderPermissions => {
  if (!isRecord(raw)) {
    return { canPay: false, canCancel: false, canReorder: false }
  }
  return {
    canPay: Boolean(raw.can_pay),
    canCancel: Boolean(raw.can_cancel),
    canReorder: Boolean(raw.can_reorder),
  }
}

const normalizeImageUrl = (raw: unknown): string | null => {
  const value = asString(raw)
  if (!value) return null
  if (value.startsWith('data:image/')) return value
  if (value.startsWith('https://')) return value
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`
  if (value.startsWith('//')) return `https:${value}`
  return null
}

const normalizeItemOptionsText = (raw: unknown): string | null => {
  if (!isRecord(raw)) return null
  const pairs = Object.entries(raw)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .filter((value) => value.trim().length > 0)
  return pairs.length ? pairs.join(' · ') : null
}

const normalizeOrderItem = (raw: unknown): NormalizedOrderItem => {
  const source = isRecord(raw) ? raw : {}
  const productSource = isRecord(source.product) ? source.product : null
  const productRefSource = isRecord(source.product_ref)
    ? source.product_ref
    : isRecord(source.productRef)
      ? source.productRef
      : null
  const quantityValue = asNumber(source.quantity ?? source.qty ?? 1)
  const quantity = quantityValue && quantityValue > 0 ? Math.round(quantityValue) : 1

  const unitPriceMinor = pickAmountMinor(
    source,
    ['unit_price_minor', 'unit_price_cents', 'price_minor', 'amount_minor'],
    ['unit_price', 'price', 'amount'],
  )
  const subtotalMinor = pickAmountMinor(
    source,
    ['subtotal_minor', 'subtotal_cents', 'line_total_minor', 'total_amount_minor'],
    ['subtotal', 'line_total', 'total', 'total_amount'],
  )

  const fallbackSubtotal = unitPriceMinor > 0 ? unitPriceMinor * quantity : 0
  const productId =
    pickString(source, ['product_id']) ||
    (productSource ? pickString(productSource, ['product_id']) : null) ||
    (productRefSource ? pickString(productRefSource, ['product_id']) : null)
  const merchantId =
    pickString(source, ['merchant_id']) ||
    (productSource ? pickString(productSource, ['merchant_id']) : null) ||
    (productRefSource ? pickString(productRefSource, ['merchant_id']) : null)

  return {
    id: pickString(source, ['item_id', 'line_item_id', 'id', 'product_id']),
    productId,
    merchantId,
    title: pickString(source, ['title', 'product_title', 'name']) || 'Item',
    quantity,
    unitPriceMinor,
    subtotalMinor: subtotalMinor || fallbackSubtotal,
    sku: pickString(source, ['sku', 'variant_sku', 'variant_id']),
    imageUrl:
      normalizeImageUrl(source.product_image_url) ||
      normalizeImageUrl(source.image_url) ||
      normalizeImageUrl(source.image) ||
      normalizeImageUrl(source.thumbnail_url),
    optionsText:
      normalizeItemOptionsText(source.selected_options) ||
      normalizeItemOptionsText(source.options) ||
      normalizeItemOptionsText(source.variant_options),
  }
}

const normalizeShipmentEvent = (raw: unknown): NormalizedShipmentEvent => {
  const source = isRecord(raw) ? raw : {}
  return {
    status: pickString(source, ['status', 'state']),
    description: pickString(source, ['description', 'message', 'detail']),
    timestamp: pickString(source, ['timestamp', 'occurred_at', 'created_at']),
  }
}

const normalizeShipment = (raw: unknown): NormalizedShipment => {
  const source = isRecord(raw) ? raw : {}
  const events = Array.isArray(source.events) ? source.events.map(normalizeShipmentEvent) : []
  return {
    trackingNumber: pickString(source, ['tracking_number', 'trackingNo']),
    carrier: pickString(source, ['carrier', 'shipping_carrier']),
    status: pickString(source, ['status', 'delivery_status', 'fulfillment_status']),
    estimatedDelivery: pickString(source, ['estimated_delivery', 'estimated_delivery_at']),
    trackingUrl: pickString(source, ['tracking_url', 'trackingUrl', 'url']),
    events,
  }
}

const normalizeShippingAddress = (
  orderSource: AnyRecord,
  rootSource: AnyRecord,
): NormalizedShippingAddress | null => {
  const shippingRaw =
    (isRecord(orderSource.shipping_address) && orderSource.shipping_address) ||
    (isRecord(rootSource.shipping_address) && rootSource.shipping_address) ||
    (isRecord(orderSource.shipping) && orderSource.shipping) ||
    null

  if (!shippingRaw) {
    const city = pickString(orderSource, ['shipping_city'])
    const country = pickString(orderSource, ['shipping_country'])
    if (!city && !country) return null
    return {
      name: null,
      addressLine1: null,
      addressLine2: null,
      city,
      province: null,
      country,
      postalCode: null,
      phone: null,
    }
  }

  const address: NormalizedShippingAddress = {
    name: pickString(shippingRaw, ['name', 'full_name', 'recipient_name']),
    addressLine1: pickString(shippingRaw, ['address_line1', 'address1', 'line1', 'street']),
    addressLine2: pickString(shippingRaw, ['address_line2', 'address2', 'line2', 'unit']),
    city: pickString(shippingRaw, ['city', 'town', 'locality']),
    province: pickString(shippingRaw, ['province', 'state', 'region']),
    country: pickString(shippingRaw, ['country', 'country_name']),
    postalCode: pickString(shippingRaw, ['postal_code', 'zip', 'zip_code']),
    phone: pickString(shippingRaw, ['phone', 'phone_number']),
  }

  const hasAnyField = Object.values(address).some(Boolean)
  return hasAnyField ? address : null
}

const normalizePaymentRecord = (raw: unknown): NormalizedPaymentRecord => {
  const source = isRecord(raw) ? raw : {}
  return {
    paymentId: pickString(source, ['payment_id', 'id']),
    paymentIntentId: pickString(source, ['payment_intent_id', 'intent_id']),
    provider: pickString(source, ['provider', 'psp_type', 'gateway']),
    status: pickString(source, ['status']),
    amountMinor: pickAmountMinor(source, ['amount_minor', 'amount_cents'], ['amount']),
    currency: pickString(source, ['currency']),
    method: pickString(source, ['method', 'payment_method', 'type']),
    brand: pickString(source, ['brand', 'card_brand', 'network']),
    last4: pickString(source, ['last4', 'card_last4', 'card_last_4']),
  }
}

const normalizeRefundInfo = (
  rootSource: AnyRecord,
  orderSource: AnyRecord,
): NormalizedRefundInfo => {
  const refundSource = isRecord(rootSource.refund) ? rootSource.refund : {}
  const requestsRaw = Array.isArray(refundSource.requests) ? refundSource.requests : []
  const requests = requestsRaw
    .filter((request): request is AnyRecord => isRecord(request))
    .map((request) => ({
      caseId: pickString(request, ['case_id', 'caseId']),
      status: pickString(request, ['status']),
      amountMinor: pickAmountMinor(request, ['amount_minor'], ['amount']),
      currency: pickString(request, ['currency']) || pickString(refundSource, ['currency']),
      reason: pickString(request, ['reason']),
      createdAt: pickString(request, ['created_at', 'createdAt']),
    }))

  const normalizeRefundPspSnapshot = (raw: unknown): NormalizedRefundPspSnapshot | null => {
    if (!isRecord(raw)) return null
    const provider = pickString(raw, ['provider'])
    const refundId = pickString(raw, ['refund_id', 'refundId'])
    const status = pickString(raw, ['status'])
    const amountMinor = pickAmountMinor(raw, ['amount_minor'], ['amount'])
    const currency = pickString(raw, ['currency'])
    const paymentIntentId = pickString(raw, ['payment_intent_id', 'paymentIntentId'])
    const destinationType = pickString(raw, ['destination_type', 'destinationType'])
    const destinationEntryType = pickString(raw, ['destination_entry_type', 'destinationEntryType'])
    const isReversal = asBoolean(raw.is_reversal ?? raw.isReversal)
    const reference = pickString(raw, ['reference'])
    const referenceStatus = pickString(raw, ['reference_status', 'referenceStatus'])
    const referenceType = pickString(raw, ['reference_type', 'referenceType'])
    const trackingReferenceKind = pickString(raw, [
      'tracking_reference_kind',
      'trackingReferenceKind',
    ])
    const pendingReason = pickString(raw, ['pending_reason', 'pendingReason'])
    const failureReason = pickString(raw, ['failure_reason', 'failureReason'])
    const sourceEvent = pickString(raw, ['source_event', 'sourceEvent'])
    const observedAt = pickString(raw, ['observed_at', 'observedAt'])
    const hasAnyField = [
      provider,
      refundId,
      status,
      amountMinor > 0 ? 'amount' : null,
      currency,
      paymentIntentId,
      destinationType,
      destinationEntryType,
      isReversal != null ? 'reversal' : null,
      reference,
      referenceStatus,
      referenceType,
      trackingReferenceKind,
      pendingReason,
      failureReason,
      sourceEvent,
      observedAt,
    ].some(Boolean)
    if (!hasAnyField) return null
    return {
      provider,
      refundId,
      status,
      amountMinor,
      currency,
      paymentIntentId,
      destinationType,
      destinationEntryType,
      isReversal,
      reference,
      referenceStatus,
      referenceType,
      trackingReferenceKind,
      pendingReason,
      failureReason,
      sourceEvent,
      observedAt,
    }
  }

  const normalizeRefundPspInfo = (raw: unknown): NormalizedRefundPspInfo | null => {
    if (!isRecord(raw)) return null
    const latest = normalizeRefundPspSnapshot(raw.latest)
    const history = Array.isArray(raw.history)
      ? raw.history
          .map((entry) => normalizeRefundPspSnapshot(entry))
          .filter((entry): entry is NormalizedRefundPspSnapshot => Boolean(entry))
      : []
    const provider =
      pickString(raw, ['provider']) || latest?.provider || history[0]?.provider || null
    if (!provider && !latest && history.length === 0) return null
    return {
      provider,
      latest,
      history,
    }
  }

  return {
    status: pickString(refundSource, ['status']),
    caseId: pickString(refundSource, ['case_id', 'caseId']),
    updatedAt: pickString(refundSource, ['updated_at', 'updatedAt']),
    totalRefundedMinor: pickAmountMinor(
      refundSource,
      ['total_refunded_minor', 'amount_minor'],
      ['total_refunded', 'amount'],
    ),
    currency: pickString(refundSource, ['currency']) || pickString(orderSource, ['currency']),
    requestsCount: requests.length,
    requests,
    psp: normalizeRefundPspInfo(refundSource.psp),
  }
}

const normalizeOrderAmounts = (
  rootSource: AnyRecord,
  orderSource: AnyRecord,
  _items: NormalizedOrderItem[],
): NormalizedOrderAmounts => {
  const pricingSource =
    (isRecord(rootSource.pricing) && rootSource.pricing) ||
    (isRecord(orderSource.pricing) && orderSource.pricing) ||
    {}

  const fallbackTotalAmountMinor = pickAmountMinor(
    orderSource,
    ['total_amount_minor', 'total_minor'],
    ['total_amount', 'total'],
  )
  const fallbackSubtotalMinor = pickAmountMinor(
    orderSource,
    ['subtotal_minor', 'subtotal_cents'],
    ['subtotal'],
  )

  const subtotalMinor =
    pickAmountMinor(pricingSource, ['subtotal_minor'], ['subtotal']) || fallbackSubtotalMinor
  const discountTotalMinor = pickAmountMinor(
    pricingSource,
    ['discount_total_minor', 'discount_minor'],
    ['discount_total', 'discount_amount', 'discounts'],
  )
  const shippingFeeMinor = pickAmountMinor(
    pricingSource,
    ['shipping_fee_minor', 'shipping_minor', 'shipping_amount_minor'],
    ['shipping_fee', 'shipping_amount', 'shipping_cost', 'shipping'],
  )
  const taxMinor = pickAmountMinor(
    pricingSource,
    ['tax_minor', 'tax_amount_minor'],
    ['tax', 'tax_amount', 'tax_total', 'taxes'],
  )
  const totalAmountMinor =
    pickAmountMinor(
      pricingSource,
      ['total_amount_minor', 'total_minor'],
      ['total_amount', 'total'],
    ) ||
    fallbackTotalAmountMinor ||
    Math.max(0, subtotalMinor - discountTotalMinor) + shippingFeeMinor + taxMinor

  return {
    subtotalMinor,
    discountTotalMinor,
    shippingFeeMinor,
    taxMinor,
    totalAmountMinor,
  }
}

export const normalizeOrderListItem = (raw: unknown): NormalizedOrderListItem => {
  const source = isRecord(raw) ? raw : {}
  const id = pickString(source, ['order_id', 'id']) || ''
  return {
    id,
    merchantId: pickString(source, ['merchant_id', 'merchantId']),
    currency: pickString(source, ['currency']) || 'USD',
    totalAmountMinor: pickAmountMinor(
      source,
      ['total_amount_minor', 'total_minor'],
      ['total_amount', 'total'],
    ),
    status: pickString(source, ['status']) || 'processing',
    paymentStatus: pickString(source, ['payment_status']) || '',
    fulfillmentStatus: pickString(source, ['fulfillment_status']) || '',
    deliveryStatus: pickString(source, ['delivery_status']) || '',
    createdAt: pickString(source, ['created_at']) || new Date(0).toISOString(),
    shippingCity: pickString(source, ['shipping_city']),
    shippingCountry: pickString(source, ['shipping_country']),
    itemsSummary: pickString(source, ['items_summary']),
    creatorId: pickString(source, ['creator_id']),
    creatorName: pickString(source, ['creator_name']),
    creatorSlug: pickString(source, ['creator_slug']),
    firstItemImageUrl:
      normalizeImageUrl(source.first_item_image_url) ||
      normalizeImageUrl(source.thumbnail_url) ||
      null,
    permissions: normalizePermissions(source.permissions),
  }
}

export const normalizeOrderDetail = (raw: unknown): NormalizedOrderDetail | null => {
  if (!isRecord(raw)) return null
  const orderSource = isRecord(raw.order) ? raw.order : raw
  const id = pickString(orderSource, ['order_id', 'id'])
  if (!id) return null

  const itemsRaw = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(orderSource.items)
      ? orderSource.items
      : Array.isArray(orderSource.line_items)
        ? orderSource.line_items
        : []
  const orderMerchantId = pickString(orderSource, ['merchant_id'])
  const items = itemsRaw.map(normalizeOrderItem).map((item) => {
    if (item.productId && !item.merchantId && orderMerchantId) {
      return {
        ...item,
        merchantId: orderMerchantId,
      }
    }
    return item
  })

  const paymentRecordsRaw =
    isRecord(raw.payment) && Array.isArray(raw.payment.records)
      ? raw.payment.records
      : []
  const paymentRecords = paymentRecordsRaw.map(normalizePaymentRecord)

  const shipmentsRaw =
    isRecord(raw.fulfillment) && Array.isArray(raw.fulfillment.shipments)
      ? raw.fulfillment.shipments
      : isRecord(raw.tracking)
        ? [raw.tracking]
        : []
  const shipments = shipmentsRaw.map(normalizeShipment)
  const amounts = normalizeOrderAmounts(raw, orderSource, items)

  return {
    id,
    merchantId: pickString(orderSource, ['merchant_id']),
    currency: pickString(orderSource, ['currency']) || 'USD',
    totalAmountMinor: amounts.totalAmountMinor,
    amounts,
    status: pickString(orderSource, ['status']) || 'processing',
    paymentStatus: pickString(orderSource, ['payment_status']) || '',
    fulfillmentStatus: pickString(orderSource, ['fulfillment_status']) || '',
    deliveryStatus: pickString(orderSource, ['delivery_status']) || '',
    createdAt: pickString(orderSource, ['created_at']) || new Date(0).toISOString(),
    updatedAt:
      pickString(orderSource, ['updated_at']) ||
      pickString(orderSource, ['created_at']) ||
      new Date(0).toISOString(),
    items,
    shippingAddress: normalizeShippingAddress(orderSource, raw),
    paymentRecords,
    shipments,
    refund: normalizeRefundInfo(raw, orderSource),
    permissions: normalizePermissions(raw.permissions || orderSource.permissions),
  }
}
