import { describe, expect, it } from 'vitest';

import {
  appendCurrentPathAsReturn,
  isExternalAgentEntry,
  resolveExternalAgentHomeUrl,
  safeReturnUrl,
} from './returnUrl';

describe('safeReturnUrl', () => {
  it('accepts relative paths', () => {
    expect(safeReturnUrl('/products?q=serum')).toBe('/products?q=serum');
  });

  it('rejects disallowed hosts', () => {
    expect(safeReturnUrl('https://evil.example.com/path')).toBeNull();
  });
});

describe('appendCurrentPathAsReturn', () => {
  it('adds current path as return when missing', () => {
    window.history.replaceState({}, '', '/products?tab=recommended');
    const href = appendCurrentPathAsReturn('/products/9859804856648?merchant_id=merch_1');
    const parsed = new URL(href, 'https://agent.pivota.cc');
    expect(parsed.pathname).toBe('/products/9859804856648');
    expect(parsed.searchParams.get('merchant_id')).toBe('merch_1');
    expect(parsed.searchParams.get('return')).toBe('/products?tab=recommended');
  });

  it('keeps existing return param intact', () => {
    window.history.replaceState({}, '', '/products?tab=recommended');
    const href = appendCurrentPathAsReturn('/products/9859804856648?return=%2Fproducts%3Fq%3Dmask');
    const parsed = new URL(href, 'https://agent.pivota.cc');
    expect(parsed.searchParams.get('return')).toBe('/products?q=mask');
  });
});

describe('external agent helpers', () => {
  it('detects external agent entry names', () => {
    expect(isExternalAgentEntry('creator_agent')).toBe(true);
    expect(isExternalAgentEntry('aurora_beauty')).toBe(true);
    expect(isExternalAgentEntry('ugc_upload')).toBe(false);
  });

  it('resolves external home urls by entry', () => {
    expect(resolveExternalAgentHomeUrl('creator_agent')).toBe('https://creator.pivota.cc/');
    expect(resolveExternalAgentHomeUrl('aurora_chatbox')).toBe('https://aurora.pivota.cc/');
  });
});
