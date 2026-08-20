import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * These two routes proxy the browser to the gateway's Aurora surface. PIVOTA-Agent #2038 added a
 * caller-auth guard there, currently in `observe` mode; when it flips to `enforce`, any caller that
 * is not sending `X-Internal-Key` gets a 401. Photo analysis is one of the live consumers — it shows
 * up in the gateway's own rollup as `/v1/analysis/skin|missing_key`, which is exactly what this
 * change clears.
 *
 * The property worth pinning is not "the header exists" but that it is sent INDEPENDENTLY of the
 * agent key. buildAuthHeaders() used to early-return `{}` when no agent key was configured, so
 * folding the internal key in after that return would have left the route silently unauthenticated
 * in any environment without an agent key — and it would have failed only at the flip, in
 * production, months later.
 */

const ORIGINAL_ENV = { ...process.env };

function stubFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fake = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fake);
  return calls;
}

function post(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/photo-analysis/skin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof import('./skin/route').POST>[0];
}

function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers || {}) as Record<string, string>;
}

describe('photo-analysis routes send the Aurora surface internal key', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AGENT_API_KEY;
    delete process.env.SHOP_GATEWAY_AGENT_API_KEY;
    delete process.env.PIVOTA_AGENT_API_KEY;
    delete process.env.PIVOTA_API_KEY;
    delete process.env.NEXT_PUBLIC_AGENT_API_KEY;
    delete process.env.AURORA_SURFACE_INTERNAL_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it('sends X-Internal-Key even when NO agent key is configured', async () => {
    // The independence property. buildAuthHeaders() early-returned {} without an agent key, so a
    // naive placement would drop the internal key in exactly the environments that lack one.
    process.env.AURORA_SURFACE_INTERNAL_KEY = 'surface-key-abc123';
    const calls = stubFetch();
    const { POST } = await import('./skin/route');
    await POST(post({ image_url: 'https://example.test/a.jpg' }));

    expect(calls).toHaveLength(1);
    expect(headersOf(calls[0].init)['X-Internal-Key']).toBe('surface-key-abc123');
    expect(headersOf(calls[0].init)['X-Agent-API-Key']).toBeUndefined();
  });

  it('sends both credentials when both are configured', async () => {
    process.env.AURORA_SURFACE_INTERNAL_KEY = 'surface-key-abc123';
    process.env.AGENT_API_KEY = 'agent-key-xyz';
    const calls = stubFetch();
    const { POST } = await import('./skin/route');
    await POST(post({ image_url: 'https://example.test/a.jpg' }));

    const h = headersOf(calls[0].init);
    expect(h['X-Internal-Key']).toBe('surface-key-abc123');
    expect(h['X-Agent-API-Key']).toBe('agent-key-xyz');
  });

  it('BOTH routes carry the wiring — they hold independent copies of the helper', () => {
    // A source check, and it is NOT sufficient on its own: review showed that deleting
    // `...buildAuthHeaders(),` from upload's fetch leaves every string below intact while the route
    // sends no auth headers at all. The behavioural cover for that lives in
    // auroraSurfaceInternalKey.upload.test.ts, which drives the real route under the node
    // environment. (The first version of this file claimed formData() "does not resolve under this
    // test environment" — that is true of the repo's default jsdom env only, not of the route.)
    //
    // This test still earns its place for the narrower question it can actually answer: that neither
    // COPY of the helper has drifted, including the NEXT_PUBLIC prohibition in both.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    for (const f of ['skin', 'upload']) {
      const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/photo-analysis', f, 'route.ts'), 'utf8');
      expect(src, `${f}/route.ts`).toContain('resolveAuroraSurfaceInternalKey');
      expect(src, `${f}/route.ts`).toContain("headers['X-Internal-Key'] = internalKey");
      // and the key must not be read from a client-inlined name in either copy
      const resolver = src.slice(
        src.indexOf('function resolveAuroraSurfaceInternalKey'),
        src.indexOf('function buildAuthHeaders'),
      );
      expect(resolver, `${f}/route.ts resolver`).not.toContain('NEXT_PUBLIC');
    }
  });

  it('omits the header entirely when unset, rather than sending an empty one', async () => {
    // An empty X-Internal-Key would read as `bad_key` at the gateway rather than `missing_key`,
    // which is a worse signal during the observe-mode measurement.
    const calls = stubFetch();
    const { POST } = await import('./skin/route');
    await POST(post({ image_url: 'https://example.test/a.jpg' }));
    expect('X-Internal-Key' in headersOf(calls[0].init)).toBe(false);
  });

  it('never picks the key up from a NEXT_PUBLIC_ name', async () => {
    // Next inlines NEXT_PUBLIC_* into the client bundle, so honouring one here would publish the
    // shared secret to every visitor. The agent-key resolver above DOES accept a NEXT_PUBLIC name,
    // which is exactly why this needs asserting rather than assuming. Behavioural, not a source grep:
    // a source grep passes as long as the literal string is absent, including if the resolver is
    // deleted entirely.
    process.env.NEXT_PUBLIC_AURORA_SURFACE_INTERNAL_KEY = 'leaked-to-the-browser';
    try {
      const calls = stubFetch();
      const { POST } = await import('./skin/route');
      await POST(post({ image_url: 'https://example.test/a.jpg' }));
      const h = headersOf(calls[0].init);
      expect(h['X-Internal-Key']).toBeUndefined();
      expect(JSON.stringify(h)).not.toContain('leaked-to-the-browser');
    } finally {
      delete process.env.NEXT_PUBLIC_AURORA_SURFACE_INTERNAL_KEY;
    }
  });
});
