import { NextRequest, NextResponse } from 'next/server';

// This route is a backend-bound proxy, not a latency-sensitive edge personalization layer.
// Keep it on the Node runtime in the project's home region so requests do not bounce from
// request-local edge regions back to the US-hosted upstream on every PDP/API call.
export const runtime = 'nodejs';
export const preferredRegion = 'home';

const SHOP_UPSTREAM_BASE =
  process.env.SHOP_UPSTREAM_API_URL ||
  process.env.SHOP_GATEWAY_UPSTREAM_BASE_URL ||
  process.env.SHOP_GATEWAY_AGENT_BASE_URL ||
  'https://pivota-agent-production.up.railway.app';

const CHECKOUT_UPSTREAM_BASE =
  process.env.PIVOTA_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
  'https://web-production-fedb.up.railway.app';

const REVIEWS_UPSTREAM_BASE =
  process.env.NEXT_PUBLIC_REVIEWS_API_URL ||
  process.env.NEXT_PUBLIC_REVIEWS_BACKEND_URL ||
  process.env.REVIEWS_BACKEND_URL ||
  'https://web-production-fedb.up.railway.app';

const REVIEWS_OPERATIONS = new Set([
  'get_review_summary',
  'list_sku_reviews',
  'list_group_reviews',
  'list_group_merchants',
  'list_seller_feedback',
  'list_review_entrypoints',
  'resolve_review_intent',
]);

const CHECKOUT_SAFE_OPERATIONS = new Set([
  'preview_quote',
  'create_order',
  'submit_payment',
  'confirm_payment',
  'get_order_status',
]);

const AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  process.env.PIVOTA_API_KEY ||
  '';

const PDP_PROXY_TIMEOUTS_MS: Record<string, number> = {
  get_pdp_v2: Math.max(1000, Number(process.env.SHOP_GATEWAY_GET_PDP_V2_PROXY_TIMEOUT_MS || 16000)),
  get_pdp: Math.max(1000, Number(process.env.SHOP_GATEWAY_GET_PDP_PROXY_TIMEOUT_MS || 14000)),
  get_product_detail: Math.max(
    1000,
    Number(process.env.SHOP_GATEWAY_GET_PRODUCT_DETAIL_PROXY_TIMEOUT_MS || 10000),
  ),
  resolve_product_candidates: Math.max(
    1000,
    Number(process.env.SHOP_GATEWAY_RESOLVE_PRODUCT_CANDIDATES_PROXY_TIMEOUT_MS || 7000),
  ),
  find_similar_products: Math.max(
    1000,
    Number(process.env.SHOP_GATEWAY_FIND_SIMILAR_PROXY_TIMEOUT_MS || 7000),
  ),
};

function buildShopUpstreamInvokeUrl(base: string): string {
  const normalized = String(base || '').trim().replace(/\/+$/, '');
  if (!normalized) return '/agent/shop/v1/invoke';
  if (/\/api\/gateway$/i.test(normalized)) return normalized;
  return `${normalized}/agent/shop/v1/invoke`;
}

const CLIENT_OWNED_PAYMENT_STATUSES = new Set(['requires_action']);
const KNOWN_PAYMENT_STATUSES = new Set([
  ...CLIENT_OWNED_PAYMENT_STATUSES,
  'processing',
  'succeeded',
  'paid',
  'failed',
  'canceled',
  'cancelled',
  'refunded',
  'partially_refunded',
  'pending',
  'unknown',
]);

type JsonRecord = Record<string, any>;

type CheckoutSafeRequest =
  | {
      method: 'GET' | 'POST';
      url: string;
      body?: JsonRecord;
    }
  | {
      error: string;
      message: string;
      status?: number;
    };

function isPlainObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createGatewayRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function pruneEmptyFields(input: JsonRecord): JsonRecord {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isPlainObject(value) && Object.keys(value).length === 0) continue;
    output[key] = value;
  }
  return output;
}

function extractResponseHeader(
  headers: Headers,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    const value = String(headers.get(candidate) || '').trim();
    if (value) return value;
  }
  return null;
}

function getProxyTimeoutMs(operation: string): number | null {
  const normalizedOperation = String(operation || '').trim().toLowerCase();
  const configured = PDP_PROXY_TIMEOUTS_MS[normalizedOperation];
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

function inferReasonCodeFromPayload(
  payload: unknown,
  fallbackError: string,
): string {
  if (isPlainObject(payload)) {
    const nestedError = isPlainObject(payload.error) ? payload.error : null;
    const nestedDetails = nestedError && isPlainObject(nestedError.details) ? nestedError.details : null;
    const candidate =
      firstNonEmptyString(
        payload.reason_code,
        payload.reasonCode,
        payload.code,
        nestedError?.code,
        nestedDetails?.reason_code,
        nestedDetails?.error,
        typeof payload.error === 'string' ? payload.error : null,
      ) || fallbackError;
    return candidate;
  }
  return fallbackError;
}

function inferErrorMessageFromPayload(
  payload: unknown,
  fallbackMessage: string,
): string {
  if (isPlainObject(payload)) {
    const nestedError = isPlainObject(payload.error) ? payload.error : null;
    const nestedDetails = nestedError && isPlainObject(nestedError.details) ? nestedError.details : null;
    return (
      firstNonEmptyString(
        payload.message,
        nestedError?.message,
        nestedDetails?.message,
        typeof payload.detail === 'string' ? payload.detail : null,
      ) || fallbackMessage
    );
  }
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  return fallbackMessage;
}

function buildGatewayErrorPayload(args: {
  status: number;
  payload?: unknown;
  operation: string;
  gatewayRequestId: string;
  upstreamRequestId?: string | null;
  fallbackError: string;
  fallbackMessage: string;
}): JsonRecord {
  const reasonCode = inferReasonCodeFromPayload(args.payload, args.fallbackError);
  const message = inferErrorMessageFromPayload(args.payload, args.fallbackMessage);
  const payload: JsonRecord = isPlainObject(args.payload)
    ? { ...args.payload }
    : args.payload == null
      ? {}
      : { detail: args.payload };

  return {
    ...payload,
    error: firstNonEmptyString(payload.error, args.fallbackError) || args.fallbackError,
    message,
    reason_code: reasonCode,
    operation: firstNonEmptyString(payload.operation, args.operation) || args.operation,
    gateway_request_id: args.gatewayRequestId,
    ...(args.upstreamRequestId ? { upstream_request_id: args.upstreamRequestId } : {}),
  };
}

function normalizeShippingAddress(raw: unknown): JsonRecord | undefined {
  if (!isPlainObject(raw)) return undefined;
  return pruneEmptyFields({
    name: firstNonEmptyString(raw.name, raw.recipient_name, raw.recipientName),
    address_line1: firstNonEmptyString(raw.address_line1, raw.addressLine1),
    address_line2: firstNonEmptyString(raw.address_line2, raw.addressLine2),
    city: firstNonEmptyString(raw.city),
    state: firstNonEmptyString(raw.state, raw.province, raw.state_code, raw.province_code),
    country: firstNonEmptyString(raw.country),
    postal_code: firstNonEmptyString(raw.postal_code, raw.postalCode, raw.zip),
    phone: firstNonEmptyString(raw.phone),
  });
}

function buildPreviewQuoteRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const quote = isPlainObject(payload.quote) ? payload.quote : {};
  const items = Array.isArray(quote.items) ? quote.items : [];

  return {
    method: 'POST',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/quotes/preview`,
    body: pruneEmptyFields({
      merchant_id: firstNonEmptyString(
        quote.merchant_id,
        quote.merchantId,
        payload.merchant_id,
        payload.merchantId,
      ),
      items: items.map((item) =>
        pruneEmptyFields({
          product_id: firstNonEmptyString(item?.product_id, item?.productId),
          variant_id: firstNonEmptyString(item?.variant_id, item?.variantId, item?.sku),
          quantity: Math.max(1, Number(item?.quantity || 1) || 1),
        }),
      ),
      discount_codes: Array.isArray(quote.discount_codes) ? quote.discount_codes : undefined,
      customer_email: firstNonEmptyString(quote.customer_email, quote.customerEmail),
      shipping_address: normalizeShippingAddress(quote.shipping_address),
      selected_delivery_option: isPlainObject(quote.selected_delivery_option)
        ? quote.selected_delivery_option
        : undefined,
    }),
  };
}

function buildCreateOrderRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const order = isPlainObject(payload.order) ? payload.order : {};
  const items = Array.isArray(order.items) ? order.items : [];
  const merchantId = firstNonEmptyString(
    order.merchant_id,
    order.merchantId,
    items[0]?.merchant_id,
    items[0]?.merchantId,
  );

  return {
    method: 'POST',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/orders/create`,
    body: pruneEmptyFields({
      merchant_id: merchantId,
      customer_email: firstNonEmptyString(order.customer_email, order.customerEmail),
      currency: firstNonEmptyString(order.currency),
      quote_id: firstNonEmptyString(order.quote_id, order.quoteId),
      discount_codes: Array.isArray(order.discount_codes) ? order.discount_codes : undefined,
      selected_delivery_option: isPlainObject(order.selected_delivery_option)
        ? order.selected_delivery_option
        : undefined,
      metadata: isPlainObject(order.metadata) ? order.metadata : undefined,
      preferred_psp: firstNonEmptyString(order.preferred_psp, order.preferredPsp),
      idempotency_key: firstNonEmptyString(order.idempotency_key, order.idempotencyKey),
      items: items.map((item) =>
        pruneEmptyFields({
          merchant_id:
            firstNonEmptyString(item?.merchant_id, item?.merchantId) || merchantId || undefined,
          product_id: firstNonEmptyString(item?.product_id, item?.productId),
          product_title: firstNonEmptyString(item?.product_title, item?.productTitle, item?.title),
          variant_id: firstNonEmptyString(item?.variant_id, item?.variantId),
          sku: firstNonEmptyString(item?.sku),
          selected_options: isPlainObject(item?.selected_options) ? item.selected_options : undefined,
          quantity: Math.max(1, Number(item?.quantity || 1) || 1),
          unit_price: Number(item?.unit_price ?? item?.price ?? 0) || 0,
          subtotal:
            Number(item?.subtotal ?? (Number(item?.unit_price ?? item?.price ?? 0) || 0) * (Number(item?.quantity || 1) || 1)) ||
            0,
        }),
      ),
      shipping_address: normalizeShippingAddress(order.shipping_address),
      customer_notes: firstNonEmptyString(order.customer_notes, order.customerNotes, order.notes),
    }),
  };
}

function buildSubmitPaymentRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const payment = isPlainObject(payload.payment) ? payload.payment : {};
  const paymentMethod = isPlainObject(payment.payment_method) ? payment.payment_method : {};
  const paymentMethodType =
    firstNonEmptyString(
      payment.payment_method_hint,
      payment.paymentMethodHint,
      paymentMethod.type,
      payment.payment_method,
    ) || 'dynamic';

  return {
    method: 'POST',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/payments`,
    body: pruneEmptyFields({
      order_id: firstNonEmptyString(payment.order_id, payment.orderId),
      payment_method: {
        type: paymentMethodType,
      },
      return_url: firstNonEmptyString(
        payment.return_url,
        payment.returnUrl,
        payment.redirect_url,
        payment.redirectUrl,
      ),
      idempotency_key: firstNonEmptyString(payment.idempotency_key, payment.idempotencyKey),
      save_payment_method:
        typeof payment.save_payment_method === 'boolean'
          ? payment.save_payment_method
          : typeof payment.savePaymentMethod === 'boolean'
            ? payment.savePaymentMethod
            : undefined,
    }),
  };
}

function buildConfirmPaymentRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const order = isPlainObject(payload.order) ? payload.order : {};
  const payment = isPlainObject(payload.payment) ? payload.payment : {};
  const status = isPlainObject(payload.status) ? payload.status : {};
  const orderId = firstNonEmptyString(
    order.order_id,
    order.orderId,
    payment.order_id,
    payment.orderId,
    status.order_id,
    status.orderId,
    payload.order_id,
    payload.orderId,
  );

  if (!orderId) {
    return {
      error: 'MISSING_PARAMETERS',
      message: 'order_id is required',
      status: 400,
    };
  }

  return {
    method: 'POST',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/orders/${encodeURIComponent(orderId)}/confirm-payment`,
    body: {},
  };
}

function buildGetOrderStatusRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  const status = isPlainObject(payload.status) ? payload.status : {};
  const order = isPlainObject(payload.order) ? payload.order : {};
  const orderId = firstNonEmptyString(
    status.order_id,
    status.orderId,
    order.order_id,
    order.orderId,
    payload.order_id,
    payload.orderId,
  );

  if (!orderId) {
    return {
      error: 'MISSING_PARAMETERS',
      message: 'order_id is required',
      status: 400,
    };
  }

  return {
    method: 'GET',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/orders/${encodeURIComponent(orderId)}/track`,
  };
}

function buildCheckoutSafeRequest(operation: string, body: JsonRecord): CheckoutSafeRequest {
  switch (operation) {
    case 'preview_quote':
      return buildPreviewQuoteRequest(body);
    case 'create_order':
      return buildCreateOrderRequest(body);
    case 'submit_payment':
      return buildSubmitPaymentRequest(body);
    case 'confirm_payment':
      return buildConfirmPaymentRequest(body);
    case 'get_order_status':
      return buildGetOrderStatusRequest(body);
    default:
      return {
        error: 'UNSUPPORTED_OPERATION',
        message: `Unsupported checkout operation: ${operation}`,
        status: 400,
      };
  }
}

function normalizeSubmitPaymentStatus(status: unknown): {
  payment_status: string;
  payment_status_raw: string | null;
} {
  const raw = firstNonEmptyString(status);
  if (!raw) {
    return {
      payment_status: 'unknown',
      payment_status_raw: null,
    };
  }
  const normalized = raw.toLowerCase();
  if (KNOWN_PAYMENT_STATUSES.has(normalized)) {
    return {
      payment_status: normalized,
      payment_status_raw: null,
    };
  }
  return {
    payment_status: 'unknown',
    payment_status_raw: raw,
  };
}

function normalizeSubmitPaymentResponse(payload: unknown): unknown {
  if (!isPlainObject(payload)) return payload;

  const paymentObject = isPlainObject(payload.payment) ? payload.payment : {};
  const nextAction = isPlainObject(payload.next_action) ? payload.next_action : null;
  const paymentStatus = normalizeSubmitPaymentStatus(
    payload.payment_status ?? paymentObject.payment_status ?? payload.status ?? paymentObject.status,
  );
  const psp =
    firstNonEmptyString(payload.psp, payload.psp_used, paymentObject.psp, paymentObject.psp_used) || null;

  let paymentAction = isPlainObject(payload.payment_action)
    ? payload.payment_action
    : isPlainObject(paymentObject.payment_action)
      ? paymentObject.payment_action
      : null;

  const clientSecret = firstNonEmptyString(payload.client_secret, paymentObject.client_secret);
  if (!paymentAction && nextAction?.redirect_url) {
    paymentAction = {
      type: 'redirect_url',
      url: nextAction.redirect_url,
      client_secret: null,
      raw: null,
    };
  } else if (!paymentAction && clientSecret) {
    paymentAction = /^https?:\/\//i.test(clientSecret)
      ? {
          type: 'redirect_url',
          url: clientSecret,
          client_secret: null,
          raw: null,
        }
      : {
          type: 'stripe_client_secret',
          client_secret: clientSecret,
          url: null,
          raw: null,
        };
  }

  const requiresClientConfirmation = CLIENT_OWNED_PAYMENT_STATUSES.has(paymentStatus.payment_status);

  return {
    ...payload,
    payment_status: paymentStatus.payment_status,
    confirmation_owner: requiresClientConfirmation ? 'client' : 'backend',
    requires_client_confirmation: requiresClientConfirmation,
    ...(paymentStatus.payment_status_raw
      ? { payment_status_raw: paymentStatus.payment_status_raw }
      : {}),
    ...(psp ? { psp } : {}),
    ...(paymentAction ? { payment_action: paymentAction } : {}),
    payment: {
      ...paymentObject,
      ...(psp ? { psp } : {}),
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      ...(paymentAction ? { payment_action: paymentAction } : {}),
      payment_status: paymentStatus.payment_status,
      confirmation_owner: requiresClientConfirmation ? 'client' : 'backend',
      requires_client_confirmation: requiresClientConfirmation,
      ...(paymentStatus.payment_status_raw
        ? { payment_status_raw: paymentStatus.payment_status_raw }
        : {}),
    },
  };
}

function normalizeCheckoutSafeResponse(operation: string, payload: unknown): unknown {
  if (operation === 'submit_payment') {
    return normalizeSubmitPaymentResponse(payload);
  }
  return payload;
}

export async function POST(req: NextRequest) {
  const localGatewayRequestId = createGatewayRequestId();
  try {
    const startedAt = Date.now();
    const body = await req.json();
    const checkoutToken = String(req.headers.get('x-checkout-token') || '').trim() || null;
    const operation = String(body?.operation || '').trim();
    const normalizedOperation = operation.toLowerCase();
    const useCheckoutSafeProxy = CHECKOUT_SAFE_OPERATIONS.has(normalizedOperation);
    const checkoutSafeRequest = useCheckoutSafeProxy
      ? buildCheckoutSafeRequest(normalizedOperation, isPlainObject(body) ? body : {})
      : null;

    if (checkoutSafeRequest && 'error' in checkoutSafeRequest) {
      return NextResponse.json(
        {
          error: checkoutSafeRequest.error,
          message: checkoutSafeRequest.message,
          operation,
        },
        { status: checkoutSafeRequest.status || 400 },
      );
    }

    const upstreamBase = REVIEWS_OPERATIONS.has(operation)
      ? REVIEWS_UPSTREAM_BASE
      : useCheckoutSafeProxy
        ? CHECKOUT_UPSTREAM_BASE
        : SHOP_UPSTREAM_BASE;
    const upstreamUrl =
      checkoutSafeRequest && !('error' in checkoutSafeRequest)
        ? checkoutSafeRequest.url
        : buildShopUpstreamInvokeUrl(upstreamBase);
    const upstreamMethod =
      checkoutSafeRequest && !('error' in checkoutSafeRequest)
        ? checkoutSafeRequest.method
        : 'POST';
    const upstreamBody =
      checkoutSafeRequest && !('error' in checkoutSafeRequest)
        ? checkoutSafeRequest.body
        : body;
    if (process.env.NODE_ENV !== 'production') {
      // Log only safe details in dev (no tokens/headers/body payload).
      // eslint-disable-next-line no-console
      console.log('[gateway-proxy]', {
        upstream: upstreamBase,
        operation,
        checkoutSafeProxy: useCheckoutSafeProxy,
      });
    }

    const upstreamStartedAt = Date.now();
    const timeoutMs = getProxyTimeoutMs(normalizedOperation);
    const controller = timeoutMs ? new AbortController() : null;
    const timer = timeoutMs
      ? setTimeout(() => {
          controller?.abort();
        }, timeoutMs)
      : null;
    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method: upstreamMethod,
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Request-Id': localGatewayRequestId,
          ...(checkoutToken
            ? { 'X-Checkout-Token': checkoutToken }
            : AGENT_API_KEY
              ? {
                  'X-API-Key': AGENT_API_KEY,
                  Authorization: `Bearer ${AGENT_API_KEY}`,
                }
              : {}),
        },
        ...(controller ? { signal: controller.signal } : {}),
        ...(upstreamMethod === 'GET' ? {} : { body: JSON.stringify(upstreamBody || {}) }),
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
    const upstreamMs = Math.max(0, Date.now() - upstreamStartedAt);
    const totalMs = Math.max(0, Date.now() - startedAt);
    const proxyMs = Math.max(0, totalMs - upstreamMs);
    const upstreamTiming = String(upstreamRes.headers.get('server-timing') || '').trim();
    const upstreamRetries = String(upstreamRes.headers.get('x-gateway-retries') || '').trim();
    const upstreamGatewayRequestId =
      extractResponseHeader(upstreamRes.headers, ['x-gateway-request-id']) || null;
    const upstreamRequestId =
      extractResponseHeader(upstreamRes.headers, [
        'x-upstream-request-id',
        'x-request-id',
        'x-requestid',
        'x-railway-request-id',
      ]) || null;
    const effectiveGatewayRequestId = upstreamGatewayRequestId || localGatewayRequestId;
    const timingParts = [
      `upstream_fetch;dur=${upstreamMs}`,
      ...(upstreamTiming ? [upstreamTiming] : []),
      `proxy;dur=${proxyMs}`,
      `gateway;dur=${totalMs}`,
    ];

    const text = await upstreamRes.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }

    const responsePayload = useCheckoutSafeProxy
      ? normalizeCheckoutSafeResponse(normalizedOperation, json)
      : json;

    const responseHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Server-Timing': timingParts.join(', '),
      'X-Gateway-Request-Id': effectiveGatewayRequestId,
      ...(upstreamRetries ? { 'x-gateway-retries': upstreamRetries } : {}),
      ...(upstreamRequestId ? { 'X-Upstream-Request-Id': upstreamRequestId } : {}),
    };

    if (!upstreamRes.ok) {
      const normalizedError = buildGatewayErrorPayload({
        status: upstreamRes.status,
        payload: responsePayload,
        operation,
        gatewayRequestId: effectiveGatewayRequestId,
        upstreamRequestId,
        fallbackError: upstreamRes.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        fallbackMessage: `Gateway error: ${upstreamRes.status} ${upstreamRes.statusText}`,
      });

      return NextResponse.json(normalizedError, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    if (typeof responsePayload === 'string') {
      return new Response(responsePayload, {
        status: upstreamRes.status,
        headers: {
          ...responseHeaders,
          'Content-Type': upstreamRes.headers.get('content-type') || 'text/plain; charset=utf-8',
        },
      });
    }

    return NextResponse.json(responsePayload, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Gateway proxy error:', error);
    const isAbortError = (error as Error | null)?.name === 'AbortError';
    const status = isAbortError ? 504 : 502;
    const reasonCode = isAbortError ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE';
    return NextResponse.json(
      {
        error: reasonCode,
        message: isAbortError
          ? 'The request timed out before the upstream responded. Please retry.'
          : (error as Error).message ?? String(error),
        reason_code: reasonCode,
        gateway_request_id: localGatewayRequestId,
      },
      {
        status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'X-Gateway-Request-Id': localGatewayRequestId,
        },
      },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-API-Key, X-Checkout-Token',
      },
    },
  );
}
