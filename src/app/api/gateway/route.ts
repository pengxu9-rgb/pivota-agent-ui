import { NextRequest } from 'next/server';
import { resolveCheckoutPaymentContract } from '@/lib/checkoutPaymentContract';

// This route is a backend-bound proxy, not a latency-sensitive edge personalization layer.
// Keep it on the Node runtime in the project's home region so requests do not bounce from
// request-local edge regions back to the US-hosted upstream on every PDP/API call.
export const runtime = 'nodejs';
export const preferredRegion = 'home';

const DEFAULT_SHOP_UPSTREAM_BASE = 'https://pivota-agent-production.up.railway.app';

const SHOP_UPSTREAM_BASE =
  process.env.SHOP_UPSTREAM_API_URL ||
  process.env.SHOP_GATEWAY_UPSTREAM_BASE_URL ||
  process.env.SHOP_GATEWAY_AGENT_BASE_URL ||
  DEFAULT_SHOP_UPSTREAM_BASE;

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
  'record_payment_offer_evidence',
]);

const AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  process.env.PIVOTA_API_KEY ||
  '';

const EXPOSED_PROXY_HEADERS = [
  'Server-Timing',
  'x-gateway-server-timing',
  'x-gateway-retries',
  'x-gateway-request-id',
  'x-service-commit',
  'x-service-deployment-id',
  'x-aurora-build',
  'x-aurora-git-sha',
];

const SAFE_UPSTREAM_DEBUG_HEADERS = [
  'x-gateway-request-id',
  'x-service-commit',
  'x-service-deployment-id',
  'x-aurora-build',
  'x-aurora-git-sha',
];

const GATEWAY_PROXY_HOP_HEADER = 'x-gateway-proxy-hop';
const MAX_GATEWAY_PROXY_HOPS = 1;

function buildShopUpstreamInvokeUrl(base: string): string {
  const normalized = String(base || '').trim().replace(/\/+$/, '');
  if (!normalized) return '/agent/shop/v1/invoke';
  if (/\/api\/gateway$/i.test(normalized)) return normalized;
  return `${normalized}/agent/shop/v1/invoke`;
}

function normalizeGatewayPathname(pathname: string): string {
  const normalized = String(pathname || '').trim().replace(/\/+$/, '');
  return normalized || '/';
}

function isSameOriginGatewayProxyTarget(base: string, requestUrl: string): boolean {
  const normalizedBase = String(base || '').trim();
  const normalizedRequestUrl = String(requestUrl || '').trim();
  if (!normalizedBase || !normalizedRequestUrl) return false;

  try {
    const upstreamUrl = new URL(normalizedBase);
    const currentUrl = new URL(normalizedRequestUrl);
    return (
      upstreamUrl.origin === currentUrl.origin &&
      normalizeGatewayPathname(upstreamUrl.pathname).toLowerCase() === '/api/gateway' &&
      normalizeGatewayPathname(currentUrl.pathname).toLowerCase() === '/api/gateway'
    );
  } catch {
    return false;
  }
}

function resolveShopUpstreamBase(requestUrl: string): {
  upstreamBase: string;
  recursionPrevented: boolean;
} {
  if (isSameOriginGatewayProxyTarget(SHOP_UPSTREAM_BASE, requestUrl)) {
    return {
      upstreamBase: DEFAULT_SHOP_UPSTREAM_BASE,
      recursionPrevented: true,
    };
  }

  return {
    upstreamBase: SHOP_UPSTREAM_BASE,
    recursionPrevented: false,
  };
}

const KNOWN_PAYMENT_STATUSES = new Set([
  'requires_action',
  'processing',
  'paid',
  'payment_failed',
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
      payment_context: isPlainObject(quote.payment_context) ? quote.payment_context : undefined,
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
      selected_payment_offer_id: firstNonEmptyString(
        order.selected_payment_offer_id,
        order.selectedPaymentOfferId,
      ),
      payment_method_evidence: isPlainObject(order.payment_method_evidence)
        ? order.payment_method_evidence
        : isPlainObject(order.paymentMethodEvidence)
          ? order.paymentMethodEvidence
          : undefined,
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

function buildRecordPaymentOfferEvidenceRequest(body: JsonRecord): CheckoutSafeRequest {
  const payload = isPlainObject(body.payload) ? body.payload : {};
  return {
    method: 'POST',
    url: `${CHECKOUT_UPSTREAM_BASE}/agent/v1/orders/payment-offer-evidence`,
    body: pruneEmptyFields({
      order_id: firstNonEmptyString(payload.order_id, payload.orderId),
      quote_id: firstNonEmptyString(payload.quote_id, payload.quoteId),
      merchant_id: firstNonEmptyString(payload.merchant_id, payload.merchantId),
      selected_payment_offer_id: firstNonEmptyString(
        payload.selected_payment_offer_id,
        payload.selectedPaymentOfferId,
      ),
      payment_method_evidence: isPlainObject(payload.payment_method_evidence)
        ? payload.payment_method_evidence
        : isPlainObject(payload.paymentMethodEvidence)
          ? payload.paymentMethodEvidence
          : {},
      payment_offer_evidence: isPlainObject(payload.payment_offer_evidence)
        ? payload.payment_offer_evidence
        : isPlainObject(payload.paymentOfferEvidence)
          ? payload.paymentOfferEvidence
          : undefined,
      surface: firstNonEmptyString(payload.surface) || 'checkout',
      event_type: firstNonEmptyString(payload.event_type, payload.eventType),
      idempotency_key: firstNonEmptyString(payload.idempotency_key, payload.idempotencyKey),
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
    case 'record_payment_offer_evidence':
      return buildRecordPaymentOfferEvidenceRequest(body);
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
  const aliases: Record<string, string> = {
    requires_payment_method: 'requires_action',
    requires_confirmation: 'requires_action',
    completed: 'paid',
    succeeded: 'paid',
    success: 'paid',
    settled: 'paid',
    failed: 'payment_failed',
    canceled: 'cancelled',
  };
  const canonical = aliases[normalized] || normalized;
  if (KNOWN_PAYMENT_STATUSES.has(canonical)) {
    return {
      payment_status: canonical,
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

  const paymentContract = resolveCheckoutPaymentContract({
    paymentResponse: {
      ...payload,
      payment_status: paymentStatus.payment_status,
      ...(paymentStatus.payment_status_raw
        ? { payment_status_raw: paymentStatus.payment_status_raw }
        : {}),
      ...(paymentAction ? { payment_action: paymentAction } : {}),
      payment: {
        ...paymentObject,
        ...(paymentAction ? { payment_action: paymentAction } : {}),
        payment_status: paymentStatus.payment_status,
        ...(paymentStatus.payment_status_raw
          ? { payment_status_raw: paymentStatus.payment_status_raw }
          : {}),
      },
    },
    action: paymentAction || undefined,
  });
  const normalizedPaymentAction = paymentAction
    ? {
        ...paymentAction,
        ...(paymentContract.submitOwner ? { submit_owner: paymentContract.submitOwner } : {}),
        ...(paymentContract.componentKind ? { component_kind: paymentContract.componentKind } : {}),
        supported_in_shopping_ui: paymentContract.supportedInShoppingUi,
      }
    : null;

  return {
    ...payload,
    payment_status: paymentStatus.payment_status,
    confirmation_owner: paymentContract.confirmationOwner,
    requires_client_confirmation: paymentContract.requiresClientConfirmation,
    ...(paymentStatus.payment_status_raw
      ? { payment_status_raw: paymentStatus.payment_status_raw }
      : {}),
    ...(psp ? { psp } : {}),
    ...(normalizedPaymentAction ? { payment_action: normalizedPaymentAction } : {}),
    ...(paymentContract.submitOwner ? { submit_owner: paymentContract.submitOwner } : {}),
    ...(paymentContract.componentKind ? { component_kind: paymentContract.componentKind } : {}),
    supported_in_shopping_ui: paymentContract.supportedInShoppingUi,
    payment: {
      ...paymentObject,
      ...(psp ? { psp } : {}),
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      ...(normalizedPaymentAction ? { payment_action: normalizedPaymentAction } : {}),
      payment_status: paymentStatus.payment_status,
      confirmation_owner: paymentContract.confirmationOwner,
      requires_client_confirmation: paymentContract.requiresClientConfirmation,
      ...(paymentContract.submitOwner ? { submit_owner: paymentContract.submitOwner } : {}),
      ...(paymentContract.componentKind ? { component_kind: paymentContract.componentKind } : {}),
      supported_in_shopping_ui: paymentContract.supportedInShoppingUi,
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

function appendIfPresent(headers: Headers, name: string, value: unknown) {
  const normalized = String(value || '').trim();
  if (normalized) headers.set(name, normalized);
}

function buildGatewayResponseHeaders(args?: {
  contentType?: string | null;
  serverTiming?: string | null;
  gatewayRetries?: string | null;
  upstreamHeaders?: Headers;
  extraHeaders?: Record<string, string>;
}): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Expose-Headers', EXPOSED_PROXY_HEADERS.join(', '));
  appendIfPresent(
    headers,
    'Content-Type',
    args?.contentType || 'application/json; charset=utf-8',
  );

  const serverTiming = String(args?.serverTiming || '').trim();
  if (serverTiming) {
    headers.set('Server-Timing', serverTiming);
    headers.set('x-gateway-server-timing', serverTiming);
  }
  appendIfPresent(headers, 'x-gateway-retries', args?.gatewayRetries);

  for (const name of SAFE_UPSTREAM_DEBUG_HEADERS) {
    appendIfPresent(headers, name, args?.upstreamHeaders?.get(name));
  }

  for (const [name, value] of Object.entries(args?.extraHeaders || {})) {
    appendIfPresent(headers, name, value);
  }

  return headers;
}

function jsonProxyResponse(
  payload: unknown,
  args?: {
    status?: number;
    serverTiming?: string | null;
    gatewayRetries?: string | null;
    upstreamHeaders?: Headers;
    extraHeaders?: Record<string, string>;
  },
) {
  return new Response(JSON.stringify(payload), {
    status: args?.status || 200,
    headers: buildGatewayResponseHeaders({
      contentType: 'application/json; charset=utf-8',
      serverTiming: args?.serverTiming,
      gatewayRetries: args?.gatewayRetries,
      upstreamHeaders: args?.upstreamHeaders,
      extraHeaders: args?.extraHeaders,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const proxyHopCount = Math.max(0, Number(req.headers.get(GATEWAY_PROXY_HOP_HEADER) || 0) || 0);
    if (proxyHopCount > MAX_GATEWAY_PROXY_HOPS) {
      return jsonProxyResponse(
        {
          error: 'Gateway proxy loop detected',
          message: 'The gateway proxy re-entered itself and was stopped.',
        },
        { status: 508 },
      );
    }

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
      return jsonProxyResponse(
        {
          error: checkoutSafeRequest.error,
          message: checkoutSafeRequest.message,
          operation,
        },
        { status: checkoutSafeRequest.status || 400 },
      );
    }

    const { upstreamBase: resolvedShopUpstreamBase, recursionPrevented } = resolveShopUpstreamBase(
      req.url,
    );
    const upstreamBase = REVIEWS_OPERATIONS.has(operation)
      ? REVIEWS_UPSTREAM_BASE
      : useCheckoutSafeProxy
        ? CHECKOUT_UPSTREAM_BASE
        : resolvedShopUpstreamBase;
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
        recursionPrevented,
      });
    }

    const upstreamStartedAt = Date.now();
    const upstreamRes = await fetch(upstreamUrl, {
      method: upstreamMethod,
      headers: {
        'Content-Type': 'application/json',
        ...(checkoutToken
          ? { 'X-Checkout-Token': checkoutToken }
          : AGENT_API_KEY
            ? {
                'X-API-Key': AGENT_API_KEY,
                Authorization: `Bearer ${AGENT_API_KEY}`,
              }
            : {}),
        [GATEWAY_PROXY_HOP_HEADER]: String(proxyHopCount + 1),
      },
      ...(upstreamMethod === 'GET' ? {} : { body: JSON.stringify(upstreamBody || {}) }),
    });
    const upstreamMs = Math.max(0, Date.now() - upstreamStartedAt);
    const totalMs = Math.max(0, Date.now() - startedAt);
    const proxyMs = Math.max(0, totalMs - upstreamMs);
    const upstreamTiming = String(upstreamRes.headers.get('server-timing') || '').trim();
    const upstreamRetries = String(upstreamRes.headers.get('x-gateway-retries') || '').trim();
    const timingParts = [
      ...(upstreamTiming ? [upstreamTiming] : [`upstream;dur=${upstreamMs}`]),
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

    if (typeof responsePayload === 'string') {
      return new Response(responsePayload, {
        status: upstreamRes.status,
        headers: buildGatewayResponseHeaders({
          contentType: upstreamRes.headers.get('content-type') || 'text/plain; charset=utf-8',
          serverTiming: timingParts.join(', '),
          gatewayRetries: upstreamRetries,
          upstreamHeaders: upstreamRes.headers,
        }),
      });
    }

    return jsonProxyResponse(responsePayload, {
      status: upstreamRes.status,
      serverTiming: timingParts.join(', '),
      gatewayRetries: upstreamRetries,
      upstreamHeaders: upstreamRes.headers,
    });
  } catch (error) {
    console.error('Gateway proxy error:', error);
    return jsonProxyResponse(
      {
        error: 'Gateway proxy error',
        message: (error as Error).message ?? String(error),
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return jsonProxyResponse(
    {},
    {
      status: 200,
      extraHeaders: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-API-Key, X-Checkout-Token',
      },
    },
  );
}
