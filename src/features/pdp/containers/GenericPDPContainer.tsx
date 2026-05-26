'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';
import type { UgcCapabilities } from '@/lib/api';
import type { ServiceCardData } from '@/features/services/lib/types';

export function GenericPDPContainer({
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
      mode="generic"
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
