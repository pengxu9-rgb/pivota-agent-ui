import { describe, expect, it } from 'vitest';
import { foldMerchantHost, readReapCheckout } from './checkoutView';
import { formatMinorAmount } from './formatMinor';
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
  viewUnavailableCheckout,
  withSeller,
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

describe('formatMinorAmount', () => {
  it('formats by the currency\'s own fraction digits, and prints no raw minor units without a currency', () => {
    expect(formatMinorAmount(1884, 'USD')).toBe('$18.84');
    expect(formatMinorAmount(-320, 'USD')).toBe('−$3.20');
    expect(formatMinorAmount(1884, 'JPY')).toBe('¥1,884');
    for (const c of [null, '', 'usd', 'US']) expect(formatMinorAmount(1884, c)).toBe('—');
  });
});

describe('the published seller (reap.merchant_domain / reap.merchant_id at $.line_items[0])', () => {
  it('reads the judydoll external-seed answer: domain only, merchant id absent', () => {
    expect(readReapCheckout(resolvingCheckout())!.publishedSeller).toEqual({ domain: 'judydoll.com', merchantId: null });
  });

  it('reads both when published; www. is kept as published and folded only for comparison', () => {
    const v = withSeller({ domain: 'www.brand.com', merchantId: 'm_brand' }, () => readReapCheckout(awaitingApprovalCheckout()))!;
    expect(v.publishedSeller).toEqual({ domain: 'www.brand.com', merchantId: 'm_brand' });
    expect(foldMerchantHost(v.publishedSeller.domain)).toBe('brand.com');
  });

  it('the degraded read publishes none', () => {
    expect(readReapCheckout(viewUnavailableCheckout())!.publishedSeller).toEqual({ domain: null, merchantId: null });
  });

  it('only an info message at exactly $.line_items[0] counts; a malformed host is ignored', () => {
    const base = withSeller({ domain: null }, () => awaitingApprovalCheckout()) as any;
    const at = (path: string, content: string, type = 'info') => ({
      ...base,
      messages: [{ type, code: 'reap.merchant_domain', path, content, content_type: 'plain' }, ...base.messages],
    });
    expect(readReapCheckout(at('$', 'judydoll.com'))!.publishedSeller.domain).toBeNull();
    expect(readReapCheckout(at('$.line_items[0]', 'judydoll.com', 'warning'))!.publishedSeller.domain).toBeNull();
    for (const bad of ['https://judydoll.com', 'judydoll', 'JUDYDOLL.COM', 'judydoll.com/x', 'judy doll.com', '']) {
      expect(readReapCheckout(at('$.line_items[0]', bad))!.publishedSeller.domain, bad).toBeNull();
    }
  });

  it('foldMerchantHost: lowercase, ONE leading www. removed, never a URL', () => {
    expect(foldMerchantHost('WWW.Brand.com')).toBe('brand.com');
    expect(foldMerchantHost('www.www.brand.com')).toBe('www.brand.com');
    expect(foldMerchantHost('wwwbrand.com')).toBe('wwwbrand.com');
    expect(foldMerchantHost('shop.brand.com')).toBe('shop.brand.com');
    for (const bad of ['https://brand.com', 'brand', 'brand.com:443', '', null, 7]) expect(foldMerchantHost(bad)).toBeNull();
  });
});
