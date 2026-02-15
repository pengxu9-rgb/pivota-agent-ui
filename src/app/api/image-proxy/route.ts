import { NextRequest, NextResponse } from 'next/server';

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

  return out;
}

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
    // Fetch the image with proper headers to avoid CORS issues
    const response = await fetch(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.amazon.com/',
      },
      cache: 'force-cache',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const imageBuffer = await response.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(widthHint ? { 'X-Image-Proxy-Width-Hint': String(widthHint) } : {}),
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    // Return a placeholder image on error
    return NextResponse.redirect(new URL('/placeholder.svg', request.url));
  }
}
