import { describe, expect, it } from 'vitest';
import {
  resolveReviewGate,
  reviewGateMessage,
  reviewGateResultToReason,
} from './reviewGate';

describe('reviewGate', () => {
  it('requires login when user is not authenticated', () => {
    const result = resolveReviewGate({
      isAuthenticated: false,
      canWriteReview: true,
      reason: null,
    });
    expect(result).toBe('REQUIRE_LOGIN');
  });

  it('allows write when UGC capabilities permit writing', () => {
    const result = resolveReviewGate({
      isAuthenticated: true,
      canWriteReview: true,
      reason: null,
    });
    expect(result).toBe('ALLOW_WRITE');
  });

  it('maps UGC ALREADY_REVIEWED reason correctly', () => {
    const result = resolveReviewGate({
      isAuthenticated: true,
      canWriteReview: false,
      reason: 'ALREADY_REVIEWED',
    });
    expect(result).toBe('ALREADY_REVIEWED');
  });

  it('maps eligibility NOT_PURCHASER reason correctly', () => {
    const result = resolveReviewGate({
      isAuthenticated: true,
      eligibility: {
        eligible: false,
        reason: 'NOT_PURCHASER',
      },
    });
    expect(result).toBe('NOT_PURCHASER');
  });

  it('fails open to allow when authenticated and eligibility is unavailable', () => {
    const result = resolveReviewGate({
      isAuthenticated: true,
      eligibility: null,
    });
    expect(result).toBe('ALLOW_WRITE');
  });

  it('maps gate results to reason and user-facing message', () => {
    expect(reviewGateResultToReason('ALLOW_WRITE')).toBe('ELIGIBLE');
    expect(reviewGateResultToReason('REQUIRE_LOGIN')).toBe('NOT_AUTHENTICATED');
    expect(reviewGateResultToReason('ALREADY_REVIEWED')).toBe('ALREADY_REVIEWED');
    expect(reviewGateResultToReason('NOT_PURCHASER')).toBe('NOT_PURCHASER');

    expect(reviewGateMessage('ALLOW_WRITE')).toBeNull();
    expect(reviewGateMessage('REQUIRE_LOGIN')).toBe('Please log in to write a review.');
    expect(reviewGateMessage('ALREADY_REVIEWED')).toBe('You already reviewed this product.');
    expect(reviewGateMessage('NOT_PURCHASER')).toBe('Only purchasers can write a review.');
  });
});

