import { describe, expect, it } from 'vitest';
import {
  chooseProductDetailsData,
  hasLowQualityOverviewSection,
} from './pdpDisplaySanitizers';

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

  it('keeps long overview prose when section labels are not explicitly dumped', () => {
    expect(
      hasLowQualityOverviewSection({
        sections: [
          {
            heading: 'Description',
            content_type: 'text',
            content:
              'This mineral sunscreen has a flexible tint, a balanced finish, and a formula designed for everyday wear. '.repeat(8) +
              'It mentions ingredients, benefits, coverage, finish, and how to use context in normal prose without turning those words into section headers.',
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

  it('still blocks legacy section-soup overview copy separated by lines', () => {
    expect(
      hasLowQualityOverviewSection({
        sections: [
          {
            heading: 'Description',
            content_type: 'text',
            content:
              'Description\nA lightweight daily fluid sunscreen.\nBenefits\nHydrates and controls shine.\nHow to Use\nApply after skincare.\nIngredients\nZinc Oxide, Water, Glycerin.',
          },
        ],
      }),
    ).toBe(true);
  });

  it('keeps the first trusted section when duplicate headings collide across facts and supplemental details', () => {
    const result = chooseProductDetailsData({
      productFacts: {
        sections: [
          {
            heading: 'Clinical Results',
            content_type: 'text',
            content: 'Clinically shown to calm visible redness in 7 days.',
          },
        ],
      },
      productOverview: {
        sections: [
          {
            heading: 'Overview',
            content_type: 'text',
            content: 'Barrier-support primer with niacinamide.',
          },
        ],
      },
      supplementalDetails: {
        sections: [
          {
            heading: 'Clinical Results',
            content_type: 'text',
            content: 'Second merchant block that should not render as a duplicate accordion row.',
          },
          {
            heading: 'How to Pair',
            content_type: 'text',
            content: 'Pair with a hydrating sunscreen.',
          },
        ],
      },
      hasStructuredBlocks: true,
    });

    expect(result?.sections).toEqual([
      expect.objectContaining({ heading: 'Overview' }),
      expect.objectContaining({
        heading: 'Clinical Results',
        content: 'Clinically shown to calm visible redness in 7 days.',
      }),
      expect.objectContaining({ heading: 'How to Pair' }),
    ]);
  });
});
