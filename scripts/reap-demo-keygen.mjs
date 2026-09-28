#!/usr/bin/env node
// Generates the demo buyer-token issuer key pair for the Reap checkout demo.
//
//   node scripts/reap-demo-keygen.mjs [--issuer URL] [--audience AUD] [--out .env.reap-demo.local] [--force]
//
// Writes the PRIVATE key (and kid/issuer/audience) to a local env file, mode 0600, which git ignores
// (`.env*.local`). It is never printed. Prints ONLY public material: the JWKS and the two env values
// the staging gateway and staging backend need to trust it (docs/reap-checkout-demo.md, step 3).
//
// This is a Pivota-side demo signing key, unrelated to Reap's sandbox key. Do not reuse it anywhere else,
// and never configure its issuer on a production service.
import { generateKeyPairSync, createPublicKey, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const issuer = arg('--issuer', 'https://agent.pivota.cc/reap-demo-issuer');
const audience = arg('--audience', 'pivota-reap-demo');
const out = arg('--out', '.env.reap-demo.local');
const force = argv.includes('--force');

if (!/\.local$/.test(out)) {
  console.error(`refusing to write a private key to ${out}: the file name must end in .local (git-ignored)`);
  process.exit(2);
}
if (existsSync(out) && !force) {
  console.error(`${out} exists; pass --force to replace it (the old key stops working everywhere it is trusted)`);
  process.exit(2);
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = `reap-demo-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
const jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' }] };

writeFileSync(
  out,
  [
    '# Reap checkout demo: buyer-token issuer. PRIVATE. Never commit, paste or print this file.',
    `REAP_DEMO_USER_JWT_PRIVATE_KEY="${pem.trim().replace(/\n/g, '\\n')}"`,
    `REAP_DEMO_USER_JWT_KID=${kid}`,
    `REAP_DEMO_USER_JWT_ISSUER=${issuer}`,
    `REAP_DEMO_USER_JWT_AUDIENCE=${audience}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
chmodSync(out, 0o600);

const gatewayIssuer = { iss: issuer, aud: audience, algs: ['RS256'], jwks };
console.log(`Wrote the private key to ${out} (mode 600). Public material follows.\n`);
console.log('--- public JWKS ---');
console.log(JSON.stringify(jwks));
console.log('\n--- staging GATEWAY: append this object to the IDENTITY_ISSUERS_JSON array ---');
console.log(JSON.stringify(gatewayIssuer));
console.log('\n--- staging BACKEND (web) ---');
console.log(`AGENT_USER_JWKS_JSON=${JSON.stringify(jwks)}`);
console.log(`AGENT_USER_JWT_ISSUERS=${issuer}`);
console.log(`AGENT_USER_JWT_AUDIENCE=${audience}`);
