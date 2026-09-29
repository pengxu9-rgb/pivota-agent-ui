import 'server-only';

// WHO IS ACTUALLY SELLING: the seller of the row the gateway's Reap lane bought, read from the lane's
// own answer — never from the browser.
//
// Why this is needed. The UI sends the PDP's `sig_` id; the gateway resolves that id to ITS served row and
// opens the Reap purchase for that row's merchant. That row can belong to a different seller than the offer
// the PDP showed (a multi-seller group), so the merchant the browser names is not evidence of anything.
//
// Where the seller is in the answer. The Reap checkout id is `reap_<purchase id>.<snapshot>`, and the
// snapshot is base64url JSON `{v:1, i, k, q, c, u}` whose `k` is the catalog product key the lane POSTed to
// the backend (PIVOTA-Agent mcp-server/src/ucpReapAgenticLane.js encodeReapCheckoutId / decodeReapCheckoutId).
// The backend opens the purchase for exactly that product key, and a product key is
// `prod::<merchant>::<platform>::<source id>` — so `<merchant>` is the seller.
//
// CAVEAT (stated in the PR): the lane documents the id as OPAQUE to callers. This reads a format that exists
// only in the lane's source (versioned `v:1`, canonical re-encoding enforced there). Anything that does not
// decode exactly is treated as "seller unknown" and the purchase is not offered. The durable fix is a small
// gateway change: publish the seller on the Reap checkout (e.g. a `reap.merchant_domain` info message, or a
// `seller` member on the line item), and let a create carry the seller the buyer was shown so the lane skips
// a mismatch before it opens a purchase at all.
const REAP_ID_RE = /^reap_rp_[0-9a-f]{24}\.([A-Za-z0-9_-]{1,1000})$/;
const PRODUCT_KEY_RE = /^prod::([A-Za-z0-9_.-]{1,80})::[a-z0-9_]{1,40}::[^\s:]{1,160}$/;

type Snapshot = { productKey: string; itemId: string };

function snapshotOf(id: unknown): Snapshot | null {
  if (typeof id !== 'string' || id.length > 1100) return null;
  const m = REAP_ID_RE.exec(id);
  if (!m) return null;
  let snap: unknown;
  try {
    snap = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
  const s = snap as Record<string, unknown>;
  if (s.v !== 1 || typeof s.k !== 'string' || typeof s.i !== 'string') return null;
  return PRODUCT_KEY_RE.test(s.k) ? { productKey: s.k, itemId: s.i } : null;
}

/** The item id the lane echoed (the caller's product id the purchase was opened for), or null. */
export function itemIdOfReapCheckoutId(id: unknown): string | null {
  return snapshotOf(id)?.itemId ?? null;
}

export function productKeyOfReapCheckoutId(id: unknown): string | null {
  return snapshotOf(id)?.productKey ?? null;
}

/** The `<merchant>` segment of the product key the Reap purchase was opened for, or null. */
export function sellerOfReapCheckoutId(id: unknown): string | null {
  const key = productKeyOfReapCheckoutId(id);
  return key ? PRODUCT_KEY_RE.exec(key)![1] : null;
}
