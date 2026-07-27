import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One path, one product, constant-time secret, fail-closed when unconfigured.
// The interesting assertions here are the NEGATIVE ones: this route's failure
// modes are "purges more than one page" (a self-inflicted crawl collapse across
// ~4,400 ISR URLs) and "opens when it should not".

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

const post = async (
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: any }> => {
  const { POST } = await import('@/app/api/revalidate/route');
  const res = await POST(
    new Request('http://localhost/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as any,
  );
  return { status: res.status, json: await res.json() };
};

describe('/api/revalidate', () => {
  beforeEach(() => {
    vi.resetModules();
    revalidatePath.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is INERT, not open, when the secret is unconfigured', async () => {
    // An unconfigured deploy must be inert — never a fallback to "allow". A door
    // that cannot verify should not open at all. 501 and not 503: 503 means "try
    // again later" and would have callers retrying forever against a route that
    // is permanently dead until an operator sets the variable.
    const res = await post({ product_id: 'sig_abc' });
    expect(res.status).toBe(501);
    expect(res.json.error).toBe('REVALIDATE_NOT_CONFIGURED');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret, and revalidates nothing', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'wrong-horse' });
    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  // KNOWN LIMIT, stated rather than papered over: swapping `secretMatches` for a
  // plain `===` passes every test in this file. Constant-time behaviour is a
  // TIMING property and a unit test cannot observe it — the accept/reject truth
  // table is identical. The tests below pin the truth table; the docblock on
  // `secretMatches` is what defends the timing property, and a reviewer reading
  // the diff is the only thing that can enforce it. Mutations that ARE caught:
  // dropping the `..` check, the leading-alnum anchor, the reserved-segment
  // deny-list, the 'page' type argument, the unconfigured guard, the secret
  // trim, and the cooldown.
  it('rejects a secret that is a PREFIX of the real one', async () => {
    // The reason for the constant-time compare: a prefix must not read as
    // "closer" than any other wrong answer, and must certainly not pass.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'correct' });
    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts the secret via header or bearer, and purges exactly one path', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');

    const viaHeader = await post(
      { product_id: 'sig_1b4d53ca07835e10cdaada553bc26ed6' },
      { 'x-revalidate-secret': 'correct-horse' },
    );
    expect(viaHeader.status).toBe(200);
    expect(viaHeader.json.revalidated).toBe(true);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/products/sig_1b4d53ca07835e10cdaada553bc26ed6');

    revalidatePath.mockClear();
    const viaBearer = await post(
      { product_id: 'ck_abc123' },
      { authorization: 'Bearer correct-horse' },
    );
    expect(viaBearer.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/products/ck_abc123');
  });

  it('CANNOT be talked into purging the whole route', async () => {
    // The blast radius has to be capped by construction. `revalidatePath('/products')`
    // would drop ~4,400 ISR entries and hand every crawler a cold 2-3s SSR — the
    // crawl collapse this codebase already fixed once.
    //
    // THE FIRST VERSION OF THIS LIST ONLY COVERED TRAVERSAL SHAPES, and the real
    // escape is not traversal-shaped. Next's `revalidatePath(p, type)` does not
    // resolve routes; it builds the string tag `_N_T_${p}` and appends `/${type}`.
    // So `revalidatePath('/products/layout')` and `revalidatePath('/products',
    // 'layout')` produce the BYTE-IDENTICAL tag `_N_T_/products/layout`, which
    // every PDP cache entry carries implicitly. `layout` is pure alphanumeric: it
    // sailed through the regex and the `..` check untouched. `page`, `route`,
    // `default`, `template`, `error`, `loading`, `not-found` and `global-error`
    // are the same family. And a bare `.` normalizes `/products/.` to `/products`.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');

    for (const productId of [
      '',
      '   ',
      '.',
      '..',
      'a..b',
      '../products',
      'sig_a/../..',
      'sig_a/sig_b',
      '/products',
      '*',
      'sig_a b',
      'sig_a\n/products',
      'sig_' + 'x'.repeat(200),
      // Next's reserved segment names — the ones that actually work.
      'layout',
      'page',
      'route',
      'default',
      'template',
      'error',
      'loading',
      'not-found',
      'global-error',
      'LAYOUT',
      'Page',
    ]) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${JSON.stringify(productId)} must be rejected`).toBe(400);
      expect(revalidatePath, `${JSON.stringify(productId)} must purge nothing`).not.toHaveBeenCalled();
    }
  });

  it('survives a malformed body without purging anything', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const { POST } = await import('@/app/api/revalidate/route');
    const res = await POST(
      new Request('http://localhost/api/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-revalidate-secret': 'correct-horse' },
        body: 'not json',
      }) as any,
    );
    expect(res.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts the real id shapes this catalog actually uses', async () => {
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of [
      'sig_1b4d53ca07835e10cdaada553bc26ed6',
      'ck_b7723c989bd87616de0c310ee63efa48',
      'pg_abc123',
      'ext_krave_gbr_45',
      'mintree:bc2bb213984257bc',
      'rejuran:healer-turnover-ampoule',
    ]) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${productId} must be accepted`).toBe(200);
      expect(revalidatePath).toHaveBeenCalledWith(`/products/${productId}`);
    }
  });

  it('rejects a non-string product_id instead of coercing it', async () => {
    // `String(...)` coercion meant `["layout"]` and `12345` both returned 200.
    // An array whose first element is a reserved name is the whole-route purge
    // wearing a different coat.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of [['layout'], ['sig_abc'], 12345, true, {}, null]) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${JSON.stringify(productId)} must be rejected`).toBe(400);
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it('calls revalidatePath with NO type — a type makes it inert', async () => {
    // Measured on a real build: revalidatePath(p, 'page') builds the tag
    // `_N_T_${p}/page`, the ISR entry carries `_N_T_${p}`, and the purge does
    // nothing while still returning 200. A mock can only see that the function
    // was called, which is exactly why that shipped past the first test suite.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'correct-horse' });
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/products/sig_abc');
  });

  it('requires a prefix separator, which is what makes reserved names unreachable', async () => {
    // Every real product id contains `_` or `:` — verified against all 10,452
    // ids in the live corpus. No Next reserved segment name does.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of ['layout', 'page', 'products', 'index', 'abc123']) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${productId} must be rejected`).toBe(400);
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it('a secret with surrounding whitespace behaves the same on both sides', async () => {
    // The operational footgun: readSecret trimmed the PROVIDED value but not the
    // configured one, so a secret pasted into the Vercel UI with a trailing
    // newline would permanently 401 the correct caller, with no diagnostic.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', '  correct-horse\n');
    const res = await post({ product_id: 'sig_abc' }, { 'x-revalidate-secret': 'correct-horse' });
    expect(res.status).toBe(200);
  });

  it('rate-limits repeated purges of the same path', async () => {
    // Cheap insurance given this app's crawl-collapse history: a hot path purged
    // in a loop cold-SSRs every crawler that arrives in between.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const first = await post({ product_id: 'sig_hot' }, { 'x-revalidate-secret': 'correct-horse' });
    expect(first.status).toBe(200);
    const second = await post({ product_id: 'sig_hot' }, { 'x-revalidate-secret': 'correct-horse' });
    expect(second.status).toBe(429);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('REJECTS percent-encoding rather than decoding it, and says what to send', async () => {
    // The tag the entry carries is built from the DECODED id the page receives.
    // This route reads a JSON body, where nothing decodes — so an encoded id
    // would purge nothing while returning 200. Decoding to compensate invites
    // double-decode ambiguity (%253A -> %3A -> :), so it is a hard reject, and
    // the message names the decoded form because this is the one rejection a
    // legitimate caller is likely to hit.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of ['mintree%3Aabc', 'sig_a%2Fb', 'ext%5Fx', 'a%25b']) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status, `${productId} must be rejected`).toBe(400);
      expect(res.json.error).toBe('PERCENT_ENCODED_PRODUCT_ID');
      expect(res.json.message).toMatch(/mintree:abc/);
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it('asserts non-empty at the point the target is built, not by inheritance', async () => {
    // SAFE_PRODUCT_ID already forbids an empty id, but an inherited guarantee is
    // one refactor from disappearing — and the consequence is the bare `pdp`
    // tag, which sits on EVERY PDP entry: the full blast radius under a new
    // name. This fails if the explicit assertion is removed AND the regex is
    // loosened, which is exactly the two-step nobody notices.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    for (const productId of ['', '   ', '\t']) {
      revalidatePath.mockClear();
      const res = await post({ product_id: productId }, { 'x-revalidate-secret': 'correct-horse' });
      expect(res.status).toBe(400);
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it('echoes the exact target purged, so a caller can spot a well-formed typo', async () => {
    // A status code cannot distinguish a real purge from a typo that happened to
    // be valid. An inert purge reporting success is the failure mode that has
    // bitten this codebase repeatedly.
    vi.stubEnv('PIVOTA_REVALIDATE_SECRET', 'correct-horse');
    const res = await post(
      { product_id: 'mintree:bc2bb213984257bc' },
      { 'x-revalidate-secret': 'correct-horse' },
    );
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      revalidated: true,
      path: '/products/mintree:bc2bb213984257bc',
      product_id: 'mintree:bc2bb213984257bc',
    });
  });
});
