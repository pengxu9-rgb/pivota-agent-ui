// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repo, 'scripts/reap-demo-keygen.mjs');
const created = [];
const run = (out, extra = []) =>
  spawnSync(process.execPath, [script, '--out', out, ...extra], { cwd: repo, encoding: 'utf8' });

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
    expect(r.stdout).toContain('reap-demo.staging.pivota.cc');
    expect(r.stdout).not.toMatch(/agent\.pivota\.cc|api\.pivota\.cc/);
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
});
