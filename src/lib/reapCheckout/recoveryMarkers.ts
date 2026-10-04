// No buyer details: append-only evidence, keyed by the exact opaque checkout id.
// Separate keys avoid read/modify/write races between tabs opening different stages.
export const ACTIVE_KEY_PREFIX = 'pivota.reapCheckout.active.';
export const MARKER_KEY_PREFIX = 'pivota.reapCheckout.evidence.';
export const REAP_ID_RE = /^reap_rp_[0-9a-f]{24}\.[A-Za-z0-9_-]{1,1000}$/;
export type ActiveFlag = 'enrollmentOpened' | 'approvalOpened' | 'approved' | 'handedOff' | 'dispatchRisk' | 'completed' | 'noDispatchTerminal' | 'continuationPending';
const FLAGS: ActiveFlag[] = ['enrollmentOpened', 'approvalOpened', 'approved', 'handedOff', 'dispatchRisk', 'completed', 'noDispatchTerminal', 'continuationPending'];
const RISK_FLAGS: ActiveFlag[] = ['approvalOpened', 'approved', 'handedOff', 'dispatchRisk'];
const markerKey = (productId: string, id: string, flag: ActiveFlag) => `${MARKER_KEY_PREFIX}${encodeURIComponent(productId)}/${encodeURIComponent(id)}/${flag}`;

export function readActiveCheckoutId(productId: string, _now = Date.now()): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACTIVE_KEY_PREFIX + productId) || 'null');
    return typeof v?.id === 'string' && REAP_ID_RE.test(v.id) && typeof v.at === 'number' ? v.id : null;
  } catch { return null; }
}

/** Import legacy evidence before a replaceable active record or a storage event loses it. */
export function preserveActiveEvidence(productId: string, raw: string | null): void {
  const v = JSON.parse(raw || 'null');
  if (!v || typeof v.id !== 'string' || !REAP_ID_RE.test(v.id)) return;
  for (const flag of FLAGS) if (v[flag] === true) {
    localStorage.setItem(markerKey(productId, v.id, flag), '1');
  }
}

export function readActiveFlag(productId: string, flag: ActiveFlag, id = readActiveCheckoutId(productId)): boolean {
  if (!id) return false;
  try {
    const raw = localStorage.getItem(ACTIVE_KEY_PREFIX + productId);
    const active = JSON.parse(raw || 'null');
    if (active?.id === id && active[flag] === true) {
      // A legacy flag remains conservative; never relabel it as enrollment-only.
      try { preserveActiveEvidence(productId, raw); } catch { /* The current read still carries risk. */ }
      return true;
    }
    return localStorage.getItem(markerKey(productId, id, flag)) === '1';
  } catch { return RISK_FLAGS.includes(flag); }
}

/** Call within the buyer attempt lock for a handoff or other action. Never mark a different active id. */
export function markActive(productId: string, flag: ActiveFlag, expectedId: string): boolean {
  try {
    if (!REAP_ID_RE.test(expectedId) || readActiveCheckoutId(productId) !== expectedId) return false;
    preserveActiveEvidence(productId, localStorage.getItem(ACTIVE_KEY_PREFIX + productId));
    persistCheckoutEvidence(productId, expectedId, flag);
    return readActiveCheckoutId(productId) === expectedId && readActiveFlag(productId, flag, expectedId);
  } catch { return false; }
}

export function persistCheckoutEvidence(productId: string, id: string, flag: ActiveFlag): void {
  if (!REAP_ID_RE.test(id)) throw new Error('Invalid checkout recovery id.');
  const key = markerKey(productId, id, flag);
  localStorage.setItem(key, '1');
  if (localStorage.getItem(key) !== '1') throw new Error('Checkout recovery could not be saved.');
}

/** A stale tab cannot hide an older risky checkout by swapping only the product pointer. */
export function hasUnsettledEvidence(productId?: string): boolean {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(MARKER_KEY_PREFIX)) continue;
      const [product, encodedId, flag] = key.slice(MARKER_KEY_PREFIX.length).split('/');
      if (productId && decodeURIComponent(product) !== productId) continue;
      if (!encodedId || (!RISK_FLAGS.includes(flag as ActiveFlag) && flag !== 'continuationPending')) continue;
      const ownerProduct = decodeURIComponent(product);
      const id = decodeURIComponent(encodedId);
      if (!readActiveFlag(ownerProduct, 'completed', id)) return true;
    }
    return false;
  } catch { return true; }
}

export function hasPaymentRisk(productId: string, id: string): boolean {
  return RISK_FLAGS.some((flag) => readActiveFlag(productId, flag, id));
}

export function isSettledCheckout(productId: string, id: string): boolean {
  return readActiveFlag(productId, 'completed', id) ||
    (readActiveFlag(productId, 'noDispatchTerminal', id) && !hasPaymentRisk(productId, id));
}

export function writeActiveCheckoutId(productId: string, id: string | null, now = Date.now()): void {
  try {
    const key = ACTIVE_KEY_PREFIX + productId;
    preserveActiveEvidence(productId, localStorage.getItem(key));
    if (id) {
      if (!REAP_ID_RE.test(id)) return;
      // Re-saving the same id must never erase legacy evidence or settlement metadata.
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && saved.id !== id) return;
      localStorage.setItem(key, JSON.stringify({ ...(saved?.id === id ? saved : {}), id, at: now }));
    } else localStorage.removeItem(key);
  } catch { /* Failed durable recovery leaves actions closed. */ }
}

/** Only a fresh owner-bound response for this exact checkout can resolve an uncertain continuation. */
export function resolveContinuationEvidence(productId: string, id: string): void {
  const key = markerKey(productId, id, 'continuationPending');
  localStorage.removeItem(key);
  if (localStorage.getItem(key) !== null) throw new Error('Checkout recovery could not be saved.');
}
