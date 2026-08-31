import { isAllowlistedImageHost, rewriteLegacyPivotaImageUrl } from '@/lib/imageRemoteHosts.mjs';

const IMAGE_PROXY_PATH = '/api/image-proxy';
const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

function isDisplayableImageUrl(value: string): boolean {
  return value.startsWith('/') || ABSOLUTE_HTTP_URL_RE.test(value);
}

export function unwrapDisplayImageProxyTarget(url: string): string {
  let current = String(url || '').trim();
  while (current) {
    try {
      const parsed = new URL(current, 'http://localhost');
      if (parsed.pathname !== IMAGE_PROXY_PATH) return current;
      const target = parsed.searchParams.get('url');
      if (!target || target === current) return current;
      current = target.trim();
    } catch {
      return current;
    }
  }
  return String(url || '').trim();
}

/**
 * Route a remote image through the same-origin proxy unless `next/image` is allowed
 * to fetch its host directly.
 *
 * `images.remotePatterns` is an allowlist, and `/_next/image` answers HTTP 400
 * (`INVALID_IMAGE_OPTIMIZE_REQUEST`) — not a redirect, not a placeholder — for every
 * host outside it. Merchant image hosts are open-ended (theordinary.com,
 * media.ultainc.com, cosrx.com, ...), so handing a raw merchant URL to the optimizer
 * fails for any merchant nobody has added to the list yet. `/api/image-proxy` is
 * same-origin, so it is always optimizable and host-agnostic.
 *
 * This mirrors `normalizePdpImageUrl` in `src/features/pdp/utils/pdpImageUrls.ts`,
 * which is why the PDP already renders these hosts correctly.
 */
function proxyIfNotDirectlyOptimizable(absoluteUrl: string): string {
  try {
    const parsed = new URL(absoluteUrl);
    if (isAllowlistedImageHost(parsed.hostname)) return absoluteUrl;
    return `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(absoluteUrl)}`;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Normalize an arbitrary image value into something safe to pass to `next/image`.
 *
 * Idempotent: an already-proxied URL is unwrapped to its target and re-wrapped to the
 * identical string, so callers may compose this with itself (`api.ts` normalizes on
 * ingest, components normalize again on render) without stacking proxy hops.
 */
export function normalizeDisplayImageUrl(
  rawUrl: unknown,
  fallback = '/placeholder.svg',
): string {
  if (typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;
  const unwrapped = unwrapDisplayImageProxyTarget(trimmed);
  if (!isDisplayableImageUrl(unwrapped)) return fallback;
  // Relative paths are same-origin already (`/placeholder.svg`, local assets).
  if (!ABSOLUTE_HTTP_URL_RE.test(unwrapped)) return unwrapped;
  return proxyIfNotDirectlyOptimizable(rewriteLegacyPivotaImageUrl(unwrapped));
}
