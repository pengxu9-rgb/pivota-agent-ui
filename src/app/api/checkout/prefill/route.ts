import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PIVOTA_BACKEND_BASE =
  process.env.PIVOTA_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
  'https://web-production-fedb.up.railway.app';

const CHECKOUT_UI_KEY =
  process.env.CHECKOUT_UI_KEY ||
  process.env.PIVOTA_CHECKOUT_UI_KEY ||
  '';

function base64url(input: Buffer | string): string {
  const b64 = Buffer.from(input).toString('base64');
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function mintCheckoutUiAuth(args: { aud: string; checkoutToken: string; ttlSeconds?: number }): string {
  const ttlSeconds = Math.max(10, Number(args.ttlSeconds || 60));
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    typ: 'checkout_ui_auth',
    aud: args.aud,
    iat: now,
    exp: now + ttlSeconds,
    cth: sha256Hex(args.checkoutToken),
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const sig = base64url(crypto.createHmac('sha256', CHECKOUT_UI_KEY).update(payloadB64).digest());
  return `v1.${payloadB64}.${sig}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = String(req.headers.get('x-checkout-token') || '').trim();
    if (!token) {
      return NextResponse.json({ prefill: null }, { status: 200 });
    }

    if (!CHECKOUT_UI_KEY) {
      return NextResponse.json({ prefill: null, error: 'CHECKOUT_UI_KEY_MISSING' }, { status: 500 });
    }

    const cookie = req.headers.get('cookie') || '';
    const upstream = await fetch(`${PIVOTA_BACKEND_BASE}/agent/v1/checkout/prefill`, {
      method: 'GET',
      headers: {
        'X-Checkout-Token': token,
        'X-Checkout-UI-Auth': mintCheckoutUiAuth({ aud: 'prefill', checkoutToken: token }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });

    const text = await upstream.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return NextResponse.json(json ?? { prefill: null }, { status: upstream.status });
  } catch (err: any) {
    return NextResponse.json(
      { prefill: null, error: 'PREFILL_PROXY_FAILED', message: err?.message || String(err) },
      { status: 500 },
    );
  }
}
