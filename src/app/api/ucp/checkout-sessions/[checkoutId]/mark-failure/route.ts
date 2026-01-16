import { NextRequest, NextResponse } from 'next/server';

type RouteParams = { checkoutId: string };

function _isCrossSite(req: NextRequest): boolean {
  const site = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  return site === 'cross-site';
}

function _getUcpWebBaseUrl(): string | null {
  const base = (process.env.UCP_WEB_BASE_URL || '').trim();
  return base ? base.replace(/\/$/, '') : null;
}

function _getInternalCheckoutHookKey(): string | null {
  const purpose = (process.env.UCP_INTERNAL_CHECKOUT_HOOK_KEY || '').trim();
  if (purpose) return purpose;
  const shared = (process.env.UCP_INTERNAL_API_KEY || '').trim();
  return shared || null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<RouteParams> },
) {
  const { checkoutId: checkoutIdRaw } = await params;
  if (_isCrossSite(req)) {
    return NextResponse.json({ detail: 'Forbidden' }, { status: 403 });
  }

  const baseUrl = _getUcpWebBaseUrl();
  const internalKey = _getInternalCheckoutHookKey();
  if (!baseUrl) {
    return NextResponse.json(
      { detail: 'UCP_WEB_BASE_URL is not configured' },
      { status: 500 },
    );
  }
  if (!internalKey) {
    return NextResponse.json(
      {
        detail:
          'Internal key is not configured (set UCP_INTERNAL_CHECKOUT_HOOK_KEY or UCP_INTERNAL_API_KEY)',
      },
      { status: 500 },
    );
  }

  const checkoutId = encodeURIComponent(checkoutIdRaw || '');
  const upstreamUrl = `${baseUrl}/ucp/v1/checkout-sessions/${checkoutId}/_mark-failure`;

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
