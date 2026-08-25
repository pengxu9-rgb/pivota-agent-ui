import { NextRequest, NextResponse } from 'next/server';

const IMAGE_PROXY_PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200" role="img" aria-label="Image unavailable">
  <rect width="1200" height="1200" fill="#f3f4f6"/>
  <path d="M302 838l182-218 126 151 124-97 164 164H302z" fill="#d1d5db"/>
  <circle cx="455" cy="422" r="70" fill="#d1d5db"/>
  <text x="600" y="965" text-anchor="middle" fill="#6b7280" font-family="Arial, sans-serif" font-size="44">Image unavailable</text>
</svg>`;

function isPrivateNetworkHost(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host.endsWith('.internal') || host.endsWith('.svc') || host.endsWith('.svc.cluster.local')) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  const m172 = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return true;
  }
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
  return false;
}

function parseWidthHint(input: string | null): number | null {
  if (!input) return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  const width = Math.floor(n);
  if (width < 64) return null;
  return Math.min(width, 2048);
}

function applyWidthHint(url: URL, width: number | null): URL {
  if (!width) return url;
  const out = new URL(url.toString());
  const host = out.hostname.toLowerCase();

  if (host.includes('cdn.shopify.com') || host.includes('shopifycdn.com')) {
    if (!out.searchParams.has('width')) {
      out.searchParams.set('width', String(width));
    }
    return out;
  }

  if (host.includes('wixstatic.com')) {
    if (!out.searchParams.has('w')) {
      out.searchParams.set('w', String(width));
    }
    return out;
  }

  if (host.includes('images.unsplash.com')) {
    if (!out.searchParams.has('w')) {
      out.searchParams.set('w', String(width));
    }
    if (!out.searchParams.has('auto')) {
      out.searchParams.set('auto', 'format');
    }
    return out;
  }

  if (
    (host === 'guerlain.com' || host.endsWith('.guerlain.com')) &&
    out.pathname.toLowerCase().includes('/dw/image/')
  ) {
    if (!out.searchParams.has('sw')) {
      out.searchParams.set('sw', String(width));
    }
    if (!out.searchParams.has('sh')) {
      out.searchParams.set('sh', String(width));
    }
    return out;
  }

  return out;
}

const IMAGE_CONTENT_TYPE_RE = /^image\//i;
const SNIFFABLE_GENERIC_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/**
 * Identify an image by magic bytes, for upstreams that send no content-type or a generic
 * octet-stream. Deliberately does NOT sniff SVG: SVG is text, so "looks like markup" would
 * let an arbitrary HTML/text body be re-labelled as an image and served from our origin.
 */
function sniffImageMime(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(bytes.slice(start, end)));

  if (bytes.length >= 8 && at(0) === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp';
  if (bytes.length >= 4 && (ascii(0, 4) === 'II*\u0000' || ascii(0, 4) === 'MM\u0000*')) return 'image/tiff';
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif';
    if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('mif1')) {
      return 'image/heic';
    }
  }
  return null;
}

/**
 * Decide what content-type to serve, or throw to fall through to the placeholder.
 *
 * The proxy used to forward `response.headers.get('content-type')` verbatim, so a URL that
 * resolved to a web page was served as `200 text/html` with the page's full markup. Anything
 * treating that 200 as an image rendered a broken image, and a same-origin HTML body is a
 * far worse thing to hand a browser than a missing picture.
 */
function resolveImageContentType(rawContentType: string, body: ArrayBuffer): string {
  const declared = rawContentType.split(';')[0].trim().toLowerCase();
  if (IMAGE_CONTENT_TYPE_RE.test(declared)) return rawContentType;
  if (SNIFFABLE_GENERIC_TYPES.has(declared)) {
    const sniffed = sniffImageMime(new Uint8Array(body.slice(0, 16)));
    if (sniffed) return sniffed;
  }
  throw new Error(`Upstream is not an image (content-type: ${declared || 'none'})`);
}

/**
 * Neutralize the proxy's own origin as an execution surface. `nosniff` stops a browser
 * second-guessing the type we just validated, and the CSP means a remote SVG — the one
 * image format that is also a scriptable document — cannot run script or fetch anything
 * if it is opened directly rather than through an <img> tag.
 */
const IMAGE_PROXY_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const imageUrl = searchParams.get('url');
  const widthHint = parseWidthHint(searchParams.get('w') || searchParams.get('width'));

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid url protocol' }, { status: 400 });
  }
  if (parsed.username || parsed.password) {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 });
  }
  if (isPrivateNetworkHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Blocked url host' }, { status: 400 });
  }

  try {
    const fetchUrl = applyWidthHint(parsed, widthHint).toString();
    const upstreamReferer = `${parsed.origin}/`;
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': upstreamReferer,
        'Origin': parsed.origin,
      },
      cache: 'force-cache',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const contentType = resolveImageContentType(
      response.headers.get('content-type') || '',
      imageBuffer,
    );

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...IMAGE_PROXY_SECURITY_HEADERS,
        ...(widthHint ? { 'X-Image-Proxy-Width-Hint': String(widthHint) } : {}),
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new NextResponse(IMAGE_PROXY_PLACEHOLDER_SVG, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        ...IMAGE_PROXY_SECURITY_HEADERS,
        'X-Image-Proxy-Fallback': 'inline-placeholder',
      },
    });
  }
}
