import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';

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
 * DELIBERATELY BORING. One path, one product, no wildcards, no tag purge, no
 * "revalidate everything" escape hatch. `revalidatePath('/products')` without an
 * id would drop the whole route's cache and hand every crawler a cold 2-3s SSR
 * across ~4,400 URLs — a self-inflicted version of the crawl collapse this
 * codebase already fixed once (#266). The blast radius of this route is capped
 * at one page by construction, not by convention.
 *
 * AUTH. Shared secret in `PIVOTA_REVALIDATE_SECRET`, compared in constant time.
 * A `!==` on a secret leaks its prefix to a patient attacker one byte at a time;
 * this endpoint is unauthenticated-until-proven otherwise on the public
 * internet, so that matters more here than in most places.
 *
 * FAIL-CLOSED WHEN UNCONFIGURED. If the env var is absent the route returns 503
 * and revalidates nothing. It does NOT fall back to "allow" — an unconfigured
 * deploy must be inert, not open. (Standing rule: a door that cannot verify
 * should not open at all.)
 *
 * SETTING THE SECRET IS AN OPERATOR ACTION, not something this PR does. See the
 * PR body: the variable is named and documented here; someone with Vercel access
 * has to create it. Until then this route is a well-behaved 503.
 */

// Node runtime: `timingSafeEqual` is a node:crypto API, and the edge runtime
// does not provide it. Also matches the rest of this app's API routes.
export const runtime = 'nodejs';

// This route must never be cached or statically analyzed into a build artifact —
// it is a side-effecting POST whose whole job is to invalidate cache.
export const dynamic = 'force-dynamic';

const REVALIDATE_SECRET = process.env.PIVOTA_REVALIDATE_SECRET || '';

/**
 * Constant-time compare that does not leak length either.
 *
 * `timingSafeEqual` THROWS on differing buffer lengths, so calling it directly
 * would turn a length mismatch into a 500 and re-introduce the timing signal it
 * exists to remove. Hashing both sides to a fixed width first is the standard
 * fix; here we simply pad-compare via equal-length buffers and check length
 * separately in a way that cannot short-circuit the byte comparison.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Compare a fixed-width digest-like window so length differences do not throw.
  const width = Math.max(a.length, b.length, 1);
  const padded = (buf: Buffer) => {
    const out = Buffer.alloc(width);
    buf.copy(out);
    return out;
  };
  // Both must run; `&&` would short-circuit and skip the constant-time compare.
  const sameLength = a.length === b.length;
  const sameBytes = timingSafeEqual(padded(a), padded(b));
  return sameLength && sameBytes;
}

function readSecret(req: NextRequest): string {
  const header = req.headers.get('x-revalidate-secret');
  if (header) return header.trim();
  const auth = req.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return bearer ? bearer[1].trim() : '';
}

/**
 * Product ids are opaque tokens (`sig_…`, `ck_…`, `pg_…`, `ext_…`, and merchant
 * forms like `mintree:abc`). Rather than enumerate them, reject anything that
 * could escape the single-path guarantee: no slashes, no `..`, no whitespace, no
 * control characters, and a length bound. A caller-controlled string is about to
 * be interpolated into a path passed to revalidatePath.
 *
 * THE LEADING-ALPHANUMERIC ANCHOR IS LOAD-BEARING, and the test caught me
 * without it: `.` is a legal character inside an id, so a class of
 * `[A-Za-z0-9._:~-]` alone accepts the literal string `..` — and
 * `/products/..` normalizes to `/products`, which is precisely the
 * whole-route purge this endpoint refuses to offer. Requiring the first
 * character to be alphanumeric makes that string unrepresentable, and the
 * explicit `..` check below covers the interior case belt-and-braces.
 */
const SAFE_PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/;

export async function POST(req: NextRequest) {
  if (!REVALIDATE_SECRET) {
    return NextResponse.json(
      { revalidated: false, error: 'REVALIDATE_NOT_CONFIGURED' },
      { status: 503 },
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

  const productId = String(
    (body && typeof body === 'object' ? (body as Record<string, unknown>).product_id : '') || '',
  ).trim();

  if (!SAFE_PRODUCT_ID.test(productId) || productId.includes('..')) {
    return NextResponse.json(
      { revalidated: false, error: 'INVALID_PRODUCT_ID' },
      { status: 400 },
    );
  }

  const path = `/products/${productId}`;
  revalidatePath(path);

  return NextResponse.json({ revalidated: true, path, now: Date.now() });
}
