import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_BUYER_BASE } from './buyerUpstream';

/**
 * Repo-wide guard: no non-test source file may carry a MOVING host in a string literal.
 *
 * A "moving" host is one whose name is assigned by the platform rather than owned by us:
 *   - `*.railway.app` / `*.up.railway.app` — the Railway PaaS wildcard. The whole platform
 *     was decommissioned 2026-08-25, and because `src/app/api/buyer/[...path]/route.ts`
 *     defaulted to `web-production-fedb.up.railway.app`, prod buyer order history answered
 *     404 with the Railway edge's own error body for anyone signed in.
 *   - bare `*.run.app` — a Cloud Run service URL, which is re-minted when the service is
 *     recreated. Go through the load balancer (`api.pivota.cc` / `gateway.pivota.cc`).
 *
 * Comments are stripped before scanning, so a historical note explaining what a constant
 * USED to be does not trip the guard — only live string literals do.
 */

const REPO_ROOT = path.resolve(__dirname, '../..');

const SCAN_ROOTS = ['src', 'scripts', 'next.config.mjs'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);

const MOVING_HOST = /(?:[\w-]+\.)*(?:railway\.app|run\.app)/;

/**
 * Files that legitimately name a moving host in live code. Every entry needs a reason,
 * and the guard asserts each one STILL matches — a stale exemption fails the test rather
 * than silently widening the hole.
 */
const ALLOWLIST: Array<{ file: string; reason: string }> = [
  {
    file: 'src/lib/returnUrl.ts',
    reason:
      'DENYLIST, not a target: safeReturnUrl explicitly rejects *.railway.app so the PaaS ' +
      'wildcard cannot be used as an open-redirect. Removing these strings weakens security.',
  },
  {
    file: 'src/lib/imageRemoteHosts.mjs',
    reason:
      'next/image optimizer ALLOWLIST for image URLs already persisted in catalog rows that ' +
      'still carry the old host. Not a proxy target — dropping them changes /_next/image ' +
      'behaviour for stored URLs, which is a separate migration decision.',
  },
  {
    file: 'src/features/pdp/utils/pdpImageUrls.ts',
    reason: 'Same persisted-image-URL migration window as src/lib/imageRemoteHosts.mjs.',
  },
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectSourceFiles(): string[] {
  const found: string[] = [];

  const walk = (absolute: string) => {
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      if (SCAN_EXTENSIONS.has(path.extname(absolute))) found.push(absolute);
      return;
    }
    for (const entry of fs.readdirSync(absolute)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(path.join(absolute, entry));
    }
  };

  for (const root of SCAN_ROOTS) walk(path.join(REPO_ROOT, root));

  return found.filter((absolute) => {
    const relative = path.relative(REPO_ROOT, absolute);
    if (/\.test\.[cm]?[jt]sx?$/.test(relative)) return false;
    if (relative.startsWith(`src${path.sep}test${path.sep}`)) return false;
    return true;
  });
}

/** String literals (single, double, backtick) that name a moving host. */
function movingHostLiterals(source: string): string[] {
  const literals = stripComments(source).match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || [];
  return literals.filter((literal) => MOVING_HOST.test(literal));
}

describe('no moving upstream hosts in source', () => {
  const files = collectSourceFiles();
  const allowedFiles = new Set(ALLOWLIST.map((entry) => entry.file));

  it('scans a non-trivial number of files (the walker actually found the tree)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no *.railway.app / bare *.run.app literal outside the documented allowlist', () => {
    const offenders: string[] = [];

    for (const absolute of files) {
      const relative = path.relative(REPO_ROOT, absolute).split(path.sep).join('/');
      if (allowedFiles.has(relative)) continue;
      for (const literal of movingHostLiterals(fs.readFileSync(absolute, 'utf8'))) {
        offenders.push(`${relative}: ${literal}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the allowlist honest — every exemption still matches something', () => {
    for (const { file } of ALLOWLIST) {
      const absolute = path.join(REPO_ROOT, file);
      expect(fs.existsSync(absolute), `allowlisted file is gone: ${file}`).toBe(true);
      expect(
        movingHostLiterals(fs.readFileSync(absolute, 'utf8')).length,
        `stale allowlist entry — ${file} no longer names a moving host, drop it`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('buyer upstream default', () => {
  it('pins the buyer base to the load-balanced host, not a PaaS hostname', () => {
    expect(DEFAULT_BUYER_BASE).toBe('https://api.pivota.cc/buyer/v1');
    expect(DEFAULT_BUYER_BASE).not.toMatch(/railway\.app/);
    expect(DEFAULT_BUYER_BASE).not.toMatch(/\.run\.app/);
  });

  // Verified live 2026-08-26: GET https://api.pivota.cc/buyer/v1/orders -> 401 (real backend),
  // while the old default's host answered 404 "Application not found" from the Railway edge.
  it('builds the live prod URL shape for the route that broke', () => {
    expect(`${DEFAULT_BUYER_BASE}/orders`).toBe('https://api.pivota.cc/buyer/v1/orders');
  });
});
