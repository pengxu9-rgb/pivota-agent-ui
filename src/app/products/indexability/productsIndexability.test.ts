import { describe, expect, it } from 'vitest';
import { buildPaginationLinks } from './productsIndexability';

describe('buildPaginationLinks', () => {
  it('returns dense list when totalPages ≤ 7', () => {
    expect(buildPaginationLinks(1, 1)).toEqual([1]);
    expect(buildPaginationLinks(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPaginationLinks(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around current page on long pagination', () => {
    // page 5 of 20 → [1, …, 3, 4, 5, 6, 7, …, 20]
    const out = buildPaginationLinks(5, 20);
    expect(out).toEqual([1, null, 3, 4, 5, 6, 7, null, 20]);
  });

  it('handles edge near page 1', () => {
    const out = buildPaginationLinks(1, 20);
    expect(out).toEqual([1, 2, 3, null, 20]);
  });

  it('handles edge near last page', () => {
    const out = buildPaginationLinks(20, 20);
    expect(out).toEqual([1, null, 18, 19, 20]);
  });

  it('avoids "..." when window is adjacent to anchor', () => {
    // page 3 of 20 → [1, 2, 3, 4, 5, ..., 20] (no gap between 1 and 2)
    const out = buildPaginationLinks(3, 20);
    expect(out).toEqual([1, 2, 3, 4, 5, null, 20]);
  });

  it('returns minimal anchor list when totalPages is unknown', () => {
    expect(buildPaginationLinks(1, null)).toEqual([1]);
    expect(buildPaginationLinks(5, null)).toEqual([4, 5]);
  });
});
