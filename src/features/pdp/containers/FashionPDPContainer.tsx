'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';
import type { UgcCapabilities } from '@/lib/api';
import type { ServiceCardData } from '@/features/services/lib/types';

/**
 * FashionPDPContainer
 *
 * Routes a fashion product (category_kind === 'fashion') into the new
 * fashion PDP tree. Mirrors the BeautyPDPContainer shape so the caller
 * (`ProductDetailClient.tsx`) can pick the container from a flat conditional.
 *
 * Internally renders `<PdpContainer mode="fashion"/>` which, when isFashionMobile
 * is true, returns the new `<FashionPDPMobile/>` and on isFashionDesktop the
 * `<FashionPDPDesktop/>` — the same early-return pattern used for beauty.
 * Generic mode + every existing PDP path is untouched.
 */
export function FashionPDPContainer({
  payload,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
  onRetrySimilar,
  ugcCapabilities,
  services,
}: {
  payload: PDPPayload;
  onAddToCart: (args: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => void;
  onBuyNow: (args: {
    variant: Variant;
    quantity: number;
    merchant_id?: string;
    product_id?: string;
    offer_id?: string;
  }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  onRetrySimilar?: () => void;
  ugcCapabilities?: UgcCapabilities | null;
  services?: ServiceCardData[] | null;
}) {
  return (
    <PdpContainer
      payload={payload}
      mode="fashion"
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onWriteReview={onWriteReview}
      onSeeAllReviews={onSeeAllReviews}
      onRetrySimilar={onRetrySimilar}
      ugcCapabilities={ugcCapabilities}
      services={services}
    />
  );
}
