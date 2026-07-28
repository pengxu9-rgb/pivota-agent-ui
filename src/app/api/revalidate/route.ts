import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildRevalidateTarget } from './target';

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
 * ── WHY IT PURGES A TAG AND NOT A PATH ──────────────────────────────────────
 * `revalidatePath` DOES NOT RESOLVE ROUTES — it builds a string tag, `_N_T_${p}`,
 * plus `/${type}` when a type is given. So `revalidatePath('/products/layout')`
 * and `revalidatePath('/products', 'layout')` are the BYTE-IDENTICAL tag
 * `_N_T_/products/layout`, and the second is what every PDP entry carries for
 * its subtree. A single POST with `product_id: "layout"` purged all ~4,400 ISR
 * entries. The guard at the time was traversal-shaped; the escape was Next's
 * reserved segment names, which are not traversal-shaped at all.
 *
 * Passing the type looked like the fix and made the route silently INERT — the
 * tag becomes `_N_T_/products/<id>/page` and the entry carries
 * `_N_T_/products/<id>`, so the purge returned 200 and `x-nextjs-cache` stayed
 * HIT. Measured on a real build; a mock can only see that the function was
 * called, which is why no unit test caught it.
 *
 * SO THE TARGET IS THE PDP'S OWN TAG. `src/lib/api.ts:3299` attaches
 * ``pdp:${product_id}`` to each entry, and `revalidateTag` is EXACT-MATCH ONLY —
 * verified live: a strict prefix of a real tag, and the bare `pdp:`, both purged
 * nothing. A namespace cannot widen the way a path prefix can, so `pdp:layout`
 * is merely inert rather than catastrophic.
 *
 * That is why this route no longer carries a reserved-segment deny-list or an
 * id-shape rule. Both were belts against a path prefix widening; under a
 * namespaced tag they are not merely sufficient, they are unreachable — and a
 * guard no test can kill is dead weight, not defence in depth.
 *
 * Two rules DO survive, because they are about a different thing: whether the
 * tag we build matches the tag the entry actually carries. See PERCENT_ENCODED
 * below and the non-empty assertion in ./target.
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
 * exists this route is a well-behaved 501. Operator docs — setup, response
 * table, and the Vercel-vs-local verification caveat — live in
 * docs/isr_revalidate_runbook.md rather than only in this file.
 */

// Node runtime: `timingSafeEqual`/`createHash` are node:crypto APIs the edge
// runtime does not provide. Also matches the rest of this app's API routes.
export const runtime = 'nodejs';

// A side-effecting POST whose whole job is to invalidate cache — it must never
// be cached or folded into a build artifact itself.
export const dynamic = 'force-dynamic';

const REVALIDATE_SECRET = (process.env.PIVOTA_REVALIDATE_SECRET || '').trim();

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
 * PERCENT-ENCODING IS REJECTED, NEVER DECODED — and this rule survives any
 * redesign of the containment guards, because it is about a different thing:
 * whether the string we purge matches the string the cache entry actually
 * carries.
 *
 * The PDP's own cache tag is built from the ALREADY-DECODED `product_id` that
 * Next's routing hands the page (`src/lib/api.ts:3299`). This route reads the id
 * from a JSON body, where nothing decodes. So a caller POSTing `mintree%3Aabc`
 * would build `pdp:mintree%3Aabc` while the entry carries `pdp:mintree:abc` — a
 * purge that matches nothing and returns 200, which is the exact failure mode
 * this endpoint must never have.
 *
 * Decoding to compensate would be worse: it invites double-decode ambiguity
 * (`%253A` -> `%3A` -> `:`), where the number of decodes becomes part of the
 * contract. Rejecting is unambiguous, and the 400 names the decoded form the
 * caller should have sent.
 *
 * Kept even now that both spellings would converge on the same entry: accepting
 * two spellings of one id silently is worse than a 400 that names the right one.
 *
 * A real product id never contains `%`. Verified across the live corpus:
 * 5,880 distinct `sig_id` + 4,572 distinct `content_key` from the canonical feed
 * (5,887 rows), plus the sitemap's 4,443 ids — of which ZERO fall outside the
 * feed, so it is a strict subset and contributes nothing. Union = **10,452**
 * ids; none contain `%`, none exceed 36 chars, and none are rejected by
 * `SAFE_PRODUCT_ID`.
 *
 * (An earlier revision "corrected" this to 10,453 on the reasoning that the
 * previous figure double-counted the sitemap. That was backwards — a strict
 * subset contributes zero, so removing a double-count cannot RAISE a union. The
 * original 10,452 was right. Re-measured to settle it.)
 */
const PERCENT_ENCODED = /%/;

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
  // Bound the map. This evicts oldest-INSERTED, not least-recently-used —
  // `Map.set` on an existing key does not reorder, so a hot tag is evicted
  // first. Harmless (an evicted entry just becomes purgeable again sooner than
  // the cooldown nominally promises) but do not mistake it for an LRU.
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

  // No `!provided ||` short-circuit: the 501 guard above already guarantees a
  // non-empty configured secret, so an empty `provided` cannot match and the
  // check is unreachable. Mutation testing flagged it as unkillable — the same
  // species of redundant guard this route deleted RESERVED_SEGMENTS for, and
  // worth removing for the same reason: redundancy hides which guard is
  // load-bearing.
  const provided = readSecret(req);
  if (!secretMatches(provided, REVALIDATE_SECRET)) {
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

  // Percent-encoding first, and with its own message: it is the one rejection a
  // legitimate caller is likely to hit, and "invalid" alone would send them
  // looking in the wrong place. Naming the decoded form turns a dead end into a
  // one-line fix.
  if (PERCENT_ENCODED.test(productId)) {
    return NextResponse.json(
      {
        revalidated: false,
        error: 'PERCENT_ENCODED_PRODUCT_ID',
        message:
          'product_id must be sent DECODED. This is a JSON body, not a URL — nothing ' +
          'decodes it here, and the cache entry is tagged with the decoded id, so an ' +
          'encoded id would purge nothing while returning success. Send e.g. ' +
          '"mintree:abc", not "mintree%3Aabc".',
      },
      { status: 400 },
    );
  }

  if (
    !SAFE_PRODUCT_ID.test(productId) ||
    productId.includes('..')
  ) {
    return NextResponse.json(
      {
        revalidated: false,
        error: 'INVALID_PRODUCT_ID',
        message:
          'product_id must be a single decoded product identifier ' +
          '(e.g. sig_…, ck_…, pg_…, ext_…, merchant:slug).',
      },
      { status: 400 },
    );
  }

  let tag: string;
  try {
    tag = buildRevalidateTarget(productId);
  } catch {
    return NextResponse.json({ revalidated: false, error: 'EMPTY_PRODUCT_ID' }, { status: 400 });
  }

  if (!claimCooldown(tag, Date.now())) {
    return NextResponse.json(
      { revalidated: false, error: 'COOLDOWN', retry_after_ms: COOLDOWN_MS },
      // `Retry-After` in seconds as well as the JSON field: generic HTTP clients
      // and retry middleware read the header, not the body.
      { status: 429, headers: { 'Retry-After': String(Math.ceil(COOLDOWN_MS / 1000)) } },
    );
  }

  // Verified live against a real build: this purges the route HTML, not merely
  // the data cache (target A -> MISS, sibling B -> HIT).
  revalidateTag(tag);

  // A route whose job is mutating production cache emitted nothing until now, so
  // the first "why did the cache drop?" question had nothing to read. Path only,
  // never the secret.
  console.log(
    JSON.stringify({ event: 'isr_revalidate', tag, at: new Date().toISOString() }),
  );

  // ECHO THE EXACT TARGET. A status code cannot distinguish a real purge from a
  // typo that happened to be well-formed — and an inert purge reporting success
  // is the failure mode that has bitten this codebase repeatedly. A caller that
  // can read back `/products/mintree:abc` can see at a glance whether it hit the
  // product it meant.
  return NextResponse.json({ revalidated: true, tag, product_id: productId, now: Date.now() });
}
