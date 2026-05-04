import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('references the public sitemap', () => {
    expect(robots().sitemap).toBe('https://agent.pivota.cc/sitemap.xml');
  });
});
