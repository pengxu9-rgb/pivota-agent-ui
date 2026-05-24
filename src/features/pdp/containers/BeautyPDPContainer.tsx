'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';
import type { UgcCapabilities } from '@/lib/api';

export function BeautyPDPContainer({
  payload,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
  onRetrySimilar,
  ugcCapabilities,
}: {
  payload: PDPPayload;
  onAddToCart: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  onRetrySimilar?: () => void;
  ugcCapabilities?: UgcCapabilities | null;
}) {
  return (
    <PdpContainer
      payload={payload}
      mode="beauty"
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onWriteReview={onWriteReview}
      onSeeAllReviews={onSeeAllReviews}
      onRetrySimilar={onRetrySimilar}
      ugcCapabilities={ugcCapabilities}
    />
  );
}
