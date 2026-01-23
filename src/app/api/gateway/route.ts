import { NextRequest, NextResponse } from 'next/server';

const SHOP_UPSTREAM_BASE =
  process.env.NEXT_PUBLIC_UPSTREAM_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://pivota-agent-production.up.railway.app';

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

const AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  process.env.PIVOTA_API_KEY ||
  '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const checkoutToken = String(req.headers.get('x-checkout-token') || '').trim() || null;
    const operation = String(body?.operation || '').trim();
    const upstreamBase = REVIEWS_OPERATIONS.has(operation) ? REVIEWS_UPSTREAM_BASE : SHOP_UPSTREAM_BASE;
    if (process.env.NODE_ENV !== 'production') {
      // Log only safe details in dev (no tokens/headers/body payload).
      // eslint-disable-next-line no-console
      console.log('[gateway-proxy]', {
        upstream: upstreamBase,
        operation,
      });
    }

    const upstreamRes = await fetch(`${upstreamBase}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(checkoutToken
          ? { 'X-Checkout-Token': checkoutToken }
          : AGENT_API_KEY
            ? { 'X-Agent-API-Key': AGENT_API_KEY }
            : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await upstreamRes.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }

    return NextResponse.json(json, {
      status: upstreamRes.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Gateway proxy error:', error);
    return NextResponse.json(
      {
        error: 'Gateway proxy error',
        message: (error as Error).message ?? String(error),
      },
      { status: 500 },
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
          'Content-Type, X-Agent-API-Key, X-Checkout-Token',
      },
    },
  );
}
