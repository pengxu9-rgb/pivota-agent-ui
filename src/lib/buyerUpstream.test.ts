import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_BUYER_BASE, buyerBaseFromAccountsEnv, resolveBuyerUpstreamBase } from './buyerUpstream';

/**
 * Regression cover for the 2026-08-26 prod incident: `/api/buyer/*` silently proxied to
 * `https://web-production-fedb.up.railway.app/buyer/v1`, decommissioned the day before, so
 * `GET https://agent.pivota.cc/api/buyer/orders` returned the RAILWAY EDGE's 404 body
 * (`x-railway-fallback: true`) instead of buyer order history. `/api/buyer/me` masked it by
 * short-circuiting to a local 401 before it ever proxied.
 */
describe('resolveBuyerUpstreamBase', () => {
  beforeEach(() => {
    // Start from a known-empty config so a stray ambient var cannot decide these cases.
    for (const name of [
      'BUYER_UPSTREAM_BASE',
      'NEXT_PUBLIC_BUYER_BASE',
      'ACCOUNTS_UPSTREAM_BASE',
      'NEXT_PUBLIC_ACCOUNTS_BASE',
    ]) {
      vi.stubEnv(name, '');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('prefers an explicit buyer env var', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BUYER_UPSTREAM_BASE', 'https://staging.example.com/buyer/v1/');
    expect(resolveBuyerUpstreamBase()).toBe('https://staging.example.com/buyer/v1');
  });

  it('falls back to NEXT_PUBLIC_BUYER_BASE', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_BUYER_BASE', 'https://preview.example.com/buyer/v1');
    expect(resolveBuyerUpstreamBase()).toBe('https://preview.example.com/buyer/v1');
  });

  // THE PROD-SHAPED CASE. Vercel prod sets no buyer var but does set an accounts base
  // (verified 2026-08-26: /api/accounts/* reaches api.pivota.cc, x-service-commit dd1f9acb7af4).
  it('derives the buyer base from the accounts base by stripping /accounts', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ACCOUNTS_BASE', 'https://api.pivota.cc/accounts');
    expect(resolveBuyerUpstreamBase()).toBe('https://api.pivota.cc/buyer/v1');
  });

  it('derives from ACCOUNTS_UPSTREAM_BASE too, and tolerates a trailing slash', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACCOUNTS_UPSTREAM_BASE', 'https://api.pivota.cc/accounts/');
    expect(buyerBaseFromAccountsEnv()).toBe('https://api.pivota.cc/buyer/v1');
  });

  it('treats an accounts base with no /accounts suffix as the origin', () => {
    vi.stubEnv('ACCOUNTS_UPSTREAM_BASE', 'https://api.pivota.cc');
    expect(buyerBaseFromAccountsEnv()).toBe('https://api.pivota.cc/buyer/v1');
  });

  it('returns empty when no accounts var is configured', () => {
    expect(buyerBaseFromAccountsEnv()).toBe('');
  });

  // The point of the change: a deployed runtime with nothing configured must FAIL LOUD
  // rather than silently proxying buyer traffic to whatever host is hardcoded here.
  it('THROWS in a production runtime when nothing is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => resolveBuyerUpstreamBase()).toThrow(/\[api\/buyer\] Missing required upstream base env var/);
  });

  it('names every env var it tried in the throw, so the fix is obvious from the log', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => resolveBuyerUpstreamBase()).toThrow(
      /BUYER_UPSTREAM_BASE.*NEXT_PUBLIC_BUYER_BASE.*ACCOUNTS_UPSTREAM_BASE.*NEXT_PUBLIC_ACCOUNTS_BASE/,
    );
  });

  it('warns but still resolves in local dev, so `npm run dev` keeps working', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(resolveBuyerUpstreamBase()).toBe(DEFAULT_BUYER_BASE);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('never resolves to a decommissioned PaaS host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(resolveBuyerUpstreamBase()).not.toMatch(/railway\.app/);
  });
});
