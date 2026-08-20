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

  // R8: these were allowlisted and are not any more. Driving BOTH sides of the split - the hosts we
  // control still pass - is what proves the allowlist is doing the work rather than the function
  // simply rejecting everything.
  it('refuses the Railway PaaS wildcard as a return target', () => {
    expect(safeReturnUrl('https://anything.railway.app/pwn')).toBeNull()
    expect(safeReturnUrl('https://someone-elses-app.up.railway.app/pwn')).toBeNull()
    // A lookalike that merely CONTAINS the suffix must also be refused, not accidentally admitted.
    expect(safeReturnUrl('https://railway.app.evil.example/pwn')).toBeNull()
  })

  it('refuses pivota.com, which Pivota does not own', () => {
    expect(safeReturnUrl('https://pivota.com/pwn')).toBeNull()
    expect(safeReturnUrl('https://checkout.pivota.com/pwn')).toBeNull()
  })

  it('still admits the hosts we do control', () => {
    expect(safeReturnUrl('https://pivota.cc/x')).toBe('https://pivota.cc/x')
    expect(safeReturnUrl('https://agent.pivota.cc/x')).toBe('https://agent.pivota.cc/x')
    expect(safeReturnUrl('https://gateway.pivota.cc/x')).toBe('https://gateway.pivota.cc/x')
    expect(safeReturnUrl('/relative/path')).toBe('/relative/path')
  })
});
