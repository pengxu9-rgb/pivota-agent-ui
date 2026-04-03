import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_BASE =
  process.env.PIVOTA_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
  'https://web-production-fedb.up.railway.app';

const AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  process.env.PIVOTA_API_KEY ||
  '';

const LEGACY_ROUTE_HEADER = 'x-pivota-legacy-route';

function normalizeIntentItems(rawItems: any[]): any[] {
  return rawItems
    .map((raw) => {
      const productId = String(raw?.product_id || raw?.productId || '').trim();
      const merchantId = String(raw?.merchant_id || raw?.merchantId || '').trim();
      const variantId = String(raw?.variant_id || raw?.variantId || '').trim();
      const sku = String(raw?.sku || '').trim();
      const quantityRaw = Number(raw?.quantity);
      const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
      if (!productId || !merchantId) return null;
      return {
        product_id: productId,
        merchant_id: merchantId,
        ...(variantId ? { variant_id: variantId } : {}),
        ...(sku ? { sku } : {}),
        quantity,
      };
    })
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    if (!AGENT_API_KEY) {
      return NextResponse.json(
        {
          error: 'CHECKOUT_SESSION_KEY_MISSING',
          message: 'Server checkout API key is not configured',
        },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const items = normalizeIntentItems(Array.isArray(body?.items) ? body.items : []);
    if (!items.length) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'items[] with merchant_id/product_id is required',
        },
        { status: 400 },
      );
    }

    const returnUrl = String(body?.return_url || body?.returnUrl || '').trim();
    const source = String(body?.source || '').trim() || 'shopping-agent-ui';
    const market = String(body?.market || '').trim().toUpperCase();
    const locale = String(body?.locale || '').trim();
    const buyerRef = String(body?.buyer_ref || body?.buyerRef || '').trim();
    const jobId = String(body?.job_id || body?.jobId || '').trim();
    const itemCount = items.length;

    console.warn('[shopping][legacy-checkout-session-hit]', {
      route: '/api/checkout/session',
      item_count: itemCount,
      source,
      has_return_url: Boolean(returnUrl),
      market: market || null,
      locale: locale || null,
      has_buyer_ref: Boolean(buyerRef),
      has_job_id: Boolean(jobId),
      referer: req.headers.get('referer') || null,
      origin: req.headers.get('origin') || null,
      user_agent: req.headers.get('user-agent') || null,
    });

    const upstream = await fetch(`${BACKEND_BASE}/agent/v1/checkout/intents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': AGENT_API_KEY,
        Authorization: `Bearer ${AGENT_API_KEY}`,
      },
      body: JSON.stringify({
        items,
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(source ? { source } : {}),
        ...(market ? { market } : {}),
        ...(locale ? { locale } : {}),
        ...(buyerRef ? { buyer_ref: buyerRef } : {}),
        ...(jobId ? { job_id: jobId } : {}),
      }),
    });

    const upstreamText = await upstream.text();
    let upstreamBody: any = {};
    try {
      upstreamBody = upstreamText ? JSON.parse(upstreamText) : {};
    } catch {
      upstreamBody = { error: 'INVALID_UPSTREAM_RESPONSE', detail: upstreamText };
    }

    const totalMs = Math.max(0, Date.now() - startedAt);
    return NextResponse.json(upstreamBody, {
      status: upstream.status,
      headers: {
        'Server-Timing': `gateway;dur=${totalMs}`,
        [LEGACY_ROUTE_HEADER]: 'checkout-session',
      },
    });
  } catch (error) {
    const totalMs = Math.max(0, Date.now() - startedAt);
    return NextResponse.json(
      {
        error: 'CHECKOUT_SESSION_PROXY_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          'Server-Timing': `gateway;dur=${totalMs}`,
          [LEGACY_ROUTE_HEADER]: 'checkout-session',
        },
      },
    );
  }
}
