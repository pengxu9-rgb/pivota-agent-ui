import { describe, expect, it } from 'vitest';

import nextConfig from '../../next.config.mjs';
import { normalizeDisplayImageUrl, unwrapDisplayImageProxyTarget } from './displayImage';
import { IMAGE_REMOTE_HOSTS, isAllowlistedImageHost } from './imageRemoteHosts.mjs';

const PROXY = '/api/image-proxy?url=';

describe('normalizeDisplayImageUrl', () => {
  it('routes an unlisted merchant host through the same-origin proxy', () => {
    // `/_next/image` answers HTTP 400 INVALID_IMAGE_OPTIMIZE_REQUEST for any host outside
    // `images.remotePatterns`. Chat cards rendered these raw, so every merchant off the
    // allowlist showed a broken image.
    for (const raw of [
      'https://media.ultainc.com/i/ulta/2609862?w=500&h=500',
      'https://theordinary.com/dw/image/v2/BFKJ_PRD/on/demandware.static/x.png?sw=900',
      'https://www.cosrx.com/cdn/x.jpg',
      'https://fentybeauty.com/img/y.png',
    ]) {
      const normalized = normalizeDisplayImageUrl(raw);
      expect(normalized.startsWith(PROXY)).toBe(true);
      expect(unwrapDisplayImageProxyTarget(normalized)).toBe(raw);
    }
  });

  it('leaves an allowlisted host direct so the optimizer can serve it', () => {
    for (const hostname of IMAGE_REMOTE_HOSTS) {
      const raw = `https://${hostname}/path/image.png`;
      expect(normalizeDisplayImageUrl(raw)).toBe(raw);
    }
  });

  it('unwraps a legacy proxied URL back to direct when its host is allowlisted', () => {
    const target = 'https://cdn.shopify.com/s/files/1/0001/product.png';
    expect(normalizeDisplayImageUrl(`${PROXY}${encodeURIComponent(target)}`)).toBe(target);
  });

  it('is idempotent, so ingest-time and render-time normalization cannot stack proxy hops', () => {
    for (const raw of [
      'https://media.ultainc.com/i/ulta/2609862',
      'https://cdn.shopify.com/s/files/1/0001/product.png',
      '/placeholder.svg',
    ]) {
      const once = normalizeDisplayImageUrl(raw);
      expect(normalizeDisplayImageUrl(once)).toBe(once);
      expect(normalizeDisplayImageUrl(normalizeDisplayImageUrl(once))).toBe(once);
    }
  });

  it('passes same-origin relative paths through untouched', () => {
    expect(normalizeDisplayImageUrl('/placeholder.svg')).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl('/img/local.png')).toBe('/img/local.png');
  });

  it('falls back for values that are not displayable images', () => {
    expect(normalizeDisplayImageUrl(undefined)).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl(null)).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl('')).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl('   ')).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl(42 as unknown as string)).toBe('/placeholder.svg');
    expect(normalizeDisplayImageUrl('not a url', '/fallback.png')).toBe('/fallback.png');
  });
});

describe('isAllowlistedImageHost', () => {
  it('matches exactly and never by suffix', () => {
    expect(isAllowlistedImageHost('cdn.shopify.com')).toBe(true);
    expect(isAllowlistedImageHost('CDN.Shopify.COM')).toBe(true);
    // A suffix match here would claim a host the optimizer still rejects.
    expect(isAllowlistedImageHost('evil-cdn.shopify.com.attacker.test')).toBe(false);
    expect(isAllowlistedImageHost('notcdn.shopify.com')).toBe(false);
    expect(isAllowlistedImageHost('')).toBe(false);
    expect(isAllowlistedImageHost(undefined)).toBe(false);
  });
});

describe('next.config images.remotePatterns', () => {
  it('stays in lockstep with the shared host list the display helper reads', () => {
    // The original bug was drift: next.config knew 13 hosts, displayImage knew none.
    // Anything the helper treats as directly optimizable MUST be a pattern the
    // optimizer actually accepts, or it 400s in production.
    const configured = new Set(
      (nextConfig.images?.remotePatterns ?? []).map((pattern: { hostname: string }) => pattern.hostname),
    );
    for (const hostname of IMAGE_REMOTE_HOSTS) {
      expect(configured.has(hostname)).toBe(true);
    }
  });
});
