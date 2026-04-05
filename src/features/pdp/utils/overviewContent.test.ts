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
});
