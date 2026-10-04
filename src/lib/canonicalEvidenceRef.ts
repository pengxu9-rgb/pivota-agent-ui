/** A canonical content reference is distinct from a card's selected seller offer. */
export type CanonicalEvidenceRef = { scope: 'canonical_product'; product_id: string };

const signature = /^sig_[a-f0-9]{32}$/;
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};

export function canonicalEvidenceRef(value: unknown): CanonicalEvidenceRef | undefined {
  const product = record(value);
  const id = String(product.product_id || '').trim();
  const declared = String(product.pivota_signature_id || product.signature_id || '').trim();
  if (!signature.test(id) || declared !== id) return undefined;
  // Require the producer's advertised canonical route as well as the signature.
  // A seller-scoped product merely containing another item's ID is insufficient.
  const urls = [product.canonical_url, product.pivota_canonical_url];
  const matched = urls.some((value) => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && url.hostname === 'agent.pivota.cc' && !url.username && !url.password &&
        url.pathname.replace(/\/$/, '') === `/products/${id}` && !url.search && !url.hash;
    } catch { return false; }
  });
  return matched ? { scope: 'canonical_product', product_id: id } : undefined;
}

export function isCanonicalEvidenceRequest(ref: unknown, requestedProductId: string): boolean {
  const value = record(ref);
  return value.scope === 'canonical_product' && value.product_id === requestedProductId && signature.test(requestedProductId);
}
