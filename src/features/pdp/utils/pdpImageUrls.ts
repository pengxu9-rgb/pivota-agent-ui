const IMAGE_PROXY_PATH = '/api/image-proxy';
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;
const TOM_FORD_SHOPIFY_FILES_BASE = 'https://cdn.shopify.com/s/files/1/0761/9690/5173/files/';
const SHOPIFY_FILE_HASH_SUFFIX_RE =
  /^(.*?_[0-9]+)_(?:[0-9a-f]{8,}(?:-[0-9a-f]{4,}){2,}|[0-9a-f-]{16,})\.(avif|gif|jpe?g|png|webp)$/i;
const IMAGE_DEDUPE_IGNORED_QUERY_KEYS = new Set([
  'w',
  'width',
  'h',
  'height',
  'q',
  'quality',
  'dpr',
  'auto',
  'format',
  'fm',
  'fit',
]);
const KNOWN_SDCND_FILENAME_ALIASES: Record<string, string> = {
  'tf_sku_t2ss02_3000x3000_0.png': 'tf_sku_T2SS02_3000x3000_1.png',
};
const TOM_FORD_ASSET_FILENAME_RE = /^tfb?_sku_/i;
const TOM_FORD_SLOT_DEDUPE_RE =
  /^(tfb?_sku_)(.+?)_(\d+x\d+)_([0-9]+[a-z]?)\.(avif|gif|jpe?g|png|webp)$/i;

const DIRECT_REMOTE_IMAGE_HOSTS = [
  'cdn.shopify.com',
  'shopifycdn.com',
  'sdcdn.io',
  'assets.sdcdn.io',
  'static.wixstatic.com',
  'wixstatic.com',
  'images.unsplash.com',
  'web-production-fedb.up.railway.app',
  'pivota-agent-production.up.railway.app',
] as const;

function rewriteTomFordAssetHost(parsed: URL): URL {
  const next = new URL(parsed.toString());
  const filename = String(next.pathname.split('/').pop() || '').trim();
  if (!filename) return next;

  if (!TOM_FORD_ASSET_FILENAME_RE.test(filename)) {
    return next;
  }

  if (
    isKnownRemoteHost(next.hostname, ['sdcdn.io', 'assets.sdcdn.io']) &&
    next.pathname.toLowerCase().includes('/tf/')
  ) {
    next.searchParams.delete('width');
    next.searchParams.delete('height');
    next.searchParams.delete('w');
    next.searchParams.delete('h');
  }

  return new URL(`${TOM_FORD_SHOPIFY_FILES_BASE}${filename}${next.search}`);
}

function isAbsoluteHttpUrl(value: string): boolean {
  return ABSOLUTE_HTTP_URL_RE.test(value);
}

function isKnownRemoteHost(hostname: string, candidates: readonly string[]): boolean {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  if (!normalizedHost) return false;
  return candidates.some((host) => normalizedHost === host || normalizedHost.endsWith(`.${host}`));
}

function isShopifyLikeAsset(parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();
  return (
    isKnownRemoteHost(hostname, ['cdn.shopify.com', 'shopifycdn.com', 'sdcdn.io']) ||
    pathname.includes('/cdn/shop/files/') ||
    pathname.includes('/s/files/')
  );
}

function normalizeShopifyLikeFilename(filename: string): string {
  const trimmed = String(filename || '').trim();
  if (!trimmed) return trimmed;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    decoded = trimmed;
  }
  const compacted = decoded.replace(/\s*_\s*/g, '_').trim();
  const aliased = KNOWN_SDCND_FILENAME_ALIASES[compacted.toLowerCase()] || compacted;
  const hashed = aliased.match(SHOPIFY_FILE_HASH_SUFFIX_RE);
  if (hashed) {
    return `${hashed[1]}.${hashed[2]}`;
  }
  return aliased;
}

function normalizeImageAssetUrl(parsed: URL): URL {
  let next = new URL(parsed.toString());
  if (isShopifyLikeAsset(next)) {
    next.searchParams.delete('v');
    const segments = next.pathname.split('/');
    const lastIndex = segments.length - 1;
    segments[lastIndex] = normalizeShopifyLikeFilename(segments[lastIndex] || '');
    next.pathname = segments.join('/');
  }
  next = rewriteTomFordAssetHost(next);
  return next;
}

export function unwrapPdpImageProxyTarget(url: string): string {
  let current = url;
  while (current) {
    try {
      const parsed = new URL(current, 'http://localhost');
      if (parsed.pathname !== IMAGE_PROXY_PATH) return current;
      const target = parsed.searchParams.get('url');
      if (!target || target === current) return current;
      current = target;
    } catch {
      return current;
    }
  }
  return url;
}

export function shouldUseDirectPdpImageHost(hostname: string): boolean {
  return isKnownRemoteHost(hostname, DIRECT_REMOTE_IMAGE_HOSTS);
}

export function applyKnownHostWidthHint(rawUrl: string, width: number): string {
  if (!rawUrl || !Number.isFinite(width) || width < 1) return rawUrl;

  try {
    const parsed = normalizeImageAssetUrl(new URL(rawUrl));
    const host = parsed.hostname.toLowerCase();

    if (isShopifyLikeAsset(parsed)) {
      if (!parsed.searchParams.has('width')) {
        parsed.searchParams.set('width', String(Math.floor(width)));
      }
      return parsed.toString();
    }

    if (host.includes('wixstatic.com') || host.includes('images.unsplash.com')) {
      if (!parsed.searchParams.has('w')) {
        parsed.searchParams.set('w', String(Math.floor(width)));
      }
      if (host.includes('images.unsplash.com') && !parsed.searchParams.has('auto')) {
        parsed.searchParams.set('auto', 'format');
      }
      return parsed.toString();
    }

    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

export function normalizePdpImageUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  if (!isAbsoluteHttpUrl(trimmed) && !trimmed.startsWith(IMAGE_PROXY_PATH)) {
    return trimmed;
  }

  const unwrapped = unwrapPdpImageProxyTarget(trimmed);
  if (!isAbsoluteHttpUrl(unwrapped)) {
    return unwrapped || trimmed;
  }

  try {
    const normalized = normalizeImageAssetUrl(new URL(unwrapped));
    if (shouldUseDirectPdpImageHost(normalized.hostname)) {
      return normalized.toString();
    }
    return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(normalized.toString())}`;
  } catch {
    return trimmed;
  }
}

export function buildPdpImageDedupeKey(rawUrl: unknown): string | null {
  const normalized = normalizePdpImageUrl(rawUrl);
  if (!normalized) return null;
  const unwrapped = unwrapPdpImageProxyTarget(normalized);
  const absolute = isAbsoluteHttpUrl(unwrapped);

  try {
    const parsed = absolute ? new URL(unwrapped) : new URL(unwrapped, 'http://localhost');
    const filename = normalizeShopifyLikeFilename(parsed.pathname.split('/').pop() || '');
    const tomFordSlotMatch = filename.match(TOM_FORD_SLOT_DEDUPE_RE);
    if (absolute && tomFordSlotMatch) {
      const dimensions = String(tomFordSlotMatch[3] || '').toLowerCase();
      const slot = String(tomFordSlotMatch[4] || '').toLowerCase();
      if (dimensions && slot) {
        return `asset:tf_slot:${dimensions}_${slot}`;
      }
    }
    const normalizedSearch = new URLSearchParams();
    Array.from(parsed.searchParams.entries())
      .sort(([aKey, aValue], [bKey, bValue]) => {
        if (aKey === bKey) return aValue.localeCompare(bValue);
        return aKey.localeCompare(bKey);
      })
      .forEach(([key, value]) => {
        if (IMAGE_DEDUPE_IGNORED_QUERY_KEYS.has(String(key || '').toLowerCase())) return;
        normalizedSearch.append(key, value);
      });

    if (absolute) {
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}${
        normalizedSearch.toString() ? `?${normalizedSearch.toString()}` : ''
      }`;
    }
    return `${parsed.pathname}${normalizedSearch.toString() ? `?${normalizedSearch.toString()}` : ''}`;
  } catch {
    return unwrapped;
  }
}

export function optimizePdpImageUrl(rawUrl: string, width = 480): string {
  const normalized = normalizePdpImageUrl(rawUrl);
  if (!normalized) return rawUrl;

  try {
    const parsed = new URL(normalized, 'http://localhost');
    if (parsed.pathname === IMAGE_PROXY_PATH) {
      const inner = parsed.searchParams.get('url');
      if (inner) {
        parsed.searchParams.set('url', applyKnownHostWidthHint(inner, width));
      }
      parsed.searchParams.delete('width');
      parsed.searchParams.set('w', String(width));
      return normalized.startsWith('http') ? parsed.toString() : `${parsed.pathname}?${parsed.searchParams.toString()}`;
    }
  } catch {
    return normalized;
  }

  return isAbsoluteHttpUrl(normalized) ? applyKnownHostWidthHint(normalized, width) : normalized;
}

export { IMAGE_PROXY_PATH };
