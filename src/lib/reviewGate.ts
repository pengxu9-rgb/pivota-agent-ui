export type ReviewGateResult =
  | 'ALLOW_WRITE'
  | 'REQUIRE_LOGIN'
  | 'ALREADY_REVIEWED'
  | 'NOT_PURCHASER';

export type ReviewGateReason =
  | 'ELIGIBLE'
  | 'NOT_AUTHENTICATED'
  | 'ALREADY_REVIEWED'
  | 'NOT_PURCHASER';

export type ReviewEligibilityLike = {
  eligible?: boolean | null;
  reason?: string | null;
};

export type ResolveReviewGateInput = {
  isAuthenticated: boolean;
  canWriteReview?: boolean | null;
  reason?: string | null;
  eligibility?: ReviewEligibilityLike | null;
};

const normalizeReason = (reason: string | null | undefined): string =>
  String(reason || '')
    .trim()
    .toUpperCase();

const resultFromReason = (reason: string | null | undefined): ReviewGateResult => {
  const normalized = normalizeReason(reason);
  if (normalized === 'NOT_AUTHENTICATED' || normalized === 'UNAUTHENTICATED') return 'REQUIRE_LOGIN';
  if (normalized === 'ALREADY_REVIEWED') return 'ALREADY_REVIEWED';
  return 'NOT_PURCHASER';
};

export function resolveReviewGate(input: ResolveReviewGateInput): ReviewGateResult {
  if (!input.isAuthenticated) return 'REQUIRE_LOGIN';

  if (typeof input.canWriteReview === 'boolean') {
    if (input.canWriteReview) return 'ALLOW_WRITE';
    return resultFromReason(input.reason);
  }

  if (input.eligibility && typeof input.eligibility.eligible === 'boolean') {
    if (input.eligibility.eligible) return 'ALLOW_WRITE';
    return resultFromReason(input.eligibility.reason);
  }

  return 'ALLOW_WRITE';
}

export function reviewGateResultToReason(result: ReviewGateResult): ReviewGateReason {
  if (result === 'REQUIRE_LOGIN') return 'NOT_AUTHENTICATED';
  if (result === 'ALREADY_REVIEWED') return 'ALREADY_REVIEWED';
  if (result === 'NOT_PURCHASER') return 'NOT_PURCHASER';
  return 'ELIGIBLE';
}

export function reviewGateMessage(result: ReviewGateResult): string | null {
  if (result === 'REQUIRE_LOGIN') return 'Please log in to write a review.';
  if (result === 'ALREADY_REVIEWED') return 'You already reviewed this product.';
  if (result === 'NOT_PURCHASER') return 'Only purchasers can write a review.';
  return null;
}

