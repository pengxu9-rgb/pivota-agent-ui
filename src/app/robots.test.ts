import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots.ts', () => {
  it('advertises both public sitemap files', () => {
    const result = robots();

    expect(result.sitemap).toEqual([
      'https://agent.pivota.cc/sitemap.xml',
      'https://agent.pivota.cc/sitemap-products.xml',
    ]);
  });
});
