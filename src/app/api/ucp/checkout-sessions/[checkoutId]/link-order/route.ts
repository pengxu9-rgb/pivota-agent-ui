import { NextRequest, NextResponse } from 'next/server';

function _isCrossSite(req: NextRequest): boolean {
  const site = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  return site === 'cross-site';
}

function _getUcpWebBaseUrl(): string | null {
  const base = (process.env.UCP_WEB_BASE_URL || '').trim();
  return base ? base.replace(/\/$/, '') : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { checkoutId: string } },
) {
  if (_isCrossSite(req)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }

  const baseUrl = _getUcpWebBaseUrl();
  const internalKey = (process.env.UCP_INTERNAL_CHECKOUT_HOOK_KEY || '').trim();
  if (!baseUrl) {
    return NextResponse.json(
      { detail: 'UCP_WEB_BASE_URL is not configured' },
      { status: 500 },
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      { detail: 'UCP_INTERNAL_CHECKOUT_HOOK_KEY is not configured' },
      { status: 500 },
    );
  }

  const checkoutId = encodeURIComponent(params.checkoutId || '');
  const upstreamUrl = `${baseUrl}/ucp/v1/checkout-sessions/${checkoutId}/_link-order`;

  const bodyText = await req.text();
  const upstreamRes = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      'content-type': req.headers.get('content-type') || 'application/json',
      'x-pivota-internal-key': internalKey,
    },
    body: bodyText,
    cache: 'no-store',
  });

  const text = await upstreamRes.text();
  return new NextResponse(text, {
    status: upstreamRes.status,
    headers: {
      'content-type':
        upstreamRes.headers.get('content-type') || 'application/json',
    },
  });
}

