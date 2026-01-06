import { NextRequest, NextResponse } from 'next/server';

const PIVOTA_BACKEND_BASE =
  process.env.PIVOTA_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
  'https://web-production-fedb.up.railway.app';

export async function GET(req: NextRequest) {
  try {
    const token = String(req.headers.get('x-checkout-token') || '').trim();
    if (!token) {
      return NextResponse.json({ prefill: null }, { status: 200 });
    }

    const upstream = await fetch(`${PIVOTA_BACKEND_BASE}/agent/v1/checkout/prefill`, {
      method: 'GET',
      headers: {
        'X-Checkout-Token': token,
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

