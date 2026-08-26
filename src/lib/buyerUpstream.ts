import { requireUpstreamBase } from './upstreamFallback';

// Path prefix the buyer API is mounted under on the backend host.
export const BUYER_PATH_PREFIX = '/buyer/v1';

// The stable, load-balanced Pivota backend host. NOT a PaaS-assigned hostname:
// `*.up.railway.app` and bare `*.run.app` URLs move (or vanish) when the service
// is recreated, which is exactly how this route broke — see the guard test in
// `src/lib/upstreamDefaults.guard.test.ts`.
export const PIVOTA_BACKEND_ORIGIN = 'https://api.pivota.cc';

export const DEFAULT_BUYER_BASE = `${PIVOTA_BACKEND_ORIGIN}${BUYER_PATH_PREFIX}`;

export const BUYER_ENV_VARS = ['BUYER_UPSTREAM_BASE', 'NEXT_PUBLIC_BUYER_BASE'];
export const ACCOUNTS_ENV_VARS = ['ACCOUNTS_UPSTREAM_BASE', 'NEXT_PUBLIC_ACCOUNTS_BASE'];

function trimBase(value: string): string {
  return String(value || '').trim().replace(/\/$/, '');
}

/**
 * Derive the buyer base from whatever accounts base this deploy is configured with.
 *
 * The buyer API and the accounts API are the same backend service, so a deploy that
 * knows where accounts lives already knows where buyer lives. `src/app/api/reviews/buyer/*`
 * has always derived its upstream this way; the buyer proxy did not, which is precisely
 * why reviews and accounts kept working after the 2026-08-25 Railway decommission while
 * `/api/buyer/*` fell through to a dead hardcoded host.
 */
export function buyerBaseFromAccountsEnv(): string {
  for (const name of ACCOUNTS_ENV_VARS) {
    const configured = trimBase(process.env[name] || '');
    if (!configured) continue;
    const origin = configured.endsWith('/accounts')
      ? configured.slice(0, -'/accounts'.length)
      : configured;
    return `${trimBase(origin)}${BUYER_PATH_PREFIX}`;
  }
  return '';
}

/**
 * Resolve the buyer upstream base, failing loud in a deployed runtime rather than
 * silently proxying to a hardcoded host.
 *
 * Order: explicit buyer env -> derived from the accounts env -> `requireUpstreamBase`,
 * which THROWS when NODE_ENV=production and nothing is configured (and only returns
 * DEFAULT_BUYER_BASE at build time or in local dev).
 */
export function resolveBuyerUpstreamBase(): string {
  for (const name of BUYER_ENV_VARS) {
    const explicit = trimBase(process.env[name] || '');
    if (explicit) return explicit;
  }

  const derived = buyerBaseFromAccountsEnv();
  if (derived) return derived;

  return trimBase(
    requireUpstreamBase({
      routeLabel: 'api/buyer',
      envVarsTried: [...BUYER_ENV_VARS, ...ACCOUNTS_ENV_VARS],
      fallback: DEFAULT_BUYER_BASE,
    }),
  );
}
