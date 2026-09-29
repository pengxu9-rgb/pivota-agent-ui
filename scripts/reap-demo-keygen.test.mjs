// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'scripts/reap-demo-keygen.mjs');
const created = [];
const ISSUER = 'urn:example:reap-demo-test';
const run = (out, extra = [], issuer = ISSUER) =>
  spawnSync(process.execPath, [script, '--out', out, ...(issuer ? ['--issuer', issuer] : []), ...extra], { cwd: repo, encoding: 'utf8' });

afterEach(() => {
  for (const f of created.splice(0)) rmSync(f, { force: true });
});

describe('reap-demo-keygen', () => {
  it('writes the private key only to a git-ignored .env*.local path, mode 600, and never prints it', () => {
    const out = `.env.keygen-test-${process.pid}.local`;
    created.push(path.join(repo, out));
    expect(spawnSync('git', ['check-ignore', '-q', out], { cwd: repo }).status).toBe(0);
    const r = run(out);
    expect(r.status).toBe(0);
    const file = path.join(repo, out);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file, 'utf8')).toContain('BEGIN PRIVATE KEY');
    expect(r.stdout + r.stderr).not.toMatch(/PRIVATE KEY-----|"d":/);
    expect(r.stdout).toContain(ISSUER);
    // Refuses to overwrite without --force.
    expect(run(out).status).toBe(2);
  });

  it('refuses a name that is not .env*.local', () => {
    const out = `keygen-test-${process.pid}.local`;
    const r = run(out);
    expect(r.status).toBe(2);
    expect(existsSync(path.join(repo, out))).toBe(false);
  });

  it('refuses a path git does not ignore (outside the work tree)', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'keygen-'));
    const out = path.join(dir, '.env.outside.local');
    const r = run(out);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/git does not ignore/);
    expect(existsSync(out)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('requires --issuer (no built-in environment value)', () => {
    const out = `.env.keygen-noissuer-${process.pid}.local`;
    created.push(path.join(repo, out));
    const r = run(out, [], '');
    expect(r.status).toBe(2);
    expect(existsSync(path.join(repo, out))).toBe(false);
  });

  it('--force replaces ONLY its own keys and keeps every other setting', () => {
    const out = `.env.keygen-merge-${process.pid}.local`;
    const file = path.join(repo, out);
    created.push(file);
    writeFileSync(file, 'OTHER_SETTING=keep-me\n# a comment\nNEXT_PUBLIC_REAP_CHECKOUT_DEMO=1\n');
    // A file WITHOUT our keys is merged into without --force.
    expect(run(out).status).toBe(0);
    const first = readFileSync(file, 'utf8');
    expect(first).toContain('OTHER_SETTING=keep-me');
    expect(first).toContain('# a comment');
    expect(first).toContain('NEXT_PUBLIC_REAP_CHECKOUT_DEMO=1');
    const kid1 = first.match(/REAP_DEMO_USER_JWT_KID=(.*)/)[1];
    // Now it holds our keys: refused without --force, replaced with it.
    expect(run(out).status).toBe(2);
    expect(run(out, ['--force']).status).toBe(0);
    const second = readFileSync(file, 'utf8');
    expect(second).toContain('OTHER_SETTING=keep-me');
    expect(second.match(/REAP_DEMO_USER_JWT_PRIVATE_KEY=/g)).toHaveLength(1);
    expect(second.match(/REAP_DEMO_USER_JWT_KID=(.*)/)[1]).not.toBe(kid1);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
