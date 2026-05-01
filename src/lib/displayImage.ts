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

export function normalizeDisplayImageUrl(
  rawUrl: unknown,
  fallback = '/placeholder.svg',
): string {
  if (typeof rawUrl !== 'string') return fallback;
  const trimmed = rawUrl.trim();
  if (!trimmed) return fallback;
  const unwrapped = unwrapDisplayImageProxyTarget(trimmed);
  return isDisplayableImageUrl(unwrapped) ? unwrapped : fallback;
}
