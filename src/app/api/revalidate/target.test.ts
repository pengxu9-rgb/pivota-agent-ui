import { describe, expect, it } from 'vitest';
import { buildRevalidateTarget } from '@/app/api/revalidate/target';

// A DIRECT test, because the route-level suite structurally cannot see this.
// Inside the route the empty case is caught by three overlapping guards, so
// removing any one of them — even together with loosening the id regex — leaves
// every route test green. Verified by mutation before this file existed.
describe('buildRevalidateTarget', () => {
  it('THROWS on an empty id rather than degenerating to the parent', () => {
    // `pdp:${''}` is the bare-ish `pdp:`, one careless trim away from `pdp`
    // itself — which sits on EVERY PDP entry. Same blast radius, new name.
    expect(() => buildRevalidateTarget('')).toThrow(/non-empty/);
  });

  it('builds exactly one product path for a real id', () => {
    expect(buildRevalidateTarget('sig_abc')).toBe('pdp:sig_abc');
    expect(buildRevalidateTarget('mintree:bc2bb213984257bc')).toBe(
      'pdp:mintree:bc2bb213984257bc',
    );
  });

  it('never returns the bare namespace for any input it accepts', () => {
    // `pdp` alone is on EVERY PDP entry — the full blast radius under a new name.
    for (const id of ['sig_a', 'ck_b', 'pg_c', 'ext_d', 'm:e', 'layout']) {
      const target = buildRevalidateTarget(id);
      expect(target).not.toBe('pdp');
      expect(target).not.toBe('pdp:');
      expect(target.startsWith('pdp:')).toBe(true);
      expect(target.length).toBeGreaterThan('pdp:'.length);
    }
  });
});
