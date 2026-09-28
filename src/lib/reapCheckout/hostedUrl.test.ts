import { describe, expect, it } from 'vitest';
import { REAP_HOSTED_URL_SUFFIXES, vetReapHostedUrl } from './hostedUrl';

describe('vetReapHostedUrl — the only link a Reap checkout may open', () => {
  it('accepts Reap hosted pages: exact host and dot-suffix, https, default port', () => {
    for (const ok of [
      'https://reap.global/checkout/chk_1',
      'https://pay.reap.global/checkout/chk_1',
      'https://sandbox.pay.reap.global/a?b=c#d',
      'https://pay.prava.space/checkout/chk_7f3a',
      'https://prava.space/enroll/1',
      'https://PAY.Reap.Global/checkout/chk_1',
      'https://pay.reap.global:443/checkout/chk_1',
    ]) {
      expect(vetReapHostedUrl(ok), ok).not.toBeNull();
    }
    expect(vetReapHostedUrl('https://pay.reap.global:443/x')).toBe('https://pay.reap.global/x');
  });

  it('refuses look-alike hosts, other schemes, userinfo, ports and IPs', () => {
    for (const bad of [
      'https://reap.global.evil.com/checkout',
      'https://evilreap.global/checkout',
      'https://pay.reap.global.evil.com/checkout',
      'https://evilprava.space/x',
      'https://pay.prava.space.evil.example/x',
      'http://reap.global/checkout',
      'http://pay.reap.global/checkout',
      'javascript:alert(1)//reap.global',
      'data:text/html,reap.global',
      'https://user@reap.global/checkout',
      'https://user:pw@pay.reap.global/checkout',
      'https://reap.global@evil.example/checkout',
      'https://pay.reap.global:8443/checkout',
      'https://1.2.3.4/checkout',
      'https://[::1]/checkout',
      'https://127.0.0.1/reap.global',
      'https://reap.global./checkout',
      'https://agent.pivota.cc/reap/return',
      '//pay.reap.global/checkout',
      '/checkout',
      '',
      '   ',
      null,
      undefined,
      42,
      { href: 'https://reap.global/' },
      `https://pay.reap.global/${'a'.repeat(2100)}`,
    ]) {
      expect(vetReapHostedUrl(bad), String(bad)).toBeNull();
    }
  });

  it('keeps the suffix list identical to the gateway lane and frozen', () => {
    expect([...REAP_HOSTED_URL_SUFFIXES]).toEqual(['reap.global', 'prava.space']);
    expect(Object.isFrozen(REAP_HOSTED_URL_SUFFIXES)).toBe(true);
  });
});
