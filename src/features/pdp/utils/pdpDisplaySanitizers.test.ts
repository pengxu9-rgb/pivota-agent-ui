import { describe, expect, it } from 'vitest';
import { hasLowQualityOverviewSection } from './pdpDisplaySanitizers';

describe('pdpDisplaySanitizers', () => {
  it('keeps normal overview prose that mentions ingredients and coverage', () => {
    expect(
      hasLowQualityOverviewSection({
        sections: [
          {
            heading: 'Description',
            content_type: 'text',
            content:
              'Naturally radiant, this tinted fluid sunscreen celebrates your skin with balanced hydration. Its silky texture blends seamlessly for sheer, natural coverage that feels like skincare. Infused with hydrating ingredients and shine control, it leaves skin glowing yet balanced.',
          },
        ],
      }),
    ).toBe(false);
  });

  it('still blocks legacy section-soup overview copy', () => {
    expect(
      hasLowQualityOverviewSection({
        sections: [
          {
            heading: 'Description',
            content_type: 'text',
            content:
              'Description A lightweight daily fluid sunscreen. Benefits Hydrates and controls shine. How to Use Apply after skincare. Ingredients Zinc Oxide, Water, Glycerin.',
          },
        ],
      }),
    ).toBe(true);
  });
});
