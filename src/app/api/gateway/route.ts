import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const UPSTREAM_BASE =
  process.env.NEXT_PUBLIC_UPSTREAM_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://pivota-agent-production.up.railway.app';

const AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  process.env.PIVOTA_API_KEY ||
  '';

type CheckoutTokenPayload = {
  v?: number;
  src?: string;
  iat?: number;
  exp?: number;
  buyer_ref?: string;
  job_id?: string;
  market?: string;
  merchant_id?: string;
};

function safeTimingEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  try {
    return timingSafeEqual(aa, bb);
  } catch {
    return false;
  }
}

function verifyCheckoutToken(token: string | null): CheckoutTokenPayload | null {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const secret = String(process.env.CHECKOUT_TOKEN_SECRET || '').trim();
  if (!secret) return null;

  const [encoded, sig] = raw.split('.', 2);
  if (!encoded || !sig) return null;

  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!safeTimingEqual(sig, expected)) return null;

  try {
    const payloadRaw = Buffer.from(encoded, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw) as CheckoutTokenPayload;
    const exp = Number(payload?.exp || 0);
    if (exp > 0 && Math.floor(Date.now() / 1000) > exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function resolveAgentApiKey(req: NextRequest) {
  const token = req.headers.get('x-checkout-token');
  const payload = verifyCheckoutToken(token);
  const src = String(payload?.src || '').trim().toLowerCase();

  if (src === 'look_replicator' || src === 'lookreplicator') {
    const key =
      process.env.AGENT_API_KEY_LOOK_REPLICATOR ||
      process.env.LOOK_REPLICATOR_AGENT_API_KEY ||
      '';
    if (key) return key;
  }

  return AGENT_API_KEY;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const agentApiKey = resolveAgentApiKey(req);

    const upstreamRes = await fetch(`${UPSTREAM_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agentApiKey ? { 'X-Agent-API-Key': agentApiKey } : {}),
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
