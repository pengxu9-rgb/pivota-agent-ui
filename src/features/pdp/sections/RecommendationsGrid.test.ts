import { describe, expect, it } from 'vitest';
import { optimizeRecommendationImageUrl } from './RecommendationsGrid';

describe('optimizeRecommendationImageUrl', () => {
  it('adds width hint to proxied image URLs', () => {
    const out = optimizeRecommendationImageUrl(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Ftest.jpg',
      420,
    );
    const parsed = new URL(out, 'http://localhost');
    expect(parsed.pathname).toBe('/api/image-proxy');
    expect(parsed.searchParams.get('w')).toBe('420');
    const inner = new URL(parsed.searchParams.get('url') || '');
    expect(inner.toString()).toBe('https://cdn.shopify.com/s/files/1/test.jpg?width=420');
  });

  it('unwraps nested image-proxy URL once', () => {
    const nested = `/api/image-proxy?url=${encodeURIComponent(
      '/api/image-proxy?url=https%3A%2F%2Fcdn.shopify.com%2Fs%2Ffiles%2F1%2Fnested.jpg',
    )}`;
    const out = optimizeRecommendationImageUrl(nested, 512);
    const parsed = new URL(out, 'http://localhost');
    expect(parsed.pathname).toBe('/api/image-proxy');
    const inner = new URL(parsed.searchParams.get('url') || '');
    expect(inner.toString()).toBe('https://cdn.shopify.com/s/files/1/nested.jpg?width=512');
    expect(parsed.searchParams.get('w')).toBe('512');
  });

  it('keeps non-proxy relative URLs unchanged', () => {
    const out = optimizeRecommendationImageUrl('/images/local-product.jpg');
    expect(out).toBe('/images/local-product.jpg');
  });
});
