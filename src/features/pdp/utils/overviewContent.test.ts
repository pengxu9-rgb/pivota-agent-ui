import { describe, expect, it } from 'vitest';
import { buildOverviewContent } from './overviewContent';

describe('buildOverviewContent', () => {
  it('extracts summary, highlights, facts, and body while dropping structured duplicate sections', () => {
    const content = buildOverviewContent({
      description: `
        A plush cream-serum that softens dry, stressed skin.

        Benefits
        - Cushions dehydration
        - Helps support the moisture barrier

        Skin Type: Dry, sensitive
        Finish: Soft glow

        INGREDIENTS
        Water, Glycerin, Ceramide NP
      `,
      section: {
        heading: 'Clinical Results',
        content_type: 'text',
        content: 'Clinically shown to reduce visible tightness after one week.',
      },
      hideStructuredDuplicates: true,
    });

    expect(content).not.toBeNull();
    expect(content?.summary).toContain('plush cream-serum');
    expect(content?.eyebrow).toBe('Clinical Results');
    expect(content?.highlights).toEqual(
      expect.arrayContaining(['Cushions dehydration', 'Helps support the moisture barrier']),
    );
    expect(content?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Skin Type', value: 'Dry, sensitive' }),
        expect.objectContaining({ label: 'Finish', value: 'Soft glow' }),
      ]),
    );
    expect(content?.body).toContain('Clinically shown to reduce visible tightness after one week.');
    expect(content?.body.join(' ')).not.toMatch(/Water, Glycerin, Ceramide NP/i);
  });

  it('splits flattened inline labels into scan-friendly facts and highlights', () => {
    const content = buildOverviewContent({
      description:
        'Key Notes Skin Type For All Skin Types Finish Matte, Shimmer Coverage Buildable The unmistakable TOM FORD T is emblazoned on the compact. Benefits Eye Color Quad Creme: - Fade-resistant - Ultra-silky application - Longwearing What Else You Need To Know Free From Formaldehyde, Mineral Oil, Parabens.',
      hideStructuredDuplicates: true,
    });

    expect(content).not.toBeNull();
    expect(content?.summary).toContain('The unmistakable TOM FORD T');
    expect(content?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Skin Type', value: 'For All Skin Types' }),
        expect.objectContaining({ label: 'Finish', value: 'Matte, Shimmer' }),
        expect.objectContaining({ label: 'Coverage', value: 'Buildable' }),
      ]),
    );
    expect(content?.highlights).toEqual(
      expect.arrayContaining([
        'Fade-resistant',
        'Ultra-silky application',
        'Longwearing',
      ]),
    );
    expect(content?.highlights.join(' ')).toMatch(/Free from Formaldehyde/i);
    expect(content?.body).toEqual([]);
  });

  it('maps heading and value paragraphs into stable facts and highlights', () => {
    const content = buildOverviewContent({
      description: `
        The formula merges hydrating skincare ingredients with imperfection-blurring makeup technology.

        FINISH

        Matte, Natural/Satin

        COVERAGE

        Buildable, Full

        BENEFITS

        - Soft-focus powders offer a natural, soft-matte finish
        - Weightless spherical powders provide comfortable, non-drying wear
      `,
      hideStructuredDuplicates: true,
    });

    expect(content).not.toBeNull();
    expect(content?.summary).toContain('imperfection-blurring makeup technology');
    expect(content?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Finish', value: 'Matte, Natural/Satin' }),
        expect.objectContaining({ label: 'Coverage', value: 'Buildable, Full' }),
      ]),
    );
    expect(content?.facts.filter((item) => item.label === 'Finish')).toHaveLength(1);
    expect(content?.highlights).toEqual(
      expect.arrayContaining([
        'Soft-focus powders offer a natural, soft-matte finish',
        'Weightless spherical powders provide comfortable, non-drying wear',
      ]),
    );
  });

  it('keeps structured overview fact labels unique when benefits follow on later lines', () => {
    const content = buildOverviewContent({
      description:
        'The formula merges hydrating skincare ingredients with imperfection-blurring makeup technology. It features hyaluronic acid for instant and 12-hour hydration and vitamin E for antioxidant protection. Spherical powders ensure silky-smooth, seamless application for comfortable, non-drying wear.',
      section: {
        heading: 'Overview',
        content_type: 'text',
        content: `Skin Type: Combination, Dry, For All Skin Types, Normal, Oily, Sensitive
Finish: Matte, Natural/Satin
Coverage: Buildable, Full

Benefits
- Imperfection blurring makeup technology corrects and conceals to diminish the look of imperfections, dark spots, undereye circles and hyperpigmentation
- Soft-focus powders offer a natural, soft-matte finish
- Weightless spherical powders provide comfortable, non-drying wear
- Hyaluronic acid plumps skin through moisture, reducing the look of lines – immediately and for 12 hours
- Vitamin E provides antioxidant protection for skin
- Transfer, sweat, and humidity-resistant and waterproof
- Non-caking, poring, and crease-resistant
- Encased in a luxe, highly covetable, matte mahogany-hued portable stick format for on-the-go ease`,
      },
      hideStructuredDuplicates: true,
    });

    expect(content).not.toBeNull();
    expect(content?.facts).toEqual([
      { label: 'Skin Type', value: 'Combination, Dry, For All Skin Types, Normal, Oily, Sensitive' },
      { label: 'Finish', value: 'Matte, Natural/Satin' },
      { label: 'Coverage', value: 'Buildable, Full' },
    ]);
    expect(content?.highlights).toEqual(
      expect.arrayContaining([
        'Imperfection blurring makeup technology corrects and conceals to diminish the look of imperfections, dark spots, undereye circles and hyperpigmentation',
        'Soft-focus powders offer a natural, soft-matte finish',
        'Weightless spherical powders provide comfortable, non-drying wear',
        'Hyaluronic acid plumps skin through moisture, reducing the look of lines – immediately and for 12 hours',
      ]),
    );
  });
});
