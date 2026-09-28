// @vitest-environment node
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isBuyerId, mintBuyerToken, newBuyerId, publicJwks, readBuyerTokenConfig } from './buyerToken.server';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ENV = {
  REAP_DEMO_USER_JWT_PRIVATE_KEY: PEM,
  REAP_DEMO_USER_JWT_KID: 'reap-demo-1',
  REAP_DEMO_USER_JWT_ISSUER: 'https://agent.pivota.cc/reap-demo',
  REAP_DEMO_USER_JWT_AUDIENCE: 'pivota-ucp',
} as unknown as NodeJS.ProcessEnv;

describe('demo buyer token', () => {
  it('is an RS256 JWT with iss/aud/sub/sid/iat/exp, verifiable with the published JWKS', () => {
    const cfg = readBuyerTokenConfig(ENV)!;
    const buyer = newBuyerId();
    expect(isBuyerId(buyer)).toBe(true);
    const token = mintBuyerToken(cfg, buyer, 1_900_000_000);
    const [h, p, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'reap-demo-1' });
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims).toMatchObject({
      iss: 'https://agent.pivota.cc/reap-demo',
      aud: 'pivota-ucp',
      sub: buyer,
      sid: buyer,
      iat: 1_900_000_000,
      exp: 1_900_000_300,
    });
    expect(Object.keys(claims)).not.toContain('email');
    const jwk = publicJwks(cfg).keys[0];
    expect(jwk).toMatchObject({ kty: 'RSA', kid: 'reap-demo-1', alg: 'RS256', use: 'sig' });
    expect(jwk).not.toHaveProperty('d');
    const pub = createPublicKey({ key: jwk as any, format: 'jwk' });
    expect(verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('is not configured without every piece, or with a non-RSA key', () => {
    for (const drop of Object.keys(ENV)) {
      expect(readBuyerTokenConfig({ ...ENV, [drop]: '' })).toBeNull();
    }
    expect(readBuyerTokenConfig({ ...ENV, REAP_DEMO_USER_JWT_PRIVATE_KEY: 'not a key' })).toBeNull();
    const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(readBuyerTokenConfig({ ...ENV, REAP_DEMO_USER_JWT_PRIVATE_KEY: ec })).toBeNull();
  });

  it('accepts a PEM with escaped newlines (single-line env)', () => {
    expect(readBuyerTokenConfig({ ...ENV, REAP_DEMO_USER_JWT_PRIVATE_KEY: PEM.replace(/\n/g, '\\n') })).not.toBeNull();
  });

  it('refuses to mint for a malformed buyer id', () => {
    const cfg = readBuyerTokenConfig(ENV)!;
    expect(() => mintBuyerToken(cfg, 'someone-else')).toThrow();
  });
});
