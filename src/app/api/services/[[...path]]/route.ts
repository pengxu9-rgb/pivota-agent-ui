import { NextRequest, NextResponse } from 'next/server';
import { warnIfHardcodedFallbackUsed } from '@/lib/upstreamFallback';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SERVICES_UPSTREAM = 'https://pivota-agent-production.up.railway.app';

if (!process.env.SHOP_UPSTREAM_API_URL && !process.env.SERVICES_UPSTREAM_BASE) {
  warnIfHardcodedFallbackUsed({
    routeLabel: 'api/services',
    envVarsTried: ['SHOP_UPSTREAM_API_URL', 'SERVICES_UPSTREAM_BASE'],
    fallback: DEFAULT_SERVICES_UPSTREAM,
  });
}

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function getUpstreamBase(): string {
  const explicit =
    process.env.SERVICES_UPSTREAM_BASE ||
    process.env.SHOP_UPSTREAM_API_URL ||
    DEFAULT_SERVICES_UPSTREAM;
  return String(explicit || DEFAULT_SERVICES_UPSTREAM)
    .trim()
    .replace(/\/agent\/shop\/v1\/invoke$/, '')
    .replace(/\/$/, '');
}

async function proxy(req: NextRequest, args: { upstreamBase: string; path: string[] }) {
  const upstreamPath = args.path.map((p) => encodeURIComponent(p)).join('/');
  const upstreamUrl = `${args.upstreamBase}/api/services${upstreamPath ? `/${upstreamPath}` : ''}${req.nextUrl.search}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host') return;
    if (lower === 'connection') return;
    if (lower === 'content-length') return;
    if (lower === 'accept-encoding') return;
    headers[key] = value;
  });
  headers['accept-encoding'] = 'identity';

  const body =
    req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer());

  const upstreamRes = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  });

  const resHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding') return;
    if (lower === 'content-length') return;
    if (lower === 'transfer-encoding') return;
    if (lower === 'connection') return;
    resHeaders.set(key, value);
  });

  const data = await upstreamRes.arrayBuffer();
  return new NextResponse(data, {
    status: upstreamRes.status,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  return proxy(req, { upstreamBase: getUpstreamBase(), path: path || [] });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  return proxy(req, { upstreamBase: getUpstreamBase(), path: path || [] });
}
