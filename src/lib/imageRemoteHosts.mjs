/**
 * Single source of truth for the hosts `next/image` is allowed to optimize.
 *
 * This list feeds TWO consumers that used to be maintained independently:
 *   1. `next.config.mjs` -> `images.remotePatterns`, which is what the Vercel image
 *      optimizer actually enforces. An unlisted host makes `/_next/image` answer
 *      HTTP 400 `INVALID_IMAGE_OPTIMIZE_REQUEST`.
 *   2. `src/lib/displayImage.ts`, which decides whether a URL may be handed to the
 *      optimizer raw or has to be routed through the same-origin `/api/image-proxy`.
 *
 * Keeping them apart is what broke chat cards: the config knew about 13 hosts, the
 * display helper knew about none, and every merchant outside the 13 rendered as a
 * broken image. Add new hosts HERE, never in one consumer only.
 *
 * A `.mjs` module because `next.config.mjs` is evaluated before any TS transform.
 */
export const IMAGE_REMOTE_HOSTS = [
  'm.media-amazon.com',
  'cdn.shopify.com',
  'sdcdn.io',
  'assets.sdcdn.io',
  'drjart.com',
  'www.drjart.com',
  'guerlain.com',
  'www.guerlain.com',
  'static.wixstatic.com',
  'images.unsplash.com',
  // Review media is signed and served by the backend public host.
  'web-production-fedb.up.railway.app',
  'pivota-agent-production.up.railway.app',
  // Pivota-owned equivalents, kept ALONGSIDE the Railway hosts for the migration
  // window: image URLs already persisted in catalog rows still carry the old host.
  'api.pivota.cc',
  'gateway.pivota.cc',
];

/**
 * Exact-hostname match only — deliberately NOT a suffix match.
 *
 * `images.remotePatterns` compares the hostname exactly unless the pattern carries a
 * wildcard, so a suffix match here would claim a host the optimizer then rejects, which
 * is the precise failure this module exists to prevent. Being too STRICT is safe: the
 * caller falls back to `/api/image-proxy`, which serves the image either way.
 */
export function isAllowlistedImageHost(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return false;
  return IMAGE_REMOTE_HOSTS.includes(normalized);
}
