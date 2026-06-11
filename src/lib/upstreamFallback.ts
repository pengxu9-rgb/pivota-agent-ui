// Helper to surface "we silently fell back to a hardcoded production URL"
// in deploy logs. The hardcoded URLs in the api/* proxy routes are there
// for safety so a misconfigured deploy still works against production, but
// that's also exactly when we want a loud signal — otherwise a staging or
// preview build can quietly route every request through the prod backend
// without anyone noticing.
//
// Use at module-init in a route file:
//
//   if (!process.env.MY_UPSTREAM_BASE) {
//     warnIfHardcodedFallbackUsed({
//       routeLabel: 'api/foo',
//       envVarsTried: ['MY_UPSTREAM_BASE', 'NEXT_PUBLIC_MY_UPSTREAM_BASE'],
//       fallback: DEFAULT_FOO_BASE,
//     });
//   }
//
// The warning logs once per (worker process, routeLabel) pair so cold
// starts get a single line in Vercel logs and request handlers don't
// flood stderr.

const _warned = new Set<string>();

function isBuildTime(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build' || process.env.npm_lifecycle_event === 'build';
}

export function warnIfHardcodedFallbackUsed(opts: {
  routeLabel: string;
  envVarsTried: string[];
  fallback: string;
}): void {
  if (isBuildTime()) return;
  if (_warned.has(opts.routeLabel)) return;
  _warned.add(opts.routeLabel);
  // eslint-disable-next-line no-console
  console.error(
    `[${opts.routeLabel}] No upstream env var set (tried: ${opts.envVarsTried.join(', ')}); ` +
      `falling back to hardcoded ${opts.fallback}. ` +
      'Configure the env var in this deploy to avoid silently routing to production.',
  );
}

// Resolve an upstream base URL from env, FAILING LOUD in any deployed
// (production-build) runtime when none of the env vars are set, instead of
// silently routing to a hardcoded production backend. A preview/staging deploy
// that forgets the env var is exactly the case where a silent fallback would
// send real checkout/payment traffic to the prod backend — so we refuse.
//
// Behaviour:
//   - env var present  -> use it (no change to correctly-configured deploys)
//   - build time       -> return the fallback (never break `next build`)
//   - NODE_ENV=production runtime, env missing -> THROW (covers prod AND preview)
//   - local/dev runtime, env missing -> warn once, return the fallback
export function requireUpstreamBase(opts: {
  routeLabel: string;
  envVarsTried: string[];
  fallback: string;
}): string {
  for (const name of opts.envVarsTried) {
    const value = (process.env[name] || '').trim();
    if (value) return value;
  }
  if (isBuildTime()) return opts.fallback;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[${opts.routeLabel}] Missing required upstream base env var (one of: ${opts.envVarsTried.join(', ')}). ` +
        'Refusing to silently fall back to a hardcoded production backend in a deployed runtime. ' +
        'Set the env var for this deploy.',
    );
  }
  warnIfHardcodedFallbackUsed(opts);
  return opts.fallback;
}
