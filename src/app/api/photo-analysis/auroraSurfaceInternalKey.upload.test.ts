// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The upload route, driven for real.
 *
 * The sibling test file asserts this route's wiring with a SOURCE-STRING check, and review proved
 * that is not good enough: deleting `...buildAuthHeaders(),` from the fetch call leaves both greped
 * strings in place, so the route sends NO auth headers at all — not the internal key, not the
 * pre-existing agent key — while the whole suite stays green. That is exactly the failure the other
 * file's comment claims to prevent, and a source assertion cannot establish a behavioural property.
 *
 * It lives in its own file because of the directive at the top. `new Request(…, {body: FormData})
 * .formData()` never resolves under the repo's default jsdom environment — that is a property of the
 * environment, not of the route, and it is why the first attempt reached for a source assertion
 * instead. Under the node environment it resolves immediately.
 */

const ORIGINAL_ENV = { ...process.env };

function stubFetch() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) } as unknown as Response;
  }));
  return calls;
}

function uploadRequest() {
  const form = new FormData();
  form.append('file', new Blob(['imagebytes'], { type: 'image/jpeg' }), 'a.jpg');
  return new Request('http://localhost/api/photo-analysis/upload', { method: 'POST', body: form });
}

describe('POST /api/photo-analysis/upload actually sends its auth headers', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const k of ['AGENT_API_KEY', 'SHOP_GATEWAY_AGENT_API_KEY', 'PIVOTA_AGENT_API_KEY',
                     'PIVOTA_API_KEY', 'NEXT_PUBLIC_AGENT_API_KEY', 'AURORA_SURFACE_INTERNAL_KEY']) {
      delete process.env[k];
    }
  });
  afterEach(() => { vi.unstubAllGlobals(); process.env = { ...ORIGINAL_ENV }; });

  it('sends X-Internal-Key on the real outbound request', async () => {
    process.env.AURORA_SURFACE_INTERNAL_KEY = 'upload-surface-key';
    const calls = stubFetch();
    const { POST } = await import('./upload/route');
    await POST(uploadRequest() as unknown as Parameters<typeof POST>[0]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/photos/upload');
    expect((calls[0].init.headers as Record<string, string>)['X-Internal-Key']).toBe('upload-surface-key');
  });

  it('still forwards the agent key alongside it', async () => {
    // Guards the other direction: dropping the whole spread would take the pre-existing agent
    // credential with it, which the source assertion also could not see.
    process.env.AURORA_SURFACE_INTERNAL_KEY = 'upload-surface-key';
    process.env.AGENT_API_KEY = 'agent-key-xyz';
    const calls = stubFetch();
    const { POST } = await import('./upload/route');
    await POST(uploadRequest() as unknown as Parameters<typeof POST>[0]);

    const h = calls[0].init.headers as Record<string, string>;
    expect(h['X-Internal-Key']).toBe('upload-surface-key');
    expect(h['X-Agent-API-Key']).toBe('agent-key-xyz');
  });

  it('does not fall back to the AGENT key for the internal key', async () => {
    // Adding AGENT_API_KEY to the internal-key resolver chain passes every other test while sending
    // the agent secret as X-Internal-Key. At the gateway that logs `bad_key` rather than
    // `missing_key`, so would_refuse never reaches 0 — corrupting the measurement that gates the
    // flip. Two credentials, two sources.
    process.env.AGENT_API_KEY = 'agent-key-xyz';
    const calls = stubFetch();
    const { POST } = await import('./upload/route');
    await POST(uploadRequest() as unknown as Parameters<typeof POST>[0]);

    const h = calls[0].init.headers as Record<string, string>;
    expect(h['X-Internal-Key']).toBeUndefined();
    expect(JSON.stringify(h)).not.toContain('agent-key-xyz'.length > 0 ? '"X-Internal-Key":"agent-key-xyz"' : '');
  });
});
