import { describe, expect, it } from 'vitest';
import { buildRevalidateTarget } from '@/app/api/revalidate/target';

// A DIRECT test, because the route-level suite structurally cannot see this.
// Inside the route the empty case is caught by three overlapping guards, so
// removing any one of them — even together with loosening the id regex — leaves
// every route test green. Verified by mutation before this file existed.
describe('buildRevalidateTarget', () => {
  it('THROWS on an empty id rather than degenerating to the parent', () => {
    // `/products/${''}` is `/products/`, which normalizes to the parent — the
    // whole-subtree purge. Under a tag scheme the same slip yields the bare
    // `pdp` tag, which sits on every PDP entry. Same blast radius, new name.
    expect(() => buildRevalidateTarget('')).toThrow(/non-empty/);
  });

  it('builds exactly one product path for a real id', () => {
    expect(buildRevalidateTarget('sig_abc')).toBe('/products/sig_abc');
    expect(buildRevalidateTarget('mintree:bc2bb213984257bc')).toBe(
      '/products/mintree:bc2bb213984257bc',
    );
  });

  it('never returns the parent path for any input it accepts', () => {
    for (const id of ['sig_a', 'ck_b', 'pg_c', 'ext_d', 'm:e']) {
      const target = buildRevalidateTarget(id);
      expect(target).not.toBe('/products');
      expect(target).not.toBe('/products/');
      expect(target.startsWith('/products/')).toBe(true);
      expect(target.length).toBeGreaterThan('/products/'.length);
    }
  });
});
