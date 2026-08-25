import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function req(target: string, extra = '') {
  return new NextRequest(
    `https://agent.pivota.cc/api/image-proxy?url=${encodeURIComponent(target)}${extra}`,
  );
}

function upstream(body: BodyInit, contentType: string | null, ok = true) {
  return {
    ok,
    status: ok ? 200 : 502,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () =>
      typeof body === 'string'
        ? new TextEncoder().encode(body).buffer
        : (body as Uint8Array).buffer,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('image proxy content-type validation', () => {
  it('serves the placeholder instead of an HTML page body', async () => {
    // The live regression: a product page URL sat in the backend's images[] array and the
    // proxy answered 200 text/html with 411 KB of markup, which every consumer treated as
    // a valid image.
    fetchMock.mockResolvedValue(
      upstream('<!doctype html><html><body>product page</body></html>', 'text/html;charset=UTF-8'),
    );

    const res = await GET(
      req('https://theordinary.com/en-us/aloe-2-nag-2-solution-blemish-serum-100618.html'),
    );

    expect(res.headers.get('content-type')).toBe('image/svg+xml; charset=utf-8');
    expect(res.headers.get('x-image-proxy-fallback')).toBe('inline-placeholder');
    expect(await res.text()).not.toContain('product page');
  });

  it.each([
    ['application/json', '{"error":"not found"}'],
    ['text/plain', 'Not Found'],
    ['application/xml', '<error/>'],
    ['video/mp4', 'binary'],
  ])('rejects a non-image upstream declaring %s', async (type, body) => {
    fetchMock.mockResolvedValue(upstream(body, type));
    const res = await GET(req('https://merchant.test/x'));
    expect(res.headers.get('x-image-proxy-fallback')).toBe('inline-placeholder');
  });

  it('passes a genuine image through untouched', async () => {
    fetchMock.mockResolvedValue(upstream(PNG, 'image/png'));
    const res = await GET(req('https://media.ultainc.com/i/ulta/2609862'));

    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-image-proxy-fallback')).toBeNull();
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())[0]).toBe(0x89);
  });

  it('sniffs magic bytes when the upstream sends no usable content-type', async () => {
    for (const declared of [null, 'application/octet-stream']) {
      fetchMock.mockResolvedValue(upstream(PNG, declared));
      const res = await GET(req('https://merchant.test/image-without-a-type'));
      expect(res.headers.get('content-type')).toBe('image/png');
    }
  });

  it('does not rescue a text body that merely looks like markup', async () => {
    // Sniffing SVG would let any HTML/text body be relabelled as an image on our own origin.
    fetchMock.mockResolvedValue(upstream('<svg onload="alert(1)"></svg>', 'application/octet-stream'));
    const res = await GET(req('https://merchant.test/x'));
    expect(res.headers.get('x-image-proxy-fallback')).toBe('inline-placeholder');
  });

  it('stamps nosniff and a script-blocking CSP on both the image and the placeholder', async () => {
    fetchMock.mockResolvedValue(upstream(PNG, 'image/png'));
    const ok = await GET(req('https://merchant.test/a.png'));

    fetchMock.mockResolvedValue(upstream('<html/>', 'text/html'));
    const fallback = await GET(req('https://merchant.test/a.html'));

    for (const res of [ok, fallback]) {
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
      expect(res.headers.get('content-security-policy')).toContain('sandbox');
    }
  });

  it('still rejects private-network hosts before fetching', async () => {
    for (const host of ['http://127.0.0.1/x', 'http://169.254.169.254/latest/meta-data']) {
      const res = await GET(req(host));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
