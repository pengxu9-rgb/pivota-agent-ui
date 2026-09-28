import { describe, expect, it } from 'vitest';
import { readReapCheckout } from './checkoutView';
import {
  HOSTED_URL,
  REAP_ID,
  awaitingApprovalCheckout,
  canceledCheckout,
  completedCheckout,
  deadlinePassedCheckout,
  needsEnrollmentCheckout,
  processingCheckout,
  resolvingCheckout,
  storefrontEscalation,
} from './__fixtures__/checkouts';

describe('readReapCheckout — the gateway Reap lane checkout, per state', () => {
  it('resolving/quoting: preparing, polls on the lane hint, echoes a pending code', () => {
    const v = readReapCheckout(resolvingCheckout({ code: 'PEACHIE20' }))!;
    expect(v).toMatchObject({ id: REAP_ID, isReapCheckout: true, status: 'incomplete', phase: 'preparing', terminal: false });
    expect(v.pollAfterSeconds).toBe(5);
    expect(v.offerCode).toEqual({ code: 'PEACHIE20', outcome: 'pending' });
    expect(v.continueUrl).toBeNull();
  });

  it('needs_enrollment: a card-entry hand-off', () => {
    const v = readReapCheckout(needsEnrollmentCheckout())!;
    expect(v.phase).toBe('needs_card');
    expect(v.continueUrl).toBe('https://pay.prava.space/enroll/3fa85f64');
  });

  it('awaiting_approval: the checkout\'s own rows, in order, incl. a NEGATIVE discount; deadline', () => {
    const v = readReapCheckout(awaitingApprovalCheckout({ outcome: 'applied', deadline: '2026-09-29T10:05:00Z' }))!;
    expect(v.phase).toBe('awaiting_approval');
    expect(v.continueUrl).toBe(HOSTED_URL);
    expect(v.totals.map((r) => [r.type, r.amountMinor])).toEqual([
      ['subtotal', 1600],
      ['fulfillment', 500],
      ['tax', 104],
      ['discount', -320],
      ['total', 1884],
    ]);
    expect(v.approvalDeadline).toBe('2026-09-29T10:05:00.000Z');
    expect(v.offerCode.outcome).toBe('applied');
    expect(v.taxIncluded).toBe(false);
  });

  it('a dropped code is "not applied" (invalid and expired)', () => {
    expect(readReapCheckout(awaitingApprovalCheckout({ outcome: 'dropped_invalid' }))!.offerCode.outcome).toBe('not_applied_invalid');
    expect(readReapCheckout(awaitingApprovalCheckout({ outcome: 'dropped_expired' }))!.offerCode.outcome).toBe('not_applied_expired');
  });

  it('tax included in prices is read from the total row, never computed', () => {
    const v = readReapCheckout(awaitingApprovalCheckout({ taxIncluded: true }))!;
    expect(v.taxIncluded).toBe(true);
    expect(v.totals.some((r) => r.type === 'tax')).toBe(false);
    expect(v.currency).toBe('SGD');
  });

  it('a continue_url that is not Reap\'s is refused, never forwarded', () => {
    for (const bad of ['https://reap.global.evil.com/x', 'http://pay.reap.global/x', 'https://evilreap.global/x']) {
      const v = readReapCheckout(awaitingApprovalCheckout({ continueUrl: bad }))!;
      expect(v.continueUrl).toBeNull();
      expect(v.continueUrlRefused).toBe(true);
    }
  });

  it('deadline passed: not terminal, keep polling for the final state', () => {
    const v = readReapCheckout(deadlinePassedCheckout())!;
    expect(v.phase).toBe('deadline_passed');
    expect(v.terminal).toBe(false);
  });

  it('processing, completed (order reference)', () => {
    expect(readReapCheckout(processingCheckout())!.phase).toBe('processing');
    const done = readReapCheckout(completedCheckout())!;
    expect(done).toMatchObject({ phase: 'completed', terminal: true, orderReference: '#JD1042', pollAfterSeconds: null });
  });

  it('canceled: failed / expired / refused, with the named reason', () => {
    const f = readReapCheckout(canceledCheckout('failed', 'approval_window_lapsed'))!;
    expect(f).toMatchObject({ phase: 'failed', terminal: true, terminalReason: 'approval_window_lapsed' });
    expect(readReapCheckout(canceledCheckout('expired'))!.phase).toBe('expired');
    expect(readReapCheckout(canceledCheckout('refused', 'price_changed'))!).toMatchObject({ phase: 'refused', terminalReason: 'price_changed' });
  });

  it('a storefront answer is NOT a Reap checkout and never yields a link', () => {
    const v = readReapCheckout(storefrontEscalation({ codeWarning: true }))!;
    expect(v.isReapCheckout).toBe(false);
    expect(v.continueUrl).toBeNull();
    expect(v.offerCode.outcome).toBe('not_applied_invalid');
  });

  it('non-checkouts read as null', () => {
    for (const bad of [null, 'x', [], {}, { id: 'reap_x' }, { status: 'completed' }]) {
      expect(readReapCheckout(bad)).toBeNull();
    }
  });
});
