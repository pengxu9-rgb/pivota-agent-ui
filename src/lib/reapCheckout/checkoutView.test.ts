import { describe, expect, it } from 'vitest';
import { foldMerchantHost, isCheckoutForItem, readReapCheckout } from './checkoutView';
import { formatMinorAmount } from './formatMinor';
import {
  HOSTED_URL,
  PRODUCT_ID,
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
    expect(readReapCheckout(resolvingCheckout())!.publishedSeller).toEqual({ domain: 'judydoll.com', merchantId: null, merchantIdUnusable: false });
  });

  it('reads both when published; www. is kept as published and folded only for comparison', () => {
    const v = withSeller({ domain: 'www.brand.com', merchantId: 'm_brand' }, () => readReapCheckout(awaitingApprovalCheckout()))!;
    expect(v.publishedSeller).toEqual({ domain: 'www.brand.com', merchantId: 'm_brand', merchantIdUnusable: false });
    expect(foldMerchantHost(v.publishedSeller.domain)).toBe('brand.com');
  });

  it('the degraded read publishes none', () => {
    expect(readReapCheckout(viewUnavailableCheckout())!.publishedSeller).toEqual({ domain: null, merchantId: null, merchantIdUnusable: false });
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

  it('two DIFFERENT published domains count as none (fail closed); the same one twice still counts', () => {
    const base = withSeller({ domain: null }, () => awaitingApprovalCheckout()) as any;
    const msg = (content: string) => ({ type: 'info', code: 'reap.merchant_domain', path: '$.line_items[0]', content, content_type: 'plain' });
    const conflicting = { ...base, messages: [msg('judydoll.com'), msg('other-seller.com'), ...base.messages] };
    expect(readReapCheckout(conflicting)!.publishedSeller.domain).toBeNull();
    const reversed = { ...base, messages: [msg('other-seller.com'), msg('judydoll.com'), ...base.messages] };
    expect(readReapCheckout(reversed)!.publishedSeller.domain).toBeNull();
    const repeated = { ...base, messages: [msg('judydoll.com'), msg('judydoll.com'), ...base.messages] };
    expect(readReapCheckout(repeated)!.publishedSeller.domain).toBe('judydoll.com');
  });

  it('foldMerchantHost: lowercase, ONE leading www. removed, never a URL', () => {
    expect(foldMerchantHost('WWW.Brand.com')).toBe('brand.com');
    expect(foldMerchantHost('www.www.brand.com')).toBe('www.brand.com');
    expect(foldMerchantHost('wwwbrand.com')).toBe('wwwbrand.com');
    expect(foldMerchantHost('shop.brand.com')).toBe('shop.brand.com');
    for (const bad of ['https://brand.com', 'brand', 'brand.com:443', '', null, 7]) expect(foldMerchantHost(bad)).toBeNull();
  });
});

describe('P3 follow-ups of #384: merchant id conflicts, the echoed item id', () => {
  const idMsg = (content: string, extra: Record<string, unknown> = {}) => ({
    type: 'info',
    code: 'reap.merchant_id',
    path: '$.line_items[0]',
    content,
    content_type: 'plain',
    ...extra,
  });
  const withIds = (...msgs: unknown[]) => {
    const base = withSeller({ domain: 'jsmbeauty.sg' }, () => awaitingApprovalCheckout()) as any;
    return readReapCheckout({ ...base, messages: [...msgs, ...base.messages] })!.publishedSeller;
  };

  it('two DIFFERENT published merchant ids are UNUSABLE (fail closed), in either order — not "absent"', () => {
    expect(withIds(idMsg('merch_jsm_demo'), idMsg('m_other'))).toEqual({
      domain: 'jsmbeauty.sg',
      merchantId: null,
      merchantIdUnusable: true,
    });
    expect(withIds(idMsg('m_other'), idMsg('merch_jsm_demo')).merchantIdUnusable).toBe(true);
  });

  it('a malformed published merchant id is unusable too (never read as "no id")', () => {
    for (const bad of ['', 'm id', 'm/x', 'x'.repeat(121)]) {
      expect(withIds(idMsg(bad)), JSON.stringify(bad)).toMatchObject({ merchantId: null, merchantIdUnusable: true });
    }
  });

  it('accepting: none published, one published, or the same one twice', () => {
    expect(withIds()).toEqual({ domain: 'jsmbeauty.sg', merchantId: null, merchantIdUnusable: false });
    expect(withIds(idMsg('merch_jsm_demo'))).toEqual({ domain: 'jsmbeauty.sg', merchantId: 'merch_jsm_demo', merchantIdUnusable: false });
    expect(withIds(idMsg('merch_jsm_demo'), idMsg('merch_jsm_demo')).merchantIdUnusable).toBe(false);
    // Not published per the contract (wrong path / type): ignored, not unusable.
    expect(withIds(idMsg('m_other', { path: '$' }), idMsg('m_x', { type: 'warning' }))).toEqual({
      domain: 'jsmbeauty.sg',
      merchantId: null,
      merchantIdUnusable: false,
    });
  });

  it('the echoed line_items[0].item.id is read as sent, on a good read and on the degraded one', () => {
    expect(readReapCheckout(awaitingApprovalCheckout())!.lineItems[0].itemId).toBe(PRODUCT_ID);
    expect(readReapCheckout(viewUnavailableCheckout())!.lineItems[0].itemId).toBe(PRODUCT_ID);
  });

  it('isCheckoutForItem: only the exact product asked for', () => {
    const v = readReapCheckout(awaitingApprovalCheckout())!;
    expect(isCheckoutForItem(v, PRODUCT_ID)).toBe(true);
    for (const asked of ['sig_other', PRODUCT_ID.toUpperCase(), `${PRODUCT_ID}x`, PRODUCT_ID.slice(0, -1), ` ${PRODUCT_ID}`, '']) {
      expect(isCheckoutForItem(v, asked), asked).toBe(false);
    }
    const line = (item: unknown) => {
      const base = awaitingApprovalCheckout() as any;
      return readReapCheckout({ ...base, line_items: [{ ...base.line_items[0], item }] })!;
    };
    // No echoed id (absent, empty, not a string) is never "this product".
    for (const item of [{ title: 'x', price: 1 }, { id: '', title: 'x' }, { id: 7, title: 'x' }]) {
      expect(isCheckoutForItem(line(item), PRODUCT_ID), JSON.stringify(item)).toBe(false);
    }
    expect(isCheckoutForItem({ lineItems: [] }, PRODUCT_ID)).toBe(false);
    expect(isCheckoutForItem({ lineItems: [{ itemId: '', title: 'x', quantity: 1, unitPriceMinor: null }] }, '')).toBe(false);
  });
});

describe('authoritative dispatch and contact re-entry messages', () => {
  const message = (code: string, content: string) => ({ type: 'info', code, content, path: '$.status' });
  const checkout = (messages: unknown[], status = 'incomplete') => readReapCheckout({ id: 'reap_test', status, messages })!;
  it.each([[], [message('reap.checkout_dispatch_state', 'invalid')], [message('reap.checkout_dispatch_state', 'not_dispatched'), message('reap.checkout_dispatch_state', 'dispatched')], [{ ...message('reap.checkout_dispatch_state', 'not_dispatched'), path: '$' }]].map((messages) => ({ messages })))('missing/malformed/conflicting evidence is unknown: %j', ({ messages }) => {
    expect(checkout(messages).checkoutDispatchState).toBe('unknown');
    expect(checkout(messages).contactReentryRequired).toBe(false);
  });
  it.each(['not_dispatched', 'dispatch_started', 'dispatched', 'unknown'])('preserves explicit state %s', (state) => {
    const view = checkout([message('reap.checkout_dispatch_state', state), message('reap.contact_reentry_required', 'true')]);
    expect(view.checkoutDispatchState).toBe(state);
    expect(view.contactReentryRequired).toBe(state === 'not_dispatched');
  });
  it.each(['canceled', 'completed'])('terminal %s cannot become contact re-entry', (status) => {
    expect(checkout([message('reap.checkout_dispatch_state', 'not_dispatched'), message('reap.contact_reentry_required', 'true')], status).contactReentryRequired).toBe(false);
  });
  it('conflicting contact flags fail closed', () => {
    expect(checkout([message('reap.checkout_dispatch_state', 'not_dispatched'), message('reap.contact_reentry_required', 'true'), message('reap.contact_reentry_required', 'false')]).contactReentryRequired).toBe(false);
  });
});

it('a typed gateway review warning disables contact reentry without inventing approval or dispatch', () => {
  const raw = { id: 'reap_test', status: 'incomplete', messages: [
    { type: 'info', code: 'reap.checkout_dispatch_state', content: 'not_dispatched', path: '$.status' },
    { type: 'info', code: 'reap.contact_reentry_required', content: 'true', path: '$.status' },
    { type: 'warning', code: 'reap.checkout_requires_review', content: 'fixed review notice', path: '$.status' },
  ] };
  const view = readReapCheckout(raw)!;
  expect(view.reviewRequired).toBe(true); expect(view.contactReentryRequired).toBe(false);
  expect(view.checkoutDispatchState).toBe('not_dispatched'); expect(view.phase).toBe('preparing');
});
it.each([
  { type: 'info', code: 'reap.checkout_requires_review', path: '$.status' },
  { type: 'warning', code: 'reap.checkout_requires_review', path: '$.provider' },
  { type: 'warning', code: 'arbitrary_provider_code', path: '$.status' },
])('unrecognized provider-shaped message is not review or approval authority: %j', (message) => {
  const view = readReapCheckout({ id: 'reap_test', status: 'incomplete', messages: [{ ...message, content: 'approved' }] })!;
  expect(view.reviewRequired).toBe(false); expect(view.phase).toBe('preparing');
  expect(view.checkoutDispatchState).toBe('unknown');
});
