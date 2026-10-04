import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_KEY_PREFIX, readActiveFlag, writeActiveCheckoutId, markActive, hasPaymentRisk, hasUnsettledEvidence, preserveActiveEvidence, persistCheckoutEvidence } from './recoveryMarkers';
import { PRODUCT_ID, REAP_ID } from './__fixtures__/checkouts';
const OTHER = REAP_ID.replace('0123456789abcdef01234567', 'fedcba9876543210fedcba98');
beforeEach(() => localStorage.clear());
describe('checkout-bound monotonic evidence', () => {
  it('enrollment only is distinct from approval, including after a same-id resave', () => {
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    expect(markActive(PRODUCT_ID, 'enrollmentOpened', REAP_ID)).toBe(true);
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    expect(readActiveFlag(PRODUCT_ID, 'enrollmentOpened')).toBe(true);
    expect(hasPaymentRisk(PRODUCT_ID, REAP_ID)).toBe(false);
    expect(markActive(PRODUCT_ID, 'approvalOpened', REAP_ID)).toBe(true);
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    expect(hasPaymentRisk(PRODUCT_ID, REAP_ID)).toBe(true);
  });
  it('a stale enrollment write cannot erase approval even if the replaceable active record is overwritten', () => {
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    markActive(PRODUCT_ID, 'approvalOpened', REAP_ID);
    localStorage.setItem(ACTIVE_KEY_PREFIX + PRODUCT_ID, JSON.stringify({ id: REAP_ID, at: 1, enrollmentOpened: true }));
    expect(markActive(PRODUCT_ID, 'enrollmentOpened', REAP_ID)).toBe(true);
    expect(hasPaymentRisk(PRODUCT_ID, REAP_ID)).toBe(true);
  });
  it('keeps legacy handedOff ambiguous and preserves the old event payload after an id swap', () => {
    const old = JSON.stringify({ id: REAP_ID, at: 1, handedOff: true });
    localStorage.setItem(ACTIVE_KEY_PREFIX + PRODUCT_ID, JSON.stringify({ id: OTHER, at: 2 }));
    preserveActiveEvidence(PRODUCT_ID, old);
    expect(hasPaymentRisk(PRODUCT_ID, REAP_ID)).toBe(true);
    expect(hasPaymentRisk(PRODUCT_ID, OTHER)).toBe(false);
    expect(hasUnsettledEvidence(PRODUCT_ID)).toBe(true);
  });
  it('rejects stale-id handoff and refuses to replace the product pointer implicitly', () => {
    writeActiveCheckoutId(PRODUCT_ID, OTHER);
    expect(markActive(PRODUCT_ID, 'approvalOpened', REAP_ID)).toBe(false);
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    expect(JSON.parse(localStorage.getItem(ACTIVE_KEY_PREFIX + PRODUCT_ID)!).id).toBe(OTHER);
  });
  it('no-dispatch terminal evidence never overrides earlier unknown/positive evidence', () => {
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    persistCheckoutEvidence(PRODUCT_ID, REAP_ID, 'dispatchRisk');
    persistCheckoutEvidence(PRODUCT_ID, REAP_ID, 'noDispatchTerminal');
    expect(hasUnsettledEvidence(PRODUCT_ID)).toBe(true);
    persistCheckoutEvidence(PRODUCT_ID, REAP_ID, 'completed');
    expect(hasUnsettledEvidence(PRODUCT_ID)).toBe(false);
  });
  it('failed durability refuses a handoff', () => {
    writeActiveCheckoutId(PRODUCT_ID, REAP_ID);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
    expect(markActive(PRODUCT_ID, 'enrollmentOpened', REAP_ID)).toBe(false);
    spy.mockRestore();
  });
});
