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
});
