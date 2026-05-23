import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config.mjs';

describe('next config htmlLimitedBots', () => {
  it('matches LLM, search, and social crawler user agents', () => {
    const htmlLimitedBots = nextConfig.htmlLimitedBots;

    expect(htmlLimitedBots).toBeInstanceOf(RegExp);

    [
      'GPTBot',
      'ClaudeBot',
      'anthropic-ai',
      'Google-Extended',
      'PerplexityBot',
      'cohere-ai',
      'Googlebot',
      'Mediapartners-Google',
      'Google-PageRenderer',
      'Chrome-Lighthouse',
      'bingbot',
      'Slurp',
      'DuckDuckBot',
      'Baiduspider',
      'YandexBot',
      'FacebookBot',
      'facebookexternalhit',
      'Twitterbot',
      'LinkedInBot',
      'Slackbot',
      'Discordbot',
    ].forEach((userAgent) => {
      expect(htmlLimitedBots?.test(userAgent)).toBe(true);
    });
  });

  it('does not disable streaming metadata for normal browser user agents', () => {
    expect(nextConfig.htmlLimitedBots?.test('Mozilla/5.0 AppleWebKit/537.36 Chrome/124')).toBe(
      false,
    );
  });
});
