import type {
  ProductResponse,
  ResolveProductCandidatesOffer,
  ResolveProductCandidatesResponse,
} from './api';

function normalizeResolvedOffers(
  resolution: ResolveProductCandidatesResponse | null | undefined,
): ResolveProductCandidatesOffer[] {
  return Array.isArray(resolution?.offers)
    ? resolution.offers.filter((offer): offer is ResolveProductCandidatesOffer => {
        const offerId = String(offer?.offer_id || '').trim();
        const merchantId = String(offer?.merchant_id || '').trim();
        return Boolean(offerId && merchantId);
      })
    : [];
}

export function buildRawDetailWithResolvedOffers(
  rawDetail: unknown,
  resolution: ResolveProductCandidatesResponse | null | undefined,
) {
  const base =
    rawDetail && typeof rawDetail === 'object' && !Array.isArray(rawDetail)
      ? { ...(rawDetail as Record<string, unknown>) }
      : {};
  const offers = normalizeResolvedOffers(resolution);

  if (!offers.length) return base;

  return {
    ...base,
    offers,
    offers_count:
      resolution?.offers_count != null
        ? Number(resolution.offers_count) || 0
        : offers.length,
    ...(resolution?.default_offer_id
      ? { default_offer_id: String(resolution.default_offer_id) }
      : {}),
    ...(resolution?.best_price_offer_id
      ? { best_price_offer_id: String(resolution.best_price_offer_id) }
      : {}),
    ...(resolution?.product_group_id
      ? { product_group_id: String(resolution.product_group_id) }
      : {}),
  };
}

export function getCanonicalRefFromResolvedOffers(
  resolution: ResolveProductCandidatesResponse | null | undefined,
): { merchant_id: string; product_id: string } | null {
  const canonicalMerchantId = String(resolution?.canonical_product_ref?.merchant_id || '').trim();
  const canonicalProductId = String(resolution?.canonical_product_ref?.product_id || '').trim();
  if (canonicalMerchantId && canonicalProductId) {
    return {
      merchant_id: canonicalMerchantId,
      product_id: canonicalProductId,
    };
  }

  const firstOfferWithProductId = normalizeResolvedOffers(resolution).find((offer) => {
    return Boolean(String(offer.product_id || '').trim());
  });
  if (!firstOfferWithProductId) return null;

  return {
    merchant_id: String(firstOfferWithProductId.merchant_id || '').trim(),
    product_id: String(firstOfferWithProductId.product_id || '').trim(),
  };
}

export function mapResolvedOffersToSellerCandidates(
  resolution: ResolveProductCandidatesResponse | null | undefined,
): ProductResponse[] {
  const candidates = normalizeResolvedOffers(resolution).map((offer): ProductResponse | null => {
      const merchantId = String(offer.merchant_id || '').trim();
      const productId = String(offer.product_id || '').trim();
      if (!merchantId) return null;

      const rawPrice =
        typeof offer.price === 'number'
          ? offer.price
          : Number(offer.price?.amount ?? 0);
      const currency =
        typeof offer.price === 'number'
          ? 'USD'
          : String(offer.price?.currency || 'USD');

      return {
        product_id: productId || merchantId,
        merchant_id: merchantId,
        merchant_name: String(offer.merchant_name || '').trim() || undefined,
        title: 'Seller option',
        description: '',
        price: Number.isFinite(rawPrice) ? rawPrice : 0,
        currency,
        in_stock:
          typeof offer.inventory?.in_stock === 'boolean'
            ? offer.inventory.in_stock
            : true,
      } satisfies ProductResponse;
    });

  return candidates
    .filter((candidate): candidate is ProductResponse => Boolean(candidate))
    .filter((candidate, index, items) => {
      return items.findIndex((item) => item.merchant_id === candidate.merchant_id) === index;
    });
}
