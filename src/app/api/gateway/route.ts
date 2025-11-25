import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstreamRes = await fetch(`${UPSTREAM_BASE}/agent/shop/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AGENT_API_KEY ? { 'X-Agent-API-Key': AGENT_API_KEY } : {}),
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
        'Access-Control-Allow-Headers': 'Content-Type, X-Agent-API-Key',
      },
    },
  );
}

