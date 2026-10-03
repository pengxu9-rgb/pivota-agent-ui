// Shared across tabs. No buyer/contact/address data is persisted, only a digest and opaque keys.
// An unresolved attempt never ages into permission to open another purchase.
export const ATTEMPT_PREFIX = 'pivota.reapCheckout.attempt.';
export type Attempt = { key: string; fingerprint: string; scope: string; resolved: boolean; itemSource?: "reap_variant" | "cart_link" };
export function readAttempt(productId: string): Attempt | null {
  const raw = localStorage.getItem(ATTEMPT_PREFIX + productId);
  if (!raw) return null;
  const v = JSON.parse(raw);
  if (!v || typeof v.key !== 'string' || !/^[A-Za-z0-9._:-]{8,100}$/.test(v.key) || typeof v.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(v.fingerprint) || typeof v.scope !== 'string' || !v.scope || typeof v.resolved !== 'boolean') {
    throw new Error('Checkout recovery data is unreadable. Contact support before starting again.');
  }
  if (v.itemSource !== undefined && !['reap_variant', 'cart_link'].includes(v.itemSource)) {
    throw new Error('Checkout recovery source is unreadable. Contact support before starting again.');
  }
  return v;
}
export function writeAttempt(productId: string, attempt: Attempt) {
  const value = JSON.stringify(attempt);
  localStorage.setItem(ATTEMPT_PREFIX + productId, value);
  if (localStorage.getItem(ATTEMPT_PREFIX + productId) !== value) throw new Error('Checkout recovery could not be saved.');
}
export async function requestFingerprint(body: unknown) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body)));
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
}
export async function withAttemptLock<T>(callback: () => Promise<T>): Promise<T> {
  if (!navigator.locks) throw new Error('This browser cannot safely recover checkout across tabs. Use an updated browser.');
  // Also serializes first-cookie bootstrap across products, which share one buyer cookie.
  return navigator.locks.request('pivota.reapCheckout.buyer-attempt', callback);
}
