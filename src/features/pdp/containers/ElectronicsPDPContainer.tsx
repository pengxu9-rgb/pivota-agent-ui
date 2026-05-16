'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';
import type { UgcCapabilities } from '@/lib/api';

/**
 * ElectronicsPDPContainer
 *
 * Routes an electronics product (category_kind === 'electronics') into the
 * new electronics PDP tree. Mirrors `BeautyPDPContainer` / `FashionPDPContainer`.
 *
 * Internally renders `<PdpContainer mode="electronics"/>` which dispatches to
 * the new `<ElectronicsPDPMobile/>` or `<ElectronicsPDPDesktop/>` on the same
 * early-return pattern used for beauty + fashion.
 */
export function ElectronicsPDPContainer({
  payload,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
  ugcCapabilities,
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
  ugcCapabilities?: UgcCapabilities | null;
}) {
  return (
    <PdpContainer
      payload={payload}
      mode="electronics"
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onWriteReview={onWriteReview}
      onSeeAllReviews={onSeeAllReviews}
      ugcCapabilities={ugcCapabilities}
    />
  );
}
