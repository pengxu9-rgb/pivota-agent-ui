import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A placement guard, not a behavior test.
 *
 * The bug this pins has now shipped twice. #287 moved the notFound() throw into
 * `products/[id]/layout.tsx` — the only place on this route where the status
 * code can still be set — which silently made `products/[id]/not-found.tsx`
 * unreachable, because a not-found boundary cannot render inside the layout
 * that threw. The status code stayed correct, so every unit test stayed green
 * and the only symptom was Next's bare built-in 404 on ~6,400 indexed URLs.
 *
 * No unit test can see an HTTP status or which boundary React picked; that
 * needs `next build && next start` and a real request. But the *file location*
 * is the whole bug, and it is checkable for free. If someone moves this
 * boundary back under `[id]/` — or deletes it — this fails immediately instead
 * of a release later.
 *
 * If the throw ever moves back out of the layout and into the page body, delete
 * this test rather than working around it: the constraint it encodes is gone.
 */
describe('product 404 boundary placement', () => {
  const productsDir = path.join(process.cwd(), 'src', 'app', 'products');

  it('lives at products/, where it can catch a throw from products/[id]/layout.tsx', () => {
    expect(existsSync(path.join(productsDir, 'not-found.tsx'))).toBe(true);
  });

  it('does NOT live at products/[id]/, where the throwing layout would swallow it', () => {
    expect(existsSync(path.join(productsDir, '[id]', 'not-found.tsx'))).toBe(false);
  });
});
