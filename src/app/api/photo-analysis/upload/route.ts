import { NextRequest, NextResponse } from 'next/server';
import { warnIfHardcodedFallbackUsed } from '@/lib/upstreamFallback';

export const runtime = 'nodejs';
export const preferredRegion = 'home';

const DEFAULT_AGENT_BASE = 'https://gateway.pivota.cc';
const _PHOTO_UPLOAD_AGENT_ENVS = [
  'PIVOTA_AGENT_BASE_URL',
  'SHOP_UPSTREAM_API_URL',
  'SHOP_GATEWAY_UPSTREAM_BASE_URL',
  'SHOP_GATEWAY_AGENT_BASE_URL',
  'NEXT_PUBLIC_API_URL',
];
if (!_PHOTO_UPLOAD_AGENT_ENVS.some((name) => process.env[name])) {
  warnIfHardcodedFallbackUsed({
    routeLabel: 'api/photo-analysis/upload',
    envVarsTried: _PHOTO_UPLOAD_AGENT_ENVS,
    fallback: DEFAULT_AGENT_BASE,
  });
}

function sanitizeEnvValue(raw: string | undefined): string {
  return String(raw || '')
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .replace(/\\r/g, '')
    .replace(/\\n/g, '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = sanitizeEnvValue(value);
    if (normalized) return normalized;
  }
  return '';
}

function resolveAgentBaseUrl(): string {
  const raw = firstNonEmpty(
    process.env.PIVOTA_AGENT_BASE_URL,
    process.env.SHOP_UPSTREAM_API_URL,
    process.env.SHOP_GATEWAY_UPSTREAM_BASE_URL,
    process.env.SHOP_GATEWAY_AGENT_BASE_URL,
    process.env.NEXT_PUBLIC_API_URL,
  );
  const value = raw || DEFAULT_AGENT_BASE;
  if (value.startsWith('/')) return DEFAULT_AGENT_BASE;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme
    .replace(/\/api\/gateway\/?$/i, '')
    .replace(/\/agent\/shop\/v1\/invoke\/?$/i, '')
    .replace(/\/+$/, '');
}

function resolveAgentApiKey(): string {
  return firstNonEmpty(
    process.env.AGENT_API_KEY,
    process.env.SHOP_GATEWAY_AGENT_API_KEY,
    process.env.PIVOTA_AGENT_API_KEY,
    process.env.PIVOTA_API_KEY,
    process.env.NEXT_PUBLIC_AGENT_API_KEY,
  );
}

function resolveAuroraSurfaceInternalKey(): string {
  return firstNonEmpty(
    process.env.AURORA_SURFACE_INTERNAL_KEY,
    process.env.PIVOTA_AURORA_SURFACE_INTERNAL_KEY,
  );
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  // X-Internal-Key authenticates THIS PROXY HOP to the gateway's Aurora-surface guard
  // (PIVOTA-Agent #2038). It is deliberately independent of the agent key below: it identifies the
  // caller, not the end user, and must be sent even when no agent key is configured — otherwise
  // this route starts 401ing the moment AURORA_SURFACE_AUTH_MODE is flipped to `enforce`.
  //
  // Safe to ship ahead of that flip: the gateway is in `observe` mode, where the header is recorded
  // and ignored. That ordering is the point — enforcement must never land before its consumers.
  //
  // It is read server-side only. This file is a Next route handler (`runtime = 'nodejs'`), so the
  // browser never sees the value; do NOT move it to a NEXT_PUBLIC_ name, which would inline it into
  // the client bundle and stop it being a secret at all.
  const internalKey = resolveAuroraSurfaceInternalKey();
  if (internalKey) headers['X-Internal-Key'] = internalKey;

  const key = resolveAgentApiKey();
  if (key) {
    headers['X-Agent-API-Key'] = key;
    headers['X-API-Key'] = key;
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

function forwardLang(raw: string | null): string {
  return String(raw || '').trim().toUpperCase() === 'CN' ? 'CN' : 'EN';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const upstream = await fetch(`${resolveAgentBaseUrl()}/v1/photos/upload`, {
      method: 'POST',
      headers: {
        'X-Lang': forwardLang(req.headers.get('x-lang')),
        ...(req.headers.get('x-aurora-uid')
          ? { 'X-Aurora-UID': String(req.headers.get('x-aurora-uid')) }
          : {}),
        ...buildAuthHeaders(),
      },
      body: form,
    });

    const text = await upstream.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = text;
    }

    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        error: 'PHOTO_UPLOAD_PROXY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
