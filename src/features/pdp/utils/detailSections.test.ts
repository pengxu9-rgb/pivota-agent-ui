import { describe, expect, it } from 'vitest';
import { partitionDetailSections } from './detailSections';

describe('partitionDetailSections', () => {
  it('keeps overview as the primary source while suppressing structured duplicate sections', () => {
    const result = partitionDetailSections([
      {
        heading: 'Overview',
        content_type: 'text',
        content: 'The formula blurs and hydrates.',
      },
      {
        heading: 'Ingredients',
        content_type: 'text',
        content: 'Water, Glycerin, Iron Oxides',
      },
      {
        heading: 'How to Use',
        content_type: 'text',
        content: 'Apply directly and blend.',
      },
      {
        heading: 'Clinical Results',
        content_type: 'text',
        content: 'Improves the look of discoloration over time.',
      },
      {
        heading: 'Brand Story',
        content_type: 'text',
        content: 'Crafted in Italy.',
      },
    ]);

    expect(result.overviewSection?.heading).toBe('Overview');
    expect(result.brandStorySection?.heading).toBe('Brand Story');
    expect(result.supplementalSections).toEqual([
      expect.objectContaining({
        heading: 'Clinical Results',
      }),
    ]);
  });

  it('does not allow ingredients or brand story to hijack the overview slot', () => {
    const result = partitionDetailSections([
      {
        heading: 'Ingredients',
        content_type: 'text',
        content: 'Water, Glycerin',
      },
      {
        heading: 'Brand Story',
        content_type: 'text',
        content: 'A runway-inspired complexion story.',
      },
      {
        heading: 'Clinical Results',
        content_type: 'text',
        content: 'Improves radiance in seven days.',
      },
    ]);

    expect(result.overviewSection?.heading).toBe('Clinical Results');
    expect(result.brandStorySection?.heading).toBe('Brand Story');
    expect(result.supplementalSections).toEqual([]);
  });

  it('preserves a non-duplicate Details section alongside the overview', () => {
    const result = partitionDetailSections([
      {
        heading: 'Overview',
        content_type: 'text',
        content: 'A balancing serum for breakout-prone skin.',
      },
      {
        heading: 'Details',
        content_type: 'text',
        content:
          'Targets the root cause of breakouts by balancing sebum production, supporting barrier health, and helping calm visible redness over time.',
      },
      {
        heading: 'How to Pair',
        content_type: 'text',
        content: 'Pair with a gentle cleanser and a lightweight moisturizer.',
      },
    ]);

    expect(result.overviewSection?.heading).toBe('Overview');
    expect(result.supplementalSections).toEqual([
      expect.objectContaining({ heading: 'Details' }),
      expect.objectContaining({ heading: 'How to Pair' }),
    ]);
  });
});
