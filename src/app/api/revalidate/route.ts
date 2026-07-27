import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * On-demand ISR purge for a single PDP.
 *
 * WHY IT EXISTS. `/products/[id]` is ISR with `revalidate = 3600`, and until now
 * nothing could purge a cached page. When a PDP cached a wrong answer — a 404 on
 * a product that has since been ungated, a stale price, a dead canonical — the
 * only recovery was to wait out the hour. That has been flagged twice as a
 * prerequisite for the tombstone sitemap flip: moving a URL is not safe while
 * the old answer can persist for an hour after the data is fixed.
 *
 * ── THE ESCAPE THIS ROUTE HAD TO BE REDESIGNED AROUND ────────────────────────
 * `revalidatePath` DOES NOT RESOLVE ROUTES. It builds a string tag:
 * `_N_T_${path}`, plus `/${type}` when a type is given (Next 15.5.7,
 * server/web/spec-extension/revalidate.js). So
 *
 *     revalidatePath('/products/layout')      -> "_N_T_/products/layout"
 *     revalidatePath('/products', 'layout')   -> "_N_T_/products/layout"
 *
 * are BYTE-IDENTICAL — and the second is the tag every PDP cache entry carries
 * implicitly for its subtree. A single POST with `product_id: "layout"` would
 * therefore have purged all ~4,400 ISR entries: precisely the self-inflicted
 * crawl collapse (#266) this endpoint exists to avoid. `"layout"` is pure
 * alphanumeric, so it passed a traversal-shaped guard untouched. The first
 * version of this route defended against `../`; the real escape is Next's
 * RESERVED SEGMENT NAMES, which are not traversal-shaped at all.
 *
 * ⚠️ THE OBVIOUS FIX DOES NOT WORK HERE, and I only found that out by measuring.
 * Passing the type — `revalidatePath(path, 'page')` — yields the tag
 * `_N_T_/products/<id>/page`, which cannot collide with a layout tag and looks
 * like the perfect belt. It also matches NOTHING: the ISR entry carries
 * `_N_T_/products/<id>`, so the route silently became INERT. Measured on a real
 * build — purge returned 200 and `x-nextjs-cache` stayed HIT. The unit test could
 * not see it, because all a mock can check is that `revalidatePath` was CALLED.
 * The `type` argument is for route PATTERNS (`/products/[id]`), not for a
 * concrete pathname. So: no type, and the guard has to live in the id.
 *
 * TWO INDEPENDENT BELTS, the first structural so it cannot rot:
 *   1. THE ID MUST CONTAIN `_` OR `:`. Every real product id does — verified
 *      against all 10,452 ids in the live corpus (4,443 sitemap + 5,887 feed
 *      sigs + content_keys): zero exceptions. No Next reserved name does, and
 *      none plausibly ever will, because they are English words. This is a
 *      positive rule about what a product id IS, not a list of what it is not.
 *   2. An explicit, case-insensitive deny-list of the reserved segment names.
 *
 * Beyond that: one path, one product, no wildcards, no tag purge, no
 * "revalidate everything" escape hatch, and a per-path cooldown.
 *
 * ── AUTH ─────────────────────────────────────────────────────────────────────
 * Shared secret in `PIVOTA_REVALIDATE_SECRET`, compared in constant time over
 * fixed-width SHA-256 digests. BOTH sides are trimmed: an operator pasting the
 * secret into the Vercel UI with a trailing newline would otherwise permanently
 * 401 the correct caller, with no diagnostic to explain it.
 *
 * FAIL-CLOSED WHEN UNCONFIGURED, with a NON-RETRYABLE status: 501, not 503. 503
 * means "try again later", so an unconfigured deploy would have callers retrying
 * forever against a route that is permanently inert. It does NOT fall back to
 * "allow" — a door that cannot verify should not open at all.
 *
 * SETTING THE SECRET IS AN OPERATOR ACTION, not something this PR does. Until it
 * exists this route is a well-behaved 501.
 */

// Node runtime: `timingSafeEqual`/`createHash` are node:crypto APIs the edge
// runtime does not provide. Also matches the rest of this app's API routes.
export const runtime = 'nodejs';

// A side-effecting POST whose whole job is to invalidate cache — it must never
// be cached or folded into a build artifact itself.
export const dynamic = 'force-dynamic';

const REVALIDATE_SECRET = (process.env.PIVOTA_REVALIDATE_SECRET || '').trim();

/**
 * Next's reserved special-file segment names. Any of these as the final segment
 * makes `revalidatePath('/products/<name>')` collide with the tag that
 * `revalidatePath('/products', '<name>')` produces for the whole subtree.
 *
 * `layout` is the catastrophic one — every PDP entry carries the subtree layout
 * tag. `page` purges the `/products` listing. The rest are the same shape, cost
 * nothing to deny, and a product id can never legitimately be one of these.
 */
const RESERVED_SEGMENTS = new Set([
  'layout',
  'page',
  'route',
  'default',
  'template',
  'error',
  'loading',
  'not-found',
  'global-error',
]);

/**
 * Product ids are opaque tokens (`sig_…`, `ck_…`, `pg_…`, `ext_…`, and merchant
 * forms like `mintree:abc`). Rather than enumerate them, reject anything that
 * could escape the single-path guarantee: no slashes, no `..`, no whitespace, no
 * control characters, and a length bound.
 *
 * The leading-alphanumeric anchor is load-bearing, and a test caught me without
 * it: `.` is a legal character inside an id, so a class of `[A-Za-z0-9._:~-]`
 * alone accepts the bare strings `.` and `..` — and `/products/.` and
 * `/products/..` both normalize to `/products`.
 */
const SAFE_PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/;

/**
 * BELT ONE, and the one that does not rot: a real product id always carries a
 * prefix separator — `sig_…`, `ck_…`, `pg_…`, `ext_…`, or `merchant:slug`.
 * Verified against every id in the live corpus (10,452 distinct: 4,443 sitemap
 * URLs plus 5,887 feed sig_ids and content_keys) — zero exceptions. Every Next
 * reserved segment name is a bare English word and fails it.
 *
 * This is a positive statement about what a product id IS. The deny-list below
 * is defence in depth against a name I have not thought of; this rule is what
 * makes such a name unreachable in the first place.
 */
const ID_PREFIX_SEPARATOR = /[_:]/;

/**
 * Per-path cooldown. Cheap insurance given this app's crawl-collapse history: a
 * hot path purged in a loop cold-SSRs every crawler arriving in between.
 *
 * Best-effort BY DESIGN, and worth stating so nobody reads more into it than is
 * there: serverless instances do not share memory, so this bounds a runaway loop
 * against one instance rather than enforcing a global rate. The real guarantee
 * is the secret plus the single-path cap above.
 */
const COOLDOWN_MS = 10_000;
const COOLDOWN_MAX_ENTRIES = 1_000;
const lastPurgedAt = new Map<string, number>();

function claimCooldown(path: string, now: number): boolean {
  const previous = lastPurgedAt.get(path);
  if (previous !== undefined && now - previous < COOLDOWN_MS) return false;
  // Bound the map. Dropping the oldest is fine: an evicted entry only means a
  // path becomes purgeable again sooner than the cooldown nominally promises.
  if (lastPurgedAt.size >= COOLDOWN_MAX_ENTRIES) {
    const oldest = lastPurgedAt.keys().next();
    if (!oldest.done) lastPurgedAt.delete(oldest.value);
  }
  lastPurgedAt.set(path, now);
  return true;
}

/**
 * Constant-time compare over fixed-width digests.
 *
 * Hashing first is what makes the claim honest. `timingSafeEqual` THROWS on
 * differing buffer lengths, so calling it on raw secrets turns a length mismatch
 * into a 500 — and padding both to `max(len)` (the previous version) leaves the
 * work proportional to the longer input, i.e. a timing knee at the secret's own
 * length. SHA-256 makes both operands exactly 32 bytes, so neither the compare
 * nor the allocation depends on what the caller sent.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function readSecret(req: NextRequest): string {
  const header = req.headers.get('x-revalidate-secret');
  if (header) return header.trim();
  const auth = req.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return bearer ? bearer[1].trim() : '';
}

export async function POST(req: NextRequest) {
  if (!REVALIDATE_SECRET) {
    return NextResponse.json(
      { revalidated: false, error: 'REVALIDATE_NOT_CONFIGURED' },
      { status: 501 },
    );
  }

  const provided = readSecret(req);
  if (!provided || !secretMatches(provided, REVALIDATE_SECRET)) {
    return NextResponse.json({ revalidated: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  // NOT `String(...)`. Coercion turned `["layout"]` and `12345` into accepted
  // ids, and an array whose first element is a reserved name is the whole-route
  // purge wearing a different coat.
  const rawId =
    body && typeof body === 'object' ? (body as Record<string, unknown>).product_id : null;
  const productId = typeof rawId === 'string' ? rawId.trim() : '';

  if (
    !SAFE_PRODUCT_ID.test(productId) ||
    productId.includes('..') ||
    !ID_PREFIX_SEPARATOR.test(productId) ||
    RESERVED_SEGMENTS.has(productId.toLowerCase())
  ) {
    return NextResponse.json({ revalidated: false, error: 'INVALID_PRODUCT_ID' }, { status: 400 });
  }

  const path = `/products/${productId}`;

  if (!claimCooldown(path, Date.now())) {
    return NextResponse.json(
      { revalidated: false, error: 'COOLDOWN', retry_after_ms: COOLDOWN_MS },
      { status: 429 },
    );
  }

  // NO type argument — see the docblock. Passing 'page' produces a tag the ISR
  // entry does not carry, and the route goes silently inert.
  revalidatePath(path);

  // A route whose job is mutating production cache emitted nothing until now, so
  // the first "why did the cache drop?" question had nothing to read. Path only,
  // never the secret.
  console.log(
    JSON.stringify({ event: 'isr_revalidate', path, at: new Date().toISOString() }),
  );

  return NextResponse.json({ revalidated: true, path, now: Date.now() });
}
