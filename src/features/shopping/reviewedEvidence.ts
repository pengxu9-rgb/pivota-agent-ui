/** Narrow, dated retailer observations from the 2026-10-04 live UI audit.
 * These are not a catalog inference, medical advice, or evergreen certification.
 * Require both exact route identity and seller. New listings/aliases do not inherit them.
 */
export const reviewedIngredientEvidence = [
  {
    productId: 'sig_6bb6c7ae7b7e71e838aefb564c60371a',
    merchantId: 'merch_obs_0531e02c57f00f5b',
    url: 'https://moogoousa.com/products/full-cream-moisturizer',
    observedAt: '2026-10-04',
    recheckAfter: '2026-11-03',
    ingredients: 'Natural Vanilla Fragrance',
    excerptOnly: true,
    conflict: true,
  },
] as const;
