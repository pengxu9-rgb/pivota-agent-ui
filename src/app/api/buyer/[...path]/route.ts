import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_BUYER_BASE = 'https://web-production-fedb.up.railway.app/buyer/v1'

function getUpstreamBuyerBase(): string {
  const explicit = process.env.BUYER_UPSTREAM_BASE || process.env.NEXT_PUBLIC_BUYER_BASE || DEFAULT_BUYER_BASE
  return String(explicit || DEFAULT_BUYER_BASE)
    .trim()
    .replace(/\/$/, '')
}

const CHECKOUT_UI_KEY = process.env.CHECKOUT_UI_KEY || process.env.PIVOTA_CHECKOUT_UI_KEY || ''

function base64url(input: Buffer | string): string {
  const b64 = Buffer.from(input).toString('base64')
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(String(input)).digest('hex')
}

function mintCheckoutUiAuth(args: { aud: string; checkoutToken: string; ttlSeconds?: number }): string {
  const ttlSeconds = Math.max(10, Number(args.ttlSeconds || 120))
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    v: 1,
    typ: 'checkout_ui_auth',
    aud: args.aud,
    iat: now,
    exp: now + ttlSeconds,
    cth: sha256Hex(args.checkoutToken),
  }
  const payloadB64 = base64url(JSON.stringify(payload))
  const sig = base64url(crypto.createHmac('sha256', CHECKOUT_UI_KEY).update(payloadB64).digest())
  return `v1.${payloadB64}.${sig}`
}

type RouteContext = {
  params: Promise<{ path: string[] }>
}

function splitSetCookieHeader(value: string): string[] {
  const v = String(value || '').trim()
  if (!v) return []
  return v
    .split(/,(?=[^;]+?=)/g)
    .map((part) => part.trim())
    .filter(Boolean)
}

async function proxy(req: NextRequest, args: { upstreamBase: string; path: string[] }) {
  const upstreamPath = args.path.map((p) => encodeURIComponent(p)).join('/')
  const upstreamUrl = `${args.upstreamBase}/${upstreamPath}${req.nextUrl.search}`

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'host') return
    if (lower === 'connection') return
    if (lower === 'content-length') return
    if (lower === 'accept-encoding') return
    headers[key] = value
  })
  headers['accept-encoding'] = 'identity'

  const firstSeg = String(args.path?.[0] || '').trim()
  if (firstSeg === 'save_from_checkout') {
    const checkoutToken = String(headers['x-checkout-token'] || '').trim()
    if (checkoutToken && CHECKOUT_UI_KEY) {
      headers['X-Checkout-UI-Auth'] = mintCheckoutUiAuth({ aud: 'buyer_save', checkoutToken })
    }
  }

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.from(await req.arrayBuffer())

  const upstreamRes = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: 'manual',
  })

  const resHeaders = new Headers()
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie') return
    if (lower === 'content-encoding') return
    if (lower === 'content-length') return
    if (lower === 'transfer-encoding') return
    if (lower === 'connection') return
    resHeaders.set(key, value)
  })

  const data = await upstreamRes.arrayBuffer()
  const res = new NextResponse(data, {
    status: upstreamRes.status,
    headers: resHeaders,
  })

  const headersWithGetSetCookie = upstreamRes.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies: string[] =
    typeof headersWithGetSetCookie.getSetCookie === 'function'
      ? headersWithGetSetCookie.getSetCookie()
      : splitSetCookieHeader(upstreamRes.headers.get('set-cookie') || '')

  setCookies.forEach((cookie) => {
    res.headers.append('set-cookie', cookie)
  })

  return res
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxy(req, { upstreamBase: getUpstreamBuyerBase(), path })
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxy(req, { upstreamBase: getUpstreamBuyerBase(), path })
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxy(req, { upstreamBase: getUpstreamBuyerBase(), path })
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxy(req, { upstreamBase: getUpstreamBuyerBase(), path })
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { path } = await params
  return proxy(req, { upstreamBase: getUpstreamBuyerBase(), path })
}
