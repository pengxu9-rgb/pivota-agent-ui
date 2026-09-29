#!/usr/bin/env node
// Generates the demo buyer-token issuer key pair for the Reap checkout demo.
//
//   node scripts/reap-demo-keygen.mjs --issuer <issuer> [--audience AUD] [--out .env.development.local] [--force]
//
// --issuer is REQUIRED (no default): the issuer name belongs to the operator's environment setup, which is
// kept outside this public repo. --force replaces ONLY this script's REAP_DEMO_USER_JWT_* lines in the file;
// every other setting in it is kept.
//
// Writes the PRIVATE key (and kid/issuer/audience) to a local env file, mode 0600. The file name must match
// `.env*.local` AND `git check-ignore` must confirm git ignores that path, or nothing is written. The default,
// `.env.development.local`, is one `next dev` loads by itself, so the key never has to be sourced into a shell.
// It is never printed. Prints ONLY public material (the JWKS, issuer, audience, kid); where to register it
// is environment-specific and lives in the operator notes, outside this public repo.
//
// This is a Pivota-side demo signing key, unrelated to Reap's sandbox key. Do not reuse it anywhere else,
// and never configure its issuer on a production service.
import { generateKeyPairSync, createPublicKey, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const issuer = arg('--issuer', '');
if (!issuer || !/^[\x21-\x7e]{3,200}$/.test(issuer)) {
  console.error('--issuer <issuer> is required (see the operator notes for the value)');
  process.exit(2);
}
const audience = arg('--audience', 'pivota-reap-demo');
const out = arg('--out', '.env.development.local');
const force = argv.includes('--force');

if (!/^\.env.*\.local$/.test(path.basename(out))) {
  console.error(`refusing to write a private key to ${out}: the file name must match .env*.local`);
  process.exit(2);
}
// Ask git itself: the path must be inside a work tree AND ignored. Exit 0 = ignored; 1 = not ignored;
// 128 = not a git work tree. Anything but 0 refuses.
const ignored = spawnSync('git', ['check-ignore', '-q', '--', out], { cwd: process.cwd(), stdio: 'ignore' });
if (ignored.status !== 0) {
  console.error(`refusing to write a private key to ${out}: git does not ignore that path (git check-ignore exit ${ignored.status})`);
  process.exit(2);
}
const OWN_KEYS = ['REAP_DEMO_USER_JWT_PRIVATE_KEY', 'REAP_DEMO_USER_JWT_KID', 'REAP_DEMO_USER_JWT_ISSUER', 'REAP_DEMO_USER_JWT_AUDIENCE'];
const HEADER = '# Reap checkout demo: buyer-token issuer. PRIVATE. Never commit, paste or print this file.';
let kept = [];
if (existsSync(out)) {
  const lines = readFileSync(out, 'utf8').split('\n');
  const hasOwn = lines.some((l) => OWN_KEYS.some((k) => l.startsWith(`${k}=`)));
  if (hasOwn && !force) {
    console.error(`${out} already holds a demo key; pass --force to replace it (the old key stops working everywhere it is trusted)`);
    process.exit(2);
  }
  // Keep every line that is not ours (other settings, comments), in order.
  kept = lines.filter((l) => l !== HEADER && !OWN_KEYS.some((k) => l.startsWith(`${k}=`)));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const kid = `reap-demo-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
const jwks = { keys: [{ kty: jwk.kty, n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' }] };

writeFileSync(
  out,
  [
    ...kept,
    ...(kept.length ? [''] : []),
    HEADER,
    `REAP_DEMO_USER_JWT_PRIVATE_KEY="${pem.trim().replace(/\n/g, '\\n')}"`,
    `REAP_DEMO_USER_JWT_KID=${kid}`,
    `REAP_DEMO_USER_JWT_ISSUER=${issuer}`,
    `REAP_DEMO_USER_JWT_AUDIENCE=${audience}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
chmodSync(out, 0o600);

console.log(`Wrote the private key to ${out} (mode 600). Public material follows.\n`);
console.log('--- public JWKS (register it as the operator notes describe) ---');
console.log(JSON.stringify(jwks));
console.log(`\nissuer: ${issuer}\naudience: ${audience}\nkid: ${kid}\nalg: RS256`);
