import { describe, expect, it } from 'vitest';

import { normalizeProductDescriptionText } from './api';

describe('normalizeProductDescriptionText', () => {
  it('strips HTML tags and decodes common entities', () => {
    const normalized = normalizeProductDescriptionText(
      '<p>Glow&nbsp;serum &amp; toner</p><div>Use&nbsp;<strong>daily</strong><br/>Morning&nbsp;and&nbsp;night</div>',
    );

    expect(normalized).toBe('Glow serum & toner\nUse daily\nMorning and night');
  });
});
