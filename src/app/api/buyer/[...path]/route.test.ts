import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const params = (path: string[]) => ({ params: Promise.resolve({ path }) })

describe('GET /api/buyer/[...path] — guest /me fast-path', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 immediately for /me without the session cookie, NO upstream fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { GET } = await import('./route')

    const req = new NextRequest('https://agent.pivota.cc/api/buyer/me')
    const res = await GET(req, params(['me']))

    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body?.detail?.error?.code).toBe('UNAUTHENTICATED')
  })

  it('proxies /me to upstream when the session cookie IS present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ buyer: { id: 'b1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { GET } = await import('./route')

    const req = new NextRequest('https://agent.pivota.cc/api/buyer/me', {
      headers: { cookie: 'acc_access_token=tok_abc' },
    })
    const res = await GET(req, params(['me']))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/buyer/v1/me')
    expect(res.status).toBe(200)
  })

  it('does not short-circuit non-/me buyer paths', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const { GET } = await import('./route')

    const req = new NextRequest('https://agent.pivota.cc/api/buyer/orders')
    await GET(req, params(['orders']))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
